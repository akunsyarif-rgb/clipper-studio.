import { splitScript, type ContentPresetId } from "@/lib/script";
import { type SessionData } from "@/lib/session";
import { FlowStepperBar } from "../../FlowStepper";
import { type SeoSeed } from "../../SeoPanel";
import TrendStart from "../../TrendStart";
import { logTrend, scriptId } from "@/lib/history";
import { updateHistory } from "@/lib/history-store";
import CloudAccount from "../../CloudAccount";
import type { Mode } from "./types";
import type { Dispatch, SetStateAction } from "react";

type Props = {
  activeMode: Mode;
  cloudUser: string | null;
  discardSession: () => Promise<void>;
  flowStep: number;
  goFlow: (n: number) => void;
  handoffNote: string;
  rendering: boolean;
  restoreSession: () => Promise<void>;
  saved: SessionData | null;
  savedCloud: boolean;
  savedSource: { name: string; seconds: number; } | null;
  setCloudUser: Dispatch<SetStateAction<string | null>>;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setScript: Dispatch<SetStateAction<string>>;
  setSeoSeed: Dispatch<SetStateAction<SeoSeed | null>>;
  setTitle: Dispatch<SetStateAction<string>>;
  videoMode: boolean;
};

export default function StudioPanelHeader({ activeMode, cloudUser, discardSession, flowStep, goFlow, handoffNote, rendering, restoreSession, saved, savedCloud, savedSource, setCloudUser, setContentPreset, setScript, setSeoSeed, setTitle, videoMode }: Props) {
  return (
    <>
<div className="panel-heading"><div><small>PENGATURAN LANJUTAN</small><h2>Atur video</h2></div><span className="local-tag">{cloudUser ? "Tersinkron · tanpa media" : "Lokal · tanpa server"}</span></div>
      {activeMode !== "normal" && <CloudAccount onUser={setCloudUser} />}
      {handoffNote && <div className="notice" role="status" data-testid="handoff-note">{handoffNote}</div>}
      {saved && <div className="notice" data-testid="restore-offer">
        Sesi terakhir ditemukan: <strong>{saved.title || "tanpa judul"}</strong> · {splitScript(saved.script).length} scene{savedSource ? ` · video ${savedSource.name}` : ""}. {savedCloud ? "Dari akun Anda (perangkat lain); pilih lagi videonya setelah Lanjutkan." : "Disimpan di perangkat ini saja."}{" "}
        <button className="text-button" data-testid="restore-session" onClick={() => void restoreSession()}>Lanjutkan</button>{" "}
        <button className="text-button" data-testid="restore-discard" onClick={() => void discardSession()}>Mulai baru</button>
      </div>}
      <TrendStart disabled={rendering || videoMode} onUse={(text, t, b) => {
        setScript(text.slice(0, 3000)); if (t) setTitle(t.slice(0, 60)); setContentPreset("custom");
        void updateHistory(l => logTrend(l, { id: scriptId(text), kind: "motion", title: t, script: text, now: Date.now() }, { platform: b.platform, niche: b.niche, audience: b.audience, trend: b.trend }));
        setSeoSeed({ platform: b.platform, niche: b.niche, audience: b.audience, trends: b.trend.slice(0, 300), nonce: Date.now() });
      }} />
      <FlowStepperBar step={flowStep} onGo={goFlow} />
</>
  );
}
