// hooks/useSecteursActiviteConfig.ts
// v1.9.122 — taxonomie secteurs d'activité clients dynamique (table DB)
// Avant : constante hardcodée dans lib/secteurs-extractor.ts
// Maintenant : éditable depuis /parametres/secteurs-activite

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SECTEURS_ACTIVITE, SECTEUR_REPRESENTATIVE_METIER } from '@/lib/secteurs-extractor'

export interface SecteurConfig {
  id: string
  nom: string
  ordre: number
  metier_representatif: string | null
  created_at?: string
  updated_at?: string
}

const QUERY_KEY = ['secteurs-activite-config'] as const

/**
 * Liste tous les secteurs d'activité configurés (triés par ordre).
 * Cache 5 min — invalidé après chaque mutation.
 *
 * Fallback gracieux : si la table DB est vide ou indispo, retourne la
 * taxonomie hardcodée historique (lib/secteurs-extractor.ts) pour
 * éviter qu'une UI vide casse le filtrage / mailing.
 */
export function useSecteursActiviteConfig() {
  return useQuery<SecteurConfig[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/secteurs-activite')
      if (!res.ok) throw new Error('Erreur chargement secteurs')
      const json = await res.json()
      const data = (json?.secteurs as SecteurConfig[]) || []
      if (data.length > 0) return data
      // Fallback constante hardcodée
      return SECTEURS_ACTIVITE.map((nom, i) => ({
        id: `fallback-${i}`,
        nom,
        ordre: i,
        metier_representatif: SECTEUR_REPRESENTATIVE_METIER[nom as keyof typeof SECTEUR_REPRESENTATIVE_METIER] || null,
      }))
    },
    staleTime: 5 * 60_000, // 5 min — peu d'écritures
    refetchOnWindowFocus: false,
  })
}

/** Helper : retourne juste les noms (string[]), trié par ordre. */
export function useSecteursList(): string[] {
  const { data } = useSecteursActiviteConfig()
  return (data || []).map(s => s.nom)
}

export function useCreateSecteur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nom: string; metier_representatif?: string | null; ordre?: number }) => {
      const res = await fetch('/api/secteurs-activite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur création')
      return json.secteur as SecteurConfig
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Secteur créé')
    },
    onError: (err: Error) => toast.error('Erreur : ' + err.message),
  })
}

export function useUpdateSecteur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SecteurConfig> }) => {
      const res = await fetch(`/api/secteurs-activite/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Erreur modification')
      return json as { secteur: SecteurConfig; clients_renommes: number }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY })
      // Si renommage propagé, invalider aussi la liste clients
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['secteurs-stats'] })
      const n = data?.clients_renommes ?? 0
      if (n > 0) toast.success(`Secteur modifié (${n} client${n > 1 ? 's' : ''} mis à jour)`)
      else toast.success('Secteur modifié')
    },
    onError: (err: Error) => toast.error('Erreur : ' + err.message),
  })
}

export function useDeleteSecteur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) => {
      const url = force ? `/api/secteurs-activite/${id}?force=true` : `/api/secteurs-activite/${id}`
      const res = await fetch(url, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        // 409 — secteur encore utilisé : on transmet usage pour confirmation
        const err: any = new Error(json?.error || 'Erreur suppression')
        err.usage = json?.usage
        err.message409 = json?.message
        throw err
      }
      return json as { clients_nettoyes: number }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['secteurs-stats'] })
      const n = data?.clients_nettoyes ?? 0
      if (n > 0) toast.success(`Secteur supprimé (retiré de ${n} client${n > 1 ? 's' : ''})`)
      else toast.success('Secteur supprimé')
    },
  })
}
