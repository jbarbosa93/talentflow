'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(
        authError.message.includes('Invalid login')
          ? 'Email ou mot de passe incorrect.'
          : authError.message.includes('Email not confirmed')
          ? 'Veuillez confirmer votre email avant de vous connecter.'
          : authError.message
      )
      setLoading(false)
      return
    }

    if (data.user && !data.user.email_confirmed_at) {
      router.push('/verify-email')
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="auth-page">
      {/* Panel gauche */}
      <div className="auth-left">
        <Link href="/" className="auth-logo">
          <div className="auth-logo-dot" />
          <span className="auth-logo-text">TalentFlow</span>
        </Link>

        <div className="auth-left-content">
          <div className="auth-left-tag">ATS Intelligent</div>
          <h1 className="auth-left-title">
            Recrutez avec<br /><em>clarté</em> et efficacité
          </h1>
          <p className="auth-left-desc">
            Centralisez vos candidats, analysez les CVs avec l'IA et pilotez votre pipeline de recrutement.
          </p>

          <div className="auth-features">
            {[
              { icon: '🤖', text: 'Analyse IA des CVs en secondes' },
              { icon: '📊', text: 'Pipeline Kanban visuel' },
              { icon: '📧', text: 'Sync Microsoft 365 automatique' },
            ].map((f, i) => (
              <div key={i} className="auth-feature">
                <div className="auth-feature-icon">{f.icon}</div>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        <div className="auth-left-footer">© 2025 TalentFlow. Tous droits réservés.</div>
      </div>

      {/* Panel droit */}
      <div className="auth-right">
        <div className="auth-card">
          <h2 className="auth-card-title">Bon retour 👋</h2>
          <p className="auth-card-sub">Connectez-vous à votre espace recruteur.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}

            <div className="auth-field">
              <label className="auth-label">Email professionnel</label>
              <input
                type="email"
                className="auth-input"
                placeholder="vous@entreprise.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Mot de passe</label>
              <div className="auth-input-wrap">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button type="button" className="auth-eye-btn" onClick={() => setShowPwd(!showPwd)}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div className="auth-divider" style={{ marginTop: 24 }}>ou</div>

          <div className="auth-footer-link">
            Pas encore de compte ?{' '}
            <Link href="/register">Créer un compte</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
