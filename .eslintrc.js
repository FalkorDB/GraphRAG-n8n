/**
 * ESLint configuration for the FalkorDB GraphRAG n8n community node.
 *
 * Uses eslint-plugin-n8n-nodes-base to enforce n8n's conventions for
 * community nodes, credentials, and the package.json manifest.
 *
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
	root: true,
	env: {
		browser: true,
		es6: true,
		node: true,
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
		extraFileExtensions: ['.json'],
	},
	ignorePatterns: [
		'.eslintrc.js',
		'eslint.config.*',
		'gulpfile.js',
		'jest.config.js',
		'**/*.js',
		'node_modules/**',
		'dist/**',
	],
	overrides: [
		{
			files: ['package.json'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/community'],
			rules: {
				// We ship a real package name, so the "still default" guard is not needed.
				'n8n-nodes-base/community-package-json-name-still-default': 'off',
			},
		},
		{
			files: ['./credentials/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/credentials'],
			rules: {
				// This rule camel-cases the value, which corrupts a full documentation
				// URL. We use an http(s) URL (still enforced by ...-not-http-url), so
				// disable the miscased autofix as the official n8n starter does.
				'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
			},
		},
		{
			files: ['./nodes/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/nodes'],
			rules: {
				// Both nodes expose an "Ingest a GitHub repository" action; this rule
				// sentence-cases action labels and mangles the proper noun "GitHub" into
				// "git hub". Our labels are already sentence case.
				'n8n-nodes-base/node-param-operation-option-action-miscased': 'off',
			},
		},
		{
			// GraphRag is an AI Agent tool node (inputs: [], outputs: ['ai_tool']).
			// These two rules assume a regular node with ['main'] connections, so they
			// false-positive here. Scope the disable to this file only so the regular
			// GraphRagAction node keeps the checks.
			files: ['./nodes/GraphRag/GraphRag.node.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			rules: {
				'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
				'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
			},
		},
	],
};
