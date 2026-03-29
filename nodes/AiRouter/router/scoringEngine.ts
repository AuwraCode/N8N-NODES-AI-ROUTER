/**
 * Scoring Engine — selects the best AI model for a given task and routing context.
 *
 * Uses a multi-criteria weighted scoring formula that balances task fit,
 * cost efficiency, response latency, and context window size.
 * Weights are adjusted based on the user's chosen routing mode.
 */

import type { ModelSpec, ProviderType, RoutingMode, TaskType } from './modelRegistry';

/** Per-criterion weights used in the scoring formula. All values sum to 1.0. */
export interface ScoringWeights {
  /** Weight for how well the model handles the detected task type (0–1). */
  taskFit: number;
  /** Weight for cost efficiency (lower cost = higher score). */
  cost: number;
  /** Weight for response speed (lower latency tier = higher score). */
  latency: number;
  /** Weight for context window size (larger = higher score). */
  contextSize: number;
}

/** Input context for the scoring engine. */
export interface ScoringContext {
  /** The detected or user-specified task type. */
  task: TaskType;
  /** Routing optimization mode chosen by the user. */
  mode: RoutingMode;
  /** Hard budget cap: models with blendedPer1K above this are excluded. 0 = no limit. */
  maxCostPer1K?: number;
  /** Only include models from these providers. Undefined = all providers allowed. */
  allowedProviders?: ProviderType[];
  /** Estimated prompt length in tokens; filters out models with insufficient context. */
  promptLengthTokens?: number;
}

/** A model paired with its computed score and score breakdown. */
export interface ScoredModel {
  model: ModelSpec;
  /** Final weighted score (0–1). Higher = better match. */
  score: number;
  /** Individual normalized subscores for transparency. */
  breakdown: {
    taskFit: number;
    cost: number;
    latency: number;
    contextSize: number;
    total: number;
  };
}

/**
 * Weight tables for each routing mode.
 * All four weights in each row sum to 1.0.
 */
const MODE_WEIGHTS: Record<RoutingMode, ScoringWeights> = {
  auto:    { taskFit: 0.35, cost: 0.25, latency: 0.20, contextSize: 0.20 },
  quality: { taskFit: 0.55, cost: 0.05, latency: 0.10, contextSize: 0.30 },
  cost:    { taskFit: 0.20, cost: 0.60, latency: 0.10, contextSize: 0.10 },
  speed:   { taskFit: 0.25, cost: 0.15, latency: 0.50, contextSize: 0.10 },
  local:   { taskFit: 0.40, cost: 0.40, latency: 0.10, contextSize: 0.10 },
};

/**
 * Score and rank all candidate models for the given context.
 *
 * Filtering pipeline (applied before scoring):
 * 1. allowedProviders filter
 * 2. local-only filter (when mode = "local")
 * 3. maxCostPer1K budget cap
 * 4. Capability requirements (vision, embeddings)
 * 5. Minimum context window (when promptLengthTokens is provided)
 *
 * @param candidates - The full model registry (or a subset).
 * @param ctx - Scoring context including mode, task, and constraints.
 * @returns Models sorted by descending score. Empty if no models pass filters.
 */
export function scoreModels(candidates: readonly ModelSpec[], ctx: ScoringContext): ScoredModel[] {
  const weights = MODE_WEIGHTS[ctx.mode];

  // ── Step 1: Apply filters ────────────────────────────────────────────────
  let pool = [...candidates];

  if (ctx.allowedProviders && ctx.allowedProviders.length > 0) {
    pool = pool.filter((m) => ctx.allowedProviders!.includes(m.provider));
  }

  if (ctx.mode === 'local') {
    pool = pool.filter((m) => m.capabilities.isLocal);
  }

  if (ctx.maxCostPer1K !== undefined && ctx.maxCostPer1K > 0) {
    pool = pool.filter((m) => m.pricing.blendedPer1K <= ctx.maxCostPer1K!);
  }

  if (ctx.task === 'vision') {
    pool = pool.filter((m) => m.capabilities.supportsVision);
  }

  if (ctx.task === 'embeddings') {
    pool = pool.filter((m) => m.capabilities.supportsEmbeddings);
  }

  if (ctx.promptLengthTokens && ctx.promptLengthTokens > 0) {
    pool = pool.filter((m) => m.capabilities.contextWindow >= ctx.promptLengthTokens!);
  }

  if (pool.length === 0) return [];

  // ── Step 2: Compute normalization denominators ───────────────────────────
  const maxBlended = Math.max(...pool.map((m) => m.pricing.blendedPer1K));
  const maxContext = Math.max(...pool.map((m) => m.capabilities.contextWindow));

  // ── Step 3: Score each model ─────────────────────────────────────────────
  const scored: ScoredModel[] = pool.map((m) => {
    const taskFit = m.taskAffinity[ctx.task] ?? 0.5;

    // costScore: 1.0 = cheapest in pool, 0.0 = most expensive
    const costScore = maxBlended > 0 ? 1 - m.pricing.blendedPer1K / maxBlended : 1;

    // latencyScore: tier 1 → 1.0, tier 2 → 0.5, tier 3 → 0.0
    // Non-linear: tier-3 models (reasoning models) get a hard penalty
    const latencyScore = 1 - (m.latencyTier - 1) / 2;

    const contextScore = maxContext > 0 ? m.capabilities.contextWindow / maxContext : 1;

    const total =
      weights.taskFit * taskFit +
      weights.cost * costScore +
      weights.latency * latencyScore +
      weights.contextSize * contextScore;

    return {
      model: m,
      score: total,
      breakdown: { taskFit, cost: costScore, latency: latencyScore, contextSize: contextScore, total },
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Convenience wrapper: return only the top-scoring model.
 *
 * @param candidates - The full model registry (or a subset).
 * @param ctx - Scoring context.
 * @returns The best-matching ModelSpec, or undefined if no models pass filters.
 */
export function pickBestModel(
  candidates: readonly ModelSpec[],
  ctx: ScoringContext,
): ModelSpec | undefined {
  return scoreModels(candidates, ctx)[0]?.model;
}
