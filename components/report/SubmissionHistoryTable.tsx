// TalentFlow Rapports — Historique des submissions (Phase 5)
// v2.2.6
// Tableau simple : Semaine / Statut / Candidat signé / Client signé / Actions
'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Award, Download, Eye, FileText, Loader2, Pencil, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getWeekDates } from '@/lib/report/week-helpers'
import { REPORT_STATUS_LABELS, type ReportSubmission, type ReportLinkClient } from '@/lib/report/types'
import { toWhatsAppSafe } from '@/lib/report/text-format'
import PdfPreviewModal from './PdfPreviewModal'
import AdminCorrectModal from './AdminCorrectModal'
import RequestCorrectionModal from './RequestCorrectionModal'

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
  /** v2.6.17 — Callback après une correction de semaine réussie (re-fetch parent). */
  onCorrected?: () => void
  /** v2.9.2 — Liste des entreprises destinataires (pour bouton WhatsApp client par submission). */
  clients?: ReportLinkClient[]
  /** v2.9.2 — Nom du candidat (utilisé dans le message WhatsApp envoyé au client). */
  candidatName?: string | null
  /** v2.9.42 — Téléphone candidat (E.164) — bouton « Renvoyer pour correction ». */
  candidatPhone?: string | null
  /** v2.9.42 — Email candidat — bouton « Renvoyer pour correction ». */
  candidatEmail?: string | null
}

