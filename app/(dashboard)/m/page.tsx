'use client'
// TalentFlow Mobile /m — Accueil (v2.9.72)
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Users, Building2, TrendingUp, FileText, CircleUser } from 'lucide-react'
import MHeader from './_components/MHeader'
import { computeEtpSemaine } from '@/lib/missions-etp'

export default function MobileHomePage() {
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

  const { data: clientsTotal } = useQuery<number>({
    queryKey: ['m', 'clients-count'],
    queryFn: async () => {
      const r = await fetch('/api/clients?per_page=1', { credentials: 'include' })
      if (!r.ok) return 0
      const j = await r.json()
      return Number(j?.total ?? (Array.isArray(j?.clients) ? j.clients.length : 0))
    },
    staleTime: 5 * 60_000,
  })

  const { data: missionStats } = useQuery<{ etp: number; count: number }>({
    queryKey: ['m', 'missions-stats'],
    queryFn: async () => {
      const r = await fetch('/api/missions', { credentials: 'include' })
      if (!r.ok) return { etp: 0, count: 0 }
      const j = await r.json()
      const items = Array.isArray(j) ? j : (j?.missions || j?.items || [])
      // ETP prorata semaine en cours (même calcul que le web) — hors absences/vacances/arrêts
      const etp = computeEtpSemaine(items)
      const enCours = items.filter((m: any) => m?.statut === 'en_cours').length
      return { etp, count: enCours }
    },
    staleTime: 60_000,
  })

  const etp = missionStats?.etp ?? 0
  // Affichage ETP : entier si rond, sinon 1 décimale (ex 3.5)
  const etpLabel = Number.isInteger(etp) ? String(etp) : etp.toFixed(1)

  return (
    <>
      <MHeader title="TalentFlow" action={
        <Link href="/m/profil" className="m-header-action ghost" aria-label="Profil">
          <CircleUser size={24} />
        </Link>
      } />
      <div className="m-content">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 16px' }}>
          <img src="/logo-agence-officiel-noir.png" alt="L-Agence" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
        </div>
        <div className="m-kpi-row">
          <div className="m-kpi">
            <div className="m-kpi-val">{candidatsTotal ?? '—'}</div>
            <div className="m-kpi-lbl">Candidats</div>
          </div>
          <div className="m-kpi">
            <div className="m-kpi-val">{etp > 0 ? etpLabel : '—'}</div>
            <div className="m-kpi-lbl">ETP en cours</div>
          </div>
        </div>

        <div className="m-section-title">Modules</div>
        <div className="m-tile-grid">
          <Link href="/m/candidats" className="m-tile">
            <div className="m-tile-icon"><Users size={20} /></div>
            <div className="m-tile-label">Candidats</div>
            <div className="m-tile-meta">{candidatsTotal != null ? `${candidatsTotal} fiches` : 'Base candidats'}</div>
          </Link>
          <Link href="/m/clients" className="m-tile">
            <div className="m-tile-icon"><Building2 size={20} /></div>
            <div className="m-tile-label">Clients</div>
            <div className="m-tile-meta">{clientsTotal ? `${clientsTotal} entreprises` : 'Entreprises'}</div>
          </Link>
          <Link href="/m/missions" className="m-tile">
            <div className="m-tile-icon"><TrendingUp size={20} /></div>
            <div className="m-tile-label">Missions</div>
            <div className="m-tile-meta">{etp > 0 ? `${etpLabel} ETP` : 'En cours'}</div>
          </Link>
          <Link href="/m/rapports" className="m-tile">
            <div className="m-tile-icon"><FileText size={20} /></div>
            <div className="m-tile-label">Rapports</div>
            <div className="m-tile-meta">Hebdomadaires</div>
          </Link>
        </div>
      </div>
    </>
  )
}
