# Outbound Lead Qualifier — Design — 2026-09-10

## Goal
Next.js 14 (App Router, TS, Tailwind) in `dev/outbound-qualifier` + Supabase Auth/Postgres + Vapi voice AI + Groq analysis + Twilio SMS. User uploads CSV → launches campaign (loop single Vapi calls) → webhook qualifies via Groq → SMS if qualified → CRM dashboard. Approach A (monolith API routes) approved.

## Architecture
- **App:** Next.js 14 App Router, TypeScript, Tailwind, Supabase SSR Auth (`@supabase/ssr`, `@supabase/supabase-js`).
- **API routes (Node runtime, never Edge — need Twilio/Groq SDKs + CSV parse):**
  - `POST /api/leads/upload` — multipart CSV, auth via Supabase access token, service-role insert.
  - `POST /api/campaigns/launch` — body `{ campaignName?, limit? default 50 }`, loops Vapi single calls.
  - `POST /api/webhooks/vapi` — Bearer `VAPI_WEBHOOK_SECRET`, insert-first idempotency, Groq, Twilio.
  - `GET /api/leads?status=&q=` + `GET /api/stats` — dashboard reads (RLS via user token). Stats recounted on read via subqueries; no counter writes.
  - `POST /api/leads/[id]/reanalyze` — reruns Groq on stored transcript (for `analysis_failed`).
- **Pages:** `/login`, `/signup` (Supabase email/password; signup creates `auth.users` row, no custom trigger needed for MVP), `/` (stats cards + upload + launch + leads table), `/leads/[id]` (detail: transcript, score, call history, SMS log, Re-analyze button when `analysis_failed`).
- **Env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`, `VAPI_WEBHOOK_SECRET`, `GROQ_API_KEY` (+ `GROQ_MODEL=llama-3.3-70b-versatile`), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `SMS_FOLLOWUP_TEMPLATE` (optional, `${name}` token only), `APP_BASE_URL` (public HTTPS URL used as Vapi `serverUrl`, e.g. ngrok in dev).

## Data model (user SQL + amendments)
Use provided `leads / calls / campaigns / sms_log` DDL with changes:
1. `leads.status` CHECK adds `'analysis_failed'`: `('pending','calling','qualified','not_qualified','no_answer','failed','analysis_failed')`.
2. NO `UNIQUE(user_id, phone)` — re-campaigns = new rows. Use plain `INDEX idx_leads_user_phone ON leads(user_id, phone)`.
3. Add missing RLS: `ENABLE ROW LEVEL SECURITY` on `calls`, `sms_log` (+ `campaigns` already has). Policies: users access rows whose parent `lead_id`/`user_id` belongs to them — implement via `USING (auth.uid() = (SELECT user_id FROM leads WHERE id = lead_id))` for calls/sms, or service-role bypass in API + RLS for direct client reads. Keep `leads`/`campaigns` policies as given.
4. Keep `idx_leads_user_status`, `idx_leads_phone`, `idx_calls_lead`, `idx_calls_vapi`, `leads_updated_at` trigger.
5. `campaigns` trimmed for Approach A: DROP `vapi_campaign_id` column (unused — no Vapi batch API). NEVER write `completed_calls` / `qualified_count` — they are computed at read time in `GET /api/stats` via subqueries (e.g. `COUNT(*) FILTER (WHERE status='qualified')`). `campaigns` row stores only `{ id, user_id, name, status, total_leads, created_at, updated_at }`.

## Flows
### Upload dedup (approved revision)
For each CSV row (validate `name` non-empty, `phone` E.164 `^\+[1-9]\d{7,14}$`):
- Check `leads WHERE user_id=:uid AND phone=:phone AND status='calling' AND updated_at > now()-interval '10 min'` → if found, skip row as `skipped_active_call`.
- Else `INSERT` new `pending` row (no upsert). Allows re-import of `pending/no_answer/failed/not_qualified/analysis_failed`.
- Return `{ inserted, skipped_active_call, invalid }`.

### Launch (loop single calls, limit 50 MVP)
1. Auth user, fetch oldest `pending` leads for user (`ORDER BY created_at ASC LIMIT :limit`).
2. Create `campaigns` row `{ name, status='running', total_leads }`.
3. For each lead: `POST https://api.vapi.ai/call/phone` with `{ assistantId, phoneNumberId, customer:{number: lead.phone, name}, serverUrl: {APP_BASE_URL}/api/webhooks/vapi }` + `Authorization: Bearer VAPI_API_KEY`. On success: `leads SET status='calling', vapi_call_id, last_contacted_at=now()`. On dial fail: `status='failed'`, continue loop (collect per-lead errors).
4. Campaign row is write-once `{ name, status='running', total_leads }` — no counter writes. Stats always recounted on read.

