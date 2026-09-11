'use client';
import { useCallback, useEffect, useState } from 'react';
import SignalChain from './components/SignalChain';
import StatusPill from './components/StatusPill';
import ScoreBar from './components/ScoreBar';

type Lead = { id: string; name: string; phone: string; company: string | null; status: string; qualification_score: number | null };

const STATUS_OPTIONS = ['', 'pending', 'calling', 'qualified', 'not_qualified', 'no_answer', 'failed', 'analysis_failed'];

export default function Dashboard() {
  const [stats, setStats] = useState({ pending: 0, calling: 0, qualified: 0, total: 0, rate: 0 });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState(''); const [q, setQ] = useState('');
  const refresh = useCallback(async () => {
    const s = await (await fetch('/api/stats')).json(); setStats(s);
    const l = await (await fetch(`/api/leads?status=${status}&q=${encodeURIComponent(q)}`)).json(); setLeads(l.leads ?? []);
  }, [status, q]);
  useEffect(() => { refresh(); }, [refresh]);
  const upload = async (f: File) => {
    const fd = new FormData(); fd.append('file', f);
    await fetch('/api/leads/upload', { method: 'POST', body: fd }); refresh();
  };
  const launch = async () => {
    await fetch('/api/campaigns/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 50 }) }); refresh();
  };
  return (
    <main className="min-h-screen">
      {/* masthead */}
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-8 pb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="rise">
            <p className="eyebrow text-ink/60">Outbound qualifier</p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-2">Signal Room</h1>
            <p className="text-ink/60 mt-2 max-w-md">Upload leads, put the voice agent on the line, keep only the signal.</p>
          </div>
          <div className="text-right rise">
            <p className="eyebrow text-ink/60">Close rate</p>
            <p className="font-display text-4xl sm:text-5xl font-bold tracking-tight tabular-nums">{(stats.rate * 100).toFixed(1)}<span className="text-signal">%</span></p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* pipeline */}
        <div className="mt-6 rise">
          <SignalChain stages={[
            { label: 'Uploaded', count: stats.total, hint: 'csv rows on file' },
            { label: 'Queued', count: stats.pending, hint: 'waiting to dial' },
            { label: 'Calling', count: stats.calling, hint: 'on the line now', live: stats.calling > 0 },
            { label: 'Qualified', count: stats.qualified, hint: 'passed score ≥ 70' },
          ]} />
        </div>

        {/* actions */}
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink px-4 py-2 font-mono text-xs uppercase tracking-wider hover:bg-mist transition-colors">
            Upload CSV
            <input type="file" accept=".csv" className="sr-only" onChange={e => e.target.files && upload(e.target.files[0])} />
          </label>
          <button className="rounded-lg bg-signal px-5 py-2 font-mono text-xs uppercase tracking-wider text-white hover:brightness-110 active:brightness-95 transition" onClick={launch}>Launch campaign</button>
          <label className="sr-only" htmlFor="status-filter">Filter by status</label>
          <select id="status-filter" className="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o === '' ? 'All statuses' : o}</option>)}
          </select>
          <label className="sr-only" htmlFor="lead-search">Search leads</label>
          <input id="lead-search" className="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs w-48 placeholder:text-ink/40" placeholder="search name, phone, co…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && refresh()} />
        </div>

        {/* ledger */}
        <section className="mt-6 mb-4" aria-label="Leads">
          <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr] gap-3 px-2 pb-2 eyebrow text-ink/50" aria-hidden="true">
            <span>Lead</span><span>Phone</span><span>Company</span><span>Status</span><span className="text-right">Score</span>
          </div>
          {leads.length === 0 ? (
            <div className="border-y border-line py-12 text-center">
              <p className="font-display text-2xl font-bold">The room is quiet.</p>
              <p className="text-ink/60 mt-1">Upload a CSV to put leads on the board.</p>
            </div>
          ) : (
            <ul className="border-t border-line">
              {leads.map(l => (
                <li key={l.id} className="grid grid-cols-2 sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr] gap-2 sm:gap-3 items-center px-2 py-3 border-b border-line hover:bg-mist/60 transition-colors">
                  <a className="font-display font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal transition-colors" href={`/leads/${l.id}`}>{l.name}</a>
                  <span className="font-mono text-xs text-ink/70">{l.phone}</span>
                  <span className="text-sm text-ink/70 truncate">{l.company ?? '—'}</span>
                  <span><StatusPill status={l.status} /></span>
                  <span className="sm:text-right"><ScoreBar score={l.qualification_score} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="border-t-4 border-abyss mt-10 mb-8 pt-3 flex justify-between font-mono text-[11px] text-ink/50">
          <span>signal room — voice pipeline</span>
          <span>{stats.total} on file · {stats.qualified} qualified</span>
        </footer>
      </div>
    </main>
  );
}
