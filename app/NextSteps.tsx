import type { ReactNode } from "react";

/** "What next" under a finished export: one short line and the actions that continue the work. */
export default function NextSteps({ children, hint }: { children?: ReactNode; hint: string }) {
  return <div className="next-steps" data-testid="next-steps">
    <b>Langkah berikutnya</b>
    <p>{hint}</p>
    {children ? <div className="button-row">{children}</div> : null}
  </div>;
}
