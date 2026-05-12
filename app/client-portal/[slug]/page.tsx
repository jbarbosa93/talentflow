'use client'

// TalentFlow Portail Client public — Lecture seule, lien partagé par L-Agence
// v2.7.1 — Refonte design v2 : ClientLogo header, cards animées, contact rapide,
// permis chauffeur en évidence, modal documents complet.

import { use, useEffect, useState } from 'react'
import {
  Loader2, AlertTriangle, Phone, ShieldCheck, Calendar, FileText,
  MessageCircle, Mail, MapPin, Cake, AlertCircle, CheckCircle2, Users, ClipboardList, FileClock,
} from 'lucide-react'
import { formatExpiryDate } from '@/lib/compliance/document-status'
import type { CandidatDocumentWithStatus } from '@/lib/compliance/types'
import PortalDocumentsModal from '@/components/portal/PortalDocumentsModal'
import ClientLogo from '@/components/ClientLogo'
import RapportsTab from '@/components/portal/RapportsTab'

type TabKey = 'collaborateurs' | 'rapports'

interface PortalCandidat {
  id: string
  prenom: string | null
  nom: string | null
  age: number | null
  metier_affiche: string | null
  photo_url: string | null
  is_driver: boolean
  telephone: string | null
  email: string | null
  localisation: string | null
  driver_highlights: { name: string; expiry_date: string | null; status: string }[]
  mission: { date_debut: string; date_fin: string | null; metier_display: string | null; metier: string | null } | null
  legacy_documents: { name: string; url: string; type?: string | null }[]
  compliance_documents: CandidatDocumentWithStatus[]
}

interface PortalData {
  portal: { id: string; name: string; slug: string }
  client: { id: string; nom_entreprise: string; site_web: string | null; ville: string | null } | null
  candidats: PortalCandidat[]
}

