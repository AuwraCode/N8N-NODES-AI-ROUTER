import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeWithFallback, isRetriable, RETRIABLE_STATUS_CODES, NON_RETRIABLE_STATUS_CODES } from '../nodes/AiRouter/router/fallbackChain';
import { ProviderError } from '../nodes/AiRouter/router/providerAdapters';
import type { ModelSpec } from '../nodes/AiRouter/router/modelRegistry';
import type { CredMap } from '../nodes/AiRouter/router/providerAdapters';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makeModel = (id: string, provider: ModelSpec['provider'] = 'openai'): ModelSpec => ({
  id,
  displayName: `Test Model ${id}`,
  provider,
  pricing: { inputPer1M: 1, outputPer1M: 4, blendedPer1K: 0.002 },
  capabilities: {
    supportsVision: false, supportsEmbeddings: false,
    supportsStreaming: true, supportsReasoningMode: false,
    isLocal: false, contextWindow: 128_000,
  },
  latencyTier: 1,
  taskAffinity: { chat: 0.8 },
});

const MODEL_A = makeModel('model-a');
const MODEL_B = makeModel('model-b');
const MODEL_C = makeModel('model-c');

const CREDS: CredMap = { openai: 'sk-test' };
const PROMPT = 'Hello';

// ── isRetriable ───────────────────────────────────────────────────────────────

describe('isRetriable', () => {
  it('returns true for retriable status codes', () => {
    for (const code of RETRIABLE_STATUS_CODES) {
      expect(isRetriable(new ProviderError('err', code))).toBe(true);
    }
  });

  it('returns false for non-retriable status codes', () => {
    for (const code of NON_RETRIABLE_STATUS_CODES) {
      expect(isRetriable(new ProviderError('err', code))).toBe(false);
    }
  });

  it('returns false for unknown 4xx codes', () => {
    expect(isRetriable(new ProviderError('err', 422))).toBe(false);
    expect(isRetriable(new ProviderError('err', 451))).toBe(false);
  });

  it('returns true for unknown 5xx codes', () => {
    expect(isRetriable(new ProviderError('err', 521))).toBe(true);
  });

  it('returns true for TypeError (network failure)', () => {
    expect(isRetriable(new TypeError('fetch failed'))).toBe(true);
  });

  it('returns false for generic Error', () => {
    expect(isRetriable(new Error('something weird'))).toBe(false);
  });
});

// ── executeWithFallback ───────────────────────────────────────────────────────

describe('executeWithFallback', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns the response on first-attempt success', async () => {
    // Mock fetch to succeed
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello!' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await executeWithFallback([MODEL_A, MODEL_B], PROMPT, CREDS, {}, { maxAttempts: 2 });

    expect(result.response.text).toBe('Hello!');
    expect(result.modelUsed.id).toBe('model-a');
    expect(result.attemptsTaken).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('falls back to the second model when first fails with 429', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          text: async () => 'Rate limit exceeded',
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Fallback response' } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const onFallback = vi.fn();
    const result = await executeWithFallback(
      [MODEL_A, MODEL_B],
      PROMPT,
      CREDS,
      {},
      { maxAttempts: 2, onFallback },
    );

    expect(result.response.text).toBe('Fallback response');
    expect(result.modelUsed.id).toBe('model-b');
    expect(result.attemptsTaken).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(onFallback).toHaveBeenCalledWith(MODEL_A, MODEL_B, expect.any(ProviderError));

    vi.unstubAllGlobals();
  });

  it('throws immediately on non-retriable 401 error without trying other models', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      executeWithFallback([MODEL_A, MODEL_B, MODEL_C], PROMPT, CREDS, {}, { maxAttempts: 3 }),
    ).rejects.toThrow(ProviderError);

    // Only one call should have been made
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('throws immediately on non-retriable 400 error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      executeWithFallback([MODEL_A, MODEL_B], PROMPT, CREDS, {}, { maxAttempts: 2 }),
    ).rejects.toThrow(ProviderError);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('throws combined error message when all attempts fail', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      executeWithFallback([MODEL_A, MODEL_B, MODEL_C], PROMPT, CREDS, {}, { maxAttempts: 3 }),
    ).rejects.toThrow(/All 3 model attempt\(s\) failed/);

    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.unstubAllGlobals();
  });

  it('only makes one attempt when maxAttempts=1', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      executeWithFallback([MODEL_A, MODEL_B, MODEL_C], PROMPT, CREDS, {}, { maxAttempts: 1 }),
    ).rejects.toThrow(/All 1 model attempt\(s\) failed/);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('throws when candidates list is empty', async () => {
    await expect(
      executeWithFallback([], PROMPT, CREDS, {}, { maxAttempts: 3 }),
    ).rejects.toThrow('No models available');
  });

  it('calls onAttempt for each attempt', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        return { ok: false, status: 503, text: async () => 'err' };
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }),
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const onAttempt = vi.fn();
    await executeWithFallback(
      [MODEL_A, MODEL_B, MODEL_C],
      PROMPT,
      CREDS,
      {},
      { maxAttempts: 3, onAttempt },
    );

    expect(onAttempt).toHaveBeenCalledTimes(3);
    expect(onAttempt).toHaveBeenNthCalledWith(1, MODEL_A, 1);
    expect(onAttempt).toHaveBeenNthCalledWith(2, MODEL_B, 2);
    expect(onAttempt).toHaveBeenNthCalledWith(3, MODEL_C, 3);

    vi.unstubAllGlobals();
  });

  it('handles network TypeError as retriable', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new TypeError('fetch failed');
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'recovered' } }], usage: {} }),
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await executeWithFallback(
      [MODEL_A, MODEL_B],
      PROMPT,
      CREDS,
      {},
      { maxAttempts: 2 },
    );

    expect(result.response.text).toBe('recovered');
    expect(result.modelUsed.id).toBe('model-b');

    vi.unstubAllGlobals();
  });
});
