// scripts/batch/clean-notes-metiers-only.ts
// v1.9.114 — DRY RUN / APPLY pour vider les notes clients qui contiennent
// SEULEMENT des mots-clés métier (pas d'info utile).
//
// USAGE :
//   npx tsx --env-file=.env.local scripts/batch/clean-notes-metiers-only.ts --dry-run --limit=20
//   npx tsx --env-file=.env.local scripts/batch/clean-notes-metiers-only.ts --dry-run
//   npx tsx --env-file=.env.local scripts/batch/clean-notes-metiers-only.ts --apply
//
// LOGIQUE :
//   1. Tokenize les notes (split sur séparateurs, retire ponctuation)
//   2. Marque chaque token comme "métier", "stopword neutre" ou "AUTRE"
//   3. Si AUCUN token "AUTRE" → notes ne contient que des métiers → VIDER
//   4. Si ≥1 token "AUTRE" → garder intact (info utile)
//
// Stopwords neutres = mots qui ne sont pas des métiers mais ne sont pas non
// plus de l'info utile (ex: "ouvrier", "administratif", "personnel").

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DRY_RUN = !APPLY
const limitArg = args.find(a => a.startsWith('--limit='))
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null

// Mots-clés "métier" (couvre toutes les variantes que l'extractor reconnaît)
const METIER_KEYWORDS = new Set([
  'plaquiste',
  'platrier', 'platrerie', 'gypserie', 'gypsier', 'gypseur',
  'peintre', 'peinture', 'peintres',
  'electricien', 'electricite', 'electriciens',
  'carreleur', 'carrelage', 'carreleurs',
  'menuisier', 'menuiserie', 'menuisiers', 'ebeniste', 'ebenisterie',
  'charpentier', 'charpente', 'charpentiers',
  'ferblantier', 'ferblanterie', 'ferblantiers',
  'couvreur', 'couverture', 'couvreurs', 'toiture',
  'etancheur', 'etancheite', 'etancheurs',
  'macon', 'maconnerie', 'macons',
  'grutier', 'grutiers', 'grue',
  'ferrailleur', 'ferrailleurs',
  'manouvre', 'manoeuvre', 'manoeuvres',
  'machiniste', 'machinistes',
  'serrurier', 'serrurerie', 'serruriers',
  'soudeur', 'soudure', 'soudeurs', 'chaudronnier',
  'tuyauteur', 'tuyauterie', 'tuyauteurs',
  'sprinkler',
  'sanitaire', 'sanitaires', 'plombier', 'plomberie', 'plombiers',
  'ventilation', 'cvc', 'cvs', 'climatisation',
  'chauffage', 'chauffagiste', 'chauffagistes',
  'paysagiste', 'paysagisme', 'jardinier', 'jardiniers',
  'architecte', 'architecture', 'architectes',
  'ingenieur', 'ingenierie', 'ingenieurs',
  'automaticien', 'automation', 'automaticiens',
  'chauffeur', 'livreur', 'logistique', 'logisticien', 'magasinier',
  'manutentionnaire', 'manutentionnaires',
  'operateur', 'industrie', 'industriel', 'operateurs',
  'cuisinier', 'cuisine', 'restauration', 'cuisiniers',
  'nettoyage', 'menage', 'nettoyeur',
])

// Stopwords "neutres" — pas un métier mais pas d'info utile
const STOPWORDS = new Set([
  'ouvrier', 'ouvriers', 'ouvriere', 'ouvrieres',
  'administratif', 'administrative', 'admin',
  'personnel', 'employe', 'employes', 'employee', 'employees',
  'staff', 'equipe', 'team',
  'tempo', 'tempos', 'temporaire', 'temporaires', 'temp',
  'placement', 'placements', 'mission', 'missions',
  'et', 'ou', 'ainsi', 'aussi', 'avec', 'pour',
  'ne', 'pas', 'plus', 'que', 'qui', 'tous', 'tout', 'toutes',
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux',
  'sa', 'sarl', 'sàrl', 'ag', 'gmbh', 'srl', 'spa', // formes juridiques
  'oui', 'non', 'ok',
])

