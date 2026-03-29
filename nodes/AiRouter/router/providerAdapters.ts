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
  /** Whether to use streaming. Defaults to false. Ignored for reasoning models. */
  stream?: boolean;
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

type AdapterFn = (
  model: ModelSpec,
  prompt: string,
  creds: CredMap,
  options: CallOptions,
) => Promise<ModelResponse>;

// ── Anthropic ────────────────────────────────────────────────────────────────

interface AnthropicContent {
  type: string;
  text: string;
}

interface AnthropicResponse {
  content: AnthropicContent[];
  usage: { input_tokens: number; output_tokens: number };
}

const anthropicAdapter: AdapterFn = async (model, prompt, creds, opts) => {
  if (!creds.anthropic) throw new ProviderError('Anthropic API key not configured', 401);

  const body: Record<string, unknown> = {
    model: model.id,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [{ role: 'user', content: prompt }],
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  return {
    text: data.content[0]?.text ?? '',
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
  choices: Array<{ message: { content: string } }>;
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
    max_completion_tokens: opts.maxTokens ?? 4096,
  };

  // Reasoning models (o3) do not accept temperature or stream parameters
  if (!model.capabilities.supportsReasoningMode) {
    body.temperature = opts.temperature ?? 0.7;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
  return {
    text: data.choices[0]?.message?.content ?? '',
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${creds.google}`;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
    },
  };

  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`Google Gemini API error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as GoogleResponse;
  return {
    text: data.candidates[0]?.content?.parts[0]?.text ?? '',
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

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${creds.mistral}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model.id,
      messages,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`Mistral API error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as OpenAIResponse;
  return {
    text: data.choices[0]?.message?.content ?? '',
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

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${creds.groq}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model.id,
      messages,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`Groq API error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as OpenAIResponse;
  return {
    text: data.choices[0]?.message?.content ?? '',
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

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      messages,
      stream: false,
      options: {
        num_predict: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ProviderError(`Ollama error ${res.status}: ${errText}`, res.status);
  }

  const data = (await res.json()) as OllamaResponse;
  return {
    text: data.message?.content ?? '',
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
