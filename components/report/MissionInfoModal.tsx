'use client'

// TalentFlow Rapports — Modal "Infos mission" côté candidat
// v2.7.3
//
// Affiche en plein écran les détails de la mission pour une entreprise (sans
// basculer en formulaire). Inclut nom, contact terrain, période, durée calculée,
// boutons appel + WhatsApp + Email si dispo.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Phone, Calendar, MessageCircle, Mail, X as XIcon, Clock } from 'lucide-react'
import type { ReportLinkClient } from '@/lib/report/types'
import { formatDateChDot } from '@/lib/report/text-format'

interface Props {
  client: ReportLinkClient
  onClose: () => void
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n > 1 ? `${n} ${plural || singular + 's'}` : `${n} ${singular}`
}

/** "2 mois et 5 jours" / "12 jours" / "1 mois" — basé sur start → end (inclus). */
function formatDuration(start: string | null, end: string | null): string | null {
  if (!start) return null
  const s = new Date(start + 'T00:00:00')
  const e = end ? new Date(end + 'T00:00:00') : new Date()
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null
  const totalDays = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1
  if (totalDays < 0) return null
  if (totalDays < 31) return pluralize(totalDays, 'jour')
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  const eDayCount = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate()
  let dayDelta = e.getDate() - s.getDate()
  let realMonths = months
  if (dayDelta < 0) {
    realMonths -= 1
    dayDelta += eDayCount
  }
  if (realMonths === 0) return pluralize(totalDays, 'jour')
  if (dayDelta === 0) return pluralize(realMonths, 'mois', 'mois')
  return `${pluralize(realMonths, 'mois', 'mois')} et ${pluralize(dayDelta, 'jour')}`
}

function formatPeriod(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  const s = start ? formatDateChDot(start) : null
  const e = end ? formatDateChDot(end) : null
  if (s && e) return `Du ${s} au ${e}`
  if (s) return `Depuis le ${s}`
  if (e) return `Jusqu'au ${e}`
  return null
}

export default function MissionInfoModal({ client: c, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const period = formatPeriod(c.mission_start_date, c.mission_end_date)
  const duration = formatDuration(c.mission_start_date, c.mission_end_date)
  const phoneDigits = (c.mission_phone || '').replace(/\D/g, '')
  const hasPhone = !!c.mission_phone
  const hasEmail = !!c.client_email

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          width: 'min(520px, 100%)',
          maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 22px 16px',
          borderBottom: '1px solid #F3F4F6',
          display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          <div style={{
            flexShrink: 0,
            width: 48, height: 48, borderRadius: 14,
            background: '#FEF3C7',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#92400E',
          }}>
            <Building2 size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Ma mission
            </div>
            <div style={{
              marginTop: 2,
              fontSize: 20, fontWeight: 700, color: '#1C1A14', lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {c.client_name}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: '1px solid #E5E7EB', background: '#fff',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#1C1A14',
            }}
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Corps : période, contact */}
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(period || duration) && (
            <div style={{ background: '#FAFAF7', border: '1px solid #F3F4F6', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                Période
              </div>
              {period && (
                <div style={{ fontSize: 14, color: '#1C1A14', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1.4 }}>
                  <Calendar size={14} color="#6B7280" /> {period}
                </div>
              )}
              {duration && (
                <div style={{ marginTop: 6, fontSize: 12.5, color: '#6B7280', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={12} /> Durée : <strong style={{ color: '#1C1A14', fontWeight: 700 }}>{duration}</strong>
                </div>
              )}
            </div>
          )}

          {(c.mission_contact_name || hasPhone || hasEmail) && (
            <div style={{ background: '#FAFAF7', border: '1px solid #F3F4F6', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                Mon responsable
              </div>
              {c.mission_contact_name && (
                <div style={{ fontSize: 14.5, color: '#1C1A14', fontWeight: 700, lineHeight: 1.3 }}>
                  {c.mission_contact_name}
                </div>
              )}
              {(hasPhone || hasEmail) && (
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {hasPhone && (
                    <a
                      href={`tel:${(c.mission_phone || '').replace(/\s/g, '')}`}
                      style={{
                        flex: '1 1 140px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '11px 14px', borderRadius: 10,
                        background: '#1C1A14', color: '#fff',
                        fontSize: 13, fontWeight: 700, textDecoration: 'none',
                        minHeight: 44,
                      }}
                    >
                      <Phone size={14} /> Appeler
                    </a>
                  )}
                  {hasPhone && phoneDigits && (
                    <a
                      href={`https://wa.me/${phoneDigits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: '1 1 140px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '11px 14px', borderRadius: 10,
                        background: '#25D366', color: '#fff',
                        fontSize: 13, fontWeight: 700, textDecoration: 'none',
                        minHeight: 44,
                      }}
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  )}
                  {hasEmail && (
                    <a
                      href={`mailto:${c.client_email}`}
                      style={{
                        flex: '1 1 140px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '11px 14px', borderRadius: 10,
                        border: '1.5px solid #1C1A14',
                        background: '#fff', color: '#1C1A14',
                        fontSize: 13, fontWeight: 700, textDecoration: 'none',
                        minHeight: 44,
                      }}
                    >
                      <Mail size={14} /> Email
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Aide / hint si rien à afficher */}
          {!period && !duration && !c.mission_contact_name && !hasPhone && !hasEmail && (
            <div style={{ padding: 14, color: '#6B7280', fontSize: 13, textAlign: 'center' }}>
              Aucune info supplémentaire renseignée pour cette mission.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
