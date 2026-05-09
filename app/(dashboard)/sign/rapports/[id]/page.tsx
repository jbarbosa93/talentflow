// TalentFlow Rapports — Détail d'un lien permanent (Phase 5)
// v2.2.6
'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ClipboardList, Copy, Check, Loader2, MessageCircle, Pause, Play, Trash2, Edit3,
} from 'lucide-react'
import { toast } from 'sonner'
import SubmissionHistoryTable from '@/components/report/SubmissionHistoryTable'
import {
  REPORT_LINK_STATUS_LABELS, type ReportLink, type ReportSubmission,
} from '@/lib/report/types'
import { toWhatsAppSafe } from '@/lib/report/text-format'

export default function ReportLinkDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [link, setLink] = useState<ReportLink | null>(null)
  const [submissions, setSubmissions] = useState<ReportSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [linkR, subR] = await Promise.all([
        fetch(`/api/admin/reports/${id}`),
        fetch(`/api/admin/reports/${id}/submissions`),
      ])
      const linkD = await linkR.json()
      if (linkR.ok) setLink(linkD.link)
      const subD = await subR.json()
      setSubmissions(subD.submissions || [])
    } catch {
      toast.error('Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const publicUrl = link
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/report/${link.slug}`
    : ''

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true)
      toast.success('Lien copié')
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const handleSendWhatsApp = () => {
    if (!link) return
    // v2.3.x — Utilise candidat_name (source unique) ; fallback : title nettoyé du préfixe
    const fullName = link.candidat_name
      || (link.title || '').replace(/^Rapport\s+(?:d'?heures\s+)?-?\s*/i, '').split(/\s+[—–-]\s+/)[0].trim()
    // v2.3.9 Bug 7 — toWhatsAppSafe sur le MESSAGE ENTIER (pas seulement prenom).
    // Map LATIN_MAP exhaustive evite ❓ partout dans le contenu envoye.
    const firstName = toWhatsAppSafe(fullName.split(/\s+/)[0] || '')
    const greeting = firstName ? `Bonjour ${firstName} 👋` : 'Bonjour 👋'
    const rawMsg = `${greeting}\n\nVoici votre lien permanent pour soumettre votre rapport d'heures chaque semaine :\n\n${publicUrl}\n\nGardez ce lien — il reste valable, vous pouvez l'utiliser à chaque fin de semaine.\n\n— L-Agence SA`
    const msg = toWhatsAppSafe(rawMsg)
    // v2.3.x Bug 9 — Deep link wa.me/{numero}?text=... si candidat_phone disponible
    // Sinon wa.me/?text=... (user choisit le contact dans WhatsApp).
    // E.164 → digits-only pour wa.me (vire le +).
    const phoneDigits = link.candidat_phone
      ? link.candidat_phone.replace(/\D/g, '')
      : ''
    const url = phoneDigits
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    if (!phoneDigits) {
      toast.warning('Pas de WhatsApp candidat configuré — choisis le contact dans WhatsApp')
    }
    // v2.3.8 Bug 3b — window.open _blank pour ouvrir un nouvel onglet
    // (preserve la page rapport dans l'onglet courant ; la page actuelle reste).
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handlePauseResume = async () => {
    if (!link) return
    const newStatus = link.status === 'paused' ? 'active' : 'paused'
    try {
      const r = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!r.ok) throw new Error()
      toast.success(newStatus === 'paused' ? 'Lien mis en pause' : 'Lien réactivé')
      fetchData()
    } catch {
      toast.error('Erreur')
    }
  }

  const handleRevoke = async () => {
    if (!link) return
    if (!confirm(`Révoquer le lien ? Les futures soumissions seront bloquées (les anciennes restent accessibles).`)) return
    try {
      const r = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'revoked' }),
      })
      if (!r.ok) throw new Error()
      toast.success('Lien révoqué')
      fetchData()
    } catch {
      toast.error('Erreur')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer définitivement ce lien et toutes ses soumissions ?')) return
    try {
      const r = await fetch(`/api/admin/reports/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      toast.success('Lien supprimé')
      router.push('/sign/rapports')
    } catch {
      toast.error('Erreur suppression')
    }
  }

  if (loading) {
    return (
      <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        <div className="neo-empty">
          <div className="neo-empty-icon">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
          <div className="neo-empty-sub">Chargement…</div>
        </div>
      </div>
    )
  }
  if (!link) {
    return (
      <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        <div className="neo-empty">
          <div className="neo-empty-title">Lien introuvable</div>
          <div className="neo-empty-sub" style={{ marginTop: 12 }}>
            <Link href="/sign/rapports" className="neo-btn-ghost neo-btn-sm">
              <ChevronLeft size={14} />
              Retour aux liens
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const isActive = link.status === 'active'
  const isPaused = link.status === 'paused'
  const isRevoked = link.status === 'revoked'

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Bouton retour */}
      <div style={{ marginBottom: 8 }}>
        <Link href="/sign/rapports" className="neo-btn-ghost neo-btn-sm" style={{ padding: '4px 10px' }}>
          <ChevronLeft size={14} />
          Liens rapports
        </Link>
      </div>

      {/* Header */}
      <div className="d-page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--primary-soft)',
            border: '1px solid rgba(245,167,35,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
            color: 'var(--primary, #A16207)',
          }}>
            <ClipboardList size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="d-page-title" style={{ marginBottom: 2 }}>{link.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{
                padding: '3px 8px',
                borderRadius: 999,
                background: isActive ? '#D1FAE5' : isPaused ? '#FEF3C7' : '#FEE2E2',
                color:      isActive ? '#059669' : isPaused ? '#A16207' : '#DC2626',
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                {REPORT_LINK_STATUS_LABELS[link.status]}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {link.client_name || 'Pas de client'}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>·</span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {submissions.length} soumission{submissions.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {!isRevoked && (
            <>
              <button type="button" onClick={handleCopy} className="neo-btn-ghost">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                Copier le lien
              </button>
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="neo-btn-ghost"
                style={{ color: '#25D366' }}
              >
                <MessageCircle size={14} />
                WhatsApp
              </button>
              {isPaused
                ? <button type="button" onClick={handlePauseResume} className="neo-btn-yellow">
                    <Play size={14} /> Réactiver
                  </button>
                : <button type="button" onClick={handlePauseResume} className="neo-btn-ghost">
                    <Pause size={14} /> Pause
                  </button>}
              <button type="button" onClick={handleRevoke} className="neo-btn-ghost" style={{ color: 'var(--destructive)' }}>
                <Trash2 size={14} /> Révoquer
              </button>
              {/* v2.3.9 Bug 2b — Bouton Supprimer DÉFINITIF disponible aussi
                  hors statut révoqué (rouge fond, distingue de Révoquer). */}
              <button
                type="button"
                onClick={handleDelete}
                className="neo-btn-ghost"
                style={{
                  color: '#fff',
                  background: 'var(--destructive)',
                  borderColor: 'var(--destructive)',
                }}
                title="Supprime définitivement le lien et toutes ses soumissions (irréversible)"
              >
                <Trash2 size={14} /> Supprimer
              </button>
            </>
          )}
          {isRevoked && (
            <button type="button" onClick={handleDelete} className="neo-btn-ghost" style={{ color: 'var(--destructive)' }}>
              <Trash2 size={14} /> Supprimer définitivement
            </button>
          )}
        </div>
      </div>

      {/* Lien public */}
      <div style={{
        marginTop: 18,
        padding: '14px 16px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--muted)', marginBottom: 4,
          }}>
            Lien permanent
          </div>
          <div style={{
            fontSize: 13,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            color: 'var(--foreground)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {publicUrl}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="neo-btn-ghost neo-btn-sm"
          title="Copier"
          style={{ flexShrink: 0 }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      {/* v2.3.9 Bug 6 — InfoCard "WhatsApp client" supprimée (canal email-only depuis v2.3.7) */}
      <div style={{
        marginTop: 14,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10,
      }}>
        <InfoCard label="Candidat" value={link.candidat_name || '—'} />
        <InfoCard label="Email candidat" value={link.candidat_email || '—'} />
        <InfoCard label="WhatsApp candidat" value={link.candidat_phone || '—'} />
        <InfoCard label="Entreprise client" value={link.client_name || '—'} />
        <InfoCard label="Contact client" value={link.client_contact_name || '—'} />
        <InfoCard label="Email client" value={link.client_email || '—'} />
        <InfoCard label="Canal de notif" value={link.delivery_channel} />
      </div>

      {/* Historique */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{
          fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--muted)', marginBottom: 10,
        }}>
          Historique des soumissions
        </h2>
        <SubmissionHistoryTable submissions={submissions} slug={link.slug} />
      </div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: 12,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--muted)', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--foreground)', wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  )
}
