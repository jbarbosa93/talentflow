// lib/secteurs-extractor.ts
// v1.9.114 — Extraction secteurs d'activité depuis notes/secteur clients
//
// Source unique de vérité pour la taxonomie standardisée des secteurs
// d'activité des clients TalentFlow. Utilisée par :
// - Script batch scripts/batch/extract-secteurs-clients.ts (initial backfill)
// - PATCH /api/clients/[id] (maintien auto à chaque édition de notes)
// - UI /clients (filtre multi-select + badges sur cards + édition fiche)
//
// IMPORTANT : ne JAMAIS toucher à candidats.titre_poste ni clients.secteur (Zefix NOGA officiel).

/**
 * Liste fermée des 25 secteurs standardisés (taxonomie TalentFlow).
 * Toute valeur stockée dans clients.secteurs_activite DOIT venir de cette liste.
 *
 * Ordre = groupé par catégorie métier (Gros Œuvre → Second Œuvre → Technique
 * → Architecture → Logistique → Manutention → Nettoyage → Autres). Aligne
 * l'ordre des pills /clients sur les catégories définies dans /parametres/metiers.
 */
export const SECTEURS_ACTIVITE = [
  // Gros Œuvre
  'Maçonnerie',
  // Second Œuvre
  'Électricité',
  'Peinture',
  'Plâtrerie',
  'Sanitaire',
  'Chauffage',
  'Ventilation',
  'Menuiserie',
  'Charpente',
  'Ferblanterie',
  'Couverture',
  'Étanchéité',
  'Carrelage',
  'Paysagisme',
  // Technique
  'Serrurerie',
  'Soudure',
  'Tuyauterie',
  'Industrie',
  // Architecture
  'Architecture',
  'Ingénierie',
  // Transport - logistique
  'Logistique',
  // Manutention
  'Manutention',
  // Femmes - ouvrières + nettoyage
  'Nettoyage',
  // Hors catégories métier
  'Restauration',
  'Autres',
] as const

export type SecteurActivite = typeof SECTEURS_ACTIVITE[number]

/**
 * Mapping secteur → métier représentatif (pour récupérer la couleur via
 * useMetierCategories.getColorForMetier). Aligne les couleurs des pills
 * /clients sur celles définies dans /parametres/metiers.
 *
 * Les valeurs DOIVENT exister dans `app_settings.metier_categories[].metiers`
 * pour que getColorForMetier renvoie une couleur. Sinon fallback `--primary`.
 */
export const SECTEUR_REPRESENTATIVE_METIER: Record<SecteurActivite, string> = {
  'Électricité':  'Electricien',
  'Peinture':     'Peintre en bâtiments',
  'Plâtrerie':    'Plâtrier',
  'Sanitaire':    'Sanitaire',
  'Chauffage':    'Chauffagiste',
  'Ventilation':  'Ventiliste',
  'Maçonnerie':   'Maçon A',
  'Menuiserie':   'Menuisier',
  'Charpente':    'Charpentier',
  'Ferblanterie': 'Ferblantier + couvreur',
  'Couverture':   'Ferblantier + couvreur',
  'Étanchéité':   'Etancheur',
  'Carrelage':    'Carreleur',
  'Serrurerie':   'Serrurier',
  'Soudure':      'Soudeur',
  'Tuyauterie':   'Tuyauteur',
  'Paysagisme':   'Paysagiste',
  'Architecture': 'Architecte',
  'Ingénierie':   'Dessinateur en bâtiments',
  'Logistique':   'Logisticien',
  'Manutention':  'Manutentionnaire',
  'Industrie':    'Polymécanicien',
  'Restauration': '',
  'Nettoyage':    'Nettoyage',
  'Autres':       '',
}

/**
 * Normalise une chaîne pour matching insensible casse + accents.
 * Ex : "Plâtrerie" → "platrerie", "Électricité" → "electricite".
 */
function normalize(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics
    .toLowerCase()
}

/**
 * Règles de matching mot-clé → secteur standard (depuis notes libres).
 * Ordre = priorité (premier match dans la liste = appliqué).
 *
 * Le mot-clé est cherché via substring après normalisation, donc
 * "peintres", "peinture", "peintre" matchent tous "peintre".
 */
