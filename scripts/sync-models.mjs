/**
 * Model Registry Sync — checks each provider's live API against modelRegistry.ts
 * and reports what's stale, missing, or new.
 *
 * Usage:
 *   node scripts/sync-models.mjs
 *
 * Requires API keys in test-real/.env (same file as the integration test).
 * Providers without a key are skipped.
 *
 * What this script CAN do automatically:
 *   - Detect model IDs that exist in registry but no longer exist on the provider
 *   - Detect new model IDs available on the provider that aren't in the registry
 *
 * What still requires manual work:
 *   - Pricing (inputPer1M, outputPer1M) — check provider pricing pages
 *   - Task affinity scores — your judgment call
 *   - Latency tier, context window — check provider docs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env ─────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(__dir, '../test-real/.env');
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    }
  } catch {
    // fall through to process.env
  }
}

loadEnv();

// ── Import registry ───────────────────────────────────────────────────────────

let MODEL_REGISTRY;
try {
  ({ MODEL_REGISTRY } = await import('../dist/nodes/AiRouter/router/modelRegistry.js'));
} catch {
  console.error('Could not import dist/. Run "npm run build" first.');
  process.exit(1);
}

// ── Colors ────────────────────────────────────────────────────────────────────

const R = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

function bar(c = '─', n = 60) { return c.repeat(n); }

// ── Provider fetchers ─────────────────────────────────────────────────────────
// Each returns string[] of model IDs available on the provider right now.

async function fetchGroq(key) {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data.map(m => m.id);
}

async function fetchOpenAI(key) {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Filter to chat/completion models only (exclude embeddings, tts, whisper, dall-e…)
  return data.data
    .map(m => m.id)
    .filter(id => /^(gpt|o\d|chatgpt)/.test(id));
}

async function fetchGoogle(key) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=100`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Strip the "models/" prefix Google includes
  return (data.models ?? [])
    .map(m => m.name.replace(/^models\//, ''))
    .filter(id => id.startsWith('gemini'));
}

async function fetchMistral(key) {
  const res = await fetch('https://api.mistral.ai/v1/models', {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data.map(m => m.id);
}

// Anthropic has no public models list API — mark as manual
async function fetchAnthropic() {
  throw new Error('Anthropic has no models list API — check https://docs.anthropic.com/en/docs/about-claude/models manually');
}

const FETCHERS = {
  groq:      { fn: fetchGroq,      key: process.env.GROQ_API_KEY },
  openai:    { fn: fetchOpenAI,    key: process.env.OPENAI_API_KEY },
  google:    { fn: fetchGoogle,    key: process.env.GOOGLE_API_KEY },
  mistral:   { fn: fetchMistral,   key: process.env.MISTRAL_API_KEY },
  anthropic: { fn: fetchAnthropic, key: process.env.ANTHROPIC_API_KEY },
};

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`\n${BOLD}Model Registry Sync${R}  ${DIM}(checking live provider APIs vs registry)${R}\n`);

let totalIssues = 0;

for (const [provider, { fn, key }] of Object.entries(FETCHERS)) {
  console.log(`${BOLD}${bar()}${R}`);
  console.log(`${BOLD}  ${provider.toUpperCase()}${R}`);
  console.log(bar());

  // Models in registry for this provider
  const inRegistry = MODEL_REGISTRY
    .filter(m => m.provider === provider)
    .map(m => m.id);

  if (inRegistry.length === 0) {
    console.log(`  ${DIM}No models for this provider in registry.${R}\n`);
    continue;
  }

  console.log(`  ${DIM}Registry has ${inRegistry.length} model(s): ${inRegistry.join(', ')}${R}`);

  if (!key) {
    console.log(`  ${YELLOW}⊘ Skipped — no API key configured${R}\n`);
    continue;
  }

  let liveIds;
  try {
    liveIds = await fn(key);
  } catch (err) {
    console.log(`  ${YELLOW}⚠ Cannot auto-check: ${err.message}${R}\n`);
    continue;
  }

  const liveSet = new Set(liveIds);
  const registrySet = new Set(inRegistry);

  // Models in registry that no longer exist on the provider
  const stale = inRegistry.filter(id => !liveSet.has(id));

  // Models on the provider that aren't in the registry (filtered to likely chat models)
  const missing = liveIds.filter(id => !registrySet.has(id));

  if (stale.length === 0 && missing.length === 0) {
    console.log(`  ${GREEN}✓ Registry is up to date${R}\n`);
    continue;
  }

  if (stale.length > 0) {
    totalIssues += stale.length;
    console.log(`\n  ${RED}✗ Stale — in registry but NOT on provider (remove or update these):${R}`);
    for (const id of stale) {
      console.log(`      ${RED}− ${id}${R}`);
    }
  }

  if (missing.length > 0) {
    console.log(`\n  ${CYAN}+ New on provider — not yet in registry (consider adding):${R}`);
    for (const id of missing) {
      console.log(`      ${CYAN}+ ${id}${R}`);
    }
    console.log(`\n  ${DIM}To add one, copy a similar ModelSpec in modelRegistry.ts and fill in:${R}`);
    console.log(`  ${DIM}  pricing, capabilities, latencyTier, taskAffinity${R}`);
    console.log(`  ${DIM}  Pricing pages:${R}`);
    if (provider === 'groq')    console.log(`  ${DIM}    https://console.groq.com/docs/openai/pricing${R}`);
    if (provider === 'openai')  console.log(`  ${DIM}    https://platform.openai.com/docs/pricing${R}`);
    if (provider === 'google')  console.log(`  ${DIM}    https://ai.google.dev/gemini-api/docs/models/gemini${R}`);
    if (provider === 'mistral') console.log(`  ${DIM}    https://mistral.ai/technology/#pricing${R}`);
  }

  console.log('');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`${BOLD}${bar('═')}${R}`);
if (totalIssues === 0) {
  console.log(`${GREEN}${BOLD}All checked providers are in sync.${R}`);
} else {
  console.log(`${RED}${BOLD}${totalIssues} stale model(s) found — update modelRegistry.ts and rebuild.${R}`);
}
console.log(`${bar('═')}\n`);

process.exit(totalIssues > 0 ? 1 : 0);
