"use client";

export const FLOW_STEPS = ["Naskah", "Sutradara dan gaya", "Suara dan musik", "Gambar", "Render"] as const;

/** On a phone the five steps are shown one at a time: a progress bar on top ... */
export function FlowStepperBar({ step, onGo }: { step: number; onGo: (n: number) => void }) {
  return <nav className="flow-stepper" aria-label="Langkah pengaturan" data-testid="flow-stepper">
    <div className="flow-stepper-title"><b>Langkah {step} dari {FLOW_STEPS.length}</b><span>{FLOW_STEPS[step - 1]}</span></div>
    <div className="progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={FLOW_STEPS.length} aria-valuenow={step} data-testid="flow-progress"><span style={{ width: `${(step / FLOW_STEPS.length) * 100}%` }} /></div>
    <div className="flow-dots">{FLOW_STEPS.map((t, i) => <button key={t} type="button" className={step === i + 1 ? "active" : i + 1 < step ? "done" : ""} onClick={() => onGo(i + 1)} aria-label={`Langkah ${i + 1}: ${t}`} aria-current={step === i + 1 ? "step" : undefined} data-testid={`flow-dot-${i + 1}`}>{i + 1}</button>)}</div>
  </nav>;
}

/** ... and "Kembali" / "Selanjutnya" under each step. Hidden on a tablet or laptop, where all steps stay on screen. */
export function FlowStepNav({ step, onGo }: { step: number; onGo: (n: number) => void }) {
  return <div className="flow-nav" data-testid={`flow-nav-${step}`}>
    {step > 1 ? <button type="button" className="text-button" onClick={() => onGo(step - 1)} data-testid="flow-back">Kembali</button> : <span />}
    {step < FLOW_STEPS.length ? <button type="button" className="motion-primary" onClick={() => onGo(step + 1)} data-testid="flow-next">Selanjutnya: {FLOW_STEPS[step]}</button> : <span />}
  </div>;
}
