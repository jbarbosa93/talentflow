'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, ArrowRight, Sparkles, Calendar, MapPin, Upload } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import dynamic from 'next/dynamic'
import NumberTicker from '@/components/magicui/number-ticker'

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

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [candidats, offres, entretiens, places, recent] = await Promise.all([
        supabase.from('candidats').select('id', { count: 'exact', head: true }),
        supabase.from('offres').select('id', { count: 'exact', head: true }).eq('statut', 'active'),
        supabase.from('candidats').select('id', { count: 'exact', head: true }).eq('statut_pipeline', 'entretien' as any),
        supabase.from('candidats').select('id', { count: 'exact', head: true }).eq('statut_pipeline', 'place' as any),
        supabase.from('candidats').select('id, nom, prenom, titre_poste, statut_pipeline, created_at').order('created_at', { ascending: false }).limit(5),
      ])
      return {
        totalCandidats: candidats.count ?? 0,
        offresActives:  offres.count ?? 0,
        enEntretien:    entretiens.count ?? 0,
        places:         places.count ?? 0,
        recentCandidats: (recent.data || []) as any[],
      }
    },
    staleTime: 30_000,
  })

  const kpis = [
    { label: 'Candidats',         value: stats?.totalCandidats ?? '—', emoji: '👤', kpiClass: 'kpi-yellow',  href: '/candidats' },
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
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

        {/* Recent candidates */}
        <div className="neo-card-soft" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 className="neo-section-title" style={{ marginBottom: 0 }}>Candidats récents</h2>
            <Link href="/candidats" style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Voir tous <ArrowRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>
          {stats?.recentCandidats?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.recentCandidats.map((c: any, i: number) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.06, type: 'spring', stiffness: 300, damping: 24 }}
                >
                  <Link href={`/candidats/${c.id}`} className="neo-candidate-card">
                    <div className="neo-avatar">{initiales(c)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', lineHeight: 1 }}>
                        {c.prenom} {c.nom}
                      </div>
                      {c.titre_poste && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.titre_poste}
                        </div>
                      )}
                      {c.created_at && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3, opacity: 0.7 }}>
                          <Clock size={9} />
                          {new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          {' '}
                          {new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                    <span className={ETAPE_BADGE[c.statut_pipeline] || 'neo-badge neo-badge-gray'}>
                      {ETAPE_LABELS[c.statut_pipeline] || c.statut_pipeline}
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="neo-empty" style={{ padding: '40px 24px', border: '2px dashed var(--border)' }}>
              <div className="neo-empty-icon">🎯</div>
              <div className="neo-empty-title">Aucun candidat</div>
              <div className="neo-empty-sub">Importez un CV pour commencer</div>
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
