import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST : Détermine le genre (homme/femme) de chaque candidat à partir du prénom
// Traite par batch de 80 prénoms via Claude Haiku pour minimiser les appels API
export async function POST() {
  const supabase = createAdminClient()

  try {
    // Récupérer tous les candidats sans genre défini
    const { data: candidats, error } = await supabase
      .from('candidats')
      .select('id, prenom, nom')
      .is('genre' as string, null)
      .not('prenom', 'is', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!candidats || candidats.length === 0) {
      return NextResponse.json({ success: true, updated: 0, skipped: 0, total: 0, message: 'Tous les candidats ont déjà un genre défini' })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const BATCH_SIZE = 80
    let updated = 0
    let skipped = 0

    for (let i = 0; i < candidats.length; i += BATCH_SIZE) {
      const batch = candidats.slice(i, i + BATCH_SIZE)

      // Construire la liste numérotée des prénoms
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

      // Parse les résultats
      const lines = text.trim().split('\n')
      for (const line of lines) {
        const match = line.match(/^(\d+)\s*[|:.\-]\s*(homme|femme)/i)
        if (!match) continue
        const idx = parseInt(match[1]) - 1
        const genre = match[2].toLowerCase() as 'homme' | 'femme'
        if (idx < 0 || idx >= batch.length) continue

        const candidat = batch[idx]
        const { error: updateError } = await supabase
          .from('candidats')
          .update({ genre } as Record<string, unknown>)
          .eq('id', candidat.id)

        if (!updateError) updated++
        else skipped++
      }

      // Les candidats non matchés dans le batch
      const matchedIndices = new Set(
        lines
          .map(l => l.match(/^(\d+)\s*[|:.\-]/))
          .filter(Boolean)
          .map(m => parseInt(m![1]) - 1)
      )
      skipped += batch.filter((_, idx) => !matchedIndices.has(idx)).length
    }

    return NextResponse.json({ success: true, updated, skipped, total: candidats.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
