'use client'
// TalentFlow Mobile /m/sign/[id] — Détail enveloppe (v2.9.72)
// Qui a signé, qui manque + boutons relance/annuler.
import { use, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, X, FileSignature, CheckCircle2, Clock, ExternalLink, User } from 'lucide-react'
import MHeader from '../../_components/MHeader'

interface Recipient {
  name?: string
  email?: string
  phone?: string | null
  role?: string
  roleName?: string
  order?: number
  status?: string
  signed_at?: string | null
}

interface Envelope {
  id: string
  title: string
  status: string
  message?: string | null
  candidate_id?: string | null
  created_at: string
  sent_at?: string | null
  completed_at?: string | null
  expires_at?: string | null
  recipients: Recipient[]
}

function statusBadge(s: string): { cls: string; label: string } {
  switch (s) {
    case 'draft':       return { cls: 'draft',     label: 'Brouillon' }
    case 'sent':        return { cls: 'sent',      label: 'Envoyée' }
    case 'in_progress': return { cls: 'progress',  label: 'En cours' }
    case 'completed':   return { cls: 'completed', label: 'Signée' }
    case 'expired':     return { cls: 'expired',   label: 'Expirée' }
    case 'declined':    return { cls: 'declined',  label: 'Refusée' }
    case 'cancelled':   return { cls: 'cancelled', label: 'Annulée' }
    default:            return { cls: 'draft',     label: s }
  }
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function initials(name?: string): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'
}

