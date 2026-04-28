#!/usr/bin/env node
// scripts/tests/enrich-new-clients.mjs
// Enrichissement IA des 11 nouveaux clients créés en v1.9.112
// LECTURE SEULE — produit un rapport JSON, n'écrit JAMAIS en DB.
//
// Modèle : claude-sonnet-4-6 avec web_search_20250305 (cohérent avec /api/clients/search-ia).
// Coût estimé : ~$0.05/client × 11 = ~$0.55 total.

import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY manquant')
  process.exit(1)
}

const anthropic = new Anthropic()

// 11 nouveaux clients (id + nom + email tels que créés en DB le 2026-04-28)
const CLIENTS = [
  { id: '12529ba1-9776-468e-8c38-200ec461444f', nom: 'AP sàrl', email: 'info@adonispeinture.ch' },
  { id: '43c95f9b-6213-470b-964c-4cb010573b56', nom: 'Bossert Joseph', email: 'jbossert@bluewin.ch' },
  { id: 'e9ea147d-b058-4bdf-89cf-d1e8924f58bd', nom: 'Carletti Sanitaire', email: 'info@carletti-sanitaire.ch' },
  { id: 'ebccc31d-c309-45b8-963c-3c9217f8ef7e', nom: 'Carlos da Silva Constructions SA', email: 'info@cdasilvasa.ch' },
  { id: '1a2be1d6-8d93-476b-b459-6e8c970a3495', nom: 'CheckElec Sàrl', email: 'info@checkelec.ch' },
  { id: '4cc32b06-61d5-4b20-ae86-d9ccde77c8e9', nom: 'DD Swiss distribution Sàrl', email: 'didier.k@dd-swissdistribution.ch' },
  { id: '632ff3d7-a27e-4d92-9c98-e0e5876d38c2', nom: 'Hydrotec Cyril Marclay', email: 'info@hydrotec-cvs.ch' },
  { id: '474ff6af-1ee4-41f8-9625-0c367b5fd413', nom: 'Jerjen Metal Sàrl', email: 'info@jerjen-metal.ch' },
  { id: '4cf9ea46-b3d7-4540-9e50-30d07bd04761', nom: 'M2 Habitat SA', email: 'info@m2habitat.ch' },
  { id: '3cdecec0-06dc-4fe3-9a8e-fc6fd2b6d6b0', nom: 'Mottet Toitures Sàrl', email: 'mottettoitures@bluewin.ch' },
  { id: 'af02006e-b311-4641-a94d-c02b067c38ef', nom: 'Namaste-Alps SNC', email: 'admin@namaste-alps.ch' },
]

const SWISS_CANTONS = ['VS','VD','GE','FR','BE','NE','JU','TI','ZH','AG','LU','SG','BS','BL','SO','TG','GR','SZ','ZG','OW','NW','UR','GL','SH','AR','AI']

function buildPrompt(client) {
  const domain = (client.email || '').split('@')[1] || ''
  const isPersonalDomain = ['bluewin.ch', 'gmail.com', 'hotmail.com', 'outlook.com', 'gmx.ch', 'yahoo.com'].includes(domain)
  return `Tu effectues une recherche web stricte pour enrichir une fiche entreprise suisse.

ENTREPRISE : "${client.nom}"
EMAIL CONNU : ${client.email}
DOMAINE EMAIL : ${domain}${isPersonalDomain ? ' (email personnel/générique — site web officiel à chercher SÉPARÉMENT)' : ''}

OBJECTIF : retrouver UNIQUEMENT des informations confirmées par sources web.

RÈGLES STRICTES ANTI-HALLUCINATION :
- Utilise web_search (max 3-4 requêtes par entreprise)
- Si une info n'est pas clairement visible dans les résultats → retourne null
- Ne JAMAIS inventer un NPA, une rue, un téléphone
- Cohérence site web : ${isPersonalDomain
  ? `le domaine email est personnel (${domain}), donc le site web officiel doit être trouvé via la recherche (peut être différent ou inexistant)`
  : `le site web officiel doit correspondre au domaine email (${domain}). Si trouvé sur un autre domaine sans cohérence → null.`}
- Canton : UNIQUEMENT parmi : ${SWISS_CANTONS.join(', ')}
- NPA : 4 chiffres suisses uniquement (1000-9999)
- Adresse : rue + numéro complet (ex: "Rue du Léman 12"), pas juste le quartier
- Si l'entreprise existe sous plusieurs raisons sociales similaires → null partout (ambigu)

POUR CHAQUE CHAMP, retourne :
- value : la valeur trouvée OU null
- confidence : "certain" (mention explicite dans une source officielle/zefix/site officiel) | "probable" (déduit mais cohérent) | null
- source : URL de la source (string) OU null

Format de réponse STRICT (rien d'autre, pas de markdown) :
{
  "nom_entreprise": "${client.nom}",
  "site_web":  { "value": null, "confidence": null, "source": null },
  "secteur":   { "value": null, "confidence": null, "source": null },
  "adresse":   { "value": null, "confidence": null, "source": null },
  "npa":       { "value": null, "confidence": null, "source": null },
  "ville":     { "value": null, "confidence": null, "source": null },
  "canton":    { "value": null, "confidence": null, "source": null },
  "telephone": { "value": null, "confidence": null, "source": null },
  "notes_recherche": "Résumé en 1-2 phrases de ce qui a été trouvé/non trouvé"
}`
}

