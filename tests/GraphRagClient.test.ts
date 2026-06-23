import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphRagClient } from "../src/GraphRagClient";

// ── fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

function okJson(data: unknown): Response {
	return {
		ok: true,
		status: 200,
		json: async () => data,
		text: async () => JSON.stringify(data),
	} as unknown as Response;
}

function okText(body: string): Response {
	return {
		ok: true,
		status: 200,
		json: async () => JSON.parse(body),
		text: async () => body,
	} as unknown as Response;
}

function errorResponse(status: number, body = "error"): Response {
	return { ok: false, status, text: async () => body } as unknown as Response;
}

// SSE body helpers
function sseComplete(nodesCreated = 3, relationshipsCreated = 2, chunksIndexed = 1): string {
	return [
		`data: {"type":"step","step":1,"total":5,"name":"Chunking"}`,
		`data: {"type":"step","step":5,"total":5,"name":"Finalizing"}`,
		`data: {"status":"complete","nodes_created":${nodesCreated},"relationships_created":${relationshipsCreated},"chunks_indexed":${chunksIndexed}}`,
	].join("\n");
}

// ── constructor ───────────────────────────────────────────────────────────────

describe("GraphRagClient constructor", () => {
	it("strips trailing slash from serverUrl", () => {
		const client = new GraphRagClient({ serverUrl: "http://localhost:8000/" });
		// access private field via cast to verify normalisation via a real call
		mockFetch.mockResolvedValueOnce(okJson({ answer: "ok" }));
		void client.question("test");
		expect(mockFetch).toHaveBeenCalledWith("http://localhost:8000/api/query", expect.any(Object));
	});

	it("includes Authorization header when bearerToken provided", async () => {
		const client = new GraphRagClient({
			serverUrl: "http://localhost:8000",
			bearerToken: "mytoken",
		});
		mockFetch.mockResolvedValueOnce(okJson({ answer: "ok" }));
		await client.question("test");
		const [, init] = mockFetch.mock.calls[0];
		expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer mytoken" });
	});

	it("omits Authorization header when no bearerToken", async () => {
		const client = new GraphRagClient({ serverUrl: "http://localhost:8000" });
		mockFetch.mockResolvedValueOnce(okJson({ answer: "ok" }));
		await client.question("test");
		const [, init] = mockFetch.mock.calls[0];
		expect((init as RequestInit & { headers: Record<string, string> }).headers).not.toHaveProperty(
			"Authorization",
		);
	});
});

// ── question ──────────────────────────────────────────────────────────────────

