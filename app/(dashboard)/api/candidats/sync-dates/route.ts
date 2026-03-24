import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST : Met à jour created_at de chaque candidat selon la date dans le nom du fichier CV
// Pagination Supabase + updates parallèles par batch de 50 pour tenir dans les 60s
export async function POST() {
  const supabase = createAdminClient()

  try {
    const dateRegex = /(\d{2})\.(\d{2})\.(\d{4})/
    let updated = 0
    let skipped = 0
    let totalFetched = 0

    const PAGE_SIZE = 1000
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: candidats, error } = await supabase
        .from('candidats')
        .select('id, cv_nom_fichier')
        .not('cv_nom_fichier', 'is', null)
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!candidats || candidats.length === 0) { hasMore = false; break }

      totalFetched += candidats.length

      // Préparer tous les updates de ce batch
      const updates: Array<{ id: string; isoDate: string }> = []
      for (const candidat of candidats) {
        const match = (candidat.cv_nom_fichier as string)?.match(dateRegex)
        if (!match) { skipped++; continue }
        const [, day, month, year] = match
        const d = parseInt(day), m = parseInt(month), y = parseInt(year)
        if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2030) { skipped++; continue }
        updates.push({ id: candidat.id, isoDate: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00.000Z` })
      }

      // Exécuter les updates en parallèle par batch de 50
      const PARALLEL = 50
      for (let i = 0; i < updates.length; i += PARALLEL) {
        const chunk = updates.slice(i, i + PARALLEL)
        const results = await Promise.all(
          chunk.map(u =>
            supabase
              .from('candidats')
              .update({ created_at: u.isoDate } as Record<string, unknown>)
              .eq('id', u.id)
          )
        )
        for (const r of results) {
          if (!r.error) updated++
          else skipped++
        }
      }

      hasMore = candidats.length === PAGE_SIZE
      offset += PAGE_SIZE
    }

    return NextResponse.json({ success: true, updated, skipped, total: totalFetched })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
