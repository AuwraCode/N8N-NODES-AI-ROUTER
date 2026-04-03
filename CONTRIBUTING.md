# Contributing to n8n-nodes-ai-router

Thank you for contributing! This guide covers the essentials.

## Getting started

```bash
git clone https://github.com/AuwraCode/N8N-NODES-AI-ROUTER.git
cd n8n-nodes-ai-router
npm install
npm run build
npm test
```

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

Types: feat | fix | docs | chore | refactor | test | ci
Scope (optional): registry | detector | scoring | adapters | fallback | node

Examples:
  feat(registry): add Cohere Command R+ model
  fix(adapters): handle Anthropic 529 overloaded error
  docs: update model table with Gemini 2.5 pricing
  chore: bump vitest to v4
```

## Adding a new model

1. Open `nodes/AiRouter/router/modelRegistry.ts`
2. Add a new `ModelSpec` object to `MODEL_REGISTRY`:

```typescript
{
  id: 'provider-model-id',          // Exact API model ID
  provider: 'openai',               // One of the ProviderType values
  displayName: 'Model Display Name',
  pricing: {
    inputPer1M: 1.00,               // USD per 1M input tokens
    outputPer1M: 4.00,              // USD per 1M output tokens
    blendedPer1K: 0.0019,           // (input*0.7 + output*0.3) / 1000
  },
  capabilities: {
    supportsVision: false,
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsReasoningMode: false,
    isLocal: false,
    contextWindow: 128_000,
  },
  latencyTier: 1,                   // 1=fast, 2=moderate, 3=slow
  taskAffinity: {
    chat: 0.85,
    coding: 0.80,
    // Only include tasks where this model excels
  },
},
```

3. If it's a new **provider**, also add:
   - A credential file in `credentials/`
   - An adapter function in `nodes/AiRouter/router/providerAdapters.ts`
   - Register the credential in `AiRouter.node.ts`
   - Add to the `allowedProviders` multiOptions list

4. Update the model table in `README.md`
5. Include a pricing source URL as a comment in the registry entry

## Adding a new provider

1. Create `credentials/NewProviderApi.credentials.ts`
2. Add an adapter in `providerAdapters.ts` following the existing pattern
3. Add the credential reference in `AiRouter.node.ts` (`credentials` array + credential resolution loop)
4. Add the provider to the `allowedProviders` multiOptions list in `AiRouter.node.ts`
5. Add the provider to `ProviderType` in `modelRegistry.ts`
6. Write tests in `test/fallbackChain.test.ts` for error handling

## Development workflow

```bash
npm run dev        # Watch mode compilation
npm run lint       # Check for lint errors
npm run lint:fix   # Auto-fix lint errors
npm test           # Run all tests
npm run test:watch # Watch mode tests
```

## Testing in a local n8n instance

```bash
# Build the package
npm run build

# Link to your n8n custom nodes directory
cd ~/.n8n/nodes
npm install /path/to/n8n-nodes-ai-router

# Restart n8n — the "AI Router" node will appear in the palette
```

## Pull request checklist

- [ ] Tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Linting passes (`npm run lint`)
- [ ] Follows conventional commits format
- [ ] README updated if adding models or parameters
- [ ] No hardcoded API keys or secrets

## Releasing (maintainers only)

1. Update `CHANGELOG.md`
2. Bump version in `package.json`
3. Commit: `chore: release vX.Y.Z`
4. Tag: `git tag vX.Y.Z && git push --tags`
5. GitHub Actions will automatically publish to npm
