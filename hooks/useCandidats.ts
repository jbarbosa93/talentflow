// hooks/useCandidats.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Candidat, PipelineEtape, ImportStatus } from '@/types/database'
import { toast } from 'sonner'

const supabase = createClient()

export function useCandidats(filters?: { statut?: PipelineEtape; import_status?: ImportStatus }) {
  return useQuery({
    queryKey: ['candidats', { statut: filters?.statut, import_status: filters?.import_status }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.statut) params.set('statut', filters.statut)
      if (filters?.import_status) params.set('import_status', filters.import_status)
      const res = await fetch(`/api/candidats?${params}`)
      if (!res.ok) throw new Error('Erreur chargement candidats')
      const { candidats, total } = await res.json()
      return { candidats: (candidats || []) as Candidat[], total: (total ?? candidats?.length ?? 0) as number }
    },
    staleTime: 60_000,
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
      const { data, error } = await supabase.from('notes_candidat').insert({ candidat_id, contenu, offre_id: offre_id || null, auteur: 'Recruteur' }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['candidat', variables.candidat_id] })
      toast.success('Note ajoutée')
    },
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