export default function MobileEnvelopeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()
  const [flash, setFlash] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery<{ envelope: Envelope }>({
    queryKey: ['m', 'envelope', id],
    queryFn: async () => {
      const r = await fetch(`/api/sign/envelopes/${id}`, { credentials: 'include' })
      if (!r.ok) throw new Error('not_found')
      return r.json()
    },
  })

  const env = data?.envelope

  async function showFlash(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(null), 3000)
  }

  async function relancer() {
    if (!env) return
    setPending('remind')
    try {
      const r = await fetch(`/api/sign/envelopes/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remind' }),
      })
      const j = await r.json()
      if (r.ok) {
        showFlash('Rappel envoyé')
        qc.invalidateQueries({ queryKey: ['m', 'envelope', id] })
      } else {
        showFlash(j.error || 'Erreur')
      }
    } catch {
      showFlash('Erreur réseau')
    } finally {
      setPending(null)
    }
  }

  async function annuler() {
    if (!env) return
    if (!confirm('Annuler cette enveloppe ? Les destinataires ne pourront plus signer.')) return
    setPending('cancel')
    try {
      const r = await fetch(`/api/sign/envelopes/${id}/cancel`, {
        method: 'POST',
        credentials: 'include',
      })
      if (r.ok) {
        showFlash('Enveloppe annulée')
        refetch()
      } else {
        const j = await r.json().catch(() => ({}))
        showFlash(j.error || 'Erreur')
      }
    } catch {
      showFlash('Erreur réseau')
    } finally {
      setPending(null)
    }
  }

  async function envoyer() {
    if (!env) return
    setPending('send')
    try {
      const r = await fetch(`/api/sign/envelopes/${id}/send`, {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        showFlash('Enveloppe envoyée')
        refetch()
      } else {
        showFlash(j.error || 'Erreur')
      }
    } catch {
      showFlash('Erreur réseau')
    } finally {
      setPending(null)
    }
  }

  if (isLoading) {
    return (
      <>
        <MHeader title="Enveloppe" back="/m/sign" />
        <div className="m-loading">Chargement...</div>
      </>
    )
  }

  if (!env) {
    return (
      <>
        <MHeader title="Enveloppe" back="/m/sign" />
        <div className="m-empty">
          <div className="m-empty-emoji">😕</div>
          <div>Enveloppe introuvable</div>
        </div>
      </>
    )
  }

  const badge = statusBadge(env.status)
  const recipients = (env.recipients || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const signed = recipients.filter(r => r.status === 'signed').length
  const total = recipients.length
  const pendingCount = recipients.filter(r => r.status !== 'signed').length
  const canRemind = env.status === 'in_progress' || env.status === 'sent'
  const canCancel = env.status === 'sent' || env.status === 'in_progress' || env.status === 'draft'
  const canSend = env.status === 'draft' && total > 0

  return (
    <>
      <MHeader title={env.title} back="/m/sign" />
      <div className="m-content">
        <div className="m-card" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div className="m-card-title" style={{ fontSize: 17 }}>{env.title}</div>
            <span className={`m-badge ${badge.cls}`}>{badge.label}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--m-text-soft)', marginTop: 4 }}>
            {signed}/{total} signé{signed > 1 ? 's' : ''}
            {env.candidate_id && (
              <> · <Link href={`/m/candidats/${env.candidate_id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>Voir candidat</Link></>
            )}
          </div>
          {env.message && (
            <div style={{ fontSize: 13, marginTop: 8, padding: 10, background: 'var(--m-bg)', borderRadius: 8, width: '100%' }}>
              {env.message}
            </div>
          )}
        </div>

        <div className="m-section-title">
          Destinataires ({total})
          {pendingCount > 0 && env.status !== 'draft' && (
            <span style={{ color: 'var(--m-warn)', textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
              · {pendingCount} en attente
            </span>
          )}
        </div>
        <div className="m-info-list">
          {recipients.map((r, idx) => {
            const isSigned = r.status === 'signed'
            return (
              <div key={idx} className="m-rcpt">
                <div className="m-avatar" style={{ background: isSigned ? '#D1FAE5' : '#FEF3C7' }}>
                  {isSigned
                    ? <CheckCircle2 size={20} style={{ color: '#065F46' }} />
                    : <Clock size={20} style={{ color: '#92400E' }} />}
                </div>
                <div className="m-rcpt-body">
                  <div className="m-rcpt-name">
                    {r.name || r.email || 'Destinataire'}
                    {r.roleName && <span style={{ fontWeight: 400, color: 'var(--m-text-soft)', fontSize: 12 }}> · {r.roleName}</span>}
                  </div>
                  <div className="m-rcpt-meta">
                    {r.email || '—'}
                    {isSigned && r.signed_at && ` · signé le ${fmtDate(r.signed_at)}`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="m-section-title">Chronologie</div>
        <div className="m-info-list">
          <div className="m-info-row">
            <FileSignature size={18} className="m-info-icon" />
            <div style={{ flex: 1 }}>
              <div className="m-info-label">Créée le</div>
              <div className="m-info-val">{fmtDate(env.created_at)}</div>
            </div>
          </div>
          {env.sent_at && (
            <div className="m-info-row">
              <Clock size={18} className="m-info-icon" />
              <div style={{ flex: 1 }}>
                <div className="m-info-label">Envoyée le</div>
                <div className="m-info-val">{fmtDate(env.sent_at)}</div>
              </div>
            </div>
          )}
          {env.completed_at && (
            <div className="m-info-row">
              <CheckCircle2 size={18} className="m-info-icon" />
              <div style={{ flex: 1 }}>
                <div className="m-info-label">Signée le</div>
                <div className="m-info-val">{fmtDate(env.completed_at)}</div>
              </div>
            </div>
          )}
          {env.expires_at && (
            <div className="m-info-row">
              <Clock size={18} className="m-info-icon" />
              <div style={{ flex: 1 }}>
                <div className="m-info-label">Expire le</div>
                <div className="m-info-val">{fmtDate(env.expires_at)}</div>
              </div>
            </div>
          )}
        </div>

        <div className="m-section-title">Actions</div>
        {canSend && (
          <button onClick={envoyer} disabled={!!pending} className="m-btn primary full" style={{ marginBottom: 8 }}>
            <FileSignature size={16} /> {pending === 'send' ? 'Envoi...' : 'Envoyer maintenant'}
          </button>
        )}
        {canRemind && (
          <button onClick={relancer} disabled={!!pending} className="m-btn primary full" style={{ marginBottom: 8 }}>
            <Bell size={16} /> {pending === 'remind' ? 'Envoi...' : `Relancer ${pendingCount} destinataire${pendingCount > 1 ? 's' : ''}`}
          </button>
        )}
        <a href={`/sign/${id}`} className="m-btn secondary full" style={{ marginBottom: 8 }}>
          <ExternalLink size={16} /> Détail complet (desktop)
        </a>
        {canCancel && (
          <button onClick={annuler} disabled={!!pending} className="m-btn danger full">
            <X size={16} /> {pending === 'cancel' ? 'Annulation...' : 'Annuler l\'enveloppe'}
          </button>
        )}
      </div>
      {flash && <div className="m-flash">{flash}</div>}
    </>
  )
}
