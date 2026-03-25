'use client'
import { useState, useCallback, useMemo, memo } from 'react'
import { DndContext, DragOverlay, closestCenter, useSensor, useSensors, PointerSensor, DragStartEvent, DragEndEvent, DragOverEvent, useDroppable } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion } from 'framer-motion'
import {
  Star, GripVertical, MapPin, Search, Calendar, MessageSquare,
  ChevronDown, Clock, Eye, UserPlus, Briefcase, X,
  TrendingUp, Filter, LayoutGrid, Pencil, Check
} from 'lucide-react'
import { toast } from 'sonner'
import { logActivity } from '@/hooks/useActivites'
import type { PipelineEtape } from '@/types/database'

const supabase = createClient()

const ETAPES: {
  id: PipelineEtape
  label: string
  color: string
  bgSoft: string
  borderColor: string
  icon: string
}[] = [
  { id: 'nouveau',   label: 'Nouveau',   color: '#3B82F6', bgSoft: 'rgba(59,130,246,0.08)',  borderColor: 'rgba(59,130,246,0.2)',  icon: '' },
  { id: 'contacte',  label: 'Contacté',  color: '#F59E0B', bgSoft: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)', icon: '' },
  { id: 'entretien', label: 'Entretien', color: '#8B5CF6', bgSoft: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.2)', icon: '' },
  { id: 'place',     label: 'Placé',     color: '#10B981', bgSoft: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)', icon: '' },
  { id: 'refuse',    label: 'Refusé',    color: '#EF4444', bgSoft: 'rgba(239,68,68,0.08)',  borderColor: 'rgba(239,68,68,0.2)',  icon: '' },
]

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

/* ─────── Quick Action Button ─────── */
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

/* ─────── Droppable Column ─────── */
function DroppableColumn({ id, children, isActive }: { id: string; children: React.ReactNode; isActive?: boolean }) {
  const { setNodeRef } = useDroppable({ id })
  const etape = ETAPES.find(e => e.id === id)!

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 8,
        borderRadius: '0 0 16px 16px',
        borderLeft: `2px solid ${isActive ? etape.color : etape.borderColor}`,
        borderRight: `2px solid ${isActive ? etape.color : etape.borderColor}`,
        borderBottom: `2px solid ${isActive ? etape.color : etape.borderColor}`,
        background: isActive ? `${etape.color}12` : 'var(--secondary)',
        minHeight: 100, overflowY: 'auto',
        transition: 'background 0.25s, border-color 0.25s',
      }}
    >
      {children}
    </div>
  )
}

/* ─────── Draggable Card ─────── */
function DraggableCard({ item, etapeColor, onRemove }: { item: any; etapeColor: string; onRemove: () => void }) {
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
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `linear-gradient(135deg, ${etapeColor}22, ${etapeColor}44)`,
          border: `2px solid ${etapeColor}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: etapeColor,
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

      {/* Quick actions on hover */}
      {hovered && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            marginTop: 10, paddingTop: 10,
            borderTop: '1px solid var(--border)',
          }}
        >
          <QuickAction icon={Eye} label="Voir profil" onClick={() => window.location.href = `/candidats/${item.id}?from=pipeline`} />
          <QuickAction icon={Calendar} label="Planifier entretien" color="#8B5CF6" onClick={() => window.location.href = '/entretiens'} />
          <QuickAction icon={MessageSquare} label="Envoyer CV" color="#3B82F6" onClick={() => window.location.href = '/messages'} />
          <QuickAction icon={X} label="Retirer du pipeline" color="#EF4444" onClick={() => onRemove()} />
        </div>
      )}
    </div>
  )
}

/* ─────── Overlay Card (shown while dragging) ─────── */
function OverlayCard({ item, etapeColor }: { item: any; etapeColor: string }) {
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
          background: `linear-gradient(135deg, ${etapeColor}22, ${etapeColor}44)`,
          border: `2px solid ${etapeColor}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: etapeColor,
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

/* ─────── Stats Bar ─────── */
function StatsBar({ candidatsByEtape }: { candidatsByEtape: Record<PipelineEtape, any[]> }) {
  const total = ETAPES.reduce((sum, e) => sum + candidatsByEtape[e.id].length, 0)
  if (total === 0) return null

  return (
    <div style={{
      display: 'flex', height: 4, borderRadius: 99, overflow: 'hidden',
      background: 'var(--secondary)', marginBottom: 20,
    }}>
      {ETAPES.map(e => {
        const pct = (candidatsByEtape[e.id].length / total) * 100
        if (pct === 0) return null
        return (
          <motion.div
            key={e.id}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ background: e.color, minWidth: pct > 0 ? 4 : 0 }}
            title={`${e.label}: ${candidatsByEtape[e.id].length}`}
          />
        )
      })}
    </div>
  )
}

