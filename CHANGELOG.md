# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.6] - 2026-04-02

### Added
- **System Prompt** parameter — optional system-level instruction passed to all providers; supports personas, output format rules, and domain constraints
- **Temperature** parameter (0–2, default 0.7) — ignored automatically by reasoning models (o3, o4-mini, Claude Opus extended thinking)
- **Dry Run** toggle — runs the full routing pipeline but skips the API call; returns `selectedModel`, `selectedScore`, `detectedTask`, `detectedTaskConfidence`, and `scoreBreakdown` without spending any tokens
- **Include Detected Task** output option — adds `detectedTask` and `detectedTaskConfidence` to output JSON
- **Include Score Breakdown** output option — adds `scoreBreakdown` array (top-3 candidates) with final score and per-criterion sub-scores (`taskFit`, `cost`, `latency`, `contextSize`)
- **Include Estimated Cost** output option — adds `estimatedCostUSD` calculated from actual token counts × registry pricing
- New models added to registry: `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `mistral-medium-3`, `mistral-small-4-0-26-03`, `devstral-2-25-12`, `o4-mini`, `moonshotai/kimi-k2-instruct`, `qwen/qwen3-32b`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`

### Fixed
- **Quality mode now reliably selects flagship models** — context score switched from linear to log normalization, preventing a single 10M-context model (Llama 4 Scout) from collapsing all 1M-context models to a score of 0.1
- **Quality mode weights rebalanced** — `taskFit` raised from 0.55 → 0.70, `contextSize` reduced from 0.30 → 0.20, `latency` reduced from 0.10 → 0.05, so model specialisation dominates mode selection
- **Ollama Base URL** node parameter now takes effect — previously defined in the UI but only the credential value was read; node parameter now overrides the credential value when set

## [0.1.5] - 2026-03-31

### Added
- **Max Items Per Execution** parameter (default `10`) — hard cap on input items processed per execution run; prevents accidental API cost drain from large batches or runaway loops; set to `0` to disable

## [0.1.4] - 2026-03-30

### Fixed
- Anthropic requests no longer hang indefinitely — the request timeout now correctly catches `AbortError` in Node.js environments (Node.js/undici throws a plain `Error` with `name: 'AbortError'`, not a browser `DOMException`)
- `max_tokens` is now always included in Anthropic API requests — it is required by the Anthropic API; previously omitting it caused silent `400` errors
- Anthropic responses from reasoning-capable models (e.g. `claude-opus-4-6`) are now parsed correctly — the text block is located by `type` field rather than by array position, so a leading `thinking` block no longer causes the response text to be discarded

## [0.1.3] - 2026-03-30

Internal build — superseded by v0.1.4.

## [0.1.2] - 2026-03-29

Initial public release. See [0.1.0] for full feature list.

## [0.1.0] - 2026-03-29

### Added

- Initial release of `n8n-nodes-ai-router`
- **AI Router node** with 5 routing modes: `auto`, `cost`, `quality`, `speed`, `local`
- **Model Registry** with cloud models across 5 providers:
  - Anthropic: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
  - OpenAI: `gpt-4.1`, `gpt-4o`, `o3`, `gpt-4o-mini`
  - Google: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`
  - Mistral AI: `mistral-large-2512`, `mistral-medium-3`, `mistral-small-4-0-26-03`, `devstral-2-25-12`
  - Groq: `llama-3.3-70b-versatile`, `meta-llama/llama-4-scout-17b-16e-instruct`
  - Ollama: dynamic local model support
- **Heuristic task detection** across 8 task types (`coding`, `writing`, `analysis`, `summarization`, `classification`, `vision`, `embeddings`, `chat`) — no external API calls, purely local regex matching
- **Multi-criteria scoring engine** with per-mode configurable weights (`taskFit`, `cost`, `latency`, `contextSize`)
- **Automatic fallback chain** — retries with the next-best model on retriable errors (429, 5xx, network); stops immediately on non-retriable errors (400, 401, 403)
- **Budget cap** parameter (`maxCostPer1k`) — hard-filters models above the configured blended cost per 1K tokens
- **Provider allowlist** (`allowedProviders`) — restricts routing to selected providers
- **Task hint** parameter — override automatic task detection with a specific task type
- **Output model info** option — exposes `modelUsed`, `providerUsed`, `attemptsTaken`, and token counts in the output JSON
- Single credential object for all providers — leave unused keys blank; the router skips providers with no key
- Full TypeScript strict mode
- Vitest unit test suite covering scoring, task detection, and fallback chain
- GitHub Actions CI/CD with npm provenance support
