# Outbound Lead Qualifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build monolith Next.js 14 outbound qualifier in `dev/outbound-qualifier` with CSV upload, Vapi loop dialing, Groq qualification webhook, Twilio SMS, and CRM dashboard.

**Architecture:** Single Next.js 14 App Router app; all server logic in Node-runtime API routes using Supabase service-role; webhook uses insert-first idempotency on `calls.vapi_call_id`; stats recounted on read; no background workers.

**Tech Stack:** Next.js 14.2 + TypeScript 5 + Tailwind 3, `@supabase/ssr@0.5`, `@supabase/supabase-js@2.44`, `csv-parse@5.5`, `groq-sdk@0.7`, `twilio@5.2`, `zod@3.23`.

**Spec:** `docs/superpowers/specs/2026-09-10-outbound-lead-qualifier-design.md`

## Global Constraints

- Node runtime for ALL API routes: `export const runtime = 'nodejs'` — never Edge.
- `leads.status` CHECK includes exactly `('pending','calling','qualified','not_qualified','no_answer','failed','analysis_failed')`.
- NO `UNIQUE(user_id, phone)` on leads — plain `INDEX idx_leads_user_phone ON leads(user_id, phone)` only.
- `campaigns` has NO `vapi_campaign_id`, NEVER write `completed_calls`/`qualified_count` — stats via subqueries in `GET /api/stats`.
- Upload dedup: skip row only if same `user_id+phone` has `status='calling'` AND `updated_at > now()-10min`; else INSERT new pending row.
- Launch default limit 50, oldest-first.
- Webhook: verify `Authorization: Bearer VAPI_WEBHOOK_SECRET` else 401; INSERT `calls` FIRST, on `23505` return `200 {duplicate:true}`; only then Groq/SMS.
- Groq model `llama-3.3-70b-versatile`, qualified iff `score>=70`; Groq parse fail → `analysis_failed`, never `not_qualified`.
- SMS body: default `` `Hi ${lead.name}, thanks for speaking with us today! We'd love to follow up — reply YES to book a time.` ``; if `SMS_FOLLOWUP_TEMPLATE` set, substitute only `${name}` token.
- Phone validation E.164 `^\+[1-9]\d{7,14}$` everywhere.
- Env names verbatim: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`, `VAPI_WEBHOOK_SECRET`, `GROQ_API_KEY`, `GROQ_MODEL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `SMS_FOLLOWUP_TEMPLATE`, `APP_BASE_URL`.

---

## File Map

- `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.mjs`, `.env.example` — scaffold + deps.
- `lib/supabase/server.ts` — `createServerClient()` (user token) + `createServiceClient()` (service-role).
- `lib/supabase/client.ts` — browser client for login/signup/dashboard.
- `lib/validation.ts` — `E164_REGEX`, `LeadRowSchema`, CSV row parser types.
- `lib/groq.ts` — `analyzeTranscript(transcript: string): Promise<QualResult>` + `QUAL_PROMPT`.
- `lib/sms.ts` — `buildSmsBody(name: string): string` + `sendSms(to, body)`.
- `lib/vapi.ts` — `dialLead(phone, name): Promise<string>` (returns vapi_call_id).
- `middleware.ts` — Supabase session refresh, protect `/` and `/leads/*`.
- `app/login/page.tsx`, `app/signup/page.tsx` — auth forms.
- `app/page.tsx` — dashboard (stats + upload + launch + table).
- `app/leads/[id]/page.tsx` — detail + Re-analyze button.
- `app/api/leads/upload/route.ts` — CSV upload.
- `app/api/campaigns/launch/route.ts` — loop dial.
- `app/api/webhooks/vapi/route.ts` — idempotent webhook.
- `app/api/leads/route.ts` — list with `?status=&q=`.
- `app/api/stats/route.ts` — recount subqueries.
- `app/api/leads/[id]/reanalyze/route.ts` — Groq retry.
- `app/api/leads/[id]/route.ts` — single lead + calls + sms.
- `supabase/schema.sql` — full DDL with amendments.
- `tests/fixtures/upload.csv`, `tests/fixtures/webhook.json` — curl fixtures.

---

