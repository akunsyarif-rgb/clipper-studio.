import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASR_IDLE_MS, releaseAsr, transcribe, TranscribeCancelled } from "./client";
import type { AsrMessage } from "./worker";

// A Worker that records what it receives and lets the test play the worker's side.
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<AsrMessage>) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  constructor() { FakeWorker.all.push(this); }
  postMessage(m: unknown) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  say(m: AsrMessage) { this.onmessage?.({ data: m } as MessageEvent<AsrMessage>); }
}

const words = [{ text: " Halo", timestamp: [0.2, 0.6] as [number, number] }, { text: " dunia", timestamp: [0.6, 1.2] as [number, number] }];
const audio = () => new Float32Array(16000 * 4);
const finish = (w: FakeWorker, extra: Partial<Extract<AsrMessage, { type: "result" }>> = {}) =>
  w.say({ type: "result", granularity: "word", chunks: words, inferSeconds: 3, ...extra });
const start = (events = {}) => transcribe(audio(), "Xenova/whisper-base", "indonesian", 4, { onDownload: () => undefined, onRunning: () => undefined, ...events });

beforeEach(() => { FakeWorker.all = []; vi.useFakeTimers(); vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { releaseAsr(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("shared speech worker", () => {
  it("reuses one worker (and so the loaded model) for consecutive transcriptions", async () => {
    const a = start();
    FakeWorker.all[0].say({ type: "ready", loadSeconds: 40, reused: false });
    finish(FakeWorker.all[0]);
    const first = await a.result;
    expect(first.timings).toMatchObject({ loadSeconds: 40, reused: false, inferSeconds: 3, audioSeconds: 4 });

    const b = start();
    expect(FakeWorker.all).toHaveLength(1);
    expect(FakeWorker.all[0].terminated).toBe(false);
    expect(FakeWorker.all[0].posted).toHaveLength(2);
    FakeWorker.all[0].say({ type: "ready", loadSeconds: 0, reused: true });
    finish(FakeWorker.all[0]);
    expect((await b.result).timings.reused).toBe(true);
  });

  it("forwards download, ready and per-window progress to the caller", async () => {
    const seen: string[] = [];
    const h = start({
      onDownload: (l: number, t: number) => seen.push(`dl ${l}/${t}`),
      onRunning: (i: { loadSeconds: number; reused: boolean }) => seen.push(`ready ${i.reused}`),
      onChunk: (d: number, t: number) => seen.push(`chunk ${d}/${t}`),
    });
    const w = FakeWorker.all[0];
    w.say({ type: "progress", loaded: 5, total: 10, file: "m.onnx" });
    w.say({ type: "ready", loadSeconds: 1, reused: false });
    w.say({ type: "chunk", done: 0, total: 2 });
    w.say({ type: "chunk", done: 1, total: 2 });
    finish(w);
    await h.result;
    expect(seen).toEqual(["dl 5/10", "ready false", "chunk 0/2", "chunk 1/2"]);
  });

  it("releases the worker after the idle time, and a later run starts a fresh one", async () => {
    const a = start();
    finish(FakeWorker.all[0]);
    await a.result;
    vi.advanceTimersByTime(ASR_IDLE_MS - 1);
    expect(FakeWorker.all[0].terminated).toBe(false);
    vi.advanceTimersByTime(2);
    expect(FakeWorker.all[0].terminated).toBe(true);
    start();
    expect(FakeWorker.all).toHaveLength(2);
  });

  it("starting a run cancels a pending idle release", async () => {
    const a = start();
    finish(FakeWorker.all[0]);
    await a.result;
    vi.advanceTimersByTime(ASR_IDLE_MS - 1000);
    start();
    vi.advanceTimersByTime(5000);
    expect(FakeWorker.all[0].terminated).toBe(false);
  });

  it("cancel ends the worker (an inference cannot be interrupted otherwise) and rejects", async () => {
    const h = start();
    h.cancel();
    await expect(h.result).rejects.toBeInstanceOf(TranscribeCancelled);
    expect(FakeWorker.all[0].terminated).toBe(true);
    start();
    expect(FakeWorker.all).toHaveLength(2);
  });

  it("an error from the worker rejects and drops the worker, so a retry starts clean", async () => {
    const h = start();
    FakeWorker.all[0].say({ type: "error", detail: "NetworkError: gagal" });
    await expect(h.result).rejects.toThrow("NetworkError");
    expect(FakeWorker.all[0].terminated).toBe(true);
    start();
    expect(FakeWorker.all).toHaveLength(2);
  });

  it("no speech is an error but keeps the model loaded", async () => {
    const h = start();
    finish(FakeWorker.all[0], { chunks: [] });
    await expect(h.result).rejects.toThrow(/no speech/);
    expect(FakeWorker.all[0].terminated).toBe(false);
  });

  it("releaseAsr is safe to call when nothing is running", () => {
    expect(() => { releaseAsr(); releaseAsr(); }).not.toThrow();
  });
});
