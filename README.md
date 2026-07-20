# n8n-nodes-falkordb-graphrag

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/n8n-nodes-falkordb-graphrag.svg)](https://www.npmjs.com/package/n8n-nodes-falkordb-graphrag)
[![PR Checks](https://github.com/FalkorDB/GraphRAG-n8n/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/FalkorDB/GraphRAG-n8n/actions/workflows/pr-checks.yml)
[![Spellcheck](https://github.com/FalkorDB/GraphRAG-n8n/actions/workflows/spellcheck.yml/badge.svg)](https://github.com/FalkorDB/GraphRAG-n8n/actions/workflows/spellcheck.yml)

An [n8n](https://n8n.io) **community node** for [FalkorDB](https://www.falkordb.com)
GraphRAG. It lets you ingest documents into a knowledge graph and ask
natural-language questions against it, straight from your n8n workflows — either as
a normal pipeline step or as a tool an AI Agent can call.

It is a thin client over the
[FalkorDB GraphRAG-Server](https://github.com/FalkorDB/GraphRAG-Server): the node
sends ingest and query requests to a server you run, and the server does the
chunking, entity extraction, embedding and graph retrieval.

---

## What is GraphRAG?

GraphRAG (graph-based retrieval-augmented generation) turns your documents into a
**knowledge graph** of entities and relationships, then answers questions by
retrieving the relevant sub-graph and feeding it to an LLM. Compared to plain
vector RAG, the graph captures how facts connect, which improves multi-hop
reasoning and grounding. FalkorDB provides the underlying graph database and the
GraphRAG-Server provides the ingestion and retrieval pipeline.

## Features

- **Two nodes, one credential** — use whichever fits your workflow:
  - **FalkorDB Graph RAG** — a regular pipeline node (`main` input/output).
  - **FalkorDB Graph RAG Tool** — an AI Agent tool node the LLM can call on its own.
- **Pipeline node operations**:
  | Operation | What it does |
  | --- | --- |
  | **Ask Question** | Either return a server-generated answer or retrieve context only (`documents`) for your own chat model. |
  | **Ingest Text** | Ingest a plain-text or Markdown document. |
  | **Ingest GitHub Repo** | Discover and ingest every Markdown file in a public GitHub repo. |
  | **List Documents** | List everything that has been ingested. |
- **AI Tool node operations**:
  | Operation | What it does |
  | --- | --- |
  | **Retrieve Context** | Retrieves ranked context documents for the agent's downstream LLM answer generation. |
  | **Ingest Text** | Ingests plain-text, Markdown, or binary PDF input. |
  | **Ingest GitHub Repo** | Discovers and ingests every Markdown file in a public GitHub repo. |
- **Advanced ingest options** — chunking strategy, chunk size and overlap, entity
  types, and duplicate-resolution strategy.
- **Retrieval strategies** — `local` (default, fast, single-hop), `auto`, or `multi_path`
  with retriever/generator split support (retrieve in FalkorDB, generate in your chat model).
  (deeper, multi-hop).
- **Importable example workflows** for every operation (see [`workflows/`](workflows)).

## How it works

```text
 n8n workflow ──▶ FalkorDB Graph RAG node ──HTTP──▶ GraphRAG-Server ──▶ FalkorDB
   (you)            (this package)                    (you run it)       (graph DB)
```

The node never talks to the database directly; it calls the GraphRAG-Server REST
API (`/api/ingest`, `/api/query`, `/api/documents`, …).

## Prerequisites

- **n8n** `>= 1.0` (self-hosted, so you can install community nodes).
- A reachable **FalkorDB GraphRAG-Server** instance — see its
  [setup guide](https://github.com/FalkorDB/GraphRAG-Server). For production hosted usage,
  use `https://graphrag.falkordb.com` plus an API token from
  **Settings → API Tokens**.

## Installation

> The package is published to npm automatically by the [release workflow](#releases).
> Until the first release lands, install from source (see [Contributing](#contributing)).

### From the n8n UI (recommended)

1. In n8n, open **Settings → Community Nodes → Install**.
2. Enter the package name `n8n-nodes-falkordb-graphrag` and confirm.
3. After install, the **FalkorDB Graph RAG** and **FalkorDB Graph RAG Tool** nodes
   appear in the node panel.

### Manually (self-hosted)

```bash
# in your n8n custom-nodes folder, e.g. ~/.n8n/nodes
npm install n8n-nodes-falkordb-graphrag
```

Then restart n8n. See the n8n docs on
[installing community nodes](https://docs.n8n.io/integrations/community-nodes/installation/)
for details.

## Credentials

Both nodes use a single credential, **FalkorDB GraphRAG Server API**:

| Field | Required | Description |
| --- | --- | --- |
| **Server URL** | yes | Base URL of your GraphRAG-Server, e.g. `http://localhost:8000`. |
| **API Token** | no | Token sent in the `Authorization` header. Create it in GraphRAG-Server **Settings → API Tokens**. |
| **Request Timeout (Seconds)** | yes | Per-request timeout. Requests abort when this limit is reached. |

## Usage

### As a pipeline node — FalkorDB Graph RAG

Drop the node into any workflow, pick an **Operation**, and wire it inline. For
example, **Ask Question** takes a `Question` and a `Retrieval Strategy` and outputs
either:

- `Answer` mode: the server-generated answer, or
- `Retrieve only` mode: `{ question, documents, count }` for your own downstream LLM/chat model.

See [`workflows/04_action_ask_question.json`](workflows/04_action_ask_question.json).



### Retriever/generator split (recommended)

Use FalkorDB as retriever and your n8n chat model as generator:

```text
[Question] → FalkorDB Graph RAG (Retrieve only) → documents/context → Chat Model → answer
```

See [`workflows/10_action_retrieve_only_chat_model.json`](workflows/10_action_retrieve_only_chat_model.json).

### As an AI Agent tool — FalkorDB Graph RAG Tool

Connect the tool node to an **AI Agent** node's `ai_tool` input. The agent decides
when to call it and fills parameters from the conversation via the n8n `$fromAI`
expressions, so the LLM can ingest content and retrieve graph context on its own.
See [`workflows/08_tool_ask_question.json`](workflows/08_tool_ask_question.json).

### Example workflows

Import any file from [`workflows/`](workflows) via **Workflows → Import from File**.
After importing, update the credential references: the pipeline examples (`01`–`04`)
need the **FalkorDB GraphRAG Server API** credential, and the AI Agent tool examples
(`05`–`08`) additionally need an **AI model** credential (e.g. OpenAI) for the Agent.

| File | Node | Operation |
| --- | --- | --- |
| `01_action_ingest_text.json` | pipeline | Ingest Text |
| `02_action_ingest_github.json` | pipeline | Ingest GitHub Repo |
| `03_action_list_documents.json` | pipeline | List Documents |
| `04_action_ask_question.json` | pipeline | Ask Question |
| `05_tool_ingest_text.json` | AI Agent tool | Ingest Text |
| `06_tool_ingest_github.json` | AI Agent tool | Ingest GitHub Repo |
| `07_tool_list_documents.json` | AI Agent tool | Retrieve Context |
| `08_tool_ask_question.json` | AI Agent tool | Retrieve Context |
| `10_action_retrieve_only_chat_model.json` | pipeline + chat model | Retrieve only → generate final answer |

## Contributing

Contributions are welcome! This repository drives **every check through
[`just`](https://github.com/casey/just)**, so the command CI runs is the command you
run locally.

### Set up

```bash
git clone https://github.com/FalkorDB/GraphRAG-n8n.git
cd GraphRAG-n8n
just install        # npm ci --ignore-scripts
```

### Common recipes

Run `just --list` to see them all. The most useful:

| Recipe | Purpose |
| --- | --- |
| `just check` | Fast pre-commit loop: `fmt`, `lint`, `build`. |
| `just ci` | Every required CI gate: `fmt-check`, `lint`, `build`, `test`. |
| `just done` | `ci` plus `coverage` and `spellcheck` — the definition of done. |
| `just fmt` / `just fmt-check` | Format (Prettier) / check formatting. |
| `just lint` / `just lintfix` | Lint (`eslint-plugin-n8n-nodes-base`) / auto-fix. |
| `just build` | Compile TypeScript to `dist/` and copy node icons. |
| `just test` / `just coverage` | Run Vitest / produce a coverage report. |
| `just spellcheck` | Spellcheck the Markdown docs (needs `pyspelling` + `aspell`). |

### Conventions

- **Conventional Commits.** PR titles and commits follow
  [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, `ci:`, …). The PR title becomes the squash-merge subject and **drives the
  release**, so keep it clean and spellcheck-friendly (mark breaking changes with
  `feat!`).
- **Green before review.** Run `just done` and make sure it passes before opening a PR.
- **New terms** that appear in docs go in [`.github/wordlist.txt`](.github/wordlist.txt),
  or backtick code/type names so the spellchecker ignores them.
- **Never merge to `main` without maintainer approval.** Open the PR, get it green,
  and wait.

Full agent/contributor conventions live in
[`.github/copilot-instructions.md`](.github/copilot-instructions.md).

## Continuous integration

| Workflow | Trigger | What it runs |
| --- | --- | --- |
| [`pr-checks.yml`](.github/workflows/pr-checks.yml) | PRs to `main` | `fmt-check`, `lint`, `build`, `test`, `coverage` (each a `just` recipe). |
| [`spellcheck.yml`](.github/workflows/spellcheck.yml) | push / PR to `main` | Spellcheck the Markdown docs and the PR title. |
| [`release.yml`](.github/workflows/release.yml) | push to `main` | release-please release PR, then npm publish on release. |

`main` is protected: PRs need the PR-check jobs green and one approving review.

## Releases

Releases are automated with
[release-please](https://github.com/googleapis/release-please):

1. Merge Conventional-Commit PRs into `main`.
2. release-please keeps an open **release PR** that bumps the version in
   `package.json` and updates `CHANGELOG.md` from the commit history.
3. **Merge the release PR** to tag the commit and publish a GitHub Release.
4. That release triggers the `publish-npm` job, which runs `npm publish`.

`feat:` bumps the minor version, `fix:` the patch version, and `feat!:` (or a
`BREAKING CHANGE:` footer) the major version.

### Required secrets

| Secret | Used for | Required |
| --- | --- | --- |
| `NPM_TOKEN` | Publishing to the npm registry | Yes, to publish |
| `CODECOV_TOKEN` | Uploading coverage to Codecov | Optional |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## License

[MIT](LICENSE) © FalkorDB
