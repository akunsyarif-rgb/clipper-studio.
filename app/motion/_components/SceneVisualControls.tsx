import { ICONS, resolveVisual, type Cut, TEMPLATES, type Template, type VisualOverride } from "@/lib/visuals";

/** 83.4 → "1:23.4" */
function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** Per-scene visual correction: template and icon, each "Otomatis" unless the user picks one. */
export default function SceneVisualControls({ text, topics, override, disabled, onChange, cut, onCut, onClipHere, onClipSeek }: { text: string; topics?: ReadonlySet<string>; override?: VisualOverride; disabled: boolean; onChange: (o: VisualOverride) => void; cut?: { value?: Cut; auto: Cut; clipFrom?: number }; onCut: (c: Cut | undefined) => void; onClipHere: () => void; onClipSeek: (seconds: number) => void }) {
  const auto = resolveVisual(text, undefined, topics);
  const current = resolveVisual(text, override, topics);
  const autoIcon = auto.icon ? ICONS[auto.icon]?.label : "tanpa ikon";
  return (
    <div className="scene-visual">
      {cut && <label>
        <span>Layar</span>
        <select value={cut.value ?? ""} disabled={disabled} data-testid="scene-cut" onChange={e => onCut((e.target.value || undefined) as Cut | undefined)}>
          <option value="">Otomatis · {cut.auto === "graphic" ? "Grafis penuh" : cut.auto === "overlay" ? "Video + animasi" : "Video + subtitle"}</option>
          <option value="video">Video + subtitle</option>
          <option value="overlay">Video + animasi</option>
          <option value="graphic">Grafis penuh (ganti layar)</option>
          <option value="clip">Potongan lain dari video</option>
        </select>
      </label>}
      {cut && cut.value === "clip" && <div className="clip-pick" data-testid="clip-pick">
        <span>Mulai di <b data-testid="clip-from">{formatClock(cut.clipFrom ?? 0)}</b> (maks. 4 dtk, tanpa suara)</span>
        <button type="button" className="text-link" disabled={disabled} onClick={() => onClipSeek(cut.clipFrom ?? 0)} data-testid="clip-seek">Lihat</button>
        <button type="button" className="text-link" disabled={disabled} onClick={onClipHere} data-testid="clip-here">Pakai posisi pemutar</button>
      </div>}
      <label>
        <span>Tampilan</span>
        <select value={override?.template ?? ""} disabled={disabled} data-testid="scene-template"
          onChange={e => onChange({ ...override, template: (e.target.value || undefined) as Template | undefined })}>
          <option value="">Otomatis · {TEMPLATES.find(x => x.id === auto.template)?.label}</option>
          {TEMPLATES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <label>
        <span>Ikon</span>
        <select value={override?.icon ?? ""} disabled={disabled || current.template === "compare" || current.template === "cta"} data-testid="scene-icon"
          onChange={e => onChange({ ...override, icon: e.target.value || undefined })}>
          <option value="">Otomatis · {autoIcon}</option>
          <option value="none">Tanpa ikon</option>
          {Object.entries(ICONS).sort((a, b) => a[1].label.localeCompare(b[1].label, "id")).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}
        </select>
      </label>
    </div>
  );
}
