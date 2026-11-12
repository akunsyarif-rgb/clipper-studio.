import { useEffect, useState } from "react";
import { HEIGHT, WIDTH, type ContentPresetId } from "@/lib/script";
import { logRender, logSeo, scriptId, type HistoryEntry } from "@/lib/history";
import { loadHistory, onHistoryChange, startHistorySync, updateHistory } from "@/lib/history-store";
import type { SeoPlatform, SeoResult } from "@/lib/seo";
import type { Dispatch, SetStateAction } from "react";

type Inputs = {
  result: { url: string; name: string; size: number; } | null;
  script: string;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setHandoffNote: Dispatch<SetStateAction<string>>;
  setScript: Dispatch<SetStateAction<string>>;
  setTitle: Dispatch<SetStateAction<string>>;
  title: string;
  videoSeconds: number;
};

export default function useProductionHistory({ result, script, setContentPreset, setHandoffNote, setScript, setTitle, title, videoSeconds }: Inputs) {
// Production history (text only, on this device): renders and downloads are logged, and the SEO packs of the video being
  // worked on are restored when its script is back, so making many videos and downloading them loses nothing.
  const [historyId, setHistoryId] = useState(() => scriptId(script));
  useEffect(() => { const t = setTimeout(() => setHistoryId(scriptId(script)), 800); return () => clearTimeout(t); }, [script]);
  useEffect(() => { startHistorySync(); }, []);
  const [entrySeo, setEntrySeo] = useState<HistoryEntry["seo"]>({});
  useEffect(() => {
    let alive = true;
    const load = () => { void loadHistory().then(list => { if (alive) setEntrySeo(list.find(e => e.id === historyId)?.seo ?? {}); }); };
    load();
    const off = onHistoryChange(load);
    return () => { alive = false; off(); };
  }, [historyId]);
  const base = () => ({ id: scriptId(script), kind: "motion" as const, title, script, now: Date.now() });
  useEffect(() => {
    if (!result) return;
    void updateHistory(l => logRender(l, base(), { name: result.name, size: result.size, label: `${WIDTH}×${HEIGHT} · ${videoSeconds.toFixed(0)} dtk` }));
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSeoResult = (platform: SeoPlatform, r: SeoResult) => { void updateHistory(l => logSeo(l, base(), platform, r)); };
  // "Buka di studio" from the history page leaves the script here.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("clipper:history:open");
      if (!raw) return;
      sessionStorage.removeItem("clipper:history:open");
      const o = JSON.parse(raw) as { script?: unknown; title?: unknown };
      if (typeof o.script === "string" && o.script.trim()) { setScript(o.script.slice(0, 3000)); setTitle(typeof o.title === "string" ? o.title.slice(0, 60) : ""); setContentPreset("custom"); setHistoryId(scriptId(o.script)); setHandoffNote("Naskah dibuka dari Riwayat. Atur tampilan, render ulang, atau lihat paket SEO yang tersimpan."); }
    } catch { /* storage blocked: nothing to open */ }
  }, [setContentPreset, setHandoffNote, setScript, setTitle]);
  return { base, entrySeo, historyId, onSeoResult };
}
