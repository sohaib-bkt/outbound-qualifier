import WaveThread from "./WaveThread";

export type Stage = { label: string; count: number; hint: string; live?: boolean };

// The pipeline as a connected signal chain: Uploaded → Queued → Calling → Qualified.
// Counts are real; connectors are the SVG waveform thread.
export default function SignalChain({ stages }: { stages: Stage[] }) {
  return (
    <ol className="border-y border-line">
      <div className="grid grid-cols-2 lg:flex lg:items-stretch">
        {stages.map((s, i) => (
          <div key={s.label} className="contents">
            <li className="flex-1 px-5 py-5 lg:py-6">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  {s.live ? (
                    <>
                      <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-signal" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
                    </>
                  ) : (
                    <span
                      className="relative inline-flex h-2 w-2 rounded-full"
                      style={{ background: i === stages.length - 1 ? "var(--abyss)" : "var(--ink)", opacity: i === stages.length - 1 ? 1 : 0.35 }}
                    />
                  )}
                </span>
                <span className="eyebrow text-ink/60">{s.label}</span>
              </div>
              <p className="font-display text-4xl lg:text-5xl font-bold tracking-tight mt-2 tabular-nums">{s.count}</p>
              <p className="font-mono text-[11px] text-ink/50 mt-1">{s.hint}</p>
            </li>
            {i < stages.length - 1 && (
              <div className="hidden lg:flex items-center w-24 xl:w-32 shrink-0" aria-hidden="true">
                <WaveThread className="h-6 w-full" seed={i * 1.7} />
              </div>
            )}
          </div>
        ))}
      </div>
    </ol>
  );
}
