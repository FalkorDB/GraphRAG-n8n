// Mirrors icon assets from the source tree into dist/, preserving their relative
// paths. tsc only emits JavaScript, so without this step the `file:` icons the
// node and credential declare would be missing at runtime.
//
// The layout has to match on both sides: n8n's community-node `icon-validation`
// lint resolves a `file:` path relative to the source .ts, while n8n itself
// resolves it relative to the compiled .js. This is the same copy step that
// `n8n-node build` from @n8n/node-cli performs.
import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const SOURCE_DIRS = ["nodes", "credentials"];
const ASSET_EXTENSIONS = new Set([".png", ".svg"]);

async function copyAssets(dir) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}

	for (const entry of entries) {
		const sourcePath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			await copyAssets(sourcePath);
		} else if (ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
			const destPath = path.join("dist", sourcePath);
			await mkdir(path.dirname(destPath), { recursive: true });
			await cp(sourcePath, destPath);
		}
	}
}

await Promise.all(SOURCE_DIRS.map(copyAssets));
