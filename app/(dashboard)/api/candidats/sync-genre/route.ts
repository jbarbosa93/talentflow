import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST : Détermine le genre (homme/femme) de chaque candidat à partir du prénom
// Pagination Supabase : récupère par pages de 1000
// Traite par batch de 80 prénoms via Claude Haiku pour minimiser les appels API
export async function POST() {
  const supabase = createAdminClient()

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const PAGE_SIZE = 1000
    const BATCH_SIZE = 80
    let updated = 0
    let skipped = 0
    let totalFetched = 0
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: candidats, error } = await supabase
        .from('candidats')
        .select('id, prenom, nom')
        .is('genre' as string, null)
        .not('prenom', 'is', null)
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!candidats || candidats.length === 0) {
        hasMore = false
        break
      }

      totalFetched += candidats.length

      for (let i = 0; i < candidats.length; i += BATCH_SIZE) {
        const batch = candidats.slice(i, i + BATCH_SIZE)

        const prenomsList = batch.map((c, idx) => `${idx + 1}. ${c.prenom}`).join('\n')

        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20250315',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Pour chaque prénom ci-dessous, indique le genre le plus probable : "homme" ou "femme".
Réponds UNIQUEMENT avec une ligne par prénom au format : numéro|genre
Exemple : 1|homme

${prenomsList}`,
          }],
        })

        const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

        const lines = text.trim().split('\n')
        const matchedIndices = new Set<number>()

        for (const line of lines) {
          const match = line.match(/^(\d+)\s*[|:.\-]\s*(homme|femme)/i)
          if (!match) continue
          const idx = parseInt(match[1]) - 1
          const genre = match[2].toLowerCase() as 'homme' | 'femme'
          if (idx < 0 || idx >= batch.length) continue

          matchedIndices.add(idx)
          const candidat = batch[idx]
          const { error: updateError } = await supabase
            .from('candidats')
            .update({ genre } as Record<string, unknown>)
            .eq('id', candidat.id)

          if (!updateError) updated++
          else skipped++
        }

        skipped += batch.filter((_, idx) => !matchedIndices.has(idx)).length
      }

      if (candidats.length < PAGE_SIZE) {
        hasMore = false
      } else {
        offset += PAGE_SIZE
      }
    }

    if (totalFetched === 0) {
      return NextResponse.json({ success: true, updated: 0, skipped: 0, total: 0, message: 'Tous les candidats ont déjà un genre défini' })
    }

    return NextResponse.json({ success: true, updated, skipped, total: totalFetched })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
