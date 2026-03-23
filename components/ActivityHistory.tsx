'use client'

import { useState, useEffect } from 'react'
import {
  X, Clock, ChevronDown, ChevronUp, User, FileText, Briefcase, Send, Star, Pencil,
  Building2, Upload, Mail, MessageCircle, Smartphone, Calendar, ArrowRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ActivityChange {
  field: string
  label: string
  old: string
  new: string
}

interface Activity {
  id: string
  user_name: string
  type: string
  titre: string
  description: string | null
  metadata: any
  notes: string | null
  created_at: string
}

interface ActivityHistoryProps {
  candidatId?: string
  clientId?: string
  candidatNom?: string
  clientNom?: string
  onClose: () => void
}

/* ─── Status badge config ─── */

interface StatusBadgeConfig {
  label: string
  bg: string
  color: string
  borderColor: string
}

function getStatusBadge(activity: Activity): StatusBadgeConfig | null {
  const metadata = typeof activity.metadata === 'string'
    ? JSON.parse(activity.metadata || '{}')
    : (activity.metadata || {})

  // Import badge
  if (activity.type === 'candidat_importe') {
    return { label: 'Import\u00e9', bg: 'rgba(34,197,94,0.12)', color: '#16A34A', borderColor: 'rgba(34,197,94,0.3)' }
  }

  // Status change badges
  if (activity.type === 'statut_change' && metadata.change_type) {
    if (metadata.change_type === 'import_status') {
      if (metadata.new_status === 'traite') {
        return { label: 'Valid\u00e9', bg: 'rgba(59,130,246,0.12)', color: '#2563EB', borderColor: 'rgba(59,130,246,0.3)' }
      }
      if (metadata.new_status === 'archive') {
        return { label: 'Archiv\u00e9', bg: 'rgba(107,114,128,0.12)', color: '#6B7280', borderColor: 'rgba(107,114,128,0.3)' }
      }
    }
    if (metadata.change_type === 'statut_pipeline') {
      const pipelineColors: Record<string, StatusBadgeConfig> = {
        nouveau:   { label: 'Nouveau',   bg: 'rgba(107,114,128,0.12)', color: '#6B7280', borderColor: 'rgba(107,114,128,0.3)' },
        contacte:  { label: 'Contact\u00e9',  bg: 'rgba(59,130,246,0.12)',  color: '#2563EB', borderColor: 'rgba(59,130,246,0.3)' },
        entretien: { label: 'Entretien', bg: 'rgba(139,92,246,0.12)',  color: '#7C3AED', borderColor: 'rgba(139,92,246,0.3)' },
        place:     { label: 'Plac\u00e9',     bg: 'rgba(34,197,94,0.12)',   color: '#16A34A', borderColor: 'rgba(34,197,94,0.3)' },
        refuse:    { label: 'Refus\u00e9',    bg: 'rgba(239,68,68,0.12)',   color: '#DC2626', borderColor: 'rgba(239,68,68,0.3)' },
      }
      return pipelineColors[metadata.new_status] || null
    }
  }

  return null
}

/* ─── Type config ─── */

const TYPE_COLORS: Record<string, string> = {
  candidat_importe:   '#22C55E',
  candidat_modifie:   '#F7C948',
  client_modifie:     '#F7C948',
  statut_change:      '#8B5CF6',
  email_envoye:       '#3B82F6',
  whatsapp_envoye:    '#22C55E',
  sms_envoye:         '#3B82F6',
  cv_envoye:          '#F97316',
  note_ajoutee:       '#10B981',
  candidat_cree:      '#22C55E',
  candidat_supprime:  '#EF4444',
  envoi_client:       '#F97316',
  entretien_planifie: '#7C3AED',
  client_contacte:    '#14B8A6',
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  candidat_importe:   <Upload size={12} />,
  candidat_modifie:   <Pencil size={12} />,
  client_modifie:     <Building2 size={12} />,
  statut_change:      <ArrowRight size={12} />,
  email_envoye:       <Mail size={12} />,
  whatsapp_envoye:    <MessageCircle size={12} />,
  sms_envoye:         <Smartphone size={12} />,
  cv_envoye:          <Send size={12} />,
  note_ajoutee:       <FileText size={12} />,
  candidat_cree:      <Star size={12} />,
  envoi_client:       <Send size={12} />,
  entretien_planifie: <Calendar size={12} />,
  client_contacte:    <Building2 size={12} />,
}

const TYPE_LABELS: Record<string, string> = {
  candidat_importe:   'Import',
  candidat_modifie:   'Modification',
  statut_change:      'Statut',
  email_envoye:       'Email',
  whatsapp_envoye:    'WhatsApp',
  sms_envoye:         'SMS',
  cv_envoye:          'CV envoy\u00e9',
  note_ajoutee:       'Note',
  entretien_planifie: 'Entretien',
  client_contacte:    'Client',
  envoi_client:       'Envoi client',
}

function formatDateFR(dateStr: string): string {
  const d = new Date(dateStr)
  const months = ['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre']
  const day = d.getDate()
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  const hours = d.getHours().toString().padStart(2, '0')
  const minutes = d.getMinutes().toString().padStart(2, '0')
  return `${day} ${month} ${year} \u00e0 ${hours}h${minutes}`
}

function ChangeDetail({ changes }: { changes: ActivityChange[] }) {
  const [expanded, setExpanded] = useState(false)

  if (!changes || changes.length === 0) return null

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 600, color: 'var(--primary-dark, #D4A72C)',
          fontFamily: 'inherit', padding: '2px 0',
        }}
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? 'Masquer les d\u00e9tails' : `Voir les ${changes.length} modification(s)`}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              marginTop: 8, padding: '10px 14px',
              background: 'var(--secondary)', border: '1.5px solid var(--border)',
              borderRadius: 10, borderLeft: '3px solid var(--primary)',
            }}>
              {changes.map((change, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '5px 0',
                  borderBottom: i < changes.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 12, lineHeight: 1.5,
                }}>
                  <span style={{
                    fontWeight: 700, color: 'var(--foreground)',
                    minWidth: 100, flexShrink: 0,
                  }}>
                    {change.label}:
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{
                      textDecoration: 'line-through', color: 'var(--muted)',
                      fontWeight: 400, wordBreak: 'break-word',
                    }}>
                      {change.old || '(vide)'}
                    </span>
                    <span style={{ color: 'var(--muted)', fontWeight: 700, flexShrink: 0 }}>{'\u2192'}</span>
                    <span style={{
                      fontWeight: 700, color: 'var(--foreground)',
                      wordBreak: 'break-word',
                    }}>
                      {change.new || '(vide)'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Status transition display ─── */

function StatusTransition({ metadata }: { metadata: any }) {
  if (!metadata?.old_label || !metadata?.new_label) return null

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
      padding: '4px 10px', borderRadius: 8,
      background: 'var(--secondary)', border: '1px solid var(--border)',
      fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ color: 'var(--muted)' }}>{metadata.old_label}</span>
      <ArrowRight size={11} style={{ color: 'var(--muted)' }} />
      <span style={{ color: 'var(--foreground)', fontWeight: 700 }}>{metadata.new_label}</span>
    </div>
  )
}

