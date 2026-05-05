'use client'
import Image from 'next/image'
import { formatFullName, formatInitials } from '@/lib/format-candidat'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  Bell, X, Search, FileText, Eye, MapPin, Pencil, Trash2,
  UserPlus, Check, Settings2, GitBranch, CheckCircle2, Clock,
  ChevronDown,
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
  return formatInitials(prenom, nom) || '?'
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
    if (others.length) result.push({ name: 'Autres', color: 'var(--muted-foreground)', metiers: others })
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
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 16, width: 420, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 12px', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Notes — {nom}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '0 24px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <textarea
            autoFocus value={value} onChange={e => setValue(e.target.value)}
            style={{ width: '100%', minHeight: 120, border: '1.5px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 14, resize: 'vertical', background: 'var(--secondary)', color: 'var(--foreground)', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 24px 18px', borderTop: '1.5px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
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
      // v2.1.5 — dismiss notif permanente + dédup confirmation
      toast.dismiss(`rappel-notif-${existingRappel.id}`)
      toast.success('Rappel supprimé', { id: `rappel-deleted-${existingRappel.id}` })
      onSaved(); onClose()
    } catch { toast.error('Erreur') }
  }

  if (typeof window === 'undefined') return null
  // v2.1.5 — Refonte design v2 (Jakarta + Instrument Serif title + boutons inline v2)
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
        width: 440, maxWidth: '92vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 64px -16px rgba(0,0,0,0.45)',
      }}>
        {/* Header serif v2 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 14px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{
            margin: 0, display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 24, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.01em',
            color: 'var(--foreground)',
          }}>
            <Bell size={18} color="var(--primary)" /> Rappel — {nom}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
        </div>
        {/* Body */}
        <div style={{ padding: '18px 24px 8px', flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Date et heure</label>
            <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)}
              style={{
                width: '100%', height: 38, padding: '0 12px', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--surface, var(--card))',
                color: 'var(--foreground)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Note (optionnel)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: Rappeler pour l'entretien"
              style={{
                width: '100%', minHeight: 84, padding: '10px 12px', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--surface, var(--card))',
                color: 'var(--foreground)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.55, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', padding: '14px 24px 18px', borderTop: '1px solid var(--border)' }}>
          <div>
            {existingRappel && (
              <button onClick={handleDelete} style={{
                padding: '8px 14px', borderRadius: 10,
                border: '1.5px solid var(--destructive)', background: 'transparent',
                color: 'var(--destructive)', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Supprimer</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              padding: '8px 14px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--card)',
              color: 'var(--foreground)', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Annuler</button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '8px 16px', borderRadius: 10,
              border: '1.5px solid var(--primary)', background: 'var(--primary)',
              color: '#1C1A14', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 12px -4px rgba(234,179,8,.45)',
            }}>{saving ? '…' : 'Enregistrer'}</button>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 16, width: 420, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 12px', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Modifier — {nom}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '0 24px 12px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
          <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: 8 }}>
            <MetierPicker metiers={metiers} categories={categories} value={metier} onChange={setMetier} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 24px 18px', borderTop: '1.5px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 24, width: 480, maxWidth: '90vw', maxHeight: '90vh', overflow: 'hidden auto', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
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
                    {c.photo_url && <Image src={c.photo_url} alt="" width={34} height={34} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>{formatFullName(c.prenom, c.nom)}</div>
                    {c.titre_poste && <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{c.titre_poste}</div>}
                    {c.localisation && <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{c.localisation}</div>}
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
                {selected.photo_url && <Image src={selected.photo_url} alt="" width={36} height={36} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{formatFullName(selected.prenom, selected.nom)}</div>
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
function CandidatCard({ candidat, rappel, cvHook, onNote, onRappel, onModifier, onRetirer, getColorForMetier }: {
  candidat: Candidat
  rappel: Rappel | null
  cvHook: ReturnType<typeof useCvHoverPreview>
  onNote: () => void
  onRappel: () => void
  onModifier: () => void
  onRetirer: () => void
  getColorForMetier: (metier: string) => string | undefined
}) {
  const age = calcAge(candidat.date_naissance)
  const nom = formatFullName(candidat.prenom, candidat.nom)
  const rappelDue = rappel && !rappel.done && new Date(rappel.rappel_at) <= new Date(Date.now() + 60 * 60 * 1000)

  // v2.0.5 — Grid horizontal avec colonnes alignées (style liste candidats)
  const mc = candidat.pipeline_metier ? (getColorForMetier(candidat.pipeline_metier) || '#F5A623') : '#F5A623'
  return (
    <div
      style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(245,166,35,0.40)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(28,26,20,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Photo (col 48px strict) */}
      <div style={{ flex: '0 0 48px', width: 48, height: 48, borderRadius: 10, background: '#F5A623', color: '#000', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, overflow: 'hidden', position: 'relative' }}>
        <span style={{ position: 'absolute' }}>{getInitials(candidat.prenom, candidat.nom)}</span>
        {candidat.photo_url && <Image src={candidat.photo_url} alt="" width={48} height={48} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
      </div>

      {/* Nom + métier pill (flex 1) */}
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span title={nom} style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</span>
        {candidat.pipeline_metier && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${mc}18`, border: `1px solid ${mc}44`, borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 600, color: mc, whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: mc }} />
            {candidat.pipeline_metier}
          </span>
        )}
      </div>

      {/* Lieu (col 200px) */}
      <div style={{ flex: '0 0 200px', minWidth: 0, fontSize: 12, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {candidat.localisation ? (
          <>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            <span title={candidat.localisation} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidat.localisation}</span>
          </>
        ) : <span style={{ color: 'var(--border)' }}>—</span>}
      </div>

      {/* Âge (col 50px) */}
      <div style={{ flex: '0 0 50px', fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
        {age !== null ? `${age} ans` : <span style={{ color: 'var(--border)' }}>—</span>}
      </div>

      {/* Notes preview (col 220px) */}
      <div style={{ flex: '0 0 220px', minWidth: 0, fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
        {candidat.notes ? (
          <span title={candidat.notes} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
            📝 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{candidat.notes}</span>
          </span>
        ) : <span style={{ color: 'var(--border)' }}>—</span>}
      </div>

      {/* Rappel badge (col 90px, vide si pas de rappel) */}
      <div style={{ flex: '0 0 90px', display: 'flex', justifyContent: 'flex-start' }}>
        {rappel && !rappel.done ? (
          <div title={`Rappel: ${new Date(rappel.rappel_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: rappelDue ? 'rgba(239,68,68,0.10)' : 'rgba(245,166,35,0.12)', border: `1px solid ${rappelDue ? 'rgba(239,68,68,0.40)' : 'rgba(245,166,35,0.40)'}`, color: rappelDue ? '#B91C1C' : '#B45309', fontSize: 11, fontWeight: 700 }}>
            <Bell size={11} />
            {new Date(rappel.rappel_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </div>
        ) : null}
      </div>

      {/* Actions (col 180px) */}
      <div style={{ flex: '0 0 180px', display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
        <Link href={`/candidats/${candidat.id}?from=pipeline`} title="Fiche candidat"
          style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', background: 'var(--surface, var(--card))', color: 'var(--muted-foreground)', textDecoration: 'none' }}>
          <FileText size={13} />
        </Link>
        {candidat.cv_url && (
          <CvHoverTrigger cvUrl={candidat.cv_url} cvNomFichier={candidat.cv_nom_fichier} candidatId={candidat.id} hook={cvHook}>
            <button title="Aperçu CV" style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', background: 'var(--surface, var(--card))', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
              <Eye size={13} />
            </button>
          </CvHoverTrigger>
        )}
        <button onClick={onNote} title="Notes"
          style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${candidat.notes ? 'rgba(245,166,35,0.40)' : 'var(--border)'}`, background: candidat.notes ? 'var(--primary-soft)' : 'var(--surface, var(--card))', color: candidat.notes ? 'var(--primary)' : 'var(--muted-foreground)', cursor: 'pointer' }}>
          <Pencil size={13} />
        </button>
        <button onClick={onRappel} title="Rappel"
          style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${rappel && !rappel.done ? 'rgba(245,166,35,0.40)' : 'var(--border)'}`, background: rappel && !rappel.done ? 'var(--primary-soft)' : 'var(--surface, var(--card))', color: rappel && !rappel.done ? 'var(--primary)' : 'var(--muted-foreground)', cursor: 'pointer' }}>
          <Bell size={13} />
        </button>
        <button onClick={onModifier} title="Modifier consultant / métier"
          style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', background: 'var(--surface, var(--card))', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
          <Settings2 size={13} />
        </button>
        <button onClick={onRetirer} title="Retirer du pipeline"
          style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(239,68,68,0.30)', background: 'var(--surface, var(--card))', color: 'var(--destructive)', cursor: 'pointer' }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// ─── RappelsPanel — modal liste des rappels (En cours / Terminés) ────────────
function RappelsPanel({ rappels, onClose, onUpdate }: {
  rappels: Rappel[]
  onClose: () => void
  onUpdate: () => void
}) {
  const [tab, setTab] = useState<'cours' | 'passes'>('cours')

  const enCours = useMemo(() =>
    [...rappels].filter(r => !r.done).sort((a, b) => a.rappel_at.localeCompare(b.rappel_at)),
    [rappels]
  )
  const passes = useMemo(() =>
    [...rappels].filter(r => r.done).sort((a, b) => b.rappel_at.localeCompare(a.rappel_at)),
    [rappels]
  )

  const list = tab === 'cours' ? enCours : passes

  async function markDone(id: string, done: boolean) {
    await fetch('/api/pipeline/rappels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, done }),
    })
    onUpdate()
    toast.success(done ? 'Rappel marqué terminé' : 'Rappel réactivé')
  }

  async function deleteRappel(id: string) {
    await fetch('/api/pipeline/rappels', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    // v2.1.5 — dismiss notif permanente du rappel + dédup toast confirmation via id
    toast.dismiss(`rappel-notif-${id}`)
    onUpdate()
    toast.success('Rappel supprimé', { id: `rappel-deleted-${id}` })
  }

  if (typeof window === 'undefined') return null
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 600, maxHeight: '85vh',
          background: 'var(--card)', border: '1.5px solid var(--border)',
          borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={16} style={{ color: 'var(--primary)' }} />
            Mes rappels
          </h2>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Onglets — v2.0.1 contraste corrigé : actif = primary-soft + foncé brand (au lieu de jaune sur jaune) */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 20px 0', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setTab('cours')}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '8px 8px 0 0',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700,
              background: tab === 'cours' ? 'var(--primary-soft)' : 'transparent',
              color: tab === 'cours' ? '#B45309' : 'var(--muted-foreground)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Clock size={13} /> En cours ({enCours.length})
          </button>
          <button
            onClick={() => setTab('passes')}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '8px 8px 0 0',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700,
              background: tab === 'passes' ? 'var(--secondary)' : 'transparent',
              color: tab === 'passes' ? 'var(--foreground)' : 'var(--muted-foreground)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <CheckCircle2 size={13} /> Terminés ({passes.length})
          </button>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {list.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              {tab === 'cours' ? 'Aucun rappel en cours.' : 'Aucun rappel terminé.'}
            </div>
          )}
          {list.map(r => {
            const nom = r.candidats ? `${r.candidats.prenom || ''} ${r.candidats.nom}`.trim() : 'Candidat'
            const when = new Date(r.rappel_at)
            const wasOverdue = !r.done && when.getTime() <= Date.now()
            return (
              <div key={r.id} style={{
                padding: '12px 14px', marginBottom: 6,
                background: wasOverdue ? 'var(--destructive-soft)' : 'var(--background)',
                border: `1px solid ${wasOverdue ? 'var(--destructive)' : 'var(--border)'}`,
                borderRadius: 10,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 3 }}>{nom}</div>
                  {r.note && <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4, whiteSpace: 'pre-wrap' }}>{r.note}</div>}
                  <div style={{ fontSize: 11, color: wasOverdue ? 'var(--destructive)' : 'var(--muted)', fontWeight: 600 }}>
                    {when.toLocaleString('fr-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {wasOverdue && ' · en retard'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {r.candidat_id && (
                    <a href={`/candidats/${r.candidat_id}?from=pipeline`} title="Voir la fiche" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                      <Eye size={13} />
                    </a>
                  )}
                  <button
                    onClick={() => markDone(r.id, !r.done)}
                    title={r.done ? 'Réactiver' : 'Marquer terminé'}
                    style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: r.done ? 'var(--muted-foreground)' : 'var(--success)' }}
                  >
                    {r.done ? <Clock size={13} /> : <Check size={13} />}
                  </button>
                  <button
                    onClick={() => deleteRappel(r.id)}
                    title="Supprimer"
                    style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--destructive)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function PipelinePage() {
  const qc = useQueryClient()
  const cvHook = useCvHoverPreview()
  const { metiers } = useMetiers()
  const { categories, getColorForMetier } = useMetierCategories()

  // Tabs
  const [activeConsultant, setActiveConsultant] = useState('Tous')
  const [activeMetier, setActiveMetier] = useState('Tous')
  const [activeCategory, setActiveCategory] = useState<string | null>(null) // v2.1.8 — catégorie ouverte dans le dropdown horizontal

  // Modals
  const [showAdd, setShowAdd] = useState(false)
  const [noteModal, setNoteModal] = useState<{ candidat: Candidat } | null>(null)
  const [rappelModal, setRappelModal] = useState<{ candidat: Candidat } | null>(null)
  const [modifierModal, setModifierModal] = useState<{ candidat: Candidat } | null>(null)

  // Panneau rappels — ouvert via ?rappels=1 (depuis badge dashboard)
  const router = useRouter()
  const [showRappelsPanel, setShowRappelsPanel] = useState(false)
  useEffect(() => {
    const sync = () => {
      const qs = new URLSearchParams(window.location.search)
      setShowRappelsPanel(qs.get('rappels') === '1')
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const closeRappelsPanel = useCallback(() => {
    const qs = new URLSearchParams(window.location.search)
    qs.delete('rappels')
    const next = `/pipeline${qs.toString() ? '?' + qs.toString() : ''}`
    router.replace(next, { scroll: false })
    setShowRappelsPanel(false)
  }, [router])

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
  const rappelsEnCoursCount = useMemo(() => rappels.filter(r => !r.done).length, [rappels])

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
          // v2.1.5 — id stable pour pouvoir le dismiss quand le rappel est supprimé/marqué done
          toast(
            `🔔 Rappel : ${nom}${r.note ? ` — ${r.note}` : ''}`,
            {
              id: `rappel-notif-${r.id}`,
              duration: Infinity,
              action: {
                label: 'Valider',
                onClick: async () => {
                  await fetch('/api/pipeline/rappels', {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: r.id, done: true }),
                  })
                  toast.dismiss(`rappel-notif-${r.id}`)
                  refetchRappels()
                },
              },
              cancel: { label: 'Fermer', onClick: () => toast.dismiss(`rappel-notif-${r.id}`) },
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
      {/* Header — v2.1.15 : pill compteur cohérent avec Candidats/Clients */}
      <div className="d-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="d-page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <GitBranch size={22} color="var(--primary)" />
            <span>Pipeline</span>
            <span
              title={`${allCandidats.length} candidat${allCandidats.length > 1 ? 's' : ''} en suivi`}
              style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 14, fontWeight: 700,
                color: 'var(--muted-foreground)',
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '3px 10px',
                fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                letterSpacing: '0.01em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.4,
              }}
            >
              {allCandidats.length.toLocaleString('fr-CH')}
            </span>
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Cloche Mes rappels */}
          <button
            onClick={() => setShowRappelsPanel(true)}
            title="Mes rappels"
            style={{
              position: 'relative', width: 40, height: 40, borderRadius: 10,
              background: 'var(--secondary)', border: '1.5px solid var(--border)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--foreground)', transition: 'all 0.15s',
            }}
          >
            <Bell size={17} />
            {rappelsEnCoursCount > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5,
                minWidth: 18, height: 18, padding: '0 5px',
                borderRadius: 99, background: 'var(--destructive)', color: 'var(--destructive-foreground)',
                fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--background)',
              }}>
                {rappelsEnCoursCount}
              </span>
            )}
          </button>
          <button onClick={() => setShowAdd(true)} className="neo-btn-yellow" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 16px' }}>
            <UserPlus size={15} /> Ajouter
          </button>
        </div>
      </div>

      {/* Consultant tabs V2 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        {CONSULTANTS.map(c => {
          const count = consultantCounts[c] ?? 0
          const active = activeConsultant === c
          return (
            <button key={c} onClick={() => { setActiveConsultant(c); setActiveMetier('Tous'); setActiveCategory(null) }} style={{
              padding: '10px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: 'none', border: 'none', marginBottom: -1,
              borderBottom: active ? '2px solid #F5A623' : '2px solid transparent',
              color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit',
            }}>
              {c}
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
                background: active ? '#F5A62325' : 'var(--secondary)',
                color: active ? '#c07a00' : 'var(--muted-foreground)',
                border: `1px solid ${active ? '#F5A62355' : 'var(--border)'}`,
              }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* v2.1.8 — Pills métiers : barre HORIZONTALE de catégories en haut + dropdown métiers en dessous quand catégorie active */}
      {metierTabs.length > 1 && (() => {
        const labelToCategory = new Map<string, { name: string; color: string }>()
        for (const cat of categories) {
          for (const m of cat.metiers) labelToCategory.set(m, { name: cat.name, color: cat.color })
        }
        const allTab = metierTabs.find(t => t.label === 'Tous')
        const autresTab = metierTabs.find(t => t.label === 'Autres')
        const realTabs = metierTabs.filter(t => t.label !== 'Tous' && t.label !== 'Autres')
        const groups = new Map<string, { color: string; tabs: typeof realTabs }>()
        const uncategorized: typeof realTabs = []
        for (const t of realTabs) {
          const cat = labelToCategory.get(t.label)
          if (!cat) { uncategorized.push(t); continue }
          if (!groups.has(cat.name)) groups.set(cat.name, { color: cat.color || '#F5A623', tabs: [] })
          groups.get(cat.name)!.tabs.push(t)
        }
        const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fr'))

        // Catégorie associée au métier actuellement sélectionné (pour surbrillance auto de la cat)
        const activeMetierCat = activeMetier !== 'Tous' && activeMetier !== 'Autres'
          ? labelToCategory.get(activeMetier)?.name
          : null

        // Catégorie ouverte dans le dropdown : par défaut suit le métier actif, sinon suit l'état local
        // (état contrôlé via activeCategory déclaré dans le composant parent — voir useState plus bas)
        const openCategory = activeCategory || activeMetierCat || null

        const isCatActive = (catName: string) => openCategory === catName
        const catTotal = (tabs: typeof realTabs) => tabs.reduce((acc, t) => acc + t.count, 0)

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {/* Barre horizontale : Tous + Catégories + Autres */}
            <div style={{
              display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center',
              padding: 4, background: 'var(--surface, var(--card))',
              border: '1px solid var(--border)', borderRadius: 12,
              fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
            }}>
              {/* Tous */}
              {allTab && (
                <button
                  onClick={() => { setActiveMetier('Tous'); setActiveCategory(null) }}
                  style={{
                    padding: '7px 14px', borderRadius: 8, border: 'none',
                    background: activeMetier === 'Tous' ? 'var(--primary)' : 'transparent',
                    color: activeMetier === 'Tous' ? '#1C1A14' : 'var(--muted-foreground)',
                    fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}
                >
                  Tous
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                    background: activeMetier === 'Tous' ? 'rgba(28,26,20,0.18)' : 'var(--secondary)',
                    color: activeMetier === 'Tous' ? '#1C1A14' : 'var(--muted-foreground)',
                    boxSizing: 'border-box', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                  }}>{allTab.count}</span>
                </button>
              )}
              {/* Séparateur */}
              {allTab && sortedGroups.length > 0 && <div style={{ width: 1, height: 22, background: 'var(--border)' }} />}
              {/* Catégories — boutons cliquables qui ouvrent le dropdown métiers */}
              {sortedGroups.map(([catName, { color, tabs }]) => {
                const active = isCatActive(catName)
                const hasActiveMetier = activeMetierCat === catName
                return (
                  <button
                    key={catName}
                    onClick={() => {
                      // Si la cat est déjà ouverte → fermer
                      if (active) {
                        setActiveCategory(null)
                      } else {
                        setActiveCategory(catName)
                      }
                    }}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: 'none',
                      background: active ? `${color}22` : 'transparent',
                      color: active || hasActiveMetier ? color : 'var(--muted-foreground)',
                      fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
                      transition: 'all 0.15s',
                      borderBottom: hasActiveMetier ? `2px solid ${color}` : '2px solid transparent',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    {catName}
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                      background: active ? `${color}33` : 'var(--secondary)',
                      color: active ? color : 'var(--muted-foreground)',
                      boxSizing: 'border-box', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    }}>{catTotal(tabs)}</span>
                    <ChevronDown size={12} style={{
                      transition: 'transform 0.15s',
                      transform: active ? 'rotate(180deg)' : 'rotate(0)',
                      opacity: 0.6,
                    }} />
                  </button>
                )
              })}
              {/* Autres + Sans catégorie */}
              {(autresTab || uncategorized.length > 0) && (
                <>
                  <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
                  {autresTab && (
                    <button
                      onClick={() => { setActiveMetier('Autres'); setActiveCategory(null) }}
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: 'none',
                        background: activeMetier === 'Autres' ? 'var(--secondary)' : 'transparent',
                        color: activeMetier === 'Autres' ? 'var(--foreground)' : 'var(--muted-foreground)',
                        fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                        fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      Autres
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                        background: 'var(--card)', color: 'var(--muted-foreground)',
                        boxSizing: 'border-box', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                      }}>{autresTab.count}</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Dropdown métiers : affiché quand une catégorie est ouverte */}
            {openCategory && (() => {
              const group = groups.get(openCategory)
              if (!group) return null
              return (
                <div style={{
                  padding: 12,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  display: 'flex', flexWrap: 'wrap', gap: 6,
                  alignItems: 'center',
                  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                  animation: 'fadeIn 0.15s ease',
                }}>
                  {group.tabs.map(t => {
                    const accent = getColorForMetier(t.label) || group.color || '#F5A623'
                    const active = activeMetier === t.label
                    return (
                      <button key={t.label} onClick={() => setActiveMetier(t.label)} style={{
                        padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        borderRadius: 20,
                        border: `1.5px solid ${active ? accent : 'var(--border)'}`,
                        background: active ? accent : 'var(--surface, var(--card))',
                        color: active ? '#1C1A14' : 'var(--muted-foreground)',
                        transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontFamily: 'inherit',
                        boxShadow: active ? `0 4px 12px -4px ${accent}80` : 'none',
                      }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: active ? '#fff' : accent,
                          flexShrink: 0,
                          boxShadow: active ? '0 0 0 1.5px rgba(28,26,20,0.20)' : 'none',
                        }} />
                        {t.label}
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                          background: active ? 'rgba(28,26,20,0.18)' : 'var(--secondary)',
                          color: active ? '#1C1A14' : 'var(--muted-foreground)',
                          boxSizing: 'border-box', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                        }}>{t.count}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })()}

            {/* Sans catégorie : si présent, dropdown séparé toujours visible (pas de cat parente) */}
            {uncategorized.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '4px 8px' }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 800, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                  marginRight: 4,
                }}>Sans catégorie :</span>
                {uncategorized.map(t => {
                  const accent = getColorForMetier(t.label) || '#F5A623'
                  const active = activeMetier === t.label
                  return (
                    <button key={t.label} onClick={() => setActiveMetier(t.label)} style={{
                      padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      borderRadius: 16,
                      border: `1px solid ${active ? accent : 'var(--border)'}`,
                      background: active ? accent : 'var(--surface, var(--card))',
                      color: active ? '#1C1A14' : 'var(--muted-foreground)',
                      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      {t.label}
                      <span style={{ fontSize: 10, opacity: 0.7 }}>{t.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

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
        /* v2.0.5 — Pipeline en LISTE grid horizontal avec colonnes alignées + header (style liste candidats) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Header colonnes */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 14px',
            fontSize: 10.5, fontWeight: 700,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
            borderBottom: '1px solid var(--border)',
            marginBottom: 4,
          }}>
            <div style={{ flex: '0 0 48px' }}>Photo</div>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>Nom &amp; métier</div>
            <div style={{ flex: '0 0 200px' }}>Lieu</div>
            <div style={{ flex: '0 0 50px' }}>Âge</div>
            <div style={{ flex: '0 0 220px' }}>Notes</div>
            <div style={{ flex: '0 0 90px' }}>Rappel</div>
            <div style={{ flex: '0 0 180px', textAlign: 'right' }}>Actions</div>
          </div>
          {cols.flat().map(candidat => (
            <CandidatCard
              key={candidat.id}
              candidat={candidat}
              rappel={rappelByCandidatId.get(candidat.id) ?? null}
              cvHook={cvHook}
              onNote={() => setNoteModal({ candidat })}
              onRappel={() => setRappelModal({ candidat })}
              onModifier={() => setModifierModal({ candidat })}
              onRetirer={() => handleRetirer(candidat)}
              getColorForMetier={getColorForMetier}
            />
          ))}
        </div>
      )}

      <CvHoverPanel hook={cvHook} />

      {showAdd && <AddToPipelineModal metiers={metiers} categories={categories} onClose={() => setShowAdd(false)} onAdded={() => qc.invalidateQueries({ queryKey: ['pipeline-candidats'] })} />}
      {noteModal && <NoteModal nom={`${noteModal.candidat.prenom || ''} ${noteModal.candidat.nom}`.trim()} notes={noteModal.candidat.notes ?? ''} onClose={() => setNoteModal(null)} onSave={notes => handleSaveNote(noteModal.candidat, notes)} />}
      {rappelModal && <RappelModal candidatId={rappelModal.candidat.id} nom={`${rappelModal.candidat.prenom || ''} ${rappelModal.candidat.nom}`.trim()} existingRappel={rappelByCandidatId.get(rappelModal.candidat.id) ?? null} onClose={() => setRappelModal(null)} onSaved={refetchRappels} />}
      {modifierModal && <ModifierModal candidat={modifierModal.candidat} metiers={metiers} categories={categories} onClose={() => setModifierModal(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['pipeline-candidats'] })} />}
      {showRappelsPanel && <RappelsPanel rappels={rappels} onClose={closeRappelsPanel} onUpdate={refetchRappels} />}
    </div>
  )
}