### Task 1: Scaffold Next.js + Env + Supabase clients

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.mjs`, `.env.example`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/validation.ts`
- Test: `lib/validation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createServerClient(): SupabaseClient`, `createServiceClient(): SupabaseClient`, `E164_REGEX: RegExp`, `isValidE164(phone: string): boolean`.

- [ ] **Step 1: Scaffold app**

Run:
```bash
npx create-next-app@14.2.5 . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```
Expected: Next.js files created in `dev/outbound-qualifier`. Run inside that dir, answer defaults non-interactively (add `--yes` if prompted).

- [ ] **Step 2: Install deps**

Run:
```bash
npm i @supabase/ssr@0.5.2 @supabase/supabase-js@2.44.4 csv-parse@5.5.6 groq-sdk@0.7.0 twilio@5.2.2 zod@3.23.8
npm i -D vitest@2.1.3
```
Expected: PASS, no peer errors.

- [ ] **Step 3: Write `.env.example`**

```env
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
VAPI_API_KEY=vapi_...
VAPI_ASSISTANT_ID=asst_...
VAPI_PHONE_NUMBER_ID=pn_...
VAPI_WEBHOOK_SECRET=whsec_...
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+15551234567
SMS_FOLLOWUP_TEMPLATE=
APP_BASE_URL=https://your-ngrok.ngrok-free.app
```

- [ ] **Step 4: Write `lib/validation.ts`**

```ts
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;
export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone.trim());
}
export type LeadCsvRow = { name: string; phone: string; email?: string; company?: string };
```

- [ ] **Step 5: Write `lib/supabase/server.ts`**

```ts
import { createServerClient as ssr } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
export function createServerClient() {
  const store = cookies();
  return ssr(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: (k: string) => store.get(k)?.value, set() {}, remove() {} },
  });
}
export function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
export const runtime = 'nodejs';
```

- [ ] **Step 6: Write `lib/supabase/client.ts`**

```ts
'use client';
import { createBrowserClient } from '@supabase/ssr';
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
```

- [ ] **Step 7: Write failing test `lib/validation.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { isValidE164 } from './validation';
describe('E164', () => {
  it('accepts valid', () => { expect(isValidE164('+15551234567')).toBe(true); });
  it('rejects invalid', () => { expect(isValidE164('555123')).toBe(false); });
});
```

- [ ] **Step 8: Run test**

Run: `npx vitest run lib/validation.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 9: Commit**

```bash
git add package.json lib/ .env.example
git commit -m "feat: scaffold next14 + supabase clients + validation"
```

---

### Task 2: Database schema

**Files:**
- Create: `supabase/schema.sql`
- Test: manual `psql` apply in Supabase SQL editor.

**Interfaces:**
- Consumes: none.
- Produces: tables `leads, calls, campaigns, sms_log` per spec.

- [ ] **Step 1: Write `supabase/schema.sql`**

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  company TEXT,
  source TEXT DEFAULT 'csv_upload',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','calling','qualified','not_qualified','no_answer','failed','analysis_failed')),
  qualification_score INTEGER,
  interest_level TEXT,
  budget TEXT,
  timeline TEXT,
  call_summary TEXT,
  transcript TEXT,
  vapi_call_id TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  vapi_call_id TEXT UNIQUE,
  status TEXT,
  duration_seconds INTEGER,
  ended_reason TEXT,
  recording_url TEXT,
  cost DECIMAL(10,4),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed')),
  total_leads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  twilio_sid TEXT,
  direction TEXT CHECK (direction IN ('outbound','inbound')),
  body TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own leads" ON leads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own campaigns" ON campaigns FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own calls" ON calls FOR ALL USING (auth.uid() = (SELECT user_id FROM leads WHERE id = calls.lead_id));
CREATE POLICY "Users see own sms" ON sms_log FOR ALL USING (auth.uid() = (SELECT user_id FROM leads WHERE id = sms_log.lead_id));
CREATE INDEX idx_leads_user_status ON leads(user_id, status);
CREATE INDEX idx_leads_user_phone ON leads(user_id, phone);
CREATE INDEX idx_calls_lead ON calls(lead_id);
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Apply in Supabase SQL editor, verify**

Run in dashboard: paste file, run. Then `SELECT tablename FROM pg_tables WHERE schemaname='public';`
Expected: 4 tables present, no `vapi_campaign_id` column.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add supabase schema with analysis_failed + recount stats"
```

