export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
export async function GET() {
  const supa = createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { count: pending } = await supa.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending');
  const { count: calling } = await supa.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'calling');
  const { count: qualified } = await supa.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'qualified');
  const { count: total } = await supa.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  return NextResponse.json({ pending: pending ?? 0, calling: calling ?? 0, qualified: qualified ?? 0, total: total ?? 0, rate: total ? (qualified ?? 0) / total : 0 });
}
