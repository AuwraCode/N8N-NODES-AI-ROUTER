/**
 * N8N property definitions for the AI Router node.
 * Extracted to keep AiRouter.node.ts under 200 lines.
 */

import type { INodeProperties } from 'n8n-workflow';

export const AI_ROUTER_PROPERTIES: INodeProperties[] = [

  // ── Input ────────────────────────────────────────────────────────────────────

  {
    displayName: 'Prompt',
    name: 'prompt',
    type: 'string',
    typeOptions: { rows: 4 },
    default: '',
    required: true,
    description: 'The user message to send to the AI model',
    placeholder: 'Write a Python function that...',
  },
  {
    displayName: 'System Prompt',
    name: 'systemPrompt',
    type: 'string',
    typeOptions: { rows: 3 },
    default: '',
    description: 'Optional system-level instruction prepended before the user prompt. Use this to set the model\'s persona, output format, or constraints.',
    placeholder: 'You are a helpful assistant that always responds in JSON...',
  },
  {
    displayName: 'Temperature',
    name: 'temperature',
    type: 'number',
    default: 0.7,
    description: 'Sampling temperature (0 = deterministic, 2 = very creative). Ignored by reasoning models (o3, o4-mini, Claude Opus with extended thinking).',
    typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 2 },
  },

  // ── Routing ──────────────────────────────────────────────────────────────────

  {
    displayName: 'Routing Mode',
    name: 'mode',
    type: 'options',
    default: 'auto',
    description: 'How to prioritise model selection',
    options: [
      { name: 'Auto — Balanced', value: 'auto', description: 'Balance task fit, cost, speed, and context size' },
      { name: 'Cost — Cheapest Viable Model', value: 'cost', description: 'Minimise token cost while maintaining task fit' },
      { name: 'Local — Ollama Only', value: 'local', description: 'Run locally via Ollama — zero cost, fully private' },
      { name: 'Quality — Best Available Model', value: 'quality', description: 'Maximise output quality regardless of cost or latency' },
      { name: 'Speed — Fastest Model', value: 'speed', description: 'Minimise latency — prefer tier-1 (sub-second) models' },
    ],
  },
  {
    displayName: 'Task Hint',
    name: 'taskHint',
    type: 'options',
    default: '',
    description: 'Override automatic task detection. Leave as Auto-Detect for heuristic classification.',
    options: [
      { name: 'Analysis', value: 'analysis' },
      { name: 'Auto-Detect', value: '' },
      { name: 'Chat', value: 'chat' },
      { name: 'Classification', value: 'classification' },
      { name: 'Coding', value: 'coding' },
      { name: 'Embeddings', value: 'embeddings' },
      { name: 'Summarization', value: 'summarization' },
      { name: 'Vision', value: 'vision' },
      { name: 'Writing', value: 'writing' },
    ],
  },

  // ── Filtering / Budget ───────────────────────────────────────────────────────

  {
    displayName: 'Allowed Providers',
    name: 'allowedProviders',
    type: 'multiOptions',
    default: ['anthropic', 'openai', 'google', 'mistral', 'groq'],
    description: 'Which AI providers are eligible for routing. Providers with no API key in credentials are automatically skipped.',
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
    displayName: 'Max Cost Per 1K Tokens (USD)',
    name: 'maxCostPer1k',
    type: 'number',
    default: 0,
    description: 'Hard budget cap. Models with a blended cost per 1K tokens above this value are excluded. Set to 0 for no limit.',
    typeOptions: { minValue: 0, numberPrecision: 6 },
  },
  {
    displayName: 'Ollama Model',
    name: 'ollamaModel',
    type: 'string',
    default: 'llama3',
    description: 'The Ollama model name to use. Must be installed locally via <code>ollama pull &lt;model&gt;</code>.',
    displayOptions: { show: { allowedProviders: ['ollama'] } },
  },
  {
    displayName: 'Ollama Base URL',
    name: 'ollamaBaseUrl',
    type: 'string',
    default: 'http://localhost:11434',
    description: 'Base URL of your local Ollama instance.',
    displayOptions: { show: { allowedProviders: ['ollama'] } },
  },

  // ── Generation limits ────────────────────────────────────────────────────────

  {
    displayName: 'Max Tokens',
    name: 'maxTokens',
    type: 'number',
    default: 0,
    description: 'Maximum tokens to generate. Set to 0 for the provider default. Each model has its own ceiling (Claude Sonnet: 64K, GPT-4.1: 32K).',
    typeOptions: { minValue: 0 },
  },

  // ── Behaviour ────────────────────────────────────────────────────────────────

  {
    displayName: 'Enable Fallback',
    name: 'fallbackEnabled',
    type: 'boolean',
    default: true,
    description: 'Automatically retry with the next-best model when the primary model returns a 429, 5xx, or network error. Up to 3 attempts total.',
  },
  {
    displayName: 'Dry Run (Routing Only)',
    name: 'dryRun',
    type: 'boolean',
    default: false,
    description: 'When enabled, the node selects the best model and returns routing information but does NOT call any AI API. Use this to test routing logic without spending tokens.',
  },
  {
    displayName: 'Max Items Per Execution',
    name: 'maxItemsPerExecution',
    type: 'number',
    default: 10,
    description: 'Maximum input items to process per run. Prevents accidental cost drain from large batches or runaway loops. Set to 0 to process all items.',
    typeOptions: { minValue: 0 },
  },

  // ── Output options ────────────────────────────────────────────────────────────

  {
    displayName: 'Include Model Info',
    name: 'outputModelUsed',
    type: 'boolean',
    default: false,
    description: 'Add <code>modelUsed</code>, <code>providerUsed</code>, <code>attemptsTaken</code>, and token counts to the output JSON.',
  },
  {
    displayName: 'Include Detected Task',
    name: 'outputDetectedTask',
    type: 'boolean',
    default: false,
    description: 'Add <code>detectedTask</code> and <code>detectedTaskConfidence</code> to the output. Useful for debugging task classification.',
  },
  {
    displayName: 'Include Score Breakdown',
    name: 'outputScoreBreakdown',
    type: 'boolean',
    default: false,
    description: 'Add <code>scoreBreakdown</code> to the output — the top-3 ranked candidate models with their final scores and per-criterion sub-scores (taskFit, cost, latency, contextSize).',
  },
  {
    displayName: 'Include Estimated Cost',
    name: 'outputEstimatedCost',
    type: 'boolean',
    default: false,
    description: 'Add <code>estimatedCostUSD</code> to the output, calculated from token counts and registry pricing. Only available after a successful API call (not in dry-run mode).',
    displayOptions: { hide: { dryRun: [true] } },
  },
];
