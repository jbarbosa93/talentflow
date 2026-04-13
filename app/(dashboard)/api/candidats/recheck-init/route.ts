import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export async function POST() {
  const authError = await requireAuth()
  if (authError) return authError
  const admin = createAdminClient()

  // Créer la table recheck_results si elle n'existe pas
  // On utilise une requête directe via le REST API de Supabase
  const sql = `
    CREATE TABLE IF NOT EXISTS recheck_results (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      candidat_id uuid NOT NULL REFERENCES candidats(id) ON DELETE CASCADE,
      candidat_nom text,
      candidat_prenom text,
      old_data jsonb,
      new_data jsonb,
      diffs jsonb,
      diff_count int DEFAULT 0,
      status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_recheck_candidat ON recheck_results(candidat_id);
    CREATE INDEX IF NOT EXISTS idx_recheck_status ON recheck_results(status);
  `

  // Essayer d'insérer un row test pour voir si la table existe
  const { error: testError } = await (admin as any).from('recheck_results').select('id').limit(1)

  if (testError?.code === '42P01') {
    // Table n'existe pas → la créer via l'API SQL de Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    })

    if (!sqlRes.ok) {
      // Fallback : essayer via l'endpoint SQL direct
      const pgRes = await fetch(`${supabaseUrl}/pg/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      })

      if (!pgRes.ok) {
        return NextResponse.json({
          error: 'Table n\'existe pas. Créez-la manuellement dans Supabase SQL Editor.',
          sql,
        }, { status: 500 })
      }
    }

    return NextResponse.json({ created: true })
  }

  return NextResponse.json({ exists: true })
}
