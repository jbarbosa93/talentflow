// scripts/batch/zefix-fix-nom-different.ts
// v1.9.117 — Correction post-audit : update nom_entreprise + ville pour NOM_DIFFERENT
//
// OPTION C choisie par João :
//  - Update nom_entreprise = zefix_name pour les 75 cas (raison sociale officielle)
//  - Update ville = ville_rc SEULEMENT si villes correspondaient déjà (same/contains)
//  - Pour les ~30 cas avec ville radicalement différente : ville DB conservée
//    (peut-être faux positif Zefix → João examine manuellement)
//
// USAGE :
//   npx tsx --env-file=.env.local scripts/batch/zefix-fix-nom-different.ts --dry-run
//   npx tsx --env-file=.env.local scripts/batch/zefix-fix-nom-different.ts --apply

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DRY_RUN = !APPLY

function parseCsv(s: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else {
      if (c === '"') q = true
      else if (c === ',') { row.push(cur); cur = '' }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
      else cur += c
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function villesMatch(a: string, b: string): boolean {
  const na = (a || '').toLowerCase().trim()
  const nb = (b || '').toLowerCase().trim()
  if (!na || !nb) return false
  if (na === nb) return true
  // Inclusion bidirectionnelle (Bramois ⊂ Sion, Le Mont ⊂ Le Mont-sur-Lausanne, "Villeneuve VD" ≈ "Villeneuve (VD)")
  if (na.includes(nb) || nb.includes(na)) return true
  // Strip parenthèses/cantons (Villeneuve VD ↔ Villeneuve (VD), Saint-Maurice ↔ St-Maurice)
  const norm = (s: string) => s
    .replace(/\(.*?\)/g, '')
    .replace(/\b(VD|VS|GE|FR|JU|NE|VS|TI|BE|ZH)\b/gi, '')
    .replace(/\bsaint\b/gi, 'st')
    .replace(/\s+/g, ' ').trim()
  if (norm(na) === norm(nb)) return true
  return false
}

async function main() {
  const csvPath = join(homedir(), 'Desktop', 'zefix-audit-clients.csv')
  const csv = readFileSync(csvPath, 'utf8')
  const rows = parseCsv(csv)
  const h = rows[0]
  const I = (k: string) => h.indexOf(k)

  const targets: Array<{
    id: string; old_nom: string; new_nom: string;
    old_ville: string; new_ville: string; updateVille: boolean
  }> = []

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][I('action')] !== 'NOM_DIFFERENT') continue
    const id = rows[i][I('id')]
    const old_nom = rows[i][I('nom_entreprise')]
    const new_nom = rows[i][I('zefix_name')]
    const old_ville = rows[i][I('ville_db')]
    const new_ville = rows[i][I('ville_rc')]
    if (!new_nom) continue
    targets.push({
      id, old_nom, new_nom, old_ville, new_ville,
      updateVille: villesMatch(old_ville, new_ville),
    })
  }

  console.log(`\n=== ZEFIX FIX NOM_DIFFERENT — ${DRY_RUN ? 'DRY-RUN' : 'APPLY'} ===\n`)
  console.log(`Total cibles: ${targets.length}`)
  console.log(`  Update nom seulement (ville suspecte) : ${targets.filter(t => !t.updateVille).length}`)
  console.log(`  Update nom + ville (ville matche)     : ${targets.filter(t => t.updateVille).length}\n`)

  let updated = 0, errors = 0
  for (const t of targets) {
    const patch: any = { nom_entreprise: t.new_nom }
    if (t.updateVille && t.new_ville) patch.ville = t.new_ville

    if (DRY_RUN) {
      console.log(`[DRY] ${t.old_nom} → ${t.new_nom}${t.updateVille ? `  | ville: ${t.old_ville} → ${t.new_ville}` : '  | (ville inchangée)'}`)
    } else {
      const { error } = await supabase.from('clients').update(patch).eq('id', t.id)
      if (error) { errors++; console.warn(`⚠️ ${t.old_nom}: ${error.message}`) }
      else updated++
    }
  }

  if (!DRY_RUN) {
    console.log(`\n${updated} clients mis à jour, ${errors} erreurs.`)
  } else {
    console.log(`\n[DRY-RUN] Re-lance avec --apply pour persister.`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
