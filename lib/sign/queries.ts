// TalentFlow Sign — Queries Supabase typées
// v2.2.0 — Phase 1
// Côté serveur (utilise client serveur authentifié, RLS applique).

import { createClient as createServerClient } from '@/lib/supabase/server'
import type { SignEnvelope, SignTemplate, SignCategory, SignStatus } from './types'

export interface ListEnvelopesFilters {
  status?: SignStatus
  category?: SignCategory
  candidateId?: string
  search?: string
  limit?: number
  offset?: number
}

export async function listEnvelopes(filters: ListEnvelopesFilters = {}): Promise<{
  data: SignEnvelope[]
  count: number
}> {
  const supabase = await createServerClient()
  let q = supabase
    .from('sign_envelopes' as any)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters.status) q = q.eq('status', filters.status)
  if (filters.category) q = q.eq('document_category', filters.category)
  if (filters.candidateId) q = q.eq('candidate_id', filters.candidateId)
  if (filters.search) q = q.ilike('title', `%${filters.search}%`)

  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0
  q = q.range(offset, offset + limit - 1)

  const { data, count, error } = await q
  if (error) throw new Error(`listEnvelopes: ${error.message}`)

  return { data: (data || []) as unknown as SignEnvelope[], count: count ?? 0 }
}

export async function getEnvelope(id: string): Promise<SignEnvelope | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('sign_envelopes' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`getEnvelope: ${error.message}`)
  return (data as unknown as SignEnvelope) || null
}

export async function listEnvelopesByCandidat(
  candidateId: string
): Promise<SignEnvelope[]> {
  const { data } = await listEnvelopes({ candidateId, limit: 200 })
  return data
}

export async function listTemplates(): Promise<SignTemplate[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('sign_templates' as any)
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`listTemplates: ${error.message}`)
  return (data || []) as unknown as SignTemplate[]
}

export async function getTemplate(id: string): Promise<SignTemplate | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('sign_templates' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`getTemplate: ${error.message}`)
  return (data as unknown as SignTemplate) || null
}
