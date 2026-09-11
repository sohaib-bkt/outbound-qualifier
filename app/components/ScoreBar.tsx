// Inline SVG score bar: signal orange at/above the 70 qualification cut.
export default function ScoreBar({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="font-mono text-[11px] text-ink/40">—</span>;
  }
  const hot = score >= 70;
  const w = Math.max(0, Math.min(100, score));
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="72" height="8" viewBox="0 0 72 8" aria-hidden="true" focusable="false" className="shrink-0">
        <rect x="0" y="0" width="72" height="8" rx="4" fill="var(--line)" />
        <rect x="0" y="0" width={(w * 72) / 100} height="8" rx="4" fill={hot ? "var(--signal)" : "var(--ink)"} />
      </svg>
      <span className="font-mono text-[11px] tabular-nums">{score}</span>
    </span>
  );
}
