'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Plus, Trash2, ExternalLink, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type CandidatRef = {
  id: string
  nom: string
  prenom: string | null
  cv_url: string | null
  titre_poste: string | null
}

type Planning = {
  id: string
  candidat_id: string | null
  candidat_nom: string | null
  client_nom: string | null
  metier: string | null
  pourcentage: number
  marge_horaire: number | null
  remarques: string | null
  statut: 'actif' | 'inactif'
  semaine: number
  annee: number
  semaine_fin: number | null
  annee_fin: number | null
  candidats: CandidatRef | null
}

type AutocompleteSuggestion = {
  id: string
  nom: string
  prenom: string | null
  titre_poste: string | null
  cv_url: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCurrentWeekAndYear(): { semaine: number; annee: number } {
  const now = new Date()
  const year = now.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000)
  const semaine = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
  return { semaine, annee: year }
}

function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 42%)`
}

function hashColorSoft(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsla(${hue}, 65%, 42%, 0.12)`
}

// Convertit semaine+année en nombre de semaines depuis epoch (approximatif mais cohérent)
function toWeekIndex(semaine: number, annee: number) {
  return annee * 53 + semaine
}

// Calcule la durée entre debut et fin (ou aujourd'hui) en semaines, puis formate
function calcDuree(semaineDebut: number, anneeDebut: number, semaineFin: number | null, anneeFin: number | null): string {
  const { semaine: nowS, annee: nowA } = getCurrentWeekAndYear()
  const endS = semaineFin ?? nowS
  const endA = anneeFin  ?? nowA
  const totalSem = toWeekIndex(endS, endA) - toWeekIndex(semaineDebut, anneeDebut) + 1
  if (totalSem <= 0) return ''
  const ans    = Math.floor(totalSem / 52)
  const moisR  = Math.floor((totalSem % 52) / 4.33)
  const semR   = totalSem % 52
  if (ans >= 1 && moisR > 0) return `${ans} an${ans > 1 ? 's' : ''} ${moisR} mois`
  if (ans >= 1) return `${ans} an${ans > 1 ? 's' : ''}`
  if (moisR >= 1) return `~${moisR} mois (${totalSem} sem.)`
  return `${totalSem} sem.`
}

function candidatDisplayName(c: CandidatRef | null, fallback?: string | null): string {
  if (c) return [c.prenom, c.nom].filter(Boolean).join(' ')
  return fallback ?? ''
}

