'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, RefreshCw } from 'lucide-react'
import { Suspense } from 'react'

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
        Cliquez sur le lien dans l'email pour activer votre compte et accéder à TalentFlow.
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
    <div className="auth-page">
      {/* Panel gauche */}
      <div className="auth-left">
        <Link href="/" className="auth-logo">
          <div className="auth-logo-dot" />
          <span className="auth-logo-text">TalentFlow</span>
        </Link>
        <div className="auth-left-content">
          <div className="auth-left-tag">Validation requise</div>
          <h1 className="auth-left-title">
            Presque<br />là <em>!</em>
          </h1>
          <p className="auth-left-desc">
            La validation email protège votre compte et garantit la sécurité de vos données de recrutement.
          </p>
        </div>
        <div className="auth-left-footer">© 2026 TalentFlow. Tous droits réservés.</div>
      </div>

      {/* Panel droit */}
      <div className="auth-right">
        <Suspense>
          <VerifyContent />
        </Suspense>
      </div>
    </div>
  )
}
