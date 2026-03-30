/**
 * Model Registry — single source of truth for all AI model metadata, pricing, and capabilities.
 *
 * To add a new model: append one ModelSpec object to MODEL_REGISTRY.
 * Pricing is in USD. blendedPer1K = (inputPer1M * 0.7 + outputPer1M * 0.3) / 1000
 * (assumes a typical 70% input / 30% output token split).
 */

/** All supported cloud and local AI providers. */
export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'mistral'
  | 'groq'
  | 'ollama';

/** Task categories used for routing decisions. */
export type TaskType =
  | 'coding'
  | 'writing'
  | 'analysis'
  | 'summarization'
  | 'classification'
  | 'vision'
  | 'embeddings'
  | 'chat';

/** Routing optimization mode selected by the user. */
export type RoutingMode = 'auto' | 'cost' | 'quality' | 'speed' | 'local';

/** Token pricing for a model in USD. */
export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPer1M: number;
  /** USD per 1M output tokens. */
  outputPer1M: number;
  /**
   * Pre-computed blended cost per 1K tokens.
   * Formula: (inputPer1M * 0.7 + outputPer1M * 0.3) / 1000
   */
  blendedPer1K: number;
}

/** Feature flags and constraints for a model. */
export interface ModelCapabilities {
  /** Whether the model can process image inputs. */
  supportsVision: boolean;
  /** Whether the model can generate text embeddings. */
  supportsEmbeddings: boolean;
  /** Whether the model supports streaming responses. */
  supportsStreaming: boolean;
  /**
   * Whether the model uses a reasoning/thinking mode
   * (e.g. OpenAI o3/o4-mini — requires special parameter handling).
   */
  supportsReasoningMode: boolean;
  /** Whether the model runs locally (e.g. Ollama). Zero cost, privacy-preserving. */
  isLocal: boolean;
  /** Maximum context window in tokens. */
  contextWindow: number;
}

/**
 * Per-task affinity scores (0–1) indicating how well a model handles each task type.
 * Missing entries are treated as 0.5 (neutral) by the scoring engine.
 */
export type TaskAffinityMap = Partial<Record<TaskType, number>>;

/** Complete specification for a single AI model. */
export interface ModelSpec {
  /** API model identifier used in HTTP requests. */
  id: string;
  /** Provider that hosts this model. */
  provider: ProviderType;
  /** Human-readable name shown in logs and outputs. */
  displayName: string;
  /** Pricing information. */
  pricing: ModelPricing;
  /** Capability flags. */
  capabilities: ModelCapabilities;
  /**
   * Qualitative latency tier.
   * 1 = fastest (sub-second typical), 2 = moderate, 3 = slow (reasoning models).
   */
  latencyTier: 1 | 2 | 3;
  /** Task-specific quality scores used by the scoring engine. */
  taskAffinity: TaskAffinityMap;
}

/**
 * The complete model registry. Add new models here — no other file needs to change
 * for the routing engine to discover and use them.
 *
 * Pricing last verified: March 2026. Run `npm run sync:models` to check for stale IDs.
 * Update blendedPer1K when pricing changes: (inputPer1M * 0.7 + outputPer1M * 0.3) / 1000
 */
