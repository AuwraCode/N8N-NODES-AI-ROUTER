## Summary

<!-- Describe the changes in this PR in 1-3 sentences. -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] New model/provider (addition to `modelRegistry.ts`)
- [ ] Breaking change (fix or feature that changes existing behavior)
- [ ] Documentation update

## For new model additions

- [ ] Added entry to `MODEL_REGISTRY` in `modelRegistry.ts`
- [ ] Pricing verified from official provider documentation (include link below)
- [ ] Capabilities (vision, streaming, reasoning mode) are accurate
- [ ] Updated model table in `README.md`
- [ ] Added pricing source URL as a comment in the registry entry

Pricing source: <!-- URL to official pricing page -->

## Testing

- [ ] Unit tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Linting passes (`npm run lint`)
- [ ] Manually tested in a local n8n instance (if applicable)

## Checklist

- [ ] Follows [conventional commits](https://www.conventionalcommits.org/) format
- [ ] No API keys or secrets are included
- [ ] No `console.log` statements left in production code
