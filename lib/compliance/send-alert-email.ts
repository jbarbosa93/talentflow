// TalentFlow Compliance — Email agrégé quotidien des alertes documents
// v2.7.3
//
// Envoyé chaque matin par le cron /api/cron/document-alerts à 8h00.
// Destinataire unique : info@l-agence.ch (toute l'équipe sur cette boîte).
// Plus de routage par consultant — tout va à L-Agence.

import type { DocumentAlert } from './alerts'
import { formatExpiryDate } from './document-status'

const FROM_DEFAULT = 'TalentFlow Conformité <noreply@talent-flow.ch>'

export interface SendAlertEmailResult {
  ok: boolean
  id?: string
  error?: string
}

export type AlertEmailAudience = 'admin' | 'consultant'

export async function sendDocumentAlertsEmail(args: {
  to: string
  audience: AlertEmailAudience
  consultantName?: string | null
  alerts: DocumentAlert[]
  totalExpired: number
  totalUrgent: number
  totalWarning: number
  baseUrl: string
}): Promise<SendAlertEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  if (!args.to) return { ok: false, error: 'destinataire vide' }
  if (args.alerts.length === 0) return { ok: false, error: 'aucune alerte' }

  const total = args.alerts.length
  const subject = args.totalExpired > 0
    ? `🚨 ${args.totalExpired} document${args.totalExpired > 1 ? 's' : ''} expiré${args.totalExpired > 1 ? 's' : ''} · ${total} alerte${total > 1 ? 's' : ''} conformité`
    : `⚠️ ${total} document${total > 1 ? 's' : ''} expire${total > 1 ? 'nt' : ''} bientôt — TalentFlow Conformité`

  const greeting = args.audience === 'consultant' && args.consultantName
    ? `Bonjour ${escapeHtml(args.consultantName.split(/\s+/)[0])},`
    : 'Bonjour,'

  const html = buildHtml({
    greeting,
    audience: args.audience,
    alerts: args.alerts,
    totalExpired: args.totalExpired,
    totalUrgent: args.totalUrgent,
    totalWarning: args.totalWarning,
    baseUrl: args.baseUrl,
  })
  const text = buildText({
    greeting,
    alerts: args.alerts,
    baseUrl: args.baseUrl,
  })

  return await sendResend({ to: args.to, subject, html, text })
}

