'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, ShieldCheck, Mail } from 'lucide-react'
import { motion } from 'framer-motion'

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

  // État reset mot de passe
  const [forgotMode, setForgotMode]         = useState(false)
  const [forgotEmail, setForgotEmail]       = useState('')
  const [forgotLoading, setForgotLoading]   = useState(false)
  const [forgotSent, setForgotSent]         = useState(false)

  // Logout automatique (inactivité 2h) → OTP non requis à la reconnexion
  const [isAutoLogout, setIsAutoLogout] = useState(false)
  useEffect(() => {
    const flag = sessionStorage.getItem('auto_logout')
    if (flag === 'true') {
      sessionStorage.removeItem('auto_logout')
      setIsAutoLogout(true)
    }
  }, [])

  // Erreurs depuis le middleware
  const urlError = searchParams.get('error')
  const domainError = urlError === 'domain'
    ? 'Votre domaine email n\'est pas autorisé à accéder à cette application.'
    : urlError === 'rate_limit'
    ? 'Trop de tentatives de connexion. Réessayez dans 5 minutes.'
    : urlError === 'timeout'
    ? 'Votre session a expiré pour inactivité. Reconnectez-vous.'
    : ''

  // Helper log d'accès (fire & forget)
  const logAccess = (action: string, details?: Record<string, unknown>) => {
    fetch('/api/auth/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, email, details }),
    }).catch(() => {})
  }

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

    // ✅ SÉCURITÉ : Vérifier les credentials CÔTÉ SERVEUR sans créer de session browser.
    // Le client admin a persistSession:false → aucun cookie auth posé dans la réponse.
    // Cela élimine la fenêtre de vulnérabilité où un navigateur aurait un cookie de session
    // valide avant que l'OTP soit vérifié.
    let needsMfa = false
    try {
      const verifyRes = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const verifyData = await verifyRes.json()

      if (!verifyRes.ok || !verifyData.valid) {
        logAccess('login_failed', { reason: verifyData.reason || 'invalid_credentials' })
        setError(
          verifyData.reason === 'email_not_confirmed'
            ? 'Veuillez confirmer votre email avant de vous connecter.'
            : 'Email ou mot de passe incorrect.'
        )
        setLoading(false)
        return
      }
      needsMfa = !!verifyData.needsMfa
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
      setLoading(false)
      return
    }

    // MFA TOTP requis — ce flow nécessite une session client pour le challenge
    if (needsMfa) {
      const supabase = createClient()
      await supabase.auth.signInWithPassword({ email, password })
      const { data: mfaData } = await supabase.auth.mfa.listFactors()
      const totpFactor = mfaData?.totp?.[0]
      if (totpFactor) {
        setMfaFactorId(totpFactor.id)
        setMfaRequired(true)
        setLoading(false)
        return
      }
    }

    // Logout automatique (inactivité) → créer la session sans OTP
    if (isAutoLogout) {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (!signInError) {
        logAccess('login_success_auto_logout')
        router.push('/dashboard')
        router.refresh()
        setLoading(false)
        return
      }
      // Fallback sécurisé : si signIn échoue → continuer avec OTP
    }

    // ✅ Aucune session active à ce stade — envoyer le code OTP
    try {
      const otpRes = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const otpData = await otpRes.json()
      if (!otpRes.ok) {
        console.error('[Login] OTP send failed:', otpData)
        setError('Erreur envoi du code de vérification. Réessayez.')
        setLoading(false)
        return
      }
    } catch (err) {
      console.error('[Login] OTP fetch error:', err)
      setError('Erreur réseau lors de l\'envoi du code.')
      setLoading(false)
      return
    }

    logAccess('login_otp_sent')
    setEmailOtpRequired(true)
    setLoading(false)
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

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!forgotEmail) return
    setError('')
    setForgotLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Erreur envoi email.')
      } else {
        setForgotSent(true)
      }
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
    } finally {
      setForgotLoading(false)
    }
  }

  async function handleEmailOtpVerify(e: React.FormEvent) {
    e.preventDefault()
    if (emailOtpCode.length !== 6) { setError('Entrez un code à 6 chiffres.'); return }
    setError('')
    setEmailOtpLoading(true)

    // 1. Vérifier le code OTP
    const res = await fetch('/api/auth/send-otp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: emailOtpCode }),
    })
    const otpResult = await res.json()
    if (!res.ok || !otpResult.valid) {
      setError(otpResult.error || 'Code invalide.')
      setEmailOtpLoading(false)
      return
    }

    // 2. ✅ Code vérifié — recréer la session Supabase
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError('Erreur de reconnexion. Veuillez réessayer.')
      setEmailOtpLoading(false)
      return
    }

    // 3. Log + redirect
    logAccess('login_success')
    router.push('/dashboard')
    router.refresh()
  }

  // ── Animations ──────────────────────────────────────────────────────────────
  const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 12 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { delay, duration: 0.35 },
  })

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="auth-glass-bg">
      <motion.div
        className="auth-glass-card"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >

        {/* ── Logo ── */}
        <motion.div
          className="auth-glass-logo"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <Link href="/">
            <span className="auth-glass-logo-icon">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L4 13h7l-1 9 10-12h-7z" fill="#1C1A14"/>
              </svg>
            </span>
            <span className="auth-glass-logo-text">TalentFlow</span>
          </Link>
        </motion.div>

        {/* ── States ── */}
        {forgotMode ? (
          /* ── Réinitialisation mot de passe ── */
          <>
            <motion.div {...fadeUp(0.0 + 0.25)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Mail size={20} style={{ color: '#F5A623' }} />
              <h2 className="auth-card-title" style={{ margin: 0 }}>Mot de passe oublié</h2>
            </motion.div>

            {forgotSent ? (
              <>
                <motion.p className="auth-card-sub" {...fadeUp(0.1 + 0.25)}>
                  Un lien de réinitialisation a été envoyé à <strong style={{ color: '#374151' }}>{forgotEmail}</strong>. Vérifiez votre boîte mail.
                </motion.p>
                <motion.div {...fadeUp(0.2 + 0.25)} style={{ marginTop: 20 }}>
                  <button
                    onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(''); setError('') }}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    ← Retour à la connexion
                  </button>
                </motion.div>
              </>
            ) : (
              <>
                <motion.p className="auth-card-sub" {...fadeUp(0.1 + 0.25)}>
                  Entrez votre email pour recevoir un lien de réinitialisation.
                </motion.p>
                <form className="auth-form" onSubmit={handleForgotPassword}>
                  {error && <motion.div className="auth-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{error}</motion.div>}
                  <motion.div className="auth-field" {...fadeUp(0.2 + 0.25)}>
                    <label className="auth-label">Email professionnel</label>
                    <input
                      type="email"
                      className="auth-input"
                      placeholder="vous@entreprise.com"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </motion.div>
                  <motion.div {...fadeUp(0.3 + 0.25)}>
                    <button type="submit" className="auth-btn" disabled={forgotLoading}>
                      {forgotLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                      {forgotLoading ? 'Envoi...' : 'Envoyer le lien'}
                    </button>
                  </motion.div>
                </form>
                <motion.div {...fadeUp(0.4 + 0.25)} style={{ marginTop: 14 }}>
                  <button
                    onClick={() => { setForgotMode(false); setError('') }}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    ← Retour à la connexion
                  </button>
                </motion.div>
              </>
            )}
          </>

        ) : emailOtpRequired && !mfaRequired ? (
          /* ── Email OTP ── */
          <>
            <motion.div {...fadeUp(0.0 + 0.25)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Mail size={20} style={{ color: '#F5A623' }} />
              <h2 className="auth-card-title" style={{ margin: 0 }}>Vérification par email</h2>
            </motion.div>
            <motion.p className="auth-card-sub" {...fadeUp(0.1 + 0.25)}>
              Un code à 6 chiffres a été envoyé à <strong style={{ color: '#374151' }}>{email}</strong>.
            </motion.p>

            <form className="auth-form" onSubmit={handleEmailOtpVerify}>
              {error && <motion.div className="auth-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{error}</motion.div>}

              <motion.div className="auth-field" {...fadeUp(0.2 + 0.25)}>
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
                  style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: 22, fontWeight: 700 }}
                />
              </motion.div>

              <motion.div {...fadeUp(0.3 + 0.25)}>
                <button type="submit" className="auth-btn" disabled={emailOtpLoading}>
                  {emailOtpLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {emailOtpLoading ? 'Vérification...' : 'Confirmer'}
                </button>
              </motion.div>
            </form>

            <motion.div {...fadeUp(0.4 + 0.25)} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
              <button
                onClick={() => { setEmailOtpRequired(false); setEmailOtpCode(''); setError('') }}
                style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Retour
              </button>
              <button
                onClick={async () => {
                  setError('')
                  try {
                    const r = await fetch('/api/auth/send-otp', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email }),
                    })
                    if (r.ok) setError('✅ Nouveau code envoyé !')
                    else setError('Erreur lors du renvoi.')
                  } catch { setError('Erreur réseau.') }
                }}
                style={{ background: 'none', border: 'none', color: '#F5A623', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
              >
                Renvoyer le code
              </button>
            </motion.div>
          </>

        ) : !mfaRequired ? (
          /* ── Login form ── */
          <>
            <motion.h2 className="auth-card-title" {...fadeUp(0.0 + 0.25)}>
              Bon retour 👋
            </motion.h2>
            <motion.p className="auth-card-sub" {...fadeUp(0.1 + 0.25)}>
              Connectez-vous à votre espace recruteur.
            </motion.p>

            <form className="auth-form" onSubmit={handleSubmit}>
              {(domainError || error) && (
                <motion.div className="auth-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {domainError || error}
                </motion.div>
              )}

              <motion.div className="auth-field" {...fadeUp(0.2 + 0.25)}>
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
              </motion.div>

              <motion.div className="auth-field" {...fadeUp(0.3 + 0.25)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label className="auth-label" style={{ margin: 0 }}>Mot de passe</label>
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setForgotEmail(email); setError('') }}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
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
              </motion.div>

              <motion.div {...fadeUp(0.4 + 0.25)}>
                <button type="submit" className="auth-btn" disabled={loading}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </motion.div>
            </form>

            <motion.div className="auth-footer-link" {...fadeUp(0.5 + 0.25)} style={{ marginTop: 20 }}>
              Pas d&apos;accès ?{' '}
              <Link href="/demande-acces">Faire une demande →</Link>
            </motion.div>
          </>

        ) : (
          /* ── MFA TOTP ── */
          <>
            <motion.div {...fadeUp(0.0 + 0.25)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <ShieldCheck size={20} style={{ color: '#F5A623' }} />
              <h2 className="auth-card-title" style={{ margin: 0 }}>Vérification 2FA</h2>
            </motion.div>
            <motion.p className="auth-card-sub" {...fadeUp(0.1 + 0.25)}>
              Entrez le code à 6 chiffres depuis votre application d&apos;authentification.
            </motion.p>

            <form className="auth-form" onSubmit={handleMfaVerify}>
              {error && <motion.div className="auth-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{error}</motion.div>}

              <motion.div className="auth-field" {...fadeUp(0.2 + 0.25)}>
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
                  style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: 22, fontWeight: 700 }}
                />
              </motion.div>

              <motion.div {...fadeUp(0.3 + 0.25)}>
                <button type="submit" className="auth-btn" disabled={loadingMfa}>
                  {loadingMfa ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loadingMfa ? 'Vérification...' : 'Vérifier'}
                </button>
              </motion.div>
            </form>

            <motion.div {...fadeUp(0.4 + 0.25)}>
              <button
                onClick={() => { setMfaRequired(false); setMfaCode(''); setError('') }}
                style={{ marginTop: 14, background: 'none', border: 'none', color: '#9CA3AF', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Retour à la connexion
              </button>
            </motion.div>
          </>
        )}

        {/* ── Legal footer ── */}
        <div className="auth-glass-footer">
          <Link href="/cgu">CGU</Link>
          <span>·</span>
          <Link href="/confidentialite">Confidentialité</Link>
          <span>·</span>
          <span>© 2026 TalentFlow</span>
        </div>

      </motion.div>
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
