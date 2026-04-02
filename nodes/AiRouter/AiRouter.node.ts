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

    const maxItemsPerExecution = this.getNodeParameter('maxItemsPerExecution', 0, 10) as number;
    const itemLimit = maxItemsPerExecution > 0 ? Math.min(items.length, maxItemsPerExecution) : items.length;
    if (maxItemsPerExecution > 0 && items.length > maxItemsPerExecution) {
      this.logger.warn(`AI Router: ${items.length} items received but limited to ${maxItemsPerExecution} by maxItemsPerExecution. Increase or set to 0 to process all.`);
    }

    for (let i = 0; i < itemLimit; i++) {
      try {
        // ── Read parameters ──────────────────────────────────────────────────
        const prompt             = this.getNodeParameter('prompt', i, '') as string;
        const systemPrompt       = this.getNodeParameter('systemPrompt', i, '') as string;
        const temperature        = this.getNodeParameter('temperature', i, 0.7) as number;
        const mode               = this.getNodeParameter('mode', i, 'auto') as RoutingMode;
        const taskHint           = this.getNodeParameter('taskHint', i, '') as string;
        const maxCostRaw         = this.getNodeParameter('maxCostPer1k', i, 0) as number;
        const allowedProviders   = this.getNodeParameter('allowedProviders', i, []) as ProviderType[];
        const maxTokens          = this.getNodeParameter('maxTokens', i, 0) as number;
        const fallbackEnabled    = this.getNodeParameter('fallbackEnabled', i, true) as boolean;
        const dryRun             = this.getNodeParameter('dryRun', i, false) as boolean;
        const outputModelUsed    = this.getNodeParameter('outputModelUsed', i, false) as boolean;
        const outputDetectedTask = this.getNodeParameter('outputDetectedTask', i, false) as boolean;
        const outputScoreBreakdown = this.getNodeParameter('outputScoreBreakdown', i, false) as boolean;
        const outputEstimatedCost  = this.getNodeParameter('outputEstimatedCost', i, false) as boolean;

        if (!prompt.trim()) {
          throw new NodeOperationError(this.getNode(), 'Prompt cannot be empty', { itemIndex: i });
        }

        // ── Detect task ──────────────────────────────────────────────────────
        let task: TaskType;
        let taskConfidence: number | undefined;
        if (taskHint) {
          task = taskHint as TaskType;
        } else {
          const detection = detectTask(prompt);
          task = detection.primaryTask;
          taskConfidence = detection.confidence;
        }

        // ── Build candidate list ─────────────────────────────────────────────
        const candidates: ModelSpec[] = [...MODEL_REGISTRY];
        if (allowedProviders.includes('ollama')) {
          const ollamaModel = this.getNodeParameter('ollamaModel', i, 'llama3') as string;
          candidates.push({ ...OLLAMA_BASE_SPEC, id: ollamaModel, displayName: `Ollama: ${ollamaModel}` });
        }

        // ── Score and rank models ────────────────────────────────────────────
        // Rough token estimate (~4 chars/token). Include system prompt so
        // models whose context window is too small for the full input are filtered out.
        const promptLengthTokens = Math.ceil((prompt.length + systemPrompt.length) / 4);
        const scored = scoreModels(candidates, {
          task,
          mode,
          maxCostPer1K: maxCostRaw > 0 ? maxCostRaw : undefined,
          allowedProviders: allowedProviders.length > 0 ? allowedProviders : undefined,
          promptLengthTokens,
        });

        if (scored.length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            'No models match the current constraints. Relax the budget cap, add more providers, or configure credentials.',
            { itemIndex: i },
          );
        }

        // ── Build shared output fields ───────────────────────────────────────
        const outputJson: IDataObject = { ...items[i].json };

        const addDetectedTask = () => {
          if (outputDetectedTask || dryRun) {
            outputJson.detectedTask = task;
            if (taskConfidence !== undefined) {
              outputJson.detectedTaskConfidence = Math.round(taskConfidence * 100) / 100;
            }
          }
        };

        const addScoreBreakdown = () => {
          if (outputScoreBreakdown || dryRun) {
            outputJson.scoreBreakdown = scored.slice(0, 3).map((s) => ({
              model: s.model.id,
              provider: s.model.provider,
              score: Math.round(s.score * 10000) / 10000,
              breakdown: {
                taskFit:     Math.round(s.breakdown.taskFit * 1000) / 1000,
                cost:        Math.round(s.breakdown.cost * 1000) / 1000,
                latency:     Math.round(s.breakdown.latency * 1000) / 1000,
                contextSize: Math.round(s.breakdown.contextSize * 1000) / 1000,
              },
            }));
          }
        };

        // ── Dry-run: return routing decision without calling any API ─────────
        if (dryRun) {
          const top = scored[0];
          outputJson.dryRun = true;
          outputJson.selectedModel    = top.model.id;
          outputJson.selectedProvider = top.model.provider;
          outputJson.selectedScore    = Math.round(top.score * 10000) / 10000;
          addDetectedTask();
          addScoreBreakdown();
          results.push({ json: outputJson, pairedItem: { item: i } });
          continue;
        }

        // ── Resolve credentials ──────────────────────────────────────────────
        let rawCreds: Record<string, unknown>;
        try {
          rawCreds = await this.getCredentials('aiRouterApi') as Record<string, unknown>;
        } catch {
          throw new NodeOperationError(this.getNode(), 'AI Router credentials are not configured.', { itemIndex: i });
        }
        const creds: CredMap = {};
        if (rawCreds.anthropicApiKey) creds.anthropic    = rawCreds.anthropicApiKey as string;
        if (rawCreds.openAiApiKey)    creds.openai       = rawCreds.openAiApiKey as string;
        if (rawCreds.googleApiKey)    creds.google       = rawCreds.googleApiKey as string;
        if (rawCreds.mistralApiKey)   creds.mistral      = rawCreds.mistralApiKey as string;
        if (rawCreds.groqApiKey)      creds.groq         = rawCreds.groqApiKey as string;
        // ollamaBaseUrl: credential provides the base value; the node parameter overrides
        // it per-workflow so users don't need to change credentials for each deployment.
        if (rawCreds.ollamaBaseUrl)   creds.ollamaBaseUrl = rawCreds.ollamaBaseUrl as string;
        if (allowedProviders.includes('ollama')) {
          const ollamaBaseUrlParam = (this.getNodeParameter('ollamaBaseUrl', i, '') as string).trim();
          if (ollamaBaseUrlParam) creds.ollamaBaseUrl = ollamaBaseUrlParam;
        }

        // ── Execute with fallback ────────────────────────────────────────────
        const ranked = scored.map((s) => s.model);
        const maxAttempts = fallbackEnabled ? Math.min(3, ranked.length) : 1;
        const result = await executeWithFallback(
          ranked,
          prompt,
          creds,
          {
            maxTokens:    maxTokens > 0 ? maxTokens : undefined,
            temperature,
            systemPrompt: systemPrompt.trim() || undefined,
          },
          { maxAttempts },
        );

        // ── Assemble output ──────────────────────────────────────────────────
        outputJson.response = result.response.text;
        if (result.response.thinking !== undefined) outputJson.thinking = result.response.thinking;

        if (outputModelUsed) {
          outputJson.modelUsed      = result.modelUsed.id;
          outputJson.providerUsed   = result.modelUsed.provider;
          outputJson.attemptsTaken  = result.attemptsTaken;
          if (result.response.inputTokens  !== undefined) outputJson.inputTokens  = result.response.inputTokens;
          if (result.response.outputTokens !== undefined) outputJson.outputTokens = result.response.outputTokens;
        }

        if (outputEstimatedCost) {
          const { inputTokens, outputTokens } = result.response;
          // Compute cost from whichever token counts the provider returned.
          // Some providers report only one side; sum what we have.
          if (inputTokens !== undefined || outputTokens !== undefined) {
            const p = result.modelUsed.pricing;
            const cost = ((inputTokens ?? 0) * p.inputPer1M + (outputTokens ?? 0) * p.outputPer1M) / 1_000_000;
            outputJson.estimatedCostUSD = Math.round(cost * 10_000_000) / 10_000_000;
          }
        }

        addDetectedTask();
        addScoreBreakdown();

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
