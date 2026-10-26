// Prepares the in-browser voice-over engine under public/ (git-ignored), before dev, build and tests:
//  - public/ort/        onnxruntime-web WebAssembly runtime
//  - public/supertonic/ Supertonic 3 model (Supertone Inc., OpenRAIL-M)
// The model comes from the pinned @3sln/donki-lle-voice-multi* npm packages, which store it as base64
// data chunks in .js files. The chunks are parsed as text (never executed), reassembled, and every file is
// checked against the SHA-256 below so a changed package cannot slip in a different model.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const MODEL = {
  "duration_predictor.onnx": "c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db",
  "text_encoder.onnx": "c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff",
  "vector_estimator.onnx": "20cd86fa5c6effedfda0e7cffe5b0569ca401c440a0c3a1d72bf39286c0db3fd",
  "vocoder.onnx": "e923d60f53f95eb1ce235f1dc33ec56d9c057823c96fa6f8acf98f32b0da6152",
  "tts.json": "42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09",
  "unicode_indexer.bin": "8402ca48e5189a8950138580b0fff64db6f072f24ac07cd54ba8b2fbb9883b30",
  "voice.bin": "67d5209b0ee8ce6c74105ffbe12fe6a7628aea3b4ba2fcb308a4a67938a93ce8",
};

const sha256 = buf => createHash("sha256").update(buf).digest("hex");
const pkgDir = name => {
  // These packages do not export package.json; resolve through node_modules directly.
  const dir = join(root, "node_modules", ...name.split("/"));
  if (!existsSync(dir)) throw new Error(`${name} is not installed; run npm ci`);
  return dir;
};

// 1. onnxruntime-web WebAssembly runtime (the JS glue is bundled by Next.js).
const ortDist = join(pkgDir("onnxruntime-web"), "dist");
const ortOut = join(root, "public", "ort");
mkdirSync(ortOut, { recursive: true });
for (const name of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  const from = join(ortDist, name), to = join(ortOut, name);
  if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
}

// 2. Supertonic 3 model.
const out = join(root, "public", "supertonic");
mkdirSync(out, { recursive: true });
const pending = Object.entries(MODEL).filter(([f, hash]) => !existsSync(join(out, f)) || sha256(readFileSync(join(out, f))) !== hash);
if (pending.length) {
  const manifestText = readFileSync(join(pkgDir("@3sln/donki-lle-voice-multi"), "voice.js"), "utf8");
  const manifest = JSON.parse(manifestText.slice(manifestText.indexOf("export default") + "export default".length).trim().replace(/;$/, ""));
  for (const [file, hash] of pending) {
    const info = manifest.files[file];
    if (!info) throw new Error(`model manifest has no ${file}`);
    const parts = info.parts.map(part => {
      const [, pkg, chunk] = /^(@3sln\/[^@]+)@[^/]+\/c\/(\d+\.js)$/.exec(part) ?? [];
      if (!pkg) throw new Error(`unexpected chunk reference ${part}`);
      const text = readFileSync(join(pkgDir(pkg), "c", chunk), "utf8");
      const m = /^\s*export default "([A-Za-z0-9+/=]*)";?\s*$/.exec(text);
      if (!m) throw new Error(`chunk ${part} is not a plain base64 string`);
      return Buffer.from(m[1], "base64");
    });
    const data = Buffer.concat(parts);
    if (data.length !== info.size || sha256(data) !== hash) throw new Error(`${file}: checksum mismatch, refusing to use it`);
    writeFileSync(join(out, file), data);
  }
}
writeFileSync(join(out, "NOTICE.txt"), [
  "Supertonic 3 text-to-speech model, (c) Supertone Inc.",
  "Licensed under the BigScience OpenRAIL-M License: https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE",
  "The license includes use-based restrictions (Attachment A): among others, no impersonation without consent,",
  "no generating or disseminating false information to harm others, and machine-generated content must not be",
  "presented as human-made. Redistributed here unmodified (ONNX export by sherpa-onnx).",
  "",
].join("\n"));
console.log(`tts assets ready (${pending.length ? `assembled ${pending.length} model file(s)` : "model up to date"})`);
