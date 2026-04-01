/**
 * Fallback Chain — retry AI model calls with the next-best model on failure.
 *
 * Retriability is determined by HTTP status code:
 * - 429, 500, 502, 503, 504 → retriable (try next model in ranked list)
 * - 400, 401, 403, 404       → non-retriable (bad config, throw immediately)
 * - Network errors (TypeError from fetch) → retriable
 */

import type { ModelSpec } from './modelRegistry';
import { callModel, ProviderError } from './providerAdapters';
import type { CallOptions, CredMap, ModelResponse } from './providerAdapters';

/** HTTP status codes that indicate a transient error — try the next model. */
export const RETRIABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** HTTP status codes that indicate a permanent/config error — stop immediately. */
export const NON_RETRIABLE_STATUS_CODES = new Set([400, 401, 403, 404, 422, 501, 505, 511]);

/**
 * Determine whether an error from a provider call is worth retrying with a
 * different model.
 *
 * @param error - The thrown error value.
 */
export function isRetriable(error: unknown): boolean {
  if (error instanceof ProviderError) {
    // Non-retriable codes: auth, bad request, not found
    if (NON_RETRIABLE_STATUS_CODES.has(error.statusCode)) return false;
    // Explicit retriable codes
    if (RETRIABLE_STATUS_CODES.has(error.statusCode)) return true;
    // Unknown 4xx: treat as non-retriable
    if (error.statusCode >= 400 && error.statusCode < 500) return false;
    // Unknown 5xx: treat as retriable
    return true;
  }
  // fetch() network failures (ECONNREFUSED, DNS failure, etc.)
  if (error instanceof TypeError) return true;
  // AbortController timeout fired (fetchWithTimeout) — Node.js throws plain Error, not DOMException
  if ((error as Error)?.name === 'AbortError') return true;
  return false;
}

/** Options controlling fallback behavior. */
export interface FallbackOptions {
  /** Maximum number of models to try before giving up. Defaults to 3. */
  maxAttempts: number;
  /** Called before each attempt. Useful for logging. */
  onAttempt?: (model: ModelSpec, attempt: number) => void;
  /** Called when falling back to a new model after a retriable error. */
  onFallback?: (fromModel: ModelSpec, toModel: ModelSpec, error: unknown) => void;
}

/** Result returned on successful completion. */
export interface FallbackResult {
  /** The response from the successful model call. */
  response: ModelResponse;
  /** The model that produced the successful response. */
  modelUsed: ModelSpec;
  /** How many models were tried (1 = first attempt succeeded). */
  attemptsTaken: number;
  /** Errors from all failed attempts, in order. */
  errors: Array<{ model: ModelSpec; error: unknown }>;
}

/**
 * Execute a prompt against ranked model candidates, falling back to the next
 * model on retriable errors.
 *
 * @param rankedCandidates - Models in descending score order (best first).
 * @param prompt - The user prompt.
 * @param creds - Resolved API credentials.
 * @param options - Optional call parameters forwarded to the provider adapter.
 * @param fallbackOpts - Fallback behavior configuration.
 * @returns FallbackResult with the successful response and diagnostics.
 * @throws The first non-retriable error encountered, or a summary error if all attempts fail.
 */
export async function executeWithFallback(
  rankedCandidates: ModelSpec[],
  prompt: string,
  creds: CredMap,
  options: CallOptions = {},
  fallbackOpts: FallbackOptions = { maxAttempts: 3 },
): Promise<FallbackResult> {
  const errors: Array<{ model: ModelSpec; error: unknown }> = [];
  const maxAttempts = Math.min(fallbackOpts.maxAttempts, rankedCandidates.length);

  if (maxAttempts === 0) {
    throw new Error('No models available for execution');
  }

  for (let i = 0; i < maxAttempts; i++) {
    const model = rankedCandidates[i];
    fallbackOpts.onAttempt?.(model, i + 1);

    try {
      const response = await callModel(model, prompt, creds, options);
      return {
        response,
        modelUsed: model,
        attemptsTaken: i + 1,
        errors,
      };
    } catch (err) {
      errors.push({ model, error: err });

      if (!isRetriable(err)) {
        // Non-retriable: surface the error immediately without trying other models
        throw err;
      }

      // Log fallback if callback provided and there's a next model
      if (i < maxAttempts - 1) {
        fallbackOpts.onFallback?.(model, rankedCandidates[i + 1], err);
      }
    }
  }

  // All attempts exhausted — build a descriptive error
  const errorSummary = errors
    .map(({ model: m, error: e }) => {
      const msg = e instanceof Error ? e.message : String(e);
      return `  • ${m.displayName} (${m.provider}): ${msg}`;
    })
    .join('\n');

  throw new Error(
    `All ${maxAttempts} model attempt(s) failed:\n${errorSummary}`,
  );
}
