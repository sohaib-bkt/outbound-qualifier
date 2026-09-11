'use client';
import { useEffect, useState } from 'react';
export default function Detail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<{ lead: { name: string; phone: string; status: string; qualification_score: number | null; interest_level: string | null; budget: string | null; timeline: string | null; call_summary: string | null; transcript: string | null }; calls: { id: string; vapi_call_id: string; status: string }[]; sms: { id: string; body: string; status: string }[] } | null>(null);
  useEffect(() => { fetch(`/api/leads/${params.id}`).then(r => r.json()).then(setData); }, [params.id]);
  if (!data) return <main className="p-8">Loading…</main>;
  return (<main className="p-8 max-w-3xl mx-auto">
    <h1 className="text-xl font-bold">{data.lead.name} — {data.lead.phone}</h1>
    <p>Status: {data.lead.status} | Score: {data.lead.qualification_score}</p>
    <p>Interest: {data.lead.interest_level} | Budget: {data.lead.budget} | Timeline: {data.lead.timeline}</p>
    <p className="mt-4">{data.lead.call_summary}</p>
    <pre className="bg-gray-100 p-4 mt-4 whitespace-pre-wrap">{data.lead.transcript}</pre>
    {data.lead.status === 'analysis_failed' && (<button className="bg-black text-white px-4 py-2 mt-4" onClick={async () => {
      await fetch(`/api/leads/${params.id}/reanalyze`, { method: 'POST' });
      location.reload();
    }}>Re-analyze</button>)}
    <h2 className="font-bold mt-6">Calls ({data.calls.length})</h2>
    <ul>{data.calls.map(c => <li key={c.id}>{c.vapi_call_id} — {c.status}</li>)}</ul>
    <h2 className="font-bold mt-6">SMS ({data.sms.length})</h2>
    <ul>{data.sms.map(s => <li key={s.id}>{s.status}: {s.body}</li>)}</ul>
  </main>);
}
