import { describe, expect, it } from "vitest";

import { FalkorDbGraphRagApi } from "../credentials/FalkorDbGraphRagApi.credentials";

describe("FalkorDbGraphRagApi credential", () => {
	it("defines API token field and test request", () => {
		const credential = new FalkorDbGraphRagApi();
		const tokenField = credential.properties.find((p) => p.name === "apiToken");
		const timeoutField = credential.properties.find((p) => p.name === "requestTimeoutSeconds");

		expect(tokenField?.displayName).toBe("API Token");
		expect(credential.authenticate).toMatchObject({
			type: "generic",
			properties: {
				headers: {
					"X-Requested-With": "XMLHttpRequest",
				},
			},
		});
		expect(credential.test).toMatchObject({
			request: {
				url: "/api/graphs/available",
				method: "GET",
			},
		});
		expect(timeoutField?.default).toBe(60);
	});
});
