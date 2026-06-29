'use client'
import Image from 'next/image'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  ClipboardList, Bell, Plus, Pencil, Trash2,
  Mail, AlertTriangle, Search, Loader2, X,
  User, Calendar, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  FileText, History, Filter, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SecretariatCandidat {
  id: string
  candidat_id: string | null
  numero_quadrigis: string | null
  nom: string
  prenom: string
  date_naissance: string | null
  enfants_charge: string | null
  lieu_demande: string | null
  date_demande: string | null
  type_demande: 'renouvellement' | 'changement_employeur' | 'premiere' | null
  genre_permis: string | null
  date_echeance_permis: string | null
  permis_travail: string | null
  permis_note: string | null
  carte_id: string
  numero_avs: string | null
  iban: string | null
  has_cv: boolean
  has_cm: boolean
  has_docs_clients: boolean
  has_permis_conduire: boolean
  docs_clients_note: string | null
  remarques: string | null
  date_mission: string | null
  is_mission_terminee: boolean
  date_fin_mission: string | null
  mappe: boolean
  suisse: boolean
  archive: boolean
  archived_at: string | null
  annee: number
  mode_paiement?: 'calendrier_mensuel' | 'mensuel' | 'hebdomadaire' | null
  photo_url?: string | null
  tel?: string | null
  email?: string | null
  couleur?: string | null
}

interface SecretariatAccident {
  id: string
  candidat_id: string | null
  nom_prenom: string
  type_cas: 'Accident' | 'Maladie' | 'Bagatelle' | 'LCA Maladie'
  sous_type: string | null
  raison: string | null
  numero_sinistre: string | null
  date_debut: string | null
  date_fin: string | null
  assurance_payee_jusqu_au: string | null
  licenciement_pour_le: string | null
  remarque: string | null
  termine: boolean
  statut_cas: 'nouveau' | 'en_cours' | 'termine'
  decision: string | null
  note: string | null
  couleur: 'normal' | 'jaune' | 'rouge'
  archive: boolean
  annee: number
  photo_url?: string | null
  tel?: string | null
  email?: string | null
}

interface SecretariatAlfa {
  id: string
  candidat_id: string | null
  nom: string
  prenom: string | null
  numero_avs: string | null
  nbr_enfants: number | null
  montant_chf: number | null
  bareme_is: string | null
  date_debut_alfa: string | null
  date_fin_alfa: string | null
  date_radiation_caf: string | null
  radiation_recue: string | null
  mere_touche: string | null
  remarques: string | null
  demande_envoyee: string | null
  reactivation_envoyee: string | null
  lieu_enfants: string | null
  consimo: string | null
  termine: boolean
  raf: boolean
  annee: number
  couleur?: string | null
  photo_url?: string | null
}

interface SecretariatAlfaPaiement {
  id: string
  candidat_id: string | null
  nom: string
  prenom: string | null
  numero_avs: string | null
  nbr_enfants: number | null
  date_validite_decision: string | null
  droit_chf_mois: number | null
  montant_alfa_paye: number | null
  annee_periode: string | null
  alfa_dernier_mois: string | null
  date_fin_mission: string | null
  dates_fin_mission: string | null
  statut_termine: boolean
  dernier_mois_paye: string | null
  prochain_mois_paye: string | null
  remarques: string | null
  annee: number
  couleur?: string | null
  photo_url?: string | null
}

