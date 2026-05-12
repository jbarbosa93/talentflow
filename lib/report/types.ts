// TalentFlow Rapports — Types partagés (Phase 5)
// v2.4.0 — Phase 1 multi-entreprise + notes
//
// Module rapports hebdomadaires intégré à TalentFlow Sign.
// Réutilise sign_templates (avec kind='report') pour le PDF + fields.

export type ReportLinkStatus = 'active' | 'paused' | 'revoked'

export type ReportSubmissionStatus =
  | 'draft'             // candidat saisit, pas encore signé
  | 'candidate_signed'  // candidat a signé, en attente du client
  | 'client_signed'     // client a signé, pipeline en cours (PDF + notif)
  | 'completed'         // pipeline terminé, PDF persisté, notifs envoyées
  | 'cancelled'

export type ReportAuditAction =
  | 'created'
  | 'candidate_signed'
  | 'client_notified'
  | 'client_viewed'
  | 'client_modified'
  | 'client_signed'
  | 'completed'
  | 'cancelled'
  | 'draft_deleted'
  | 'week_corrected'

export type ReportDeliveryChannel = 'email' | 'whatsapp' | 'both'

export interface ReportLink {
  id: string
  slug: string
  candidat_id: string | null
  /** v2.3.x — Nom complet du candidat saisi à la création.
   *  Source de vérité pour le pré-remplissage des fields auto-fill firstname/lastname/fullname,
   *  même quand le candidat n'est pas lié à la table candidats (candidat_id NULL). */
  candidat_name: string | null
  template_id: string | null
  title: string
  client_name: string | null
  /** v2.3.x — Nom du contact client (texte libre). Utilisé pour la salutation dans
   *  emails/WhatsApp envoyés au client. Distinct de `client_name` (entreprise). */
  client_contact_name: string | null
  client_email: string | null
  client_phone: string | null
  /** v2.3.x — Numéro WhatsApp du candidat (E.164 strict). Optionnel.
   *  Utilisé pour notif post-completion + deep link wa.me dashboard. */
  candidat_phone: string | null
  /** v2.3.7 — Email du candidat. Optionnel. Notif email post-signature client. */
  candidat_email: string | null
  status: ReportLinkStatus
  delivery_channel: ReportDeliveryChannel
  created_by: string | null
  /** v2.7.1 — Mission liée. Si renseignée, les dates de mission sont synchronisées
   *  automatiquement sur report_link_clients (mission_start_date / mission_end_date)
   *  via le PATCH /api/missions/[id]. Permet aussi au form heures candidat de
   *  désactiver les jours d'arrêt (lus depuis missions.arrets). */
  mission_id: string | null
  /** v2.7.3 — Si true, les notifications de signature candidat redirigent vers
   *  /client-portal/{slug}?tab=rapports (slug permanent) au lieu de
   *  /report/client/{token} (TTL 7j). L'email part à clients.email (mail principal
   *  entreprise) et non au contact saisi sur le lien.
   *  Le token reste généré côté DB en defensive — le portail est le canal préféré. */
  use_client_portal: boolean
  created_at: string
  updated_at: string
}

export interface ReportLinkClient {
  id: string
  link_id: string
  client_id: string | null
  client_name: string
  client_email: string | null
  client_contact_name: string | null
  client_phone: string | null
  /** v2.6.1 — Nom du responsable terrain de la mission (peut différer du contact signataire).
   *  Affiché côté candidat dans la section "Mes missions". */
  mission_contact_name: string | null
  /** v2.6.1 — Téléphone du responsable terrain (idéalement E.164). Cliquable tel: côté candidat. */
  mission_phone: string | null
  /** v2.6.1 — Date de début de mission (YYYY-MM-DD, incluse). NULL = pas de limite. */
  mission_start_date: string | null
  /** v2.6.1 — Date de fin de mission (YYYY-MM-DD, incluse). NULL = pas de limite. */
  mission_end_date: string | null
  display_order: number
  created_at: string
}

