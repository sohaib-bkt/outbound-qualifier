export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { isValidE164 } from '@/lib/validation';
export async function POST(req: NextRequest) {
  const userClient = createServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  const text = await file.text();
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true }) as Record<string,string>[];
  const svc = createServiceClient();
  let inserted = 0, skipped_active_call = 0, invalid = 0;
  for (const r of rows) {
    const name = (r.name ?? '').trim(); const phone = (r.phone ?? '').trim();
    if (!name || !isValidE164(phone)) { invalid++; continue; }
    const { data: active } = await svc.from('leads').select('id').eq('user_id', user.id).eq('phone', phone).eq('status', 'calling').gt('updated_at', new Date(Date.now() - 10*60*1000).toISOString()).limit(1);
    if (active && active.length > 0) { skipped_active_call++; continue; }
    const { error } = await svc.from('leads').insert({ user_id: user.id, name, phone, email: r.email || null, company: r.company || null, status: 'pending', source: 'csv_upload' });
    if (error) { invalid++; } else { inserted++; }
  }
  return NextResponse.json({ inserted, skipped_active_call, invalid });
}
