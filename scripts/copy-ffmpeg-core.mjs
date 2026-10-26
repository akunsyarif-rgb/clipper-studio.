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

// Self-host the onnxruntime-web WebAssembly runtime that Transformers.js (speech recognition) bundles,
// so no CDN is used at runtime. It is a different build from the one used by the voice-over (public/ort).
const ortSrc = join(process.cwd(), "node_modules", "@huggingface", "transformers", "node_modules", "onnxruntime-web", "dist");
const ortDest = join(process.cwd(), "public", "ort-asr");
mkdirSync(ortDest, { recursive: true });
for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  const from = join(ortSrc, name), to = join(ortDest, name);
  if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
}
console.log(`speech runtime copied to ${ortDest}`);
