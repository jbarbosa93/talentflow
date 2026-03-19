// hooks/usePipeline.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PipelineEtape, VuePipelineComplet } from '@/types/database'
import { toast } from 'sonner'

const supabase = createClient()

export function usePipeline(offreId?: string) {
  return useQuery({
    queryKey: ['pipeline', offreId],
    queryFn: async () => {
      let query = supabase.from('vue_pipeline_complet').select('*').order('score_ia', { ascending: false, nullsFirst: false })
      if (offreId) query = query.eq('offre_id', offreId)
      const { data, error } = await query
      if (error) throw error
      return data as VuePipelineComplet[]
    },
  })
}

export function useUpdateEtapePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, etape, notes }: { id: string; etape: PipelineEtape; notes?: string }) => {
      const { data, error } = await supabase.from('pipeline').update({ etape, ...(notes !== undefined && { notes }) }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      toast.success('Pipeline mis à jour')
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useCalculerScore() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ candidat_id, offre_id }: { candidat_id: string; offre_id: string }) => {
      const res = await fetch('/api/matching', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidat_id, offre_id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Score IA calculé')
    },
    onError: (error: Error) => { toast.error('Erreur calcul score : ' + error.message) },
  })
}
