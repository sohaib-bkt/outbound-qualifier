'use client';
import { useEffect, useState } from 'react';
import StatusPill from '@/app/components/StatusPill';
import ScoreBar from '@/app/components/ScoreBar';

type Detail = {
  lead: { name: string; phone: string; company: string | null; status: string; qualification_score: number | null; interest_level: string | null; budget: string | null; timeline: string | null; call_summary: string | null; transcript: string | null };
  calls: { id: string; vapi_call_id: string; status: string }[];
  sms: { id: string; body: string; status: string }[];
};

export default function Detail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Detail | null>(null);
  useEffect(() => { fetch(`/api/leads/${params.id}`).then(r => r.json()).then(setData); }, [params.id]);
  if (!data) return <main className="min-h-screen p-8 font-mono text-sm text-ink/60">Tuning in…</main>;
  const hot = (data.lead.qualification_score ?? 0) >= 70;
  const facts: Array<[string, string | null]> = [
    ['Interest', data.lead.interest_level],
    ['Budget', data.lead.budget],
    ['Timeline', data.lead.timeline],
    ['Company', data.lead.company],
  ];
  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
        <a href="/" className="eyebrow text-ink/60 hover:text-signal transition-colors">← All leads</a>
        <div className="flex flex-wrap items-center gap-3 mt-4 rise">
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">{data.lead.name}</h1>
          <StatusPill status={data.lead.status} />
        </div>
        <p className="font-mono text-sm text-ink/60 mt-2">{data.lead.phone}</p>

        <div className="flex items-end gap-5 mt-6 border-y border-line py-5">
          <p className={`font-display text-6xl font-bold tracking-tight tabular-nums ${hot ? 'text-signal' : ''}`}>
            {data.lead.qualification_score ?? '—'}
          </p>
          <div className="pb-2">
            <p className="eyebrow text-ink/60">Qualification score</p>
            <div className="mt-2"><ScoreBar score={data.lead.qualification_score} /></div>
            <p className="font-mono text-[11px] text-ink/50 mt-1">cut line is 70</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line mt-6">
          {facts.map(([k, v]) => (
            <div key={k} className="bg-paper px-4 py-3">
              <dt className="eyebrow text-ink/50">{k}</dt>
              <dd className="text-sm mt-1 truncate">{v ?? '—'}</dd>
            </div>
          ))}
        </dl>

        {data.lead.call_summary && (
          <section className="mt-6 border-l-4 border-signal pl-4" aria-label="Call summary">
            <p className="eyebrow text-ink/60 mb-1">Summary</p>
            <p className="leading-relaxed">{data.lead.call_summary}</p>
          </section>
        )}
        {data.lead.transcript && (
          <section className="mt-6" aria-label="Transcript">
            <p className="eyebrow text-ink/60 mb-2">Transcript</p>
            <pre className="bg-mist rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto">{data.lead.transcript}</pre>
          </section>
        )}
        {data.lead.status === 'analysis_failed' && (
          <button className="rounded-lg border border-signal text-signal px-5 py-2 mt-6 font-mono text-xs uppercase tracking-wider hover:bg-signal hover:text-white transition-colors" onClick={async () => {
            await fetch(`/api/leads/${params.id}/reanalyze`, { method: 'POST' });
            location.reload();
          }}>Re-analyze</button>
        )}

        <section className="mt-8" aria-label="Calls">
          <h2 className="eyebrow text-ink/60 mb-2">Calls ({data.calls.length})</h2>
          <ul className="border-t border-line">
            {data.calls.map(c => (
              <li key={c.id} className="border-b border-line py-2 font-mono text-xs flex justify-between gap-3">
                <span className="truncate text-ink/70">{c.vapi_call_id ?? c.id}</span><span>{c.status}</span>
              </li>
            ))}
            {data.calls.length === 0 && <li className="border-b border-line py-2 font-mono text-xs text-ink/40">No calls yet.</li>}
          </ul>
        </section>
        <section className="mt-6 mb-10" aria-label="SMS">
          <h2 className="eyebrow text-ink/60 mb-2">SMS ({data.sms.length})</h2>
          <ul className="border-t border-line">
            {data.sms.map(s => (
              <li key={s.id} className="border-b border-line py-2 font-mono text-xs flex justify-between gap-3">
                <span className="truncate">{s.body}</span><span className="shrink-0 text-ink/60">{s.status}</span>
              </li>
            ))}
            {data.sms.length === 0 && <li className="border-b border-line py-2 font-mono text-xs text-ink/40">No messages yet.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
