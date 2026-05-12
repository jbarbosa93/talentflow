// TalentFlow Compliance — Queries partagées (service role)
// v2.5.0

import { createAdminClient } from '@/lib/supabase/admin'
import { isDriver } from './driver-detection'
import { computeDocumentStatus, daysUntilExpiry } from './document-status'
import type {
  DocumentType,
  CandidatDocumentWithStatus,
  ChecklistItem,
  ChecklistItemStatus,
} from './types'

export async function getAllDocumentTypes(): Promise<DocumentType[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('document_types' as any)
    .select('*')
    .order('display_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as unknown as DocumentType[]
}

export async function getRequiredDriverDocumentTypes(): Promise<DocumentType[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('document_types' as any)
    .select('*')
    .eq('is_required_for_driver', true)
    .order('display_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as unknown as DocumentType[]
}

export async function getCandidatDocuments(candidatId: string): Promise<CandidatDocumentWithStatus[]> {
  const supabase = createAdminClient()
  const { data: docs, error } = await supabase
    .from('candidat_documents' as any)
    .select('*')
    .eq('candidat_id', candidatId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const types = await getAllDocumentTypes()
  const typesById = new Map(types.map(t => [t.id, t]))
  return (docs || []).map((d: any) => ({
    ...(d as any),
    status: computeDocumentStatus(d.expiry_date),
    days_until_expiry: daysUntilExpiry(d.expiry_date),
    document_type: typesById.get(d.document_type_id),
  })) as CandidatDocumentWithStatus[]
}

export async function buildDriverChecklist(candidatId: string): Promise<ChecklistItem[]> {
  const [required, docs] = await Promise.all([
    getRequiredDriverDocumentTypes(),
    getCandidatDocuments(candidatId),
  ])
  return required.map(rt => {
    const doc = docs.find(d => d.document_type_id === rt.id)
    const status: ChecklistItemStatus = !doc
      ? 'missing'
      : doc.status === 'expire'
        ? 'expired'
        : (doc.status === 'expire_bientot' || doc.status === 'attention')
          ? 'expiring_soon'
          : 'valid'
    return { document_type: rt, status, document: doc }
  })
}

export interface CandidatDriverFlag {
  pipeline_metier: string | null
  titre_poste: string | null
  is_driver_override: boolean | null
}

export async function isCandidatDriver(candidatId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase as any)
    .from('candidats')
    .select('pipeline_metier, titre_poste, is_driver_override')
    .eq('id', candidatId)
    .maybeSingle()
  if (error || !data) return false
  return isDriver(data as CandidatDriverFlag)
}
