// scripts/batch/zefix-audit-clients.ts
// v1.9.117 — Audit batch des 1221+ clients sur Zefix REST
//
// USAGE :
//   npx tsx --env-file=.env.local scripts/batch/zefix-audit-clients.ts --dry-run --limit=50
//   npx tsx --env-file=.env.local scripts/batch/zefix-audit-clients.ts --apply
//
// PROCÉDURE :
// 1. Pour chaque client actif → POST ZefixREST search par nom_entreprise
// 2. Best fuzzy match (similarity ≥ 75 + bonus ville) → tag action
// 3. UPDATE DB : zefix_uid + zefix_status + zefix_name + zefix_verified_at
//    UNIQUEMENT (jamais de modification du statut client — João décide)
// 4. Rapport CSV ~/Desktop/zefix-audit-clients.csv
//
// RATE LIMITING : 300ms entre requêtes (respectueux API publique)

import { createClient } from '@supabase/supabase-js'
import { searchZefix, nameSimilarity, interpretStatus } from '../../lib/zefix'
import { writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

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
const LIMIT_ARG = args.find(a => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : (DRY_RUN ? 50 : 100000)
const RATE_MS = 300

type Action =
  | 'OK_ACTIF'              // ✅ trouvé, actif, nom concorde
  | 'EN_LIQUIDATION'        // ⚠️ AUFGELOEST
  | 'RADIE'                 // ❌ GELOESCHT → désactiver ?
  | 'NOM_DIFFERENT'         // 🔄 trouvé mais nom RC ≠ nom DB (renommage ?)
  | 'NOT_FOUND'             // ❓ aucun match Zefix
  | 'ALREADY_VERIFIED'      // 🟦 déjà vérifié récemment, skip

interface ClientRow {
  id: string
  nom_entreprise: string
  ville: string | null
  canton: string | null
  zefix_uid: string | null
  zefix_status: string | null
  zefix_verified_at: string | null
}

interface AuditRow {
  id: string
  nom_entreprise: string
  zefix_name: string
  zefix_uid: string
  zefix_status: string
  ville_db: string
  ville_rc: string
  similarity: number
  action: Action
  cantonal_url: string
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function csvEscape(v: any): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

async function main() {
  console.log(`\n=== ZEFIX AUDIT CLIENTS — ${DRY_RUN ? 'DRY-RUN' : 'APPLY'} (limit=${LIMIT}) ===\n`)

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, ville, canton, zefix_uid, zefix_status, zefix_verified_at')
    .eq('statut', 'actif')
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  if (error) {
    console.error('DB fetch error:', error.message)
    process.exit(1)
  }

  if (!clients || clients.length === 0) {
    console.log('Aucun client actif trouvé.')
    return
  }

  console.log(`${clients.length} clients à auditer\n`)

  const audit: AuditRow[] = []
  const counts: Record<Action, number> = {
    OK_ACTIF: 0, EN_LIQUIDATION: 0, RADIE: 0, NOM_DIFFERENT: 0, NOT_FOUND: 0, ALREADY_VERIFIED: 0,
  }
  let dbUpdates = 0
  let dbErrors = 0

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i] as ClientRow
    const progress = `[${i + 1}/${clients.length}]`

    // Skip si déjà vérifié dans les 30 derniers jours
    if (c.zefix_verified_at) {
      const days = (Date.now() - new Date(c.zefix_verified_at).getTime()) / (1000 * 60 * 60 * 24)
      if (days < 30) {
        counts.ALREADY_VERIFIED++
        if (i < 10 || i % 50 === 0) console.log(`${progress} ⏭ ${c.nom_entreprise} — vérifié il y a ${Math.floor(days)}j`)
        audit.push({
          id: c.id, nom_entreprise: c.nom_entreprise,
          zefix_name: '', zefix_uid: c.zefix_uid || '', zefix_status: c.zefix_status || '',
          ville_db: c.ville || '', ville_rc: '', similarity: 0,
          action: 'ALREADY_VERIFIED', cantonal_url: '',
        })
        continue
      }
    }

    try {
      const hits = await searchZefix(c.nom_entreprise, { activeOnly: false, maxEntries: 10 })

      if (hits.length === 0) {
        counts.NOT_FOUND++
        audit.push({
          id: c.id, nom_entreprise: c.nom_entreprise,
          zefix_name: '', zefix_uid: '', zefix_status: '',
          ville_db: c.ville || '', ville_rc: '', similarity: 0,
          action: 'NOT_FOUND', cantonal_url: '',
        })
        if (i < 20 || i % 50 === 0) console.log(`${progress} ❓ ${c.nom_entreprise} — NOT_FOUND`)
        await sleep(RATE_MS)
        continue
      }

      // Best fuzzy + bonus ville (max 5 pts)
      let bestScore = 0
      let bestHit: any = null
      for (const h of hits) {
        const score = nameSimilarity(c.nom_entreprise, h.name)
        const villeBonus = c.ville && h.legalSeat
          && h.legalSeat.toLowerCase().includes(c.ville.toLowerCase())
          ? 5 : 0
        const adjusted = score + villeBonus
        if (adjusted > bestScore) {
          bestScore = adjusted
          bestHit = h
        }
      }

      const sem = bestHit ? interpretStatus(bestHit.status) : null
      const baseSim = bestHit ? nameSimilarity(c.nom_entreprise, bestHit.name) : 0

      let action: Action = 'NOT_FOUND'
      if (bestScore < 75 || !bestHit) {
        action = 'NOT_FOUND'
        counts.NOT_FOUND++
      } else if (bestHit.status === 'GELOESCHT') {
        action = 'RADIE'
        counts.RADIE++
      } else if (bestHit.status === 'AUFGELOEST') {
        action = 'EN_LIQUIDATION'
        counts.EN_LIQUIDATION++
      } else if (baseSim < 90) {
        action = 'NOM_DIFFERENT'
        counts.NOM_DIFFERENT++
      } else {
        action = 'OK_ACTIF'
        counts.OK_ACTIF++
      }

      audit.push({
        id: c.id,
        nom_entreprise: c.nom_entreprise,
        zefix_name: bestHit?.name || '',
        zefix_uid: bestHit?.uidFormatted || '',
        zefix_status: bestHit?.status || '',
        ville_db: c.ville || '',
        ville_rc: bestHit?.legalSeat || '',
        similarity: baseSim,
        action,
        cantonal_url: bestHit?.cantonalExcerptWeb || '',
      })

      // UPDATE DB seulement si match (action ≠ NOT_FOUND)
      if (!DRY_RUN && bestHit && action !== 'NOT_FOUND') {
        const { error: upErr } = await supabase
          .from('clients')
          .update({
            zefix_uid: bestHit.uidFormatted,
            zefix_status: bestHit.status,
            zefix_name: bestHit.name,
            zefix_verified_at: new Date().toISOString(),
          })
          .eq('id', c.id)
        if (upErr) {
          dbErrors++
          console.warn(`${progress} ⚠️ UPDATE failed for ${c.nom_entreprise}: ${upErr.message}`)
        } else {
          dbUpdates++
        }
      } else if (!DRY_RUN && action === 'NOT_FOUND') {
        // Marque vérifié_at pour ne pas re-tenter avant 30j
        await supabase
          .from('clients')
          .update({ zefix_verified_at: new Date().toISOString() })
          .eq('id', c.id)
      }

      const emoji = action === 'OK_ACTIF' ? '✅'
        : action === 'EN_LIQUIDATION' ? '⚠️'
        : action === 'RADIE' ? '❌'
        : action === 'NOM_DIFFERENT' ? '🔄'
        : '❓'
      if (i < 20 || i % 50 === 0 || action === 'RADIE' || action === 'EN_LIQUIDATION') {
        console.log(`${progress} ${emoji} ${c.nom_entreprise} → ${action}${bestHit ? ` (${bestHit.uidFormatted}, ${baseSim}%)` : ''}`)
      }

      await sleep(RATE_MS)
    } catch (e: any) {
      console.warn(`${progress} ❌ ${c.nom_entreprise} — error: ${e?.message}`)
      audit.push({
        id: c.id, nom_entreprise: c.nom_entreprise,
        zefix_name: '', zefix_uid: '', zefix_status: '',
        ville_db: c.ville || '', ville_rc: '', similarity: 0,
        action: 'NOT_FOUND', cantonal_url: '',
      })
      counts.NOT_FOUND++
      await sleep(RATE_MS)
    }
  }

  // CSV
  const csvPath = join(homedir(), 'Desktop', `zefix-audit-clients${DRY_RUN ? '-dry-run' : ''}.csv`)
  const header = ['id', 'nom_entreprise', 'zefix_name', 'zefix_uid', 'zefix_status', 'ville_db', 'ville_rc', 'similarity', 'action', 'cantonal_url']
  const lines = [header.join(',')]
  for (const r of audit) {
    lines.push(header.map(h => csvEscape((r as any)[h])).join(','))
  }
  writeFileSync(csvPath, lines.join('\n'), 'utf8')

  // Récap
  console.log('\n=== RÉCAP ===')
  console.log(`Total audités       : ${clients.length}`)
  console.log(`✅ OK_ACTIF          : ${counts.OK_ACTIF}`)
  console.log(`⚠️ EN_LIQUIDATION    : ${counts.EN_LIQUIDATION}`)
  console.log(`❌ RADIE             : ${counts.RADIE}  ← À EXAMINER`)
  console.log(`🔄 NOM_DIFFERENT     : ${counts.NOM_DIFFERENT}`)
  console.log(`❓ NOT_FOUND         : ${counts.NOT_FOUND}`)
  console.log(`⏭ ALREADY_VERIFIED  : ${counts.ALREADY_VERIFIED}`)
  if (!DRY_RUN) {
    console.log(`\nDB updates OK : ${dbUpdates}`)
    console.log(`DB errors     : ${dbErrors}`)
  } else {
    console.log(`\n[DRY-RUN] Aucune modification DB. Re-lance avec --apply pour persister.`)
  }
  console.log(`\nCSV → ${csvPath}\n`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
