// GET /api/cron/extract-cv-text/status
// Retourne le nombre de CVs restants à traiter (pour l'UI sidebar + card outils)
// Protégé par requireAuth() — appelé côté navigateur

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  const supabase = createAdminClient()

  // Total candidats avec un CV
  const { count: totalAvecCV } = await supabase
    .from('candidats')
    .select('id', { count: 'exact', head: true })
    .not('cv_url', 'is', null)

  // Restants : NULL ou vide (pas les marqueurs finaux [scan-non-lisible] / [pdf-chiffre])
  const { count: restants } = await supabase
    .from('candidats')
    .select('id', { count: 'exact', head: true })
    .or('cv_texte_brut.is.null,cv_texte_brut.eq.')
    .not('cv_url', 'is', null)

  const total = totalAvecCV || 0
  const r = restants || 0
  const pourcentage = total > 0 ? Math.round(((total - r) / total) * 100) : 100

  return NextResponse.json({ restants: r, total, pourcentage })
}
