'use client'

// UI dashboard pour gérer les comptes d'accès à un portail client OU un lien rapport
// - Liste des comptes avec statut (invité / actif / révoqué)
// - Bouton "+ Inviter" → modal email seulement
// - Boutons par compte : Renvoyer invitation / Révoquer / Réactiver / Supprimer

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

type AccountType = 'client' | 'candidat'

interface PortalAccount {
  id: string
  email: string
  account_type: AccountType
  invited_at: string | null
  password_set_at: string | null
  last_login_at: string | null
  is_revoked: boolean
  status: 'invited' | 'active' | 'revoked'
}

interface Props {
  /** Pour portail client */
  portalId?: string
  /** Pour lien rapport candidat */
  reportLinkId?: string
  /** Type de compte à créer */
  accountType: AccountType
  /** Label affiché dans l'email d'invitation (ex: nom entreprise ou candidat) */
  contextLabel?: string
  /** Valeur initiale du flag auth_required (toggle "Accès protégé") */
  authRequired?: boolean
  /** Callback quand auth_required change (pour rafraîchir le parent si besoin) */
  onAuthRequiredChange?: (next: boolean) => void
  /** v2.9.8 — Email pré-rempli quand l'admin ouvre la modal d'invitation
   *  (ex: email du candidat sur /sign/rapports/[id], email client sur portail). */
  defaultInviteEmail?: string | null
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}

function statusBadge(status: PortalAccount['status']) {
  const map = {
    invited: { label: 'Invité', bg: '#DBEAFE', fg: '#1E40AF' },
    active: { label: 'Actif', bg: '#DCFCE7', fg: '#166534' },
    revoked: { label: 'Révoqué', bg: '#FEE2E2', fg: '#991B1B' },
  }
  const s = map[status]
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 99,
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      background: s.bg, color: s.fg,
    }}>{s.label}</span>
  )
}

