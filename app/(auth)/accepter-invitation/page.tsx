'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, CheckCircle2, Lock, AlertTriangle } from 'lucide-react'

export default function AccepterInvitationPage() {
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

  useEffect(() => {
    const authError = searchParams.get('auth_error')
    if (authError === 'otp_expired' || authError === 'access_denied') {
      setExpired(true)
      setLoading(false)
      return
    }

    // Si le hash contient access_token (invitation directe), on attend que Supabase l'établisse
    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.replace('#', ''))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    const tryGetUser = async () => {
      // Si on a un token dans le hash, on établit la session manuellement
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      }

      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        // Attendre un peu que Supabase traite le hash
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
      setLoading(false)
    }

    tryGetUser()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setSaving(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  if (loading) {
    return (
      <div className="auth-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 size={32} className="spin" style={{ color: '#F7C948' }} />
      </div>
    )
  }

  if (expired) {
    return (
      <div className="auth-page">
        <div className="auth-left">
          <Link href="/" className="auth-logo">
            <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:9, background:'#F7C948', flexShrink:0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 13h7l-1 9 10-12h-7z" fill="#1C1A14"/></svg>
            </span>
            <span className="auth-logo-text">TalentFlow</span>
          </Link>
          <div className="auth-left-content">
            <div className="auth-left-tag">Accès sur invitation</div>
            <h1 className="auth-left-title">Lien expiré</h1>
            <p className="auth-left-desc">Votre lien d&apos;invitation n&apos;est plus valide. Contactez votre administrateur pour recevoir une nouvelle invitation.</p>
          </div>
          <div className="auth-left-footer">© 2026 TalentFlow. Tous droits réservés.</div>
        </div>
        <div className="auth-right">
          <div className="auth-card" style={{ textAlign:'center', padding:'40px 32px' }}>
            <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:64, height:64, borderRadius:16, background:'#FEF2F2', marginBottom:20 }}>
              <AlertTriangle size={32} color="#DC2626" />
            </div>
            <h2 className="auth-card-title">Lien d&apos;invitation expiré</h2>
            <p className="auth-card-sub" style={{ marginBottom:24 }}>
              Ce lien d&apos;invitation n&apos;est plus valide (durée dépassée).<br/>
              Demandez à votre administrateur de vous renvoyer une invitation.
            </p>
            <Link href="/login" style={{ display:'inline-block', padding:'10px 24px', background:'#F7C948', color:'#1C1A14', borderRadius:99, fontWeight:600, fontSize:14, textDecoration:'none' }}>
              Aller à la connexion →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      {/* Panel gauche */}
      <div className="auth-left">
        <Link href="/" className="auth-logo">
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 9, background: '#F7C948', flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L4 13h7l-1 9 10-12h-7z" fill="#1C1A14"/>
            </svg>
          </span>
          <span className="auth-logo-text">TalentFlow</span>
        </Link>

        <div className="auth-left-content">
          <div className="auth-left-tag">Accès sur invitation</div>
          <h1 className="auth-left-title">
            Bienvenue sur<br /><em>TalentFlow</em>
          </h1>
          <p className="auth-left-desc">
            Vous avez été invité à rejoindre la plateforme. Créez votre mot de passe pour accéder à votre espace.
          </p>
          <div className="auth-features">
            {[
              { icon: '⚡', text: 'Import CVs automatique — email, OneDrive, scanner' },
              { icon: '🤖', text: 'Extraction IA du profil complet en 3 secondes' },
              { icon: '🎯', text: 'Score de matching candidat × offre en temps réel' },
              { icon: '📊', text: 'Pipeline visuel avec statuts personnalisables' },
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
          {done ? (
            /* ── Succès ── */
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle2 size={52} color="#16A34A" style={{ marginBottom: 16 }} />
              <h2 className="auth-card-title">Compte créé !</h2>
              <p className="auth-card-sub">Redirection vers le dashboard…</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, borderRadius: 9, background: '#F7C948', flexShrink: 0,
                }}>
                  <Lock size={16} color="#1C1A14" />
                </span>
                <div>
                  <h2 className="auth-card-title" style={{ margin: 0 }}>Créer votre compte</h2>
                </div>
              </div>
              <p className="auth-card-sub" style={{ marginBottom: 24 }}>
                Définissez votre mot de passe pour accéder à TalentFlow.
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Infos pré-remplies (lecture seule) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="auth-label">Prénom</label>
                    <input
                      className="auth-input"
                      value={user?.prenom || ''}
                      readOnly
                      style={{ background: 'var(--secondary)', color: 'var(--muted)', cursor: 'default' }}
                    />
                  </div>
                  <div>
                    <label className="auth-label">Nom</label>
                    <input
                      className="auth-input"
                      value={user?.nom || ''}
                      readOnly
                      style={{ background: 'var(--secondary)', color: 'var(--muted)', cursor: 'default' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="auth-label">Adresse email</label>
                  <input
                    className="auth-input"
                    value={user?.email || ''}
                    readOnly
                    style={{ background: 'var(--secondary)', color: 'var(--muted)', cursor: 'default' }}
                  />
                </div>

                {/* Séparateur */}
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

                {/* Mot de passe */}
                <div>
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
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {/* Barre de force */}
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
                              : 'var(--border)',
                            transition: 'background 0.2s',
                          }} />
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Confirmation */}
                <div>
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
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}
                    >
                      {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirm.length > 0 && confirm !== password && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#EF4444' }}>Les mots de passe ne correspondent pas</p>
                  )}
                </div>

                {/* Erreur */}
                {error && (
                  <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={saving || !password || !confirm}
                  className="auth-btn"
                  style={{ marginTop: 4 }}
                >
                  {saving ? <><Loader2 size={16} className="spin" /> Création en cours…</> : 'Créer mon compte →'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
