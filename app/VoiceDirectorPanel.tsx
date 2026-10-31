"use client";

import { useEffect, useState } from "react";
import {
  PAUSE_CHOICES, PAUSE_LABELS, paceToSpeed, parseEmphasis, VOICE_DELIVERY_LABELS, VOICE_EMOTION_LABELS, VOICE_INTONATION_LABELS, VOICE_PACE_LABELS,
  type DirectionOverride, type DirectionOverrides, type PauseAfter, type VoiceDelivery, type VoiceDirection, type VoiceEmotion, type VoiceIntonation, type VoicePace,
} from "@/lib/voice-director";

const CONFIDENCE: Record<string, string> = { high: "yakin", medium: "cukup yakin", low: "kurang yakin" };

/** The emphasis words: typed freely (commas included) and applied when the field is left, so typing is never cut short. */
function EmphasisField({ index, text, value, disabled, onCommit }: { index: number; text: string; value: string[]; disabled: boolean; onCommit: (words: string[]) => void }) {
  const [draft, setDraft] = useState(value.join(", "));
  const [ignored, setIgnored] = useState<string[]>([]);
  useEffect(() => { setDraft(value.join(", ")); setIgnored([]); }, [value.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  function commit() {
    const parsed = parseEmphasis(draft, text);
    setIgnored(parsed.ignored);
    setDraft(parsed.words.join(", "));
    if (parsed.words.join("|") !== value.join("|")) onCommit(parsed.words);
  }
  return <label className="voice-emphasis">
    <span>Kata yang ditekankan <i className="voice-tag guide">panduan</i></span>
    <input aria-label={`Kata penekanan segmen ${index + 1}`} value={draft} disabled={disabled} placeholder="pisahkan dengan koma" enterKeyHint="done"
      onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    {ignored.length > 0 && <small className="voice-ignored" role="status">Diabaikan karena tidak ada di kalimat: {ignored.join(", ")}</small>}
  </label>;
}

/**
 * Per-sentence narration direction. Tempo and pause change the generated audio; emotion, style, intonation and emphasis are
 * guidance for the creator (the voice engine has no control for them), and every control says which kind it is.
 */
export default function VoiceDirectorPanel({ directions, auto, keys, overrides, onChange, baseSpeed, disabled }: {
  directions: VoiceDirection[];
  /** The automatic recommendation, to tell which segments the creator changed. */
  auto: VoiceDirection[];
  keys: string[];
  overrides: DirectionOverrides;
  onChange: (next: DirectionOverrides) => void;
  baseSpeed: number;
  disabled: boolean;
}) {
  const set = (index: number, patch: DirectionOverride) => onChange({ ...overrides, [keys[index]]: { ...overrides[keys[index]], ...patch } });
  const reset = (index: number) => { const { [keys[index]]: _gone, ...rest } = overrides; onChange(rest); }; // eslint-disable-line @typescript-eslint/no-unused-vars
  const changed = (index: number) => !!overrides[keys[index]] && Object.keys(overrides[keys[index]]).length > 0;
  const anyChanged = directions.some((_, i) => changed(i));

  return <div className="voice-director" data-testid="voice-director">
    <div className="voice-director-heading"><b>AI Voice Director</b><small>Analisis lokal · tanpa biaya API</small></div>
    <p>Rekomendasi otomatis per kalimat. <b>Tempo</b> dan <b>jeda</b> mengubah suara yang dibuat. Intonasi naik atau turun diterapkan lewat tanda tanya pada ucapan. Emosi, gaya, intonasi datar/tertahan, dan penekanan hanyalah panduan untuk Anda: mesin suara tidak punya kontrol untuknya.</p>
    {directions.map((d, index) => {
      const speed = paceToSpeed(d.pace, baseSpeed);
      const mine = changed(index);
      return <details className="voice-direction-row" key={keys[index]} data-testid={`voice-direction-${index}`}>
        <summary>
          <span className="voice-direction-title"><b>Segmen {index + 1}{mine ? " · diubah" : ""}</b><small>{d.sourceText}</small></span>
          <span className="voice-chips" aria-hidden="true">
            <i>{VOICE_EMOTION_LABELS[d.emotion]}</i><i>{VOICE_PACE_LABELS[d.pace]}</i>{d.pauseAfter > 0 && <i>jeda +{String(d.pauseAfter).replace(".", ",")} dtk</i>}
          </span>
        </summary>
        <div className="voice-direction-controls">
          <label><span>Tempo <i className="voice-tag live">memengaruhi suara</i></span>
            <select aria-label={`Tempo segmen ${index + 1}`} value={d.pace} disabled={disabled} onChange={e => set(index, { pace: e.target.value as VoicePace })}>{Object.entries(VOICE_PACE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>Jeda setelah kalimat <i className="voice-tag live">memengaruhi suara</i></span>
            <select aria-label={`Jeda segmen ${index + 1}`} value={d.pauseAfter} disabled={disabled} onChange={e => set(index, { pauseAfter: Number(e.target.value) as PauseAfter })}>{PAUSE_CHOICES.map(p => <option key={p} value={p}>{PAUSE_LABELS[String(p)]}</option>)}</select></label>
          <label><span>Emosi <i className="voice-tag guide">panduan</i></span>
            <select aria-label={`Emosi segmen ${index + 1}`} value={d.emotion} disabled={disabled} onChange={e => set(index, { emotion: e.target.value as VoiceEmotion })}>{Object.entries(VOICE_EMOTION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>Gaya <i className="voice-tag guide">panduan</i></span>
            <select aria-label={`Gaya segmen ${index + 1}`} value={d.delivery} disabled={disabled} onChange={e => set(index, { delivery: e.target.value as VoiceDelivery })}>{Object.entries(VOICE_DELIVERY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>Intonasi {d.intonation === "rising" || d.intonation === "falling" ? <i className="voice-tag live">naik/turun memengaruhi suara</i> : <i className="voice-tag guide">panduan</i>}</span>
            <select aria-label={`Intonasi segmen ${index + 1}`} value={d.intonation} disabled={disabled} onChange={e => set(index, { intonation: e.target.value as VoiceIntonation })}>{Object.entries(VOICE_INTONATION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        </div>
        <EmphasisField index={index} text={d.sourceText} value={d.emphasis} disabled={disabled} onCommit={words => set(index, { emphasis: words })} />
        <small className="voice-direction-reason">{d.reason} Keyakinan: {CONFIDENCE[d.confidence]}. Kecepatan bicara: {speed.toFixed(2).replace(".", ",")}×.</small>
        {mine && <button type="button" className="voice-reset" disabled={disabled} onClick={() => reset(index)} data-testid={`voice-reset-${index}`}>Pulihkan rekomendasi segmen ini</button>}
        {mine && auto[index] && <small className="voice-direction-reason">Rekomendasi awal: {VOICE_EMOTION_LABELS[auto[index].emotion]}, tempo {VOICE_PACE_LABELS[auto[index].pace].toLowerCase()}, jeda +{String(auto[index].pauseAfter).replace(".", ",")} dtk.</small>}
      </details>;
    })}
    {anyChanged && <button type="button" className="motion-secondary" disabled={disabled} onClick={() => onChange({})} data-testid="voice-reset-all">Pulihkan semua rekomendasi otomatis</button>}
  </div>;
}
