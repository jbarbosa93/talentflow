'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, ArrowRight, Sparkles, Calendar, MapPin, Upload } from 'lucide-react'
import Link from 'next/link'
import NumberTicker from '@/components/magicui/number-ticker'
import BlurFade from '@/components/magicui/blur-fade'
import dynamic from 'next/dynamic'

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
    { label: 'Candidats',      value: stats?.totalCandidats ?? '—', emoji: '👤', active: true, href: '/candidats' },
    { label: 'Commandes actives', value: stats?.offresActives  ?? '—', emoji: '📋', href: '/offres' },
    { label: 'En entretien',   value: stats?.enEntretien    ?? '—', emoji: '🗣️', href: '/candidats?statut=entretien' },
    { label: 'Placés',         value: stats?.places         ?? '—', emoji: '✅', href: '/candidats?statut=place' },
  ]

  const initiales = (c: any) => {
    const n = (c.nom || '').trim(); const p = (c.prenom || '').trim()
    return `${p[0] || ''}${n[0] || ''}`.toUpperCase() || '?'
  }

  return (
    <div className="d-page">

      {/* ── Header ── */}
      <BlurFade delay={0} inView>
        <div className="d-page-header">
          <div>
            <h1 className="d-page-title">Bonjour, {greeting} 👋</h1>
            <p className="d-page-sub">Voici un aperçu de votre activité de recrutement</p>
          </div>
        </div>
      </BlurFade>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {kpis.map((kpi, i) => (
          <BlurFade key={i} delay={0.1 + i * 0.05} inView>
            <Link href={kpi.href} style={{ textDecoration: 'none', display: 'block' }}>
              <div className={`neo-kpi${kpi.active ? ' active' : ''}`} style={{ cursor: 'pointer' }}>
                <span style={{ fontSize: 28 }}>{kpi.emoji}</span>
                <div className="neo-kpi-value">
                  {typeof kpi.value === 'number'
                    ? <NumberTicker value={kpi.value} delay={0.2 + i * 0.05} />
                    : kpi.value}
                </div>
                <div className="neo-kpi-label">{kpi.label}</div>
              </div>
            </Link>
          </BlurFade>
        ))}
      </div>

      {/* ── Two column: quick actions + recent candidates ── */}
      <BlurFade delay={0.45} inView>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>

        {/* Quick actions */}
        <div className="neo-card-soft" style={{ padding: 24 }}>
          <h2 className="neo-section-title">Actions rapides</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/candidats/a-traiter', label: 'Importer Candidat/s', icon: Upload },
              { href: '/offres',     label: 'Nouvelle commande',        icon: Plus },
              { href: '/matching',   label: 'Matching IA',               icon: Sparkles },
            ].map(a => {
              const Icon = a.icon
              return (
                <Link key={a.href} href={a.href} className="neo-candidate-card" style={{ padding: '12px 16px', borderRadius: 10, justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon style={{ width: 15, height: 15, color: 'var(--ink2)' }} />
                    {a.label}
                  </span>
                  <ArrowRight style={{ width: 13, height: 13, color: 'var(--ink2)' }} />
                </Link>
              )
            })}
          </div>
        </div>

        {/* Recent candidates */}
        <div className="neo-card-soft" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 className="neo-section-title" style={{ marginBottom: 0 }}>Candidats récents</h2>
            <Link href="/candidats" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Voir tous <ArrowRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>
          {stats?.recentCandidats?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.recentCandidats.map((c: any) => (
                <Link key={c.id} href={`/candidats/${c.id}`} className="neo-candidate-card">
                  <div className="neo-avatar">{initiales(c)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', lineHeight: 1 }}>
                      {c.prenom} {c.nom}
                    </div>
                    {c.titre_poste && (
                      <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.titre_poste}
                      </div>
                    )}
                  </div>
                  <span className={ETAPE_BADGE[c.statut_pipeline] || 'neo-badge neo-badge-gray'}>
                    {ETAPE_LABELS[c.statut_pipeline] || c.statut_pipeline}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="neo-empty" style={{ padding: '40px 24px', border: '2px dashed #E8E0C8' }}>
              <div className="neo-empty-icon">🎯</div>
              <div className="neo-empty-title">Aucun candidat</div>
              <div className="neo-empty-sub">Importez un CV pour commencer</div>
            </div>
          )}
        </div>
      </div>
      </BlurFade>

      {/* ── Carte des candidats ── */}
      <BlurFade delay={0.55} inView>
      <div className="neo-card-soft" style={{ padding: 24, marginTop: 20 }}>
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
      </div>
      </BlurFade>

    </div>
  )
}
