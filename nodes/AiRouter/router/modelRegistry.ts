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
   * (e.g. OpenAI o3 — requires special parameter handling).
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
 * Pricing last verified: March 2026. Update blendedPer1K when pricing changes.
 */
export const MODEL_REGISTRY: readonly ModelSpec[] = [
  // ── Anthropic ─────────────────────────────────────────────────────────────
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
      writing: 0.9,
      summarization: 0.85,
      chat: 0.8,
      classification: 0.75,
      vision: 0.9,
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
      contextWindow: 200_000,
    },
    latencyTier: 2,
    taskAffinity: {
      coding: 0.9,
      analysis: 0.88,
      writing: 0.85,
      summarization: 0.85,
      chat: 0.9,
      classification: 0.8,
      vision: 0.85,
    },
  },
  {
    id: 'claude-haiku-4-5',
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
      chat: 0.9,
      classification: 0.85,
      summarization: 0.8,
      writing: 0.7,
      coding: 0.65,
      analysis: 0.6,
    },
  },

  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    id: 'gpt-4.1',
    provider: 'openai',
    displayName: 'GPT-4.1',
    pricing: { inputPer1M: 2, outputPer1M: 8, blendedPer1K: 0.0038 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 1_000_000,
    },
    latencyTier: 2,
    taskAffinity: {
      chat: 0.9,
      coding: 0.88,
      analysis: 0.85,
      writing: 0.85,
      summarization: 0.8,
      classification: 0.8,
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
      chat: 0.9,
      coding: 0.85,
      analysis: 0.85,
      writing: 0.85,
      summarization: 0.8,
    },
  },
  {
    // NOTE: o3 does not accept temperature or stream parameters.
    // The provider adapter handles this automatically via supportsReasoningMode flag.
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
      coding: 0.95,
      summarization: 0.8,
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
      chat: 0.9,
      classification: 0.9,
      summarization: 0.8,
      writing: 0.7,
      vision: 0.7,
    },
  },

  // ── Google Gemini ─────────────────────────────────────────────────────────
  {
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
      analysis: 0.92,
      coding: 0.88,
      vision: 0.9,
      summarization: 0.88,
      writing: 0.85,
      chat: 0.82,
      classification: 0.8,
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
      summarization: 0.85,
      classification: 0.85,
      coding: 0.78,
      writing: 0.78,
      vision: 0.82,
      analysis: 0.75,
    },
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'google',
    displayName: 'Gemini 2.5 Flash Lite',
    pricing: { inputPer1M: 0.1, outputPer1M: 0.4, blendedPer1K: 0.00019 },
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
      chat: 0.85,
      classification: 0.88,
      summarization: 0.78,
    },
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  {
    id: 'mistral-large-2512',
    provider: 'mistral',
    displayName: 'Mistral Large 25.12',
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
      coding: 0.85,
      analysis: 0.82,
      chat: 0.82,
      writing: 0.8,
      summarization: 0.8,
      classification: 0.78,
    },
  },
  {
    id: 'mistral-medium-3',
    provider: 'mistral',
    displayName: 'Mistral Medium 3',
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
      chat: 0.82,
      writing: 0.82,
      analysis: 0.78,
      summarization: 0.78,
      classification: 0.75,
    },
  },
  {
    id: 'mistral-small-creative',
    provider: 'mistral',
    displayName: 'Mistral Small Creative',
    pricing: { inputPer1M: 0.1, outputPer1M: 0.3, blendedPer1K: 0.00016 },
    capabilities: {
      supportsVision: false,
      supportsEmbeddings: false,
      supportsStreaming: true,
      supportsReasoningMode: false,
      isLocal: false,
      contextWindow: 33_000,
    },
    latencyTier: 1,
    taskAffinity: {
      writing: 1.0,
      chat: 0.8,
      summarization: 0.7,
    },
  },
  {
    // Devstral 2: 123B dense transformer, specialized for code (72.2% SWE-bench).
    // Pricing is estimated at standard Mistral API rates; verify at launch.
    id: 'devstral-2',
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
      analysis: 0.75,
    },
  },

  // ── Groq (ultra-fast inference) ───────────────────────────────────────────
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
      writing: 0.82,
      summarization: 0.82,
      coding: 0.78,
      classification: 0.8,
      analysis: 0.75,
    },
  },
  {
    // TODO: Verify final pricing for Llama 4 Scout on Groq at launch.
    id: 'llama-4-scout-17b-16e-instruct',
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
      chat: 0.85,
      vision: 0.85,
      classification: 0.82,
      summarization: 0.8,
      writing: 0.75,
    },
  },
  {
    // TODO: Verify final pricing for Llama 4 Maverick on Groq at launch.
    id: 'llama-4-maverick-17b-128e-instruct',
    provider: 'groq',
    displayName: 'Llama 4 Maverick 17B (Groq)',
    pricing: { inputPer1M: 0.2, outputPer1M: 0.6, blendedPer1K: 0.00032 },
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
      chat: 0.88,
      vision: 0.88,
      coding: 0.78,
      writing: 0.8,
      analysis: 0.78,
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
  taskAffinity: { chat: 0.75, writing: 0.7, coding: 0.7 },
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
