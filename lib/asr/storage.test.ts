import { describe, expect, it } from "vitest";
import { isOneOffPreview, keepStorage, modelIsCached, MODEL_CACHE } from "./storage";

describe("isOneOffPreview", () => {
  it("recognises the address of a single deployment", () => {
    expect(isOneOffPreview("clipper-studio-4f684f9yx-conandoyle1.vercel.app")).toBe(true);
    expect(isOneOffPreview("clipper-studio-nmx4dzmgm-conandoyle1.vercel.app")).toBe(true);
    expect(isOneOffPreview("clipper-studio-jbvljgpdj-conandoyle1.vercel.app")).toBe(false); // no digit: the shape alone cannot tell
  });
  it("knows exactly when the deployment's own host name is given", () => {
    const own = "clipper-studio-jbvljgpdj-conandoyle1.vercel.app";
    expect(isOneOffPreview(own, own)).toBe(true);
    expect(isOneOffPreview(own.toUpperCase(), own)).toBe(true);
    // Opened through a branch or main address, the deployment's own address is not the one in use.
    expect(isOneOffPreview("clipper-studio-git-feat-auto-transcript-captions-conandoyle1.vercel.app", own)).toBe(false);
    expect(isOneOffPreview("clipper-studio-zeta.vercel.app", own)).toBe(false);
    expect(isOneOffPreview("clipper-studio-4f684f9yx-conandoyle1.vercel.app", own)).toBe(false);
  });
  it("leaves stable addresses alone", () => {
    expect(isOneOffPreview("clipper-studio-git-feat-auto-transcript-captions-conandoyle1.vercel.app")).toBe(false);
    expect(isOneOffPreview("clipper-studio-zeta.vercel.app")).toBe(false);
    expect(isOneOffPreview("localhost")).toBe(false);
    expect(isOneOffPreview("studio.example.com")).toBe(false);
    expect(isOneOffPreview("my-dashboard1-team.vercel.app")).toBe(false);
  });
});

describe("modelIsCached", () => {
  const cacheWith = (urls: string[]) => ({ open: async (name: string) => { expect(name).toBe(MODEL_CACHE); return { keys: async () => urls.map(url => ({ url })) } as unknown as Cache; } });
  const base = "https://huggingface.co/Xenova/whisper-base/resolve/main";

  it("is true when the weights of that model are stored", async () => {
    expect(await modelIsCached("Xenova/whisper-base", cacheWith([`${base}/config.json`, `${base}/onnx/encoder_model_quantized.onnx`]))).toBe(true);
  });
  it("is false when only small files or another model are stored", async () => {
    expect(await modelIsCached("Xenova/whisper-base", cacheWith([`${base}/config.json`]))).toBe(false);
    expect(await modelIsCached("Xenova/whisper-small", cacheWith([`${base}/onnx/encoder_model_quantized.onnx`]))).toBe(false);
    expect(await modelIsCached("Xenova/whisper-base", cacheWith([]))).toBe(false);
  });
  it("is null when the browser cannot say", async () => {
    expect(await modelIsCached("Xenova/whisper-base", undefined)).toBeNull();
    expect(await modelIsCached("Xenova/whisper-base", { open: async () => { throw new Error("blocked"); } })).toBeNull();
  });
});

describe("keepStorage", () => {
  it("asks for persistence once, and reports what the browser said", async () => {
    let asked = 0;
    expect(await keepStorage({ persisted: async () => false, persist: async () => { asked++; return true; } })).toBe(true);
    expect(asked).toBe(1);
    expect(await keepStorage({ persisted: async () => true, persist: async () => { asked++; return true; } })).toBe(true);
    expect(asked).toBe(1);
    expect(await keepStorage({ persisted: async () => false, persist: async () => false })).toBe(false);
  });
  it("copes with browsers without the API or that throw", async () => {
    expect(await keepStorage(undefined)).toBeNull();
    expect(await keepStorage({ persisted: async () => { throw new Error("x"); }, persist: async () => true })).toBeNull();
  });
});
