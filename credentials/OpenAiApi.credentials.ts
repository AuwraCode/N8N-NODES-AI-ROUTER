import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class OpenAiApi implements ICredentialType {
  name = 'openAiApi';
  displayName = 'OpenAI API';
  documentationUrl = 'https://platform.openai.com/docs/quickstart';
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      placeholder: 'sk-...',
    },
    {
      displayName: 'Organization ID',
      name: 'organizationId',
      type: 'string',
      default: '',
      description: 'Optional. Used when you belong to multiple organizations.',
      placeholder: 'org-...',
    },
  ];
}
