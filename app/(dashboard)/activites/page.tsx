'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Activity, Mail, MessageCircle, Smartphone, FileText, Upload,
  Calendar, StickyNote, ArrowRight, Building2, Search, X,
  ChevronLeft, ChevronRight, Trash2, Edit3, Check, MessageSquare,
  Filter, CheckSquare, Square, AlertTriangle, CalendarRange,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useActivites, useUpdateActiviteNotes, useDeleteActivite } from '@/hooks/useActivites'
import type { Activite } from '@/hooks/useActivites'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/* ─── Config ─── */

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  email_envoye:      { label: 'Email',       icon: Mail,           color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  whatsapp_envoye:   { label: 'WhatsApp',    icon: MessageCircle,  color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  sms_envoye:        { label: 'SMS',          icon: Smartphone,     color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  cv_envoye:         { label: 'CV',           icon: FileText,       color: '#F97316', bg: 'rgba(249,115,22,0.15)' },
  candidat_importe:  { label: 'Import',       icon: Upload,         color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  candidat_modifie:  { label: 'Modification', icon: Edit3,          color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
  entretien_planifie:{ label: 'Entretien',    icon: Calendar,       color: '#7C3AED', bg: 'rgba(124,58,237,0.15)' },
  note_ajoutee:      { label: 'Note',         icon: StickyNote,     color: '#D97706', bg: 'rgba(217,119,6,0.15)' },
  statut_change:     { label: 'Statut',       icon: ArrowRight,     color: '#6B7280', bg: 'rgba(107,114,128,0.15)' },
  client_contacte:   { label: 'Client',       icon: Building2,      color: '#14B8A6', bg: 'rgba(20,184,166,0.15)' },
}

const TABS = [
  { key: 'all',        label: 'Tous',       types: '' },
  { key: 'messages',   label: 'Messages',   types: 'email_envoye,whatsapp_envoye,sms_envoye,cv_envoye' },
  { key: 'candidats',  label: 'Candidats',  types: 'candidat_importe,candidat_modifie' },
  { key: 'entretiens', label: 'Entretiens', types: 'entretien_planifie' },
  { key: 'notes',      label: 'Notes',      types: 'note_ajoutee' },
  { key: 'pipeline',   label: 'Pipeline',   types: 'statut_change' },
  { key: 'clients',    label: 'Clients',    types: 'client_contacte' },
]

/* ─── Relative time in French ─── */

function tempsRelatif(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 60) return 'a l\'instant'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'hier'
  if (diffD < 7) return `il y a ${diffD} jours`
  const diffW = Math.floor(diffD / 7)
  if (diffW < 4) return `il y a ${diffW} sem.`
  const diffM = Math.floor(diffD / 30)
  if (diffM < 12) return `il y a ${diffM} mois`
  return `il y a ${Math.floor(diffD / 365)} an${Math.floor(diffD / 365) > 1 ? 's' : ''}`
}

function initialesFromName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (name[0] || '?').toUpperCase()
}

/* ─── Animations ─── */

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.04, type: 'spring' as const, stiffness: 280, damping: 24 },
  }),
}

const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.03, type: 'spring' as const, stiffness: 320, damping: 26 },
  }),
  exit: { opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.15 } },
}

/* ─── Note Editor Component ─── */

