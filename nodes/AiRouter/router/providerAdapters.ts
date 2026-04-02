/**
 * Provider Adapters — unified HTTP interface for calling AI model APIs.
 *
 * Each provider has its own adapter function that:
 * 1. Constructs the provider-specific request payload.
 * 2. Calls the provider's REST API using native fetch() (no external HTTP libraries).
 * 3. Normalizes the response to a common ModelResponse shape.
 *
 * The main export is callModel(), which dispatches to the correct adapter.
 */

import type { ModelSpec, ProviderType } from './modelRegistry';

/** API keys and connection settings, resolved from N8N credentials. */
export interface CredMap {
  /** Anthropic API key. */
  anthropic?: string;
  /** OpenAI API key. */
  openai?: string;
  /** Google Gemini API key. */
  google?: string;
  /** Mistral AI API key. */
  mistral?: string;
  /** Groq API key. */
  groq?: string;
  /** Ollama base URL. Defaults to http://localhost:11434 if omitted. */
  ollamaBaseUrl?: string;
}

/** Options for model invocation. */
export interface CallOptions {
  /** Maximum tokens to generate. Defaults to 4096. */
  maxTokens?: number;
  /** Sampling temperature. Defaults to 0.7. Ignored for reasoning models. */
  temperature?: number;
  /** Optional system prompt prepended to the conversation. */
  systemPrompt?: string;
}

/** Normalized response from any provider. */
export interface ModelResponse {
  /** The generated text content. */
  text: string;
  /** Internal reasoning/thinking text from reasoning models (e.g. o3, o4-mini). */
  thinking?: string;
  /** Number of input tokens consumed (if reported by provider). */
  inputTokens?: number;
  /** Number of output tokens generated (if reported by provider). */
  outputTokens?: number;
  /** The model id that was actually called. */
  model: string;
  /** The provider that served the response. */
  provider: ProviderType;
}

/**
 * Error thrown when a provider returns a non-2xx HTTP response.
 * The statusCode is used by the fallback chain to determine retriability.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Wraps fetch() with an AbortController timeout. Throws an AbortError if the
 * request takes longer than `ms` milliseconds (default 30 s).
 */
