'use client'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { DndContext, DragOverlay, closestCenter, useSensor, useSensors, PointerSensor, DragStartEvent, DragEndEvent, DragOverEvent, useDroppable } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Star, GripVertical, MapPin, Search, Calendar, MessageSquare,
  ChevronDown, Clock, Eye, UserPlus, Briefcase, X,
  TrendingUp, Filter, LayoutGrid, Pencil, Check, Settings,
  ChevronUp, Trash2, EyeOff, Plus, ArrowUp, ArrowDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { logActivity } from '@/hooks/useActivites'

const supabase = createClient()

// ─── Stage type ──────────────────────────────────────────────────────────────

export type Stage = {
  id: string
  label: string
  color: string
  visible: boolean
}

const DEFAULT_STAGES: Stage[] = [
  { id: 'nouveau',   label: 'Nouveau',   color: '#3B82F6', visible: true },
  { id: 'contacte',  label: 'Contacté',  color: '#F59E0B', visible: true },
  { id: 'entretien', label: 'Entretien', color: '#8B5CF6', visible: true },
  { id: 'place',     label: 'Placé',     color: '#10B981', visible: true },
  { id: 'refuse',    label: 'Refusé',    color: '#EF4444', visible: true },
]

// Derive soft bg/border from color hex
function colorSoft(hex: string) {
  return {
    bgSoft: `${hex}14`,
    borderColor: `${hex}33`,
  }
}

// ─── Palette of quick-pick colors ────────────────────────────────────────────
const COLOR_PALETTE = [
  '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#EF4444',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  '#06B6D4', '#A855F7', '#22C55E', '#64748B', '#F43F5E',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(prenom: string | null, nom: string) {
  const p = prenom?.charAt(0)?.toUpperCase() || ''
  const n = nom?.charAt(0)?.toUpperCase() || ''
  return p + n || '?'
}

function timeAgo(dateStr: string | undefined) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  if (days < 7) return `${days}j`
  if (days < 30) return `${Math.floor(days / 7)}sem`
  return `${Math.floor(days / 30)}mois`
}

function scoreColor(score: number | null) {
  if (score === null) return 'var(--muted-foreground)'
  if (score >= 75) return '#10B981'
  if (score >= 50) return '#F59E0B'
  return '#EF4444'
}

// ─── QuickAction Button ───────────────────────────────────────────────────────

const QuickAction = ({ icon: Icon, label, onClick, color }: {
  icon: React.ElementType; label: string; onClick?: () => void; color?: string
}) => (
  <button
    onPointerDown={e => e.stopPropagation()}
    onClick={(e) => { e.stopPropagation(); onClick?.() }}
    title={label}
    style={{
      width: 28, height: 28, borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1.5px solid var(--border)',
      background: 'var(--card)',
      color: color || 'var(--muted-foreground)',
      cursor: 'pointer', transition: 'all 0.15s',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.borderColor = color || 'var(--primary)'
      ;(e.currentTarget as HTMLElement).style.color = color || 'var(--primary)'
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
      ;(e.currentTarget as HTMLElement).style.color = color || 'var(--muted-foreground)'
    }}
  >
    <Icon size={13} />
  </button>
)

// ─── Droppable Column ─────────────────────────────────────────────────────────

function DroppableColumn({ stage, children, isActive }: { stage: Stage; children: React.ReactNode; isActive?: boolean }) {
  const { setNodeRef } = useDroppable({ id: stage.id })
  const { bgSoft: _bgSoft, borderColor } = colorSoft(stage.color)

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 8,
        borderRadius: '0 0 16px 16px',
        borderLeft: `2px solid ${isActive ? stage.color : borderColor}`,
        borderRight: `2px solid ${isActive ? stage.color : borderColor}`,
        borderBottom: `2px solid ${isActive ? stage.color : borderColor}`,
        background: isActive ? `${stage.color}12` : 'var(--secondary)',
        minHeight: 100, overflowY: 'auto',
        transition: 'background 0.25s, border-color 0.25s',
      }}
    >
      {children}
    </div>
  )
}

// ─── Draggable Card ───────────────────────────────────────────────────────────

