'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import {
  Bell, X, Search, FileText, Eye, MapPin, Pencil, Trash2,
  UserPlus, Check, Settings2, GitBranch,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCvHoverPreview, CvHoverTrigger, CvHoverPanel } from '@/components/CvHoverPreview'
import { useMetiers } from '@/hooks/useMetiers'
import { useMetierCategories } from '@/hooks/useMetierCategories'
import Link from 'next/link'

// ─── Constants ────────────────────────────────────────────────────────────────
const CONSULTANTS = ['Tous', 'João', 'Seb']

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candidat {
  id: string
  nom: string
  prenom: string | null
  localisation: string | null
  date_naissance: string | null
  photo_url: string | null
  cv_url: string | null
  cv_nom_fichier: string | null
  statut_pipeline: string | null
  pipeline_consultant: string | null
  pipeline_metier: string | null
  notes: string | null
  titre_poste: string | null
  created_at: string
}

interface Rappel {
  id: string
  candidat_id: string
  rappel_at: string
  note: string | null
  done: boolean
  candidats?: { id: string; nom: string; prenom: string | null; photo_url: string | null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(prenom: string | null, nom: string) {
  return ((prenom?.[0] ?? '') + (nom?.[0] ?? '')).toUpperCase() || '?'
}

function calcAge(dateNaissance: string | null): number | null {
  if (!dateNaissance) return null
  const s = dateNaissance.trim()
  if (/^\d{4}$/.test(s)) {
    const age = new Date().getFullYear() - parseInt(s, 10)
    return age > 0 && age < 120 ? age : null
  }
  if (/^\d{1,3}$/.test(s)) {
    const n = parseInt(s, 10)
    return n >= 1 && n <= 120 ? n : null
  }
  const iso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
  if (iso) {
    const d = new Date(+iso[1], +iso[2] - 1, +iso[3])
    const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000))
    return age > 0 && age < 120 ? age : null
  }
  const eu = s.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/)
  if (eu) {
    const d = new Date(+eu[3], +eu[2] - 1, +eu[1])
    const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000))
    return age > 0 && age < 120 ? age : null
  }
  return null
}