export interface ReportSubmission {
  id: string
  link_id: string
  /** v2.4.0 — Entreprise destinataire du rapport. Permet plusieurs rapports/semaine
   *  pour un même candidat (1 par entreprise). NULL = legacy / lien sans entreprise. */
  report_link_client_id: string | null
  week_start: string  // ISO date YYYY-MM-DD (lundi)
  week_end: string    // ISO date (dimanche)
  field_values: Record<string, unknown>
  status: ReportSubmissionStatus
  candidate_signature_data_url: string | null
  candidate_signed_at: string | null
  candidate_signed_ip: string | null
  client_signature_data_url: string | null
  client_signed_at: string | null
  client_signed_ip: string | null
  client_token: string | null
  client_token_expires_at: string | null
  signed_pdf_paths: { name: string; path: string; sha256: string }[]
  /** v2.3.x — Métadonnées enrichies : client_modified, modified_at, modified_fields... */
  metadata?: Record<string, unknown>
  /** v2.4.0 — Note libre du candidat à destination de son responsable (max 300 chars).
   *  Affichée dans email créateur + bandeau page client. PAS dans le PDF. */
  notes_candidat?: string | null
  /** v2.4.0 — Note libre du client (commentaire/correction). Affichée dans email créateur uniquement. */
  notes_client?: string | null
  created_at: string
  updated_at: string
}

export interface ReportAuditEntry {
  id: string
  submission_id: string
  action: ReportAuditAction
  actor_email: string | null
  ip_address: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface WeekDates {
  /** Lundi de la semaine (ISO YYYY-MM-DD) */
  start: string
  /** Dimanche de la semaine (ISO YYYY-MM-DD) */
  end: string
  /** Numéro ISO 8601 de la semaine (1-53) */
  weekNumber: number
  /** Année ISO (peut différer de l'année calendaire en bord d'année) */
  year: number
  /** Label affiché : "Semaine du 5 au 11 mai 2026" */
  label: string
}

export const REPORT_STATUS_LABELS: Record<ReportSubmissionStatus, string> = {
  draft: 'Brouillon',
  candidate_signed: 'Signé par le candidat',
  client_signed: 'Signé par le client',
  completed: 'Complété',
  cancelled: 'Annulé',
}

export const REPORT_LINK_STATUS_LABELS: Record<ReportLinkStatus, string> = {
  active: 'Actif',
  paused: 'En pause',
  revoked: 'Révoqué',
}

/** Jours de la semaine (Lundi → Dimanche) — sert au DailyReportTable et au mapping fields. */
export const WEEK_DAYS = [
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche',
] as const

export type WeekDay = typeof WEEK_DAYS[number]

/** Lignes type du rapport L-Agence (sert au DailyReportTable). Le label exact
 *  est libre pour le template — ces clés correspondent aux wizardSection des
 *  fields du PDF source. */
export const REPORT_ROW_KEYS = [
  'semaine_numero',           // "Semaine N°" (en-tête, pas par jour)
  'date',                     // auto-rempli par le sélecteur de semaine
  'heures_normales',          // en centièmes
  'repas',
  'heures_supplementaires',
  'centre_couts_chantier',
  'temps_deplacement',
  'divers',
  'ligne_libre',              // ligne vierge en bas
] as const

export type ReportRowKey = typeof REPORT_ROW_KEYS[number]

export const REPORT_ROW_LABELS: Record<ReportRowKey, string> = {
  semaine_numero: 'Semaine N°',
  date: 'Date',
  heures_normales: 'Heures normales',
  repas: 'Repas',
  heures_supplementaires: 'Heures supplémentaires',
  centre_couts_chantier: 'Centre de coûts / chantier',
  temps_deplacement: 'Temps de déplacement',
  divers: 'Divers',
  ligne_libre: '',
}

/** TTL token client : 2h en mode présentiel (QR), 7j en mode envoi distant. */
export const CLIENT_TOKEN_TTL_MS = {
  present:  2 * 60 * 60 * 1000,         // 2h
  remote:   7 * 24 * 60 * 60 * 1000,    // 7j
} as const
