"use client";

import { GeminiError } from "@/lib/gemini";

export type AiError = { message: string; kind?: GeminiError["kind"] };
/** Turns whatever was thrown into what the screen shows. */
export const toAiError = (e: unknown, fallback = "Gagal menghubungi layanan AI."): AiError => (e instanceof GeminiError ? { message: e.message, kind: e.kind } : { message: fallback });

const HELP: Partial<Record<NonNullable<GeminiError["kind"]>, string>> = {
  timeout: "AI terlalu lama menjawab. Model gratis sering lambat atau antre.",
  server: "Layanan AI sedang sibuk.",
  quota: "Pemakaian AI sedang dibatasi oleh penyedia.",
  model: "Model yang dipilih tidak tersedia.",
  network: "Tidak ada koneksi ke layanan AI.",
};

/**
 * An AI problem with a way forward: try again, change the model (the picker is right there) or carry on without AI. Nothing here
 * changes anything by itself.
 */
export default function AiErrorNotice({ error, onRetry, onDismiss, testId }: { error: AiError | null; onRetry?: () => void; onDismiss: () => void; testId?: string }) {
  if (!error) return null;
  const help = error.kind ? HELP[error.kind] : undefined;
  const retryable = !!error.kind && ["timeout", "server", "quota", "model", "network", "format"].includes(error.kind);
  function changeModel(el: HTMLElement) {
    const pick = (el.closest(".ai-director, .command-box, .cinematic-studio") ?? document).querySelector<HTMLSelectElement>('[data-testid="ai-model-pick"]');
    pick?.scrollIntoView({ block: "center", behavior: "smooth" });
    pick?.focus();
  }
  return <div className="notice notice-error ai-error" role="alert" data-testid={testId}>
    {help && <div><b>{help}</b></div>}
    <div>{error.message}</div>
    <div className="button-row">
      {onRetry && retryable && <button type="button" onClick={onRetry} data-testid="ai-error-retry">Coba lagi</button>}
      {retryable && error.kind !== "format" && <button type="button" onClick={e => changeModel(e.currentTarget)} data-testid="ai-error-model">Ganti model</button>}
      <button type="button" className="text-button" onClick={onDismiss} data-testid="ai-error-dismiss">Lanjut tanpa AI</button>
    </div>
  </div>;
}
