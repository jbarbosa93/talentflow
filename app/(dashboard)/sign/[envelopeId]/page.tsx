// TalentFlow Sign — Détail d'une enveloppe (style v2)
// v2.2.0 — Phase 1
'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Send, Trash2, Loader2, Mail, Copy, Check, Bell, MessageCircle, Download, RotateCw, Ban, Edit3, FileText } from 'lucide-react'
import { toast } from 'sonner'
import EnvelopeStatusBadge from '@/components/sign/EnvelopeStatusBadge'
import EnvelopeCategoryIcon from '@/components/sign/EnvelopeCategoryIcon'
import AuditTimeline from '@/components/sign/AuditTimeline'
import type { SignEnvelope, SignAuditEntry, SignToken } from '@/lib/sign/types'
import { CATEGORY_LABELS, recipientStatusLabel } from '@/lib/sign/types'
import { toWhatsAppSafe } from '@/lib/report/text-format'

interface PageProps {
  params: Promise<{ envelopeId: string }>
}

export default function EnvelopeDetailPage({ params }: PageProps) {
  const { envelopeId } = use(params)
  const router = useRouter()
  const [envelope, setEnvelope] = useState<SignEnvelope | null>(null)
  const [audit, setAudit] = useState<SignAuditEntry[]>([])
  const [tokens, setTokens] = useState<SignToken[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [envR, auditR, tokensR] = await Promise.all([
        fetch(`/api/sign/envelopes/${envelopeId}`),
        fetch(`/api/sign/envelopes/${envelopeId}/audit`),
        fetch(`/api/sign/envelopes/${envelopeId}/tokens`),
      ])
      const envD = await envR.json()
      if (envR.ok) setEnvelope(envD.envelope)
      const auditD = await auditR.json()
      if (auditR.ok) setAudit(auditD.audit || [])
      const tokensD = await tokensR.json()
      setTokens(tokensD.tokens || [])
    } catch {
      toast.error('Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopeId])

  const handleSend = async () => {
    if (!envelope || envelope.status !== 'draft') return
    if (!confirm('Envoyer cette enveloppe maintenant ? Phase 1 : génère les tokens (email Resend en Phase 3).')) return
    try {
      const r = await fetch(`/api/sign/envelopes/${envelopeId}/send`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success(`Envoyé · ${d.tokens} destinataire${d.tokens > 1 ? 's' : ''}`)
      fetchData()
    } catch (e: any) {
      toast.error(e.message || 'Erreur envoi')
    }
  }

  // v2.2.0 Phase 3 — Renvoyer un rappel aux destinataires non signés
  const [reminding, setReminding] = useState(false)
  const handleRemind = async () => {
    if (!envelope) return
    if (envelope.status === 'draft' || envelope.status === 'completed' ||
        envelope.status === 'cancelled' || envelope.status === 'declined') return
    if (!confirm('Envoyer un rappel par email aux destinataires non signés ?')) return
    setReminding(true)
    try {
      const r = await fetch(`/api/sign/envelopes/${envelopeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remind' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      const n = d.reminded || 0
      if (n === 0) {
        toast.info('Aucun destinataire à relancer (tous ont déjà signé)')
      } else {
        toast.success(`Rappel envoyé à ${n} destinataire${n > 1 ? 's' : ''}`)
      }
      fetchData()
    } catch (e: any) {
      toast.error(e.message || 'Erreur rappel')
    } finally {
      setReminding(false)
    }
  }

  const handleDelete = async () => {
    if (!envelope) return
    if (!confirm('Supprimer définitivement cette enveloppe ?')) return
    try {
      const r = await fetch(`/api/sign/envelopes/${envelopeId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      toast.success('Enveloppe supprimée')
      router.push('/sign')
    } catch {
      toast.error('Erreur suppression')
    }
  }

  const [downloading, setDownloading] = useState<string | null>(null)
  /**
   * v2.2.5 Phase 4c — Télécharge tous les PDFs signés.
   * Utilise /api/sign/download/[envelopeId] qui s'appuie sur signed_pdf_paths
   * (déterministe + hash SHA-256 par doc) au lieu de lister le bucket.
   * - 1 doc  → PDF inline (Content-Disposition: attachment)
   * - N docs → ZIP DEFLATE
   */
  const handleDownload = async () => {
    if (!envelope) return
    setDownloading('all')
    try {
      const r = await fetch(`/api/sign/download/${envelope.id}`)
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur téléchargement')
      }
      // Utilise le filename renvoyé par le serveur (Content-Disposition)
      const blob = await r.blob()
      const cd = r.headers.get('Content-Disposition') || ''
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      const fallback = `${envelope.title.replace(/[^\w\-.]/g, '_')}.${blob.type === 'application/zip' ? 'zip' : 'pdf'}`
      const filename = m?.[1] ? decodeURIComponent(m[1]) : fallback
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast.error(e.message || 'Erreur téléchargement')
    } finally {
      setDownloading(null)
    }
  }

  /** v2.2.5 Phase 4c — Télécharge UN seul PDF signé via ?doc=index */
  const handleDownloadDoc = async (idx: number, name: string) => {
    if (!envelope) return
    setDownloading(`doc-${idx}`)
    try {
      const r = await fetch(`/api/sign/download/${envelope.id}?doc=${idx}`)
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur téléchargement')
      }
      const blob = await r.blob()
      const filename = name.endsWith('.pdf') ? name : `${name}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast.error(e.message || 'Erreur téléchargement')
    } finally {
      setDownloading(null)
    }
  }

  const [cancelling, setCancelling] = useState(false)
  const handleCancel = async () => {
    if (!envelope) return
    if (!confirm('Annuler cette enveloppe ? Les destinataires ne pourront plus signer.')) return
    setCancelling(true)
    try {
      const r = await fetch(`/api/sign/envelopes/${envelopeId}/cancel`, { method: 'POST' })
      if (!r.ok) throw new Error()
      toast.success('Enveloppe annulée')
      fetchData()
    } catch {
      toast.error('Erreur annulation')
    } finally {
      setCancelling(false)
    }
  }

  const [relaunching, setRelaunching] = useState(false)
  const handleRelaunch = async () => {
    if (!envelope) return
    if (!confirm('Relancer cette enveloppe ? Nouveaux tokens et nouvel envoi.')) return
    setRelaunching(true)
    try {
      const r = await fetch(`/api/sign/envelopes/${envelopeId}/relaunch`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Relancée')
      fetchData()
    } catch (e: any) {
      toast.error(e.message || 'Erreur relance')
    } finally {
      setRelaunching(false)
    }
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  // v2.2.0 — Envoi du lien de signature via WhatsApp (deeplink wa.me)
  // 1) Demande le numéro à l'utilisateur (CH +41 par défaut)
  // 2) Construit un message pré-rempli "Bonjour {nom}, voici votre lien de signature pour {titre}: {url}"
  // 3) Ouvre wa.me dans un nouvel onglet → l'utilisateur appuie envoyer
  const sendViaWhatsApp = (recipientName: string, url: string, envelopeTitle: string) => {
    // Récupère un téléphone par destinataire si déjà saisi auparavant (localStorage)
    const storageKey = `sign_wa_phone_${recipientName.toLowerCase().replace(/\s+/g, '_')}`
    const previous = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
    const raw = window.prompt(
      `Numéro WhatsApp de ${recipientName} (avec indicatif pays)\nEx: +41 79 123 45 67`,
      previous || '+41 ',
    )
    if (!raw) return
    // Normalise : garde uniquement chiffres, ajoute "+" si absent
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 8) {
      toast.error('Numéro invalide')
      return
    }
    // Sauvegarde pour réutilisation
    localStorage.setItem(storageKey, '+' + digits)

    // v2.3.9 Bug 7 — toWhatsAppSafe (LATIN→ASCII) sur prenom + message complet
    const firstName = toWhatsAppSafe(recipientName.split(/\s+/)[0] || recipientName)
    const safeTitle = toWhatsAppSafe(envelopeTitle)
    const rawMsg =
      `Bonjour ${firstName},\n\n` +
      `Voici votre lien sécurisé pour signer électroniquement votre dossier "${safeTitle}" :\n\n` +
      `${url}\n\n` +
      `Le lien est valable 30 jours. À très vite !\n— L-Agence SA`
    const msg = toWhatsAppSafe(rawMsg)

    const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        <div className="neo-empty">
          <div className="neo-empty-icon">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
          <div className="neo-empty-sub">Chargement...</div>
        </div>
      </div>
    )
  }

  if (!envelope) {
    return (
      <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        <div className="neo-empty">
          <div className="neo-empty-title">Enveloppe introuvable</div>
          <div className="neo-empty-sub" style={{ marginTop: 12 }}>
            <Link href="/sign" className="neo-btn-ghost neo-btn-sm">
              <ChevronLeft size={14} />
              Retour à la liste
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // v2.2.5 Phase 4c — PDFs signés persistés (bouton "Télécharger" + section "Documents signés")
  const signedPdfPaths = (envelope as unknown as {
    signed_pdf_paths?: { name: string; path: string; sha256: string }[] | null
  }).signed_pdf_paths || []
  const hasSignedPdfs = envelope.status === 'completed' && signedPdfPaths.length > 0

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Bouton retour */}
      <div style={{ marginBottom: 8 }}>
        <Link
          href="/sign"
          className="neo-btn-ghost neo-btn-sm"
          style={{ padding: '4px 10px' }}
        >
          <ChevronLeft size={14} />
          Signatures
        </Link>
      </div>

      {/* Header */}
      <div className="d-page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'var(--primary-soft)',
              border: '1px solid rgba(245,167,35,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <EnvelopeCategoryIcon category={envelope.document_category} size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="d-page-title" style={{ marginBottom: 2 }}>
              {envelope.title}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <EnvelopeStatusBadge status={envelope.status} />
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {CATEGORY_LABELS[envelope.document_category]}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>·</span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                Créée le{' '}
                {new Date(envelope.created_at).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {envelope.status === 'draft' && (
            <>
              <Link
                href={`/sign/new?draft=${envelope.id}`}
                className="neo-btn-ghost"
              >
                <Edit3 size={14} />
                Modifier
              </Link>
              <button type="button" onClick={handleSend} className="neo-btn-yellow">
                <Send size={14} />
                Envoyer
              </button>
            </>
          )}
          {(envelope.status === 'sent' || envelope.status === 'in_progress') && (
            <>
              <button
                type="button"
                onClick={handleRemind}
                disabled={reminding}
                className="neo-btn-yellow"
                style={{ opacity: reminding ? 0.6 : 1, cursor: reminding ? 'wait' : 'pointer' }}
              >
                {reminding ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                Renvoyer un rappel
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="neo-btn-ghost"
                style={{ color: 'var(--destructive)', opacity: cancelling ? 0.6 : 1 }}
              >
                {cancelling ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                Annuler l&apos;envoi
              </button>
            </>
          )}
          {envelope.status === 'completed' && hasSignedPdfs && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={!!downloading}
              className="neo-btn-yellow"
              style={{ opacity: downloading ? 0.6 : 1 }}
            >
              {downloading === 'all' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {signedPdfPaths.length > 1 ? 'Télécharger tout (ZIP)' : 'Télécharger le PDF signé'}
            </button>
          )}
          {(envelope.status === 'expired' || envelope.status === 'declined' || envelope.status === 'cancelled') && (
            <button
              type="button"
              onClick={handleRelaunch}
              disabled={relaunching}
              className="neo-btn-yellow"
              style={{ opacity: relaunching ? 0.6 : 1 }}
            >
              {relaunching ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
              Relancer
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="neo-btn-ghost"
            style={{ color: 'var(--destructive)' }}
          >
            <Trash2 size={14} />
            Supprimer
          </button>
        </div>
      </div>

      {/* Grid 2 cols */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* Left : message + destinataires + tokens */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {envelope.message && (
            <Card title="Message">
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--foreground)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {envelope.message}
              </p>
            </Card>
          )}

          <Card title="Destinataires">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {envelope.recipients.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--secondary)',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--muted)',
                      flexShrink: 0,
                    }}
                  >
                    <Mail size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)' }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {r.email}
                      {r.role && <span> · {r.role === 'cc' ? 'Copie' : r.role === 'signer' ? 'Signataire' : r.role}</span>}
                    </div>
                  </div>
                  <span className="neo-badge neo-badge-gray">{recipientStatusLabel(r.status)}</span>
                </div>
              ))}
            </div>
          </Card>

          {tokens.length > 0 && (
            <Card title="Liens de signature">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tokens.map(t => {
                  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/sign/v/${t.token}`
                  // Si déjà signé : pas de boutons d'envoi
                  const isSigned = !!t.signed_at
                  return (
                    <div
                      key={t.id}
                      style={{
                        padding: 10,
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        background: 'var(--secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                            {t.recipient_name}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.recipient_email}</div>
                        </div>
                        {isSigned ? (
                          <span className="neo-badge neo-badge-green" style={{ fontSize: 11 }}>
                            <Check size={11} />
                            Signé
                          </span>
                        ) : (
                          <span className="neo-badge neo-badge-gray" style={{ fontSize: 11 }}>
                            En attente
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 11,
                            color: 'var(--muted)',
                            fontFamily: 'var(--font-mono), ui-monospace, monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            background: 'var(--card)',
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                          }}
                        >
                          {url}
                        </span>
                      </div>
                      {!isSigned && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(url, t.id)}
                            className="neo-btn-ghost neo-btn-sm"
                            style={{ fontSize: 12 }}
                          >
                            {copied === t.id ? <Check size={12} /> : <Copy size={12} />}
                            {copied === t.id ? 'Copié' : 'Copier le lien'}
                          </button>
                          <button
                            type="button"
                            onClick={() => sendViaWhatsApp(t.recipient_name, url, envelope?.title || '')}
                            className="neo-btn-sm"
                            style={{
                              fontSize: 12,
                              background: '#25D366',
                              color: '#fff',
                              border: '1px solid #128C7E',
                              padding: '6px 12px',
                              borderRadius: 8,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontFamily: 'inherit',
                              fontWeight: 600,
                            }}
                          >
                            <MessageCircle size={12} />
                            WhatsApp
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* v2.2.5 Phase 4c — Documents signés (visible uniquement si completed + paths) */}
          {hasSignedPdfs && (
            <Card title={`Documents signés (${signedPdfPaths.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {signedPdfPaths.map((doc, idx) => {
                  const isLoading = downloading === `doc-${idx}`
                  return (
                    <div
                      key={`${doc.path}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        background: 'var(--surface)',
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: 'var(--success-soft, #D1FAE5)',
                        color: 'var(--success, #059669)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <FileText size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: 'var(--foreground)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {doc.name}
                        </div>
                        <div style={{
                          fontSize: 10.5, color: 'var(--muted)',
                          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                          marginTop: 2,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                        title={`SHA-256 : ${doc.sha256}`}>
                          SHA-256 · {doc.sha256.slice(0, 16)}…
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadDoc(idx, doc.name)}
                        disabled={!!downloading}
                        title="Télécharger ce document"
                        style={{
                          width: 36, height: 36, borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--foreground)',
                          cursor: downloading ? 'wait' : 'pointer',
                          opacity: downloading && !isLoading ? 0.5 : 1,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                          fontFamily: 'inherit',
                        }}
                      >
                        {isLoading
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Download size={14} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Right : audit */}
        <div>
          <Card title="Audit log">
            <AuditTimeline entries={audit} />
          </Card>
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="neo-card-soft" style={{ padding: 18 }}>
      <h2
        style={{
          margin: '0 0 12px',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--muted)',
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}