export default function PortalAccountsPanel({ portalId, reportLinkId, accountType, contextLabel, authRequired, onAuthRequiredChange, defaultInviteEmail }: Props) {
  const [accounts, setAccounts] = useState<PortalAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [protectedAccess, setProtectedAccess] = useState<boolean>(!!authRequired)
  const [togglingAuth, setTogglingAuth] = useState(false)

  useEffect(() => { setProtectedAccess(!!authRequired) }, [authRequired])

  const handleToggleAuth = async () => {
    const next = !protectedAccess
    if (next && accounts.filter(a => a.status === 'active').length === 0) {
      const ok = confirm(
        "Aucun compte actif n'est lié à ce portail.\n\n" +
        "Si tu actives l'accès protégé maintenant, les utilisateurs ne pourront PLUS y accéder " +
        "tant qu'ils n'auront pas créé leur mot de passe via une invitation.\n\n" +
        "Continuer quand même ?"
      )
      if (!ok) return
    }
    setTogglingAuth(true)
    const url = portalId
      ? `/api/admin/client-portals/${portalId}`
      : `/api/admin/reports/${reportLinkId}`
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_required: next }),
    })
    if (r.ok) {
      setProtectedAccess(next)
      onAuthRequiredChange?.(next)
      toast.success(next ? 'Accès protégé activé' : 'Accès libre rétabli')
    } else {
      toast.error('Erreur')
    }
    setTogglingAuth(false)
  }

  const fetchAccounts = async () => {
    setLoading(true)
    const qs = portalId ? `portal_id=${portalId}` : `report_link_id=${reportLinkId}`
    const r = await fetch(`/api/admin/portal-accounts?${qs}`)
    const d = await r.json().catch(() => ({}))
    if (r.ok) setAccounts(d.accounts || [])
    setLoading(false)
  }

  useEffect(() => {
    if (portalId || reportLinkId) fetchAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalId, reportLinkId])

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setBusy(true)
    try {
      const r = await fetch('/api/admin/portal-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          accountType,
          portal_id: portalId,
          report_link_id: reportLinkId,
          contextLabel,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        toast.error(d.error || 'Erreur')
        setBusy(false)
        return
      }
      if (d.email_sent) toast.success('Invitation envoyée par email')
      else toast.warning("Compte créé, mais l'email n'a pas pu être envoyé")
      setInviteEmail('')
      setInviteOpen(false)
      fetchAccounts()
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async (id: string, revoke: boolean) => {
    const r = await fetch(`/api/admin/portal-accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_revoked: revoke }),
    })
    if (r.ok) {
      toast.success(revoke ? 'Accès révoqué' : 'Accès réactivé')
      fetchAccounts()
    } else {
      toast.error('Erreur')
    }
  }

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Supprimer définitivement le compte ${email} ? Cette action est irréversible.`)) return
    const r = await fetch(`/api/admin/portal-accounts/${id}`, { method: 'DELETE' })
    if (r.ok) {
      toast.success('Compte supprimé')
      fetchAccounts()
    } else {
      toast.error('Erreur')
    }
  }

  const handleResend = async (id: string) => {
    const r = await fetch(`/api/admin/portal-accounts/${id}/resend-invitation`, { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.email_sent) toast.success("Email d'invitation renvoyé")
    else if (r.ok) toast.warning("Token regénéré, mais l'email n'a pas pu être envoyé")
    else toast.error(d.error || 'Erreur')
  }

  // v2.9.80 — Copie le lien d'invitation (set-password) pour l'envoyer par WhatsApp/autre.
  // Réutilise le token valide existant côté serveur (ne casse pas le lien déjà envoyé par email).
  const handleCopyLink = async (id: string) => {
    try {
      const r = await fetch(`/api/admin/portal-accounts/${id}/invitation-link`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.link) { toast.error(d.error || 'Erreur'); return }
      await navigator.clipboard.writeText(String(d.link).replace(/\s+/g, ''))
      toast.success('Lien d\'invitation copié — prêt à coller (WhatsApp, etc.)')
    } catch {
      toast.error('Impossible de copier le lien')
    }
  }

  // v2.9.92 — Envoie le lien d'invitation directement par WhatsApp (deeplink wa.me).
  // Pas de numéro pré-rempli → l'utilisateur choisit le contact dans WhatsApp.
  const handleWhatsApp = async (id: string) => {
    try {
      const r = await fetch(`/api/admin/portal-accounts/${id}/invitation-link`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.link) { toast.error(d.error || 'Erreur'); return }
      // v2.10.47 — garde-fou : retire tout espace/retour à la ligne du lien
      // (une URL n'en contient jamais) pour qu'il reste cliquable sur WhatsApp.
      const cleanLink = String(d.link).replace(/\s+/g, '')
      const msg = `Bonjour,\n\nVoici votre lien d'accès au portail L-Agence (créez votre mot de passe) :\n${cleanLink}\n\nÀ bientôt,\nL-Agence SA`
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Impossible de préparer le lien WhatsApp')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
          Accès au {accountType === 'client' ? 'portail' : 'rapport'} ({accounts.length})
        </h3>
        <button
          onClick={() => {
            // v2.9.8 — Pré-remplit avec defaultInviteEmail si déjà pas créé pour cet email
            const already = accounts.some(a => a.email.toLowerCase() === (defaultInviteEmail || '').toLowerCase().trim())
            setInviteEmail(!already && defaultInviteEmail ? defaultInviteEmail.trim() : '')
            setInviteOpen(true)
          }}
          style={{
            padding: '7px 14px', fontSize: 13, fontWeight: 600,
            background: '#EAB308', color: '#1C1A14',
            border: 'none', borderRadius: 8, cursor: 'pointer',
          }}>
          + Inviter
        </button>
      </div>

      {/* Toggle "Accès protégé" (auth_required flag) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '10px 12px', background: protectedAccess ? '#FEF3C7' : 'var(--secondary)',
        border: `1px solid ${protectedAccess ? '#FCD34D' : 'var(--border)'}`,
        borderRadius: 8, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
            Accès protégé {protectedAccess ? '🔒 ACTIVÉ' : '🔓 désactivé'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>
            {protectedAccess
              ? 'Les utilisateurs doivent se connecter (email + mot de passe) pour accéder.'
              : 'Accès libre via le lien direct. Active pour exiger une connexion.'}
          </div>
        </div>
        <button
          onClick={handleToggleAuth}
          disabled={togglingAuth}
          style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: togglingAuth ? 'wait' : 'pointer',
            background: protectedAccess ? '#FFFFFF' : '#1C1A14',
            color: protectedAccess ? '#1C1A14' : '#FFFFFF',
            border: '1px solid ' + (protectedAccess ? '#1C1A14' : 'transparent'),
            borderRadius: 6, fontFamily: 'inherit', opacity: togglingAuth ? 0.6 : 1,
          }}>
          {togglingAuth ? '…' : (protectedAccess ? 'Désactiver' : 'Activer')}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: 8 }}>Chargement…</div>
      ) : accounts.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: 12, background: 'var(--secondary)', borderRadius: 8 }}>
          Aucun compte créé. Cliquez sur « + Inviter » pour donner un accès.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {accounts.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: 'var(--card)',
              border: '1px solid var(--border)', borderRadius: 8, gap: 8, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--foreground)', wordBreak: 'break-all' }}>{a.email}</span>
                  {statusBadge(a.status)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                  Invité le {formatDate(a.invited_at)}
                  {a.last_login_at && ` · Dernière connexion ${formatDate(a.last_login_at)}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {a.status === 'invited' && (
                  <>
                    <button onClick={() => handleResend(a.id)} style={btnStyle('#F3F4F6', '#1F2937')}>Renvoyer</button>
                    <button onClick={() => handleWhatsApp(a.id)} style={btnStyle('#DCFCE7', '#128C7E')} title="Envoyer le lien d'invitation par WhatsApp">WhatsApp</button>
                    <button onClick={() => handleCopyLink(a.id)} style={btnStyle('#E0E7FF', '#3730A3')} title="Copier le lien d'invitation">Copier lien</button>
                  </>
                )}
                {a.status === 'active' && (
                  <button onClick={() => handleRevoke(a.id, true)} style={btnStyle('#FEF3C7', '#B45309')}>Révoquer</button>
                )}
                {a.status === 'revoked' && (
                  <button onClick={() => handleRevoke(a.id, false)} style={btnStyle('#DCFCE7', '#166534')}>Réactiver</button>
                )}
                <button onClick={() => handleDelete(a.id, a.email)} style={btnStyle('#FEE2E2', '#991B1B')}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal invitation — v2.9.8 : createPortal pour échapper aux ancêtres avec transform
          qui cassent position:fixed (pattern #10) */}
      {inviteOpen && typeof document !== 'undefined' && createPortal(
        <div onClick={() => !busy && setInviteOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card)', borderRadius: 14, padding: 24, maxWidth: 420, width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          }}>
            <h3 style={{
              margin: '0 0 8px',
              fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
              fontSize: 22, fontWeight: 400, color: 'var(--foreground)',
            }}>Inviter un {accountType === 'client' ? 'client' : 'candidat'}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Entrez l&apos;email. La personne recevra un lien pour créer son propre mot de passe (lien valable 7 jours).
            </p>
            <input
              type="email" placeholder="email@exemple.ch" autoFocus
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && inviteEmail.trim()) handleInvite() }}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--surface)', color: 'var(--foreground)', outline: 'none',
                boxSizing: 'border-box', marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setInviteOpen(false)} disabled={busy} style={btnStyle('#F3F4F6', '#374151')}>Annuler</button>
              <button onClick={handleInvite} disabled={busy || !inviteEmail.trim()}
                style={{ ...btnStyle('#EAB308', '#1C1A14'), opacity: (busy || !inviteEmail.trim()) ? 0.5 : 1 }}>
                {busy ? 'Envoi…' : 'Envoyer l\'invitation'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function btnStyle(bg: string, fg: string): React.CSSProperties {
  return {
    padding: '6px 12px', fontSize: 12, fontWeight: 600,
    background: bg, color: fg,
    border: 'none', borderRadius: 6, cursor: 'pointer',
    fontFamily: 'inherit',
  }
}
