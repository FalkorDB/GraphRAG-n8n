import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from "n8n-workflow";

import { FalkorDB } from "falkordb";

export class GraphRag implements INodeType {
	description: INodeTypeDescription = {
		displayName: "FalkorDB GraphRAG",
		name: "graphRag",
		icon: "file:falkordb.svg",
		group: ["transform"],
		version: 1,
		subtitle: "={{\\[\"operation\"]}}",
		description: "Query or ingest data in a FalkorDB knowledge graph. " +
			"FalkorDB is a multi-graph database — each graph has a unique name (e.g. NETIT, knowledge_graph). " +
			"When the user mentions a graph name, pass that exact name as graph_name and run the Cypher against it. " +
			"To count all nodes in a graph use: MATCH (n) RETURN count(n) AS nodeCount",
		defaults: { name: "FalkorDB GraphRAG" },
		usableAsTool: true,
		inputs: ["main"],
		outputs: ["main"],
		credentials: [{ name: "falkorDbGraphRagApi", required: true }],
		properties: [
			{
				displayName: "Operation",
				name: "operation",
				type: "options",
				noDataExpression: true,
				options: [
					{ name: "Query Graph", value: "query", description: "Run a Cypher statement and return results", action: "Query the knowledge graph" },
					{ name: "Ingest Document", value: "ingest", description: "Store text as a :Document node", action: "Ingest a document into the knowledge graph" },
				],
				default: "query",
			},
			{
				displayName: "Graph Name",
				name: "graphName",
				type: "string",
				default: '={{ $fromAI("graph_name", "The name of the FalkorDB graph to query. FalkorDB is a multi-graph database — each graph is a separate namespace identified by its name (e.g. NETIT, knowledge_graph). Pass the exact graph name the user mentioned.") }}',
				required: true,
				description: "Name of the FalkorDB graph to query. FalkorDB is a multi-graph database — NETIT, knowledge_graph, etc. are each separate graphs identified by name.",
			},
			{
				displayName: "Query",
				name: "query",
				type: "string",
				typeOptions: { rows: 3 },
				default: '={{ $fromAI("query", "Cypher statement to execute, e.g. MATCH (n) RETURN count(n)") }}',
				description: "Cypher statement to execute. When used as a tool the AI agent fills this automatically.",
				displayOptions: { show: { operation: ["query"] } },
			},
			{
				displayName: "Query Mode",
				name: "queryMode",
				type: "options",
				noDataExpression: true,
				options: [
					{ name: "Cypher (Raw)", value: "cypher", description: "Execute a raw Cypher statement directly" },
					{ name: "Full-text Search", value: "fulltext", description: "Search Document nodes by text" },
				],
				default: "cypher",
				displayOptions: { show: { operation: ["query"] } },
			},
			{
				displayName: "Document Text",
				name: "documentText",
				type: "string",
				typeOptions: { rows: 4 },
				default: '={{ $fromAI("document_text", "The text to store as a document in the graph") }}',
				description: "Text to store. When used as a tool the AI agent fills this automatically.",
				displayOptions: { show: { operation: ["ingest"] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials("falkorDbGraphRagApi");
		const connectOptions = {
			socket: {
				host: credentials.host as string,
				port: credentials.port as number,
				tls: credentials.useTls as boolean,
			},
			...(credentials.username ? { username: credentials.username as string } : {}),
			...(credentials.password ? { password: credentials.password as string } : {}),
		};
		let db: InstanceType<typeof FalkorDB> | undefined;
		try {
			db = await FalkorDB.connect(connectOptions);
			for (let i = 0; i < items.length; i++) {
				const operation = this.getNodeParameter("operation", i) as string;
				const graphName = this.getNodeParameter("graphName", i) as string;
				const graph = db.selectGraph(graphName);
				if (operation === "ingest") {
					const documentText = this.getNodeParameter("documentText", i) as string;
					const safeText = documentText.replace(/'/g, "\\'");
					const docId = 'doc_' + Date.now() + '_' + i;
					const cypher = "MERGE (d:Document {id: '" + docId + "'}) SET d.text = '" + safeText + "', d.ingestedAt = timestamp() RETURN d.id AS id";
					const result = await graph.query(cypher);
					returnData.push({ json: { success: true, documentId: docId, graphName, recordsCreated: result.data?.length ?? 0 }, pairedItem: { item: i } });
				} else if (operation === "query") {
					const queryInput = this.getNodeParameter("query", i) as string;
					const queryMode = this.getNodeParameter("queryMode", i) as string;
					let cypher: string;
					if (queryMode === "fulltext") {
						const safeInput = queryInput.replace(/'/g, "\\'");
						cypher = "CALL db.idx.fulltext.queryNodes('Document', '" + safeInput + "') YIELD node, score RETURN node.id AS id, node.text AS text, score ORDER BY score DESC LIMIT 10";
					} else {
						cypher = queryInput;
					}
					const result = await graph.query(cypher);
					returnData.push({ json: { graphName, query: queryInput, results: result.data ?? [] }, pairedItem: { item: i } });
				} else {
					throw new NodeOperationError(this.getNode(), 'Unknown operation: ' + operation, { itemIndex: i });
				}
			}
		} finally {
			if (db) await db.close();
		}
		return [returnData];
	}
}
