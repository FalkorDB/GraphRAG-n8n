/**
 * HTTP client for the FalkorDB GraphRAG-Server.
 * https://github.com/FalkorDB/GraphRAG-Server
 *
 * Supported ingest modes:
 *   - Text/Markdown  : POST /api/ingest  (multipart, .txt / .md)
 *   - PDF            : POST /api/ingest  (multipart, .pdf — server extracts text)
 *   - GitHub repo    : POST /api/ingest/github/preview  +  raw file fetch  +  /api/ingest
 *
 * Supported query modes:
 *   - Ask question   : POST /api/query  (strategy: local | multi_path | auto)
 *
 * Document management:
 *   - Update document: PUT    /api/documents/{name}  (multipart, in-place diff update)
 *   - Delete document: DELETE /api/documents/{id}    (requires X-Confirm-Delete header)
 */

export interface GraphRagConfig {
	serverUrl: string;
	apiToken?: string;
	requestTimeoutSeconds?: number;
	/** Graph to operate on. When set, appended as ?graph_name=... to every request. */
	graphName?: string;
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface QuestionAnswerResult {
	answer: string;
}

export interface QuestionRetrieveResult {
	documents: unknown[];
	count: number;
}

export type QuestionResult = QuestionAnswerResult | QuestionRetrieveResult;

export interface IngestResult {
	status: string;
	nodesCreated: number;
	relationshipsCreated: number;
	chunksIndexed: number;
}

export interface IngestGithubResult {
	repoUrl: string;
	filesIngested: number;
	totalNodesCreated: number;
	totalRelationshipsCreated: number;
	files: string[];
	skippedFiles: Array<{ path: string; reason: string }>;
	finalized: boolean;
}

export interface UpdateDocumentResult {
	status: string;
	document: string;
	documentId: string;
	noOp: boolean;
	nodesCreated: number;
	relationshipsCreated: number;
	chunksIndexed: number;
	cachedChunks: number;
	extractedChunks: number;
}

export interface DeleteDocumentResult {
	status: string;
	documentId: string;
}

// ── Ingest options ────────────────────────────────────────────────────────────

export interface IngestOptions {
	/** How chunks are sized: sentence_token_cap (default) | fixed_size */
	chunkingStrategy?: "sentence_token_cap" | "fixed_size";
	/** Max tokens per chunk (64–2048, default 256) */
	maxTokens?: number;
	/** Sentence overlap between chunks (0–10, default 1) */
	overlapSentences?: number;
	/** Tokens per chunk for fixed_size strategy (100–5000, default 1000) */
	chunkSize?: number;
	/** Overlap tokens for fixed_size strategy (0–500, default 100) */
	chunkOverlap?: number;
	/** Entity extraction method: graph_extraction (default) | ... */
	extractionStrategy?: string;
	/** Duplicate resolution: exact (default) | description_merge | semantic | llm_verified | all */
	resolutionStrategy?: "exact" | "description_merge" | "semantic" | "llm_verified" | "all";
	/** Comma-separated entity types to restrict extraction to (empty = all) */
	entityTypes?: string;
	/** Skip server finalization. Useful when batching many ingests before one finalize call. */
	skipFinalize?: boolean;
}

// ── Update options ────────────────────────────────────────────────────────────

export interface UpdateDocumentOptions extends IngestOptions {
	/** Ingest as a new document when the name is unknown (default false → 404). */
	upsert?: boolean;
	/** Reuse graph data for unchanged chunks — only changed chunks hit the LLM (default true). */
	useChunkCache?: boolean;
}

// ── Query options ─────────────────────────────────────────────────────────────

export interface QueryOptions {
	/** Retrieval strategy: auto (default) | local | multi_path */
	strategy?: "auto" | "local" | "multi_path";
	/** Conversation history: array of {role, content} messages */
	history?: Array<{ role: string; content: string }>;
	/** Response mode: answer from server (default) or retrieve context only. */
	responseMode?: "answer" | "retrieve_only";
}

// ── Client ────────────────────────────────────────────────────────────────────

export class GraphRagClient {
	private readonly base: string;
	private readonly authHeader: Record<string, string>;
	private readonly graphName: string;
	private readonly requestTimeoutMs: number;