// ─── MetierPicker (shared) ────────────────────────────────────────────────────
function MetierPicker({ metiers, categories, value, onChange }: {
  metiers: string[]
  categories: { name: string; color: string; metiers: string[] }[]
  value: string
  onChange: (m: string) => void
}) {
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? metiers.filter(m => m.toLowerCase().includes(q.toLowerCase()))
    : metiers

  // Build display: grouped by category if no search
  const grouped = useMemo(() => {
    if (q.trim()) return [{ name: '', color: '', metiers: filtered }]
    if (categories.length === 0) return [{ name: '', color: '', metiers: filtered }]
    const result: { name: string; color: string; metiers: string[] }[] = []
    const assigned = new Set<string>()
    for (const cat of categories) {
      const ms = cat.metiers.filter(m => filtered.includes(m))
      if (ms.length) { result.push({ ...cat, metiers: ms }); ms.forEach(m => assigned.add(m)) }
    }
    const others = filtered.filter(m => !assigned.has(m))
    if (others.length) result.push({ name: 'Autres', color: '#94A3B8', metiers: others })
    return result
  }, [filtered, categories, q])

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filtrer les métiers…"
          style={{
            width: '100%', border: '1.5px solid var(--border)', borderRadius: 7,
            padding: '6px 8px 6px 28px', fontSize: 13,
            background: 'var(--secondary)', color: 'var(--foreground)',
          }}
        />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          onClick={() => onChange('')}
          style={{
            textAlign: 'left', padding: '5px 8px', borderRadius: 6, fontSize: 12,
            border: 'none', cursor: 'pointer',
            background: value === '' ? '#F5A62330' : 'transparent',
            color: value === '' ? '#c07a00' : 'var(--muted-foreground)',
            fontWeight: value === '' ? 700 : 400,
          }}
        >
          — Aucun métier
        </button>
        {grouped.map(group => (
          <div key={group.name}>
            {group.name && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: group.color || 'var(--muted-foreground)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '6px 8px 2px',
              }}>
                {group.name}
              </div>
            )}
            {group.metiers.map(m => (
              <button
                key={m}
                onClick={() => onChange(m)}
                style={{
                  width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6,
                  fontSize: 13, border: 'none', cursor: 'pointer',
                  background: value === m ? '#F5A62330' : 'transparent',
                  color: value === m ? '#c07a00' : 'var(--foreground)',
                  fontWeight: value === m ? 700 : 400,
                }}
              >
                {value === m && <Check size={11} style={{ display: 'inline', marginRight: 5 }} />}
                {m}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── NoteModal ────────────────────────────────────────────────────────────────
function NoteModal({ nom, notes, onClose, onSave }: {
  nom: string
  notes: string
  onClose: () => void
  onSave: (notes: string) => void
}) {
  const [value, setValue] = useState(notes)
  if (typeof window === 'undefined') return null
  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Notes — {nom}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={18} /></button>
        </div>
        <textarea
          autoFocus value={value} onChange={e => setValue(e.target.value)}
          style={{ width: '100%', minHeight: 120, border: '1.5px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 14, resize: 'vertical', background: 'var(--secondary)', color: 'var(--foreground)', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose} className="neo-btn" style={{ fontSize: 13, padding: '6px 14px' }}>Annuler</button>
          <button onClick={() => { onSave(value); onClose() }} className="neo-btn-yellow" style={{ fontSize: 13, padding: '6px 14px' }}>Enregistrer</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── RappelModal ──────────────────────────────────────────────────────────────
function RappelModal({ candidatId, nom, existingRappel, onClose, onSaved }: {
  candidatId: string
  nom: string
  existingRappel?: Rappel | null
  onClose: () => void
  onSaved: () => void
}) {
  const defaultDt = existingRappel
    ? existingRappel.rappel_at.slice(0, 16)
    : (() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d.toISOString().slice(0, 16) })()

  const [datetime, setDatetime] = useState(defaultDt)
  const [note, setNote] = useState(existingRappel?.note ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!datetime) return
    setSaving(true)
    try {
      if (existingRappel) {
        await fetch('/api/pipeline/rappels', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: existingRappel.id, rappel_at: new Date(datetime).toISOString(), note }) })
      } else {
        await fetch('/api/pipeline/rappels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidat_id: candidatId, rappel_at: new Date(datetime).toISOString(), note }) })
      }
      toast.success('Rappel enregistré')
      onSaved(); onClose()
    } catch { toast.error('Erreur') } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!existingRappel) return
    try {
      await fetch('/api/pipeline/rappels', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: existingRappel.id }) })
      toast.success('Rappel supprimé')
      onSaved(); onClose()
    } catch { toast.error('Erreur') }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 24, width: 380, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}><Bell size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Rappel — {nom}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={18} /></button>
        </div>
        <label style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'block', marginBottom: 4 }}>Date et heure</label>
        <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)}
          style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, background: 'var(--secondary)', color: 'var(--foreground)', marginBottom: 12 }}
        />
        <label style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'block', marginBottom: 4 }}>Note (optionnel)</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: Rappeler pour l'entretien"
          style={{ width: '100%', minHeight: 72, border: '1.5px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical', background: 'var(--secondary)', color: 'var(--foreground)', fontFamily: 'inherit', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <div>
            {existingRappel && (
              <button onClick={handleDelete} style={{ background: 'none', border: '1.5px solid #EF4444', color: '#EF4444', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Supprimer</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="neo-btn" style={{ fontSize: 13, padding: '6px 14px' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving} className="neo-btn-yellow" style={{ fontSize: 13, padding: '6px 14px' }}>{saving ? '…' : 'Enregistrer'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── ModifierModal ────────────────────────────────────────────────────────────
function ModifierModal({ candidat, metiers, categories, onClose, onSaved }: {
  candidat: Candidat
  metiers: string[]
  categories: { name: string; color: string; metiers: string[] }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [consultant, setConsultant] = useState(candidat.pipeline_consultant ?? 'João')
  const [metier, setMetier] = useState(candidat.pipeline_metier ?? '')
  const [saving, setSaving] = useState(false)
  const nom = `${candidat.prenom || ''} ${candidat.nom}`.trim()

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/candidats/${candidat.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_consultant: consultant, pipeline_metier: metier || null }),
      })
      toast.success('Modifié')
      onSaved(); onClose()
    } catch { toast.error('Erreur') } finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Modifier — {nom}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={18} /></button>
        </div>

        <label style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>Consultant</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['João', 'Seb'].map(c => (
            <button key={c} onClick={() => setConsultant(c)} style={{
              padding: '6px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              border: `1.5px solid ${consultant === c ? '#F5A623' : 'var(--border)'}`,
              background: consultant === c ? '#F5A623' : 'var(--secondary)',
              color: consultant === c ? '#000' : 'var(--foreground)',
              fontWeight: consultant === c ? 700 : 400,
            }}>{c}</button>
          ))}
        </div>

        <label style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>Métier</label>
        <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 16 }}>
          <MetierPicker metiers={metiers} categories={categories} value={metier} onChange={setMetier} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="neo-btn" style={{ fontSize: 13, padding: '6px 14px' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving} className="neo-btn-yellow" style={{ fontSize: 13, padding: '6px 14px' }}>{saving ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── AddToPipelineModal ───────────────────────────────────────────────────────
function AddToPipelineModal({ metiers, categories, onClose, onAdded }: {
  metiers: string[]
  categories: { name: string; color: string; metiers: string[] }[]
  onClose: () => void
  onAdded: () => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Candidat[]>([])
  const [selected, setSelected] = useState<Candidat | null>(null)
  const [consultant, setConsultant] = useState('João')
  const [metier, setMetier] = useState('')
  const [saving, setSaving] = useState(false)
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/candidats?search=${encodeURIComponent(q)}&per_page=30`)
      const json = await res.json()
      setResults(json.candidats ?? [])
    } catch { /* ignore */ } finally { setSearching(false) }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(search), 300)
  }, [search, doSearch])

  async function handleAdd() {
    if (!selected) return
    setSaving(true)
    try {
      await fetch(`/api/candidats/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut_pipeline: 'nouveau', pipeline_consultant: consultant, pipeline_metier: metier || null }),
      })
      toast.success(`${selected.prenom || ''} ${selected.nom} ajouté au pipeline`)
      onAdded(); onClose()
    } catch { toast.error('Erreur') } finally { setSaving(false) }
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 24, width: 480, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Ajouter au pipeline</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={18} /></button>
        </div>

        {!selected ? (
          <>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input
                autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher par nom, prénom, métier…"
                style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 10px 8px 32px', fontSize: 14, background: 'var(--secondary)', color: 'var(--foreground)' }}
              />
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {searching && <div style={{ fontSize: 13, color: 'var(--muted-foreground)', padding: 8 }}>Recherche…</div>}
              {!searching && results.map(c => (
                <button key={c.id} onClick={() => setSelected(c)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F5A623', color: '#000', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                    <span style={{ position: 'absolute' }}>{getInitials(c.prenom, c.nom)}</span>
                    {c.photo_url && <img src={c.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>{c.prenom} {c.nom}</div>
                    {c.titre_poste && <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{c.titre_poste}</div>}
                    {c.localisation && <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.localisation}</div>}
                  </div>
                  {c.pipeline_consultant && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, background: '#F5A62322', color: '#c07a00', border: '1px solid #F5A62344', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
                      Pipeline
                    </span>
                  )}
                </button>
              ))}
              {!searching && search.length >= 2 && results.length === 0 && (
                <div style={{ color: 'var(--muted-foreground)', fontSize: 13, padding: 8 }}>Aucun résultat</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: 'var(--secondary)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F5A623', color: '#000', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                <span style={{ position: 'absolute' }}>{getInitials(selected.prenom, selected.nom)}</span>
                {selected.photo_url && <img src={selected.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{selected.prenom} {selected.nom}</div>
                {selected.titre_poste && <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{selected.titre_poste}</div>}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={16} /></button>
            </div>

            <label style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>Consultant</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['João', 'Seb'].map(c => (
                <button key={c} onClick={() => setConsultant(c)} style={{
                  padding: '6px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  border: `1.5px solid ${consultant === c ? '#F5A623' : 'var(--border)'}`,
                  background: consultant === c ? '#F5A623' : 'var(--secondary)',
                  color: consultant === c ? '#000' : 'var(--foreground)',
                  fontWeight: consultant === c ? 700 : 400,
                }}>{c}</button>
              ))}
            </div>

            <label style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>Métier</label>
            <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 16 }}>
              <MetierPicker metiers={metiers} categories={categories} value={metier} onChange={setMetier} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} className="neo-btn" style={{ fontSize: 13, padding: '6px 14px' }}>Annuler</button>
              <button onClick={handleAdd} disabled={saving} className="neo-btn-yellow" style={{ fontSize: 13, padding: '6px 14px' }}>{saving ? '…' : 'Ajouter'}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

// ─── CandidatCard ─────────────────────────────────────────────────────────────
function CandidatCard({ candidat, rappel, cvHook, onNote, onRappel, onModifier, onRetirer }: {
  candidat: Candidat
  rappel: Rappel | null
  cvHook: ReturnType<typeof useCvHoverPreview>
  onNote: () => void
  onRappel: () => void
  onModifier: () => void
  onRetirer: () => void
}) {
  const age = calcAge(candidat.date_naissance)
  const nom = `${candidat.prenom || ''} ${candidat.nom}`.trim()
  const rappelDue = rappel && !rappel.done && new Date(rappel.rappel_at) <= new Date(Date.now() + 60 * 60 * 1000)

  return (
    <div
      style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#F5A623', color: '#000', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, overflow: 'hidden', border: '2px solid var(--border)', position: 'relative' }}>
          <span style={{ position: 'absolute' }}>{getInitials(candidat.prenom, candidat.nom)}</span>
          {candidat.photo_url && <img src={candidat.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            {candidat.localisation && (
              <span style={{ fontSize: 11, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 2 }}>
                <MapPin size={10} />{candidat.localisation}
              </span>
            )}
            {age !== null && <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{age} ans</span>}
          </div>
        </div>
        {rappel && !rappel.done && (
          <div title={`Rappel: ${new Date(rappel.rappel_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
            style={{ width: 26, height: 26, borderRadius: 8, background: rappelDue ? '#EF444420' : '#F5A62320', border: `1.5px solid ${rappelDue ? '#EF4444' : '#F5A623'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bell size={13} color={rappelDue ? '#EF4444' : '#F5A623'} />
          </div>
        )}
      </div>

      {/* Métier badge */}
      {candidat.pipeline_metier && (
        <div style={{ display: 'inline-flex', alignItems: 'center', background: '#F5A62318', border: '1px solid #F5A62344', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#c07a00', width: 'fit-content' }}>
          {candidat.pipeline_metier}
        </div>
      )}

      {/* Notes preview */}
      {candidat.notes && (
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', background: 'var(--secondary)', borderRadius: 6, padding: '6px 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {candidat.notes}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Link href={`/candidats/${candidat.id}`} title="Fiche candidat"
          style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--muted-foreground)', textDecoration: 'none' }}>
          <FileText size={13} />
        </Link>

        {candidat.cv_url && (
          <CvHoverTrigger cvUrl={candidat.cv_url} cvNomFichier={candidat.cv_nom_fichier} candidatId={candidat.id} hook={cvHook}>
            <button title="Aperçu CV" style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
              <Eye size={13} />
            </button>
          </CvHoverTrigger>
        )}

        <button onClick={onNote} title="Notes"
          style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--border)', background: 'var(--card)', color: candidat.notes ? 'var(--primary)' : 'var(--muted-foreground)', cursor: 'pointer' }}>
          <Pencil size={13} />
        </button>

        <button onClick={onRappel} title="Rappel"
          style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${rappel && !rappel.done ? '#F5A623' : 'var(--border)'}`, background: 'var(--card)', color: rappel && !rappel.done ? '#F5A623' : 'var(--muted-foreground)', cursor: 'pointer' }}>
          <Bell size={13} />
        </button>

        <button onClick={onModifier} title="Modifier consultant / métier"
          style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
          <Settings2 size={13} />
        </button>

        <button onClick={onRetirer} title="Retirer du pipeline"
          style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--border)', background: 'var(--card)', color: '#EF4444', cursor: 'pointer', marginLeft: 'auto' }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const qc = useQueryClient()
  const cvHook = useCvHoverPreview()
  const { metiers } = useMetiers()
  const { categories } = useMetierCategories()

  // Tabs
  const [activeConsultant, setActiveConsultant] = useState('Tous')
  const [activeMetier, setActiveMetier] = useState('Tous')

  // Modals
  const [showAdd, setShowAdd] = useState(false)
  const [noteModal, setNoteModal] = useState<{ candidat: Candidat } | null>(null)
  const [rappelModal, setRappelModal] = useState<{ candidat: Candidat } | null>(null)
  const [modifierModal, setModifierModal] = useState<{ candidat: Candidat } | null>(null)

  // ── Fetch candidats pipeline ──────────────────────────────────────────────
  const { data: candidatsData, isLoading } = useQuery({
    queryKey: ['pipeline-candidats'],
    queryFn: async () => {
      const res = await fetch('/api/candidats?statut_pipeline=true&per_page=500')
      const json = await res.json()
      return (json.candidats ?? []) as Candidat[]
    },
    staleTime: 30_000,
  })
  const allCandidats = candidatsData ?? []

  // ── Fetch rappels ─────────────────────────────────────────────────────────
  const { data: rappelsData, refetch: refetchRappels } = useQuery({
    queryKey: ['pipeline-rappels'],
    queryFn: async () => {
      const res = await fetch('/api/pipeline/rappels')
      const json = await res.json()
      return (json.rappels ?? []) as Rappel[]
    },
    staleTime: 30_000,
  })
  const rappels = rappelsData ?? []

  const rappelByCandidatId = useMemo(() => {
    const map = new Map<string, Rappel>()
    for (const r of rappels) { if (!r.done) map.set(r.candidat_id, r) }
    return map
  }, [rappels])

  // ── Rappel notifications permanentes ──────────────────────────────────────
  const notifiedIds = useRef(new Set<string>())

  useEffect(() => {
    const check = () => {
      const now = Date.now()
      for (const r of rappels) {
        if (r.done || notifiedIds.current.has(r.id)) continue
        const at = new Date(r.rappel_at).getTime()
        if (at <= now) {
          notifiedIds.current.add(r.id)
          const nom = r.candidats
            ? `${r.candidats.prenom || ''} ${r.candidats.nom}`.trim()
            : 'Candidat'
          toast(
            `🔔 Rappel : ${nom}${r.note ? ` — ${r.note}` : ''}`,
            {
              duration: Infinity,
              action: {
                label: 'Valider',
                onClick: async () => {
                  await fetch('/api/pipeline/rappels', {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: r.id, done: true }),
                  })
                  refetchRappels()
                },
              },
              cancel: { label: 'Fermer', onClick: () => {} },
            }
          )
        }
      }
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [rappels, refetchRappels])

  // ── Compteurs par consultant ───────────────────────────────────────────────
  const consultantCounts = useMemo(() => {
    const counts: Record<string, number> = { Tous: allCandidats.length }
    for (const c of allCandidats) {
      const k = c.pipeline_consultant ?? 'Autres'
      counts[k] = (counts[k] ?? 0) + 1
    }
    return counts
  }, [allCandidats])

  // ── Candidats filtrés par consultant (base pour métiers) ──────────────────
  const byConsultant = useMemo(() => {
    if (activeConsultant === 'Tous') return allCandidats
    return allCandidats.filter(c => c.pipeline_consultant === activeConsultant)
  }, [allCandidats, activeConsultant])

  // ── Métier sub-tabs — uniquement depuis les candidats du consultant actif ──
  const metierTabs = useMemo(() => {
    const counts = new Map<string, number>()
    let othersCount = 0
    for (const c of byConsultant) {
      if (c.pipeline_metier) counts.set(c.pipeline_metier, (counts.get(c.pipeline_metier) ?? 0) + 1)
      else othersCount++
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    const tabs: { label: string; count: number }[] = [
      { label: 'Tous', count: byConsultant.length },
      ...sorted.map(([label, count]) => ({ label, count })),
    ]
    if (othersCount > 0) tabs.push({ label: 'Autres', count: othersCount })
    return tabs
  }, [byConsultant])

  useEffect(() => {
    const labels = metierTabs.map(t => t.label)
    if (activeMetier !== 'Tous' && !labels.includes(activeMetier)) setActiveMetier('Tous')
  }, [metierTabs, activeMetier])

  // ── Filtered candidats ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = byConsultant
    if (activeMetier === 'Autres') list = list.filter(c => !c.pipeline_metier)
    else if (activeMetier !== 'Tous') list = list.filter(c => c.pipeline_metier === activeMetier)
    return list
  }, [byConsultant, activeMetier])

  const cols = useMemo(() => {
    const c0: Candidat[] = [], c1: Candidat[] = [], c2: Candidat[] = []
    filtered.forEach((c, i) => { if (i % 3 === 0) c0.push(c); else if (i % 3 === 1) c1.push(c); else c2.push(c) })
    return [c0, c1, c2]
  }, [filtered])

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleSaveNote(candidat: Candidat, notes: string) {
    try {
      await fetch(`/api/candidats/${candidat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) })
      qc.invalidateQueries({ queryKey: ['pipeline-candidats'] })
    } catch { toast.error('Erreur') }
  }

  async function handleRetirer(candidat: Candidat) {
    const nom = `${candidat.prenom || ''} ${candidat.nom}`.trim()
    if (!confirm(`Retirer ${nom} du pipeline ?`)) return
    try {
      await fetch(`/api/candidats/${candidat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut_pipeline: null, pipeline_consultant: null, pipeline_metier: null }) })
      qc.invalidateQueries({ queryKey: ['pipeline-candidats'] })
      toast.success(`${nom} retiré du pipeline`)
    } catch { toast.error('Erreur') }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="d-page" style={{ maxWidth: 1400 }}>
      {/* Header */}
      <div className="d-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GitBranch size={22} color="var(--primary)" />Pipeline
          </h1>
          <p className="d-page-sub">
            {allCandidats.length} candidat{allCandidats.length !== 1 ? 's' : ''} en suivi
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="neo-btn-yellow" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 16px' }}>
          <UserPlus size={15} /> Ajouter
        </button>
      </div>

      {/* Consultant tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1.5px solid var(--border)' }}>
        {CONSULTANTS.map(c => {
          const count = consultantCounts[c] ?? 0
          const active = activeConsultant === c
          return (
            <button key={c} onClick={() => { setActiveConsultant(c); setActiveMetier('Tous') }} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none', marginBottom: -1.5,
              borderBottom: active ? '2.5px solid #F5A623' : '2.5px solid transparent',
              color: active ? '#F5A623' : 'var(--muted-foreground)',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {c}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                background: active ? '#F5A62330' : 'var(--secondary)',
                color: active ? '#c07a00' : 'var(--muted-foreground)',
                border: `1px solid ${active ? '#F5A62366' : 'var(--border)'}`,
              }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Métier sub-tabs */}
      {metierTabs.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {metierTabs.map(({ label, count }) => {
            const active = activeMetier === label
            return (
              <button key={label} onClick={() => setActiveMetier(label)} style={{
                padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                borderRadius: 20, border: '1.5px solid var(--border)',
                background: active ? '#F5A623' : 'var(--secondary)',
                color: active ? '#000' : 'var(--muted-foreground)',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {label}
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '0px 5px', borderRadius: 8,
                  background: active ? 'rgba(0,0,0,0.15)' : 'var(--border)',
                  color: active ? '#000' : 'var(--muted-foreground)',
                }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--muted-foreground)' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Pipeline vide</div>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 20 }}>
            Ajoutez des candidats depuis la liste ou la fiche candidat.
          </div>
          <button onClick={() => setShowAdd(true)} className="neo-btn-yellow" style={{ fontSize: 13, padding: '8px 20px' }}>
            <UserPlus size={14} style={{ display: 'inline', marginRight: 6 }} />Ajouter un candidat
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {cols.map((col, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {col.map(candidat => (
                <CandidatCard
                  key={candidat.id}
                  candidat={candidat}
                  rappel={rappelByCandidatId.get(candidat.id) ?? null}
                  cvHook={cvHook}
                  onNote={() => setNoteModal({ candidat })}
                  onRappel={() => setRappelModal({ candidat })}
                  onModifier={() => setModifierModal({ candidat })}
                  onRetirer={() => handleRetirer(candidat)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <CvHoverPanel hook={cvHook} />

      {showAdd && <AddToPipelineModal metiers={metiers} categories={categories} onClose={() => setShowAdd(false)} onAdded={() => qc.invalidateQueries({ queryKey: ['pipeline-candidats'] })} />}
      {noteModal && <NoteModal nom={`${noteModal.candidat.prenom || ''} ${noteModal.candidat.nom}`.trim()} notes={noteModal.candidat.notes ?? ''} onClose={() => setNoteModal(null)} onSave={notes => handleSaveNote(noteModal.candidat, notes)} />}
      {rappelModal && <RappelModal candidatId={rappelModal.candidat.id} nom={`${rappelModal.candidat.prenom || ''} ${rappelModal.candidat.nom}`.trim()} existingRappel={rappelByCandidatId.get(rappelModal.candidat.id) ?? null} onClose={() => setRappelModal(null)} onSaved={refetchRappels} />}
      {modifierModal && <ModifierModal candidat={modifierModal.candidat} metiers={metiers} categories={categories} onClose={() => setModifierModal(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['pipeline-candidats'] })} />}
    </div>
  )
}
