import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FalkorDbGraphRagApi implements ICredentialType {
	name = 'falkorDbGraphRagApi';
	displayName = 'FalkorDB GraphRAG API';
	documentationUrl = 'https://docs.falkordb.com/genai-tools/graphrag-sdk.html';

	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: 'localhost',
			required: true,
			placeholder: 'localhost',
			description: 'Hostname or IP of the FalkorDB server',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 6379,
			required: true,
			description: 'Port of the FalkorDB server (default: 6379)',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Password / ACL password for the FalkorDB server (leave blank if none)',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			description: 'ACL username (leave blank to use the default user)',
		},
		{
			displayName: 'Use TLS',
			name: 'useTls',
			type: 'boolean',
			default: false,
			description: 'Whether to connect using TLS/SSL',
		},
	];
}