---

### Task 3: Auth pages + middleware

**Files:**
- Create: `middleware.ts`, `app/login/page.tsx`, `app/signup/page.tsx`
- Test: manual login in browser.

**Interfaces:**
- Consumes: `createBrowserSupabase()` from Task 1.
- Produces: session cookie guarding `/` and `/leads/*`.

- [ ] **Step 1: Write `middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supa = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: (k: string) => req.cookies.get(k)?.value, set: (k, v, o) => res.cookies.set(k, v, o), remove: (k, o) => res.cookies.set(k, '', o) },
  });
  const { data } = await supa.auth.getUser();
  if (!data.user && (req.nextUrl.pathname === '/' || req.nextUrl.pathname.startsWith('/leads'))) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return res;
}
export const config = { matcher: ['/', '/leads/:path*'] };
```

- [ ] **Step 2: Write `app/login/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('');
  const router = useRouter();
  return (<main className="max-w-sm mx-auto p-8">
    <h1 className="text-xl font-bold mb-4">Login</h1>
    <input className="border p-2 w-full mb-2" placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
    <input className="border p-2 w-full mb-2" placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
    {err && <p className="text-red-600 text-sm mb-2">{err}</p>}
    <button className="bg-black text-white px-4 py-2 w-full" onClick={async()=>{
      const s = createBrowserSupabase();
      const { error } = await s.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message); else router.push('/');
    }}>Sign in</button>
  </main>);
}
```

- [ ] **Step 3: Write `app/signup/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
export default function Signup() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [msg, setMsg] = useState('');
  const router = useRouter();
  return (<main className="max-w-sm mx-auto p-8">
    <h1 className="text-xl font-bold mb-4">Sign up</h1>
    <input className="border p-2 w-full mb-2" placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
    <input className="border p-2 w-full mb-2" placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
    {msg && <p className="text-sm mb-2">{msg}</p>}
    <button className="bg-black text-white px-4 py-2 w-full" onClick={async()=>{
      const s = createBrowserSupabase();
      const { error } = await s.auth.signUp({ email, password });
      if (error) setMsg(error.message); else { setMsg('Signed up — go to login'); router.push('/login'); }
    }}>Sign up</button>
  </main>);
}
```

- [ ] **Step 4: Manual test**

