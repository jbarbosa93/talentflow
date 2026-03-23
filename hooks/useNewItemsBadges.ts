// Hook pour compter les nouveaux éléments depuis la dernière visite
// Stocke le timestamp de dernière visite par section dans localStorage
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCallback } from 'react'

const STORAGE_KEY = 'talentflow_last_seen'

function getLastSeen(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch { return {} }
}

function setLastSeen(section: string) {
  if (typeof window === 'undefined') return
  const data = getLastSeen()
  data[section] = new Date().toISOString()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function useMarkSectionSeen() {
  return useCallback((section: string) => {
    setLastSeen(section)
  }, [])
}

export function useNewItemsBadges() {
  return useQuery({
    queryKey: ['new-items-badges'],
    queryFn: async () => {
      const supabase = createClient()
      const lastSeen = getLastSeen()

      // Default: si jamais visité, on montre rien (pas de spam au premier login)
      const defaultDate = new Date().toISOString()

      const [candidats, clients, offres, entretiens, activites] = await Promise.all([
        // Nouveaux candidats
        supabase
          .from('candidats')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', lastSeen.candidats || defaultDate),
        // Nouveaux clients
        (supabase as any)
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', lastSeen.clients || defaultDate),
        // Nouvelles commandes
        supabase
          .from('offres')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', lastSeen.offres || defaultDate),
        // Nouveaux entretiens
        supabase
          .from('entretiens')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', lastSeen.entretiens || defaultDate),
        // Nouvelles activités
        (supabase as any)
          .from('activites')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', lastSeen.activites || defaultDate),
      ])

      return {
        candidats: candidats.count || 0,
        clients: clients.count || 0,
        offres: offres.count || 0,
        entretiens: entretiens.count || 0,
        activites: activites.count || 0,
      }
    },
    staleTime: 30_000,
    refetchInterval: 30_000, // Refresh toutes les 30s
  })
}

// Mapping section → couleur du badge
export const BADGE_COLORS: Record<string, string> = {
  candidats: '#F7C948',   // jaune (candidats)
  clients: '#10B981',     // vert (clients)
  offres: '#3B82F6',      // bleu (commandes)
  entretiens: '#8B5CF6',  // violet (entretiens)
  activites: '#F97316',   // orange (activité)
}
