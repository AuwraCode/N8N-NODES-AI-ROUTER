import {
  NodeOperationError,
  type IDataObject,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';

import { MODEL_REGISTRY, OLLAMA_BASE_SPEC, type ProviderType, type RoutingMode, type TaskType, type ModelSpec } from './router/modelRegistry';
import { detectTask } from './router/taskDetector';
import { scoreModels } from './router/scoringEngine';
import { executeWithFallback } from './router/fallbackChain';
import type { CredMap } from './router/providerAdapters';
import { AI_ROUTER_PROPERTIES } from './AiRouter.properties';

export class AiRouter implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'AI Router',
    name: 'aiRouter',
    icon: 'file:aiRouter.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["mode"]}} mode',
    description: 'Automatically routes AI tasks to the most appropriate and cost-effective model',
    defaults: { name: 'AI Router' },
    usableAsTool: true,
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'aiRouterApi', required: true, displayName: 'AI Router Credentials' },
    ],
    properties: AI_ROUTER_PROPERTIES,
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const results: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const prompt = this.getNodeParameter('prompt', i, '') as string;
        const mode = this.getNodeParameter('mode', i, 'auto') as RoutingMode;
        const taskHint = this.getNodeParameter('taskHint', i, '') as string;
        const maxCostRaw = this.getNodeParameter('maxCostPer1k', i, 0) as number;
        const allowedProviders = this.getNodeParameter('allowedProviders', i, []) as ProviderType[];
        const fallbackEnabled = this.getNodeParameter('fallbackEnabled', i, true) as boolean;
        const outputModelUsed = this.getNodeParameter('outputModelUsed', i, false) as boolean;

        if (!prompt.trim()) {
          throw new NodeOperationError(this.getNode(), 'Prompt cannot be empty', { itemIndex: i });
        }

        // ── Resolve credentials from single credential object ────────────
        const rawCreds = await this.getCredentials('aiRouterApi');
        const creds: CredMap = {};
        if (rawCreds.anthropicApiKey) creds.anthropic = rawCreds.anthropicApiKey as string;
        if (rawCreds.openAiApiKey)    creds.openai    = rawCreds.openAiApiKey as string;
        if (rawCreds.googleApiKey)    creds.google    = rawCreds.googleApiKey as string;
        if (rawCreds.mistralApiKey)   creds.mistral   = rawCreds.mistralApiKey as string;
        if (rawCreds.groqApiKey)      creds.groq      = rawCreds.groqApiKey as string;
        if (rawCreds.ollamaBaseUrl)   creds.ollamaBaseUrl = rawCreds.ollamaBaseUrl as string;

        // ── Build candidate list ─────────────────────────────────────────
        const candidates: ModelSpec[] = [...MODEL_REGISTRY];
        if (allowedProviders.includes('ollama')) {
          const ollamaModel = this.getNodeParameter('ollamaModel', i, 'llama3') as string;
          candidates.push({ ...OLLAMA_BASE_SPEC, id: ollamaModel, displayName: `Ollama: ${ollamaModel}` });
        }

        // ── Detect task ──────────────────────────────────────────────────
        const task = (taskHint || detectTask(prompt).primaryTask) as TaskType;

        // ── Score and rank models ────────────────────────────────────────
        const scored = scoreModels(candidates, {
          task,
          mode,
          maxCostPer1K: maxCostRaw > 0 ? maxCostRaw : undefined,
          allowedProviders: allowedProviders.length > 0 ? allowedProviders : undefined,
        });

        if (scored.length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            'No models match the current constraints. Relax the budget cap, add more providers, or configure credentials.',
            { itemIndex: i },
          );
        }

        // ── Execute with fallback ────────────────────────────────────────
        const ranked = scored.map((s) => s.model);
        const maxAttempts = fallbackEnabled ? Math.min(3, ranked.length) : 1;
        const result = await executeWithFallback(ranked, prompt, creds, {}, { maxAttempts });

        // ── Build output ─────────────────────────────────────────────────
        const outputJson: IDataObject = { ...items[i].json, response: result.response.text };
        if (outputModelUsed) {
          outputJson.modelUsed = result.modelUsed.id;
          outputJson.providerUsed = result.modelUsed.provider;
          outputJson.attemptsTaken = result.attemptsTaken;
          if (result.response.inputTokens !== undefined) outputJson.inputTokens = result.response.inputTokens;
          if (result.response.outputTokens !== undefined) outputJson.outputTokens = result.response.outputTokens;
        }

        results.push({ json: outputJson, pairedItem: { item: i } });
      } catch (error) {
        if (this.continueOnFail()) {
          const errMsg = error instanceof Error ? error.message : String(error);
          results.push({ json: { ...items[i].json, error: errMsg }, pairedItem: { item: i } });
        } else {
          if (error instanceof NodeOperationError) throw error;
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
        }
      }
    }

    return [results];
  }
}