export default function SubmissionHistoryTable({
  submissions, onViewPdf, slug, showLinkColumn, linksMeta, onCorrected, clients, candidatName,
  candidatPhone, candidatEmail,
}: Props) {
  // v2.3.8 Bug 9b — État loading par submission pour les boutons Télécharger
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  // v2.3.9 Bug 2a — Modal viewer (kind = 'report' | 'certificate')
  const [previewState, setPreviewState] = useState<
    | { url: string; filename: string; title: string }
    | null
  >(null)
  // v2.9.42 — Modal « Corriger » (l'admin modifie tout le rapport lui-même)
  const [adminCorrectSubmission, setAdminCorrectSubmission] = useState<ReportSubmission | null>(null)
  // v2.9.42 — Modal « Renvoyer pour correction »
  const [correctionSubmission, setCorrectionSubmission] = useState<ReportSubmission | null>(null)
  // v2.9.42 — Confirmation de suppression
  const [deletingSubmission, setDeletingSubmission] = useState<ReportSubmission | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

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

  // v2.9.42 — Suppression définitive d'un rapport
  const handleDelete = async () => {
    if (!deletingSubmission) return
    setDeleteBusy(true)
    try {
      const r = await fetch(`/api/admin/reports/submissions/${deletingSubmission.id}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Erreur suppression')
      toast.success('Rapport supprimé')
      setDeletingSubmission(null)
      onCorrected?.()
    } catch (e: any) {
      toast.error(e.message || 'Erreur suppression')
    } finally {
      setDeleteBusy(false)
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
                  <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <StatusBadge status={s.status} />
                      {/* v2.4.0 — Icône 📝 si notes (candidat ou client) avec tooltip */}
                      {(() => {
                        const nc = (s as any).notes_candidat as string | null | undefined
                        const ncl = (s as any).notes_client as string | null | undefined
                        if (!nc && !ncl) return null
                        const tip = [
                          nc ? `Note candidat : ${nc}` : '',
                          ncl ? `Note client : ${ncl}` : '',
                        ].filter(Boolean).join('\n')
                        return (
                          <span
                            title={tip}
                            aria-label="Note présente"
                            style={{
                              fontSize: 13, cursor: 'help',
                              opacity: 0.85,
                            }}
                          >
                            📝
                          </span>
                        )
                      })()}
                    </div>
                    {(s as any).metadata?.client_modified && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: '#FEF3C7',
                        color: '#92400E',
                        border: '1px solid #FDE68A',
                        whiteSpace: 'nowrap',
                      }}>
                        ✏️ Modifié par le client
                      </span>
                    )}
                  </div>
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
                      {/* v2.9.2 — WhatsApp au client (si rapport en attente de signature client).
                          Pratique quand le client ne réagit pas à l'email. */}
                      {s.status === 'candidate_signed' && s.client_token && (
                        (() => {
                          const sl = slug || linksMeta?.[s.id]?.slug
                          if (!sl) return null
                          const client = clients?.find(c => c.id === s.report_link_client_id)
                          const phoneDigits = (client?.client_phone || '').replace(/\D/g, '')
                          const signUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/report/client/${s.client_token}`
                          const week = getWeekDates(s.week_start)
                          const greetingName = client?.client_contact_name?.split(/\s+/)[0] || ''
                          const greeting = greetingName ? `Bonjour ${greetingName},` : 'Bonjour,'
                          const cand = (candidatName || '').trim() || 'le collaborateur'
                          const rawMsg = `${greeting}\n\n${cand} a soumis son rapport d'heures de la semaine ${week.weekNumber}. Pouvez-vous le valider via le lien ci-dessous ?\n\n${signUrl}\n\nMerci !\n\n— L-Agence SA`
                          const msg = toWhatsAppSafe(rawMsg)
                          const url = phoneDigits
                            ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`
                            : `https://wa.me/?text=${encodeURIComponent(msg)}`
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (!phoneDigits) toast.warning('Pas de WhatsApp client configuré — choisis le contact dans WhatsApp')
                                window.open(url, '_blank', 'noopener,noreferrer')
                              }}
                              title="Envoyer le lien de validation au client par WhatsApp"
                              style={actionBtnStyle('#25D366')}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-1 1.1-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.5 1.8.8 2.5.8 3.4.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
                              WhatsApp client
                            </button>
                          )
                        })()
                      )}
                      {/* v2.9.42 — Corriger : l'admin modifie tout le rapport lui-même
                          (heures, repas, semaine…), régénère le PDF et l'envoie corrigé. */}
                      {(s.status === 'completed' || s.status === 'client_signed' || s.status === 'candidate_signed') && (
                        <button
                          type="button"
                          onClick={() => setAdminCorrectSubmission(s)}
                          title="Corriger le rapport (modifier les heures, repas, semaine…)"
                          style={actionBtnStyle('#F97316')}
                        >
                          <Pencil size={11} />
                          Corriger
                        </button>
                      )}
                      {/* v2.9.42 — Renvoyer le rapport au candidat pour qu'il le corrige
                          lui-même (efface les signatures, le rapport redevient modifiable). */}
                      {(s.status === 'completed' || s.status === 'client_signed' || s.status === 'candidate_signed') && (
                        <button
                          type="button"
                          onClick={() => setCorrectionSubmission(s)}
                          title="Renvoyer le rapport au candidat pour correction (efface les signatures)"
                          style={actionBtnStyle('#2563EB')}
                        >
                          <Send size={11} />
                          Renvoyer pour correction
                        </button>
                      )}
                    </div>
                  )}
                  {/* v2.9.42 — Supprimer — disponible sur TOUS les rapports (tous statuts) */}
                  <div style={{
                    display: 'inline-flex', justifyContent: 'flex-end',
                    marginTop: (s.status === 'completed' || s.status === 'client_signed' || s.status === 'candidate_signed') && reportUrl(s) ? 6 : 0,
                  }}>
                    <button
                      type="button"
                      onClick={() => setDeletingSubmission(s)}
                      title="Supprimer définitivement ce rapport"
                      style={actionBtnStyle('#DC2626')}
                    >
                      <Trash2 size={11} />
                      Supprimer
                    </button>
                  </div>
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
    {adminCorrectSubmission && (
      <AdminCorrectModal
        submission={adminCorrectSubmission}
        candidatName={candidatName ?? null}
        onClose={() => setAdminCorrectSubmission(null)}
        onDone={() => { onCorrected?.() }}
      />
    )}
    {correctionSubmission && (
      <RequestCorrectionModal
        submission={correctionSubmission}
        slug={slug || linksMeta?.[correctionSubmission.id]?.slug || ''}
        candidatName={candidatName ?? null}
        candidatPhone={candidatPhone ?? null}
        candidatEmail={candidatEmail ?? null}
        onClose={() => setCorrectionSubmission(null)}
        onDone={() => { onCorrected?.() }}
      />
    )}
    {deletingSubmission && typeof document !== 'undefined' && createPortal(
      <div
        onClick={() => { if (!deleteBusy) setDeletingSubmission(null) }}
        style={{
          position: 'fixed', inset: 0, zIndex: 9600,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: 'min(440px, 100%)', background: 'var(--card)',
            border: '1px solid var(--border)', borderRadius: 16, padding: 24,
            boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          }}
        >
          <h3 style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 21, fontWeight: 400, color: 'var(--foreground)',
          }}>
            Supprimer ce rapport ?
          </h3>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
            Le rapport de la <strong>semaine {getWeekDates(deletingSubmission.week_start).weekNumber}</strong> sera
            définitivement supprimé (portail candidat, portail client et dashboard). La semaine se libère —
            le candidat pourra la re-soumettre. <strong>Action irréversible.</strong>
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button" disabled={deleteBusy}
              onClick={() => setDeletingSubmission(null)}
              style={{
                height: 38, padding: '0 14px', border: '1px solid var(--border)',
                borderRadius: 9, background: 'var(--card)', color: 'var(--foreground)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Annuler
            </button>
            <button
              type="button" disabled={deleteBusy} onClick={handleDelete}
              style={{
                height: 38, padding: '0 16px', border: '1px solid #DC2626',
                borderRadius: 9, background: '#DC2626', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: deleteBusy ? 0.6 : 1,
              }}
            >
              {deleteBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Supprimer définitivement
            </button>
          </div>
        </div>
      </div>,
      document.body,
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
