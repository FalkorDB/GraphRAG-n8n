import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		clearMocks: true,
		coverage: {
			provider: "v8",
			// `json` feeds Codecov; `text` prints the table; `html`/`lcov` are for humans.
			reporter: ["text", "json", "html", "lcov"],
			reportsDirectory: "coverage",
			include: ["src/**/*.ts", "nodes/**/*.ts", "credentials/**/*.ts"],
		},
	},
});
