/**
 * Export CSV des fiches dont la localisation n'a PAS pu être normalisée
 * au format strict "CP Ville, Pays" (statut SAME ou NULL).
 *
 * Usage :
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/batch/export-non-normalized-localisation.ts
 *
 * Sortie : ~/Desktop/localisation-non-normalises.csv
 *
 * Format CSV (avec en-tête) :
 *   id,nom,prenom,localisation_actuelle,statut,raison
 *
 * Lecture seule, aucune écriture en DB.
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { normalizeLocalisation, isAlreadyNormalized, lookupCP } from '../../lib/normalize-localisation'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SR = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SUPABASE_SR) throw new Error('Supabase env manquant')

const supabase = createClient(SUPABASE_URL, SUPABASE_SR, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const VOIRIE_RE = /(?<![\p{L}])(rue|avenue|av\.|route|rte\.|chemin|all[ée]e|boulevard|impasse|quai|cours|esplanade|venelle|sentier|passage|villa|r[ée]sidence|lieu-?dit|hameau|mont[ée]e)(?![\p{L}])/iu
const COUNTRY_WORDS = new Set(['suisse','france','portugal','espagne','italie','allemagne','belgique','luxembourg','maroc','algérie','algerie','tunisie','turquie','cameroun','sénégal','senegal','brésil','bresil','pologne','roumanie','ukraine','russie','grèce','grece'])
const REGIONS_OR_COUNTRIES_NAMED = new Set(['provence','bretagne','normandie','alsace','aquitaine','catalogne','andalousie','toscane','sicile','bavière','baviere','bavaria','silésie','silesie','flandre','wallonie','val-d\'aoste','occitanie','centre','limousin'])

type Cand = { id: string; nom: string | null; prenom: string | null; localisation: string }

async function fetchAll(): Promise<Cand[]> {
  const all: Cand[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('candidats')
      .select('id, nom, prenom, localisation')
      .not('localisation', 'is', null)
      .neq('localisation', '')
      .range(from, from + PAGE - 1)
      .order('id')
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data as any[]) all.push(r)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

function classifyReason(loc: string, status: 'SAME' | 'NULL'): string {
  const trimmed = loc.trim()
  const lower = trimmed.toLowerCase().replace(/^['"\s]+|['"\s]+$/g, '')

  // Pays seul
  if (COUNTRY_WORDS.has(lower)) return 'pays seul sans ville'
  if (!trimmed.includes(',') && trimmed.length < 4) return 'input trop court'

  // Région connue
  const firstSegment = trimmed.split(',')[0]?.trim().toLowerCase()
  if (firstSegment && REGIONS_OR_COUNTRIES_NAMED.has(firstSegment)) return 'région pas ville'

  // Voirie sans ville claire
  const hasVoirie = VOIRIE_RE.test(trimmed)
  if (hasVoirie && status === 'NULL') return 'rue sans ville identifiable'

  // Statut SAME : déjà au format autre pays "Ville, Pays" → format strict autre pays accepté
  if (status === 'SAME') {
    if (isAlreadyNormalized(trimmed)) return 'format autre pays accepté (Ville, Pays)'
    // Si la ville est introuvable dans les datasets → typo ou ville rare
    const cityCandidate = trimmed.split(',')[0]?.trim() || trimmed
    const inCH = lookupCP(cityCandidate, 'Suisse')
    const inFR = lookupCP(cityCandidate, 'France')
    if (!inCH && !inFR) return 'ville absente dataset (typo ou hors CH/FR)'
    return 'autre (vérifier manuellement)'
  }

  // NULL avec virgule
  if (trimmed.includes(',')) return 'parsing impossible (multi-segments)'

  // Cas par défaut
  return status === 'NULL' ? 'parsing impossible' : 'autre'
}

function csvEscape(s: string): string {
  if (s == null) return ''
  const needsQuote = s.includes(',') || s.includes('"') || s.includes('\n')
  const escaped = s.replace(/"/g, '""')
  return needsQuote ? `"${escaped}"` : escaped
}

async function main() {
  console.log('Fetching candidates with localisation...')
  const all = await fetchAll()
  console.log(`Fetched ${all.length} fiches\n`)

  const rows: { id: string; nom: string; prenom: string; loc: string; statut: 'SAME' | 'NULL'; raison: string }[] = []
  let changed = 0, skipped = 0, same = 0, nulls = 0

  for (const c of all) {
    const before = c.localisation
    let status: 'CHANGED' | 'SKIP' | 'SAME' | 'NULL'
    if (isAlreadyNormalized(before)) {
      status = 'SKIP'; skipped++
    } else {
      const after = normalizeLocalisation(before)
      if (after === null) { status = 'NULL'; nulls++ }
      else if (after === before) { status = 'SAME'; same++ }
      else { status = 'CHANGED'; changed++ }
    }

    if (status === 'SAME' || status === 'NULL') {
      const raison = classifyReason(before, status as 'SAME' | 'NULL')
      rows.push({
        id: c.id,
        nom: c.nom ?? '',
        prenom: c.prenom ?? '',
        loc: before,
        statut: status as 'SAME' | 'NULL',
        raison,
      })
    }
  }

  console.log(`Bilan : CHANGED=${changed}, SKIP=${skipped}, SAME=${same}, NULL=${nulls}`)
  console.log(`À exporter : ${rows.length} (${same} SAME + ${nulls} NULL)\n`)

  // Tri : par statut puis par raison puis par localisation
  rows.sort((a, b) => {
    if (a.statut !== b.statut) return a.statut.localeCompare(b.statut)
    if (a.raison !== b.raison) return a.raison.localeCompare(b.raison)
    return a.loc.localeCompare(b.loc)
  })

  // Génération CSV
  const lines: string[] = []
  lines.push('id,nom,prenom,localisation_actuelle,statut,raison')
  for (const r of rows) {
    lines.push([r.id, csvEscape(r.nom), csvEscape(r.prenom), csvEscape(r.loc), r.statut, csvEscape(r.raison)].join(','))
  }

  const outPath = path.join(os.homedir(), 'Desktop', 'localisation-non-normalises.csv')
  fs.writeFileSync(outPath, '﻿' + lines.join('\n'), 'utf8') // BOM pour Excel/Numbers UTF-8
  console.log(`CSV écrit : ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`)

  // Petit récap des raisons pour aperçu
  const byReason: Record<string, number> = {}
  for (const r of rows) byReason[r.raison] = (byReason[r.raison] || 0) + 1
  console.log('\nRépartition par raison :')
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(50)} ${count}`)
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
