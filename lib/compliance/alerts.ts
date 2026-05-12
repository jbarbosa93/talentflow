// TalentFlow Compliance — Agrégateur d'alertes documents
// v2.7.0
//
// Source de vérité pour :
// - La cloche header (badge + popover liste compact)
// - La page /alertes (liste complète filtrable)
// - Le cron quotidien (email agrégé 8h00)

import { createAdminClient } from '@/lib/supabase/admin'
import { daysUntilExpiry } from './document-status'
import type { CandidatDocument, DocumentType } from './types'

export type AlertSeverity = 'expired' | 'urgent_14' | 'warning_30'

export interface DocumentAlert {
  document: CandidatDocument
  document_type: DocumentType | null
  candidat: {
    id: string
    prenom: string | null
    nom: string | null
    photo_url: string | null
    pipeline_consultant: string | null
  }
  days_until_expiry: number  // négatif si expiré
  severity: AlertSeverity
  has_active_mission: boolean
}

export interface AlertsSummary {
  total: number
  expired: number
  urgent: number    // 0-14 jours
  warning: number   // 15-30 jours
  alerts: DocumentAlert[]
}

function classify(days: number): AlertSeverity | null {
  if (days < 0) return 'expired'
  if (days < 14) return 'urgent_14'
  if (days < 30) return 'warning_30'
  return null
}

/**
 * Récupère toutes les alertes documents (expirés + expirent dans <30 jours).
 * Joint avec candidat (nom, photo) + document_type (label) + missions actives.
 * Triée par sévérité puis days_until_expiry ASC (les plus urgents en premier).
 */
export async function getDocumentAlerts(opts: {
  /** Limite max d'alertes retournées (default 200) */
  limit?: number
  /** Si fourni, filtre par consultant assigné au candidat */
  consultantEmail?: string
} = {}): Promise<AlertsSummary> {
  const supabase = createAdminClient()
  const limit = opts.limit ?? 200

  // 1. Tous les documents avec expiry_date dans la fenêtre [J-INF, J+30]
  // SELECT 30 jours dans le futur + tous les expirés
  const today = new Date()
  const in30 = new Date(today)
  in30.setDate(today.getDate() + 30)
  const limitDate = in30.toISOString().slice(0, 10)

  const { data: docs, error } = await (supabase as any)
    .from('candidat_documents')
    .select('*')
    .lte('expiry_date', limitDate)
    .not('expiry_date', 'is', null)
    .order('expiry_date', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`getDocumentAlerts: ${error.message}`)

  const rawDocs = (docs || []) as CandidatDocument[]
  if (rawDocs.length === 0) {
    return { total: 0, expired: 0, urgent: 0, warning: 0, alerts: [] }
  }

  // 2. Joints (single fetch each)
  const candIds = Array.from(new Set(rawDocs.map(d => d.candidat_id)))
  const typeIds = Array.from(new Set(rawDocs.map(d => d.document_type_id)))

  const [candsRes, typesRes, missionsRes] = await Promise.all([
    (supabase as any).from('candidats').select('id, prenom, nom, photo_url, pipeline_consultant').in('id', candIds),
    (supabase as any).from('document_types').select('*').in('id', typeIds),
    (supabase as any).from('missions').select('candidat_id, statut, date_fin').in('candidat_id', candIds).eq('statut', 'en_cours'),
  ])

  const candsById = new Map<string, any>()
  for (const c of (candsRes.data || [])) candsById.set(c.id, c)

  const typesById = new Map<string, DocumentType>()
  for (const t of (typesRes.data || [])) typesById.set(t.id, t as DocumentType)

  const missionByCand = new Set<string>()
  const todayIso = new Date().toISOString().slice(0, 10)
  for (const m of (missionsRes.data || [])) {
    // Mission active = en_cours ET (date_fin null OU date_fin >= aujourd'hui)
    if (!m.date_fin || m.date_fin >= todayIso) {
      missionByCand.add(m.candidat_id)
    }
  }

  // 3. Build alertes triées par severity puis days_until
  const alerts: DocumentAlert[] = []
  for (const doc of rawDocs) {
    const days = daysUntilExpiry(doc.expiry_date)
    if (days === null) continue
    const severity = classify(days)
    if (!severity) continue
    const cand = candsById.get(doc.candidat_id)
    if (!cand) continue
    if (opts.consultantEmail && cand.pipeline_consultant !== opts.consultantEmail) continue

    alerts.push({
      document: doc,
      document_type: typesById.get(doc.document_type_id) || null,
      candidat: {
        id: cand.id,
        prenom: cand.prenom,
        nom: cand.nom,
        photo_url: cand.photo_url,
        pipeline_consultant: cand.pipeline_consultant,
      },
      days_until_expiry: days,
      severity,
      has_active_mission: missionByCand.has(doc.candidat_id),
    })
  }

  // Sort by severity (expired > urgent > warning) then by days_until_expiry ASC
  const severityRank: Record<AlertSeverity, number> = { expired: 0, urgent_14: 1, warning_30: 2 }
  alerts.sort((a, b) => {
    const sd = severityRank[a.severity] - severityRank[b.severity]
    if (sd !== 0) return sd
    return a.days_until_expiry - b.days_until_expiry
  })

  return {
    total: alerts.length,
    expired: alerts.filter(a => a.severity === 'expired').length,
    urgent: alerts.filter(a => a.severity === 'urgent_14').length,
    warning: alerts.filter(a => a.severity === 'warning_30').length,
    alerts,
  }
}

/**
 * Variante compacte pour la cloche header (max 8 alertes les plus urgentes).
 */
export async function getDocumentAlertsForBell(consultantEmail?: string): Promise<AlertsSummary> {
  const all = await getDocumentAlerts({ limit: 200, consultantEmail })
  return { ...all, alerts: all.alerts.slice(0, 8) }
}
