'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'

function VerifyContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const [resending, setResending] = useState(false)
  const [resent, setResent]       = useState(false)
  const [error, setError]         = useState('')

  async function resendEmail() {
    if (!email) return
    setResending(true)
    setError('')
    setResent(false)

    const supabase = createClient()
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })

    if (err) { setError(err.message) }
    else      { setResent(true) }
    setResending(false)
  }

  return (
    <div className="auth-verify">
      <div className="auth-verify-icon">📧</div>
      <h2 className="auth-verify-title">Vérifiez votre email</h2>
      <p className="auth-verify-desc">
        Un lien de confirmation a été envoyé à :
      </p>
      {email && (
        <div className="auth-verify-email-badge">{email}</div>
      )}
      <p className="auth-verify-desc">
        Cliquez sur le lien dans l&apos;email pour activer votre compte et accéder à TalentFlow.
      </p>

      {error && (
        <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>
      )}
      {resent && (
        <div style={{ background: '#DCFCE7', border: '1.5px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#15803D', fontWeight: 600, marginBottom: 16 }}>
          ✅ Email renvoyé avec succès !
        </div>
      )}

      {email && (
        <button
          onClick={resendEmail}
          disabled={resending}
          className="auth-btn"
          style={{ marginBottom: 12 }}
        >
          {resending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {resending ? 'Envoi...' : 'Renvoyer l\'email'}
        </button>
      )}

      <Link href="/login" className="auth-btn-outline" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
        Retour à la connexion
      </Link>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="auth-glass-bg">
      <motion.div
        className="auth-glass-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
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

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
        >
          <Suspense>
            <VerifyContent />
          </Suspense>
        </motion.div>

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
