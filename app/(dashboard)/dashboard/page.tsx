'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, ArrowRight, Sparkles, Calendar, MapPin, Upload, Building2, Activity, Mail, MessageCircle, FileText, StickyNote, Smartphone } from 'lucide-react'
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

      {/* ── Activite recente ── */}
      <RecentActivityWidget />

    </div>
  )
}

/* ─── Activity type config ─── */
const ACT_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  email_envoye:      { icon: Mail,           color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  whatsapp_envoye:   { icon: MessageCircle,  color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  sms_envoye:        { icon: Smartphone,     color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  cv_envoye:         { icon: FileText,       color: '#F97316', bg: 'rgba(249,115,22,0.15)' },
  candidat_importe:  { icon: Upload,         color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  candidat_modifie:  { icon: Activity,       color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
  entretien_planifie:{ icon: Calendar,       color: '#7C3AED', bg: 'rgba(124,58,237,0.15)' },
  note_ajoutee:      { icon: StickyNote,     color: '#D97706', bg: 'rgba(217,119,6,0.15)' },
  statut_change:     { icon: ArrowRight,     color: '#6B7280', bg: 'rgba(107,114,128,0.15)' },
  client_contacte:   { icon: Building2,      color: '#14B8A6', bg: 'rgba(20,184,166,0.15)' },
}

function actTempsRelatif(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'a l\'instant'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'hier'
  if (diffD < 7) return `il y a ${diffD}j`
  return `il y a ${Math.floor(diffD / 7)} sem.`
}

function actInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (name[0] || '?').toUpperCase()
}

function RecentActivityWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['activites', { per_page: 8, page: 1 }],
    queryFn: async () => {
      const res = await fetch('/api/activites?per_page=8&page=1')
      if (!res.ok) throw new Error('Erreur chargement')
      return res.json()
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const activites = data?.activites || []

  return (
    <motion.div
      custom={3}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="neo-card-soft"
      style={{ padding: 24, marginTop: 20 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="neo-section-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity style={{ width: 16, height: 16, color: 'var(--primary)' }} />
          Activite recente
        </h2>
        <Link href="/activites" style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          Voir tout <ArrowRight style={{ width: 13, height: 13 }} />
        </Link>
      </div>

      {isLoading && activites.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Chargement...
        </div>
      ) : activites.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Aucune activite pour le moment
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {activites.map((a: any, i: number) => {
            const config = ACT_TYPE_CONFIG[a.type] || ACT_TYPE_CONFIG.statut_change
            const Icon = config.icon
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 10,
                  transition: 'background 0.12s',
                  cursor: 'default',
                }}
                whileHover={{ backgroundColor: 'var(--secondary, rgba(0,0,0,0.03))' }}
              >
                {/* Colored dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: config.color, flexShrink: 0,
                }} />
                {/* Avatar */}
                <div style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: config.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 10, fontWeight: 800, color: config.color,
                }}>
                  {actInitials(a.user_name || '')}
                </div>
                {/* Title */}
                <span style={{
                  flex: 1, fontSize: 12, fontWeight: 600,
                  color: 'var(--foreground)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.titre}
                </span>
                {/* Time */}
                <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, fontWeight: 500 }}>
                  {actTempsRelatif(a.created_at)}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