describe("GraphRagClient.question", () => {
	const client = new GraphRagClient({ serverUrl: "http://localhost:8000" });

	it("POSTs to /api/query and returns answer", async () => {
		mockFetch.mockResolvedValueOnce(okJson({ answer: "42" }));
		const result = await client.question("What is the answer?");
		expect(result).toEqual({ answer: "42" });
		expect(mockFetch).toHaveBeenCalledWith(
			"http://localhost:8000/api/query",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("sends strategy when provided", async () => {
		mockFetch.mockResolvedValueOnce(okJson({ answer: "ok" }));
		await client.question("Q?", { strategy: "local" });
		const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
		expect(body.strategy).toBe("local");
	});

	it("sends strategy: null when strategy is undefined (omitted)", async () => {
		mockFetch.mockResolvedValueOnce(okJson({ answer: "ok" }));
		await client.question("Q?");
		const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
		expect(body.strategy).toBeNull();
	});

	it("sends conversation history", async () => {
		mockFetch.mockResolvedValueOnce(okJson({ answer: "ok" }));
		const history = [{ role: "user", content: "prev msg" }];
		await client.question("follow-up", { history });
		const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
		expect(body.history).toEqual(history);
	});

	it("throws on non-ok response", async () => {
		mockFetch.mockResolvedValueOnce(errorResponse(500, "server error"));
		await expect(client.question("Q")).rejects.toThrow("Query failed (HTTP 500)");
	});

	it("returns empty string answer when field missing", async () => {
		mockFetch.mockResolvedValueOnce(okJson({}));
		const result = await client.question("Q");
		expect(result.answer).toBe("");
	});
});

// ── ingest ────────────────────────────────────────────────────────────────────

describe("GraphRagClient.ingest", () => {
	const client = new GraphRagClient({ serverUrl: "http://localhost:8000" });

	it("POSTs multipart to /api/ingest and parses SSE response", async () => {
		mockFetch.mockResolvedValueOnce(okText(sseComplete(5, 4, 2)));
		const result = await client.ingest("some text", "doc.txt");
		expect(result).toEqual({
			status: "complete",
			nodesCreated: 5,
			relationshipsCreated: 4,
			chunksIndexed: 2,
		});
		expect(mockFetch).toHaveBeenCalledWith(
			"http://localhost:8000/api/ingest",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("defaults filename to document.txt", async () => {
		mockFetch.mockResolvedValueOnce(okText(sseComplete()));
		await client.ingest("text");
		const [, init] = mockFetch.mock.calls[0];
		const form = (init as RequestInit).body as FormData;
		expect(form.get("file")).toBeTruthy();
	});

	it("returns zeros when SSE has no complete event", async () => {
		mockFetch.mockResolvedValueOnce(okText('data: {"type":"step","step":1}'));
		const result = await client.ingest("text", "doc.txt");
		expect(result).toEqual({
			status: "complete",
			nodesCreated: 0,
			relationshipsCreated: 0,
			chunksIndexed: 0,
		});
	});

	it("throws on non-ok response", async () => {
		mockFetch.mockResolvedValueOnce(errorResponse(422, "bad request"));
		await expect(client.ingest("text")).rejects.toThrow("Ingest failed (HTTP 422)");
	});

	it("appends chunking options to form", async () => {
		mockFetch.mockResolvedValueOnce(okText(sseComplete()));
		await client.ingest("text", "doc.txt", {
			chunkingStrategy: "fixed_size",
			chunkSize: 500,
			chunkOverlap: 50,
			resolutionStrategy: "exact",
		});
		const [, init] = mockFetch.mock.calls[0];
		const form = (init as RequestInit).body as FormData;
		expect(form.get("chunking_strategy")).toBe("fixed_size");
		expect(form.get("chunk_size")).toBe("500");
		expect(form.get("chunk_overlap")).toBe("50");
		expect(form.get("resolution_strategy")).toBe("exact");
	});

	it("appends entity_types when provided", async () => {
		mockFetch.mockResolvedValueOnce(okText(sseComplete()));
		await client.ingest("text", "doc.txt", { entityTypes: "PERSON,ORG" });
		const form = (mockFetch.mock.calls[0][1] as RequestInit).body as FormData;
		expect(form.get("entity_types")).toBe("PERSON,ORG");
	});
});

// ── ingestBuffer ──────────────────────────────────────────────────────────────

describe("GraphRagClient.ingestBuffer", () => {
	const client = new GraphRagClient({ serverUrl: "http://localhost:8000" });

	it("POSTs a Buffer as multipart to /api/ingest and parses SSE response", async () => {
		mockFetch.mockResolvedValueOnce(okText(sseComplete(7, 3, 4)));
		const result = await client.ingestBuffer(Buffer.from("binary bytes"), "doc.txt");
		expect(result).toEqual({
			status: "complete",
			nodesCreated: 7,
			relationshipsCreated: 3,
			chunksIndexed: 4,
		});
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("http://localhost:8000/api/ingest");
		expect((init as RequestInit).method).toBe("POST");
		const form = (init as RequestInit).body as FormData;
		const file = form.get("file") as File;
		expect(file).toBeTruthy();
		expect(await (file as unknown as Blob).text()).toBe("binary bytes");
	});

	it("accepts a Uint8Array and sets the PDF content type for .pdf files", async () => {
		mockFetch.mockResolvedValueOnce(okText(sseComplete()));
		await client.ingestBuffer(new Uint8Array([1, 2, 3]), "report.pdf");
		const form = (mockFetch.mock.calls[0][1] as RequestInit).body as FormData;
		const file = form.get("file") as unknown as Blob;
		expect(file.type).toBe("application/pdf");
	});

	it("appends ingest options to the form", async () => {
		mockFetch.mockResolvedValueOnce(okText(sseComplete()));
		await client.ingestBuffer(Buffer.from("x"), "doc.txt", {
			maxTokens: 128,
			entityTypes: "PERSON",
		});
		const form = (mockFetch.mock.calls[0][1] as RequestInit).body as FormData;
		expect(form.get("max_tokens")).toBe("128");
		expect(form.get("entity_types")).toBe("PERSON");
	});

	it("throws on non-ok response", async () => {
		mockFetch.mockResolvedValueOnce(errorResponse(500, "boom"));
		await expect(client.ingestBuffer(Buffer.from("x"), "doc.txt")).rejects.toThrow(
			"Ingest failed (HTTP 500)",
		);
	});
});

// ── listDocuments ─────────────────────────────────────────────────────────────

describe("GraphRagClient.listDocuments", () => {
	const client = new GraphRagClient({ serverUrl: "http://localhost:8000" });

	it("GETs /api/documents and maps snake_case fields", async () => {
		mockFetch.mockResolvedValueOnce(
			okJson([
				{ id: "1", name: "doc.txt", size: 100, chunk_count: 3, entity_count: 7, relation_count: 5 },
			]),
		);
		const docs = await client.listDocuments();
		expect(docs).toEqual([
			{ id: "1", name: "doc.txt", size: 100, chunkCount: 3, entityCount: 7, relationCount: 5 },
		]);
	});

	it("handles { documents: [...] } envelope", async () => {
		mockFetch.mockResolvedValueOnce(
			okJson({
				documents: [{ id: "2", name: "a.md", size: 50 }],
			}),
		);
		const docs = await client.listDocuments();
		expect(docs[0].id).toBe("2");
	});

	it("returns empty array for empty list", async () => {
		mockFetch.mockResolvedValueOnce(okJson([]));
		expect(await client.listDocuments()).toEqual([]);
	});

	it("throws on non-ok response", async () => {
		mockFetch.mockResolvedValueOnce(errorResponse(403, "forbidden"));
		await expect(client.listDocuments()).rejects.toThrow("List documents failed (HTTP 403)");
	});
});

// ── ingestGithub ──────────────────────────────────────────────────────────────

describe("GraphRagClient.ingestGithub", () => {
	const client = new GraphRagClient({ serverUrl: "http://localhost:8000" });

	it("calls preview then ingests each discovered file", async () => {
		mockFetch
			.mockResolvedValueOnce(
				okJson({
					owner: "FalkorDB",
					repo: "GraphRAG-SDK",
					ref: "main",
					files: [
						{ path: "README.md", size: 100 },
						{ path: "docs/index.md", size: 200 },
					],
				}),
			)
			.mockResolvedValueOnce(okText("file one content")) // raw.githubusercontent fetch 1
			.mockResolvedValueOnce(okText(sseComplete(2, 1, 1))) // ingest 1
			.mockResolvedValueOnce(okText("file two content")) // raw.githubusercontent fetch 2
			.mockResolvedValueOnce(okText(sseComplete(3, 2, 1))); // ingest 2

		const result = await client.ingestGithub("https://github.com/FalkorDB/GraphRAG-SDK");
		expect(result.filesIngested).toBe(2);
		expect(result.totalNodesCreated).toBe(5);
		expect(result.totalRelationshipsCreated).toBe(3);
		expect(result.files).toEqual(["README.md", "docs/index.md"]);
		expect(result.skippedFiles).toEqual([]);
	});

	it("skips files that fail to fetch", async () => {
		mockFetch
			.mockResolvedValueOnce(
				okJson({
					owner: "org",
					repo: "repo",
					ref: "main",
					files: [
						{ path: "good.md", size: 10 },
						{ path: "bad.md", size: 10 },
					],
				}),
			)
			.mockResolvedValueOnce(okText("content")) // good.md raw
			.mockResolvedValueOnce(okText(sseComplete(1, 0, 1))) // good.md ingest
			.mockResolvedValueOnce(errorResponse(404)); // bad.md raw

		const result = await client.ingestGithub("https://github.com/org/repo");
		expect(result.filesIngested).toBe(1);
		expect(result.skippedFiles).toEqual(["bad.md"]);
	});

	it("throws when preview returns no files", async () => {
		mockFetch.mockResolvedValueOnce(okJson({ owner: "o", repo: "r", ref: "main", files: [] }));
		await expect(client.ingestGithub("https://github.com/o/r")).rejects.toThrow(
			"No markdown files found",
		);
	});

	it("throws when preview request fails", async () => {
		mockFetch.mockResolvedValueOnce(errorResponse(422, "bad url"));
		await expect(client.ingestGithub("https://github.com/bad")).rejects.toThrow(
			"GitHub preview failed (HTTP 422)",
		);
	});
});

// ── SSE parser edge cases ─────────────────────────────────────────────────────

describe("GraphRagClient SSE parser", () => {
	const client = new GraphRagClient({ serverUrl: "http://localhost:8000" });

	it("picks the last complete event when multiple data lines exist", async () => {
		const body = [
			`data: {"status":"complete","nodes_created":1,"relationships_created":0,"chunks_indexed":1}`,
			`data: {"status":"complete","nodes_created":9,"relationships_created":8,"chunks_indexed":4}`,
		].join("\n");
		mockFetch.mockResolvedValueOnce(okText(body));
		const result = await client.ingest("text");
		expect(result.nodesCreated).toBe(9);
	});
});
