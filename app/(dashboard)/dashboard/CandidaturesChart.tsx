'use client'

// Composant chart isolé pour pouvoir charger recharts en lazy (next/dynamic SSR-off).
// Tout l'import recharts (~150 KB gzipped) reste hors du bundle initial dashboard.

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, LabelList, Cell } from 'recharts'

export type ChartPoint = { label: string; candidatures: number }

interface Props {
  chartData: ChartPoint[]
  chartPeriod: 'jour' | 'semaine' | 'mois' | string
}

export default function CandidaturesChart({ chartData, chartPeriod }: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 24, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          interval={chartPeriod === 'jour' ? 4 : 0}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--accent)' }}
          contentStyle={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, fontSize: 13, fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            color: 'var(--foreground)',
          }}
          labelStyle={{ fontWeight: 700, color: 'var(--foreground)' }}
          itemStyle={{ color: 'var(--foreground)' }}
          formatter={(value: any) => [`${value} candidature${value > 1 ? 's' : ''}`, '']}
        />
        <Bar dataKey="candidatures" radius={[8, 8, 0, 0]} maxBarSize={54}>
          {chartData.map((_d, i) => (
            <Cell key={i} fill={i === chartData.length - 1 ? 'var(--primary)' : 'var(--primary-soft, rgba(247,201,72,0.55))'} />
          ))}
          <LabelList dataKey="candidatures" position="top" style={{ fill: 'var(--foreground)', fontSize: 12, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// Re-exports inutilisés (placeholders pour future extension)
export { AreaChart, Area }
