'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, ArrowRight, Sparkles, Calendar, MapPin, Upload, Building2, Activity, Mail, MessageCircle, FileText, StickyNote, Smartphone, AlertTriangle, ClipboardList, Clock, CheckCircle2, Shield, Loader2 } from 'lucide-react'

function WaIcon({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.612l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.82-6.3-2.188l-.44-.348-2.858.958.958-2.858-.348-.44A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
}
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
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
  const [dateStr, setDateStr] = useState('')
  useEffect(() => {
    setDateStr(new Date().toLocaleDateString('fr-CH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }))
  }, [])

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
      // Candidatures à partir du 24 mars 2026 (reset — prochains imports uniquement)
      const since = new Date('2026-03-24T00:00:00')
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

  // ── Dashboard Secrétaire ────────────────────────────────────────────────
  if (user && user.user_metadata?.role === 'Secrétaire') {
    return <SecretaireDashboard user={user} />
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
          {dateStr && <p className="d-page-sub" style={{ textTransform: 'capitalize' }}>{dateStr}</p>}
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
        custom={3}
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

// ══════════════════════════════════════════════════════════════════════════════
// ─── DASHBOARD SECRÉTAIRE ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

interface SecStats {
  candidats_actifs: number
  permis_urgents: number
  permis_surveillance: number
  accidents_en_cours: number
  a_traiter: {
    id: string
    candidat_id: string | null
    nom: string
    prenom: string
    photo_url: string | null
    tel: string | null
    email: string | null
    raison: string
    urgence: 'rouge' | 'orange' | 'jaune'
    type: 'permis' | 'accident' | 'docs'
  }[]
  activite_recente: { nom: string; action: string; date: string }[]
}

function tempsRelatifSec(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'à l\'instant'
  if (h < 24) return `il y a ${h}h`
  const j = Math.floor(h / 24)
  if (j === 1) return 'hier'
  if (j < 7) return `il y a ${j} jours`
  return new Date(dateStr).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })
}

function dateDuJour(): string {
  return new Date().toLocaleDateString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const URGENCE_CFG = {
  rouge:  { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  color: '#EF4444', dot: '#EF4444' },
  orange: { bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)', color: '#F97316', dot: '#F97316' },
  jaune:  { bg: 'rgba(245,166,35,0.1)', border: 'rgba(245,166,35,0.3)', color: '#F5A623', dot: '#F5A623' },
}

function SecretaireDashboard({ user }: { user: any }) {
  const prenom = user?.user_metadata?.prenom || user?.user_metadata?.name?.split(' ')[0] || 'Secrétaire'
  const [dateStr, setDateStr] = useState('')
  useEffect(() => {
    setDateStr(new Date().toLocaleDateString('fr-CH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }))
  }, [])

  const { data: stats, isLoading } = useQuery<SecStats>({
    queryKey: ['secretariat-dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/secretariat/dashboard-stats')
      if (!res.ok) throw new Error('Erreur stats')
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const hasAlertes = stats && (stats.permis_urgents > 0 || stats.permis_surveillance > 0 || stats.accidents_en_cours > 0)

  return (
    <div className="d-page">

      {/* ── Header ── */}
      <motion.div className="d-page-header" custom={0} variants={fadeUp} initial="hidden" animate="show">
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardList size={24} color="var(--primary)" />
            Bonjour, {prenom} 👋
          </h1>
          {dateStr && <p className="d-page-sub" style={{ textTransform: 'capitalize' }}>{dateStr}</p>}
        </div>
      </motion.div>

      {/* ── Alertes urgentes ── */}
      {hasAlertes && (
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show"
          style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {stats!.permis_urgents > 0 && (
            <Link href="/secretariat?tab=candidats&filtre=permis_urgent" style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.4)', cursor: 'pointer' }}>
                <AlertTriangle size={15} color="#EF4444" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#EF4444' }}>{stats!.permis_urgents} permis urgent{stats!.permis_urgents > 1 ? 's' : ''}</span>
              </div>
            </Link>
          )}
          {stats!.permis_surveillance > 0 && (
            <Link href="/secretariat?tab=candidats&filtre=permis_surveillance" style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: 'rgba(245,166,35,0.1)', border: '1.5px solid rgba(245,166,35,0.4)', cursor: 'pointer' }}>
                <Clock size={15} color="#F5A623" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F5A623' }}>{stats!.permis_surveillance} permis à renouveler</span>
              </div>
            </Link>
          )}
          {stats!.accidents_en_cours > 0 && (
            <Link href="/secretariat?tab=accidents&filtre=en_cours" style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: 'rgba(249,115,22,0.1)', border: '1.5px solid rgba(249,115,22,0.4)', cursor: 'pointer' }}>
                <Shield size={15} color="#F97316" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F97316' }}>{stats!.accidents_en_cours} sinistre{stats!.accidents_en_cours > 1 ? 's' : ''} en cours</span>
              </div>
            </Link>
          )}
        </motion.div>
      )}

      {/* ── 4 KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Candidats actifs',       value: stats?.candidats_actifs    ?? '—', emoji: '👥', kpiClass: 'kpi-yellow', href: '/secretariat?tab=candidats' },
          { label: 'Permis urgents (<30j)',   value: stats?.permis_urgents      ?? '—', emoji: '🔴', kpiClass: 'kpi-red',    href: '/secretariat?tab=candidats&filtre=permis_urgent' },
          { label: 'Permis à renouveler (<90j)', value: stats?.permis_surveillance ?? '—', emoji: '🟡', kpiClass: 'kpi-orange', href: '/secretariat?tab=candidats&filtre=permis_surveillance' },
          { label: 'Sinistres en cours',      value: stats?.accidents_en_cours  ?? '—', emoji: '🏥', kpiClass: 'kpi-violet', href: '/secretariat?tab=accidents&filtre=en_cours' },
        ].map((kpi, i) => (
          <motion.div key={i} custom={i} variants={kpiVariants} initial="hidden" animate="show">
            <Link href={kpi.href} style={{ textDecoration: 'none' }}>
              <motion.div
                className={`neo-kpi ${kpi.kpiClass || ''}`}
                whileHover={{ y: -4, boxShadow: '0 10px 28px rgba(0,0,0,0.12)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                style={{ cursor: 'pointer' }}
              >
                <div className="neo-kpi-icon"><span style={{ fontSize: 17 }}>{kpi.emoji}</span></div>
                <div className="neo-kpi-value">
                  {isLoading ? '—' : typeof kpi.value === 'number'
                    ? <NumberTicker value={kpi.value} delay={0.2 + i * 0.06} />
                    : kpi.value}
                </div>
                <div className="neo-kpi-label">{kpi.label}</div>
              </motion.div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ── Grille principale ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

        {/* ── À traiter aujourd'hui ── */}
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="show">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>📋 Les plus urgents à traiter</h2>
            <Link href="/secretariat" style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Voir tout →</Link>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32, color: 'var(--muted)' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : !stats?.a_traiter?.length ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)' }}>
              <CheckCircle2 size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Tout est à jour ✅</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Aucune action urgente</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.a_traiter.map((item, i) => {
                const cfg = URGENCE_CFG[item.urgence]
                const ini = `${(item.prenom || '')[0] || ''}${(item.nom || '')[0] || ''}`.toUpperCase() || '?'
                const tel = item.tel?.replace(/[^+\d]/g, '') || ''
                return (
                  <motion.div key={i} custom={i} variants={fadeUp} initial="hidden" animate="show"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: cfg.bg, border: `1.5px solid ${cfg.border}` }}>
                    {/* Avatar */}
                    <div style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 10, overflow: 'hidden', background: 'var(--secondary)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--muted)', position: 'relative' }}>
                      <span>{ini}</span>
                      {item.photo_url && item.photo_url !== 'checked' && (
                        <img src={item.photo_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Link href={item.candidat_id ? `/candidats/${item.candidat_id}` : `/secretariat?tab=candidats`}
                          style={{ color: 'var(--foreground)', textDecoration: 'none' }}
                          title={item.candidat_id ? 'Voir fiche candidat' : 'Voir dans le secrétariat'}
                          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
                          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
                        >{item.prenom} {item.nom}</Link>
                      </div>
                      <div style={{ fontSize: 12, color: cfg.color, fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                        {item.raison}
                      </div>
                    </div>
                    {/* Actions rapides */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {tel && (
                        <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D166', textDecoration: 'none' }}
                          title="WhatsApp"><WaIcon size={13} /></a>
                      )}
                      {item.email && (
                        <a href={`mailto:${item.email}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818CF8', textDecoration: 'none' }}
                          title="Email"><Mail size={13} /></a>
                      )}
                      <Link href={
                          item.candidat_id ? `/candidats/${item.candidat_id}`
                          : item.type === 'permis' ? `/secretariat?tab=candidats&filtre=permis_urgent`
                          : item.type === 'accident' ? `/secretariat?tab=accidents&filtre=en_cours`
                          : `/secretariat?tab=candidats&filtre=docs_manquants`
                        }
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--muted)', textDecoration: 'none' }}
                        title="Voir fiche candidat"><ArrowRight size={13} /></Link>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>

        {/* ── Colonne droite ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Accès rapides */}
          <motion.div custom={5} variants={fadeUp} initial="hidden" animate="show">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12 }}>⚡ Accès rapides</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Déclarer un sinistre', icon: Shield,      bg: 'rgba(249,115,22,0.12)', color: '#F97316',        href: '/secretariat?tab=accidents&action=new' },
              ].map(({ label, icon: Icon, bg, color, href }, i) => (
                <Link key={i} href={href} style={{ textDecoration: 'none' }}>
                  <motion.div whileHover={{ x: 3 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--surface)', border: '1.5px solid var(--border)', cursor: 'pointer' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={15} color={color} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{label}</span>
                    <ArrowRight size={13} color="var(--muted)" style={{ marginLeft: 'auto' }} />
                  </motion.div>
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Activité récente */}
          <motion.div custom={6} variants={fadeUp} initial="hidden" animate="show">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12 }}>🕐 Activité récente</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isLoading ? (
                <div style={{ color: 'var(--muted)', fontSize: 12, padding: 8 }}>Chargement…</div>
              ) : !stats?.activite_recente?.length ? (
                <div style={{ color: 'var(--muted)', fontSize: 12, padding: 8 }}>Aucune activité récente</div>
              ) : stats.activite_recente.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1.5px solid var(--border)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ClipboardList size={13} color="var(--muted)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nom}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{a.action}</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, fontWeight: 500, whiteSpace: 'nowrap' }}>{tempsRelatifSec(a.date)}</div>
                </div>
              ))}
            </div>
          </motion.div>

        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
