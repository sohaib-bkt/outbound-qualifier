export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supa = createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: lead } = await supa.from('leads').select('*').eq('id', params.id).eq('user_id', user.id).single();
  if (!lead) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data: calls } = await supa.from('calls').select('*').eq('lead_id', params.id).order('created_at', { ascending: false });
  const { data: sms } = await supa.from('sms_log').select('*').eq('lead_id', params.id).order('sent_at', { ascending: false });
  return NextResponse.json({ lead, calls: calls ?? [], sms: sms ?? [] });
}
