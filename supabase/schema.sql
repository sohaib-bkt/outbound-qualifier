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
