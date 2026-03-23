'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, ArrowRight, Sparkles, Calendar, MapPin, Upload, Building2 } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import NumberTicker from '@/components/magicui/number-ticker'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const CandidatsMap = dynamic(() => import('@/components/CandidatsMap'), { ssr: false, loading: () => (
  <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 13 }}>
    Chargement de la carte…
  </div>
) })

const ETAPE_BADGE: Record<string, string> = {
  nouveau:   'neo-badge neo-badge-nouveau',
  contacte:  'neo-badge neo-badge-contacte',
  entretien: 'neo-badge neo-badge-entretien',
  place:     'neo-badge neo-badge-place',
  refuse:    'neo-badge neo-badge-refuse',
}
const ETAPE_LABELS: Record<string, string> = {
  nouveau: 'Nouveau', contacte: 'Contacté', entretien: 'Entretien', place: 'Placé', refuse: 'Refusé',
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, type: 'spring' as const, stiffness: 280, damping: 24 },
  }),
}

const kpiVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: 0.1 + i * 0.06, type: 'spring' as const, stiffness: 300, damping: 26 },
  }),
}

export default function DashboardPage() {
  const supabase = createClient()

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 60_000,
  })

  const prenom = user?.user_metadata?.prenom || ''
  const nom    = user?.user_metadata?.nom    || ''
  const greeting = prenom
    ? [prenom, nom].filter(Boolean).join(' ')
    : 'Consultant'

  const [chartPeriod, setChartPeriod] = useState<'jour' | 'semaine' | 'mois'>('jour')

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [candidats, clients, offres, entretiens, places] = await Promise.all([
        supabase.from('candidats').select('id', { count: 'exact', head: true }),
        (supabase as any).from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('offres').select('id', { count: 'exact', head: true }).eq('statut', 'active'),
        supabase.from('candidats').select('id', { count: 'exact', head: true }).eq('statut_pipeline', 'entretien' as any),
        supabase.from('candidats').select('id', { count: 'exact', head: true }).eq('statut_pipeline', 'place' as any),
      ])
      return {
        totalCandidats: candidats.count ?? 0,
        totalClients:   clients.count ?? 0,
        offresActives:  offres.count ?? 0,
        enEntretien:    entretiens.count ?? 0,
        places:         places.count ?? 0,
      }
    },
    staleTime: 30_000,
  })

  // Chart data — candidatures par jour/semaine/mois
  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart', chartPeriod],
    queryFn: async () => {
      // Fetch created_at for all candidats in the last 90 days
      const since = new Date()
      since.setDate(since.getDate() - 90)
      const { data } = await supabase
        .from('candidats')
        .select('created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })

      const rows = (data || []) as { created_at: string }[]
      const counts: Record<string, number> = {}

      for (const r of rows) {
        const d = new Date(r.created_at)
        let key = ''
        if (chartPeriod === 'jour') {
          key = d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })
        } else if (chartPeriod === 'semaine') {
          // Get ISO week start (Monday)
          const day = d.getDay() || 7
          const mon = new Date(d)
          mon.setDate(d.getDate() - day + 1)
          key = 'S' + mon.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })
        } else {
          key = d.toLocaleDateString('fr-CH', { month: 'short', year: '2-digit' })
        }
        counts[key] = (counts[key] || 0) + 1
      }

      // Keep last N entries
      const entries = Object.entries(counts)
      const limit = chartPeriod === 'jour' ? 30 : chartPeriod === 'semaine' ? 12 : 6
      return entries.slice(-limit).map(([label, candidatures]) => ({ label, candidatures }))
    },
    staleTime: 60_000,
  })

  const kpis = [
    { label: 'Candidats',         value: stats?.totalCandidats ?? '—', emoji: '👤', kpiClass: 'kpi-yellow',  href: '/candidats' },
    { label: 'Clients',           value: stats?.totalClients   ?? '—', emoji: '🏢', kpiClass: 'kpi-green',  href: '/clients' },
    { label: 'Commandes actives', value: stats?.offresActives  ?? '—', emoji: '📋', kpiClass: 'kpi-blue',   href: '/offres' },
    { label: 'En entretien',      value: stats?.enEntretien    ?? '—', emoji: '🗣️', kpiClass: 'kpi-violet', href: '/candidats?statut=entretien' },
  ]

  const initiales = (c: any) => {
    const n = (c.nom || '').trim(); const p = (c.prenom || '').trim()
    return `${p[0] || ''}${n[0] || ''}`.toUpperCase() || '?'
  }

  return (
    <div className="d-page">

      {/* ── Header ── */}
      <motion.div
        className="d-page-header"
        custom={0}
        variants={fadeUp}
        initial="hidden"
        animate="show"
      >
        <div>
          <h1 className="d-page-title">Bonjour, {greeting} 👋</h1>
          <p className="d-page-sub">Voici un aperçu de votre activité de recrutement</p>
        </div>
      </motion.div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {kpis.map((kpi, i) => (
          <motion.div key={i} custom={i} variants={kpiVariants} initial="hidden" animate="show">
            <Link href={kpi.href} style={{ textDecoration: 'none', display: 'block' }}>
              <motion.div
                className={`neo-kpi ${kpi.kpiClass || ''}`}
                style={{ cursor: 'pointer' }}
                whileHover={{ y: -4, boxShadow: '0 10px 28px rgba(0,0,0,0.12)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              >
                <motion.div
                  className="neo-kpi-icon"
                  whileHover={{ scale: 1.12, rotate: 8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <span style={{ fontSize: 17 }}>{kpi.emoji}</span>
                </motion.div>
                <div className="neo-kpi-value">
                  {typeof kpi.value === 'number'
                    ? <NumberTicker value={kpi.value} delay={0.2 + i * 0.06} />
                    : kpi.value}
                </div>
                <div className="neo-kpi-label">{kpi.label}</div>
              </motion.div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ── Two column: quick actions + recent candidates ── */}
      <motion.div
        custom={1}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}
      >
        {/* Quick actions */}
        <div className="neo-card-soft" style={{ padding: 24 }}>
          <h2 className="neo-section-title">Actions rapides</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/candidats/a-traiter', label: 'Importer Candidat/s', icon: Upload },
              { href: '/clients',             label: 'Ajouter un client',   icon: Building2 },
              { href: '/offres',              label: 'Nouvelle commande',   icon: Plus },
              { href: '/matching',            label: 'Matching IA',         icon: Sparkles },
            ].map((a, i) => {
              const Icon = a.icon
              return (
                <motion.div
                  key={a.href}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.07, type: 'spring', stiffness: 300, damping: 24 }}
                >
                  <Link href={a.href} className="neo-candidate-card" style={{ padding: '12px 16px', borderRadius: 10, justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon style={{ width: 15, height: 15, color: 'var(--muted)' }} />
                      {a.label}
                    </span>
                    <ArrowRight style={{ width: 13, height: 13, color: 'var(--muted)' }} />
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Graphique candidatures */}
        <div className="neo-card-soft" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 className="neo-section-title" style={{ marginBottom: 0 }}>Candidatures reçues</h2>
            <div style={{
              display: 'flex', gap: 0, border: '2px solid var(--border)',
              borderRadius: 8, overflow: 'hidden', background: 'var(--card)',
            }}>
              {([
                { key: 'jour', label: 'Jour' },
                { key: 'semaine', label: 'Semaine' },
                { key: 'mois', label: 'Mois' },
              ] as const).map(p => (
                <button key={p.key} onClick={() => setChartPeriod(p.key)} style={{
                  padding: '6px 14px', border: 'none',
                  borderRight: '1px solid var(--border)',
                  background: chartPeriod === p.key ? 'var(--primary)' : 'transparent',
                  color: chartPeriod === p.key ? 'var(--ink, #1C1A14)' : 'var(--muted)',
                  fontSize: 12, fontWeight: chartPeriod === p.key ? 700 : 500,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCandidatures" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F7C948" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F7C948" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  interval={chartPeriod === 'jour' ? 4 : 0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)', border: '2px solid var(--border)',
                    borderRadius: 10, fontSize: 13, fontWeight: 600,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  }}
                  labelStyle={{ fontWeight: 700, color: 'var(--foreground)' }}
                  formatter={(value: any) => [`${value} candidature${value > 1 ? 's' : ''}`, '']}
                />
                <Area
                  type="monotone"
                  dataKey="candidatures"
                  stroke="#F7C948"
                  strokeWidth={2.5}
                  fill="url(#colorCandidatures)"
                  dot={{ r: 3, fill: '#F7C948', stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: '#F7C948', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Chargement du graphique...
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Carte des candidats ── */}
      <motion.div
        custom={2}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="neo-card-soft"
        style={{ padding: 24, marginTop: 20 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="neo-section-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin style={{ width: 16, height: 16, color: 'var(--primary)' }} />
            Candidats par lieu
          </h2>
          <Link href="/candidats" style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            Voir tous <ArrowRight style={{ width: 13, height: 13 }} />
          </Link>
        </div>
        <div style={{ height: 380, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <CandidatsMap />
        </div>
      </motion.div>

    </div>
  )
}