Run: `npm run dev`, visit `/signup` → create user → `/login` → lands `/`.
Expected: Supabase Auth user row created.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts "app/login/page.tsx" "app/signup/page.tsx"
git commit -m "feat: auth pages + middleware guard"
```

---

### Task 4: CSV upload API

**Files:**
- Create: `app/api/leads/upload/route.ts`
- Test: `tests/fixtures/upload.csv` + curl.

**Interfaces:**
- Consumes: `createServerClient`, `createServiceClient`, `isValidE164`.
- Produces: `{ inserted, skipped_active_call, invalid }`.

- [ ] **Step 1: Write fixture `tests/fixtures/upload.csv`**

```csv
name,phone,email,company
Alice,+15551234567,alice@acme.co,Acme
Bob,555-bad,bob@bad.co,Bad
Cara,+15559876543,,Initech
```

- [ ] **Step 2: Write `app/api/leads/upload/route.ts`**

```ts
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
```

- [ ] **Step 3: Curl test**

Run:
```bash
curl -s -X POST http://localhost:3000/api/leads/upload -H "Authorization: Bearer $SUPABASE_USER_JWT" -F "file=@tests/fixtures/upload.csv"
```
Expected: `{"inserted":2,"skipped_active_call":0,"invalid":1}` (get JWT from browser localStorage after login).

- [ ] **Step 4: Commit**

```bash
git add app/api/leads/upload/route.ts tests/fixtures/upload.csv
git commit -m "feat: csv upload with 10min calling dedup"
```

---

### Task 5: Vapi dial lib + Launch API

**Files:**
- Create: `lib/vapi.ts`, `app/api/campaigns/launch/route.ts`
- Test: curl launch with `limit=1`.

**Interfaces:**
- Consumes: service client, auth user.
- Produces: `dialLead(phone: string, name: string): Promise<string>` returning `vapi_call_id`.

- [ ] **Step 1: Write `lib/vapi.ts`**

```ts
export async function dialLead(phone: string, name: string): Promise<string> {
  const res = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistantId: process.env.VAPI_ASSISTANT_ID,
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: phone, name },
      serverUrl: `${process.env.APP_BASE_URL}/api/webhooks/vapi`,
    }),
  });
  if (!res.ok) throw new Error(`vapi dial failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.id as string;
}
```

- [ ] **Step 2: Write `app/api/campaigns/launch/route.ts`**

```ts
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
```

- [ ] **Step 3: Curl test (mock or single real)**

Run:
```bash
curl -s -X POST http://localhost:3000/api/campaigns/launch -H "Content-Type: application/json" -H "Authorization: Bearer $SUPABASE_USER_JWT" -d '{"limit":1}'
```
Expected: `{"launched":1,...}` and lead row `status=calling`.

- [ ] **Step 4: Commit**

```bash
git add lib/vapi.ts app/api/campaigns/launch/route.ts
git commit -m "feat: campaign launch loop single vapi calls"
```

---

### Task 6: Groq + SMS libs + Webhook (insert-first idempotency)

**Files:**
- Create: `lib/groq.ts`, `lib/sms.ts`, `app/api/webhooks/vapi/route.ts`
- Test: `tests/fixtures/webhook.json` replayed twice.

**Interfaces:**
- Consumes: `createServiceClient`.
- Produces: `analyzeTranscript(t: string): Promise<QualResult>`; `buildSmsBody(name: string): string`; webhook `POST` returning `{duplicate|qualified|...}`.

- [ ] **Step 1: Write `lib/groq.ts`**

```ts
import Groq from 'groq-sdk';
export type QualResult = { qualification_score: number; interest_level: string; budget: string | null; timeline: string | null; call_summary: string; qualified: boolean; raw: string };
export async function analyzeTranscript(transcript: string): Promise<QualResult> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You qualify outbound sales leads. Return JSON only: {qualification_score 0-100, interest_level high|medium|low, budget string|null, timeline string|null, call_summary string, qualified boolean}. qualified=true iff score>=70.' },
      { role: 'user', content: transcript.slice(0, 12000) },
    ],
    temperature: 0.2,
  });
  const raw = completion.choices[0]?.message?.content ?? '{}';
  const j = JSON.parse(raw);
  return { qualification_score: j.qualification_score ?? 0, interest_level: j.interest_level ?? 'low', budget: j.budget ?? null, timeline: j.timeline ?? null, call_summary: j.call_summary ?? '', qualified: Boolean(j.qualified ?? (j.qualification_score ?? 0) >= 70), raw };
}
```

- [ ] **Step 2: Write `lib/sms.ts`**

```ts
import twilio from 'twilio';
const DEFAULT_TEMPLATE = 'Hi ${name}, thanks for speaking with us today! We\'d love to follow up — reply YES to book a time.';
export function buildSmsBody(name: string): string {
  const tpl = process.env.SMS_FOLLOWUP_TEMPLATE || DEFAULT_TEMPLATE;
  return tpl.split('${name}').join(name);
}
export async function sendSms(to: string, body: string) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  return client.messages.create({ to, from: process.env.TWILIO_FROM_NUMBER!, body });
}
```

- [ ] **Step 3: Write failing check — template test**

```ts
// lib/sms.test.ts
import { describe, it, expect } from 'vitest';
import { buildSmsBody } from './sms';
describe('sms', () => {
  it('interpolates name', () => { expect(buildSmsBody('Alice')).toContain('Alice'); expect(buildSmsBody('Alice')).not.toContain('${name}'); expect(buildSmsBody('Alice')).not.toContain('{name}'); });
});
```
Run: `npx vitest run lib/sms.test.ts` — Expected: PASS.

- [ ] **Step 4: Write `app/api/webhooks/vapi/route.ts`**

```ts
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
```

- [ ] **Step 5: Fixture replay test**

Create `tests/fixtures/webhook.json` with `{message:{type:'end-of-call-report', call:{id:'test-call-1'}, customer:{number:'+15551234567'}, transcript:'Hi I am interested, budget 5k, next week', endedReason:'customer-ended-call'}}`, then:
```bash
curl -s -X POST http://localhost:3000/api/webhooks/vapi -H "Authorization: Bearer $VAPI_WEBHOOK_SECRET" -H "Content-Type: application/json" -d @tests/fixtures/webhook.json
curl -s -X POST http://localhost:3000/api/webhooks/vapi -H "Authorization: Bearer $VAPI_WEBHOOK_SECRET" -H "Content-Type: application/json" -d @tests/fixtures/webhook.json
```
Expected: first `{ok:true,...}` or `{analysis_failed:true}`, second `{duplicate:true}`.

- [ ] **Step 6: Commit**

```bash
git add lib/groq.ts lib/sms.ts lib/sms.test.ts app/api/webhooks/vapi/route.ts tests/fixtures/webhook.json
git commit -m "feat: vapi webhook insert-first + groq + twilio sms"
```

---

### Task 7: Stats + Leads list + Dashboard UI

**Files:**
- Create: `app/api/stats/route.ts`, `app/api/leads/route.ts`, `app/page.tsx`
- Test: curl stats, browser check.

**Interfaces:**
- Consumes: Tasks 1–5 data.
- Produces: `GET /api/stats → {pending, calling, qualified, rate}`, dashboard page.

- [ ] **Step 1: Write `app/api/stats/route.ts`** (recount on read, no counter writes)

```ts
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
```

- [ ] **Step 2: Write `app/api/leads/route.ts`**

```ts
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
```

- [ ] **Step 3: Write `app/page.tsx`**

```tsx
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
```

- [ ] **Step 4: Verify**

Run: `npm run dev`, check stats cards update after upload fixture.
Expected: pending count matches inserted rows.

- [ ] **Step 5: Commit**

```bash
git add app/api/stats/route.ts app/api/leads/route.ts app/page.tsx
git commit -m "feat: dashboard stats recount + leads table + upload/launch ui"
```

---

### Task 8: Lead detail + Re-analyze

**Files:**
- Create: `app/api/leads/[id]/route.ts`, `app/api/leads/[id]/reanalyze/route.ts`, `app/leads/[id]/page.tsx`
- Test: force `analysis_failed` then reanalyze.

**Interfaces:**
- Consumes: `analyzeTranscript`, service client.
- Produces: detail JSON `{lead, calls, sms}`, reanalyze `{ok, status}`.

- [ ] **Step 1: Write `app/api/leads/[id]/route.ts`**

```ts
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
```

- [ ] **Step 2: Write `app/api/leads/[id]/reanalyze/route.ts`**

```ts
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
```

- [ ] **Step 3: Write `app/leads/[id]/page.tsx`**

```tsx
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
```

- [ ] **Step 4: Verify**

Run: manually set a lead to `analysis_failed` in Supabase, click Re-analyze.
Expected: status flips to qualified/not_qualified.

- [ ] **Step 5: Commit**

```bash
git add "app/api/leads/[id]/route.ts" "app/api/leads/[id]/reanalyze/route.ts" "app/leads/[id]/page.tsx"
git commit -m "feat: lead detail + reanalyze for analysis_failed"
```

---

### Task 9: Final verification

- [ ] **Step 1: Typecheck + tests**

Run:
```bash
npx tsc --noEmit
npx vitest run
```
Expected: 0 errors, all tests PASS.

- [ ] **Step 2: Full curl loop**

Run:
```bash
curl -s http://localhost:3000/api/stats -H "Authorization: Bearer $SUPABASE_USER_JWT"
```
Expected: JSON with pending/calling/qualified/total/rate, no `completed_calls` fields anywhere.

- [ ] **Step 3: Grep for banned patterns**

Run:
```bash
rg -n "vapi_campaign_id|completed_calls|qualified_count|\\{name\\}" app lib || echo "clean"
```
Expected: `clean` (no matches — proves dropped columns and `{name}` never used).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final verification" || echo "nothing to commit"
```
