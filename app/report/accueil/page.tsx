'use client'

// TalentFlow Sign — Accueil candidat (tableau de bord). v2.10.36
// Distinct de « Rapports » (= la page de saisie). Ici : salutation, mission en
// cours, résumé des rapports + accès rapides. Données du candidat connecté.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FileText, User, FolderOpen, ChevronRight, Plus } from 'lucide-react'
import CandidatWelcomeHeader from '@/components/report/CandidatWelcomeHeader'
import ContactAgenceButton from '@/components/report/ContactAgenceButton'

interface Data {
  slug: string
  reports: { count: number; last: null | { status: string; week_start: string | null; week_end: string | null } }
  profile: {
    prenom: string; nom: string; titre_poste: string; photo_url: string | null
    mission: null | { entreprise: string; metier: string | null; date_debut: string | null; date_fin: string | null; active: boolean }
  }
}

const STATUS_LABEL: Record<string, { txt: string; bg: string; fg: string }> = {
  draft: { txt: 'Brouillon', bg: '#FEF3C7', fg: '#B45309' },
  candidate_signed: { txt: 'En attente du client', bg: '#DBEAFE', fg: '#1D4ED8' },
  client_signed: { txt: 'Signé', bg: '#D1FAE5', fg: '#059669' },
  completed: { txt: 'Terminé', bg: '#D1FAE5', fg: '#059669' },
}
function fmtWeek(a?: string | null, b?: string | null) {
  const f = (d?: string | null) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' }) } catch { return d } }
  return a ? `${f(a)}${b ? ` → ${f(b)}` : ''}` : ''
}

export default function AccueilPage() {
  const router = useRouter()
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/portal/profile')
      .then(r => { if (r.status === 401) { router.replace('/report/login'); return null } return r.json() })
      .then(j => { if (j?.profile) setD(j) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9A958A' }}><Loader2 className="animate-spin" /></div>
  if (!d) return <div style={{ padding: 40, textAlign: 'center', color: '#9A958A' }}>Indisponible.</div>

  const home = d.slug ? `/report/${d.slug}` : '/report'
  const m = d.profile.mission
  const last = d.reports.last
  const st = last ? (STATUS_LABEL[last.status] || { txt: last.status, bg: '#F1EFE9', fg: '#6B6457' }) : null

  const Tile = ({ icon: Icon, title, sub, onClick, primary }: any) => (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
      padding: '15px 16px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
      border: primary ? 'none' : '1px solid #ECEAE3',
      background: primary ? '#EAB308' : '#fff',
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: primary ? 'rgba(0,0,0,0.12)' : '#FAFAF7' }}>
        <Icon size={19} color={primary ? '#1C1A14' : '#6B6457'} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14' }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: primary ? '#5C4A08' : '#9A958A' }}>{sub}</div>}
      </div>
      <ChevronRight size={18} color={primary ? '#1C1A14' : '#C9C3B5'} />
    </button>
  )

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 18px 90px' }}>
      {/* Logo L-Agence + salutation + météo (composant existant) */}
      <div style={{ marginBottom: 16 }}>
        <CandidatWelcomeHeader prenom={d.profile.prenom || ''} />
      </div>
      {d.profile.titre_poste && <p style={{ fontSize: 14, color: '#9A958A', margin: '-6px 0 18px 2px' }}>{d.profile.titre_poste}</p>}

      {/* Mission en cours */}
      {m && (
        <div style={{ background: m.active ? '#F0FDF4' : '#FAFAF7', border: `1px solid ${m.active ? '#BBF7D0' : '#ECEAE3'}`, borderRadius: 16, padding: '15px 17px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: m.active ? '#15803D' : '#9A958A', marginBottom: 5 }}>
            {m.active ? '● Mission en cours' : 'Dernière mission'}
          </div>
          {m.entreprise && <div style={{ fontSize: 17, fontWeight: 800, color: '#1C1A14' }}>{m.entreprise}</div>}
          {m.metier && <div style={{ fontSize: 13.5, color: '#6B6457' }}>{m.metier}</div>}
        </div>
      )}

      {/* Résumé rapports */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #ECEAE3', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#1C1A14', lineHeight: 1 }}>{d.reports.count}</div>
          <div style={{ fontSize: 12, color: '#9A958A', marginTop: 4 }}>rapport{d.reports.count > 1 ? 's' : ''} au total</div>
        </div>
        <div style={{ flex: 1.4, background: '#fff', border: '1px solid #ECEAE3', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, color: '#9A958A', marginBottom: 5 }}>Dernier rapport</div>
          {last ? (
            <>
              <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: st!.bg, color: st!.fg }}>{st!.txt}</span>
              {fmtWeek(last.week_start, last.week_end) && <div style={{ fontSize: 12, color: '#6B6457', marginTop: 5 }}>{fmtWeek(last.week_start, last.week_end)}</div>}
            </>
          ) : <div style={{ fontSize: 13, color: '#C9C3B5' }}>Aucun pour l&apos;instant</div>}
        </div>
      </div>

      {/* Accès rapides */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Tile icon={Plus} title="Nouveau rapport" sub="Saisir mes heures de la semaine" primary onClick={() => router.push(home)} />
        <Tile icon={FileText} title="Mes rapports" sub="Voir tous mes rapports" onClick={() => router.push(home)} />
        <Tile icon={User} title="Mon profil" sub="Mes infos et ma mission" onClick={() => router.push('/report/profil')} />
        <Tile icon={FolderOpen} title="Mes documents" sub="Permis, carte d'identité…" onClick={() => router.push('/report/documents')} />
      </div>

      {/* Bouton flottant Contacter L-Agence (au-dessus de la barre) */}
      <ContactAgenceButton />
    </div>
  )
}
