/** "Mulai dari…": the four ways to get a script in one row, each taking the creator to the right place (which are otherwise spread over the page). */
function go(selector: string, open = false) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  if (open && el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.focus({ preventScroll: true });
}

export default function StartChips() {
  return (
    <div className="start-chips normal-only" role="group" aria-label="Mulai dari" data-testid="start-chips">
      <small>Mulai dari:</small>
      <button type="button" className="chip" onClick={() => go("#motion-script")} data-testid="start-write">Tulis sendiri</button>
      <button type="button" className="chip" onClick={() => go("[data-testid=fold-trend]", true)} data-testid="start-trend">Tren</button>
      <button type="button" className="chip" onClick={() => go("[data-testid=fold-cinematic]", true)} data-testid="start-idea">Ide (AI)</button>
      <button type="button" className="chip" onClick={() => go(".upload-source")} data-testid="start-video">Video</button>
    </div>
  );
}