function DraggableCard({ item, stage, onRemove, onNote }: {
  item: any
  stage: Stage
  onRemove: () => void
  onNote: (candidatId: string, name: string, notes: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })
  const [hovered, setHovered] = useState(false)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: 'var(--card)',
    borderRadius: 14,
    padding: '14px 16px',
    border: `2px solid ${isDragging ? 'var(--primary)' : hovered ? 'rgba(255,255,255,0.12)' : 'var(--border)'}`,
    cursor: isDragging ? 'grabbing' : 'grab',
    boxShadow: isDragging
      ? '0 20px 40px rgba(0,0,0,0.35), 0 0 0 1px var(--primary)'
      : hovered
        ? '0 4px 16px rgba(0,0,0,0.2)'
        : '0 1px 3px rgba(0,0,0,0.1)',
    userSelect: 'none',
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  }

  const hasNotes = !!(item.notes && item.notes.trim())
  const notesPreview = hasNotes
    ? item.notes.trim().slice(0, 60) + (item.notes.trim().length > 60 ? '…' : '')
    : null

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={style}
    >
      {/* Top row: avatar + name + grip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `linear-gradient(135deg, ${stage.color}22, ${stage.color}44)`,
          border: `2px solid ${stage.color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: stage.color,
          flexShrink: 0,
        }}>
          {getInitials(item.prenom, item.nom)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.prenom} {item.nom}
          </p>
          <p style={{
            fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.titre_poste || 'Sans poste'}
          </p>
        </div>
        <GripVertical size={14} style={{ color: 'var(--muted-foreground)', opacity: 0.4, flexShrink: 0 }} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {item.localisation && (
          <span style={{
            fontSize: 10, color: 'var(--muted-foreground)',
            display: 'flex', alignItems: 'center', gap: 3,
            background: 'var(--secondary)', padding: '2px 8px', borderRadius: 6,
          }}>
            <MapPin size={9} />{item.localisation}
          </span>
        )}
        {item.date_naissance && (() => {
          const dn = item.date_naissance
          let age: number | null = null
          if (/^\d+$/.test(dn) && parseInt(dn) > 1900) age = new Date().getFullYear() - parseInt(dn)
          else { const d = new Date(dn); if (!isNaN(d.getTime())) age = Math.floor((Date.now() - d.getTime()) / 31557600000) }
          return age && age > 0 && age < 120 ? (
            <span style={{
              fontSize: 10, color: 'var(--muted-foreground)',
              display: 'flex', alignItems: 'center', gap: 3,
              background: 'var(--secondary)', padding: '2px 8px', borderRadius: 6,
            }}>
              <Calendar size={9} />{age}ans
            </span>
          ) : null
        })()}
        {item.score_ia != null && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: scoreColor(item.score_ia),
            display: 'flex', alignItems: 'center', gap: 3,
            background: 'var(--secondary)', padding: '2px 8px', borderRadius: 6,
            marginLeft: 'auto',
          }}>
            <Star size={9} fill={scoreColor(item.score_ia)} />{item.score_ia}%
          </span>
        )}
      </div>

      {/* Time in stage */}
      {item.updated_at && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          marginTop: 8, fontSize: 10, color: 'var(--muted-foreground)', opacity: 0.7,
        }}>
          <Clock size={9} />
          {timeAgo(item.updated_at)}
        </div>
      )}

      {/* Note indicator */}
      {hasNotes && !hovered && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onNote(item.id, `${item.prenom || ''} ${item.nom}`.trim(), item.notes || '')
          }}
          style={{
            marginTop: 8, padding: '5px 8px',
            borderRadius: 8, background: 'rgba(249,115,22,0.08)',
            border: '1px solid rgba(249,115,22,0.25)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'flex-start', gap: 5,
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#F97316', flexShrink: 0, marginTop: 2,
          }} />
          <span style={{
            fontSize: 10, color: 'var(--muted-foreground)',
            lineHeight: 1.4, overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {notesPreview}
          </span>
        </div>
      )}

      {/* Quick actions on hover */}
      {hovered && (
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            marginTop: 10, paddingTop: 10,
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <QuickAction icon={Eye} label="Voir profil" onClick={() => window.location.href = `/candidats/${item.id}?from=pipeline`} />
            <QuickAction icon={Calendar} label="Planifier entretien" color="#8B5CF6" onClick={() => window.location.href = '/entretiens'} />
            <QuickAction
              icon={MessageSquare}
              label="Notes"
              color={hasNotes ? '#F97316' : '#3B82F6'}
              onClick={() => onNote(item.id, `${item.prenom || ''} ${item.nom}`.trim(), item.notes || '')}
            />
          </div>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            title="Retirer du pipeline"
            style={{
              width: '100%', padding: '5px 0', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              border: '1.5px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.06)',
              color: '#EF4444',
              cursor: 'pointer', transition: 'all 0.15s',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = '#EF4444';
              (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)'
            }}
          >
            <X size={12} />
            Retirer
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Overlay Card (shown while dragging) ─────────────────────────────────────

function OverlayCard({ item, stage }: { item: any; stage: Stage }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: 14,
        padding: '14px 16px',
        border: '2px solid var(--primary)',
        cursor: 'grabbing',
        boxShadow: '0 20px 40px rgba(0,0,0,0.35), 0 0 0 1px var(--primary)',
        userSelect: 'none',
        transform: 'rotate(2deg)',
        width: 280,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `linear-gradient(135deg, ${stage.color}22, ${stage.color}44)`,
          border: `2px solid ${stage.color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: stage.color,
          flexShrink: 0,
        }}>
          {getInitials(item.prenom, item.nom)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.prenom} {item.nom}
          </p>
          <p style={{
            fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.titre_poste || 'Sans poste'}
          </p>
        </div>
        <GripVertical size={14} style={{ color: 'var(--muted-foreground)', opacity: 0.4, flexShrink: 0 }} />
      </div>
    </div>
  )
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ stages, candidatsByEtape }: { stages: Stage[]; candidatsByEtape: Record<string, any[]> }) {
  const visibleStages = stages.filter(s => s.visible)
  const total = visibleStages.reduce((sum, s) => sum + (candidatsByEtape[s.id]?.length || 0), 0)
  if (total === 0) return null

  return (
    <div style={{
      display: 'flex', height: 4, borderRadius: 99, overflow: 'hidden',
      background: 'var(--secondary)', marginBottom: 20,
    }}>
      {visibleStages.map(s => {
        const count = candidatsByEtape[s.id]?.length || 0
        const pct = (count / total) * 100
        if (pct === 0) return null
        return (
          <motion.div
            key={s.id}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ background: s.color, minWidth: pct > 0 ? 4 : 0 }}
            title={`${s.label}: ${count}`}
          />
        )
      })}
    </div>
  )
}

// ─── Notes Modal ──────────────────────────────────────────────────────────────

function NotesModal({
  candidatId,
  name,
  initialNotes,
  offreFilter,
  onClose,
}: {
  candidatId: string
  name: string
  initialNotes: string
  offreFilter: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('candidats')
      .update({ notes })
      .eq('id', candidatId)
    setSaving(false)
    if (error) {
      toast.error(`Erreur : ${error.message}`)
      return
    }
    // Update cache
    queryClient.setQueryData(['pipeline-candidats', offreFilter], (old: any[] | undefined) =>
      old?.map(c => c.id === candidatId ? { ...c, notes } : c)
    )
    toast.success('Notes sauvegardées')
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card)', borderRadius: 18,
          border: '2px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          padding: 28, width: '100%', maxWidth: 520,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(249,115,22,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MessageSquare size={16} color="#F97316" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
                Notes
              </h3>
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
                {name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: 'var(--secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted-foreground)',
            }}
          >
            <X size={15} />
          </button>
        </div>

        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={5}
          placeholder="Ajoutez vos notes ici..."
          style={{
            width: '100%', padding: '12px 14px',
            background: 'var(--secondary)', border: '2px solid var(--border)',
            borderRadius: 12, color: 'var(--foreground)', fontSize: 13,
            resize: 'vertical', outline: 'none', fontFamily: 'inherit',
            lineHeight: 1.6, boxSizing: 'border-box',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          autoFocus
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              border: '2px solid var(--border)', background: 'var(--secondary)',
              color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              border: 'none', background: 'var(--primary)',
              color: 'var(--primary-foreground)', cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Stage Manager Panel ──────────────────────────────────────────────────────

function StageManagerPanel({
  stages,
  onSave,
  candidatsByEtape,
}: {
  stages: Stage[]
  onSave: (stages: Stage[]) => Promise<void>
  candidatsByEtape: Record<string, any[]>
}) {
  const [localStages, setLocalStages] = useState<Stage[]>(stages)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Sync if parent stages change (e.g., initial load)
  useEffect(() => { setLocalStages(stages) }, [stages])

  const updateStage = (id: string, patch: Partial<Stage>) => {
    setLocalStages(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  const moveStage = (index: number, direction: 'up' | 'down') => {
    const newStages = [...localStages]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= newStages.length) return
    ;[newStages[index], newStages[target]] = [newStages[target], newStages[index]]
    setLocalStages(newStages)
  }

  const deleteStage = (id: string) => {
    const count = candidatsByEtape[id]?.length || 0
    if (count > 0) {
      if (!window.confirm(`Cette étape contient ${count} candidat(s). Supprimer quand même ?`)) return
    }
    setLocalStages(prev => prev.filter(s => s.id !== id))
  }

  const addStage = () => {
    const newStage: Stage = {
      id: `stage_${Date.now()}`,
      label: 'Nouvelle étape',
      color: '#3B82F6',
      visible: true,
    }
    setLocalStages(prev => [...prev, newStage])
    setEditingId(newStage.id)
    setEditingLabel(newStage.label)
  }

  const startEdit = (id: string, label: string) => {
    setEditingId(id)
    setEditingLabel(label)
  }

  const commitEdit = (id: string) => {
    const trimmed = editingLabel.trim()
    if (trimmed) updateStage(id, { label: trimmed })
    setEditingId(null)
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave(localStages)
    setSaving(false)
  }

  return (
    <div style={{
      background: 'var(--card)', border: '2px solid var(--border)',
      borderRadius: 16, padding: '18px 20px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
          Gérer les étapes du pipeline
        </h4>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: 'none', background: 'var(--primary)',
            color: 'var(--primary-foreground)', cursor: saving ? 'wait' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {localStages.map((stage, index) => (
          <div
            key={stage.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--secondary)', borderRadius: 10,
              padding: '8px 10px', border: '1.5px solid var(--border)',
            }}
          >
            {/* Color swatch */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setColorPickerId(colorPickerId === stage.id ? null : stage.id)}
                style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: stage.color, border: '2px solid white',
                  cursor: 'pointer', flexShrink: 0,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                }}
                title="Changer la couleur"
              />
              {colorPickerId === stage.id && (
                <div
                  style={{
                    position: 'absolute', top: '110%', left: 0, zIndex: 50,
                    background: 'var(--card)', borderRadius: 10,
                    border: '2px solid var(--border)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    padding: 8,
                    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5,
                    width: 170,
                  }}
                >
                  {COLOR_PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => { updateStage(stage.id, { color: c }); setColorPickerId(null) }}
                      style={{
                        width: 24, height: 24, borderRadius: 6, background: c,
                        border: c === stage.color ? '3px solid white' : '2px solid transparent',
                        cursor: 'pointer',
                        boxShadow: c === stage.color ? `0 0 0 2px ${c}` : 'none',
                      }}
                      title={c}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Label */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingId === stage.id ? (
                <input
                  autoFocus
                  value={editingLabel}
                  onChange={e => setEditingLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(stage.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={() => commitEdit(stage.id)}
                  style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--foreground)',
                    border: `1.5px solid ${stage.color}`, borderRadius: 6,
                    padding: '2px 8px', outline: 'none', width: '100%',
                    background: 'var(--card)', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                  {stage.label}
                  {(candidatsByEtape[stage.id]?.length || 0) > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
                      ({candidatsByEtape[stage.id].length})
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => startEdit(stage.id, stage.label)}
                title="Renommer"
                style={{
                  width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--border)',
                  background: 'var(--card)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted-foreground)',
                }}
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => updateStage(stage.id, { visible: !stage.visible })}
                title={stage.visible ? 'Masquer' : 'Afficher'}
                style={{
                  width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--border)',
                  background: 'var(--card)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: stage.visible ? 'var(--foreground)' : 'var(--muted-foreground)',
                }}
              >
                {stage.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button
                onClick={() => moveStage(index, 'up')}
                title="Monter"
                disabled={index === 0}
                style={{
                  width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--border)',
                  background: 'var(--card)', cursor: index === 0 ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted-foreground)', opacity: index === 0 ? 0.3 : 1,
                }}
              >
                <ArrowUp size={12} />
              </button>
              <button
                onClick={() => moveStage(index, 'down')}
                title="Descendre"
                disabled={index === localStages.length - 1}
                style={{
                  width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--border)',
                  background: 'var(--card)', cursor: index === localStages.length - 1 ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted-foreground)', opacity: index === localStages.length - 1 ? 0.3 : 1,
                }}
              >
                <ArrowDown size={12} />
              </button>
              <button
                onClick={() => deleteStage(stage.id)}
                title="Supprimer"
                style={{
                  width: 26, height: 26, borderRadius: 6, border: '1.5px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.06)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#EF4444',
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add new stage */}
      <button
        onClick={addStage}
        style={{
          marginTop: 10, width: '100%', padding: '8px 0',
          borderRadius: 10, border: '2px dashed var(--border)',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 600,
          fontFamily: 'inherit', transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'
          ;(e.currentTarget as HTMLElement).style.color = 'var(--primary)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
          ;(e.currentTarget as HTMLElement).style.color = 'var(--muted-foreground)'
        }}
      >
        <Plus size={14} />
        Nouvelle étape
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [offreFilter, setOffreFilter] = useState<string>('tous')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const [showStageManager, setShowStageManager] = useState(false)
  const queryClient = useQueryClient()

  // Notes modal state (lifted to page level to avoid DnD z-index issues)
  const [notesModal, setNotesModal] = useState<{ candidatId: string; name: string; notes: string } | null>(null)

  // ── Load stages from app_settings ──
  const [stages, setStages] = useState<Stage[]>(DEFAULT_STAGES)
  const [stagesLoaded, setStagesLoaded] = useState(false)

  useEffect(() => {
    const loadStages = async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'pipeline_stages')
        .single()
      if (!error && data?.value && Array.isArray(data.value)) {
        setStages(data.value as Stage[])
      }
      setStagesLoaded(true)
    }
    loadStages()
  }, [])

  const visibleStages = useMemo(() => stages.filter(s => s.visible), [stages])

  const saveStages = useCallback(async (newStages: Stage[]) => {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'pipeline_stages', value: newStages as unknown as never })
    if (error) {
      toast.error(`Erreur lors de la sauvegarde : ${error.message}`)
      return
    }
    setStages(newStages)
    toast.success('Étapes sauvegardées')
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const { data: offres } = useQuery({
    queryKey: ['offres-pipeline'],
    queryFn: async () => {
      const { data } = await supabase.from('offres').select('id, titre').eq('statut', 'active')
      return data || []
    },
  })

  // ── Add candidat search ──
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState<any[]>([])
  const [addLoading, setAddLoading] = useState(false)
  const [showAddDropdown, setShowAddDropdown] = useState(false)

  const searchCandidatToAdd = useCallback(async (q: string) => {
    setAddSearch(q)
    if (q.length < 2) { setAddResults([]); setShowAddDropdown(false); return }
    setAddLoading(true)
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const qNorm = normalize(q)
    const { data } = await supabase
      .from('candidats')
      .select('id, nom, prenom, titre_poste, localisation, statut_pipeline')
      .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,titre_poste.ilike.%${q}%,localisation.ilike.%${q}%`)
      .limit(50)
    const filtered = (data || []).filter((c: any) => {
      const haystack = normalize(`${c.prenom || ''} ${c.nom || ''} ${c.titre_poste || ''} ${c.localisation || ''}`)
      return haystack.includes(qNorm)
    }).slice(0, 15)
    setAddResults(filtered)
    setShowAddDropdown(true)
    setAddLoading(false)
  }, [])

  const addCandidatToPipeline = useCallback(async (candidat: any, etapeId: string) => {
    const etapeLabel = stages.find(s => s.id === etapeId)?.label || etapeId
    try {
      const res = await fetch(`/api/candidats/${candidat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut_pipeline: etapeId }),
      })
      if (!res.ok) {
        const { error } = await supabase.from('candidats').update({ statut_pipeline: etapeId }).eq('id', candidat.id)
        if (error) throw error
      }
      queryClient.invalidateQueries({ queryKey: ['pipeline-candidats'] })
      toast.success(`${candidat.prenom || ''} ${candidat.nom} ajouté à ${etapeLabel}`)
      setAddSearch('')
      setAddResults([])
      setShowAddDropdown(false)
      logActivity({
        type: 'statut_change',
        titre: `${candidat.prenom || ''} ${candidat.nom} ajouté au pipeline — ${etapeLabel}`,
        candidat_id: candidat.id,
        candidat_nom: `${candidat.prenom || ''} ${candidat.nom}`,
      })
    } catch (err: any) {
      toast.error(`Erreur : ${err.message}`)
    }
  }, [queryClient, stages])

  // ── Pipeline query (includes notes) ──
  const { data: candidats, isLoading } = useQuery({
    queryKey: ['pipeline-candidats', offreFilter],
    queryFn: async () => {
      if (offreFilter === 'tous') {
        const { data, error } = await supabase
          .from('candidats')
          .select('id, nom, prenom, titre_poste, annees_exp, date_naissance, statut_pipeline, email, localisation, updated_at, created_at, notes')
          .not('statut_pipeline', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(500)
        if (error) throw error
        return data || []
      } else {
        const { data: pipelineData, error } = await supabase
          .from('pipeline')
          .select('etape, candidat_id, score_ia, candidats(id, nom, prenom, titre_poste, annees_exp, date_naissance, statut_pipeline, email, localisation, updated_at, created_at, notes)')
          .eq('offre_id', offreFilter)
        if (error) throw error
        return (pipelineData || []).map((p: any) => ({
          ...p.candidats,
          statut_pipeline: p.etape,
          score_ia: p.score_ia,
          pipeline_id: p.candidat_id,
        }))
      }
    },
  })

  // Filter by search
  const filteredCandidats = useMemo(() => {
    if (!candidats || !searchQuery.trim()) return candidats || []
    const q = searchQuery.toLowerCase()
    return candidats.filter((c: any) =>
      `${c.prenom} ${c.nom}`.toLowerCase().includes(q) ||
      (c.titre_poste || '').toLowerCase().includes(q) ||
      (c.localisation || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    )
  }, [candidats, searchQuery])

  // Group by stage (all stages, not just visible)
  const candidatsByEtape = useMemo(() => {
    return stages.reduce((acc, s) => {
      acc[s.id] = (filteredCandidats || []).filter((c: any) => c.statut_pipeline === s.id)
      return acc
    }, {} as Record<string, any[]>)
  }, [filteredCandidats, stages])

  const total = filteredCandidats?.length || 0

  // Active item and its stage for overlay
  const activeItem = activeId ? candidats?.find((c: any) => c.id === activeId) : null
  const activeStage: Stage = activeItem
    ? (stages.find(s => s.id === activeItem.statut_pipeline) || DEFAULT_STAGES[0])
    : DEFAULT_STAGES[0]

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setOverColumnId(null)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (!over) { setOverColumnId(null); return }
    const overId = over.id as string
    if (stages.some(s => s.id === overId)) {
      setOverColumnId(overId)
    } else {
      const overCard = candidats?.find((c: any) => c.id === overId)
      if (overCard) setOverColumnId(overCard.statut_pipeline)
    }
  }, [candidats, stages])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null)
    setOverColumnId(null)
    const { active, over } = event
    if (!over) return

    const draggableId = active.id as string
    let newEtape: string | undefined

    const isColumn = stages.some(s => s.id === over.id)
    if (isColumn) {
      newEtape = over.id as string
    } else {
      const overCandidat = candidats?.find((c: any) => c.id === over.id)
      if (overCandidat) {
        newEtape = overCandidat.statut_pipeline as string
      }
    }

    if (!newEtape) return
    const candidat = candidats?.find((c: any) => c.id === draggableId)
    if (!candidat || candidat.statut_pipeline === newEtape) return

    // Optimistic update
    queryClient.setQueryData(['pipeline-candidats', offreFilter], (old: any[] | undefined) =>
      old?.map(c => c.id === draggableId ? { ...c, statut_pipeline: newEtape } : c)
    )

    const { error } = await supabase
      .from('candidats')
      .update({ statut_pipeline: newEtape })
      .eq('id', draggableId)

    if (error) {
      // Check for enum constraint error — custom stage IDs need text column migration
      if (error.message?.toLowerCase().includes('invalid input value for enum') ||
          error.message?.toLowerCase().includes('enum') ||
          error.code === '22P02') {
        toast.error(
          'Migration requise — exécutez dans Supabase Dashboard: ALTER TABLE candidats ALTER COLUMN statut_pipeline TYPE text USING statut_pipeline::text;',
          { duration: 10000 }
        )
      } else {
        toast.error('Erreur mise à jour')
      }
      queryClient.invalidateQueries({ queryKey: ['pipeline-candidats'] })
    } else {
      if (offreFilter !== 'tous') {
        await supabase
          .from('pipeline')
          .update({ etape: newEtape })
          .eq('candidat_id', draggableId)
          .eq('offre_id', offreFilter)
      }
      const etapeLabel = stages.find(s => s.id === newEtape)?.label || newEtape
      toast.success(`${candidat.prenom || ''} ${candidat.nom} → ${etapeLabel}`)
      queryClient.invalidateQueries({ queryKey: ['candidats'] })

      const candidatNom = `${candidat.prenom || ''} ${candidat.nom}`.trim()
      logActivity({
        type: 'statut_change',
        titre: `${candidatNom} déplacé vers ${etapeLabel}`,
        candidat_id: draggableId,
        candidat_nom: candidatNom,
      })
    }
  }, [candidats, offreFilter, queryClient, stages])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    setOverColumnId(null)
  }, [])

  const handleRemoveFromPipeline = useCallback(async (candidatId: string) => {
    queryClient.setQueryData(['pipeline-candidats', offreFilter], (old: any[] | undefined) =>
      old?.filter(c => c.id !== candidatId)
    )
    const { error } = await supabase
      .from('candidats')
      .update({ statut_pipeline: null })
      .eq('id', candidatId)
    if (error) {
      toast.error('Erreur lors du retrait')
      queryClient.invalidateQueries({ queryKey: ['pipeline-candidats'] })
    } else {
      toast.success('Candidat retiré du pipeline')
    }
  }, [offreFilter, queryClient])

  const handleNoteOpen = useCallback((candidatId: string, name: string, notes: string) => {
    setNotesModal({ candidatId, name, notes })
  }, [])

  return (
    <div style={{ padding: '20px 24px', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ─── Header ─── */}
      <div style={{ marginBottom: showStageManager ? 12 : 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--primary), rgba(247,201,72,0.6))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LayoutGrid size={20} color="var(--primary-foreground)" />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', margin: 0, letterSpacing: '-0.02em' }}>
                Pipeline
              </h1>
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>
                {total} candidat{total > 1 ? 's' : ''} {searchQuery ? 'trouvés' : 'au total'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Settings / manage stages button */}
            <button
              onClick={() => setShowStageManager(prev => !prev)}
              title="Gérer les étapes"
              style={{
                width: 38, height: 38, borderRadius: 10,
                border: showStageManager ? '2px solid var(--primary)' : '2px solid var(--border)',
                background: showStageManager ? 'rgba(var(--primary-rgb, 59 130 246), 0.08)' : 'var(--secondary)',
                color: showStageManager ? 'var(--primary)' : 'var(--muted-foreground)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <Settings size={16} />
            </button>

            {/* Ajouter un candidat */}
            <div style={{ position: 'relative', width: 280 }}>
              <UserPlus size={14} style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: addSearch ? 'var(--primary)' : 'var(--muted-foreground)',
              }} />
              <input
                type="text"
                placeholder="Ajouter un candidat..."
                value={addSearch}
                onChange={e => searchCandidatToAdd(e.target.value)}
                onFocus={() => { if (addResults.length) setShowAddDropdown(true) }}
                onBlur={() => setTimeout(() => setShowAddDropdown(false), 200)}
                style={{
                  width: '100%', padding: '9px 12px 9px 34px',
                  background: 'var(--card)', border: '2px solid var(--primary)',
                  borderRadius: 10, color: 'var(--foreground)', fontSize: 13,
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              {showAddDropdown && addResults.length > 0 && (
                <div
                  onMouseDown={e => e.preventDefault()}
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                    background: 'var(--card)', border: '2px solid var(--border)',
                    borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                    maxHeight: 320, overflowY: 'auto', zIndex: 100,
                  }}
                >
                  {addResults.map((c: any) => (
                    <div key={c.id} style={{
                      padding: '10px 14px', borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                            {c.prenom} {c.nom}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                            {c.titre_poste || ''}{c.localisation ? ` · ${c.localisation}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => addCandidatToPipeline(c, visibleStages[0]?.id || 'nouveau')}
                          style={{
                            padding: '5px 12px', borderRadius: 6,
                            background: 'var(--primary)', border: 'none',
                            color: 'white', fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          + Ajouter
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Offre filter */}
            <Select value={offreFilter} onValueChange={setOffreFilter}>
              <SelectTrigger style={{
                width: 200, background: 'var(--secondary)',
                border: '2px solid var(--border)', borderRadius: 10,
                color: 'var(--foreground)', height: 38,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Filter size={13} color="var(--muted-foreground)" />
                  <SelectValue placeholder="Toutes les offres" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les candidats</SelectItem>
                {offres?.map(o => <SelectItem key={o.id} value={o.id}>{o.titre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stage manager panel */}
        <AnimatePresence>
          {showStageManager && stagesLoaded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <StageManagerPanel
                stages={stages}
                onSave={saveStages}
                candidatsByEtape={candidatsByEtape}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats bar */}
        {!showStageManager && (
          <StatsBar stages={stages} candidatsByEtape={candidatsByEtape} />
        )}
      </div>

      {/* ─── Board ─── */}
      {isLoading ? (
        <div style={{ display: 'flex', gap: 12, flex: 1 }}>
          {visibleStages.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              style={{
                flex: 1, background: 'var(--secondary)', borderRadius: 16,
                border: '2px solid var(--border)',
              }}
            >
              <div style={{ padding: 16 }}>
                <div style={{ height: 12, width: 80, background: 'var(--border)', borderRadius: 6, marginBottom: 12 }} />
                {[1, 2, 3].map(j => (
                  <div key={j} style={{
                    height: 80, background: 'var(--card)', borderRadius: 12,
                    border: '2px solid var(--border)', marginBottom: 8,
                    animation: 'pulse 2s infinite',
                  }} />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      ) : total === 0 && !searchQuery ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{
            textAlign: 'center', padding: 40,
            background: 'var(--card)', borderRadius: 20,
            border: '2px solid var(--border)',
            maxWidth: 400,
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: 'var(--secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <UserPlus size={28} color="var(--muted-foreground)" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 8px' }}>
              Pipeline vide
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.6 }}>
              Importez des CVs depuis la page Candidats pour peupler votre pipeline de recrutement.
            </p>
          </div>
        </motion.div>
      ) : total === 0 && searchQuery ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <Search size={32} color="var(--muted-foreground)" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-foreground)' }}>
              Aucun résultat pour &laquo; {searchQuery} &raquo;
            </p>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div style={{
            display: 'flex', gap: 12, flex: 1,
            overflowX: 'auto', paddingBottom: 8, paddingRight: 4, minHeight: 0,
          }}>
            {visibleStages.map((stage) => {
              const { bgSoft, borderColor } = colorSoft(stage.color)
              const stageCandidats = candidatsByEtape[stage.id] || []
              return (
                <div
                  key={stage.id}
                  style={{
                    flex: 1, minWidth: 240, maxWidth: 320,
                    display: 'flex', flexDirection: 'column', minHeight: 0,
                  }}
                >
                  {/* Column header */}
                  <div style={{
                    borderRadius: '16px 16px 0 0',
                    padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: bgSoft,
                    borderTop: `3px solid ${stage.color}`,
                    borderLeft: `2px solid ${borderColor}`,
                    borderRight: `2px solid ${borderColor}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: stage.color,
                        boxShadow: `0 0 8px ${stage.color}66`,
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: stage.color }}>
                        {stage.label}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 800, color: stage.color,
                      background: `${stage.color}18`,
                      padding: '2px 10px', borderRadius: 8,
                      minWidth: 28, textAlign: 'center',
                    }}>
                      {stageCandidats.length}
                    </span>
                  </div>

                  {/* Droppable area */}
                  <DroppableColumn stage={stage} isActive={overColumnId === stage.id}>
                    <SortableContext
                      items={stageCandidats.map((c: any) => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {stageCandidats.map((item: any) => (
                        <DraggableCard
                          key={item.id}
                          item={item}
                          stage={stage}
                          onRemove={() => handleRemoveFromPipeline(item.id)}
                          onNote={handleNoteOpen}
                        />
                      ))}
                    </SortableContext>
                    {stageCandidats.length === 0 && (
                      <div style={{
                        padding: '32px 16px', textAlign: 'center',
                        borderRadius: 12, border: '2px dashed var(--border)',
                        margin: 4,
                      }}>
                        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0 }}>
                          Glissez un candidat ici
                        </p>
                      </div>
                    )}
                  </DroppableColumn>
                </div>
              )
            })}
          </div>

          <DragOverlay>
            {activeItem ? (
              <OverlayCard item={activeItem} stage={activeStage} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ─── Notes Modal (page-level, above DnD) ─── */}
      {notesModal && (
        <NotesModal
          candidatId={notesModal.candidatId}
          name={notesModal.name}
          initialNotes={notesModal.notes}
          offreFilter={offreFilter}
          onClose={() => setNotesModal(null)}
        />
      )}
    </div>
  )
}
