'use client'

// Formulaire création/réinitialisation de mot de passe via token (invitation OU reset)
// 2 champs password + confirm, validation 8 chars min, auto-login après succès

import { useState, FormEvent, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Mail, User, CheckCircle2, Bookmark, Copy, Check } from 'lucide-react'
import AuthLayout, { inputStyle, labelStyle, primaryBtnStyle, errorStyle } from './AuthLayout'
import ClientLogo from '@/components/ClientLogo'
import { storePortalToken, installAppFetchAuth } from '@/lib/report/app-auth'

interface Props {
  accountType: 'client' | 'candidat'
  /** Préfixe pour redirection après succès (ex: /client-portal ou /report) */
  basePath: string
}

export default function SetPasswordForm({ accountType, basePath }: Props) {
  const router = useRouter()
  const search = useSearchParams()
  const token = search.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missingToken, setMissingToken] = useState(false)
  const [success, setSuccess] = useState<{ targetSlug: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const [tokenInfo, setTokenInfo] = useState<{
    email: string
    accountType: 'client' | 'candidat'
    context: { name: string | null; site_web: string | null }
  } | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)

  useEffect(() => {
    if (!token) { setMissingToken(true); setLoadingInfo(false); return }
    fetch(`/api/portal-auth/token-info?token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (r.status === 410 || r.status === 403) { setMissingToken(true); return null }
        if (!r.ok) return null
        return r.json()
      })
      .then(d => { if (d?.ok) setTokenInfo(d) })
      .finally(() => setLoadingInfo(false))
  }, [token])

  if (missingToken) {
    return (
      <AuthLayout title="Lien invalide">
        <div style={errorStyle}>
          Ce lien n&apos;est plus valide ou a expiré.
        </div>
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: 4 }}>
          Contactez L-Agence SA pour recevoir un nouveau lien&nbsp;:
        </p>
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0 }}>
          <strong>+41 24 552 18 70</strong><br />
          <a href="mailto:info@l-agence.ch" style={{ color: '#1C1A14' }}>info@l-agence.ch</a>
        </p>
      </AuthLayout>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Mot de passe trop court (8 caractères minimum)')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/portal-auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (r.status === 410) {
          setMissingToken(true)
          setBusy(false)
          return
        }
        setError(d.error || 'Erreur, réessayez')
        setBusy(false)
        return
      }
      // v2.13.6 — App native : stocke le JWT (auto-login) + active le patch fetch.
      if (d.token) { storePortalToken(d.token); installAppFetchAuth() }
      // Succès : on affiche la page de confirmation avec le bon slug pour aller au portail
      setSuccess({ targetSlug: d.targetSlug || null })
      setBusy(false)
    } catch {
      setError('Erreur réseau, réessayez')
      setBusy(false)
    }
  }

  // ─── Page succès ────────────────────────────────────────────────────────
  if (success) {
    const targetUrl = success.targetSlug ? `${basePath}/${success.targetSlug}` : basePath
    const loginPath = `${basePath}/login`
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const loginUrl = `${origin}${loginPath}`
    const loginUrlDisplay = (origin.replace(/^https?:\/\//, '') || 'talent-flow.ch') + loginPath

    const copyLogin = async () => {
      try {
        await navigator.clipboard.writeText(loginUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch { /* clipboard indisponible */ }
    }

    return (
      <AuthLayout>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: '#DCFCE7', color: '#15803D',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}>
            <CheckCircle2 size={42} strokeWidth={2} />
          </div>
          <h1 style={{
            margin: '0 0 10px',
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 28, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.01em',
            color: '#1C1A14',
          }}>
            Mot de passe créé !
          </h1>
          <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
            Votre compte est actif. Vous pouvez désormais accéder à {accountType === 'client' ? 'votre portail' : 'vos rapports'}.
          </p>
          <button
            onClick={() => router.push(targetUrl)}
            style={{
              width: '100%', padding: '12px 16px', fontSize: 15, fontWeight: 600,
              background: '#EAB308', color: '#1C1A14', border: 'none', borderRadius: 10,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            {accountType === 'client' ? 'Accéder à mon portail' : 'Accéder à mes rapports'}
          </button>

          {/* Encadré : enregistrer la page de connexion pour les prochaines visites */}
          <div style={{
            marginTop: 18, padding: '14px 16px', textAlign: 'left',
            background: '#FEFCE8', border: '1px solid #FDE68A', borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Bookmark size={18} style={{ color: '#92400E', flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1A14' }}>
                Enregistrez votre page de connexion
              </span>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
              Le lien reçu par message ne fonctionne qu&apos;une seule fois. Pour la prochaine fois, accédez à {accountType === 'client' ? 'votre portail' : 'vos rapports'} depuis cette page&nbsp;: ajoutez-la en favori ou sur votre écran d&apos;accueil pour la retrouver en 1 clic.
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: '#FFFFFF',
              border: '1px solid #E5E7EB', borderRadius: 8,
            }}>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12.5, color: '#1C1A14',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {loginUrlDisplay}
              </span>
              <button
                type="button" onClick={copyLogin}
                aria-label="Copier le lien de connexion"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                  padding: '5px 9px', fontSize: 12.5, fontWeight: 600,
                  background: copied ? '#DCFCE7' : '#F3F4F6',
                  color: copied ? '#15803D' : '#374151',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Créer mon mot de passe" subtitle="Choisissez un mot de passe d'au moins 8 caractères. Il vous servira à vous connecter à chaque visite.">
      {error && <div style={errorStyle}>{error}</div>}

      {tokenInfo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', marginBottom: 18,
          background: '#FAFAF7', border: '1px solid #E5E7EB', borderRadius: 10,
        }}>
          {tokenInfo.accountType === 'client' && tokenInfo.context.name ? (
            <ClientLogo
              nom_entreprise={tokenInfo.context.name}
              site_web={tokenInfo.context.site_web}
              size="md"
            />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: '#FEF3C7', color: '#92400E',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <User size={22} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {tokenInfo.context.name && (
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1A14', lineHeight: 1.2, marginBottom: 2 }}>
                {tokenInfo.context.name}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
              <Mail size={12} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tokenInfo.email}</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor="password">Nouveau mot de passe</label>
          <div style={{ position: 'relative' }}>
            <input
              id="password" type={showPassword ? 'text' : 'password'} required autoComplete="new-password" minLength={8}
              value={password} onChange={e => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: 44 }} placeholder="8 caractères minimum"
            />
            <button
              type="button" aria-label={showPassword ? 'Masquer' : 'Afficher'}
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 6,
                color: '#6B7280', display: 'flex', alignItems: 'center',
              }}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle} htmlFor="confirm">Confirmation</label>
          <div style={{ position: 'relative' }}>
            <input
              id="confirm" type={showPassword ? 'text' : 'password'} required autoComplete="new-password" minLength={8}
              value={confirm} onChange={e => setConfirm(e.target.value)}
              style={{ ...inputStyle, paddingRight: 44 }} placeholder="Retapez le même mot de passe"
            />
            <button
              type="button" aria-label={showPassword ? 'Masquer' : 'Afficher'}
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 6,
                color: '#6B7280', display: 'flex', alignItems: 'center',
              }}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={busy || !password || !confirm}
          style={{ ...primaryBtnStyle, opacity: (busy || !password || !confirm) ? 0.5 : 1, cursor: (busy || !password || !confirm) ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Enregistrement…' : 'Enregistrer et se connecter'}
        </button>
      </form>
    </AuthLayout>
  )
}
