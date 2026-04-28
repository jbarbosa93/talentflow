/**
 * Applique les règles 1-9 (issues des 93 corrections manuelles de João) sur toutes
 * les fiches localisation NON encore corrigées (statut SAME ou NULL post-batch v1.9.108).
 *
 * Sortie : ~/Desktop/localisation-corrections-completes.csv
 * Format : id,nom,prenom,localisation_actuelle,correction_proposee,regle_appliquee
 *
 * AUCUNE écriture DB. Validation João requise avant tout UPDATE.
 *
 * Usage :
 *   npx tsx scripts/batch/apply-rules-localisation.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { lookupCP, normalizeKey } from '../../lib/normalize-localisation'

// ─── Lecture CSV exporté ──────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (q) {
      if (c === '"' && n === '"') { field += '"'; i++ }
      else if (c === '"') { q = false }
      else field += c
    } else {
      if (c === '"' && field === '') q = true
      else if (c === ',') { cur.push(field); field = '' }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || cur.length) { cur.push(field); rows.push(cur); cur = []; field = '' }
        if (c === '\r' && n === '\n') i++
      }
      else field += c
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur) }
  return rows
}

const csvPath = path.join(os.homedir(), 'Desktop', 'localisation-non-normalises-export.csv')
const text = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '') // strip BOM
const rows = parseCSV(text)
const [hdr, ...data] = rows
const ix = (n: string) => hdr.findIndex(h => h.trim().toLowerCase() === n.toLowerCase())
type Row = { id: string; nom: string; prenom: string; loc: string; correction: string; statut: string; raison: string }
const allEntries: Row[] = data.map(r => ({
  id: r[ix('id')] ?? '',
  nom: r[ix('nom')] ?? '',
  prenom: r[ix('prenom')] ?? '',
  loc: r[ix('localisation_actuelle')] ?? '',
  correction: ((r[ix('Correction')] ?? '') as string).trim(),
  statut: r[ix('statut')] ?? '',
  raison: r[ix('raison')] ?? '',
}))

const uncorrected = allEntries.filter(e => !e.correction)
console.log(`Lignes sans correction : ${uncorrected.length}`)

// ─── Constantes règles ──────────────────────────────────────────────────
const COUNTRIES_OTHER = ['Italie', 'Portugal', 'Belgique', 'Espagne', 'Allemagne', 'Luxembourg', 'Maroc', 'Algérie', 'Tunisie', 'Pays-Bas', 'Royaume-Uni', 'Pologne', 'Roumanie', 'Brésil', 'Cap-Vert', 'Sénégal']
const VOIRIE_FOREIGN_RE = /(?<![\p{L}])(rue|avenue|route|chemin|via|rua|strada|calle|avenida|strasse|gasse|weg|platz|piazza|travessa|carretera|corso|alameda|baixa)(?![\p{L}])/iu

const COUNTRY_ALIASES_LIKE_FRANCE = new Set(['france', 'francaise', 'française', 'fr'])
const COUNTRY_ALIASES_LIKE_SUISSE = new Set(['suisse', 'switzerland', 'ch', 'schweiz', 'svizzera', 'suiça', 'suïça', 'suiza', 'svizra'])

// Alias bilingues / variantes officielles → clé canonique du dataset
const VILLE_ALIASES_CH: Record<string, string> = {
  'bienne': 'biel/bienne',
  'biel': 'biel/bienne',
  'berne': 'bern',
  'bale': 'basel',
  'soleure': 'solothurn',
  'lucerne': 'luzern',
  'coire': 'chur',
  'fribourg-en-suisse': 'fribourg',
  'st-gall': 'st.-gallen',
  'saint-gall': 'st.-gallen',
}

// Levenshtein distance — bornée à maxDist pour skip rapide
function levenshtein(a: string, b: string, maxDist = 3): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1
  const m = a.length, n = b.length
  if (m === 0) return n; if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    let rowMin = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    if (rowMin > maxDist) return maxDist + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

// Overrides — chargés depuis scripts/data/cp_overrides.json (source de vérité unique partagée
// avec lib/normalize-localisation.ts → pipeline import).
const OVERRIDES: Record<string, [string, string, string]> = (() => {
  const raw = require('../../scripts/data/cp_overrides.json') as { _overrides: Record<string, [string, string, string]> }
  return raw._overrides
})()

// Typos courantes (clé normalisée fautive → clé normalisée correcte)
const TYPO_VILLES: Record<string, string> = {
  'arinmasse': 'annemasse',
  'bellegrarde-sur-valserine': 'bellegarde-sur-valserine',
  'troistirrents': 'troistorrents',
  'montheÿ': 'monthey',
  'monthey-y-trema': 'monthey',
  'saint-cergues': 'saint-cergue',
  'ames-sur-orbe': 'arnex-sur-orbe',
  'aubigny-les-clouzeau': 'aubigny-les-clouzeaux',
  'lavey-les-bains-': 'lavey-les-bains',
  'martiguy': 'martigny',
  'evian-les-bains-': 'evian-les-bains',
  'evian-les-bains': 'evian-les-bains',
  'thonon-les-bains-': 'thonon-les-bains',
  'evian-les-bains-france': 'evian-les-bains',
}

const STRICT_RE_CH = /^[1-9]\d{3} [A-ZÀ-ÿ][^,]*, Suisse$/
const STRICT_RE_FR = /^\d{5} [A-ZÀ-ÿ][^,]*, France$/
const STRICT_RE_OTHER = /^[A-ZÀ-ÿ][^,0-9]*, (?!Suisse$|France$)[A-ZÀ-ÿ][^,0-9]*$/

// ─── Helpers ──────────────────────────────────────────────────────────
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function detectForeignCountryAtEnd(loc: string): string | null {
  for (const p of COUNTRIES_OTHER) {
    const re = new RegExp(`(?:^|[\\s,])${p}\\.?\\s*$`, 'i')
    if (re.test(loc)) return p
  }
  return null
}

function smartTitleCase(s: string): string {
  const small = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'd', 'et', 'sur', 'sous', 'en', 'lès'])
  return s.split(/(\s+|-)/).map((part, i) => {
    if (/^(\s+|-)$/.test(part)) return part
    if (i > 0 && small.has(part.toLowerCase())) return part.toLowerCase()
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  }).join('')
}

function lookupOverride(city: string): [string, string, string] | null {
  const key = normalizeKey(city)
  return OVERRIDES[key] || null
}

// Blacklist : ces "villes" ne doivent JAMAIS être lookupées (pays / régions / mots génériques)
const VILLE_BLACKLIST = new Set([
  'france', 'suisse', 'portugal', 'espagne', 'italie', 'allemagne', 'belgique', 'luxembourg',
  'maroc', 'algerie', 'tunisie', 'turquie', 'cameroun', 'senegal', 'bresil', 'russie',
  'cap-vert', 'pologne', 'roumanie', 'ukraine', 'pays-bas', 'royaume-uni',
  'champagne', 'champagnes', 'bourgogne', 'normandie', 'bretagne', 'provence', 'aquitaine',
  'bugey', 'savoie', 'haute-savoie', 'alsace', 'lorraine', 'occitanie',
  'valais', 'vaud', 'geneve', 'fribourg', 'vd', 'vs', 'ge',  // cantons CH (sans CP propre)
])

function lookupWithTypo(city: string, country: 'Suisse' | 'France'): { cp: string; label: string; via?: string } | null {
  const key = normalizeKey(city)
  if (VILLE_BLACKLIST.has(key)) return null
  // 1. lookup direct
  let found = lookupCP(city, country)
  if (found) return { cp: found[0], label: found[1] }
  // 1bis. saint↔st substitution partout dans la clé (chatel-saint-denis → chatel-st-denis)
  if (key.includes('saint-') || key.includes('-saint-')) {
    const altSt = key.replace(/(?:^|-)saint-/g, m => m.replace('saint', 'st'))
    found = lookupCP(altSt, country)
    if (found) return { cp: found[0], label: found[1], via: 'saint↔st' }
  }
  if (key.includes('st-')) {
    const altSaint = key.replace(/(?:^|-)st-/g, m => m.replace('st', 'saint'))
    found = lookupCP(altSaint, country)
    if (found) return { cp: found[0], label: found[1], via: 'saint↔st' }
  }
  // 1ter. "ste-" ↔ "sainte-" (Conflans-Ste-Honorine, Aix-Sainte-Marie, etc.)
  if (key.includes('ste-')) {
    const altSainte = key.replace(/(?:^|-)ste-/g, m => m.replace('ste', 'sainte'))
    found = lookupCP(altSainte, country)
    if (found) return { cp: found[0], label: found[1], via: 'ste↔sainte' }
  }
  // 2. typo correction
  const corrected = TYPO_VILLES[key]
  if (corrected) {
    found = lookupCP(corrected, country)
    if (found) return { cp: found[0], label: found[1], via: 'typo' }
  }
  // 3. override
  const override = OVERRIDES[key]
  if (override && override[2] === country) return { cp: override[0], label: override[1], via: 'override' }
  // 3bis. Fallback compound "X-Y" : essayer "X" puis "Y" (mais skip mots génériques)
  //       (Charrat-Fully → Charrat, Bret-saint-Gingolph → Saint-Gingolph)
  if (key.includes('-')) {
    const STOP_SEGMENTS = new Set([
      'rue', 'route', 'chemin', 'avenue', 'av', 'place', 'cours', 'allee', 'allée',
      'impasse', 'boulevard', 'bd', 'quai', 'venelle', 'esplanade', 'passage', 'sentier',
      'sur', 'sous', 'les', 'le', 'la', 'des', 'du', 'de', 'aux', 'au', 'et',
      'bains', 'bain', 'mont', 'monts', 'lac', 'pont', 'val', 'vals', 'fully',
      'novel', 'nord', 'sud', 'est', 'ouest', 'centre', 'ville', 'village',
      'haute', 'haut', 'basse', 'bas', 'grand', 'grande', 'petit', 'petite',
      'collombey', 'sion', 'lausanne', 'martigny',  // déjà autres villes principales — segments isolés douteux
      'champs', 'champ', 'pres', 'près', 'morge', 'gare',  // génériques anti-FP
    ])
    // Skip si voirie présente dans le `city` original
    const hasVoirie = /(?<![\p{L}])(rue|avenue|av\.|route|rte\.|chemin|all[ée]e|boulevard|impasse|quai|venelle|sentier|esplanade)(?![\p{L}])/iu.test(city)
    if (!hasVoirie) {
      const parts = key.split('-').filter(p => p.length >= 4 && !STOP_SEGMENTS.has(p) && !/^\d/.test(p))
      if (parts.length === 1) {
        const f2 = lookupCP(parts[0], country)
        if (f2) return { cp: f2[0], label: f2[1], via: `segment(${parts[0]})` }
      }
    }
  }
  // 4. alias bilingue CH (Bienne→biel/bienne) — uniquement liste curée
  if (country === 'Suisse' && VILLE_ALIASES_CH[key]) {
    const dict = require('../../scripts/data/cp_suisse.json')
    const aliasKey = VILLE_ALIASES_CH[key]
    if (dict[aliasKey]) return { cp: dict[aliasKey][0], label: dict[aliasKey][1], via: 'alias' }
  }
  // 5. inclusion via "/" UNIQUEMENT (variantes bilingues comme biel/bienne)
  //    NE PAS matcher "ravoire" → "la-ravoire" via tiret (faux positif)
  if (key.length >= 4) {
    const dict = country === 'Suisse'
      ? require('../../scripts/data/cp_suisse.json')
      : require('../../scripts/data/cp_france.json')
    for (const k of Object.keys(dict)) {
      if (k === key) continue
      if (new RegExp(`(^|/)${key}(/|$)`).test(k)) {
        const e = dict[k]
        return { cp: e[0], label: e[1], via: 'inclusion-slash' }
      }
    }
  }
  // 6. fuzzy Levenshtein ≤ 2 (longueur ≥ 6, désambiguïsation : 1 seul candidat au best rank)
  //    Si 2 villes possibles à même distance → ambigu, NE PAS corriger.
  //    Pour d=2 : exiger 3 premiers chars identiques (filtre FP type Malo→Vals, Illarsaz→Villariaz)
  if (key.length >= 6) {
    const dict = country === 'Suisse'
      ? require('../../scripts/data/cp_suisse.json')
      : require('../../scripts/data/cp_france.json')
    let bestKey: string | null = null, bestDist = 99, secondDist = 99, bestCount = 0
    for (const k of Object.keys(dict)) {
      const d = levenshtein(key, k, 2)
      if (d < bestDist) { secondDist = bestDist; bestDist = d; bestKey = k; bestCount = 1 }
      else if (d === bestDist) { bestCount++ }
      else if (d < secondDist) { secondDist = d }
    }
    if (bestKey && bestDist <= 2 && bestCount === 1 && secondDist > bestDist) {
      // Pour d=2 : garde-fou supplémentaire — préfixe 3 chars identiques
      if (bestDist === 2 && key.slice(0, 3) !== bestKey.slice(0, 3)) return null
      const e = dict[bestKey]
      return { cp: e[0], label: e[1], via: `fuzzy(d=${bestDist})` }
    }
  }
  return null
}

function reverseLookupCP(cp: string, country: 'Suisse' | 'France'): string | null {
  // Reverse lookup : trouve la 1ère ville du dataset associée à ce CP (best-effort).
  // Charge les datasets bruts (ils sont déjà en mémoire via require).
  const dict = country === 'Suisse'
    ? require('../../scripts/data/cp_suisse.json')
    : require('../../scripts/data/cp_france.json')
  for (const [, entry] of Object.entries(dict as Record<string, [string, string]>)) {
    if (entry[0] === cp) return entry[1]
  }
  return null
}

// Strip suffix canton
function stripCantonSuffix(s: string): string {
  return s.replace(/\s+(VS|VD|GE|FR|NE|JU|BE|TI|ZH|AG|LU|BL|BS|GR|SG|SH|SO|SZ|TG|UR|ZG|OW|NW|AR|AI|GL)\.?$/i, '').trim()
}

// ─── Règles ──────────────────────────────────────────────────────────
type RuleResult = { correction: string; rule: string } | null

function rule5_foreign_address(loc: string): RuleResult {
  // Adresse étrangère "rue X..., Pays" → garder UNIQUEMENT le pays
  const country = detectForeignCountryAtEnd(loc)
  if (!country) return null
  if (!VOIRIE_FOREIGN_RE.test(loc)) return null
  // Si la chaîne contient aussi une ville claire AVANT le pays, on garde la ville. Sinon pays seul.
  // Heuristique : on regarde s'il y a un segment "Ville, Pays" CIBLE déjà reconnaissable
  return { correction: country, rule: 'R5 (drop adresse étrangère)' }
}

function rule6_override(loc: string): RuleResult {
  // Cherche un override exact sur la ville extraite
  const segments = loc.split(',').map(s => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const cleaned = stripCantonSuffix(seg).replace(/^\d{4,5}\s+/, '').replace(/\s+\d{4,5}$/, '').trim()
    const ov = lookupOverride(cleaned)
    if (ov) return { correction: `${ov[0]} ${ov[1]}, ${ov[2]}`, rule: 'R6 (override village manquant)' }
  }
  return null
}

function rule_enrich_cp(loc: string): RuleResult {
  // Format "Ville, Suisse" ou "Ville, France" + ville présente dans le dataset du pays déclaré
  // → enrichir avec CP. Cas le plus fréquent (~280 fiches).
  const m = loc.match(/^(.+?),\s*(Suisse|France|Suiça|Suïça|Suiza|Switzerland|Schweiz|Francaise|Française)$/i)
  if (!m) return null
  const villeRaw = stripCantonSuffix(m[1].trim()).replace(/^\d{4,5}\s+/, '').replace(/\s+\d{4,5}$/, '').trim()
  if (!villeRaw) return null
  const declaredLower = stripAccents(m[2].toLowerCase())
  const declared: 'Suisse' | 'France' = COUNTRY_ALIASES_LIKE_FRANCE.has(declaredLower) ? 'France' : 'Suisse'

  // Lookup PRIORITAIRE dans le pays déclaré
  const inDeclared = lookupWithTypo(villeRaw, declared)
  if (inDeclared) {
    const ruleName = inDeclared.via
      ? `R-enrich (${declared}, via ${inDeclared.via})`
      : `R-enrich (${declared})`
    return { correction: `${inDeclared.cp} ${inDeclared.label}, ${declared}`, rule: ruleName }
  }
  return null
}

function rule_country_swap(loc: string): RuleResult {
  // R1 + R2 : swap pays si ville clairement attribuée au mauvais pays.
  // Appelée APRÈS rule_enrich_cp (qui a déjà privilégié le pays déclaré).
  const m = loc.match(/^(.+?),\s*(Suisse|France|Suiça|Suïça|Suiza|Switzerland|Schweiz|Francaise|Française)$/i)
  if (!m) return null
  const villeRaw = stripCantonSuffix(m[1].trim()).replace(/^\d{4,5}\s+/, '').replace(/\s+\d{4,5}$/, '').trim()
  const declaredLower = stripAccents(m[2].toLowerCase())
  const declared: 'Suisse' | 'France' = COUNTRY_ALIASES_LIKE_FRANCE.has(declaredLower) ? 'France' : 'Suisse'

  const inCH = lookupWithTypo(villeRaw, 'Suisse')
  const inFR = lookupWithTypo(villeRaw, 'France')

  // R1 : déclaré FR mais ville en CH directe (pas via fuzzy)
  if (declared === 'France' && inCH && (!inCH.via || inCH.via === 'override' || inCH.via === 'alias') && !inFR) {
    return { correction: `${inCH.cp} ${inCH.label}, Suisse`, rule: 'R1 (ville CH marquée FR)' }
  }
  // R2 : déclaré CH mais ville en FR directe et absente CH
  if (declared === 'Suisse' && inFR && (!inFR.via || inFR.via === 'override' || inFR.via === 'alias') && !inCH) {
    return { correction: `${inFR.cp} ${inFR.label}, France`, rule: 'R2 (ville FR marquée CH)' }
  }
  // R1bis : ville absente du pays déclaré ET trouvée par fuzzy d≤1 dans l'autre pays seulement
  //         (ex: "Chesssel, France" → 1846 Chessel, Suisse)
  if (declared === 'France' && inCH && inCH.via === 'fuzzy(d=1)' && !inFR) {
    return { correction: `${inCH.cp} ${inCH.label}, Suisse`, rule: 'R1bis (CH via fuzzy, marqué FR)' }
  }
  if (declared === 'Suisse' && inFR && inFR.via === 'fuzzy(d=1)' && !inCH) {
    return { correction: `${inFR.cp} ${inFR.label}, France`, rule: 'R2bis (FR via fuzzy, marqué CH)' }
  }
  return null
}

function rule_enrich_no_country(loc: string): RuleResult {
  // Ville seule sans pays "Aigle", "Massongex" → enrichir
  if (loc.includes(',')) return null
  const villeRaw = stripCantonSuffix(loc.trim()).replace(/^\d{4,5}\s+/, '').replace(/\s+\d{4,5}$/, '').trim()
  if (!villeRaw || villeRaw.length < 3) return null
  if (/[0-9]/.test(villeRaw)) return null // contient un chiffre → pas une ville propre
  // Priorité CH (le plus fréquent dans nos data)
  const inCH = lookupWithTypo(villeRaw, 'Suisse')
  const inFR = lookupWithTypo(villeRaw, 'France')
  // Pas ambigu seulement si match clair dans un seul pays
  if (inCH && !inFR) return { correction: `${inCH.cp} ${inCH.label}, Suisse`, rule: `R-enrich-noctry (CH${inCH.via ? ', via ' + inCH.via : ''})` }
  if (inFR && !inCH) return { correction: `${inFR.cp} ${inFR.label}, France`, rule: `R-enrich-noctry (FR${inFR.via ? ', via ' + inFR.via : ''})` }
  return null
}

function rule_cp_force_country(loc: string): RuleResult {
  // R3 + R4 : si CP dans la chaîne, forcer le pays correspondant.
  // CP CH 4 chiffres OU CP FR 5 chiffres dans la chaîne.
  const m5 = loc.match(/(?:^|[\s,(])(\d{5})(?:[\s,);]|$)/)
  const m4 = loc.match(/(?:^|[\s,(])([1-9]\d{3})(?:[\s,);]|$)/)
  const country: 'Suisse' | 'France' | null = m5 ? 'France' : (m4 ? 'Suisse' : null)
  if (!country) return null
  const cp = m5 ? m5[1] : m4![1]

  // Tenter de trouver une ville candidate dans la chaîne (segment alpha sans voirie+sans pays)
  let segments = loc.split(/[,;]/).map(s => s.trim()).filter(Boolean)
  segments = segments.filter(s => !COUNTRY_ALIASES_LIKE_FRANCE.has(stripAccents(s.toLowerCase())) && !COUNTRY_ALIASES_LIKE_SUISSE.has(stripAccents(s.toLowerCase())))
  let cityCandidate: string | null = null
  for (const seg of segments) {
    // Cleanup voirie résiduelle dans le seg
    let cleaned = seg.replace(/^\d+[a-zA-Z]?\s+/, '') // strip numéro de rue en tête
    cleaned = cleaned.replace(/(?:^|\s)(rue|avenue|route|chemin|all[ée]e|impasse|boulevard|cours|esplanade|place|quai)[^\s,]*\s+/gi, ' ').trim()
    cleaned = stripCantonSuffix(cleaned).replace(/^\d{4,5}\s+/, '').replace(/\s+\d{4,5}$/, '').trim()
    if (!cleaned) continue
    // Si ce segment contient un nom de ville reconnu, take it
    const hit = lookupWithTypo(cleaned, country)
    if (hit) { return { correction: `${hit.cp} ${hit.label}, ${country}`, rule: country === 'Suisse' ? 'R3 (CP CH force pays)' : 'R4 (CP FR force pays)' } }
    // Fallback : last token (probablement le nom propre = ville)
    const tokens = cleaned.split(/\s+/).filter(Boolean)
    if (tokens.length > 0) {
      const last = tokens.slice(-1)[0]
      const hit2 = lookupWithTypo(last, country)
      if (hit2) { return { correction: `${hit2.cp} ${hit2.label}, ${country}`, rule: country === 'Suisse' ? 'R3 (CP CH force pays)' : 'R4 (CP FR force pays)' } }
    }
    if (!cityCandidate) cityCandidate = cleaned
  }

  // Si pas trouvé via lookup, reverse lookup CP→ville
  const reverseCity = reverseLookupCP(cp, country)
  if (reverseCity) {
    return { correction: `${cp} ${reverseCity}, ${country}`, rule: country === 'Suisse' ? 'R3 (CP CH reverse-lookup)' : 'R4 (CP FR reverse-lookup)' }
  }
  return null
}

function rule_already_strict(loc: string): RuleResult {
  if (STRICT_RE_CH.test(loc) || STRICT_RE_FR.test(loc) || STRICT_RE_OTHER.test(loc)) {
    return { correction: loc, rule: 'SKIP (déjà au format strict)' }
  }
  return null
}

function applyRules(loc: string): RuleResult {
  // 0. déjà strict
  const r0 = rule_already_strict(loc); if (r0) return r0
  // 5. adresse étrangère → pays seul
  const r5 = rule5_foreign_address(loc); if (r5) return r5
  // 6. override (avant tout : villes manuelles connues)
  const r6 = rule6_override(loc); if (r6) return r6
  // 7. enrichir CP en respectant le pays déclaré (cas le plus fréquent ~280 fiches)
  const rEnrich = rule_enrich_cp(loc); if (rEnrich) return rEnrich
  // 8. ville seule sans pays → enrichir avec CP+pays inféré du dataset
  const rEnrichNo = rule_enrich_no_country(loc); if (rEnrichNo) return rEnrichNo
  // 1+2. swap pays (uniquement si pays déclaré et ville pas trouvée dans pays déclaré)
  const rSwap = rule_country_swap(loc); if (rSwap) return rSwap
  // 3+4. CP force country
  const rCP = rule_cp_force_country(loc); if (rCP) return rCP
  return null
}

// ─── Run ──────────────────────────────────────────────────────────────
type Out = Row & { proposition: string; regle: string }
const outputs: Out[] = []
const ambigues: string[] = ['provence', 'champlan', 'pont', 'bouilly']

const stats: Record<string, number> = {}
const examples: Out[] = []

for (const e of uncorrected) {
  const lower = e.loc.toLowerCase().split(',')[0].trim()
  if (ambigues.includes(stripAccents(lower).replace(/[\s\-']/g, ''))) {
    outputs.push({ ...e, proposition: '', regle: 'R10 (ambigu, laissé intact)' })
    stats['R10 (ambigu)'] = (stats['R10 (ambigu)'] || 0) + 1
    continue
  }
  const res = applyRules(e.loc)
  if (res && res.correction !== e.loc) {
    outputs.push({ ...e, proposition: res.correction, regle: res.rule })
    stats[res.rule] = (stats[res.rule] || 0) + 1
    if (examples.length < 30) examples.push({ ...e, proposition: res.correction, regle: res.rule })
  } else if (res && res.correction === e.loc) {
    outputs.push({ ...e, proposition: '', regle: res.rule })
    stats[res.rule] = (stats[res.rule] || 0) + 1
  } else {
    outputs.push({ ...e, proposition: '', regle: 'IRRÉCUPÉRABLE' })
    stats['IRRÉCUPÉRABLE'] = (stats['IRRÉCUPÉRABLE'] || 0) + 1
  }
}

// ─── Rapport ──────────────────────────────────────────────────────────
console.log('\n═══ Statistiques règles appliquées ═══')
const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1])
for (const [rule, count] of sortedStats) {
  console.log(`  ${rule.padEnd(45)} ${count}`)
}
const totalCorr = outputs.filter(o => o.proposition && o.proposition !== o.loc).length
console.log(`\nTotal propositions de correction : ${totalCorr} / ${uncorrected.length}`)
console.log(`Laissés intacts (ambigus + irrécupérables + déjà strict) : ${uncorrected.length - totalCorr}`)

console.log('\n═══ 30 exemples ═══')
for (const ex of examples) {
  console.log(`  [${ex.regle}]`)
  console.log(`    "${ex.loc}"`)
  console.log(`    → "${ex.proposition}"`)
}

// ─── Export CSV ──────────────────────────────────────────────────────
function csvEscape(s: string): string {
  if (s == null) return ''
  const needsQuote = s.includes(',') || s.includes('"') || s.includes('\n')
  return needsQuote ? '"' + s.replace(/"/g, '""') + '"' : s
}
const lines: string[] = ['id,nom,prenom,localisation_actuelle,correction_proposee,regle_appliquee']
// Tri : par règle puis par localisation
outputs.sort((a, b) => a.regle.localeCompare(b.regle) || a.loc.localeCompare(b.loc))
for (const o of outputs) {
  lines.push([o.id, csvEscape(o.nom), csvEscape(o.prenom), csvEscape(o.loc), csvEscape(o.proposition), csvEscape(o.regle)].join(','))
}
const outPath = path.join(os.homedir(), 'Desktop', 'localisation-corrections-completes.csv')
fs.writeFileSync(outPath, '﻿' + lines.join('\n'), 'utf8')
console.log(`\nCSV écrit : ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`)
