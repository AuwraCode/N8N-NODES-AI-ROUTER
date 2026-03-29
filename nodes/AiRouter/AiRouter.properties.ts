/**
 * N8N property definitions for the AI Router node.
 * Extracted to keep AiRouter.node.ts under 200 lines.
 */

import type { INodeProperties } from 'n8n-workflow';

export const AI_ROUTER_PROPERTIES: INodeProperties[] = [
  {
    displayName: 'Prompt',
    name: 'prompt',
    type: 'string',
    typeOptions: { rows: 4 },
    default: '',
    required: true,
    description: 'The input text to send to the selected AI model',
    placeholder: 'Write a Python function that...',
  },
  {
    displayName: 'Routing Mode',
    name: 'mode',
    type: 'options',
    default: 'auto',
    description: 'How to prioritize model selection',
    options: [
      { name: 'Auto — Balanced', value: 'auto', description: 'Balance task fit, cost, speed, and context size' },
      { name: 'Cost — Cheapest viable model', value: 'cost', description: 'Minimize token cost while maintaining task fit' },
      { name: 'Quality — Best available model', value: 'quality', description: 'Maximize output quality regardless of cost' },
      { name: 'Speed — Fastest model', value: 'speed', description: 'Minimize latency (prefer tier-1 models)' },
      { name: 'Local — Ollama only', value: 'local', description: 'Run locally via Ollama for privacy or offline use' },
    ],
  },
  {
    displayName: 'Task Hint',
    name: 'taskHint',
    type: 'options',
    default: '',
    description: 'Override automatic task detection. Leave as Auto-detect for heuristic classification.',
    options: [
      { name: 'Auto-detect', value: '' },
      { name: 'Analysis', value: 'analysis' },
      { name: 'Chat', value: 'chat' },
      { name: 'Classification', value: 'classification' },
      { name: 'Coding', value: 'coding' },
      { name: 'Embeddings', value: 'embeddings' },
      { name: 'Summarization', value: 'summarization' },
      { name: 'Vision', value: 'vision' },
      { name: 'Writing', value: 'writing' },
    ],
  },
  {
    displayName: 'Max Cost Per 1K Tokens (USD)',
    name: 'maxCostPer1k',
    type: 'number',
    default: 0,
    description: 'Hard budget cap. Models above this blended cost per 1K tokens are excluded. Set to 0 for no limit.',
    typeOptions: { minValue: 0, numberPrecision: 6 },
  },
  {
    displayName: 'Allowed Providers',
    name: 'allowedProviders',
    type: 'multiOptions',
    default: ['anthropic', 'openai', 'google', 'mistral', 'groq'],
    description: 'Which AI providers are eligible for routing',
    options: [
      { name: 'Anthropic', value: 'anthropic' },
      { name: 'Google Gemini', value: 'google' },
      { name: 'Groq', value: 'groq' },
      { name: 'Mistral AI', value: 'mistral' },
      { name: 'Ollama (Local)', value: 'ollama' },
      { name: 'OpenAI', value: 'openai' },
    ],
  },
  {
    displayName: 'Ollama Model',
    name: 'ollamaModel',
    type: 'string',
    default: 'llama3',
    description: 'The Ollama model name to use (must be installed locally)',
    displayOptions: {
      show: { allowedProviders: [['ollama']] },
    },
  },
  {
    displayName: 'Ollama Base URL',
    name: 'ollamaBaseUrl',
    type: 'string',
    default: 'http://localhost:11434',
    description: 'Base URL for your local Ollama instance',
    displayOptions: {
      show: { allowedProviders: [['ollama']] },
    },
  },
  {
    displayName: 'Enable Fallback',
    name: 'fallbackEnabled',
    type: 'boolean',
    default: true,
    description: 'Whether to automatically retry with the next-best model if the primary model fails',
  },
  {
    displayName: 'Include Model Info in Output',
    name: 'outputModelUsed',
    type: 'boolean',
    default: false,
    description: 'Whether to include the selected model ID and provider in the output JSON',
  },
];