	constructor(config: GraphRagConfig) {
		this.base = config.serverUrl.replace(/\/$/, "");
		this.authHeader = config.apiToken
			? { Authorization: ["Bearer", config.apiToken].join(" ") }
			: {};
		this.graphName = config.graphName ?? "";
		this.requestTimeoutMs = Math.max(1, config.requestTimeoutSeconds ?? 60) * 1000;
	}

	/** Returns "?graph_name=<name>" when a graph name is configured, otherwise "". */
	private qs(): string {
		return this.graphName ? `?graph_name=${encodeURIComponent(this.graphName)}` : "";
	}

	private jsonHeaders(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			"X-Requested-With": "XMLHttpRequest",
			...this.authHeader,
		};
	}

	private multipartHeaders(): Record<string, string> {
		return { "X-Requested-With": "XMLHttpRequest", ...this.authHeader };
	}

	private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
		const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
		let cleanup: (() => void) | undefined;
		let signal: AbortSignal = timeoutSignal;
		const externalSignal = init.signal;

		if (externalSignal) {
			const controller = new AbortController();
			const abort = () => controller.abort();
			if (externalSignal.aborted || timeoutSignal.aborted) {
				controller.abort();
			} else {
				externalSignal.addEventListener("abort", abort, { once: true });
				timeoutSignal.addEventListener("abort", abort, { once: true });
				cleanup = () => {
					externalSignal.removeEventListener("abort", abort);
					timeoutSignal.removeEventListener("abort", abort);
				};
			}
			signal = controller.signal;
		}
		try {
			return await fetch(url, { ...init, signal });
		} catch (error) {
			if ((error as Error).name === "AbortError") {
				throw new Error(`Request timed out after ${this.requestTimeoutMs / 1000} seconds`);
			}
			throw error;
		} finally {
			cleanup?.();
		}
	}

	private async httpError(operationName: string, res: Response): Promise<Error> {
		const body = await res.text();
		const detail = this.extractServerDetail(body);
		if (detail) return new Error(detail);
		return new Error(this.fallbackErrorMessage(operationName, res.status));
	}

	private extractServerDetail(body: string): string | undefined {
		if (!body.trim()) return undefined;
		try {
			const parsed = JSON.parse(body) as { detail?: unknown };
			if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
		} catch {
			// non-JSON response — fall through to undefined so the caller uses the fallback message
		}
		return undefined;
	}

	private fallbackErrorMessage(operationName: string, status: number): string {
		switch (status) {
			case 401:
				return `${operationName} failed (401 Unauthorized). Verify your API token.`;
			case 404:
				return `${operationName} failed (404 Not Found). Check server URL and graph name.`;
			case 429:
				return `${operationName} failed (429 Too Many Requests). Retry shortly.`;
			default:
				if (status >= 500) return `${operationName} failed (HTTP ${status}). Server error.`;
				return `${operationName} failed (HTTP ${status}).`;
		}
	}

	// ── Ask Question ────────────────────────────────────────────────────────────

	/**
	 * Ask a natural-language question.
	 * strategy: "auto" (default) | "local" | "multi_path"
	 */
	async question(q: string, opts: QueryOptions = {}): Promise<QuestionResult> {
		const retrieveOnly = opts.responseMode === "retrieve_only";
		const res = await this.fetchWithTimeout(`${this.base}/api/query${this.qs()}`, {
			method: "POST",
			headers: this.jsonHeaders(),
			body: JSON.stringify({
				question: q,
				return_context: retrieveOnly,
				retrieve_only: retrieveOnly,
				history: opts.history ?? [],
				strategy: opts.strategy ?? null,
				...(this.graphName ? { graph_name: this.graphName } : {}),
			}),
		});
		if (!res.ok) throw await this.httpError("Query", res);
		const data = (await res.json()) as {
			answer?: string;
			documents?: unknown[];
			context?: unknown;
		};
		if (!retrieveOnly) return { answer: data.answer ?? "" };

		const documents = this._extractDocumentsFromContext(data);
		return { documents, count: documents.length };
	}

	// ── Ingest text / markdown / PDF ─────────────────────────────────────────

	/**
	 * Ingest a text string as a named file.
	 * document name extension controls server parsing: .txt / .md = plain text, .pdf = PDF extraction.
	 */
	async ingest(
		text: string,
		documentName = "document.txt",
		opts: IngestOptions = {},
	): Promise<IngestResult> {
		const form = new FormData();
		const ext = documentName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain";
		form.append("file", new Blob([text], { type: ext }), documentName);
		if (this.graphName) form.append("graph_name", this.graphName);
		if (opts.chunkingStrategy) form.append("chunking_strategy", opts.chunkingStrategy);
		if (opts.maxTokens !== undefined) form.append("max_tokens", String(opts.maxTokens));
		if (opts.overlapSentences !== undefined)
			form.append("overlap_sentences", String(opts.overlapSentences));
		if (opts.chunkSize !== undefined) form.append("chunk_size", String(opts.chunkSize));
		if (opts.chunkOverlap !== undefined) form.append("chunk_overlap", String(opts.chunkOverlap));
		if (opts.extractionStrategy) form.append("extraction_strategy", opts.extractionStrategy);
		if (opts.resolutionStrategy) form.append("resolution_strategy", opts.resolutionStrategy);
		if (opts.entityTypes) form.append("entity_types", opts.entityTypes);
		if (opts.skipFinalize) form.append("skip_finalize", "true");

		const res = await this.fetchWithTimeout(`${this.base}/api/ingest${this.qs()}`, {
			method: "POST",
			headers: this.multipartHeaders(),
			body: form,
		});
		if (!res.ok) throw await this.httpError("Ingest", res);
		return this._parseIngestSSE(await res.text());
	}

	/** Ingest raw binary bytes (e.g. a PDF buffer) directly. */
	async ingestBuffer(
		buf: Buffer | Uint8Array,
		documentName: string,
		opts: IngestOptions = {},
	): Promise<IngestResult> {
		const ext = documentName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain";
		const form = new FormData();
		// Normalize to a fresh ArrayBuffer-backed Uint8Array so it is a valid BlobPart
		// under the stricter typing (which excludes SharedArrayBuffer-backed views).
		form.append("file", new Blob([Uint8Array.from(buf)], { type: ext }), documentName);
		if (this.graphName) form.append("graph_name", this.graphName);
		if (opts.chunkingStrategy) form.append("chunking_strategy", opts.chunkingStrategy);
		if (opts.maxTokens !== undefined) form.append("max_tokens", String(opts.maxTokens));
		if (opts.overlapSentences !== undefined)
			form.append("overlap_sentences", String(opts.overlapSentences));
		if (opts.chunkSize !== undefined) form.append("chunk_size", String(opts.chunkSize));
		if (opts.chunkOverlap !== undefined) form.append("chunk_overlap", String(opts.chunkOverlap));
		if (opts.extractionStrategy) form.append("extraction_strategy", opts.extractionStrategy);
		if (opts.resolutionStrategy) form.append("resolution_strategy", opts.resolutionStrategy);
		if (opts.entityTypes) form.append("entity_types", opts.entityTypes);
		if (opts.skipFinalize) form.append("skip_finalize", "true");

		const res = await this.fetchWithTimeout(`${this.base}/api/ingest${this.qs()}`, {
			method: "POST",
			headers: this.multipartHeaders(),
			body: form,
		});
		if (!res.ok) throw await this.httpError("Ingest", res);
		return this._parseIngestSSE(await res.text());
	}

	// ── Ingest GitHub repo ───────────────────────────────────────────────────

	/**
	 * Ingest all markdown files from a public GitHub repo.
	 * Uses /api/ingest/github/preview to discover .md files,
	 * fetches each from raw.githubusercontent.com, then ingests via /api/ingest.
	 */
	async ingestGithub(
		repoUrl: string,
		ref?: string,
		opts: IngestOptions = {},
	): Promise<IngestGithubResult> {
		const previewRes = await this.fetchWithTimeout(
			`${this.base}/api/ingest/github/preview${this.qs()}`,
			{
				method: "POST",
				headers: this.jsonHeaders(),
				body: JSON.stringify({
					url: repoUrl,
					ref: ref || null,
					...(this.graphName ? { graph_name: this.graphName } : {}),
				}),
			},
		);
		if (!previewRes.ok) throw await this.httpError("GitHub preview", previewRes);
		const preview = (await previewRes.json()) as {
			owner: string;
			repo: string;
			ref: string;
			files: Array<{ path: string; size: number }>;
		};
		if (!preview.files?.length) throw new Error(`No markdown files found in ${repoUrl}`);

		const { owner, repo } = preview;
		const gitRef = preview.ref ?? "HEAD";
		let totalNodes = 0,
			totalRels = 0;
		const ingested: string[] = [],
			skipped: Array<{ path: string; reason: string }> = [];

		for (const file of preview.files) {
			const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${gitRef}/${file.path}`;
			try {
				const fileRes = await this.fetchWithTimeout(rawUrl, { method: "GET" });
				if (!fileRes.ok) {
					skipped.push({
						path: file.path,
						reason: `Failed to fetch file content (HTTP ${fileRes.status})`,
					});
					continue;
				}
				const text = await fileRes.text();
				if (!text.trim()) {
					skipped.push({ path: file.path, reason: "File content is empty" });
					continue;
				}
				const fname = file.path.split("/").pop() ?? file.path;
				const result = await this.ingest(text, fname, { ...opts, skipFinalize: true });
				totalNodes += result.nodesCreated;
				totalRels += result.relationshipsCreated;
				ingested.push(file.path);
			} catch (error) {
				skipped.push({ path: file.path, reason: (error as Error).message });
			}
		}

		let finalized = false;
		if (ingested.length > 0) {
			await this.finalize();
			finalized = true;
		}

		return {
			repoUrl,
			filesIngested: ingested.length,
			totalNodesCreated: totalNodes,
			totalRelationshipsCreated: totalRels,
			files: ingested,
			skippedFiles: skipped,
			finalized,
		};
	}

	// ── Finalize (run embeddings + dedup after batch ingest) ─────────────────

	/**
	 * Run the finalization pipeline (embeddings, dedup, indices) after
	 * a batch of documents was ingested with skip_finalize=true.
	 * Only needed when you call ingest manually with skipFinalize option.
	 */
	async finalize(): Promise<{ status: string }> {
		const res = await this.fetchWithTimeout(`${this.base}/api/ingest/finalize${this.qs()}`, {
			method: "POST",
			headers: this.jsonHeaders(),
			body: JSON.stringify(this.graphName ? { graph_name: this.graphName } : {}),
		});
		if (!res.ok) throw await this.httpError("Finalize", res);
		const raw = await res.text();
		const last =
			raw
				.split("\n")
				.filter((l) => l.startsWith("data:"))
				.pop() ?? "";
		try {
			return JSON.parse(last.slice(5).trim()) as { status: string };
		} catch {
			return { status: "complete" };
		}
	}

	// ── Documents list ───────────────────────────────────────────────────────

	/** List all ingested documents tracked in the knowledge graph. */
	async listDocuments(): Promise<
		Array<{
			id: string;
			name: string;
			size?: number;
			chunkCount?: number;
			entityCount?: number;
			relationCount?: number;
		}>
	> {
		const res = await this.fetchWithTimeout(`${this.base}/api/documents${this.qs()}`, {
			method: "GET",
			headers: { "X-Requested-With": "XMLHttpRequest", ...this.authHeader },
		});
		if (!res.ok) throw await this.httpError("List documents", res);
		const raw = (await res.json()) as unknown;
		// Server may return a plain array or { documents: [...] }
		const arr = Array.isArray(raw) ? raw : ((raw as { documents: unknown[] }).documents ?? []);
		return (
			arr as Array<{
				id: string;
				name: string;
				size?: number;
				chunk_count?: number;
				entity_count?: number;
				relation_count?: number;
			}>
		).map((d) => ({
			id: d.id,
			name: d.name,
			size: d.size,
			chunkCount: d.chunk_count,
			entityCount: d.entity_count,
			relationCount: d.relation_count,
		}));
	}

	// ── Update document (in-place) ───────────────────────────────────────────

	/**
	 * Update a previously-ingested document in place via PUT /api/documents/{name}.
	 * The server diffs chunk hashes: unchanged chunks are reused from the graph
	 * (zero LLM calls), only changed chunks are re-extracted. Identical content
	 * short-circuits to a no-op.
	 */
	async updateDocument(
		documentName: string,
		text: string,
		opts: UpdateDocumentOptions = {},
	): Promise<UpdateDocumentResult> {
		const form = new FormData();
		form.append("file", new Blob([text], { type: "text/plain" }), documentName);
		if (opts.chunkingStrategy) form.append("chunking_strategy", opts.chunkingStrategy);
		if (opts.maxTokens !== undefined) form.append("max_tokens", String(opts.maxTokens));
		if (opts.overlapSentences !== undefined)
			form.append("overlap_sentences", String(opts.overlapSentences));
		if (opts.chunkSize !== undefined) form.append("chunk_size", String(opts.chunkSize));
		if (opts.chunkOverlap !== undefined) form.append("chunk_overlap", String(opts.chunkOverlap));
		if (opts.resolutionStrategy) form.append("resolution_strategy", opts.resolutionStrategy);
		if (opts.entityTypes) form.append("entity_types", opts.entityTypes);
		if (opts.upsert) form.append("upsert", "true");
		if (opts.useChunkCache === false) form.append("use_chunk_cache", "false");

		// Encode per segment: server routes use {doc_name:path}, slashes must stay literal.
		const encodedName = documentName.split("/").map(encodeURIComponent).join("/");
		const res = await this.fetchWithTimeout(
			`${this.base}/api/documents/${encodedName}${this.qs()}`,
			{
				method: "PUT",
				headers: this.multipartHeaders(),
				body: form,
			},
		);
		if (!res.ok) throw await this.httpError("Update document", res);
		const data = (await res.json()) as {
			status?: string;
			document?: string;
			document_id?: string;
			no_op?: boolean;
			nodes_created?: number;
			relationships_created?: number;
			chunks_indexed?: number;
			cached_chunks?: number;
			extracted_chunks?: number;
		};
		return {
			status: data.status ?? "updated",
			document: data.document ?? documentName,
			documentId: data.document_id ?? documentName,
			noOp: data.no_op ?? false,
			nodesCreated: data.nodes_created ?? 0,
			relationshipsCreated: data.relationships_created ?? 0,
			chunksIndexed: data.chunks_indexed ?? 0,
			cachedChunks: data.cached_chunks ?? 0,
			extractedChunks: data.extracted_chunks ?? 0,
		};
	}

	// ── Delete document ──────────────────────────────────────────────────────

	/**
	 * Delete an ingested document (and its now-orphaned chunks/entities) via
	 * DELETE /api/documents/{id}. Sends the X-Confirm-Delete header the server
	 * requires for destructive operations.
	 */
	async deleteDocument(documentId: string): Promise<DeleteDocumentResult> {
		const encodedId = documentId.split("/").map(encodeURIComponent).join("/");
		const res = await this.fetchWithTimeout(`${this.base}/api/documents/${encodedId}${this.qs()}`, {
			method: "DELETE",
			headers: {
				"X-Requested-With": "XMLHttpRequest",
				"X-Confirm-Delete": "true",
				...this.authHeader,
			},
		});
		if (!res.ok) throw await this.httpError("Delete document", res);
		const data = (await res.json().catch(() => ({}))) as { status?: string };
		return { status: data.status ?? "deleted", documentId };
	}

	private _extractDocumentsFromContext(data: {
		documents?: unknown[];
		context?: unknown;
	}): unknown[] {
		if (Array.isArray(data.documents)) return data.documents;
		if (Array.isArray(data.context)) return data.context;
		if (!data.context || typeof data.context !== "object") return [];

		const context = data.context as {
			documents?: unknown[];
			source_chunks?: unknown[];
			chunks?: unknown[];
		};
		if (Array.isArray(context.documents)) return context.documents;
		if (Array.isArray(context.source_chunks)) return context.source_chunks;
		if (Array.isArray(context.chunks)) return context.chunks;
		return [context];
	}

	// ── SSE parser ───────────────────────────────────────────────────────────

	private _parseIngestSSE(raw: string): IngestResult {
		const lines = raw
			.split("\n")
			.filter((l) => l.startsWith("data:"))
			.map((l) => l.slice(5).trim())
			.filter(Boolean);
		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const p = JSON.parse(lines[i]) as {
					status?: string;
					nodes_created?: number;
					relationships_created?: number;
					chunks_indexed?: number;
					message?: string;
				};
				if (p.status === "complete" || p.nodes_created !== undefined) {
					return {
						status: p.status ?? "complete",
						nodesCreated: p.nodes_created ?? 0,
						relationshipsCreated: p.relationships_created ?? 0,
						chunksIndexed: p.chunks_indexed ?? 0,
					};
				}
				if (p.message && p.message.toLowerCase().includes("error"))
					throw new Error(`Ingest error: ${p.message}`);
			} catch (e) {
				if ((e as Error).message.startsWith("Ingest error:")) throw e;
			}
		}
		return { status: "complete", nodesCreated: 0, relationshipsCreated: 0, chunksIndexed: 0 };
	}
}
