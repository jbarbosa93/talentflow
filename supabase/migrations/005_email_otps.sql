CREATE TABLE IF NOT EXISTS email_otps (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Auto-cleanup old OTPs
CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expires_at);
