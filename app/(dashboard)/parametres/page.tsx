'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Save, Key, Bell, Palette, Activity, FolderInput, Shield, Loader2, CheckCircle, Globe, Database, Eye, EyeOff, ChevronUp, ChevronDown, Briefcase, X, Camera, Copy, UserCircle, Mail, Plug, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useMetiers } from '@/hooks/useMetiers'

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.1em',
  display: 'block', marginBottom: 6,
}

const SECTIONS = [
  { id: 'profil',        label: 'Mon Profil',    icon: UserCircle },
  { id: 'apparence',     label: 'Apparence',     icon: Palette },
  { id: 'metiers',       label: 'Métiers',       icon: Briefcase },
]

export const CANDIDAT_SECTIONS_DEFAULT = [
  { key: 'resume',       label: 'Résumé IA',       emoji: '✨' },
  { key: 'experiences',  label: 'Expériences',      emoji: '💼' },
  { key: 'formations',   label: 'Formations',       emoji: '🎓' },
  { key: 'candidatures', label: 'Candidatures',     emoji: '📋' },
  { key: 'notes',        label: 'Notes',            emoji: '💬' },
]

export const CANDIDAT_SECTIONS_LS_KEY = 'candidat_sections_order'

const LINK_SECTIONS = [
  { href: '/parametres/logs',      label: "Logs d'activité", icon: Activity },
  { href: '/parametres/securite', label: 'Sécurité & Accès', icon: Shield },
]
const ADMIN_SECTIONS = [
  { href: '/parametres/admin', label: 'Administration', icon: Shield },
]
const TOOLS_SECTIONS = [
  { href: '/parametres/import-masse',    label: 'Import en masse',        icon: FolderInput },
  { href: '/parametres/corriger-photos', label: 'Corriger photos',        icon: Camera },
  { href: '/parametres/doublons',        label: 'Analyser Doublons',      icon: Copy },
]

const ADMIN_EMAIL = 'j.barbosa@l-agence.ch'

