import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IExecuteFunctions } from "n8n-workflow";

const { mockQuestion, mockIngest, mockIngestGithub, mockListDocuments } = vi.hoisted(() => ({
	mockQuestion: vi.fn(),
	mockIngest: vi.fn(),
	mockIngestGithub: vi.fn(),
	mockListDocuments: vi.fn(),
}));

vi.mock("../src/GraphRagClient", () => ({
	GraphRagClient: vi.fn(function () {
		return {
			question: mockQuestion,
			ingest: mockIngest,
			ingestGithub: mockIngestGithub,
			listDocuments: mockListDocuments,
		};
	}),
}));

import { GraphRag } from "../nodes/GraphRag/GraphRag.node";

function makeContext(params: Record<string, unknown>): IExecuteFunctions {
	return {
		getInputData: vi.fn(() => [{ json: {} }]),
		getNodeParameter: vi.fn(
			(name: string, _itemIndex: number, fallback?: unknown) => params[name] ?? fallback,
		),
		getCredentials: vi.fn(async () => ({
			serverUrl: "http://localhost:8000",
			apiToken: "token",
		})),
		getNode: vi.fn(() => ({ name: "FalkorDB Graph RAG Tool" })),
		continueOnFail: vi.fn(() => false),
		helpers: {},
	} as unknown as IExecuteFunctions;
}

async function run(params: Record<string, unknown>) {
	const node = new GraphRag();
	const ctx = makeContext(params);
	return node.execute.call(ctx as unknown as IExecuteFunctions);
}

describe("GraphRag node description", () => {
	const node = new GraphRag();

	it("has correct name", () => expect(node.description.name).toBe("graphRag"));
	it("outputs ai_tool (not main)", () => {
		expect(node.description.outputs).toContain("ai_tool");
		expect(node.description.outputs).not.toContain("main");
	});
	it("has no inputs", () => expect(node.description.inputs).toHaveLength(0));

	it("declares falkorDbGraphRagApi credential", () => {
		const creds = node.description.credentials ?? [];
		expect(creds.some((c: { name: string }) => c.name === "falkorDbGraphRagApi")).toBe(true);
	});

	it("exposes all 4 operations", () => {
		const opProp = node.description.properties.find(
			(p: { name: string }) => p.name === "operation",
		);
		const values = ((opProp?.options ?? []) as Array<{ value: string }>).map((o) => o.value);
		expect(values).toEqual(
			expect.arrayContaining(["question", "ingest", "ingestGithub", "listDocuments"]),
		);
	});

	it("question field default uses $fromAI expression", () => {
		const qProp = node.description.properties.find(
			(p: { name: string }) => p.name === "questionText",
		);
		expect(qProp?.default).toContain("$fromAI");
	});
});

describe("GraphRag — question operation", () => {
	beforeEach(() => mockQuestion.mockResolvedValue({ answer: "graph answer" }));

	it("calls client.question and returns answer", async () => {
		const [[result]] = await run({
			operation: "question",
			questionText: "What is in the graph?",
			queryStrategy: "auto",
		});
		expect(mockQuestion).toHaveBeenCalledWith("What is in the graph?", {
			strategy: undefined,
			responseMode: "answer",
		});
		expect(result.json).toMatchObject({ answer: "graph answer" });
	});

	it("passes multi_path strategy", async () => {
		await run({ operation: "question", questionText: "Q", queryStrategy: "multi_path" });
		expect(mockQuestion).toHaveBeenCalledWith("Q", {
			strategy: "multi_path",
			responseMode: "answer",
		});
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
			strategy: undefined,
			responseMode: "retrieve_only",
		});
		expect(result.json).toMatchObject({
			question: "Q",
			documents: [{ source_doc: "doc-1" }],
			count: 1,
		});
	});
});

describe("GraphRag — ingest operation", () => {
	beforeEach(() =>
		mockIngest.mockResolvedValue({
			status: "complete",
			nodesCreated: 3,
			relationshipsCreated: 2,
			chunksIndexed: 1,
		}),
	);

	it("calls client.ingest and returns stats", async () => {
		const [[result]] = await run({
			operation: "ingest",
			documentText: "some text",
			filename: "doc.txt",
			showAdvanced: false,
		});
		expect(mockIngest).toHaveBeenCalledWith("some text", "doc.txt", {});
		expect(result.json).toMatchObject({ nodesCreated: 3 });
	});
});

describe("GraphRag — ingestGithub operation", () => {
	beforeEach(() =>
		mockIngestGithub.mockResolvedValue({
			repoUrl: "https://github.com/FalkorDB/GraphRAG-SDK",
			filesIngested: 5,
			totalNodesCreated: 20,
			totalRelationshipsCreated: 10,
			files: [],
			skippedFiles: [],
		}),
	);

	it("calls client.ingestGithub and returns result", async () => {
		const [[result]] = await run({
			operation: "ingestGithub",
			githubUrl: "https://github.com/FalkorDB/GraphRAG-SDK",
			githubRef: "",
			showAdvanced: false,
		});
		expect(mockIngestGithub).toHaveBeenCalledWith(
			"https://github.com/FalkorDB/GraphRAG-SDK",
			undefined,
			{},
		);
		expect(result.json).toMatchObject({ filesIngested: 5 });
	});
});

describe("GraphRag — listDocuments operation", () => {
	beforeEach(() =>
		mockListDocuments.mockResolvedValue([
			{ id: "1", name: "acme.txt", size: 800, chunkCount: 5, entityCount: 12, relationCount: 8 },
		]),
	);

	it("calls client.listDocuments and returns documents", async () => {
		const [[result]] = await run({ operation: "listDocuments" });
		expect(mockListDocuments).toHaveBeenCalledTimes(1);
		expect(result.json).toMatchObject({ count: 1, documents: [{ name: "acme.txt" }] });
	});
});

describe("GraphRag — error handling", () => {
	it("re-throws on failure when continueOnFail is false", async () => {
		mockQuestion.mockRejectedValue(new Error("timeout"));
		const node = new GraphRag();
		const ctx = makeContext({ operation: "question", questionText: "Q", queryStrategy: "auto" });
		await expect(node.execute.call(ctx as unknown as IExecuteFunctions)).rejects.toThrow("timeout");
	});

	it("returns error json when continueOnFail is true", async () => {
		mockIngest.mockRejectedValue(new Error("server error"));
		const node = new GraphRag();
		const ctx = makeContext({
			operation: "ingest",
			documentText: "text",
			filename: "doc.txt",
			showAdvanced: false,
		});
		(ctx.continueOnFail as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
		const [[result]] = await node.execute.call(ctx as unknown as IExecuteFunctions);
		expect(result.json).toMatchObject({ error: "server error" });
	});
});
