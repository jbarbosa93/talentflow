// lib/logActivity.ts
// Helper serveur pour logger les activités dans la table `activites`
// Utilise le client admin (service_role) — à appeler uniquement côté serveur

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Formate la date/heure courante au format "DD.MM.YYYY à HHhMM"
 */
export function formatDateTimeFR(): string {
  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
  return `${dateStr} à ${timeStr}`
}

export async function logActivityServer(data: {
  user_id: string
  user_name: string
  type: string
  titre: string
  description?: string
  candidat_id?: string
  candidat_nom?: string
  client_id?: string
  client_nom?: string
  offre_id?: string
  metadata?: Record<string, any>
}) {
  try {
    const supabase = createAdminClient() as any
    // Ajouter automatiquement la date/heure au titre
    const titreAvecDate = `${data.titre} — ${formatDateTimeFR()}`
    await supabase.from('activites').insert({
      ...data,
      titre: titreAvecDate,
      metadata: data.metadata ? JSON.stringify(data.metadata) : '{}',
    })
  } catch (err) {
    console.error('[logActivityServer] Error:', err)
  }
}

/**
 * Helper pour récupérer user_id et user_name depuis l'auth Supabase
 * dans un route handler. Retourne un fallback 'Système' si non authentifié.
 */
export async function getRouteUser(): Promise<{ user_id: string; user_name: string }> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const userName = [
        user.user_metadata?.prenom || '',
        user.user_metadata?.nom || '',
      ].filter(Boolean).join(' ') || user.email || 'Utilisateur'
      return { user_id: user.id, user_name: userName }
    }
  } catch {
    // Fallback silencieux
  }
  return { user_id: 'system', user_name: 'Système' }
}
