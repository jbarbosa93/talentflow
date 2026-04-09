'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, CheckCircle2, Lock, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 10 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { delay, duration: 0.32 },
})

function LogoBlock() {
  return (
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
  )
}

function LegalFooter() {
  return (
    <div className="auth-glass-footer">
      <Link href="/cgu">CGU</Link>
      <span>·</span>
      <Link href="/confidentialite">Confidentialité</Link>
      <span>·</span>
      <span>© 2026 TalentFlow</span>
    </div>
  )
}

function AccepterInvitationInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [user, setUser]           = useState<{ email?: string; prenom?: string; nom?: string; entreprise?: string } | null>(null)
  const [loading, setLoading]     = useState(true)
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [showConf, setShowConf]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)
  const [expired, setExpired]     = useState(false)
  const [entreprise, setEntreprise] = useState('')

  useEffect(() => {
    const authError = searchParams.get('auth_error')
    if (authError === 'otp_expired' || authError === 'access_denied') {
      setExpired(true)
      setLoading(false)
      return
    }

    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.replace('#', ''))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    const tryGetUser = async () => {
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      }

      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        setTimeout(async () => {
          const { data: data2 } = await supabase.auth.getUser()
          if (!data2.user) {
            router.replace('/login')
            return
          }
          const m = data2.user.user_metadata || {}
          setUser({ email: data2.user.email, prenom: m.prenom || '', nom: m.nom || '', entreprise: m.entreprise || '' })
          setLoading(false)
        }, 1200)
        return
      }
      const m = data.user.user_metadata || {}
      setUser({ email: data.user.email, prenom: m.prenom || '', nom: m.nom || '', entreprise: m.entreprise || '' })
      setEntreprise(m.entreprise || '')
      setLoading(false)
    }

    tryGetUser()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sécurité : si l'utilisateur quitte la page sans créer son mot de passe → sign out
  useEffect(() => {
    if (done || loading || expired) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (!done) {
        supabase.auth.signOut()
      }
    }
  }, [done, loading, expired, supabase.auth])

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

    setSaving(true)
    const { error: updateErr } = await supabase.auth.updateUser({
      password,
      data: { ...((user as any)?.user_metadata || {}), entreprise, password_set_at: new Date().toISOString() },
    })
    if (updateErr) {
      setError(updateErr.message)
      setSaving(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="auth-glass-bg">
        <Loader2 size={32} className="animate-spin" style={{ color: '#F5A623' }} />
      </div>
    )
  }

  // ── Lien expiré ──
  if (expired) {
    return (
      <div className="auth-glass-bg">
        <motion.div
          className="auth-glass-card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{ textAlign: 'center' }}
        >
          <LogoBlock />
          <motion.div {...fadeUp(0.2)}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 16, background: '#FEF2F2', marginBottom: 20 }}>
              <AlertTriangle size={32} color="#DC2626" />
            </div>
            <h2 className="auth-card-title">Lien d&apos;invitation expiré</h2>
            <p className="auth-card-sub" style={{ marginBottom: 24 }}>
              Ce lien n&apos;est plus valide (durée dépassée).<br/>
              Demandez à votre administrateur de vous renvoyer une invitation.
            </p>
            <Link href="/login" style={{ display: 'inline-block', padding: '12px 28px', background: '#F5A623', color: '#1C1A14', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', border: '2px solid #1C1A14', boxShadow: '3px 3px 0 #1C1A14' }}>
              Aller à la connexion →
            </Link>
          </motion.div>
          <LegalFooter />
        </motion.div>
      </div>
    )
  }

  // ── Formulaire principal ──
  return (
    <div className="auth-glass-bg">
      <motion.div
        className="auth-glass-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        style={{ maxWidth: 480 }}
      >
        <LogoBlock />

        {done ? (
          /* ── Succès ── */
          <motion.div {...fadeUp(0.1)} style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle2 size={52} color="#16A34A" style={{ marginBottom: 16 }} />
            <h2 className="auth-card-title">Compte créé !</h2>
            <p className="auth-card-sub">Redirection vers le dashboard…</p>
          </motion.div>
        ) : (
          <>
            <motion.div {...fadeUp(0.15)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, background: '#F5A623', border: '2px solid #1C1A14', boxShadow: '2px 2px 0 #1C1A14', flexShrink: 0 }}>
                <Lock size={16} color="#1C1A14" />
              </span>
              <h2 className="auth-card-title" style={{ margin: 0 }}>Créer votre compte</h2>
            </motion.div>
            <motion.p className="auth-card-sub" {...fadeUp(0.2)} style={{ marginBottom: 24 }}>
              Définissez votre mot de passe pour accéder à TalentFlow.
            </motion.p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <motion.div {...fadeUp(0.25)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="auth-label">Prénom</label>
                  <input className="auth-input" value={user?.prenom || ''} readOnly style={{ background: '#F3F4F6', color: '#6B7280', cursor: 'default', borderColor: '#E5E7EB' }} />
                </div>
                <div>
                  <label className="auth-label">Nom</label>
                  <input className="auth-input" value={user?.nom || ''} readOnly style={{ background: '#F3F4F6', color: '#6B7280', cursor: 'default', borderColor: '#E5E7EB' }} />
                </div>
              </motion.div>

              <motion.div {...fadeUp(0.3)}>
                <label className="auth-label">Adresse email</label>
                <input className="auth-input" value={user?.email || ''} readOnly style={{ background: '#F3F4F6', color: '#6B7280', cursor: 'default', borderColor: '#E5E7EB' }} />
              </motion.div>

              <motion.div {...fadeUp(0.35)}>
                <label className="auth-label">Entreprise</label>
                <input
                  className="auth-input"
                  value={entreprise}
                  onChange={e => setEntreprise(e.target.value)}
                  placeholder="Nom de votre entreprise"
                  readOnly={!!user?.entreprise}
                  style={user?.entreprise ? { background: '#F3F4F6', color: '#6B7280', cursor: 'default', borderColor: '#E5E7EB' } : undefined}
                />
              </motion.div>

              <motion.div {...fadeUp(0.38)} style={{ borderTop: '1px solid #E8E0C8', margin: '4px 0' }} />

              <motion.div {...fadeUp(0.4)}>
                <label className="auth-label">Mot de passe *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="auth-input"
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimum 8 caractères"
                    required
                    autoFocus
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0 }}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {[1,2,3,4].map(i => {
                      const strength = password.length >= 12 && /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4
                        : password.length >= 10 ? 3
                        : password.length >= 8 ? 2
                        : 1
                      return (
                        <div key={i} style={{
                          flex: 1, height: 3, borderRadius: 99,
                          background: i <= strength
                            ? strength >= 4 ? '#16A34A' : strength >= 3 ? '#F59E0B' : '#EF4444'
                            : '#E8E0C8',
                          transition: 'background 0.2s',
                        }} />
                      )
                    })}
                  </div>
                )}
              </motion.div>

              <motion.div {...fadeUp(0.45)}>
                <label className="auth-label">Confirmer le mot de passe *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="auth-input"
                    type={showConf ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Répétez votre mot de passe"
                    required
                    style={{ paddingRight: 44, borderColor: confirm.length > 0 && confirm !== password ? '#EF4444' : undefined }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConf(!showConf)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0 }}
                  >
                    {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirm.length > 0 && confirm !== password && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#EF4444' }}>Les mots de passe ne correspondent pas</p>
                )}
              </motion.div>

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="auth-error">
                  {error}
                </motion.div>
              )}

              <motion.div {...fadeUp(0.5)}>
                <button
                  type="submit"
                  disabled={saving || !password || !confirm}
                  className="auth-btn"
                  style={{ marginTop: 4 }}
                >
                  {saving ? <><Loader2 size={16} className="animate-spin" /> Création en cours…</> : 'Créer mon compte →'}
                </button>
              </motion.div>
            </form>
          </>
        )}

        <LegalFooter />
      </motion.div>
    </div>
  )
}

export default function AccepterInvitationPage() {
  return (
    <Suspense fallback={
      <div className="auth-glass-bg">
        <Loader2 size={32} className="animate-spin" style={{ color: '#F5A623' }} />
      </div>
    }>
      <AccepterInvitationInner />
    </Suspense>
  )
}
