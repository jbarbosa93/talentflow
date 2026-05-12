// TalentFlow Compliance — Détection chauffeur
// v2.5.0
//
// Q1 (b) : match par nom de métier (pas par catégorie entière → évite Logisticien/Concierge en faux positifs).
// Q2 (b) : source = pipeline_metier || titre_poste (fallback CV).
// Override manuel via candidats.is_driver_override (TRUE/FALSE/NULL).

const DRIVER_METIERS = new Set([
  'Chauffeur PL',
])

const DRIVER_PATTERN = /chauffeur/i

export function isDriverFromMetier(metier: string | null | undefined): boolean {
  if (!metier) return false
  if (DRIVER_METIERS.has(metier.trim())) return true
  return DRIVER_PATTERN.test(metier)
}

export interface DriverDetectionInput {
  pipeline_metier?: string | null
  titre_poste?: string | null
  is_driver_override?: boolean | null
}

export function isDriver(c: DriverDetectionInput): boolean {
  if (c.is_driver_override === true) return true
  if (c.is_driver_override === false) return false
  return isDriverFromMetier(c.pipeline_metier) || isDriverFromMetier(c.titre_poste)
}

export function resolveCandidatMetier(c: DriverDetectionInput): string {
  return (c.pipeline_metier?.trim() || c.titre_poste?.trim() || '')
}