export const MODEL_REGISTRY: readonly ModelSpec[] = [

  // ── Anthropic ─────────────────────────────────────────────────────────────
  // Pricing: https://www.anthropic.com/pricing#anthropic-api
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.6',
    pricing: { inputPer1M: 5, outputPer1M: 25, blendedPer1K: 0.011 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: true,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 3,
    taskAffinity: {
      analysis: 1.0,
      coding: 0.95,
      writing: 0.92,
      vision: 0.90,
      summarization: 0.88,
      chat: 0.82,
      classification: 0.78,
    },
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    pricing: { inputPer1M: 3, outputPer1M: 15, blendedPer1K: 0.0066 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 2,
    taskAffinity: {
      coding: 0.92,
      analysis: 0.90,
      writing: 0.88,
      summarization: 0.87,
      chat: 0.90,
      classification: 0.82,
      vision: 0.87,
    },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    pricing: { inputPer1M: 1, outputPer1M: 5, blendedPer1K: 0.0022 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 200_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.90,
      classification: 0.88,
      summarization: 0.82,
      writing: 0.72,
      coding: 0.68,
      analysis: 0.62,
      vision: 0.75,
    },
  },

  // ── OpenAI ────────────────────────────────────────────────────────────────
  // Pricing: https://openai.com/api/pricing/
  {
    id: 'gpt-4.1',
    provider: 'openai',
    displayName: 'GPT-4.1',
    pricing: { inputPer1M: 2, outputPer1M: 8, blendedPer1K: 0.0038 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 2,
    taskAffinity: {
      chat: 0.90,
      coding: 0.90,
      analysis: 0.87,
      writing: 0.87,
      summarization: 0.82,
      classification: 0.82,
      vision: 0.85,
    },
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    pricing: { inputPer1M: 2.5, outputPer1M: 10, blendedPer1K: 0.00475 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 128_000,
    },
    latencyTier: 2,
    taskAffinity: {
      vision: 1.0,
      chat: 0.90,
      coding: 0.87,
      analysis: 0.87,
      writing: 0.87,
      summarization: 0.82,
      classification: 0.80,
    },
  },
  {
    // o3: does not accept temperature or stream. Handled via supportsReasoningMode flag.
    id: 'o3',
    provider: 'openai',
    displayName: 'OpenAI o3',
    pricing: { inputPer1M: 2, outputPer1M: 8, blendedPer1K: 0.0038 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: false,
      supportsReasoningMode: true,
      isLocal: false,
      contextWindow: 200_000,
    },
    latencyTier: 3,
    taskAffinity: {
      analysis: 1.0,
      coding: 0.97,
      summarization: 0.82,
      classification: 0.78,
    },
  },
  {
    // o4-mini: cheaper reasoning model, strong on STEM and code.
    id: 'o4-mini',
    provider: 'openai',
    displayName: 'OpenAI o4-mini',
    pricing: { inputPer1M: 1.1, outputPer1M: 4.4, blendedPer1K: 0.00209 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: false,
      supportsReasoningMode: true,
      isLocal: false,
      contextWindow: 200_000,
    },
    latencyTier: 3,
    taskAffinity: {
      coding: 0.95,
      analysis: 0.92,
      summarization: 0.78,
      classification: 0.75,
    },
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    pricing: { inputPer1M: 0.15, outputPer1M: 0.6, blendedPer1K: 0.000285 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 128_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.90,
      classification: 0.90,
      summarization: 0.82,
      writing: 0.72,
      vision: 0.72,
    },
  },

  // ── Google Gemini ─────────────────────────────────────────────────────────
  // Pricing: https://ai.google.dev/gemini-api/docs/pricing
  {
    // Latest stable flagship — best for long-context analysis and vision.
    id: 'gemini-2.5-pro',
    provider: 'google',
    displayName: 'Gemini 2.5 Pro',
    pricing: { inputPer1M: 1.25, outputPer1M: 10, blendedPer1K: 0.003875 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 2,
    taskAffinity: {
      analysis: 0.93,
      vision: 0.92,
      coding: 0.88,
      summarization: 0.88,
      writing: 0.87,
      chat: 0.83,
      classification: 0.82,
    },
  },
  {
    // Next-gen preview flagship — higher quality than 2.5 Pro at higher cost.
    id: 'gemini-3.1-pro-preview',
    provider: 'google',
    displayName: 'Gemini 3.1 Pro (Preview)',
    pricing: { inputPer1M: 2.0, outputPer1M: 12, blendedPer1K: 0.005 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 2,
    taskAffinity: {
      analysis: 0.96,
      vision: 0.95,
      coding: 0.92,
      writing: 0.90,
      summarization: 0.90,
      chat: 0.85,
      classification: 0.85,
    },
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'google',
    displayName: 'Gemini 2.5 Flash',
    pricing: { inputPer1M: 0.3, outputPer1M: 2.5, blendedPer1K: 0.00096 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.88,
      summarization: 0.87,
      classification: 0.87,
      vision: 0.84,
      coding: 0.80,
      writing: 0.80,
      analysis: 0.77,
    },
  },
  {
    // Good preview flash option — cheaper than 2.5 Flash with newer capabilities.
    id: 'gemini-3-flash-preview',
    provider: 'google',
    displayName: 'Gemini 3 Flash (Preview)',
    pricing: { inputPer1M: 0.5, outputPer1M: 3.0, blendedPer1K: 0.00125 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.90,
      summarization: 0.88,
      classification: 0.88,
      vision: 0.87,
      coding: 0.82,
      writing: 0.82,
      analysis: 0.80,
    },
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'google',
    displayName: 'Gemini 2.5 Flash Lite',
    pricing: { inputPer1M: 0.1, outputPer1M: 0.4, blendedPer1K: 0.00019 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.85,
      classification: 0.88,
      summarization: 0.80,
      vision: 0.78,
    },
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  // Pricing: https://mistral.ai/pricing
  // Run `npm run sync:models` after adding a Mistral key to verify IDs.
  {
    id: 'mistral-large-2512',
    provider: 'mistral',
    displayName: 'Mistral Large 3',
    pricing: { inputPer1M: 0.5, outputPer1M: 1.5, blendedPer1K: 0.0008 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 262_000,
    },
    latencyTier: 2,
    taskAffinity: {
      coding: 0.87,
      analysis: 0.85,
      chat: 0.83,
      writing: 0.82,
      summarization: 0.82,
      classification: 0.80,
    },
  },
  {
    id: 'mistral-medium-3',
    provider: 'mistral',
    displayName: 'Mistral Medium 3.1',
    pricing: { inputPer1M: 0.4, outputPer1M: 2.0, blendedPer1K: 0.00088 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 131_000,
    },
    latencyTier: 2,
    taskAffinity: {
      chat: 0.83,
      writing: 0.83,
      analysis: 0.80,
      summarization: 0.80,
      classification: 0.77,
    },
  },
  {
    // Mistral Small 4 (v26.03) — replaces Small Creative, broader task coverage.
    id: 'mistral-small-4-0-26-03',
    provider: 'mistral',
    displayName: 'Mistral Small 4',
    pricing: { inputPer1M: 0.1, outputPer1M: 0.3, blendedPer1K: 0.00016 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 262_000,
    },
    latencyTier: 1,
    taskAffinity: {
      writing: 0.87,
      chat: 0.83,
      summarization: 0.80,
      classification: 0.78,
      coding: 0.72,
    },
  },
  {
    // Devstral 2 (v25.12): 123B dense transformer, specialized for code (72.2% SWE-bench).
    id: 'devstral-2-25-12',
    provider: 'mistral',
    displayName: 'Devstral 2',
    pricing: { inputPer1M: 0.1, outputPer1M: 0.3, blendedPer1K: 0.00016 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 256_000,
    },
    latencyTier: 2,
    taskAffinity: {
      coding: 1.0,
      analysis: 0.77,
    },
  },

  // ── Groq (ultra-fast inference) ───────────────────────────────────────────
  // Pricing: https://console.groq.com/docs/models
  {
    // Fastest budget option — sub-100ms for short prompts.
    id: 'llama-3.1-8b-instant',
    provider: 'groq',
    displayName: 'Llama 3.1 8B Instant (Groq)',
    pricing: { inputPer1M: 0.05, outputPer1M: 0.08, blendedPer1K: 0.000059 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 128_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.82,
      classification: 0.80,
      summarization: 0.75,
    },
  },
  {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    displayName: 'Llama 3.3 70B (Groq)',
    pricing: { inputPer1M: 0.59, outputPer1M: 0.79, blendedPer1K: 0.00065 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 128_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.88,
      writing: 0.83,
      summarization: 0.83,
      coding: 0.80,
      classification: 0.82,
      analysis: 0.77,
    },
  },
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    provider: 'groq',
    displayName: 'Llama 4 Scout 17B (Groq)',
    pricing: { inputPer1M: 0.11, outputPer1M: 0.34, blendedPer1K: 0.000179 },
    capabilities: {
      supportsVision: true,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 10_000_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.87,
      vision: 0.87,
      classification: 0.84,
      summarization: 0.82,
      writing: 0.77,
      coding: 0.75,
      analysis: 0.73,
    },
  },
  {
    // OpenAI OSS 20B on Groq — ~1000 tokens/sec, best throughput available.
    id: 'openai/gpt-oss-20b',
    provider: 'groq',
    displayName: 'GPT-OSS 20B (Groq)',
    pricing: { inputPer1M: 0.075, outputPer1M: 0.3, blendedPer1K: 0.000143 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 128_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.85,
      classification: 0.83,
      summarization: 0.80,
      writing: 0.78,
    },
  },
  {
    // OpenAI OSS 120B on Groq — ~500 tokens/sec, stronger than 20B on complex tasks.
    id: 'openai/gpt-oss-120b',
    provider: 'groq',
    displayName: 'GPT-OSS 120B (Groq)',
    pricing: { inputPer1M: 0.15, outputPer1M: 0.6, blendedPer1K: 0.000285 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 128_000,
    },
    latencyTier: 1,
    taskAffinity: {
      chat: 0.88,
      coding: 0.83,
      analysis: 0.82,
      writing: 0.82,
      summarization: 0.82,
      classification: 0.83,
    },
  },
  {
    // Qwen3 32B on Groq — strong reasoning and multilingual, competitive with 70B models.
    id: 'qwen/qwen3-32b',
    provider: 'groq',
    displayName: 'Qwen3 32B (Groq)',
    pricing: { inputPer1M: 0.29, outputPer1M: 0.59, blendedPer1K: 0.00038 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 128_000,
    },
    latencyTier: 1,
    taskAffinity: {
      coding: 0.87,
      analysis: 0.85,
      chat: 0.85,
      summarization: 0.83,
      writing: 0.80,
      classification: 0.82,
    },
  },
  {
    // Kimi K2 on Groq — 1M context, strong agentic and long-document tasks.
    id: 'moonshotai/kimi-k2-instruct',
    provider: 'groq',
    displayName: 'Kimi K2 (Groq)',
    pricing: { inputPer1M: 1.0, outputPer1M: 3.0, blendedPer1K: 0.0016 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 1,
    taskAffinity: {
      analysis: 0.90,
      coding: 0.88,
      summarization: 0.87,
      chat: 0.83,
      writing: 0.82,
      classification: 0.80,
    },
  },
];

/**
 * Placeholder spec for Ollama local models. The actual model id and display name
 * are injected at runtime based on the user-configured model string.
 */
export const OLLAMA_BASE_SPEC: Omit<ModelSpec, 'id' | 'displayName'> = {
  provider: 'ollama',
  pricing: { inputPer1M: 0, outputPer1M: 0, blendedPer1K: 0 },
  capabilities: {
    supportsVision: false,
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsReasoningMode: false,
    isLocal: true,
    contextWindow: 128_000,
  },
  latencyTier: 2,
  taskAffinity: { chat: 0.75, writing: 0.70, coding: 0.70 },
};

/**
 * Look up a model by its API id.
 * @throws {Error} if the model id is not found in the registry.
 */
export function getModelById(id: string): ModelSpec {
  const model = MODEL_REGISTRY.find((m) => m.id === id);
  if (!model) throw new Error(`Unknown model id: "${id}"`);
  return model;
}

/**
 * Return all models for a given provider.
 */
export function getModelsByProvider(provider: ProviderType): ModelSpec[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider);
}
