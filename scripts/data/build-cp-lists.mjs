#!/usr/bin/env node
/**
 * Construit cp_suisse.json et cp_france.json à partir des dumps geonames bruts.
 *
 * Sources brutes (téléchargées préalablement) :
 *   /tmp/geo_ch.json — geonames postal-code refine country_code:CH
 *   /tmp/geo_fr.json — geonames postal-code refine country_code:FR
 *
 * Sortie :
 *   scripts/data/cp_suisse.json — { "monthey": "1870", ... }
 *   scripts/data/cp_france.json — { "annemasse": "74100", ... }
 *
 * Règles :
 *   - clé : place_name normalisé (lowercase + sans accents + - normalisé)
 *   - valeur : CP min hors CEDEX (le premier CP officiel de la ville)
 *   - alias automatiques : version sans accents si nom original avait des accents
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizeKey(s) {
  return stripAccents(s).toLowerCase().trim()
    .replace(/['']/g, '-')      // apostrophes typographiques → tiret
    .replace(/\s+/g, '-')        // espaces → tirets
    .replace(/-+/g, '-')         // tirets multiples → tiret unique
    .replace(/^-|-$/g, '')
}

function build(inputPath, outputPath, label) {
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  console.log(`\n[${label}] ${raw.length} entrées brutes`)

  const map = new Map() // normalizedKey → [minCP, originalLabel]

  let cedexSkipped = 0
  for (const r of raw) {
    if (!r.place_name || !r.postal_code) continue
    if (r.postal_code.includes('CEDEX')) { cedexSkipped++; continue }
    const key = normalizeKey(r.place_name)
    if (!key) continue
    const cp = r.postal_code.trim()
    if (!cp.match(/^\d{4,5}$/)) continue
    const existing = map.get(key)
    if (!existing || cp < existing[0]) map.set(key, [cp, r.place_name.trim()])
  }
  console.log(`[${label}] CEDEX skippés : ${cedexSkipped}`)
  console.log(`[${label}] villes uniques : ${map.size}`)

  // tri alphabétique par clé pour stabilité git diff
  const sorted = Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
  fs.writeFileSync(outputPath, JSON.stringify(sorted, null, 2), 'utf8')
  console.log(`[${label}] écrit : ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`)

  // tests de validation
  const checks = label === 'CH'
    ? { monthey: '1870', sion: '1950', aigle: '1860', martigny: '1920', vevey: '1800', sierre: '3960', saxon: '1907', riddes: '1908', saillon: '1913', 'saint-gingolph': '1898' }
    : { annemasse: '74100', 'evian-les-bains': '74500', 'thonon-les-bains': '74200', annecy: '74000', cluses: '74300', 'chamonix-mont-blanc': '74400', paris: '75000', lyon: '69000' }

  console.log(`[${label}] checks :`)
  for (const [k, expected] of Object.entries(checks)) {
    const actual = sorted[k]
    const cp = Array.isArray(actual) ? actual[0] : actual
    const lbl = Array.isArray(actual) ? actual[1] : ''
    const ok = cp === expected ? '✅' : '⚠️'
    console.log(`  ${ok}  ${k} → ${cp ?? 'absent'}${lbl ? ` (${lbl})` : ''} (attendu ${expected})`)
  }
}

build('/tmp/geo_ch.json', path.join(__dirname, 'cp_suisse.json'), 'CH')
build('/tmp/geo_fr.json', path.join(__dirname, 'cp_france.json'), 'FR')
