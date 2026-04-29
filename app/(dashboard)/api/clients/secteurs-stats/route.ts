// app/(dashboard)/api/clients/secteurs-stats/route.ts
// v1.9.114 — Stats fréquence secteurs_activite (pour tri filtre /clients)
// GET /api/clients/secteurs-stats → [{ secteur, count }] trié desc par count

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const supabase = createAdminClient() as any

    const { data, error } = await supabase
      .from('clients')
      .select('secteurs_activite')
      .not('secteurs_activite', 'is', null)

    if (error) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // Agrégation côté serveur (lite, 1221 clients max)
    const counts = new Map<string, number>()
    for (const row of (data || []) as Array<{ secteurs_activite: string[] | null }>) {
      const arr = row.secteurs_activite || []
      for (const s of arr) {
        counts.set(s, (counts.get(s) || 0) + 1)
      }
    }

    const stats = Array.from(counts.entries())
      .map(([secteur, count]) => ({ secteur, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ stats })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
