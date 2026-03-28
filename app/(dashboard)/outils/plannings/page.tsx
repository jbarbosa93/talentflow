'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Plus, Trash2, ExternalLink, ArrowRightLeft, Loader2 } from 'lucide-react'

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
  client_nom: string | null
  metier: string | null
  pourcentage: number
  remarques: string | null
  statut: 'actif' | 'inactif'
  semaine: number
  annee: number
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

function candidatDisplayName(c: CandidatRef | null): string {
  if (!c) return ''
  return [c.prenom, c.nom].filter(Boolean).join(' ')
}

// ── Inline editable cell ───────────────────────────────────────────────────────

type EditableCellProps = {
  value: string
  placeholder?: string
  onSave: (v: string) => void
  width?: number | string
  type?: 'text' | 'number'
  step?: string
  min?: string
  max?: string
}

function EditableCell({ value, placeholder, onSave, width, type = 'text', step, min, max }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        type={type}
        value={draft}
        step={step}
        min={min}
        max={max}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        style={{
          width: width || '100%',
          background: 'var(--surface)',
          border: '1.5px solid var(--primary)',
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 13,
          color: 'var(--foreground)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      style={{
        display: 'block',
        width: width || '100%',
        padding: '4px 8px',
        borderRadius: 6,
        cursor: 'text',
        fontSize: 13,
        color: value ? 'var(--foreground)' : 'var(--muted)',
        minHeight: 28,
        lineHeight: '20px',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {value || placeholder || '—'}
    </span>
  )
}

// ── Candidat autocomplete cell ────────────────────────────────────────────────

type CandidatCellProps = {
  value: string
  onSave: (nom: string, id: string | null, cv_url: string | null, titre_poste: string | null) => void
}

function CandidatCell({ value, onSave }: CandidatCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setSuggestions([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/candidats?search=${encodeURIComponent(q)}&limit=8&per_page=8`)
      const data = await res.json()
      setSuggestions((data.candidats ?? []).slice(0, 8))
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (v: string) => {
    setDraft(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchSuggestions(v), 200)
  }

  const pick = (s: AutocompleteSuggestion) => {
    const name = [s.prenom, s.nom].filter(Boolean).join(' ')
    setDraft(name)
    setSuggestions([])
    setEditing(false)
    onSave(name, s.id, s.cv_url ?? null, s.titre_poste ?? null)
  }

  const commitManual = () => {
    setSuggestions([])
    setEditing(false)
    if (draft !== value) onSave(draft, null, null, null)
  }

  if (editing) {
    return (
      <div style={{ position: 'relative' }}>
        <input
          ref={ref}
          type="text"
          value={draft}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setTimeout(commitManual, 150)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitManual()
            if (e.key === 'Escape') { setDraft(value); setSuggestions([]); setEditing(false) }
          }}
          style={{
            width: '100%',
            background: 'var(--surface)',
            border: '1.5px solid var(--primary)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 13,
            color: 'var(--foreground)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {(suggestions.length > 0 || loading) && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 100,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: 220,
            overflow: 'hidden',
            marginTop: 2,
          }}>
            {loading && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Recherche…
              </div>
            )}
            {suggestions.map(s => (
              <div
                key={s.id}
                onMouseDown={() => pick(s)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  borderBottom: '1px solid var(--border)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                  {[s.prenom, s.nom].filter(Boolean).join(' ')}
                </div>
                {s.titre_poste && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{s.titre_poste}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      style={{
        display: 'block',
        padding: '4px 8px',
        borderRadius: 6,
        cursor: 'text',
        fontSize: 13,
        fontWeight: value ? 600 : 400,
        color: value ? 'var(--foreground)' : 'var(--muted)',
        minHeight: 28,
        lineHeight: '20px',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {value || 'Candidat…'}
    </span>
  )
}

// ── Entreprise autocomplete cell ──────────────────────────────────────────────

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
    if (!q || q.length < 1) { setSuggestions([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/clients?search=${encodeURIComponent(q)}&limit=8`)
      const data = await res.json()
      const names: string[] = (data.clients ?? data ?? []).map((c: any) => c.nom || c.name || c.entreprise || '').filter(Boolean)
      setSuggestions([...new Set(names)].slice(0, 8))
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
      onClick={() => setEditing(true)}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

const COLOR = '#6366F1'
const COLOR_SOFT = 'rgba(99,102,241,0.10)'

export default function PlanningsPage() {
  const { semaine: defaultSemaine, annee: defaultAnnee } = getCurrentWeekAndYear()

  const [semaine, setSemaine] = useState(defaultSemaine)
  const [annee, setAnnee]     = useState(defaultAnnee)
  const [tab, setTab]         = useState<'actif' | 'inactif'>('actif')
  const [plannings, setPlannings] = useState<Planning[]>([])
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState<string | null>(null) // id of row being saved
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/plannings?semaine=${semaine}&annee=${annee}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setPlannings(data.plannings ?? [])
    } catch (e: any) {
      showToast(e.message || 'Erreur de chargement', false)
    } finally {
      setLoading(false)
    }
  }, [semaine, annee])

  useEffect(() => { load() }, [load])

  // ── Filtered rows ──
  const rows = plannings.filter(p => p.statut === tab)

  // ── Stats ──
  const uniqueCandidats = new Set(
    rows.map(p => p.candidat_id ?? (p.candidats ? candidatDisplayName(p.candidats) : p.client_nom ?? '')).filter(Boolean)
  ).size
  const uniqueEntreprises = new Set(rows.map(p => p.client_nom ?? '').filter(Boolean)).size
  const totalETP = rows.reduce((acc, p) => acc + Number(p.pourcentage), 0)

  // ── Add row ──
  const handleAdd = async () => {
    try {
      const res = await fetch('/api/plannings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semaine, annee, statut: tab }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setPlannings(prev => [...prev, data.planning])
    } catch (e: any) {
      showToast(e.message || 'Erreur création', false)
    }
  }

  // ── Patch row ──
  const handlePatch = async (id: string, fields: Partial<Planning>) => {
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

  // ── Delete row ──
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

  // ── Toggle statut ──
  const handleToggleStatut = async (p: Planning) => {
    const next = p.statut === 'actif' ? 'inactif' : 'actif'
    await handlePatch(p.id, { statut: next })
  }

  return (
    <div className="d-page" style={{ maxWidth: 1200, paddingBottom: 80 }}>
      {/* Back */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/outils"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}
        >
          <ArrowLeft size={14} /> Outils
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: COLOR_SOFT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Calendar size={22} style={{ color: COLOR }} />
          </div>
          <div>
            <h1 className="d-page-title" style={{ margin: 0 }}>Planning hebdomadaire</h1>
            <p className="d-page-sub" style={{ margin: 0 }}>Suivez les pourcentages de travail de chaque candidat</p>
          </div>
        </div>

        {/* Week selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Semaine</label>
          <input
            type="number"
            className="neo-input"
            value={semaine}
            onChange={e => setSemaine(Math.max(1, Math.min(53, parseInt(e.target.value) || 1)))}
            min={1}
            max={53}
            style={{ width: 72, textAlign: 'center' }}
          />
          <input
            type="number"
            className="neo-input"
            value={annee}
            onChange={e => setAnnee(parseInt(e.target.value) || new Date().getFullYear())}
            min={2020}
            max={2099}
            style={{ width: 80, textAlign: 'center' }}
          />
        </div>
      </div>

      {/* Tabs + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Tab toggle */}
        <div style={{
          display: 'flex',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 3,
          gap: 2,
        }}>
          {(['actif', 'inactif'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 18px',
                borderRadius: 8,
                border: 'none',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: tab === t ? COLOR : 'transparent',
                color: tab === t ? 'white' : 'var(--muted)',
              }}
            >
              {t === 'actif' ? 'Au travail' : 'Sans travail'}
              <span style={{
                marginLeft: 6,
                fontSize: 11,
                fontWeight: 700,
                background: tab === t ? 'rgba(255,255,255,0.25)' : 'var(--border)',
                color: tab === t ? 'white' : 'var(--muted)',
                padding: '1px 6px',
                borderRadius: 100,
              }}>
                {plannings.filter(p => p.statut === t).length}
              </span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px',
            borderRadius: 10,
            border: 'none',
            background: COLOR,
            color: 'white',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          Nouveau
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
              {tab === 'actif'
                ? 'Aucun candidat au travail cette semaine. Cliquez sur "Nouveau" pour en ajouter.'
                : 'Aucun candidat disponible cette semaine.'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: `${COLOR}0d` }}>
                <th style={th('left', 200)}>Candidat</th>
                <th style={th('left', 160)}>Entreprise</th>
                <th style={th('left', 140)}>Métier</th>
                <th style={th('center', 70)}>%</th>
                <th style={th('left')}>Remarques</th>
                <th style={th('center', 40)}>CV</th>
                <th style={th('center', 88)}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const candidatNom = p.candidats ? candidatDisplayName(p.candidats) : ''
                const cvUrl = p.candidats?.cv_url ?? null
                const isSaving = saving === p.id
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
                        onSave={(nom, id, cv_url, titre_poste) => {
                          // Patch candidat_id + métier auto-rempli depuis titre_poste
                          const patchData: Partial<Planning> & { candidat_id?: string | null } = {
                            candidat_id: id,
                            ...(titre_poste ? { metier: titre_poste } : {}),
                          }
                          setPlannings(prev => prev.map(row =>
                            row.id === p.id
                              ? {
                                  ...row,
                                  candidat_id: id,
                                  metier: titre_poste ?? row.metier,
                                  candidats: id
                                    ? { id, nom: nom.split(' ').slice(-1)[0] ?? nom, prenom: nom.split(' ').slice(0, -1).join(' ') || null, cv_url: cv_url, titre_poste }
                                    : null,
                                }
                              : row
                          ))
                          handlePatch(p.id, patchData)
                        }}
                      />
                    </td>

                    {/* Entreprise — autocomplete depuis /api/clients */}
                    <td style={td()}>
                      <EntrepriseCell
                        value={p.client_nom ?? ''}
                        onSave={v => handlePatch(p.id, { client_nom: v })}
                      />
                    </td>

                    {/* Métier — vient de la fiche candidat, éditable si besoin */}
                    <td style={td()}>
                      {p.metier
                        ? <Badge label={p.metier} />
                        : <span style={{ fontSize: 13, color: 'var(--muted)', padding: '4px 8px', display: 'block' }}>—</span>
                      }
                    </td>

                    {/* Pourcentage */}
                    <td style={{ ...td(), textAlign: 'center' }}>
                      <EditableCell
                        value={String(p.pourcentage)}
                        type="number"
                        step="0.5"
                        min="0"
                        max="1"
                        onSave={v => {
                          const n = parseFloat(v)
                          if (!isNaN(n) && n >= 0) handlePatch(p.id, { pourcentage: n })
                        }}
                        width={60}
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
                        <a
                          href={cvUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Voir le CV"
                          style={{ display: 'inline-flex', alignItems: 'center', color: COLOR }}
                        >
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ ...td(), textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <button
                          onClick={() => handleToggleStatut(p)}
                          title={p.statut === 'actif' ? 'Déplacer vers "Sans travail"' : 'Déplacer vers "Au travail"'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 28, height: 28, borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = COLOR_SOFT; (e.currentTarget as HTMLButtonElement).style.color = COLOR }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
                        >
                          <ArrowRightLeft size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          title="Supprimer"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 28, height: 28, borderRadius: 7,
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
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
        marginTop: 12,
        padding: '10px 16px',
        background: `${COLOR}0a`,
        border: `1px solid ${COLOR}20`,
        borderRadius: 10,
        fontSize: 13,
        color: 'var(--muted)',
        fontWeight: 600,
      }}>
        <span>
          <span style={{ color: COLOR, fontSize: 18, fontWeight: 800 }}>{uniqueCandidats}</span>
          {' '}candidat{uniqueCandidats > 1 ? 's' : ''} uniques
        </span>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span>
          <span style={{ color: COLOR, fontSize: 18, fontWeight: 800 }}>{uniqueEntreprises}</span>
          {' '}entreprise{uniqueEntreprises > 1 ? 's' : ''} uniques
        </span>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span>
          <span style={{ color: COLOR, fontSize: 18, fontWeight: 800 }}>{Math.round(totalETP * 100) / 100}</span>
          {' '}ETP (total %)
        </span>
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

// ── Table style helpers ────────────────────────────────────────────────────────

function th(align: 'left' | 'center' | 'right', width?: number): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    fontWeight: 700,
    fontSize: 12,
    color: 'var(--foreground)',
    borderBottom: '2px solid var(--border)',
    borderRight: '1px solid var(--border)',
    width: width ?? undefined,
    whiteSpace: 'nowrap',
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
