// hooks/useMetierCategories.ts
// Hook pour gérer les catégories de métiers avec couleurs

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface MetierCategory {
  name: string
  color: string        // hex color ex: "#EAB308"
  metiers: string[]    // métiers appartenant à cette catégorie
}

export function useMetierCategories() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['metier-categories'],
    queryFn: async () => {
      const res = await fetch('/api/metier-categories')
      if (!res.ok) throw new Error('Erreur chargement catégories')
      const json = await res.json()
      return json.categories as MetierCategory[]
    },
    staleTime: 60_000,
  })

  const saveMutation = useMutation({
    mutationFn: async (categories: MetierCategory[]) => {
      const res = await fetch('/api/metier-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories }),
      })
      if (!res.ok) throw new Error('Erreur sauvegarde catégories')
      return { ...(await res.json()), _saved: categories }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['metier-categories'], data._saved as MetierCategory[])
    },
  })

  // Helper: trouver la catégorie d'un métier
  const getCategoryForMetier = (metier: string): MetierCategory | undefined => {
    return (data ?? []).find(cat => cat.metiers.includes(metier))
  }

  // Helper: couleur d'un métier (retourne la couleur de sa catégorie ou undefined)
  const getColorForMetier = (metier: string): string | undefined => {
    return getCategoryForMetier(metier)?.color
  }

  return {
    categories: data ?? [],
    isLoading,
    saveCategories: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    getCategoryForMetier,
    getColorForMetier,
  }
}
