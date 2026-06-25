'use client'

// TalentFlow Sign — Accueil candidat (tableau de bord). v2.10.36
// Distinct de « Rapports » (= la page de saisie). Ici : salutation, mission en
// cours, résumé des rapports + accès rapides. Données du candidat connecté.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Calendar, Phone, Briefcase, Building2 } from 'lucide-react'
import CandidatWelcomeHeader from '@/components/report/CandidatWelcomeHeader'
import ContactAgenceButton from '@/components/report/ContactAgenceButton'
import AppComingSoonBanner from '@/components/report/AppComingSoonBanner'
import RecapPeriode from '@/components/report/RecapPeriode'
import { fetchPortalSession } from '@/lib/report/session-fetch'

interface Company { name: string; contact_name: string; contact_phone: string; start: string | null; end: string | null }
interface Data {
  slug: string
  reports: { count: number; last: null | { status: string; week_start: string | null; week_end: string | null } }
  companies: Company[]
  profile: {
    prenom: string; nom: string; titre_poste: string; photo_url: string | null
    mission: null | { entreprise: string; metier: string | null; date_debut: string | null; date_fin: string | null; active: boolean }
  }
}

function fmtFull(d?: string | null) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' }) } catch { return d }
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
  const [showRecap, setShowRecap] = useState(false)

  useEffect(() => {
    fetchPortalSession('/api/portal/profile')
      .then(r => { if (r.status === 401) { router.replace('/report/login'); return null } return r.json() })
      .then(j => { if (j?.profile) setD(j) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9A958A' }}><Loader2 className="animate-spin" /></div>

  // v2.13.26 — Pas de candidat/mission lié (ex. nouveau compte) : on n'affiche plus
  // « Indisponible » mais un accueil d'attente clair + accès au contact agence.
  if (!d) return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 18px 90px' }}>
      <div style={{ marginBottom: 16 }}>
        <CandidatWelcomeHeader prenom="" />
      </div>
      <div className="tf-fadeup" style={{ marginBottom: 14 }}>
        <AppComingSoonBanner />
      </div>
      <div className="tf-fadeup" style={{ background: '#FAFAF7', border: '1px solid #ECEAE3', borderRadius: 16, padding: '20px 18px', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>👋</div>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1C1A14', marginBottom: 8 }}>Bienvenue sur TalentFlow</div>
        <div style={{ fontSize: 13.5, color: '#6B6457', lineHeight: 1.55 }}>
          Aucune mission active pour le moment. Dès que ton agence te place en mission, tu retrouveras ici ton entreprise,
          tes dates et tes rapports d&apos;heures à remplir.
        </div>
      </div>
      <ContactAgenceButton />
    </div>
  )

  const last = d.reports.last
  const st = last ? (STATUS_LABEL[last.status] || { txt: last.status, bg: '#F1EFE9', fg: '#6B6457' }) : null
  const today = new Date().toISOString().slice(0, 10)

  // Source mission : report_link_clients (riche : contact + dates). Repli sur la
  // mission de la table missions si aucune entreprise renseignée.
  const m = d.profile.mission
  const missionCards: Company[] = d.companies && d.companies.length > 0
    ? d.companies
    : (m ? [{ name: m.entreprise, contact_name: '', contact_phone: '', start: m.date_debut, end: m.date_fin }] : [])

  const InfoRow = ({ icon: Icon, children }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0' }}>
      <Icon size={15} color="#9A958A" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, color: '#3F3A30' }}>{children}</span>
    </div>
  )

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 18px 90px' }}>
      {/* Logo L-Agence + salutation + météo (composant existant) */}
      <div style={{ marginBottom: 16 }}>
        <CandidatWelcomeHeader prenom={d.profile.prenom || ''} />
      </div>
      {d.profile.titre_poste && <p style={{ fontSize: 14, color: '#9A958A', margin: '-6px 0 14px 2px' }}>{d.profile.titre_poste}</p>}

      {/* Bandeau « Bientôt l'application » (refermable) */}
      <div className="tf-fadeup" style={{ marginBottom: 14 }}>
        <AppComingSoonBanner />
      </div>

      {/* Ma mission — infos rapides (entreprise, dates, contact) */}
      {missionCards.map((co, i) => {
        const active = !co.end || co.end >= today
        return (
          <div key={i} className="tf-fadeup" style={{ background: active ? '#F0FDF4' : '#FAFAF7', border: `1px solid ${active ? '#BBF7D0' : '#ECEAE3'}`, borderRadius: 16, padding: '15px 17px', marginBottom: 14, animationDelay: `${0.05 + i * 0.05}s` }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: active ? '#15803D' : '#9A958A', marginBottom: 7 }}>
              {active ? '● Mission en cours' : 'Mission terminée'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Building2 size={17} color="#1C1A14" />
              <span style={{ fontSize: 17, fontWeight: 800, color: '#1C1A14' }}>{co.name || 'Entreprise'}</span>
            </div>
            {m?.metier && i === 0 && <InfoRow icon={Briefcase}>{m.metier}</InfoRow>}
            {co.start && <InfoRow icon={Calendar}>Depuis le <strong>{fmtFull(co.start)}</strong>{co.end ? ` — jusqu'au ${fmtFull(co.end)}` : ''}</InfoRow>}
            {co.contact_phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0' }}>
                <Phone size={15} color="#9A958A" style={{ flexShrink: 0 }} />
                <a href={`tel:${co.contact_phone.replace(/\s/g, '')}`} style={{ fontSize: 13.5, color: '#1D4ED8', fontWeight: 600, textDecoration: 'none' }}>
                  {co.contact_name ? `${co.contact_name} · ` : ''}{co.contact_phone}
                </a>
              </div>
            )}
          </div>
        )
      })}

      {/* Résumé rapports */}
      <div className="tf-fadeup" style={{ display: 'flex', gap: 12, marginBottom: 20, animationDelay: '.1s' }}>
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

      {/* Récapitulatif par période (heures par entreprise, repas…) */}
      {d.slug && (
        <div className="tf-fadeup" style={{ marginTop: 4, animationDelay: '.15s' }}>
          <button onClick={() => setShowRecap(v => !v)} className="tf-press" style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: 'none', background: '#1C1A14', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
            📊 {showRecap ? 'Masquer le récapitulatif' : 'Récapitulatif (heures, repas…)'}
          </button>
          {showRecap && (
            <div style={{ marginTop: 14 }}>
              <RecapPeriode slug={d.slug} scope="candidate" />
            </div>
          )}
        </div>
      )}

      {/* Bouton flottant Contacter L-Agence (au-dessus de la barre) */}
      <ContactAgenceButton />
    </div>
  )
}
