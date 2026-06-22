'use client'

// Page "Mon compte" pour les utilisateurs connectés au portail/rapports
// - Affiche infos compte (email, dates)
// - Permet de changer le mot de passe
// - Bouton déconnexion

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Mail, Calendar, Clock, ArrowLeft, LogOut, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import AuthLayout, { inputStyle, labelStyle, primaryBtnStyle, errorStyle } from './AuthLayout'
import { clearPortalToken } from '@/lib/report/app-auth'
import PortalEmailChange from './PortalEmailChange'

interface Props {
  accountType: 'client' | 'candidat'
  basePath: string
}

interface AccountInfo {
  id: string
  email: string
  accountType: 'client' | 'candidat'
  portalId: string | null
  reportLinkId: string | null
  /** Slug du portail/rapport courant (pour bouton retour) */
  targetSlug?: string | null
  invitedAt?: string | null
  lastLoginAt?: string | null
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('fr-CH', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return s }
}

export default function AccountPage({ accountType, basePath }: Props) {
  const router = useRouter()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [authError, setAuthError] = useState(false)

  // Form change password
  const [current, setCurrent] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/portal-auth/me?type=${accountType}&full=1`)
      .then(r => {
        if (!r.ok) { setAuthError(true); return null }
        return r.json()
      })
      .then(d => { if (d?.account) setAccount(d.account) })
      .finally(() => setLoadingAccount(false))
  }, [accountType])

  // Si pas authentifié → redirige vers login
  useEffect(() => {
    if (authError) {
      router.replace(`${accountType === 'client' ? '/client-portal/login' : '/report/login'}`)
    }
  }, [authError, accountType, router])

  const handleLogout = async () => {
    await fetch('/api/portal-auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountType }),
    })
    clearPortalToken() // v2.13.6 — purge le token app (Bearer)
    router.push(`${basePath}/login`)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPwd.length < 8) {
      setError('Nouveau mot de passe trop court (8 caractères minimum)')
      return
    }
    if (newPwd !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas')
      return
    }
    if (newPwd === current) {
      setError('Le nouveau mot de passe doit être différent de l\'actuel')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/portal-auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountType, currentPassword: current, newPassword: newPwd }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(d.error || 'Erreur')
        setBusy(false)
        return
      }
      toast.success('Mot de passe modifié')
      setCurrent(''); setNewPwd(''); setConfirm('')
      setBusy(false)
    } catch {
      setError('Erreur réseau, réessayez')
      setBusy(false)
    }
  }

  if (loadingAccount) {
    return (
      <AuthLayout>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>Chargement…</p>
          <Loader2 size={24} style={{ color: '#EAB308', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </AuthLayout>
    )
  }

  if (!account) {
    return (
      <AuthLayout title="Non connecté" subtitle="Reconnectez-vous pour accéder à votre compte.">
        <div />
      </AuthLayout>
    )
  }

  const portalUrl = account.targetSlug ? `${basePath}/${account.targetSlug}` : basePath

  return (
    <AuthLayout title="Mon compte">
      {/* v2.10.41 — Bouton retour masqué pour le candidat (la barre de navigation
          basse gère le retour). Conservé pour le portail client (sans barre). */}
      {accountType !== 'candidat' && (
        <button
          onClick={() => router.push(portalUrl)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#6B7280', fontSize: 13, padding: 0, marginBottom: 18,
            fontFamily: 'inherit',
          }}>
          <ArrowLeft size={14} /> Retour au portail
        </button>
      )}

      {/* Infos compte */}
      <div style={{
        padding: '14px 16px', marginBottom: 22,
        background: '#FAFAF7', border: '1px solid #E5E7EB', borderRadius: 10,
        fontSize: 13.5, color: '#374151',
      }}>
        <InfoRow icon={<Mail size={14} />} label="Email" value={account.email} />
        <InfoRow icon={<Calendar size={14} />} label="Compte créé le" value={formatDate(account.invitedAt)} />
        <InfoRow icon={<Clock size={14} />} label="Dernière connexion" value={formatDate(account.lastLoginAt)} last />
      </div>

      {/* v2.10.44 — Changer mon e-mail (avec vérification) — candidat uniquement */}
      {accountType === 'candidat' && <PortalEmailChange currentEmail={account.email} />}

      {/* Form change password */}
      <h2 style={{
        margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1C1A14',
      }}>Changer mon mot de passe</h2>

      {error && <div style={errorStyle}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <PasswordField
          id="current" label="Mot de passe actuel"
          value={current} onChange={setCurrent}
          show={showCurrent} onToggle={() => setShowCurrent(v => !v)}
          autoComplete="current-password"
        />
        <PasswordField
          id="new" label="Nouveau mot de passe"
          value={newPwd} onChange={setNewPwd}
          show={showNew} onToggle={() => setShowNew(v => !v)}
          autoComplete="new-password" minLength={8}
          placeholder="8 caractères minimum"
        />
        <PasswordField
          id="confirm" label="Confirmation"
          value={confirm} onChange={setConfirm}
          show={showNew} onToggle={() => setShowNew(v => !v)}
          autoComplete="new-password" minLength={8}
          placeholder="Retapez le nouveau mot de passe"
        />
        <button type="submit" disabled={busy || !current || !newPwd || !confirm}
          style={{
            ...primaryBtnStyle,
            opacity: (busy || !current || !newPwd || !confirm) ? 0.5 : 1,
            cursor: (busy || !current || !newPwd || !confirm) ? 'not-allowed' : 'pointer',
            marginTop: 4,
          }}>
          {busy ? 'Modification…' : 'Modifier mon mot de passe'}
        </button>
      </form>

      {/* Déconnexion */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #E5E7EB' }}>
        <button
          onClick={handleLogout}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: '1px solid #FCA5A5',
            color: '#B91C1C', padding: '8px 14px', borderRadius: 8,
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            fontFamily: 'inherit',
          }}>
          <LogOut size={14} /> Se déconnecter
        </button>
      </div>
    </AuthLayout>
  )
}

function InfoRow({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
      borderBottom: last ? 'none' : '1px solid #E5E7EB',
    }}>
      <span style={{ color: '#9CA3AF', display: 'flex' }}>{icon}</span>
      <span style={{ fontSize: 12.5, color: '#6B7280', minWidth: 120 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: '#1C1A14', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function PasswordField({ id, label, value, onChange, show, onToggle, autoComplete, minLength, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void
  autoComplete?: string; minLength?: number; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle} htmlFor={id}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id} type={show ? 'text' : 'password'} required
          autoComplete={autoComplete} minLength={minLength} placeholder={placeholder}
          value={value} onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, paddingRight: 44 }}
        />
        <button
          type="button" aria-label={show ? 'Masquer' : 'Afficher'}
          onClick={onToggle}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 6,
            color: '#6B7280', display: 'flex', alignItems: 'center',
          }}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}
