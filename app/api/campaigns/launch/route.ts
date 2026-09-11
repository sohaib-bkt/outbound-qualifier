export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { dialLead } from '@/lib/vapi';
export async function POST(req: NextRequest) {
  const userClient = createServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(body.limit ?? 50, 50);
  const svc = createServiceClient();
  const { data: leads } = await svc.from('leads').select('id,name,phone').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: true }).limit(limit);
  if (!leads || leads.length === 0) return NextResponse.json({ launched: 0 });
  const { data: camp } = await svc.from('campaigns').insert({ user_id: user.id, name: body.campaignName ?? `Campaign ${new Date().toISOString()}`, status: 'running', total_leads: leads.length }).select('id').single();
  const errors: unknown[] = [];
  for (const l of leads) {
    try {
      const callId = await dialLead(l.phone, l.name);
      await svc.from('leads').update({ status: 'calling', vapi_call_id: callId, last_contacted_at: new Date().toISOString() }).eq('id', l.id);
    } catch (e) {
      await svc.from('leads').update({ status: 'failed' }).eq('id', l.id);
      errors.push({ lead: l.id, error: String(e) });
    }
  }
  return NextResponse.json({ launched: leads.length, campaignId: camp?.id, errors });
}
