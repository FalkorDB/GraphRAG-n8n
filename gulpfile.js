const { src, dest } = require('gulp');
const { readdirSync } = require('fs');

// n8n resolves a `file:<name>` icon relative to the *compiled* file, so every icon has
// to sit next to the .js that references it. `public/` stays the single source of truth
// and is fanned out to each compiled node/credential directory.
function buildIcons() {
	const nodeDirs = readdirSync('nodes', { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => `dist/nodes/${entry.name}`);

	return [...nodeDirs, 'dist/credentials'].reduce(
		(stream, dir) => stream.pipe(dest(dir)),
		src('public/*.{png,svg}'),
	);
}

exports['build:icons'] = buildIcons;
