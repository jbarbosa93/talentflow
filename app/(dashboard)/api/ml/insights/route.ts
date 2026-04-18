// app/(dashboard)/api/ml/insights/route.ts
// GET → retourne les insights ML basés sur decisions_matching
//
// Réponse :
// {
//   total: number,
//   byDecision: { confirmed_match, rejected_match, ignored },
//   byScoreBand: [{ band, confirmed, rejected, ignored, fpRate }],
//   topSignalsConfirmed: [{ signal, count, pct }],
//   topSignalsRejected: [{ signal, count, pct }],
//   recommendedThreshold: number | null,
//   currentThresholds: { match: 11, uncertain: 8 }
// }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth-guard'

export const runtime = 'nodejs'

type Decision = {
  id: string
  decision: 'confirmed_match' | 'rejected_match' | 'ignored'
  score: number
  signals: any
  decided_at: string
}

const BANDS = [
  { label: '0-4',   min: 0,  max: 4 },
  { label: '5-7',   min: 5,  max: 7 },
  { label: '8-10',  min: 8,  max: 10 },
  { label: '11-15', min: 11, max: 15 },
  { label: '16-20', min: 16, max: 20 },
  { label: '21+',   min: 21, max: 999 },
]

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  const supabase = createAdminClient()

  const { data, error } = await (supabase as any)
    .from('decisions_matching')
    .select('id, decision, score, signals, decided_at')
    .order('decided_at', { ascending: false })
    .limit(5000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const decisions = (data || []) as Decision[]
  const total = decisions.length

  // ─── Distribution par décision ──────────────────────────────────────────────
  const byDecision: Record<string, number> = {
    confirmed_match: 0,
    rejected_match: 0,
    ignored: 0,
  }
  for (const d of decisions) {
    byDecision[d.decision] = (byDecision[d.decision] || 0) + 1
  }

  // ─── Distribution par bande de score ────────────────────────────────────────
  const byScoreBand = BANDS.map(b => {
    const row = { band: b.label, confirmed: 0, rejected: 0, ignored: 0, fpRate: 0 }
    for (const d of decisions) {
      if (d.score >= b.min && d.score <= b.max) {
        if (d.decision === 'confirmed_match') row.confirmed++
        else if (d.decision === 'rejected_match') row.rejected++
        else if (d.decision === 'ignored') row.ignored++
      }
    }
    const totalBand = row.confirmed + row.rejected
    row.fpRate = totalBand > 0 ? row.rejected / totalBand : 0
    return row
  })

  // ─── Top signaux par type ───────────────────────────────────────────────────
  const signalKeys = ['ddnMatch', 'telMatch', 'emailMatch', 'villeMatch', 'strictExact', 'strictSubset']
  const countSignals = (filter: (d: Decision) => boolean) => {
    const counts: Record<string, number> = {}
    let total = 0
    for (const d of decisions) {
      if (!filter(d)) continue
      if (!d.signals || typeof d.signals !== 'object') continue
      total++
      for (const k of signalKeys) {
        if (d.signals[k] === true) counts[k] = (counts[k] || 0) + 1
      }
    }
    return signalKeys
      .map(k => ({ signal: k, count: counts[k] || 0, pct: total > 0 ? ((counts[k] || 0) / total) : 0 }))
      .sort((a, b) => b.pct - a.pct)
  }

  const topSignalsConfirmed = countSignals(d => d.decision === 'confirmed_match')
  const topSignalsRejected = countSignals(d => d.decision === 'rejected_match')

  // ─── Seuil recommandé (score où fpRate < 5% avec n >= 5) ────────────────────
  let recommendedThreshold: number | null = null
  for (let i = BANDS.length - 1; i >= 0; i--) {
    const row = byScoreBand[i]
    const totalBand = row.confirmed + row.rejected
    if (totalBand < 5) continue
    if (row.fpRate < 0.05) recommendedThreshold = BANDS[i].min
    else break
  }

  return NextResponse.json({
    total,
    byDecision,
    byScoreBand,
    topSignalsConfirmed,
    topSignalsRejected,
    recommendedThreshold,
    currentThresholds: { match: 11, uncertain: 8 },
    dataset_info: {
      scope: 'decisions_matching table',
      last_decisions: decisions.slice(0, 5).map(d => ({
        decision: d.decision,
        score: d.score,
        decided_at: d.decided_at,
      })),
    },
  })
}