const RULES_NOTES: Array<{ keywords: string[]; secteur: SecteurActivite }> = [
  // Précis d'abord (plaquiste avant platrier, etc.)
  { keywords: ['plaquiste'],                                          secteur: 'Plâtrerie' },
  { keywords: ['platrier', 'platrerie', 'gypserie', 'gypsier'],       secteur: 'Plâtrerie' },
  { keywords: ['peintre', 'peinture'],                                secteur: 'Peinture' },
  { keywords: ['electricien', 'electricite'],                         secteur: 'Électricité' },
  { keywords: ['carreleur', 'carrelage'],                             secteur: 'Carrelage' },
  { keywords: ['menuisier', 'menuiserie', 'ebenist'],                 secteur: 'Menuiserie' },
  { keywords: ['charpentier', 'charpente'],                           secteur: 'Charpente' },
  { keywords: ['ferblantier', 'ferblanterie'],                        secteur: 'Ferblanterie' },
  { keywords: ['couvreur', 'couverture', 'toiture'],                  secteur: 'Couverture' },
  { keywords: ['etancheur', 'etancheite'],                            secteur: 'Étanchéité' },
  // Maçonnerie inclut grutier/ferrailleur/manœuvre/machiniste (tous gros œuvre)
  { keywords: ['macon', 'maconnerie', 'grutier', 'ferrailleur',
               'manouvre', 'manoeuvre', 'machiniste'],                secteur: 'Maçonnerie' },
  { keywords: ['serrurier', 'serrurerie'],                            secteur: 'Serrurerie' },
  { keywords: ['soudeur', 'soudure', 'chaudronn'],                    secteur: 'Soudure' },
  { keywords: ['tuyauteur', 'tuyauterie'],                            secteur: 'Tuyauterie' },
  { keywords: ['sprinkler'],                                          secteur: 'Tuyauterie' },
  { keywords: ['sanitaire', 'plombier', 'plomberie'],                 secteur: 'Sanitaire' },
  { keywords: ['ventilation', 'cvc', 'cvs', 'climatisation'],         secteur: 'Ventilation' },
  { keywords: ['chauffage', 'chauffagiste'],                          secteur: 'Chauffage' },
  { keywords: ['paysagiste', 'paysagisme', 'paysag', 'jardinier'],    secteur: 'Paysagisme' },
  { keywords: ['architecte', 'architecture'],                         secteur: 'Architecture' },
  { keywords: ['ingenieur', 'ingenierie'],                            secteur: 'Ingénierie' },
  { keywords: ['automaticien', 'automation'],                         secteur: 'Ingénierie' },
  // Logistique : transport routier
  { keywords: ['chauffeur', 'livreur', 'logistique', 'logisticien',
               'magasinier'],                                         secteur: 'Logistique' },
  { keywords: ['manutentionnaire'],                                   secteur: 'Manutention' },
  { keywords: ['operateur', 'industrie', 'industriel'],               secteur: 'Industrie' },
  { keywords: ['cuisinier', 'cuisine', 'restauration'],               secteur: 'Restauration' },
  { keywords: ['nettoyage', 'menage', 'femme de menage'],             secteur: 'Nettoyage' },
]

/**
 * Mappings spécifiques pour secteurs Zefix (NOGA) → secteurs standards.
 * Utilisés UNIQUEMENT en fallback si rien trouvé dans les notes.
 *
 * Couverture des top secteurs observés en DB.
 */
