// lib/activity-log.ts
// Redirige vers logActivityServer() dans la table `activites`
// (anciennement écrivait dans `logs_activite` — unifié pour la page Activité)

import { logActivityServer } from './logActivity'

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
  | 'onedrive_sync'
  | 'pipeline_etape_changee'
  | 'cv_actualise'
  | 'note_changed'
  | 'candidat_valide'
  | 'metier_assigne'
  | 'connexion'
  | 'email_envoye_masse'

const TYPE_MAP: Record<string, string> = {
  cv_importe:                  'cv_importe',
  cv_actualise:                'cv_actualise',
  cv_doublon:                  'cv_doublon',
  cv_erreur:                   'cv_erreur',
  onedrive_sync:               'onedrive_sync',
  pipeline_etape_changee:      'statut_change',
  candidat_cree:               'candidat_importe',
  candidat_supprime:           'candidat_modifie',
  login:                       'connexion',
  logout:                      'connexion',
  connexion:                   'connexion',
  note_changed:                'note_changed',
  candidat_valide:             'candidat_valide',
  metier_assigne:              'metier_assigne',
  email_envoye_masse:          'email_envoye_masse',
  offre_creee:                 'candidat_modifie',
  microsoft_sync:              'onedrive_sync',
  microsoft_connecte:          'connexion',
  microsoft_deconnecte:        'connexion',
  microsoft_onedrive_connecte: 'connexion',
}

function buildTitre(action: string, d: Record<string, unknown>): string {
  const c = String(d.candidat || '')
  const f = String(d.fichier || '')
  switch (action) {
    case 'cv_importe':                  return `CV importé — ${c || f}`
    case 'cv_actualise':                return `CV actualisé — ${c || f}`
    case 'cv_doublon':                  return `Doublon — ${c || f}`
    case 'cv_erreur':                   return `Erreur import — ${f}`
    case 'onedrive_sync':               return `Sync OneDrive — ${d.traites ?? 0} traité(s), ${d.erreurs ?? 0} erreur(s)`
    case 'pipeline_etape_changee':      return `Pipeline — ${c}`
    case 'candidat_cree':               return `Candidat créé — ${c}`
    case 'candidat_supprime':           return `Candidat supprimé — ${c}`
    case 'login':                       return 'Connexion'
    case 'logout':                      return 'Déconnexion'
    case 'note_changed':                return `Note modifiée — ${c}`
    case 'candidat_valide':             return `Candidat validé — ${c}`
    case 'metier_assigne':              return `Métier assigné — ${c}`
    case 'email_envoye_masse':          return 'Email en masse envoyé'
    case 'offre_creee':                 return `Offre créée — ${d.titre || ''}`
    case 'microsoft_sync':
    case 'microsoft_connecte':
    case 'microsoft_onedrive_connecte': return 'Microsoft connecté'
    case 'microsoft_deconnecte':        return 'Microsoft déconnecté'
    default:                            return action.replace(/_/g, ' ')
  }
}

export async function logActivity(params: {
  action: LogAction
  user_id?: string
  user_email?: string
  details?: Record<string, unknown>
  ip?: string
}) {
  try {
    const d = params.details || {}
    const action = String(params.action)
    await logActivityServer({
      user_id:   params.user_id || 'system',
      user_name: params.user_email
        ? params.user_email.split('@')[0]
        : 'Système',
      type:     TYPE_MAP[action] || action,
      titre:    buildTitre(action, d),
      metadata: Object.keys(d).length > 0 ? d : undefined,
    })
  } catch {
    // Ne pas faire planter l'app si le log échoue
  }
}