### Webhook `end-of-call-report` (insert-first idempotency)
1. Verify `Authorization: Bearer VAPI_WEBHOOK_SECRET` → else 401. Ignore non-`end-of-call-report` messages with 200 `{ignored:true}`.
2. Extract `call.id`, `customer.number`, `transcript`, `recordingUrl`, `duration`, `endedReason`, `cost`.
3. Resolve lead: `WHERE phone=number ORDER BY updated_at DESC LIMIT 1` (fallback: `WHERE vapi_call_id=call.id`). If none → 200 `{orphan:true}` + log.
4. **INSERT `calls` FIRST:** `(lead_id, vapi_call_id, status, duration_seconds, ended_reason, recording_url, cost, started_at, ended_at)`. On Postgres `23505 unique_violation` → return `200 {duplicate:true}` immediately. This guarantees at-most-once Groq/SMS even if Vapi retries.
5. Else run Groq `llama-3.3-70b-versatile`, JSON mode: `{ qualification_score 0-100, interest_level (high|medium|low), budget TEXT|null, timeline TEXT|null, call_summary, qualified bool }`. Prompt: qualify if score>=70.
6. Groq success → `leads SET qualification_score, interest_level, budget, timeline, call_summary, transcript, status = qualified|not_qualified (or no_answer if endedReason=no-answer)`. Update `calls.status` if needed.
7. **Groq parse fail → `status='analysis_failed'`, `call_summary = raw response + error`, keep transcript.** UI shows Re-analyze. Never mark `not_qualified` on AI error.
8. If `qualified` → build SMS body in code as template literal: default `` `Hi ${lead.name}, thanks for speaking with us today! We'd love to follow up — reply YES to book a time.` ``. If env `SMS_FOLLOWUP_TEMPLATE` is set, apply simple `${name}` substitution against it instead (only `${name}` token supported in MVP). Then Twilio `messages.create({to: lead.phone, from: TWILIO_FROM_NUMBER, body})` → `sms_log` row `{lead_id, twilio_sid, direction='outbound', body, status}`. Twilio fail → `sms_log status='failed'`, do NOT rollback lead.
9. Return 200 quickly (Vercel timeout: run Groq+Twilio after `calls` insert; consider `waitUntil` if available, else sequential — MVP sequential, log durations).

### Re-analyze
`POST /api/leads/[id]/reanalyze` — owner check, fetch stored `transcript`, rerun Groq prompt, apply same update rules (qualified/not_qualified, or stays `analysis_failed` on repeat fail).

## UI
- `/login` — Supabase email/password (magic link optional later).
- `/` — stats cards (pending, calling, qualified, qualification rate), CSV file input + preview counts, Launch button (name + limit), leads table (filter by status, search name/phone/company).
- `/leads/[id]` — fields, score badge, interest/budget/timeline, summary, full transcript `<pre>`, calls list, sms_log list, Re-analyze button if `analysis_failed`.

## Error handling
| Case | Handling |
|---|---|
| Vapi dial fail | lead `failed`, continue loop, return per-lead errors |
| Webhook bad bearer | 401, no DB write |
| Orphan call (no lead) | 200 orphan, log for triage |
| Duplicate webhook (23505) | 200 duplicate, skip Groq/SMS |
| Groq fail | `analysis_failed`, retriable |
| Twilio fail | `sms_log failed`, lead stays qualified |
| CSV invalid row | skip + count, 200 with summary (not 400 unless file missing) |

## Testing
- `curl` fixtures: upload minimal CSV (valid + invalid E.164 + active-calling duplicate), launch with `limit=2` mocked Vapi (or real with test number), webhook replay twice (assert second = duplicate), Groq bad-JSON fixture → `analysis_failed` → reanalyze → qualified.
- RLS: user A cannot read user B leads (direct Supabase query test).
- Validation: E.164 regex unit test, CSV parser test.
- Type: `tsc --noEmit`, lint changed files.