export default function ParametresPage() {
  const [section, setSection] = useState('profil')
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email || null)
    })
  }, [])

  return (
    <div className="d-page" style={{ maxWidth: 860 }}>
      <div className="d-page-header" style={{ marginBottom: 28 }}>
        <h1 className="d-page-title">Paramètres</h1>
        <p className="d-page-sub">Configurez votre espace TalentFlow</p>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Sidebar nav */}
        <nav style={{ width: 172, flexShrink: 0 }}>
          <NavGroup label="Configuration">
            {SECTIONS.map(s => {
              const Icon = s.icon
              const active = section === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={active ? 'neo-candidate-card' : ''}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                    fontWeight: active ? 700 : 500,
                    background: active ? 'var(--primary-soft)' : 'transparent',
                    color: active ? 'var(--foreground)' : 'var(--muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={14} style={{ color: active ? 'var(--primary)' : 'var(--muted)', flexShrink: 0 }} />
                  {s.label}
                </button>
              )
            })}
          </NavGroup>

          <NavGroup label="Sécurité">
            {LINK_SECTIONS.map(s => <NavLink key={s.href} {...s} />)}
          </NavGroup>

          {userEmail === ADMIN_EMAIL && (
            <NavGroup label="Admin">
              {ADMIN_SECTIONS.map(s => <NavLink key={s.href} {...s} />)}
            </NavGroup>
          )}
        </nav>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {section === 'profil'        && <ProfilSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'apparence'     && <ApparenceSection />}
          {section === 'metiers'        && <MetiersSection />}
        </div>
      </div>
    </div>
  )
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 4px', marginBottom: 4 }}>
        {label}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  )
}

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '9px 12px', borderRadius: 8, fontSize: 13,
      color: 'var(--muted)', textDecoration: 'none', fontWeight: 500,
    }}>
      <Icon size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      {label}
    </Link>
  )
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function SectionCard({ title, description, children, onSave, saving, saved }: {
  title: string; description?: string; children: React.ReactNode;
  onSave?: () => void; saving?: boolean; saved?: boolean
}) {
  return (
    <div className="neo-card-soft" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 className="neo-section-title" style={{ marginBottom: 4 }}>{title}</h2>
        {description && <p style={{ fontSize: 12, color: 'var(--muted)' }}>{description}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
      {onSave && (
        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
        }}>
          {saved && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#10b981', fontWeight: 600 }}>
              <CheckCircle size={13} /> Sauvegardé
            </span>
          )}
          <button
            className="neo-btn-primary"
            onClick={onSave}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}
          >
            {saving
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Sauvegarde...</>
              : <><Save size={13} />Sauvegarder</>
            }
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Profil ───────────────────────────────────────────────────────────────────

function ProfilSection() {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [telephone, setTelephone] = useState('')
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  // Outlook per-user
  const [outlookIntegration, setOutlookIntegration] = useState<{ email: string; nom_compte: string } | null>(null)
  const [outlookLoading, setOutlookLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {}
        setPrenom(meta.prenom || '')
        setNom(meta.nom || '')
        setEmail(session.user.email || '')
        setEntreprise(meta.entreprise || '')
        setTelephone(meta.telephone || '')
      }
    })
    // Charger le statut Outlook
    fetch('/api/microsoft/email-status')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.email) setOutlookIntegration(data) })
      .catch(() => {})

    // Toast si retour OAuth Outlook
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('success') === 'microsoft_email') {
        toast.success('Compte Outlook connecté avec succès ✓')
        window.history.replaceState({}, '', window.location.pathname)
        fetch('/api/microsoft/email-status').then(r => r.json()).then(data => { if (data?.email) setOutlookIntegration(data) })
      }
    }
  }, [])

  const connectOutlook = () => { window.location.href = '/api/microsoft/auth?purpose=email' }

  const disconnectOutlook = async () => {
    setOutlookLoading(true)
    try {
      const res = await fetch('/api/microsoft/email-disconnect', { method: 'DELETE' })
      if (res.ok) { toast.success('Compte Outlook déconnecté'); setOutlookIntegration(null) }
      else toast.error('Erreur lors de la déconnexion')
    } finally { setOutlookLoading(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      data: { prenom, nom, entreprise, telephone },
    })
    if (error) toast.error(error.message)
    else toast.success('Profil mis à jour')
    setSaving(false)
  }

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) { toast.error('Minimum 8 caractères'); return }
    if (newPassword !== confirmPassword) { toast.error('Les mots de passe ne correspondent pas'); return }
    setSavingPw(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) toast.error(error.message)
    else { toast.success('Mot de passe mis à jour'); setNewPassword(''); setConfirmPassword('') }
    setSavingPw(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 42, padding: '0 14px', borderRadius: 10,
    border: '2px solid var(--border)', background: 'var(--secondary)',
    color: 'var(--foreground)', fontSize: 14, fontFamily: 'var(--font-body)',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionCard title="Informations personnelles" description="Vos coordonnées affichées dans TalentFlow">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Prénom</label>
            <input value={prenom} onChange={e => setPrenom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Nom</label>
            <input value={nom} onChange={e => setNom(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Email</label>
          <input value={email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <div>
            <label style={labelStyle}>Entreprise</label>
            <input value={entreprise} onChange={e => setEntreprise(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Téléphone</label>
            <input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="+41 78 ..." style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSave} disabled={saving} className="neo-btn-yellow" style={{ fontSize: 13 }}>
            <Save size={14} /> {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Compte Outlook (envoi d'emails)" description="Connectez votre compte Microsoft pour envoyer des emails depuis votre adresse">
        {outlookIntegration ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,120,212,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Mail size={16} style={{ color: '#0078D4' }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>{outlookIntegration.nom_compte}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>{outlookIntegration.email}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981' }}>Connecté</span>
              </div>
            </div>
            <button onClick={disconnectOutlook} disabled={outlookLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1.5px solid #FECACA', background: 'white', fontSize: 12, fontWeight: 700, color: '#DC2626', cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: outlookLoading ? 0.6 : 1 }}>
              <XCircle size={13} /> Déconnecter
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Chaque utilisateur doit connecter son propre compte Outlook pour envoyer des emails.
            </p>
            <button onClick={connectOutlook} disabled={outlookLoading} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 9, border: 'none', background: '#0078D4', fontSize: 13, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {outlookLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plug size={14} />}
              Connecter mon Outlook
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Changer le mot de passe" description="Sécurisez votre compte avec un mot de passe fort">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Nouveau mot de passe</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 8 caractères" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Confirmer le mot de passe</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Répétez le mot de passe" style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handlePasswordChange} disabled={savingPw || !newPassword} className="neo-btn-yellow" style={{ fontSize: 13 }}>
            <Save size={14} /> {savingPw ? 'Mise à jour...' : 'Mettre à jour'}
          </button>
        </div>
      </SectionCard>
    </div>
  )
}

// ─── API / Intégrations ───────────────────────────────────────────────────────

function ApiSection() {
  const [showKey, setShowKey] = useState(false)
  const [appUrl, setAppUrl]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => { setAppUrl(window.location.origin) }, [])

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 600))
    setSaving(false); setSaved(true); toast.success('Paramètres enregistrés')
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionCard title="Clés API & Intégrations" description="Connexions aux services externes"
        onSave={handleSave} saving={saving} saved={saved}>
        <div>
          <label style={labelStyle}>Clé API Anthropic (Claude)</label>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Utilisée pour l'analyse IA des CVs. Configurée via variable d'environnement.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="neo-input" type={showKey ? 'text' : 'password'} defaultValue="sk-ant-api03-••••••••••••••••" readOnly style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.6, cursor: 'not-allowed' }} />
            <button className="neo-btn-yellow" onClick={() => setShowKey(!showKey)} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '0 12px' }}>
              {showKey ? <><EyeOff size={13} />Masquer</> : <><Eye size={13} />Afficher</>}
            </button>
          </div>
        </div>

        <div style={{ borderRadius: 8, background: '#F8FAFC', border: '1px solid var(--border)', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Database size={15} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>Supabase</span>
            <span className="neo-badge neo-badge-place" style={{ marginLeft: 'auto' }}>Connecté</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Base de données et stockage de fichiers opérationnels.</p>
        </div>

        <div>
          <label style={labelStyle}>URL de l'application</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Globe size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <input className="neo-input" value={appUrl} readOnly style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
        </div>
      </SectionCard>

      <ChangePasswordCard />
    </div>
  )
}

function ChangePasswordCard() {
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving]   = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== confirm) { toast.error('Les mots de passe ne correspondent pas'); return }
    if (next.length < 8)  { toast.error('Minimum 8 caractères'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: next })
    setSaving(false)
    if (error) { toast.error('Erreur : ' + error.message) }
    else { toast.success('Mot de passe mis à jour'); setNext(''); setConfirm('') }
  }

  return (
    <div className="neo-card-soft" style={{ padding: 24 }}>
      <h2 className="neo-section-title" style={{ marginBottom: 4 }}>Changer le mot de passe</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Sécurisez votre compte avec un mot de passe fort</p>
      <form onSubmit={handleChange} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Nouveau mot de passe</label>
          <div style={{ position: 'relative' }}>
            <input className="neo-input" type={showPwd ? 'text' : 'password'} value={next}
              onChange={e => setNext(e.target.value)} placeholder="Minimum 8 caractères"
              autoComplete="new-password" style={{ paddingRight: 40 }} />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}>
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Confirmer le mot de passe</label>
          <input className="neo-input" type={showPwd ? 'text' : 'password'} value={confirm}
            onChange={e => setConfirm(e.target.value)} placeholder="Répétez le mot de passe"
            autoComplete="new-password" />
        </div>
        <div style={{ paddingTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="neo-btn-primary" disabled={saving || !next || !confirm}
            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: saving || !next || !confirm ? 0.6 : 1 }}>
            {saving ? <><Loader2 size={13} />Mise à jour...</> : <><Save size={13} />Mettre à jour</>}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection() {
  const [prefs, setPrefs] = useState({ import_cv: true, statut_pipeline: true, score_matching: false, rappel_entretien: true })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.notifications) setPrefs(p => ({ ...p, ...user.user_metadata.notifications }))
    })
  }, [])

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ data: { notifications: prefs } })
    setSaving(false)
    if (error) toast.error('Erreur : ' + error.message)
    else { setSaved(true); toast.success('Préférences sauvegardées'); setTimeout(() => setSaved(false), 3000) }
  }

  const items = [
    { key: 'import_cv' as const,        label: 'Nouveau candidat importé',      desc: "Alerte lors de l'import d'un CV" },
    { key: 'statut_pipeline' as const,  label: 'Changement de statut pipeline', desc: "Quand un candidat change d'étape" },
    { key: 'score_matching' as const,   label: 'Score matching calculé',        desc: "Résultats IA disponibles" },
    { key: 'rappel_entretien' as const, label: 'Rappel entretien',              desc: 'Avant un entretien planifié' },
  ]

  return (
    <SectionCard title="Notifications" description="Configurez vos alertes et rappels"
      onSave={handleSave} saving={saving} saved={saved}>
      {items.map((item, i) => (
        <div key={item.key} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>{item.label}</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{item.desc}</p>
          </div>
          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', marginLeft: 16 }}>
            <input type="checkbox" style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              checked={prefs[item.key]} onChange={e => setPrefs(p => ({ ...p, [item.key]: e.target.checked }))} />
            <div style={{ width: 36, height: 20, borderRadius: 99, position: 'relative', transition: 'background 0.2s',
              background: prefs[item.key] ? 'var(--primary)' : '#CBD5E1' }}>
              <div style={{ position: 'absolute', top: 2, left: prefs[item.key] ? 18 : 2, width: 16, height: 16,
                borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
          </label>
        </div>
      ))}
    </SectionCard>
  )
}

// ─── Apparence ────────────────────────────────────────────────────────────────

function ApparenceSection() {
  const [langue, setLangue]         = useState('fr')
  const [dateFormat, setDateFormat] = useState('dd/mm/yyyy')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata) {
        if (user.user_metadata.langue)     setLangue(user.user_metadata.langue)
        if (user.user_metadata.dateFormat) setDateFormat(user.user_metadata.dateFormat)
      }
    })
  }, [])

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ data: { langue, dateFormat } })
    setSaving(false)
    if (error) toast.error('Erreur : ' + error.message)
    else { setSaved(true); toast.success("Préférences sauvegardées"); setTimeout(() => setSaved(false), 3000) }
  }

  return (
    <SectionCard title="Apparence & Langue" description="Personnalisez l'interface"
      onSave={handleSave} saving={saving} saved={saved}>
      <div>
        <label style={labelStyle}>Thème</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: '#0F172A', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--primary)' }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Noir & Jaune</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Thème L&apos;Agence — actif</p>
          </div>
          <span className="neo-badge neo-badge-place" style={{ marginLeft: 'auto' }}>Actif</span>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Langue de l'interface</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }].map(l => (
            <button key={l.value} onClick={() => setLangue(l.value)} style={{
              flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 13,
              border: `1.5px solid ${langue === l.value ? 'var(--primary)' : 'var(--border)'}`,
              background: langue === l.value ? 'var(--primary-soft)' : 'white',
              color: langue === l.value ? 'var(--foreground)' : 'var(--muted)',
              fontWeight: langue === l.value ? 700 : 500,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}>{l.label}</button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Format de date</label>
        <select value={dateFormat} onChange={e => setDateFormat(e.target.value)} className="neo-input" style={{ height: 40 }}>
          <option value="dd/mm/yyyy">JJ/MM/AAAA (Français)</option>
          <option value="mm/dd/yyyy">MM/DD/YYYY (Anglais)</option>
          <option value="yyyy-mm-dd">AAAA-MM-JJ (ISO)</option>
        </select>
      </div>
    </SectionCard>
  )
}

