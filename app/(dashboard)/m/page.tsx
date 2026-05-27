'use client'
// TalentFlow Mobile /m — Accueil (v2.9.72)
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Users, FileSignature, TrendingUp, FileText, Plus } from 'lucide-react'
import MHeader from './_components/MHeader'

interface SignCounts { all?: number; in_progress?: number; completed?: number; draft?: number }

export default function MobileHomePage() {
  const { data: signCounts } = useQuery<SignCounts>({
    queryKey: ['m', 'sign-counts'],
    queryFn: async () => {
      const r = await fetch('/api/sign/envelopes/counts', { credentials: 'include' })
      if (!r.ok) return {}
      return r.json()
    },
    staleTime: 60_000,
  })

  const { data: candidatsTotal } = useQuery<number>({
    queryKey: ['m', 'candidats-count'],
    queryFn: async () => {
      const r = await fetch('/api/candidats?per_page=1', { credentials: 'include' })
      if (!r.ok) return 0
      const j = await r.json()
      return Number(j?.total ?? 0)
    },
    staleTime: 5 * 60_000,
  })

  const { data: missions } = useQuery<{ items: unknown[] }>({
    queryKey: ['m', 'missions-list'],
    queryFn: async () => {
      const r = await fetch('/api/missions', { credentials: 'include' })
      if (!r.ok) return { items: [] }
      const j = await r.json()
      if (Array.isArray(j)) return { items: j }
      return { items: j?.missions || j?.items || [] }
    },
    staleTime: 60_000,
  })

  return (
    <>
      <MHeader title="TalentFlow" action={
        <Link href="/m/sign/new" className="m-header-action" aria-label="Nouvelle signature">
          <Plus size={16} /> Sign
        </Link>
      } />
      <div className="m-content">
        <div className="m-kpi-row">
          <div className="m-kpi">
            <div className="m-kpi-val">{signCounts?.in_progress ?? '—'}</div>
            <div className="m-kpi-lbl">Sign en cours</div>
          </div>
          <div className="m-kpi">
            <div className="m-kpi-val">{candidatsTotal ?? '—'}</div>
            <div className="m-kpi-lbl">Candidats</div>
          </div>
        </div>

        <div className="m-section-title">Modules</div>
        <div className="m-tile-grid">
          <Link href="/m/candidats" className="m-tile">
            <div className="m-tile-icon"><Users size={20} /></div>
            <div className="m-tile-label">Candidats</div>
            <div className="m-tile-meta">{candidatsTotal != null ? `${candidatsTotal} fiches` : 'Base candidats'}</div>
          </Link>
          <Link href="/m/sign" className="m-tile">
            <div className="m-tile-icon"><FileSignature size={20} /></div>
            <div className="m-tile-label">Signatures</div>
            <div className="m-tile-meta">{signCounts?.in_progress ?? 0} en attente</div>
          </Link>
          <Link href="/m/missions" className="m-tile">
            <div className="m-tile-icon"><TrendingUp size={20} /></div>
            <div className="m-tile-label">Missions</div>
            <div className="m-tile-meta">{missions?.items?.length ?? 0} mission{(missions?.items?.length ?? 0) > 1 ? 's' : ''}</div>
          </Link>
          <Link href="/m/rapports" className="m-tile">
            <div className="m-tile-icon"><FileText size={20} /></div>
            <div className="m-tile-label">Rapports</div>
            <div className="m-tile-meta">Hebdomadaires</div>
          </Link>
        </div>

        <div className="m-section-title">Actions rapides</div>
        <Link href="/m/sign/new" className="m-card">
          <div className="m-avatar"><Plus size={20} /></div>
          <div className="m-card-body">
            <div className="m-card-title">Envoyer un document à signer</div>
            <div className="m-card-sub">PDF + destinataires</div>
          </div>
        </Link>
        <Link href="/m/sign?status=in_progress" className="m-card">
          <div className="m-avatar"><FileSignature size={20} /></div>
          <div className="m-card-body">
            <div className="m-card-title">Voir signatures en attente</div>
            <div className="m-card-sub">{signCounts?.in_progress ?? 0} enveloppe{(signCounts?.in_progress ?? 0) > 1 ? 's' : ''} en cours</div>
          </div>
        </Link>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--m-text-soft)' }}>
          <Link href="/dashboard" style={{ color: 'inherit' }}>Voir version desktop →</Link>
        </div>
      </div>
    </>
  )
}
