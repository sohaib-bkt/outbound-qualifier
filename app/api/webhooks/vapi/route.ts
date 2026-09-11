export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { analyzeTranscript } from '@/lib/groq';
import { buildSmsBody, sendSms } from '@/lib/sms';
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.VAPI_WEBHOOK_SECRET}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  if (body.message?.type !== 'end-of-call-report') return NextResponse.json({ ignored: true });
  const call = body.message?.call ?? body.call ?? {};
  const vapiCallId: string = call.id ?? body.message?.callId ?? crypto.randomUUID();
  const phone: string | undefined = body.message?.customer?.number ?? call?.customer?.number;
  const transcript: string = body.message?.transcript ?? body.transcript ?? '';
  const endedReason: string | null = body.message?.endedReason ?? null;
  const recordingUrl: string | null = body.message?.recordingUrl ?? null;
  const duration: number | null = body.message?.durationSeconds ?? body.message?.duration ?? null;
  const cost: number | null = body.message?.cost ?? null;
  const svc = createServiceClient();
  let lead: { id: string; user_id: string; name: string; phone: string } | null = null;
  if (phone) {
    const { data } = await svc.from('leads').select('id,user_id,name,phone').eq('phone', phone).order('updated_at', { ascending: false }).limit(1);
    lead = data?.[0] ?? null;
  }
  if (!lead) {
    const { data } = await svc.from('leads').select('id,user_id,name,phone').eq('vapi_call_id', vapiCallId).limit(1);
    lead = data?.[0] ?? null;
  }
  if (!lead) return NextResponse.json({ orphan: true });
  const { error: insertErr } = await svc.from('calls').insert({ lead_id: lead.id, vapi_call_id: vapiCallId, status: endedReason ?? 'ended', duration_seconds: duration, ended_reason: endedReason, recording_url: recordingUrl, cost, started_at: new Date().toISOString(), ended_at: new Date().toISOString() });
  if (insertErr && (insertErr as { code?: string }).code === '23505') return NextResponse.json({ duplicate: true });
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  let qual;
  try {
    qual = await analyzeTranscript(transcript);
  } catch (e) {
    await svc.from('leads').update({ status: 'analysis_failed', transcript, call_summary: `GROQ_ERROR: ${String(e)}` }).eq('id', lead.id);
    return NextResponse.json({ analysis_failed: true });
  }
  let status = qual.qualified ? 'qualified' : 'not_qualified';
  if (!qual.qualified && endedReason === 'no-answer') status = 'no_answer';
  await svc.from('leads').update({ qualification_score: qual.qualification_score, interest_level: qual.interest_level, budget: qual.budget, timeline: qual.timeline, call_summary: qual.call_summary, transcript, status, vapi_call_id: vapiCallId, last_contacted_at: new Date().toISOString() }).eq('id', lead.id);
  if (status === 'qualified') {
    const smsBody = buildSmsBody(lead.name);
    try {
      const msg = await sendSms(lead.phone, smsBody);
      await svc.from('sms_log').insert({ lead_id: lead.id, twilio_sid: msg.sid, direction: 'outbound', body: smsBody, status: 'sent' });
    } catch (e) {
      await svc.from('sms_log').insert({ lead_id: lead.id, direction: 'outbound', body: smsBody, status: 'failed' });
    }
  }
  return NextResponse.json({ ok: true, status });
}
