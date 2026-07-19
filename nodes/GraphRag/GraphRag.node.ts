import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from "n8n-workflow";

import { GraphRagClient, IngestOptions, QueryOptions } from "../../src/GraphRagClient";

/**
 * Shared advanced ingest fields (shown when Advanced Options is enabled).
 * Appended to both Ingest Text and Ingest GitHub Repo operations.
 */
const ADVANCED_INGEST_FIELDS = [
	{
		displayName: "Chunking Strategy",
		name: "chunkingStrategy",
		type: "options" as const,
		options: [
			{ name: "Sentence Token Cap (Default)", value: "sentence_token_cap" },
			{ name: "Fixed Size", value: "fixed_size" },
		],
		default: "sentence_token_cap",
		description: "How the server splits the document into chunks",
		displayOptions: {
			show: { operation: ["ingest", "ingestGithub"], showAdvanced: [true] },
		},
	},
	{
		displayName: "Max Tokens Per Chunk",
		name: "maxTokens",
		type: "number" as const,
		default: 256,
		description: "Maximum tokens per chunk (64–2048). Used with sentence_token_cap.",
		displayOptions: {
			show: {
				operation: ["ingest", "ingestGithub"],
				chunkingStrategy: ["sentence_token_cap"],
				showAdvanced: [true],
			},
		},
	},
	{
		displayName: "Overlap Sentences",
		name: "overlapSentences",
		type: "number" as const,
		default: 1,
		description: "Sentences of overlap between consecutive chunks (0–10)",
		displayOptions: {
			show: {
				operation: ["ingest", "ingestGithub"],
				chunkingStrategy: ["sentence_token_cap"],
				showAdvanced: [true],
			},
		},
	},
	{
		displayName: "Chunk Size (Tokens)",
		name: "chunkSize",
		type: "number" as const,
		default: 1000,
		description: "Tokens per chunk (100–5000). Used with fixed_size.",
		displayOptions: {
			show: {
				operation: ["ingest", "ingestGithub"],
				chunkingStrategy: ["fixed_size"],
				showAdvanced: [true],
			},
		},
	},
	{
		displayName: "Chunk Overlap (Tokens)",
		name: "chunkOverlap",
		type: "number" as const,
		default: 100,
		description: "Overlap tokens between fixed-size chunks (0–500)",
		displayOptions: {
			show: {
				operation: ["ingest", "ingestGithub"],
				chunkingStrategy: ["fixed_size"],
				showAdvanced: [true],
			},
		},
	},
	{
		displayName: "Resolution Strategy",
		name: "resolutionStrategy",
		type: "options" as const,
		options: [
			{ name: "Exact (Default)", value: "exact" },
			{ name: "Description Merge", value: "description_merge" },
			{ name: "Semantic", value: "semantic" },
			{ name: "LLM Verified", value: "llm_verified" },
			{ name: "All", value: "all" },
		],
		default: "exact",
		description: "How the server resolves duplicate entities across chunks",
		displayOptions: {
			show: { operation: ["ingest", "ingestGithub"], showAdvanced: [true] },
		},
	},
	{
		displayName: "Entity Types",
		name: "entityTypes",
		type: "string" as const,
		default: "",
		description:
			"Comma-separated list of entity types to extract (e.g. Person,Organization). Leave blank to extract all types.",
		displayOptions: {
			show: { operation: ["ingest", "ingestGithub"], showAdvanced: [true] },
		},
	},
];

