'use client';
import { useEffect, useState } from 'react';
type Lead = { id: string; name: string; phone: string; company: string | null; status: string; qualification_score: number | null };
export default function Dashboard() {
  const [stats, setStats] = useState({ pending: 0, calling: 0, qualified: 0, total: 0, rate: 0 });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState(''); const [q, setQ] = useState('');
  const refresh = async () => {
    const s = await (await fetch('/api/stats')).json(); setStats(s);
    const l = await (await fetch(`/api/leads?status=${status}&q=${encodeURIComponent(q)}`)).json(); setLeads(l.leads ?? []);
  };
  useEffect(() => { refresh(); }, []);
  const upload = async (f: File) => {
    const fd = new FormData(); fd.append('file', f);
    await fetch('/api/leads/upload', { method: 'POST', body: fd }); refresh();
  };
  const launch = async () => {
    await fetch('/api/campaigns/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 50 }) }); refresh();
  };
  return (<main className="p-8 max-w-5xl mx-auto">
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="border p-4">Pending: {stats.pending}</div>
      <div className="border p-4">Calling: {stats.calling}</div>
      <div className="border p-4">Qualified: {stats.qualified}</div>
      <div className="border p-4">Rate: {(stats.rate * 100).toFixed(1)}%</div>
    </div>
    <div className="flex gap-4 mb-6">
      <input type="file" accept=".csv" onChange={e => e.target.files && upload(e.target.files[0])} />
      <button className="bg-black text-white px-4 py-2" onClick={launch}>Launch Campaign</button>
      <select className="border p-2" value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option><option value="pending">pending</option><option value="calling">calling</option><option value="qualified">qualified</option><option value="not_qualified">not_qualified</option><option value="analysis_failed">analysis_failed</option></select>
      <input className="border p-2" placeholder="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && refresh()} />
    </div>
    <table className="w-full border"><tbody>{leads.map(l => (<tr key={l.id} className="border-t"><td className="p-2"><a className="underline" href={`/leads/${l.id}`}>{l.name}</a></td><td className="p-2">{l.phone}</td><td className="p-2">{l.company}</td><td className="p-2">{l.status}</td><td className="p-2">{l.qualification_score}</td></tr>))}</tbody></table>
  </main>);
}
