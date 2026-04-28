// app/(dashboard)/api/clients/prospection/generate/route.ts
// v1.9.112 — POST /api/clients/prospection/generate
// Génère un email de prospection personnalisé pour UN client via Claude Haiku 4.5.
// Appelé en boucle côté client (1 appel par client) pour pouvoir afficher la progression
// + annuler proprement via AbortController + délai 300ms entre appels.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

interface ClientRow {
  id: string
  nom_entreprise: string | null
  email: string | null
  secteur: string | null
  ville: string | null
  canton: string | null
  notes: string | null
  contacts: Array<{ prenom?: string; nom?: string; email?: string; role?: string }> | null
}

const SYSTEM_PROMPT = `Tu es un expert en recrutement spécialisé dans les métiers du bâtiment et second œuvre en Suisse romande. Tu travailles pour L-AGENCE SA, agence de placement à Monthey (Valais). Tu génères des emails de prospection courts, professionnels et humains — jamais commerciaux.`

function buildUserPrompt(c: ClientRow, contexte: string): string {
  // Premier contact avec prénom non vide → personnalisation nominative
  const firstContact = (c.contacts || []).find(ct => (ct.prenom || '').trim().length > 0)
  const contactLine = firstContact
    ? `Contact : ${firstContact.prenom}${firstContact.nom ? ' ' + firstContact.nom : ''}${firstContact.role ? ' (' + firstContact.role + ')' : ''}`
    : `Contact : aucun nom connu — utiliser "Madame, Monsieur,"`

  const lieu = [c.ville, c.canton].filter(Boolean).join(', ')

  return `Génère un email de prospection pour cette entreprise.

Entreprise : ${c.nom_entreprise || 'Non renseigné'}
Secteur : ${c.secteur || 'Bâtiment / second œuvre'}
Localisation : ${lieu || 'Suisse'}, Suisse
${contactLine}
Notes : ${(c.notes || '').trim() || 'Aucune note'}
Contexte additionnel : ${(contexte || '').trim() || 'Aucun'}

Règles STRICTES :
- Maximum 8 lignes dans le corps
- Professionnel mais humain, pas commercial
- Montrer qu'on connaît leur secteur spécifique
- Ne proposer QUE les métiers mentionnés dans les notes ou cohérents avec le secteur de l'entreprise
- Ne jamais proposer des métiers non demandés (ex: ne pas mentionner peintre si notes = maçonnerie)
- Si un prénom de contact est connu → s'adresser à lui par prénom ("Bonjour {prénom},")
- Sinon → "Madame, Monsieur,"
- Terminer par UNE seule question ouverte simple
- En français, vouvoiement
- Jamais de formules génériques type "Dans le cadre de notre développement..."
- Pas de signature à la fin (elle est ajoutée automatiquement à l'envoi)

Format de réponse STRICT (rien d'autre, pas de markdown, pas de backticks) :
OBJET: [objet ici]
---
[corps du mail ici]`
}

function parseResponse(text: string): { objet: string; corps: string } | null {
  // Nettoyage backticks éventuels
  const cleaned = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
  // Chercher la ligne OBJET:
  const objetMatch = cleaned.match(/^\s*OBJET\s*:\s*(.+?)\s*$/im)
  if (!objetMatch) return null
  const objet = objetMatch[1].trim()
  // Le corps est tout ce qui suit le séparateur ---
  const sepIdx = cleaned.indexOf('---')
  if (sepIdx === -1) return null
  const corps = cleaned.substring(sepIdx + 3).trim()
  if (!objet || !corps) return null
  return { objet, corps }
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body = await request.json()
    const clientId = (body.clientId || '').toString().trim()
    const contexte = (body.contexte || '').toString().trim()

    if (!clientId) {
      return NextResponse.json({ error: 'clientId requis' }, { status: 400 })
    }

    // Charger le client (admin client : RLS bypass car auth déjà vérifié).
    // Cast `as any` car la table `clients` n'est pas dans types/database.ts auto-généré (cf CLAUDE.md).
    const supabase = createAdminClient()
    const { data: client, error: clientErr } = await (supabase as any)
      .from('clients')
      .select('id, nom_entreprise, email, secteur, ville, canton, notes, contacts')
      .eq('id', clientId)
      .single()

    if (clientErr || !client) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    const c = client as unknown as ClientRow
    if (!c.email) {
      return NextResponse.json({ error: "Ce client n'a pas d'email" }, { status: 400 })
    }

    // Appel Claude Haiku 4.5 (rapide + économique pour batch 100 emails)
    const anthropic = new Anthropic()
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(c, contexte) }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const parsed = parseResponse(text)

    if (!parsed) {
      console.warn('[prospection/generate] Format inattendu :', text.slice(0, 200))
      return NextResponse.json(
        { error: 'Format de réponse IA inattendu', raw: text.slice(0, 200) },
        { status: 502 }
      )
    }

    return NextResponse.json({
      clientId: c.id,
      destinataire: c.email,
      nom_entreprise: c.nom_entreprise,
      objet: parsed.objet,
      corps: parsed.corps,
    })
  } catch (err: any) {
    console.error('[prospection/generate] Erreur :', err)
    const status = err?.status || err?.statusCode || 500
    return NextResponse.json(
      { error: err?.message || 'Erreur génération' },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
