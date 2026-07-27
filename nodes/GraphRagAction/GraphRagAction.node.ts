import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from "n8n-workflow";

import { GraphRagClient, IngestOptions, QueryOptions } from "../../src/GraphRagClient";

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
		hint: "Controls how text is split before extraction and indexing.",
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
		hint: "Use lower values for more granular chunks; higher values for more context per chunk.",
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
		hint: "Adds sentence overlap between chunks to preserve context continuity.",
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
		hint: "Chunk size to use when Fixed Size chunking is selected.",
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
		description: "Overlap in tokens between consecutive fixed-size chunks",
		hint: "Token overlap between fixed-size chunks to reduce context loss.",
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
			{ name: "Fuzzy", value: "fuzzy" },
		],
		default: "exact",
		description: "How to resolve duplicate entities during ingestion",
		hint: "Choose how duplicate entities discovered in different chunks are merged.",
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
		hint: "Optional allow-list for entity classes to extract.",
		displayOptions: {
			show: { operation: ["ingest", "ingestGithub"], showAdvanced: [true] },
		},
	},
];

export class GraphRagAction implements INodeType {
	description: INodeTypeDescription = {
		displayName: "FalkorDB GraphRAG",
		name: "graphRagAction",
		icon: {
			light: "file:falkordb-f.svg",
			dark: "file:falkordb-f-dark.svg",
		},
		group: ["transform"],
		version: 1,
		usableAsTool: true,
		subtitle:
			'={{ ({ question: "Ask Question", ingest: "Ingest Text", ingestGithub: "Ingest GitHub Repo", listDocuments: "List Documents" })[$parameter["operation"]] || $parameter["operation"] }}',
		description:
			"Query or ingest data in a FalkorDB GraphRAG knowledge graph. " +
			"Use 'Ask Question' to answer questions from the knowledge graph. " +
			"Use 'Ingest Text' to add plain text or markdown. " +
			"Use 'Ingest GitHub Repo' to ingest all markdown files from a GitHub repository. " +
			"Use 'List Documents' to see what has been ingested. " +
			"Connects directly in a pipeline (main input/output).",
		defaults: { name: "FalkorDB GraphRAG" },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: "falkorDbGraphRagApi", required: true }],
		properties: [
			{
				displayName: "Graph Name",
				name: "graphName",
				type: "string",
				default: "n8n-graph",
				placeholder: "e.g. knowledge_graph",
				description:
					"Name of the graph to operate on. Defaults to n8n-graph. On hosted FalkorDB GraphRAG, this selects among graphs owned by your API token; on self-hosted, this is the direct graph name.",
				hint: "Set the target graph identifier. The default is n8n-graph.",
			},
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
						action: "Ingest a repository from github",
					},
					{
						name: "List Documents",
						value: "listDocuments",
						description: "List all documents that have been ingested into the knowledge graph",
						action: "List ingested documents",
					},
				],
				default: "question",
				hint: "Choose whether to ask questions, ingest content, or list documents.",
			},

			// ── Ask Question ──────────────────────────────────────────────────────
			{
				displayName: "Question",
				name: "questionText",
				type: "string",
				typeOptions: { rows: 3 },
				default: "",
				placeholder: "What servers are in the network?",
				description: "The natural-language question to ask the knowledge graph",
				hint: "Natural-language question that will be answered from the graph.",
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
				hint: "Use Retrieve Only when another node will generate the final answer.",
				displayOptions: { show: { operation: ["question"] } },
			},
			{
				displayName: "Retrieval Strategy",
				name: "queryStrategy",
				type: "options",
				options: [
					{ name: "Local (Default) — Fast, Single-Hop", value: "local" },
					{ name: "Auto", value: "auto" },
					{ name: "Multi-Path — Deeper, Multi-Hop", value: "multi_path" },
				],
				default: "local",
				description: "How the server retrieves context",
				hint: "Local is fastest; Multi-Path is deeper; Auto lets the server choose.",
				displayOptions: { show: { operation: ["question"] } },
			},

			// ── Ingest Text ───────────────────────────────────────────────────────
			{
				displayName: "Input Source",
				name: "ingestSource",
				type: "options",
				options: [
					{ name: "Text", value: "text" },
					{ name: "Binary File", value: "binary" },
				],
				default: "text",
				description: "Where to read the content to ingest from",
				hint: "Select Text to paste content, or Binary File to ingest an incoming file.",
				displayOptions: { show: { operation: ["ingest"] } },
			},
			{
				displayName: "Document Text",
				name: "documentText",
				type: "string",
				typeOptions: { rows: 6 },
				default: "",
				placeholder: "Paste your document text here, or use an expression like {{ $json.text }}",
				description: "Text to ingest. Supports plain text and markdown.",
				hint: "Provide the document body in plain text or markdown format.",
				displayOptions: { show: { operation: ["ingest"], ingestSource: ["text"] } },
			},
			{
				displayName: "Binary Property",
				name: "binaryPropertyName",
				type: "string",
				default: "data",
				description: "Name of the input binary property containing the file to ingest",
				hint: "Usually data, unless your incoming binary field uses a different key.",
				displayOptions: { show: { operation: ["ingest"], ingestSource: ["binary"] } },
			},
			{
				displayName: "Document Name",
				name: "documentName",
				type: "string",
				default: "document.txt",
				description:
					"Document name hint for the server. Use .txt/.md for text input and .pdf for binary PDF input.",
				hint: "Document identifier and extension hint sent to the server.",
				displayOptions: { show: { operation: ["ingest"] } },
			},

			// ── Ingest GitHub Repo ────────────────────────────────────────────────
			{
				displayName: "GitHub Repo URL",
				name: "githubUrl",
				type: "string",
				default: "",
				placeholder: "https://github.com/FalkorDB/GraphRAG-SDK",
				description: "URL of the public GitHub repository. Discovers and ingests all .md files.",
				hint: "Public repository URL whose markdown files should be ingested.",
				displayOptions: { show: { operation: ["ingestGithub"] } },
			},
			{
				displayName: "Branch / Tag / Commit",
				name: "githubRef",
				type: "string",
				default: "",
				description: "Branch, tag, or commit SHA (leave blank for the default branch)",
				hint: "Optional Git ref to pin ingestion to a specific branch, tag, or commit.",
				displayOptions: { show: { operation: ["ingestGithub"] } },
			},

			// ── Advanced ingest options ───────────────────────────────────────────
			{
				displayName: "Advanced Options",
				name: "showAdvanced",
				type: "boolean",
				default: false,
				description: "Whether to show advanced chunking and extraction options",
				hint: "Enable extra controls for chunking and entity extraction.",
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
				requestTimeoutSeconds: Number(credentials.requestTimeoutSeconds ?? 60),
				graphName: graphName || undefined,
			});
			const operation = this.getNodeParameter("operation", i) as string;
			try {
				if (operation === "question") {
					const q = this.getNodeParameter("questionText", i) as string;
					const strategy = this.getNodeParameter("queryStrategy", i, "local") as string;
					const responseMode = this.getNodeParameter("responseMode", i, "answer") as string;
					const opts: QueryOptions = {
						strategy: strategy as QueryOptions["strategy"],
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
					const configuredDocumentName = this.getNodeParameter(
						"documentName",
						i,
						"document.txt",
					) as string;
					// Backward compatibility for existing workflows saved with the old parameter key.
					let legacyDocumentName = "";
					try {
						legacyDocumentName = this.getNodeParameter("filename", i, "") as string;
					} catch {
						legacyDocumentName = "";
					}
					const documentName = legacyDocumentName || configuredDocumentName;
					const source = this.getNodeParameter("ingestSource", i, "text") as "text" | "binary";
					const opts = getIngestOpts(i);
					const result =
						source === "binary"
							? await client.ingestBuffer(
									await this.helpers.getBinaryDataBuffer(
										i,
										this.getNodeParameter("binaryPropertyName", i, "data") as string,
									),
									documentName,
									opts,
								)
							: await client.ingest(
									this.getNodeParameter("documentText", i) as string,
									documentName,
									opts,
								);
					returnData.push({
						json: { documentName, ...result },
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
					throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
				}
			}
		}
		return [returnData];
	}
}
