// Hook pour compter les nouvelles actions faites par D'AUTRES utilisateurs
// Badge = "ton collègue a fait quelque chose que tu n'as pas encore vu"
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

// Mapping type d'activité → section sidebar
const TYPE_TO_SECTION: Record<string, string> = {
  candidat_importe: 'candidats',
  candidat_modifie: 'candidats',
  client_contacte: 'clients',
  email_envoye: 'activites',
  whatsapp_envoye: 'activites',
  sms_envoye: 'activites',
  cv_envoye: 'activites',
  entretien_planifie: 'entretiens',
  statut_change: 'activites',
  note_ajoutee: 'activites',
}

export function useNewItemsBadges() {
  return useQuery({
    queryKey: ['new-items-badges'],
    queryFn: async () => {
      const supabase = createClient()
      const lastSeen = getLastSeen()
      const defaultDate = new Date().toISOString()

      // Récupérer l'utilisateur courant
      const { data: { user } } = await supabase.auth.getUser()
      const currentUserId = user?.id || ''

      // Compter les activités par section faites par D'AUTRES utilisateurs
      const counts: Record<string, number> = {
        candidats: 0,
        clients: 0,
        offres: 0,
        entretiens: 0,
        activites: 0,
      }

      // Récupérer toutes les activités récentes (max 200) faites par d'autres
      const { data: recentActivities } = await (supabase as any)
        .from('activites')
        .select('type, created_at, user_id')
        .neq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(200)

      if (recentActivities) {
        for (const act of recentActivities) {
          const section = TYPE_TO_SECTION[act.type] || 'activites'
          const sectionLastSeen = lastSeen[section] || defaultDate
          if (new Date(act.created_at) > new Date(sectionLastSeen)) {
            counts[section] = (counts[section] || 0) + 1
          }
        }
      }

      return counts
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

// Mapping section → couleur du badge
export const BADGE_COLORS: Record<string, string> = {
  candidats: '#F7C948',
  clients: '#10B981',
  offres: '#3B82F6',
  entretiens: '#8B5CF6',
  activites: '#F97316',
}
