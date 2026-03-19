'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Upload, Plus, ArrowRight, Sparkles, Calendar } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import UploadCV from '@/components/UploadCV'
import { useQueryClient } from '@tanstack/react-query'

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
  const [showUpload, setShowUpload] = useState(false)
  const queryClient = useQueryClient()
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
    ? `${prenom} ${nom[0] ? nom[0] + '.' : ''}`.trim()
    : 'Recruteur'

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

  const { data: pipelineSummary } = useQuery({
    queryKey: ['pipeline-summary'],
    queryFn: async () => {
      const etapes = ['nouveau', 'contacte', 'entretien', 'place']
      const results = await Promise.all(
        etapes.map(e => supabase.from('candidats').select('id', { count: 'exact', head: true }).eq('statut_pipeline', e as any))
      )
      return etapes.map((e, i) => ({ etape: e, count: results[i].count ?? 0 }))
    },
    staleTime: 30_000,
  })

  const total = Math.max(pipelineSummary?.reduce((a, b) => a + b.count, 0) || 1, 1)

  const kpis = [
    { label: 'Candidats',      value: stats?.totalCandidats ?? '—', emoji: '👤', active: true },
    { label: 'Offres actives', value: stats?.offresActives  ?? '—', emoji: '📋' },
    { label: 'En entretien',   value: stats?.enEntretien    ?? '—', emoji: '🗣️' },
    { label: 'Placés',         value: stats?.places         ?? '—', emoji: '✅' },
  ]

  const initiales = (c: any) => {
    const n = (c.nom || '').trim(); const p = (c.prenom || '').trim()
    return `${p[0] || ''}${n[0] || ''}`.toUpperCase() || '?'
  }

  return (
    <div className="d-page">

      {/* ── Header ── */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title">Bonjour, {greeting} 👋</h1>
          <p className="d-page-sub">Voici un aperçu de votre activité de recrutement</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="neo-btn">
          <Upload style={{ width: 15, height: 15 }} />
          Importer un CV
        </button>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {kpis.map((kpi, i) => (
          <div key={i} className={`neo-kpi${kpi.active ? ' active' : ''}`}>
            <span style={{ fontSize: 28 }}>{kpi.emoji}</span>
            <div className="neo-kpi-value">{kpi.value}</div>
            <div className="neo-kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* ── Two column: pipeline + feature ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* Pipeline funnel */}
        <div className="neo-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 className="neo-section-title" style={{ marginBottom: 0 }}>Entonnoir pipeline</h2>
            <Link href="/pipeline" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textDecoration: 'none' }}>
              Voir <ArrowRight style={{ width: 14, height: 14 }} />
            </Link>
          </div>
          {(['nouveau', 'contacte', 'entretien', 'place'] as const).map(etape => {
            const item = pipelineSummary?.find(p => p.etape === etape)
            const count = item?.count ?? 0
            const pct = Math.round((count / total) * 100)
            return (
              <div key={etape} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    {ETAPE_LABELS[etape]}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>{count}</span>
                </div>
                <div className="neo-progress-track">
                  <div className="neo-progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* IA feature card */}
        <div className="neo-card-yellow" style={{ padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="neo-tag" style={{ background: 'var(--ink)', color: 'var(--y)', borderColor: 'var(--ink)', marginBottom: 16 }}>IA ACTIVÉE</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2, marginBottom: 12 }}>
              Importez vos CVs<br />automatiquement
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.7 }}>
              Connectez Microsoft 365 — chaque CV reçu par email est analysé et ajouté à TalentFlow en quelques secondes.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowUpload(true)} className="neo-btn neo-btn-sm" style={{ borderRadius: 10, padding: '9px 16px' }}>
              <Upload style={{ width: 14, height: 14 }} /> Importer un CV
            </button>
            <Link href="/integrations" className="neo-btn-yellow neo-btn-sm" style={{ borderRadius: 10, padding: '9px 16px', background: 'var(--ink)', color: 'var(--y)', border: '2px solid var(--ink)', boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}>
              <Sparkles style={{ width: 14, height: 14 }} /> Connecter Microsoft
            </Link>
          </div>
        </div>
      </div>

      {/* ── Two column: quick actions + recent candidates ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>

        {/* Quick actions */}
        <div className="neo-card-soft" style={{ padding: 24 }}>
          <h2 className="neo-section-title">Actions rapides</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/offres',     label: 'Nouvelle offre d\'emploi', icon: Plus },
              { href: '/entretiens', label: 'Planifier un entretien',    icon: Calendar },
              { href: '/pipeline',   label: 'Voir le pipeline',          icon: ArrowRight },
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

      {/* Upload dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>
              Importer un CV
            </DialogTitle>
          </DialogHeader>
          <UploadCV onSuccess={() => {
            setShowUpload(false)
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
          }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
