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

// v1.9.19 — égalité stricte sur mots unaccent (plus d'includes/subset).
// Élimine les faux matches type "Andre" ⊂ "Andres", "Ana" ⊂ "Anais", "Luis" ⊂ "Luisa".
// Un candidat doit partager un mot COMPLET pour être considéré compatible.
const wordsOverlapExact = (a: string[], b: string[]): boolean => {
  if (a.length === 0 || b.length === 0) return false
  return a.some(wa => b.includes(wa))
}

// Compare deux DDN (string ISO ou DD/MM/YYYY) — retourne true si identiques après normalisation,
// false si différentes, null si l'une des deux est manquante/non-comparable.
const ddnCompareStrict = (a: string | null | undefined, b: string | null | undefined): boolean | null => {
  const norm = (d: string | null | undefined): string | null => {
    if (!d) return null
    const s = String(d).trim()
    if (!s) return null
    // ISO YYYY-MM-DD
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    // DD/MM/YYYY ou DD.MM.YYYY
    const dmy = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/)
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
    // Année seule → non comparable
    if (/^\d{4}$/.test(s)) return null
    return null
  }
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return null
  return na === nb
}

// Sous-ensemble bidirectionnel : TOUS les mots de a sont dans b, OU tous les mots de b sont dans a
// Comparaison par égalité stricte (pas de substring) pour éviter "jos" ⊂ "jose"
const isSubsetEither = (a: string[], b: string[]): boolean => {
  if (a.length === 0 || b.length === 0) return false
  const aInB = a.every(wa => b.includes(wa))
  if (aInB) return true
  const bInA = b.every(wb => a.includes(wb))
  return bInA
}

// Filtre strict nom+prénom (v1.9.15) :
// - Les MOTS de l'identité input doivent être un sous-ensemble de l'identité DB combinée (nom+prénom),
//   ou inversement. Tolère l'inversion nom↔prénom et les noms portugais/espagnols composés,
//   mais rejette les "Jose X" vs "Jose Y" (bug Jo26) où un seul prénom commun suffisait.
const strictNomPrenomMatch = (input: CandidatMatchInput, c: any): boolean => {
  const iNom = wordsOf(input.nom || '')
  const iPrenom = wordsOf(input.prenom || '')
  const cNom = wordsOf(c.nom || '')
  const cPrenom = wordsOf(c.prenom || '')
  if (iNom.length === 0 || iPrenom.length === 0) return false
  if (cNom.length === 0 && cPrenom.length === 0) return false

  // On teste l'identité combinée pour tolérer les inversions et les noms composés split
  // entre nom/prenom DB différemment de l'input.
  const iCombined = Array.from(new Set([...iNom, ...iPrenom]))
  const cCombined = Array.from(new Set([...cNom, ...cPrenom]))

  // 1. Sous-ensemble bidirectionnel sur l'identité complète
  //    (ex: "Martínez / José Luis Monreal" ↔ "Monreal Martínez / José Luis")
  if (!isSubsetEither(iCombined, cCombined)) return false

  // 2. Vérif finale : chaque moitié input (nom puis prénom) doit être entièrement présente
  //    dans l'identité DB combinée. Cela rejette le cas où seulement 1 mot commun survit.
  const nomOk = iNom.every(w => cCombined.includes(w))
  const prenomOk = iPrenom.every(w => cCombined.includes(w))
  return nomOk && prenomOk
}

