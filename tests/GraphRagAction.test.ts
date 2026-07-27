import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IExecuteFunctions } from "n8n-workflow";

const {
	mockQuestion,
	mockIngest,
	mockIngestBuffer,
	mockIngestGithub,
	mockListDocuments,
	mockUpdateDocument,
	mockDeleteDocument,
} = vi.hoisted(() => ({
	mockQuestion: vi.fn(),
	mockIngest: vi.fn(),
	mockIngestBuffer: vi.fn(),
	mockIngestGithub: vi.fn(),
	mockListDocuments: vi.fn(),
	mockUpdateDocument: vi.fn(),
	mockDeleteDocument: vi.fn(),
}));

vi.mock("../src/GraphRagClient", () => ({
	GraphRagClient: vi.fn(function () {
		return {
			question: mockQuestion,
			ingest: mockIngest,
			ingestBuffer: mockIngestBuffer,
			ingestGithub: mockIngestGithub,
			listDocuments: mockListDocuments,
			updateDocument: mockUpdateDocument,
			deleteDocument: mockDeleteDocument,
		};
	}),
}));

import { GraphRagAction } from "../nodes/GraphRagAction/GraphRagAction.node";

function makeContext(
	params: Record<string, unknown>,
	credentialOverrides: Record<string, unknown> = {},
): IExecuteFunctions {
	return {
		getInputData: vi.fn(() => [{ json: {} }]),
		getNodeParameter: vi.fn(
			(name: string, _itemIndex: number, fallback?: unknown) => params[name] ?? fallback,
		),
		getCredentials: vi.fn(async () => ({
			serverUrl: "http://localhost:8000",
			apiToken: "token",
			requestTimeoutSeconds: 60,
			...credentialOverrides,
		})),
		getNode: vi.fn(() => ({ name: "FalkorDB GraphRAG" })),
		continueOnFail: vi.fn(() => false),
		helpers: {},
	} as unknown as IExecuteFunctions;
}

async function run(params: Record<string, unknown>) {
	const node = new GraphRagAction();
	const ctx = makeContext(params);
	return node.execute.call(ctx as unknown as IExecuteFunctions);
}

describe("GraphRagAction — question operation", () => {
	beforeEach(() => mockQuestion.mockResolvedValue({ answer: "The answer is 42." }));

	it("calls client.question with the question text", async () => {
		await run({
			operation: "question",
			questionText: "What is the answer?",
			queryStrategy: "auto",
		});
		expect(mockQuestion).toHaveBeenCalledWith("What is the answer?", {
			strategy: "auto",
			responseMode: "answer",
		});
	});

	it("passes non-auto strategy to client", async () => {
		await run({ operation: "question", questionText: "Q", queryStrategy: "local" });
		expect(mockQuestion).toHaveBeenCalledWith("Q", {
			strategy: "local",
			responseMode: "answer",
		});
	});

	it("returns answer in output json", async () => {
		const [[result]] = await run({
			operation: "question",
			questionText: "Q",
			queryStrategy: "auto",
		});
		expect(result.json).toMatchObject({ question: "Q", answer: "The answer is 42." });
	});

	it("supports retrieve-only mode", async () => {
		mockQuestion.mockResolvedValueOnce({
			documents: [{ source_doc: "doc-1", content: "context" }],
			count: 1,
		});
		const [[result]] = await run({
			operation: "question",
			questionText: "Q",
			queryStrategy: "auto",
			responseMode: "retrieveOnly",
		});
		expect(mockQuestion).toHaveBeenCalledWith("Q", {
			strategy: "auto",
			responseMode: "retrieve_only",
		});
		expect(result.json).toMatchObject({
			question: "Q",
			documents: [{ source_doc: "doc-1" }],
			count: 1,
		});
	});
});

