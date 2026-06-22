'use client'

// TalentFlow Sign — Mon profil (portail candidat). v2.10.35 — Lecture seule.
// Affiche photo + coordonnées + mission en cours (données de la fiche candidat TF,
// strictement celles du candidat connecté). Pour modifier → Paramètres (Phase 3).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin, Phone, Mail, Briefcase, Cake } from 'lucide-react'
import PortalLogoHeader from '@/components/report/PortalLogoHeader'
import { fetchPortalSession } from '@/lib/report/session-fetch'

interface Profile {
  prenom: string; nom: string; email: string; telephone: string; telephone_2: string
  localisation: string; date_naissance: string; titre_poste: string; photo_url: string | null
  mission: null | { entreprise: string; metier: string | null; date_debut: string | null; date_fin: string | null; active: boolean }
}

function fmtDate(d?: string | null) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' }) } catch { return d }
}
function age(d?: string | null) {
  if (!d) return null
  const b = new Date(d); if (isNaN(b.getTime())) return null
  const now = new Date(); let a = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--
  return a
}

export default function ProfilPage() {
  const router = useRouter()
  const [p, setP] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPortalSession('/api/portal/profile')
      .then(r => { if (r.status === 401) { router.replace('/report/login'); return null } return r.json() })
      .then(d => { if (d?.profile) setP(d.profile) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9A958A' }}><Loader2 className="animate-spin" /></div>
  if (!p) return <div style={{ padding: 40, textAlign: 'center', color: '#9A958A' }}>Profil indisponible.</div>

  const initials = `${(p.prenom[0] || '')}${(p.nom[0] || '')}`.toUpperCase() || '?'
  const a = age(p.date_naissance)

  const Row = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => value ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #F1EFE9' }}>
      <Icon size={17} color="#9A958A" style={{ flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#9A958A', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 15, color: '#1C1A14', wordBreak: 'break-word' }}>{value}</div>
      </div>
    </div>
  ) : null

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 18px 90px' }}>
      <PortalLogoHeader />
      <h1 className="tf-fadeup" style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 400, color: '#1C1A14', margin: '8px 0 20px' }}>Mon profil</h1>

      {/* En-tête photo + nom */}
      <div className="tf-fadeup" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22, animationDelay: '.05s' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#B45309', border: '2px solid #fff', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
          {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#1C1A14' }}>{p.prenom} {p.nom}</div>
          {p.titre_poste && <div style={{ fontSize: 14, color: '#6B6457' }}>{p.titre_poste}</div>}
        </div>
      </div>

      {/* Mission en cours */}
      {p.mission && (
        <div className="tf-fadeup" style={{ background: p.mission.active ? '#F0FDF4' : '#FAFAF7', border: `1px solid ${p.mission.active ? '#BBF7D0' : '#ECEAE3'}`, borderRadius: 14, padding: '14px 16px', marginBottom: 20, animationDelay: '.1s' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: p.mission.active ? '#15803D' : '#9A958A', marginBottom: 6 }}>
            {p.mission.active ? '● Mission en cours' : 'Dernière mission'}
          </div>
          {p.mission.entreprise && <div style={{ fontSize: 16, fontWeight: 700, color: '#1C1A14' }}>{p.mission.entreprise}</div>}
          {p.mission.metier && <div style={{ fontSize: 14, color: '#6B6457' }}>{p.mission.metier}</div>}
          {(p.mission.date_debut || p.mission.date_fin) && (
            <div style={{ fontSize: 12.5, color: '#9A958A', marginTop: 4 }}>
              {fmtDate(p.mission.date_debut)}{p.mission.date_fin ? ` → ${fmtDate(p.mission.date_fin)}` : ''}
            </div>
          )}
        </div>
      )}

      {/* Coordonnées */}
      <div className="tf-fadeup" style={{ background: '#fff', border: '1px solid #ECEAE3', borderRadius: 14, padding: '4px 16px 8px', animationDelay: '.15s' }}>
        <Row icon={Mail} label="E-mail" value={p.email} />
        <Row icon={Phone} label="Téléphone" value={p.telephone} />
        <Row icon={Phone} label="2e téléphone" value={p.telephone_2} />
        <Row icon={MapPin} label="Localisation" value={p.localisation} />
        <Row icon={Briefcase} label="Métier" value={p.titre_poste} />
        {p.date_naissance && <Row icon={Cake} label="Date de naissance" value={`${fmtDate(p.date_naissance)}${a != null ? ` (${a} ans)` : ''}`} />}
      </div>

      <p style={{ fontSize: 12, color: '#9A958A', textAlign: 'center', margin: '16px 0 0', lineHeight: 1.5 }}>
        Une erreur dans tes informations ? Contacte L-Agence ou modifie tes coordonnées dans Paramètres.
      </p>
    </div>
  )
}
