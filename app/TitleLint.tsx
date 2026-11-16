"use client";

import type { LintResult } from "@/lib/title-lint";

/** Advice on a title and its thumbnail as one pairing. It is shown beside the SEO pack and never changes the pack's own score. */
export default function TitleLint({ result, heading }: { result: LintResult; heading: string }) {
  return <div className="title-lint" data-testid="title-lint">
    <div className="title-lint-head"><b>{heading}</b> <span data-testid="title-lint-score">{result.score}/100</span> <small>saran, tidak mengubah skor SEO</small></div>
    <ul>
      {result.issues.map(i => <li key={i.id} className="bad" data-testid="title-lint-issue">✗ {i.message}</li>)}
      {result.good.map((g, n) => <li key={n} className="ok">✓ {g}</li>)}
    </ul>
  </div>;
}
