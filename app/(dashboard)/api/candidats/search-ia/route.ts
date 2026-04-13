import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'
export const preferredRegion = 'dub1'  // Dublin — aligné avec Supabase eu-west-1 (Ireland)
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  try {
    const { query } = await request.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Requête vide' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: allCandidats, error } = await supabase
      .from('candidats')
      .select('id, nom, prenom, titre_poste, competences, annees_exp, localisation, formation, langues, resume_ia, cv_texte_brut, experiences, formations_details, statut_pipeline, created_at')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!allCandidats || allCandidats.length === 0) {
      return NextResponse.json({ candidats: [], query_interpreted: query })
    }

    // Résumé compact de chaque candidat pour Claude
    const summaries = allCandidats.map((c: any, i: number) => {
      const exps = (c.experiences || []).map((e: any) => `${e.poste} chez ${e.entreprise} (${e.periode})`).join('; ')
      const cvSnippet = (c.cv_texte_brut || '').slice(0, 300)
      return `[${i}] ID:${c.id} | ${c.prenom || ''} ${c.nom} | ${c.titre_poste || 'N/A'} | ${c.annees_exp || 0}ans | ${c.localisation || ''} | Compétences: ${(c.competences || []).join(', ')} | Langues: ${(c.langues || []).join(', ')} | Exp: ${exps} | CV: ${cvSnippet}`
    })

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `Tu es un assistant RH. L'utilisateur cherche : "${query}"

Voici ${allCandidats.length} candidats (format: [index] ID | prénom nom | titre | expérience | localisation | compétences | langues | expériences pro | extrait CV) :

${summaries.join('\n')}

Retourne UNIQUEMENT un JSON (sans markdown) avec :
{
  "indices": [0, 2, 5, ...],  // indices des candidats correspondants, du plus pertinent au moins pertinent
  "query_interpreted": "Ce que j'ai compris de la recherche en 1 phrase"
}

Règles :
- Cherche dans TOUTES les infos (titre, compétences, expériences, extrait CV, langues, localisation)
- Fais une correspondance sémantique (ex: "dev web" → "Développeur Web", "JavaScript", "React"...)
- Retourne [] si aucun candidat ne correspond
- Sois inclusif plutôt qu'exclusif`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .map(b => b.type === 'text' ? b.text : '')
      .join('')
      .replace(/```json|```/g, '')
      .trim()

    let indices: number[] = []
    let query_interpreted = query

    try {
      const parsed = JSON.parse(text)
      indices = parsed.indices || []
      query_interpreted = parsed.query_interpreted || query
    } catch {
      // fallback : tous les candidats
      indices = allCandidats.map((_: any, i: number) => i)
    }

    const candidats = indices
      .filter((i: number) => i >= 0 && i < allCandidats.length)
      .map((i: number) => allCandidats[i])

    return NextResponse.json({ candidats, query_interpreted })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
