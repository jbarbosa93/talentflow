// app/(dashboard)/api/admin/detect-anomalies/route.ts
// Scan observabilité : appelle la fonction Postgres admin_detect_anomalies()
// pour détecter les incohérences (cv_texte_brut/nom_fichier qui ne matchent pas
// le nom du candidat, cv_url orphelins). Admin uniquement.
//
// GET /api/admin/detect-anomalies
// → { scan_at, total, texte_mismatch[], onedrive_mismatch[], cv_orphan[] }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch').trim()

async function requireAdmin(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 })
    }
    return null
  } catch {
    return NextResponse.json({ error: 'Erreur d\'authentification' }, { status: 500 })
  }
}

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const supabase = createAdminClient()
    const t0 = Date.now()
    const { data, error } = await (supabase as any).rpc('admin_detect_anomalies')
    const duration = Date.now() - t0

    if (error) {
      console.error('[detect-anomalies] RPC error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ...data, duration_ms: duration })
  } catch (e) {
    console.error('[detect-anomalies] Exception:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
