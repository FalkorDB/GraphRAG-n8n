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
 */

export interface GraphRagConfig {
	serverUrl: string;
	bearerToken?: string;
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface QuestionResult {
	answer: string;
}

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
	skippedFiles: string[];
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
}

// ── Query options ─────────────────────────────────────────────────────────────

export interface QueryOptions {
	/** Retrieval strategy: auto (default) | local | multi_path */
	strategy?: "auto" | "local" | "multi_path";
	/** Conversation history: array of {role, content} messages */
	history?: Array<{ role: string; content: string }>;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class GraphRagClient {
	private readonly base: string;
	private readonly authHeader: Record<string, string>;

	constructor(config: GraphRagConfig) {
		this.base = config.serverUrl.replace(/\/$/, "");
		this.authHeader = config.bearerToken ? { Authorization: `Bearer ${config.bearerToken}` } : {};
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

	// ── Ask Question ────────────────────────────────────────────────────────────

	/**
	 * Ask a natural-language question.
	 * strategy: "auto" (default) | "local" | "multi_path"
	 */
	async question(q: string, opts: QueryOptions = {}): Promise<QuestionResult> {
		const res = await fetch(`${this.base}/api/query`, {
			method: "POST",
			headers: this.jsonHeaders(),
			body: JSON.stringify({
				question: q,
				return_context: false,
				history: opts.history ?? [],
				strategy: opts.strategy ?? null,
			}),
		});
		if (!res.ok) throw new Error(`Query failed (HTTP ${res.status}): ${await res.text()}`);
		const data = (await res.json()) as { answer: string };
		return { answer: data.answer ?? "" };
	}

	// ── Ingest text / markdown / PDF ─────────────────────────────────────────

	/**
	 * Ingest a text string as a named file.
	 * filename extension controls server parsing: .txt / .md = plain text, .pdf = PDF extraction.
	 */
	async ingest(
		text: string,
		filename = "document.txt",
		opts: IngestOptions = {},
	): Promise<IngestResult> {
		const form = new FormData();
		const ext = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain";
		form.append("file", new Blob([text], { type: ext }), filename);
		if (opts.chunkingStrategy) form.append("chunking_strategy", opts.chunkingStrategy);
		if (opts.maxTokens !== undefined) form.append("max_tokens", String(opts.maxTokens));
		if (opts.overlapSentences !== undefined)
			form.append("overlap_sentences", String(opts.overlapSentences));
		if (opts.chunkSize !== undefined) form.append("chunk_size", String(opts.chunkSize));
		if (opts.chunkOverlap !== undefined) form.append("chunk_overlap", String(opts.chunkOverlap));
		if (opts.extractionStrategy) form.append("extraction_strategy", opts.extractionStrategy);
		if (opts.resolutionStrategy) form.append("resolution_strategy", opts.resolutionStrategy);
		if (opts.entityTypes) form.append("entity_types", opts.entityTypes);

		const res = await fetch(`${this.base}/api/ingest`, {
			method: "POST",
			headers: this.multipartHeaders(),
			body: form,
		});
		if (!res.ok) throw new Error(`Ingest failed (HTTP ${res.status}): ${await res.text()}`);
		return this._parseIngestSSE(await res.text());
	}

	/** Ingest raw binary bytes (e.g. a PDF buffer) directly. */
	async ingestBuffer(
		buf: Buffer | Uint8Array,
		filename: string,
		opts: IngestOptions = {},
	): Promise<IngestResult> {
		const ext = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain";
		const form = new FormData();
		// Normalize to a fresh ArrayBuffer-backed Uint8Array so it is a valid BlobPart
		// under the stricter typing (which excludes SharedArrayBuffer-backed views).
		form.append("file", new Blob([Uint8Array.from(buf)], { type: ext }), filename);
		if (opts.chunkingStrategy) form.append("chunking_strategy", opts.chunkingStrategy);
		if (opts.maxTokens !== undefined) form.append("max_tokens", String(opts.maxTokens));
		if (opts.overlapSentences !== undefined)
			form.append("overlap_sentences", String(opts.overlapSentences));
		if (opts.chunkSize !== undefined) form.append("chunk_size", String(opts.chunkSize));
		if (opts.chunkOverlap !== undefined) form.append("chunk_overlap", String(opts.chunkOverlap));
		if (opts.extractionStrategy) form.append("extraction_strategy", opts.extractionStrategy);
		if (opts.resolutionStrategy) form.append("resolution_strategy", opts.resolutionStrategy);
		if (opts.entityTypes) form.append("entity_types", opts.entityTypes);

		const res = await fetch(`${this.base}/api/ingest`, {
			method: "POST",
			headers: this.multipartHeaders(),
			body: form,
		});
		if (!res.ok) throw new Error(`Ingest failed (HTTP ${res.status}): ${await res.text()}`);
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
		const previewRes = await fetch(`${this.base}/api/ingest/github/preview`, {
			method: "POST",
			headers: this.jsonHeaders(),
			body: JSON.stringify({ url: repoUrl, ref: ref || null }),
		});
		if (!previewRes.ok) {
			throw new Error(
				`GitHub preview failed (HTTP ${previewRes.status}): ${await previewRes.text()}`,
			);
		}
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
			skipped: string[] = [];

		for (const file of preview.files) {
			const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${gitRef}/${file.path}`;
			try {
				const fileRes = await fetch(rawUrl);
				if (!fileRes.ok) {
					skipped.push(file.path);
					continue;
				}
				const text = await fileRes.text();
				if (!text.trim()) {
					skipped.push(file.path);
					continue;
				}
				const fname = file.path.split("/").pop() ?? file.path;
				const result = await this.ingest(text, fname, opts);
				totalNodes += result.nodesCreated;
				totalRels += result.relationshipsCreated;
				ingested.push(file.path);
			} catch {
				skipped.push(file.path);
			}
		}
		return {
			repoUrl,
			filesIngested: ingested.length,
			totalNodesCreated: totalNodes,
			totalRelationshipsCreated: totalRels,
			files: ingested,
			skippedFiles: skipped,
		};
	}

	// ── Finalize (run embeddings + dedup after batch ingest) ─────────────────

	/**
	 * Run the finalization pipeline (embeddings, dedup, indices) after
	 * a batch of documents was ingested with skip_finalize=true.
	 * Only needed when you call ingest manually with skipFinalize option.
	 */
	async finalize(): Promise<{ status: string }> {
		const res = await fetch(`${this.base}/api/ingest/finalize`, {
			method: "POST",
			headers: this.jsonHeaders(),
			body: "{}",
		});
		if (!res.ok) throw new Error(`Finalize failed (HTTP ${res.status}): ${await res.text()}`);
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
		const res = await fetch(`${this.base}/api/documents`, {
			headers: { "X-Requested-With": "XMLHttpRequest", ...this.authHeader },
		});
		if (!res.ok) throw new Error(`List documents failed (HTTP ${res.status}): ${await res.text()}`);
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
