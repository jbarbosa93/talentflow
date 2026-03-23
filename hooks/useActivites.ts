// hooks/useActivites.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface Activite {
  id: string
  user_id: string
  user_name: string
  type: string
  titre: string
  description: string | null
  candidat_id: string | null
  candidat_nom: string | null
  client_id: string | null
  client_nom: string | null
  offre_id: string | null
  metadata: Record<string, any>
  notes: string | null
  created_at: string
}

export type ActiviteType =
  | 'email_envoye'
  | 'whatsapp_envoye'
  | 'sms_envoye'
  | 'cv_envoye'
  | 'candidat_importe'
  | 'candidat_modifie'
  | 'entretien_planifie'
  | 'note_ajoutee'
  | 'statut_change'
  | 'client_contacte'

export function useActivites(filters?: {
  search?: string
  type?: string
  user_id?: string
  date_from?: string
  date_to?: string
  page?: number
  per_page?: number
}) {
  return useQuery({
    queryKey: ['activites', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.search) params.set('search', filters.search)
      if (filters?.type) params.set('type', filters.type)
      if (filters?.user_id) params.set('user_id', filters.user_id)
      if (filters?.date_from) params.set('date_from', filters.date_from)
      if (filters?.date_to) params.set('date_to', filters.date_to)
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.per_page) params.set('per_page', String(filters.per_page))
      const res = await fetch(`/api/activites?${params}`)
      if (!res.ok) throw new Error('Erreur chargement activites')
      const data = await res.json()
      return {
        activites: (data.activites || []) as Activite[],
        total: (data.total ?? 0) as number,
        page: data.page || 1,
        per_page: data.per_page || 20,
        total_pages: data.total_pages || 1,
      }
    },
    staleTime: 15_000,
    refetchInterval: 30_000, // Auto-refresh every 30s for real-time feel
    placeholderData: (prev: any) => prev,
  })
}

export function useCreateActivite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      type: ActiviteType
      titre: string
      description?: string
      candidat_id?: string
      candidat_nom?: string
      client_id?: string
      client_nom?: string
      offre_id?: string
      metadata?: Record<string, any>
    }) => {
      const res = await fetch('/api/activites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur creation activite')
      return json.activite as Activite
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activites'] })
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useUpdateActiviteNotes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const res = await fetch(`/api/activites/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur mise a jour')
      return json.activite as Activite
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activites'] })
      toast.success('Note enregistree')
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useDeleteActivite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/activites/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur suppression')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activites'] })
      toast.success('Activite supprimee')
    },
    onError: (error: Error) => { toast.error('Erreur suppression : ' + error.message) },
  })
}

/**
 * Helper function to log an activity from anywhere in the app.
 * Fire-and-forget — errors are silently ignored.
 */
export async function logActivity(data: {
  type: ActiviteType
  titre: string
  description?: string
  candidat_id?: string
  candidat_nom?: string
  client_id?: string
  client_nom?: string
  offre_id?: string
  metadata?: Record<string, any>
}) {
  try {
    await fetch('/api/activites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch {
    // Fire and forget — no toast, no throw
  }
}
