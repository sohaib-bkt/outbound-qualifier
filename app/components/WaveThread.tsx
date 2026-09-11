// Deterministic waveform polyline — voice as signal, drawn in code, no assets.
export function wavePath(width: number, height: number, seed = 0): string {
  const mid = height / 2;
  const pts: string[] = [];
  for (let x = 0; x <= width; x += 5) {
    const t = (x / width) * Math.PI * 4 + seed;
    const env = Math.sin((x / width) * Math.PI); // swell in the middle
    const y = mid + Math.sin(t) * (height * 0.42) * env + Math.sin(t * 2.7) * (height * 0.1) * env;
    pts.push(`${x === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

// Horizontal thread that connects pipeline stages. The dash-flow
// animation lives in .signal-thread (globals.css).
export default function WaveThread({ className = "", seed = 0 }: { className?: string; seed?: number }) {
  return (
    <svg
      className={className}
      viewBox="0 0 300 24"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="0" y1="12" x2="300" y2="12" stroke="var(--line)" strokeWidth="1" />
      <path
        className="signal-thread"
        d={wavePath(300, 24, seed)}
        fill="none"
        stroke="var(--signal)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