describe("GraphRagAction — ingest operation", () => {
	beforeEach(() =>
		mockIngest.mockResolvedValue({
			status: "complete",
			nodesCreated: 5,
			relationshipsCreated: 3,
			chunksIndexed: 2,
		}),
	);

	it("calls client.ingest with text, documentName and empty opts when advanced hidden", async () => {
		await run({
			operation: "ingest",
			documentText: "hello world",
			documentName: "doc.txt",
			showAdvanced: false,
		});
		expect(mockIngest).toHaveBeenCalledWith("hello world", "doc.txt", {});
	});

	it("reads binary input when ingest source is binary", async () => {
		const node = new GraphRagAction();
		const ctx = makeContext({
			operation: "ingest",
			ingestSource: "binary",
			binaryPropertyName: "file",
			documentName: "report.pdf",
			showAdvanced: false,
		});
		(ctx.helpers as { getBinaryDataBuffer: ReturnType<typeof vi.fn> }).getBinaryDataBuffer = vi
			.fn()
			.mockResolvedValue(Buffer.from("pdf"));
		await node.execute.call(ctx as unknown as IExecuteFunctions);
		expect(
			(ctx.helpers as { getBinaryDataBuffer: ReturnType<typeof vi.fn> }).getBinaryDataBuffer,
		).toHaveBeenCalledWith(0, "file");
		expect(mockIngestBuffer).toHaveBeenCalledWith(expect.any(Uint8Array), "report.pdf", {});
	});

	it("passes advanced options when showAdvanced is true", async () => {
		await run({
			operation: "ingest",
			documentText: "text",
			documentName: "doc.txt",
			showAdvanced: true,
			chunkingStrategy: "fixed_size",
			chunkSize: 500,
			chunkOverlap: 50,
			maxTokens: 256,
			overlapSentences: 1,
			resolutionStrategy: "exact",
			entityTypes: "PERSON,ORG",
		});
		expect(mockIngest).toHaveBeenCalledWith(
			"text",
			"doc.txt",
			expect.objectContaining({
				chunkingStrategy: "fixed_size",
				chunkSize: 500,
				chunkOverlap: 50,
				resolutionStrategy: "exact",
				entityTypes: "PERSON,ORG",
			}),
		);
	});

	it("returns ingestion stats in output json", async () => {
		const [[result]] = await run({
			operation: "ingest",
			documentText: "text",
			documentName: "doc.txt",
			showAdvanced: false,
		});
		expect(result.json).toMatchObject({
			documentName: "doc.txt",
			nodesCreated: 5,
			relationshipsCreated: 3,
		});
	});

	it("supports legacy filename parameter as fallback", async () => {
		await run({
			operation: "ingest",
			documentText: "text",
			filename: "legacy.txt",
			showAdvanced: false,
		});
		expect(mockIngest).toHaveBeenCalledWith("text", "legacy.txt", {});
	});
});

describe("GraphRagAction — ingestGithub operation", () => {
	beforeEach(() =>
		mockIngestGithub.mockResolvedValue({
			repoUrl: "https://github.com/FalkorDB/GraphRAG-SDK",
			filesIngested: 10,
			totalNodesCreated: 40,
			totalRelationshipsCreated: 20,
			files: [],
			skippedFiles: [],
		}),
	);

	it("calls client.ingestGithub with repo url and ref", async () => {
		await run({
			operation: "ingestGithub",
			githubUrl: "https://github.com/FalkorDB/GraphRAG-SDK",
			githubRef: "main",
			showAdvanced: false,
		});
		expect(mockIngestGithub).toHaveBeenCalledWith(
			"https://github.com/FalkorDB/GraphRAG-SDK",
			"main",
			{},
		);
	});

	it("passes undefined ref when githubRef is empty string", async () => {
		await run({
			operation: "ingestGithub",
			githubUrl: "https://github.com/org/repo",
			githubRef: "  ",
			showAdvanced: false,
		});
		expect(mockIngestGithub).toHaveBeenCalledWith("https://github.com/org/repo", undefined, {});
	});

	it("returns github result in output json", async () => {
		const [[result]] = await run({
			operation: "ingestGithub",
			githubUrl: "https://github.com/FalkorDB/GraphRAG-SDK",
			githubRef: "",
			showAdvanced: false,
		});
		expect(result.json).toMatchObject({ filesIngested: 10 });
	});
});

describe("GraphRagAction — listDocuments operation", () => {
	beforeEach(() =>
		mockListDocuments.mockResolvedValue([
			{ id: "1", name: "doc.txt", size: 100, chunkCount: 3, entityCount: 7, relationCount: 4 },
		]),
	);

	it("calls client.listDocuments", async () => {
		await run({ operation: "listDocuments" });
		expect(mockListDocuments).toHaveBeenCalledTimes(1);
	});

	it("returns documents array and count in output json", async () => {
		const [[result]] = await run({ operation: "listDocuments" });
		expect(result.json).toMatchObject({ count: 1, documents: [{ name: "doc.txt" }] });
	});
});

