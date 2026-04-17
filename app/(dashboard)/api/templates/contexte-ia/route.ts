// app/(dashboard)/api/templates/contexte-ia/route.ts
// Génère un paragraphe de présentation candidat (2-3 phrases) via Claude Haiku.
// Utilise EN PRIORITÉ la customization CV du consultant connecté (si présente),
// sinon les champs bruts de la fiche candidat.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const { candidat_id } = await request.json()
    if (!candidat_id) return NextResponse.json({ error: 'candidat_id requis' }, { status: 400 })

    // Identifier le consultant connecté
    const userSupa = await createClient()
    const { data: { user } } = await userSupa.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: c, error } = await supabase
      .from('candidats')
      .select('prenom, nom, titre_poste, resume_ia, experiences, annees_exp, competences, genre')
      .eq('id', candidat_id)
      .single()

    if (error || !c) return NextResponse.json({ error: 'Candidat introuvable' }, { status: 404 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 500 })
    }

    // Récupérer la customization CV propre à ce consultant (si elle existe)
    const { data: custom } = await (supabase as any)
      .from('cv_customizations')
      .select('data')
      .eq('candidat_id', candidat_id)
      .eq('consultant_id', user.id)
      .maybeSingle()

    const customData = custom?.data || {}
    const customContent = customData.customContent || {}
    const customExperiences: any[] | undefined = Array.isArray(customData.experiences) ? customData.experiences : undefined

    // Résolution prioritaire : customization → fiche candidat
    const titrePoste = customContent.titre_poste || (c as any).titre_poste || ''
    const resumeIA = customContent.resume_ia || (c as any).resume_ia || ''
    const competencesSrc = typeof customContent.competences === 'string' && customContent.competences.trim()
      ? customContent.competences.split(',').map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray((c as any).competences) ? (c as any).competences : []

    const experiencesSrc = customExperiences && customExperiences.length > 0
      ? customExperiences
      : (Array.isArray((c as any).experiences) ? (c as any).experiences : [])

    const payload = {
      prenom: (c as any).prenom || '',
      nom: (c as any).nom || '',
      titre_poste: titrePoste,
      annees_exp: (c as any).annees_exp ?? null,
      resume_ia: resumeIA,
      experiences: experiencesSrc.slice(0, 2).map((e: any) => ({
        poste: e?.poste || '',
        entreprise: e?.entreprise || '',
        periode: e?.periode || [e?.date_debut, e?.current ? 'actuellement' : e?.date_fin].filter(Boolean).join(' - '),
        description: (e?.description || '').slice(0, 300),
      })),
      competences: competencesSrc.slice(0, 10),
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      temperature: 0.4,
      system: "Tu rédiges des présentations candidats pour des consultants en recrutement. Style professionnel, direct, factuel, en français. Pas de formule de politesse, pas d'introduction, pas de conclusion.",
      messages: [{
        role: 'user',
        content: `En 2-3 phrases professionnelles en français, présente ce candidat pour une proposition à un client employeur. Pas de formule de politesse. Direct et factuel. Ne mentionne pas le nom complet (juste "ce candidat" ou le titre du poste). Respecte strictement le titre de poste et les compétences fournis — ce sont les choix du consultant pour cette proposition.\n\nDonnées candidat :\n${JSON.stringify(payload, null, 2)}`,
      }],
    })

    const text = resp.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim()

    if (!text) return NextResponse.json({ error: 'Réponse IA vide' }, { status: 500 })
    return NextResponse.json({ text })
  } catch (e: any) {
    console.error('[contexte-ia] Error:', e)
    return NextResponse.json({ error: e?.message || 'Erreur génération contexte' }, { status: 500 })
  }
}
