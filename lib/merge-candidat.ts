// lib/merge-candidat.ts
// Logique pure de merge intelligent entre une fiche candidat existante (DB)
// et les données extraites d'un nouveau CV importé.
//
// Règles (validées par João, mission nuit 18/04) :
//
// CHAMPS IMMUABLES (jamais écrasés) :
//   email, telephone, date_naissance, localisation
//   → si DB a déjà une valeur, on garde. Si DB null → on remplit avec CV.
//
// CHAMPS MERGE (union des listes) :
//   competences, langues, experiences, formations_details
//   → dédup intelligente (insensible à la casse + accents pour les strings,
//     par tuple unique pour les expériences/formations).
//
// CHAMPS ÉCRASÉS (toujours mis à jour depuis le nouveau CV) :
//   titre_poste, resume_ia, annees_exp, permis_conduire
//   → le nouveau CV représente l'état actuel, on prend sa valeur si non vide.
//
// CHAMPS IGNORÉS (jamais touchés par l'import) :
//   statut_pipeline, rating, tags, notes consultant
//   → gérés manuellement par le consultant, import ne touche JAMAIS.
//
// Cette fonction est PURE (pas d'I/O) — elle prend 2 objets et retourne
// le payload d'UPDATE. Testable directement.

type CVExperience = {
  poste: string
  entreprise: string
  periode: string
  description?: string
}

type CVFormation = {
  diplome: string
  etablissement: string
  annee: string
}

export type CandidatExisting = {
  email?: string | null
  telephone?: string | null
  date_naissance?: string | null
  localisation?: string | null
  competences?: string[] | null
  langues?: string[] | null
  experiences?: CVExperience[] | null
  formations_details?: CVFormation[] | null
  formation?: string | null
  titre_poste?: string | null
  resume_ia?: string | null
  annees_exp?: number | null
  permis_conduire?: boolean | null
  genre?: string | null
  linkedin?: string | null
}

export type CVAnalyseInput = {
  email?: string | null
  telephone?: string | null
  date_naissance?: string | null
  localisation?: string | null
  competences?: string[] | null
  langues?: string[] | null
  experiences?: CVExperience[] | null
  formations_details?: CVFormation[] | null
  formation?: string | null
  titre_poste?: string | null
  resume?: string | null
  annees_exp?: number | null
  permis_conduire?: boolean | null
  genre?: string | null
  linkedin?: string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const unaccent = (s: string): string =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

const isEmpty = (v: any): boolean =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0)

