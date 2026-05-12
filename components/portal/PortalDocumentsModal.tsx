'use client'

// Portail Client — Modal documents (READ-ONLY, lecture seule)
// v2.7.1
// Réutilise les patterns visuels du CompliancePanel mais en mode public lecture seule.

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Eye, FileText, IdCard, Car, Award, GraduationCap, Phone, Mail, MessageCircle,
  MapPin, Cake,
} from 'lucide-react'
import type { CandidatDocumentWithStatus, DocumentCategory } from '@/lib/compliance/types'
import { DOCUMENT_CATEGORY_CONFIG } from '@/lib/compliance/types'
import { DOCUMENT_STATUS_CONFIG, formatExpiryDate, formatExpiryLong } from '@/lib/compliance/document-status'

const CATEGORY_ORDER: DocumentCategory[] = ['identite', 'permis_conduire', 'qualification', 'formation', 'autre']

const CATEGORY_ICON: Record<DocumentCategory, typeof IdCard> = {
  identite: IdCard,
  permis_conduire: Car,
  qualification: Award,
  formation: GraduationCap,
  autre: FileText,
}

// v2.7.1 — Couleurs par catégorie (alignées sur le design DocumentsSection fiche candidat)
const CATEGORY_COLORS: Record<DocumentCategory, { bg: string; fg: string; border: string; dot: string }> = {
  identite:        { bg: '#EFF6FF', fg: '#1E40AF', border: '#BFDBFE', dot: '#3B82F6' },
  permis_conduire: { bg: '#FEE2E2', fg: '#991B1B', border: '#FECACA', dot: '#EF4444' },
  qualification:   { bg: '#DCFCE7', fg: '#166534', border: '#BBF7D0', dot: '#22C55E' },
  formation:       { bg: '#FEF3C7', fg: '#854D0E', border: '#FDE68A', dot: '#EAB308' },
  autre:           { bg: '#F1F5F9', fg: '#334155', border: '#E2E8F0', dot: '#64748B' },
}

// Couleurs pour docs legacy (CV, attestations, etc.) — par type
function getLegacyColors(type: string | null | undefined): { bg: string; fg: string; border: string; dot: string } {
  const t = (type || 'autre').toLowerCase()
  if (t === 'cv') return { bg: '#EFF6FF', fg: '#1E40AF', border: '#BFDBFE', dot: '#3B82F6' }
  if (t === 'certificat') return { bg: '#DBEAFE', fg: '#1E3A8A', border: '#BFDBFE', dot: '#2563EB' }
  if (t === 'diplome') return { bg: '#DCFCE7', fg: '#166534', border: '#BBF7D0', dot: '#22C55E' }
  if (t === 'lettre_motivation') return { bg: '#FCE7F3', fg: '#9D174D', border: '#FBCFE8', dot: '#EC4899' }
  if (t === 'formation') return { bg: '#FEF3C7', fg: '#854D0E', border: '#FDE68A', dot: '#EAB308' }
  if (t === 'permis') return { bg: '#FEE2E2', fg: '#991B1B', border: '#FECACA', dot: '#EF4444' }
  if (t === 'reference') return { bg: '#F3E8FF', fg: '#6B21A8', border: '#DDD6FE', dot: '#A855F7' }
  if (t === 'contrat') return { bg: '#E0E7FF', fg: '#3730A3', border: '#C7D2FE', dot: '#6366F1' }
  if (t === 'bulletin_salaire') return { bg: '#FFEDD5', fg: '#9A3412', border: '#FED7AA', dot: '#F97316' }
  return { bg: '#F1F5F9', fg: '#334155', border: '#E2E8F0', dot: '#64748B' }
}

function legacyTypeLabel(type: string | null | undefined): string {
  const t = (type || 'autre').toLowerCase()
  if (t === 'cv') return 'CV'
  if (t === 'certificat') return 'Certificat'
  if (t === 'diplome') return 'Diplôme'
  if (t === 'lettre_motivation') return 'Lettre'
  if (t === 'formation') return 'Formation'
  if (t === 'permis') return 'Permis'
  if (t === 'reference') return 'Référence'
  if (t === 'contrat') return 'Contrat'
  if (t === 'bulletin_salaire') return 'Bulletin'
  return 'Doc'
}

