import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FalkorDbGraphRagApi implements ICredentialType {
	name = 'falkorDbGraphRagApi';
	displayName = 'FalkorDB GraphRAG Server';
	documentationUrl = 'https://github.com/FalkorDB/GraphRAG-Server';

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'string',
			default: 'http://localhost:8000',
			required: true,
			placeholder: 'http://localhost:8000',
			description: 'Base URL of the running GraphRAG-Server instance',
		},
		{
			displayName: 'Bearer Token',
			name: 'bearerToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Bearer token for authentication (leave blank if auth_disabled=true on the server)',
		},
	];
}