function NoteEditor({ activite, onClose }: { activite: Activite; onClose: () => void }) {
  const [text, setText] = useState(activite.notes || '')
  const updateNotes = useUpdateActiviteNotes()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = () => {
    updateNotes.mutate({ id: activite.id, notes: text }, {
      onSuccess: () => onClose(),
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        marginTop: 10,
        padding: 12,
        background: 'var(--secondary, rgba(0,0,0,0.03))',
        borderRadius: 10,
        border: '1.5px solid var(--border)',
      }}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Ajouter une note..."
          rows={3}
          style={{
            width: '100%', resize: 'vertical',
            background: 'var(--card)', border: '1.5px solid var(--border)',
            borderRadius: 8, padding: '8px 12px',
            fontSize: 13, fontFamily: 'var(--font-body)',
            color: 'var(--foreground)', outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--primary)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--border)',
              background: 'var(--card)', color: 'var(--muted)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={updateNotes.isPending}
            className="neo-btn-yellow neo-btn-sm"
            style={{
              opacity: updateNotes.isPending ? 0.6 : 1,
            }}
          >
            <Check size={13} />
            {updateNotes.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Activity Card Component ─── */

function ActivityCard({ activite, index, selected, onToggle }: {
  activite: Activite
  index: number
  selected?: boolean
  onToggle?: (id: string) => void
}) {
  const [editingNote, setEditingNote] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const deleteActivite = useDeleteActivite()

  const config = TYPE_CONFIG[activite.type] || TYPE_CONFIG.statut_change
  const Icon = config.icon

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      layout
    >
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Checkbox */}
        {onToggle && (
          <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 14, width: 28, flexShrink: 0 }}>
            <div
              onClick={() => onToggle(activite.id)}
              style={{
                width: 18, height: 18, borderRadius: 5,
                border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                background: selected ? 'var(--primary)' : 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.15s',
              }}
            >
              {selected && <Check size={11} color="var(--ink, #1C1A14)" strokeWidth={3} />}
            </div>
          </div>
        )}
        {/* Timeline */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          width: 40, flexShrink: 0, position: 'relative',
        }}>
          {/* Dot */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: index * 0.03 + 0.1, type: 'spring', stiffness: 400, damping: 20 }}
            style={{
              width: 12, height: 12, borderRadius: '50%',
              background: config.color,
              border: '2.5px solid var(--card)',
              boxShadow: `0 0 0 2px ${config.color}40`,
              zIndex: 1, flexShrink: 0,
              marginTop: 18,
            }}
          />
          {/* Vertical line */}
          <div style={{
            width: 2, flex: 1, background: 'var(--border)',
            marginTop: 4, borderRadius: 1,
          }} />
        </div>

        {/* Card */}
        <motion.div
          whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
          transition={{ duration: 0.15 }}
          style={{
            flex: 1,
            background: 'var(--card)',
            border: '2px solid var(--border)',
            borderRadius: 14,
            padding: '14px 18px',
            marginBottom: 12,
            marginLeft: 8,
            cursor: 'default',
          }}
        >
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {/* Avatar */}
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: config.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 11, fontWeight: 800,
              color: config.color,
            }}>
              {initialesFromName(activite.user_name)}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)' }}>
                  {activite.user_name}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 6,
                  background: config.bg, color: config.color,
                  fontSize: 11, fontWeight: 700,
                }}>
                  <Icon size={11} />
                  {config.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 }}>
                  {tempsRelatif(activite.created_at)}
                </span>
              </div>

              {/* Title & description */}
              <p style={{ fontSize: 13, fontWeight: 600, margin: '4px 0 0', color: 'var(--foreground)', lineHeight: 1.4 }}>
                {activite.titre}
              </p>
              {activite.description && (
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0', lineHeight: 1.4 }}>
                  {activite.description}
                </p>
              )}

              {/* Tags: candidat, client */}
              {(activite.candidat_nom || activite.client_nom) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {activite.candidat_nom && (
                    <Link
                      href={activite.candidat_id ? `/candidats/${activite.candidat_id}` : '#'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 8,
                        background: 'rgba(139,92,246,0.1)', color: '#8B5CF6',
                        fontSize: 11, fontWeight: 700, textDecoration: 'none',
                        border: '1px solid rgba(139,92,246,0.2)',
                        transition: 'background 0.15s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.18)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.1)')}
                    >
                      👤 {activite.candidat_nom}
                    </Link>
                  )}
                  {activite.client_nom && (
                    <Link
                      href={activite.client_id ? `/clients/${activite.client_id}` : '#'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 8,
                        background: 'rgba(20,184,166,0.1)', color: '#14B8A6',
                        fontSize: 11, fontWeight: 700, textDecoration: 'none',
                        border: '1px solid rgba(20,184,166,0.2)',
                        transition: 'background 0.15s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.18)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.1)')}
                    >
                      <Building2 size={11} /> {activite.client_nom}
                    </Link>
                  )}
                </div>
              )}

              {/* Existing note display */}
              {activite.notes && !editingNote && (
                <div style={{
                  marginTop: 8, padding: '8px 12px',
                  background: 'rgba(217,119,6,0.06)',
                  borderRadius: 8, borderLeft: '3px solid #D97706',
                  fontSize: 12, color: 'var(--foreground)', lineHeight: 1.5,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, color: '#D97706', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
                    <StickyNote size={10} /> Note
                  </div>
                  {activite.notes}
                </div>
              )}

              {/* Note editor */}
              <AnimatePresence>
                {editingNote && (
                  <NoteEditor activite={activite} onClose={() => setEditingNote(false)} />
                )}
              </AnimatePresence>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <button
                  onClick={() => setEditingNote(!editingNote)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: editingNote ? 'var(--primary)' : 'transparent',
                    color: editingNote ? 'var(--ink, #1C1A14)' : 'var(--muted)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    transition: 'all 0.15s',
                  }}
                >
                  <MessageSquare size={11} />
                  {activite.notes ? 'Modifier la note' : 'Ajouter une note'}
                </button>

                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px', borderRadius: 7,
                      border: '1px solid transparent',
                      background: 'transparent',
                      color: 'var(--muted)',
                      fontSize: 11, cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      transition: 'all 0.15s',
                      opacity: 0.5,
                    }}
                    onMouseOver={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#EF4444' }}
                    onMouseOut={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--muted)' }}
                  >
                    <Trash2 size={11} />
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => deleteActivite.mutate(activite.id)}
                      disabled={deleteActivite.isPending}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 7,
                        border: '1.5px solid #EF4444',
                        background: 'rgba(239,68,68,0.1)',
                        color: '#EF4444',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      <Trash2 size={11} />
                      {deleteActivite.isPending ? '...' : 'Supprimer'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      style={{
                        padding: '4px 8px', borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--muted)',
                        fontSize: 11, cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ─── Main Page ─── */

export default function ActivitesPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [page, setPage] = useState(1)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showViderConfirm, setShowViderConfirm] = useState(false)
  const [viderLoading, setViderLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const queryClient = useQueryClient()

  const handleSearch = (val: string) => {
    setSearch(val)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(val)
      setPage(1)
    }, 300)
  }

  const currentTab = TABS.find(t => t.key === activeTab) || TABS[0]

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const deselectAll = useCallback(() => setSelectedIds(new Set()), [])

  const deleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const res = await fetch('/api/activites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) { toast.error('Erreur suppression'); return }
    toast.success(`${ids.length} activité${ids.length > 1 ? 's' : ''} supprimée${ids.length > 1 ? 's' : ''}`)
    setSelectedIds(new Set())
    queryClient.invalidateQueries({ queryKey: ['activites'] })
  }, [selectedIds, queryClient])

  const viderOnglet = useCallback(async () => {
    setViderLoading(true)
    const types = currentTab.types ? currentTab.types.split(',') : Object.keys(TYPE_CONFIG)
    const res = await fetch('/api/activites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ types }),
    })
    setViderLoading(false)
    setShowViderConfirm(false)
    if (!res.ok) { toast.error('Erreur suppression'); return }
    const { deleted } = await res.json()
    toast.success(`${deleted ?? 'Toutes les'} activités supprimées`)
    setSelectedIds(new Set())
    queryClient.invalidateQueries({ queryKey: ['activites'] })
  }, [currentTab, queryClient])

  const { data, isLoading } = useActivites({
    search: debouncedSearch,
    type: currentTab.types || undefined,
    page,
    per_page: 20,
    date_from: dateFrom ? dateFrom + 'T00:00:00' : undefined,
    date_to: dateTo ? dateTo + 'T23:59:59' : undefined,
  })

  const activites = data?.activites || []
  const total = data?.total || 0
  const totalPages = data?.total_pages || 1

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(activites.map((a: Activite) => a.id)))
  }, [activites])

  // Group activities by date for section headers
  const groupedActivites = useMemo(() => {
    const groups: { label: string; items: Activite[] }[] = []
    let currentGroup: { label: string; items: Activite[] } | null = null

    for (const a of activites) {
      const d = new Date(a.created_at)
      const now = new Date()
      const isToday = d.toDateString() === now.toDateString()
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      const isYesterday = d.toDateString() === yesterday.toDateString()

      let label: string
      if (isToday) label = 'Aujourd\'hui'
      else if (isYesterday) label = 'Hier'
      else label = d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })

      if (!currentGroup || currentGroup.label !== label) {
        currentGroup = { label, items: [] }
        groups.push(currentGroup)
      }
      currentGroup.items.push(a)
    }
    return groups
  }, [activites])

  return (
    <div className="d-page">
      {/* ── Header ── */}
      <motion.div
        className="d-page-header"
        custom={0}
        variants={fadeUp}
        initial="hidden"
        animate="show"
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity style={{ width: 22, height: 22, color: 'var(--primary)' }} />
                Activite
              </h1>
              {total > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.2 }}
                  style={{
                    padding: '3px 10px', borderRadius: 8,
                    background: 'var(--primary)', color: 'var(--ink, #1C1A14)',
                    fontSize: 12, fontWeight: 800,
                  }}
                >
                  {total}
                </motion.span>
              )}
            </div>
            <p className="d-page-sub">
              Fil d&apos;activite de l&apos;equipe — tout ce qui se passe en temps reel
            </p>
          </div>

          {/* Actions toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Select all / deselect */}
            {activites.length > 0 && (
              <>
                <button
                  onClick={selectedIds.size === activites.length ? deselectAll : selectAll}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px', borderRadius: 9,
                    border: '2px solid var(--border)', background: 'var(--card)',
                    color: 'var(--foreground)', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}
                >
                  {selectedIds.size === activites.length
                    ? <><CheckSquare size={14} /> Tout désélectionner</>
                    : <><Square size={14} /> Tout sélectionner</>
                  }
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '7px 12px', borderRadius: 9,
                      border: '2px solid #EF4444',
                      background: 'rgba(239,68,68,0.1)',
                      color: '#EF4444', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}
                  >
                    <Trash2 size={13} /> Supprimer ({selectedIds.size})
                  </button>
                )}
              </>
            )}
            {/* Vider l'onglet */}
            {total > 0 && (
              <button
                onClick={() => setShowViderConfirm(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 12px', borderRadius: 9,
                  border: '2px solid var(--border)', background: 'var(--card)',
                  color: 'var(--muted)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  transition: 'all 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.color = '#EF4444' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
              >
                <Trash2 size={13} /> Vider l&apos;onglet
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Confirm Vider Modal ── */}
      <AnimatePresence>
        {showViderConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowViderConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--card)', borderRadius: 16,
                border: '2px solid var(--border)',
                padding: 28, maxWidth: 420, width: '90%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(239,68,68,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <AlertTriangle size={22} color="#EF4444" />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
                    Vider l&apos;onglet &laquo; {currentTab.label} &raquo;
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
                    Cette action est irréversible.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowViderConfirm(false)}
                  style={{
                    padding: '9px 18px', borderRadius: 9, border: '2px solid var(--border)',
                    background: 'var(--card)', color: 'var(--muted)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={viderOnglet}
                  disabled={viderLoading}
                  style={{
                    padding: '9px 18px', borderRadius: 9,
                    border: '2px solid #EF4444',
                    background: '#EF4444', color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)',
                    opacity: viderLoading ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Trash2 size={14} />
                  {viderLoading ? 'Suppression...' : 'Vider tout'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filter bar ── */}
      <motion.div
        custom={1}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          marginBottom: 24,
        }}
      >
        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 0,
          background: 'var(--card)',
          border: '2px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          flexWrap: 'wrap',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1) }}
              style={{
                padding: '10px 16px',
                border: 'none',
                borderRight: '1px solid var(--border)',
                background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
                color: activeTab === tab.key ? 'var(--ink, #1C1A14)' : 'var(--muted)',
                fontSize: 12, fontWeight: activeTab === tab.key ? 800 : 600,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + Date filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 400 }}>
            <Search size={15} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--muted)',
            }} />
            <input
              type="text"
              placeholder="Rechercher dans l'activite..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px 10px 36px',
                border: '2px solid var(--border)', borderRadius: 10,
                background: 'var(--card)', color: 'var(--foreground)',
                fontSize: 13, fontFamily: 'var(--font-body)',
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1) }}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', padding: 2,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <CalendarRange size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1) }}
              style={{
                padding: '9px 10px', border: '2px solid var(--border)', borderRadius: 10,
                background: 'var(--card)', color: dateFrom ? 'var(--foreground)' : 'var(--muted)',
                fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none',
                cursor: 'pointer', colorScheme: 'dark',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>→</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => { setDateTo(e.target.value); setPage(1) }}
              style={{
                padding: '9px 10px', border: '2px solid var(--border)', borderRadius: 10,
                background: 'var(--card)', color: dateTo ? 'var(--foreground)' : 'var(--muted)',
                fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none',
                cursor: 'pointer', colorScheme: 'dark',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
                title="Effacer les dates"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', padding: 2, display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Feed ── */}
      <motion.div
        custom={2}
        variants={fadeUp}
        initial="hidden"
        animate="show"
      >
        {isLoading && activites.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60,
            color: 'var(--muted)', fontSize: 14,
          }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              style={{ display: 'inline-block', marginBottom: 12 }}
            >
              <Activity size={24} style={{ color: 'var(--primary)' }} />
            </motion.div>
            <div>Chargement de l&apos;activite...</div>
          </div>
        ) : activites.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60,
            background: 'var(--card)', border: '2px solid var(--border)',
            borderRadius: 16,
          }}>
            <Activity size={32} style={{ color: 'var(--muted)', marginBottom: 12, opacity: 0.4 }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
              Aucune activite
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              {debouncedSearch
                ? 'Aucun resultat pour cette recherche'
                : 'Les actions de l\'equipe apparaitront ici'
              }
            </p>
          </div>
        ) : (
          <>
            {groupedActivites.map((group, gi) => (
              <div key={group.label}>
                {/* Date section header */}
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: gi * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginBottom: 12, marginTop: gi > 0 ? 20 : 0,
                  }}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: 0.8, color: 'var(--muted)',
                    padding: '4px 12px', borderRadius: 8,
                    background: 'var(--secondary, rgba(0,0,0,0.04))',
                    border: '1px solid var(--border)',
                  }}>
                    {group.label}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </motion.div>

                {/* Activities in group */}
                <AnimatePresence mode="popLayout">
                  {group.items.map((activite, i) => (
                    <ActivityCard
                      key={activite.id}
                      activite={activite}
                      index={gi * 5 + i}
                      selected={selectedIds.has(activite.id)}
                      onToggle={toggleSelect}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  gap: 12, marginTop: 24, paddingBottom: 20,
                }}
              >
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '8px 14px', borderRadius: 10,
                    border: '2px solid var(--border)',
                    background: 'var(--card)', color: page <= 1 ? 'var(--muted)' : 'var(--foreground)',
                    fontSize: 12, fontWeight: 600, cursor: page <= 1 ? 'default' : 'pointer',
                    fontFamily: 'var(--font-body)', opacity: page <= 1 ? 0.5 : 1,
                  }}
                >
                  <ChevronLeft size={14} /> Precedent
                </button>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                  Page {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '8px 14px', borderRadius: 10,
                    border: '2px solid var(--border)',
                    background: 'var(--card)', color: page >= totalPages ? 'var(--muted)' : 'var(--foreground)',
                    fontSize: 12, fontWeight: 600, cursor: page >= totalPages ? 'default' : 'pointer',
                    fontFamily: 'var(--font-body)', opacity: page >= totalPages ? 0.5 : 1,
                  }}
                >
                  Suivant <ChevronRight size={14} />
                </button>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </div>
  )
}
