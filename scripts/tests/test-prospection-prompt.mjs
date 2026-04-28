#!/usr/bin/env node
// scripts/tests/test-prospection-prompt.mjs
// Test prompt prospection v1.9.112 sur 3 clients réels (validation qualité avant déploiement)
//
// Mirroir EXACT du prompt utilisé dans app/(dashboard)/api/clients/prospection/generate/route.ts

import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local')
  process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY manquant')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const anthropic = new Anthropic()

const CLIENT_IDS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [
  'dda12e6f-e715-41ec-b067-440082c5d8fd', // Lietta SA — Leysin VD — Sébastien Lietta — Maçonnerie
  '3eaeb68a-4823-4373-83ac-0b67a080d133', // Renovatech — Collombey VS — Nelson Gaspar — peintre/plâtrier
  'a3d3bcc4-58f9-416e-a3ad-9c1b99bc1842', // C. Pousaz SA — Vevey VD — 2 contacts — maçonnerie
]
const CONTEXTE = 'On a actuellement plusieurs maçons et peintres disponibles immédiatement en Suisse romande.'

const SYSTEM_PROMPT = `Tu es un expert en recrutement spécialisé dans les métiers du bâtiment et second œuvre en Suisse romande. Tu travailles pour L-AGENCE SA, agence de placement à Monthey (Valais). Tu génères des emails de prospection courts, professionnels et humains — jamais commerciaux.`

function buildUserPrompt(c, contexte) {
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

function parseResponse(text) {
  const cleaned = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
  const objetMatch = cleaned.match(/^\s*OBJET\s*:\s*(.+?)\s*$/im)
  if (!objetMatch) return null
  const objet = objetMatch[1].trim()
  const sepIdx = cleaned.indexOf('---')
  if (sepIdx === -1) return null
  const corps = cleaned.substring(sepIdx + 3).trim()
  if (!objet || !corps) return null
  return { objet, corps }
}

async function generateOne(c, contexte) {
  const t0 = Date.now()
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    temperature: 0.7,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(c, contexte) }],
  })
  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const parsed = parseResponse(text)
  const ms = Date.now() - t0
  return { parsed, raw: text, ms, usage: response.usage }
}

async function main() {
  console.log('═'.repeat(72))
  console.log('  TEST PROMPT PROSPECTION v1.9.112 — 3 clients réels')
  console.log('═'.repeat(72))
  console.log(`Modèle : claude-haiku-4-5-20251001`)
  console.log(`Contexte additionnel : « ${CONTEXTE} »`)
  console.log()

  let totalCost = 0
  let totalMs = 0
  let i = 0
  for (const id of CLIENT_IDS) {
    i++
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, nom_entreprise, email, secteur, ville, canton, notes, contacts')
      .eq('id', id)
      .single()

    if (error || !client) {
      console.log(`❌ Client ${id} introuvable : ${error?.message}`)
      continue
    }

    const fc = (client.contacts || []).find(ct => (ct.prenom || '').trim().length > 0)
    console.log('─'.repeat(72))
    console.log(`CLIENT ${i}/3 — ${client.nom_entreprise}`)
    console.log(`  Email     : ${client.email}`)
    console.log(`  Secteur   : ${client.secteur || '(vide)'}`)
    console.log(`  Lieu      : ${client.ville || '?'}, ${client.canton || '?'}`)
    console.log(`  Contact   : ${fc ? `${fc.prenom} ${fc.nom || ''}`.trim() : '(aucun prénom → "Madame, Monsieur,")'}`)
    console.log(`  Notes     : ${(client.notes || '').replace(/\n/g, ' ⏎ ').slice(0, 80) || '(aucune)'}`)
    console.log()

    try {
      const { parsed, raw, ms, usage } = await generateOne(client, CONTEXTE)
      totalMs += ms

      // Coût Haiku 4.5 : ~$1/M input, ~$5/M output
      const cost = (usage.input_tokens * 1 + usage.output_tokens * 5) / 1_000_000
      totalCost += cost

      console.log(`  ⏱️  ${ms}ms  ·  ${usage.input_tokens} in + ${usage.output_tokens} out  ·  ~$${cost.toFixed(4)}`)
      console.log()

      if (!parsed) {
        console.log('  ❌ FORMAT INVALIDE')
        console.log('  Réponse brute :')
        console.log('  ' + raw.split('\n').join('\n  '))
      } else {
        console.log(`  📧 OBJET : ${parsed.objet}`)
        console.log()
        console.log('  ┌─ CORPS ─────────────────────────────────────────────────────┐')
        const corpsLines = parsed.corps.split('\n')
        for (const line of corpsLines) {
          console.log('  │ ' + line)
        }
        console.log('  └─────────────────────────────────────────────────────────────┘')
        console.log()
        console.log(`  → ${corpsLines.filter(l => l.trim()).length} lignes non vides`)
      }
    } catch (err) {
      console.log(`  ❌ ERREUR : ${err.message}`)
    }
    console.log()
  }

  console.log('═'.repeat(72))
  console.log(`TOTAL : ${totalMs}ms (~${(totalMs / CLIENT_IDS.length).toFixed(0)}ms/email)  ·  $${totalCost.toFixed(4)} (~$${(totalCost / CLIENT_IDS.length * 100).toFixed(3)}/100 emails)`)
  console.log('═'.repeat(72))
}

main().catch(e => { console.error(e); process.exit(1) })