function extractJson(text) {
  let cleaned = text.replace(/```json|```JSON|```/g, '').trim()
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last > first) cleaned = cleaned.substring(first, last + 1)
  return JSON.parse(cleaned)
}

async function enrichOne(client) {
  const t0 = Date.now()
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 4,
      user_location: {
        type: 'approximate',
        country: 'CH',
        region: 'Valais',
        city: 'Monthey',
        timezone: 'Europe/Zurich',
      },
    }],
    messages: [{ role: 'user', content: buildPrompt(client) }],
  })

  const ms = Date.now() - t0
  // Concat tous les blocs texte (web_search renvoie plusieurs blocks)
  const fullText = response.content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text)
    .join('\n')

  let parsed
  try {
    parsed = extractJson(fullText)
  } catch (e) {
    parsed = { error: 'JSON invalide', raw: fullText.slice(0, 500) }
  }

  return {
    client_id: client.id,
    client_nom: client.nom,
    client_email: client.email,
    ms,
    usage: response.usage,
    result: parsed,
  }
}

async function main() {
  const results = []
  console.log(`Enrichissement de ${CLIENTS.length} clients via web_search...\n`)

  let totalCost = 0
  for (let i = 0; i < CLIENTS.length; i++) {
    const c = CLIENTS[i]
    process.stdout.write(`[${i + 1}/${CLIENTS.length}] ${c.nom}...`)
    try {
      const r = await enrichOne(c)
      results.push(r)
      // Sonnet 4.6 : input ~$3/M, output ~$15/M (web_search ajoute ~$10/1000 searches)
      const cost = (r.usage.input_tokens * 3 + r.usage.output_tokens * 15) / 1_000_000
      totalCost += cost
      console.log(` ✓ ${r.ms}ms (~$${cost.toFixed(4)})`)
    } catch (err) {
      console.log(` ✗ ${err.message}`)
      results.push({ client_id: c.id, client_nom: c.nom, error: err.message })
    }
    // Petit délai entre clients
    if (i < CLIENTS.length - 1) await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\nTotal coût : ~$${totalCost.toFixed(2)}`)

  const reportPath = '/tmp/enrich-clients-report.json'
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2))
  console.log(`Rapport JSON détaillé : ${reportPath}\n`)

  // Affichage formaté lisible
  console.log('═'.repeat(72))
  console.log('  RAPPORT ENRICHISSEMENT')
  console.log('═'.repeat(72))
  for (const r of results) {
    console.log()
    console.log(`▸ ${r.client_nom}`)
    console.log(`  Email : ${r.client_email}`)
    if (r.error) {
      console.log(`  ❌ ERREUR : ${r.error}`)
      continue
    }
    if (r.result?.error) {
      console.log(`  ❌ JSON invalide : ${r.result.error}`)
      console.log(`  Raw: ${r.result.raw?.slice(0, 200)}`)
      continue
    }
    const fields = ['site_web', 'secteur', 'adresse', 'npa', 'ville', 'canton', 'telephone']
    for (const f of fields) {
      const v = r.result[f]
      if (!v || v.value === null) {
        console.log(`  ❌ ${f.padEnd(10)}: introuvable`)
      } else {
        const icon = v.confidence === 'certain' ? '✅' : v.confidence === 'probable' ? '⚠️ ' : '·'
        console.log(`  ${icon} ${f.padEnd(10)}: ${v.value}${v.confidence === 'probable' ? '  (probable)' : ''}`)
      }
    }
    if (r.result.notes_recherche) {
      console.log(`  📝 ${r.result.notes_recherche}`)
    }
  }
  console.log()
  console.log('═'.repeat(72))
}

main().catch(e => { console.error(e); process.exit(1) })
