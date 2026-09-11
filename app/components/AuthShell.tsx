import WaveMark from "./WaveMark";

// Split screen: abyss panel with display type + waveform, paper panel with the form.
export default function AuthShell({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen grid md:grid-cols-2">
      <div className="relative overflow-hidden bg-abyss text-paper flex flex-col justify-between p-8 sm:p-12 min-h-[38vh]">
        <p className="eyebrow text-paper/60">Outbound qualifier</p>
        <div className="rise">
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight leading-[1.02] text-balance">{title}</h1>
          <p className="mt-3 text-paper/70 max-w-sm">{kicker}</p>
        </div>
        <WaveMark className="pointer-events-none absolute -bottom-10 -right-10 h-64 w-[28rem] opacity-80" />
      </div>
      <div className="flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-sm rise">{children}</div>
      </div>
    </main>
  );
}
