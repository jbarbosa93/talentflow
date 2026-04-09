import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

const dbg = (...args: Parameters<typeof console.log>) => { if (process.env.DEBUG_MODE === 'true') console.log(...args) }

function extractDateFromFilename(filename: string): string | null {
  function toISO(d: number, m: number, y: number): string | null {
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2099) return null
    if (d > new Date(y, m, 0).getDate()) return null
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00.000Z`
  }
  // DD.MM.YYYY
  let match = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (match) return toISO(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10))
  // DD/MM/YYYY
  match = filename.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) return toISO(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10))
  // YYYY-MM-DD
  match = filename.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) return toISO(parseInt(match[3], 10), parseInt(match[2], 10), parseInt(match[1], 10))
  return null
}

// POST : Met à jour created_at de chaque candidat selon la date dans le nom du fichier CV
// Pagination Supabase + updates parallèles par batch de 50 pour tenir dans les 300s
export async function GET() {
  const supabase = createAdminClient()

  // Récupère n'importe quel candidat pour tester l'update de created_at
  const { data: sample } = await supabase
    .from('candidats')
    .select('id, cv_nom_fichier, created_at')
    .not('cv_nom_fichier', 'is', null)
    .limit(1)
    .maybeSingle()

  if (!sample) return NextResponse.json({ error: 'Aucun candidat trouvé' })

  const testDate = '2020-06-15T12:00:00.000Z'
  const before = sample.created_at

  // Tente l'update et lit le résultat directement
  const { data: upData, error: upErr } = await supabase
    .from('candidats')
    .update({ created_at: testDate } as any)
    .eq('id', sample.id)
    .select('id, created_at')
    .single()

  // Lecture indépendante pour confirmer la valeur en DB
  const { data: verify } = await supabase
    .from('candidats')
    .select('created_at')
    .eq('id', sample.id)
    .single()

  // Restaurer la valeur originale
  await supabase.from('candidats').update({ created_at: before } as any).eq('id', sample.id)

  return NextResponse.json({
    id: sample.id,
    filename: sample.cv_nom_fichier,
    before,
    attempted: testDate,
    upError: upErr?.message ?? null,
    afterUpdate: (upData as any)?.created_at,
    afterVerify: verify?.created_at,
    updateWorked: verify?.created_at?.startsWith('2020-06-15'),
  })
}

export async function POST() {
  const supabase = createAdminClient()

  try {
    let updated = 0
    let skipped = 0
    let totalFetched = 0
    const errors: string[] = []

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

      dbg(`[sync-dates] Batch offset=${offset} : ${candidats.length} candidats fetched, ${updates.length} à mettre à jour, ${skipped} sans date`)

      // UPDATE direct via admin client (service_role bypasse RLS)
      // Le trigger trg_candidats_updated_at ne touche que updated_at → created_at est librement modifiable
      const PARALLEL = 5
      for (let i = 0; i < updates.length; i += PARALLEL) {
        const chunk = updates.slice(i, i + PARALLEL)
        const results = await Promise.all(
          chunk.map(u =>
            supabase.from('candidats').update({ created_at: u.isoDate } as any).eq('id', u.id)
          )
        )
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          const u = chunk[j]
          if (r.error) {
            console.error(`[sync-dates] ERREUR UPDATE id=${u.id} fichier=${u.filename} : ${r.error.message}`)
            errors.push(`${u.filename}: ${r.error.message}`)
            skipped++
          } else {
            updated++
          }
        }
      }

      hasMore = candidats.length === PAGE_SIZE
      offset += PAGE_SIZE
    }

    dbg(`[sync-dates] Terminé : ${updated} mis à jour, ${skipped} ignorés, total=${totalFetched}`)
    return NextResponse.json({
      success: true,
      updated,
      skipped,
      total: totalFetched,
      ...(errors.length > 0 && { firstErrors: errors.slice(0, 5) }),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    console.error('[sync-dates] Exception:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
