export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { analyzeTranscript } from '@/lib/groq';
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supa = createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const svc = createServiceClient();
  const { data: lead } = await svc.from('leads').select('*').eq('id', params.id).eq('user_id', user.id).single();
  if (!lead?.transcript) return NextResponse.json({ error: 'no transcript' }, { status: 400 });
  try {
    const qual = await analyzeTranscript(lead.transcript);
    const status = qual.qualified ? 'qualified' : 'not_qualified';
    await svc.from('leads').update({ qualification_score: qual.qualification_score, interest_level: qual.interest_level, budget: qual.budget, timeline: qual.timeline, call_summary: qual.call_summary, status }).eq('id', lead.id);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
