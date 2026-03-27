import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (!match) return null
  const [, dd, mm, yyyy] = match
  const d = parseInt(dd, 10), m = parseInt(mm, 10), y = parseInt(yyyy, 10)
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2099) return null
  return `${yyyy}-${mm}-${dd}T12:00:00.000Z`
}

// POST : Met à jour created_at de chaque candidat selon la date dans le nom du fichier CV
// Pagination Supabase + updates parallèles par batch de 50 pour tenir dans les 300s
export async function POST() {
  const supabase = createAdminClient()

  try {
    let updated = 0
    let skipped = 0
    let totalFetched = 0

    const PAGE_SIZE = 1000
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: candidats, error } = await supabase
        .from('candidats')
        .select('id, cv_nom_fichier, created_at')
        .not('cv_nom_fichier', 'is', null)
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) {
        console.error('[sync-dates] Erreur fetch candidats:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!candidats || candidats.length === 0) { hasMore = false; break }

      totalFetched += candidats.length

      // Préparer tous les updates de ce batch
      const updates: Array<{ id: string; isoDate: string; filename: string }> = []
      for (const candidat of candidats) {
        const isoDate = extractDateFromFilename(candidat.cv_nom_fichier as string)
        if (!isoDate) { skipped++; continue }
        updates.push({ id: candidat.id, isoDate, filename: candidat.cv_nom_fichier as string })
      }

      console.log(`[sync-dates] Batch offset=${offset} : ${candidats.length} candidats fetched, ${updates.length} à mettre à jour, ${skipped} sans date`)

      // Exécuter via RPC admin_set_created_at en parallèle par batch de 50
      // La fonction RPC tourne en SECURITY DEFINER et bypasse tous les triggers/restrictions
      const PARALLEL = 50
      for (let i = 0; i < updates.length; i += PARALLEL) {
        const chunk = updates.slice(i, i + PARALLEL)
        const results = await Promise.all(
          chunk.map(u =>
            supabase.rpc('admin_set_created_at', { p_id: u.id, p_date: u.isoDate })
          )
        )
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          const u = chunk[j]
          if (r.error) {
            console.error(`[sync-dates] ERREUR RPC id=${u.id} fichier=${u.filename} : ${r.error.message}`)
            skipped++
          } else {
            updated++
          }
        }
      }

      hasMore = candidats.length === PAGE_SIZE
      offset += PAGE_SIZE
    }

    console.log(`[sync-dates] Terminé : ${updated} mis à jour, ${skipped} ignorés, total=${totalFetched}`)
    return NextResponse.json({ success: true, updated, skipped, total: totalFetched })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    console.error('[sync-dates] Exception:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
