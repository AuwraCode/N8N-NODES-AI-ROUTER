import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class MistralApi implements ICredentialType {
  name = 'mistralApi';
  displayName = 'Mistral AI API';
  documentationUrl = 'https://docs.mistral.ai/api/';
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
    },
  ];
}
