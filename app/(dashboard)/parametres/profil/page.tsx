'use client'
import { useState, useRef, useEffect } from 'react'
import {
  Camera, Save, Lock, Mail, Phone, User, Briefcase,
  LogOut, Check, Loader2, AlertCircle, Calendar, MapPin,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 14px', borderRadius: 8,
  border: '1.5px solid var(--border)', background: 'white',
  fontSize: 13, color: 'var(--foreground)', fontFamily: 'var(--font-body)',
  outline: 'none', transition: 'border-color 0.15s',
}
const sectionTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 800, color: 'var(--foreground)', marginBottom: 16,
  paddingBottom: 10, borderBottom: '2px solid var(--border)',
  display: 'flex', alignItems: 'center', gap: 8,
}

export default function ProfilPage() {
  const router       = useRouter()
  const supabase     = createClient()
  const queryClient  = useQueryClient()
  const avatarRef    = useRef<HTMLInputElement>(null)

  // ── État du formulaire ────────────────────────────────────────────────────
  const [form, setForm] = useState({
    prenom: '', nom: '', entreprise: '', telephone: '', date_naissance: '',
    localisation: '', role: '', bio: '',
  })
  const [emailForm, setEmailForm]   = useState({ email: '', confirm: '' })
  const [pwdForm, setPwdForm]       = useState({ current: '', nouveau: '', confirm: '' })
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile]       = useState<File | null>(null)

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingEmail, setSavingEmail]     = useState(false)
  const [savingPwd, setSavingPwd]         = useState(false)
  const [savingAvatar, setSavingAvatar]   = useState(false)

  // ── Charger le user ───────────────────────────────────────────────────────
  const { data: user, isLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!user) return
    const m = user.user_metadata || {}
    setForm({
      prenom:         m.prenom         || '',
      nom:            m.nom            || '',
      entreprise:     m.entreprise     || '',
      telephone:      m.telephone      || '',
      date_naissance: m.date_naissance || '',
      localisation:   m.localisation   || '',
      role:           m.role           || 'Consultant',
      bio:            m.bio            || '',
    })
    setEmailForm(prev => ({ ...prev, email: user.email || '' }))
    if (m.avatar_url) setAvatarPreview(m.avatar_url)
  }, [user])

  // ── Avatar ────────────────────────────────────────────────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo trop lourde (max 5 Mo)'); return }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null
    setSavingAvatar(true)
    try {
      const ext  = avatarFile.name.split('.').pop() || 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true, contentType: avatarFile.type })
      if (error) { toast.error('Erreur upload photo'); return null }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      return data.publicUrl + '?t=' + Date.now()
    } finally {
      setSavingAvatar(false)
    }
  }

  // ── Sauvegarder le profil ─────────────────────────────────────────────────
  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      let avatar_url = user?.user_metadata?.avatar_url || null
      if (avatarFile) avatar_url = await uploadAvatar()

      const { error } = await supabase.auth.updateUser({
        data: { ...form, avatar_url },
      })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['current-user'] })
      toast.success('Profil mis à jour ✓')
      setAvatarFile(null)
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Changer l'email ───────────────────────────────────────────────────────
  const changeEmail = async () => {
    if (!emailForm.email.trim()) { toast.error('Email requis'); return }
    if (emailForm.email !== emailForm.confirm) { toast.error('Les emails ne correspondent pas'); return }
    setSavingEmail(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: emailForm.email })
      if (error) throw error
      toast.success('Un email de confirmation a été envoyé à ' + emailForm.email)
      setEmailForm(prev => ({ ...prev, confirm: '' }))
    } catch (err: any) {
      toast.error(err.message || 'Erreur changement email')
    } finally {
      setSavingEmail(false)
    }
  }

  // ── Changer le mot de passe ───────────────────────────────────────────────
  const changePassword = async () => {
    if (!pwdForm.nouveau) { toast.error('Nouveau mot de passe requis'); return }
    if (pwdForm.nouveau.length < 8) { toast.error('Minimum 8 caractères'); return }
    if (pwdForm.nouveau !== pwdForm.confirm) { toast.error('Les mots de passe ne correspondent pas'); return }
    setSavingPwd(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwdForm.nouveau })
      if (error) throw error
      toast.success('Mot de passe mis à jour ✓')
      setPwdForm({ current: '', nouveau: '', confirm: '' })
    } catch (err: any) {
      toast.error(err.message || 'Erreur changement mot de passe')
    } finally {
      setSavingPwd(false)
    }
  }

  // ── Déconnexion ───────────────────────────────────────────────────────────
  const logout = async () => {
    await supabase.auth.signOut()
    queryClient.clear()
    router.push('/login')
  }

  // ── Infos affichées ───────────────────────────────────────────────────────
  const initiales = `${form.prenom[0] || ''}${form.nom[0] || ''}`.toUpperCase()
    || user?.email?.[0]?.toUpperCase() || 'U'

  if (isLoading) {
    return (
      <div className="d-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Loader2 size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    )
  }

  return (
    <div className="d-page" style={{ maxWidth: 740, paddingBottom: 60 }}>

      {/* ── Hero profil ── */}
      <div className="neo-card" style={{ padding: 28, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Avatar avec upload */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: avatarPreview ? 'transparent' : 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 800, color: '#0F172A',
            overflow: 'hidden', border: '3px solid var(--border)',
          }}>
            {avatarPreview
              ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initiales
            }
          </div>
          <button
            onClick={() => avatarRef.current?.click()}
            style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--foreground)', border: '2px solid white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {savingAvatar
              ? <Loader2 size={12} color="white" style={{ animation: 'spin 1s linear infinite' }} />
              : <Camera size={12} color="white" />
            }
          </button>
          <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
        </div>

        {/* Nom + email */}
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.2 }}>
            {[form.prenom, form.nom].filter(Boolean).join(' ') || 'Mon Profil'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{form.role || 'Consultant'}</p>
          {form.entreprise && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1, fontWeight: 600 }}>{form.entreprise}</p>
          )}
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{user?.email}</p>
          {avatarFile && (
            <p style={{ fontSize: 11, color: 'var(--primary)', marginTop: 6, fontWeight: 600 }}>
              📸 Nouvelle photo sélectionnée — sauvegardez pour l&apos;appliquer
            </p>
          )}
        </div>

        {/* Déconnexion */}
        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            borderRadius: 8, border: '1.5px solid #FECACA', background: 'white',
            fontSize: 12, fontWeight: 700, color: '#DC2626', cursor: 'pointer',
            flexShrink: 0, fontFamily: 'var(--font-body)',
          }}
        >
          <LogOut size={13} /> Déconnexion
        </button>
      </div>

      {/* ── Informations personnelles ── */}
      <div className="neo-card" style={{ padding: 24, marginBottom: 16 }}>
        <p style={sectionTitle}><User size={15} style={{ color: 'var(--primary)' }} /> Informations personnelles</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Prénom</label>
            <input style={inputStyle} value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
              placeholder="Votre prénom"
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={labelStyle}>Nom</label>
            <input style={inputStyle} value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
              placeholder="Votre nom de famille"
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}><Briefcase size={10} style={{ display: 'inline', marginRight: 4 }} />Entreprise</label>
            <input style={inputStyle} value={form.entreprise} onChange={e => setForm(f => ({ ...f, entreprise: e.target.value }))}
              placeholder="Nom de votre agence ou entreprise"
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={labelStyle}><Phone size={10} style={{ display: 'inline', marginRight: 4 }} />Téléphone</label>
            <input style={inputStyle} value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
              placeholder="+33 6 00 00 00 00" type="tel"
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={labelStyle}><Calendar size={10} style={{ display: 'inline', marginRight: 4 }} />Date de naissance</label>
            <input style={inputStyle} value={form.date_naissance} onChange={e => setForm(f => ({ ...f, date_naissance: e.target.value }))}
              placeholder="JJ/MM/AAAA"
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={labelStyle}><MapPin size={10} style={{ display: 'inline', marginRight: 4 }} />Localisation</label>
            <input style={inputStyle} value={form.localisation} onChange={e => setForm(f => ({ ...f, localisation: e.target.value }))}
              placeholder="Ville, Pays"
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={labelStyle}><Briefcase size={10} style={{ display: 'inline', marginRight: 4 }} />Rôle / Titre</label>
            <input style={inputStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="ex: Consultant Senior, DRH..."
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Bio / Note personnelle</label>
            <textarea
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="Une courte description de votre rôle ou équipe..."
              rows={3}
              style={{ ...inputStyle, height: 'auto', padding: '10px 14px', resize: 'vertical', lineHeight: 1.5 }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={saveProfile}
            disabled={savingProfile}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 22px', borderRadius: 9,
              background: 'var(--foreground)', border: 'none',
              color: 'white', fontSize: 13, fontWeight: 700,
              cursor: savingProfile ? 'default' : 'pointer',
              opacity: savingProfile ? 0.7 : 1, fontFamily: 'var(--font-body)',
            }}
          >
            {savingProfile ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enregistrement...</> : <><Save size={14} /> Enregistrer</>}
          </button>
        </div>
      </div>

      {/* ── Changer l'email ── */}
      <div className="neo-card" style={{ padding: 24, marginBottom: 16 }}>
        <p style={sectionTitle}><Mail size={15} style={{ color: '#3B82F6' }} /> Changer l&apos;adresse email</p>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={14} style={{ color: '#3B82F6', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: '#1E40AF', lineHeight: 1.5 }}>
            Un email de confirmation sera envoyé à la nouvelle adresse. L&apos;ancienne adresse reste active jusqu&apos;à confirmation.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Nouvelle adresse email</label>
            <input style={inputStyle} type="email" value={emailForm.email} onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))}
              placeholder="nouvelle@email.com"
              onFocus={e => (e.target.style.borderColor = '#3B82F6')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={labelStyle}>Confirmer l&apos;email</label>
            <input style={inputStyle} type="email" value={emailForm.confirm} onChange={e => setEmailForm(f => ({ ...f, confirm: e.target.value }))}
              placeholder="nouvelle@email.com"
              onFocus={e => (e.target.style.borderColor = '#3B82F6')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={changeEmail} disabled={savingEmail || !emailForm.email || emailForm.email !== emailForm.confirm}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 9,
              background: '#3B82F6', border: 'none', color: 'white', fontSize: 13, fontWeight: 700,
              cursor: (!emailForm.email || emailForm.email !== emailForm.confirm) ? 'default' : 'pointer',
              opacity: (!emailForm.email || emailForm.email !== emailForm.confirm) ? 0.5 : 1,
              fontFamily: 'var(--font-body)',
            }}
          >
            {savingEmail ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Envoi...</> : <><Check size={14} /> Confirmer le changement</>}
          </button>
        </div>
      </div>

      {/* ── Changer le mot de passe ── */}
      <div className="neo-card" style={{ padding: 24 }}>
        <p style={sectionTitle}><Lock size={15} style={{ color: '#7C3AED' }} /> Mot de passe</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Mot de passe actuel</label>
            <input style={inputStyle} type="password" value={pwdForm.current} onChange={e => setPwdForm(f => ({ ...f, current: e.target.value }))}
              placeholder="••••••••"
              onFocus={e => (e.target.style.borderColor = '#7C3AED')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={labelStyle}>Nouveau mot de passe</label>
            <input style={inputStyle} type="password" value={pwdForm.nouveau} onChange={e => setPwdForm(f => ({ ...f, nouveau: e.target.value }))}
              placeholder="Min. 8 caractères"
              onFocus={e => (e.target.style.borderColor = '#7C3AED')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
          <div>
            <label style={labelStyle}>Confirmer le mot de passe</label>
            <input style={inputStyle} type="password" value={pwdForm.confirm} onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))}
              placeholder="••••••••"
              onFocus={e => (e.target.style.borderColor = '#7C3AED')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
        </div>

        {/* Indicateur force mot de passe */}
        {pwdForm.nouveau && (
          <div style={{ marginTop: 10 }}>
            {(() => {
              const len = pwdForm.nouveau.length
              const hasUpper = /[A-Z]/.test(pwdForm.nouveau)
              const hasNum = /[0-9]/.test(pwdForm.nouveau)
              const hasSpecial = /[^a-zA-Z0-9]/.test(pwdForm.nouveau)
              const score = (len >= 8 ? 1 : 0) + (len >= 12 ? 1 : 0) + (hasUpper ? 1 : 0) + (hasNum ? 1 : 0) + (hasSpecial ? 1 : 0)
              const label = score <= 1 ? 'Faible' : score <= 3 ? 'Moyen' : 'Fort'
              const color = score <= 1 ? '#EF4444' : score <= 3 ? '#F59E0B' : '#10B981'
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(score / 5) * 100}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s, background 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
                </div>
              )
            })()}
          </div>
        )}

        {pwdForm.nouveau && pwdForm.confirm && pwdForm.nouveau !== pwdForm.confirm && (
          <p style={{ fontSize: 11, color: '#EF4444', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={11} /> Les mots de passe ne correspondent pas
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={changePassword}
            disabled={savingPwd || !pwdForm.nouveau || pwdForm.nouveau !== pwdForm.confirm}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 9,
              background: '#7C3AED', border: 'none', color: 'white', fontSize: 13, fontWeight: 700,
              cursor: (!pwdForm.nouveau || pwdForm.nouveau !== pwdForm.confirm) ? 'default' : 'pointer',
              opacity: (!pwdForm.nouveau || pwdForm.nouveau !== pwdForm.confirm) ? 0.5 : 1,
              fontFamily: 'var(--font-body)',
            }}
          >
            {savingPwd ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Mise à jour...</> : <><Lock size={14} /> Changer le mot de passe</>}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
