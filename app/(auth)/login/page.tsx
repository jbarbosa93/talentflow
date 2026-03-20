'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, ShieldCheck, Mail } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // État 2FA TOTP
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaCode, setMfaCode]         = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [loadingMfa, setLoadingMfa]   = useState(false)

  // État 2FA Email OTP
  const [emailOtpRequired, setEmailOtpRequired] = useState(false)
  const [emailOtpCode, setEmailOtpCode]         = useState('')
  const [emailOtpLoading, setEmailOtpLoading]   = useState(false)

  // Erreur domaine depuis le middleware
  const urlError = searchParams.get('error')
  const domainError = urlError === 'domain'
    ? 'Votre domaine email n\'est pas autorisé à accéder à cette application.'
    : ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Vérification domaine côté client (si var publique définie)
    const allowedDomainsPublic = process.env.NEXT_PUBLIC_ALLOWED_DOMAINS
    if (allowedDomainsPublic) {
      const allowedDomains = allowedDomainsPublic.split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
      const emailDomain = email.split('@')[1]?.toLowerCase() || ''
      const isDomainOk = allowedDomains.some(d => emailDomain === d)
      if (!isDomainOk) {
        setError(`Domaine email non autorisé. Domaines acceptés : ${allowedDomains.join(', ')}`)
        setLoading(false)
        return
      }
    }

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

    // Vérifier si MFA TOTP requis
    if (data.session === null) {
      // MFA requis — récupérer le factorId
      const { data: mfaData } = await supabase.auth.mfa.listFactors()
      const totpFactor = mfaData?.totp?.[0]
      if (totpFactor) {
        setMfaFactorId(totpFactor.id)
        setMfaRequired(true)
        setLoading(false)
        return
      }
    }

    if (data.user && !data.user.email_confirmed_at) {
      router.push('/verify-email')
      return
    }

    // Connexion réussie → redirection directe (pas d'OTP email - dépend du SMTP)
    router.push('/dashboard')
    router.refresh()
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!mfaCode || mfaCode.length !== 6) {
      setError('Entrez un code à 6 chiffres.')
      return
    }
    setError('')
    setLoadingMfa(true)

    const supabase = createClient()
    try {
      const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code: mfaCode,
      })

      if (mfaError) {
        setError('Code incorrect. Vérifiez votre application d\'authentification.')
        setLoadingMfa(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Erreur lors de la vérification 2FA.')
      setLoadingMfa(false)
    }
  }

  async function handleEmailOtpVerify(e: React.FormEvent) {
    e.preventDefault()
    if (emailOtpCode.length !== 6) { setError('Entrez un code à 6 chiffres.'); return }
    setError('')
    setEmailOtpLoading(true)
    const res = await fetch('/auth/api/send-otp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: emailOtpCode }),
    })
    const data = await res.json()
    if (!res.ok || !data.valid) { setError(data.error || 'Code invalide.'); setEmailOtpLoading(false); return }
    router.push('/dashboard')
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

        <div className="auth-left-footer">© 2026 TalentFlow. Tous droits réservés.</div>
      </div>

      {/* Panel droit */}
      <div className="auth-right">
        <div className="auth-card">
          {emailOtpRequired && !mfaRequired ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Mail size={22} style={{ color: '#7C3AED' }} />
                <h2 className="auth-card-title" style={{ margin: 0 }}>Vérification par email</h2>
              </div>
              <p className="auth-card-sub">Un code à 6 chiffres a été envoyé à <strong>{email}</strong>.</p>
              <form className="auth-form" onSubmit={handleEmailOtpVerify}>
                {error && <div className="auth-error">{error}</div>}
                <div className="auth-field">
                  <label className="auth-label">Code de vérification</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="auth-input"
                    placeholder="000000"
                    value={emailOtpCode}
                    onChange={e => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                    style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 20 }}
                  />
                </div>
                <button type="submit" className="auth-btn" disabled={emailOtpLoading}>
                  {emailOtpLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {emailOtpLoading ? 'Vérification...' : 'Confirmer'}
                </button>
              </form>
              <button
                onClick={() => { setEmailOtpRequired(false); setEmailOtpCode(''); setError('') }}
                style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Retour
              </button>
            </>
          ) : !mfaRequired ? (
            <>
              <h2 className="auth-card-title">Bon retour 👋</h2>
              <p className="auth-card-sub">Connectez-vous à votre espace recruteur.</p>

              <form className="auth-form" onSubmit={handleSubmit}>
                {(domainError || error) && <div className="auth-error">{domainError || error}</div>}

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

              <div className="auth-footer-link" style={{ marginTop: 20 }}>
                Pas d&apos;accès ?{' '}
                <Link href="/demande-acces">Faire une demande →</Link>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <ShieldCheck size={22} style={{ color: '#7C3AED' }} />
                <h2 className="auth-card-title" style={{ margin: 0 }}>Vérification 2FA</h2>
              </div>
              <p className="auth-card-sub">Entrez le code à 6 chiffres depuis votre application d&apos;authentification.</p>

              <form className="auth-form" onSubmit={handleMfaVerify}>
                {error && <div className="auth-error">{error}</div>}

                <div className="auth-field">
                  <label className="auth-label">Code d&apos;authentification</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="auth-input"
                    placeholder="000000"
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                    style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 20 }}
                  />
                </div>

                <button type="submit" className="auth-btn" disabled={loadingMfa}>
                  {loadingMfa ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loadingMfa ? 'Vérification...' : 'Vérifier'}
                </button>
              </form>

              <button
                onClick={() => { setMfaRequired(false); setMfaCode(''); setError('') }}
                style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Retour à la connexion
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
