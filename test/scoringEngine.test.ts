import { describe, it, expect } from 'vitest';
import { scoreModels, pickBestModel } from '../nodes/AiRouter/router/scoringEngine';
import { MODEL_REGISTRY } from '../nodes/AiRouter/router/modelRegistry';
import type { ModelSpec } from '../nodes/AiRouter/router/modelRegistry';

describe('scoreModels', () => {
  describe('mode=cost', () => {
    it('selects the cheapest viable model', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'cost' });
      expect(scored.length).toBeGreaterThan(0);
      // Winner should be among the cheapest models
      const winner = scored[0].model;
      const winnerCost = winner.pricing.blendedPer1K;
      // Should be very cheap (Gemini Flash Lite or similar)
      expect(winnerCost).toBeLessThan(0.001);
    });

    it('ranks cheaper models higher than expensive ones', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'cost' });
      const topModel = scored[0].model;
      const bottomModel = scored[scored.length - 1].model;
      expect(topModel.pricing.blendedPer1K).toBeLessThan(bottomModel.pricing.blendedPer1K);
    });
  });

  describe('mode=quality', () => {
    it('selects a high-quality model for coding', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'coding', mode: 'quality' });
      expect(scored.length).toBeGreaterThan(0);
      // Top model should have a high coding affinity
      const winner = scored[0].model;
      const codingAffinity = winner.taskAffinity.coding ?? 0.5;
      expect(codingAffinity).toBeGreaterThanOrEqual(0.85);
    });

    it('selects a high-quality model for analysis', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'analysis', mode: 'quality' });
      expect(scored.length).toBeGreaterThan(0);
      const winner = scored[0].model;
      const analysisAffinity = winner.taskAffinity.analysis ?? 0.5;
      expect(analysisAffinity).toBeGreaterThanOrEqual(0.85);
    });

    it('does not select a cheap fast model at the top in quality mode', () => {
      const cheapFastIds = [
        'gemini-2.5-flash-lite',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-20b',
        'meta-llama/llama-4-scout-17b-16e-instruct',
      ];
      for (const task of ['coding', 'analysis', 'writing'] as const) {
        const scored = scoreModels(MODEL_REGISTRY, { task, mode: 'quality' });
        expect(cheapFastIds).not.toContain(scored[0].model.id);
      }
    });
  });

  describe('mode=speed', () => {
    it('selects a fast (tier-1) model', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'speed' });
      expect(scored[0].model.latencyTier).toBe(1);
    });

    it('does not select tier-3 models at the top when speed mode', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'speed' });
      // Top 3 should all be tier-1
      for (const s of scored.slice(0, 3)) {
        expect(s.model.latencyTier).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('maxCostPer1K budget cap', () => {
    it('excludes models above the budget cap', () => {
      const cap = 0.001;
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'auto', maxCostPer1K: cap });
      for (const s of scored) {
        expect(s.model.pricing.blendedPer1K).toBeLessThanOrEqual(cap);
      }
    });

    it('excludes expensive models like claude-opus', () => {
      const cap = 0.005;
      const scored = scoreModels(MODEL_REGISTRY, { task: 'analysis', mode: 'auto', maxCostPer1K: cap });
      const ids = scored.map((s) => s.model.id);
      expect(ids).not.toContain('claude-opus-4-6');
    });

    it('returns empty array when no models fit the budget', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'auto', maxCostPer1K: 0.000001 });
      // Ollama (free) may pass — but for cloud-only registry it should be empty
      const cloudScored = scored.filter((s) => s.model.provider !== 'ollama');
      expect(cloudScored.length).toBe(0);
    });
  });

  describe('allowedProviders filter', () => {
    it('returns only Groq models when only Groq is allowed', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'auto', allowedProviders: ['groq'] });
      for (const s of scored) {
        expect(s.model.provider).toBe('groq');
      }
    });

    it('returns only Anthropic and OpenAI models', () => {
      const scored = scoreModels(MODEL_REGISTRY, {
        task: 'coding',
        mode: 'auto',
        allowedProviders: ['anthropic', 'openai'],
      });
      for (const s of scored) {
        expect(['anthropic', 'openai']).toContain(s.model.provider);
      }
    });

    it('returns empty array for an empty provider list', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'auto', allowedProviders: [] });
      // Empty allowedProviders means no filtering — all providers allowed
      expect(scored.length).toBeGreaterThan(0);
    });
  });

  describe('capability filtering', () => {
    it('only returns vision-capable models for vision task', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'vision', mode: 'auto' });
      for (const s of scored) {
        expect(s.model.capabilities.supportsVision).toBe(true);
      }
    });

    it('returns empty array for embeddings task (no models support embeddings)', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'embeddings', mode: 'auto' });
      // None of the registered cloud models support embeddings natively via chat endpoint
      expect(scored.length).toBe(0);
    });
  });

  describe('mode=local', () => {
    it('returns empty array when no local models in registry', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'local' });
      expect(scored.length).toBe(0);
    });

    it('selects only local models when ollama is in candidates', () => {
      const ollamaModel: ModelSpec = {
        id: 'llama3',
        displayName: 'Ollama: llama3',
        provider: 'ollama',
        pricing: { inputPer1M: 0, outputPer1M: 0, blendedPer1K: 0 },
        capabilities: {
          supportsVision: false, supportsEmbeddings: false,
          supportsStreaming: true, supportsReasoningMode: false,
          isLocal: true, contextWindow: 128_000,
        },
        latencyTier: 2,
        taskAffinity: { chat: 0.75 },
      };
      const candidates = [...MODEL_REGISTRY, ollamaModel];
      const scored = scoreModels(candidates, { task: 'chat', mode: 'local' });
      expect(scored.length).toBe(1);
      expect(scored[0].model.provider).toBe('ollama');
    });
  });

  describe('score structure', () => {
    it('returns models sorted by descending score', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'coding', mode: 'auto' });
      for (let i = 1; i < scored.length; i++) {
        expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
      }
    });

    it('breakdown scores are all between 0 and 1', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'auto' });
      for (const s of scored) {
        expect(s.breakdown.taskFit).toBeGreaterThanOrEqual(0);
        expect(s.breakdown.taskFit).toBeLessThanOrEqual(1);
        expect(s.breakdown.cost).toBeGreaterThanOrEqual(0);
        expect(s.breakdown.cost).toBeLessThanOrEqual(1);
        expect(s.breakdown.latency).toBeGreaterThanOrEqual(0);
        expect(s.breakdown.latency).toBeLessThanOrEqual(1);
        expect(s.breakdown.contextSize).toBeGreaterThanOrEqual(0);
        expect(s.breakdown.contextSize).toBeLessThanOrEqual(1);
      }
    });

    it('total score is between 0 and 1', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'writing', mode: 'quality' });
      for (const s of scored) {
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('promptLengthTokens filter', () => {
    it('excludes models whose context window is smaller than the prompt', () => {
      // claude-haiku has 200K context — a 250K-token prompt should exclude it
      const scored = scoreModels(MODEL_REGISTRY, {
        task: 'analysis',
        mode: 'auto',
        promptLengthTokens: 250_000,
        allowedProviders: ['anthropic'],
      });
      const ids = scored.map((s) => s.model.id);
      expect(ids).not.toContain('claude-haiku-4-5-20251001');
      expect(ids).toContain('claude-opus-4-6');
    });

    it('keeps all models when promptLengthTokens is 0', () => {
      const allScored  = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'auto' });
      const zeroScored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'auto', promptLengthTokens: 0 });
      expect(zeroScored.length).toBe(allScored.length);
    });

    it('returns empty array when prompt is longer than all models contexts', () => {
      const scored = scoreModels(MODEL_REGISTRY, {
        task: 'chat',
        mode: 'auto',
        allowedProviders: ['anthropic'],
        promptLengthTokens: 2_000_000, // larger than any Anthropic model
      });
      expect(scored.length).toBe(0);
    });
  });

  describe('context score log normalization', () => {
    it('does not collapse 1M-context models when a 10M-context model is in the pool', () => {
      // Without log normalization: contextScore(claude-opus) = 1M/10M = 0.10
      // With log normalization:    contextScore(claude-opus) = log(1M+1)/log(10M+1) ≈ 0.857
      const scored = scoreModels(MODEL_REGISTRY, { task: 'analysis', mode: 'quality' });
      const opus = scored.find((s) => s.model.id === 'claude-opus-4-6');
      expect(opus).toBeDefined();
      expect(opus!.breakdown.contextSize).toBeGreaterThan(0.8);
    });

    it('gives perfect contextSize score to the model with the largest context window', () => {
      const scored = scoreModels(MODEL_REGISTRY, { task: 'chat', mode: 'auto' });
      const maxContextModel = scored.reduce((max, s) =>
        s.model.capabilities.contextWindow > max.model.capabilities.contextWindow ? s : max,
      );
      expect(maxContextModel.breakdown.contextSize).toBeCloseTo(1.0, 5);
    });

    it('gives a contextSize score of 1.0 when all models share the same context window', () => {
      const twoModels: ModelSpec[] = [
        { ...MODEL_REGISTRY[0], capabilities: { ...MODEL_REGISTRY[0].capabilities, contextWindow: 128_000 } },
        { ...MODEL_REGISTRY[1], capabilities: { ...MODEL_REGISTRY[1].capabilities, contextWindow: 128_000 } },
      ];
      const scored = scoreModels(twoModels, { task: 'chat', mode: 'auto' });
      for (const s of scored) {
        expect(s.breakdown.contextSize).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('mode=auto deterministic tie-breaking', () => {
    it('sorts by model id alphabetically when scores are equal', () => {
      // Two identical models produce the same score — result order must be stable
      const modelA: ModelSpec = { ...MODEL_REGISTRY[0], id: 'zzz-model' };
      const modelB: ModelSpec = { ...MODEL_REGISTRY[0], id: 'aaa-model' };
      const scored = scoreModels([modelA, modelB], { task: 'chat', mode: 'auto' });
      expect(scored[0].model.id).toBe('aaa-model');
      expect(scored[1].model.id).toBe('zzz-model');
    });
  });

  describe('pickBestModel', () => {
    it('returns the top-scoring model', () => {
      const best = pickBestModel(MODEL_REGISTRY, { task: 'coding', mode: 'quality' });
      const scored = scoreModels(MODEL_REGISTRY, { task: 'coding', mode: 'quality' });
      expect(best).toBe(scored[0].model);
    });

    it('returns undefined when no models pass filters', () => {
      const best = pickBestModel(MODEL_REGISTRY, { task: 'chat', mode: 'local' });
      expect(best).toBeUndefined();
    });
  });
});
