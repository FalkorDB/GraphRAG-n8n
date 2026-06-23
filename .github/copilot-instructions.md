# Copilot / AI agent instructions for `n8n-nodes-falkordb-graphrag`

Guidance for GitHub Copilot and other AI agents working in this repository. It encodes
the team's engineering conventions so changes land clean on the first try. Human
contributors should follow it too.

This package is an **n8n community node** that wraps the
[FalkorDB GraphRAG-Server](https://github.com/FalkorDB/GraphRAG-Server). It ships two
nodes — a pipeline node (`graphRagAction`) and an AI Agent tool node (`graphRag`) — plus
one credential, over a small HTTP client in `src/GraphRagClient.ts`. It is written in
**TypeScript**, built with `tsc` + `gulp`, tested with **Vitest**, and linted with
**ESLint** (`eslint-plugin-n8n-nodes-base`) and **Prettier**.

## Golden rule: drive everything through `just`

For **any** action CI performs (format, lint, build, test, coverage, spellcheck), run
the **exact same `just` recipe CI uses** — never a raw `npm`/`npx` command. If a check
needs changing, update the `just` recipe (and the npm script it wraps) **and** the CI
workflow together so they stay identical. Run `just --list` to see every recipe.

Each recipe wraps an npm script (the single source of truth for the underlying tool
invocation), so `just` and `npm run` never drift.

| Recipe | Purpose |
| --- | --- |
| `just install` | `npm ci --ignore-scripts` (skips native add-ons we never run). |
| `just check` | Fast pre-commit loop: `fmt lint build`. |
| `just ci` | Required CI gates, in CI order: `fmt-check lint build test`. |
| `just done` | Definition-of-done gate: `ci` **plus** `coverage` and `spellcheck`. |
| `just fmt` / `just fmt-check` | Format with Prettier / check formatting. |
| `just lint` / `just lintfix` | Lint with the n8n-nodes-base rules / auto-fix. |
| `just build` | Compile to `dist/` and copy node icons. |
| `just test` / `just test-one <filter>` | Run Vitest once / a single file or name. |
| `just coverage` | V8 coverage report (matches the `check-coverage` CI job). |
| `just spellcheck` | Spellcheck the Markdown docs. |
| `just spellcheck-pr-title` | Spellcheck a PR title (`PR_TITLE='…' just spellcheck-pr-title`). |

## Definition of done for a change

1. **Design first** for non-trivial work, and **rubber-duck review** the design before coding.
2. **Implement** the change with code **+ tests + docs** (update `README.md` and the
   relevant doc-comments). On every change, **check and align all documentation** — see
   "Keep documentation in sync" below.
3. **Validate locally via `just`** — `just done` green (which runs `ci`, `coverage` and
   `spellcheck`).
4. Open a PR on a `feat:` / `fix:` / `ci:` / `docs:` branch with a Conventional-Commit title.
5. **Resolve every AI review thread** (Copilot **and** CodeRabbit) — reply *and* mark
   resolved — before merge. Copilot auto-reviews on push here.
6. **Never merge to `main` yourself — wait for explicit human approval.** Do **not** run
   any `gh pr merge …` variant to self-merge, even when every check is green and all AI
   threads are resolved. Open the PR, get it green, and **stop** until the maintainer
   approves. After a human merges, release-please handles the release.

## Keep documentation in sync

On **every** change, check and align **all** documentation so it never drifts from the
code — treat "the docs match the code" as part of the definition of done:

- **`README.md`** is hand-written. When you add/rename a node, operation, credential
  field, or advanced option, update the matching table and example in the README.
- **Example workflows** in `workflows/` should stay importable and reflect the current
  node `type` names and parameters.
- **Doc-comments** in `src/`, `nodes/`, and `credentials/` should match the behavior.

## Flaky tests are a hard no

Fix a flaky test **immediately, as top priority**, regardless of the current task or
whether the flake is a pre-existing / non-regression issue. Flaky tests slow everyone
down. Find the root cause rather than papering over it.

## Coverage

Keep patch coverage high (aim **≥ 95%**). Measure with the exact CI command
(`just coverage`), not an ad-hoc count. Tests use a mocked `fetch` (see
`tests/GraphRagClient.test.ts`), so there is no network or server dependency — cover new
branches with table-driven cases.

## Spellcheck, commit subjects & PR titles

- **PR titles must be spellcheck-clean** — the `PRTitle` CI task checks every PR title
  against the same wordlist and fails it at PR time. Titles become the squash-merge
  commit subject (git history) and their Conventional-Commit prefix drives the release,
  so keep them clean at the source.
- When you add or rename a **public term / type name** that appears in the docs, add it
  to **`.github/wordlist.txt`**.
- In Markdown/docs, **backtick** code and type names (`` `GraphRagClient` ``) — backticked
  spans are ignored by the spellchecker.

## CHANGELOG & releases

This repo releases with **release-please** (the npm analog of release-plz), which differs
from a hand-written changelog:

- **`CHANGELOG.md` is generated** by release-please from Conventional-Commit history — do
  **not** hand-edit released sections. Write clear `feat:` / `fix:` commit and PR titles
  instead; they become the changelog entries.
- release-please keeps an open **release PR** that bumps `package.json` and updates
  `CHANGELOG.md`. Merging it tags the commit, publishes a GitHub Release, and triggers the
  `publish-npm` job (`.github/workflows/release.yml`).
- **Don't hardcode the next version** — release-please computes it: `feat` → minor, `fix`
  → patch, `feat!` / `BREAKING CHANGE:` → major.
- Internal-only types (`ci`, `chore`, `refactor`, `test`, `build`) are hidden from the
  changelog and ride along with the next release.
- Include a `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer
  on agent-authored commits.

## Code style

Keep code **tidy, simple, and efficient**. Match the surrounding style (tabs, double
quotes, semicolons — enforced by Prettier). Comment only what genuinely needs
clarification, not the obvious. Prefer the smallest change that fully solves the problem.

The `graphRag` node is an **AI Agent tool** (`inputs: []`, `outputs: ['ai_tool']`); the
two n8n-nodes-base rules that assume a regular node are intentionally disabled for it in
`.eslintrc.js` — don't "fix" its connections to `['main']`.
