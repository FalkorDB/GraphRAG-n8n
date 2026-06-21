import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IExecuteFunctions } from "n8n-workflow";

const { mockQuestion, mockIngest, mockIngestGithub, mockListDocuments } = vi.hoisted(() => ({
	mockQuestion: vi.fn(),
	mockIngest: vi.fn(),
	mockIngestGithub: vi.fn(),
	mockListDocuments: vi.fn(),
}));

vi.mock("../src/GraphRagClient", () => ({
	GraphRagClient: vi.fn(function() {
		return {
			question: mockQuestion,
			ingest: mockIngest,
			ingestGithub: mockIngestGithub,
			listDocuments: mockListDocuments,
		};
	}),
}));

import { GraphRagAction } from "../nodes/GraphRagAction/GraphRagAction.node";

function makeContext(params: Record<string, unknown>, credentialOverrides: Record<string, unknown> = {}): IExecuteFunctions {
	return {
		getInputData: vi.fn(() => [{ json: {} }]),
		getNodeParameter: vi.fn((name: string) => params[name] ?? undefined),
		getCredentials: vi.fn(async () => ({
			serverUrl: "http://localhost:8000",
			bearerToken: "token",
			...credentialOverrides,
		})),
		getNode: vi.fn(() => ({ name: "FalkorDB Graph RAG" })),
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
		await run({ operation: "question", questionText: "What is the answer?", queryStrategy: "auto" });
		expect(mockQuestion).toHaveBeenCalledWith("What is the answer?", { strategy: undefined });
	});

	it("passes non-auto strategy to client", async () => {
		await run({ operation: "question", questionText: "Q", queryStrategy: "local" });
		expect(mockQuestion).toHaveBeenCalledWith("Q", { strategy: "local" });
	});

	it("returns answer in output json", async () => {
		const [[result]] = await run({ operation: "question", questionText: "Q", queryStrategy: "auto" });
		expect(result.json).toMatchObject({ question: "Q", answer: "The answer is 42." });
	});
});

describe("GraphRagAction — ingest operation", () => {
	beforeEach(() =>
		mockIngest.mockResolvedValue({ status: "complete", nodesCreated: 5, relationshipsCreated: 3, chunksIndexed: 2 }),
	);

	it("calls client.ingest with text, filename and empty opts when advanced hidden", async () => {
		await run({ operation: "ingest", documentText: "hello world", filename: "doc.txt", showAdvanced: false });
		expect(mockIngest).toHaveBeenCalledWith("hello world", "doc.txt", {});
	});

	it("passes advanced options when showAdvanced is true", async () => {
		await run({
			operation: "ingest",
			documentText: "text",
			filename: "doc.txt",
			showAdvanced: true,
			chunkingStrategy: "fixed_size",
			chunkSize: 500,
			chunkOverlap: 50,
			maxTokens: 256,
			overlapSentences: 1,
			resolutionStrategy: "exact",
			entityTypes: "PERSON,ORG",
		});
		expect(mockIngest).toHaveBeenCalledWith("text", "doc.txt", expect.objectContaining({
			chunkingStrategy: "fixed_size",
			chunkSize: 500,
			chunkOverlap: 50,
			resolutionStrategy: "exact",
			entityTypes: "PERSON,ORG",
		}));
	});

	it("returns ingestion stats in output json", async () => {
		const [[result]] = await run({ operation: "ingest", documentText: "text", filename: "doc.txt", showAdvanced: false });
		expect(result.json).toMatchObject({ filename: "doc.txt", nodesCreated: 5, relationshipsCreated: 3 });
	});
});

describe("GraphRagAction — ingestGithub operation", () => {
	beforeEach(() =>
		mockIngestGithub.mockResolvedValue({
			repoUrl: "https://github.com/FalkorDB/GraphRAG-SDK",
			filesIngested: 10, totalNodesCreated: 40, totalRelationshipsCreated: 20,
			files: [], skippedFiles: [],
		}),
	);

	it("calls client.ingestGithub with repo url and ref", async () => {
		await run({ operation: "ingestGithub", githubUrl: "https://github.com/FalkorDB/GraphRAG-SDK", githubRef: "main", showAdvanced: false });
		expect(mockIngestGithub).toHaveBeenCalledWith("https://github.com/FalkorDB/GraphRAG-SDK", "main", {});
	});

	it("passes undefined ref when githubRef is empty string", async () => {
		await run({ operation: "ingestGithub", githubUrl: "https://github.com/org/repo", githubRef: "  ", showAdvanced: false });
		expect(mockIngestGithub).toHaveBeenCalledWith("https://github.com/org/repo", undefined, {});
	});

	it("returns github result in output json", async () => {
		const [[result]] = await run({ operation: "ingestGithub", githubUrl: "https://github.com/FalkorDB/GraphRAG-SDK", githubRef: "", showAdvanced: false });
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

	it("exposes all 4 operations", () => {
		const opProp = node.description.properties.find((p: { name: string }) => p.name === "operation");
		const values = ((opProp?.options ?? []) as Array<{ value: string }>).map(o => o.value);
		expect(values).toEqual(expect.arrayContaining(["question", "ingest", "ingestGithub", "listDocuments"]));
	});
});
