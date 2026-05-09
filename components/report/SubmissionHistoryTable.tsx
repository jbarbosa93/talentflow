// TalentFlow Rapports — Historique des submissions (Phase 5)
// v2.2.6
// Tableau simple : Semaine / Statut / Candidat signé / Client signé / Actions
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Award, Download, Eye, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getWeekDates } from '@/lib/report/week-helpers'
import { REPORT_STATUS_LABELS, type ReportSubmission } from '@/lib/report/types'
import PdfPreviewModal from './PdfPreviewModal'

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
  // v2.3.9 Bug 2a — Modal viewer (kind = 'report' | 'certificate')
  const [previewState, setPreviewState] = useState<
    | { url: string; filename: string; title: string }
    | null
  >(null)

  // v2.3.8 Bug 9b — Construit l'URL download (rapport) pour une submission.
  // v2.3.9 Bug 11c — Ajoute aussi certificateUrl (route dédiée).
  const reportUrl = (s: ReportSubmission): string | null => {
    const sl = slug || linksMeta?.[s.id]?.slug || null
    if (!sl) return null
    return `/api/reports/${sl}/submissions/${s.id}/download`
  }
  const certificateUrl = (s: ReportSubmission): string | null => {
    const sl = slug || linksMeta?.[s.id]?.slug || null
    if (!sl) return null
    return `/api/reports/${sl}/submissions/${s.id}/certificate`
  }

  // v2.3.9 Bug 11c — Détecte si la submission a un certificat (filename contient 'certificat')
  const hasCertificate = (s: ReportSubmission): boolean =>
    (s.signed_pdf_paths || []).some(p => /certificat/i.test(p.name || '') || /certificat/i.test(p.path || ''))

  // v2.3.9 Bug 2a — Aperçu = ouvre le modal viewer (au lieu d'ouvrir nouvel onglet)
  const handlePreview = (s: ReportSubmission, kind: 'report' | 'certificate' = 'report') => {
    const url = kind === 'certificate' ? certificateUrl(s) : reportUrl(s)
    if (!url) { toast.error('URL indisponible'); return }
    const week = getWeekDates(s.week_start)
    const prefix = kind === 'certificate' ? 'Certificat' : 'Rapport'
    setPreviewState({
      url,
      filename: `${prefix}-S${week.weekNumber}-${s.week_start}.pdf`,
      title: `${prefix} · Semaine ${week.weekNumber} (${week.label})`,
    })
  }

  const handleDownload = async (s: ReportSubmission, kind: 'report' | 'certificate' = 'report') => {
    const url = kind === 'certificate' ? certificateUrl(s) : reportUrl(s)
    if (!url) { toast.error('URL indisponible'); return }
    setDownloadingId(s.id + ':' + kind)
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
      const fallback = kind === 'certificate' ? 'certificat' : 'rapport'
      const filename = m?.[1] ? decodeURIComponent(m[1]) : `${fallback}-${s.week_start}.pdf`
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 8000)
      toast.success(`${kind === 'certificate' ? 'Certificat' : 'PDF'} téléchargé`)
    } catch (e: any) {
      toast.error(e.message || 'Erreur téléchargement')
    } finally {
      setDownloadingId(null)
    }
  }

  if (submissions.length === 0) {
    return (
      <>
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
        {previewState && (
          <PdfPreviewModal
            url={previewState.url}
            filename={previewState.filename}
            title={previewState.title}
            onClose={() => setPreviewState(null)}
          />
        )}
      </>
    )
  }

  return (
    <>
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
                  {/* v2.3.9 Bug 2a + 11c — Aperçu (modal iframe) +
                      Télécharger Rapport + Certificat (route dédiée). */}
                  {(s.status === 'completed' || s.status === 'client_signed' || s.status === 'candidate_signed') && reportUrl(s) && (
                    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => handlePreview(s, 'report')}
                        title="Aperçu du rapport dans un modal"
                        style={actionBtnStyle()}
                      >
                        <Eye size={11} />
                        Aperçu
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(s, 'report')}
                        disabled={downloadingId === s.id + ':report'}
                        title="Télécharger le rapport signé"
                        style={actionBtnStyle()}
                      >
                        {downloadingId === s.id + ':report'
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Download size={11} />}
                        Rapport
                      </button>
                      {/* Bug 11c — Bouton Certificat uniquement si présent en Storage */}
                      {hasCertificate(s) && (
                        <button
                          type="button"
                          onClick={() => handleDownload(s, 'certificate')}
                          disabled={downloadingId === s.id + ':certificate'}
                          title="Télécharger le certificat de signature"
                          style={actionBtnStyle('#A16207')}
                        >
                          {downloadingId === s.id + ':certificate'
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Award size={11} />}
                          Certificat
                        </button>
                      )}
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
    {previewState && (
      <PdfPreviewModal
        url={previewState.url}
        filename={previewState.filename}
        title={previewState.title}
        onClose={() => setPreviewState(null)}
      />
    )}
    </>
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

function actionBtnStyle(color?: string): React.CSSProperties {
  return {
    padding: '5px 10px',
    fontSize: 11.5, fontWeight: 600,
    border: '1px solid var(--border)',
    borderRadius: 7,
    background: 'var(--card)',
    color: color || 'var(--foreground)',
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
