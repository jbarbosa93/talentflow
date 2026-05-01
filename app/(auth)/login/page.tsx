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

  // Reconnexion transparente après auto-logout (cookie tf_remember)
  const [autoReconnecting, setAutoReconnecting] = useState(false)
  const [isAutoLogout, setIsAutoLogout] = useState(false)
  useEffect(() => {
    const flag = sessionStorage.getItem('auto_logout')
    if (flag === 'true') {
      sessionStorage.removeItem('auto_logout')
      setIsAutoLogout(true)
    }
    // Tenter la reconnexion silencieuse via cookie httpOnly
    const tryAutoReconnect = async () => {
      try {
        const res = await fetch('/api/auth/auto-reconnect')
        const data = await res.json()
        if (data.reconnected) {
          setAutoReconnecting(true)
          localStorage.setItem('talentflow_last_activity', Date.now().toString())
          router.push('/dashboard')
          router.refresh()
          return
        }
      } catch {} // cookie absent ou expiré → login normal
    }
    tryAutoReconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        localStorage.setItem('talentflow_last_activity', Date.now().toString())
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

      localStorage.setItem('talentflow_last_activity', Date.now().toString())
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
    localStorage.setItem('talentflow_last_activity', Date.now().toString())
    router.push('/dashboard')
    router.refresh()
  }

  // ── Animations ──────────────────────────────────────────────────────────────
  const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 12 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { delay, duration: 0.35 },
  })

  // ── Render V2 (Design V2 Claude Design — split layout) ────────────────────
  return (
    <div className="login-v2">
      {/* Pane gauche — art noir avec gradients or */}
      <div className="login-art">
        <div className="login-art-brand">
          <span className="login-art-brand-mark">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M13 2L4 13h7l-1 9 10-12h-7z" fill="#1C1A14"/>
            </svg>
          </span>
          <span>TalentFlow</span>
        </div>
        <div className="login-art-inner">
          <h1>Trouver la<br/>bonne personne,<br/><em>plus vite</em>.</h1>
          <p>TalentFlow centralise tes candidats, automatise le matching et élimine les doublons.</p>
        </div>
        <div className="login-art-footer">
          © 2026 L\'AGENCE SA · Monthey, Suisse
        </div>
      </div>

      {/* Pane droite — form */}
      <div className="login-form-pane">
        <div className="login-card">

          {/* Banner session expirée */}
          {isAutoLogout && !autoReconnecting && (
            <motion.div
              className="info-banner"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            >
              <ShieldCheck size={14} /> Session expirée — reconnecte-toi.
            </motion.div>
          )}

          {/* État reconnexion auto */}
          {autoReconnecting ? (
            <motion.div {...fadeUp(0.1)} style={{ textAlign: 'center', padding: '40px 0' }}>
              <Loader2 size={28} className="spinner" style={{ color: '#EAB308', margin: '0 auto 16px', display: 'block' }} />
              <p style={{ color: 'var(--text-2, #5C5645)', fontSize: 13.5 }}>Reconnexion en cours…</p>
            </motion.div>

          ) : forgotMode ? (
            /* ── Mot de passe oublié ── */
            <>
              <motion.h2 {...fadeUp(0)}>
                {forgotSent ? 'Email envoyé.' : 'Mot de passe oublié ?'}
              </motion.h2>
              <motion.p className="subtitle" {...fadeUp(0.05)}>
                {forgotSent
                  ? <>Un lien de réinitialisation a été envoyé à <strong>{forgotEmail}</strong>. Vérifie ta boîte mail.</>
                  : 'Entre ton email, on t\'envoie un lien de réinitialisation.'
                }
              </motion.p>

              {!forgotSent && (
                <form className="login-step" onSubmit={handleForgotPassword}>
                  {error && <div className="error-v2"><Mail size={14} />{error}</div>}
                  <motion.div className="form-row" {...fadeUp(0.1)}>
                    <label>Email professionnel</label>
                    <input
                      type="email"
                      className="input-v2"
                      placeholder="prenom@l-agence.ch"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </motion.div>
                  <motion.button type="submit" className="btn-v2 primary btn-block" disabled={forgotLoading} {...fadeUp(0.15)}>
                    {forgotLoading ? <Loader2 size={14} className="spinner" /> : <Mail size={14} />}
                    {forgotLoading ? 'Envoi…' : 'Envoyer le lien'}
                  </motion.button>
                </form>
              )}

              <motion.button
                type="button"
                className="btn-v2 ghost btn-block"
                onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(''); setError('') }}
                {...fadeUp(0.2)}
              >
                ← Retour à la connexion
              </motion.button>
            </>

          ) : emailOtpRequired && !mfaRequired ? (
            /* ── Vérification Email OTP ── */
            <>
              <motion.h2 {...fadeUp(0)}>Un code t\'attend.</motion.h2>
              <motion.p className="subtitle" {...fadeUp(0.05)}>
                Code à 6 chiffres envoyé à <strong>{email}</strong>.
              </motion.p>

              <form className="login-step" onSubmit={handleEmailOtpVerify}>
                {error && <div className="error-v2"><Mail size={14} />{error}</div>}
                <motion.div className="form-row" {...fadeUp(0.1)}>
                  <label>Code de vérification</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="input-v2"
                    placeholder="000000"
                    value={emailOtpCode}
                    onChange={e => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                    style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: 22, fontWeight: 700, height: 52 }}
                  />
                </motion.div>
                <motion.button type="submit" className="btn-v2 primary btn-block" disabled={emailOtpLoading} {...fadeUp(0.15)}>
                  {emailOtpLoading ? <Loader2 size={14} className="spinner" /> : null}
                  {emailOtpLoading ? 'Vérification…' : 'Vérifier et entrer'}
                </motion.button>
              </form>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  className="link-v2"
                  onClick={() => { setEmailOtpRequired(false); setEmailOtpCode(''); setError('') }}
                  style={{ color: 'var(--text-3)' }}
                >
                  ← Changer d\'email
                </button>
                <button
                  type="button"
                  className="link-v2"
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
                >
                  Renvoyer le code
                </button>
              </div>
            </>

          ) : !mfaRequired ? (
            /* ── Login email + password (default) ── */
            <>
              <motion.h2 {...fadeUp(0)}>Bon retour.</motion.h2>
              <motion.p className="subtitle" {...fadeUp(0.05)}>
                Connecte-toi à ton espace recruteur.
              </motion.p>

              <form className="login-step" onSubmit={handleSubmit}>
                {(domainError || error) && (
                  <div className="error-v2"><Mail size={14} />{domainError || error}</div>
                )}

                <motion.div className="form-row" {...fadeUp(0.1)}>
                  <label>Email professionnel</label>
                  <input
                    type="email"
                    className="input-v2"
                    placeholder="prenom@l-agence.ch"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </motion.div>

                <motion.div className="form-row" {...fadeUp(0.15)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label>Mot de passe</label>
                    <button
                      type="button"
                      className="link-v2"
                      onClick={() => { setForgotMode(true); setForgotEmail(email); setError('') }}
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="input-wrap">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      className="input-v2 with-icon"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <button type="button" className="input-icon-right" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Cacher' : 'Afficher'}>
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </motion.div>

                <motion.button type="submit" className="btn-v2 primary btn-block" disabled={loading} {...fadeUp(0.2)}>
                  {loading ? <Loader2 size={14} className="spinner" /> : null}
                  {loading ? 'Connexion…' : 'Se connecter'}
                </motion.button>
              </form>

              <div className="footer-link">
                Pas d\'accès ? <Link href="/demande-acces">Faire une demande →</Link>
              </div>
            </>

          ) : (
            /* ── MFA TOTP (2FA app authenticator) ── */
            <>
              <motion.h2 {...fadeUp(0)}>Vérification 2FA.</motion.h2>
              <motion.p className="subtitle" {...fadeUp(0.05)}>
                Code à 6 chiffres depuis ton application d\'authentification.
              </motion.p>

              <form className="login-step" onSubmit={handleMfaVerify}>
                {error && <div className="error-v2"><ShieldCheck size={14} />{error}</div>}
                <motion.div className="form-row" {...fadeUp(0.1)}>
                  <label>Code d\'authentification</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="input-v2"
                    placeholder="000000"
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                    style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: 22, fontWeight: 700, height: 52 }}
                  />
                </motion.div>
                <motion.button type="submit" className="btn-v2 primary btn-block" disabled={loadingMfa} {...fadeUp(0.15)}>
                  {loadingMfa ? <Loader2 size={14} className="spinner" /> : <ShieldCheck size={14} />}
                  {loadingMfa ? 'Vérification…' : 'Vérifier'}
                </motion.button>
              </form>

              <button
                type="button"
                className="btn-v2 ghost btn-block"
                onClick={() => { setMfaRequired(false); setMfaCode(''); setError('') }}
              >
                ← Retour à la connexion
              </button>
            </>
          )}

          {/* Legal footer */}
          <div style={{ marginTop: 24, fontSize: 11, color: 'var(--text-3, #999)', textAlign: 'center', display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Link href="/cgu" style={{ color: 'inherit' }}>CGU</Link>
            <span>·</span>
            <Link href="/confidentialite" style={{ color: 'inherit' }}>Confidentialité</Link>
            <span>·</span>
            <span>© 2026 TalentFlow</span>
          </div>
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
