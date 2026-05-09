// TalentFlow Rapports — Historique des submissions (Phase 5)
// v2.2.6
// Tableau simple : Semaine / Statut / Candidat signé / Client signé / Actions
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getWeekDates } from '@/lib/report/week-helpers'
import { REPORT_STATUS_LABELS, type ReportSubmission } from '@/lib/report/types'

interface Props {
  submissions: ReportSubmission[]
  /** Callback "Voir le PDF" : reçoit le path du 1er PDF signé. */
  onViewPdf?: (submission: ReportSubmission) => void
  /** v2.3.8 Bug 9b — Slug du rapport pour construire les URLs Aperçu/Télécharger */
  slug?: string
  /** Affiche aussi le titre de l'enveloppe (mode cross-link, page Submissions récentes). */
  showLinkColumn?: boolean
  /** Map submissionId → { slug, title, candidat_id, client_name } pour mode cross-link */
  linksMeta?: Record<string, {
    id: string
    slug: string
    title: string
    candidat_id?: string | null
    client_name?: string | null
  }>
}

export default function SubmissionHistoryTable({
  submissions, onViewPdf, slug, showLinkColumn, linksMeta,
}: Props) {
  // v2.3.8 Bug 9b — État loading par submission pour les boutons Télécharger
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // v2.3.8 Bug 9b — Construit l'URL download pour une submission donnée.
  // Mode mono-rapport : slug fourni. Mode cross-link : slug depuis linksMeta.
  const downloadUrl = (s: ReportSubmission): string | null => {
    const sl = slug || linksMeta?.[s.id]?.slug || null
    if (!sl) return null
    return `/api/reports/${sl}/submissions/${s.id}/download`
  }

  const handlePreview = (s: ReportSubmission) => {
    const url = downloadUrl(s)
    if (!url) { toast.error('URL indisponible'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleDownload = async (s: ReportSubmission) => {
    const url = downloadUrl(s)
    if (!url) { toast.error('URL indisponible'); return }
    setDownloadingId(s.id)
    try {
      const r = await fetch(url)
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur téléchargement')
      }
      const blob = await r.blob()
      // Tente d'extraire le filename du Content-Disposition
      const cd = r.headers.get('Content-Disposition') || ''
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
      const filename = m?.[1] ? decodeURIComponent(m[1]) : `rapport-${s.week_start}.pdf`
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 8000)
      toast.success('PDF téléchargé')
    } catch (e: any) {
      toast.error(e.message || 'Erreur téléchargement')
    } finally {
      setDownloadingId(null)
    }
  }

  if (submissions.length === 0) {
    return (
      <div style={{
        padding: '24px 16px',
        textAlign: 'center',
        color: 'var(--muted)',
        fontSize: 13,
        background: 'var(--surface)',
        border: '1px dashed var(--border)',
        borderRadius: 12,
      }}>
        Aucune soumission pour le moment.
      </div>
    )
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--card)',
      overflow: 'hidden',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'inherit',
      }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            {showLinkColumn && <Th>Lien</Th>}
            <Th>Semaine</Th>
            <Th>Statut</Th>
            <Th>Candidat</Th>
            <Th>Client</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {submissions.map(s => {
            const week = getWeekDates(s.week_start)
            const meta = linksMeta?.[s.id]
            const hasPdf = (s.signed_pdf_paths || []).length > 0
            return (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                {showLinkColumn && (
                  <Td>
                    {meta ? (
                      <Link
                        href={`/sign/rapports/${meta.id}`}
                        style={{
                          fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)',
                          textDecoration: 'none',
                        }}
                      >
                        {meta.title}
                      </Link>
                    ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </Td>
                )}
                <Td>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' }}>
                    S{week.weekNumber}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                    {week.label}
                  </div>
                </Td>
                <Td>
                  <StatusBadge status={s.status} />
                </Td>
                <Td>
                  {s.candidate_signed_at
                    ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {formatDateTime(new Date(s.candidate_signed_at))}
                      </span>
                    : <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>—</span>}
                </Td>
                <Td>
                  {s.client_signed_at
                    ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {formatDateTime(new Date(s.client_signed_at))}
                      </span>
                    : <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>—</span>}
                </Td>
                <Td align="right">
                  {/* v2.3.8 Bug 9b — Aperçu (nouvel onglet) + Télécharger (blob)
                      pour toute submission complétée (PDF stocké) ou candidate_signed
                      (preview à la volée). */}
                  {(s.status === 'completed' || s.status === 'client_signed' || s.status === 'candidate_signed') && downloadUrl(s) && (
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => handlePreview(s)}
                        title="Ouvrir le PDF dans un nouvel onglet"
                        style={actionBtnStyle()}
                      >
                        <ExternalLink size={11} />
                        Aperçu
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(s)}
                        disabled={downloadingId === s.id}
                        title="Télécharger le PDF"
                        style={actionBtnStyle()}
                      >
                        {downloadingId === s.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Download size={11} />}
                        Télécharger
                      </button>
                    </div>
                  )}
                  {/* Fallback : ancien callback onViewPdf si parent l'utilise */}
                  {hasPdf && onViewPdf && !slug && !linksMeta?.[s.id]?.slug && (
                    <button
                      type="button"
                      onClick={() => onViewPdf(s)}
                      style={actionBtnStyle()}
                    >
                      <FileText size={11} />
                      PDF
                    </button>
                  )}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{
      padding: '10px 12px',
      textAlign: align || 'left',
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'var(--muted)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}
function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td style={{
      padding: '10px 12px',
      textAlign: align || 'left',
      verticalAlign: 'middle',
      fontSize: 13,
      color: 'var(--foreground)',
    }}>
      {children}
    </td>
  )
}

function actionBtnStyle(): React.CSSProperties {
  return {
    padding: '5px 10px',
    fontSize: 11.5, fontWeight: 600,
    border: '1px solid var(--border)',
    borderRadius: 7,
    background: 'var(--card)',
    color: 'var(--foreground)',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  }
}

function StatusBadge({ status }: { status: ReportSubmission['status'] }) {
  const label = REPORT_STATUS_LABELS[status]
  const cfg: Record<ReportSubmission['status'], { bg: string; color: string }> = {
    draft:            { bg: 'var(--surface-2)',  color: 'var(--muted)' },
    candidate_signed: { bg: '#FEF3C7',           color: '#A16207' },
    client_signed:    { bg: '#DBEAFE',           color: '#1E40AF' },
    completed:        { bg: '#D1FAE5',           color: '#059669' },
    cancelled:        { bg: '#FEE2E2',           color: '#DC2626' },
  }
  const c = cfg[status]
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      background: c.bg, color: c.color,
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`
}
