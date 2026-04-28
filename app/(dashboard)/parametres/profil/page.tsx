'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Camera, Save, Lock, Mail, Phone, User, Briefcase,
  LogOut, Check, Loader2, AlertCircle, Calendar, MapPin,
  ShieldCheck, ShieldOff, QrCode, ZoomIn, ZoomOut, Move, Plug, XCircle,
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
  border: '1.5px solid var(--border)', background: 'var(--card)',
  fontSize: 13, color: 'var(--foreground)', fontFamily: 'var(--font-body)',
  outline: 'none', transition: 'border-color 0.15s',
}
const sectionTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 800, color: 'var(--foreground)', marginBottom: 16,
  paddingBottom: 10, borderBottom: '2px solid var(--border)',
  display: 'flex', alignItems: 'center', gap: 8,
}

// ─── Image Crop Modal ─────────────────────────────────────────────────────────

function ImageCropModal({ src, onSave, onCancel }: { src: string; onSave: (blob: Blob) => void; onCancel: () => void }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const imgRef     = useRef<HTMLImageElement | null>(null)
  const [scale, setScale]   = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })

  const CROP_SIZE = 280

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      // Auto-fit: scale so the smaller dimension fills the crop area
      const fitScale = Math.max(CROP_SIZE / img.width, CROP_SIZE / img.height)
      setScale(fitScale)
      setOffset({ x: 0, y: 0 })
    }
    img.src = src
  }, [src])

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = CROP_SIZE
    canvas.height = CROP_SIZE

    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE)
    ctx.fillStyle = '#E2E8F0'
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE)

    const w = img.width * scale
    const h = img.height * scale
    const x = (CROP_SIZE - w) / 2 + offset.x
    const y = (CROP_SIZE - h) / 2 + offset.y

    ctx.drawImage(img, x, y, w, h)
  }, [scale, offset])

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    offsetStart.current = { ...offset }
  }

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      setOffset({
        x: offsetStart.current.x + (e.clientX - dragStart.current.x),
        y: offsetStart.current.y + (e.clientY - dragStart.current.y),
      })
    }
    const handleUp = () => setDragging(false)
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp) }
  }, [dragging])

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (blob) onSave(blob)
    }, 'image/jpeg', 0.92)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div style={{
        background: 'var(--card)', borderRadius: 16, padding: 28, maxWidth: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        animation: 'slideUp 0.2s ease',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', marginBottom: 16, textAlign: 'center' }}>
          Recadrer la photo
        </h3>

        {/* Canvas area */}
        <div style={{
          width: CROP_SIZE, height: CROP_SIZE, margin: '0 auto 16px',
          borderRadius: 12, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab',
          border: '2px solid var(--border)', position: 'relative',
        }}>
          <canvas
            ref={canvasRef}
            width={CROP_SIZE}
            height={CROP_SIZE}
            style={{ display: 'block', width: CROP_SIZE, height: CROP_SIZE }}
            onMouseDown={handleMouseDown}
          />
          {/* Move hint */}
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '3px 10px',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, color: 'white', fontWeight: 600, pointerEvents: 'none',
          }}>
            <Move size={10} /> Déplacer
          </div>
        </div>

        {/* Zoom slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '0 8px' }}>
          <ZoomOut size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            type="range"
            min="0.2" max="3" step="0.05"
            value={scale}
            onChange={e => setScale(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--primary)' }}
          />
          <ZoomIn size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '9px 18px', borderRadius: 8,
              border: '1.5px solid var(--border)', background: 'var(--card)',
              fontSize: 13, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '9px 22px', borderRadius: 8,
              border: 'none', background: 'var(--foreground)',
              fontSize: 13, fontWeight: 700, color: 'white', cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            <Check size={14} /> Sauvegarder
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}

export default function ProfilPage() {
  const router       = useRouter()
  const supabase     = createClient()
  const queryClient  = useQueryClient()
  const avatarRef    = useRef<HTMLInputElement>(null)

  // Toast si retour OAuth Outlook réussi
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'microsoft_email') {
      toast.success('Compte Outlook connecté avec succès ✓')
      window.history.replaceState({}, '', '/parametres/profil')
    }
    if (params.get('error_email')) {
      toast.error('Erreur connexion Outlook : ' + decodeURIComponent(params.get('error_email') || ''))
      window.history.replaceState({}, '', '/parametres/profil')
    }
  }, [])

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
  const [outlookLoading, setOutlookLoading] = useState(false)

  // Signature email
  const [signatureHtml, setSignatureHtml] = useState('')
  const [savingSignature, setSavingSignature] = useState(false)
  const [showSignatureSource, setShowSignatureSource] = useState(false)

  // ── Outlook : intégration email personnelle ────────────────────────────────
  const { data: outlookIntegration, refetch: refetchOutlook } = useQuery({
    queryKey: ['outlook-integration'],
    queryFn: async () => {
      const res = await fetch('/api/microsoft/email-status')
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 30_000,
  })

  const connectOutlook = () => {
    window.location.href = '/api/microsoft/auth?purpose=email'
  }

  const disconnectOutlook = async () => {
    setOutlookLoading(true)
    try {
      const res = await fetch('/api/microsoft/email-disconnect', { method: 'DELETE' })
      if (res.ok) {
        toast.success('Compte Outlook déconnecté')
        refetchOutlook()
      } else {
        toast.error('Erreur lors de la déconnexion')
      }
    } finally {
      setOutlookLoading(false)
    }
  }

  // Crop modal
  const [cropSrc, setCropSrc]             = useState<string | null>(null)

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
    setSignatureHtml(m.signature_html || '')
  }, [user])

  // ── Sauvegarder la signature email ────────────────────────────────────────
  const saveSignature = async () => {
    if (!user) return
    setSavingSignature(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { ...user.user_metadata, signature_html: signatureHtml },
      })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['current-user'] })
      toast.success('Signature mise à jour ✓')
    } catch (err: any) {
      toast.error(err.message || 'Erreur sauvegarde signature')
    } finally {
      setSavingSignature(false)
    }
  }

  // ── Avatar — ouvre le crop modal ──────────────────────────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo trop lourde (max 5 Mo)'); return }
    // Open crop modal with the selected file
    const objectUrl = URL.createObjectURL(file)
    setCropSrc(objectUrl)
    // Reset file input so the same file can be re-selected
    e.target.value = ''
  }

  // After crop, upload immediately
  const handleCropSave = async (blob: Blob) => {
    setCropSrc(null)
    if (!user) return

    setSavingAvatar(true)
    try {
      const path = `${user.id}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) { toast.error('Erreur upload photo'); return }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = data.publicUrl + '?t=' + Date.now()

      // Update user metadata with new avatar
      const { error: updateError } = await supabase.auth.updateUser({
        data: { ...user.user_metadata, avatar_url: avatarUrl },
      })
      if (updateError) throw updateError

      setAvatarPreview(avatarUrl)
      queryClient.invalidateQueries({ queryKey: ['current-user'] })
      toast.success('Photo de profil mise à jour ✓')
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la sauvegarde de la photo')
    } finally {
      setSavingAvatar(false)
    }
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
    // v1.9.76 : vider toutes les données de session (filtres candidats, sélection, etc.)
    try { sessionStorage.clear() } catch {}
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
            width: 88, height: 88, borderRadius: 14,
            background: avatarPreview ? 'transparent' : 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 800, color: 'var(--foreground)',
            overflow: 'hidden', border: '3px solid var(--border)',
          }}>
            {avatarPreview
              ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initiales
            }
          </div>
          <button
            onClick={() => avatarRef.current?.click()}
            disabled={savingAvatar}
            style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--primary)', border: '2px solid var(--card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: savingAvatar ? 'default' : 'pointer',
              opacity: savingAvatar ? 0.7 : 1,
            }}
          >
            {savingAvatar
              ? <Loader2 size={12} color="var(--primary-foreground)" style={{ animation: 'spin 1s linear infinite' }} />
              : <Camera size={12} color="var(--primary-foreground)" />
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
        </div>

        {/* Déconnexion */}
        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            borderRadius: 8, border: '1.5px solid #FECACA', background: 'var(--card)',
            fontSize: 12, fontWeight: 700, color: 'var(--destructive)', cursor: 'pointer',
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
              background: 'var(--primary)', border: 'none',
              color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 700,
              cursor: savingProfile ? 'default' : 'pointer',
              opacity: savingProfile ? 0.7 : 1, fontFamily: 'var(--font-body)',
            }}
          >
            {savingProfile ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enregistrement...</> : <><Save size={14} /> Enregistrer</>}
          </button>
        </div>
      </div>

      {/* ── Signature email ── */}
      <div className="neo-card" style={{ padding: 24, marginBottom: 16 }}>
        <p style={sectionTitle}><Mail size={15} style={{ color: '#8B5CF6' }} /> Ma signature email</p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Signature HTML ajoutée automatiquement à la fin de chaque mail envoyé depuis <code>/messages</code> (Outlook).
          Les images doivent utiliser des URLs externes publiques (pas de <code>cid:</code> ni base64).
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setShowSignatureSource(false)}
            style={{
              padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border)',
              background: !showSignatureSource ? 'var(--foreground)' : 'transparent',
              color: !showSignatureSource ? 'white' : 'var(--foreground)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >Aperçu</button>
          <button
            type="button"
            onClick={() => setShowSignatureSource(true)}
            style={{
              padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border)',
              background: showSignatureSource ? 'var(--foreground)' : 'transparent',
              color: showSignatureSource ? 'white' : 'var(--foreground)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >HTML source</button>
        </div>

        {showSignatureSource ? (
          <textarea
            value={signatureHtml}
            onChange={e => setSignatureHtml(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder="<div>Cordialement,<br>Prénom Nom<br>L-AGENCE SA</div>"
            style={{
              ...inputStyle, height: 'auto', padding: 12, resize: 'vertical',
              fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
              fontSize: 12, lineHeight: 1.5,
            }}
            onFocus={e => (e.target.style.borderColor = '#8B5CF6')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        ) : (
          <div
            style={{
              minHeight: 160, padding: 16, border: '1px solid var(--border)',
              borderRadius: 8, background: '#FAFAFA', overflow: 'auto',
            }}
            dangerouslySetInnerHTML={{
              __html: signatureHtml || '<p style="color:#9CA3AF;font-size:13px;margin:0">Aucune signature définie. Bascule sur <b>HTML source</b> pour la coller.</p>',
            }}
          />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {signatureHtml.length} caractères
          </span>
          <button
            onClick={saveSignature}
            disabled={savingSignature}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 22px', borderRadius: 9,
              background: '#8B5CF6', border: 'none', color: 'white',
              fontSize: 13, fontWeight: 700,
              cursor: savingSignature ? 'default' : 'pointer',
              opacity: savingSignature ? 0.7 : 1, fontFamily: 'var(--font-body)',
            }}
          >
            {savingSignature ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enregistrement...</> : <><Save size={14} /> Enregistrer</>}
          </button>
        </div>
      </div>

      {/* ── Changer l'email ── */}
      <div className="neo-card" style={{ padding: 24, marginBottom: 16 }}>
        <p style={sectionTitle}><Mail size={15} style={{ color: 'var(--info)' }} /> Changer l&apos;adresse email</p>
        <div style={{ background: 'var(--info-soft)', border: '1px solid var(--info-soft)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={14} style={{ color: 'var(--info)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: 'var(--info)', lineHeight: 1.5 }}>
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

      {/* ── Compte Outlook personnel ── */}
      <div className="neo-card" style={{ padding: 24, marginBottom: 16 }}>
        <p style={sectionTitle}><Plug size={15} style={{ color: 'var(--info)' }} /> Compte Outlook (envoi d&apos;emails)</p>
        {outlookIntegration ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,120,212,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Mail size={16} style={{ color: 'var(--info)' }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>{outlookIntegration.nom_compte}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>{outlookIntegration.email}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>Connecté</span>
              </div>
            </div>
            <button
              onClick={disconnectOutlook}
              disabled={outlookLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                borderRadius: 8, border: '1.5px solid #FECACA', background: 'var(--card)',
                fontSize: 12, fontWeight: 700, color: 'var(--destructive)', cursor: 'pointer',
                fontFamily: 'var(--font-body)', opacity: outlookLoading ? 0.6 : 1,
              }}
            >
              <XCircle size={13} /> Déconnecter
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Connectez votre compte Microsoft Outlook pour envoyer des emails depuis TalentFlow avec votre propre adresse.
            </p>
            <button
              onClick={connectOutlook}
              disabled={outlookLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                borderRadius: 9, border: 'none', background: '#0078D4',
                fontSize: 13, fontWeight: 700, color: 'white', cursor: 'pointer',
                fontFamily: 'var(--font-body)', opacity: outlookLoading ? 0.7 : 1,
              }}
            >
              {outlookLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plug size={14} />}
              Connecter mon Outlook
            </button>
          </div>
        )}
      </div>

      {/* ── 2FA ── */}
      <TwoFactorSection />

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
          <p style={{ fontSize: 11, color: 'var(--destructive)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
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

      {/* Crop modal */}
      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          onSave={handleCropSave}
          onCancel={() => setCropSrc(null)}
        />
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

// ── Composant 2FA ──────────────────────────────────────────────────────────────
function TwoFactorSection() {
  const supabase = createClient()

  const [enrolling, setEnrolling]       = useState(false)
  const [disabling, setDisabling]       = useState(false)
  const [totpUri, setTotpUri]           = useState<string | null>(null)
  const [qrFactorId, setQrFactorId]     = useState<string | null>(null)
  const [verifyCode, setVerifyCode]     = useState('')
  const [verifying, setVerifying]       = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  // Charger les facteurs MFA existants
  const { data: factors, isLoading, refetch } = useQuery({
    queryKey: ['mfa-factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      return data
    },
    staleTime: 30_000,
  })

  const activeFactor = factors?.totp?.find(f => f.status === 'verified')
  const is2FAActive = !!activeFactor

  // Démarrer l'enrôlement
  const startEnroll = async () => {
    setEnrolling(true)
    setTotpUri(null)
    setQrFactorId(null)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) throw error
      setTotpUri(data.totp.uri)
      setQrFactorId(data.id)
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'activation 2FA')
    } finally {
      setEnrolling(false)
    }
  }

  // Vérifier le code et finaliser l'enrôlement
  const verifyEnroll = async () => {
    if (!qrFactorId || verifyCode.length !== 6) {
      toast.error('Entrez le code à 6 chiffres depuis votre application')
      return
    }
    setVerifying(true)
    try {
      const { error: challengeError, data: challengeData } = await supabase.auth.mfa.challenge({ factorId: qrFactorId })
      if (challengeError) throw challengeError

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: qrFactorId,
        challengeId: challengeData.id,
        code: verifyCode,
      })
      if (verifyError) throw verifyError

      toast.success('2FA activé avec succès ✓')
      setTotpUri(null)
      setQrFactorId(null)
      setVerifyCode('')
      refetch()
    } catch (err: any) {
      toast.error(err.message?.includes('Invalid') ? 'Code incorrect. Réessayez.' : err.message || 'Erreur vérification')
    } finally {
      setVerifying(false)
    }
  }

  // Désactiver le 2FA
  const disable2FA = async () => {
    if (!activeFactor) return
    setDisabling(true)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: activeFactor.id })
      if (error) throw error
      toast.success('2FA désactivé')
      setConfirmDisable(false)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Erreur désactivation 2FA')
    } finally {
      setDisabling(false)
    }
  }

  return (
    <div className="neo-card" style={{ padding: 24, marginBottom: 16 }}>
      <p style={{
        fontSize: 14, fontWeight: 800, color: 'var(--foreground)', marginBottom: 16,
        paddingBottom: 10, borderBottom: '2px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <ShieldCheck size={15} style={{ color: '#7C3AED' }} />
        Authentification à 2 facteurs (2FA)
      </p>

      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Chargement...
        </div>
      )}

      {!isLoading && is2FAActive && !confirmDisable && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} style={{ color: 'var(--success)' }} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', margin: 0 }}>2FA activé</p>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>Votre compte est protégé par l&apos;authentification à deux facteurs.</p>
            </div>
          </div>
          <button
            onClick={() => setConfirmDisable(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
              borderRadius: 8, border: '1.5px solid #FECACA', background: 'var(--card)',
              fontSize: 12, fontWeight: 700, color: 'var(--destructive)', cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            <ShieldOff size={13} /> Désactiver le 2FA
          </button>
        </div>
      )}

      {!isLoading && is2FAActive && confirmDisable && (
        <div>
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--destructive)', fontWeight: 600, margin: 0 }}>
              Confirmer la désactivation du 2FA ?
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
              Votre compte sera moins sécurisé sans l&apos;authentification à deux facteurs.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={disable2FA}
              disabled={disabling}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
                borderRadius: 8, border: 'none', background: '#EF4444',
                fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer',
                fontFamily: 'var(--font-body)', opacity: disabling ? 0.7 : 1,
              }}
            >
              {disabling ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldOff size={13} />}
              {disabling ? 'Désactivation...' : 'Confirmer la désactivation'}
            </button>
            <button
              onClick={() => setConfirmDisable(false)}
              style={{
                padding: '9px 18px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'var(--card)',
                fontSize: 12, fontWeight: 700, color: 'var(--foreground)', cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {!isLoading && !is2FAActive && !totpUri && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Protégez votre compte en ajoutant une deuxième couche de sécurité. Vous aurez besoin d&apos;une application comme Google Authenticator, Authy ou 1Password.
          </p>
          <button
            onClick={startEnroll}
            disabled={enrolling}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px',
              borderRadius: 9, border: 'none', background: '#7C3AED',
              fontSize: 13, fontWeight: 700, color: 'white', cursor: 'pointer',
              fontFamily: 'var(--font-body)', opacity: enrolling ? 0.7 : 1,
            }}
          >
            {enrolling ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={14} />}
            {enrolling ? 'Préparation...' : 'Activer le 2FA'}
          </button>
        </div>
      )}

      {totpUri && qrFactorId && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            {/* QR Code */}
            <div style={{ flexShrink: 0, textAlign: 'center' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Scanner avec votre app
              </p>
              <div style={{ padding: 12, background: 'var(--card)', borderRadius: 10, display: 'inline-block', border: '1.5px solid var(--border)' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(totpUri)}`}
                  alt="QR Code 2FA"
                  width={160}
                  height={160}
                  style={{ display: 'block', borderRadius: 4 }}
                />
              </div>
            </div>

            {/* Instructions + vérification */}
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.7 }}>
                1. Ouvrez <strong>Google Authenticator</strong>, <strong>Authy</strong> ou toute autre app TOTP.<br />
                2. Scannez le QR code ci-contre.<br />
                3. Entrez le code à 6 chiffres affiché dans l&apos;app pour confirmer.
              </p>

              <div style={{ marginBottom: 12 }}>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  display: 'block', marginBottom: 6,
                }}>
                  Code de vérification
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  style={{
                    width: 140, height: 42, padding: '0 14px', borderRadius: 8,
                    border: '1.5px solid var(--border)', background: 'var(--card)',
                    fontSize: 20, color: 'var(--foreground)', fontFamily: 'var(--font-body)',
                    letterSpacing: '0.25em', textAlign: 'center', outline: 'none',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#7C3AED')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={verifyEnroll}
                  disabled={verifying || verifyCode.length !== 6}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px',
                    borderRadius: 9, border: 'none', background: '#7C3AED',
                    fontSize: 13, fontWeight: 700, color: 'white',
                    cursor: (verifying || verifyCode.length !== 6) ? 'default' : 'pointer',
                    opacity: (verifying || verifyCode.length !== 6) ? 0.6 : 1,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {verifying ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                  {verifying ? 'Vérification...' : 'Confirmer l\'activation'}
                </button>
                <button
                  onClick={() => { setTotpUri(null); setQrFactorId(null); setVerifyCode('') }}
                  style={{
                    padding: '10px 16px', borderRadius: 9,
                    border: '1.5px solid var(--border)', background: 'var(--card)',
                    fontSize: 12, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
