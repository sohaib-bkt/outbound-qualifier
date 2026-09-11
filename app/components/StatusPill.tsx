const styles: Record<string, string> = {
  qualified: "bg-abyss text-paper border-abyss",
  calling: "bg-transparent text-signal border-signal",
  pending: "bg-transparent text-ink/60 border-line",
  not_qualified: "bg-mist text-ink/70 border-mist",
  no_answer: "bg-mist text-ink/70 border-mist",
  failed: "bg-ink text-paper border-ink",
  analysis_failed: "bg-transparent text-signal border-signal border-dashed",
};

export default function StatusPill({ status }: { status: string }) {
  const cls = styles[status] ?? styles.pending;
  const live = status === "calling";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap ${cls}`}>
      {live && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-signal" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
        </span>
      )}
      {status}
    </span>
  );
}