function initials(nom: string, prenom: string | null): string {
  return [prenom, nom].filter(Boolean).map(p => p![0]).join('').toUpperCase().slice(0, 2)
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({ label }: { label: string }) {
  if (!label) return <span style={{ fontSize: 13, color: 'var(--muted)' }}>—</span>
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 100,
      fontSize: 12,
      fontWeight: 600,
      background: hashColorSoft(label),
      color: hashColor(label),
      border: `1px solid ${hashColor(label)}30`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Candidat Modal ────────────────────────────────────────────────────────────

function CandidatModal({ current, onPick, onClose }: {
  current: string
  onPick: (nom: string, id: string | null, cv_url: string | null, titre_poste: string | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    setLoading(true)
    try {
      // Fetch with or without search term — always returns results
      const url = q.trim().length >= 2
        ? `/api/candidats?search=${encodeURIComponent(q.trim())}&per_page=20`
        : `/api/candidats?per_page=20&sort=date_desc`
      const res = await fetch(url)
      const data = await res.json()
      setSuggestions((data.candidats ?? []).slice(0, 15))
    } catch { setSuggestions([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    fetchSuggestions('')
  }, [fetchSuggestions])

  const handleChange = (v: string) => {
    setQuery(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchSuggestions(v), 250)
  }

  const useManualName = () => {
    if (query.trim()) {
      onPick(query.trim(), null, null, null)
      onClose()
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 18,
          padding: 20,
          width: 440,
          maxHeight: '76vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          gap: 10,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Choisir un candidat</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Rechercher ou taper un nom…"
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && query.trim() && suggestions.length === 0) useManualName()
          }}
          style={{
            border: '1.5px solid var(--border)', borderRadius: 10,
            padding: '9px 14px', fontSize: 13, outline: 'none',
            background: 'var(--background)', color: 'var(--foreground)',
            width: '100%', boxSizing: 'border-box',
          }}
        />

        {/* Use typed name (not in system) */}
        {query.trim().length >= 2 && (
          <button
            onClick={useManualName}
            style={{
              padding: '8px 14px', borderRadius: 8,
              border: `1.5px dashed ${COLOR}60`,
              background: COLOR_SOFT, color: COLOR,
              fontSize: 12, cursor: 'pointer', fontWeight: 600,
              textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <Plus size={13} />
            Utiliser <strong>"{query.trim()}"</strong> (hors système)
          </button>
        )}

        {/* Remove current */}
        {current && (
          <button
            onClick={() => { onPick('', null, null, null); onClose() }}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)',
              color: '#EF4444', fontSize: 12, cursor: 'pointer', fontWeight: 600,
              textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <X size={12} /> Retirer {current}
          </button>
        )}

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {loading && (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <Loader2 size={18} style={{ color: 'var(--muted)', animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {!loading && suggestions.length === 0 && (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
              {query.trim().length >= 2 ? 'Aucun candidat trouvé dans le système' : 'Aucun candidat'}
            </div>
          )}
          {suggestions.map(s => {
            const name = [s.prenom, s.nom].filter(Boolean).join(' ')
            const init = initials(s.nom, s.prenom)
            const col  = hashColor(s.nom)
            return (
              <div
                key={s.id}
                onClick={() => { onPick(name, s.id, s.cv_url ?? null, s.titre_poste ?? null); onClose() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                  border: '1px solid var(--border)', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--secondary)'; el.style.borderColor = col }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = 'var(--border)' }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: col,
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  {init}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--foreground)' }}>{name}</div>
                  {s.titre_poste && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{s.titre_poste}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── CandidatCell ──────────────────────────────────────────────────────────────

function CandidatCell({ value, candidat, onSave }: {
  value: string
  candidat: CandidatRef | null
  onSave: (nom: string, id: string | null, cv_url: string | null, titre_poste: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const nom = candidat?.nom ?? value.split(' ').pop() ?? value

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 13,
          minHeight: 32,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {value ? (
          <>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: hashColor(nom),
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {initials(nom, candidat?.prenom ?? null)}
            </div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{value}</span>
          </>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>Choisir…</span>
        )}
      </div>
      {open && (
        <CandidatModal
          current={value}
          onPick={onSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ── EntrepriseCell ────────────────────────────────────────────────────────────

function EntrepriseCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const fetchClients = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const url = q.trim()
        ? `/api/clients?search=${encodeURIComponent(q.trim())}&per_page=10`
        : `/api/clients?per_page=10`
      const res = await fetch(url)
      const data = await res.json()
      const names: string[] = (data.clients ?? data ?? []).map((c: any) => c.nom_entreprise || c.nom || c.name || '').filter(Boolean)
      setSuggestions([...new Set(names)].slice(0, 10))
    } catch { setSuggestions([]) }
    finally { setLoading(false) }
  }, [])

  const handleChange = (v: string) => {
    setDraft(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchClients(v), 200)
  }

  const pick = (name: string) => {
    setDraft(name); setSuggestions([]); setEditing(false); onSave(name)
  }
  const commit = () => {
    setSuggestions([]); setEditing(false); if (draft !== value) onSave(draft)
  }

  if (!editing) return (
    <span
      onClick={() => { setEditing(true); fetchClients(value || '') }}
      style={{ display: 'block', padding: '4px 8px', borderRadius: 6, cursor: 'text', fontSize: 13, minHeight: 28, lineHeight: '20px' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {value ? <Badge label={value} /> : <span style={{ color: 'var(--muted)', fontSize: 13 }}>Entreprise…</span>}
    </span>
  )

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={ref}
        type="text"
        value={draft}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => setTimeout(commit, 150)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value); setSuggestions([]); setEditing(false) }
        }}
        style={{ width: '100%', background: 'var(--surface)', border: '1.5px solid var(--primary)', borderRadius: 6, padding: '4px 8px', fontSize: 13, color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }}
      />
      {(suggestions.length > 0 || loading) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 200, maxHeight: 240, overflowY: 'auto', marginTop: 2 }}>
          {loading && <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>Recherche…</div>}
          {suggestions.map(name => (
            <div
              key={name}
              onMouseDown={e => { e.preventDefault(); pick(name) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--secondary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Badge label={name} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inline editable cell ───────────────────────────────────────────────────────

function EditableCell({ value, placeholder, onSave, width, type = 'text', step, min, max, suffix }: {
  value: string; placeholder?: string; onSave: (v: string) => void
  width?: number | string; type?: 'text' | 'number'; step?: string; min?: string; max?: string; suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (editing) return (
    <input
      ref={ref} type={type} value={draft} step={step} min={min} max={max}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      style={{
        width: width || '100%', background: 'var(--surface)',
        border: '1.5px solid var(--primary)', borderRadius: 6,
        padding: '4px 8px', fontSize: 13, color: 'var(--foreground)',
        outline: 'none', boxSizing: 'border-box',
      }}
    />
  )

  return (
    <span
      onClick={() => setEditing(true)}
      style={{
        display: 'block', width: width || '100%', padding: '4px 8px',
        borderRadius: 6, cursor: 'text', fontSize: 13,
        color: value ? 'var(--foreground)' : 'var(--muted)',
        minHeight: 28, lineHeight: '20px', transition: 'background 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {value ? (suffix ? `${value}${suffix}` : value) : (placeholder || '—')}
    </span>
  )
}

// ── PériodeCell ───────────────────────────────────────────────────────────────

function PeriodeCell({ semaine, annee, semaineFin, anneeFin, onSave }: {
  semaine: number; annee: number
  semaineFin: number | null; anneeFin: number | null
  onSave: (fields: { semaine?: number; annee?: number; semaine_fin: number | null; annee_fin: number | null }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftDebS, setDraftDebS] = useState(semaine)
  const [draftDebA, setDraftDebA] = useState(annee)
  const [draftFinS, setDraftFinS] = useState(semaineFin ?? semaine)
  const [draftFinA, setDraftFinA] = useState(anneeFin ?? annee)
  const [noFin, setNoFin] = useState(semaineFin === null)

  useEffect(() => {
    setDraftDebS(semaine); setDraftDebA(annee)
    setDraftFinS(semaineFin ?? semaine); setDraftFinA(anneeFin ?? annee)
    setNoFin(semaineFin === null)
  }, [semaine, annee, semaineFin, anneeFin])

  const commit = () => {
    setEditing(false)
    onSave({
      semaine: draftDebS,
      annee: draftDebA,
      semaine_fin: noFin ? null : draftFinS,
      annee_fin:   noFin ? null : draftFinA,
    })
  }

  const COLOR = '#6366F1'

  const duree = calcDuree(semaine, annee, semaineFin, anneeFin)

  if (!editing) return (
    <div
      onClick={() => setEditing(true)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {/* Plage */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 700, color: COLOR }}>S.{semaine}</span>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>{annee}</span>
        <span style={{ color: 'var(--muted)', margin: '0 1px' }}>→</span>
        {semaineFin
          ? <><span style={{ fontWeight: 700, color: '#10B981' }}>S.{semaineFin}</span><span style={{ color: 'var(--muted)', fontSize: 11 }}>{anneeFin}</span></>
          : <span style={{ color: 'var(--muted)', fontWeight: 600 }}>∞</span>
        }
      </div>
      {/* Durée calculée */}
      {duree && (
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
          ⏱ {duree}{semaineFin == null ? ' (en cours)' : ''}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Début</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input type="number" value={draftDebS} min={1} max={53}
          onChange={e => setDraftDebS(Math.max(1, Math.min(53, parseInt(e.target.value) || 1)))}
          style={miniInput(64)} placeholder="S."
        />
        <input type="number" value={draftDebA} min={2020} max={2099}
          onChange={e => setDraftDebA(parseInt(e.target.value) || new Date().getFullYear())}
          style={miniInput(72)}
        />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
        Fin
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500, textTransform: 'none', letterSpacing: 0, cursor: 'pointer' }}>
          <input type="checkbox" checked={noFin} onChange={e => setNoFin(e.target.checked)} style={{ margin: 0 }} />
          Sans fin (∞)
        </label>
      </div>
      {!noFin && (
        <div style={{ display: 'flex', gap: 4 }}>
          <input type="number" value={draftFinS} min={1} max={53}
            onChange={e => setDraftFinS(Math.max(1, Math.min(53, parseInt(e.target.value) || 1)))}
            style={miniInput(64)} placeholder="S."
          />
          <input type="number" value={draftFinA} min={2020} max={2099}
            onChange={e => setDraftFinA(parseInt(e.target.value) || new Date().getFullYear())}
            style={miniInput(72)}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button onClick={commit} style={{
          flex: 1, padding: '5px 0', borderRadius: 7, border: 'none',
          background: COLOR, color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer',
        }}>OK</button>
        <button onClick={() => setEditing(false)} style={{
          padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)',
          background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--muted)',
        }}>Annuler</button>
      </div>
    </div>
  )
}

// ── MetierCell — badge cliquable éditable ─────────────────────────────────────

function MetierCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (editing) return (
    <input
      ref={ref} type="text" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      placeholder="Métier…"
      style={{
        width: '100%', background: 'var(--surface)',
        border: '1.5px solid var(--primary)', borderRadius: 6,
        padding: '4px 8px', fontSize: 13, color: 'var(--foreground)',
        outline: 'none', boxSizing: 'border-box',
      }}
    />
  )

  return (
    <div
      onClick={() => setEditing(true)}
      style={{ padding: '4px 8px', cursor: 'text', minHeight: 28, display: 'flex', alignItems: 'center', borderRadius: 6, transition: 'background 0.12s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {value ? <Badge label={value} /> : <span style={{ fontSize: 13, color: 'var(--muted)' }}>Métier…</span>}
    </div>
  )
}

function miniInput(w: number): React.CSSProperties {
  return {
    width: w, border: '1.5px solid var(--border)', borderRadius: 6,
    padding: '4px 6px', fontSize: 12, outline: 'none',
    background: 'var(--background)', color: 'var(--foreground)',
    boxSizing: 'border-box',
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const COLOR = '#6366F1'
const COLOR_SOFT = 'rgba(99,102,241,0.10)'

export default function PlanningsPage() {
  const { semaine: defaultSemaine, annee: defaultAnnee } = getCurrentWeekAndYear()

  const [semaine, setSemaine] = useState(defaultSemaine)
  const [annee, setAnnee]     = useState(defaultAnnee)
  const [plannings, setPlannings] = useState<Planning[]>([])
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState<string | null>(null)
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Navigate week ──
  const prevWeek = () => {
    if (semaine === 1) { setSemaine(52); setAnnee(a => a - 1) }
    else setSemaine(s => s - 1)
  }
  const nextWeek = () => {
    if (semaine === 52) { setSemaine(1); setAnnee(a => a + 1) }
    else setSemaine(s => s + 1)
  }

  // ── Load — charge tout, le filtre de semaine est côté client ──
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/plannings')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setPlannings(data.plannings ?? [])
    } catch (e: any) {
      showToast(e.message || 'Erreur de chargement', false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Tous les candidats toujours visibles — la semaine n'affecte que les stats ETP
  const viewKey = annee * 53 + semaine
  const planningsVisible = plannings.filter(p => {
    const startKey = p.annee * 53 + p.semaine
    const endKey   = p.semaine_fin != null && p.annee_fin != null
      ? p.annee_fin * 53 + p.semaine_fin
      : Infinity
    return startKey <= viewKey && viewKey <= endKey
  })

  const [sortBy, setSortBy] = useState<'candidat' | 'entreprise' | 'metier' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleSort = (col: 'candidat' | 'entreprise' | 'metier') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  // rows = TOUS les candidats pour l'affichage/édition
  // planningsVisible = filtrés par semaine pour les stats ETP uniquement
  const rows = [...plannings].sort((a, b) => {
    if (!sortBy) return 0
    let va = '', vb = ''
    if (sortBy === 'candidat') {
      va = candidatDisplayName(a.candidats, a.candidat_nom).toLowerCase()
      vb = candidatDisplayName(b.candidats, b.candidat_nom).toLowerCase()
    } else if (sortBy === 'entreprise') {
      va = (a.client_nom ?? '').toLowerCase()
      vb = (b.client_nom ?? '').toLowerCase()
    } else if (sortBy === 'metier') {
      va = (a.metier ?? '').toLowerCase()
      vb = (b.metier ?? '').toLowerCase()
    }
    return sortDir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr')
  })

  // ── Stats — basées sur la semaine en cours (planningsVisible) ──
  const uniqueCandidats   = new Set(planningsVisible.map(p => p.candidat_id ?? p.candidat_nom ?? candidatDisplayName(p.candidats)).filter(Boolean)).size
  const uniqueEntreprises = new Set(planningsVisible.map(p => p.client_nom ?? '').filter(Boolean)).size
  const totalETP          = planningsVisible.reduce((acc, p) => acc + Number(p.pourcentage), 0)
  const margesAvecValeur  = planningsVisible.filter(p => p.marge_horaire != null && p.marge_horaire > 0)
  const moyenneMarge      = margesAvecValeur.length > 0
    ? margesAvecValeur.reduce((acc, p) => acc + Number(p.marge_horaire), 0) / margesAvecValeur.length
    : null

  // ── Add ──
  const handleAdd = async () => {
    try {
      const res = await fetch('/api/plannings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semaine, annee, statut: 'actif' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setPlannings(prev => [...prev, data.planning])
    } catch (e: any) {
      showToast(e.message || 'Erreur création', false)
    }
  }

  // ── Patch ──
  const handlePatch = async (id: string, fields: Record<string, unknown>) => {
    setSaving(id)
    try {
      const res = await fetch('/api/plannings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...fields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setPlannings(prev => prev.map(p => p.id === id ? { ...p, ...data.planning } : p))
    } catch (e: any) {
      showToast(e.message || 'Erreur mise à jour', false)
    } finally {
      setSaving(null)
    }
  }

  // ── Delete ──
  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette entrée ?')) return
    try {
      const res = await fetch('/api/plannings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Erreur suppression')
      setPlannings(prev => prev.filter(p => p.id !== id))
    } catch (e: any) {
      showToast(e.message || 'Erreur suppression', false)
    }
  }

  return (
    <div className="d-page" style={{ maxWidth: 1300, paddingBottom: 80 }}>
      {/* Back */}
      <div style={{ marginBottom: 16 }}>
        <Link href="/outils" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>
          <ArrowLeft size={14} /> Outils
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: COLOR_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={22} style={{ color: COLOR }} />
          </div>
          <div>
            <h1 className="d-page-title" style={{ margin: 0 }}>Planning hebdomadaire</h1>
            <p className="d-page-sub" style={{ margin: 0 }}>Suivez les pourcentages de travail de chaque candidat</p>
          </div>
        </div>

        {/* Week navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={prevWeek} style={navBtn()}>
            <ChevronLeft size={16} />
          </button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '6px 12px',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Semaine</span>
            <input
              type="number" className="neo-input" value={semaine}
              onChange={e => setSemaine(Math.max(1, Math.min(53, parseInt(e.target.value) || 1)))}
              min={1} max={53}
              style={{ width: 56, textAlign: 'center', padding: '3px 6px', fontSize: 15, fontWeight: 700, color: COLOR }}
            />
            <input
              type="number" className="neo-input" value={annee}
              onChange={e => setAnnee(parseInt(e.target.value) || new Date().getFullYear())}
              min={2020} max={2099}
              style={{ width: 72, textAlign: 'center', padding: '3px 6px', fontSize: 13 }}
            />
          </div>
          <button onClick={nextWeek} style={navBtn()}>
            <ChevronRight size={16} />
          </button>
          {(semaine !== defaultSemaine || annee !== defaultAnnee) && (
            <button
              onClick={() => { setSemaine(defaultSemaine); setAnnee(defaultAnnee) }}
              style={{ fontSize: 11, fontWeight: 700, color: COLOR, background: COLOR_SOFT, border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}
            >
              Aujourd'hui
            </button>
          )}
        </div>
      </div>

      {/* Add button */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ flex: 1 }} />
        <button onClick={handleAdd} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 10, border: 'none',
          background: COLOR, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>
          <Plus size={15} /> Nouveau
        </button>
      </div>

      {/* Table */}
      <div className="neo-card-soft" style={{ padding: 0, overflowX: 'auto', marginBottom: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 size={24} style={{ color: 'var(--muted)', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
              Aucun candidat au travail cette semaine. Cliquez sur "Nouveau" pour en ajouter.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: `${COLOR}0d` }}>
                <th style={{ ...th('left', 190), cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('candidat')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Candidat <SortIcon active={sortBy === 'candidat'} dir={sortDir} />
                  </span>
                </th>
                <th style={{ ...th('left', 150), cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('entreprise')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Entreprise <SortIcon active={sortBy === 'entreprise'} dir={sortDir} />
                  </span>
                </th>
                <th style={{ ...th('left', 110), cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('metier')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Métier <SortIcon active={sortBy === 'metier'} dir={sortDir} />
                  </span>
                </th>
                <th style={th('center', 55)}>%</th>
                <th style={th('center', 90)}>CHF/h</th>
                <th style={th('left', 210)}>Période · Durée</th>
                <th style={th('left')}>Remarques</th>
                <th style={th('center', 36)}>CV</th>
                <th style={th('center', 50)}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const candidatNom = candidatDisplayName(p.candidats, p.candidat_nom)
                const cvUrl       = p.candidats?.cv_url ?? null
                const isSaving    = saving === p.id
                return (
                  <tr
                    key={p.id}
                    style={{
                      background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.018)',
                      opacity: isSaving ? 0.6 : 1,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {/* Candidat */}
                    <td style={td()}>
                      <CandidatCell
                        value={candidatNom}
                        candidat={p.candidats}
                        onSave={(nom, id, cv_url, titre_poste) => {
                          // Optimistic update
                          setPlannings(prev => prev.map(row =>
                            row.id === p.id ? {
                              ...row,
                              candidat_id: id,
                              candidat_nom: id ? null : (nom || null),
                              metier: titre_poste ?? row.metier,
                              candidats: id
                                ? { id, nom: nom.split(' ').slice(-1)[0] ?? nom, prenom: nom.split(' ').slice(0, -1).join(' ') || null, cv_url, titre_poste }
                                : null,
                            } : row
                          ))
                          handlePatch(p.id, {
                            candidat_id: id || null,
                            candidat_nom: id ? null : (nom || null),
                            ...(titre_poste ? { metier: titre_poste } : {}),
                          })
                        }}
                      />
                    </td>

                    {/* Entreprise */}
                    <td style={td()}>
                      <EntrepriseCell
                        value={p.client_nom ?? ''}
                        onSave={v => handlePatch(p.id, { client_nom: v })}
                      />
                    </td>

                    {/* Métier — toujours éditable */}
                    <td style={td()}>
                      <MetierCell
                        value={p.metier ?? ''}
                        onSave={v => handlePatch(p.id, { metier: v || null })}
                      />
                    </td>

                    {/* % */}
                    <td style={{ ...td(), textAlign: 'center' }}>
                      <EditableCell
                        value={String(p.pourcentage)}
                        type="number" step="0.1" min="0" max="2"
                        onSave={v => { const n = parseFloat(v); if (!isNaN(n) && n >= 0) handlePatch(p.id, { pourcentage: n }) }}
                        width={52}
                      />
                    </td>

                    {/* Marge CHF/h */}
                    <td style={{ ...td(), textAlign: 'center' }}>
                      <EditableCell
                        value={p.marge_horaire != null ? String(p.marge_horaire) : ''}
                        placeholder="—"
                        type="number" step="0.5" min="0"
                        onSave={v => {
                          const n = parseFloat(v)
                          handlePatch(p.id, { marge_horaire: isNaN(n) || v === '' ? null : n })
                        }}
                        width={72}
                        suffix=" CHF"
                      />
                    </td>

                    {/* Période */}
                    <td style={{ ...td(), padding: 0 }}>
                      <PeriodeCell
                        semaine={p.semaine}
                        annee={p.annee}
                        semaineFin={p.semaine_fin}
                        anneeFin={p.annee_fin}
                        onSave={fields => handlePatch(p.id, fields)}
                      />
                    </td>

                    {/* Remarques */}
                    <td style={td()}>
                      <EditableCell
                        value={p.remarques ?? ''}
                        placeholder="Remarques…"
                        onSave={v => handlePatch(p.id, { remarques: v })}
                      />
                    </td>

                    {/* CV */}
                    <td style={{ ...td(), textAlign: 'center' }}>
                      {cvUrl ? (
                        <a href={cvUrl} target="_blank" rel="noopener noreferrer" title="Voir le CV"
                          style={{ display: 'inline-flex', alignItems: 'center', color: COLOR }}>
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ ...td(), textAlign: 'center' }}>
                      <button
                        onClick={() => handleDelete(p.id)}
                        title="Supprimer"
                        style={actionBtn()}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
        marginTop: 12, padding: '10px 16px',
        background: `${COLOR}0a`, border: `1px solid ${COLOR}20`,
        borderRadius: 10, fontSize: 13, color: 'var(--muted)', fontWeight: 600,
      }}>
        <span><span style={{ color: COLOR, fontSize: 18, fontWeight: 800 }}>{uniqueCandidats}</span> candidat{uniqueCandidats > 1 ? 's' : ''} uniques</span>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span><span style={{ color: COLOR, fontSize: 18, fontWeight: 800 }}>{uniqueEntreprises}</span> entreprise{uniqueEntreprises > 1 ? 's' : ''} uniques</span>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span>
          <span style={{ color: COLOR, fontSize: 18, fontWeight: 800 }}>{Math.round(totalETP * 100) / 100}</span>
          {' '}ETP
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 5, fontWeight: 500 }}>
            ({rows.length} candidat{rows.length > 1 ? 's' : ''} — S.{semaine} {annee})
          </span>
        </span>
        {moyenneMarge != null && (
          <>
            <span style={{ color: 'var(--border)' }}>·</span>
            <span>
              <span style={{ color: '#10B981', fontSize: 18, fontWeight: 800 }}>
                {Math.round(moyenneMarge * 100) / 100} CHF/h
              </span>
              {' '}marge moy.
              {margesAvecValeur.length < rows.length && (
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
                  ({margesAvecValeur.length}/{rows.length})
                </span>
              )}
            </span>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          padding: '12px 20px', borderRadius: 10,
          background: toast.ok ? '#10B981' : '#EF4444',
          color: 'white', fontWeight: 600, fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── SortIcon ──────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, opacity: active ? 1 : 0.3, flexShrink: 0 }}>
      <span style={{ fontSize: 8, lineHeight: 1, color: active && dir === 'asc' ? COLOR : 'var(--muted)' }}>▲</span>
      <span style={{ fontSize: 8, lineHeight: 1, color: active && dir === 'desc' ? COLOR : 'var(--muted)' }}>▼</span>
    </span>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function th(align: 'left' | 'center' | 'right', width?: number): React.CSSProperties {
  return {
    padding: '10px 12px', textAlign: align,
    fontWeight: 700, fontSize: 12, color: 'var(--foreground)',
    borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)',
    width: width ?? undefined, whiteSpace: 'nowrap',
  }
}

function td(): React.CSSProperties {
  return {
    padding: '4px 4px',
    borderBottom: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    verticalAlign: 'middle',
  }
}

function navBtn(): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)',
    cursor: 'pointer', color: 'var(--muted)', transition: 'all 0.12s',
  }
}

function actionBtn(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 7,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--muted)', cursor: 'pointer', transition: 'all 0.12s',
  }
}