describe("GraphRagAction — updateDocument operation", () => {
	beforeEach(() =>
		mockUpdateDocument.mockResolvedValue({
			status: "updated",
			document: "doc.md",
			documentId: "uploads/doc.md",
			noOp: false,
			nodesCreated: 2,
			relationshipsCreated: 1,
			chunksIndexed: 3,
			cachedChunks: 2,
			extractedChunks: 1,
		}),
	);

	it("calls client.updateDocument with name, text, and options", async () => {
		await run({
			operation: "updateDocument",
			updateDocumentName: "doc.md",
			updateDocumentText: "new content",
			upsert: true,
			useChunkCache: false,
		});
		expect(mockUpdateDocument).toHaveBeenCalledWith("doc.md", "new content", {
			upsert: true,
			useChunkCache: false,
		});
	});

	it("passes advanced ingest options when enabled", async () => {
		await run({
			operation: "updateDocument",
			updateDocumentName: "doc.md",
			updateDocumentText: "text",
			showAdvanced: true,
			chunkingStrategy: "fixed_size",
			maxTokens: 512,
			overlapSentences: 2,
			chunkSize: 1500,
			chunkOverlap: 150,
			resolutionStrategy: "exact",
			entityTypes: "Person",
		});
		expect(mockUpdateDocument).toHaveBeenCalledWith(
			"doc.md",
			"text",
			expect.objectContaining({ chunkingStrategy: "fixed_size", maxTokens: 512 }),
		);
	});

	it("returns the update result in output json", async () => {
		const [[result]] = await run({
			operation: "updateDocument",
			updateDocumentName: "doc.md",
			updateDocumentText: "new content",
		});
		expect(result.json).toMatchObject({
			status: "updated",
			documentId: "uploads/doc.md",
			cachedChunks: 2,
			extractedChunks: 1,
		});
	});

	it("rejects an empty document name", async () => {
		await expect(
			run({ operation: "updateDocument", updateDocumentName: "  ", updateDocumentText: "x" }),
		).rejects.toThrow("Document Name is required");
		expect(mockUpdateDocument).not.toHaveBeenCalled();
	});
});

describe("GraphRagAction — deleteDocument operation", () => {
	beforeEach(() =>
		mockDeleteDocument.mockResolvedValue({ status: "deleted", documentId: "uploads/doc.md" }),
	);

	it("calls client.deleteDocument with the id", async () => {
		await run({ operation: "deleteDocument", deleteDocumentId: "uploads/doc.md" });
		expect(mockDeleteDocument).toHaveBeenCalledWith("uploads/doc.md");
	});

	it("returns the delete result in output json", async () => {
		const [[result]] = await run({
			operation: "deleteDocument",
			deleteDocumentId: "uploads/doc.md",
		});
		expect(result.json).toMatchObject({ status: "deleted", documentId: "uploads/doc.md" });
	});

	it("rejects an empty document id", async () => {
		await expect(run({ operation: "deleteDocument", deleteDocumentId: "" })).rejects.toThrow(
			"Document ID is required",
		);
		expect(mockDeleteDocument).not.toHaveBeenCalled();
	});
});

describe("GraphRagAction — error handling", () => {
	it("throws for unknown operation", async () => {
		const node = new GraphRagAction();
		const ctx = makeContext({ operation: "unknownOp" });
		await expect(node.execute.call(ctx as unknown as IExecuteFunctions)).rejects.toThrow();
	});

	it("returns error json when continueOnFail is true", async () => {
		mockQuestion.mockRejectedValue(new Error("network down"));
		const node = new GraphRagAction();
		const ctx = makeContext({ operation: "question", questionText: "Q", queryStrategy: "auto" });
		(ctx.continueOnFail as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
		const [[result]] = await node.execute.call(ctx as unknown as IExecuteFunctions);
		expect(result.json).toMatchObject({ error: "network down" });
	});
});

describe("GraphRagAction node description", () => {
	const node = new GraphRagAction();

	it("has correct name", () => expect(node.description.name).toBe("graphRagAction"));
	it("outputs main", () => expect(node.description.outputs).toContain("main"));
	it("inputs main", () => expect(node.description.inputs).toContain("main"));

	it("declares falkorDbGraphRagApi credential", () => {
		const creds = node.description.credentials ?? [];
		expect(creds.some((c: { name: string }) => c.name === "falkorDbGraphRagApi")).toBe(true);
	});

	it("exposes all 6 operations", () => {
		const opProp = node.description.properties.find(
			(p: { name: string }) => p.name === "operation",
		);
		const values = ((opProp?.options ?? []) as Array<{ value: string }>).map((o) => o.value);
		expect(values).toEqual(
			expect.arrayContaining([
				"question",
				"ingest",
				"ingestGithub",
				"listDocuments",
				"updateDocument",
				"deleteDocument",
			]),
		);
	});
});
