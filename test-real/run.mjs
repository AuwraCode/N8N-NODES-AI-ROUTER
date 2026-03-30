/**
 * Real end-to-end test for n8n-nodes-ai-router.
 *
 * Usage:
 *   1. npm run build          (from project root)
 *   2. cp test-real/.env.example test-real/.env
 *   3. Fill in your API keys in test-real/.env
 *   4. node test-real/run.mjs
 *
 * Only providers with a key in .env will be tested. All others are skipped.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env ─────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(__dir, '.env');
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    }
  } catch {
    console.warn('No test-real/.env found — using process environment variables.\n');
  }
}

loadEnv();

// ── Import built dist ─────────────────────────────────────────────────────────

let detectTask, scoreModels, MODEL_REGISTRY, executeWithFallback, callModel;

try {
  ({ detectTask }         = await import('../dist/nodes/AiRouter/router/taskDetector.js'));
  ({ scoreModels }        = await import('../dist/nodes/AiRouter/router/scoringEngine.js'));
  ({ MODEL_REGISTRY }     = await import('../dist/nodes/AiRouter/router/modelRegistry.js'));
  ({ executeWithFallback } = await import('../dist/nodes/AiRouter/router/fallbackChain.js'));
  ({ callModel }          = await import('../dist/nodes/AiRouter/router/providerAdapters.js'));
} catch (e) {
  console.error('Could not import dist/. Did you run "npm run build" first?\n', e.message);
  process.exit(1);
}

// ── Credentials from env ──────────────────────────────────────────────────────

const creds = {
  anthropic:    process.env.ANTHROPIC_API_KEY || undefined,
  openai:       process.env.OPENAI_API_KEY    || undefined,
  google:       process.env.GOOGLE_API_KEY    || undefined,
  mistral:      process.env.MISTRAL_API_KEY   || undefined,
  groq:         process.env.GROQ_API_KEY      || undefined,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL  || undefined,
};

const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';

const configuredProviders = [
  creds.anthropic   && 'anthropic',
  creds.openai      && 'openai',
  creds.google      && 'google',
  creds.mistral     && 'mistral',
  creds.groq        && 'groq',
  (creds.ollamaBaseUrl || process.env.OLLAMA_MODEL) && 'ollama',
].filter(Boolean);

if (configuredProviders.length === 0) {
  console.error('No API keys found. Fill in test-real/.env and try again.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RED    = '\x1b[31m';

function bar(char = '─', len = 60) { return char.repeat(len); }
function truncate(str, max = 400) { return str.length > max ? str.slice(0, max) + '…' : str; }

// ── Phase 1: Credential validation ───────────────────────────────────────────
// Ping one cheap model per provider to confirm the key actually works.

// Cheapest/fastest model to use for the ping per provider
const PING_MODELS = {
  anthropic: 'claude-haiku-4-5',
  openai:    'gpt-4o-mini',
  google:    'gemini-2.5-flash-lite',
  mistral:   'mistral-small-3.1-2503',
  groq:      'llama-3.3-70b-versatile',
  ollama:    ollamaModel,
};

const PING_PROMPT = 'Reply with exactly one word: ok';

console.log(`\n${BOLD}n8n-nodes-ai-router — Real Integration Test${RESET}`);
console.log(`${bar()}`);
console.log(`${BOLD}Phase 1: Credential validation${RESET}\n`);

const validProviders = [];

for (const provider of configuredProviders) {
  const modelId = PING_MODELS[provider];
  let spec = MODEL_REGISTRY.find(m => m.id === modelId && m.provider === provider);

  // Ollama uses a dynamic model ID
  if (provider === 'ollama') {
    spec = MODEL_REGISTRY.find(m => m.provider === 'ollama');
    if (spec) spec = { ...spec, id: ollamaModel };
  }

  if (!spec) {
    console.log(`  ${YELLOW}?${RESET} ${provider.padEnd(10)} model '${modelId}' not found in registry, skipping`);
    continue;
  }

  try {
    const r = await callModel(spec, PING_PROMPT, creds, { maxTokens: 10 });
    console.log(`  ${GREEN}✓${RESET} ${provider.padEnd(10)} key valid  ${DIM}(model: ${spec.id}, response: "${r.text.trim()}")${RESET}`);
    validProviders.push(provider);
  } catch (err) {
    console.log(`  ${RED}✗${RESET} ${provider.padEnd(10)} key INVALID — ${err.message}`);
  }
}

if (validProviders.length === 0) {
  console.error(`\n${RED}All credential checks failed. Fix your API keys and retry.${RESET}`);
  process.exit(1);
}

console.log(`\n${DIM}Proceeding with valid providers: ${validProviders.join(', ')}${RESET}\n`);

// ── Phase 2: Routing scenarios ────────────────────────────────────────────────

const SCENARIOS = [
  {
    label: 'Coding task',
    prompt: 'Write a TypeScript function that debounces a callback with a configurable delay.',
    mode: 'auto',
  },
  {
    label: 'Summarization task',
    prompt: 'Summarize this in 3 bullet points: The James Webb Space Telescope has revealed thousands of early galaxies that challenge existing models of cosmic formation. Observations show galaxies existing just 300 million years after the Big Bang, far more developed than expected.',
    mode: 'cost',
  },
  {
    label: 'Classification task',
    prompt: 'Classify the sentiment of this review as positive, negative, or neutral: "The product arrived on time but the packaging was damaged. The item itself works fine."',
    mode: 'speed',
  },
  {
    label: 'Writing task — quality mode',
    prompt: 'Write a short, compelling product description for a noise-cancelling headphone aimed at remote workers.',
    mode: 'quality',
  },
  {
    label: 'Analysis task',
    prompt: 'Analyze the trade-offs between microservices and monolithic architecture for a startup with a 3-person engineering team.',
    mode: 'auto',
  },
  {
    label: 'Anthropic only — verify routing to specific provider',
    prompt: 'Explain what makes a good API design in two sentences.',
    mode: 'quality',
    forceProviders: ['anthropic'],  // ignored if anthropic key invalid
  },
];

console.log(`${BOLD}Phase 2: Routing scenarios${RESET}\n`);

// Patch Ollama placeholder model ID if ollama is active
if (validProviders.includes('ollama')) {
  const ollamaSpec = MODEL_REGISTRY.find(m => m.provider === 'ollama');
  if (ollamaSpec) ollamaSpec.id = ollamaModel;
}

let passed = 0;
let failed = 0;
let skipped = 0;

for (const scenario of SCENARIOS) {
  const providers = scenario.forceProviders
    ? scenario.forceProviders.filter(p => validProviders.includes(p))
    : validProviders;

  console.log(`${BOLD}${bar()}${RESET}`);
  console.log(`${BOLD}  ${scenario.label}${RESET}  ${DIM}[mode: ${scenario.mode}]${RESET}`);
  if (scenario.forceProviders) {
    console.log(`  ${DIM}Forced providers: ${scenario.forceProviders.join(', ')}${RESET}`);
  }
  console.log(`${bar()}`);

  if (providers.length === 0) {
    console.log(`${YELLOW}⊘ Skipped${RESET} — required provider(s) not valid: ${scenario.forceProviders?.join(', ')}\n`);
    skipped++;
    continue;
  }

  console.log(`${DIM}Prompt:${RESET} ${truncate(scenario.prompt, 120)}\n`);

  const detection = detectTask(scenario.prompt);
  console.log(`${YELLOW}Task detected:${RESET} ${detection.primaryTask} (confidence: ${detection.confidence.toFixed(2)})`);

  const ranked = scoreModels(MODEL_REGISTRY, {
    task: detection.primaryTask,
    mode: scenario.mode,
    maxCostPer1K: 0,
    allowedProviders: providers,
  });

  if (ranked.length === 0) {
    console.log(`${RED}✗ No models available.${RESET}\n`);
    failed++;
    continue;
  }

  console.log(`${YELLOW}Top 3 candidates:${RESET}`);
  ranked.slice(0, 3).forEach(({ model: m, score }, i) => {
    const marker = i === 0 ? '→' : ' ';
    console.log(`  ${marker} ${m.displayName} ${DIM}(${m.provider}, $${m.pricing.blendedPer1K}/1K, score: ${score.toFixed(3)})${RESET}`);
  });

  const rankedModels = ranked.map(s => s.model);
  console.log(`\n${YELLOW}Calling: ${rankedModels[0].displayName}…${RESET}`);
  const start = Date.now();

  try {
    const result = await executeWithFallback(rankedModels, scenario.prompt, creds, {}, {
      maxAttempts: 3,
      onFallback: (from, to, err) => {
        console.log(`  ${RED}Fallback:${RESET} ${from.displayName} failed (${err.message}) → trying ${to.displayName}`);
      },
    });

    const elapsed = Date.now() - start;
    const m = result.modelUsed;
    const r = result.response;

    console.log(`${GREEN}✓ Success${RESET} via ${BOLD}${m.displayName}${RESET} (${m.provider}) in ${elapsed}ms`);
    if (r.inputTokens != null) console.log(`  Tokens: ${r.inputTokens} in / ${r.outputTokens} out`);
    if (result.attemptsTaken > 1) console.log(`  Attempts: ${result.attemptsTaken}`);
    console.log(`\n${DIM}Response:${RESET}\n${truncate(r.text)}\n`);
    passed++;

  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`${RED}✗ Failed after ${elapsed}ms: ${err.message}${RESET}\n`);
    failed++;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`${BOLD}${bar('═')}${RESET}`);
const skipNote = skipped > 0 ? `, ${YELLOW}${skipped} skipped${RESET}` : '';
console.log(`${BOLD}Results: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ''}${failed} failed${RESET}${skipNote}`);
console.log(`${bar('═')}\n`);

process.exit(failed > 0 ? 1 : 0);
