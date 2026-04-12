'use client'

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
  FileText, Home, History, Filter, ArrowUpDown, ArrowUp, ArrowDown,
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
  genre_permis: string | null
  date_echeance_permis: string | null
  permis_travail: string | null
  carte_id: string
  numero_avs: string | null
  iban: string | null
  has_cv: boolean
  has_cm: boolean
  has_docs_clients: boolean
  remarques: string | null
  mission_terminee: string | null
  mappe: boolean
  docs_manquants: string | null
  suisse: boolean
  annee: number
  photo_url?: string | null
  tel?: string | null
  email?: string | null
  couleur?: string | null
}

interface SecretariatAccident {
  id: string
  candidat_id: string | null
  nom_prenom: string
  type_cas: 'Accident' | 'Maladie'
  sous_type: string | null
  raison: string | null
  numero_sinistre: string | null
  date_debut: string | null
  date_fin: string | null
  assurance_payee_jusqu_au: string | null
  licenciement_pour_le: string | null
  remarque: string | null
  termine: boolean
  decision: string | null
  note: string | null
  couleur: 'normal' | 'jaune' | 'rouge'
  archive: boolean
  annee: number
  photo_url?: string | null
  tel?: string | null
  email?: string | null
}

interface SecretariatLoyer {
  id: string
  candidat_id: string | null
  nom_prenom: string
  adresse: string | null
  montant_loyer: number | null
  date_debut: string | null
  date_fin: string | null
  remarques: string | null
  annee: number
  couleur?: string | null
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
  if (jours < 30) return 'red'
  if (jours < 90) return 'yellow'
  return 'green'
}