export default function ClientPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [data, setData] = useState<PortalData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'revoked' | 'error'>('loading')
  const [openDocsFor, setOpenDocsFor] = useState<string | null>(null)
  // v2.7.2 — Onglets : lecture initiale du ?tab=... + sync URL sur changement
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'collaborateurs'
    const sp = new URLSearchParams(window.location.search)
    return sp.get('tab') === 'rapports' ? 'rapports' : 'collaborateurs'
  })
  // Badge count des rapports à valider (fetch léger en arrière-plan)
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  const switchTab = (next: TabKey) => {
    setTab(next)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (next === 'rapports') url.searchParams.set('tab', 'rapports')
      else url.searchParams.delete('tab')
      window.history.replaceState({}, '', url.toString())
    }
  }

  // Fetch count rapports en attente (pour le badge sur l'onglet)
  useEffect(() => {
    if (state !== 'ok') return
    fetch(`/api/client-portal/${slug}/rapports?status=pending`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.counts) setPendingCount(d.counts.pending) })
      .catch(() => {})
  }, [slug, state])

  useEffect(() => {
    fetch(`/api/client-portal/${slug}`)
      .then(async r => {
        if (r.status === 404) { setState('invalid'); return null }
        if (r.status === 410) { setState('revoked'); return null }
        if (!r.ok) { setState('error'); return null }
        return r.json()
      })
      .then((d: PortalData | null) => {
        if (d) { setData(d); setState('ok') }
      })
      .catch(() => setState('error'))
  }, [slug])

  if (state === 'loading') {
    return (
      <CenteredCard>
        <style>{`@keyframes tfFadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }`}</style>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#EAB308' }} />
        <p style={{ marginTop: 16, fontSize: 14, color: '#6B7280', animation: 'tfFadeIn 0.6s ease-out 0.25s backwards' }}>
          Chargement du portail…
        </p>
      </CenteredCard>
    )
  }
  if (state === 'invalid') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEE2E2', '#DC2626')}><AlertTriangle size={28} /></div>
        <h1 style={titleStyle}>Lien invalide</h1>
        <p style={textStyle}>Ce lien n&apos;existe pas. Contactez L-Agence SA.</p>
      </CenteredCard>
    )
  }
  if (state === 'revoked') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEF3C7', '#A16207')}><AlertTriangle size={28} /></div>
        <h1 style={titleStyle}>Lien révoqué</h1>
        <p style={textStyle}>Ce portail a été désactivé. Contactez L-Agence SA pour obtenir un nouveau lien.</p>
      </CenteredCard>
    )
  }
  if (state === 'error' || !data) {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEE2E2', '#DC2626')}><AlertTriangle size={28} /></div>
        <h1 style={titleStyle}>Erreur de chargement</h1>
        <p style={textStyle}>Réessayez ou contactez L-Agence SA.</p>
      </CenteredCard>
    )
  }

  const openCandidat = openDocsFor ? data.candidats.find(c => c.id === openDocsFor) : null

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF7', paddingBottom: 80 }}>
      {/* Animations CSS inline */}
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.65 } }
        .portal-card { animation: fadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) backwards }
      `}</style>

      {/* Header — branding L-Agence + Client */}
      <header style={{
        background: 'linear-gradient(135deg, #FFFFFF 0%, #FAFAF7 100%)',
        borderBottom: '1px solid #E5E7EB',
        padding: '24px 16px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence" style={{ height: 42, width: 'auto', flexShrink: 0 }} />

          <div style={{ height: 36, width: 1, background: '#E5E7EB' }} />

          {data.client && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <ClientLogo
                nom_entreprise={data.client.nom_entreprise}
                site_web={data.client.site_web}
                size="lg"
              />
              <div style={{ minWidth: 0 }}>
                <h1 style={{
                  margin: 0,
                  fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
                  fontSize: 26, fontWeight: 400, color: '#1C1A14', lineHeight: 1.1,
                  letterSpacing: '-0.01em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {data.client.nom_entreprise}
                </h1>
                <p style={{
                  margin: '4px 0 0', fontSize: 11.5, color: '#6B7280',
                  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
                }}>
                  Portail Collaborateurs · L-Agence SA
                </p>
              </div>
            </div>
          )}

          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 99,
            background: '#DCFCE7', color: '#15803D',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            <ShieldCheck size={12} /> Lecture seule
          </span>
        </div>
      </header>

      {/* v2.7.2 — Navigation par onglets */}
      <nav style={{
        borderBottom: '1px solid #E5E7EB',
        background: '#fff',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px', display: 'flex', gap: 4 }}>
          <TabButton
            active={tab === 'collaborateurs'}
            onClick={() => switchTab('collaborateurs')}
            icon={<Users size={16} />}
            label="Collaborateurs"
            count={data.candidats.length}
          />
          <TabButton
            active={tab === 'rapports'}
            onClick={() => switchTab('rapports')}
            icon={<ClipboardList size={16} />}
            label="Rapports"
            badge={pendingCount && pendingCount > 0 ? pendingCount : null}
          />
        </div>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 16px' }}>
        {tab === 'collaborateurs' && (
          data.candidats.length === 0 ? (
            <div style={{
              padding: 60, textAlign: 'center',
              background: '#fff', border: '1px dashed #E5E7EB', borderRadius: 14,
              color: '#6B7280', fontSize: 14,
            }}>
              Aucun collaborateur en mission actuellement.<br/>
              <span style={{ fontSize: 12, marginTop: 8, display: 'inline-block' }}>Contactez L-Agence SA pour toute question.</span>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 14, color: '#374151', margin: '0 0 22px', fontWeight: 500 }}>
                <strong style={{ color: '#1C1A14' }}>{data.candidats.length}</strong> collaborateur{data.candidats.length > 1 ? 's' : ''} en mission chez vous.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
                {data.candidats.map((c, idx) => (
                  <CandidatCard
                    key={c.id}
                    candidat={c}
                    delayMs={idx * 60}
                    onOpenDocs={() => setOpenDocsFor(c.id)}
                    onOpenRapports={() => {
                      switchTab('rapports')
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  />
                ))}
              </div>
            </>
          )
        )}
        {tab === 'rapports' && (
          <RapportsTab slug={slug} />
        )}
      </main>

      {/* Footer */}
      <footer style={{
        marginTop: 50, padding: '28px 16px',
        borderTop: '1px solid #E5E7EB',
        textAlign: 'center', background: '#fff',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1C1A14' }}>
            Une question ? Contactez L-Agence SA
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <a href="tel:+41245521870" style={footerCtaStyle('#1C1A14', '#fff')}>
              <Phone size={14} /> +41 24 552 18 70
            </a>
            <a href="https://wa.me/41762979795" target="_blank" rel="noopener noreferrer" style={footerCtaStyle('#25D366', '#fff')}>
              <MessageCircle size={14} /> WhatsApp +41 76 297 97 95
            </a>
          </div>
          <p style={{ margin: '16px 0 0', fontSize: 11, color: '#9CA3AF' }}>
            L-Agence SA · Av. des Alpes 3 · 1870 Monthey
          </p>
        </div>
      </footer>

      {/* Modal documents */}
      {openCandidat && (
        <PortalDocumentsModal
          slug={slug}
          candidat={openCandidat}
          compliance={openCandidat.compliance_documents}
          legacy={openCandidat.legacy_documents}
          onClose={() => setOpenDocsFor(null)}
        />
      )}
    </div>
  )
}

// ─── Card candidat ─────────────────────────────────────────────────────────────

function CandidatCard({ candidat: c, delayMs, onOpenDocs, onOpenRapports }: {
  candidat: PortalCandidat
  delayMs: number
  onOpenDocs: () => void
  onOpenRapports: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const fullName = `${c.prenom || ''} ${c.nom || ''}`.trim() || 'Collaborateur'
  const initials = `${(c.prenom?.[0] || '').toUpperCase()}${(c.nom?.[0] || '').toUpperCase()}` || '?'
  const phoneDigits = (c.telephone || '').replace(/\D/g, '')
  const totalDocs = c.compliance_documents.length + c.legacy_documents.length
  const showImg = c.photo_url && !imgError

  // Alerte priorité haute si un permis chauffeur est expiré ou expire bientôt
  const criticalHighlight = c.driver_highlights.find(h => h.status === 'expire' || h.status === 'expire_bientot')
  const cardBorderColor = criticalHighlight ? (criticalHighlight.status === 'expire' ? '#FCA5A5' : '#FDBA74') : '#E5E7EB'
  const cardShadow = criticalHighlight
    ? `0 0 0 1px ${cardBorderColor}, 0 8px 24px rgba(239,68,68,0.10)`
    : '0 2px 8px rgba(0,0,0,0.04)'

  return (
    <div
      className="portal-card"
      style={{
        background: '#fff',
        border: `1px solid ${cardBorderColor}`,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        // v2.7.1 — Hauteur naturelle (pas de stretch forcé) : les cards sans permis
        // ne sont pas étirées au niveau des cards chauffeur avec permis (= gros vide).
        // Cohérence entre cards "courtes" = leur hauteur intrinsèque est identique.
        boxShadow: cardShadow,
        transition: 'transform 0.2s, box-shadow 0.2s',
        animationDelay: `${delayMs}ms`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = criticalHighlight
          ? `0 0 0 1px ${cardBorderColor}, 0 16px 32px rgba(239,68,68,0.15)`
          : '0 12px 32px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'none'
        ;(e.currentTarget as HTMLElement).style.boxShadow = cardShadow
      }}
    >
      {/* Top : photo + name + métier */}
      <div style={{ padding: 16, display: 'flex', gap: 14 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, overflow: 'hidden',
          background: '#F3F4F6', border: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.photo_url!}
              alt={fullName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={() => setImgError(true)}
            />
          ) : (
            <span style={{ fontSize: 20, fontWeight: 700, color: '#6B7280' }}>
              {initials}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <h3 style={{
              margin: 0, fontSize: 16, fontWeight: 700, color: '#1C1A14',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{fullName}</h3>
            {c.is_driver && (
              <span title="Chauffeur" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', borderRadius: 99,
                background: '#DCFCE7', color: '#15803D',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                🚛 PL
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#374151', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.metier_affiche || '—'}
          </p>
          {/* v2.7.1 — Âge + localisation toujours sur la même ligne (jamais wrap).
              Si l'un manque, l'autre prend l'espace. Localisation tronquée par ellipsis si trop longue. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'nowrap', fontSize: 11, color: '#6B7280', minWidth: 0 }}>
            {c.age && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <Cake size={10} /> {c.age} ans
              </span>
            )}
            {c.localisation && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <MapPin size={10} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.localisation}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mission dates (gradient subtil) — v2.7.1 : durée écoulée au lieu de date de fin */}
      {c.mission && (
        <div style={{
          padding: '8px 16px',
          background: 'linear-gradient(90deg, rgba(234,179,8,0.06) 0%, rgba(234,179,8,0.02) 100%)',
          borderTop: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6',
          fontSize: 11.5, color: '#374151', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Calendar size={11} color="#A16207" />
          <span>
            En mission depuis le <strong style={{ color: '#1C1A14' }}>{formatExpiryDate(c.mission.date_debut)}</strong>
            {' · '}
            <strong style={{ color: '#A16207' }}>{formatMissionDuration(c.mission.date_debut)}</strong>
          </span>
        </div>
      )}

      {/* Highlights chauffeur — v2.7.1 : seuls les permis AVEC date d'échéance.
          Les permis sans date restent visibles dans le modal "Voir tous les documents". */}
      {c.driver_highlights.filter(h => h.expiry_date).length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🚛 Permis &amp; qualifications
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: '#9CA3AF', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
              ⏰ Date d&apos;expiration
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {c.driver_highlights.filter(h => h.expiry_date).map((h, i) => {
              const isExpired = h.status === 'expire'
              const isUrgent = h.status === 'expire_bientot'
              const isAttention = h.status === 'attention'
              const bg = isExpired ? '#FEE2E2' : isUrgent ? '#FFEDD5' : isAttention ? '#FEF3C7' : '#DCFCE7'
              const fg = isExpired ? '#991B1B' : isUrgent ? '#9A3412' : isAttention ? '#854D0E' : '#15803D'
              const icon = isExpired ? '🔴' : isUrgent ? '🟠' : isAttention ? '🟡' : '🟢'
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 8,
                  background: bg,
                  animation: isExpired ? 'pulse 2.4s ease-in-out infinite' : undefined,
                }}>
                  <span style={{ fontSize: 11 }}>{icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1C1A14', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.name}
                  </span>
                  <span style={{ fontSize: 11, color: fg, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {h.expiry_date ? formatExpiryDate(h.expiry_date) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Doc count + button */}
      <div style={{ padding: 14, marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#6B7280', flex: 1 }}>
          <FileText size={12} />
          {totalDocs === 0 ? (
            <span>Aucun document</span>
          ) : (
            <span><strong style={{ color: '#1C1A14' }}>{totalDocs}</strong> document{totalDocs > 1 ? 's' : ''}</span>
          )}
        </div>
        {/* v2.7.3 — Bouton compact "Rapports" : bascule vers l'onglet Rapports du portail */}
        <button
          onClick={onOpenRapports}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '7px 10px', borderRadius: 99,
            background: '#FEF3C7', border: '1.5px solid #FCD34D',
            color: '#78350F', fontSize: 11.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
          title="Voir ses rapports d'heures"
        >
          <FileClock size={11} /> Rapports
        </button>
        <button
          onClick={onOpenDocs}
          disabled={totalDocs === 0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '7px 12px', borderRadius: 99,
            background: totalDocs === 0 ? '#F3F4F6' : '#1C1A14',
            border: 'none', color: totalDocs === 0 ? '#9CA3AF' : '#fff',
            fontSize: 12, fontWeight: 700, cursor: totalDocs === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', transition: 'all 0.15s',
            boxShadow: totalDocs === 0 ? 'none' : '0 4px 12px rgba(28,26,20,0.15)',
          }}
          onMouseEnter={e => { if (totalDocs > 0) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}
        >
          <FileText size={11} /> Documents
        </button>
      </div>

      {/* Contact bar */}
      {(c.telephone || c.email) && (
        <div style={{
          padding: '10px 14px',
          background: '#FAFAF7',
          borderTop: '1px solid #F3F4F6',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>
            Contact
          </span>
          {c.telephone && (
            <>
              <a href={`tel:${c.telephone}`} style={miniBtn('#1C1A14', '#fff')} title={c.telephone}>
                <Phone size={11} /> Appel
              </a>
              {phoneDigits && (
                <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" style={miniBtn('#25D366', '#fff')} title={c.telephone}>
                  <MessageCircle size={11} /> WhatsApp
                </a>
              )}
            </>
          )}
          {c.email && (
            <a href={`mailto:${c.email}`} style={miniBtn('#EAB308', '#1C1A14')} title={c.email}>
              <Mail size={11} /> Email
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ─── v2.7.1 — Durée mission "5 jours" / "2 semaines + 3 jours" / "3 mois + 12 jours" ──

function formatMissionDuration(startIso: string): string {
  if (!startIso) return ''
  // Parse ISO YYYY-MM-DD ou date typée
  const start = new Date(startIso)
  if (isNaN(start.getTime())) return ''
  const today = new Date()
  start.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diffMs = today.getTime() - start.getTime()
  const totalDays = Math.max(0, Math.floor(diffMs / 86400000))

  if (totalDays === 0) return 'aujourd\'hui'
  if (totalDays === 1) return '1 jour'
  if (totalDays < 7) return `${totalDays} jours`

  // Mois calendaires si > 30 jours
  if (totalDays >= 30) {
    let months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth())
    // Si jour du mois pas encore atteint, le mois en cours ne compte pas (mois écoulés)
    if (today.getDate() < start.getDate()) months -= 1
    if (months < 1) months = 1
    // Date anniversaire du dernier mois compté
    const lastMonthAnchor = new Date(start)
    lastMonthAnchor.setMonth(lastMonthAnchor.getMonth() + months)
    const remainingDays = Math.max(0, Math.floor((today.getTime() - lastMonthAnchor.getTime()) / 86400000))
    if (remainingDays === 0) return `${months} mois`
    return `${months} mois + ${remainingDays} jour${remainingDays > 1 ? 's' : ''}`
  }

  // 7 ≤ totalDays < 30 → semaines
  const weeks = Math.floor(totalDays / 7)
  const rem = totalDays - weeks * 7
  if (rem === 0) return `${weeks} semaine${weeks > 1 ? 's' : ''}`
  return `${weeks} semaine${weeks > 1 ? 's' : ''} + ${rem} jour${rem > 1 ? 's' : ''}`
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#FAFAF7',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, gap: 18,
      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://www.talent-flow.ch/logo-agence-officiel-noir.png" alt="L-Agence" style={{ height: 36, width: 'auto' }} />
      <div style={{
        maxWidth: 460, width: '100%', padding: 32,
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16,
        textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
      }}>
        {children}
      </div>
    </div>
  )
}

const iconWrap = (bg: string, color: string): React.CSSProperties => ({
  width: 56, height: 56, borderRadius: 14,
  background: bg, color,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  marginBottom: 16,
})

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-instrument-serif), Georgia, serif',
  fontSize: 24, fontWeight: 400, color: '#1C1A14',
  letterSpacing: '-0.3px', lineHeight: 1.2, marginBottom: 8,
}

const textStyle: React.CSSProperties = {
  fontSize: 14, color: '#6B7280', lineHeight: 1.55, margin: 0,
}

function footerCtaStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 18px', borderRadius: 99,
    background: bg, color, textDecoration: 'none',
    fontSize: 13, fontWeight: 700,
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
  }
}

function miniBtn(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 99,
    background: bg, color, textDecoration: 'none',
    fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'transform 0.15s',
  }
}

// v2.7.2 — Bouton onglet (soulignement amber si actif + badge optionnel)
function TabButton({ active, onClick, icon, label, count, badge }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
  badge?: number | null
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 16px',
        border: 'none',
        background: 'transparent',
        color: active ? '#1C1A14' : '#6B7280',
        fontSize: 14, fontWeight: 700,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        position: 'relative',
        fontFamily: 'inherit',
        minHeight: 48,
      }}
    >
      {icon}
      <span>{label}</span>
      {typeof count === 'number' && (
        <span style={{
          fontSize: 11, color: '#9CA3AF', fontWeight: 600,
          background: '#F3F4F6', padding: '1px 7px', borderRadius: 99,
        }}>{count}</span>
      )}
      {badge && badge > 0 && (
        <span style={{
          fontSize: 11, color: '#fff', fontWeight: 800,
          background: '#DC2626', padding: '1px 7px', borderRadius: 99,
          minWidth: 18, textAlign: 'center',
        }}>{badge}</span>
      )}
      {active && (
        <span style={{
          position: 'absolute', bottom: -1, left: 12, right: 12,
          height: 3, borderRadius: '3px 3px 0 0',
          background: '#EAB308',
        }} />
      )}
    </button>
  )
}
