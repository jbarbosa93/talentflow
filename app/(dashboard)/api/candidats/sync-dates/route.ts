import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// POST : Met à jour created_at de chaque candidat selon la date dans le nom du fichier CV
// Format attendu dans le nom de fichier : DD.MM.YYYY (ex: "DUPONT Jean 15.03.2022.pdf")
// Si aucune date trouvée → on ne modifie pas le candidat
export async function POST() {
  const supabase = createAdminClient()

  try {
    // Récupérer tous les candidats avec un nom de fichier CV
    const { data: candidats, error } = await supabase
      .from('candidats')
      .select('id, cv_nom_fichier, created_at')
      .not('cv_nom_fichier', 'is', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const dateRegex = /(\d{2})\.(\d{2})\.(\d{4})/

    let updated = 0
    let skipped = 0

    for (const candidat of candidats || []) {
      const match = (candidat.cv_nom_fichier as string)?.match(dateRegex)
      if (!match) {
        skipped++
        continue
      }

      const [, day, month, year] = match

      // Validation basique : mois 1-12, jour 1-31
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

    return NextResponse.json({ success: true, updated, skipped, total: (candidats || []).length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