async function fetchWithTimeout(url: string, init: RequestInit, ms = 90_000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // Node.js (undici) throws a plain Error with name 'AbortError', not a DOMException
    if ((err as Error)?.name === 'AbortError') {
      throw new ProviderError(`Request timed out after ${ms / 1000}s`, 504);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

type AdapterFn = (
  model: ModelSpec,
  prompt: string,
  creds: CredMap,
  options: CallOptions,
) => Promise<ModelResponse>;

/**
 * Resolve the effective max-tokens value for an API call.
 *
 * - If the user set an explicit limit, honour it but cap it at the model's
 *   ceiling to prevent 400 errors from over-specified values.
 * - If no limit was requested (0 / undefined), use the model's documented
 *   maximum so the response is never silently truncated by a stale hard-code.
 */
function resolveMaxTokens(model: ModelSpec, opts: CallOptions): number {
  const modelMax = model.capabilities.maxOutputTokens;
  if (opts.maxTokens && opts.maxTokens > 0) {
    return Math.min(opts.maxTokens, modelMax);
  }
  return modelMax;
}

// ── Anthropic ────────────────────────────────────────────────────────────────

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicThinkingBlock | { type: string };

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

const anthropicAdapter: AdapterFn = async (model, prompt, creds, opts) => {
  if (!creds.anthropic) throw new ProviderError('Anthropic API key not configured', 401);

  const body: Record<string, unknown> = {
    model: model.id,
    messages: [{ role: 'user', content: prompt }],
    // max_tokens is required by Anthropic API — use the model's documented maximum
    // when the user hasn't set a limit, capped at the model ceiling otherwise.
    max_tokens: resolveMaxTokens(model, opts),
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;

  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': creds.anthropic,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`Anthropic API error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as AnthropicResponse;
  // Find first text block — reasoning models may return a thinking block at index 0
  const textBlock = data.content.find((b): b is AnthropicTextBlock => b.type === 'text');
  const thinkingBlock = data.content.find((b): b is AnthropicThinkingBlock => b.type === 'thinking');
  const text = textBlock?.text;
  if (!text) throw new ProviderError('Anthropic returned no content (possibly content-filtered)', 200);
  return {
    text,
    thinking: thinkingBlock?.thinking,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    model: model.id,
    provider: 'anthropic',
  };
};

// ── OpenAI ────────────────────────────────────────────────────────────────────

interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIResponse {
  choices: Array<{ message: { content: string; reasoning_content?: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

const openaiAdapter: AdapterFn = async (model, prompt, creds, opts) => {
  if (!creds.openai) throw new ProviderError('OpenAI API key not configured', 401);

  const messages: OpenAIMessage[] = [];
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const body: Record<string, unknown> = {
    model: model.id,
    messages,
  };
  body.max_completion_tokens = resolveMaxTokens(model, opts);

  // Reasoning models (o3) do not accept temperature or stream parameters
  if (!model.capabilities.supportsReasoningMode) {
    body.temperature = opts.temperature ?? 0.7;
  }

  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${creds.openai}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`OpenAI API error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as OpenAIResponse;
  const text = data.choices[0]?.message?.content;
  if (!text) throw new ProviderError('OpenAI returned no content (possibly content-filtered)', 200);
  const thinking = data.choices[0]?.message?.reasoning_content ?? undefined;
  return {
    text,
    thinking,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    model: model.id,
    provider: 'openai',
  };
};

// ── Google Gemini ─────────────────────────────────────────────────────────────

interface GoogleResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
}

const googleAdapter: AdapterFn = async (model, prompt, creds, opts) => {
  if (!creds.google) throw new ProviderError('Google Gemini API key not configured', 401);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: resolveMaxTokens(model, opts),
  };
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  };

  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': creds.google,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`Google Gemini API error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as GoogleResponse;
  const text = data.candidates[0]?.content?.parts[0]?.text;
  if (!text) throw new ProviderError('Google Gemini returned no content (possibly content-filtered)', 200);
  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount,
    outputTokens: data.usageMetadata?.candidatesTokenCount,
    model: model.id,
    provider: 'google',
  };
};

// ── Mistral (OpenAI-compatible) ───────────────────────────────────────────────

const mistralAdapter: AdapterFn = async (model, prompt, creds, opts) => {
  if (!creds.mistral) throw new ProviderError('Mistral API key not configured', 401);

  const messages: OpenAIMessage[] = [];
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${creds.mistral}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model.id,
      messages,
      max_tokens: resolveMaxTokens(model, opts),
      temperature: opts.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`Mistral API error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as OpenAIResponse;
  const text = data.choices[0]?.message?.content;
  if (!text) throw new ProviderError('Mistral returned no content (possibly content-filtered)', 200);
  return {
    text,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    model: model.id,
    provider: 'mistral',
  };
};

// ── Groq (OpenAI-compatible) ──────────────────────────────────────────────────

const groqAdapter: AdapterFn = async (model, prompt, creds, opts) => {
  if (!creds.groq) throw new ProviderError('Groq API key not configured', 401);

  const messages: OpenAIMessage[] = [];
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${creds.groq}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model.id,
      messages,
      max_tokens: resolveMaxTokens(model, opts),
      temperature: opts.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`Groq API error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as OpenAIResponse;
  const text = data.choices[0]?.message?.content;
  if (!text) throw new ProviderError('Groq returned no content (possibly content-filtered)', 200);
  return {
    text,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    model: model.id,
    provider: 'groq',
  };
};

// ── Ollama (local) ────────────────────────────────────────────────────────────

interface OllamaResponse {
  message: { content: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

const ollamaAdapter: AdapterFn = async (model, prompt, creds, opts) => {
  const baseUrl = (creds.ollamaBaseUrl ?? 'http://localhost:11434').replace(/\/$/, '');

  const messages: OpenAIMessage[] = [];
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetchWithTimeout(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      messages,
      stream: false,
      options: {
        num_predict: resolveMaxTokens(model, opts),
        temperature: opts.temperature ?? 0.7,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`Ollama error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as OllamaResponse;
  const text = data.message?.content;
  if (!text) throw new ProviderError('Ollama returned no content', 200);
  return {
    text,
    inputTokens: data.prompt_eval_count,
    outputTokens: data.eval_count,
    model: model.id,
    provider: 'ollama',
  };
};

// ── Dispatcher ────────────────────────────────────────────────────────────────

const ADAPTERS: Record<ProviderType, AdapterFn> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  mistral: mistralAdapter,
  groq: groqAdapter,
  ollama: ollamaAdapter,
};

/**
 * Call an AI model using the appropriate provider adapter.
 *
 * @param model - The ModelSpec to call (from the model registry).
 * @param prompt - The user prompt text.
 * @param creds - Resolved API credentials.
 * @param options - Optional call parameters (temperature, maxTokens, etc.).
 * @returns A normalized ModelResponse.
 * @throws {ProviderError} on non-2xx HTTP responses.
 */
export async function callModel(
  model: ModelSpec,
  prompt: string,
  creds: CredMap,
  options: CallOptions = {},
): Promise<ModelResponse> {
  const adapter = ADAPTERS[model.provider];
  if (!adapter) {
    throw new Error(`No adapter registered for provider: "${model.provider}"`);
  }
  return adapter(model, prompt, creds, options);
}