/* ─────── Main Page ─────── */
const PIPELINE_LABELS_LS_KEY = 'tf_pipeline_labels'
function getSavedLabels(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(PIPELINE_LABELS_LS_KEY) || '{}') } catch { return {} }
}

export default function PipelinePage() {
  const [offreFilter, setOffreFilter] = useState<string>('tous')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Labels personnalisables pour chaque colonne pipeline
  const [customLabels, setCustomLabels] = useState<Record<string, string>>(getSavedLabels)
  const [editingEtape, setEditingEtape] = useState<string | null>(null)
  const [editLabelValue, setEditLabelValue] = useState('')

  const getEtapeLabel = (etape: typeof ETAPES[number]) => customLabels[etape.id] || etape.label

  const startEditLabel = (etapeId: string, currentLabel: string) => {
    setEditingEtape(etapeId)
    setEditLabelValue(currentLabel)
  }
  const saveLabel = (etapeId: string) => {
    const trimmed = editLabelValue.trim()
    if (trimmed) {
      const updated = { ...customLabels, [etapeId]: trimmed }
      setCustomLabels(updated)
      localStorage.setItem(PIPELINE_LABELS_LS_KEY, JSON.stringify(updated))
    }
    setEditingEtape(null)
  }

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

  // Barre de recherche pour ajouter un candidat à la pipeline
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState<any[]>([])
  const [addLoading, setAddLoading] = useState(false)
  const [showAddDropdown, setShowAddDropdown] = useState(false)

  const searchCandidatToAdd = useCallback(async (q: string) => {
    setAddSearch(q)
    if (q.length < 2) { setAddResults([]); setShowAddDropdown(false); return }
    setAddLoading(true)
    // Normaliser accents pour recherche flexible
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const qNorm = normalize(q)
    // Fetch plus de résultats et filtrer côté client (accent-insensitive)
    const { data } = await supabase
      .from('candidats')
      .select('id, nom, prenom, titre_poste, localisation, statut_pipeline')
      .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,titre_poste.ilike.%${q}%,localisation.ilike.%${q}%`)
      .limit(50)
    // Filtre accent-insensitive côté client
    const filtered = (data || []).filter((c: any) => {
      const haystack = normalize(`${c.prenom || ''} ${c.nom || ''} ${c.titre_poste || ''} ${c.localisation || ''}`)
      return haystack.includes(qNorm)
    }).slice(0, 15)
    setAddResults(filtered)
    setShowAddDropdown(true)
    setAddLoading(false)
  }, [])

  const addCandidatToPipeline = useCallback(async (candidat: any, etape: PipelineEtape) => {
    try {
      // Utiliser l'API pour contourner les RLS
      const res = await fetch(`/api/candidats/${candidat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut_pipeline: etape }),
      })
      if (!res.ok) {
        // Fallback : update direct
        const { error } = await supabase.from('candidats').update({ statut_pipeline: etape }).eq('id', candidat.id)
        if (error) throw error
      }
      queryClient.invalidateQueries({ queryKey: ['pipeline-candidats'] })
      toast.success(`${candidat.prenom || ''} ${candidat.nom} ajouté à ${ETAPES.find(e => e.id === etape)?.label}`)
      setAddSearch('')
      setAddResults([])
      setShowAddDropdown(false)
      logActivity({
        type: 'statut_change',
        titre: `${candidat.prenom || ''} ${candidat.nom} ajouté au pipeline — ${ETAPES.find(e => e.id === etape)?.label}`,
        candidat_id: candidat.id,
        candidat_nom: `${candidat.prenom || ''} ${candidat.nom}`,
      })
    } catch (err: any) {
      toast.error(`Erreur : ${err.message}`)
    }
  }, [queryClient, supabase])

  const { data: candidats, isLoading } = useQuery({
    queryKey: ['pipeline-candidats', offreFilter],
    queryFn: async () => {
      if (offreFilter === 'tous') {
        // Tous les candidats ayant un statut_pipeline (ajoutés manuellement ou via import)
        const { data, error } = await supabase
          .from('candidats')
          .select('id, nom, prenom, titre_poste, annees_exp, date_naissance, statut_pipeline, email, localisation, updated_at, created_at')
          .not('statut_pipeline', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(500)
        if (error) throw error
        return data || []
      } else {
        const { data: pipelineData, error } = await supabase
          .from('pipeline')
          .select('etape, candidat_id, score_ia, candidats(id, nom, prenom, titre_poste, annees_exp, date_naissance, statut_pipeline, email, localisation, updated_at, created_at)')
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

  // Filter candidats by search
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

  const candidatsByEtape = useMemo(() => {
    return ETAPES.reduce((acc, e) => {
      acc[e.id] = (filteredCandidats || []).filter((c: any) => c.statut_pipeline === e.id)
      return acc
    }, {} as Record<PipelineEtape, any[]>)
  }, [filteredCandidats])

  const total = filteredCandidats?.length || 0

  // Find the active item and its etape color for the overlay
  const activeItem = activeId ? candidats?.find((c: any) => c.id === activeId) : null
  const activeEtapeColor = activeItem
    ? ETAPES.find(e => e.id === activeItem.statut_pipeline)?.color || '#3B82F6'
    : '#3B82F6'

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setOverColumnId(null)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (!over) { setOverColumnId(null); return }
    const overId = over.id as string
    // Check if directly over a column
    if (ETAPES.some(e => e.id === overId)) {
      setOverColumnId(overId)
    } else {
      // Over a card — find its column
      const overCard = candidats?.find((c: any) => c.id === overId)
      if (overCard) setOverColumnId(overCard.statut_pipeline)
    }
  }, [candidats])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null)
    setOverColumnId(null)
    const { active, over } = event
    if (!over) return

    const draggableId = active.id as string
    // The over.id could be a column id (etape) or another card id
    // We need to determine which column was dropped into
    let newEtape: PipelineEtape | undefined

    // Check if dropped over a column directly
    const isColumn = ETAPES.some(e => e.id === over.id)
    if (isColumn) {
      newEtape = over.id as PipelineEtape
    } else {
      // Dropped over another card — find which column that card belongs to
      const overCandidat = candidats?.find((c: any) => c.id === over.id)
      if (overCandidat) {
        newEtape = overCandidat.statut_pipeline as PipelineEtape
      }
    }

    if (!newEtape) return
    const candidat = candidats?.find((c: any) => c.id === draggableId)
    if (!candidat || candidat.statut_pipeline === newEtape) return

    queryClient.setQueryData(['pipeline-candidats', offreFilter], (old: any[] | undefined) =>
      old?.map(c => c.id === draggableId ? { ...c, statut_pipeline: newEtape } : c)
    )

    const { error } = await supabase
      .from('candidats')
      .update({ statut_pipeline: newEtape })
      .eq('id', draggableId)

    if (error) {
      toast.error('Erreur mise à jour')
      queryClient.invalidateQueries({ queryKey: ['pipeline-candidats'] })
    } else {
      if (offreFilter !== 'tous') {
        await supabase
          .from('pipeline')
          .update({ etape: newEtape })
          .eq('candidat_id', draggableId)
          .eq('offre_id', offreFilter)
      }
      const etapeLabel = ETAPES.find(e => e.id === newEtape)?.label
      toast.success(`${candidat.prenom || ''} ${candidat.nom} \u2192 ${etapeLabel}`)
      queryClient.invalidateQueries({ queryKey: ['candidats'] })

      // Log activité équipe
      const candidatNom = `${candidat.prenom || ''} ${candidat.nom}`.trim()
      logActivity({
        type: 'statut_change',
        titre: `${candidatNom} déplacé vers ${etapeLabel}`,
        candidat_id: draggableId,
        candidat_nom: candidatNom,
      })
    }
  }, [candidats, offreFilter, queryClient])

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

  return (
    <div style={{ padding: '20px 24px', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ─── Header ─── */}
      <div style={{ marginBottom: 20 }}>
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
            {/* Ajouter un candidat à la pipeline */}
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
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                  background: 'var(--card)', border: '2px solid var(--border)',
                  borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                  maxHeight: 320, overflowY: 'auto', zIndex: 100,
                }}>
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
                          onClick={() => addCandidatToPipeline(c, 'nouveau')}
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

        {/* Stats bar */}
        <StatsBar candidatsByEtape={candidatsByEtape} />
      </div>

      {/* ─── Board ─── */}
      {isLoading ? (
        <div style={{ display: 'flex', gap: 12, flex: 1 }}>
          {ETAPES.map((e, i) => (
            <motion.div
              key={e.id}
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
            {ETAPES.map((etape) => (
              <div
                key={etape.id}
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
                  background: etape.bgSoft,
                  borderTop: `3px solid ${etape.color}`,
                  borderLeft: `2px solid ${etape.borderColor}`,
                  borderRight: `2px solid ${etape.borderColor}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: etape.color,
                      boxShadow: `0 0 8px ${etape.color}66`,
                    }} />
                    {editingEtape === etape.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          autoFocus
                          value={editLabelValue}
                          onChange={e => setEditLabelValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveLabel(etape.id); if (e.key === 'Escape') setEditingEtape(null) }}
                          style={{
                            fontSize: 13, fontWeight: 700, color: etape.color,
                            border: `1px solid ${etape.color}66`, borderRadius: 6,
                            padding: '2px 8px', width: 120, outline: 'none',
                            background: 'white', fontFamily: 'inherit',
                          }}
                        />
                        <button onClick={() => saveLabel(etape.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                          <Check size={14} color={etape.color} />
                        </button>
                      </div>
                    ) : (
                      <span
                        style={{ fontSize: 13, fontWeight: 700, color: etape.color, cursor: 'pointer' }}
                        onDoubleClick={() => startEditLabel(etape.id, getEtapeLabel(etape))}
                        title="Double-cliquez pour renommer"
                      >
                        {getEtapeLabel(etape)}
                      </span>
                    )}
                    {editingEtape !== etape.id && (
                      <button
                        onClick={() => startEditLabel(etape.id, getEtapeLabel(etape))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }}
                        title="Renommer cette colonne"
                      >
                        <Pencil size={11} color={etape.color} />
                      </button>
                    )}
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 800, color: etape.color,
                    background: `${etape.color}18`,
                    padding: '2px 10px', borderRadius: 8,
                    minWidth: 28, textAlign: 'center',
                  }}>
                    {candidatsByEtape[etape.id].length}
                  </span>
                </div>

                {/* Droppable area */}
                <DroppableColumn id={etape.id} isActive={overColumnId === etape.id}>
                  <SortableContext
                    items={candidatsByEtape[etape.id].map((c: any) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {candidatsByEtape[etape.id].map((item: any) => (
                      <DraggableCard
                        key={item.id}
                        item={item}
                        etapeColor={etape.color}
                        onRemove={() => handleRemoveFromPipeline(item.id)}
                      />
                    ))}
                  </SortableContext>
                  {candidatsByEtape[etape.id].length === 0 && (
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
            ))}
          </div>

          <DragOverlay>
            {activeItem ? (
              <OverlayCard item={activeItem} etapeColor={activeEtapeColor} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
