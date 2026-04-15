'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, ClipboardList, FileDown, Loader2, Clock, Umbrella, Sun, UserX, Thermometer } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

type GridData = {
  [rowKey: string]: { [day: string]: string }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// Types de lignes pour le rapport
type LineType = 'travail' | 'ferie' | 'vacances' | 'absence' | 'maladie'

const LINE_TYPES: { key: LineType; label: string; color: string; icon: typeof Clock; autoHours: number | null }[] = [
  { key: 'travail',  label: 'Heures travaillées', color: '#22C55E', icon: Clock,        autoHours: null },
  { key: 'ferie',    label: 'Jour férié',         color: '#F59E0B', icon: Sun,           autoHours: 8 },
  { key: 'vacances', label: 'Vacances',           color: '#3B82F6', icon: Umbrella,      autoHours: 8 },
  { key: 'absence',  label: 'Absence',            color: '#EF4444', icon: UserX,         autoHours: null },
  { key: 'maladie',  label: 'Maladie',            color: '#8B5CF6', icon: Thermometer,   autoHours: null },
]

const ROWS: { key: string; label: string; type: 'number' | 'text' }[] = [
  { key: 'heuresNormales', label: 'Heures normales (en centièmes)', type: 'number' },
  { key: 'repas',          label: 'Repas',                          type: 'number' },
  { key: 'heuresSupp',     label: 'Heures supplémentaires',         type: 'number' },
  { key: 'centreCouts',    label: 'Centre de coûts / chantier',     type: 'text'   },
  { key: 'tempsDepl',      label: 'Temps de déplacement',           type: 'number' },
  { key: 'divers',         label: 'Divers',                         type: 'text'   },
]

const NUMERIC_ROWS = ROWS.filter(r => r.type === 'number').map(r => r.key)

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCurrentWeek(): number {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000)
  return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
}

function getDatesForWeek(weekNum: number, year: number): Date[] {
  const jan1 = new Date(year, 0, 1)
  const dayOfWeek = jan1.getDay() // 0=Sunday
  const daysToFirstMonday = dayOfWeek <= 1 ? 1 - dayOfWeek : 8 - dayOfWeek
  const firstMonday = new Date(jan1)
  firstMonday.setDate(jan1.getDate() + daysToFirstMonday)
  const targetMonday = new Date(firstMonday)
  targetMonday.setDate(firstMonday.getDate() + (weekNum - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(targetMonday)
    d.setDate(targetMonday.getDate() + i)
    return d
  })
}

