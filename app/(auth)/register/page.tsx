'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, Check } from 'lucide-react'

const PWD_RULES = [
  { label: '8 caractères minimum', test: (p: string) => p.length >= 8 },
  { label: 'Une majuscule',        test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Un chiffre',          test: (p: string) => /[0-9]/.test(p) },
]

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ prenom: '', nom: '', entreprise: '', email: '', password: '', confirmPwd: '' })
  const [showPwd, setShowPwd]     = useState(false)
  const [showConf, setShowConf]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPwd) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (!PWD_RULES.every(r => r.test(form.password))) {
      setError('Le mot de passe ne respecte pas les règles de sécurité.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          prenom: form.prenom.trim(),
          nom: form.nom.trim(),
          entreprise: form.entreprise.trim(),
          role: 'Consultant',
        },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })

    if (authError) {
      setError(
        authError.message.includes('already registered')
          ? 'Un compte existe déjà avec cet email.'
          : authError.message
      )
      setLoading(false)
      return
    }

    if (data.user) {
      router.push('/verify-email?email=' + encodeURIComponent(form.email))
    }
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
          <div className="auth-left-tag">Inscription gratuite</div>
          <h1 className="auth-left-title">
            Démarrez votre<br />recrutement <em>intelligent</em>
          </h1>
          <p className="auth-left-desc">
            Créez votre compte en 30 secondes et commencez à analyser vos CVs avec l'IA.
          </p>

          <div className="auth-features">
            {[
              { icon: '✅', text: 'Essai gratuit, sans carte bancaire' },
              { icon: '🔒', text: 'Données hébergées en Europe' },
              { icon: '⚡', text: 'Import CV en 1 clic' },
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
          <h2 className="auth-card-title">Créer un compte</h2>
          <p className="auth-card-sub">Rejoignez TalentFlow et recrutez plus intelligemment.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}

            {/* Prénom + Nom */}
            <div className="auth-row">
              <div className="auth-field">
                <label className="auth-label">Prénom</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Jean"
                  value={form.prenom}
                  onChange={set('prenom')}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">Nom</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Dupont"
                  value={form.nom}
                  onChange={set('nom')}
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label">Entreprise</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Nom de votre agence ou entreprise"
                value={form.entreprise}
                onChange={set('entreprise')}
                required
                autoComplete="organization"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Email professionnel</label>
              <input
                type="email"
                className="auth-input"
                placeholder="vous@entreprise.com"
                value={form.email}
                onChange={set('email')}
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
                  value={form.password}
                  onChange={set('password')}
                  required
                  autoComplete="new-password"
                />
                <button type="button" className="auth-eye-btn" onClick={() => setShowPwd(!showPwd)}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password strength */}
              {form.password.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {PWD_RULES.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: r.test(form.password) ? '#16A34A' : '#E8E0C8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'background 0.2s',
                      }}>
                        {r.test(form.password) && <Check size={10} color="#fff" strokeWidth={3} />}
                      </div>
                      <span style={{ color: r.test(form.password) ? '#16A34A' : '#B8AD96', fontWeight: 600 }}>
                        {r.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-label">Confirmer le mot de passe</label>
              <div className="auth-input-wrap">
                <input
                  type={showConf ? 'text' : 'password'}
                  className={`auth-input${form.confirmPwd && form.confirmPwd !== form.password ? ' error' : ''}`}
                  placeholder="••••••••"
                  value={form.confirmPwd}
                  onChange={set('confirmPwd')}
                  required
                  autoComplete="new-password"
                />
                <button type="button" className="auth-eye-btn" onClick={() => setShowConf(!showConf)}>
                  {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
          </form>

          <div className="auth-footer-link" style={{ marginTop: 20 }}>
            Déjà un compte ?{' '}
            <Link href="/login">Se connecter</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
