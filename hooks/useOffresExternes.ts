// hooks/useOffresExternes.ts — Offres externes (jobs.ch, jobup.ch, Indeed CH)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export type OffreExterneStatut = 'a_traiter' | 'ouverte' | 'ignoree'

export interface OffreExterne {
  id: string
  titre: string
  entreprise: string | null
  lieu: string | null
  canton: string | null
  type_contrat: string | null
  taux_occupation: string | null
  description: string | null
  competences: string[]
  salaire: string | null
  url_source: string
  source: string
  date_publication: string | null
  est_agence: boolean
  statut: OffreExterneStatut
  actif: boolean
  created_at: string
}

export function useOffresExternes(filters?: {
  source?: string
  canton?: string
  search?: string
  hideAgences?: boolean
  statut?: OffreExterneStatut
}) {
  return useQuery({
    queryKey: ['offres_externes', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.statut) params.set('statut', filters.statut)
      if (filters?.source) params.set('source', filters.source)
      if (filters?.canton) params.set('canton', filters.canton)
      if (filters?.search) params.set('search', filters.search)
      if (filters?.hideAgences) params.set('hideAgences', 'true')

      const res = await fetch(`/api/offres/externes?${params}`)
      if (!res.ok) throw new Error('Erreur chargement offres externes')
      return (await res.json()) as OffreExterne[]
    },
    staleTime: 120_000,
  })
}

/** Count offres à traiter (pour le badge sidebar) */
export function useOffresATraiterCount() {
  return useQuery({
    queryKey: ['offres_externes_a_traiter_count'],
    queryFn: async () => {
      const res = await fetch('/api/offres/externes/count')
      if (!res.ok) return 0
      const data = await res.json()
      return data.count || 0
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    placeholderData: 0,
  })
}

/** Mutation pour changer le statut d'une offre externe */
export function useUpdateOffreExterneStatut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: OffreExterneStatut }) => {
      const res = await fetch('/api/offres/externes/statut', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, statut }),
      })
      if (!res.ok) throw new Error('Erreur mise à jour statut')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offres_externes'] })
      queryClient.invalidateQueries({ queryKey: ['offres_externes_a_traiter_count'] })
    },
    onError: () => toast.error('Erreur mise à jour statut'),
  })
}
