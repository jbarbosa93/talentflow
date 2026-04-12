'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  TrendingUp, Plus, Pencil, Trash2, X,
  Loader2, CheckCircle2, Clock, XCircle,
  Building2, User, Calendar, Search, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { getJoursFeries, feriesSet, countFeriesOuvrables, feriesOuvrablesLabels } from '@/lib/jours-feries'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Mission {
  id: string
  candidat_id: string | null
  client_id: string | null
  candidat_nom: string | null
  client_nom: string | null
  metier: string | null
  date_debut: string
  date_fin: string | null
  marge_brute: number
  marge_avec_lpp: number | null
  coefficient: number
  statut: 'en_cours' | 'annulee'
  notes: string | null
  photo_url: string | null
  client_canton: string | null
  absences: { debut: string; fin: string }[]
  created_at: string
  updated_at: string
}

interface Stats {
  total_en_cours: number
  total_sans_emploi: number
  total_etp: number
  marge_moyenne: number
  marge_en_cours: number
}

const EMPTY_FORM = {
  candidat_id: null as string | null,
  candidat_nom: '',
  client_id: null as string | null,
  client_nom: '',
  metier: '',
  date_debut: '',
  date_fin: '',
  indeterminee: false,
  marge_brute: '',
  marge_avec_lpp: '',
  coefficient: '1',
  statut: 'en_cours' as 'en_cours' | 'annulee',
  notes: '',
  absences: [] as { debut: string; fin: string }[],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

function formatCHF(n: number): string {
  const hasCents = n % 1 !== 0
  return new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF', minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 }).format(n)
}

// ─── CSS variable helpers ─────────────────────────────────────────────────────

const S = {
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10 } as React.CSSProperties,
  input: { width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box' as const, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)', fontSize: 14, outline: 'none' } as React.CSSProperties,
  label: { display: 'block' as const, fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' } as React.CSSProperties,
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUT_CONFIG = {
  en_cours:    { label: 'En Mission',    bg: 'rgba(34,197,94,0.12)',   color: '#22C55E', icon: Clock },
  fin_mission: { label: 'Fin de Mission',bg: 'rgba(239,68,68,0.12)',   color: '#EF4444', icon: XCircle },
  annulee:     { label: 'Sans Emploi',   bg: 'rgba(100,116,139,0.12)', color: '#64748B', icon: XCircle },
  terminee:    { label: 'Terminée',      bg: 'rgba(99,102,241,0.12)',  color: '#818CF8', icon: CheckCircle2 },
} as const

function StatutBadge({ statut }: { statut: string }) {
  const cfg = STATUT_CONFIG[statut as keyof typeof STATUT_CONFIG] || STATUT_CONFIG.terminee
  const Icon = cfg.icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700 }}>
      <Icon size={10} />{cfg.label}
    </span>
  )
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────

