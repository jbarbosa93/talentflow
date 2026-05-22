// TalentFlow Rapports — Tableau quotidien (Phase 5)
// v2.2.6
//
// Tableau de saisie hebdomadaire calqué sur le PDF L-Agence :
//   colonne 1 : labels (Date / Heures normales / Repas / Heures supp / etc.)
//   colonnes 2-8 : Lundi → Dimanche
//   colonne 9 : TOTAL (auto-calculé pour Heures normales et Repas)
//
// Source de vérité des fields : `template.documents[0].fields`. Chaque field a
// un `wizardSection` (= nom du jour) et un `label` qui détermine sa ligne.
// Pour les templates qui n'utilisent pas wizardSection cohérent, on rend tous
// les fields dans une grille à plat sous le tableau (mode dégradé).
'use client'

import { useMemo } from 'react'
import type { SignField } from '@/lib/sign/types'
import { WEEK_DAYS, type WeekDay } from '@/lib/report/types'
import { dateForDay, formatShortDate } from '@/lib/report/week-helpers'

interface Props {
  /** Fields du template pour le rôle Candidat (recipientOrder=1) */
  fields: SignField[]
  /** week_start ISO (YYYY-MM-DD) — sert à calculer la date de chaque jour */
  weekStart: string
  /** Valeurs courantes des champs (id → value) */
  values: Record<string, unknown>
  onChange: (fieldId: string, value: unknown) => void
  /** Si true, tous les inputs sont disabled (vue lecture seule submission déjà signée) */
  readOnly?: boolean
}

/** Mapping label → clé interne (insensible casse + accents). */
const ROW_KEY_MATCHERS: { key: string; label: string; aliases: RegExp[]; numeric: boolean; total: boolean }[] = [
  { key: 'date', label: 'Date', aliases: [/^date$/i], numeric: false, total: false },
  { key: 'heures_normales', label: 'Heures normales', aliases: [/heures?\s*normales?/i], numeric: true, total: true },
  { key: 'repas', label: 'Repas', aliases: [/repas/i], numeric: true, total: true },
  { key: 'heures_supplementaires', label: 'Heures supplémentaires', aliases: [/heures?\s*suppl/i], numeric: true, total: true },
  { key: 'centre_couts_chantier', label: 'Centre de coûts / chantier', aliases: [/centre|chantier|co[uû]ts?/i], numeric: false, total: false },
  { key: 'temps_deplacement', label: 'Temps de déplacement', aliases: [/d[eé]placement|trajet/i], numeric: true, total: true },
  { key: 'divers', label: 'Divers', aliases: [/divers|autre/i], numeric: false, total: false },
]

interface RowMap {
  rowKey: string
  rowLabel: string
  numeric: boolean
  total: boolean
  /** Map jour → field */
  byDay: Map<WeekDay, SignField | undefined>
}

