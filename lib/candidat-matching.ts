// lib/candidat-matching.ts
// v1.9.22 — Présélection durcie : Pass 1 AND + Pass 2 OR complément + signal fort parallèle
// v1.9.20 — Refonte IDENTITÉ-FIRST ÉLARGIE + scoring 3 niveaux
//
// Règle définitive : on ne matche JAMAIS sans similarité de nom, mais on tolère
// les variations (accents, ordre nom/prénom, sous-ensemble de tokens).
//
// Pipeline :
//   1. Présélection DB en 3 requêtes parallèles (v1.9.22) :
//      - Pass 1 : AND de TOUS les tokens nom+prénom (chaque token ilike nom OU prenom)
//                 → top 50 ORDER BY created_at DESC
//      - Pass 2 (si Pass 1 < 50) : OR de chaque token → complément jusqu'à 50
//      - Signal fort : email ou DDN exacts → top 20 ORDER BY created_at DESC
//      Merge dedup par id. Fix le bug v1.9.21 où un token trop commun (Gomes, 99 rows)
//      éjectait la vraie fiche hors du LIMIT 50.
//   2. Early reject : DDN contradictoire (les 2 renseignées et différentes) → exclu.
//   3. Scoring par candidat restant :
//        DDN match          = +10
//        tel9 match         = +8
//        email match        = +8
//        strict_nom_exact   = +5  (tokens identiques à l'ensemble près)
//        strict_nom_subset  = +3  (tokens du plus court ⊂ plus long, diff ≤ 2)
//        ville match        = +3  (unaccent lower strict)
//   4. Seuils différenciés :
//        strict_exact  → score ≥ 5   (accepte nom-seul si tokens exactement égaux)
//        strict_subset → score ≥ 11  (exige +1 signal fort OU DDN)
//        no_strict     → score ≥ 16  (exige 2 signaux forts : DDN+tel, DDN+email, tel+email)
//   5. Meilleur score gagne. En cas d'ex-aequo : DDN > tel > email > ordre id.
//
// Fin de kind:'ambiguous' — tout ce qui n'est pas un match clair devient kind:'none'
// et laisse le consommateur créer un nouveau candidat. Les doublons suspects sont
// détectés après coup via /parametres/doublons (script dédié, pas le pipeline import).
//
// Disparition des branches tel_identite_partielle / email_identite_partielle /
// partialIdentityCompatible : un email ou un tel sans identité nominale ne suffit
// plus JAMAIS à matcher (tel partagé couple/famille, email générique, etc.).

export type CandidatMatchInput = {
  nom?: string | null
  prenom?: string | null
  email?: string | null
  telephone?: string | null
  date_naissance?: string | null
  localisation?: string | null
}

export type CoordDiff = { field: 'email' | 'telephone' | 'date_naissance'; from: string | null; to: string | null }

export type MatchScoreBreakdown = {
  score: number
  ddnMatch: boolean
  telMatch: boolean
  emailMatch: boolean
  strictExact: boolean
  strictSubset: boolean
  villeMatch: boolean
}

