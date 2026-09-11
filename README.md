# Signal Room — Outbound Qualifier

Voice-AI pipeline: upload leads, dial them with Vapi, score transcripts with Groq, follow up by SMS via Twilio.
<img width="1263" height="625" alt="image" src="https://github.com/user-attachments/assets/ca1bd597-f615-4697-9e03-078c516707b8" />

## Pipeline

```
CSV upload → Launch (Vapi dial) → end-of-call webhook → Groq score → qualified? SMS : skip
```

Lead statuses: `pending → calling → qualified | not_qualified | no_answer | failed | analysis_failed`.

## Run

```bash
npm install
cp .env.example .env.local   # fill credentials
```

Apply `supabase/schema.sql` in the Supabase SQL editor, then:

```bash
npm run dev      # http://localhost:3000
npm run build && npm run start   # prod
```

## Webhooks (local dev)

Vapi needs a public URL:

```bash
cloudflared tunnel --url http://localhost:3000
```

Set `APP_BASE_URL` to the tunnel URL, configure the assistant's Server URL
(`<APP_BASE_URL>/api/webhooks/vapi`) + Bearer credential (`VAPI_WEBHOOK_SECRET`)
in the Vapi dashboard.

## Config notes

- `GROQ_MODEL` must be a live Groq model (e.g. `openai/gpt-oss-20b`).
- Vapi `POST /call/phone` accepts no per-call `serverUrl`; webhooks resolve via
  assistant → phone-number → org server config.
- Twilio needs valid Account SID/Auth Token and destination-country permissions.