export default function DailyReportTable({
  fields, weekStart, values, onChange, readOnly,
}: Props) {
  // Construction des lignes à partir des fields (groupés par wizardSection = jour)
  const rows = useMemo<RowMap[]>(() => {
    const matched: Map<string, RowMap> = new Map()
    const orphans: SignField[] = []

    for (const f of fields) {
      const day = (f.wizardSection || '').trim() as WeekDay
      const isDay = (WEEK_DAYS as readonly string[]).includes(day)
      if (!isDay) {
        orphans.push(f)
        continue
      }
      const lbl = `${f.label || ''} ${f.tooltip || ''}`.trim()
      const matcher = ROW_KEY_MATCHERS.find(m => m.aliases.some(rx => rx.test(lbl)))
      if (!matcher) {
        orphans.push(f)
        continue
      }
      let row = matched.get(matcher.key)
      if (!row) {
        row = {
          rowKey: matcher.key,
          rowLabel: matcher.label,
          numeric: matcher.numeric,
          total: matcher.total,
          byDay: new Map(),
        }
        matched.set(matcher.key, row)
      }
      row.byDay.set(day, f)
    }

    // Préserve l'ordre canonique du PDF
    return ROW_KEY_MATCHERS
      .map(m => matched.get(m.key))
      .filter((r): r is RowMap => !!r)
  }, [fields])

  // Calcul total par ligne (somme des valeurs des 7 jours).
  // v2.9.42 — Les cases à cocher (Repas) comptent 1 si cochées.
  const totalForRow = (row: RowMap): number => {
    let sum = 0
    for (const day of WEEK_DAYS) {
      const f = row.byDay.get(day)
      if (!f) continue
      const v = values[f.id]
      if (f.type === 'checkbox') {
        if (v === true || v === 'true') sum += 1
        continue
      }
      const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
      if (Number.isFinite(n)) sum += n
    }
    return sum
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Tableau principal (responsive : scroll horizontal sur mobile) */}
      <div style={{
        overflowX: 'auto',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        background: '#fff',
        WebkitOverflowScrolling: 'touch',
      }}>
        <table style={{
          borderCollapse: 'separate',
          borderSpacing: 0,
          width: '100%',
          minWidth: 880,
          fontFamily: 'inherit',
        }}>
          <thead>
            <tr>
              <th style={thLabelStyle}>Jour</th>
              {WEEK_DAYS.map(day => (
                <th key={day} style={thStyle}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1A14' }}>{day}</div>
                  <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {formatShortDate(dateForDay(weekStart, day))}
                  </div>
                </th>
              ))}
              <th style={{ ...thStyle, background: '#FEF3C7', color: '#A16207' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const total = row.total ? totalForRow(row) : null
              return (
                <tr key={row.rowKey}>
                  <td style={tdLabelStyle}>{row.rowLabel}</td>
                  {WEEK_DAYS.map(day => {
                    const f = row.byDay.get(day)
                    if (!f) return <td key={day} style={tdEmptyStyle}>—</td>
                    const v = values[f.id]
                    // v2.9.42 — Champ case à cocher (Repas) → vraie checkbox centrée.
                    if (f.type === 'checkbox') {
                      const checked = v === true || v === 'true'
                      return (
                        <td key={day} style={{ ...tdStyle, textAlign: 'center', padding: '8px 0' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => onChange(f.id, e.target.checked)}
                            disabled={!!readOnly}
                            style={{
                              width: 18, height: 18,
                              cursor: readOnly ? 'default' : 'pointer',
                              accentColor: '#15803D',
                            }}
                          />
                        </td>
                      )
                    }
                    const isZero = row.numeric && (v === '' || v === undefined || v === null || Number(String(v).replace(',', '.')) === 0)
                    return (
                      <td key={day} style={tdStyle}>
                        <input
                          type="text"
                          inputMode={row.numeric ? 'decimal' : 'text'}
                          value={v === undefined || v === null ? '' : String(v)}
                          onChange={e => onChange(f.id, e.target.value)}
                          disabled={!!readOnly}
                          placeholder={row.numeric ? '0' : ''}
                          style={{
                            width: '100%',
                            padding: '8px 6px',
                            border: 'none',
                            background: 'transparent',
                            fontSize: 14,
                            textAlign: row.numeric ? 'right' : 'left',
                            fontFamily: 'inherit',
                            outline: 'none',
                            color: isZero ? '#D1D5DB' : '#1C1A14',
                            fontVariantNumeric: row.numeric ? 'tabular-nums' : undefined,
                          }}
                        />
                      </td>
                    )
                  })}
                  <td style={{ ...tdStyle, background: '#FFFBEB', textAlign: 'right', fontWeight: 700, color: '#A16207', fontVariantNumeric: 'tabular-nums' }}>
                    {total !== null ? formatNum(total) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Aucune ligne reconnue → message d'aide */}
      {rows.length === 0 && (
        <div style={{
          marginTop: 12,
          padding: '12px 14px',
          background: '#FEF3C7',
          border: '1px solid #FDE68A',
          borderRadius: 10,
          fontSize: 12.5,
          color: '#A16207',
          lineHeight: 1.5,
        }}>
          ⚠️ Aucun champ jour reconnu dans le template. Place les fields dans
          l&apos;éditeur Sign avec une <strong>section</strong> = <em>Lundi</em> /
          <em>Mardi</em> / … et un <strong>label</strong> tel que «&nbsp;Heures
          normales&nbsp;», «&nbsp;Repas&nbsp;», etc.
        </div>
      )}
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '12px 8px',
  background: '#FAFAF7',
  borderBottom: '1px solid #E5E7EB',
  fontSize: 12,
  fontWeight: 700,
  color: '#1C1A14',
  textAlign: 'center',
  whiteSpace: 'nowrap',
}

const thLabelStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: 'left',
  paddingLeft: 14,
  minWidth: 180,
}

const tdStyle: React.CSSProperties = {
  borderBottom: '1px solid #F3F4F6',
  borderRight: '1px solid #F3F4F6',
  padding: 0,
  background: '#fff',
  minWidth: 90,
}

const tdLabelStyle: React.CSSProperties = {
  ...tdStyle,
  paddingLeft: 14,
  paddingRight: 8,
  paddingTop: 10,
  paddingBottom: 10,
  fontSize: 13,
  fontWeight: 600,
  color: '#1C1A14',
  background: '#FAFAF7',
  whiteSpace: 'nowrap',
}

const tdEmptyStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'center',
  color: '#D1D5DB',
  fontSize: 12,
  padding: '8px 0',
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}
