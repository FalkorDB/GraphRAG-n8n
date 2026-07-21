import { ICredentialType, ICredentialTestRequest, INodeProperties } from "n8n-workflow";

export class FalkorDbGraphRagApi implements ICredentialType {
	name = "falkorDbGraphRagApi";
	displayName = "FalkorDB GraphRAG Server API";
	documentationUrl = "https://github.com/FalkorDB/GraphRAG-Server";

	properties: INodeProperties[] = [
		{
			displayName: "Server URL",
			name: "serverUrl",
			type: "string",
			default: "http://localhost:8000",
			required: true,
			placeholder: "http://localhost:8000",
			description: "Base URL of the running GraphRAG-Server instance",
		},
		{
			displayName: "API Token",
			name: "apiToken",
			type: "string",
			typeOptions: { password: true },
			default: "",
			placeholder: "e.g. fkrtok_...",
			description:
				"API token for authentication. Create one from GraphRAG-Server Settings → API Tokens.",
		},
		{
			displayName: "Request Timeout (Seconds)",
			name: "requestTimeoutSeconds",
			type: "number",
			default: 60,
			required: true,
			description: "Maximum time to wait for each server request before aborting",
		},
	];

	authenticate = {
		type: "generic" as const,
		properties: {
			headers: {
				Authorization: "={{$credentials.apiToken ? 'Bearer ' + $credentials.apiToken : ''}}",
				"X-Requested-With": "XMLHttpRequest",
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: "={{$credentials.serverUrl}}",
			url: "/api/ingest/quota",
			method: "GET",
		},
	};
}