interface Notification {
  id: string
  type: string
  titre: string
  message: string
  candidat_id: string | null
  reference_id: string | null
  reference_table: string | null
  lue: boolean
  traitee?: boolean
  traitee_at?: string | null
  urgence: 'normale' | 'urgente'
  created_by: string | null
  created_by_nom: string | null
  created_at: string
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const S = {
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10 } as React.CSSProperties,
  input: { width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box' as const, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', fontSize: 14, outline: 'none' } as React.CSSProperties,
  label: { display: 'block' as const, fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' } as React.CSSProperties,
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function ZoneSection({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <section style={{ border: '1.5px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px dashed var(--border)' }}>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 800, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </section>
  )
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return d
  return `${day}.${m}.${y}`
}

function formatCHF(n: number): string {
  const hasCents = n % 1 !== 0
  return new Intl.NumberFormat('fr-CH', {
    style: 'currency', currency: 'CHF',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n)
}

function getPermisColor(dateEcheance: string | null): 'green' | 'yellow' | 'red' | 'gray' {
  if (!dateEcheance) return 'gray'
  const today = new Date()
  const echeance = new Date(dateEcheance)
  const jours = Math.floor((echeance.getTime() - today.getTime()) / 86400000)
  if (jours < 14) return 'red'
  if (jours < 90) return 'yellow'
  return 'green'
}

function getLigneStatut(c: SecretariatCandidat): 'ok' | 'warning' | 'urgent' {
  const permisColor = getPermisColor(c.date_echeance_permis)
  if (permisColor === 'red') return 'urgent'
  const docsComplet = c.has_cv && c.has_cm && c.has_docs_clients && c.has_permis_conduire && c.mappe
  if (!docsComplet) return 'warning'
  if (permisColor === 'yellow') return 'warning'
  return 'ok'
}

function getInitiales(nom: string, prenom: string): string {
  return `${(prenom || '').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase()
}

function cleanPhone(tel: string | null): string {
  if (!tel) return ''
  return tel.replace(/[\s\-\(\)\.]/g, '').replace(/^\+/, '').replace(/^0041/, '41').replace(/^0/, '41')
}

function WaIcon({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.612l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.82-6.3-2.188l-.44-.348-2.858.958.958-2.858-.348-.44A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
}

const ROW_COLORS: { key: string; label: string; bg: string }[] = [
  { key: '', label: 'Aucune', bg: 'transparent' },
  { key: 'vert', label: 'Vert', bg: '#DCFCE7' },
  { key: 'bleu', label: 'Bleu', bg: '#DBEAFE' },
  { key: 'jaune', label: 'Jaune', bg: '#FEF9C3' },
  { key: 'rouge', label: 'Rouge', bg: '#FEE2E2' },
]

function ColorPicker({ currentColor, onChange }: { currentColor: string | null; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false)
  const currentBg = ROW_COLORS.find(c => c.key === (currentColor || ''))?.bg || 'transparent'
  const hasColor = !!currentColor
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(!open)} title="Couleur ligne" style={{
        padding: '4px 6px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        background: hasColor ? currentBg : 'var(--secondary)',
        border: hasColor ? '2px solid rgba(0,0,0,0.15)' : '1.5px solid var(--border)',
      }}>
        <span style={{ width: 14, height: 14, borderRadius: 4, background: currentBg === 'transparent' ? 'var(--secondary)' : currentBg, border: '2px solid rgba(0,0,0,0.12)', display: 'inline-block' }} />
        <ChevronDown size={10} style={{ color: 'var(--muted)' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 9999, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', display: 'flex', gap: 5, marginTop: 3 }}>
          {ROW_COLORS.map(c => (
            <button key={c.key} onClick={() => { onChange(c.key); setOpen(false) }} title={c.label} style={{
              width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
              background: c.bg === 'transparent' ? 'var(--secondary)' : c.bg,
              border: (currentColor || '') === c.key ? '2.5px solid var(--primary)' : '2px solid rgba(0,0,0,0.1)',
              boxShadow: (currentColor || '') === c.key ? '0 0 0 2px rgba(245,166,35,0.3)' : 'none',
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Column Filter (Excel-style) ─────────────────────────────────────────────

function ColumnFilter({ values, selected, onChange }: {
  values: string[]
  selected: Set<string> | null // null = all selected
  onChange: (sel: Set<string> | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const unique = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'fr'))
  const filtered = search ? unique.filter(v => v.toLowerCase().includes(search.toLowerCase())) : unique
  const isActive = selected !== null
  const allChecked = selected === null || selected.size === unique.length

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(!open)} title="Filtrer" style={{
        padding: 0, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
        color: isActive ? 'var(--primary)' : 'var(--muted)', marginLeft: 3,
      }}>
        <Filter size={10} fill={isActive ? 'var(--primary)' : 'none'} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', marginTop: 4, width: 200, maxHeight: 280, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--secondary)', color: 'var(--foreground)', fontSize: 11, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
            <button onClick={() => onChange(null)} style={{ flex: 1, padding: '3px 0', borderRadius: 4, border: 'none', background: allChecked ? 'var(--primary)' : 'var(--secondary)', color: allChecked ? 'var(--primary-foreground)' : 'var(--muted)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Tous</button>
            <button onClick={() => onChange(new Set())} style={{ flex: 1, padding: '3px 0', borderRadius: 4, border: 'none', background: 'var(--secondary)', color: 'var(--muted)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Aucun</button>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 180, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filtered.map(v => {
              const checked = selected === null || selected.has(v)
              return (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 4px', borderRadius: 4, fontSize: 11, color: 'var(--foreground)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <input type="checkbox" checked={checked} onChange={() => {
                    const next = new Set(selected ?? unique)
                    if (next.has(v)) next.delete(v); else next.add(v)
                    onChange(next.size === unique.length ? null : next)
                  }} style={{ width: 12, height: 12, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '(vide)'}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Sortable header helper
type SortDir = 'asc' | 'desc' | null

function SortableHeader({ label, sortDir, onSort, style, filterValues, filterSelected, onFilter }: {
  label: string
  sortDir: SortDir
  onSort: () => void
  style?: React.CSSProperties
  filterValues?: string[]
  filterSelected?: Set<string> | null
  onFilter?: (sel: Set<string> | null) => void
}) {
  return (
    <th style={{ ...style, cursor: 'pointer', userSelect: 'none' }} onClick={onSort}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span>{label}</span>
        {sortDir === 'asc' ? <ArrowUp size={10} /> : sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUpDown size={9} style={{ opacity: 0.4 }} />}
        {filterValues && onFilter && (
          <span onClick={e => e.stopPropagation()}>
            <ColumnFilter values={filterValues} selected={filterSelected ?? null} onChange={onFilter} />
          </span>
        )}
      </div>
    </th>
  )
}

// ─── Autocomplete candidat ────────────────────────────────────────────────────

function CandidatAutocomplete({ value, onChange }: {
  value: string
  onChange: (nom: string, id: string | null, candidat?: any) => void
}) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  const handleChange = (v: string) => {
    setQuery(v); onChange(v, null)
    if (debounce.current) clearTimeout(debounce.current)
    if (v.length < 2) { setResults([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/candidats?search=${encodeURIComponent(v)}&per_page=8`)
        const d = await res.json()
        setResults(d.candidats || [])
        setOpen((d.candidats || []).length > 0)
      } finally { setLoading(false) }
    }, 280)
  }

  const select = (c: any) => {
    const label = [c.nom, c.prenom].filter(Boolean).join(' ')
    setQuery(label)
    onChange(label, c.id, c)
    setResults([]); setOpen(false)
  }

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input value={query} onChange={e => handleChange(e.target.value)} placeholder="Rechercher un candidat…" autoComplete="off" style={{ ...S.input, paddingRight: 32 }} />
        {loading
          ? <Loader2 size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', animation: 'spin 1s linear infinite' }} />
          : <Search size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        }
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto' }}>
          {results.map(c => (
            <button key={c.id} onMouseDown={() => select(c)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--foreground)', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontWeight: 600 }}>{c.nom} {c.prenom}</div>
              {(c.titre || c.localisation) && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{[c.titre, c.localisation].filter(Boolean).join(' · ')}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Modal Candidat ────────────────────────────────────────────────────────────

const EMPTY_CANDIDAT_FORM = {
  candidat_id: null as string | null,
  candidat_nom_complet: '',
  nom: '', prenom: '',
  date_naissance: '',
  enfants_charge: '?',
  lieu_demande: '',
  date_demande: '',
  type_demande: '' as '' | 'renouvellement' | 'changement_employeur' | 'premiere',
  genre_permis: '',
  date_echeance_permis: '',
  permis_travail: '',
  permis_note: '',
  carte_id: '',
  numero_avs: '',
  iban: '',
  numero_quadrigis: '',
  has_cv: false,
  has_cm: false,
  has_docs_clients: false,
  has_permis_conduire: false,
  docs_clients_note: '',
  remarques: '',
  date_mission: '',
  is_mission_terminee: false,
  date_fin_mission: '',
  mappe: false,
  suisse: false,
  archive: false,
  mode_paiement: '' as '' | 'calendrier_mensuel' | 'mensuel' | 'hebdomadaire',
  annee: new Date().getFullYear(),
}

function CandidatModal({ item, onClose, onSaved }: { item?: SecretariatCandidat | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => item ? {
    candidat_id: item.candidat_id,
    candidat_nom_complet: [item.nom, item.prenom].filter(Boolean).join(' '),
    nom: item.nom || '',
    prenom: item.prenom || '',
    date_naissance: item.date_naissance || '',
    enfants_charge: typeof item.enfants_charge === 'boolean' ? (item.enfants_charge ? 'oui' : 'non') : (item.enfants_charge || '?'),
    lieu_demande: item.lieu_demande || '',
    date_demande: item.date_demande || '',
    type_demande: (item.type_demande || '') as '' | 'renouvellement' | 'changement_employeur' | 'premiere',
    genre_permis: item.genre_permis || '',
    date_echeance_permis: item.date_echeance_permis || '',
    permis_travail: item.permis_travail || '',
    permis_note: item.permis_note || '',
    carte_id: item.carte_id || '',
    numero_avs: item.numero_avs || '',
    iban: item.iban || '',
    numero_quadrigis: item.numero_quadrigis || '',
    has_cv: item.has_cv || false,
    has_cm: item.has_cm || false,
    has_docs_clients: item.has_docs_clients || false,
    has_permis_conduire: item.has_permis_conduire || false,
    docs_clients_note: item.docs_clients_note || '',
    remarques: item.remarques || '',
    date_mission: item.date_mission || '',
    is_mission_terminee: !!item.is_mission_terminee,
    date_fin_mission: item.date_fin_mission || '',
    mappe: item.mappe || false,
    suisse: item.suisse || false,
    archive: !!item.archive,
    mode_paiement: (item.mode_paiement || '') as '' | 'calendrier_mensuel' | 'mensuel' | 'hebdomadaire',
    annee: item.annee || new Date().getFullYear(),
  } : { ...EMPTY_CANDIDAT_FORM, annee: new Date().getFullYear() })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nom) { toast.error('Nom requis'); return }
    setSaving(true)
    try {
      const payload = {
        candidat_id: form.candidat_id || null,
        nom: form.nom, prenom: form.prenom,
        date_naissance: form.date_naissance || null,
        enfants_charge: form.enfants_charge,
        lieu_demande: form.lieu_demande || null,
        date_demande: form.date_demande || null,
        type_demande: form.type_demande || null,
        genre_permis: form.genre_permis || null,
        date_echeance_permis: form.date_echeance_permis || null,
        permis_travail: form.permis_travail || null,
        permis_note: form.permis_note || null,
        carte_id: form.carte_id || '',
        numero_avs: form.numero_avs || null,
        iban: form.iban || null,
        numero_quadrigis: form.numero_quadrigis || null,
        has_cv: form.has_cv,
        has_cm: form.has_cm,
        has_docs_clients: form.has_docs_clients,
        has_permis_conduire: form.has_permis_conduire,
        docs_clients_note: form.docs_clients_note || null,
        remarques: form.remarques || null,
        date_mission: form.date_mission || null,
        is_mission_terminee: form.is_mission_terminee,
        date_fin_mission: form.is_mission_terminee ? (form.date_fin_mission || null) : null,
        mappe: form.mappe,
        suisse: form.suisse,
        mode_paiement: form.mode_paiement || null,
        archive: form.archive,
        archived_at: form.archive && !item?.archive ? new Date().toISOString() : (item?.archived_at || null),
        annee: form.annee,
      }
      const url = item ? `/api/secretariat/candidats/${item.id}` : '/api/secretariat/candidats'
      const res = await fetch(url, { method: item ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')

      // Alerte fin ALFA caisse : si Mission Terminée vient d'être cochée
      // ET qu'un suivi ALFA EN COURS existe pour ce candidat → créer notif persistante.
      // « En cours » = !termine && !raf (RAF est un statut distinct).
      const wasNotTerminated = !item?.is_mission_terminee
      if (form.is_mission_terminee && wasNotTerminated && form.candidat_id) {
        try {
          const alfaRes = await fetch(`/api/secretariat/alfa?annee=${form.annee}`)
          if (alfaRes.ok) {
            const alfaData = await alfaRes.json()
            const matchingAlfa = (alfaData.alfa || []).find((a: any) =>
              a.candidat_id === form.candidat_id && !a.termine && !a.raf
            )
            if (matchingAlfa) {
              const candidatLabel = `${form.nom} ${form.prenom}`.trim()
              await fetch('/api/secretariat/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'fin_alfa_caisse',
                  titre: `🚨 Annoncer fin ALFA à la caisse — ${candidatLabel}`,
                  message: `Le candidat ${candidatLabel} a terminé sa mission. Une fiche ALFA en cours existe encore. Annonce la fin à la caisse, puis clique sur "C'est Fait" pour archiver cette alerte.`,
                  candidat_id: form.candidat_id,
                  reference_id: `fin_alfa_${data.candidat?.id || item?.id || form.candidat_id}_${form.date_fin_mission || 'no-date'}`,
                  reference_table: 'secretariat_candidats',
                  urgence: 'urgente',
                }),
              })
              toast.warning(`⚠️ N'oublie pas d'annoncer la fin d'ALFA à la caisse pour ${candidatLabel}`, { duration: 6000 })
            }
          }
        } catch { /* best-effort */ }
      }

      toast.success(item ? 'Entrée modifiée' : 'Entrée créée')
      onSaved(); onClose()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 22, fontWeight: 400, color: 'var(--foreground)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{item ? 'Modifier' : 'Nouveau candidat'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ─── ZONE 1 : CANDIDAT ─── */}
          <ZoneSection title="Candidat" icon="👤">
            <div>
              <label style={S.label}>Lier à un candidat TalentFlow</label>
              <CandidatAutocomplete
                value={form.candidat_nom_complet}
                onChange={(nom, id, candidat) => setForm(f => ({
                  ...f,
                  candidat_nom_complet: nom,
                  candidat_id: id,
                  nom: candidat?.nom || f.nom,
                  prenom: candidat?.prenom || f.prenom,
                }))}
              />
              {form.candidat_id && <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 2 }}>✓ Lié au candidat</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Nom *</label>
                <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Nom" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Prénom *</label>
                <input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Prénom" style={S.input} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Date de naissance</label>
                <input type="date" value={form.date_naissance} onChange={e => set('date_naissance', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
              </div>
              <div>
                <label style={S.label}>N° Quadrigis</label>
                <input value={form.numero_quadrigis} onChange={e => set('numero_quadrigis', e.target.value)} placeholder="Ex: Q-12345" style={S.input} />
              </div>
            </div>
            <div style={{ background: 'var(--secondary)', border: '1.5px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <div style={{ ...S.label, marginBottom: 10 }}>Documents reçus</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {[
                  { key: 'has_cv', label: 'CV' },
                  { key: 'has_cm', label: 'CM' },
                  { key: 'has_docs_clients', label: 'Docs Clients' },
                  { key: 'mappe', label: 'Mappe' },
                  { key: 'has_permis_conduire', label: 'Permis conduire' },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--foreground)' }}>
                    <input type="checkbox" checked={form[key as keyof typeof form] as boolean} onChange={e => set(key as keyof typeof form, e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                    {label}
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--foreground)' }}>
                  <input type="checkbox" checked={!!form.numero_avs} onChange={e => set('numero_avs', e.target.checked ? 'oui' : '')}
                    style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                  AVS
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--foreground)' }}>
                  <input type="checkbox" checked={!!form.iban} onChange={e => set('iban', e.target.checked ? 'oui' : '')}
                    style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                  IBAN
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--foreground)' }}>
                  <input type="checkbox" checked={!!form.carte_id} onChange={e => set('carte_id', e.target.checked ? 'oui' : '')}
                    style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                  Carte ID
                </label>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={{ ...S.label, marginBottom: 4 }}>Note Docs Clients (visible au survol)</label>
                <input value={form.docs_clients_note} onChange={e => set('docs_clients_note', e.target.value)} placeholder="Ex: contrat signé, attestation…" style={S.input} />
              </div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 2 : PERMIS DE TRAVAIL ─── */}
          <ZoneSection title="Permis de travail" icon="🪪">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Permis de séjour</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select value={form.genre_permis} onChange={e => set('genre_permis', e.target.value)} style={{ ...S.input, flex: 1 }}>
                    <option value="">— Sélectionner —</option>
                    <option value="L">L</option>
                    <option value="B">B</option>
                    <option value="B réfugié">B réfugié</option>
                    <option value="B (marié CH/C)">B (marié avec CH ou C)</option>
                    <option value="C">C</option>
                    <option value="F">F</option>
                    <option value="G">G</option>
                    <option value="N">N</option>
                    <option value="S">S</option>
                    <option value="IMES">IMES</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none', fontSize: 12, fontWeight: 700, color: form.suisse ? '#DC2626' : 'var(--muted)', whiteSpace: 'nowrap', padding: '6px 8px', borderRadius: 6, background: form.suisse ? 'rgba(220,38,38,0.08)' : 'var(--secondary)', border: `1.5px solid ${form.suisse ? 'rgba(220,38,38,0.3)' : 'var(--border)'}` }}>
                    <input type="checkbox" checked={form.suisse} onChange={e => set('suisse', e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: '#DC2626', cursor: 'pointer' }} />
                    🇨🇭 Suisse
                  </label>
                </div>
              </div>
              <div>
                <label style={S.label}>Échéance permis</label>
                <input type="date" value={form.date_echeance_permis} onChange={e => set('date_echeance_permis', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
              </div>
            </div>
            <div>
              <label style={S.label}>Note permis (visible au survol)</label>
              <input value={form.permis_note} onChange={e => set('permis_note', e.target.value)} placeholder="Ex: renouvellement en cours…" style={S.input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Lieu de demande</label>
                <input value={form.lieu_demande} onChange={e => set('lieu_demande', e.target.value)} placeholder="Ex: Genève" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Date de demande</label>
                <input type="date" value={form.date_demande} onChange={e => set('date_demande', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
              </div>
            </div>
            <div>
              <label style={S.label}>Type de demande</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  { key: 'renouvellement', label: '🔄 Renouvellement' },
                  { key: 'changement_employeur', label: '🔁 Changement d\'employeur' },
                  { key: 'premiere', label: '✨ 1ère Demande' },
                ] as const).map(t => {
                  const active = form.type_demande === t.key
                  return (
                    <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: active ? 'var(--primary-soft)' : 'var(--secondary)', border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`, color: active ? 'var(--primary)' : 'var(--muted)' }}>
                      <input type="checkbox" checked={active} onChange={() => set('type_demande', active ? '' : t.key)}
                        style={{ width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                      {t.label}
                    </label>
                  )
                })}
              </div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 3 : ALFA ─── */}
          <ZoneSection title="ALFA" icon="👨‍👩‍👧">
            <div>
              <label style={S.label}>Enfants à charge</label>
              <select value={form.enfants_charge as string} onChange={e => set('enfants_charge', e.target.value)} style={S.input}>
                <option value="oui">OUI</option>
                <option value="oui_pas_a_charge">OUI pas à charge</option>
                <option value="non">NON</option>
                <option value="?">? (inconnu)</option>
              </select>
              {form.enfants_charge === 'oui' && (
                <div style={{ marginTop: 8, padding: 10, background: 'rgba(234,179,8,0.08)', border: '1.5px solid rgba(234,179,8,0.25)', borderRadius: 8, fontSize: 12, color: 'var(--foreground)' }}>
                  💡 Une fiche ALFA est requise. Après enregistrement, clique sur le badge <strong>ALFA</strong> dans la liste pour la créer ou la consulter.
                </div>
              )}
              {form.enfants_charge === 'oui_pas_a_charge' && (
                <div style={{ marginTop: 8, padding: 10, background: 'var(--secondary)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
                  ℹ️ Le candidat a des enfants mais pas à charge. Aucune fiche ALFA n'est nécessaire.
                </div>
              )}
            </div>
          </ZoneSection>

          {/* ─── ZONE 4 : MISSIONS & ARCHIVAGE ─── */}
          <ZoneSection title="Missions" icon="💼">
            {!form.is_mission_terminee && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={S.label}>Date Mission Active</label>
                    <input type="date" value={form.date_mission} onChange={e => set('date_mission', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
                  </div>
                  <div>
                    <label style={S.label}>Année</label>
                    <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={{ ...S.input }}>
                      <option value={2026}>2026</option>
                      <option value={2025}>2025</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>💰 Mode de paiement</label>
                  <select
                    value={form.mode_paiement}
                    onChange={e => set('mode_paiement', e.target.value as any)}
                    style={{
                      ...S.input,
                      borderLeft: form.mode_paiement === 'calendrier_mensuel' ? '4px solid #DC2626'
                        : form.mode_paiement === 'mensuel' ? '4px solid #059669'
                        : form.mode_paiement === 'hebdomadaire' ? '4px solid #2563EB'
                        : undefined,
                    }}
                  >
                    <option value="">— Non défini —</option>
                    <option value="calendrier_mensuel">🔴 Calendrier mensuel (mensuel décalé)</option>
                    <option value="mensuel">🟢 Mensuel (payé le mois suivant)</option>
                    <option value="hebdomadaire">🔵 Hebdomadaire (paiement chaque jeudi)</option>
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Une notification email sera envoyée au candidat 2 jours avant chaque versement de salaire.
                  </div>
                </div>
              </>
            )}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', padding: '8px 12px', borderRadius: 8, background: form.is_mission_terminee ? 'rgba(239,68,68,0.10)' : 'var(--secondary)', border: `1.5px solid ${form.is_mission_terminee ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
                <input type="checkbox" checked={form.is_mission_terminee}
                  onChange={e => set('is_mission_terminee', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#EF4444', cursor: 'pointer' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: form.is_mission_terminee ? '#DC2626' : 'var(--foreground)' }}>🏁 Mission terminée</span>
              </label>
            </div>
            {form.is_mission_terminee && (
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🏁 Mission terminée</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={S.label}>Date fin de mission</label>
                    <input type="date" value={form.date_fin_mission} onChange={e => set('date_fin_mission', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
                  </div>
                  <div>
                    <label style={S.label}>Année</label>
                    <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={{ ...S.input }}>
                      <option value={2026}>2026</option>
                      <option value={2025}>2025</option>
                    </select>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>La date de mission active sera réactivée si tu décoches la case.</div>
              </div>
            )}

            {/* Toggle Archivé — masque le candidat de la liste active */}
            <div style={{ marginTop: 4, paddingTop: 10, borderTop: '1.5px dashed var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', padding: '8px 12px', borderRadius: 8, background: form.archive ? 'rgba(107,114,128,0.12)' : 'var(--secondary)', border: `1.5px solid ${form.archive ? 'rgba(107,114,128,0.35)' : 'var(--border)'}` }}>
                <input type="checkbox" checked={form.archive}
                  onChange={e => set('archive', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#6B7280', cursor: 'pointer' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: form.archive ? '#4B5563' : 'var(--foreground)' }}>📦 Archivé</span>
                <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>{form.archive ? 'Le candidat sera masqué de la liste active' : 'Cocher pour masquer le candidat'}</span>
              </label>
            </div>
          </ZoneSection>

          {/* ─── ZONE 5 : REMARQUES ─── */}
          <ZoneSection title="Remarques" icon="📝">
            <textarea value={form.remarques} onChange={e => set('remarques', e.target.value)} placeholder="Commentaires libres…" rows={3} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </ZoneSection>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={13} />}{item ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Modal Accident ────────────────────────────────────────────────────────────

const EMPTY_ACCIDENT_FORM = {
  candidat_id: null as string | null,
  candidat_nom_complet: '',
  nom_prenom: '',
  type_cas: 'Accident' as 'Accident' | 'Maladie' | 'Bagatelle' | 'LCA Maladie',
  sous_type: '',
  raison: '',
  numero_sinistre: '',
  date_debut: '',
  date_fin: '',
  assurance_payee_jusqu_au: '',
  licenciement_pour_le: '',
  remarque: '',
  termine: false,
  statut_cas: 'nouveau' as 'nouveau' | 'en_cours' | 'termine',
  decision: '',
  note: '',
  couleur: 'normal' as 'normal' | 'jaune' | 'rouge',
  annee: new Date().getFullYear(),
}

function AccidentModal({ item, onClose, onSaved }: { item?: SecretariatAccident | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => item ? {
    candidat_id: item.candidat_id,
    candidat_nom_complet: item.nom_prenom || '',
    nom_prenom: item.nom_prenom || '',
    type_cas: item.type_cas,
    sous_type: item.sous_type || '',
    raison: item.raison || '',
    numero_sinistre: item.numero_sinistre || '',
    date_debut: item.date_debut || '',
    date_fin: item.date_fin || '',
    assurance_payee_jusqu_au: item.assurance_payee_jusqu_au || '',
    licenciement_pour_le: item.licenciement_pour_le || '',
    remarque: item.remarque || '',
    termine: item.termine || false,
    statut_cas: (item.statut_cas || (item.termine ? 'termine' : 'en_cours')) as 'nouveau' | 'en_cours' | 'termine',
    decision: item.decision || '',
    note: item.note || '',
    couleur: item.couleur || 'normal' as 'normal' | 'jaune' | 'rouge',
    annee: item.annee || new Date().getFullYear(),
  } : { ...EMPTY_ACCIDENT_FORM, annee: new Date().getFullYear() })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nom_prenom) { toast.error('Nom / Prénom requis'); return }
    setSaving(true)
    try {
      const hasSousType = form.type_cas === 'Accident' || form.type_cas === 'Bagatelle'
      const payload = {
        candidat_id: form.candidat_id || null,
        nom_prenom: form.nom_prenom,
        type_cas: form.type_cas,
        sous_type: hasSousType ? (form.sous_type || null) : null,
        raison: form.raison || null,
        numero_sinistre: form.numero_sinistre || null,
        date_debut: form.date_debut || null,
        date_fin: form.date_fin || null,
        assurance_payee_jusqu_au: form.assurance_payee_jusqu_au || null,
        licenciement_pour_le: form.licenciement_pour_le || null,
        remarque: form.remarque || null,
        statut_cas: form.statut_cas,
        termine: form.statut_cas === 'termine',
        decision: form.decision || null,
        note: form.note || null,
        couleur: form.couleur,
        annee: form.annee,
      }
      const url = item ? `/api/secretariat/accidents/${item.id}` : '/api/secretariat/accidents'
      const res = await fetch(url, { method: item ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      toast.success(item ? 'Cas modifié' : 'Cas créé')
      onSaved(); onClose()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 22, fontWeight: 400, color: 'var(--foreground)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{item ? 'Modifier le cas' : 'Nouveau cas'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ─── ZONE 1 : CANDIDAT ─── */}
          <ZoneSection title="Candidat" icon="👤">
            <div>
              <label style={S.label}>Lier à un candidat TalentFlow</label>
              <CandidatAutocomplete
                value={form.candidat_nom_complet}
                onChange={(nom, id, candidat) => setForm(f => ({
                  ...f,
                  candidat_nom_complet: nom,
                  candidat_id: id,
                  nom_prenom: candidat ? [candidat.nom, candidat.prenom].filter(Boolean).join(' ') : f.nom_prenom,
                }))}
              />
            </div>
            <div>
              <label style={S.label}>Nom / Prénom *</label>
              <input value={form.nom_prenom} onChange={e => set('nom_prenom', e.target.value)} placeholder="Nom Prénom" style={S.input} />
            </div>
          </ZoneSection>

          {/* ─── ZONE 2 : CAS ─── */}
          <ZoneSection title="Cas" icon="🏥">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Type de cas</label>
                <select value={form.type_cas} onChange={e => { set('type_cas', e.target.value as 'Accident' | 'Maladie' | 'Bagatelle' | 'LCA Maladie'); set('sous_type', '') }} style={{ ...S.input }}>
                  <option value="Accident">Accident</option>
                  <option value="Bagatelle">Bagatelle</option>
                  <option value="Maladie">Maladie</option>
                  <option value="LCA Maladie">LCA Maladie</option>
                </select>
              </div>
              {(form.type_cas === 'Accident' || form.type_cas === 'Bagatelle') && (
                <div>
                  <label style={S.label}>Sous-type</label>
                  <select value={form.sous_type} onChange={e => set('sous_type', e.target.value)} style={{ ...S.input }}>
                    <option value="">— Choisir —</option>
                    <option value="AANP">AANP</option>
                    <option value="AAP">AAP</option>
                  </select>
                </div>
              )}
            </div>
            <div>
              <label style={S.label}>Raison / Description</label>
              <input value={form.raison} onChange={e => set('raison', e.target.value)} placeholder="Description du cas…" style={S.input} />
            </div>
            <div>
              <label style={S.label}>N° Sinistre</label>
              <input value={form.numero_sinistre} onChange={e => set('numero_sinistre', e.target.value)} placeholder="N° de sinistre" style={S.input} />
            </div>
          </ZoneSection>

          {/* ─── ZONE 3 : DATES ─── */}
          <ZoneSection title="Dates" icon="📅">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Date début</label>
                <input type="date" value={form.date_debut} onChange={e => set('date_debut', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
              </div>
              <div>
                <label style={S.label}>Date fin</label>
                <input type="date" value={form.date_fin} onChange={e => set('date_fin', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Assurance payée jusqu'au</label>
                <input type="date" value={form.assurance_payee_jusqu_au} onChange={e => set('assurance_payee_jusqu_au', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
              </div>
              <div>
                <label style={S.label}>Licenciement pour le</label>
                <input type="date" value={form.licenciement_pour_le} onChange={e => set('licenciement_pour_le', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
              </div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 4 : DÉCISION & STATUT ─── */}
          <ZoneSection title="Décision & Statut" icon="✅">
            <div>
              <label style={S.label}>Décision</label>
              <input value={form.decision} onChange={e => set('decision', e.target.value)} placeholder="Décision prise…" style={S.input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Statut</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([
                    { key: 'nouveau', label: 'Nouveau Cas', bg: 'rgba(99,102,241,0.12)', color: '#818CF8', border: 'rgba(99,102,241,0.3)' },
                    { key: 'en_cours', label: 'En cours', bg: 'rgba(6,182,212,0.12)', color: '#06B6D4', border: 'rgba(6,182,212,0.3)' },
                    { key: 'termine', label: 'Terminé', bg: 'rgba(34,197,94,0.12)', color: '#22C55E', border: 'rgba(34,197,94,0.3)' },
                  ] as const).map(opt => (
                    <button key={opt.key} type="button" onClick={() => set('statut_cas', opt.key)} style={{
                      flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      background: form.statut_cas === opt.key ? opt.bg : 'var(--secondary)',
                      color: form.statut_cas === opt.key ? opt.color : 'var(--muted)',
                      border: `1.5px solid ${form.statut_cas === opt.key ? opt.border : 'var(--border)'}`,
                    }}>{opt.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={S.label}>Année</label>
                <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={{ ...S.input }}>
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                </select>
              </div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 5 : REMARQUES & NOTES ─── */}
          <ZoneSection title="Remarques & Notes" icon="📝">
            <div>
              <label style={S.label}>Note interne</label>
              <textarea value={form.note} onChange={e => set('note', e.target.value)} placeholder="Note interne (visible uniquement aux secrétaires)…" rows={2} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={S.label}>Remarque</label>
              <textarea value={form.remarque} onChange={e => set('remarque', e.target.value)} placeholder="Remarques générales…" rows={2} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </ZoneSection>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={13} />}{item ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}


// ─── Modal ALFA ──────────────────────────────────────────────────────────────

const EMPTY_ALFA_FORM = {
  candidat_id: null as string | null,
  candidat_nom_complet: '',
  nom: '', prenom: '',
  numero_avs: '',
  nbr_enfants: '',
  montant_chf: '',
  bareme_is: '',
  dates_debut_alfa: [''] as string[],
  dates_fin_alfa: [''] as string[],
  dates_radiation_caf: [''] as string[],
  dates_reactivation: [''] as string[],
  dates_radiation_recue: [''] as string[],
  mere_touche: '' as string,
  remarques: '',
  demande_envoyee: '',
  lieu_enfants: '',
  consimo: '',
  statut_alfa: 'en_cours' as 'en_cours' | 'termine' | 'raf',
  annee: new Date().getFullYear(),
}

function AlfaModal({ item, onClose, onSaved }: { item?: SecretariatAlfa | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => item ? {
    candidat_id: item.candidat_id,
    candidat_nom_complet: [item.nom, item.prenom].filter(Boolean).join(' '),
    nom: item.nom || '',
    prenom: item.prenom || '',
    numero_avs: item.numero_avs || '',
    nbr_enfants: item.nbr_enfants != null ? String(item.nbr_enfants) : '',
    montant_chf: item.montant_chf != null ? String(item.montant_chf) : '',
    bareme_is: item.bareme_is || '',
    dates_debut_alfa: parseDates(item.date_debut_alfa),
    dates_fin_alfa: parseDates(item.date_fin_alfa),
    dates_radiation_caf: parseDates(item.date_radiation_caf),
    dates_reactivation: parseDates(item.reactivation_envoyee),
    dates_radiation_recue: parseDates(item.radiation_recue),
    mere_touche: item.mere_touche || '',
    remarques: item.remarques || '',
    demande_envoyee: item.demande_envoyee || '',
    lieu_enfants: item.lieu_enfants || '',
    consimo: item.consimo || '',
    statut_alfa: (item.raf ? 'raf' : item.termine ? 'termine' : 'en_cours') as 'en_cours' | 'termine' | 'raf',
    annee: item.annee || new Date().getFullYear(),
  } : { ...EMPTY_ALFA_FORM, annee: new Date().getFullYear() })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nom) { toast.error('Nom requis'); return }
    setSaving(true)
    try {
      const payload = {
        candidat_id: form.candidat_id || null,
        nom: form.nom, prenom: form.prenom || null,
        numero_avs: form.numero_avs || null,
        nbr_enfants: form.nbr_enfants !== '' ? Number(form.nbr_enfants) : null,
        montant_chf: form.montant_chf !== '' ? Number(form.montant_chf) : null,
        bareme_is: form.bareme_is || null,
        date_debut_alfa: joinDates(form.dates_debut_alfa),
        date_fin_alfa: joinDates(form.dates_fin_alfa),
        date_radiation_caf: joinDates(form.dates_radiation_caf),
        radiation_recue: joinDates(form.dates_radiation_recue),
        mere_touche: form.mere_touche || null,
        remarques: form.remarques || null,
        demande_envoyee: form.demande_envoyee || null,
        reactivation_envoyee: joinDates(form.dates_reactivation),
        lieu_enfants: form.lieu_enfants || null,
        consimo: form.consimo || null,
        termine: form.statut_alfa === 'termine',
        raf: form.statut_alfa === 'raf',
        annee: form.annee,
      }
      const isUpdate = !!item?.id
      const url = isUpdate ? `/api/secretariat/alfa/${item!.id}` : '/api/secretariat/alfa'
      const res = await fetch(url, { method: isUpdate ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      toast.success(isUpdate ? 'ALFA modifié' : 'ALFA créé')
      onSaved(); onClose()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 22, fontWeight: 400, color: 'var(--foreground)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{item?.id ? 'Modifier ALFA' : 'Nouveau suivi ALFA'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ─── ZONE 1 : CANDIDAT ─── */}
          <ZoneSection title="Candidat" icon="👤">
            <div>
              <label style={S.label}>Lier à un candidat TalentFlow</label>
              <CandidatAutocomplete
                value={form.candidat_nom_complet}
                onChange={(nom, id, candidat) => setForm(f => ({
                  ...f, candidat_nom_complet: nom, candidat_id: id,
                  nom: candidat?.nom || f.nom, prenom: candidat?.prenom || f.prenom,
                }))}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={S.label}>Nom *</label><input value={form.nom} onChange={e => set('nom', e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Prénom</label><input value={form.prenom} onChange={e => set('prenom', e.target.value)} style={S.input} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={S.label}>N° AVS</label><input value={form.numero_avs} onChange={e => set('numero_avs', e.target.value)} placeholder="756.XXXX.XXXX.XX" style={S.input} /></div>
              <div><label style={S.label}>Nbr enfants</label><input type="number" value={form.nbr_enfants} onChange={e => set('nbr_enfants', e.target.value)} style={S.input} /></div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 2 : MONTANTS ─── */}
          <ZoneSection title="Montants" icon="💰">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={S.label}>Montant CHF</label><input type="number" step="0.01" value={form.montant_chf} onChange={e => set('montant_chf', e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Barème IS</label><input value={form.bareme_is} onChange={e => set('bareme_is', e.target.value)} style={S.input} /></div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 3 : DATES ALFA ─── */}
          <ZoneSection title="Dates ALFA" icon="📅">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Dates début ALFA</label>
                <MultiDateInput values={form.dates_debut_alfa} onChange={v => set('dates_debut_alfa', v)} />
              </div>
              <div>
                <label style={S.label}>Dates fin ALFA</label>
                <MultiDateInput values={form.dates_fin_alfa} onChange={v => set('dates_fin_alfa', v)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Dates radiation CAF</label>
                <MultiDateInput values={form.dates_radiation_caf} onChange={v => set('dates_radiation_caf', v)} />
              </div>
              <div>
                <label style={S.label}>Dates radiation reçue</label>
                <MultiDateInput values={form.dates_radiation_recue} onChange={v => set('dates_radiation_recue', v)} />
              </div>
            </div>
            <div>
              <label style={S.label}>Dates réactivation envoyée</label>
              <MultiDateInput values={form.dates_reactivation} onChange={v => set('dates_reactivation', v)} />
            </div>
          </ZoneSection>

          {/* ─── ZONE 4 : ENFANTS / MÈRE ─── */}
          <ZoneSection title="Enfants & Mère" icon="👨‍👩‍👧">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Mère touche</label>
                <select value={form.mere_touche} onChange={e => set('mere_touche', e.target.value)} style={S.input}>
                  <option value="">— Sélectionner —</option>
                  <option value="OUI">OUI</option>
                  <option value="NON">NON</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Lieu enfants (un par ligne)</label>
                <textarea value={form.lieu_enfants} onChange={e => set('lieu_enfants', e.target.value)} placeholder={"Ex: 1 enfant PT\n2 AFRIQUE"} rows={3} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 5 : DÉCISIONS & STATUT ─── */}
          <ZoneSection title="Décisions & Statut" icon="✅">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={S.label}>Demande envoyée</label><input value={form.demande_envoyee} onChange={e => set('demande_envoyee', e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Consimo</label><input value={form.consimo} onChange={e => set('consimo', e.target.value)} placeholder="Décision Consimo" style={S.input} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={S.label}>Année</label>
                <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={S.input}>
                  <option value={2026}>2026</option><option value={2025}>2025</option>
                </select>
              </div>
              <div>
                <div style={S.label}>Statut</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {([
                    { key: 'en_cours', label: '● En cours', bg: 'rgba(239,68,68,0.12)', color: '#EF4444', border: 'rgba(239,68,68,0.3)' },
                    { key: 'termine', label: '✓ Terminé', bg: 'rgba(34,197,94,0.12)', color: '#22C55E', border: 'rgba(34,197,94,0.3)' },
                    { key: 'raf', label: '⏳ RAF', bg: 'rgba(234,179,8,0.12)', color: '#CA8A04', border: 'rgba(234,179,8,0.3)' },
                  ] as const).map(opt => (
                    <button key={opt.key} type="button" onClick={() => set('statut_alfa', opt.key)} style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      background: form.statut_alfa === opt.key ? opt.bg : 'var(--secondary)',
                      color: form.statut_alfa === opt.key ? opt.color : 'var(--muted)',
                      border: `1.5px solid ${form.statut_alfa === opt.key ? opt.border : 'var(--border)'}`,
                    }}>{opt.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 6 : REMARQUES ─── */}
          <ZoneSection title="Remarques" icon="📝">
            <textarea value={form.remarques} onChange={e => set('remarques', e.target.value)} placeholder="Commentaires libres…" rows={3} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </ZoneSection>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={13} />}{item ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Modal ALFA Paiement ─────────────────────────────────────────────────────

const EMPTY_ALFA_PAIEMENT_FORM = {
  candidat_id: null as string | null,
  candidat_nom_complet: '',
  nom: '', prenom: '',
  numero_avs: '',
  nbr_enfants: '',
  date_validite_decision: '',
  droit_chf_mois: '',
  montant_alfa_paye: '',
  annee_periode: '',
  alfa_dernier_mois: '',
  dates_fin_mission: [{ date: '', paye: false }] as Array<{ date: string; paye: boolean }>,
  statut_termine: false,
  dernier_mois_paye: '',
  prochain_mois_paye: '',
  remarques: '',
  annee: new Date().getFullYear(),
}

function AlfaPaiementModal({ item, onClose, onSaved }: { item?: SecretariatAlfaPaiement | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => item ? {
    candidat_id: item.candidat_id,
    candidat_nom_complet: [item.nom, item.prenom].filter(Boolean).join(' '),
    nom: item.nom || '',
    prenom: item.prenom || '',
    numero_avs: item.numero_avs || '',
    nbr_enfants: item.nbr_enfants != null ? String(item.nbr_enfants) : '',
    date_validite_decision: item.date_validite_decision || '',
    droit_chf_mois: item.droit_chf_mois != null ? String(item.droit_chf_mois) : '',
    montant_alfa_paye: item.montant_alfa_paye != null ? String(item.montant_alfa_paye) : '',
    annee_periode: item.annee_periode || '',
    alfa_dernier_mois: item.alfa_dernier_mois || '',
    dates_fin_mission: parseDatesPaye(item.dates_fin_mission || (item.date_fin_mission || null)),
    statut_termine: item.statut_termine || false,
    dernier_mois_paye: item.dernier_mois_paye || '',
    prochain_mois_paye: item.prochain_mois_paye || '',
    remarques: item.remarques || '',
    annee: item.annee || new Date().getFullYear(),
  } : { ...EMPTY_ALFA_PAIEMENT_FORM, annee: new Date().getFullYear() })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nom) { toast.error('Nom requis'); return }
    setSaving(true)
    try {
      const finMissionRaw = joinDatesPaye(form.dates_fin_mission)
      const finMissionPairs = form.dates_fin_mission.filter(x => x.date && x.date.trim())
      const firstFinMission = finMissionPairs[0]?.date || null
      const allPaiementsTermines = finMissionPairs.length > 0 && finMissionPairs.every(p => p.paye)
      // Sync vers suivi ALFA = juste la 1ère date sans flag (le suivi ne gère pas le flag paye)
      const finMissionDatesOnly = finMissionPairs.map(p => p.date).join(',') || null
      const payload = {
        candidat_id: form.candidat_id || null,
        nom: form.nom, prenom: form.prenom || null,
        numero_avs: form.numero_avs || null,
        nbr_enfants: form.nbr_enfants !== '' ? Number(form.nbr_enfants) : null,
        date_validite_decision: form.date_validite_decision || null,
        droit_chf_mois: form.droit_chf_mois !== '' ? Number(form.droit_chf_mois) : null,
        montant_alfa_paye: form.montant_alfa_paye !== '' ? Number(form.montant_alfa_paye) : null,
        annee_periode: form.annee_periode || null,
        alfa_dernier_mois: form.alfa_dernier_mois || null,
        dates_fin_mission: finMissionRaw,
        date_fin_mission: firstFinMission, // rétrocompat 1ère date
        // statut_termine est désormais dérivé : true ssi tous les paiements sont cochés
        statut_termine: allPaiementsTermines,
        dernier_mois_paye: form.dernier_mois_paye || null,
        prochain_mois_paye: form.prochain_mois_paye || null,
        remarques: form.remarques || null,
        annee: form.annee,
      }
      const isUpdate = !!item?.id
      const url = isUpdate ? `/api/secretariat/alfa-paiements/${item!.id}` : '/api/secretariat/alfa-paiements'
      const res = await fetch(url, { method: isUpdate ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')

      // Sync vers suivi ALFA du même candidat (si candidat_id et dates fin mission)
      if (form.candidat_id && finMissionDatesOnly) {
        try {
          const alfaRes = await fetch(`/api/secretariat/alfa?annee=${form.annee}`)
          if (alfaRes.ok) {
            const alfaData = await alfaRes.json()
            const matchingAlfa = (alfaData.alfa || []).find((a: any) => a.candidat_id === form.candidat_id)
            if (matchingAlfa) {
              await fetch(`/api/secretariat/alfa/${matchingAlfa.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date_fin_alfa: finMissionDatesOnly }),
              })
            }
          }
        } catch { /* sync best-effort, on ignore les erreurs */ }
      }

      toast.success(isUpdate ? 'Paiement modifié' : 'Paiement créé')
      onSaved(); onClose()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 22, fontWeight: 400, color: 'var(--foreground)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{item?.id ? 'Modifier paiement ALFA' : 'Nouveau paiement ALFA'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ─── ZONE 1 : CANDIDAT ─── */}
          <ZoneSection title="Candidat" icon="👤">
            <div>
              <label style={S.label}>Lier à un candidat TalentFlow</label>
              <CandidatAutocomplete
                value={form.candidat_nom_complet}
                onChange={(nom, id, candidat) => setForm(f => ({
                  ...f, candidat_nom_complet: nom, candidat_id: id,
                  nom: candidat?.nom || f.nom, prenom: candidat?.prenom || f.prenom,
                }))}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={S.label}>Nom *</label><input value={form.nom} onChange={e => set('nom', e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Prénom</label><input value={form.prenom} onChange={e => set('prenom', e.target.value)} style={S.input} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={S.label}>N° AVS</label><input value={form.numero_avs} onChange={e => set('numero_avs', e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Nbr enfants</label><input type="number" value={form.nbr_enfants} onChange={e => set('nbr_enfants', e.target.value)} style={S.input} /></div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 2 : MONTANTS (avec calculatrice) ─── */}
          <ZoneSection title="Montants" icon="💰">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={S.label}>Droit CHF/mois <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 500 }}>(calc auto)</span></label>
                <CalcInput value={form.droit_chf_mois} onChange={v => set('droit_chf_mois', v)} placeholder="Ex: 1500+200" />
              </div>
              <div>
                <label style={S.label}>Montant ALFA payé <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 500 }}>(calc auto)</span></label>
                <CalcInput value={form.montant_alfa_paye} onChange={v => set('montant_alfa_paye', v)} placeholder="Ex: 1700-50*2" />
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>💡 Tu peux taper une opération (ex : <code>1500+200-50*2</code>) puis Tab ou Entrée pour calculer.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={S.label}>Période (année)</label><input value={form.annee_periode} onChange={e => set('annee_periode', e.target.value)} placeholder="Ex: 2026" style={S.input} /></div>
              <div><label style={S.label}>Droit Décision ALFA jusqu'au</label><input type="date" value={form.date_validite_decision} onChange={e => set('date_validite_decision', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} /></div>
            </div>
          </ZoneSection>

          {/* ─── ZONE 3 : MOIS PAYÉS ─── */}
          <ZoneSection title="Mois payés" icon="✅">
            <div>
              <label style={S.label}>Dernier mois payé (clique sur les mois cochés)</label>
              <MonthYearPicker value={form.dernier_mois_paye} onChange={v => set('dernier_mois_paye', v)} years={[2024, 2025, 2026, 2027]} />
            </div>
            <div>
              <label style={S.label}>Prochain mois à payer</label>
              <MonthYearPicker value={form.prochain_mois_paye} onChange={v => set('prochain_mois_paye', v)} years={[2025, 2026, 2027]} />
            </div>
          </ZoneSection>

          {/* ─── ZONE 4 : FIN MISSION & PAIEMENTS ─── */}
          <ZoneSection title="Fin mission & Paiements" icon="🏁">
            <div>
              <label style={S.label}>Dates fin de mission (1 ou plusieurs, avec flag paiement par date)</label>
              <MultiDatePaiementInput values={form.dates_fin_mission} onChange={v => set('dates_fin_mission', v)} />
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>💡 Coche "Payé" sur chaque date dès que le paiement est effectué. Le statut global passe en "Terminé" quand toutes les dates sont payées. La 1ère date est synchronisée vers le suivi ALFA du même candidat.</div>
            </div>
            <div>
              <label style={S.label}>Année</label>
              <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={{ ...S.input, maxWidth: 200 }}>
                <option value={2026}>2026</option><option value={2025}>2025</option>
              </select>
            </div>
            {(() => {
              const pairs = form.dates_fin_mission.filter(x => x.date)
              const totalPayes = pairs.filter(p => p.paye).length
              const total = pairs.length
              const allPaid = total > 0 && totalPayes === total
              if (total === 0) return null
              return (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: allPaid ? 'rgba(34,197,94,0.10)' : 'rgba(234,179,8,0.08)', border: `1.5px solid ${allPaid ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.25)'}`, fontSize: 12, fontWeight: 700, color: allPaid ? '#16A34A' : '#CA8A04' }}>
                  {allPaid ? `✓ Tous les paiements sont effectués (${totalPayes}/${total})` : `⏳ ${totalPayes}/${total} paiement${total > 1 ? 's' : ''} effectué${totalPayes > 1 ? 's' : ''}`}
                </div>
              )
            })()}
          </ZoneSection>

          {/* ─── ZONE 5 : REMARQUES ─── */}
          <ZoneSection title="Remarques" icon="📝">
            <textarea value={form.remarques} onChange={e => set('remarques', e.target.value)} placeholder="Commentaires libres…" rows={3} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </ZoneSection>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={13} />}{item ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Modal Confirm Suppression ────────────────────────────────────────────────

function DeleteModal({ label, onConfirm, onClose }: { label: string; onConfirm: () => void; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const handleConfirm = async () => { setDeleting(true); await onConfirm(); setDeleting(false) }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={20} color="var(--destructive)" />
          <h2 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 20, fontWeight: 400, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>Confirmer la suppression</h2>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>Supprimer <strong style={{ color: 'var(--foreground)' }}>{label}</strong> ? Cette action est irréversible.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleConfirm} disabled={deleting} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--destructive)', border: 'none', color: 'var(--destructive-foreground)', fontSize: 13, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {deleting && <Loader2 size={13} />}Supprimer
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── MultiDateInput ───────────────────────────────────────────────────────────

function MultiDateInput({ values, onChange }: { values: string[]; onChange: (dates: string[]) => void }) {
  const addDate = () => onChange([...values, ''])
  const removeDate = (i: number) => onChange(values.filter((_, idx) => idx !== i))
  const updateDate = (i: number, v: string) => onChange(values.map((d, idx) => idx === i ? v : d))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {values.map((d, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="date" value={d} onChange={e => updateDate(i, e.target.value)} style={{ ...S.input, flex: 1, colorScheme: 'inherit' }} />
          {values.length > 1 && (
            <button onClick={() => removeDate(i)} type="button" style={{ padding: '4px 6px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: 'var(--destructive)', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      <button onClick={addDate} type="button" style={{ padding: '4px 10px', borderRadius: 6, background: 'none', border: '1.5px dashed var(--border)', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
        <Plus size={11} /> Ajouter une date
      </button>
    </div>
  )
}

// Parser sécurisé pour expressions math (ex: 1500+200-50*2)
// Accepte: chiffres, +-*/.,() et espaces. Refuse tout le reste.
function evalMathExpression(expr: string): number | null {
  if (!expr) return null
  const sanitized = expr.replace(/,/g, '.').replace(/\s+/g, '')
  if (!/^[\d+\-*/.()]+$/.test(sanitized)) return null
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${sanitized})`)()
    if (typeof result !== 'number' || !isFinite(result)) return null
    return Math.round(result * 100) / 100
  } catch { return null }
}

// Champ avec calcul direct : tape `1500+200-50*2` puis blur ou Enter → calcule.
function CalcInput({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState(false)
  useEffect(() => { setDraft(value) }, [value])
  const compute = () => {
    if (!draft.trim()) { onChange(''); setError(false); return }
    if (/^-?[\d.]+$/.test(draft.trim())) { onChange(draft.trim()); setError(false); return }
    const result = evalMathExpression(draft)
    if (result === null) { setError(true); return }
    setError(false)
    setDraft(String(result))
    onChange(String(result))
  }
  return (
    <input
      value={draft}
      onChange={e => { setDraft(e.target.value); setError(false) }}
      onBlur={compute}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); compute() } }}
      placeholder={placeholder || '1500+200…'}
      title="Tu peux taper une expression math (ex: 1500+200-50*2)"
      style={{ ...S.input, ...style, borderColor: error ? 'var(--destructive)' : (style as any)?.borderColor }}
    />
  )
}

// Calendrier mois/année multi-coche (stocke 'YYYY-MM,YYYY-MM,...').
function MonthYearPicker({ value, onChange, years, label }: { value: string; onChange: (v: string) => void; years?: number[]; label?: string }) {
  const selected = new Set((value || '').split(',').map(s => s.trim()).filter(Boolean))
  const yrs = years || [2025, 2026, 2027]
  const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
  const toggle = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    const ordered = Array.from(next).sort()
    onChange(ordered.join(','))
  }
  return (
    <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--card)' }}>
      {label && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>}
      {yrs.map(y => (
        <div key={y} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', width: 38 }}>{y}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2, flex: 1 }}>
            {mois.map((m, i) => {
              const key = `${y}-${String(i + 1).padStart(2, '0')}`
              const active = selected.has(key)
              return (
                <button key={key} type="button" onClick={() => toggle(key)} style={{
                  padding: '4px 0', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  background: active ? 'rgba(34,197,94,0.18)' : 'var(--secondary)',
                  color: active ? '#16A34A' : 'var(--muted)',
                  border: `1.5px solid ${active ? 'rgba(34,197,94,0.5)' : 'var(--border)'}`,
                }} title={`${m} ${y}`}>{m}</button>
              )
            })}
          </div>
        </div>
      ))}
      {selected.size > 0 && (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
          {selected.size} mois sélectionné{selected.size > 1 ? 's' : ''} — <button type="button" onClick={() => onChange('')} style={{ background: 'none', border: 'none', color: 'var(--destructive)', fontSize: 10, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Tout désélectionner</button>
        </div>
      )}
    </div>
  )
}

// Affiche les mois sélectionnés comme pills vertes
function MonthsDisplay({ raw }: { raw: string | null }) {
  if (!raw) return <span style={{ color: 'var(--muted)', fontSize: 10 }}>—</span>
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return <span style={{ color: 'var(--muted)', fontSize: 10 }}>—</span>
  const moisCourts = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {parts.map(p => {
        const [y, m] = p.split('-')
        const idx = parseInt(m, 10) - 1
        const label = (idx >= 0 && idx < 12) ? `${moisCourts[idx]} ${y?.slice(2) || ''}` : p
        return (
          <span key={p} style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.3)', whiteSpace: 'nowrap' }}>
            ✓ {label}
          </span>
        )
      })}
    </div>
  )
}

function MultiDatesDisplay({ raw }: { raw: string | null }) {
  if (!raw) return <span style={{ color: 'var(--muted)', fontSize: 10 }}>—</span>
  const parts = raw.split(',').map(d => d.trim()).filter(Boolean)
  if (parts.length === 0) return <span style={{ color: 'var(--muted)', fontSize: 10 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {parts.map((d, i) => (
        <span key={i} style={{ fontSize: 10, whiteSpace: 'nowrap', color: 'var(--foreground)' }}>{formatDate(d)}</span>
      ))}
    </div>
  )
}

// Parser tolerant pour dates avec flag paiement (format 'YYYY-MM-DD:1,YYYY-MM-DD:0')
// Tolère ancien format 'YYYY-MM-DD,YYYY-MM-DD' (paye=false par défaut).
function parseDatesPaye(val: string | null): Array<{ date: string; paye: boolean }> {
  if (!val) return [{ date: '', paye: false }]
  const parts = val.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return [{ date: '', paye: false }]
  return parts.map(p => {
    const [date, flag] = p.split(':')
    return { date: (date || '').trim(), paye: flag === '1' || flag === 'true' }
  })
}
function joinDatesPaye(arr: Array<{ date: string; paye: boolean }>): string | null {
  const clean = arr.filter(x => x.date && x.date.trim())
  if (clean.length === 0) return null
  return clean.map(x => `${x.date}:${x.paye ? '1' : '0'}`).join(',')
}

// Composant : multi-dates fin de mission avec checkbox "paiement terminé" par date
function MultiDatePaiementInput({ values, onChange }: { values: Array<{ date: string; paye: boolean }>; onChange: (v: Array<{ date: string; paye: boolean }>) => void }) {
  const addDate = () => onChange([...values, { date: '', paye: false }])
  const removeDate = (i: number) => onChange(values.filter((_, idx) => idx !== i))
  const updateDate = (i: number, date: string) => onChange(values.map((v, idx) => idx === i ? { ...v, date } : v))
  const togglePaye = (i: number) => onChange(values.map((v, idx) => idx === i ? { ...v, paye: !v.paye } : v))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {values.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: 6, borderRadius: 6, background: v.paye ? 'rgba(34,197,94,0.06)' : 'var(--secondary)', border: `1.5px solid ${v.paye ? 'rgba(34,197,94,0.25)' : 'var(--border)'}` }}>
          <input type="date" value={v.date} onChange={e => updateDate(i, e.target.value)} style={{ ...S.input, flex: 1, colorScheme: 'inherit', padding: '4px 8px' }} />
          <button type="button" onClick={() => togglePaye(i)} title={v.paye ? 'Marquer comme non payé' : 'Marquer comme payé'} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
            background: v.paye ? '#16A34A' : 'var(--secondary)',
            color: v.paye ? '#fff' : 'var(--muted)',
            border: `1.5px solid ${v.paye ? '#16A34A' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
          }}>
            {v.paye ? '✓ Payé' : '○ Non payé'}
          </button>
          {values.length > 1 && (
            <button onClick={() => removeDate(i)} type="button" style={{ padding: '4px 6px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: 'var(--destructive)', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      <button onClick={addDate} type="button" style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--secondary)', color: 'var(--primary)', border: '1.5px dashed var(--primary)', display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
        <Plus size={11} /> Ajouter une date fin de mission
      </button>
    </div>
  )
}

// Affichage dans la liste — pills date + ✓ Payé / ○ Non payé
function MultiDatesPaiementDisplay({ raw }: { raw: string | null }) {
  const pairs = parseDatesPaye(raw).filter(p => p.date)
  if (pairs.length === 0) return <span style={{ color: 'var(--muted)', fontSize: 10 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {pairs.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, whiteSpace: 'nowrap', color: 'var(--foreground)', fontWeight: 600 }}>{formatDate(p.date)}</span>
          <span style={{ padding: '0 5px', borderRadius: 4, fontSize: 9, fontWeight: 800, background: p.paye ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.10)', color: p.paye ? '#16A34A' : '#DC2626', border: `1px solid ${p.paye ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.25)'}`, whiteSpace: 'nowrap' }}>
            {p.paye ? '✓ Payé' : '○ Non payé'}
          </span>
        </div>
      ))}
    </div>
  )
}

function parseDates(val: string | null): string[] {
  if (!val) return ['']
  const parts = val.split(',').map(d => d.trim()).filter(Boolean)
  return parts.length > 0 ? parts : ['']
}

function joinDates(arr: string[]): string | null {
  const clean = arr.filter(d => d.trim())
  return clean.length > 0 ? clean.join(', ') : null
}

// ─── CandidatsTable ───────────────────────────────────────────────────────────

function DocBadge({ ok, label, note }: { ok: boolean; label: string; note?: string | null }) {
  const [showTip, setShowTip] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 })

  const handleEnter = () => {
    if (!note) return
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setTipPos({ top: r.top - 4, left: r.left + r.width / 2 })
    }
    setShowTip(true)
  }

  return (
    <>
      <span ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setShowTip(false)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '2px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700,
        background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
        color: ok ? '#22C55E' : 'var(--muted)',
        border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
        cursor: note ? 'help' : 'default',
      }}>
        {ok ? '✓' : '·'} {label}{note && <span style={{ fontSize: 8, opacity: 0.7 }}>ⓘ</span>}
      </span>
      {showTip && note && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', top: tipPos.top - 36, left: tipPos.left, transform: 'translateX(-50%)', zIndex: 99999, background: 'var(--foreground)', color: 'var(--background)', padding: '5px 10px', borderRadius: 8, fontSize: 11, maxWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', pointerEvents: 'none', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
          {note}
        </div>,
        document.body
      )}
    </>
  )
}

function PermisBadge({ genre, dateEcheance, note }: { genre: string | null; dateEcheance: string | null; note?: string | null }) {
  const color = getPermisColor(dateEcheance)
  const colorMap = {
    green: { bg: 'rgba(34,197,94,0.12)', fg: '#22C55E', border: 'rgba(34,197,94,0.3)' },
    yellow: { bg: 'rgba(234,179,8,0.12)', fg: '#CA8A04', border: 'rgba(234,179,8,0.3)' },
    red: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444', border: 'rgba(239,68,68,0.3)' },
    gray: { bg: 'rgba(100,116,139,0.08)', fg: 'var(--muted)', border: 'var(--border)' },
  }
  const c = colorMap[color]
  const [showTip, setShowTip] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 })
  const handleEnter = () => {
    if (!note) return
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setTipPos({ top: r.top - 4, left: r.left + r.width / 2 })
    }
    setShowTip(true)
  }
  return (
    <>
      <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setShowTip(false)} style={{ display: 'flex', flexDirection: 'column', gap: 2, cursor: note ? 'help' : 'default' }}>
        {genre && <span style={{ padding: '2px 7px', borderRadius: 99, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, border: `1px solid ${c.border}`, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{genre}{note && <span style={{ fontSize: 8, opacity: 0.7 }}>ⓘ</span>}</span>}
        {dateEcheance && <span style={{ fontSize: 12, color: c.fg, fontWeight: 700 }}>{formatDate(dateEcheance)}</span>}
        {!genre && !dateEcheance && <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
      </div>
      {showTip && note && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', top: tipPos.top - 36, left: tipPos.left, transform: 'translateX(-50%)', zIndex: 99999, background: 'var(--foreground)', color: 'var(--background)', padding: '5px 10px', borderRadius: 8, fontSize: 11, maxWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', pointerEvents: 'none', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
          {note}
        </div>,
        document.body
      )}
    </>
  )
}

function CandidatsTable({ candidats, onEdit, onDelete, onColorChange, onModeChange, alfaCandidatIds, onGoToAlfa, onCreateAlfa, onToggleArchive }: {
  candidats: SecretariatCandidat[]
  onEdit: (c: SecretariatCandidat) => void
  onDelete: (c: SecretariatCandidat) => void
  onColorChange: (id: string, color: string) => void
  onModeChange: (id: string, mode: string) => void
  alfaCandidatIds: Set<string>
  onGoToAlfa: () => void
  onCreateAlfa: (c: SecretariatCandidat) => void
  onToggleArchive: (c: SecretariatCandidat) => void
}) {
  const [sort, setSort] = useState<{ col: string; dir: SortDir }>({ col: '', dir: null })

  if (candidats.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
        <User size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
        <div style={{ fontSize: 14 }}>Aucun candidat pour cette année</div>
      </div>
    )
  }

  const toggleSort = (col: string) => setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc' } : { col, dir: 'asc' })

  const getVal = (c: SecretariatCandidat, col: string): string => {
    if (col === 'nom') return `${c.nom} ${c.prenom}`.trim()
    if (col === 'permis') return c.genre_permis || '—'
    if (col === 'enfants') return c.enfants_charge === 'oui' ? 'Oui' : c.enfants_charge === 'non' ? 'Non' : '?'
    return ''
  }

  let displayed = [...candidats]

  if (sort.dir && sort.col) {
    displayed = [...displayed].sort((a, b) => {
      const va = getVal(a, sort.col).toLowerCase()
      const vb = getVal(b, sort.col).toLowerCase()
      return sort.dir === 'desc' ? vb.localeCompare(va, 'fr') : va.localeCompare(vb, 'fr')
    })
  }

  const thStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <SortableHeader label="Candidat" sortDir={sort.col === 'nom' ? sort.dir : null} onSort={() => toggleSort('nom')} style={thStyle} />
            <th style={thStyle}>N° Quad</th>
            <SortableHeader label="Permis" sortDir={sort.col === 'permis' ? sort.dir : null} onSort={() => toggleSort('permis')} style={thStyle} />
            <SortableHeader label="Enfants" sortDir={sort.col === 'enfants' ? sort.dir : null} onSort={() => toggleSort('enfants')} style={thStyle} />
            <th style={thStyle}>Documents</th>
            <th style={thStyle}>Mission</th>
            <th style={thStyle}>💰 Paiement</th>
            <th style={thStyle}>Remarques</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {displayed.map(c => {
            const telCleaned = cleanPhone(c.tel || null)
            const isMissionTerminee = !!c.is_mission_terminee
            const isArchive = !!c.archive
            const userColor = ROW_COLORS.find(rc => rc.key === (c.couleur || ''))?.bg
            const rowBg = userColor || (isArchive ? 'rgba(107,114,128,0.08)' : isMissionTerminee ? '#FEE2E2' : 'transparent')
            const hasAlfa = c.candidat_id ? alfaCandidatIds.has(c.candidat_id) : false
            const typeDemandeLabel = c.type_demande === 'renouvellement' ? '🔄 Renouv.'
              : c.type_demande === 'changement_employeur' ? '🔁 Chgmt empl.'
              : c.type_demande === 'premiere' ? '✨ 1ère Dem.'
              : null
            const typeDemandeColor = c.type_demande === 'renouvellement' ? { bg: 'rgba(99,102,241,0.10)', fg: '#6366F1', border: 'rgba(99,102,241,0.25)' }
              : c.type_demande === 'changement_employeur' ? { bg: 'rgba(234,179,8,0.10)', fg: '#CA8A04', border: 'rgba(234,179,8,0.25)' }
              : c.type_demande === 'premiere' ? { bg: 'rgba(34,197,94,0.10)', fg: '#16A34A', border: 'rgba(34,197,94,0.25)' }
              : null
            return (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s', background: rowBg, opacity: isArchive ? 0.65 : 1 }}
                onMouseEnter={e => { if (!c.couleur && !isMissionTerminee && !isArchive) e.currentTarget.style.background = 'var(--secondary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
              >
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {c.photo_url && c.photo_url !== 'checked'
                      ? <Image src={c.photo_url} alt="" width={44} height={44} unoptimized style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>{getInitiales(c.nom, c.prenom)}</div>
                    }
                    <div>
                      {c.candidat_id
                        ? <a href={`/candidats/${c.candidat_id}?from=secretariat`} style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', textDecoration: 'none' }} title="Voir fiche">{c.nom} {c.prenom}</a>
                        : <span style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>{c.nom} {c.prenom}</span>
                      }
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        {telCleaned && <a href={`https://wa.me/${telCleaned}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 5, background: 'rgba(37,211,102,0.1)', color: '#25D366', fontSize: 9, fontWeight: 600, textDecoration: 'none' }}><WaIcon size={9} /> WA</a>}
                        {c.email && <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 5, background: 'rgba(99,102,241,0.1)', color: '#6366F1', fontSize: 9, fontWeight: 600, textDecoration: 'none' }}><Mail size={8} /> Mail</a>}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 10px' }}><span style={{ color: c.numero_quadrigis ? 'var(--foreground)' : 'var(--muted)', fontSize: 12, fontWeight: c.numero_quadrigis ? 600 : 400 }}>{c.numero_quadrigis || '—'}</span></td>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                    {c.suisse && <span style={{ padding: '2px 6px', borderRadius: 99, fontSize: 9, fontWeight: 800, background: 'rgba(220,38,38,0.1)', color: 'var(--destructive)', border: '1px solid rgba(220,38,38,0.25)', whiteSpace: 'nowrap' }}>🇨🇭 CH</span>}
                    <PermisBadge genre={c.genre_permis} dateEcheance={c.date_echeance_permis} note={c.permis_note} />
                    {(c.lieu_demande || c.date_demande) && (
                      <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {c.lieu_demande ? `📍 ${c.lieu_demande}` : ''}
                        {c.lieu_demande && c.date_demande ? ' · ' : ''}
                        {c.date_demande ? formatDate(c.date_demande) : ''}
                      </span>
                    )}
                    {typeDemandeLabel && typeDemandeColor && (
                      <span style={{ padding: '1px 6px', borderRadius: 99, fontSize: 9, fontWeight: 800, background: typeDemandeColor.bg, color: typeDemandeColor.fg, border: `1px solid ${typeDemandeColor.border}`, whiteSpace: 'nowrap' }}>{typeDemandeLabel}</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c.enfants_charge === 'oui' ? '#22C55E' : c.enfants_charge === 'oui_pas_a_charge' ? '#9CA3AF' : c.enfants_charge === 'non' ? 'var(--muted)' : '#F59E0B', whiteSpace: 'nowrap' }}>
                      {c.enfants_charge === 'oui' ? '👶 Oui'
                        : c.enfants_charge === 'oui_pas_a_charge' ? '👶 Pas à charge'
                        : c.enfants_charge === 'non' ? 'Non'
                        : '?'}
                    </span>
                    {c.enfants_charge === 'oui' && (
                      <button
                        onClick={() => hasAlfa ? onGoToAlfa() : onCreateAlfa(c)}
                        title={hasAlfa ? 'Voir onglet ALFA' : 'Créer fiche ALFA pré-remplie'}
                        style={{ padding: '1px 6px', borderRadius: 5, fontSize: 9, fontWeight: 800, cursor: 'pointer', background: hasAlfa ? 'rgba(99,102,241,0.12)' : 'rgba(234,179,8,0.12)', color: hasAlfa ? '#6366F1' : '#CA8A04', border: `1px solid ${hasAlfa ? 'rgba(99,102,241,0.3)' : 'rgba(234,179,8,0.3)'}` }}>
                        {hasAlfa ? '✓ ALFA' : '+ ALFA'}
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    <DocBadge ok={c.has_cv} label="CV" />
                    <DocBadge ok={c.has_cm} label="CM" />
                    <DocBadge ok={!!c.carte_id} label="ID" />
                    <DocBadge ok={!!c.numero_avs} label="AVS" />
                    <DocBadge ok={!!c.iban} label="IBAN" />
                    <DocBadge ok={c.has_docs_clients} label="Docs Client" note={c.docs_clients_note} />
                    <DocBadge ok={c.mappe} label="Mappe" />
                    <DocBadge ok={!!c.has_permis_conduire} label="Permis C." />
                  </div>
                </td>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                    {isArchive && (
                      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 800, background: '#6B7280', color: '#fff', whiteSpace: 'nowrap' }}>📦 Archivé</span>
                    )}
                    {isMissionTerminee ? (
                      <>
                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 800, background: '#DC2626', color: '#fff', whiteSpace: 'nowrap' }}>🏁 Mission terminée</span>
                        {c.date_fin_mission && <span style={{ fontSize: 11, fontWeight: 700, color: '#7F1D1D', whiteSpace: 'nowrap' }}>Fin : {formatDate(c.date_fin_mission)}</span>}
                      </>
                    ) : c.date_mission ? (
                      <>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>📅 {formatDate(c.date_mission)}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.12)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)', whiteSpace: 'nowrap' }}>● Active</span>
                      </>
                    ) : !isArchive ? (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                    ) : null}
                  </div>
                </td>
                <td style={{ padding: '10px 10px' }}>
                  {!isMissionTerminee && !isArchive ? (
                    <select
                      value={c.mode_paiement || ''}
                      onChange={e => onModeChange(c.id, e.target.value)}
                      title="Mode de paiement — une notification email est envoyée au candidat 2 jours avant chaque versement"
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '5px 6px', borderRadius: 6, cursor: 'pointer', maxWidth: 150,
                        background: c.mode_paiement === 'calendrier_mensuel' ? 'rgba(220,38,38,0.10)' : c.mode_paiement === 'mensuel' ? 'rgba(5,150,105,0.10)' : c.mode_paiement === 'hebdomadaire' ? 'rgba(37,99,235,0.10)' : 'var(--secondary)',
                        color: c.mode_paiement === 'calendrier_mensuel' ? '#DC2626' : c.mode_paiement === 'mensuel' ? '#059669' : c.mode_paiement === 'hebdomadaire' ? '#2563EB' : 'var(--muted)',
                        border: `1.5px solid ${c.mode_paiement === 'calendrier_mensuel' ? 'rgba(220,38,38,0.3)' : c.mode_paiement === 'mensuel' ? 'rgba(5,150,105,0.3)' : c.mode_paiement === 'hebdomadaire' ? 'rgba(37,99,235,0.3)' : 'var(--border)'}`,
                      }}
                    >
                      <option value="">— À définir —</option>
                      <option value="calendrier_mensuel">🔴 Cal. mensuel</option>
                      <option value="mensuel">🟢 Mensuel</option>
                      <option value="hebdomadaire">🔵 Hebdo</option>
                    </select>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '10px 10px', maxWidth: 200 }}>
                  {c.remarques ? <div title={c.remarques} onClick={e => { const el = e.currentTarget; if (el.style.whiteSpace === 'normal') { el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis' } else { el.style.whiteSpace = 'normal'; el.style.overflow = 'visible'; el.style.textOverflow = 'unset' } }} style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', lineHeight: 1.4 }}>{c.remarques}</div> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <ColorPicker currentColor={c.couleur || null} onChange={color => onColorChange(c.id, color)} />
                    <button onClick={() => onToggleArchive(c)}
                      title={isArchive ? 'Désarchiver' : 'Archiver'}
                      style={{ padding: '5px 8px', borderRadius: 6, background: isArchive ? 'rgba(107,114,128,0.18)' : 'none', border: `1.5px solid ${isArchive ? 'rgba(107,114,128,0.4)' : 'var(--border)'}`, color: isArchive ? '#4B5563' : 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: 12 }}>
                      📦
                    </button>
                    <button onClick={() => onEdit(c)} title="Modifier" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={13} /></button>
                    <button onClick={() => onDelete(c)} title="Supprimer" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: 'var(--destructive)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── AccidentsTable ───────────────────────────────────────────────────────────

function AccidentsTable({ accidents, onEdit, onDelete, onArchive }: { accidents: SecretariatAccident[]; onEdit: (a: SecretariatAccident) => void; onDelete: (a: SecretariatAccident) => void; onArchive: (a: SecretariatAccident) => void }) {
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [sortAss, setSortAss] = useState<'recent' | 'ancien' | null>(null)

  if (accidents.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
        <AlertCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
        <div style={{ fontSize: 14 }}>Aucun cas pour cette année</div>
      </div>
    )
  }

  let displayed = [...accidents]

  if (sortAss) {
    displayed = [...displayed].sort((a, b) => {
      const da = a.assurance_payee_jusqu_au || ''
      const db = b.assurance_payee_jusqu_au || ''
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return sortAss === 'recent' ? db.localeCompare(da) : da.localeCompare(db)
    })
  } else if (sortDir) {
    displayed = [...displayed].sort((a, b) => {
      const va = (a.nom_prenom || '').toLowerCase()
      const vb = (b.nom_prenom || '').toLowerCase()
      return sortDir === 'desc' ? vb.localeCompare(va, 'fr') : va.localeCompare(vb, 'fr')
    })
  }

  const thStyle: React.CSSProperties = { padding: '8px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1.5px solid var(--border)' }
  const tdStyle: React.CSSProperties = { padding: '7px 6px', fontSize: 11, color: 'var(--foreground)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }

  const fmtDate = (d: string | null) => d ? d.split('-').reverse().join('.') : '—'

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => { setSortDir(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'); setSortAss(null) }} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: sortDir ? 'var(--primary)' : 'var(--secondary)', color: sortDir ? 'var(--primary-foreground)' : 'var(--muted)', border: `1.5px solid ${sortDir ? 'var(--primary)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 3 }}>
          {sortDir === 'asc' ? <ArrowUp size={10} /> : sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUpDown size={10} />} Nom
        </button>
        <button onClick={() => { setSortAss(prev => prev === 'recent' ? 'ancien' : prev === 'ancien' ? null : 'recent'); setSortDir(null) }} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: sortAss ? 'rgba(34,197,94,0.15)' : 'var(--secondary)', color: sortAss ? '#16A34A' : 'var(--muted)', border: `1.5px solid ${sortAss ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 3 }}>
          {sortAss === 'recent' ? <ArrowDown size={10} /> : sortAss === 'ancien' ? <ArrowUp size={10} /> : <ArrowUpDown size={10} />} Ass.
        </button>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{displayed.length} cas</span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Candidat</th>
              <th style={thStyle}>Type / Statut</th>
              <th style={thStyle}>Raison</th>
              <th style={thStyle}>N° Sinistre</th>
              <th style={thStyle}>Début</th>
              <th style={thStyle}>Fin</th>
              <th style={{ ...thStyle, color: '#16A34A' }}>Ass. jusqu'au</th>
              <th style={thStyle}>Licenciement</th>
              <th style={thStyle}>Décision</th>
              <th style={thStyle}>Note / Remarque</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(a => (
              <tr key={a.id} style={{ opacity: a.archive ? 0.55 : 1 }}>
                {/* Candidat */}
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {a.photo_url && a.photo_url !== 'checked'
                      ? <Image src={a.photo_url} alt="" width={32} height={32} unoptimized style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                          {(a.nom_prenom || '?').split(' ').slice(0, 2).map((w: string) => w[0] || '').join('').toUpperCase()}
                        </div>
                    }
                    <div>
                      {a.candidat_id
                        ? <a href={`/candidats/${a.candidat_id}?from=secretariat`} style={{ fontWeight: 700, fontSize: 12, color: 'var(--foreground)', textDecoration: 'none' }}>{a.nom_prenom}</a>
                        : <span style={{ fontWeight: 700, fontSize: 12 }}>{a.nom_prenom}</span>
                      }
                    </div>
                  </div>
                </td>
                {/* Type / Statut */}
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <span style={{ padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                        background: a.type_cas === 'Accident' ? 'rgba(239,68,68,0.12)' : a.type_cas === 'Bagatelle' ? 'rgba(249,115,22,0.12)' : 'rgba(234,179,8,0.12)',
                        color: a.type_cas === 'Accident' ? '#EF4444' : a.type_cas === 'Bagatelle' ? '#EA580C' : '#CA8A04' }}>
                        {a.type_cas}
                      </span>
                      {a.sous_type && <span style={{ padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>{a.sous_type}</span>}
                    </div>
                    <span style={{ padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700, width: 'fit-content',
                      background: a.statut_cas === 'termine' ? 'rgba(34,197,94,0.12)' : a.statut_cas === 'nouveau' ? 'rgba(99,102,241,0.12)' : 'rgba(6,182,212,0.12)',
                      color: a.statut_cas === 'termine' ? '#22C55E' : a.statut_cas === 'nouveau' ? '#818CF8' : '#06B6D4' }}>
                      {a.statut_cas === 'termine' ? '✓ Terminé' : a.statut_cas === 'nouveau' ? '◆ Nouveau' : '● En cours'}
                    </span>
                  </div>
                </td>
                {/* Raison */}
                <td style={{ ...tdStyle, maxWidth: 140 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={a.raison || ''}>{a.raison || '—'}</span>
                </td>
                {/* N° Sinistre */}
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11 }}>{a.numero_sinistre || '—'}</span>
                </td>
                {/* Début */}
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11 }}>{fmtDate(a.date_debut)}</span>
                </td>
                {/* Fin */}
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11 }}>{fmtDate(a.date_fin)}</span>
                </td>
                {/* Ass. jusqu'au */}
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  {a.assurance_payee_jusqu_au
                    ? <span style={{ fontSize: 13, fontWeight: 800, color: '#16A34A' }}>{fmtDate(a.assurance_payee_jusqu_au)}</span>
                    : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
                  }
                </td>
                {/* Licenciement */}
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11 }}>{fmtDate(a.licenciement_pour_le)}</span>
                </td>
                {/* Décision */}
                <td style={{ ...tdStyle, maxWidth: 140 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }} title={a.decision || ''}>{a.decision || '—'}</span>
                </td>
                {/* Note / Remarque */}
                <td style={{ ...tdStyle, maxWidth: 160 }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={[a.note, a.remarque].filter(Boolean).join(' | ')}>
                    {[a.note, a.remarque].filter(Boolean).join(' | ') || '—'}
                  </span>
                </td>
                {/* Actions */}
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => onEdit(a)} title="Modifier" style={{ padding: '4px 7px', borderRadius: 6, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={12} /></button>
                    <button onClick={() => onDelete(a)} title="Supprimer" style={{ padding: '4px 7px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: 'var(--destructive)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── AlfaTable ────────────────────────────────────────────────────────────────

function AlfaTable({ rows, onEdit, onDelete, onColorChange }: { rows: SecretariatAlfa[]; onEdit: (a: SecretariatAlfa) => void; onDelete: (a: SecretariatAlfa) => void; onColorChange: (id: string, color: string) => void }) {
  const [sort, setSort] = useState<{ col: string; dir: SortDir }>({ col: '', dir: null })

  if (rows.length === 0) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucune entrée ALFA pour cette année.</div>
  }

  const toggleSort = (col: string) => setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc' } : { col, dir: 'asc' })

  const getVal = (a: SecretariatAlfa, col: string): string => {
    if (col === 'nom') return `${a.nom} ${a.prenom}`.trim()
    if (col === 'lieu') return a.lieu_enfants || ''
    if (col === 'consimo') return a.consimo || ''
    if (col === 'termine') return a.raf ? 'RAF' : a.termine ? 'Terminé' : 'En cours'
    if (col === 'mere') return a.mere_touche || ''
    return ''
  }

  let displayed = [...rows]

  if (sort.dir && sort.col) {
    displayed = [...displayed].sort((a, b) => {
      const va = getVal(a, sort.col).toLowerCase()
      const vb = getVal(b, sort.col).toLowerCase()
      const cmp = va.localeCompare(vb, 'fr')
      return sort.dir === 'desc' ? -cmp : cmp
    })
  }

  const thStyle: React.CSSProperties = { padding: '8px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1.5px solid var(--border)' }
  const tdStyle: React.CSSProperties = { padding: '6px 6px', fontSize: 11, color: 'var(--foreground)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: 1400, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortableHeader label="Nom Prénom" sortDir={sort.col === 'nom' ? sort.dir : null} onSort={() => toggleSort('nom')} style={thStyle} />
            <th style={thStyle}>Enf.</th>
            <th style={thStyle}>Barème IS</th>
            <th style={thStyle}>Début</th>
            <th style={thStyle}>Fin</th>
            <th style={thStyle}>Rad. CAF</th>
            <th style={thStyle}>Rad. reçue</th>
            <SortableHeader label="Mère touche" sortDir={sort.col === 'mere' ? sort.dir : null} onSort={() => toggleSort('mere')} style={thStyle} />
            <th style={thStyle}>Dem. env.</th>
            <th style={thStyle}>Réact. env.</th>
            <SortableHeader label="Lieu enf." sortDir={sort.col === 'lieu' ? sort.dir : null} onSort={() => toggleSort('lieu')} style={thStyle} />
            <SortableHeader label="Consimo" sortDir={sort.col === 'consimo' ? sort.dir : null} onSort={() => toggleSort('consimo')} style={thStyle} />
            <SortableHeader label="Statut" sortDir={sort.col === 'termine' ? sort.dir : null} onSort={() => toggleSort('termine')} style={thStyle} />
            <th style={thStyle}>Remarques</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {displayed.map(a => (
            <tr key={a.id} style={{ background: a.couleur ? (ROW_COLORS.find(c => c.key === a.couleur)?.bg || 'transparent') : (a.raf ? 'rgba(234,179,8,0.08)' : a.termine ? 'rgba(34,197,94,0.10)' : 'transparent') }}>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                <div>
                  {a.candidat_id
                    ? <a href={`/candidats/${a.candidat_id}?from=secretariat`} style={{ fontWeight: 700, fontSize: 12, color: 'var(--foreground)', textDecoration: 'none' }} title="Voir fiche">{a.nom} {a.prenom}</a>
                    : <span style={{ fontWeight: 700, fontSize: 12, cursor: 'pointer' }} onClick={() => onEdit(a)} title="Modifier">{a.nom} {a.prenom}</span>
                  }
                  {a.numero_avs && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{a.numero_avs}</div>}
                </div>
              </td>
              <td style={{ ...tdStyle, textAlign: 'center' }}><span style={{ fontWeight: 700 }}>{a.nbr_enfants ?? '—'}</span></td>
              <td style={tdStyle}><span style={{ fontSize: 11 }}>{a.bareme_is || '—'}</span></td>
              <td style={tdStyle}><MultiDatesDisplay raw={a.date_debut_alfa} /></td>
              <td style={tdStyle}><MultiDatesDisplay raw={a.date_fin_alfa} /></td>
              <td style={tdStyle}><MultiDatesDisplay raw={a.date_radiation_caf} /></td>
              <td style={tdStyle}><MultiDatesDisplay raw={a.radiation_recue} /></td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.mere_touche || '—'}</span></td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.demande_envoyee || '—'}</span></td>
              <td style={tdStyle}><MultiDatesDisplay raw={a.reactivation_envoyee} /></td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.lieu_enfants || '—'}</span></td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.consimo || '—'}</span></td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                {a.raf
                  ? <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(234,179,8,0.15)', color: '#CA8A04', border: '1px solid rgba(234,179,8,0.3)', whiteSpace: 'nowrap' }}>⏳ RAF</span>
                  : a.termine
                    ? <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)', whiteSpace: 'nowrap' }}>✓ Terminé</span>
                    : <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', whiteSpace: 'nowrap' }}>● En cours</span>
                }
              </td>
              <td style={{ ...tdStyle, maxWidth: 160 }}>
                {a.remarques ? (
                  <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', lineHeight: 1.4 }}
                    title={a.remarques} onClick={e => { const el = e.currentTarget; if (el.style.whiteSpace === 'normal') { el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis' } else { el.style.whiteSpace = 'normal'; el.style.overflow = 'visible'; el.style.textOverflow = 'unset' } }}
                  >{a.remarques}</div>
                ) : <span style={{ color: 'var(--muted)', fontSize: 10 }}>—</span>}
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: 3 }}>
                  <ColorPicker currentColor={a.couleur || null} onChange={color => onColorChange(a.id, color)} />
                  <button onClick={() => onEdit(a)} title="Modifier" style={{ padding: '4px 6px', borderRadius: 6, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={12} /></button>
                  <button onClick={() => onDelete(a)} title="Supprimer" style={{ padding: '4px 6px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: 'var(--destructive)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── AlfaPaiementsTable ────────────────────────────────────────────────────────

function AlfaPaiementsTable({ rows, onEdit, onDelete, onColorChange }: { rows: SecretariatAlfaPaiement[]; onEdit: (a: SecretariatAlfaPaiement) => void; onDelete: (a: SecretariatAlfaPaiement) => void; onColorChange: (id: string, color: string) => void }) {
  const [sort, setSort] = useState<{ col: string; dir: SortDir }>({ col: '', dir: null })

  if (rows.length === 0) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun paiement ALFA pour cette année.</div>
  }

  const toggleSort = (col: string) => setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc' } : { col, dir: 'asc' })

  const getVal = (a: SecretariatAlfaPaiement, col: string): string => {
    if (col === 'nom') return `${a.nom} ${a.prenom}`.trim()
    if (col === 'statut') return a.statut_termine ? 'Terminé' : 'En cours'
    if (col === 'periode') return a.annee_periode || '—'
    return ''
  }

  let displayed = [...rows]

  if (sort.dir && sort.col) {
    displayed = [...displayed].sort((a, b) => {
      if (sort.col === 'montant') return sort.dir === 'desc' ? (b.montant_alfa_paye || 0) - (a.montant_alfa_paye || 0) : (a.montant_alfa_paye || 0) - (b.montant_alfa_paye || 0)
      const va = getVal(a, sort.col).toLowerCase()
      const vb = getVal(b, sort.col).toLowerCase()
      return sort.dir === 'desc' ? vb.localeCompare(va, 'fr') : va.localeCompare(vb, 'fr')
    })
  }

  const thStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1.5px solid var(--border)' }
  const tdStyle: React.CSSProperties = { padding: '9px 10px', fontSize: 12, color: 'var(--foreground)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: 1280, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortableHeader label="Nom / Prénom" sortDir={sort.col === 'nom' ? sort.dir : null} onSort={() => toggleSort('nom')} style={thStyle} />
            <th style={thStyle}>Enfants</th>
            <th style={thStyle}>Droit / mois</th>
            <SortableHeader label="Montant payé" sortDir={sort.col === 'montant' ? sort.dir : null} onSort={() => toggleSort('montant')} style={thStyle} />
            <SortableHeader label="Période" sortDir={sort.col === 'periode' ? sort.dir : null} onSort={() => toggleSort('periode')} style={thStyle} />
            <th style={thStyle}>Dernier mois</th>
            <th style={thStyle}>Prochain mois</th>
            <th style={thStyle}>Fin mission</th>
            <th style={thStyle}>Remarques</th>
            <SortableHeader label="Statut" sortDir={sort.col === 'statut' ? sort.dir : null} onSort={() => toggleSort('statut')} style={thStyle} />
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {displayed.map(a => {
            const rowBg = ROW_COLORS.find(c => c.key === (a.couleur || ''))?.bg || 'transparent'
            return (
              <tr key={a.id} style={{ background: rowBg !== 'transparent' ? rowBg : (a.statut_termine ? 'rgba(34,197,94,0.06)' : 'transparent') }}>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {(a as any).photo_url && (a as any).photo_url !== 'checked'
                      ? <Image src={(a as any).photo_url} alt="" width={44} height={44} unoptimized style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>{`${(a.nom || '')[0] || ''}${(a.prenom || '')[0] || ''}`.toUpperCase()}</div>
                    }
                    <div>
                      {a.candidat_id
                        ? <a href={`/candidats/${a.candidat_id}?from=secretariat`} style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)', textDecoration: 'none' }} title="Voir fiche">{a.nom} {a.prenom}</a>
                        : <span style={{ fontWeight: 700, fontSize: 13 }}>{a.nom} {a.prenom}</span>
                      }
                      {a.numero_avs && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{a.numero_avs}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}><span style={{ fontWeight: 700 }}>{a.nbr_enfants ?? '—'}</span></td>
                <td style={tdStyle}>{a.droit_chf_mois != null ? <span style={{ fontWeight: 700, color: 'var(--info)' }}>{formatCHF(a.droit_chf_mois)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td style={tdStyle}>{a.montant_alfa_paye != null ? <span style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCHF(a.montant_alfa_paye)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td style={tdStyle}><span style={{ fontSize: 11 }}>{a.annee_periode || '—'}</span></td>
                <td style={tdStyle}><MonthsDisplay raw={a.dernier_mois_paye} /></td>
                <td style={tdStyle}><MonthsDisplay raw={a.prochain_mois_paye} /></td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}><MultiDatesPaiementDisplay raw={a.dates_fin_mission || a.date_fin_mission} /></td>
                <td style={{ ...tdStyle, maxWidth: 200 }}>
                  {a.remarques ? <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', lineHeight: 1.4 }} title={a.remarques} onClick={e => { const el = e.currentTarget; if (el.style.whiteSpace === 'normal') { el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis' } else { el.style.whiteSpace = 'normal'; el.style.overflow = 'visible'; el.style.textOverflow = 'unset' } }}>{a.remarques}</div> : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {a.statut_termine
                    ? <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)', whiteSpace: 'nowrap' }}>✓ Terminé</span>
                    : <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(99,102,241,0.12)', color: '#818CF8', whiteSpace: 'nowrap' }}>● En cours</span>
                  }
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <ColorPicker currentColor={a.couleur || null} onChange={color => onColorChange(a.id, color)} />
                    <button onClick={() => onEdit(a)} title="Modifier" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={13} /></button>
                    <button onClick={() => onDelete(a)} title="Supprimer" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: 'var(--destructive)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Alert Modal (Ajouter une alerte manuelle) ────────────────────────────────

const ALERT_TYPES = [
  { value: 'doc_manquant', label: '📋 Document manquant' },
  { value: 'permis_urgent', label: '🔴 Permis urgent' },
  { value: 'sinistre_suivi', label: '🏥 Sinistre à suivre' },
  { value: 'message', label: '💬 Message entre secrétaires' },
  { value: 'autre', label: '⚠️ Autre' },
]

function AlertModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    type: 'message',
    titre: '',
    message: '',
    candidat_id: null as string | null,
    candidat_nom: '',
    urgence: 'normale' as 'normale' | 'urgente',
    date_rappel: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.titre.trim()) { toast.error('Titre requis'); return }
    if (!form.message.trim()) { toast.error('Message requis'); return }
    setSaving(true)
    try {
      // Récupérer l'utilisateur courant pour created_by
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const res = await fetch('/api/secretariat/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          titre: form.titre.trim(),
          message: form.message.trim(),
          candidat_id: form.candidat_id || null,
          urgence: form.urgence,
          date_rappel: form.date_rappel || null,
          created_by: user?.id || null,
          created_by_nom: user?.user_metadata?.nom
            ? `${user.user_metadata.prenom || ''} ${user.user_metadata.nom}`.trim()
            : user?.email || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur')
      toast.success('Alerte créée')
      onSaved()
      onClose()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 22, fontWeight: 400, color: 'var(--foreground)', letterSpacing: '-0.01em', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={18} color="var(--primary)" /> Nouvelle alerte
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Type */}
          <div>
            <label style={S.label}>Type d'alerte</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={S.input}>
              {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Titre */}
          <div>
            <label style={S.label}>Titre *</label>
            <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} placeholder="Ex: Rappel visite médicale" style={S.input} />
          </div>

          {/* Message */}
          <div>
            <label style={S.label}>Message *</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Détails de l'alerte…" rows={3} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* Candidat optionnel */}
          <div>
            <label style={S.label}>Candidat concerné (optionnel)</label>
            <CandidatAutocomplete
              value={form.candidat_nom}
              onChange={(nom, id) => setForm(f => ({ ...f, candidat_nom: nom, candidat_id: id }))}
            />
          </div>

          {/* Date de rappel */}
          <div>
            <label style={S.label}>Date & heure de rappel (optionnel)</label>
            <input type="datetime-local" value={form.date_rappel} onChange={e => setForm(f => ({ ...f, date_rappel: e.target.value }))} style={S.input} />
          </div>

          {/* Urgence */}
          <div>
            <label style={S.label}>Urgence</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['normale', 'urgente'] as const).map(u => (
                <button key={u} onClick={() => setForm(f => ({ ...f, urgence: u }))} style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: form.urgence === u ? (u === 'urgente' ? 'rgba(239,68,68,0.12)' : 'var(--primary-soft)') : 'var(--secondary)',
                  color: form.urgence === u ? (u === 'urgente' ? '#EF4444' : 'var(--primary)') : 'var(--muted)',
                  border: `1.5px solid ${form.urgence === u ? (u === 'urgente' ? 'rgba(239,68,68,0.4)' : 'var(--primary)') : 'var(--border)'}`,
                }}>
                  {u === 'normale' ? '🟢 Normale' : '🔴 Urgente'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={13} />} Créer l'alerte
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', height: 36, borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 7,
      background: active ? 'var(--primary)' : 'var(--surface, var(--card))',
      color: active ? '#1C1A14' : 'var(--muted)',
      border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
      transition: 'all 0.15s',
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      lineHeight: 1,
    }}>
      {children}
      {count !== undefined && count > 0 && (
        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: active ? 'rgba(28,26,20,0.18)' : 'var(--secondary)', color: active ? '#1C1A14' : 'var(--muted)', minWidth: 20, textAlign: 'center' }}>
          {count}
        </span>
      )}
    </button>
  )
}

// ─── Panneau filtres avancés candidats ────────────────────────────────────────

type AdvFilters = {
  permis: string[]
  enfants: string[]
  type_demande: string[]
  has_cv: 'tous' | 'oui' | 'non'
  has_cm: 'tous' | 'oui' | 'non'
  has_docs_clients: 'tous' | 'oui' | 'non'
  has_permis_conduire: 'tous' | 'oui' | 'non'
  mappe: 'tous' | 'oui' | 'non'
  has_avs: 'tous' | 'oui' | 'non'
  has_iban: 'tous' | 'oui' | 'non'
  has_carte_id: 'tous' | 'oui' | 'non'
  suisse: 'tous' | 'oui' | 'non'
  has_quadrigis: 'tous' | 'oui' | 'non'
}

function AdvancedFiltersPanel({ filters, setFilters }: { filters: AdvFilters; setFilters: React.Dispatch<React.SetStateAction<AdvFilters>> }) {
  const toggleArray = (key: 'permis' | 'enfants' | 'type_demande', value: string) => {
    setFilters(f => {
      const arr = f[key]
      const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
      return { ...f, [key]: next }
    })
  }
  const setBool = (key: keyof AdvFilters, value: 'tous' | 'oui' | 'non') => {
    setFilters(f => ({ ...f, [key]: value }))
  }

  const PERMIS_OPTIONS = ['L', 'B', 'B réfugié', 'B (marié CH/C)', 'C', 'F', 'G', 'N', 'S', 'IMES']
  const ENFANTS_OPTIONS: { key: string; label: string }[] = [
    { key: 'oui', label: '👶 Oui' },
    { key: 'oui_pas_a_charge', label: 'Pas à charge' },
    { key: 'non', label: 'Non' },
    { key: '?', label: '? Inconnu' },
  ]
  const TYPE_DEMANDE_OPTIONS: { key: string; label: string }[] = [
    { key: 'renouvellement', label: '🔄 Renouvellement' },
    { key: 'changement_employeur', label: '🔁 Changement empl.' },
    { key: 'premiere', label: '✨ 1ère Demande' },
  ]
  const BOOL_FIELDS: { key: keyof AdvFilters; label: string }[] = [
    { key: 'has_cv', label: 'CV' },
    { key: 'has_cm', label: 'CM' },
    { key: 'has_docs_clients', label: 'Docs Clients' },
    { key: 'mappe', label: 'Mappe' },
    { key: 'has_permis_conduire', label: 'Permis conduire' },
    { key: 'has_avs', label: 'AVS' },
    { key: 'has_iban', label: 'IBAN' },
    { key: 'has_carte_id', label: 'Carte ID' },
    { key: 'suisse', label: '🇨🇭 Suisse' },
    { key: 'has_quadrigis', label: 'N° Quadrigis' },
  ]

  const renderPills = (options: { key: string; label: string }[] | string[], selected: string[], onToggle: (k: string) => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map(opt => {
        const key = typeof opt === 'string' ? opt : opt.key
        const label = typeof opt === 'string' ? opt : opt.label
        const active = selected.includes(key)
        return (
          <button key={key} onClick={() => onToggle(key)} style={{
            padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: active ? 'var(--primary-soft)' : 'var(--secondary)',
            color: active ? 'var(--primary)' : 'var(--muted)',
            border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
          }}>{label}</button>
        )
      })}
    </div>
  )

  // Toggle compact tri-state (cycle tous → oui → non → tous)
  const cycleTriState = (key: keyof AdvFilters) => {
    const cur = filters[key] as 'tous' | 'oui' | 'non'
    const next = cur === 'tous' ? 'oui' : cur === 'oui' ? 'non' : 'tous'
    setBool(key, next)
  }

  return (
    <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
      {/* Ligne 1 : 3 catégories pills côte à côte */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Type de permis</div>
          {renderPills(PERMIS_OPTIONS, filters.permis, k => toggleArray('permis', k))}
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Enfants à charge</div>
          {renderPills(ENFANTS_OPTIONS, filters.enfants, k => toggleArray('enfants', k))}
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Type de demande</div>
          {renderPills(TYPE_DEMANDE_OPTIONS, filters.type_demande, k => toggleArray('type_demande', k))}
        </div>
      </div>

      {/* Ligne 2 : Documents & flags en grid serré, click = cycle tous→oui→non */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Documents & flags <span style={{ fontWeight: 500, fontSize: 9 }}>(clic pour cycler — / ✓ / ✗)</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 4 }}>
          {BOOL_FIELDS.map(f => {
            const val = filters[f.key] as 'tous' | 'oui' | 'non'
            const palette = val === 'oui' ? { bg: 'rgba(34,197,94,0.12)', fg: '#16A34A', border: 'rgba(34,197,94,0.4)', icon: '✓' }
              : val === 'non' ? { bg: 'rgba(239,68,68,0.12)', fg: '#DC2626', border: 'rgba(239,68,68,0.4)', icon: '✗' }
              : { bg: 'var(--secondary)', fg: 'var(--muted)', border: 'var(--border)', icon: '—' }
            return (
              <button key={f.key as string} onClick={() => cycleTriState(f.key)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '5px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: palette.bg, color: palette.fg, border: `1.5px solid ${palette.border}`,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                <span style={{ fontWeight: 800, flexShrink: 0 }}>{palette.icon}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Popup persistant fin ALFA caisse ─────────────────────────────────────────

function FinAlfaCaissePopup() {
  const queryClient = useQueryClient()
  const { data: alertes = [], refetch } = useQuery<any[]>({
    queryKey: ['secretariat-fin-alfa-actives'],
    queryFn: async () => {
      const res = await fetch('/api/secretariat/notifications/fin-alfa-actives')
      if (!res.ok) return []
      const d = await res.json()
      return d.alertes || []
    },
    refetchInterval: 60_000, // poll chaque minute
  })

  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const visible = alertes.filter(a => !dismissed.has(a.id))
  if (visible.length === 0) return null
  const current = visible[0]

  const handleConfirmer = () => {
    // Confirme — popup se ferme mais l'alerte reste active dans la cloche.
    setDismissed(prev => new Set(prev).add(current.id))
  }

  const handleCestFait = async () => {
    try {
      const res = await fetch(`/api/secretariat/notifications/${current.id}/cest-fait`, { method: 'PATCH' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Alerte archivée — ' + current.titre.replace(/^🚨\s*/, ''))
      setDismissed(prev => new Set(prev).add(current.id))
      refetch()
      queryClient.invalidateQueries({ queryKey: ['secretariat-notifs-count'] })
      queryClient.invalidateQueries({ queryKey: ['secretariat-notifications'] })
    } catch (e: any) { toast.error(e.message) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ ...S.card, padding: 28, width: '100%', maxWidth: 540, border: '2px solid #DC2626', boxShadow: '0 24px 64px rgba(220,38,38,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={28} color="#DC2626" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 24, fontWeight: 400, color: '#7F1D1D', letterSpacing: '-0.01em', lineHeight: 1.1 }}>Alerte fin ALFA</h2>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Annonce à transmettre à la caisse</div>
          </div>
        </div>

        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#7F1D1D', marginBottom: 6 }}>{current.titre.replace(/^🚨\s*/, '')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--foreground)', lineHeight: 1.5 }}>{current.message}</div>
        </div>

        {visible.length > 1 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, padding: '6px 10px', background: 'var(--secondary)', borderRadius: 6 }}>
            ℹ️ {visible.length - 1} autre{visible.length > 2 ? 's' : ''} alerte{visible.length > 2 ? 's' : ''} en attente après celle-ci.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleConfirmer} style={{
            padding: '10px 18px', borderRadius: 8, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', fontSize: 13, fontWeight: 700, cursor: 'pointer'
          }}>Confirmer (rappeler plus tard)</button>
          <button onClick={handleCestFait} style={{
            padding: '10px 20px', borderRadius: 8, background: '#16A34A', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
          }}>
            <CheckCircle2 size={15} /> C'est Fait — Archiver
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
          ⚠️ « Confirmer » ferme ce popup mais l'alerte reste active jusqu'à « C'est Fait ».
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Popup assurance expirée >20j ─────────────────────────────────────────────

function AssuranceExpireePopup() {
  const queryClient = useQueryClient()
  const { data: alertes = [], refetch } = useQuery<any[]>({
    queryKey: ['secretariat-assurance-actives'],
    queryFn: async () => {
      const res = await fetch('/api/secretariat/notifications/assurance-actives')
      if (!res.ok) return []
      const d = await res.json()
      return d.alertes || []
    },
    refetchInterval: 60_000,
  })

  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const visible = alertes.filter((a: any) => !dismissed.has(a.id))
  if (visible.length === 0) return null
  const current = visible[0]

  const handleFait = async () => {
    try {
      const res = await fetch(`/api/secretariat/notifications/${current.id}/cest-fait`, { method: 'PATCH' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Alerte assurance archivée')
      setDismissed(prev => new Set(prev).add(current.id))
      refetch()
      queryClient.invalidateQueries({ queryKey: ['secretariat-notifs-count'] })
      queryClient.invalidateQueries({ queryKey: ['secretariat-notifications'] })
    } catch (e: any) { toast.error(e.message) }
  }

  const handleAFaire = () => {
    // Ferme le popup, reste dans la cloche comme À faire
    setDismissed(prev => new Set(prev).add(current.id))
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ ...S.card, padding: 28, width: '100%', maxWidth: 540, border: '2px solid #CA8A04', boxShadow: '0 24px 64px rgba(202,138,4,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(234,179,8,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={28} color="#CA8A04" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 24, fontWeight: 400, color: '#78350F', letterSpacing: '-0.01em', lineHeight: 1.1 }}>Assurance expirée</h2>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Assurance payée depuis plus de 20 jours</div>
          </div>
        </div>

        <div style={{ background: 'rgba(234,179,8,0.06)', border: '1.5px solid rgba(234,179,8,0.25)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#78350F', marginBottom: 6 }}>{current.titre.replace(/^🟡\s*/, '')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--foreground)', lineHeight: 1.5 }}>{current.message}</div>
        </div>

        {visible.length > 1 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, padding: '6px 10px', background: 'var(--secondary)', borderRadius: 6 }}>
            ℹ️ {visible.length - 1} autre{visible.length > 2 ? 's' : ''} assurance{visible.length > 2 ? 's' : ''} expirée{visible.length > 2 ? 's' : ''} en attente.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={handleAFaire} style={{
            padding: '10px 18px', borderRadius: 8, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', fontSize: 13, fontWeight: 700, cursor: 'pointer'
          }}>À faire</button>
          <button onClick={handleFait} style={{
            padding: '10px 20px', borderRadius: 8, background: '#16A34A', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
          }}>
            <CheckCircle2 size={15} /> FAIT
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
          ⚠️ « À faire » ferme ce popup mais l'alerte reste active dans la cloche jusqu'à « FAIT ».
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SecretariatPageWrapper() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', color: 'var(--muted)' }}>Chargement…</div>}>
      <SecretariatPage />
    </Suspense>
  )
}

function SecretariatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const supabase = createClient()

  // Vérification du rôle
  const [roleChecked, setRoleChecked] = useState(false)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/dashboard')
        return
      }
      const role = user.user_metadata?.role
      const isAdmin = user.email === 'j.barbosa@l-agence.ch'
      if (role !== 'Secrétaire' && role !== 'Admin' && !isAdmin) {
        router.replace('/dashboard')
      } else {
        setRoleChecked(true)
      }
    })
  }, [])

  // State principaux
  const [activeTab, setActiveTab] = useState<'candidats' | 'alfa' | 'accidents'>('candidats')
  const [alfaView, setAlfaView] = useState<'suivi' | 'apayer'>('suivi')
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [showNotifs, setShowNotifs] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editItem, setEditItem] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteItem, setDeleteItem] = useState<any>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showAlertModal, setShowAlertModal] = useState(false)

  // Filtres accidents
  const [accidentStatut, setAccidentStatut] = useState<'tous' | 'nouveau' | 'en_cours' | 'termine'>('tous')
  const [accidentType, setAccidentType] = useState<'tous' | 'Accident' | 'Maladie'>('tous')

  // Filtre candidats (permis urgents / surveillance / docs manquants)
  const [candidatFiltre, setCandidatFiltre] = useState<'tous' | 'permis_urgent'>('tous')

  // Filtre mission terminée / actifs
  const [missionFiltre, setMissionFiltre] = useState<'tous' | 'actifs' | 'termines' | 'archives'>('tous')

  // Filtre docs complet / incomplet
  const [docsFiltre, setDocsFiltre] = useState<'tous' | 'complet' | 'incomplet'>('tous')

  // ─── Filtres avancés candidats (sous-panneau dépliable) ─────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [advFilters, setAdvFilters] = useState({
    permis: [] as string[],          // ['L','B','B réfugié',...]
    enfants: [] as string[],         // ['oui','oui_pas_a_charge','non','?']
    type_demande: [] as string[],    // ['renouvellement','changement_employeur','premiere']
    has_cv: 'tous' as 'tous' | 'oui' | 'non',
    has_cm: 'tous' as 'tous' | 'oui' | 'non',
    has_docs_clients: 'tous' as 'tous' | 'oui' | 'non',
    has_permis_conduire: 'tous' as 'tous' | 'oui' | 'non',
    mappe: 'tous' as 'tous' | 'oui' | 'non',
    has_avs: 'tous' as 'tous' | 'oui' | 'non',
    has_iban: 'tous' as 'tous' | 'oui' | 'non',
    has_carte_id: 'tous' as 'tous' | 'oui' | 'non',
    suisse: 'tous' as 'tous' | 'oui' | 'non',
    has_quadrigis: 'tous' as 'tous' | 'oui' | 'non',
  })
  const advCount = advFilters.permis.length + advFilters.enfants.length + advFilters.type_demande.length
    + (advFilters.has_cv !== 'tous' ? 1 : 0) + (advFilters.has_cm !== 'tous' ? 1 : 0)
    + (advFilters.has_docs_clients !== 'tous' ? 1 : 0) + (advFilters.has_permis_conduire !== 'tous' ? 1 : 0)
    + (advFilters.mappe !== 'tous' ? 1 : 0) + (advFilters.has_avs !== 'tous' ? 1 : 0)
    + (advFilters.has_iban !== 'tous' ? 1 : 0) + (advFilters.has_carte_id !== 'tous' ? 1 : 0)
    + (advFilters.suisse !== 'tous' ? 1 : 0) + (advFilters.has_quadrigis !== 'tous' ? 1 : 0)
  const resetAdvFilters = () => setAdvFilters({
    permis: [], enfants: [], type_demande: [],
    has_cv: 'tous', has_cm: 'tous', has_docs_clients: 'tous', has_permis_conduire: 'tous',
    mappe: 'tous', has_avs: 'tous', has_iban: 'tous', has_carte_id: 'tous',
    suisse: 'tous', has_quadrigis: 'tous',
  })

  // Filtre ALFA terminé / en cours
  const [alfaTermine, setAlfaTermine] = useState<'tous' | 'en_cours' | 'termine' | 'raf'>('tous')

  // Tri ALFA A-Z
  const [alfaSort, setAlfaSort] = useState<'default' | 'az' | 'za'>('default')

  // ─── Fix 6 — Lecture URL params (tab, filtre, action) ─────────────────────
  const urlParamsApplied = useRef(false)
  useEffect(() => {
    if (!roleChecked || urlParamsApplied.current) return
    urlParamsApplied.current = true

    const tab = searchParams.get('tab')
    if (tab === 'candidats' || tab === 'alfa' || tab === 'accidents') {
      setActiveTab(tab)
    }

    const filtre = searchParams.get('filtre')
    if (tab === 'accidents' && filtre === 'en_cours') {
      setAccidentStatut('en_cours')
    }
    if (tab === 'candidats' && filtre === 'permis_urgent') {
      setCandidatFiltre(filtre)
    }

    const action = searchParams.get('action')
    if (action === 'new') {
      setShowForm(true)
    }
  }, [roleChecked, searchParams])

  // ─── Queries React Query ───────────────────────────────────────────────────

  const { data: candidats = [], isLoading: loadingCandidats } = useQuery<SecretariatCandidat[]>({
    queryKey: ['secretariat-candidats', annee],
    queryFn: async () => {
      const res = await fetch(`/api/secretariat/candidats?annee=${annee}`)
      if (!res.ok) throw new Error('Erreur chargement candidats')
      const d = await res.json()
      return d.candidats || []
    },
    enabled: roleChecked,
  })

  const { data: accidents = [], isLoading: loadingAccidents } = useQuery<SecretariatAccident[]>({
    queryKey: ['secretariat-accidents', annee],
    queryFn: async () => {
      const res = await fetch(`/api/secretariat/accidents?annee=${annee}`)
      if (!res.ok) throw new Error('Erreur chargement accidents')
      const d = await res.json()
      return d.accidents || []
    },
    enabled: roleChecked,
  })

  const { data: alfa = [], isLoading: loadingAlfa } = useQuery<SecretariatAlfa[]>({
    queryKey: ['secretariat-alfa', annee],
    queryFn: async () => {
      const res = await fetch(`/api/secretariat/alfa?annee=${annee}`)
      if (!res.ok) throw new Error('Erreur chargement ALFA')
      const d = await res.json()
      return d.alfa || []
    },
    enabled: roleChecked,
  })

  const { data: alfaPaiements = [], isLoading: loadingAlfaPaiements } = useQuery<SecretariatAlfaPaiement[]>({
    queryKey: ['secretariat-alfa-paiements', annee],
    queryFn: async () => {
      const res = await fetch(`/api/secretariat/alfa-paiements?annee=${annee}`)
      if (!res.ok) throw new Error('Erreur chargement ALFA paiements')
      const d = await res.json()
      return d.paiements || []
    },
    enabled: roleChecked,
  })

  const { data: notifications = [], refetch: refetchNotifs } = useQuery<Notification[]>({
    queryKey: ['secretariat-notifications'],
    queryFn: async () => {
      const res = await fetch('/api/secretariat/notifications?all=true')
      if (!res.ok) return []
      const d = await res.json()
      return d.notifications || []
    },
    enabled: roleChecked,
    refetchInterval: 60000,
  })

  const notifsNonLues = notifications.filter(n => !n.lue).length

  // Query historique
  const { data: historyLogs = [], refetch: refetchHistory } = useQuery<any[]>({
    queryKey: ['secretariat-logs'],
    queryFn: async () => {
      const res = await fetch('/api/secretariat/logs')
      if (!res.ok) return []
      const d = await res.json()
      return d.logs || []
    },
    enabled: roleChecked && showHistory,
  })

  // ─── Génération notifications auto (dédup côté serveur) ────────────────────

  const autoNotifsGenerated = useRef(false)

  const generateNotifications = useCallback(async (
    candidatsList: SecretariatCandidat[],
    accidentsList: SecretariatAccident[],
  ) => {
    const today = new Date()
    const batch: Array<{ type: string; titre: string; message: string; candidat_id: string | null; reference_id: string; reference_table: string; urgence: string }> = []

    // Permis urgents (<14j)
    for (const c of candidatsList) {
      if (!c.date_echeance_permis) continue
      const jours = Math.floor((new Date(c.date_echeance_permis).getTime() - today.getTime()) / 86400000)
      if (jours >= 0 && jours < 14) {
        batch.push({
          type: 'permis_urgent',
          titre: `🔴 Permis urgent : ${c.nom} ${c.prenom}`,
          message: `Le permis ${c.genre_permis || ''} expire le ${formatDate(c.date_echeance_permis)} (dans ${jours} jour${jours !== 1 ? 's' : ''}).`,
          candidat_id: c.candidat_id,
          reference_id: `permis_${c.id}`,
          reference_table: 'secretariat_candidats',
          urgence: 'urgente',
        })
      }
    }

    // Assurances expirées depuis >20j (cas non terminés)
    for (const a of accidentsList) {
      if (a.statut_cas === 'termine' || !a.assurance_payee_jusqu_au) continue
      const joursExpire = Math.floor((today.getTime() - new Date(a.assurance_payee_jusqu_au).getTime()) / 86400000)
      if (joursExpire > 20) {
        const dateFormatted = a.assurance_payee_jusqu_au.split('-').reverse().join('.')
        batch.push({
          type: 'assurance_expiree',
          titre: `🟡 Assurance expirée : ${a.nom_prenom}`,
          message: `L'assurance (${a.type_cas}${a.sous_type ? ' / ' + a.sous_type : ''}) était payée jusqu'au ${dateFormatted} — expirée depuis ${joursExpire} jours. Vérifier le renouvellement.`,
          candidat_id: a.candidat_id,
          reference_id: `assurance_${a.id}`,
          reference_table: 'secretariat_accidents',
          urgence: joursExpire > 60 ? 'urgente' : 'normale',
        })
      }
    }

    // Sinistres en cours >30j
    for (const a of accidentsList) {
      if (a.termine || !a.date_debut) continue
      const jours = Math.floor((today.getTime() - new Date(a.date_debut).getTime()) / 86400000)
      if (jours > 30) {
        batch.push({
          type: 'sinistre_suivi',
          titre: `🏥 Sinistre à suivre : ${a.nom_prenom}`,
          message: `${a.type_cas} en cours depuis ${jours} jours (depuis le ${formatDate(a.date_debut)}).`,
          candidat_id: a.candidat_id,
          reference_id: `sinistre_${a.id}`,
          reference_table: 'secretariat_accidents',
          urgence: jours > 60 ? 'urgente' : 'normale',
        })
      }
    }

    // Envoyer en parallèle (la dédup est côté serveur)
    await Promise.allSettled(
      batch.map(n =>
        fetch('/api/secretariat/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(n),
        }).catch(() => {})
      )
    )

    refetchNotifs()
    queryClient.invalidateQueries({ queryKey: ['secretariat-notifs-count'] })
  }, [refetchNotifs, queryClient])

  useEffect(() => {
    if (candidats.length > 0 && accidents.length >= 0 && !autoNotifsGenerated.current) {
      autoNotifsGenerated.current = true
      generateNotifications(candidats, accidents)
    }
  }, [candidats, accidents])

  // ─── Filtres ───────────────────────────────────────────────────────────────

  const q = searchQuery.toLowerCase().trim()

  const alfaCandidatIds = new Set(alfa.map(a => a.candidat_id).filter(Boolean) as string[])

  const filteredCandidats = candidats.filter(c => {
    if (q && !`${c.nom} ${c.prenom}`.toLowerCase().includes(q) && !(c.numero_quadrigis || '').toLowerCase().includes(q)) return false
    // Archivés : masqués sauf si filtre = 'archives'
    if (missionFiltre === 'archives') {
      if (!c.archive) return false
    } else {
      if (c.archive) return false
      if (missionFiltre === 'actifs' && !!c.is_mission_terminee) return false
      if (missionFiltre === 'termines' && !c.is_mission_terminee) return false
    }
    const docsComplet = c.has_cv && c.has_cm && c.has_docs_clients && c.has_permis_conduire && c.mappe
    if (docsFiltre === 'complet' && !docsComplet) return false
    if (docsFiltre === 'incomplet' && docsComplet) return false
    if (candidatFiltre === 'permis_urgent') {
      if (!c.date_echeance_permis) return false
      const j = Math.floor((new Date(c.date_echeance_permis).getTime() - Date.now()) / 86400000)
      if (!(j >= 0 && j < 14)) return false
    }
    // Filtres avancés
    if (advFilters.permis.length > 0 && !advFilters.permis.includes(c.genre_permis || '')) return false
    if (advFilters.enfants.length > 0 && !advFilters.enfants.includes(c.enfants_charge || '?')) return false
    if (advFilters.type_demande.length > 0 && !advFilters.type_demande.includes(c.type_demande || '')) return false
    const checkBool = (filter: 'tous' | 'oui' | 'non', val: boolean) => {
      if (filter === 'tous') return true
      return filter === 'oui' ? !!val : !val
    }
    if (!checkBool(advFilters.has_cv, c.has_cv)) return false
    if (!checkBool(advFilters.has_cm, c.has_cm)) return false
    if (!checkBool(advFilters.has_docs_clients, c.has_docs_clients)) return false
    if (!checkBool(advFilters.has_permis_conduire, c.has_permis_conduire)) return false
    if (!checkBool(advFilters.mappe, c.mappe)) return false
    if (!checkBool(advFilters.has_avs, !!c.numero_avs)) return false
    if (!checkBool(advFilters.has_iban, !!c.iban)) return false
    if (!checkBool(advFilters.has_carte_id, !!c.carte_id)) return false
    if (!checkBool(advFilters.suisse, c.suisse)) return false
    if (!checkBool(advFilters.has_quadrigis, !!c.numero_quadrigis)) return false
    return true
  })

  const filteredAccidents = accidents.filter(a => {
    if (accidentStatut !== 'tous' && a.statut_cas !== accidentStatut) return false
    if (accidentType !== 'tous' && a.type_cas !== accidentType) return false
    return !q || (a.nom_prenom || '').toLowerCase().includes(q) || (a.raison || '').toLowerCase().includes(q) || (a.numero_sinistre || '').toLowerCase().includes(q)
  })

  const filteredAlfa = alfa.filter(a => {
    if (q && !`${a.nom} ${a.prenom}`.toLowerCase().includes(q) && !(a.remarques || '').toLowerCase().includes(q)) return false
    if (alfaTermine === 'en_cours' && (a.termine || a.raf)) return false
    if (alfaTermine === 'termine' && !a.termine) return false
    if (alfaTermine === 'raf' && !a.raf) return false
    return true
  }).sort((a, b) => {
    if (alfaSort === 'az') return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')
    if (alfaSort === 'za') return `${b.nom} ${b.prenom}`.localeCompare(`${a.nom} ${a.prenom}`, 'fr')
    return 0
  })

  const filteredAlfaPaiements = alfaPaiements.filter(a => {
    if (q && !`${a.nom} ${a.prenom}`.toLowerCase().includes(q) && !(a.remarques || '').toLowerCase().includes(q)) return false
    if (alfaTermine === 'en_cours' && a.statut_termine) return false
    if (alfaTermine === 'termine' && !a.statut_termine) return false
    return true
  }).sort((a, b) => {
    if (alfaSort === 'az') return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')
    if (alfaSort === 'za') return `${b.nom} ${b.prenom}`.localeCompare(`${a.nom} ${a.prenom}`, 'fr')
    return 0
  })

  // ─── Handlers CRUD ────────────────────────────────────────────────────────

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return
    try {
      let url = ''
      if (activeTab === 'candidats') url = `/api/secretariat/candidats/${deleteItem.id}`
      else if (activeTab === 'accidents') url = `/api/secretariat/accidents/${deleteItem.id}`
      else if (activeTab === 'alfa' && alfaView === 'suivi') url = `/api/secretariat/alfa/${deleteItem.id}`
      else if (activeTab === 'alfa' && alfaView === 'apayer') url = `/api/secretariat/alfa-paiements/${deleteItem.id}`
      else return

      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Erreur suppression')
      }
      toast.success('Supprimé')
      const qKey = activeTab === 'alfa' ? (alfaView === 'apayer' ? 'secretariat-alfa-paiements' : 'secretariat-alfa') : `secretariat-${activeTab}`
      queryClient.invalidateQueries({ queryKey: [qKey, annee] })
      setDeleteItem(null)
    } catch (e: any) { toast.error(e.message) }
  }

  const handleSaved = () => {
    const qKey = activeTab === 'alfa' ? (alfaView === 'apayer' ? 'secretariat-alfa-paiements' : 'secretariat-alfa') : `secretariat-${activeTab}`
    queryClient.invalidateQueries({ queryKey: [qKey, annee] })
  }

  const handleMarkNotifLue = async (notif: Notification) => {
    try {
      await fetch(`/api/secretariat/notifications/${notif.id}/lu`, { method: 'PATCH' })
      refetchNotifs()
      queryClient.invalidateQueries({ queryKey: ['secretariat-notifs-count'] })
    } catch { /* ignore */ }
  }

  const handleMarkAllLues = async () => {
    try {
      await fetch('/api/secretariat/notifications/mark-all-read', { method: 'POST' })
      refetchNotifs()
      queryClient.invalidateQueries({ queryKey: ['secretariat-notifs-count'] })
    } catch { /* ignore */ }
  }

  // Color change — générique pour toutes les tables
  const handleColorChange = async (id: string, color: string) => {
    try {
      let apiBase = ''
      let qKey = ''
      if (activeTab === 'candidats') { apiBase = 'candidats'; qKey = 'secretariat-candidats' }
      else if (activeTab === 'accidents') { apiBase = 'accidents'; qKey = 'secretariat-accidents' }
      else if (activeTab === 'alfa' && alfaView === 'suivi') { apiBase = 'alfa'; qKey = 'secretariat-alfa' }
      else if (activeTab === 'alfa' && alfaView === 'apayer') { apiBase = 'alfa-paiements'; qKey = 'secretariat-alfa-paiements' }
      else return
      const res = await fetch(`/api/secretariat/${apiBase}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couleur: color || null }),
      })
      if (!res.ok) throw new Error('Erreur')
      queryClient.invalidateQueries({ queryKey: [qKey, annee] })
    } catch (e: any) { toast.error(e.message) }
  }

  // Mode de paiement inline (liste candidats) — active les notifications de versement
  const handleModeChange = async (id: string, mode: string) => {
    try {
      const res = await fetch(`/api/secretariat/candidats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode_paiement: mode || null }),
      })
      if (!res.ok) throw new Error('Erreur')
      queryClient.invalidateQueries({ queryKey: ['secretariat-candidats', annee] })
      toast.success(mode ? '💰 Mode enregistré — notifications de versement activées' : 'Mode de paiement retiré')
    } catch (e: any) { toast.error(e.message || 'Erreur') }
  }

  // Archive accident
  const handleArchive = async (a: SecretariatAccident) => {
    try {
      const res = await fetch(`/api/secretariat/accidents/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive: !a.archive }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(a.archive ? 'Désarchivé' : 'Archivé')
      queryClient.invalidateQueries({ queryKey: ['secretariat-accidents', annee] })
    } catch (e: any) { toast.error(e.message) }
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (!roleChecked) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
      </div>
    )
  }

  const isLoading = activeTab === 'candidats' ? loadingCandidats
    : activeTab === 'accidents' ? loadingAccidents
    : (alfaView === 'apayer' ? loadingAlfaPaiements : loadingAlfa)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="d-page">
      {/* Header */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardList size={22} color="var(--primary)" />
            Administration
          </h1>
          <p className="d-page-sub">Suivi documents, accidents &amp; ALFA</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Historique modifications */}
          <button
            onClick={() => { setShowHistory(v => !v); if (!showHistory) refetchHistory() }}
            style={{ padding: '8px 10px', borderRadius: 8, background: showHistory ? 'var(--primary-soft)' : 'var(--secondary)', border: '1.5px solid var(--border)', color: showHistory ? 'var(--primary)' : 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}
          >
            <History size={14} />
            Historique
          </button>

          {/* Cloche notifications */}
          <button
            onClick={() => setShowNotifs(v => !v)}
            style={{ position: 'relative', padding: '8px 10px', borderRadius: 8, background: showNotifs ? 'var(--primary-soft)' : 'var(--secondary)', border: '1.5px solid var(--border)', color: showNotifs ? 'var(--primary)' : 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <Bell size={16} />
            {notifsNonLues > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: 'var(--destructive)', color: 'var(--destructive-foreground)', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {notifsNonLues}
              </span>
            )}
          </button>

          {/* Bouton nouvelle entrée */}
          <button onClick={() => { setEditItem(null); setShowForm(true) }} className="neo-btn-yellow">
            <Plus size={15} /> Nouvelle entrée
          </button>
        </div>
      </div>

      {/* Panel notifications */}
      {showNotifs && (() => {
        const AUTO_TYPES = ['permis_urgent', 'sinistre_suivi', 'fin_alfa_caisse']
        const autoNotifs = notifications.filter(n => AUTO_TYPES.includes(n.type))
        const messageNotifs = notifications.filter(n => !AUTO_TYPES.includes(n.type))
        const autoNonLues = autoNotifs.filter(n => !n.lue).length
        const msgNonLues = messageNotifs.filter(n => !n.lue).length

        const ICON_MAP: Record<string, React.ReactNode> = {
          permis_urgent: <AlertTriangle size={13} color="var(--destructive)" />,
          sinistre_suivi: <AlertCircle size={13} color="#8B5CF6" />,
          fin_alfa_caisse: <AlertTriangle size={13} color="#DC2626" />,
          message: <Mail size={13} color="var(--primary)" />,
          autre: <AlertTriangle size={13} color="var(--muted)" />,
        }

        const handleNotifClick = (notif: Notification) => {
          // Navigate to the right tab based on notification type
          if (notif.type === 'sinistre_suivi') {
            setActiveTab('accidents')
            setShowNotifs(false)
          } else if (notif.type === 'permis_urgent') {
            setActiveTab('candidats')
            setCandidatFiltre('permis_urgent')
            setShowNotifs(false)
          } else if (notif.candidat_id) {
            router.push(`/candidats/${notif.candidat_id}?from=secretariat`)
          }
        }

        const renderNotif = (notif: Notification) => (
          <div key={notif.id} onClick={() => handleNotifClick(notif)} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            background: notif.lue ? 'transparent' : 'rgba(245,166,35,0.04)',
            borderLeft: notif.urgence === 'urgente' && !notif.lue ? '3px solid #EF4444' : '3px solid transparent',
            opacity: notif.lue ? 0.55 : 1,
            cursor: 'pointer',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => { if (!notif.lue) e.currentTarget.style.background = 'rgba(245,166,35,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.background = notif.lue ? 'transparent' : 'rgba(245,166,35,0.04)' }}
          >
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              {ICON_MAP[notif.type] || <Bell size={13} color="var(--muted)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--foreground)', marginBottom: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {notif.titre}
                {notif.urgence === 'urgente' && !notif.lue && <span style={{ padding: '0 5px', borderRadius: 4, fontSize: 9, fontWeight: 800, background: 'rgba(239,68,68,0.12)', color: 'var(--destructive)' }}>URGENT</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{notif.message}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatDate(notif.created_at?.split('T')[0])}</span>
                {notif.created_by_nom && <span style={{ fontSize: 10, color: 'var(--muted)' }}>par {notif.created_by_nom}</span>}
                {notif.candidat_id && (
                  <a href={`/candidats/${notif.candidat_id}?from=secretariat`} onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Voir candidat →</a>
                )}
              </div>
            </div>
            {(notif.type === 'fin_alfa_caisse' || notif.type === 'assurance_expiree') && !notif.traitee && (
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    await fetch(`/api/secretariat/notifications/${notif.id}/cest-fait`, { method: 'PATCH' })
                    toast.success('Alerte archivée')
                    refetchNotifs()
                    queryClient.invalidateQueries({ queryKey: ['secretariat-notifs-count'] })
                    queryClient.invalidateQueries({ queryKey: ['secretariat-fin-alfa-actives'] })
                    queryClient.invalidateQueries({ queryKey: ['secretariat-assurance-actives'] })
                  } catch { toast.error('Erreur') }
                }}
                title="C'est fait — archiver"
                style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: '#16A34A', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                <CheckCircle2 size={11} /> C'est fait
              </button>
            )}
            {!notif.lue && notif.type !== 'fin_alfa_caisse' && notif.type !== 'assurance_expiree' && (
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    await fetch(`/api/secretariat/notifications/${notif.id}/cest-fait`, { method: 'PATCH' })
                    refetchNotifs()
                    queryClient.invalidateQueries({ queryKey: ['secretariat-notifs-count'] })
                  } catch { handleMarkNotifLue(notif) }
                }}
                title="Archiver"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, flexShrink: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>
        )

        return (
          <div style={{ ...S.card, padding: 0, marginBottom: 20, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1.5px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={15} color="var(--primary)" />
                Notifications
                {notifsNonLues > 0 && <span style={{ padding: '1px 7px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: 'var(--destructive)', fontSize: 11, fontWeight: 700 }}>{notifsNonLues} non lues</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setShowAlertModal(true)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--primary)', border: 'none', color: 'var(--primary-foreground)', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={11} /> Ajouter une alerte
                </button>
                {notifsNonLues > 0 && (
                  <button onClick={handleMarkAllLues} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}>
                    Tout marquer lu
                  </button>
                )}
                <button onClick={() => setShowNotifs(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={16} /></button>
              </div>
            </div>

            {notifications.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucune notification</div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {/* Section Messages manuels */}
                {messageNotifs.length > 0 && (
                  <>
                    <div style={{ padding: '8px 16px', background: 'rgba(245,166,35,0.06)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                      💬 Messages
                      {msgNonLues > 0 && <span style={{ padding: '0 5px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: 'var(--destructive)', fontSize: 10, fontWeight: 800 }}>{msgNonLues}</span>}
                    </div>
                    {messageNotifs.slice(0, 20).map(renderNotif)}
                  </>
                )}

                {/* Section Alertes automatiques */}
                {autoNotifs.length > 0 && (
                  <>
                    <div style={{ padding: '8px 16px', background: 'rgba(99,102,241,0.05)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ⚡ Alertes automatiques
                      {autoNonLues > 0 && <span style={{ padding: '0 5px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: 'var(--destructive)', fontSize: 10, fontWeight: 800 }}>{autoNonLues}</span>}
                    </div>
                    {autoNotifs.filter(n => !n.lue).slice(0, 30).map(renderNotif)}
                    {autoNotifs.filter(n => n.lue).length > 0 && (
                      <details style={{ borderBottom: '1px solid var(--border)' }}>
                        <summary style={{ padding: '6px 16px', fontSize: 10, color: 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}>
                          {autoNotifs.filter(n => n.lue).length} alerte{autoNotifs.filter(n => n.lue).length > 1 ? 's' : ''} lue{autoNotifs.filter(n => n.lue).length > 1 ? 's' : ''}
                        </summary>
                        {autoNotifs.filter(n => n.lue).slice(0, 20).map(renderNotif)}
                      </details>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Panel historique modifications */}
      {showHistory && (
        <div style={{ ...S.card, padding: 0, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1.5px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={15} color="var(--primary)" />
              Historique des modifications
              <span style={{ padding: '1px 7px', borderRadius: 99, background: 'var(--secondary)', color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>{historyLogs.length}</span>
            </div>
            <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={16} /></button>
          </div>
          {historyLogs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucune modification enregistrée</div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--secondary)', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>Utilisateur</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>Candidat</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>Action</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLogs.map((log: any) => {
                    const dt = log.created_at ? new Date(log.created_at) : null
                    const dateStr = dt ? `${dt.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })} ${dt.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}` : '—'
                    const actionLabel = log.action === 'create' ? '➕ Créé' : log.action === 'delete' ? '🗑 Supprimé' : '✏️ Modifié'
                    const tableLabel = (log.table_concernee || '').replace('secretariat_', '').replace('_', ' ')
                    const changes = log.champs_modifies
                      ? Object.entries(log.champs_modifies as Record<string, { avant: any; apres: any }>)
                          .map(([k, v]) => `${k}: ${v.avant ?? '—'} → ${v.apres ?? '—'}`)
                          .join(', ')
                      : ''
                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: 11 }}>{dateStr}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--foreground)' }}>{log.user_nom || log.user_email || '—'}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--foreground)' }}>{log.nom_candidat || '—'}</td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11 }}>{actionLabel}</span>
                          <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>({tableLabel})</span>
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{changes || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabs principaux */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <TabBtn active={activeTab === 'candidats'} onClick={() => { setActiveTab('candidats'); setSearchQuery(''); setShowForm(false); setEditItem(null); setCandidatFiltre('tous'); setMissionFiltre('tous'); setDocsFiltre('tous'); resetAdvFilters() }} count={filteredCandidats.length}>
          <User size={14} /> Suivi Candidats
        </TabBtn>
        <TabBtn active={activeTab === 'alfa'} onClick={() => { setActiveTab('alfa'); setSearchQuery(''); setShowForm(false); setEditItem(null) }} count={filteredAlfa.length + filteredAlfaPaiements.length}>
          <FileText size={14} /> ALFA
        </TabBtn>
        <TabBtn active={activeTab === 'accidents'} onClick={() => { setActiveTab('accidents'); setSearchQuery(''); setShowForm(false); setEditItem(null) }} count={filteredAccidents.length}>
          <AlertCircle size={14} /> Accidents &amp; Maladies
        </TabBtn>
        <a href="/secretariat/paiements/calendrier"
          style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'rgba(245,158,11,0.10)', color: '#D97706', border: '1.5px solid rgba(245,158,11,0.30)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          💰 Calendrier paiements
        </a>
      </div>

      {/* Sous-tabs ALFA (suivi / à payer) */}
      {activeTab === 'alfa' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          <button onClick={() => setAlfaView('suivi')} style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: alfaView === 'suivi' ? 'var(--primary)' : 'var(--secondary)',
            color: alfaView === 'suivi' ? 'var(--primary-foreground)' : 'var(--muted)',
            border: `1.5px solid ${alfaView === 'suivi' ? 'var(--primary)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            📋 Suivi ALFA
            <span style={{ padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 800, background: alfaView === 'suivi' ? 'rgba(255,255,255,0.2)' : 'var(--primary-soft)', color: alfaView === 'suivi' ? '#fff' : 'var(--primary)' }}>{filteredAlfa.length}</span>
          </button>
          <button onClick={() => setAlfaView('apayer')} style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: alfaView === 'apayer' ? 'var(--primary)' : 'var(--secondary)',
            color: alfaView === 'apayer' ? 'var(--primary-foreground)' : 'var(--muted)',
            border: `1.5px solid ${alfaView === 'apayer' ? 'var(--primary)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            💰 À Payer
            <span style={{ padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 800, background: alfaView === 'apayer' ? 'rgba(255,255,255,0.2)' : 'rgba(16,185,129,0.12)', color: alfaView === 'apayer' ? '#fff' : '#10B981' }}>{filteredAlfaPaiements.length}</span>
          </button>
        </div>
      )}

      {/* Sous-tabs année */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[2026, 2025].map(y => (
          <button key={y} onClick={() => setAnnee(y)} style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: annee === y ? 'var(--foreground)' : 'var(--secondary)',
            color: annee === y ? 'var(--background)' : 'var(--muted)',
            border: annee === y ? '1.5px solid var(--foreground)' : '1.5px solid var(--border)',
          }}>
            {y}
          </button>
        ))}
      </div>

      {/* Filtres accidents */}
      {activeTab === 'accidents' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'tous',     label: 'Tous',       bg: 'var(--primary)',           fg: 'var(--primary-foreground)', border: 'var(--primary)' },
              { key: 'nouveau',  label: 'Nouveau Cas', bg: 'rgba(99,102,241,0.15)',   fg: '#818CF8',  border: 'rgba(99,102,241,0.4)' },
              { key: 'en_cours', label: 'En cours',   bg: 'rgba(6,182,212,0.12)',     fg: '#06B6D4',  border: 'rgba(6,182,212,0.3)' },
              { key: 'termine',  label: 'Terminé',    bg: 'rgba(34,197,94,0.15)',     fg: '#16A34A',  border: 'rgba(34,197,94,0.4)' },
            ] as { key: 'tous' | 'nouveau' | 'en_cours' | 'termine'; label: string; bg: string; fg: string; border: string }[]).map(s => (
              <button key={s.key} onClick={() => setAccidentStatut(s.key)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: accidentStatut === s.key ? s.bg : 'var(--secondary)',
                color: accidentStatut === s.key ? s.fg : 'var(--muted)',
                border: `1.5px solid ${accidentStatut === s.key ? s.border : 'var(--border)'}`,
              }}>{s.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['tous', 'Accident', 'Maladie'] as const).map(t => (
              <button key={t} onClick={() => setAccidentType(t)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: accidentType === t ? 'var(--primary)' : 'var(--secondary)',
                color: accidentType === t ? 'var(--primary-foreground)' : 'var(--muted)',
                border: `1.5px solid ${accidentType === t ? 'var(--primary)' : 'var(--border)'}`,
              }}>{t === 'tous' ? 'Tous' : t}</button>
            ))}
          </div>
        </div>
      )}

      {/* Filtres ALFA */}
      {activeTab === 'alfa' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['tous', 'en_cours', 'termine', 'raf'] as const).map(s => {
              const palette = s === 'termine' ? { bg: 'rgba(34,197,94,0.15)', fg: '#16A34A', border: 'rgba(34,197,94,0.4)' }
                : s === 'raf' ? { bg: 'rgba(234,179,8,0.15)', fg: '#CA8A04', border: 'rgba(234,179,8,0.4)' }
                : s === 'en_cours' ? { bg: 'rgba(239,68,68,0.12)', fg: '#DC2626', border: 'rgba(239,68,68,0.3)' }
                : { bg: 'var(--primary)', fg: '#fff', border: 'var(--primary)' }
              const active = alfaTermine === s
              return (
                <button key={s} onClick={() => setAlfaTermine(s)} style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: active ? palette.bg : 'var(--secondary)',
                  color: active ? palette.fg : 'var(--muted)',
                  border: `1.5px solid ${active ? palette.border : 'var(--border)'}`,
                }}>{s === 'tous' ? 'Tous' : s === 'en_cours' ? '● En cours' : s === 'termine' ? '✓ Terminé' : '⏳ RAF'}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtres candidats — pills */}
      {activeTab === 'candidats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>Mission</span>
            {([
              { key: 'tous', label: 'Tous' },
              { key: 'actifs', label: '🟢 Actifs' },
              { key: 'termines', label: '🔴 Terminée' },
              { key: 'archives', label: '📦 Archivés' },
            ] as const).map(f => {
              const palette = f.key === 'termines' ? { bg: 'rgba(239,68,68,0.15)', fg: '#DC2626', border: 'rgba(239,68,68,0.4)' }
                : f.key === 'actifs' ? { bg: 'rgba(34,197,94,0.15)', fg: '#16A34A', border: 'rgba(34,197,94,0.4)' }
                : f.key === 'archives' ? { bg: 'rgba(107,114,128,0.18)', fg: '#4B5563', border: 'rgba(107,114,128,0.4)' }
                : { bg: 'var(--primary)', fg: 'var(--primary-foreground)', border: 'var(--primary)' }
              const active = missionFiltre === f.key
              return (
                <button key={f.key} onClick={() => setMissionFiltre(f.key)} style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: active ? palette.bg : 'var(--secondary)',
                  color: active ? palette.fg : 'var(--muted)',
                  border: `1.5px solid ${active ? palette.border : 'var(--border)'}`,
                }}>{f.label}</button>
              )
            })}
            <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>Docs</span>
            {([
              { key: 'tous', label: 'Tous' },
              { key: 'complet', label: '✓ Complet' },
              { key: 'incomplet', label: '✗ Incomplet' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setDocsFiltre(f.key)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: docsFiltre === f.key ? (f.key === 'complet' ? 'rgba(34,197,94,0.15)' : f.key === 'incomplet' ? 'rgba(239,68,68,0.15)' : 'var(--primary)') : 'var(--secondary)',
                color: docsFiltre === f.key ? (f.key === 'complet' ? '#16A34A' : f.key === 'incomplet' ? '#DC2626' : 'var(--primary-foreground)') : 'var(--muted)',
                border: `1.5px solid ${docsFiltre === f.key ? (f.key === 'complet' ? 'rgba(34,197,94,0.4)' : f.key === 'incomplet' ? 'rgba(239,68,68,0.4)' : 'var(--primary)') : 'var(--border)'}`,
              }}>{f.label}</button>
            ))}
            <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
            {([
              { key: 'tous', label: 'Tous' },
              { key: 'permis_urgent', label: '🔴 Permis urgents (<14j)' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setCandidatFiltre(f.key)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: candidatFiltre === f.key ? 'var(--primary)' : 'var(--secondary)',
                color: candidatFiltre === f.key ? 'var(--primary-foreground)' : 'var(--muted)',
                border: `1.5px solid ${candidatFiltre === f.key ? 'var(--primary)' : 'var(--border)'}`,
              }}>{f.label}</button>
            ))}
          </div>

          {/* Bouton filtres avancés (toggle) */}
          {activeTab === 'candidats' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <button onClick={() => setShowAdvanced(v => !v)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: showAdvanced || advCount > 0 ? 'var(--primary-soft)' : 'var(--secondary)',
                color: showAdvanced || advCount > 0 ? 'var(--primary)' : 'var(--muted)',
                border: `1.5px solid ${showAdvanced || advCount > 0 ? 'var(--primary)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <Filter size={11} />
                Filtres avancés
                {advCount > 0 && <span style={{ padding: '0 6px', borderRadius: 99, background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: 10, fontWeight: 800 }}>{advCount}</span>}
                {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {advCount > 0 && (
                <button onClick={resetAdvFilters} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: 'none', color: 'var(--destructive)', border: '1.5px solid rgba(239,68,68,0.3)',
                }}>Réinitialiser</button>
              )}
            </div>
          )}

          {/* Panneau filtres avancés (collapsible) */}
          {activeTab === 'candidats' && showAdvanced && (
            <AdvancedFiltersPanel filters={advFilters} setFilters={setAdvFilters} />
          )}
        </div>
      )}

      {/* Barre de recherche */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'candidats' ? 'Rechercher nom, prénom, N° quad…'
              : activeTab === 'alfa' ? 'Rechercher nom, prénom…'
              : activeTab === 'accidents' ? 'Rechercher nom, raison, sinistre…'
              : 'Rechercher nom, adresse…'
            }
            style={{ ...S.input, paddingLeft: 34 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
              <X size={13} />
            </button>
          )}
        </div>
        {/* Compteur résultats */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--muted)', padding: '0 8px' }}>
          {activeTab === 'candidats' && `${filteredCandidats.length} candidat${filteredCandidats.length !== 1 ? 's' : ''}`}
          {activeTab === 'alfa' && alfaView === 'suivi' && `${filteredAlfa.length} entrée${filteredAlfa.length !== 1 ? 's' : ''}`}
          {activeTab === 'alfa' && alfaView === 'apayer' && `${filteredAlfaPaiements.length} paiement${filteredAlfaPaiements.length !== 1 ? 's' : ''}`}
          {activeTab === 'accidents' && `${filteredAccidents.length} cas`}
        </div>
      </div>

      {/* Contenu principal */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 20px', gap: 10, color: 'var(--muted)' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 13 }}>Chargement…</span>
          </div>
        ) : (
          <div style={{ padding: activeTab === 'accidents' ? 16 : 0 }}>
            {activeTab === 'candidats' && (
              <CandidatsTable
                candidats={filteredCandidats}
                onEdit={c => { setEditItem(c); setShowForm(true) }}
                onDelete={c => setDeleteItem(c)}
                onColorChange={handleColorChange}
                onModeChange={handleModeChange}
                alfaCandidatIds={alfaCandidatIds}
                onGoToAlfa={() => setActiveTab('alfa')}
                onCreateAlfa={c => {
                  // Pré-remplit le modal ALFA avec les infos du candidat
                  const prefill: Partial<SecretariatAlfa> = {
                    candidat_id: c.candidat_id,
                    nom: c.nom,
                    prenom: c.prenom,
                    numero_avs: c.numero_avs,
                    annee: c.annee,
                    photo_url: c.photo_url,
                    tel: c.tel,
                    email: c.email,
                  } as Partial<SecretariatAlfa>
                  setActiveTab('alfa')
                  setAlfaView('suivi')
                  setEditItem(prefill)
                  setShowForm(true)
                }}
                onToggleArchive={async c => {
                  const newVal = !c.archive
                  try {
                    const res = await fetch(`/api/secretariat/candidats/${c.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        archive: newVal,
                        archived_at: newVal ? new Date().toISOString() : null,
                      }),
                    })
                    if (!res.ok) throw new Error('Erreur')
                    toast.success(newVal ? `📦 ${c.nom} ${c.prenom} archivé` : `${c.nom} ${c.prenom} désarchivé`)
                    queryClient.invalidateQueries({ queryKey: ['secretariat-candidats', annee] })
                  } catch (e: any) { toast.error(e.message || 'Erreur') }
                }}
              />
            )}
            {activeTab === 'alfa' && alfaView === 'suivi' && (
              <AlfaTable
                rows={filteredAlfa}
                onEdit={a => { setEditItem(a); setShowForm(true) }}
                onDelete={a => { setDeleteItem(a) }}
                onColorChange={handleColorChange}
              />
            )}
            {activeTab === 'alfa' && alfaView === 'apayer' && (
              <AlfaPaiementsTable
                rows={filteredAlfaPaiements}
                onEdit={a => { setEditItem(a); setShowForm(true) }}
                onDelete={a => { setDeleteItem(a) }}
                onColorChange={handleColorChange}
              />
            )}
            {activeTab === 'accidents' && (
              <AccidentsTable
                accidents={filteredAccidents}
                onEdit={a => { setEditItem(a); setShowForm(true) }}
                onDelete={a => setDeleteItem(a)}
                onArchive={handleArchive}
              />
            )}
          </div>
        )}
      </div>

      {/* Modaux formulaires */}
      {showForm && activeTab === 'candidats' && (
        <CandidatModal
          item={editItem}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          onSaved={handleSaved}
        />
      )}
      {showForm && activeTab === 'accidents' && (
        <AccidentModal
          item={editItem}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          onSaved={handleSaved}
        />
      )}
      {showForm && activeTab === 'alfa' && alfaView === 'suivi' && (
        <AlfaModal
          item={editItem}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          onSaved={handleSaved}
        />
      )}
      {showForm && activeTab === 'alfa' && alfaView === 'apayer' && (
        <AlfaPaiementModal
          item={editItem}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          onSaved={handleSaved}
        />
      )}

      {/* Modal alerte */}
      {showAlertModal && (
        <AlertModal
          onClose={() => setShowAlertModal(false)}
          onSaved={() => {
            refetchNotifs()
            queryClient.invalidateQueries({ queryKey: ['secretariat-notifs-count'] })
          }}
        />
      )}

      {/* Popup persistant fin ALFA caisse — s'affiche tant que pas archivé */}
      <FinAlfaCaissePopup />

      {/* Popup assurances expirées >20j */}
      <AssuranceExpireePopup />

      {/* Modal suppression */}
      {deleteItem && (
        <DeleteModal
          label={
            activeTab === 'candidats'
              ? `${(deleteItem as SecretariatCandidat).nom} ${(deleteItem as SecretariatCandidat).prenom}`
              : activeTab === 'alfa'
              ? `${(deleteItem as SecretariatAlfa).nom} ${(deleteItem as SecretariatAlfa).prenom || ''}`
              : (deleteItem as SecretariatAccident).nom_prenom
          }
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteItem(null)}
        />
      )}
    </div>
  )
}