// ─── Affichage fiches candidats ────────────────────────────────────────────────

function AffichageSection() {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(CANDIDAT_SECTIONS_LS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        const defaults = CANDIDAT_SECTIONS_DEFAULT.map(s => s.key)
        return [...parsed.filter(k => defaults.includes(k)), ...defaults.filter(k => !parsed.includes(k))]
      }
    } catch {}
    return CANDIDAT_SECTIONS_DEFAULT.map(s => s.key)
  })
  const [saved, setSaved] = useState(false)

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setOrder(next)
    setSaved(false)
  }

  const handleSave = () => {
    localStorage.setItem(CANDIDAT_SECTIONS_LS_KEY, JSON.stringify(order))
    setSaved(true)
    toast.success('Affichage enregistré')
    setTimeout(() => setSaved(false), 3000)
  }

  const reset = () => {
    const defaults = CANDIDAT_SECTIONS_DEFAULT.map(s => s.key)
    setOrder(defaults)
    localStorage.setItem(CANDIDAT_SECTIONS_LS_KEY, JSON.stringify(defaults))
    toast.success('Ordre réinitialisé')
  }

  return (
    <SectionCard title="Affichage des fiches candidats" description="Choisissez l'ordre des sections sur les fiches" onSave={handleSave} saving={false} saved={saved}>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        Réorganisez les blocs d&apos;information. Les modifications s&apos;appliquent à toutes les fiches.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {order.map((key, idx) => {
          const sec = CANDIDAT_SECTIONS_DEFAULT.find(s => s.key === key)!
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--background)', border: '1.5px solid var(--border)', borderRadius: 10 }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{sec.emoji}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{sec.label}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => move(idx, -1)} disabled={idx === 0}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'white', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === order.length - 1}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'white', cursor: idx === order.length - 1 ? 'default' : 'pointer', opacity: idx === order.length - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <button onClick={reset} style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
        Réinitialiser l&apos;ordre par défaut
      </button>
    </SectionCard>
  )
}

// ─── Photos candidats ─────────────────────────────────────────────────────────

function PhotosSection() {
  const [extracting, setExtracting] = useState(false)
  const [status, setStatus] = useState('')
  const [stats, setStats] = useState<{ withPhoto: number; withoutPhoto: number; total: number } | null>(null)

  useEffect(() => {
    fetch('/api/cv/extract-photos')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
  }, [])

  const handleCorrectPhotos = async () => {
    setExtracting(true)
    setStatus('Analyse en cours (re-extraction complète avec filtres stricts)...')
    try {
      let totalProcessed = 0, totalFound = 0, currentOffset = 0
      while (true) {
        const res = await fetch('/api/cv/extract-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 5, force: true, offset: currentOffset }),
        })
        const data = await res.json()
        totalProcessed += data.processed || 0
        totalFound += data.found || 0
        currentOffset = data.nextOffset ?? (currentOffset + (data.processed || 0))
        setStatus(`${totalProcessed} CVs analysés, ${totalFound} photos extraites... (${data.remaining || 0} restants)`)
        if (data.done || data.remaining === 0 || (data.processed || 0) === 0) break
        await new Promise(r => setTimeout(r, 300))
      }
      setStatus(`Terminé : ${totalProcessed} CVs analysés, ${totalFound} photos de visage extraites`)
      // Refresh stats
      fetch('/api/cv/extract-photos').then(r => r.json()).then(setStats).catch(() => {})
    } catch {
      setStatus('Erreur lors de la correction')
    }
    setExtracting(false)
  }

  return (
    <SectionCard title="Photos des candidats" description="Gérez l'extraction automatique des photos de visage depuis les CVs">
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 8 }}>
          <div style={{ padding: 14, borderRadius: 10, background: '#F0FDF4', border: '1px solid #BBF7D0', textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', margin: 0 }}>{stats.withPhoto}</p>
            <p style={{ fontSize: 11, color: '#15803D', margin: 0, fontWeight: 600 }}>Avec photo</p>
          </div>
          <div style={{ padding: 14, borderRadius: 10, background: '#FEF9C3', border: '1px solid #FDE68A', textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#CA8A04', margin: 0 }}>{stats.withoutPhoto}</p>
            <p style={{ fontSize: 11, color: '#A16207', margin: 0, fontWeight: 600 }}>Sans photo</p>
          </div>
          <div style={{ padding: 14, borderRadius: 10, background: '#F1F5F9', border: '1px solid #CBD5E1', textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#475569', margin: 0 }}>{stats.total}</p>
            <p style={{ fontSize: 11, color: '#64748B', margin: 0, fontWeight: 600 }}>Total CVs</p>
          </div>
        </div>
      )}

      <div style={{ padding: 16, borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#92400E', margin: '0 0 8px 0' }}>
          Corriger photos candidats
        </p>
        <p style={{ fontSize: 12, color: '#A16207', margin: '0 0 14px 0' }}>
          Re-analyse TOUS les CVs avec les filtres stricts pour ne garder que les vraies photos de visage.
          Les logos, images décoratives et mauvaises extractions seront supprimés et remplacés.
        </p>
        <button
          onClick={handleCorrectPhotos}
          disabled={extracting}
          className="neo-btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: extracting ? 0.7 : 1, fontSize: 14, padding: '10px 20px' }}
        >
          {extracting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={16} />}
          {extracting ? 'Correction en cours...' : 'Corriger photos candidats'}
        </button>
      </div>

      {status && (
        <div style={{ padding: 12, borderRadius: 8, background: extracting ? '#EFF6FF' : '#F0FDF4', border: `1px solid ${extracting ? '#BFDBFE' : '#BBF7D0'}` }}>
          <p style={{ fontSize: 13, color: extracting ? '#1D4ED8' : '#16A34A', margin: 0, fontWeight: 600 }}>
            {status}
          </p>
        </div>
      )}
    </SectionCard>
  )
}

// ─── Métiers de l'agence ─────────────────────────────────────────────────────

function MetiersSection() {
  const { metiers: remoteMetiers, isLoading, saveMetiers, isSaving } = useMetiers()
  const [metiers, setMetiers] = useState<string[]>([])
  const [newMetier, setNewMetier] = useState('')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Sync local state when remote data loads (or after save)
  // !isLoading : attendre la fin du chargement initial avant de sync
  // !dirty     : ne pas écraser les modifications locales en cours
  useEffect(() => {
    if (!isLoading && !dirty) {
      setMetiers(remoteMetiers)
    }
  }, [remoteMetiers, isLoading, dirty])

  const add = () => {
    const trimmed = newMetier.trim()
    if (!trimmed || metiers.includes(trimmed)) return
    const next = [...metiers, trimmed]
    setMetiers(next)
    setNewMetier('')
    setDirty(true)
    setSaved(false)
  }

  const remove = (m: string) => {
    setMetiers(prev => prev.filter(x => x !== m))
    setDirty(true)
    setSaved(false)
  }

  const handleSave = () => {
    saveMetiers(metiers, {
      onSuccess: () => {
        setSaved(true)
        setDirty(false)
        toast.success('Métiers enregistrés (partagés avec tous les utilisateurs)')
        setTimeout(() => setSaved(false), 3000)
      },
      onError: () => {
        toast.error('Erreur lors de la sauvegarde des métiers')
      },
    })
  }

  return (
    <SectionCard title="Métiers de l'agence" description="Définissez vos catégories de métiers pour classer les candidats" onSave={handleSave} saving={isSaving} saved={saved}>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        Ces métiers sont partagés entre tous les utilisateurs. Toute modification sera visible par l&apos;ensemble de l&apos;équipe.
      </p>
      {isLoading ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
          Chargement des métiers...
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              className="neo-input"
              style={{ flex: 1, height: 36, fontSize: 13 }}
              placeholder="Ajouter un métier (ex: Électricien, Ventilateur...)"
              value={newMetier}
              onChange={e => setNewMetier(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add() }}
            />
            <button onClick={add} disabled={!newMetier.trim()} className="neo-btn-yellow" style={{ height: 36, padding: '0 16px', fontSize: 13 }}>
              Ajouter
            </button>
          </div>
          {metiers.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
              Aucun métier défini. Ajoutez vos catégories ci-dessus.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {metiers.map(m => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, background: 'var(--primary-soft)', border: '1.5px solid var(--primary)', fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                  {m}
                  <button onClick={() => remove(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--muted)', lineHeight: 1 }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}
