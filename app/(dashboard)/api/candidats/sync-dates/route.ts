import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST : Met à jour created_at de chaque candidat selon la date dans le nom du fichier CV
// Format attendu dans le nom de fichier : DD.MM.YYYY (ex: "DUPONT Jean 15.03.2022.pdf")
// Si aucune date trouvée → on ne modifie pas le candidat
// Pagination Supabase : récupère par pages de 1000 pour gérer les grosses bases
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

      if (!candidats || candidats.length === 0) {
        hasMore = false
        break
      }

      totalFetched += candidats.length

      for (const candidat of candidats) {
        const match = (candidat.cv_nom_fichier as string)?.match(dateRegex)
        if (!match) {
          skipped++
          continue
        }

        const [, day, month, year] = match
        const d = parseInt(day), m = parseInt(month), y = parseInt(year)
        if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2030) {
          skipped++
          continue
        }

        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00.000Z`

        const { error: updateError } = await supabase
          .from('candidats')
          .update({ created_at: isoDate } as Record<string, unknown>)
          .eq('id', candidat.id)

        if (!updateError) updated++
        else skipped++
      }

      if (candidats.length < PAGE_SIZE) {
        hasMore = false
      } else {
        offset += PAGE_SIZE
      }
    }

    return NextResponse.json({ success: true, updated, skipped, total: totalFetched })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
