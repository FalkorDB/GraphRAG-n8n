/** @type {import('jest').Config} */
module.exports = {
	testEnvironment: "node",
	testMatch: ["**/tests/**/*.test.ts"],
	moduleNameMapper: {
		"^n8n-workflow$": "<rootDir>/node_modules/n8n-workflow",
	},
	transform: {
		"^.+\\.tsx?$": ["ts-jest", {
			tsconfig: {
				target: "ES2019",
				module: "commonjs",
				strict: true,
				esModuleInterop: true,
				skipLibCheck: true,
				resolveJsonModule: true,
			},
		}],
	},
	clearMocks: true,
};
