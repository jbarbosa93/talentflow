// hooks/useCandidats.ts
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useRef } from 'react'
import type { Candidat, PipelineEtape, ImportStatus } from '@/types/database'
import { toast } from 'sonner'

const supabase = createClient()

export function useCandidats(filters?: {
  statut?: PipelineEtape
  import_status?: ImportStatus
  search?: string
  page?: number
  per_page?: number
  sort?: string
  genre?: string
  langue?: string
  permis?: boolean | null
  lieu?: string
  metier?: string
  cfc?: 'true' | undefined
  engage?: 'true' | undefined
}) {
  return useQuery({
    queryKey: ['candidats', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.statut) params.set('statut', filters.statut)
      if (filters?.import_status) params.set('import_status', filters.import_status)
      if (filters?.search) params.set('search', filters.search)
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.per_page !== undefined) params.set('per_page', String(filters.per_page))
      if (filters?.sort) params.set('sort', filters.sort)
      if (filters?.genre) params.set('genre', filters.genre)
      if (filters?.langue) params.set('langue', filters.langue)
      if (filters?.permis !== undefined && filters.permis !== null) params.set('permis', filters.permis ? 'true' : 'false')
      if (filters?.lieu) params.set('lieu', filters.lieu)
      if (filters?.metier) params.set('metier', filters.metier)
      if (filters?.cfc) params.set('cfc', filters.cfc)
      if (filters?.engage) params.set('engage', filters.engage)
      const res = await fetch(`/api/candidats?${params}`)
      if (!res.ok) throw new Error('Erreur chargement candidats')
      const data = await res.json()
      return {
        candidats: (data.candidats || []) as Candidat[],
        total: (data.total ?? 0) as number,
        page: data.page || 1,
        per_page: data.per_page || 20,
        total_pages: data.total_pages || 1,
      }
    },
    staleTime: 30_000,
    placeholderData: (prev: any) => prev, // Keep previous data while loading
  })
}

export function useCandidat(id: string) {
  return useQuery({
    queryKey: ['candidat', id],
    queryFn: async () => {
      const res = await fetch(`/api/candidats/${id}`)
      if (!res.ok) throw new Error('Candidat introuvable')
      const { candidat } = await res.json()
      return candidat
    },
    enabled: !!id,
    staleTime: 60_000, // données fraîches 1 min → affichage immédiat si déjà en cache
  })
}

export function useUpdateCandidat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Candidat> }) => {
      const res = await fetch(`/api/candidats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur mise à jour')
      return json.candidat
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      queryClient.invalidateQueries({ queryKey: ['candidat', data.id] })
      toast.success('Modifications enregistrées')
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useUpdateStatutCandidat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: PipelineEtape }) => {
      const res = await fetch(`/api/candidats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut_pipeline: statut }),
      })
      if (!res.ok) throw new Error('Erreur mise à jour')
      const { candidat } = await res.json()
      return candidat
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      queryClient.invalidateQueries({ queryKey: ['candidat', data.id] })
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Statut mis à jour')
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useAjouterNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ candidat_id, contenu, offre_id }: { candidat_id: string; contenu: string; offre_id?: string }) => {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidat_id, contenu, offre_id: offre_id || null, auteur: 'Recruteur' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur ajout note')
      return json.note
    },
    onSuccess: (_: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['candidat', variables.candidat_id] })
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      toast.success('Note ajoutée')
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ note_id, candidat_id }: { note_id: string; candidat_id: string }) => {
      const res = await fetch(`/api/notes/${note_id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur suppression note')
    },
    onSuccess: (_: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['candidat', variables.candidat_id] })
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      toast.success('Note supprimée')
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ note_id, candidat_id, contenu }: { note_id: string; candidat_id: string; contenu: string }) => {
      const res = await fetch(`/api/notes/${note_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur modification note')
      return json.note
    },
    onSuccess: (_: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['candidat', variables.candidat_id] })
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      toast.success('Note modifiée')
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useDeleteCandidat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/candidats/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur suppression')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      toast.success('Candidat supprimé')
    },
    onError: (error: Error) => { toast.error('Erreur suppression : ' + error.message) },
  })
}

export function useUpdateImportStatusBulk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ImportStatus }) => {
      const results = await Promise.all(
        ids.map(id =>
          fetch(`/api/candidats/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ import_status: status }),
          })
        )
      )
      return results.length
    },
    onSuccess: (count: number) => {
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      const label = count > 1 ? `${count} candidats` : '1 candidat'
      toast.success(`${label} mis à jour`)
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useDeleteCandidatsBulk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/candidats', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Erreur suppression')
      const { deleted } = await res.json()
      return deleted as number
    },
    onSuccess: (deleted: number) => {
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      toast.success(`${deleted} candidat${deleted > 1 ? 's' : ''} supprimé${deleted > 1 ? 's' : ''}`)
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

// ── Realtime sync candidats ──────────────────────────────────────────────────
// Écoute les changements Supabase sur la table candidats et invalide le cache
// React Query — permet à plusieurs utilisateurs de travailler en même temps
// sans se marcher dessus (liste se met à jour automatiquement).
export function useCandidatsRealtime() {
  const queryClient = useQueryClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const channel = supabase
      .channel('candidats-collab')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidats' },
        () => {
          // Debounce 400ms pour regrouper les rafales de changements
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['candidats'] })
          }, 400)
        }
      )
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
