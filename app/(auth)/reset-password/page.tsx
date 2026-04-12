'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'

function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPwd, setShowPwd]         = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [done, setDone]               = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  // @supabase/ssr (createBrowserClient) ne traite PAS automatiquement le hash fragment.
  // On extrait manuellement access_token + refresh_token du hash et on appelle setSession.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return

    const params = new URLSearchParams(hash.replace('#', ''))
    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type         = params.get('type')

    if (type !== 'recovery' || !accessToken || !refreshToken) return

    const supabase = createClient()
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error('[ResetPassword] setSession error:', error.message)
          setError('Lien invalide ou expiré. Veuillez refaire une demande.')
        } else {
          setSessionReady(true)
          // Nettoyer le hash de l'URL (cosmétique)
          window.history.replaceState(null, '', window.location.pathname)
        }
      })
  }, [])

  const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 12 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { delay, duration: 0.35 },
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    try {
      // Passer par l'API admin (pas de notification Supabase) + envoi de notre bel email
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Erreur serveur')
      } else {
        setDone(true)
        // Déconnecter puis rediriger vers login pour une connexion propre
        const supabase = createClient()
        await supabase.auth.signOut()
        setTimeout(() => router.push('/login'), 3000)
      }
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-glass-bg">
      <motion.div
        className="auth-glass-card"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
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

        {done ? (
          /* ── Succès ── */
          <>
            <motion.div {...fadeUp(0)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <CheckCircle2 size={20} style={{ color: '#10B981' }} />
              <h2 className="auth-card-title" style={{ margin: 0 }}>Mot de passe mis à jour</h2>
            </motion.div>
            <motion.p className="auth-card-sub" {...fadeUp(0.1)}>
              Votre mot de passe a été modifié avec succès. Vous allez être redirigé vers la page de connexion…
            </motion.p>
            <motion.div {...fadeUp(0.2)} style={{ marginTop: 16 }}>
              <Link href="/login" style={{ color: '#F5A623', fontSize: 13, fontWeight: 600 }}>
                Se connecter →
              </Link>
            </motion.div>
          </>

        ) : !sessionReady ? (
          /* ── En attente du token ── */
          <>
            <motion.div {...fadeUp(0)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Loader2 size={20} style={{ color: '#F5A623', animation: 'spin 1s linear infinite' }} />
              <h2 className="auth-card-title" style={{ margin: 0 }}>Vérification du lien…</h2>
            </motion.div>
            <motion.p className="auth-card-sub" {...fadeUp(0.1)}>
              Veuillez patienter pendant la validation de votre lien de réinitialisation.
            </motion.p>
            <motion.div {...fadeUp(0.2)} style={{ marginTop: 16 }}>
              <Link href="/login" style={{ color: '#9CA3AF', fontSize: 12, textDecoration: 'underline' }}>
                ← Retour à la connexion
              </Link>
            </motion.div>
          </>

        ) : (
          /* ── Formulaire nouveau mot de passe ── */
          <>
            <motion.div {...fadeUp(0)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <ShieldCheck size={20} style={{ color: '#F5A623' }} />
              <h2 className="auth-card-title" style={{ margin: 0 }}>Nouveau mot de passe</h2>
            </motion.div>
            <motion.p className="auth-card-sub" {...fadeUp(0.1)}>
              Choisissez un nouveau mot de passe sécurisé.
            </motion.p>

            <form className="auth-form" onSubmit={handleSubmit}>
              {error && (
                <motion.div className="auth-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {error}
                </motion.div>
              )}

              <motion.div className="auth-field" {...fadeUp(0.2)}>
                <label className="auth-label">Nouveau mot de passe</label>
                <div className="auth-input-wrap">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoFocus
                    autoComplete="new-password"
                  />
                  <button type="button" className="auth-eye-btn" onClick={() => setShowPwd(!showPwd)}>
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </motion.div>

              <motion.div className="auth-field" {...fadeUp(0.3)}>
                <label className="auth-label">Confirmer le mot de passe</label>
                <div className="auth-input-wrap">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <button type="button" className="auth-eye-btn" onClick={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </motion.div>

              <motion.div {...fadeUp(0.4)}>
                <button type="submit" className="auth-btn" disabled={loading}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? 'Mise à jour...' : 'Mettre à jour'}
                </button>
              </motion.div>
            </form>

            <motion.div {...fadeUp(0.5)} style={{ marginTop: 14 }}>
              <Link href="/login" style={{ color: '#9CA3AF', fontSize: 12, textDecoration: 'underline' }}>
                ← Retour à la connexion
              </Link>
            </motion.div>
          </>
        )}

        {/* Legal footer */}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
