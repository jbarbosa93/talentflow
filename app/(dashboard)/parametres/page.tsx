'use client'
import { useState } from 'react'
import { Save, Key, Bell, User, Palette, Database, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

const SECTIONS = [
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'api', label: 'Intégrations', icon: Key },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'apparence', label: 'Apparence', icon: Palette },
]

export default function ParametresPage() {
  const [section, setSection] = useState('profil')
  const [saving, setSaving] = useState(false)

  const handleSave = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.success('Paramètres sauvegardés')
    }, 800)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-7">
        <h1 className="text-xl font-bold text-white">Paramètres</h1>
        <p className="text-sm text-white/40 mt-0.5">Configurez votre espace TalentFlow</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-44 flex-shrink-0">
          <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest px-3 mb-2">Configuration</p>
          <ul className="space-y-0.5">
            {SECTIONS.map(s => {
              const Icon = s.icon
              const active = section === s.id
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSection(s.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-all relative ${
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-white/35 hover:text-white/70 hover:bg-white/5'
                    }`}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />}
                    <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary' : 'text-white/25'}`} />
                    {s.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {section === 'profil' && <ProfilSection onSave={handleSave} saving={saving} />}
          {section === 'api' && <ApiSection onSave={handleSave} saving={saving} />}
          {section === 'notifications' && <NotificationsSection onSave={handleSave} saving={saving} />}
          {section === 'apparence' && <ApparenceSection onSave={handleSave} saving={saving} />}
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, description, children, onSave, saving }: {
  title: string
  description?: string
  children: React.ReactNode
  onSave: () => void
  saving: boolean
}) {
  return (
    <div className="bg-card border border-white/6 rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {description && <p className="text-xs text-white/35 mt-1">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
      <div className="mt-6 pt-5 border-t border-white/5 flex justify-end">
        <Button size="sm" onClick={onSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-2" />
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/40 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-white/25 mt-1.5">{hint}</p>}
    </div>
  )
}

function ProfilSection({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <SectionCard title="Profil utilisateur" description="Informations affichées dans TalentFlow" onSave={onSave} saving={saving}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Prénom">
          <Input defaultValue="Joao" className="bg-white/5 border-white/10 text-white" />
        </Field>
        <Field label="Nom">
          <Input defaultValue="Barbosa" className="bg-white/5 border-white/10 text-white" />
        </Field>
      </div>
      <Field label="Email">
        <Input type="email" defaultValue="joao@talentflow.fr" className="bg-white/5 border-white/10 text-white" />
      </Field>
      <Field label="Rôle / Poste">
        <Input defaultValue="Recruteur" className="bg-white/5 border-white/10 text-white" />
      </Field>
      <Field label="Agence">
        <Input defaultValue="L'Agence" className="bg-white/5 border-white/10 text-white" />
      </Field>
    </SectionCard>
  )
}

function ApiSection({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  const [showKey, setShowKey] = useState(false)
  return (
    <SectionCard title="Intégrations & API" description="Clés d'API et connexions externes" onSave={onSave} saving={saving}>
      <Field label="Clé API Anthropic (Claude)" hint="Utilisée pour l'analyse IA des CVs et le scoring matching">
        <div className="flex gap-2">
          <Input
            type={showKey ? 'text' : 'password'}
            defaultValue="sk-ant-api03-••••••••••••••••"
            className="font-mono text-xs bg-white/5 border-white/10 text-white/60"
          />
          <Button variant="outline" size="sm" onClick={() => setShowKey(!showKey)} className="flex-shrink-0 border-white/10 text-white/40 hover:text-white hover:bg-white/5">
            {showKey ? 'Masquer' : 'Afficher'}
          </Button>
        </div>
      </Field>

      <div className="rounded-lg bg-white/[0.03] border border-white/5 p-4">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-4 h-4 text-white/30" />
          <span className="text-sm font-medium text-white/60">Supabase</span>
          <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full ml-auto font-semibold">Connecté</span>
        </div>
        <p className="text-xs text-white/25">Base de données et stockage de fichiers opérationnels.</p>
      </div>

      <Field label="URL de l'application">
        <div className="flex gap-2 items-center">
          <Globe className="w-4 h-4 text-white/25 flex-shrink-0" />
          <Input defaultValue="http://localhost:3000" className="text-xs font-mono bg-white/5 border-white/10 text-white/50" />
        </div>
      </Field>
    </SectionCard>
  )
}

function NotificationsSection({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <SectionCard title="Notifications" description="Configurez vos alertes et rappels" onSave={onSave} saving={saving}>
      {[
        { label: 'Nouveau candidat importé', description: "Alerte lors de l'import d'un CV", defaultChecked: true },
        { label: 'Changement de statut pipeline', description: "Quand un candidat change d'étape", defaultChecked: true },
        { label: 'Score matching calculé', description: 'Résultats de l\'analyse IA disponibles', defaultChecked: false },
        { label: 'Rappel entretien', description: 'Notification avant un entretien planifié', defaultChecked: true },
      ].map(item => (
        <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
          <div>
            <p className="text-sm font-medium text-white/60">{item.label}</p>
            <p className="text-xs text-white/25 mt-0.5">{item.description}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
            <input type="checkbox" className="sr-only peer" defaultChecked={item.defaultChecked} />
            <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/50 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-black" />
          </label>
        </div>
      ))}
    </SectionCard>
  )
}

function ApparenceSection({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  const [langue, setLangue] = useState('fr')

  return (
    <SectionCard title="Apparence & Langue" description="Personnalisez l'interface" onSave={onSave} saving={saving}>
      <Field label="Thème">
        <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-lg">
          <div className="w-8 h-8 rounded-md bg-[oklch(0.08_0_0)] border border-primary/30 flex items-center justify-center">
            <div className="w-3 h-3 rounded-sm bg-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/70">Noir & Jaune</p>
            <p className="text-xs text-white/30">Thème L&apos;Agence — actif</p>
          </div>
          <span className="ml-auto text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold">Actif</span>
        </div>
      </Field>

      <Field label="Langue de l'interface">
        <div className="flex gap-2">
          {[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }].map(l => (
            <button
              key={l.value}
              onClick={() => setLangue(l.value)}
              className={`flex-1 py-2 px-3 rounded-md text-sm border transition-colors ${
                langue === l.value
                  ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                  : 'border-white/8 text-white/30 hover:border-white/15 hover:text-white/50'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Format de date">
        <select className="w-full border border-white/10 rounded-md px-3 py-2 text-sm bg-white/5 text-white/50">
          <option value="dd/mm/yyyy">JJ/MM/AAAA (Français)</option>
          <option value="mm/dd/yyyy">MM/DD/YYYY (Anglais)</option>
          <option value="yyyy-mm-dd">AAAA-MM-JJ (ISO)</option>
        </select>
      </Field>
    </SectionCard>
  )
}