const RULES_NOGA: Array<{ pattern: string; secteurs: SecteurActivite[] }> = [
  { pattern: 'installation electrique',                        secteurs: ['Électricité'] },
  { pattern: 'production d\'electricite',                      secteurs: ['Électricité'] },
  { pattern: 'distribution d\'electricite',                    secteurs: ['Électricité'] },
  { pattern: 'installation d\'equipements sanitaires',         secteurs: ['Sanitaire', 'Chauffage'] },
  { pattern: 'installation d\'equipements de chauffage',       secteurs: ['Chauffage'] },
  { pattern: 'ventilation',                                    secteurs: ['Ventilation'] },
  { pattern: 'climatisation',                                  secteurs: ['Ventilation'] },
  { pattern: 'peinture et gypserie',                           secteurs: ['Peinture', 'Plâtrerie'] },
  { pattern: 'peinture',                                       secteurs: ['Peinture'] },
  { pattern: 'gypserie',                                       secteurs: ['Plâtrerie'] },
  { pattern: 'platrerie',                                      secteurs: ['Plâtrerie'] },
  { pattern: 'maconnerie',                                     secteurs: ['Maçonnerie'] },
  { pattern: 'menuiserie',                                     secteurs: ['Menuiserie'] },
  { pattern: 'travaux de ferblanterie',                        secteurs: ['Ferblanterie'] },
  { pattern: 'pose de carrelage',                              secteurs: ['Carrelage'] },
  { pattern: 'montage de charpentes',                          secteurs: ['Charpente'] },
  { pattern: 'travaux d\'etancheite',                          secteurs: ['Étanchéité'] },
  { pattern: 'serrurer',                                       secteurs: ['Serrurerie'] },
  { pattern: 'fabrication de structures metalliques',          secteurs: ['Soudure'] },
  { pattern: 'construction metallique',                        secteurs: ['Soudure'] },
  { pattern: 'pose de couvertures',                            secteurs: ['Couverture'] },
  { pattern: 'amenagement paysager',                           secteurs: ['Paysagisme'] },
  { pattern: 'paysage',                                        secteurs: ['Paysagisme'] },
  { pattern: 'bureaux d\'architectes',                         secteurs: ['Architecture'] },
  { pattern: 'bureaux d\'ingenieurs',                          secteurs: ['Ingénierie'] },
  { pattern: 'bureau technique',                               secteurs: ['Ingénierie'] },
  { pattern: 'ateliers mecaniques',                            secteurs: ['Soudure'] },
  { pattern: 'isolation thermique',                            secteurs: ['Plâtrerie'] },
  { pattern: 'transports routiers',                            secteurs: ['Logistique'] },
  { pattern: 'nettoyage courant',                              secteurs: ['Nettoyage'] },
  { pattern: 'travaux de demolition',                          secteurs: ['Maçonnerie'] },
  { pattern: 'montage d\'echafaudages',                        secteurs: ['Maçonnerie'] },
  { pattern: 'restauration',                                   secteurs: ['Restauration'] },
  { pattern: 'hopitaux',                                       secteurs: ['Nettoyage'] },
  { pattern: 'menuiseries',                                    secteurs: ['Menuiserie'] },
]

/**
 * Extrait les secteurs depuis un texte libre (notes).
 * Retourne un array dédupliqué dans l'ordre SECTEURS_ACTIVITE.
 */
function extractFromNotes(text: string): SecteurActivite[] {
  if (!text || !text.trim()) return []
  const norm = normalize(text)
  const found = new Set<SecteurActivite>()
  for (const rule of RULES_NOTES) {
    for (const kw of rule.keywords) {
      if (norm.includes(kw)) {
        found.add(rule.secteur)
        break
      }
    }
  }
  return SECTEURS_ACTIVITE.filter(s => found.has(s))
}

/**
 * Fallback : extrait depuis le secteur Zefix (NOGA) si notes vides.
 */
function extractFromNoga(secteur: string | null | undefined): SecteurActivite[] {
  if (!secteur || !secteur.trim()) return []
  const norm = normalize(secteur)
  const found = new Set<SecteurActivite>()
  for (const m of RULES_NOGA) {
    if (norm.includes(m.pattern)) {
      for (const s of m.secteurs) found.add(s)
    }
  }
  return SECTEURS_ACTIVITE.filter(s => found.has(s))
}

export interface ExtractResult {
  secteurs: SecteurActivite[]
  source: 'notes' | 'noga' | 'none'
}

/**
 * API principale — extraction depuis client (notes prioritaire, fallback NOGA Zefix).
 *
 * @param notes   - clients.notes (texte libre)
 * @param secteur - clients.secteur (libellé NOGA Zefix)
 * @returns { secteurs, source } — array de secteurs standards + source utilisée
 */
export function extractSecteursFromClient(
  notes: string | null | undefined,
  secteur: string | null | undefined
): ExtractResult {
  const fromNotes = extractFromNotes(notes || '')
  if (fromNotes.length > 0) return { secteurs: fromNotes, source: 'notes' }

  const fromNoga = extractFromNoga(secteur)
  if (fromNoga.length > 0) return { secteurs: fromNoga, source: 'noga' }

  return { secteurs: [], source: 'none' }
}

/**
 * Validation : retourne uniquement les valeurs présentes dans SECTEURS_ACTIVITE.
 * Utilisé pour filtrer les inputs UI/API avant écriture en DB.
 */
export function sanitizeSecteurs(input: unknown): SecteurActivite[] {
  if (!Array.isArray(input)) return []
  const set = new Set<string>(SECTEURS_ACTIVITE as readonly string[])
  const seen = new Set<string>()
  const out: SecteurActivite[] = []
  for (const v of input) {
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (set.has(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed)
      out.push(trimmed as SecteurActivite)
    }
  }
  return SECTEURS_ACTIVITE.filter(s => out.includes(s))
}