// Compatibilité "partielle" — utilisée quand on matche par email/tel et qu'on a UNE moitié d'identité
// v1.9.19 — égalité stricte sur mots (wordsOverlapExact) : plus de "Andre ⊂ Andres"
const partialIdentityCompatible = (input: CandidatMatchInput, c: any): boolean => {
  const iNom = unaccent(input.nom || '')
  const iPrenom = unaccent(input.prenom || '')
  const cNom = unaccent(c.nom || '')
  const cPrenom = unaccent(c.prenom || '')

  // Si rien en DB → on ne peut rien valider, on rejette
  if (!cNom && !cPrenom) return false

  // Cas 1 : on a un nom extrait → doit matcher au moins un mot COMPLET dans nom OU prenom DB
  if (iNom) {
    const iNomWords = wordsOf(iNom)
    const combined = `${cNom} ${cPrenom}`
    const cCombinedWords = wordsOf(combined)
    if (wordsOverlapExact(iNomWords, cCombinedWords)) return true
    // Pas de nom extrait qui matche → rejet
    return false
  }

  // Cas 2 : on a seulement un prénom → doit matcher au moins un mot COMPLET dans prenom OU nom DB
  if (iPrenom) {
    const iPrenomWords = wordsOf(iPrenom)
    const combined = `${cNom} ${cPrenom}`
    const cCombinedWords = wordsOf(combined)
    return wordsOverlapExact(iPrenomWords, cCombinedWords)
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
      // v1.9.19 CORRECTIF 1 — fail-safe DDN : la DDN est immutable. Si les deux DDN sont
      // renseignées et DIFFÉRENTES → ce sont 2 personnes distinctes, même nom+prénom.
      // (Bug edb7a8f3 : "Rodrigues André" Lausanne DDN 16/12/1985 écrasé par CV André Rodrigues
      //  Champéry DDN 10/02/1984 — même identité, DDN contradictoires → 2 personnes.)
      const ddnCheck = ddnCompareStrict(input.date_naissance, c.date_naissance)
      if (ddnCheck === false) return { kind: 'none' }
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
      if (byTel) {
        // v1.9.19 CORRECTIF 1 — fail-safe DDN aussi sur désambiguïsation tel
        const ddnCheck = ddnCompareStrict(input.date_naissance, byTel.date_naissance)
        if (ddnCheck === false) return { kind: 'none' }
        return { kind: 'match', candidat: byTel, reason: 'nom_prenom_tel', diffs: [] }
      }
    }
    if (input.date_naissance) {
      const target = input.date_naissance.slice(0, 10)
      const byDdn = candidates.find(c => c.date_naissance && String(c.date_naissance).slice(0, 10) === target)
      if (byDdn) return { kind: 'match', candidat: byDdn, reason: 'nom_prenom_ddn', diffs: [] }
    }

    // Fail-safe : si l'input contient un signal fort (email/tel/DDN) et qu'AUCUN
    // des homonymes candidats ne matche ce signal → ce ne sont pas les bons homonymes,
    // on renvoie 'none' pour autoriser la création d'un nouveau candidat (bug Jo26).
    const hasStrongSignal = hasEmail || hasTelValid || !!input.date_naissance
    if (hasStrongSignal) return { kind: 'none' }
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
      // v1.9.19 CORRECTIF 3 — collision tel9 seule ne suffit PLUS. On exige :
      //   (a) strictNomPrenomMatch (identité complète et cohérente), OU
      //   (b) DDN identique (signal fort alternatif)
      // Le tel peut être partagé (couple, famille, coloc) → nom-différent + tel-partagé ≠ même personne.
      // (Bug 5b25b055 : CV "Rodrigues André" tel9=794258097 matché à "Rodriguez Verdugo Andrés" tel9=794258097
      //  alors que nom+prénom sont différents — ne doit plus arriver.)
      const compatible = byTel.find((c: any) => {
        if (!partialIdentityCompatible(input, c)) return false
        if (strictNomPrenomMatch(input, c)) return true
        if (ddnCompareStrict(input.date_naissance, c.date_naissance) === true) return true
        return false
      })
      if (compatible) {
        // Fail-safe DDN aussi ici
        const ddnCheck = ddnCompareStrict(input.date_naissance, compatible.date_naissance)
        if (ddnCheck === false) return { kind: 'none' }
        return { kind: 'match', candidat: compatible, reason: 'tel_identite_partielle', diffs: computeDiffs(compatible, input) }
      }
    }
  }

  // Identité incomplète + aucun email/tel exploitable → rien trouvé
  // (le consommateur décide : créer nouveau candidat ou rejeter selon le contexte)
  return { kind: 'none' }
}