function normalize(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

interface TokenAnalysis {
  isEmpty: boolean
  metierTokens: string[]
  stopwordTokens: string[]
  unknownTokens: string[]
}

function analyzeNotes(notes: string): TokenAnalysis {
  if (!notes || !notes.trim()) {
    return { isEmpty: true, metierTokens: [], stopwordTokens: [], unknownTokens: [] }
  }
  // Split sur tout ce qui n'est pas une lettre (incluant accents). Cela retire
  // les chiffres, ponctuation, sauts de ligne. Donc un téléphone "079 123 45 67"
  // génère AUCUN token et est invisible — mauvais. On veut détecter les chiffres.
  // Approche : si présence de chiffres → c'est de l'info utile (numéro, date, etc.).
  const hasDigits = /\d/.test(notes)
  if (hasDigits) {
    return { isEmpty: false, metierTokens: [], stopwordTokens: [], unknownTokens: ['__DIGITS__'] }
  }

  // Aussi : @ = email, $ = URL... → info utile
  if (/[@$%&]/.test(notes)) {
    return { isEmpty: false, metierTokens: [], stopwordTokens: [], unknownTokens: ['__SPECIAL_CHAR__'] }
  }

  const norm = normalize(notes)
  const tokens = norm.split(/[^a-zàâäéèêëïîôöùûüÿñç]+/).filter(t => t.length > 0)

  const metierTokens: string[] = []
  const stopwordTokens: string[] = []
  const unknownTokens: string[] = []

  for (const t of tokens) {
    if (t.length <= 1) continue // single char = noise
    if (METIER_KEYWORDS.has(t)) metierTokens.push(t)
    else if (STOPWORDS.has(t)) stopwordTokens.push(t)
    else unknownTokens.push(t)
  }

  return { isEmpty: tokens.length === 0, metierTokens, stopwordTokens, unknownTokens }
}

async function main() {
  console.log(`\n=== clean-notes-metiers-only ${DRY_RUN ? '(DRY RUN)' : '(APPLY)'} ===\n`)

  let query = supabase
    .from('clients')
    .select('id, nom_entreprise, notes')
    .not('notes', 'is', null)
    .neq('notes', '')
    .order('nom_entreprise', { ascending: true })
  if (LIMIT) query = query.limit(LIMIT)

  const { data, error } = await query
  if (error) {
    console.error('Erreur fetch:', error.message)
    process.exit(1)
  }

  const clients = (data || []) as Array<{ id: string; nom_entreprise: string; notes: string }>
  console.log(`📊 ${clients.length} clients avec notes non vides\n`)

  const stats = {
    total: clients.length,
    toClear: 0,
    keepInfoUtile: 0,
    keepDigits: 0,
    keepSpecial: 0,
    failed: 0,
  }

  const examplesToClear: typeof clients = []
  const examplesKeep: Array<{ client: typeof clients[number]; reason: string }> = []

  for (const c of clients) {
    const analysis = analyzeNotes(c.notes)

    if (analysis.unknownTokens.length === 0 && analysis.metierTokens.length > 0) {
      // Que des métiers (+/- stopwords neutres) → vider
      stats.toClear++
      if (examplesToClear.length < 30) examplesToClear.push(c)

      if (APPLY) {
        const { error: updateErr } = await (supabase as any)
          .from('clients')
          .update({ notes: '' })
          .eq('id', c.id)
        if (updateErr) {
          console.error(`  ❌ ${c.nom_entreprise}: ${updateErr.message}`)
          stats.failed++
        }
      }
    } else if (analysis.unknownTokens.includes('__DIGITS__')) {
      stats.keepDigits++
      if (examplesKeep.length < 15) examplesKeep.push({ client: c, reason: 'contient des chiffres (tel/date/etc.)' })
    } else if (analysis.unknownTokens.includes('__SPECIAL_CHAR__')) {
      stats.keepSpecial++
      if (examplesKeep.length < 15) examplesKeep.push({ client: c, reason: 'contient @ ou $ (email/URL)' })
    } else if (analysis.unknownTokens.length > 0) {
      stats.keepInfoUtile++
      if (examplesKeep.length < 15) {
        examplesKeep.push({
          client: c,
          reason: `mots inconnus: ${analysis.unknownTokens.slice(0, 5).join(', ')}`,
        })
      }
    } else {
      stats.keepInfoUtile++
    }
  }

  console.log('=== STATS ===')
  console.log(`  Total notes non vides: ${stats.total}`)
  console.log(`  → À VIDER (que métiers): ${stats.toClear}`)
  console.log(`  → GARDER (chiffres tel/date): ${stats.keepDigits}`)
  console.log(`  → GARDER (email/URL): ${stats.keepSpecial}`)
  console.log(`  → GARDER (info utile): ${stats.keepInfoUtile}`)
  console.log(`  Failed: ${stats.failed}`)

  if (examplesToClear.length > 0) {
    console.log(`\n=== EXEMPLES À VIDER (${Math.min(20, examplesToClear.length)} premiers) ===`)
    for (const c of examplesToClear.slice(0, 20)) {
      const notesPreview = c.notes.replace(/\n/g, ' / ').slice(0, 80)
      console.log(`  📍 ${c.nom_entreprise}`)
      console.log(`     notes: "${notesPreview}"`)
      console.log(`     → VIDER (que métiers)`)
    }
  }

  if (DRY_RUN && examplesKeep.length > 0) {
    console.log(`\n=== EXEMPLES À GARDER (${Math.min(15, examplesKeep.length)} premiers) ===`)
    for (const { client, reason } of examplesKeep.slice(0, 15)) {
      const notesPreview = client.notes.replace(/\n/g, ' / ').slice(0, 80)
      console.log(`  📍 ${client.nom_entreprise}`)
      console.log(`     notes: "${notesPreview}"`)
      console.log(`     → GARDER (${reason})`)
    }
  }

  if (DRY_RUN) {
    console.log('\n💡 DRY RUN — re-run avec --apply pour persister.\n')
  } else {
    console.log('\n✅ APPLY terminé.\n')
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
