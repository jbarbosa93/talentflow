// hooks/useMetiers.ts
// Hook partagé pour lire/écrire les métiers depuis Supabase (via /api/metiers)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useMetiers() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['metiers'],
    queryFn: async () => {
      const res = await fetch('/api/metiers')
      if (!res.ok) throw new Error('Erreur chargement métiers')
      const json = await res.json()
      return json.metiers as string[]
    },
    staleTime: 60_000, // Cache 1 min
  })

  const saveMutation = useMutation({
    mutationFn: async (metiers: string[]) => {
      const res = await fetch('/api/metiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metiers }),
      })
      if (!res.ok) throw new Error('Erreur sauvegarde métiers')
      return { ...(await res.json()), _saved: metiers }
    },
    onSuccess: (data) => {
      // Mettre à jour le cache directement avec les données sauvegardées
      // (évite le problème de cache CDN Supabase qui retournerait les anciennes données)
      queryClient.setQueryData(['metiers'], data._saved as string[])
    },
  })

  return {
    metiers: data ?? [],
    isLoading,
    saveMetiers: saveMutation.mutate,
    isSaving: saveMutation.isPending,
  }
}
