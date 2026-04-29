// hooks/useClients.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// v1.9.114 — Stats fréquence secteurs (pour tri du filtre /clients par usage réel)
export function useSecteursStats() {
  return useQuery({
    queryKey: ['clients-secteurs-stats'],
    queryFn: async () => {
      const res = await fetch('/api/clients/secteurs-stats')
      if (!res.ok) throw new Error('Erreur stats secteurs')
      const data = await res.json()
      return (data.stats || []) as Array<{ secteur: string; count: number }>
    },
    staleTime: 5 * 60_000,
  })
}

export interface Client {
  id: string
  nom_entreprise: string
  adresse: string | null
  npa: string | null
  ville: string | null
  canton: string | null
  telephone: string | null
  email: string | null
  secteur: string | null
  notes: string | null
  site_web: string | null
  statut: 'actif' | 'desactive'
  contacts: any[] | null
  secteurs_activite: string[] | null
  created_at: string
}

export function useClients(filters?: {
  search?: string
  statut?: string
  canton?: string
  secteurs?: string[]
  ville?: string
  npa?: string
  contacts?: 'avec' | 'sans' | ''
  created_after?: string
  created_before?: string
  page?: number
  per_page?: number
}) {
  return useQuery({
    queryKey: ['clients', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.search) params.set('search', filters.search)
      if (filters?.statut) params.set('statut', filters.statut)
      if (filters?.canton) params.set('canton', filters.canton)
      if (filters?.secteurs && filters.secteurs.length > 0) {
        params.set('secteurs', filters.secteurs.join(','))
      }
      if (filters?.ville) params.set('ville', filters.ville)
      if (filters?.npa) params.set('npa', filters.npa)
      if (filters?.contacts) params.set('contacts', filters.contacts)
      if (filters?.created_after) params.set('created_after', filters.created_after)
      if (filters?.created_before) params.set('created_before', filters.created_before)
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.per_page !== undefined) params.set('per_page', String(filters.per_page))
      const res = await fetch(`/api/clients?${params}`)
      if (!res.ok) throw new Error('Erreur chargement clients')
      const data = await res.json()
      return {
        clients: (data.clients || []) as Client[],
        total: (data.total ?? 0) as number,
        page: data.page || 1,
        per_page: data.per_page || 20,
        total_pages: data.total_pages || 1,
      }
    },
    staleTime: 30_000,
    placeholderData: (prev: any) => prev,
  })
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${id}`)
      if (!res.ok) throw new Error('Client introuvable')
      const { client } = await res.json()
      return client as Client
    },
    enabled: !!id,
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<Client>) => {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur creation')
      return json.client as Client
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['clients-secteurs-stats'] })
      toast.success('Client cree avec succes')
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useUpdateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Client> }) => {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur mise a jour')
      return json.client as Client
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['client', data.id] })
      queryClient.invalidateQueries({ queryKey: ['clients-secteurs-stats'] })
      toast.success('Modifications enregistrees')
    },
    onError: (error: Error) => { toast.error('Erreur : ' + error.message) },
  })
}

export function useDeleteClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur suppression')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Client supprime')
    },
    onError: (error: Error) => { toast.error('Erreur suppression : ' + error.message) },
  })
}
