# n8n-nodes-falkordb-graphrag

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/n8n-nodes-falkordb-graphrag.svg)](https://www.npmjs.com/package/n8n-nodes-falkordb-graphrag)
[![PR Checks](https://github.com/FalkorDB/GraphRAG-n8n/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/FalkorDB/GraphRAG-n8n/actions/workflows/pr-checks.yml)
[![Spellcheck](https://github.com/FalkorDB/GraphRAG-n8n/actions/workflows/spellcheck.yml/badge.svg)](https://github.com/FalkorDB/GraphRAG-n8n/actions/workflows/spellcheck.yml)

An [n8n](https://n8n.io) **community node** that connects your workflows to a
[FalkorDB GraphRAG-Server](https://github.com/FalkorDB/GraphRAG-Server). Ingest
documents into a knowledge graph and answer natural-language questions against it —
either as a normal pipeline step or as a tool an AI Agent can call autonomously.

---

## Table of contents

- [What is GraphRAG?](#what-is-graphrag)
- [Features](#features)
- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Credentials](#credentials)
- [Usage](#usage)
  - [Pipeline node — FalkorDB Graph RAG](#pipeline-node--falkordb-graph-rag)
  - [AI Agent tool — FalkorDB Graph RAG Tool](#ai-agent-tool--falkordb-graph-rag-tool)
  - [Operations reference](#operations-reference)
  - [Advanced ingest options](#advanced-ingest-options)
  - [Example workflows](#example-workflows)
- [Contributing](#contributing)
- [Continuous integration](#continuous-integration)
- [Releases](#releases)
- [License](#license)

---

## What is GraphRAG?

GraphRAG (graph-based retrieval-augmented generation) turns your documents into a
**knowledge graph** of entities and relationships, then answers questions by
retrieving the relevant sub-graph and feeding it to an LLM. Compared to plain
vector RAG, the graph captures how facts connect, which improves multi-hop
reasoning and grounding. FalkorDB provides the graph database and the
GraphRAG-Server handles ingestion, entity extraction, embedding, and retrieval.

## Features

  | **Ingest GitHub Repo** | Discover and ingest every Markdown file in a public GitHub repository. |
  | **List Documents** | List all documents that have been ingested. |

- **Named graph support** — a **Graph Name** field on every operation lets you target
  a specific FalkorDB graph; leave it blank to use the server default.
- **Flexible GitHub ingestion** — specify a branch, tag, or commit SHA to pin the
  exact revision you want to ingest.
- **Advanced ingest options** — chunking strategy, chunk size and overlap, entity
  types to extract, and duplicate-resolution strategy.
- **Three retrieval strategies** — `auto`, `local` (fast, single-hop), or
  `multi_path` (deeper, multi-hop).
- **Retriever/generator split support** — set **Ask Question** to **Retrieve Only**
  to retrieve context in FalkorDB and generate the final answer in your own n8n
  chat model.
- **AI Agent-ready** — the Tool node pre-fills parameters with `$fromAI()`
  expressions so the LLM can fill them from the conversation automatically.
- **Ten importable example workflows** covering all operations and end-to-end
  patterns (see [`workflows/`](workflows)).

## How it works

```text
 n8n workflow ──▶ FalkorDB Graph RAG node ──HTTP──▶ GraphRAG-Server ──▶ FalkorDB
   (you)            (this package)                    (you run it)       (graph DB)
```

The node is a thin HTTP client. It never talks to FalkorDB directly; it calls the
GraphRAG-Server REST API (`/api/ingest`, `/api/query`, `/api/documents`, …) and
returns the structured JSON response as n8n item data.

## Prerequisites

- **n8n** `>= 1.0` running in self-hosted mode (required to install community nodes).
- A reachable **FalkorDB GraphRAG-Server** instance — see the
  [server setup guide](https://github.com/FalkorDB/GraphRAG-Server). Note the base
  URL (e.g. `http://localhost:8000`) and an API token if the server has
  authentication enabled. For hosted usage, use `https://graphrag.falkordb.com`
  and create a token in **Settings → API Tokens**.

## Installation

### From the n8n UI (recommended)

1. Open n8n, go to **Settings → Community Nodes → Install**.
2. Enter the package name `n8n-nodes-falkordb-graphrag` and confirm.
3. After installation the **FalkorDB Graph RAG** and **FalkorDB Graph RAG Tool**
   nodes appear in the node panel under the _FalkorDB_ category.

### Manually (self-hosted)

```bash
# in your n8n custom-nodes folder, typically ~/.n8n/nodes
npm install n8n-nodes-falkordb-graphrag
```

Restart n8n after installation. For more details see the n8n docs on
[installing community nodes](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

Both nodes share a single credential type — **FalkorDB GraphRAG Server API**:

| Field | Required | Description |
| --- | --- | --- |
| **Server URL** | yes | Base URL of your GraphRAG-Server, e.g. `http://localhost:8000`. |
| **API Token** | no | Sent as `Authorization: Bearer …`. Create it in GraphRAG-Server **Settings → API Tokens**. |
| **Request Timeout (Seconds)** | yes | Per-request timeout. Requests abort when this limit is reached. |

Create the credential once under **Credentials → New → FalkorDB GraphRAG Server API**
and reuse it across all nodes. Leave **API Token** blank only when your server
does not require authentication.

## Usage

### Pipeline node — FalkorDB Graph RAG

The **FalkorDB Graph RAG** node fits into any regular workflow. It receives items
on its `main` input, executes the chosen operation for each item, and passes results
to the `main` output. Use it to ingest documents as part of a data pipeline, run
scheduled question-answering jobs, or check the ingestion queue.

For **Ask Question**, choose a retrieval strategy and response mode:

- `Answer` mode returns the server-generated answer.
- `Retrieve Only` mode returns `{ question, documents, count }` so your own chat
  model can generate the final answer.

The node intentionally returns retrieve-only `context` as received from
GraphRAG-Server. If you see duplicated passages or `score: null`, verify with a
direct server call first (outside n8n):

```bash
curl -sS -X POST "$SERVER/api/query?graph_name=<yourGraph>" \
  -H "Authorization: ******" -H "X-Requested-With: XMLHttpRequest" \
  -H "Content-Type: application/json" \
  -d '{"question":"What are the main components?","retrieve_only":true,"return_context":true,"strategy":"local"}' \
  | jq '.context'
```

See [`workflows/04_action_ask_question.json`](workflows/04_action_ask_question.json)
and [`workflows/10_action_retrieve_only_chat_model.json`](workflows/10_action_retrieve_only_chat_model.json).

```
[Trigger] ──▶ [FalkorDB Graph RAG] ──▶ [Send Email / Slack / …]
```

### AI Agent tool — FalkorDB Graph RAG Tool

The **FalkorDB Graph RAG Tool** node connects to an **AI Agent** node's `ai_tool`
input. The agent decides when to call it, and its parameters are pre-filled with
`$fromAI()` expressions so the LLM fills them from the conversation automatically.
No manual wiring of input data is needed.

```
[Chat Trigger] ──▶ [AI Agent] ──ai_tool──▶ [FalkorDB Graph RAG Tool]
                      │
                      └──ai_language_model──▶ [OpenAI / Anthropic / …]
```

### Operations reference

Both nodes expose the same four operations. Configure the **Graph Name** field
(optional) if you want to target a named FalkorDB graph instead of the server
default.

#### Ask Question

Sends a natural-language question to the GraphRAG-Server and returns a structured
answer grounded in the knowledge graph.

| Parameter | Description | Default |
| --- | --- | --- |
| **Question** | The question to ask. | — |
| **Retrieval Strategy** | `auto` — server picks best; `local` — fast, single-hop; `multi_path` — deeper, multi-hop. | `auto` |
| **Graph Name** | Named graph to query. Leave blank for the server default. | _(blank)_ |

**Output** — `{ question, answer }`

#### Ingest Text

Sends a plain-text or Markdown document to the server for chunking, entity
extraction, and graph insertion.

| Parameter | Description | Default |
| --- | --- | --- |
| **Document Text** | The text content to ingest. Supports plain text and Markdown. | — |
| **Filename** | Filename hint for the server — use `.txt` for plain text, `.md` for Markdown. | `document.txt` |
| **Graph Name** | Named graph to ingest into. | _(blank)_ |
| **Advanced Options** | Reveal chunking and extraction controls (see below). | off |

**Output** — `{ filename, status, nodesCreated, relationshipsCreated, chunksIndexed }`

#### Ingest GitHub Repo

Discovers every Markdown file in a public GitHub repository and ingests them all
in a single operation.

| Parameter | Description | Default |
| --- | --- | --- |
| **GitHub Repo URL** | Public repository URL, e.g. `https://github.com/FalkorDB/GraphRAG-SDK`. | — |
| **Branch / Tag / Commit** | Specific ref to ingest. Leave blank for the default branch. | _(blank, uses default branch)_ |
| **Graph Name** | Named graph to ingest into. | _(blank)_ |
| **Advanced Options** | Reveal chunking and extraction controls (see below). | off |

**Output** — `{ repoUrl, filesIngested, totalNodesCreated, totalRelationshipsCreated, files, skippedFiles }`

#### List Documents

Returns a list of all documents that have been ingested into the knowledge graph.

| Parameter | Description | Default |
| --- | --- | --- |
| **Graph Name** | Named graph to list documents from. | _(blank)_ |

**Output** — `{ documents: [...], count }`

### Advanced ingest options

Toggle **Advanced Options** on the Ingest Text or Ingest GitHub Repo operations to
reveal these controls:

| Option | Description | Default |
| --- | --- | --- |
| **Chunking Strategy** | `sentence_token_cap` — sentence-aware chunks capped at a token limit; `fixed_size` — fixed-width token windows. | `sentence_token_cap` |
| **Max Tokens Per Chunk** | Token cap per chunk (64–2048). Used with `sentence_token_cap`. | 256 |
| **Overlap Sentences** | Number of sentences of overlap between consecutive chunks (0–10). Used with `sentence_token_cap`. | 1 |
| **Chunk Size (Tokens)** | Tokens per chunk (100–5000). Used with `fixed_size`. | 1000 |
| **Chunk Overlap (Tokens)** | Token overlap between consecutive fixed-size chunks (0–500). | 100 |
| **Resolution Strategy** | How duplicate entities are resolved: `exact` (default), `description_merge`, `semantic`, `llm_verified`, or `all`. | `exact` |
| **Entity Types** | Comma-separated list of entity types to extract, e.g. `Person,Organization`. Leave blank to extract all types. | _(blank, all types)_ |

### Example workflows

Import any file from [`workflows/`](workflows) via **Workflows → Import from File**
in n8n.

After importing, update the credential references: pipeline examples (`01`–`04`, `09`)
need the **FalkorDB GraphRAG Server API** credential, and the AI Agent tool examples
(`05`–`08`) also need an **AI model** credential (e.g. OpenAI) attached to the
Agent node.

| File | Node style | Operation |
| --- | --- | --- |
| [`01_action_ingest_text.json`](workflows/01_action_ingest_text.json) | Pipeline | Ingest Text |
| [`02_action_ingest_github.json`](workflows/02_action_ingest_github.json) | Pipeline | Ingest GitHub Repo |
| [`03_action_list_documents.json`](workflows/03_action_list_documents.json) | Pipeline | List Documents |
| [`04_action_ask_question.json`](workflows/04_action_ask_question.json) | Pipeline | Ask Question |
| [`05_tool_ingest_text.json`](workflows/05_tool_ingest_text.json) | AI Agent tool | Ingest Text |
| [`06_tool_ingest_github.json`](workflows/06_tool_ingest_github.json) | AI Agent tool | Ingest GitHub Repo |
| [`07_tool_list_documents.json`](workflows/07_tool_list_documents.json) | AI Agent tool | List Documents |
| [`08_tool_ask_question.json`](workflows/08_tool_ask_question.json) | AI Agent tool | Ask Question |
| [`09_action_ingest_and_verify_falkordb_docs.json`](workflows/09_action_ingest_and_verify_falkordb_docs.json) | Pipeline | Ingest + verify FalkorDB docs end-to-end |
| [`10_action_retrieve_only_chat_model.json`](workflows/10_action_retrieve_only_chat_model.json) | Pipeline + chat model | Retrieve only -> generate final answer |

## Contributing

Contributions are welcome! Every check — formatting, linting, building, testing —
runs through [`just`](https://github.com/casey/just), so the command you run locally
is identical to what CI runs.

### Set up

```bash
git clone https://github.com/FalkorDB/GraphRAG-n8n.git
cd GraphRAG-n8n
just install        # npm ci --ignore-scripts
```

### Development recipes

Run `just --list` to see all available recipes. The most useful ones:

| Recipe | What it does |
| --- | --- |
| `just check` | Fast pre-commit loop: `fmt`, `lint`, `build`. |
| `just ci` | Full CI gate: `fmt-check`, `lint`, `build`, `test`. |
| `just done` | Definition-of-done: `ci` + `coverage` + `spellcheck`. Run before opening a PR. |
| `just fmt` / `just fmt-check` | Auto-format with Prettier / check formatting only. |
| `just lint` / `just lintfix` | Lint with `eslint-plugin-n8n-nodes-base` / auto-fix. |
| `just build` | Compile TypeScript to `dist/` and copy node icons. |
| `just test` | Run Vitest once. |
| `just coverage` | Run Vitest with V8 coverage (matches the CI coverage job). |
| `just spellcheck` | Spellcheck Markdown docs with `pyspelling` + `aspell`. |

### Conventions

- **Conventional Commits.** PR titles and commits use
  [Conventional Commits](https://www.conventionalcommits.org/) prefixes (`feat:`,
  `fix:`, `docs:`, `ci:`, …). The PR title becomes the squash-merge subject and
  drives the automated release — keep it clean and spellcheck-friendly. Mark
  breaking changes with `feat!:`.
- **Green before review.** Run `just done` and confirm it passes before opening a PR.
- **Spellcheck new terms.** Add any new public term or type name that appears in
  docs to [`.github/wordlist.txt`](.github/wordlist.txt), or backtick it
  (`` `TypeName` ``) so the spellchecker ignores it.
- **Never self-merge.** Open the PR, get it green, and wait for maintainer approval.

Full contributor conventions are in
[`.github/copilot-instructions.md`](.github/copilot-instructions.md).

## Continuous integration

| Workflow | Trigger | What it runs |
| --- | --- | --- |
| [`pr-checks.yml`](.github/workflows/pr-checks.yml) | PRs to `main` | `fmt-check`, `lint`, `build`, `test`, `coverage` — all via `just`. |
| [`spellcheck.yml`](.github/workflows/spellcheck.yml) | push / PR to `main` | Spellcheck Markdown docs and the PR title. |
| [`release.yml`](.github/workflows/release.yml) | push to `main` | release-please release PR; `npm publish` on release tag. |

`main` is protected: all PR-check jobs must be green and one approving review is
required before merge.

## Releases

Releases are fully automated with
[release-please](https://github.com/googleapis/release-please):

1. Merge one or more Conventional-Commit PRs into `main`.
2. release-please opens (or updates) a **release PR** that bumps the version in
   `package.json` and regenerates `CHANGELOG.md` from the commit history. Do not
   hand-edit released CHANGELOG sections.
3. **Merge the release PR** — this tags the commit and publishes a GitHub Release.
4. The release event triggers the `publish-npm` job, which runs `npm publish`.

Version-bump rules: `feat:` → minor, `fix:` → patch, `feat!:` / `BREAKING CHANGE:`
footer → major.

### Required repository secrets

| Secret | Purpose | Required |
| --- | --- | --- |
| `NPM_TOKEN` | Publish to the npm registry | Yes, to publish |
| `CODECOV_TOKEN` | Upload coverage to Codecov | Optional |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## License

[MIT](LICENSE) © FalkorDB