function getLigneStatut(c: SecretariatCandidat): 'ok' | 'warning' | 'urgent' {
  const permisColor = getPermisColor(c.date_echeance_permis)
  if (permisColor === 'red') return 'urgent'
  if (c.docs_manquants) return 'warning'
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
            <button onClick={() => onChange(null)} style={{ flex: 1, padding: '3px 0', borderRadius: 4, border: 'none', background: allChecked ? 'var(--primary)' : 'var(--secondary)', color: allChecked ? '#fff' : 'var(--muted)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Tous</button>
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
    const label = [c.prenom, c.nom].filter(Boolean).join(' ')
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
              <div style={{ fontWeight: 600 }}>{c.prenom} {c.nom}</div>
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
  genre_permis: '',
  date_echeance_permis: '',
  permis_travail: '',
  carte_id: '',
  numero_avs: '',
  iban: '',
  numero_quadrigis: '',
  has_cv: false,
  has_cm: false,
  has_docs_clients: false,
  remarques: '',
  mission_terminee: '',
  mappe: false,
  docs_manquants: '',
  suisse: false,
  annee: new Date().getFullYear(),
}

function CandidatModal({ item, onClose, onSaved }: { item?: SecretariatCandidat | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => item ? {
    candidat_id: item.candidat_id,
    candidat_nom_complet: [item.prenom, item.nom].filter(Boolean).join(' '),
    nom: item.nom || '',
    prenom: item.prenom || '',
    date_naissance: item.date_naissance || '',
    enfants_charge: typeof item.enfants_charge === 'boolean' ? (item.enfants_charge ? 'oui' : 'non') : (item.enfants_charge || '?'),
    lieu_demande: item.lieu_demande || '',
    genre_permis: item.genre_permis || '',
    date_echeance_permis: item.date_echeance_permis || '',
    permis_travail: item.permis_travail || '',
    carte_id: item.carte_id || '',
    numero_avs: item.numero_avs || '',
    iban: item.iban || '',
    numero_quadrigis: item.numero_quadrigis || '',
    has_cv: item.has_cv || false,
    has_cm: item.has_cm || false,
    has_docs_clients: item.has_docs_clients || false,
    remarques: item.remarques || '',
    mission_terminee: item.mission_terminee || '',
    mappe: item.mappe || false,
    docs_manquants: item.docs_manquants || '',
    suisse: item.suisse || false,
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
        genre_permis: form.genre_permis || null,
        date_echeance_permis: form.date_echeance_permis || null,
        permis_travail: form.permis_travail || null,
        carte_id: form.carte_id || '',
        numero_avs: form.numero_avs || null,
        iban: form.iban || null,
        numero_quadrigis: form.numero_quadrigis || null,
        has_cv: form.has_cv,
        has_cm: form.has_cm,
        has_docs_clients: form.has_docs_clients,
        remarques: form.remarques || null,
        mission_terminee: form.mission_terminee || null,
        mappe: form.mappe,
        docs_manquants: form.docs_manquants || null,
        suisse: form.suisse,
        annee: form.annee,
      }
      const url = item ? `/api/secretariat/candidats/${item.id}` : '/api/secretariat/candidats'
      const res = await fetch(url, { method: item ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
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
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)' }}>{item ? 'Modifier' : 'Nouveau candidat'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Lien candidat */}
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
            {form.candidat_id && <div style={{ fontSize: 10, color: '#22C55E', marginTop: 2 }}>✓ Lié au candidat</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Prénom *</label>
              <input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Prénom" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Nom *</label>
              <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Nom" style={S.input} />
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Permis de séjour</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={form.genre_permis} onChange={e => set('genre_permis', e.target.value)} style={{ ...S.input, flex: 1 }}>
                  <option value="">— Sélectionner —</option>
                  <option value="L">L</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="G">G</option>
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
            <label style={S.label}>Lieu de demande</label>
            <input value={form.lieu_demande} onChange={e => set('lieu_demande', e.target.value)} placeholder="Ex: Genève" style={S.input} />
          </div>

          <div>
            <label style={S.label}>Carte d'identité / Passeport</label>
            <input value={form.carte_id} onChange={e => set('carte_id', e.target.value)} placeholder="N° de pièce d'identité" style={S.input} />
          </div>

          {/* Checkboxes documents */}
          <div style={{ background: 'var(--secondary)', border: '1.5px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ ...S.label, marginBottom: 10 }}>Documents reçus</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {[
                { key: 'has_cv', label: 'CV' },
                { key: 'has_cm', label: 'CM' },
                { key: 'has_docs_clients', label: 'Docs Clients' },
                { key: 'mappe', label: 'Mappe' },
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
            </div>
          </div>

          <div>
            <label style={S.label}>Enfants a charge</label>
            <select value={form.enfants_charge as string} onChange={e => set('enfants_charge', e.target.value)} style={S.input}>
              <option value="oui">OUI</option>
              <option value="non">NON</option>
              <option value="?">? (inconnu)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--foreground)' }}>
              <input type="checkbox" checked={!!form.docs_manquants} onChange={e => set('docs_manquants', e.target.checked ? 'x' : '')}
                style={{ width: 15, height: 15, accentColor: '#EF4444', cursor: 'pointer' }} />
              Docs manquants
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Mission terminée (date)</label>
              <input type="date" value={form.mission_terminee} onChange={e => set('mission_terminee', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
            </div>
            <div>
              <label style={S.label}>Année</label>
              <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={{ ...S.input }}>
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
              </select>
            </div>
          </div>

          <div>
            <label style={S.label}>Remarques</label>
            <textarea value={form.remarques} onChange={e => set('remarques', e.target.value)} placeholder="Commentaires…" rows={2} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
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
  type_cas: 'Accident' as 'Accident' | 'Maladie',
  sous_type: '',
  raison: '',
  numero_sinistre: '',
  date_debut: '',
  date_fin: '',
  assurance_payee_jusqu_au: '',
  licenciement_pour_le: '',
  remarque: '',
  termine: false,
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
      const payload = {
        candidat_id: form.candidat_id || null,
        nom_prenom: form.nom_prenom,
        type_cas: form.type_cas,
        sous_type: form.sous_type || null,
        raison: form.raison || null,
        numero_sinistre: form.numero_sinistre || null,
        date_debut: form.date_debut || null,
        date_fin: form.date_fin || null,
        assurance_payee_jusqu_au: form.assurance_payee_jusqu_au || null,
        licenciement_pour_le: form.licenciement_pour_le || null,
        remarque: form.remarque || null,
        termine: form.termine,
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
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)' }}>{item ? 'Modifier le cas' : 'Nouveau cas'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={S.label}>Lier à un candidat TalentFlow</label>
            <CandidatAutocomplete
              value={form.candidat_nom_complet}
              onChange={(nom, id, candidat) => setForm(f => ({
                ...f,
                candidat_nom_complet: nom,
                candidat_id: id,
                nom_prenom: candidat ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ') : f.nom_prenom,
              }))}
            />
          </div>

          <div>
            <label style={S.label}>Nom / Prénom *</label>
            <input value={form.nom_prenom} onChange={e => set('nom_prenom', e.target.value)} placeholder="Prénom Nom" style={S.input} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Type de cas</label>
              <select value={form.type_cas} onChange={e => set('type_cas', e.target.value as 'Accident' | 'Maladie')} style={{ ...S.input }}>
                <option value="Accident">Accident</option>
                <option value="Maladie">Maladie</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Sous-type</label>
              <input value={form.sous_type} onChange={e => set('sous_type', e.target.value)} placeholder="Ex: Professionnel, Sportif…" style={S.input} />
            </div>
          </div>

          <div>
            <label style={S.label}>Raison / Description</label>
            <input value={form.raison} onChange={e => set('raison', e.target.value)} placeholder="Description du cas…" style={S.input} />
          </div>

          <div>
            <label style={S.label}>N° Sinistre</label>
            <input value={form.numero_sinistre} onChange={e => set('numero_sinistre', e.target.value)} placeholder="N° de sinistre" style={S.input} />
          </div>

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

          <div>
            <label style={S.label}>Décision</label>
            <input value={form.decision} onChange={e => set('decision', e.target.value)} placeholder="Décision prise…" style={S.input} />
          </div>

          <div>
            <label style={S.label}>Note interne</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} placeholder="Note…" rows={2} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div>
            <label style={S.label}>Remarque</label>
            <textarea value={form.remarque} onChange={e => set('remarque', e.target.value)} placeholder="Remarques…" rows={2} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Couleur alerte</label>
              <select value={form.couleur} onChange={e => set('couleur', e.target.value as 'normal' | 'jaune' | 'rouge')} style={{ ...S.input }}>
                <option value="normal">Normal</option>
                <option value="jaune">Jaune (attention)</option>
                <option value="rouge">Rouge (urgent)</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Année</label>
              <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={{ ...S.input }}>
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--foreground)' }}>
                <input type="checkbox" checked={form.termine} onChange={e => set('termine', e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                Cas terminé
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={13} />}{item ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Modal Loyer ──────────────────────────────────────────────────────────────

const EMPTY_LOYER_FORM = {
  candidat_id: null as string | null,
  candidat_nom_complet: '',
  nom_prenom: '',
  adresse: '',
  montant_loyer: '',
  date_debut: '',
  date_fin: '',
  remarques: '',
  annee: new Date().getFullYear(),
}

function LoyerModal({ item, onClose, onSaved }: { item?: SecretariatLoyer | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => item ? {
    candidat_id: item.candidat_id,
    candidat_nom_complet: item.nom_prenom || '',
    nom_prenom: item.nom_prenom || '',
    adresse: item.adresse || '',
    montant_loyer: item.montant_loyer != null ? String(item.montant_loyer) : '',
    date_debut: item.date_debut || '',
    date_fin: item.date_fin || '',
    remarques: item.remarques || '',
    annee: item.annee || new Date().getFullYear(),
  } : { ...EMPTY_LOYER_FORM, annee: new Date().getFullYear() })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nom_prenom) { toast.error('Nom / Prénom requis'); return }
    setSaving(true)
    try {
      const payload = {
        candidat_id: form.candidat_id || null,
        nom_prenom: form.nom_prenom,
        adresse: form.adresse || null,
        montant_loyer: form.montant_loyer !== '' ? Number(form.montant_loyer) : null,
        date_debut: form.date_debut || null,
        date_fin: form.date_fin || null,
        remarques: form.remarques || null,
        annee: form.annee,
      }
      const url = item ? `/api/secretariat/loyers/${item.id}` : '/api/secretariat/loyers'
      const res = await fetch(url, { method: item ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      toast.success(item ? 'Loyer modifié' : 'Loyer créé')
      onSaved(); onClose()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)' }}>{item ? 'Modifier le loyer' : 'Nouveau loyer'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={S.label}>Lier à un candidat TalentFlow</label>
            <CandidatAutocomplete
              value={form.candidat_nom_complet}
              onChange={(nom, id, candidat) => setForm(f => ({
                ...f,
                candidat_nom_complet: nom,
                candidat_id: id,
                nom_prenom: candidat ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ') : f.nom_prenom,
              }))}
            />
          </div>

          <div>
            <label style={S.label}>Nom / Prénom *</label>
            <input value={form.nom_prenom} onChange={e => set('nom_prenom', e.target.value)} placeholder="Prénom Nom" style={S.input} />
          </div>

          <div>
            <label style={S.label}>Adresse</label>
            <input value={form.adresse} onChange={e => set('adresse', e.target.value)} placeholder="Adresse complète" style={S.input} />
          </div>

          <div>
            <label style={S.label}>Montant loyer (CHF/mois)</label>
            <input type="number" value={form.montant_loyer} onChange={e => set('montant_loyer', e.target.value)} placeholder="0.00" step="0.01" style={S.input} />
          </div>

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

          <div>
            <label style={S.label}>Année</label>
            <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={{ ...S.input }}>
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>

          <div>
            <label style={S.label}>Remarques</label>
            <textarea value={form.remarques} onChange={e => set('remarques', e.target.value)} placeholder="Commentaires…" rows={2} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
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
  date_debut_alfa: '',
  date_fin_alfa: '',
  date_radiation_caf: '',
  radiation_recue: '',
  mere_touche: '',
  remarques: '',
  demande_envoyee: '',
  reactivation_envoyee: '',
  lieu_enfants: '',
  consimo: '',
  termine: false,
  annee: new Date().getFullYear(),
}

function AlfaModal({ item, onClose, onSaved }: { item?: SecretariatAlfa | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => item ? {
    candidat_id: item.candidat_id,
    candidat_nom_complet: [item.prenom, item.nom].filter(Boolean).join(' '),
    nom: item.nom || '',
    prenom: item.prenom || '',
    numero_avs: item.numero_avs || '',
    nbr_enfants: item.nbr_enfants != null ? String(item.nbr_enfants) : '',
    montant_chf: item.montant_chf != null ? String(item.montant_chf) : '',
    bareme_is: item.bareme_is || '',
    date_debut_alfa: item.date_debut_alfa || '',
    date_fin_alfa: item.date_fin_alfa || '',
    date_radiation_caf: item.date_radiation_caf || '',
    radiation_recue: item.radiation_recue || '',
    mere_touche: item.mere_touche || '',
    remarques: item.remarques || '',
    demande_envoyee: item.demande_envoyee || '',
    reactivation_envoyee: item.reactivation_envoyee || '',
    lieu_enfants: item.lieu_enfants || '',
    consimo: item.consimo || '',
    termine: item.termine || false,
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
        date_debut_alfa: form.date_debut_alfa || null,
        date_fin_alfa: form.date_fin_alfa || null,
        date_radiation_caf: form.date_radiation_caf || null,
        radiation_recue: form.radiation_recue || null,
        mere_touche: form.mere_touche || null,
        remarques: form.remarques || null,
        demande_envoyee: form.demande_envoyee || null,
        reactivation_envoyee: form.reactivation_envoyee || null,
        lieu_enfants: form.lieu_enfants || null,
        consimo: form.consimo || null,
        termine: form.termine,
        annee: form.annee,
      }
      const url = item ? `/api/secretariat/alfa/${item.id}` : '/api/secretariat/alfa'
      const res = await fetch(url, { method: item ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      toast.success(item ? 'ALFA modifié' : 'ALFA créé')
      onSaved(); onClose()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)' }}>{item ? 'Modifier ALFA' : 'Nouveau suivi ALFA'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            <div><label style={S.label}>Prénom</label><input value={form.prenom} onChange={e => set('prenom', e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Nom *</label><input value={form.nom} onChange={e => set('nom', e.target.value)} style={S.input} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>N° AVS</label><input value={form.numero_avs} onChange={e => set('numero_avs', e.target.value)} placeholder="756.XXXX.XXXX.XX" style={S.input} /></div>
            <div><label style={S.label}>Nbr enfants</label><input type="number" value={form.nbr_enfants} onChange={e => set('nbr_enfants', e.target.value)} style={S.input} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>Montant CHF</label><input type="number" step="0.01" value={form.montant_chf} onChange={e => set('montant_chf', e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Barème IS</label><input value={form.bareme_is} onChange={e => set('bareme_is', e.target.value)} style={S.input} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>Date début ALFA</label><input type="date" value={form.date_debut_alfa} onChange={e => set('date_debut_alfa', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} /></div>
            <div><label style={S.label}>Date fin ALFA</label><input type="date" value={form.date_fin_alfa} onChange={e => set('date_fin_alfa', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>Radiation CAF (date)</label><input type="date" value={form.date_radiation_caf} onChange={e => set('date_radiation_caf', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} /></div>
            <div><label style={S.label}>Radiation reçue</label><input value={form.radiation_recue} onChange={e => set('radiation_recue', e.target.value)} style={S.input} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>Mère touche</label><input value={form.mere_touche} onChange={e => set('mere_touche', e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Lieu enfants</label><input value={form.lieu_enfants} onChange={e => set('lieu_enfants', e.target.value)} style={S.input} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>Demande envoyée</label><input value={form.demande_envoyee} onChange={e => set('demande_envoyee', e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Réactivation envoyée</label><input value={form.reactivation_envoyee} onChange={e => set('reactivation_envoyee', e.target.value)} style={S.input} /></div>
          </div>

          <div><label style={S.label}>Consimo</label><input value={form.consimo} onChange={e => set('consimo', e.target.value)} style={S.input} /></div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Année</label>
              <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={S.input}>
                <option value={2026}>2026</option><option value={2025}>2025</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--foreground)' }}>
                <input type="checkbox" checked={form.termine} onChange={e => set('termine', e.target.checked)} style={{ width: 15, height: 15, accentColor: '#22C55E', cursor: 'pointer' }} />
                Terminé
              </label>
            </div>
          </div>

          <div><label style={S.label}>Remarques</label><textarea value={form.remarques} onChange={e => set('remarques', e.target.value)} rows={2} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} /></div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
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
  date_fin_mission: '',
  statut_termine: false,
  dernier_mois_paye: '',
  prochain_mois_paye: '',
  remarques: '',
  annee: new Date().getFullYear(),
}

function AlfaPaiementModal({ item, onClose, onSaved }: { item?: SecretariatAlfaPaiement | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => item ? {
    candidat_id: item.candidat_id,
    candidat_nom_complet: [item.prenom, item.nom].filter(Boolean).join(' '),
    nom: item.nom || '',
    prenom: item.prenom || '',
    numero_avs: item.numero_avs || '',
    nbr_enfants: item.nbr_enfants != null ? String(item.nbr_enfants) : '',
    date_validite_decision: item.date_validite_decision || '',
    droit_chf_mois: item.droit_chf_mois != null ? String(item.droit_chf_mois) : '',
    montant_alfa_paye: item.montant_alfa_paye != null ? String(item.montant_alfa_paye) : '',
    annee_periode: item.annee_periode || '',
    alfa_dernier_mois: item.alfa_dernier_mois || '',
    date_fin_mission: item.date_fin_mission || '',
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
        date_fin_mission: form.date_fin_mission || null,
        statut_termine: form.statut_termine,
        dernier_mois_paye: form.dernier_mois_paye || null,
        prochain_mois_paye: form.prochain_mois_paye || null,
        remarques: form.remarques || null,
        annee: form.annee,
      }
      const url = item ? `/api/secretariat/alfa-paiements/${item.id}` : '/api/secretariat/alfa-paiements'
      const res = await fetch(url, { method: item ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      toast.success(item ? 'Paiement modifié' : 'Paiement créé')
      onSaved(); onClose()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)' }}>{item ? 'Modifier paiement ALFA' : 'Nouveau paiement ALFA'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            <div><label style={S.label}>Prénom</label><input value={form.prenom} onChange={e => set('prenom', e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Nom *</label><input value={form.nom} onChange={e => set('nom', e.target.value)} style={S.input} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>N° AVS</label><input value={form.numero_avs} onChange={e => set('numero_avs', e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Nbr enfants</label><input type="number" value={form.nbr_enfants} onChange={e => set('nbr_enfants', e.target.value)} style={S.input} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>Droit CHF/mois</label><input type="number" step="0.01" value={form.droit_chf_mois} onChange={e => set('droit_chf_mois', e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Montant ALFA payé</label><input type="number" step="0.01" value={form.montant_alfa_paye} onChange={e => set('montant_alfa_paye', e.target.value)} style={S.input} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>Période (année)</label><input value={form.annee_periode} onChange={e => set('annee_periode', e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Validité décision</label><input type="date" value={form.date_validite_decision} onChange={e => set('date_validite_decision', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>Dernier mois payé</label><input value={form.dernier_mois_paye} onChange={e => set('dernier_mois_paye', e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Prochain mois à payer</label><input value={form.prochain_mois_paye} onChange={e => set('prochain_mois_paye', e.target.value)} style={S.input} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={S.label}>Fin mission</label><input type="date" value={form.date_fin_mission} onChange={e => set('date_fin_mission', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} /></div>
            <div>
              <label style={S.label}>Année</label>
              <select value={form.annee} onChange={e => set('annee', Number(e.target.value))} style={S.input}>
                <option value={2026}>2026</option><option value={2025}>2025</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--foreground)' }}>
              <input type="checkbox" checked={form.statut_termine} onChange={e => set('statut_termine', e.target.checked)} style={{ width: 15, height: 15, accentColor: '#22C55E', cursor: 'pointer' }} />
              Terminé
            </label>
          </div>

          <div><label style={S.label}>Remarques</label><textarea value={form.remarques} onChange={e => set('remarques', e.target.value)} rows={2} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} /></div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
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
          <AlertTriangle size={20} color="#EF4444" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--foreground)' }}>Confirmer la suppression</h2>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>Supprimer <strong style={{ color: 'var(--foreground)' }}>{label}</strong> ? Cette action est irréversible.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleConfirm} disabled={deleting} style={{ padding: '8px 16px', borderRadius: 8, background: '#EF4444', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {deleting && <Loader2 size={13} />}Supprimer
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── CandidatsTable ───────────────────────────────────────────────────────────

function DocBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700,
      background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
      color: ok ? '#22C55E' : 'var(--muted)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
    }}>
      {ok ? '✓' : '·'} {label}
    </span>
  )
}

function PermisBadge({ genre, dateEcheance }: { genre: string | null; dateEcheance: string | null }) {
  const color = getPermisColor(dateEcheance)
  const colorMap = {
    green: { bg: 'rgba(34,197,94,0.12)', fg: '#22C55E', border: 'rgba(34,197,94,0.3)' },
    yellow: { bg: 'rgba(234,179,8,0.12)', fg: '#CA8A04', border: 'rgba(234,179,8,0.3)' },
    red: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444', border: 'rgba(239,68,68,0.3)' },
    gray: { bg: 'rgba(100,116,139,0.08)', fg: 'var(--muted)', border: 'var(--border)' },
  }
  const c = colorMap[color]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {genre && <span style={{ padding: '2px 7px', borderRadius: 99, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, border: `1px solid ${c.border}`, display: 'inline-block' }}>{genre}</span>}
      {dateEcheance && <span style={{ fontSize: 12, color: c.fg, fontWeight: 700 }}>{formatDate(dateEcheance)}</span>}
      {!genre && !dateEcheance && <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
    </div>
  )
}

function StatutIndicateur({ statut }: { statut: 'ok' | 'warning' | 'urgent' }) {
  const map = {
    ok: { color: '#22C55E', label: 'OK' },
    warning: { color: '#CA8A04', label: '!' },
    urgent: { color: '#EF4444', label: '!!' },
  }
  const c = map[statut]
  return (
    <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0 }} title={c.label} />
  )
}

function CandidatsTable({ candidats, onEdit, onDelete, selectedIds, onToggleSelect, onSelectAll, onColorChange }: {
  candidats: SecretariatCandidat[]
  onEdit: (c: SecretariatCandidat) => void
  onDelete: (c: SecretariatCandidat) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: (all: boolean) => void
  onColorChange: (id: string, color: string) => void
}) {
  const [sort, setSort] = useState<{ col: string; dir: SortDir }>({ col: '', dir: null })
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})

  if (candidats.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
        <User size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
        <div style={{ fontSize: 14 }}>Aucun candidat pour cette année</div>
      </div>
    )
  }

  const toggleSort = (col: string) => setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc' } : { col, dir: 'asc' })
  const setFilter = (col: string, sel: Set<string> | null) => setFilters(prev => ({ ...prev, [col]: sel }))

  const getVal = (c: SecretariatCandidat, col: string): string => {
    if (col === 'nom') return `${c.prenom} ${c.nom}`.trim()
    if (col === 'permis') return c.genre_permis || '—'
    if (col === 'enfants') return c.enfants_charge === 'oui' ? 'Oui' : c.enfants_charge === 'non' ? 'Non' : '?'
    if (col === 'statut') { const s = getLigneStatut(c); return s === 'ok' ? 'OK' : s === 'warning' ? 'Attention' : 'Urgent' }
    if (col === 'docs') return c.docs_manquants ? 'Manquants' : 'Complet'
    return ''
  }

  let displayed = candidats.filter(c => {
    for (const [col, sel] of Object.entries(filters)) {
      if (sel === null) continue
      if (!sel.has(getVal(c, col))) return false
    }
    return true
  })

  if (sort.dir && sort.col) {
    displayed = [...displayed].sort((a, b) => {
      const va = getVal(a, sort.col).toLowerCase()
      const vb = getVal(b, sort.col).toLowerCase()
      return sort.dir === 'desc' ? vb.localeCompare(va, 'fr') : va.localeCompare(vb, 'fr')
    })
  }

  const thStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: '8px 6px', textAlign: 'center', width: 30 }}>
              <input type="checkbox" checked={displayed.length > 0 && selectedIds.size === displayed.length} onChange={e => onSelectAll(e.target.checked)} style={{ width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' }} />
            </th>
            <SortableHeader label="Candidat" sortDir={sort.col === 'nom' ? sort.dir : null} onSort={() => toggleSort('nom')} style={thStyle} />
            <th style={thStyle}>N° Quad</th>
            <SortableHeader label="Permis" sortDir={sort.col === 'permis' ? sort.dir : null} onSort={() => toggleSort('permis')} style={thStyle}
              filterValues={candidats.map(c => getVal(c, 'permis'))} filterSelected={filters.permis ?? null} onFilter={s => setFilter('permis', s)} />
            <SortableHeader label="Enfants" sortDir={sort.col === 'enfants' ? sort.dir : null} onSort={() => toggleSort('enfants')} style={thStyle}
              filterValues={candidats.map(c => getVal(c, 'enfants'))} filterSelected={filters.enfants ?? null} onFilter={s => setFilter('enfants', s)} />
            <th style={thStyle}>Documents</th>
            <th style={thStyle}>Remarques</th>
            <th style={thStyle}>Fin mission</th>
            <SortableHeader label="Docs manq." sortDir={sort.col === 'docs' ? sort.dir : null} onSort={() => toggleSort('docs')} style={thStyle}
              filterValues={candidats.map(c => getVal(c, 'docs'))} filterSelected={filters.docs ?? null} onFilter={s => setFilter('docs', s)} />
            <SortableHeader label="Statut" sortDir={sort.col === 'statut' ? sort.dir : null} onSort={() => toggleSort('statut')} style={thStyle}
              filterValues={candidats.map(c => getVal(c, 'statut'))} filterSelected={filters.statut ?? null} onFilter={s => setFilter('statut', s)} />
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {displayed.map(c => {
            const statut = getLigneStatut(c)
            const telCleaned = cleanPhone(c.tel || null)
            const rowBg = ROW_COLORS.find(rc => rc.key === (c.couleur || ''))?.bg || 'transparent'
            return (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s', background: rowBg }}
                onMouseEnter={e => { if (!c.couleur) e.currentTarget.style.background = 'var(--secondary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
              >
                <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => onToggleSelect(c.id)} style={{ width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                </td>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {c.photo_url && c.photo_url !== 'checked'
                      ? <img src={c.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>{getInitiales(c.nom, c.prenom)}</div>
                    }
                    <div>
                      {c.candidat_id
                        ? <a href={`/candidats/${c.candidat_id}`} style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', textDecoration: 'none' }} title="Voir fiche">{c.prenom} {c.nom}</a>
                        : <span style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>{c.prenom} {c.nom}</span>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PermisBadge genre={c.genre_permis} dateEcheance={c.date_echeance_permis} />
                    {c.suisse && <span style={{ padding: '2px 6px', borderRadius: 99, fontSize: 9, fontWeight: 800, background: 'rgba(220,38,38,0.1)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.25)', whiteSpace: 'nowrap' }}>🇨🇭 CH</span>}
                  </div>
                </td>
                <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.enfants_charge === 'oui' ? '#22C55E' : c.enfants_charge === 'non' ? 'var(--muted)' : '#F59E0B' }}>
                    {c.enfants_charge === 'oui' ? '👶 Oui' : c.enfants_charge === 'non' ? 'Non' : '?'}
                  </span>
                </td>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    <DocBadge ok={c.has_cv} label="CV" /><DocBadge ok={c.has_cm} label="CM" /><DocBadge ok={!!c.carte_id} label="ID" /><DocBadge ok={!!c.numero_avs} label="AVS" /><DocBadge ok={!!c.iban} label="IBAN" /><DocBadge ok={c.has_docs_clients} label="Docs Client" />
                  </div>
                </td>
                <td style={{ padding: '10px 10px', maxWidth: 200 }}>
                  {c.remarques ? <div title={c.remarques} onClick={e => { const el = e.currentTarget; if (el.style.whiteSpace === 'normal') { el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis' } else { el.style.whiteSpace = 'normal'; el.style.overflow = 'visible'; el.style.textOverflow = 'unset' } }} style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', lineHeight: 1.4 }}>{c.remarques}</div> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '10px 10px' }}><span style={{ fontSize: 12, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>{formatDate(c.mission_terminee)}</span></td>
                <td style={{ padding: '10px 10px', textAlign: 'center' }}>{c.docs_manquants ? <span title={c.docs_manquants} style={{ cursor: 'help', fontSize: 16 }}>⚠️</span> : <span style={{ color: '#22C55E', fontSize: 14 }}>✓</span>}</td>
                <td style={{ padding: '10px 10px', textAlign: 'center' }}><StatutIndicateur statut={statut} /></td>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <ColorPicker currentColor={c.couleur || null} onChange={color => onColorChange(c.id, color)} />
                    <button onClick={() => onEdit(c)} title="Modifier" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={13} /></button>
                    <button onClick={() => onDelete(c)} title="Supprimer" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
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

function AccidentCard({ accident, onEdit, onDelete, onColorChange, onArchive }: { accident: SecretariatAccident; onEdit: () => void; onDelete: () => void; onColorChange: (color: string) => void; onArchive: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const telCleaned = cleanPhone(accident.tel || null)
  const rowBg = ROW_COLORS.find(rc => rc.key === (accident.couleur || ''))?.bg || 'transparent'

  return (
    <div style={{ ...S.card, padding: 16, background: rowBg !== 'transparent' ? rowBg : undefined, opacity: accident.archive ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {accident.photo_url && accident.photo_url !== 'checked'
          ? <img src={accident.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
              {(accident.nom_prenom || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase()}
            </div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              {accident.candidat_id
                ? <a href={`/candidats/${accident.candidat_id}`} style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', textDecoration: 'none' }} title="Voir fiche">{accident.nom_prenom}</a>
                : <div style={{ fontWeight: 700, fontSize: 14 }}>{accident.nom_prenom}</div>
              }
              <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: accident.type_cas === 'Accident' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)', color: accident.type_cas === 'Accident' ? '#EF4444' : '#CA8A04' }}>{accident.type_cas}</span>
                {accident.sous_type && <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: 'var(--secondary)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{accident.sous_type}</span>}
                <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: accident.termine ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)', color: accident.termine ? '#22C55E' : '#818CF8' }}>
                  {accident.termine ? '✓ Terminé' : '● En cours'}
                </span>
                {accident.archive && <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(100,116,139,0.1)', color: 'var(--muted)', border: '1px solid var(--border)' }}>📦 Archivé</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {telCleaned && <a href={`https://wa.me/${telCleaned}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 8px', borderRadius: 6, background: 'rgba(37,211,102,0.1)', color: '#25D366', textDecoration: 'none', border: '1px solid rgba(37,211,102,0.2)' }}><WaIcon size={12} /></a>}
              {accident.email && <a href={`mailto:${accident.email}`} style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', color: '#6366F1', textDecoration: 'none', border: '1px solid rgba(99,102,241,0.2)' }}><Mail size={11} /></a>}
              {accident.termine && (
                <button onClick={onArchive} title={accident.archive ? 'Désarchiver' : 'Archiver'} style={{ padding: '5px 8px', borderRadius: 6, background: accident.archive ? 'rgba(100,116,139,0.1)' : 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 600, gap: 3 }}>
                  📦
                </button>
              )}
              <ColorPicker currentColor={accident.couleur || null} onChange={onColorChange} />
              <button onClick={onEdit} title="Modifier" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={13} /></button>
              <button onClick={onDelete} title="Supprimer" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
            </div>
          </div>
          {(accident.raison || accident.numero_sinistre || accident.decision || accident.note || accident.remarque) && (
            <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              {accident.raison && <span style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--foreground)' }}>Raison :</strong> {accident.raison}</span>}
              {accident.numero_sinistre && <span style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--foreground)' }}>Sinistre :</strong> {accident.numero_sinistre}</span>}
              {accident.decision && <span style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--foreground)' }}>Décision :</strong> {accident.decision}</span>}
              {accident.note && <span style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--foreground)' }}>Note :</strong> {accident.note}</span>}
              {accident.remarque && <span style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--foreground)' }}>Remarque :</strong> {accident.remarque}</span>}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              Détails timeline
            </button>
            {expanded && (
              <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                {[
                  { label: 'Début', value: formatDate(accident.date_debut), icon: Calendar },
                  { label: 'Fin', value: formatDate(accident.date_fin), icon: Calendar },
                  { label: 'Assurance jusqu\'au', value: formatDate(accident.assurance_payee_jusqu_au), icon: CheckCircle2 },
                  { label: 'Licenciement le', value: formatDate(accident.licenciement_pour_le), icon: AlertCircle },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} style={{ minWidth: 130 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: value === '—' ? 'var(--muted)' : 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon size={12} style={{ color: 'var(--muted)' }} />{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AccidentsTable({ accidents, onEdit, onDelete, onColorChange, onArchive }: { accidents: SecretariatAccident[]; onEdit: (a: SecretariatAccident) => void; onDelete: (a: SecretariatAccident) => void; onColorChange: (id: string, color: string) => void; onArchive: (a: SecretariatAccident) => void }) {
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [filterType, setFilterType] = useState<Set<string> | null>(null)
  const [filterStatut, setFilterStatut] = useState<Set<string> | null>(null)

  if (accidents.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
        <AlertCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
        <div style={{ fontSize: 14 }}>Aucun cas pour cette année</div>
      </div>
    )
  }

  let displayed = accidents.filter(a => {
    if (filterType !== null && !filterType.has(a.type_cas)) return false
    const statut = a.termine ? 'Terminé' : 'En cours'
    if (filterStatut !== null && !filterStatut.has(statut)) return false
    return true
  })

  if (sortDir) {
    displayed = [...displayed].sort((a, b) => {
      const va = (a.nom_prenom || '').toLowerCase()
      const vb = (b.nom_prenom || '').toLowerCase()
      return sortDir === 'desc' ? vb.localeCompare(va, 'fr') : va.localeCompare(vb, 'fr')
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: sortDir ? 'var(--primary)' : 'var(--secondary)', color: sortDir ? '#fff' : 'var(--muted)', border: `1.5px solid ${sortDir ? 'var(--primary)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: 3 }}>
            {sortDir === 'asc' ? <ArrowUp size={10} /> : sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUpDown size={10} />} Nom
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          Type <ColumnFilter values={accidents.map(a => a.type_cas)} selected={filterType} onChange={setFilterType} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          Statut <ColumnFilter values={accidents.map(a => a.termine ? 'Terminé' : 'En cours')} selected={filterStatut} onChange={setFilterStatut} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{displayed.length} / {accidents.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {displayed.map(a => (
          <AccidentCard key={a.id} accident={a} onEdit={() => onEdit(a)} onDelete={() => onDelete(a)} onColorChange={color => onColorChange(a.id, color)} onArchive={() => onArchive(a)} />
        ))}
      </div>
    </div>
  )
}

// ─── LoyersTable ──────────────────────────────────────────────────────────────

function LoyersTable({ loyers, onEdit, onDelete, onColorChange }: { loyers: SecretariatLoyer[]; onEdit: (l: SecretariatLoyer) => void; onDelete: (l: SecretariatLoyer) => void; onColorChange: (id: string, color: string) => void }) {
  const [sort, setSort] = useState<{ col: string; dir: SortDir }>({ col: '', dir: null })

  if (loyers.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
        <Home size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
        <div style={{ fontSize: 14 }}>Aucun loyer pour cette année</div>
      </div>
    )
  }

  const toggleSort = (col: string) => setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc' } : { col, dir: 'asc' })

  let displayed = [...loyers]
  if (sort.dir && sort.col) {
    displayed.sort((a, b) => {
      let va = '', vb = ''
      if (sort.col === 'nom') { va = (a.nom_prenom || '').toLowerCase(); vb = (b.nom_prenom || '').toLowerCase() }
      if (sort.col === 'montant') { return sort.dir === 'desc' ? (b.montant_loyer || 0) - (a.montant_loyer || 0) : (a.montant_loyer || 0) - (b.montant_loyer || 0) }
      return sort.dir === 'desc' ? vb.localeCompare(va, 'fr') : va.localeCompare(vb, 'fr')
    })
  }

  const thStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <SortableHeader label="Candidat" sortDir={sort.col === 'nom' ? sort.dir : null} onSort={() => toggleSort('nom')} style={thStyle} />
            <th style={thStyle}>Adresse</th>
            <SortableHeader label="Montant/mois" sortDir={sort.col === 'montant' ? sort.dir : null} onSort={() => toggleSort('montant')} style={thStyle} />
            <th style={thStyle}>Début</th>
            <th style={thStyle}>Fin</th>
            <th style={thStyle}>Remarques</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {displayed.map(l => {
            const telCleaned = cleanPhone(l.tel || null)
            const rowBg = ROW_COLORS.find(c => c.key === (l.couleur || ''))?.bg || 'transparent'
            return (
              <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s', background: rowBg }}
                onMouseEnter={e => { if (!l.couleur) e.currentTarget.style.background = 'var(--secondary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
              >
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {l.photo_url && l.photo_url !== 'checked'
                      ? <img src={l.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>{(l.nom_prenom || '?').split(' ').slice(0, 2).map((w: string) => w[0] || '').join('').toUpperCase()}</div>
                    }
                    <div>
                      {l.candidat_id
                        ? <a href={`/candidats/${l.candidat_id}`} style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', textDecoration: 'none' }} title="Voir fiche">{l.nom_prenom}</a>
                        : <div style={{ fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>{l.nom_prenom}</div>
                      }
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        {telCleaned && <a href={`https://wa.me/${telCleaned}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 5, background: 'rgba(37,211,102,0.1)', color: '#25D366', fontSize: 9, fontWeight: 600, textDecoration: 'none' }}><WaIcon size={10} /> WA</a>}
                        {l.email && <a href={`mailto:${l.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 5, background: 'rgba(99,102,241,0.1)', color: '#6366F1', fontSize: 9, fontWeight: 600, textDecoration: 'none' }}><Mail size={8} /> Mail</a>}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 10px' }}><span style={{ fontSize: 12 }}>{l.adresse || '—'}</span></td>
                <td style={{ padding: '10px 10px' }}><span style={{ fontSize: 13, fontWeight: 700 }}>{l.montant_loyer != null ? formatCHF(l.montant_loyer) : '—'}</span></td>
                <td style={{ padding: '10px 10px' }}><span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(l.date_debut)}</span></td>
                <td style={{ padding: '10px 10px' }}><span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(l.date_fin)}</span></td>
                <td style={{ padding: '10px 10px', maxWidth: 200 }}>
                  {l.remarques ? <div title={l.remarques} onClick={e => { const el = e.currentTarget; if (el.style.whiteSpace === 'normal') { el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis' } else { el.style.whiteSpace = 'normal'; el.style.overflow = 'visible'; el.style.textOverflow = 'unset' } }} style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', lineHeight: 1.4 }}>{l.remarques}</div> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <ColorPicker currentColor={l.couleur || null} onChange={color => onColorChange(l.id, color)} />
                    <button onClick={() => onEdit(l)} title="Modifier" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={13} /></button>
                    <button onClick={() => onDelete(l)} title="Supprimer" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
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

// ─── AlfaTable ────────────────────────────────────────────────────────────────

function AlfaTable({ rows, onEdit, onDelete, onColorChange }: { rows: SecretariatAlfa[]; onEdit: (a: SecretariatAlfa) => void; onDelete: (a: SecretariatAlfa) => void; onColorChange: (id: string, color: string) => void }) {
  const [sort, setSort] = useState<{ col: string; dir: SortDir }>({ col: '', dir: null })
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})

  if (rows.length === 0) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucune entrée ALFA pour cette année.</div>
  }

  const toggleSort = (col: string) => setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc' } : { col, dir: 'asc' })
  const setFilter = (col: string, sel: Set<string> | null) => setFilters(prev => ({ ...prev, [col]: sel }))

  const getVal = (a: SecretariatAlfa, col: string): string => {
    if (col === 'nom') return `${a.prenom} ${a.nom}`.trim()
    if (col === 'lieu') return a.lieu_enfants || ''
    if (col === 'consimo') return a.consimo || ''
    if (col === 'termine') return a.termine ? 'Terminé' : 'En cours'
    if (col === 'mere') return a.mere_touche || ''
    return ''
  }

  let displayed = rows.filter(a => {
    for (const [col, sel] of Object.entries(filters)) {
      if (sel === null) continue
      if (!sel.has(getVal(a, col))) return false
    }
    return true
  })

  if (sort.dir && sort.col) {
    displayed = [...displayed].sort((a, b) => {
      const va = getVal(a, sort.col).toLowerCase()
      const vb = getVal(b, sort.col).toLowerCase()
      const cmp = va.localeCompare(vb, 'fr')
      return sort.dir === 'desc' ? -cmp : cmp
    })
  }

  const thStyle: React.CSSProperties = { padding: '10px 8px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1.5px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--secondary)' }
  const tdStyle: React.CSSProperties = { padding: '7px 8px', fontSize: 11, color: 'var(--foreground)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }
  const hasFilters = Object.values(filters).some(v => v !== null)

  return (
    <div style={{ overflowX: 'auto' }}>
      {hasFilters && (
        <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setFilters({})} style={{ padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>✕ Effacer filtres</button>
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortableHeader label="Prénom Nom" sortDir={sort.col === 'nom' ? sort.dir : null} onSort={() => toggleSort('nom')} style={thStyle}
              filterValues={rows.map(a => `${a.prenom} ${a.nom}`.trim())} filterSelected={filters['nom']} onFilter={s => setFilter('nom', s)} />
            <th style={thStyle}>N° AVS</th>
            <th style={thStyle}>Enf.</th>
            <th style={thStyle}>Montant</th>
            <th style={thStyle}>Barème IS</th>
            <th style={thStyle}>Début</th>
            <th style={thStyle}>Fin</th>
            <th style={thStyle}>Rad. CAF</th>
            <th style={thStyle}>Rad. reçue</th>
            <SortableHeader label="Mère touche" sortDir={sort.col === 'mere' ? sort.dir : null} onSort={() => toggleSort('mere')} style={thStyle}
              filterValues={rows.map(a => a.mere_touche || '(vide)')} filterSelected={filters['mere']} onFilter={s => setFilter('mere', s)} />
            <th style={thStyle}>Dem. env.</th>
            <th style={thStyle}>Réact. env.</th>
            <SortableHeader label="Lieu enf." sortDir={sort.col === 'lieu' ? sort.dir : null} onSort={() => toggleSort('lieu')} style={thStyle}
              filterValues={rows.map(a => a.lieu_enfants || '(vide)')} filterSelected={filters['lieu']} onFilter={s => setFilter('lieu', s)} />
            <SortableHeader label="Consimo" sortDir={sort.col === 'consimo' ? sort.dir : null} onSort={() => toggleSort('consimo')} style={thStyle}
              filterValues={rows.map(a => a.consimo || '(vide)')} filterSelected={filters['consimo']} onFilter={s => setFilter('consimo', s)} />
            <SortableHeader label="Statut" sortDir={sort.col === 'termine' ? sort.dir : null} onSort={() => toggleSort('termine')} style={thStyle}
              filterValues={rows.map(a => a.termine ? 'Terminé' : 'En cours')} filterSelected={filters['termine']} onFilter={s => setFilter('termine', s)} />
            <th style={thStyle}>Remarques</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {displayed.map(a => (
            <tr key={a.id} style={{ background: a.couleur ? (ROW_COLORS.find(c => c.key === a.couleur)?.bg || 'transparent') : (a.termine ? 'rgba(34,197,94,0.10)' : 'transparent') }}>
              <td style={tdStyle}>
                {a.candidat_id
                  ? <a href={`/candidats/${a.candidat_id}`} style={{ fontWeight: 700, fontSize: 12, color: 'var(--foreground)', textDecoration: 'none' }} title="Voir fiche">{a.prenom} {a.nom}</a>
                  : <span style={{ fontWeight: 700, fontSize: 12, cursor: 'pointer' }} onClick={() => onEdit(a)} title="Modifier">{a.prenom} {a.nom}</span>
                }
                {a.numero_avs && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{a.numero_avs}</div>}
              </td>
              <td style={tdStyle}><span style={{ fontSize: 10, color: 'var(--muted)' }}>{a.numero_avs || '—'}</span></td>
              <td style={{ ...tdStyle, textAlign: 'center' }}><span style={{ fontWeight: 700 }}>{a.nbr_enfants ?? '—'}</span></td>
              <td style={tdStyle}>{a.montant_chf != null ? <span style={{ fontWeight: 700, color: '#10B981' }}>{formatCHF(a.montant_chf)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
              <td style={tdStyle}><span style={{ fontSize: 11 }}>{a.bareme_is || '—'}</span></td>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(a.date_debut_alfa)}</td>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(a.date_fin_alfa)}</td>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(a.date_radiation_caf)}</td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.radiation_recue || '—'}</span></td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.mere_touche || '—'}</span></td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.demande_envoyee || '—'}</span></td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.reactivation_envoyee || '—'}</span></td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.lieu_enfants || '—'}</span></td>
              <td style={tdStyle}><span style={{ fontSize: 10 }}>{a.consimo || '—'}</span></td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                {a.termine
                  ? <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.3)' }}>✓ Terminé</span>
                  : <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(99,102,241,0.12)', color: '#818CF8' }}>● En cours</span>
                }
              </td>
              <td style={{ ...tdStyle, maxWidth: 180 }}>
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
                  <button onClick={() => onDelete(a)} title="Supprimer" style={{ padding: '4px 6px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>
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
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})

  if (rows.length === 0) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun paiement ALFA pour cette année.</div>
  }

  const toggleSort = (col: string) => setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc' } : { col, dir: 'asc' })
  const setFilter = (col: string, sel: Set<string> | null) => setFilters(prev => ({ ...prev, [col]: sel }))

  const getVal = (a: SecretariatAlfaPaiement, col: string): string => {
    if (col === 'nom') return `${a.prenom} ${a.nom}`.trim()
    if (col === 'statut') return a.statut_termine ? 'Terminé' : 'En cours'
    if (col === 'periode') return a.annee_periode || '—'
    return ''
  }

  let displayed = rows.filter(a => {
    for (const [col, sel] of Object.entries(filters)) {
      if (sel === null) continue
      if (!sel.has(getVal(a, col))) return false
    }
    return true
  })

  if (sort.dir && sort.col) {
    displayed = [...displayed].sort((a, b) => {
      if (sort.col === 'montant') return sort.dir === 'desc' ? (b.montant_alfa_paye || 0) - (a.montant_alfa_paye || 0) : (a.montant_alfa_paye || 0) - (b.montant_alfa_paye || 0)
      const va = getVal(a, sort.col).toLowerCase()
      const vb = getVal(b, sort.col).toLowerCase()
      return sort.dir === 'desc' ? vb.localeCompare(va, 'fr') : va.localeCompare(vb, 'fr')
    })
  }

  const thStyle: React.CSSProperties = { padding: '10px 10px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1.5px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--secondary)' }
  const tdStyle: React.CSSProperties = { padding: '9px 10px', fontSize: 12, color: 'var(--foreground)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortableHeader label="Nom / Prénom" sortDir={sort.col === 'nom' ? sort.dir : null} onSort={() => toggleSort('nom')} style={thStyle} />
            <th style={thStyle}>Enfants</th>
            <th style={thStyle}>Droit / mois</th>
            <SortableHeader label="Montant payé" sortDir={sort.col === 'montant' ? sort.dir : null} onSort={() => toggleSort('montant')} style={thStyle} />
            <SortableHeader label="Période" sortDir={sort.col === 'periode' ? sort.dir : null} onSort={() => toggleSort('periode')} style={thStyle}
              filterValues={rows.map(a => getVal(a, 'periode'))} filterSelected={filters.periode ?? null} onFilter={s => setFilter('periode', s)} />
            <th style={thStyle}>Dernier mois</th>
            <th style={thStyle}>Prochain mois</th>
            <th style={thStyle}>Fin mission</th>
            <th style={thStyle}>Remarques</th>
            <SortableHeader label="Statut" sortDir={sort.col === 'statut' ? sort.dir : null} onSort={() => toggleSort('statut')} style={thStyle}
              filterValues={rows.map(a => getVal(a, 'statut'))} filterSelected={filters.statut ?? null} onFilter={s => setFilter('statut', s)} />
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
                      ? <img src={(a as any).photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>{`${(a.prenom || '')[0] || ''}${(a.nom || '')[0] || ''}`.toUpperCase()}</div>
                    }
                    <div>
                      {a.candidat_id
                        ? <a href={`/candidats/${a.candidat_id}`} style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)', textDecoration: 'none' }} title="Voir fiche">{a.prenom} {a.nom}</a>
                        : <span style={{ fontWeight: 700, fontSize: 13 }}>{a.prenom} {a.nom}</span>
                      }
                      {a.numero_avs && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{a.numero_avs}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}><span style={{ fontWeight: 700 }}>{a.nbr_enfants ?? '—'}</span></td>
                <td style={tdStyle}>{a.droit_chf_mois != null ? <span style={{ fontWeight: 700, color: '#3B82F6' }}>{formatCHF(a.droit_chf_mois)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td style={tdStyle}>{a.montant_alfa_paye != null ? <span style={{ fontWeight: 700, color: '#10B981' }}>{formatCHF(a.montant_alfa_paye)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td style={tdStyle}><span style={{ fontSize: 11 }}>{a.annee_periode || '—'}</span></td>
                <td style={tdStyle}><span style={{ fontSize: 11 }}>{a.dernier_mois_paye || '—'}</span></td>
                <td style={tdStyle}><span style={{ fontSize: 11, color: a.prochain_mois_paye ? '#F59E0B' : 'var(--muted)', fontWeight: a.prochain_mois_paye ? 700 : 400 }}>{a.prochain_mois_paye || '—'}</span></td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(a.date_fin_mission)}</td>
                <td style={{ ...tdStyle, maxWidth: 200 }}>
                  {a.remarques ? <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', lineHeight: 1.4 }} title={a.remarques} onClick={e => { const el = e.currentTarget; if (el.style.whiteSpace === 'normal') { el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden'; el.style.textOverflow = 'ellipsis' } else { el.style.whiteSpace = 'normal'; el.style.overflow = 'visible'; el.style.textOverflow = 'unset' } }}>{a.remarques}</div> : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {a.statut_termine
                    ? <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.3)' }}>✓ Terminé</span>
                    : <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(99,102,241,0.12)', color: '#818CF8' }}>● En cours</span>
                  }
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <ColorPicker currentColor={a.couleur || null} onChange={color => onColorChange(a.id, color)} />
                    <button onClick={() => onEdit(a)} title="Modifier" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={13} /></button>
                    <button onClick={() => onDelete(a)} title="Supprimer" style={{ padding: '5px 8px', borderRadius: 6, background: 'none', border: '1.5px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
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
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
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
      padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
      background: active ? 'var(--primary)' : 'var(--secondary)',
      color: active ? '#fff' : 'var(--muted)',
      border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
      transition: 'all 0.15s',
    }}>
      {children}
      {count !== undefined && count > 0 && (
        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 800, background: active ? 'rgba(255,255,255,0.3)' : 'rgba(245,166,35,0.2)', color: active ? '#fff' : '#B47A1A', minWidth: 20, textAlign: 'center' }}>
          {count}
        </span>
      )}
    </button>
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
  const [activeTab, setActiveTab] = useState<'candidats' | 'alfa' | 'accidents' | 'loyers'>('candidats')
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
  const [accidentStatut, setAccidentStatut] = useState<'tous' | 'en_cours' | 'termine'>('tous')
  const [accidentType, setAccidentType] = useState<'tous' | 'Accident' | 'Maladie'>('tous')

  // Filtre candidats (permis urgents / surveillance / docs manquants)
  const [candidatFiltre, setCandidatFiltre] = useState<'tous' | 'permis_urgent' | 'permis_surveillance' | 'docs_manquants'>('tous')

  // Filtre ALFA terminé / en cours
  const [alfaTermine, setAlfaTermine] = useState<'tous' | 'en_cours' | 'termine'>('tous')

  // Tri ALFA A-Z
  const [alfaSort, setAlfaSort] = useState<'default' | 'az' | 'za'>('default')

  // Fix 11 — Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reset selection on tab/year change
  useEffect(() => { setSelectedIds(new Set()) }, [activeTab, annee, alfaView])

  // ─── Fix 6 — Lecture URL params (tab, filtre, action) ─────────────────────
  const urlParamsApplied = useRef(false)
  useEffect(() => {
    if (!roleChecked || urlParamsApplied.current) return
    urlParamsApplied.current = true

    const tab = searchParams.get('tab')
    if (tab === 'candidats' || tab === 'alfa' || tab === 'accidents' || tab === 'loyers') {
      setActiveTab(tab)
    }

    const filtre = searchParams.get('filtre')
    if (tab === 'accidents' && filtre === 'en_cours') {
      setAccidentStatut('en_cours')
    }
    if (tab === 'candidats' && (filtre === 'permis_urgent' || filtre === 'permis_surveillance' || filtre === 'docs_manquants')) {
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

  const { data: loyers = [], isLoading: loadingLoyers } = useQuery<SecretariatLoyer[]>({
    queryKey: ['secretariat-loyers', annee],
    queryFn: async () => {
      const res = await fetch(`/api/secretariat/loyers?annee=${annee}`)
      if (!res.ok) throw new Error('Erreur chargement loyers')
      const d = await res.json()
      return d.loyers || []
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

    // Permis urgents (<30j)
    for (const c of candidatsList) {
      if (!c.date_echeance_permis) continue
      const jours = Math.floor((new Date(c.date_echeance_permis).getTime() - today.getTime()) / 86400000)
      if (jours >= 0 && jours < 30) {
        batch.push({
          type: 'permis_urgent',
          titre: `🔴 Permis urgent : ${c.prenom} ${c.nom}`,
          message: `Le permis ${c.genre_permis || ''} expire le ${formatDate(c.date_echeance_permis)} (dans ${jours} jour${jours !== 1 ? 's' : ''}).`,
          candidat_id: c.candidat_id,
          reference_id: `permis_${c.id}`,
          reference_table: 'secretariat_candidats',
          urgence: 'urgente',
        })
      } else if (jours >= 30 && jours < 90) {
        batch.push({
          type: 'permis_surveillance',
          titre: `⚠️ Permis à surveiller : ${c.prenom} ${c.nom}`,
          message: `Le permis ${c.genre_permis || ''} expire le ${formatDate(c.date_echeance_permis)} (dans ${jours} jours).`,
          candidat_id: c.candidat_id,
          reference_id: `permis_surv_${c.id}`,
          reference_table: 'secretariat_candidats',
          urgence: 'normale',
        })
      }
    }

    // Docs manquants
    for (const c of candidatsList) {
      if (!c.docs_manquants) continue
      batch.push({
        type: 'doc_manquant',
        titre: `📋 Docs manquants : ${c.prenom} ${c.nom}`,
        message: `Documents manquants : ${c.docs_manquants}`,
        candidat_id: c.candidat_id,
        reference_id: `doc_${c.id}`,
        reference_table: 'secretariat_candidats',
        urgence: 'normale',
      })
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

  const filteredCandidats = candidats.filter(c => {
    if (q && !`${c.prenom} ${c.nom}`.toLowerCase().includes(q) && !(c.numero_quadrigis || '').toLowerCase().includes(q)) return false
    if (candidatFiltre === 'permis_urgent') {
      if (!c.date_echeance_permis) return false
      const j = Math.floor((new Date(c.date_echeance_permis).getTime() - Date.now()) / 86400000)
      return j >= 0 && j < 30
    }
    if (candidatFiltre === 'permis_surveillance') {
      if (!c.date_echeance_permis) return false
      const j = Math.floor((new Date(c.date_echeance_permis).getTime() - Date.now()) / 86400000)
      return j >= 30 && j < 90
    }
    if (candidatFiltre === 'docs_manquants') {
      return !!c.docs_manquants
    }
    return true
  })

  const filteredAccidents = accidents.filter(a => {
    if (accidentStatut === 'en_cours' && a.termine) return false
    if (accidentStatut === 'termine' && !a.termine) return false
    if (accidentType !== 'tous' && a.type_cas !== accidentType) return false
    return !q || (a.nom_prenom || '').toLowerCase().includes(q) || (a.raison || '').toLowerCase().includes(q) || (a.numero_sinistre || '').toLowerCase().includes(q)
  })

  const filteredLoyers = loyers.filter(l =>
    !q || (l.nom_prenom || '').toLowerCase().includes(q) || (l.adresse || '').toLowerCase().includes(q)
  )

  const filteredAlfa = alfa.filter(a => {
    if (q && !`${a.nom} ${a.prenom}`.toLowerCase().includes(q) && !(a.remarques || '').toLowerCase().includes(q)) return false
    if (alfaTermine === 'en_cours' && a.termine) return false
    if (alfaTermine === 'termine' && !a.termine) return false
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
      else url = `/api/secretariat/loyers/${deleteItem.id}`

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
      else { apiBase = 'loyers'; qKey = 'secretariat-loyers' }
      const res = await fetch(`/api/secretariat/${apiBase}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couleur: color || null }),
      })
      if (!res.ok) throw new Error('Erreur')
      queryClient.invalidateQueries({ queryKey: [qKey, annee] })
    } catch (e: any) { toast.error(e.message) }
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

  // Fix 11 — Bulk delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    if (!window.confirm(`Supprimer ${count} entrée${count > 1 ? 's' : ''} ?`)) return
    try {
      const promises = Array.from(selectedIds).map(id =>
        fetch(`/api/secretariat/candidats/${id}`, { method: 'DELETE' })
      )
      await Promise.allSettled(promises)
      toast.success(`${count} entrée${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['secretariat-candidats', annee] })
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
    : activeTab === 'alfa' ? (alfaView === 'apayer' ? loadingAlfaPaiements : loadingAlfa)
    : loadingLoyers

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="d-page">
      {/* Header */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardList size={22} color="var(--primary)" />
            Secrétariat
          </h1>
          <p className="d-page-sub">Suivi documents, accidents &amp; loyers</p>
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
              <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {notifsNonLues > 9 ? '9+' : notifsNonLues}
              </span>
            )}
          </button>

          {/* Bouton nouvelle entrée */}
          <button
            onClick={() => { setEditItem(null); setShowForm(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            <Plus size={15} /> Nouvelle entrée
          </button>
        </div>
      </div>

      {/* Panel notifications */}
      {showNotifs && (() => {
        const AUTO_TYPES = ['permis_urgent', 'permis_surveillance', 'permis_expiration', 'doc_manquant', 'sinistre_suivi']
        const autoNotifs = notifications.filter(n => AUTO_TYPES.includes(n.type))
        const messageNotifs = notifications.filter(n => !AUTO_TYPES.includes(n.type))
        const autoNonLues = autoNotifs.filter(n => !n.lue).length
        const msgNonLues = messageNotifs.filter(n => !n.lue).length

        const ICON_MAP: Record<string, React.ReactNode> = {
          permis_urgent: <AlertTriangle size={13} color="#EF4444" />,
          permis_surveillance: <AlertTriangle size={13} color="#CA8A04" />,
          permis_expiration: <AlertTriangle size={13} color="#CA8A04" />,
          doc_manquant: <FileText size={13} color="#3B82F6" />,
          sinistre_suivi: <AlertCircle size={13} color="#8B5CF6" />,
          message: <Mail size={13} color="var(--primary)" />,
          autre: <AlertTriangle size={13} color="var(--muted)" />,
        }

        const renderNotif = (notif: Notification) => (
          <div key={notif.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            background: notif.lue ? 'transparent' : 'rgba(245,166,35,0.04)',
            borderLeft: notif.urgence === 'urgente' && !notif.lue ? '3px solid #EF4444' : '3px solid transparent',
            opacity: notif.lue ? 0.55 : 1,
          }}>
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              {ICON_MAP[notif.type] || <Bell size={13} color="var(--muted)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--foreground)', marginBottom: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {notif.titre}
                {notif.urgence === 'urgente' && !notif.lue && <span style={{ padding: '0 5px', borderRadius: 4, fontSize: 9, fontWeight: 800, background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>URGENT</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{notif.message}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatDate(notif.created_at?.split('T')[0])}</span>
                {notif.created_by_nom && <span style={{ fontSize: 10, color: 'var(--muted)' }}>par {notif.created_by_nom}</span>}
                {notif.candidat_id && (
                  <a href={`/candidats/${notif.candidat_id}`} style={{ fontSize: 10, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Voir candidat →</a>
                )}
              </div>
            </div>
            {!notif.lue && (
              <button onClick={() => handleMarkNotifLue(notif)} title="Marquer comme lue"
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
                {notifsNonLues > 0 && <span style={{ padding: '1px 7px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: '#EF4444', fontSize: 11, fontWeight: 700 }}>{notifsNonLues} non lues</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setShowAlertModal(true)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
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
                      {msgNonLues > 0 && <span style={{ padding: '0 5px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: '#EF4444', fontSize: 10, fontWeight: 800 }}>{msgNonLues}</span>}
                    </div>
                    {messageNotifs.slice(0, 20).map(renderNotif)}
                  </>
                )}

                {/* Section Alertes automatiques */}
                {autoNotifs.length > 0 && (
                  <>
                    <div style={{ padding: '8px 16px', background: 'rgba(99,102,241,0.05)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ⚡ Alertes automatiques
                      {autoNonLues > 0 && <span style={{ padding: '0 5px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: '#EF4444', fontSize: 10, fontWeight: 800 }}>{autoNonLues}</span>}
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        <TabBtn active={activeTab === 'candidats'} onClick={() => { setActiveTab('candidats'); setSearchQuery(''); setShowForm(false); setEditItem(null); setCandidatFiltre('tous') }} count={filteredCandidats.length}>
          <User size={14} /> Suivi Candidats
        </TabBtn>
        <TabBtn active={activeTab === 'alfa'} onClick={() => { setActiveTab('alfa'); setSearchQuery(''); setShowForm(false); setEditItem(null) }} count={activeTab === 'alfa' && alfaView === 'apayer' ? filteredAlfaPaiements.length : filteredAlfa.length}>
          <FileText size={14} /> ALFA
        </TabBtn>
        <TabBtn active={activeTab === 'accidents'} onClick={() => { setActiveTab('accidents'); setSearchQuery(''); setShowForm(false); setEditItem(null) }} count={filteredAccidents.length}>
          <AlertCircle size={14} /> Accidents &amp; Maladies
        </TabBtn>
        <TabBtn active={activeTab === 'loyers'} onClick={() => { setActiveTab('loyers'); setSearchQuery(''); setShowForm(false); setEditItem(null) }} count={filteredLoyers.length}>
          <Home size={14} /> Loyer
        </TabBtn>
      </div>

      {/* Sous-tabs ALFA : Suivi / À Payer */}
      {activeTab === 'alfa' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {([['suivi', 'Suivi ALFA'], ['apayer', 'À Payer']] as const).map(([v, label]) => (
            <button key={v} onClick={() => { setAlfaView(v); setSearchQuery('') }} style={{
              padding: '5px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: alfaView === v ? 'var(--primary)' : 'var(--secondary)',
              color: alfaView === v ? '#fff' : 'var(--muted)',
              border: `1.5px solid ${alfaView === v ? 'var(--primary)' : 'var(--border)'}`,
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* Sous-tabs année (pas sur Loyer) */}
      {activeTab !== 'loyers' && (
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
      )}

      {/* Filtres accidents */}
      {activeTab === 'accidents' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['tous', 'en_cours', 'termine'] as const).map(s => (
              <button key={s} onClick={() => setAccidentStatut(s)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: accidentStatut === s ? 'var(--primary)' : 'var(--secondary)',
                color: accidentStatut === s ? '#fff' : 'var(--muted)',
                border: `1.5px solid ${accidentStatut === s ? 'var(--primary)' : 'var(--border)'}`,
              }}>{s === 'tous' ? 'Tous' : s === 'en_cours' ? 'En cours' : 'Terminé'}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['tous', 'Accident', 'Maladie'] as const).map(t => (
              <button key={t} onClick={() => setAccidentType(t)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: accidentType === t ? 'var(--primary)' : 'var(--secondary)',
                color: accidentType === t ? '#fff' : 'var(--muted)',
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
            {(['tous', 'en_cours', 'termine'] as const).map(s => (
              <button key={s} onClick={() => setAlfaTermine(s)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: alfaTermine === s ? (s === 'termine' ? 'rgba(34,197,94,0.15)' : 'var(--primary)') : 'var(--secondary)',
                color: alfaTermine === s ? (s === 'termine' ? '#16A34A' : '#fff') : 'var(--muted)',
                border: `1.5px solid ${alfaTermine === s ? (s === 'termine' ? 'rgba(34,197,94,0.4)' : 'var(--primary)') : 'var(--border)'}`,
              }}>{s === 'tous' ? 'Tous' : s === 'en_cours' ? 'En cours' : 'Terminé'}</button>
            ))}
          </div>
        </div>
      )}

      {/* Filtres candidats */}
      {activeTab === 'candidats' && candidatFiltre !== 'tous' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(245,166,35,0.15)', color: 'var(--primary)', border: '1.5px solid rgba(245,166,35,0.3)' }}>
            🔍 {candidatFiltre === 'permis_urgent' ? 'Permis urgents (<30j)' : candidatFiltre === 'permis_surveillance' ? 'Permis à renouveler (<90j)' : 'Docs manquants'}
          </div>
          <button onClick={() => setCandidatFiltre('tous')} style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: 'var(--secondary)', color: 'var(--muted)', border: '1.5px solid var(--border)',
          }}>✕ Effacer filtre</button>
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
          {activeTab === 'alfa' && alfaView === 'apayer' && `${filteredAlfaPaiements.length} entrée${filteredAlfaPaiements.length !== 1 ? 's' : ''}`}
          {activeTab === 'accidents' && `${filteredAccidents.length} cas`}
          {activeTab === 'loyers' && `${filteredLoyers.length} loyer${filteredLoyers.length !== 1 ? 's' : ''}`}
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
                selectedIds={selectedIds}
                onToggleSelect={id => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })}
                onSelectAll={all => setSelectedIds(all ? new Set(filteredCandidats.map(c => c.id)) : new Set())}
                onColorChange={handleColorChange}
              />
            )}
            {activeTab === 'alfa' && alfaView === 'suivi' && (
              <AlfaTable
                rows={filteredAlfa}
                onEdit={a => { setEditItem(a); setShowForm(true) }}
                onDelete={a => setDeleteItem(a)}
                onColorChange={handleColorChange}
              />
            )}
            {activeTab === 'alfa' && alfaView === 'apayer' && (
              <AlfaPaiementsTable
                rows={filteredAlfaPaiements}
                onEdit={a => { setEditItem(a); setShowForm(true) }}
                onDelete={a => setDeleteItem(a)}
                onColorChange={handleColorChange}
              />
            )}
            {activeTab === 'accidents' && (
              <AccidentsTable
                accidents={filteredAccidents}
                onEdit={a => { setEditItem(a); setShowForm(true) }}
                onDelete={a => setDeleteItem(a)}
                onColorChange={handleColorChange}
                onArchive={handleArchive}
              />
            )}
            {activeTab === 'loyers' && (
              <LoyersTable
                loyers={filteredLoyers}
                onEdit={l => { setEditItem(l); setShowForm(true) }}
                onDelete={l => setDeleteItem(l)}
                onColorChange={handleColorChange}
              />
            )}
          </div>
        )}
      </div>

      {/* Barre d'actions multi-select */}
      {selectedIds.size > 0 && activeTab === 'candidats' && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9998, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderRadius: 12, background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
          <button onClick={handleBulkDelete} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <Trash2 size={13} /> Supprimer
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Annuler
          </button>
        </div>
      )}

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
      {showForm && activeTab === 'loyers' && (
        <LoyerModal
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

      {/* Modal suppression */}
      {deleteItem && (
        <DeleteModal
          label={
            activeTab === 'candidats'
              ? `${(deleteItem as SecretariatCandidat).prenom} ${(deleteItem as SecretariatCandidat).nom}`
              : activeTab === 'alfa'
              ? `${(deleteItem as SecretariatAlfa).prenom || ''} ${(deleteItem as SecretariatAlfa).nom}`
              : activeTab === 'accidents'
              ? (deleteItem as SecretariatAccident).nom_prenom
              : (deleteItem as SecretariatLoyer).nom_prenom
          }
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteItem(null)}
        />
      )}
    </div>
  )
}