export default function ActivityHistory({ candidatId, clientId, candidatNom, clientNom, onClose }: ActivityHistoryProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  const name = candidatNom || clientNom || ''

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const params = new URLSearchParams({ per_page: '100' })
        if (candidatId) params.set('candidat_id', candidatId)
        if (clientId) params.set('client_id', clientId)

        const res = await fetch(`/api/activites?${params.toString()}`)
        if (!res.ok) throw new Error('Erreur chargement')
        const json = await res.json()
        setActivities(json.activites || [])
      } catch (err) {
        console.error('[ActivityHistory] fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchActivities()
  }, [candidatId, clientId])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', border: '2px solid var(--border)',
          borderRadius: 18, width: '100%', maxWidth: 640,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0,0,0,0.2), 4px 4px 0 var(--foreground)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '20px 24px', borderBottom: '2px solid var(--border)',
          background: 'var(--secondary)',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--primary)', border: '2px solid var(--foreground)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '2px 2px 0 var(--foreground)',
          }}>
            <Clock size={18} color="var(--ink, #1C1A14)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              fontSize: 16, fontWeight: 800, color: 'var(--foreground)',
              margin: 0, lineHeight: 1.2,
            }}>
              Historique complet
            </h2>
            <p style={{
              fontSize: 12, color: 'var(--muted)', fontWeight: 500, margin: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {name} {activities.length > 0 ? `\u2014 ${activities.length} entr\u00e9e(s)` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              border: '1.5px solid var(--border)', background: 'var(--card)',
              color: 'var(--muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--foreground)'; e.currentTarget.style.color = 'var(--foreground)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '60px 0', gap: 10,
            }}>
              <div style={{
                width: 20, height: 20, border: '2.5px solid var(--border)',
                borderTopColor: 'var(--primary)', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                Chargement...
              </span>
              <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
            </div>
          ) : activities.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '60px 0', gap: 12,
            }}>
              <Clock size={36} color="var(--muted)" style={{ opacity: 0.3 }} />
              <p style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600, margin: 0 }}>
                Aucun historique pour ce profil
              </p>
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 24 }}>
              {/* Timeline vertical line */}
              <div style={{
                position: 'absolute', left: 7, top: 8, bottom: 8,
                width: 2, background: 'var(--border)', borderRadius: 1,
              }} />

              {activities.map((activity, index) => {
                const dotColor = TYPE_COLORS[activity.type] || '#94A3B8'
                const icon = TYPE_ICONS[activity.type] || <User size={12} />
                const typeLabel = TYPE_LABELS[activity.type] || activity.type
                const metadata = typeof activity.metadata === 'string'
                  ? JSON.parse(activity.metadata || '{}')
                  : (activity.metadata || {})
                const changes: ActivityChange[] = metadata.changes || []
                const statusBadge = getStatusBadge(activity)

                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.25 }}
                    style={{
                      position: 'relative', paddingBottom: index < activities.length - 1 ? 16 : 0,
                    }}
                  >
                    {/* Timeline dot */}
                    <div style={{
                      position: 'absolute', left: -24, top: 4,
                      width: 16, height: 16, borderRadius: '50%',
                      background: dotColor, border: '2.5px solid var(--card)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', zIndex: 1,
                      boxShadow: `0 0 0 2px ${dotColor}40`,
                    }}>
                      {icon}
                    </div>

                    {/* Content */}
                    <div style={{
                      background: 'var(--card)', border: '1.5px solid var(--border)',
                      borderRadius: 12, padding: '12px 16px',
                      transition: 'border-color 0.15s',
                    }}>
                      {/* Header: date + user + type badge + status badge */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        marginBottom: 4, flexWrap: 'wrap',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>
                          {activity.user_name}
                        </span>

                        {/* Type label badge */}
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '1px 7px', borderRadius: 5,
                          background: `${dotColor}18`, color: dotColor,
                          fontSize: 10, fontWeight: 700,
                        }}>
                          {icon}
                          {typeLabel}
                        </span>

                        {/* Status badge (Import/Valid/Archiv/Pipeline) */}
                        {statusBadge && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '2px 8px', borderRadius: 6,
                            background: statusBadge.bg, color: statusBadge.color,
                            border: `1px solid ${statusBadge.borderColor}`,
                            fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                          }}>
                            {statusBadge.label}
                          </span>
                        )}

                        <span style={{
                          fontSize: 10, color: 'var(--muted)', fontWeight: 500,
                          marginLeft: 'auto', flexShrink: 0,
                        }}>
                          {formatDateFR(activity.created_at)}
                        </span>
                      </div>

                      {/* Title */}
                      <p style={{
                        fontSize: 13, color: 'var(--foreground)', fontWeight: 600,
                        margin: 0, lineHeight: 1.5,
                      }}>
                        {activity.titre}
                      </p>

                      {/* Description */}
                      {activity.description && (
                        <p style={{
                          fontSize: 12, color: 'var(--muted)', fontWeight: 500,
                          margin: '2px 0 0', lineHeight: 1.4,
                        }}>
                          {activity.description}
                        </p>
                      )}

                      {/* Status transition arrow display */}
                      {activity.type === 'statut_change' && metadata.old_label && (
                        <StatusTransition metadata={metadata} />
                      )}

                      {/* Field change details */}
                      {changes.length > 0 && <ChangeDetail changes={changes} />}

                      {/* Notes */}
                      {activity.notes && (
                        <div style={{
                          marginTop: 8, padding: '8px 12px',
                          background: 'var(--secondary)', borderRadius: 8,
                          border: '1px solid var(--border)',
                          fontSize: 12, color: 'var(--muted)',
                          fontStyle: 'italic', lineHeight: 1.5,
                        }}>
                          {activity.notes}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