/** Union de 2 listes de strings avec dédup insensible casse/accents. */
function mergeStringList(existing: string[] | null | undefined, incoming: string[] | null | undefined): string[] {
  const existingArr = Array.isArray(existing) ? existing : []
  const incomingArr = Array.isArray(incoming) ? incoming : []
  if (existingArr.length === 0 && incomingArr.length === 0) return []

  const seen = new Set<string>()
  const result: string[] = []
  for (const item of [...existingArr, ...incomingArr]) {
    if (typeof item !== 'string' || !item.trim()) continue
    const key = unaccent(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item.trim())
  }
  return result.sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Dédup experiences par tuple (entreprise + poste + periode). */
function mergeExperiences(
  existing: CVExperience[] | null | undefined,
  incoming: CVExperience[] | null | undefined,
): CVExperience[] {
  const existingArr = Array.isArray(existing) ? existing : []
  const incomingArr = Array.isArray(incoming) ? incoming : []

  const seen = new Set<string>()
  const result: CVExperience[] = []
  // Garder l'ordre : DB d'abord, puis nouveaux du CV
  for (const exp of [...existingArr, ...incomingArr]) {
    if (!exp || typeof exp !== 'object') continue
    const key = `${unaccent(exp.entreprise || '')}|${unaccent(exp.poste || '')}|${unaccent(exp.periode || '')}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(exp)
  }
  return result
}

/** Dédup formations par tuple (diplome + etablissement + annee). */
function mergeFormations(
  existing: CVFormation[] | null | undefined,
  incoming: CVFormation[] | null | undefined,
): CVFormation[] {
  const existingArr = Array.isArray(existing) ? existing : []
  const incomingArr = Array.isArray(incoming) ? incoming : []

  const seen = new Set<string>()
  const result: CVFormation[] = []
  for (const f of [...existingArr, ...incomingArr]) {
    if (!f || typeof f !== 'object') continue
    const key = `${unaccent(f.diplome || '')}|${unaccent(f.etablissement || '')}|${unaccent(f.annee || '')}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(f)
  }
  return result
}

// ─── Fonction principale ──────────────────────────────────────────────────────

export type MergePayload = {
  // Immuables — seulement si vide en DB
  email?: string
  telephone?: string
  date_naissance?: string
  localisation?: string
  // Merge (arrays)
  competences?: string[]
  langues?: string[]
  experiences?: CVExperience[]
  formations_details?: CVFormation[]
  formation?: string
  // Écrasés si nouveau CV fournit une valeur
  titre_poste?: string
  resume_ia?: string | null
  annees_exp?: number
  permis_conduire?: boolean
  genre?: string | null
  linkedin?: string
}

export type MergeReport = {
  filledEmpty: string[]     // champs immuables remplis car vides en DB
  kept: string[]            // champs immuables préservés (divergence loggable)
  merged: string[]          // champs où merge a eu lieu (avec delta)
  replaced: string[]        // champs écrasés
  ignored: string[]         // champs non modifiés
  addedItems: Record<string, number>  // ex: { competences: 3, experiences: 1 }
}

/**
 * Calcule le payload d'UPDATE à appliquer sur un candidat existant,
 * en respectant les règles de merge intelligent.
 *
 * Ne retourne QUE les champs modifiés (pas les fields inchangés).
 */
export function mergeCandidat(
  existing: CandidatExisting,
  analyse: CVAnalyseInput,
): { payload: MergePayload; report: MergeReport } {
  const payload: MergePayload = {}
  const report: MergeReport = {
    filledEmpty: [],
    kept: [],
    merged: [],
    replaced: [],
    ignored: [],
    addedItems: {},
  }

  // ─── 1. Champs IMMUABLES — remplir seulement si vide ─────────────────────────
  const immutable = ['email', 'telephone', 'date_naissance', 'localisation'] as const
  for (const field of immutable) {
    const existingVal = existing[field]
    const newVal = analyse[field]
    if (!newVal) { report.ignored.push(field); continue }
    if (isEmpty(existingVal)) {
      ;(payload as any)[field] = newVal
      report.filledEmpty.push(field)
    } else if (existingVal !== newVal) {
      report.kept.push(field)  // divergence mais on garde l'existant
    } else {
      report.ignored.push(field)
    }
  }

  // ─── 2. Champs MERGE — union des listes ──────────────────────────────────────
  const mergedCompetences = mergeStringList(existing.competences, analyse.competences)
  if (mergedCompetences.length !== (existing.competences?.length || 0)) {
    payload.competences = mergedCompetences
    report.merged.push('competences')
    report.addedItems.competences = mergedCompetences.length - (existing.competences?.length || 0)
  }

  const mergedLangues = mergeStringList(existing.langues, analyse.langues)
  if (mergedLangues.length !== (existing.langues?.length || 0)) {
    payload.langues = mergedLangues
    report.merged.push('langues')
    report.addedItems.langues = mergedLangues.length - (existing.langues?.length || 0)
  }

  const mergedExperiences = mergeExperiences(existing.experiences, analyse.experiences)
  if (mergedExperiences.length !== (existing.experiences?.length || 0)) {
    payload.experiences = mergedExperiences
    report.merged.push('experiences')
    report.addedItems.experiences = mergedExperiences.length - (existing.experiences?.length || 0)
  }

  const mergedFormations = mergeFormations(existing.formations_details, analyse.formations_details)
  if (mergedFormations.length !== (existing.formations_details?.length || 0)) {
    payload.formations_details = mergedFormations
    report.merged.push('formations_details')
    report.addedItems.formations_details = mergedFormations.length - (existing.formations_details?.length || 0)
  }

  // ─── 3. Champs ÉCRASÉS — nouveau CV = state actuel ───────────────────────────
  // titre_poste : écrase si nouvelle valeur non vide
  if (!isEmpty(analyse.titre_poste) && analyse.titre_poste !== existing.titre_poste) {
    payload.titre_poste = analyse.titre_poste!
    report.replaced.push('titre_poste')
  }
  // formation (string résumé) : écrase si nouvelle valeur non vide
  if (!isEmpty(analyse.formation) && analyse.formation !== existing.formation) {
    payload.formation = analyse.formation!
    report.replaced.push('formation')
  }
  // resume_ia : écrase systématiquement car re-généré à chaque import
  if (!isEmpty(analyse.resume)) {
    payload.resume_ia = analyse.resume!
    if (analyse.resume !== existing.resume_ia) report.replaced.push('resume_ia')
  }
  // annees_exp : écrase si nouvelle valeur non nulle et différente
  if (typeof analyse.annees_exp === 'number' && analyse.annees_exp > 0 && analyse.annees_exp !== existing.annees_exp) {
    payload.annees_exp = analyse.annees_exp
    report.replaced.push('annees_exp')
  }
  // permis_conduire : écrase si la valeur est explicitement booléenne
  if (typeof analyse.permis_conduire === 'boolean' && analyse.permis_conduire !== existing.permis_conduire) {
    payload.permis_conduire = analyse.permis_conduire
    report.replaced.push('permis_conduire')
  }
  // genre : remplir si vide, sinon garder (évite l'écrasement d'une valeur humaine validée)
  if (!isEmpty(analyse.genre) && isEmpty(existing.genre)) {
    payload.genre = analyse.genre!
    report.filledEmpty.push('genre')
  }
  // linkedin : remplir si vide (comportement coord)
  if (!isEmpty(analyse.linkedin) && isEmpty(existing.linkedin)) {
    payload.linkedin = analyse.linkedin!
    report.filledEmpty.push('linkedin')
  }

  return { payload, report }
}

/**
 * Helper pour logger un merge report dans activites (traçabilité).
 */
export function mergeReportToText(report: MergeReport): string {
  const parts: string[] = []
  if (report.filledEmpty.length) parts.push(`remplis: ${report.filledEmpty.join(', ')}`)
  if (report.merged.length) {
    const mergeDetail = report.merged.map(f => `${f}(+${report.addedItems[f] || 0})`).join(', ')
    parts.push(`mergés: ${mergeDetail}`)
  }
  if (report.replaced.length) parts.push(`remplacés: ${report.replaced.join(', ')}`)
  if (report.kept.length) parts.push(`préservés (divergence): ${report.kept.join(', ')}`)
  return parts.join(' | ') || 'aucun changement'
}
