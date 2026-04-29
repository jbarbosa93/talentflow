// scripts/batch/extract-secteurs-clients.ts
// v1.9.114 — Extraction batch secteurs_activite depuis clients.notes/secteur
//
// USAGE :
//   npx tsx --env-file=.env.local scripts/batch/extract-secteurs-clients.ts --dry-run --limit=50
//   npx tsx --env-file=.env.local scripts/batch/extract-secteurs-clients.ts --apply
//
// IDEMPOTENT : UPDATE seulement si le tableau actuel diffère du calculé.
// SOURCE : lib/secteurs-extractor.ts (taxonomie 25 valeurs fermées).

import { createClient } from '@supabase/supabase-js'
import { extractSecteursFromClient } from '../../lib/secteurs-extractor'

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

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

async function main() {
  console.log(`\n=== extract-secteurs-clients ${DRY_RUN ? '(DRY RUN)' : '(APPLY)'} ===\n`)

  let query = supabase
    .from('clients')
    .select('id, nom_entreprise, notes, secteur, secteurs_activite')
    .order('nom_entreprise', { ascending: true })
  if (LIMIT) query = query.limit(LIMIT)

  const { data, error } = await query
  if (error) {
    console.error('Erreur fetch clients:', error.message)
    process.exit(1)
  }

  const clients = (data || []) as Array<{
    id: string
    nom_entreprise: string
    notes: string | null
    secteur: string | null
    secteurs_activite: string[] | null
  }>

  console.log(`📊 ${clients.length} clients chargés\n`)

  const stats = {
    total: clients.length,
    fromNotes: 0,
    fromNoga: 0,
    none: 0,
    changed: 0,
    unchanged: 0,
    failed: 0,
  }
  const examples: Array<{ nom: string; notes: string | null; secteur: string | null; result: string[]; source: string }> = []
  const distribution = new Map<string, number>()

  for (const c of clients) {
    const result = extractSecteursFromClient(c.notes, c.secteur)
    if (result.source === 'notes') stats.fromNotes++
    else if (result.source === 'noga') stats.fromNoga++
    else stats.none++

    for (const s of result.secteurs) distribution.set(s, (distribution.get(s) || 0) + 1)

    const current = c.secteurs_activite || []
    const isUnchanged = arraysEqual(current, result.secteurs)

    if (DRY_RUN && examples.length < 30 && result.secteurs.length > 0) {
      examples.push({
        nom: c.nom_entreprise,
        notes: c.notes ? c.notes.slice(0, 80) : null,
        secteur: c.secteur,
        result: result.secteurs,
        source: result.source,
      })
    }

    if (isUnchanged) {
      stats.unchanged++
      continue
    }

    if (DRY_RUN) {
      stats.changed++
      continue
    }

    const { error: updateErr } = await (supabase as any)
      .from('clients')
      .update({ secteurs_activite: result.secteurs })
      .eq('id', c.id)
    if (updateErr) {
      console.error(`  ❌ ${c.nom_entreprise}: ${updateErr.message}`)
      stats.failed++
    } else {
      stats.changed++
    }
  }

  console.log('\n=== STATS ===')
  console.log(`  Total: ${stats.total}`)
  console.log(`  From notes: ${stats.fromNotes}`)
  console.log(`  From NOGA Zefix: ${stats.fromNoga}`)
  console.log(`  None: ${stats.none}`)
  console.log(`  Changed: ${stats.changed}`)
  console.log(`  Unchanged: ${stats.unchanged}`)
  console.log(`  Failed: ${stats.failed}`)

  console.log('\n=== DISTRIBUTION ===')
  const sorted = Array.from(distribution.entries()).sort((a, b) => b[1] - a[1])
  for (const [s, n] of sorted) console.log(`  ${s.padEnd(20)} ${n}`)

  if (DRY_RUN && examples.length > 0) {
    console.log('\n=== EXEMPLES (30 premiers avec match) ===')
    for (const ex of examples) {
      console.log(`\n  📍 ${ex.nom}`)
      console.log(`     notes: ${ex.notes || '(vides)'}`)
      console.log(`     secteur NOGA: ${ex.secteur || '(vide)'}`)
      console.log(`     → [${ex.result.join(', ')}] (source: ${ex.source})`)
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
