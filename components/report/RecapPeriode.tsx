// TalentFlow Rapports — Récapitulatif par période (composant partagé)
// v2.4.1 — Phase 2
//
// Sélecteur from/to + bouton Générer + résultat (tableau missions + total).
// Utilisé côté candidat (scope=candidate) et côté dashboard (scope=dashboard).
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Calendar, Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatHours, type SubmissionTotals } from '@/lib/report/recap'
import { formatDateChDot } from '@/lib/report/text-format'

interface RecapMission {
  client_id: string | null
  client_name: string
  count: number
  totals: SubmissionTotals
}

interface RecapResponse {
  from: string
  to: string
  scope: 'candidate' | 'dashboard'
  count: number
  byMission: RecapMission[]
  total: SubmissionTotals
}

interface Props {
  slug: string
  scope?: 'candidate' | 'dashboard'
  /** Date initiale "from" (par défaut : 1er du mois en cours) */
  initialFrom?: string
  /** Date initiale "to" (par défaut : aujourd'hui) */
  initialTo?: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function RecapPeriode({ slug, scope = 'candidate', initialFrom, initialTo }: Props) {
  const [from, setFrom] = useState(initialFrom || firstOfMonth())
  const [to, setTo] = useState(initialTo || todayIso())
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<RecapResponse | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // Auto-fetch au montage avec la période par défaut
  const params = useMemo(() => ({ from, to, scope }), [from, to, scope])

  const fetchRecap = async () => {
    if (!from || !to || from > to) {
      toast.error('Période invalide')
      return
    }
    setLoading(true)
    try {
      const url = `/api/reports/${slug}/recap?from=${from}&to=${to}&scope=${scope}`
      const r = await fetch(url)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur récap')
      setData(d as RecapResponse)
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  // Fetch initial automatique
  useEffect(() => { fetchRecap() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true)
    try {
      const url = `/api/reports/${slug}/recap/pdf?from=${from}&to=${to}&scope=${scope}`
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setTimeout(() => setDownloadingPdf(false), 800)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Sélecteurs — v2.4.8 dark mode tokens */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--muted)',
        }}>
          Période
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px', minWidth: 140 }}>
            <label style={inputLabelStyle}>Du</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 140px', minWidth: 140 }}>
            <label style={inputLabelStyle}>Au</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from}
              style={inputStyle}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={fetchRecap}
          disabled={loading}
          style={{
            minHeight: 44,
            padding: '10px 14px',
            background: '#EAB308',
            color: '#1C1A14',
            border: '1px solid #1C1A14',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
          {loading ? 'Calcul en cours…' : 'Générer le récapitulatif'}
        </button>
      </div>

      {/* Résultat */}
      {data && !loading && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, color: 'var(--muted)',
          }}>
            <Calendar size={14} />
            <span>
              <strong style={{ color: 'var(--foreground)' }}>{data.count}</strong> rapport{data.count > 1 ? 's' : ''} entre <strong style={{ color: 'var(--foreground)' }}>{formatDateChDot(data.from)}</strong> et <strong style={{ color: 'var(--foreground)' }}>{formatDateChDot(data.to)}</strong>
            </span>
          </div>

          {/* Par mission */}
          {data.byMission.length > 0 && (
            <section>
              <div style={sectionLabelStyle}>Par mission</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.byMission.map((m, idx) => (
                  <div
                    key={(m.client_id || 'legacy') + idx}
                    style={{
                      padding: '12px 14px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                    }}
                  >
                    <div style={{
                      flexShrink: 0,
                      width: 36, height: 36, borderRadius: 10,
                      background: '#FEF3C7',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: '#92400E',
                    }}>
                      <Building2 size={17} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--foreground)' }}>
                        {m.client_name}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <span><strong style={{ color: 'var(--foreground)' }}>{m.count}</strong> sem.</span>
                        {m.totals.heures_normales > 0 && <span>{formatHours(m.totals.heures_normales)}h</span>}
                        {m.totals.heures_sup > 0 && <span>{formatHours(m.totals.heures_sup)}h sup</span>}
                        {m.totals.repas > 0 && <span>{m.totals.repas} repas</span>}
                        {m.totals.deplacement > 0 && <span>{formatHours(m.totals.deplacement)}h dépl.</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Total — card amber semantique (reste pareil light + dark) */}
          <section>
            <div style={sectionLabelStyle}>Total période</div>
            <div style={{
              padding: 14,
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 12,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <TotalRow label="Heures normales"           value={`${formatHours(data.total.heures_normales)} h`} />
              <TotalRow label="Heures supplémentaires"    value={`${formatHours(data.total.heures_sup)} h`} />
              <TotalRow label="Temps de déplacement"      value={`${formatHours(data.total.deplacement)} h`} />
              <TotalRow label="Repas"                      value={String(data.total.repas)} />
            </div>
          </section>

          {/* PDF download */}
          {data.count > 0 && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              style={{
                minHeight: 44,
                padding: '10px 14px',
                background: '#EAB308',
                color: '#1C1A14',
                border: '1px solid #1C1A14',
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {downloadingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Télécharger le récapitulatif PDF
            </button>
          )}

          {data.count === 0 && (
            <div style={{
              padding: 18,
              background: 'var(--card)',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              textAlign: 'center', fontSize: 13, color: 'var(--muted)',
            }}>
              Aucun rapport sur cette période.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13.5, color: '#78350F' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14' }}>{value}</span>
    </div>
  )
}

const inputLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted)',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--foreground)',
  boxSizing: 'border-box',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--muted)',
  marginBottom: 8,
}
