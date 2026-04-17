// lib/candidat-matching.ts
// Moteur unifié de détection de candidat existant lors d'un import CV/document.
// Règle principale : IDENTITÉ (nom + prénom) d'abord, email/tel/DDN servent de confirmation
// ou de désambiguïsation en cas d'homonymes — JAMAIS pour matcher seul un candidat.
//
// Contexte métier :
// - Scénario couple : même email/tel partagés, noms différents → personnes distinctes
// - Scénario homonyme parfait : même nom+prenom avec coordonnées différentes → on update
//   silencieusement et on logge le changement de coordonnées (vraie détection via /parametres/doublons)
//
// Aucune référence au nom de fichier n'est utilisée — tout vient du contenu extrait par IA.

export type CandidatMatchInput = {
  nom?: string | null
  prenom?: string | null
  email?: string | null
  telephone?: string | null
  date_naissance?: string | null
}

export type CoordDiff = { field: 'email' | 'telephone' | 'date_naissance'; from: string | null; to: string | null }

export type CandidatMatchResult =
  | { kind: 'match'; candidat: any; reason: string; diffs: CoordDiff[] }
  | { kind: 'ambiguous'; candidates: any[]; reason: string }
  | { kind: 'none' }
  | { kind: 'insufficient'; reason: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

export const unaccent = (s: string | null | undefined): string =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export const normalizeTel = (t: string | null | undefined): string =>
  (t || '').replace(/\D/g, '')

export const tel9 = (t: string | null | undefined): string => {
  const d = normalizeTel(t)
  return d.length >= 8 ? d.slice(-9) : ''
}

const wordsOf = (s: string, minLen = 3): string[] =>
  unaccent(s).split(/[\s-]+/).filter(w => w.length >= minLen)

// Deux listes de mots "matchent" si au moins un mot de chaque côté s'inclut dans l'autre
const wordsOverlap = (a: string[], b: string[]): boolean => {
  if (a.length === 0 || b.length === 0) return false
  return a.some(wa => b.some(wb => wa.includes(wb) || wb.includes(wa)))
}

// Filtre strict nom+prénom : les deux moitiés d'identité doivent overlapper
const strictNomPrenomMatch = (input: CandidatMatchInput, c: any): boolean => {
  const iNom = wordsOf(input.nom || '')
  const iPrenom = wordsOf(input.prenom || '')
  const cNom = wordsOf(c.nom || '')
  const cPrenom = wordsOf(c.prenom || '')
  if (iNom.length === 0 || iPrenom.length === 0) return false
  if (cNom.length === 0 || cPrenom.length === 0) return false

  // Nom doit matcher (bidirectionnel)
  if (!wordsOverlap(iNom, cNom)) {
    // Cas noms composés/inversés : le nom entier peut se retrouver dans nom+prenom DB concaténés
    const combined = wordsOf(`${c.nom || ''} ${c.prenom || ''}`)
    if (!wordsOverlap(iNom, combined)) return false
  }
  // Prénom doit matcher
  if (!wordsOverlap(iPrenom, cPrenom)) {
    const combined = wordsOf(`${c.nom || ''} ${c.prenom || ''}`)
    if (!wordsOverlap(iPrenom, combined)) return false
  }
  return true
}

// Compatibilité "partielle" — utilisée quand on matche par email/tel et qu'on a UNE moitié d'identité
const partialIdentityCompatible = (input: CandidatMatchInput, c: any): boolean => {
  const iNom = unaccent(input.nom || '')
  const iPrenom = unaccent(input.prenom || '')
  const cNom = unaccent(c.nom || '')
  const cPrenom = unaccent(c.prenom || '')

  // Si rien en DB → on ne peut rien valider, on rejette
  if (!cNom && !cPrenom) return false

  // Cas 1 : on a un nom extrait → doit matcher au moins dans nom OU prenom DB
  if (iNom) {
    const iNomWords = wordsOf(iNom)
    const combined = `${cNom} ${cPrenom}`
    const cCombinedWords = wordsOf(combined)
    if (wordsOverlap(iNomWords, cCombinedWords)) return true
    // Pas de nom extrait qui matche → rejet
    return false
  }

  // Cas 2 : on a seulement un prénom → doit matcher au moins dans prenom OU nom DB
  if (iPrenom) {
    const iPrenomWords = wordsOf(iPrenom)
    const combined = `${cNom} ${cPrenom}`
    const cCombinedWords = wordsOf(combined)
    return wordsOverlap(iPrenomWords, cCombinedWords)
  }

  return false
}

// Calcul des diffs de coordonnées entre input et DB (pour log update silencieux)
const computeDiffs = (c: any, input: CandidatMatchInput): CoordDiff[] => {
  const diffs: CoordDiff[] = []
  if (input.email && c.email && input.email.toLowerCase() !== c.email.toLowerCase()) {
    diffs.push({ field: 'email', from: c.email, to: input.email })
  }
  if (input.telephone && c.telephone && tel9(input.telephone) !== tel9(c.telephone)) {
    diffs.push({ field: 'telephone', from: c.telephone, to: input.telephone })
  }
  if (input.date_naissance && c.date_naissance && input.date_naissance.slice(0, 10) !== String(c.date_naissance).slice(0, 10)) {
    diffs.push({ field: 'date_naissance', from: String(c.date_naissance), to: input.date_naissance })
  }
  return diffs
}

// ── Fonction principale ───────────────────────────────────────────────────────

export async function findExistingCandidat(
  supabase: any,
  input: CandidatMatchInput,
  opts?: { selectColumns?: string }
): Promise<CandidatMatchResult> {
  const cols = opts?.selectColumns || 'id, nom, prenom, email, telephone, date_naissance, localisation, titre_poste'
  const hasNom = !!(input.nom || '').trim()
  const hasPrenom = !!(input.prenom || '').trim()
  const hasEmail = !!(input.email || '').trim()
  const hasTelValid = tel9(input.telephone).length === 9

  // ── Rien d'utilisable → insufficient ────────────────────────────────────────
  if (!hasNom && !hasPrenom && !hasEmail && !hasTelValid) {
    return { kind: 'insufficient', reason: 'Aucune identité ni coordonnée extraite du contenu' }
  }

  // ── Cas nominal : nom + prénom extraits (identité complète) ─────────────────
  if (hasNom && hasPrenom) {
    const nomWords = wordsOf(input.nom!)
    let query = supabase.from('candidats').select(cols)
    if (nomWords.length === 1) {
      query = query.ilike('nom', `%${nomWords[0]}%`)
    } else if (nomWords.length > 1) {
      const orClauses = nomWords.map(p => `nom.ilike.%${p}%,prenom.ilike.%${p}%`).join(',')
      query = query.or(orClauses)
    }
    const { data: rows } = await query.limit(30)
    const candidates: any[] = (rows || []).filter((c: any) => strictNomPrenomMatch(input, c))

    if (candidates.length === 0) return { kind: 'none' }

    if (candidates.length === 1) {
      const c = candidates[0]
      return { kind: 'match', candidat: c, reason: 'nom_prenom_exact', diffs: computeDiffs(c, input) }
    }

    // Désambiguïsation homonymes → email > tel > DDN
    if (hasEmail) {
      const byEmail = candidates.find(c => c.email && c.email.toLowerCase() === input.email!.toLowerCase())
      if (byEmail) return { kind: 'match', candidat: byEmail, reason: 'nom_prenom_email', diffs: [] }
    }
    if (hasTelValid) {
      const target = tel9(input.telephone)
      const byTel = candidates.find(c => tel9(c.telephone) === target)
      if (byTel) return { kind: 'match', candidat: byTel, reason: 'nom_prenom_tel', diffs: [] }
    }
    if (input.date_naissance) {
      const target = input.date_naissance.slice(0, 10)
      const byDdn = candidates.find(c => c.date_naissance && String(c.date_naissance).slice(0, 10) === target)
      if (byDdn) return { kind: 'match', candidat: byDdn, reason: 'nom_prenom_ddn', diffs: [] }
    }

    return { kind: 'ambiguous', candidates, reason: `Homonymes non résolus (${candidates.length} candidats)` }
  }

  // ── Identité incomplète : seul nom OU seul prénom → on essaie email/tel + validation partielle ──
  if (hasEmail) {
    const { data } = await supabase.from('candidats').select(cols).ilike('email', input.email!).limit(5)
    if (data && data.length > 0) {
      const compatible = data.find((c: any) => partialIdentityCompatible(input, c))
      if (compatible) return { kind: 'match', candidat: compatible, reason: 'email_identite_partielle', diffs: computeDiffs(compatible, input) }
    }
  }

  if (hasTelValid) {
    const target = tel9(input.telephone)
    // Optionnel : restreindre via un mot du nom pour limiter la requête
    let q = supabase.from('candidats').select(cols).not('telephone', 'is', null)
    if (hasNom) {
      const w = wordsOf(input.nom!)[0]
      if (w && w.length >= 4) q = q.ilike('nom', `%${w}%`)
    } else if (hasPrenom) {
      const w = wordsOf(input.prenom!)[0]
      if (w && w.length >= 4) q = q.ilike('prenom', `%${w}%`)
    }
    const { data } = await q.limit(200)
    if (data) {
      const byTel = data.filter((c: any) => tel9(c.telephone) === target)
      const compatible = byTel.find((c: any) => partialIdentityCompatible(input, c))
      if (compatible) return { kind: 'match', candidat: compatible, reason: 'tel_identite_partielle', diffs: computeDiffs(compatible, input) }
    }
  }

  // Identité incomplète + aucun email/tel exploitable → rien trouvé
  // (le consommateur décide : créer nouveau candidat ou rejeter selon le contexte)
  return { kind: 'none' }
}
