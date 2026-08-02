# Justfile — dev-cycle automation for @falkordb/n8n-nodes-graphrag.
#
# Run `just` (or `just --list`) to see every available recipe.
#
# Golden rule: every check CI runs is a `just` recipe here, so the exact command
# can be reproduced locally. Each recipe wraps an npm script (the single source of
# truth for the underlying tool invocation), so `just` and `npm run` never drift.

set shell := ["bash", "-uc"]

# Default recipe: list everything.
default:
    @just --list

# === Install =================================================================

# Install dependencies reproducibly from the lockfile. `--ignore-scripts` skips
# native add-on builds (e.g. isolated-vm pulled in transitively by n8n-workflow)
# that we never execute — we only need the TypeScript types at build/test time.

# Install dependencies reproducibly from the lockfile (skips native add-on builds).
install:
    npm ci --ignore-scripts

# === Format ==================================================================

# Format all TypeScript in place (Prettier).
fmt:
    npm run format

# Check formatting without modifying files (CI gate).
fmt-check:
    npm run format:check

# === Lint ====================================================================

# Lint nodes, credentials and package.json with the n8n-nodes-base rules (CI gate).
lint:
    npm run lint

# Lint and auto-fix what can be fixed.
lintfix:
    npm run lintfix

# === Build ===================================================================

# Compile TypeScript to dist/ and copy node + credential icons. This is also
# what `prepublishOnly` runs, so it validates the published artifact.

# Compile TypeScript to dist/ and copy node + credential icons (CI gate).
build:
    npm run build

# === Test ====================================================================

# Run the full unit-test suite once (Vitest, CI gate).
test:
    npm test

# Re-run tests in watch mode while developing.
test-watch:
    npm run test:watch

# Run a single test file or name filter, e.g. `just test-one GraphRagClient`.
test-one filter:
    npx vitest run {{filter}}

# Generate a V8 coverage report (matches the `coverage` CI job).
coverage:
    npm run test:coverage

# === Spellcheck ==============================================================
# Requires `pyspelling` (pip) and `aspell` (+ `aspell-en`) installed locally.

# Spellcheck the Markdown docs (CI gate).
spellcheck:
    pyspelling -c .github/spellcheck-settings.yml -n Markdown

# Spellcheck a pull-request title exactly as the Spellcheck CI gate does. PR titles
# become the squashed-merge commit subject and their Conventional-Commit prefix
# drives the release, so catch unknown words at the source. Set PR_TITLE first, e.g.
# `PR_TITLE='fix: handle ConnectionDown' just spellcheck-pr-title`.

# Spellcheck a PR title (set PR_TITLE first); matches the Spellcheck CI gate.
spellcheck-pr-title:
    printf '# %s\n' "${PR_TITLE:?set PR_TITLE to the pull-request title}" > .pr-title.md && pyspelling -c .github/spellcheck-settings.yml -n PRTitle && rm -f .pr-title.md || { rm -f .pr-title.md; exit 1; }

# === Aggregates ==============================================================

# Fast pre-commit loop: format, lint and build.
check: fmt lint build

# Every required CI gate, in CI order. Must be green before opening a PR.
ci: fmt-check lint build test

# Full definition-of-done gate: every CI gate plus coverage and spellcheck.
# Must be green before a task is declared done.

# Definition-of-done gate: every CI gate plus coverage and spellcheck.
done: ci coverage spellcheck

# === Housekeeping ============================================================

# Remove build output and the generated coverage report.
clean:
    rm -rf dist coverage .pr-title.md
