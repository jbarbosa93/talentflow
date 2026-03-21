// Fonction pour logger une activité
import { createAdminClient } from './supabase/admin'

export type LogAction =
  | 'login'
  | 'logout'
  | 'candidat_cree'
  | 'candidat_supprime'
  | 'offre_creee'
  | 'cv_importe'
  | 'cv_doublon'
  | 'cv_erreur'
  | 'microsoft_sync'
  | 'microsoft_connecte'
  | 'microsoft_deconnecte'
  | 'pipeline_etape_changee'
  | 'cv_actualise'

export async function logActivity(params: {
  action: LogAction
  user_id?: string
  user_email?: string
  details?: Record<string, unknown>
  ip?: string
}) {
  try {
    const supabase = createAdminClient()
    await supabase.from('logs_activite').insert({
      action: params.action,
      user_id: params.user_id,
      user_email: params.user_email,
      details: params.details || {},
      ip: params.ip,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Ne pas faire planter l'app si le log échoue
  }
}
