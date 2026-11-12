import { HEIGHT, WIDTH, type VideoProps } from "@/lib/script";
import { type Transcript } from "@/lib/transcript";
import { stripMarks } from "@/lib/visuals";
import PreRenderChecklist from "../../PreRenderChecklist";
import { FlowStepNav } from "../../FlowStepper";
import PostRenderActions from "../../PostRenderActions";
import HeavyWorkNotice from "../../HeavyWorkNotice";
import { type FixId } from "@/lib/prerender";
import SeoPanel, { type SeoSeed } from "../../SeoPanel";
import { logDownload } from "@/lib/history";
import { updateHistory } from "@/lib/history-store";
import type { SeoPlatform, SeoResult } from "@/lib/seo";
import { type Issue } from "@/lib/storyboard";
import SaveToHub from "../../SaveToHub";
import StoryboardFold from "./StoryboardFold";
import type { Dispatch, SetStateAction, RefObject } from "react";
import type { Check } from "@/lib/prerender";
import type { Storyboard } from "@/lib/storyboard";
import type { TimelineResult } from "@/lib/script";

type Props = {
  abort: RefObject<AbortController | null>;
  applyFix: (id: FixId) => void;
  base: () => { id: string; kind: "motion"; title: string; script: string; now: number; };
  blocker: string;
  copyBrief: () => Promise<void>;
  entrySeo: Partial<Record<SeoPlatform, { at: number; result: SeoResult; }>>;
  errorDetail: string;
  exportProject: () => void;
  goFlow: (n: number) => void;
  goSave: () => void;
  goSeo: () => void;
  historyId: string;
  imported: Transcript | null;
  makeAnother: () => void;
  musicBusy: boolean;
  narrationBusy: boolean;
  onSeoResult: (platform: SeoPlatform, r: SeoResult) => void;
  preChecks: Check[];
  progress: number;
  props: VideoProps | null;
  render: () => Promise<void>;
  renderError: string;
  rendering: boolean;
  result: { url: string; name: string; size: number; } | null;
  saveOpen: boolean;
  seoSeed: SeoSeed | null;
  setStatus: Dispatch<SetStateAction<string>>;
  srtUrl: string | null;
  status: string;
  storyboard: Storyboard;
  storyErrors: Issue[];
  storyIssues: Issue[];
  timeline: TimelineResult;
  title: string;
  videoSeconds: number;
  voiceBusy: boolean;
};

export default function RenderStep({ abort, applyFix, base, blocker, copyBrief, entrySeo, errorDetail, exportProject, goFlow, goSave, goSeo, historyId, imported, makeAnother, musicBusy, narrationBusy, onSeoResult, preChecks, progress, props, render, renderError, rendering, result, saveOpen, seoSeed, setStatus, srtUrl, status, storyboard, storyErrors, storyIssues, timeline, title, videoSeconds, voiceBusy }: Props) {
  return (
    <section className="flow-step" data-step="5" data-testid="flow-step-5">
      <div className="step-title" data-testid="step-5"><b>5</b>Render</div>
      <StoryboardFold storyboard={storyboard} storyErrors={storyErrors} storyIssues={storyIssues} timeline={timeline} />
      {blocker && <p className="field-error" role="alert" data-testid="blocker">{blocker}</p>}
      {timeline.ok && timeline.warnings.map(w => <p className="field-warning" key={w}>{w}</p>)}
      {timeline.ok && <PreRenderChecklist checks={preChecks} onFix={applyFix} prefix="pre" disabled={rendering} />}

      <div className="panel-actions">
        {rendering
          ? <button className="motion-cancel" onClick={() => abort.current?.abort()} data-testid="cancel">Batalkan render</button>
          : <button className="motion-primary" onClick={() => void render()} disabled={!!blocker || narrationBusy || musicBusy || voiceBusy} data-testid="render">Render MP4 <span>↓</span></button>}
        <button className="motion-secondary" onClick={exportProject} disabled={!props}>Proyek JSON</button>
      </div>
      <button className="text-link" onClick={copyBrief} disabled={!timeline.ok}>Salin brief teks</button>
      {rendering && <div className="render-progress" data-testid="progress"><div><span>Merender di browser…</span><b>{progress}%</b></div><i><em style={{ width: progress + "%" }} /></i></div>}
      {rendering && <HeavyWorkNotice what="render" seconds={videoSeconds} />}
      {renderError && <p className="field-error" role="alert" data-testid="render-error">{renderError}</p>}
      {errorDetail && <details className="error-details" open><summary>Detail teknis (kirimkan saat melapor)</summary><code data-testid="error-detail">{errorDetail}</code><button className="text-link" onClick={() => navigator.clipboard?.writeText(errorDetail).then(() => setStatus("Detail teknis disalin."), () => setStatus("Salin manual teks di atas."))}>Salin detail teknis</button></details>}
      {result && <PostRenderActions saveOpen={saveOpen} info={`${WIDTH}×${HEIGHT} · ${videoSeconds.toFixed(1)} dtk · ${(result.size / 1024 ** 2).toFixed(1)} MB`} onSave={goSave} onAnother={makeAnother} onSeo={goSeo}
        download={<a className="motion-primary" href={result.url} download={result.name} data-testid="download" onClick={() => { void updateHistory(l => logDownload(l, base(), { name: result.name, size: result.size, label: `${WIDTH}×${HEIGHT} · ${videoSeconds.toFixed(0)} dtk` })); }}>Simpan MP4 ↓</a>}
        extra={srtUrl ? <a className="text-link" href={srtUrl} download={result.name.replace(/\.mp4$/i, "") + ".srt"} data-testid="download-srt">Unduh subtitle (.srt)</a> : null} />}
      {result && saveOpen && <SaveToHub key={result.url} tone="dark" getBlob={() => fetch(result.url).then(r => r.blob())} fileName={result.name} title={title.trim() || result.name.replace(/\.[^.]+$/, "")} source="motion" seconds={videoSeconds} width={WIDTH} height={HEIGHT} historyId={base().id} />}
      {status && <p className="motion-status" role="status" data-testid="status">{status}</p>}
      {timeline.ok && <SeoPanel seed={seoSeed} stored={entrySeo} storedId={historyId} onResult={onSeoResult} transcript={timeline.scenes.map(sc => stripMarks(sc.text)).join(" ")} topic={title.trim()} language={imported?.language === "english" || imported?.language === "en" ? "en" : "id"} />}
      <FlowStepNav step={5} onGo={goFlow} />
    </section>
  );
}
