import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST : Détermine le genre (homme/femme) de chaque candidat à partir du prénom
// Traite max 500 candidats par appel (pour tenir dans 60s Vercel)
// Retourne `remaining` pour que le UI relance si nécessaire
const MAX_PER_CALL = 500
const BATCH_SIZE = 100 // prénoms par appel Claude

export async function POST() {
  const supabase = createAdminClient()

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    // Compter le total restant
    const { count: totalRemaining } = await supabase
      .from('candidats')
      .select('*', { count: 'exact', head: true })
      .is('genre' as string, null)
      .not('prenom', 'is', null)

    if (!totalRemaining || totalRemaining === 0) {
      return NextResponse.json({ success: true, updated: 0, skipped: 0, total: 0, remaining: 0, message: 'Tous les candidats ont déjà un genre défini' })
    }

    // Récupérer le batch à traiter (max MAX_PER_CALL)
    const { data: candidats, error } = await supabase
      .from('candidats')
      .select('id, prenom, nom')
      .is('genre' as string, null)
      .not('prenom', 'is', null)
      .limit(MAX_PER_CALL)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!candidats || candidats.length === 0) {
      return NextResponse.json({ success: true, updated: 0, skipped: 0, total: 0, remaining: 0 })
    }

    let updated = 0
    let skipped = 0

    for (let i = 0; i < candidats.length; i += BATCH_SIZE) {
      const batch = candidats.slice(i, i + BATCH_SIZE)
      const prenomsList = batch.map((c, idx) => `${idx + 1}. ${c.prenom}`).join('\n')

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
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

      // Préparer les updates
      const batchUpdates: Array<{ id: string; genre: string }> = []
      for (const line of lines) {
        const match = line.match(/^(\d+)\s*[|:.\-]\s*(homme|femme)/i)
        if (!match) continue
        const idx = parseInt(match[1]) - 1
        const genre = match[2].toLowerCase()
        if (idx < 0 || idx >= batch.length) continue
        matchedIndices.add(idx)
        batchUpdates.push({ id: batch[idx].id, genre })
      }

      // Exécuter les updates en parallèle par 50
      for (let j = 0; j < batchUpdates.length; j += 50) {
        const chunk = batchUpdates.slice(j, j + 50)
        const results = await Promise.all(
          chunk.map(u =>
            supabase
              .from('candidats')
              .update({ genre: u.genre } as Record<string, unknown>)
              .eq('id', u.id)
          )
        )
        for (const r of results) {
          if (!r.error) updated++
          else skipped++
        }
      }

      skipped += batch.filter((_, idx) => !matchedIndices.has(idx)).length
    }

    const remaining = Math.max(0, totalRemaining - candidats.length)

    return NextResponse.json({ success: true, updated, skipped, total: candidats.length, remaining })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