function Autocomplete({ value, onChange, placeholder, searchFn }: {
  value: string
  onChange: (nom: string, id: string | null) => void
  placeholder: string
  searchFn: (q: string) => Promise<{ id: string; label: string; sub?: string }[]>
}) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<{ id: string; label: string; sub?: string }[]>([])
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
      try { const r = await searchFn(v); setResults(r); setOpen(r.length > 0) }
      finally { setLoading(false) }
    }, 280)
  }

  const select = (item: { id: string; label: string }) => {
    setQuery(item.label); onChange(item.label, item.id); setResults([]); setOpen(false)
  }

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input value={query} onChange={e => handleChange(e.target.value)} placeholder={placeholder} autoComplete="off" style={{ ...S.input, paddingRight: 32 }} />
        {loading
          ? <Loader2 size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', animation: 'spin 1s linear infinite' }} />
          : <Search size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        }
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 999, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--card-shadow-hover)', maxHeight: 200, overflowY: 'auto' }}>
          {results.map(r => (
            <button key={r.id} onMouseDown={() => select(r)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--foreground)', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontWeight: 600 }}>{r.label}</div>
              {r.sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{r.sub}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

async function searchCandidats(q: string) {
  const res = await fetch(`/api/candidats?search=${encodeURIComponent(q)}&per_page=8`)
  const d = await res.json()
  return (d.candidats || []).map((c: any) => ({ id: c.id, label: [c.prenom, c.nom].filter(Boolean).join(' '), sub: [c.titre, c.localisation].filter(Boolean).join(' · ') }))
}

async function searchClients(q: string) {
  const res = await fetch(`/api/clients?search=${encodeURIComponent(q)}&per_page=8`)
  const d = await res.json()
  return (d.clients || []).map((c: any) => ({ id: c.id, label: c.nom_entreprise || '', sub: [c.ville, c.canton].filter(Boolean).join(', ') }))
}

// ─── Modal Mission ────────────────────────────────────────────────────────────

function MissionModal({ mission, onClose, onSaved }: { mission?: Mission | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => mission ? {
    candidat_id: mission.candidat_id, candidat_nom: mission.candidat_nom || '',
    client_id: mission.client_id, client_nom: mission.client_nom || '',
    metier: mission.metier || '', date_debut: mission.date_debut || '', date_fin: mission.date_fin || '',
    indeterminee: !mission.date_fin,
    marge_brute: String(mission.marge_brute ?? ''),
    marge_avec_lpp: mission.marge_avec_lpp != null ? String(mission.marge_avec_lpp) : '',
    coefficient: String(mission.coefficient ?? '1'),
    statut: ((mission.statut as string) === 'terminee' ? 'en_cours' : mission.statut) as 'en_cours' | 'annulee',
    notes: mission.notes || '',
    absences: mission.absences || [],
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.date_debut) { toast.error('Date de début requise'); return }
    if (form.marge_brute === '') { toast.error('Marge brute requise'); return }
    setSaving(true)
    try {
      const res = await fetch(mission ? `/api/missions/${mission.id}` : '/api/missions', {
        method: mission ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidat_id: form.candidat_id || null, candidat_nom: form.candidat_nom || null,
          client_id: form.client_id || null, client_nom: form.client_nom || null,
          metier: form.metier || null, date_debut: form.date_debut, date_fin: form.indeterminee ? null : (form.date_fin || null),
          marge_brute: Number(form.marge_brute),
          marge_avec_lpp: form.marge_avec_lpp !== '' ? Number(form.marge_avec_lpp) : null,
          coefficient: Number(form.coefficient || 1),
          statut: form.statut, notes: form.notes || null,
          absences: form.absences,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      toast.success(mission ? 'Mission modifiée' : 'Mission créée')
      onSaved(); onClose()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)' }}>{mission ? 'Modifier' : 'Nouvelle mission'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Candidat</label>
              <Autocomplete value={form.candidat_nom} onChange={(nom, id) => setForm(f => ({ ...f, candidat_nom: nom, candidat_id: id }))} placeholder="Rechercher…" searchFn={searchCandidats} />
              {form.candidat_id && <div style={{ fontSize: 10, color: '#22C55E', marginTop: 2 }}>✓ Lié</div>}
            </div>
            <div>
              <label style={S.label}>Client</label>
              <Autocomplete value={form.client_nom} onChange={(nom, id) => setForm(f => ({ ...f, client_nom: nom, client_id: id }))} placeholder="Rechercher…" searchFn={searchClients} />
              {form.client_id && <div style={{ fontSize: 10, color: '#22C55E', marginTop: 2 }}>✓ Lié</div>}
            </div>
          </div>

          <div>
            <label style={S.label}>Métier / Poste</label>
            <input value={form.metier} onChange={e => set('metier', e.target.value)} placeholder="Ex: Électricien, Monteur CVC…" style={S.input} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Date début *</label>
              <input type="date" value={form.date_debut} onChange={e => set('date_debut', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
            </div>
            {!form.indeterminee && (
              <div>
                <label style={S.label}>Date fin</label>
                <input type="date" value={form.date_fin} onChange={e => set('date_fin', e.target.value)} style={{ ...S.input, colorScheme: 'inherit' }} />
              </div>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={form.indeterminee}
              onChange={e => setForm(f => ({ ...f, indeterminee: e.target.checked, date_fin: e.target.checked ? '' : f.date_fin }))}
              style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>Mission indéterminée</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>(pas de date de fin)</span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Marge brute (CHF/h) *</label>
              <input type="number" value={form.marge_brute} onChange={e => set('marge_brute', e.target.value)} placeholder="0.00" step="0.01" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Marge avec LPP (CHF/h)</label>
              <input type="number" value={form.marge_avec_lpp} onChange={e => set('marge_avec_lpp', e.target.value)} placeholder="Optionnel — si > 3 mois" step="0.01" style={S.input} />
            </div>
          </div>

          <div>
            <label style={S.label}>Coefficient</label>
            <input type="number" value={form.coefficient} onChange={e => set('coefficient', e.target.value)} placeholder="1.00" step="0.01" style={S.input} />
          </div>

          <div>
            <label style={S.label}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Commentaires…" rows={2} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* Absences / Vacances */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...S.label, margin: 0 }}>Absences / Vacances</label>
              <button type="button" onClick={() => setForm(f => ({ ...f, absences: [...f.absences, { debut: '', fin: '' }] }))}
                style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--primary-soft)', border: '1.5px solid var(--primary)', color: 'var(--primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                + Ajouter
              </button>
            </div>
            {form.absences.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Aucune absence — les jours ouvrables sont comptés intégralement</div>
            )}
            {form.absences.map((abs, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <div>
                  {i === 0 && <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase' }}>Début</div>}
                  <input type="date" value={abs.debut} onChange={e => setForm(f => ({ ...f, absences: f.absences.map((a, j) => j === i ? { ...a, debut: e.target.value } : a) }))}
                    style={{ ...S.input, colorScheme: 'inherit', fontSize: 12 }} />
                </div>
                <div>
                  {i === 0 && <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase' }}>Fin</div>}
                  <input type="date" value={abs.fin} onChange={e => setForm(f => ({ ...f, absences: f.absences.map((a, j) => j === i ? { ...a, fin: e.target.value } : a) }))}
                    style={{ ...S.input, colorScheme: 'inherit', fontSize: 12 }} />
                </div>
                <div style={{ paddingTop: i === 0 ? 18 : 0 }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, absences: f.absences.filter((_, j) => j !== i) }))}
                    style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
            {form.absences.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                {(() => {
                  let total = 0
                  for (const abs of form.absences) {
                    if (abs.debut && abs.fin) total += countWorkingDays(new Date(abs.debut), new Date(abs.fin))
                  }
                  return total > 0 ? `→ ${total} jour${total > 1 ? 's' : ''} ouvrable${total > 1 ? 's' : ''} déduit${total > 1 ? 's' : ''} (${total * 8}h)` : ''
                })()}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: 'var(--primary-foreground)', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 7 }}>
            {saving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            {mission ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Working days helper ──────────────────────────────────────────────────────

function initialesMission(nom: string | null): string {
  if (!nom) return '?'
  const parts = nom.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

function countWorkingDays(start: Date, end: Date, feries?: Set<string>): number {
  if (start > end) return 0
  let count = 0
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(23, 59, 59, 999)
  while (d <= e) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!feries?.has(key)) count++
    }
    d.setDate(d.getDate() + 1)
  }
  return count
}

function countAbsenceDays(absences: { debut: string; fin: string }[], start: Date, end: Date): number {
  let total = 0
  for (const abs of absences) {
    const absStart = new Date(abs.debut)
    const absEnd = new Date(abs.fin)
    const overlapStart = absStart < start ? start : absStart
    const overlapEnd = absEnd > end ? end : absEnd
    if (overlapStart <= overlapEnd) total += countWorkingDays(overlapStart, overlapEnd)
  }
  return total
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({ mission, onConfirm, onClose }: { mission: Mission; onConfirm: () => void; onClose: () => void }) {
  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...S.card, borderColor: 'rgba(239,68,68,0.3)', padding: 24, width: '100%', maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#EF4444' }}>
          <AlertTriangle size={18} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Supprimer</h3>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Supprimer la mission de <strong style={{ color: 'var(--foreground)' }}>{mission.candidat_nom || 'ce candidat'}</strong> chez <strong style={{ color: 'var(--foreground)' }}>{mission.client_nom || 'ce client'}</strong> ?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button onClick={onConfirm} style={{ padding: '8px 16px', borderRadius: 8, background: '#EF4444', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Mission Row (compact) ────────────────────────────────────────────────────

function MissionRow({ mission, onEdit, onDelete, onMakePermanent }: {
  mission: Mission & { _expired?: boolean }
  onEdit: (m: Mission) => void
  onDelete: (m: Mission) => void
  onMakePermanent: (m: Mission) => void
}) {
  const effectifStatut = mission._expired ? 'fin_mission' : mission.statut
  // LPP active si marge_avec_lpp renseignée ET mission > 3 mois
  const missionAge = Math.floor((Date.now() - new Date(mission.date_debut).getTime()) / (1000 * 60 * 60 * 24))
  const lppActive = mission.marge_avec_lpp != null && missionAge > 90
  return (
    <div style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--card-shadow-hover)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Avatar */}
      <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 10, overflow: 'hidden', background: 'var(--secondary)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--muted)', position: 'relative' }}>
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initialesMission(mission.candidat_nom)}</span>
        {mission.photo_url && mission.photo_url !== 'checked' && (
          <img src={mission.photo_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        )}
      </div>

      {/* Statut */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <StatutBadge statut={effectifStatut} />
        {lppActive && (
          <span style={{ fontSize: 9, fontWeight: 800, color: '#818CF8', background: 'rgba(99,102,241,0.1)', padding: '1px 5px', borderRadius: 99 }}>LPP</span>
        )}
      </div>

      {/* Candidat */}
      <div style={{ flex: '1 1 180px', minWidth: 0, maxWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <User size={12} color="var(--muted)" style={{ flexShrink: 0 }} />
          {mission.candidat_id ? (
            <a href={`/candidats/${mission.candidat_id}?from=missions`} style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.textDecoration = 'none' }}
            >{mission.candidat_nom || '—'}</a>
          ) : (
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {mission.candidat_nom || <span style={{ color: 'var(--muted)', fontStyle: 'italic', fontWeight: 400 }}>—</span>}
            </span>
          )}
        </div>
        {mission.metier && <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, marginTop: 2, marginLeft: 17 }}>{mission.metier}</div>}
      </div>

      {/* Client */}
      <div style={{ flex: '1 1 150px', minWidth: 0, maxWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Building2 size={12} color="var(--muted)" />
          <span style={{ fontSize: 14, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {mission.client_nom || '—'}
          </span>
        </div>
      </div>

      {/* Dates */}
      <div style={{ flex: '0 1 155px', minWidth: 0, fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <Calendar size={11} style={{ flexShrink: 0 }} />{formatDate(mission.date_debut)}{mission.date_fin ? ` → ${formatDate(mission.date_fin)}` : ''}
        </div>
        {!mission.date_fin && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#818CF8', marginLeft: 15 }}>∞ Indéterminée</span>
        )}
        {(() => {
          const debut = new Date(mission.date_debut)
          const fin = mission.date_fin ? new Date(mission.date_fin) : new Date()
          const jours = Math.floor((fin.getTime() - debut.getTime()) / 86400000) + 1
          const semaines = Math.floor(jours / 7)
          const mois = Math.floor(jours / 30)
          const label = mois >= 1 ? `${mois} mois` : semaines >= 1 ? `${semaines} sem.` : `${jours} j`
          return <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 15 }}>{label}</span>
        })()}
      </div>

      {/* Coeff */}
      <div style={{ flex: '0 0 50px', textAlign: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', background: 'var(--secondary)', padding: '2px 7px', borderRadius: 6 }}>
          ×{Number(mission.coefficient).toFixed(2)}
        </span>
      </div>

      {/* Marge */}
      <div style={{ flex: 1, textAlign: 'right', fontSize: 15, fontWeight: 800, color: '#22C55E' }}>
        {formatCHF(Number(mission.marge_brute))}
      </div>

      {/* Notes dot */}
      {mission.notes && (
        <div title={mission.notes} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', flexShrink: 0 }} />
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
        {mission._expired && (
          <button
            onClick={() => onMakePermanent(mission)}
            style={{ padding: '5px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', border: '1.5px solid rgba(99,102,241,0.4)', color: '#818CF8', cursor: 'pointer', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center' }}
            title="Rendre indéterminée — supprime la date de fin"
          >
            ∞
          </button>
        )}
        <button onClick={() => onEdit(mission)} style={{ padding: '5px 7px', borderRadius: 6, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Modifier"><Pencil size={12} /></button>
        <button onClick={() => onDelete(mission)} style={{ padding: '5px 7px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Supprimer"><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MissionsPage() {
  const queryClient = useQueryClient()
  const [editMission, setEditMission] = useState<Mission | null | undefined>(undefined)
  const [deleteMission, setDeleteMission] = useState<Mission | null>(null)
  const [bilanOpen, setBilanOpen] = useState(false)
  const [heuresOverride, setHeuresOverride] = useState<Record<string, string>>({})
  const [bilanMode, setBilanMode] = useState<'month' | 'week'>('month')
  const [bilanWeekIdx, setBilanWeekIdx] = useState(0)
  const [bilanMonth, setBilanMonth] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [sortKey, setSortKey] = useState<'candidat' | 'client' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filtreMetier, setFiltreMetier] = useState('')
  const [filtreStatut, setFiltreStatut] = useState<'tous' | 'en_cours' | 'fin_mission'>('tous')
  const [mounted, setMounted] = useState(false)
  const [activeMainTab, setActiveMainTab] = useState<'missions' | 'bilan'>('missions')

  useEffect(() => { setMounted(true) }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['missions'],
    queryFn: async () => {
      const res = await fetch('/api/missions')
      if (!res.ok) throw new Error('Erreur chargement')
      return res.json() as Promise<{ missions: Mission[]; stats: Stats }>
    },
    staleTime: 30_000,
  })

  const allMissions = data?.missions ?? []
  const todayStr = new Date().toISOString().slice(0, 10)

  // Calcul statut effectif client-side
  const withEffectif = allMissions.map(m => ({
    ...m,
    _expired: m.statut === 'en_cours' && !!m.date_fin && m.date_fin < todayStr,
  }))

  // Stats client-side
  const activeEnCours = withEffectif.filter(m => m.statut === 'en_cours' && !m._expired)
  const stats = {
    total_en_cours: activeEnCours.length,
    total_fin_mission: withEffectif.filter(m => m._expired).length,
    total_sans_emploi: withEffectif.filter(m => m.statut === 'annulee').length,
    total_etp: activeEnCours.reduce((s, m) => s + Number(m.coefficient || 1), 0),
    marge_en_cours: activeEnCours.reduce((s, m) => s + Number(m.marge_brute || 0), 0),
    marge_moyenne: activeEnCours.length
      ? activeEnCours.reduce((s, m) => s + Number(m.marge_brute || 0), 0) / activeEnCours.length
      : 0,
  }

  // Liste : uniquement en_cours (En Mission + Fin de Mission)
  const rawMissions = withEffectif.filter(m => m.statut === 'en_cours')

  // Filtrage par statut (onglets)
  const rawByStatut = filtreStatut === 'en_cours'
    ? rawMissions.filter(m => !m._expired)
    : filtreStatut === 'fin_mission'
      ? rawMissions.filter(m => m._expired)
      : rawMissions

  // Filtrage par métier
  const filteredMissions = filtreMetier
    ? rawByStatut.filter(m => (m.metier || '').toLowerCase().includes(filtreMetier.toLowerCase()))
    : rawByStatut

  // Tri
  const missions = sortKey
    ? [...filteredMissions].sort((a, b) => {
        const va = sortKey === 'candidat' ? (a.candidat_nom || '') : (a.client_nom || '')
        const vb = sortKey === 'candidat' ? (b.candidat_nom || '') : (b.client_nom || '')
        return sortDir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr')
      })
    : filteredMissions

  // Bilan mensuel — jours ouvrables prorata
  const today = new Date()
  const monthStart = new Date(bilanMonth.getFullYear(), bilanMonth.getMonth(), 1)
  const monthEnd = new Date(bilanMonth.getFullYear(), bilanMonth.getMonth() + 1, 0)
  const isCurrentMonth = bilanMonth.getFullYear() === today.getFullYear() && bilanMonth.getMonth() === today.getMonth()
  const isFutureMonth = bilanMonth > today
  const moisLabel = bilanMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
  const totalJoursOuvr = countWorkingDays(monthStart, monthEnd)
  const elapsedJoursOuvr = isCurrentMonth ? countWorkingDays(monthStart, today) : (isFutureMonth ? 0 : totalJoursOuvr)
  const progressPct = totalJoursOuvr > 0 ? (elapsedJoursOuvr / totalJoursOuvr) * 100 : 0

  const goToPrevMonth = () => {
    setBilanMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
    setBilanWeekIdx(0)
    setHeuresOverride({})
  }
  const goToNextMonth = () => {
    setBilanMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
    setBilanWeekIdx(0)
    setHeuresOverride({})
  }

  // Semaines du mois (lundi→dimanche, clippées au mois)
  const monthWeeks: { start: Date; end: Date; label: string }[] = []
  const firstMon = new Date(monthStart)
  const dayOfWeek = firstMon.getDay() // 0=dim, 1=lun...
  firstMon.setDate(firstMon.getDate() - ((dayOfWeek + 6) % 7)) // recule au lundi
  let wStart = new Date(firstMon)
  while (wStart <= monthEnd) {
    const wEnd = new Date(wStart)
    wEnd.setDate(wEnd.getDate() + 6)
    const clampStart = wStart < monthStart ? monthStart : wStart
    const clampEnd = wEnd > monthEnd ? monthEnd : wEnd
    if (clampStart <= monthEnd) {
      const wn = monthWeeks.length + 1
      monthWeeks.push({
        start: new Date(clampStart), end: new Date(clampEnd),
        label: `Sem. ${wn} (${clampStart.getDate()}–${clampEnd.getDate()} ${bilanMonth.toLocaleDateString('fr-FR', { month: 'short' })})`,
      })
    }
    wStart.setDate(wStart.getDate() + 7)
  }
  const safeWeekIdx = Math.min(bilanWeekIdx, monthWeeks.length - 1)
  const selectedWeek = monthWeeks[safeWeekIdx]

  // Fenêtre temporelle selon mode
  const bilanStart = bilanMode === 'week' && selectedWeek ? selectedWeek.start : monthStart
  const bilanEnd = bilanMode === 'week' && selectedWeek ? selectedWeek.end : monthEnd

  const bilanRows = allMissions
    .filter(m => {
      if (m.statut === 'annulee') return false
      const debut = new Date(m.date_debut)
      const fin = m.date_fin ? new Date(m.date_fin) : bilanEnd
      return debut <= bilanEnd && fin >= bilanStart
    })
    .map(m => {
      const debut = new Date(m.date_debut)
      const fin = m.date_fin ? new Date(m.date_fin) : bilanEnd
      const effStart = debut < bilanStart ? bilanStart : debut
      const effEnd = fin > bilanEnd ? bilanEnd : fin
      const bilanYear = bilanMonth.getFullYear()
      const canton = m.client_canton || ''
      const feriesList = getJoursFeries(canton, bilanYear)
      const feries = feriesSet(feriesList)
      const feriesCount = countFeriesOuvrables(feries, effStart, effEnd)
      const feriesLabels = feriesOuvrablesLabels(feriesList, effStart, effEnd)
      const wdBrut = countWorkingDays(effStart, effEnd, feries)
      const absJours = countAbsenceDays(m.absences || [], effStart, effEnd)
      const wd = Math.max(0, wdBrut - absJours)
      const heures = wd * 8
      const missionAgeDays = Math.floor((bilanEnd.getTime() - new Date(m.date_debut).getTime()) / (1000 * 60 * 60 * 24))
      const lppEligible = m.marge_avec_lpp != null && missionAgeDays > 90
      const tauxHoraire = lppEligible
        ? Number(m.marge_avec_lpp)
        : (Number(m.marge_brute) > 0 ? Number(m.marge_brute) : (m.marge_avec_lpp != null ? Number(m.marge_avec_lpp) : 0))
      const margeBrute = tauxHoraire > 0 ? tauxHoraire * Number(m.coefficient) * heures : 0
      return { mission: m, wd, heures, tauxHoraire, margeBrute, absJours, feriesCount, feriesLabels, canton }
    })
    .sort((a, b) => (a.mission.candidat_nom || '').localeCompare(b.mission.candidat_nom || '', 'fr'))

  const totalMargeBrute = bilanRows.reduce((s, r) => {
    const hOverride = heuresOverride[r.mission.id]
    const effectiveH = hOverride !== undefined ? Number(hOverride) : r.heures
    const effectiveMarge = r.tauxHoraire > 0 ? r.tauxHoraire * Number(r.mission.coefficient) * effectiveH : 0
    return s + effectiveMarge
  }, 0)
  const etpActifs = bilanRows.reduce((s, r) => s + Number(r.mission.coefficient), 0)

  // Résumé semaines (pour vue mois)
  const weekSummaries = monthWeeks.map(w => {
    const rows = allMissions.filter(m => {
      if (m.statut === 'annulee') return false
      const debut = new Date(m.date_debut)
      const fin = m.date_fin ? new Date(m.date_fin) : w.end
      return debut <= w.end && fin >= w.start
    })
    const totalCoeff = rows.reduce((s, m) => s + Number(m.coefficient), 0)
    return { ...w, count: rows.length, avgCoeff: rows.length ? totalCoeff / rows.length : 0, totalCoeff }
  })

  // Liste des métiers uniques pour le filtre
  const metiersUniques = Array.from(new Set(rawByStatut.map(m => m.metier).filter(Boolean) as string[])).sort()

  const toggleSort = (key: 'candidat' | 'client') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['missions'] })
  }, [queryClient])

  const handleDelete = async () => {
    if (!deleteMission) return
    try {
      const res = await fetch(`/api/missions/${deleteMission.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur')
      toast.success('Mission supprimée')
      setDeleteMission(null); invalidate()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleMakePermanent = async (m: Mission) => {
    try {
      const res = await fetch(`/api/missions/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_fin: null, statut: 'en_cours' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur')
      if (m.marge_avec_lpp != null) {
        toast.success(`${m.candidat_nom || 'Mission'} → Indéterminée · LPP actif (${formatCHF(m.marge_avec_lpp)}/h)`)
      } else {
        toast.warning(`${m.candidat_nom || 'Mission'} → Indéterminée · ⚠ Aucune marge LPP renseignée — marge brute utilisée`, { duration: 6000 })
      }
      invalidate()
    } catch (e: any) { toast.error(e.message) }
  }

  if (!mounted) return null

  return (
    <div className="d-page">
      {/* Header */}
      <div className="d-page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TrendingUp size={22} color="var(--primary)" />Missions
          </h1>
          <p className="d-page-sub">Suivi des placements</p>
        </div>
        <button onClick={() => setEditMission(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: 'var(--primary-foreground)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          <Plus size={14} />Nouvelle mission
        </button>
      </div>

      {/* KPIs — 3 cartes */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {/* En Mission count */}
        <div style={{ ...S.card, padding: '14px 18px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>En Mission</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--primary)', lineHeight: 1 }}>{stats.total_en_cours}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {stats.total_fin_mission > 0
              ? <span style={{ color: '#EF4444', fontWeight: 700 }}>⚠ {stats.total_fin_mission} fin de mission</span>
              : <span>Toutes actives</span>}
          </div>
        </div>

        {/* Total ETP (somme des coefficients actifs) */}
        <div style={{ ...S.card, padding: '14px 18px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total ETP actif</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#38BDF8', lineHeight: 1 }}>{Number(stats.total_etp).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Hors missions terminées</div>
        </div>

        {/* Marge moyenne */}
        <div style={{ ...S.card, padding: '14px 18px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Marge moy. / candidat</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#22C55E', lineHeight: 1 }}>{stats.total_en_cours > 0 ? formatCHF(stats.marge_moyenne) : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{stats.total_en_cours > 0 ? `Sur ${stats.total_en_cours} mission${stats.total_en_cours !== 1 ? 's' : ''} actives` : 'Aucune mission active'}</div>
        </div>
      </div>

      {/* Tab bar principale */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1.5px solid var(--border)', paddingBottom: 0 }}>
        {([
          { key: 'missions', label: 'Missions' },
          { key: 'bilan',    label: 'Bilan' },
        ] as { key: typeof activeMainTab; label: string; count?: number }[]).map(tab => (
          <button key={tab.key} onClick={() => setActiveMainTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: 'none', border: 'none',
              borderBottom: `2.5px solid ${activeMainTab === tab.key ? 'var(--primary)' : 'transparent'}`,
              color: activeMainTab === tab.key ? 'var(--primary)' : 'var(--muted)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: -1.5, transition: 'all 0.15s',
            }}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span style={{ minWidth: 18, height: 18, borderRadius: 99, padding: '0 5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800 }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── TAB : Bilan ─────────────────────────────────────────────────────── */}
      {activeMainTab === 'bilan' && (
      <div style={{ ...S.card, marginBottom: 16, overflow: 'hidden' }}>
        {/* Header bilan */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 8 }}>
          {/* Nav mois */}
          <button onClick={goToPrevMonth} style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>‹</button>
          <button onClick={goToNextMonth} disabled={isCurrentMonth} style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: isCurrentMonth ? 'var(--border)' : 'var(--muted)', cursor: isCurrentMonth ? 'default' : 'pointer', fontSize: 14, lineHeight: 1 }}>›</button>
          {!isCurrentMonth && (
            <button onClick={() => { setBilanMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setBilanWeekIdx(0); setHeuresOverride({}) }}
              style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--primary-soft)', border: '1.5px solid var(--primary)', color: 'var(--primary)', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
              Aujourd'hui
            </button>
          )}
          {/* Toggle expand */}
          <button onClick={() => setBilanOpen(o => !o)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--foreground)', padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Bilan — {moisLabel}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
              {bilanMode === 'month' ? `${bilanRows.length} mission${bilanRows.length !== 1 ? 's' : ''} ce mois` : (selectedWeek?.label || '')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ETP actifs</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#38BDF8' }}>{etpActifs.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Marge brute est.</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: totalMargeBrute > 0 ? '#22C55E' : 'var(--muted)' }}>
                {totalMargeBrute > 0 ? formatCHF(totalMargeBrute) : '—'}
              </div>
            </div>
            {bilanOpen ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
          </div>
          </button>
        </div>

        {/* Barre de progression jours (mode mois) */}
        {bilanMode === 'month' && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
              <span>{elapsedJoursOuvr} j. ouvrables écoulés</span>
              <span>{totalJoursOuvr} j. ouvrables au total</span>
            </div>
            <div style={{ height: 5, borderRadius: 99, background: 'var(--secondary)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, borderRadius: 99, background: 'var(--primary)', transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}

        {/* Détail expandable */}
        {bilanOpen && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {/* Sélecteur mode */}
            <div style={{ display: 'flex', gap: 6, padding: '10px 16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setBilanMode('month')} style={{ padding: '5px 12px', borderRadius: 6, background: bilanMode === 'month' ? 'var(--primary-soft)' : 'var(--secondary)', border: `1.5px solid ${bilanMode === 'month' ? 'var(--primary)' : 'var(--border)'}`, color: bilanMode === 'month' ? 'var(--primary)' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Mois complet
              </button>
              <button onClick={() => setBilanMode('week')} style={{ padding: '5px 12px', borderRadius: 6, background: bilanMode === 'week' ? 'var(--primary-soft)' : 'var(--secondary)', border: `1.5px solid ${bilanMode === 'week' ? 'var(--primary)' : 'var(--border)'}`, color: bilanMode === 'week' ? 'var(--primary)' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Par semaine
              </button>
              {bilanMode === 'week' && monthWeeks.map((w, i) => (
                <button key={i} onClick={() => setBilanWeekIdx(i)} style={{ padding: '5px 10px', borderRadius: 6, background: safeWeekIdx === i ? 'var(--primary)' : 'var(--secondary)', border: `1.5px solid ${safeWeekIdx === i ? 'var(--primary)' : 'var(--border)'}`, color: safeWeekIdx === i ? 'var(--primary-foreground)' : 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {w.label}
                </button>
              ))}
            </div>

            {/* Résumé semaines (mode mois uniquement) */}
            {bilanMode === 'month' && weekSummaries.length > 0 && (
              <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {weekSummaries.map((w, i) => (
                  <div key={i} style={{ ...S.card, padding: '8px 14px', minWidth: 130, flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 3 }}>{w.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--foreground)' }}>{w.count} candidat{w.count !== 1 ? 's' : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Coeff moy. {w.count ? w.avgCoeff.toFixed(2) : '—'} · Total {w.totalCoeff.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Table détail */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--secondary)' }}>
                    {[['Candidat','200px'],['Poste','130px'],['Client','130px'],['Coeff','60px'],['J. ouv.','55px'],['Heures','65px'],['Marge brute/h','100px'],['Marge brute est.','110px']].map(([label, w]) => (
                      <th key={label} style={{ padding: '8px 12px', textAlign: ['Coeff','J. ouv.','Heures','Marge brute/h','Marge brute est.'].includes(label) ? 'right' : 'left', fontWeight: 700, color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', minWidth: w }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bilanRows.map(({ mission: m, wd, heures, tauxHoraire, absJours, feriesCount, feriesLabels, canton }) => {
                    const hOverride = heuresOverride[m.id]
                    const effectiveH = hOverride !== undefined ? Number(hOverride) : heures
                    const effectiveMarge = tauxHoraire > 0 ? tauxHoraire * Number(m.coefficient) * effectiveH : 0
                    const lppUsed = m.marge_avec_lpp != null && Math.floor((bilanEnd.getTime() - new Date(m.date_debut).getTime()) / 86400000) > 90
                    return (
                      <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--foreground)' }}>
                          {m.candidat_id
                            ? <a href={`/candidats/${m.candidat_id}?from=missions`} style={{ color: 'var(--foreground)', textDecoration: 'none', fontWeight: 700 }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--foreground)')}
                              >{m.candidat_nom || '—'}</a>
                            : <span>{m.candidat_nom || '—'}</span>
                          }
                        </td>
                        <td style={{ padding: '7px 12px', color: 'var(--muted)' }}>{m.metier || '—'}</td>
                        <td style={{ padding: '7px 12px', color: 'var(--muted)', fontSize: 11 }}>{m.client_nom || '—'}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--foreground)', fontWeight: 700 }}>×{Number(m.coefficient).toFixed(2)}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--muted)' }}>
                          {wd}
                          {absJours > 0 && <span style={{ fontSize: 9, color: '#F5A623', marginLeft: 3 }} title={`${absJours} j. absence déduit${absJours > 1 ? 's' : ''}`}>-{absJours}</span>}
                          {feriesCount > 0 && (
                            <span
                              style={{ fontSize: 9, color: '#818CF8', marginLeft: 3, cursor: 'default' }}
                              title={`${feriesCount} j. férié${feriesCount > 1 ? 's' : ''} exclus (${canton || 'CH'})\n${feriesLabels.join('\n')}`}
                            >-{feriesCount} {canton || 'CH'}</span>
                          )}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                          <input
                            type="number"
                            value={hOverride ?? String(heures)}
                            onChange={e => setHeuresOverride(prev => ({ ...prev, [m.id]: e.target.value }))}
                            style={{ width: 52, textAlign: 'right', background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', fontSize: 11, color: 'var(--foreground)' }}
                          />
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: tauxHoraire > 0 ? 'var(--foreground)' : '#F5A623', fontWeight: tauxHoraire > 0 ? 600 : 700 }}>
                          {tauxHoraire > 0
                            ? <>{formatCHF(tauxHoraire)}{lppUsed && <span style={{ fontSize: 9, fontWeight: 800, color: '#818CF8', marginLeft: 4 }}>LPP</span>}</>
                            : <span title="Aucune marge renseignée">À compléter</span>}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 800, color: effectiveMarge > 0 ? '#22C55E' : 'var(--muted)' }}>
                          {effectiveMarge > 0 ? formatCHF(effectiveMarge) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {bilanRows.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Aucune mission active sur cette période</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )} {/* fin activeMainTab === 'bilan' */}

      {/* ─── TAB : Missions ──────────────────────────────────────────────────── */}
      {activeMainTab === 'missions' && (
      <>

      {/* Onglets statut */}
      {rawMissions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {([
            { key: 'tous',        label: 'Tous',            count: rawMissions.length },
            { key: 'en_cours',    label: 'En Mission',      count: rawMissions.filter(m => !m._expired).length,  color: '#22C55E' },
            { key: 'fin_mission', label: 'Fin de Mission',  count: rawMissions.filter(m => m._expired).length,   color: '#EF4444' },
          ] as { key: typeof filtreStatut; label: string; count: number; color?: string }[]).map(tab => (
            <button key={tab.key} onClick={() => setFiltreStatut(tab.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${filtreStatut === tab.key ? (tab.color || 'var(--primary)') : 'var(--border)'}`, background: filtreStatut === tab.key ? (tab.color ? `${tab.color}18` : 'var(--primary-soft)') : 'var(--secondary)', color: filtreStatut === tab.key ? (tab.color || 'var(--primary)') : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
              {tab.label}
              <span style={{ fontSize: 10, fontWeight: 800, background: filtreStatut === tab.key ? (tab.color || 'var(--primary)') : 'var(--border)', color: filtreStatut === tab.key ? '#fff' : 'var(--muted)', borderRadius: 99, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filtres + en-tête colonnes */}
      {rawMissions.length > 0 && (
        <>
          {/* Filtre métier */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select value={filtreMetier} onChange={e => setFiltreMetier(e.target.value)}
              style={{ ...S.input, width: 'auto', minWidth: 180, fontSize: 12, padding: '6px 10px' }}>
              <option value="">Tous les métiers</option>
              {metiersUniques.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {filtreMetier && (
              <button onClick={() => setFiltreMetier('')} style={{ padding: '5px 10px', borderRadius: 6, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                Effacer
              </button>
            )}
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{missions.length} résultat{missions.length !== 1 ? 's' : ''}</span>
          </div>
          {/* En-tête colonnes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', marginBottom: 6 }}>
            <div style={{ flex: '0 0 48px' }}></div>
            <div style={{ flex: '0 0 90px' }}></div>
            <button onClick={() => toggleSort('candidat')} style={{ flex: '0 0 220px', fontSize: 11, fontWeight: 700, color: sortKey === 'candidat' ? 'var(--primary)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
              Candidat {sortKey === 'candidat' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button onClick={() => toggleSort('client')} style={{ flex: '0 0 200px', fontSize: 11, fontWeight: 700, color: sortKey === 'client' ? 'var(--primary)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
              Client {sortKey === 'client' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <div style={{ flex: '0 0 155px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dates</div>
            <div style={{ flex: '0 0 50px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Coeff</div>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Marge</div>
            <div style={{ width: 78 }}></div>
          </div>
        </>
      )}

      {/* Liste compacte */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--muted)' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Chargement…
        </div>
      ) : missions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
          <TrendingUp size={32} style={{ marginBottom: 10, opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Aucune mission</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Ajoutez une mission avec le bouton ci-dessus.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {missions.map(m => <MissionRow key={m.id} mission={m} onEdit={setEditMission} onDelete={setDeleteMission} onMakePermanent={handleMakePermanent} />)}
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }}>{missions.length} entrée{missions.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      </> )} {/* fin activeMainTab === 'missions' */}

      {/* ─── TAB : Mises à jour ──────────────────────────────────────────────── */}
      {/* Modals */}
      {editMission !== undefined && <MissionModal mission={editMission} onClose={() => setEditMission(undefined)} onSaved={invalidate} />}
      {deleteMission && <DeleteModal mission={deleteMission} onConfirm={handleDelete} onClose={() => setDeleteMission(null)} />}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } } input:focus, select:focus, textarea:focus { border-color: var(--primary) !important; box-shadow: 0 0 0 3px rgba(245,166,35,0.1); }`}</style>
    </div>
  )
}
