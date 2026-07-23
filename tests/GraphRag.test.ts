import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IExecuteFunctions } from "n8n-workflow";

const { mockQuestion, mockIngest, mockIngestBuffer, mockIngestGithub } = vi.hoisted(() => ({
	mockQuestion: vi.fn(),
	mockIngest: vi.fn(),
	mockIngestBuffer: vi.fn(),
	mockIngestGithub: vi.fn(),
}));

vi.mock("../src/GraphRagClient", () => ({
	GraphRagClient: vi.fn(function () {
		return {
			question: mockQuestion,
			ingest: mockIngest,
			ingestBuffer: mockIngestBuffer,
			ingestGithub: mockIngestGithub,
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
			requestTimeoutSeconds: 60,
		})),
		getNode: vi.fn(() => ({ name: "FalkorDB GraphRAG Tool" })),
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

	it("exposes retrieve and ingest operations", () => {
		const opProp = node.description.properties.find(
			(p: { name: string }) => p.name === "operation",
		);
		const values = ((opProp?.options ?? []) as Array<{ value: string }>).map((o) => o.value);
		expect(values).toEqual(expect.arrayContaining(["question", "ingest", "ingestGithub"]));
		expect(values).not.toContain("listDocuments");
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
			strategy: "auto",
			responseMode: "retrieve_only",
		});
		expect(result.json).toMatchObject({ documents: [], count: 0 });
	});

	it("passes multi_path strategy", async () => {
		await run({ operation: "question", questionText: "Q", queryStrategy: "multi_path" });
		expect(mockQuestion).toHaveBeenCalledWith("Q", {
			strategy: "multi_path",
			responseMode: "retrieve_only",
		});
	});

	it("returns retrieved context payload", async () => {
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
			documentName: "doc.txt",
			showAdvanced: false,
		});
		expect(mockIngest).toHaveBeenCalledWith("some text", "doc.txt", {});
		expect(result.json).toMatchObject({ nodesCreated: 3 });
	});

	it("supports binary ingest via helpers.getBinaryDataBuffer", async () => {
		const node = new GraphRag();
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

	it("supports legacy filename parameter as fallback", async () => {
		await run({
			operation: "ingest",
			documentText: "some text",
			filename: "legacy.txt",
			showAdvanced: false,
		});
		expect(mockIngest).toHaveBeenCalledWith("some text", "legacy.txt", {});
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
			documentName: "doc.txt",
			showAdvanced: false,
		});
		(ctx.continueOnFail as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
		const [[result]] = await node.execute.call(ctx as unknown as IExecuteFunctions);
		expect(result.json).toMatchObject({ error: "server error" });
	});
});