interface PortalDocumentsModalProps {
  slug: string
  candidat: {
    id: string
    prenom: string | null
    nom: string | null
    photo_url: string | null
    age: number | null
    metier_affiche: string | null
    is_driver: boolean
    telephone: string | null
    email: string | null
    localisation: string | null
  }
  compliance: CandidatDocumentWithStatus[]
  legacy: { name: string; url: string; type?: string | null }[]
  onClose: () => void
}

export default function PortalDocumentsModal({
  slug, candidat, compliance, legacy, onClose,
}: PortalDocumentsModalProps) {
  const [viewing, setViewing] = useState<{ docId: string; label: string; side: 'recto' | 'verso'; hasVerso: boolean } | null>(null)
  const [imgError, setImgError] = useState(false)
  const fullName = `${candidat.prenom || ''} ${candidat.nom || ''}`.trim() || 'Collaborateur'
  const showImg = candidat.photo_url && !imgError

  const grouped = useMemo(() => {
    const map: Record<DocumentCategory, CandidatDocumentWithStatus[]> = {
      identite: [], permis_conduire: [], qualification: [], formation: [], autre: [],
    }
    for (const d of compliance) {
      const cat = (d.document_type?.category || 'autre') as DocumentCategory
      ;(map[cat] || map.autre).push(d)
    }
    return map
  }, [compliance])

  const phoneDigits = (candidat.telephone || '').replace(/\D/g, '')

  if (typeof window === 'undefined') return null
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(920px, 95vw)',
          maxHeight: '92vh',
          background: '#fff',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(0,0,0,0.30), 0 4px 16px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
          border: '1px solid #E5E7EB',
          overflow: 'hidden',
          animation: 'scaleIn 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 26px 18px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'flex-start', gap: 16,
          background: 'linear-gradient(135deg, #FFFFFF 0%, #FAFAF7 100%)',
          flexShrink: 0,
        }}>
          {/* Avatar — fix v2.7.1 : fallback initiales robuste via état React */}
          <div style={{
            width: 64, height: 64, borderRadius: 16, overflow: 'hidden',
            background: '#F3F4F6', border: '1px solid #E5E7EB',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            position: 'relative',
          }}>
            {showImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={candidat.photo_url!}
                alt={fullName}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={() => setImgError(true)}
              />
            ) : (
              <span style={{ fontSize: 22, fontWeight: 700, color: '#6B7280' }}>
                {(candidat.prenom?.[0] || '').toUpperCase()}{(candidat.nom?.[0] || '').toUpperCase() || '?'}
              </span>
            )}
          </div>

          {/* Titre + métadonnées */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{
                margin: 0,
                fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
                fontSize: 24, fontWeight: 400, color: '#1C1A14', lineHeight: 1.15,
              }}>{fullName}</h2>
              {candidat.is_driver && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 9px', borderRadius: 99,
                  background: '#DCFCE7', color: '#15803D',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                }}>
                  🚛 Chauffeur
                </span>
              )}
              {/* v2.7.1 — Âge en carré orange (demande João) */}
              {candidat.age && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 9px', borderRadius: 6,
                  background: '#FFEDD5', color: '#9A3412',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
                }}>
                  <Cake size={11} /> {candidat.age} ans
                </span>
              )}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#374151', fontWeight: 600 }}>
              {candidat.metier_affiche || '—'}
            </p>

            {/* v2.7.1 — Localisation + tel + email VISIBLES en texte (pas juste boutons) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, fontSize: 12, color: '#374151' }}>
              {candidat.localisation && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={11} color="#6B7280" />
                  <span>{candidat.localisation}</span>
                </span>
              )}
              {candidat.telephone && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Phone size={11} color="#6B7280" />
                  <a href={`tel:${candidat.telephone}`} style={{ color: '#1C1A14', textDecoration: 'none', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {candidat.telephone}
                  </a>
                </span>
              )}
              {candidat.email && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <Mail size={11} color="#6B7280" />
                  <a href={`mailto:${candidat.email}`} style={{ color: '#1C1A14', textDecoration: 'none', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {candidat.email}
                  </a>
                </span>
              )}
            </div>

            {/* Contact rapide (boutons d'action en plus du texte) */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {candidat.telephone && (
                <a
                  href={`tel:${candidat.telephone}`}
                  style={contactBtn('#1C1A14', '#FFFFFF')}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}
                >
                  <Phone size={12} /> Appeler
                </a>
              )}
              {phoneDigits && (
                <a
                  href={`https://wa.me/${phoneDigits}`}
                  target="_blank" rel="noopener noreferrer"
                  style={contactBtn('#25D366', '#FFFFFF')}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}
                >
                  <MessageCircle size={12} /> WhatsApp
                </a>
              )}
              {candidat.email && (
                <a
                  href={`mailto:${candidat.email}`}
                  style={contactBtn('#EAB308', '#1C1A14')}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}
                >
                  <Mail size={12} /> Email
                </a>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid #E5E7EB',
              cursor: 'pointer', color: '#6B7280', flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F3F4F6' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: 24, flex: 1 }}>
          {compliance.length === 0 && legacy.length === 0 ? (
            <div style={{
              padding: 60, textAlign: 'center', color: '#6B7280', fontSize: 13,
              background: '#FAFAF7', border: '1px dashed #E5E7EB', borderRadius: 12,
            }}>
              Aucun document disponible — contactez L-Agence SA.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {/* Compliance par catégorie — header coloré v2.7.1 */}
              {CATEGORY_ORDER.map(cat => {
                const docs = grouped[cat]
                if (!docs || docs.length === 0) return null
                const Icon = CATEGORY_ICON[cat]
                const cfg = DOCUMENT_CATEGORY_CONFIG[cat]
                const colors = CATEGORY_COLORS[cat]
                return (
                  <div key={cat}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '6px 12px', borderRadius: 10,
                      background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`,
                      marginBottom: 12,
                    }}>
                      <Icon size={14} />
                      <h3 style={{
                        margin: 0, fontSize: 12, fontWeight: 700,
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>{cfg.label}</h3>
                      <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.75 }}>· {docs.length}</span>
                    </div>
                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                      {docs.map(doc => (
                        <DocReadCard
                          key={doc.id}
                          doc={doc}
                          accentBorder={colors.border}
                          onView={(side) => setViewing({
                            docId: doc.id,
                            label: doc.label,
                            side,
                            hasVerso: !!doc.file_verso_path,
                          })}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Legacy (CV + attestations sans échéance) — couleurs par type v2.7.1 */}
              {legacy.length > 0 && (
                <div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '6px 12px', borderRadius: 10,
                    background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0',
                    marginBottom: 12,
                  }}>
                    <FileText size={14} />
                    <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Autres documents
                    </h3>
                    <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.75 }}>· {legacy.length}</span>
                  </div>
                  {/* v2.7.1 — Afficher la catégorie en gros au lieu du nom de fichier (souvent moche).
                      Le filename complet reste accessible en tooltip. */}
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                    {legacy.map((d, i) => {
                      const lc = getLegacyColors(d.type)
                      return (
                        <a
                          key={i}
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={d.name}
                          style={{
                            ...legacyDocBtn,
                            background: lc.bg,
                            border: `1px solid ${lc.border}`,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
                            ;(e.currentTarget as HTMLElement).style.boxShadow = `0 4px 12px ${lc.border}`
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.transform = 'none'
                            ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
                          }}
                        >
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: lc.dot, flexShrink: 0 }} />
                          <span style={{
                            flex: 1, minWidth: 0,
                            fontSize: 14, color: lc.fg,
                            fontWeight: 700, letterSpacing: '0.01em',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {legacyTypeLabel(d.type)}
                          </span>
                          <span style={{
                            fontSize: 10, color: lc.fg, opacity: 0.7,
                            fontWeight: 600, fontStyle: 'italic',
                            whiteSpace: 'nowrap', flexShrink: 0,
                          }}>
                            Ouvrir →
                          </span>
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Viewer plein écran (recto/verso) */}
      {viewing && (
        <PortalFileViewer
          slug={slug}
          candidatId={candidat.id}
          docId={viewing.docId}
          label={viewing.label}
          initialSide={viewing.side}
          hasVerso={viewing.hasVerso}
          onClose={() => setViewing(null)}
        />
      )}
    </div>,
    document.body
  )
}

// ─── DocReadCard ──────────────────────────────────────────────────────────────

function DocReadCard({ doc, onView, accentBorder }: { doc: CandidatDocumentWithStatus; onView: (side: 'recto' | 'verso') => void; accentBorder?: string }) {
  const cfg = DOCUMENT_STATUS_CONFIG[doc.status]
  return (
    <div style={{
      background: '#FFFFFF', border: `1px solid ${accentBorder || '#E5E7EB'}`, borderRadius: 12, padding: 12,
      display: 'flex', flexDirection: 'column', gap: 8,
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)' }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: cfg.dot, flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1A14', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.label}
          </div>
          {doc.sub_category && (
            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>
              Catégorie : {doc.sub_category}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        alignSelf: 'flex-start',
        padding: '3px 9px', borderRadius: 99,
        background: cfg.bg, color: cfg.color,
        fontSize: 11, fontWeight: 700,
      }}>
        {formatExpiryLong(doc.expiry_date)}
      </div>

      {doc.document_number && (
        <div style={{ fontSize: 11, color: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>
          N° {doc.document_number}
        </div>
      )}

      {(doc.file_recto_path || doc.file_verso_path) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {doc.file_recto_path && (
            <button onClick={() => onView('recto')} style={fileBtn}>
              <Eye size={11} /> Recto
            </button>
          )}
          {doc.file_verso_path && (
            <button onClick={() => onView('verso')} style={fileBtn}>
              <Eye size={11} /> Verso
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PortalFileViewer ─────────────────────────────────────────────────────────

function PortalFileViewer({ slug, candidatId, docId, label, initialSide, hasVerso, onClose }: {
  slug: string
  candidatId: string
  docId: string
  label: string
  initialSide: 'recto' | 'verso'
  hasVerso: boolean
  onClose: () => void
}) {
  const [side, setSide] = useState<'recto' | 'verso'>(initialSide)
  const src = `/api/client-portal/${slug}/document?candidat_id=${candidatId}&doc_id=${docId}&side=${side}&t=${Date.now()}`

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-instrument-serif), Georgia, serif',
            fontSize: 18, color: '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{label}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            · {side}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasVerso && (
            <button onClick={() => setSide(s => s === 'recto' ? 'verso' : 'recto')} style={whiteBtn}>
              Voir {side === 'recto' ? 'verso' : 'recto'}
            </button>
          )}
          <button onClick={onClose} style={whiteIconBtn}><X size={16} /></button>
        </div>
      </div>
      <div onClick={e => e.stopPropagation()} style={{
        flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: 20, overflow: 'hidden',
      }}>
        <iframe
          src={src}
          title={`${label} - ${side}`}
          style={{
            width: 'min(1100px, 100%)', height: '100%',
            background: '#fff', border: 'none', borderRadius: 8,
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}
        />
      </div>
    </div>,
    document.body
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

function contactBtn(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 12px', borderRadius: 99,
    background: bg, color, border: 'none',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    textDecoration: 'none', fontFamily: 'inherit',
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  }
}

const fileBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 28, padding: '0 10px', borderRadius: 7,
  background: '#FAFAF7', border: '1px solid #E5E7EB',
  color: '#1C1A14', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
}

const legacyDocBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 12px', borderRadius: 10,
  background: '#FAFAF7', border: '1px solid #E5E7EB',
  textDecoration: 'none', fontFamily: 'inherit',
}

const whiteBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}

const whiteIconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', cursor: 'pointer',
}
