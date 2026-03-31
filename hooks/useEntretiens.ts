import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function useEntretiens() {
  return useQuery({
    queryKey: ['entretiens'],
    queryFn: async () => {
      const res = await fetch('/api/entretiens')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data.entretiens as any[]
    },
    staleTime: 30_000,
  })
}

export function useCreateEntretien() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch('/api/entretiens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data.entretien
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entretiens'] })
      toast.success('Suivi créé')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateEntretien() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch('/api/entretiens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data.entretien
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entretiens'] })
      toast.success('Entretien mis à jour')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteEntretien() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/entretiens?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entretiens'] })
      toast.success('Entretien supprimé')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
