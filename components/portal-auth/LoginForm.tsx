'use client'

// Formulaire login avec toggle "Mot de passe oublié ?" intégré
// Évite une page dédiée forgot-password (cohérence + moins de code)

import { useState, FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import AuthLayout, { inputStyle, labelStyle, primaryBtnStyle, linkBtnStyle, errorStyle, successStyle } from './AuthLayout'
import { storePortalToken, installAppFetchAuth } from '@/lib/report/app-auth'

type AccountType = 'client' | 'candidat'
type Mode = 'login' | 'forgot'

interface Props {
  accountType: AccountType
  /** Préfixe URL pour redirection après login (ex: /client-portal ou /report) */
  basePath: string
}

export default function LoginForm({ accountType, basePath }: Props) {
  const search = useSearchParams()
  const next = search.get('next') || basePath

  // Extraction du slug depuis `next` pour disambiguer le login si même email sur plusieurs portails
  const slugFromNext = (() => {
    try {
      const m = next.match(/^\/(?:client-portal|report)\/([^/?]+)/)
      return m ? m[1] : undefined
    } catch { return undefined }
  })()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    try {
      const r = await fetch('/api/portal-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, accountType, slug: slugFromNext }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(d.error || 'Erreur de connexion')
        setBusy(false)
        return
      }
      // v2.13.6 — App native : on stocke le JWT et on active le patch fetch
      // (Authorization: Bearer) → l'app n'a plus besoin du cookie (non fiable en
      // WKWebView). Les navigateurs ignorent ça et continuent avec le cookie.
      if (d.token) { storePortalToken(d.token); installAppFetchAuth() }
      // WKWebView (app native iOS) : le cookie de session posé par la réponse XHR
      // met un court instant à devenir disponible pour les requêtes suivantes.
      // Avant v2.13.1 on naviguait direct → /report rappelait /me trop tôt → 401 →
      // retour login EN BOUCLE (refus Apple 2.1a, iPad iOS 26.5). Fix : on confirme
      // que la session est LISIBLE (me=200) AVANT de naviguer (on reste sur
      // « Connexion… » pendant la confirmation, ≤ ~1,8 s).
      for (let i = 0; i < 6; i++) {
        try {
          const check = await fetch(`/api/portal-auth/me?type=${accountType}`, { credentials: 'include' })
          if (check.ok) break
        } catch { /* réseau transitoire → on retente */ }
        await new Promise(res => setTimeout(res, 300))
      }
      // Navigation DURE (pas router.push) : recharge complète, cookie désormais établi.
      window.location.assign(next)
    } catch {
      setError('Erreur réseau, réessayez')
      setBusy(false)
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    try {
      await fetch('/api/portal-auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accountType, slug: slugFromNext }),
      })
      // Réponse 200 toujours (anti-énumération)
      setInfo("Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé. Vérifiez vos emails (et les spams).")
      setBusy(false)
    } catch {
      setError('Erreur réseau, réessayez')
      setBusy(false)
    }
  }

  const title = mode === 'login' ? 'Connexion' : 'Mot de passe oublié'
  const subtitle = mode === 'login'
    ? (accountType === 'client' ? 'Accédez à votre portail collaborateurs' : 'Accédez à vos rapports hebdomadaires')
    : 'Entrez votre email, nous vous enverrons un lien pour réinitialiser votre mot de passe.'

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      {error && <div style={errorStyle}>{error}</div>}
      {info && <div style={successStyle}>{info}</div>}

      {mode === 'login' ? (
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle} htmlFor="email">Email</label>
            <input
              id="email" type="email" required autoComplete="email" inputMode="email" suppressHydrationWarning
              value={email} onChange={e => setEmail(e.target.value)}
              style={inputStyle} placeholder="vous@exemple.ch"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="password">Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" suppressHydrationWarning
                value={password} onChange={e => setPassword(e.target.value)}
                style={{ ...inputStyle, paddingRight: 44 }} placeholder="••••••••"
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
          <button type="submit" disabled={busy || !email || !password}
            style={{ ...primaryBtnStyle, opacity: (busy || !email || !password) ? 0.5 : 1, cursor: (busy || !email || !password) ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button type="button" onClick={() => { setMode('forgot'); setError(null); setInfo(null) }} style={linkBtnStyle}>
              Mot de passe oublié&nbsp;?
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleForgot}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="email">Email</label>
            <input
              id="email" type="email" required autoComplete="email" inputMode="email" suppressHydrationWarning
              value={email} onChange={e => setEmail(e.target.value)}
              style={inputStyle} placeholder="vous@exemple.ch"
            />
          </div>
          <button type="submit" disabled={busy || !email}
            style={{ ...primaryBtnStyle, opacity: (busy || !email) ? 0.5 : 1, cursor: (busy || !email) ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Envoi…' : 'Recevoir un lien de réinitialisation'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button type="button" onClick={() => { setMode('login'); setError(null); setInfo(null) }} style={linkBtnStyle}>
              ← Retour à la connexion
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
