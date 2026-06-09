'use client'
// TalentFlow Mobile /m/rapports/[id] — Détail lien rapport + soumissions (natif, pas de site web)
import { use, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, MessageCircle, Check, Calendar, FileSignature } from 'lucide-react'
import MHeader from '../../_components/MHeader'

interface ReportLink {
  id: string
  slug: string
  title?: string | null
  candidat_id?: string | null
  candidat_name?: string | null
  client_name?: string | null
  status?: string
}
interface Submission {
  id: string
  week_start: string
  week_end: string
  status: string
  candidate_signed_at?: string | null
  client_signed_at?: string | null
  notes_candidat?: string | null
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'draft' },
  candidate_signed: { label: 'Signé candidat', cls: 'progress' },
  client_signed: { label: 'Signé client', cls: 'progress' },
  completed: { label: 'Complété', cls: 'completed' },
  cancelled: { label: 'Annulé', cls: 'expired' },
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function MobileRapportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [copied, setCopied] = useState(false)

  const { data: linkData } = useQuery<{ link: ReportLink }>({
    queryKey: ['m', 'report-link', id],
    queryFn: async () => {
      const r = await fetch(`/api/admin/reports/${id}`, { credentials: 'include' })
      if (!r.ok) throw new Error('not_found')
      return r.json()
    },
  })

  const { data: subData, isLoading } = useQuery<{ submissions: Submission[] }>({
    queryKey: ['m', 'report-subs', id],
    queryFn: async () => {
      const r = await fetch(`/api/admin/reports/${id}/submissions`, { credentials: 'include' })
      if (!r.ok) return { submissions: [] }
      return r.json()
    },
  })

  const link = linkData?.link
  const submissions = subData?.submissions || []
  const reportUrl = link
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://talent-flow.ch'}/report/${link.slug}`
    : ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(reportUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  const waText = encodeURIComponent(
    `Bonjour, voici votre lien pour saisir vos heures (rapport hebdomadaire) : ${reportUrl}`
  )

  const title = link?.candidat_name || link?.title || 'Rapport'

  return (
    <>
      <MHeader title={title} back="/m/rapports" />
      <div className="m-content">
        {link?.client_name && (
          <div className="m-section-title">Entreprise</div>
        )}
        {link?.client_name && (
          <div className="m-info-list">
            <div className="m-info-row"><div className="m-info-val">{link.client_name}</div></div>
          </div>
        )}

        <div className="m-section-title">Lien candidat (saisie des heures)</div>
        <div className="m-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--m-text-soft, #6b6657)', wordBreak: 'break-all' }}>{reportUrl}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink} className="m-btn secondary" style={{ flex: 1, fontSize: 13 }}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copié !' : 'Copier'}
            </button>
            <a
              href={`https://wa.me/?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="m-btn primary"
              style={{ flex: 1, fontSize: 13, background: '#25D366', borderColor: '#25D366' }}
            >
              <MessageCircle size={15} /> WhatsApp
            </a>
          </div>
        </div>

        <div className="m-section-title">Soumissions ({submissions.length})</div>
        {isLoading && <div className="m-loading">Chargement...</div>}
        {!isLoading && submissions.length === 0 && (
          <div className="m-empty"><div className="m-empty-emoji">📭</div><div>Aucune soumission pour l'instant</div></div>
        )}
        {submissions.map((s) => {
          const st = STATUS_LABELS[s.status] || { label: s.status, cls: 'draft' }
          return (
            <div key={s.id} className="m-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Calendar size={18} style={{ color: 'var(--m-text-soft)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="m-card-title" style={{ fontSize: 15 }}>Semaine du {fmtDate(s.week_start)}</div>
                  <div className="m-card-sub">au {fmtDate(s.week_end)}</div>
                </div>
                <span className={`m-badge ${st.cls}`}>{st.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--m-text-soft, #6b6657)' }}>
                <span><FileSignature size={12} style={{ verticalAlign: -1 }} /> Candidat : {s.candidate_signed_at ? fmtDate(s.candidate_signed_at) : '—'}</span>
                <span>Client : {s.client_signed_at ? fmtDate(s.client_signed_at) : '—'}</span>
              </div>
              {s.notes_candidat && (
                <div style={{ fontSize: 13, background: 'rgba(0,0,0,0.03)', borderRadius: 8, padding: '8px 10px' }}>
                  📝 {s.notes_candidat}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
