import { wavePath } from "./WaveThread";

// Stacked waveform composition for the dark auth panel. Decorative.
export default function WaveMark({ className = "" }: { className?: string }) {
  const rows = [0, 1, 2, 3, 4];
  return (
    <svg
      className={className}
      viewBox="0 0 400 220"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {rows.map((r) => (
        <path
          key={r}
          d={wavePath(400, 60, r * 2.3)}
          transform={`translate(0,${r * 40})`}
          fill="none"
          stroke={r === 2 ? "var(--signal)" : "#EFF2EF"}
          strokeOpacity={r === 2 ? 1 : 0.28}
          strokeWidth={r === 2 ? 2 : 1.25}
          strokeLinecap="round"
        />
      ))}
      <circle cx="200" cy="110" r="4" fill="var(--signal)" />
    </svg>
  );
}
