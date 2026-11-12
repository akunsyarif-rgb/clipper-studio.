"use client";

/**
 * A thin bar above a list of search results: how many there are, and one tap to hide or show them, so a long list never
 * forces the creator to scroll past it. The results stay in memory while hidden (showing them again needs no new search).
 */
export default function ResultsBar({ count, hidden, onToggle, label = "hasil", testId }: {
  count: number;
  hidden: boolean;
  onToggle: () => void;
  label?: string;
  testId?: string;
}) {
  return <div className="results-bar">
    <small>{count} {label}</small>
    <button type="button" className="text-link" aria-expanded={!hidden} onClick={onToggle} data-testid={testId}>{hidden ? "Tampilkan" : "Sembunyikan"}</button>
  </div>;
}
