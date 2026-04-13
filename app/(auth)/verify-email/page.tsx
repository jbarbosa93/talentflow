'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, RefreshCw, Mail } from 'lucide-react'
import { motion } from 'framer-motion'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { delay, duration: 0.35 },
})

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
    <>
      <motion.div {...fadeUp(0.0 + 0.25)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Mail size={20} style={{ color: '#F5A623' }} />
        <h2 className="auth-card-title" style={{ margin: 0 }}>Vérifiez votre email</h2>
      </motion.div>

      <motion.p className="auth-card-sub" {...fadeUp(0.1 + 0.25)}>
        Un lien de confirmation a été envoyé à :
      </motion.p>

      {email && (
        <motion.div {...fadeUp(0.2 + 0.25)} style={{ marginBottom: 20 }}>
          <div style={{
            display: 'inline-block',
            background: '#fff',
            border: '2px solid #E8E0C8',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 700,
            color: '#1C1A14',
          }}>
            {email}
          </div>
        </motion.div>
      )}

      <motion.p className="auth-card-sub" {...fadeUp(0.3 + 0.25)}>
        Cliquez sur le lien dans l&apos;email pour activer votre compte et accéder à TalentFlow.
      </motion.p>

      {error && (
        <motion.div className="auth-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: 16 }}>
          {error}
        </motion.div>
      )}
      {resent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ background: '#DCFCE7', border: '1.5px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#15803D', fontWeight: 600, marginBottom: 16 }}
        >
          Email renvoyé avec succès !
        </motion.div>
      )}

      {email && (
        <motion.div {...fadeUp(0.4 + 0.25)}>
          <button
            onClick={resendEmail}
            disabled={resending}
            className="auth-btn"
            style={{ marginBottom: 12 }}
          >
            {resending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {resending ? 'Envoi...' : 'Renvoyer l\'email'}
          </button>
        </motion.div>
      )}

      <motion.div {...fadeUp(0.5 + 0.25)}>
        <Link href="/login" className="auth-btn-outline" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Retour à la connexion
        </Link>
      </motion.div>
    </>
  )
}

export default function VerifyEmailPage() {
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

        <Suspense>
          <VerifyContent />
        </Suspense>

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
