'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface PaiementCalendar {
  id: string
  mode: 'calendrier_mensuel' | 'mensuel' | 'hebdomadaire'
  annee: number
  libelle: string
  date_limite: string | null
  date_paiement: string
}

interface ModeStats {
  mode: string
  count: number
}

const MODE_LABELS = {
  calendrier_mensuel: { label: 'Calendrier mensuel (décalé)', color: '#DC2626', bg: 'rgba(220,38,38,0.06)', emoji: '🔴' },
  mensuel: { label: 'Mensuel', color: '#059669', bg: 'rgba(5,150,105,0.06)', emoji: '🟢' },
  hebdomadaire: { label: 'Hebdomadaire', color: '#2563EB', bg: 'rgba(37,99,235,0.06)', emoji: '🔵' },
} as const

function formatDateFr(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

function isPast(s: string): boolean {
  return new Date(s) < new Date(new Date().toDateString())
}

function isNext(s: string, all: string[]): boolean {
  const now = new Date(new Date().toDateString()).getTime()
  const future = all.filter(d => new Date(d).getTime() >= now).sort()
  return future[0] === s
}

export default function CalendrierPaiementsPage() {
  const [calendrier, setCalendrier] = useState<PaiementCalendar[]>([])
  const [stats, setStats] = useState<ModeStats[]>([])
  const [loading, setLoading] = useState(true)
  const [annee, setAnnee] = useState(new Date().getFullYear())

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      const supabase = createClient() as any
      const { data: cal } = await supabase
        .from('secretariat_paiement_calendrier')
        .select('*')
        .eq('annee', annee)
        .order('date_paiement', { ascending: true })
      const { data: candidats } = await supabase
        .from('secretariat_candidats')
        .select('mode_paiement')
        .not('mode_paiement', 'is', null)
        .eq('archive', false)
        .eq('is_mission_terminee', false)
      if (!mounted) return
      setCalendrier(cal || [])
      const counts: Record<string, number> = {}
      for (const c of candidats || []) {
        const m = c.mode_paiement
        if (m) counts[m] = (counts[m] || 0) + 1
      }
      setStats(Object.entries(counts).map(([mode, count]) => ({ mode, count })))
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [annee])

  const byMode = (mode: string) => calendrier.filter(c => c.mode === mode)
  const allDates = calendrier.map(c => c.date_paiement)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-instrument-serif), serif', fontSize: 36, margin: 0, color: 'var(--foreground)' }}>
            💰 Calendrier des paiements
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Référentiel des dates de versement de salaire — Notifications email J-2
          </p>
        </div>
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontWeight: 600, background: 'var(--background)', color: 'var(--foreground)' }}>
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
        </select>
      </div>

      {/* Stats par mode */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '24px 0' }}>
        {(['calendrier_mensuel', 'mensuel', 'hebdomadaire'] as const).map(m => {
          const meta = MODE_LABELS[m]
          const count = stats.find(s => s.mode === m)?.count || 0
          return (
            <div key={m} style={{ padding: 16, borderRadius: 12, background: meta.bg, border: `2px solid ${meta.color}22` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{meta.emoji} {meta.label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: meta.color, marginTop: 4 }}>{count}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>candidat{count > 1 ? 's' : ''} en mission active</div>
            </div>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Chargement…</div>
      ) : (
        <>
          {/* Calendrier mensuel décalé */}
          <CalendarSection
            title="🔴 Calendrier mensuel (décalé)"
            description="Salaire payé chaque mois selon un calendrier décalé. Les heures doivent être envoyées avant la date limite."
            color={MODE_LABELS.calendrier_mensuel.color}
            entries={byMode('calendrier_mensuel')}
            allDates={allDates}
          />

          {/* Mensuel */}
          <CalendarSection
            title="🟢 Mensuel"
            description="Salaire payé une fois par mois sur le mois complet travaillé. Paiement effectué le mois suivant."
            color={MODE_LABELS.mensuel.color}
            entries={byMode('mensuel')}
            allDates={allDates}
            hideLimite
          />

          {/* Hebdomadaire */}
          <CalendarSection
            title="🔵 Hebdomadaire"
            description="Paiement chaque jeudi à 14h. Heures à transmettre avant mercredi 9h."
            color={MODE_LABELS.hebdomadaire.color}
            entries={byMode('hebdomadaire')}
            allDates={allDates}
            compact
          />
        </>
      )}
    </div>
  )
}

function CalendarSection({ title, description, color, entries, allDates, hideLimite, compact }: {
  title: string
  description: string
  color: string
  entries: PaiementCalendar[]
  allDates: string[]
  hideLimite?: boolean
  compact?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const visibleEntries = compact && !showAll
    ? entries.filter(e => !isPast(e.date_paiement)).slice(0, 8)
    : entries

  return (
    <div style={{ margin: '24px 0', padding: 20, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--background)' }}>
      <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1.5px dashed var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color }}>{title}</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>{description}</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${color}22` }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Période</th>
              {!hideLimite && <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Date limite</th>}
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Jour de paiement</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Notif J-2</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map(e => {
              const past = isPast(e.date_paiement)
              const next = isNext(e.date_paiement, allDates)
              const notifDate = new Date(e.date_paiement)
              notifDate.setDate(notifDate.getDate() - 2)
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', opacity: past ? 0.4 : 1, background: next ? `${color}10` : 'transparent' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{e.libelle}</td>
                  {!hideLimite && <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{formatDateFr(e.date_limite)}</td>}
                  <td style={{ padding: '8px 12px', fontWeight: 700, color }}>{formatDateFr(e.date_paiement)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 12 }}>{formatDateFr(notifDate.toISOString().slice(0, 10))}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {past
                      ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>Passé</span>
                      : next
                        ? <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 800, background: color, color: '#fff' }}>● PROCHAIN</span>
                        : <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: `${color}15`, color, border: `1px solid ${color}30` }}>À venir</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {compact && entries.length > visibleEntries.length && (
        <button onClick={() => setShowAll(true)}
          style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'transparent', color, border: `1.5px solid ${color}40`, cursor: 'pointer' }}>
          Afficher toutes les semaines ({entries.length} au total)
        </button>
      )}
    </div>
  )
}
