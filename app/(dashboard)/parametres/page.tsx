'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Save, Key, Bell, User, Palette, Activity, FolderInput, Shield, Loader2, CheckCircle, Globe, Database, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.1em',
  display: 'block', marginBottom: 6,
}

const SECTIONS = [
  { id: 'profil',        label: 'Profil',        icon: User },
  { id: 'api',           label: 'Intégrations',  icon: Key },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'apparence',     label: 'Apparence',     icon: Palette },
]

const LINK_SECTIONS = [
  { href: '/parametres/logs',         label: "Logs d'activité", icon: Activity },
]
const ADMIN_SECTIONS = [
  { href: '/parametres/admin',        label: 'Administration',  icon: Shield },
]
const TOOLS_SECTIONS = [
  { href: '/parametres/import-masse', label: 'Import en masse', icon: FolderInput },
]

export default function ParametresPage() {
  const [section, setSection] = useState('profil')

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

          <NavGroup label="Outils">
            {TOOLS_SECTIONS.map(s => <NavLink key={s.href} {...s} />)}
          </NavGroup>

          <NavGroup label="Sécurité">
            {LINK_SECTIONS.map(s => <NavLink key={s.href} {...s} />)}
          </NavGroup>

          <NavGroup label="Admin">
            {ADMIN_SECTIONS.map(s => <NavLink key={s.href} {...s} />)}
          </NavGroup>
        </nav>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {section === 'profil'        && <ProfilSection />}
          {section === 'api'           && <ApiSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'apparence'     && <ApparenceSection />}
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [form, setForm] = useState({ prenom: '', nom: '', email: '', role: '', entreprise: '' })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const m = user.user_metadata || {}
        setForm({ prenom: m.prenom || m.first_name || '', nom: m.nom || m.last_name || '',
          email: user.email || '', role: m.role || 'Consultant', entreprise: m.entreprise || '' })
      }
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      data: { prenom: form.prenom, nom: form.nom, role: form.role, entreprise: form.entreprise,
        full_name: `${form.prenom} ${form.nom}`.trim() },
    })
    setSaving(false)
    if (error) { toast.error('Erreur : ' + error.message) }
    else { setSaved(true); toast.success('Profil mis à jour'); setTimeout(() => setSaved(false), 3000) }
  }

  if (loading) return (
    <div className="neo-card-soft" style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192 }}>
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--muted)' }} />
    </div>
  )

  return (
    <SectionCard title="Profil utilisateur" description="Informations affichées dans TalentFlow"
      onSave={handleSave} saving={saving} saved={saved}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Prénom</label>
          <input className="neo-input" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Votre prénom" />
        </div>
        <div>
          <label style={labelStyle}>Nom</label>
          <input className="neo-input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Votre nom" />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input className="neo-input" type="email" value={form.email} readOnly style={{ opacity: 0.5, cursor: 'not-allowed' }} />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>L'email ne peut pas être modifié ici pour des raisons de sécurité.</p>
      </div>
      <div>
        <label style={labelStyle}>Rôle / Poste</label>
        <input className="neo-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="Consultant, RH, Manager…" />
      </div>
      <div>
        <label style={labelStyle}>Entreprise / Agence</label>
        <input className="neo-input" value={form.entreprise} onChange={e => setForm(f => ({ ...f, entreprise: e.target.value }))} placeholder="Nom de votre entreprise" />
      </div>
    </SectionCard>
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
            <button className="neo-btn" onClick={() => setShowKey(!showKey)} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '0 12px' }}>
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