function buildHtml(p: {
  greeting: string
  audience: AlertEmailAudience
  alerts: DocumentAlert[]
  totalExpired: number
  totalUrgent: number
  totalWarning: number
  baseUrl: string
}): string {
  const tableRows = p.alerts.map(a => {
    const candName = `${a.candidat.prenom || ''} ${a.candidat.nom || ''}`.trim() || 'Candidat'
    const docLabel = a.document.label || a.document_type?.name || 'Document'
    const days = a.days_until_expiry
    let statusText = ''
    let statusColor = '#A16207'
    let statusBg = '#FEF3C7'
    if (a.severity === 'expired') {
      statusText = days === 0 ? 'Expiré aujourd\'hui' : `Expiré ${Math.abs(days)}j`
      statusColor = '#991B1B'
      statusBg = '#FEE2E2'
    } else if (a.severity === 'urgent_14') {
      statusText = days === 0 ? 'Expire aujourd\'hui' : `Expire dans ${days}j`
      statusColor = '#9A3412'
      statusBg = '#FED7AA'
    } else {
      statusText = `Expire dans ${days}j`
    }
    const expiryStr = formatExpiryDate(a.document.expiry_date as string | null)
    const candidatUrl = `${p.baseUrl}/candidats/${a.candidat.id}?from=alertes`
    return `
      <tr style="border-top:1px solid #E5E7EB;">
        <td style="padding:10px 8px;font-size:13px;color:#1C1A14;">
          <a href="${candidatUrl}" style="color:#1C1A14;text-decoration:none;font-weight:600;">${escapeHtml(candName)}</a>
          ${a.has_active_mission ? '<span style="display:inline-block;margin-left:6px;padding:1px 6px;background:#DCFCE7;color:#16A34A;font-size:9px;font-weight:700;border-radius:4px;">EN MISSION</span>' : ''}
        </td>
        <td style="padding:10px 8px;font-size:12.5px;color:#374151;">${escapeHtml(docLabel)}</td>
        <td style="padding:10px 8px;font-size:12px;color:#6B7280;font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(expiryStr)}</td>
        <td style="padding:10px 8px;text-align:right;white-space:nowrap;">
          <span style="display:inline-block;padding:3px 8px;background:${statusBg};color:${statusColor};font-size:11px;font-weight:700;border-radius:99px;">${escapeHtml(statusText)}</span>
        </td>
      </tr>`
  }).join('')

  const audienceTitle = p.audience === 'consultant'
    ? 'Vos candidats — récapitulatif quotidien'
    : 'Récapitulatif quotidien — toute l\'agence'

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence" width="200" style="height:42px;width:auto;display:inline-block;border:0;" />
      <div style="font-size:9px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Conformité documents</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px 26px;">
      <div style="display:inline-block;background:#FED7AA;color:#9A3412;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:14px;">
        🪪 Alertes conformité
      </div>
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#1C1A14;margin:0 0 12px;line-height:1.25;">
        ${p.greeting}
      </h1>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 18px;">
        ${escapeHtml(audienceTitle)}
      </p>

      <!-- KPI row -->
      <table cellpadding="0" cellspacing="0" style="width:100%;margin:14px 0;">
        <tr>
          <td style="padding:10px;background:#FEE2E2;border-radius:8px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#991B1B;">${p.totalExpired}</div>
            <div style="font-size:10px;color:#991B1B;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">Expirés</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:10px;background:#FED7AA;border-radius:8px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#9A3412;">${p.totalUrgent}</div>
            <div style="font-size:10px;color:#9A3412;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">&lt; 14 jours</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:10px;background:#FEF3C7;border-radius:8px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#A16207;">${p.totalWarning}</div>
            <div style="font-size:10px;color:#A16207;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">15 - 30 jours</div>
          </td>
        </tr>
      </table>

      <!-- Tableau alertes -->
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:16px;border-collapse:collapse;">
        <thead>
          <tr style="background:#FAFAF7;">
            <th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Candidat</th>
            <th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Document</th>
            <th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Échéance</th>
            <th style="padding:8px;text-align:right;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Statut</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <div style="text-align:center;margin-top:22px;">
        <a href="${p.baseUrl}/alertes" style="display:inline-block;background:#EAB308;color:#1C1A14;padding:12px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:1px solid #1C1A14;">
          Voir toutes les alertes →
        </a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:18px;">
      L-Agence SA · TalentFlow Conformité · Notification quotidienne (8h00)
    </p>
  </div>
</body></html>`
}

function buildText(p: { greeting: string; alerts: DocumentAlert[]; baseUrl: string }): string {
  const lines = p.alerts.map(a => {
    const candName = `${a.candidat.prenom || ''} ${a.candidat.nom || ''}`.trim() || 'Candidat'
    const doc = a.document.label || a.document_type?.name || 'Document'
    const days = a.days_until_expiry
    const status = a.severity === 'expired'
      ? `EXPIRÉ depuis ${Math.abs(days)}j`
      : a.severity === 'urgent_14'
        ? `URGENT — expire dans ${days}j`
        : `Attention — expire dans ${days}j`
    return `- ${candName} · ${doc} · ${status}`
  }).join('\n')
  return [
    p.greeting,
    '',
    `${p.alerts.length} alerte(s) de conformité aujourd'hui :`,
    '',
    lines,
    '',
    `Voir tout : ${p.baseUrl}/alertes`,
  ].join('\n')
}

async function sendResend(p: { to: string; subject: string; html: string; text: string }): Promise<SendAlertEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY manquant' }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_DEFAULT,
        to: p.to,
        subject: p.subject,
        html: p.html,
        text: p.text,
      }),
    })
    if (!r.ok) {
      const err = await r.text().catch(() => `HTTP ${r.status}`)
      return { ok: false, error: err.slice(0, 200) }
    }
    const data = await r.json() as { id?: string }
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  }
}

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
