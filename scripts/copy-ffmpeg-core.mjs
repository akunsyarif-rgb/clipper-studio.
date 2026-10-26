// Copies the FFmpeg WebAssembly core into public/ffmpeg so it is served from our own origin
// (no third-party CDN at runtime). Runs before dev and build; the output is git-ignored.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
// @ffmpeg/core does not export package.json, so resolve its main entry and walk up to dist/umd.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const src = join(dirname(dirname(require.resolve("@ffmpeg/core"))), "umd");
const dest = join(process.cwd(), "public", "ffmpeg");
mkdirSync(dest, { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const from = join(src, name), to = join(dest, name);
  if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
}
console.log(`ffmpeg core copied to ${dest}`);
