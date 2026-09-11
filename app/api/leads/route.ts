export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
export async function GET(req: NextRequest) {
  const supa = createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const status = req.nextUrl.searchParams.get('status');
  const q = req.nextUrl.searchParams.get('q');
  let query = supa.from('leads').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
  if (status) query = query.eq('status', status);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%`);
  const { data } = await query;
  return NextResponse.json({ leads: data ?? [] });
}
