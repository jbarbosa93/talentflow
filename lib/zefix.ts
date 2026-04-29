// lib/zefix.ts — Client Zefix REST (sans auth)
// v1.9.117 — Vérification entreprises au registre du commerce suisse
//
// API : POST https://www.zefix.admin.ch/ZefixREST/api/v1/firm/search.json
// → endpoint interne du site public zefix.ch, ne demande PAS d'auth.
// (le ZefixPublicREST documenté dans Swagger demande HTTP Basic, lui.)

const ZEFIX_BASE = 'https://www.zefix.admin.ch/ZefixREST/api/v1'

export type ZefixStatus = 'EXISTIEREND' | 'AUFGELOEST' | 'GELOESCHT' | string

export interface ZefixHit {
  name: string
  ehraid: number
  uid: string                 // CHE107721785
  uidFormatted: string        // CHE-107.721.785
  chid: string
  chidFormatted: string
  legalSeatId: number
  legalSeat: string           // ville RC
  registerOfficeId: number
  legalFormId: number         // 1=EI, 2=SNC, 3=SA, 4=Sàrl...
  status: ZefixStatus
  shabDate: string | null
  deleteDate: string | null
  cantonalExcerptWeb: string  // URL extrait RC officiel
}

interface SearchOptions {
  activeOnly?: boolean        // défaut false (on veut voir radiées pour audit)
  maxEntries?: number         // défaut 10
  offset?: number             // défaut 0
}

/** Strip suffixes commerciaux d'un nom (SA, S.A., Sàrl, AG, GmbH, Ltd, SAS, EURL, SARL, SNC). */
function stripCompanySuffixes(name: string): string {
  return name
    .replace(/\b(SA|S\.A\.|Sàrl|S\.à\.r\.l\.|AG|GmbH|Ltd|SAS|EURL|SARL|SNC|S\.A\.S\.)\b\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Appel HTTP brut de l'API Zefix (404 = no result, 200 = list). */
async function fetchZefixSearch(name: string, activeOnly: boolean, maxEntries: number, offset: number): Promise<ZefixHit[] | null> {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch(`${ZEFIX_BASE}/firm/search.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ name, activeOnly, maxEntries, offset }),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (res.status === 404) return []  // Zefix : 404 = NORESULT
    if (!res.ok) {
      console.warn('[zefix] search HTTP', res.status, 'for', name)
      return null  // erreur réelle
    }
    const json: any = await res.json()
    return Array.isArray(json?.list) ? (json.list as ZefixHit[]) : []
  } catch (e: any) {
    console.warn('[zefix] search error', e?.message || e, 'for', name)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Recherche sur Zefix avec retry intelligent (sans auth).
 *  Fallback automatique : si 0 résultats avec le nom complet, retente sans suffixes
 *  commerciaux (SA/Sàrl/AG…) car Zefix ne match pas "SA" ↔ "S.A.". */
export async function searchZefix(name: string, opts: SearchOptions = {}): Promise<ZefixHit[]> {
  const cleanName = (name || '').trim()
  if (!cleanName) return []

  const activeOnly = opts.activeOnly ?? false
  const maxEntries = opts.maxEntries ?? 10
  const offset = opts.offset ?? 0

  // Tentative 1 : nom tel quel
  const first = await fetchZefixSearch(cleanName, activeOnly, maxEntries, offset)
  if (first === null) return []  // erreur HTTP réelle
  if (first.length > 0) return first

  // Tentative 2 : sans suffixes commerciaux
  const stripped = stripCompanySuffixes(cleanName)
  if (stripped && stripped.length >= 3 && stripped !== cleanName) {
    const second = await fetchZefixSearch(stripped, activeOnly, maxEntries, offset)
    if (second && second.length > 0) return second
  }

  return []
}

/** Normalise nom entreprise pour matching fuzzy. */
export function normalizeCompanyName(s: string): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
    .replace(/\b(sa|s\.a\.|sarl|s\.a\.r\.l\.|sàrl|ag|gmbh|ltd|llc|sas|eurl|snc|kg|kollektivgesellschaft|aktiengesellschaft)\b/gi, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distance Levenshtein (itérative, mémoire 2 lignes). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array(b.length + 1)
  let curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    [prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/** Score 0-100 entre 2 noms d'entreprise (après normalisation). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeCompanyName(a)
  const nb = normalizeCompanyName(b)
  if (!na || !nb) return 0
  if (na === nb) return 100

  // Containment : un nom contient l'autre = très fort signal (succursale, raison sociale longue)
  if (na.includes(nb) || nb.includes(na)) {
    const longer = Math.max(na.length, nb.length)
    const shorter = Math.min(na.length, nb.length)
    return Math.round(85 + (shorter / longer) * 10)  // 85-95 selon ratio
  }

  // Levenshtein normalisé
  const dist = levenshtein(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  const ratio = 1 - dist / maxLen
  return Math.round(ratio * 100)
}

/** Sémantique du status RC. */
export function interpretStatus(status: ZefixStatus): { isActive: boolean; isDissolved: boolean; isLiquidating: boolean; label: string } {
  switch (status) {
    case 'EXISTIEREND':
      return { isActive: true, isDissolved: false, isLiquidating: false, label: 'Actif' }
    case 'AUFGELOEST':
      return { isActive: false, isDissolved: false, isLiquidating: true, label: 'En liquidation' }
    case 'GELOESCHT':
      return { isActive: false, isDissolved: true, isLiquidating: false, label: 'Radié' }
    default:
      return { isActive: false, isDissolved: false, isLiquidating: false, label: status || 'Inconnu' }
  }
}

/** Réduit un hit Zefix à la forme exposée à l'API client. */
export interface ZefixSearchItem {
  name: string
  uid: string                 // CHE-XXX.XXX.XXX
  legalSeat: string
  status: ZefixStatus
  statusLabel: string
  isActive: boolean
  isDissolved: boolean
  isLiquidating: boolean
  cantonalExcerptUrl: string
  legalFormId: number
  similarity: number          // vs query (0-100)
  alreadyInTalentflow?: { id: string; nom_entreprise: string } | null
}

export function toSearchItem(hit: ZefixHit, query: string): ZefixSearchItem {
  const sem = interpretStatus(hit.status)
  return {
    name: hit.name,
    uid: hit.uidFormatted,
    legalSeat: hit.legalSeat || '',
    status: hit.status,
    statusLabel: sem.label,
    isActive: sem.isActive,
    isDissolved: sem.isDissolved,
    isLiquidating: sem.isLiquidating,
    cantonalExcerptUrl: hit.cantonalExcerptWeb || '',
    legalFormId: hit.legalFormId,
    similarity: nameSimilarity(query, hit.name),
  }
}