export type CandidatMatchResult =
  | { kind: 'match'; candidat: any; reason: string; diffs: CoordDiff[]; scoreBreakdown: MatchScoreBreakdown }
  | { kind: 'none' }
  | { kind: 'insufficient'; reason: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

export const unaccent = (s: string | null | undefined): string =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export const normalizeTel = (t: string | null | undefined): string =>
  (t || '').replace(/\D/g, '')

export const tel9 = (t: string | null | undefined): string => {
  const d = normalizeTel(t)
  return d.length >= 9 ? d.slice(-9) : ''
}

// Tokens nom+prenom unaccent lowercase, ≥3 chars, set (pas de doublon)
const tokensOfIdentity = (nom: string | null | undefined, prenom: string | null | undefined): string[] => {
  const raw = `${nom || ''} ${prenom || ''}`
  const toks = unaccent(raw).split(/[^a-z0-9]+/).filter(w => w.length >= 3)
  return Array.from(new Set(toks))
}

// Normalisation DDN → 'YYYY-MM-DD' ou null si non-comparable (année seule, vide, format inconnu)
const normDdn = (d: string | null | undefined): string | null => {
  if (!d) return null
  const s = String(d).trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null // année seule ou format inconnu → non-comparable
}

// Retourne true si identiques, false si différentes, null si l'une est non-comparable
const ddnCompare = (a: string | null | undefined, b: string | null | undefined): boolean | null => {
  const na = normDdn(a)
  const nb = normDdn(b)
  if (!na || !nb) return null
  return na === nb
}

// strict_nom_exact : l'ensemble des tokens est identique (après dédup + sort),
// peu importe l'ordre / la répartition nom↔prenom.
// Exemples match : "Mendes Fabio" / "Mendes Fábio" (accent) ; "Seare Andemichael" / "Andemichael Seare".
const strictNomExact = (input: CandidatMatchInput, c: any): boolean => {
  const i = tokensOfIdentity(input.nom, input.prenom).sort()
  const cc = tokensOfIdentity(c.nom, c.prenom).sort()
  if (i.length === 0 || cc.length === 0) return false
  if (i.length !== cc.length) return false
  return i.every((t, idx) => t === cc[idx])
}

// strict_nom_subset : tokens du plus court entièrement inclus dans le plus long,
// ET différence ≤ 2 tokens (garde-fou contre les inclusions fortuites dans noms composés).
// Exemples match : "Dos Santos Francisco Jorge" / "Dos Santos Ramalho Francisco Jorge" (+1 token).
// Exemples rejet : "Ferreira Miguel" / "Ferreira Da Silva Ricardo Miguel" (+3 tokens).
const strictNomSubset = (input: CandidatMatchInput, c: any): boolean => {
  const i = tokensOfIdentity(input.nom, input.prenom)
  const cc = tokensOfIdentity(c.nom, c.prenom)
  if (i.length === 0 || cc.length === 0) return false
  if (i.length === cc.length && i.every(t => cc.includes(t))) return false // c'est exact, pas subset
  const [small, large] = i.length <= cc.length ? [i, cc] : [cc, i]
  if (large.length - small.length > 2) return false
  return small.every(t => large.includes(t))
}

// Normalisation ville : unaccent lower strict + trim. On extrait avant virgule
// pour gérer "Champéry, Suisse" vs "Champéry", et avant code postal "1933 Sembrancher".
const normVille = (v: string | null | undefined): string | null => {
  if (!v) return null
  let s = unaccent(String(v))
  // Retirer codes postaux 4 chiffres (position variable)
  s = s.replace(/\b\d{4}\b/g, ' ')
  // Garder la première partie avant virgule
  const comma = s.indexOf(',')
  if (comma > 0) s = s.slice(0, comma)
  s = s.trim().replace(/\s+/g, ' ')
  return s.length > 1 ? s : null
}

const normEmail = (e: string | null | undefined): string | null => {
  if (!e) return null
  const s = e.toLowerCase().trim()
  return s.includes('@') ? s : null
}

// Diffs coordonnées entre input et DB (pour log update silencieux)
const computeDiffs = (c: any, input: CandidatMatchInput): CoordDiff[] => {
  const diffs: CoordDiff[] = []
  if (input.email && c.email && input.email.toLowerCase() !== c.email.toLowerCase()) {
    diffs.push({ field: 'email', from: c.email, to: input.email })
  }
  if (input.telephone && c.telephone && tel9(input.telephone) !== tel9(c.telephone)) {
    diffs.push({ field: 'telephone', from: c.telephone, to: input.telephone })
  }
  if (input.date_naissance && c.date_naissance && normDdn(input.date_naissance) !== normDdn(String(c.date_naissance))) {
    diffs.push({ field: 'date_naissance', from: String(c.date_naissance), to: input.date_naissance })
  }
  return diffs
}

// ── Scoring individuel ────────────────────────────────────────────────────────

type ScoreDetail = {
  candidat: any
  score: number
  ddnMatch: boolean
  telMatch: boolean
  emailMatch: boolean
  strictExact: boolean
  strictSubset: boolean
  villeMatch: boolean
  reason: string
}

const scoreCandidat = (input: CandidatMatchInput, c: any): ScoreDetail | null => {
  // Early reject DDN contradictoire
  if (ddnCompare(input.date_naissance, c.date_naissance) === false) return null

  const ddnMatch = ddnCompare(input.date_naissance, c.date_naissance) === true
  const telMatch = tel9(input.telephone).length === 9 && tel9(input.telephone) === tel9(c.telephone)
  const emailMatch = !!normEmail(input.email) && normEmail(input.email) === normEmail(c.email)
  const strictExact = strictNomExact(input, c)
  const strictSubset = !strictExact && strictNomSubset(input, c)
  const villeMatch =
    !!normVille(input.localisation) && normVille(input.localisation) === normVille(c.localisation)

  let score = 0
  if (ddnMatch) score += 10
  if (telMatch) score += 8
  if (emailMatch) score += 8
  if (strictExact) score += 5
  else if (strictSubset) score += 3
  if (villeMatch) score += 3

  // Reason label pour traçabilité
  let reason = 'score'
  if (strictExact && ddnMatch) reason = 'nom_exact_ddn'
  else if (strictExact && telMatch) reason = 'nom_exact_tel'
  else if (strictExact && emailMatch) reason = 'nom_exact_email'
  else if (strictExact) reason = 'nom_exact'
  else if (strictSubset && ddnMatch) reason = 'nom_subset_ddn'
  else if (strictSubset && telMatch) reason = 'nom_subset_tel'
  else if (strictSubset && emailMatch) reason = 'nom_subset_email'
  else if (ddnMatch && telMatch) reason = 'ddn_tel'
  else if (ddnMatch && emailMatch) reason = 'ddn_email'
  else if (telMatch && emailMatch) reason = 'tel_email'

  return { candidat: c, score, ddnMatch, telMatch, emailMatch, strictExact, strictSubset, villeMatch, reason }
}

const passesThreshold = (d: ScoreDetail): boolean => {
  // v1.9.27 — strictExact seuil 5→8. strictExact SEUL (score 5) fusionnait 2 homonymes
  // distincts (ex: "Daniel Costa" ≠ "Daniel Fragoso Costa" tronqué par l'IA).
  // Nouveau seuil 8 exige strictExact (+5) ET au moins ville (+3) ou un signal fort
  // (DDN +10 / tel +8 / email +8). Simulation 6086 candidats : 5 perdus sur 8, dont
  // 4 faux positifs confirmés (Fabio Mendes vs Fábio Mendes, Tiago Silva ×2, etc.).
  if (d.strictExact) return d.score >= 8
  if (d.strictSubset) return d.score >= 11
  return d.score >= 16
}

// Départage ex-aequo : DDN > tel > email > id (déterminisme)
const tiebreak = (a: ScoreDetail, b: ScoreDetail): number => {
  if (a.score !== b.score) return b.score - a.score
  if (a.ddnMatch !== b.ddnMatch) return a.ddnMatch ? -1 : 1
  if (a.telMatch !== b.telMatch) return a.telMatch ? -1 : 1
  if (a.emailMatch !== b.emailMatch) return a.emailMatch ? -1 : 1
  return String(a.candidat.id).localeCompare(String(b.candidat.id))
}

// ── Fonction principale ───────────────────────────────────────────────────────

export async function findExistingCandidat(
  supabase: any,
  input: CandidatMatchInput,
  opts?: { selectColumns?: string; attachmentMode?: boolean }
): Promise<CandidatMatchResult> {
  const cols =
    opts?.selectColumns ||
    'id, nom, prenom, email, telephone, date_naissance, localisation, titre_poste'

  const hasNom = !!(input.nom || '').trim()
  const hasPrenom = !!(input.prenom || '').trim()

  // Identité incomplète → on ne tente rien, création autorisée en aval.
  // (v1.9.20 : fin du fallback email/tel sans nom. Le tel peut être partagé,
  // l'email peut être générique. Sans nom, trop dangereux.)
  if (!hasNom || !hasPrenom) {
    return {
      kind: 'insufficient',
      reason: 'Identité incomplète (nom ET prénom requis pour matcher)',
    }
  }

  // ── Étape 1 : présélection en 3 requêtes parallèles (v1.9.22) ──
  const iTokens = tokensOfIdentity(input.nom, input.prenom)
  if (iTokens.length === 0) {
    return { kind: 'insufficient', reason: 'Aucun token identité ≥3 chars' }
  }

  // Pass 1 : AND de TOUS les tokens (chaîne de .or() = AND de chaque groupe)
  //   supabase-js combine plusieurs .or() par AND → `(nom.ilike.%A% OR prenom.ilike.%A%) AND (nom.ilike.%B% OR prenom.ilike.%B%)`
  let pass1Builder = supabase.from('candidats').select(cols)
  for (const t of iTokens) {
    pass1Builder = pass1Builder.or(`nom.ilike.%${t}%,prenom.ilike.%${t}%`)
  }
  const pass1Promise = pass1Builder.order('created_at', { ascending: false }).limit(50)

  // Signal fort en parallèle : email (ilike case-insensitive) ou DDN exact.
  //   Tel9 exclu : format stocké variable (espaces, +41...) → pas de match fiable
  //   en SQL sans migration. Pass 1 + scoring post-scoring couvrent les cas tel.
  const emailN = normEmail(input.email)
  const ddnRaw = (input.date_naissance || '').trim()
  const signalClauses: string[] = []
  if (emailN) signalClauses.push(`email.ilike.${emailN}`)
  if (ddnRaw) signalClauses.push(`date_naissance.eq.${ddnRaw}`)
  const signalPromise = signalClauses.length > 0
    ? supabase.from('candidats').select(cols).or(signalClauses.join(',')).order('created_at', { ascending: false }).limit(20)
    : Promise.resolve({ data: [] as any[] })

  const [pass1Res, signalRes] = await Promise.all([pass1Promise, signalPromise])
  const pool = new Map<string, any>()
  for (const c of (pass1Res.data as any[]) || []) pool.set(c.id, c)

  // Pass 2 : si Pass 1 < 50, OR complément pour atteindre 50
  if (pool.size < 50) {
    const orClauses = iTokens.map(t => `nom.ilike.%${t}%,prenom.ilike.%${t}%`).join(',')
    const { data: pass2Rows } = await supabase
      .from('candidats')
      .select(cols)
      .or(orClauses)
      .order('created_at', { ascending: false })
      .limit(50)
    for (const c of (pass2Rows as any[]) || []) {
      if (pool.size >= 50) break
      if (!pool.has(c.id)) pool.set(c.id, c)
    }
  }

  // Merge signal fort (peut ajouter jusqu'à 20 candidats si ids nouveaux)
  for (const c of (signalRes.data as any[]) || []) pool.set(c.id, c)

  const candidates: any[] = Array.from(pool.values())
  if (candidates.length === 0) return { kind: 'none' }

  // ── Étape 2 + 3 : scoring individuel + early reject DDN contradictoire ──
  const scored: ScoreDetail[] = []
  for (const c of candidates) {
    const s = scoreCandidat(input, c)
    if (s) scored.push(s)
  }

  // ── Étape 4 : filtre seuil différencié ──
  // v1.9.27 — attachmentMode : seuil relâché pour rattacher un document non-CV à un
  // candidat existant. Le CV a pu être importé avec un nom tronqué (ex: "Costa" au
  // lieu de "Fragoso Costa"), les certificats extraient le nom complet et n'ont
  // pas d'autres signaux (DDN/tel/email absents). Accepte strictExact|strictSubset
  // à score ≥ 3 MAIS exige qu'un SEUL candidat passe le filtre (pas d'ambiguïté).
  const threshold = opts?.attachmentMode
    ? (d: ScoreDetail) => (d.strictExact || d.strictSubset) && d.score >= 3
    : passesThreshold
  const kept = scored.filter(threshold)
  if (kept.length === 0) return { kind: 'none' }
  if (opts?.attachmentMode && kept.length > 1) return { kind: 'none' }

  // ── Étape 5 : meilleur match après tiebreak ──
  kept.sort(tiebreak)
  const winner = kept[0]

  return {
    kind: 'match',
    candidat: winner.candidat,
    reason: winner.reason,
    diffs: computeDiffs(winner.candidat, input),
    scoreBreakdown: {
      score: winner.score,
      ddnMatch: winner.ddnMatch,
      telMatch: winner.telMatch,
      emailMatch: winner.emailMatch,
      strictExact: winner.strictExact,
      strictSubset: winner.strictSubset,
      villeMatch: winner.villeMatch,
    },
  }
}

// ── Exports internes pour tests / outils diagnostics ──
export const _internal = {
  tokensOfIdentity,
  strictNomExact,
  strictNomSubset,
  normDdn,
  ddnCompare,
  normVille,
  normEmail,
  scoreCandidat,
  passesThreshold,
}
