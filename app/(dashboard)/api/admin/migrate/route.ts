// Route temporaire pour appliquer les migrations — À SUPPRIMER après utilisation
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()

  const migrations = [
    `ALTER TABLE candidats ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL`,
    `CREATE TABLE IF NOT EXISTS email_otps (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      user_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expires_at)`,
  ]

  const results = []
  for (const sql of migrations) {
    // Use raw SQL via the pg endpoint
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    })
    results.push({ sql: sql.slice(0, 60), status: res.status, ok: res.ok })
  }

  return NextResponse.json({ results })
}
