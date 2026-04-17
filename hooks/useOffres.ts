// hooks/useOffres.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Offre } from '@/types/database'
import { toast } from 'sonner'

const supabase = createClient()

export function useOffres(includeAll = false) {
  return useQuery({
    queryKey: ['offres', includeAll],
    queryFn: async () => {
      let query = supabase.from('offres').select('*').order('created_at', { ascending: false })
      if (!includeAll) query = query.eq('statut', 'active')
      const { data, error } = await query
      if (error) throw error
      return (data || []) as Offre[]
    },
    staleTime: 60_000,
  })
}

export function useCreateOffre() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (offre: {
      titre: string
      departement?: string
      description?: string
      competences: string[]
      exp_requise: number
      localisation?: string
      type_contrat?: string
      salaire_min?: number
      salaire_max?: number
      client_nom?: string
      nb_postes?: number
      date_debut?: string
      duree_mission?: string
      notes?: string
      cdc_url?: string
    }) => {
      const { data, error } = await supabase.from('offres').insert(offre).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offres'] })
      toast.success('Commande créée')
    },
    onError: (error: Error) => toast.error('Erreur création commande : ' + error.message),
  })
}

export function useUpdateOffre() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from('offres').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offres'] })
      toast.success('Commande mise à jour')
    },
    onError: (error: Error) => toast.error('Erreur mise à jour : ' + error.message),
  })
}
