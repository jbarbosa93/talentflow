// TalentFlow — Cockpit Santé système (v2.13) — lecture seule, João seul.
// Agrège l'état de 4 sous-systèmes depuis des tables EXISTANTES (aucune écriture) :
//   1. Imports CV / OneDrive   2. Rapports & signatures   3. Emails   4. Crons
// Gating ADMIN_EMAIL côté serveur (comme /api/missions/alertes) : les autres
// reçoivent { allowed: false }.

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const HOUR = 3600_000
const DAY = 86_400_000

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString()
}

// Crons configurés (vercel.json) — horaire humain + clé de suivi éventuelle.
const CRONS = [
  { name: 'onedrive-sync', label: 'Import OneDrive', schedule: 'toutes les 10 min', maxStaleMin: 30 },
  { name: 'extract-cv-text', label: 'Extraction texte CV', schedule: 'toutes les 5 min', maxStaleMin: null },
  { name: 'check-sha256-integrity', label: 'Intégrité SHA256', schedule: 'dim. 03h', maxStaleMin: null },
  { name: 'cleanup-old-data', label: 'Nettoyage données', schedule: 'quotidien 03h15', maxStaleMin: null },
  { name: 'sign-reminders', label: 'Relances Sign', schedule: 'quotidien 09h', maxStaleMin: null },
  { name: 'document-alerts', label: 'Alertes conformité', schedule: 'quotidien 08h', maxStaleMin: null },
  { name: 'auto-arret-reports', label: 'Rapports auto (arrêt)', schedule: 'dim. 20h', maxStaleMin: null },
  { name: 'paiement-rappel-heures', label: 'Rappels paiement', schedule: 'quotidien 07h', maxStaleMin: null },
]

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  // Gating João seul (serveur)
  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  const adminEmail = (process.env.ADMIN_EMAIL || 'j.barbosa@l-agence.ch').trim()
  if (!user || user.email !== adminEmail) {
    return NextResponse.json({ allowed: false })
  }

  const supabase = createAdminClient()

  // Helper : count exact (head:true), tolérant aux erreurs (table absente → null)
  const safeCount = async (table: string, build?: (q: any) => any): Promise<number | null> => {
    try {
      let q = (supabase as any).from(table).select('*', { count: 'exact', head: true })
      if (build) q = build(q)
      const { count, error } = await q
      return error ? null : (count ?? 0)
    } catch { return null }
  }

  // ─── 1. OneDrive / imports ────────────────────────────────────────────────
  const onedrive = await (async () => {
    let lastSync: string | null = null
    let errors: Array<{ nom_fichier: string; erreur: string | null; traite_le: string | null }> = []
    try {
      const { data: last } = await (supabase as any)
        .from('onedrive_fichiers').select('traite_le').order('traite_le', { ascending: false }).limit(1)
      lastSync = last?.[0]?.traite_le ?? null
      const { data: errRows } = await (supabase as any)
        .from('onedrive_fichiers')
        .select('nom_fichier, erreur, traite_le')
        .eq('statut_action', 'error')
        .gte('traite_le', isoDaysAgo(7))
        .order('traite_le', { ascending: false }).limit(8)
      errors = errRows || []
    } catch { /* table absente */ }
    const errors7d = await safeCount('onedrive_fichiers', (q: any) =>
      q.eq('statut_action', 'error').gte('traite_le', isoDaysAgo(7)))
    const aTraiter = await safeCount('candidats', (q: any) => q.eq('import_status', 'a_traiter'))
    return { lastSync, errors7d, aTraiter, errors }
  })()

  // ─── 2. Rapports & signatures ─────────────────────────────────────────────
  const reports = await (async () => {
    const reportLinksActifs = await safeCount('report_links', (q: any) => q.eq('status', 'active'))
    // Soumissions non finalisées (en attente d'une signature)
    const submissionsEnAttente = await safeCount('report_submissions', (q: any) =>
      q.in('status', ['draft', 'candidate_signed', 'client_signed']))
    const submissionsCompletees7d = await safeCount('report_submissions', (q: any) =>
      q.eq('status', 'completed').gte('updated_at', isoDaysAgo(7)))

    // Enveloppes Sign envoyées mais pas finalisées depuis > 7 jours
    let signTrainantes: Array<{ id: string; status: string; created_at: string | null; title: string | null }> = []
    try {
      const { data } = await (supabase as any)
        .from('sign_envelopes')
        .select('id, status, created_at, title')
        .in('status', ['sent', 'in_progress'])
        .lt('created_at', isoDaysAgo(7))
        .order('created_at', { ascending: true }).limit(8)
      signTrainantes = data || []
    } catch { /* pas de colonne title → réessai minimal */
      try {
        const { data } = await (supabase as any)
          .from('sign_envelopes').select('id, status, created_at')
          .in('status', ['sent', 'in_progress']).lt('created_at', isoDaysAgo(7))
          .order('created_at', { ascending: true }).limit(8)
        signTrainantes = (data || []).map((r: any) => ({ ...r, title: null }))
      } catch { /* table absente */ }
    }
    const signEnvoyeesNonSignees = await safeCount('sign_envelopes', (q: any) =>
      q.in('status', ['sent', 'in_progress']))
    return { reportLinksActifs, submissionsEnAttente, submissionsCompletees7d, signEnvoyeesNonSignees, signTrainantes }
  })()

  // ─── 3. Emails / envois (7 derniers jours) ────────────────────────────────
  // statut : 'envoye' = confirmé (Outlook/SMTP) · 'tentative' = canal natif
  // (WhatsApp/SMS/iMessage, non confirmable) · 'a_envoyer' = en file.
  // ⚠️ Aucun statut 'erreur' n'est écrit dans cette table : les échecs d'envoi
  // réels remontent à Sentry, pas ici. On ne crie donc pas à l'échec.
  const emails = await (async () => {
    const envoyes7d = await safeCount('emails_envoyes', (q: any) =>
      q.eq('statut', 'envoye').gte('created_at', isoDaysAgo(7)))
    const natifs7d = await safeCount('emails_envoyes', (q: any) =>
      q.eq('statut', 'tentative').gte('created_at', isoDaysAgo(7)))
    const enFile = await safeCount('emails_envoyes', (q: any) => q.eq('statut', 'a_envoyer'))
    return { envoyes7d, natifs7d, enFile }
  })()

  // ─── 4. Crons ──────────────────────────────────────────────────────────────
  // Pas de table de log → seul onedrive-sync est déductible (traite_le).
  const crons = CRONS.map(c => {
    let lastRun: string | null = null
    let tracked = false
    if (c.name === 'onedrive-sync') {
      lastRun = onedrive.lastSync
      tracked = true
    }
    let stale = false
    if (tracked && lastRun && c.maxStaleMin) {
      stale = Date.now() - new Date(lastRun).getTime() > c.maxStaleMin * 60_000
    }
    return { ...c, lastRun, tracked, stale }
  })

  return NextResponse.json({
    allowed: true,
    generatedAt: new Date().toISOString(),
    onedrive,
    reports,
    emails,
    crons,
    cronTrackingAvailable: false, // pas de table cron_runs (voir proposition cockpit)
  })
}
