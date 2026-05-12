// TalentFlow Compliance — Types partagés
// v2.5.0

export type DocumentCategory = 'identite' | 'permis_conduire' | 'qualification' | 'formation' | 'autre'

export type DocumentStatus = 'valide' | 'attention' | 'expire_bientot' | 'expire'

export interface DocumentType {
  id: string
  name: string
  category: DocumentCategory
  job_types: string[]
  requires_expiry: boolean
  requires_photo: boolean
  is_required_for_driver: boolean
  display_order: number
  description: string | null
  created_at?: string
}

export interface CandidatDocument {
  id: string
  candidat_id: string
  document_type_id: string
  label: string
  sub_category: string | null
  expiry_date: string | null
  issued_date: string | null
  document_number: string | null
  file_recto_path: string | null
  file_verso_path: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CandidatDocumentWithStatus extends CandidatDocument {
  status: DocumentStatus
  days_until_expiry: number | null
  document_type?: DocumentType
}

export type ChecklistItemStatus = 'missing' | 'expired' | 'expiring_soon' | 'valid'

export interface ChecklistItem {
  document_type: DocumentType
  status: ChecklistItemStatus
  document?: CandidatDocumentWithStatus
}

export interface ClientPortal {
  id: string
  client_id: string
  slug: string
  name: string
  is_active: boolean
  created_by: string | null
  created_at: string
  last_accessed_at: string | null
}

// v2.7.1 — Liste exhaustive France + Suisse
export const PERMIS_SUB_CATEGORIES = [
  // Cyclomoteurs / petits véhicules
  'AM',         // FR + CH — cyclomoteur ≤ 45 km/h
  'M',          // CH — cyclomoteur 50cc / vélo électrique rapide
  // Motos
  'A1', 'A2', 'A',
  // Voiture / VL
  'B1', 'B', 'BE',
  // Camions / PL
  'C1', 'C1E', 'C', 'CE',
  // Transport personnes / bus
  'D1', 'D1E', 'D', 'DE',
  // Spécifiques Suisse
  'F',          // CH — véhicule à moteur ≤ 45 km/h (autre que cyclomoteur)
  'G',          // CH — tracteur agricole
] as const

export type PermisSubCategory = typeof PERMIS_SUB_CATEGORIES[number]

// Groupes pour affichage dans l'UI (UI plus lisible que liste plate)
export const PERMIS_GROUPS: { label: string; items: PermisSubCategory[] }[] = [
  { label: 'Cyclomoteurs / petits véhicules', items: ['AM', 'M'] },
  { label: 'Motos', items: ['A1', 'A2', 'A'] },
  { label: 'Voiture (VL)', items: ['B1', 'B', 'BE'] },
  { label: 'Camion (PL)', items: ['C1', 'C1E', 'C', 'CE'] },
  { label: 'Transport personnes (Bus)', items: ['D1', 'D1E', 'D', 'DE'] },
  { label: 'Suisse spécifique', items: ['F', 'G'] },
]

export const DOCUMENT_CATEGORY_CONFIG: Record<DocumentCategory, { label: string; icon: string; order: number }> = {
  identite:        { label: 'Identité',           icon: 'IdCard',  order: 1 },
  permis_conduire: { label: 'Permis de conduire', icon: 'Car',     order: 2 },
  qualification:   { label: 'Qualifications',     icon: 'Award',   order: 3 },
  formation:       { label: 'Formations',         icon: 'GraduationCap', order: 4 },
  autre:           { label: 'Autres',             icon: 'FileText', order: 5 },
}
