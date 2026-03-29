import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class GroqApi implements ICredentialType {
  name = 'groqApi';
  displayName = 'Groq API';
  documentationUrl = 'https://console.groq.com/docs/openai';
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      placeholder: 'gsk_...',
    },
  ];
}
