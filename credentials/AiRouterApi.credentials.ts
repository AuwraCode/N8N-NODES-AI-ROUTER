import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class AiRouterApi implements ICredentialType {
  name = 'aiRouterApi';
  displayName = 'AI Router Credentials API';
  icon = 'file:aiRouter.svg' as const;
  documentationUrl = 'https://github.com/your-org/n8n-nodes-ai-router#credentials-setup';
  properties: INodeProperties[] = [
    {
      displayName: 'Anthropic API Key',
      name: 'anthropicApiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      placeholder: 'sk-ant-...',
      description: 'Get your key at console.anthropic.com. Leave blank to skip Anthropic.',
    },
    {
      displayName: 'OpenAI API Key',
      name: 'openAiApiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      placeholder: 'sk-...',
      description: 'Get your key at platform.openai.com. Leave blank to skip OpenAI.',
    },
    {
      displayName: 'Google Gemini API Key',
      name: 'googleApiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      placeholder: 'AIza...',
      description: 'Get your key at aistudio.google.com. Leave blank to skip Google.',
    },
    {
      displayName: 'Mistral AI API Key',
      name: 'mistralApiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Get your key at console.mistral.ai. Leave blank to skip Mistral.',
    },
    {
      displayName: 'Groq API Key',
      name: 'groqApiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      placeholder: 'gsk_...',
      description: 'Get your key at console.groq.com (free tier available). Leave blank to skip Groq.',
    },
    {
      displayName: 'Ollama Base URL',
      name: 'ollamaBaseUrl',
      type: 'string',
      default: 'http://localhost:11434',
      description: 'URL of your local Ollama instance. Leave as default if running locally.',
    },
  ];
}
