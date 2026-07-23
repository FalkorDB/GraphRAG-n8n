# Changelog

## [1.1.0](https://github.com/FalkorDB/GraphRAG-n8n/compare/v1.0.0...v1.1.0) (2026-07-23)


### Features

* add API-token auth and retrieve-only response mode for GraphRAG nodes ([0547c30](https://github.com/FalkorDB/GraphRAG-n8n/commit/0547c3080ed18b9eae1826ea0babb0dc509b2733))
* add graphName parameter to GraphRag and GraphRagAction nodes; create workflow for ingesting and verifying FalkorDB docs ([ca3de60](https://github.com/FalkorDB/GraphRAG-n8n/commit/ca3de605fc595944c5da83aff4bbe2175e7a31e1))
* add graphName parameter to multiple workflows for knowledge graph integration ([c0d4b7e](https://github.com/FalkorDB/GraphRAG-n8n/commit/c0d4b7e0ec24c17d500af057353ed1cfb8ff2a2a))
* add retrieve-only mode and API token credential support ([c8ae3bc](https://github.com/FalkorDB/GraphRAG-n8n/commit/c8ae3bcddea4f64ea75c3543dc3a43be75fb8a5c))
* export GraphRagAction from its module ([a279ad1](https://github.com/FalkorDB/GraphRAG-n8n/commit/a279ad1093ecc00915f9f9c12b3e6ccf7aa81c88))
* initialize n8n community node for FalkorDB GraphRAG ([9828c0c](https://github.com/FalkorDB/GraphRAG-n8n/commit/9828c0c7f8ba95c49fa92a107a9c0a6b299444eb))


### Bug Fixes

* align nodes with merged server contract and tool UX ([f7bc4ba](https://github.com/FalkorDB/GraphRAG-n8n/commit/f7bc4bab51a9a08039dc1993b4ed2876e853d0d7))
* rename ingest filename param to documentName ([40ac471](https://github.com/FalkorDB/GraphRAG-n8n/commit/40ac47176574918a571c2de719c13ecd7fe66d55))
* revert version to 0.0.0-dev in package.json ([d1960bb](https://github.com/FalkorDB/GraphRAG-n8n/commit/d1960bba9145bce66c0e109146a11ec1e150b7ac))
* simplify prepublishOnly script in package.json ([14a8e73](https://github.com/FalkorDB/GraphRAG-n8n/commit/14a8e73a7dbde8c9619716d06f042f549690ede3))
* standardize naming to "FalkorDB GraphRAG" across documentation and code ([e8382b4](https://github.com/FalkorDB/GraphRAG-n8n/commit/e8382b446433359dd4f1541961bad11c50e63e00))
* update API token placeholder and authorization header handling in credentials ([5eba88a](https://github.com/FalkorDB/GraphRAG-n8n/commit/5eba88a42b4de7659a11ac427b9bc79a710f3fd2))
* update graphName to use hyphen format across all workflows ([1184287](https://github.com/FalkorDB/GraphRAG-n8n/commit/1184287ae0d30ddf46a1a92a16b35a872bd037c6))
* update token placeholder and document retrieve-only server-side context repro ([8430eb9](https://github.com/FalkorDB/GraphRAG-n8n/commit/8430eb9a03eb4eddcf23a9e73ec833b57fdbe54a))
* use retrieve_only flag and update graph name help text ([5a2484c](https://github.com/FalkorDB/GraphRAG-n8n/commit/5a2484c331b8e677525ae5ff8920b2a2ad856dd4))

## Changelog

All notable changes to this project are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The changelog is generated automatically by
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commit](https://www.conventionalcommits.org/) messages — do not edit
released sections by hand. Write clear `feat:` / `fix:` commit and PR titles instead.
