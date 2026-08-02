import { ICredentialType, ICredentialTestRequest, INodeProperties, Icon } from "n8n-workflow";

export class FalkorDbGraphRagApi implements ICredentialType {
	name = "falkorDbGraphRagApi";
	displayName = "FalkorDB GraphRAG Server API";
	documentationUrl = "https://github.com/FalkorDB/GraphRAG-Server";
	// n8n requires credentials to declare an icon. Point at the node's copy rather
	// than duplicating the files: the path resolves the same way from the source
	// tree and from dist/, since dist mirrors the source layout.
	icon: Icon = {
		light: "file:../nodes/GraphRagAction/F.svg",
		dark: "file:../nodes/GraphRagAction/F.dark.svg",
	};

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
			placeholder: "e.g. grag_...",
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
				Authorization: "={{$credentials.apiToken ? 'Bearer ' + $credentials.apiToken : undefined}}",
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