export class GraphRag implements INodeType {
	description: INodeTypeDescription = {
		displayName: "FalkorDB Graph RAG Tool",
		name: "graphRag",
		icon: "file:falkordb-f.svg",
		group: ["transform"],
		version: 1,
		description:
			"Query or ingest data in a FalkorDB Graph RAG knowledge graph. " +
			"Use 'Ask Question' to answer questions from the knowledge graph. " +
			"Use 'Ingest Text' to add plain text or markdown. " +
			"Use 'Ingest GitHub Repo' to ingest all markdown files from a GitHub repository URL. " +
			"Use 'List Documents' to see what has been ingested.",
		defaults: { name: "FalkorDB Graph RAG Tool" },
		inputs: [],
		outputs: ["ai_tool"],
		credentials: [{ name: "falkorDbGraphRagApi", required: true }],
		properties: [
			// ── Graph Name ───────────────────────────────────────────────────────────────
			{
				displayName: "Graph Name",
				name: "graphName",
				type: "string",
				default: "",
				placeholder: "e.g. knowledge_graph",
				description:
					"Name of the graph to operate on. Leave blank to use your default graph. On hosted FalkorDB GraphRAG, this selects among graphs owned by your API token; on self-hosted, this is the direct graph name.",
			},
			// ── Operation ─────────────────────────────────────────────────────────
			{
				displayName: "Operation",
				name: "operation",
				type: "options",
				noDataExpression: true,
				options: [
					{
						name: "Ask Question",
						value: "question",
						description:
							"Ask a natural-language question; the server answers from its knowledge graph",
						action: "Ask a question to the knowledge graph",
					},
					{
						name: "Ingest Text",
						value: "ingest",
						description: "Send plain text or markdown to ingest into the knowledge graph",
						action: "Ingest a text document",
					},
					{
						name: "Ingest GitHub Repo",
						value: "ingestGithub",
						description: "Ingest all markdown files from a public GitHub repository URL",
						action: "Ingest a GitHub repository",
					},
					{
						name: "List Documents",
						value: "listDocuments",
						description: "List all documents that have been ingested into the knowledge graph",
						action: "List ingested documents",
					},
				],
				default: "question",
			},

			// ── Ask Question ─────────────────────────────────────────────────────
			{
				displayName: "Question",
				name: "questionText",
				type: "string",
				typeOptions: { rows: 3 },
				default:
					'={{ $fromAI("question", "Natural-language question to ask the knowledge graph. Only use this for questions, never for ingesting URLs or text.") }}',
				description: "The question to ask. The server answers using its LLM and knowledge graph.",
				displayOptions: { show: { operation: ["question"] } },
			},
			{
				displayName: "Response Mode",
				name: "responseMode",
				type: "options",
				options: [
					{ name: "Answer", value: "answer" },
					{ name: "Retrieve Only", value: "retrieveOnly" },
				],
				default: "answer",
				description:
					"Answer returns the server-generated answer. Retrieve only returns ranked context documents for your own downstream chat model.",
				displayOptions: { show: { operation: ["question"] } },
			},
			{
				displayName: "Retrieval Strategy",
				name: "queryStrategy",
				type: "options",
				options: [
					{ name: "Auto (Default)", value: "auto" },
					{ name: "Local — Fast, Single-Hop", value: "local" },
					{ name: "Multi-Path — Deeper, Multi-Hop", value: "multi_path" },
				],
				default: "auto",
				description: "How the server retrieves context. Auto picks the best strategy.",
				displayOptions: { show: { operation: ["question"] } },
			},

			// ── Ingest Text ──────────────────────────────────────────────────────
			{
				displayName: "Document Text",
				name: "documentText",
				type: "string",
				typeOptions: { rows: 6 },
				default:
					'={{ $fromAI("document_text", "The plain text or markdown content to ingest into the knowledge graph") }}',
				description: "Text to ingest. Supports plain text and markdown.",
				displayOptions: { show: { operation: ["ingest"] } },
			},
			{
				displayName: "Filename",
				name: "filename",
				type: "string",
				default: "document.txt",
				description: "Filename hint for the server. Use .txt for plain text, .md for markdown.",
				displayOptions: { show: { operation: ["ingest"] } },
			},

			// ── Ingest GitHub Repo ──────────────────────────────────────────────
			{
				displayName: "GitHub Repo URL",
				name: "githubUrl",
				type: "string",
				default:
					'={{ $fromAI("github_url", "Public GitHub repository URL to ingest, e.g. https://github.com/owner/repo") }}',
				description:
					"URL of the public GitHub repository (e.g. https://github.com/FalkorDB/GraphRAG-SDK). Discovers and ingests all .md files.",
				displayOptions: { show: { operation: ["ingestGithub"] } },
			},
			{
				displayName: "Branch / Tag / Commit",
				name: "githubRef",
				type: "string",
				default: "",
				description: "Branch, tag, or commit SHA (leave blank for the default branch)",
				displayOptions: { show: { operation: ["ingestGithub"] } },
			},

			// ── Advanced ingest options (shared) ──────────────────────────────────
			{
				displayName: "Advanced Options",
				name: "showAdvanced",
				type: "boolean",
				default: false,
				description: "Whether to show advanced chunking and extraction options",
				displayOptions: { show: { operation: ["ingest", "ingestGithub"] } },
			},
			...ADVANCED_INGEST_FIELDS,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const getIngestOpts = (i: number): IngestOptions => {
			const showAdvanced = this.getNodeParameter("showAdvanced", i, false) as boolean;
			if (!showAdvanced) return {};
			return {
				chunkingStrategy: this.getNodeParameter(
					"chunkingStrategy",
					i,
					"sentence_token_cap",
				) as IngestOptions["chunkingStrategy"],
				maxTokens: this.getNodeParameter("maxTokens", i, 256) as number,
				overlapSentences: this.getNodeParameter("overlapSentences", i, 1) as number,
				chunkSize: this.getNodeParameter("chunkSize", i, 1000) as number,
				chunkOverlap: this.getNodeParameter("chunkOverlap", i, 100) as number,
				resolutionStrategy: this.getNodeParameter(
					"resolutionStrategy",
					i,
					"exact",
				) as IngestOptions["resolutionStrategy"],
				entityTypes: this.getNodeParameter("entityTypes", i, "") as string,
			};
		};
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials("falkorDbGraphRagApi");

		for (let i = 0; i < items.length; i++) {
			const graphName = (this.getNodeParameter("graphName", i, "") as string).trim();
			const client = new GraphRagClient({
				serverUrl: credentials.serverUrl as string,
				apiToken: (credentials.apiToken as string) || undefined,
				graphName: graphName || undefined,
			});
			const operation = this.getNodeParameter("operation", i) as string;
			try {
				if (operation === "question") {
					const q = this.getNodeParameter("questionText", i) as string;
					const strategy = this.getNodeParameter("queryStrategy", i) as string;
					const responseMode = this.getNodeParameter("responseMode", i, "answer") as string;
					const opts: QueryOptions = {
						strategy: strategy === "auto" ? undefined : (strategy as QueryOptions["strategy"]),
						responseMode: responseMode === "retrieveOnly" ? "retrieve_only" : "answer",
					};
					const result = await client.question(q, opts);
					const output =
						responseMode === "retrieveOnly"
							? {
									question: q,
									documents: (result as { documents?: unknown[] }).documents ?? [],
									count: (result as { count?: number }).count ?? 0,
								}
							: { question: q, ...result };
					returnData.push({
						json: output,
						pairedItem: { item: i },
					});
				} else if (operation === "ingest") {
					const text = this.getNodeParameter("documentText", i) as string;
					const filename = this.getNodeParameter("filename", i) as string;
					const opts = getIngestOpts(i);
					const result = await client.ingest(text, filename, opts);
					returnData.push({
						json: { filename, ...result },
						pairedItem: { item: i },
					});
				} else if (operation === "ingestGithub") {
					const repoUrl = this.getNodeParameter("githubUrl", i) as string;
					const ref = (this.getNodeParameter("githubRef", i) as string).trim() || undefined;
					const opts = getIngestOpts(i);
					const result = await client.ingestGithub(repoUrl, ref, opts);
					returnData.push({ json: { ...result }, pairedItem: { item: i } });
				} else if (operation === "listDocuments") {
					const docs = await client.listDocuments();
					returnData.push({
						json: { documents: docs, count: docs.length },
						pairedItem: { item: i },
					});
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
						itemIndex: i,
					});
				}
			} catch (err) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (err as Error).message },
						pairedItem: { item: i },
					});
				} else {
					throw err;
				}
			}
		}
		return [returnData];
	}
}
