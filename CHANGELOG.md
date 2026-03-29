# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-29

### Added

- Initial release of `n8n-nodes-ai-router`
- **AI Router node** with 5 routing modes: auto, cost, quality, speed, local
- **Model Registry** with 17 cloud models across 5 providers:
  - Anthropic: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
  - OpenAI: gpt-4.1, gpt-4o, o3, gpt-4o-mini
  - Google: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite
  - Mistral AI: mistral-large-2512, mistral-medium-3, mistral-small-creative, devstral-2
  - Groq: llama-3.3-70b-versatile, llama-4-scout-17b-16e-instruct, llama-4-maverick-17b-128e-instruct
  - Ollama: dynamic local model support
- **Heuristic task detection** across 8 task types without external API calls
- **Multi-criteria scoring engine** with configurable mode weights
- **Automatic fallback chain** with retriability-based error handling
- **Budget cap** parameter (`maxCostPer1k`) to hard-filter expensive models
- **Provider allowlist** to restrict which providers are used
- **Output model info** option to expose routing decisions in the output JSON
- Credential definitions for all 5 cloud providers
- Full TypeScript strict mode
- Vitest unit test suite
- GitHub Actions CI/CD with npm provenance support