function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}`
}

function calcRowTotal(rowKey: string, grid: GridData): string {
  if (!NUMERIC_ROWS.includes(rowKey)) return ''
  const sum = DAYS.reduce((acc, day) => {
    const val = parseFloat(grid[rowKey]?.[day] || '0')
    return acc + (isNaN(val) ? 0 : val)
  }, 0)
  return sum === 0 ? '' : String(Math.round(sum * 100) / 100)
}

function initGrid(): GridData {
  const grid: GridData = {}
  for (const row of ROWS) {
    grid[row.key] = {}
    for (const day of DAYS) {
      grid[row.key][day] = ''
    }
  }
  return grid
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RapportHeuresPage() {
  const currentYear = new Date().getFullYear()

  const [collaborateur, setCollaborateur] = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [semaine, setSemaine] = useState<number>(getCurrentWeek())
  const [grid, setGrid] = useState<GridData>(initGrid())
  const [dayTypes, setDayTypes] = useState<{ [day: string]: LineType }>(
    () => Object.fromEntries(DAYS.map(d => [d, 'travail' as LineType]))
  )

  const [pdfLoading, setPdfLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const dates = getDatesForWeek(semaine, currentYear)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const updateCell = useCallback((rowKey: string, day: string, value: string) => {
    setGrid(prev => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [day]: value },
    }))
  }, [])

  const updateDayType = useCallback((day: string, type: LineType) => {
    setDayTypes(prev => ({ ...prev, [day]: type }))
    const typeDef = LINE_TYPES.find(t => t.key === type)
    if (typeDef?.autoHours !== null) {
      // Auto-remplir heures normales avec la valeur fixe
      setGrid(prev => ({
        ...prev,
        heuresNormales: { ...prev.heuresNormales, [day]: String(typeDef!.autoHours) },
      }))
    } else if (type === 'travail') {
      // Remettre à vide si retour en "travail"
      setGrid(prev => ({
        ...prev,
        heuresNormales: { ...prev.heuresNormales, [day]: '' },
      }))
    }
  }, [])

  // Build payload for API
  const buildPayload = () => ({
    collaborateur,
    entreprise,
    semaine,
    annee: currentYear,
    dates: dates.map(d => formatDate(d)),
    gridData: grid,
    dayTypes,
  })

  // ── Generate PDF ──
  const handleGeneratePdf = async () => {
    setPdfLoading(true)
    try {
      const res = await fetch('/api/rapport-heures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) throw new Error('Erreur lors de la génération du PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport-heures-semaine-${semaine}-${collaborateur || 'collaborateur'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      showToast('PDF téléchargé avec succès', true)
    } catch (e: any) {
      showToast(e.message || 'Erreur PDF', false)
    } finally {
      setPdfLoading(false)
    }
  }

  const COLOR = '#F59E0B'
  const COLOR_SOFT = 'rgba(245,158,11,0.12)'

  return (
    <div className="d-page" style={{ maxWidth: 1100, paddingBottom: 60 }}>
      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/outils"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}
        >
          <ArrowLeft size={14} /> Outils
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: COLOR_SOFT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ClipboardList size={22} style={{ color: COLOR }} />
        </div>
        <div>
          <h1 className="d-page-title" style={{ margin: 0 }}>Rapport d&apos;heures</h1>
          <p className="d-page-sub" style={{ margin: 0 }}>Créez et envoyez les rapports de travail hebdomadaires</p>
        </div>
      </div>

      {/* Info fields */}
      <div className="neo-card-soft" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Collaborateur(trice)
            </label>
            <input
              type="text"
              className="neo-input"
              value={collaborateur}
              onChange={e => setCollaborateur(e.target.value)}
              placeholder="Nom Prénom"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Entreprise
            </label>
            <input
              type="text"
              className="neo-input"
              value={entreprise}
              onChange={e => setEntreprise(e.target.value)}
              placeholder="Nom de l'entreprise"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Semaine N°
            </label>
            <input
              type="number"
              className="neo-input"
              value={semaine}
              onChange={e => setSemaine(Math.max(1, Math.min(53, parseInt(e.target.value) || 1)))}
              min={1}
              max={53}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        {/* Week dates preview */}
        <div style={{
          marginTop: 14, padding: '8px 12px', borderRadius: 8,
          background: COLOR_SOFT, border: `1px solid ${COLOR}30`,
          fontSize: 12, color: 'var(--muted)',
        }}>
          Semaine {semaine} · {formatDate(dates[0])} au {formatDate(dates[6])}.{currentYear}
        </div>
      </div>

      {/* Table */}
      <div className="neo-card-soft" style={{ padding: 0, marginBottom: 24, overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: 12,
          minWidth: 860,
        }}>
          <thead>
            <tr style={{ background: 'rgba(245,158,11,0.08)' }}>
              <th style={thStyle('left', 160)}>Semaine N°{semaine}</th>
              {DAYS.map((day, i) => (
                <th key={day} style={thStyle('center', 80)}>
                  <div style={{ fontWeight: 700 }}>{day}</div>
                  <div style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>{formatDate(dates[i])}</div>
                </th>
              ))}
              <th style={{ ...thStyle('center', 70), color: COLOR, fontWeight: 800 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {/* Ligne type de jour */}
            <tr style={{ background: 'rgba(0,0,0,0.03)' }}>
              <td style={{
                padding: '6px 12px', borderBottom: '1px solid var(--border)',
                fontWeight: 600, color: 'var(--muted)', fontSize: 11,
                borderRight: '1px solid var(--border)',
              }}>
                Type de journée
              </td>
              {DAYS.map(day => {
                const currentType = dayTypes[day] || 'travail'
                const typeDef = LINE_TYPES.find(t => t.key === currentType)!
                const Icon = typeDef.icon
                return (
                  <td key={day} style={{
                    padding: 2, borderBottom: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)', textAlign: 'center',
                  }}>
                    <select
                      value={currentType}
                      onChange={e => updateDayType(day, e.target.value as LineType)}
                      style={{
                        width: '100%', border: 'none', outline: 'none', cursor: 'pointer',
                        background: `${typeDef.color}15`, color: typeDef.color,
                        fontSize: 10, fontWeight: 700, padding: '4px 2px',
                        borderRadius: 4, textAlign: 'center',
                      }}
                    >
                      {LINE_TYPES.map(lt => (
                        <option key={lt.key} value={lt.key}>{lt.label}</option>
                      ))}
                    </select>
                  </td>
                )
              })}
              <td style={{ borderBottom: '1px solid var(--border)', padding: 4 }} />
            </tr>
            {ROWS.map((row, rowIdx) => {
              const isEven = rowIdx % 2 === 0
              const total = calcRowTotal(row.key, grid)
              return (
                <tr key={row.key} style={{ background: isEven ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                  <td style={{
                    padding: '8px 12px', borderBottom: '1px solid var(--border)',
                    fontWeight: 600, color: 'var(--foreground)', fontSize: 12,
                    borderRight: '1px solid var(--border)',
                  }}>
                    {row.label}
                  </td>
                  {DAYS.map(day => {
                    const currentType = dayTypes[day] || 'travail'
                    const typeDef = LINE_TYPES.find(t => t.key === currentType)!
                    const isAutoHours = row.key === 'heuresNormales' && typeDef.autoHours !== null
                    const isNonWorkDay = currentType !== 'travail'
                    return (
                      <td key={day} style={{
                        padding: 4, borderBottom: '1px solid var(--border)',
                        borderRight: '1px solid var(--border)', textAlign: 'center',
                        background: isNonWorkDay ? `${typeDef.color}08` : undefined,
                      }}>
                        <input
                          type={row.type}
                          value={grid[row.key]?.[day] ?? ''}
                          onChange={e => updateCell(row.key, day, e.target.value)}
                          placeholder="—"
                          disabled={isAutoHours}
                          style={{
                            width: '100%', background: 'none', border: 'none', outline: 'none',
                            textAlign: 'center', fontSize: 13,
                            color: isAutoHours ? typeDef.color : 'var(--foreground)',
                            fontWeight: isAutoHours ? 700 : 400,
                            padding: '4px 2px', boxSizing: 'border-box',
                            cursor: isAutoHours ? 'not-allowed' : undefined,
                            opacity: isAutoHours ? 0.8 : 1,
                          }}
                        />
                      </td>
                    )
                  })}
                  <td style={{
                    padding: '8px 10px', borderBottom: '1px solid var(--border)',
                    textAlign: 'center', fontWeight: 700,
                    color: total ? COLOR : 'var(--muted)',
                    fontSize: 13,
                  }}>
                    {total || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleGeneratePdf}
          disabled={pdfLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: '#0F172A', color: 'white',
            fontWeight: 700, fontSize: 14, cursor: pdfLoading ? 'not-allowed' : 'pointer',
            opacity: pdfLoading ? 0.7 : 1,
          }}
        >
          {pdfLoading
            ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            : <FileDown size={16} />
          }
          Générer PDF
        </button>

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

function thStyle(align: 'left' | 'center', width?: number): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    fontWeight: 700,
    fontSize: 12,
    color: 'var(--foreground)',
    borderBottom: '2px solid var(--border)',
    borderRight: '1px solid var(--border)',
    width: width ? width : undefined,
    whiteSpace: 'nowrap',
  }
}
