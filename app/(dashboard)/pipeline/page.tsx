'use client'
import { useState, memo, useCallback, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Star, GripVertical, MapPin, Search, Calendar, MessageSquare,
  ArrowRight, ChevronDown, Clock, Eye, UserPlus, Briefcase,
  TrendingUp, Filter, LayoutGrid
} from 'lucide-react'
import { toast } from 'sonner'
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
  { id: 'nouveau',   label: 'Nouveau',   color: '#3B82F6', bgSoft: 'rgba(59,130,246,0.08)',  borderColor: 'rgba(59,130,246,0.2)',  icon: '+" ' },
  { id: 'contacte',  label: 'Contact\u00e9',  color: '#F59E0B', bgSoft: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)', icon: '' },
  { id: 'entretien', label: 'Entretien', color: '#8B5CF6', bgSoft: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.2)', icon: '' },
  { id: 'place',     label: 'Plac\u00e9',     color: '#10B981', bgSoft: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)', icon: '' },
  { id: 'refuse',    label: 'Refus\u00e9',    color: '#EF4444', bgSoft: 'rgba(239,68,68,0.08)',  borderColor: 'rgba(239,68,68,0.2)',  icon: '' },
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

/* ─────── Candidate Card ─────── */
const CandidatCard = memo(function CandidatCard({
  provided, snapshot, item, etapeColor
}: { provided: any; snapshot: any; item: any; etapeColor: string }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...provided.draggableProps.style,
        background: 'var(--card)',
        borderRadius: 14,
        padding: '14px 16px',
        border: `2px solid ${snapshot.isDragging ? 'var(--primary)' : hovered ? 'rgba(255,255,255,0.12)' : 'var(--border)'}`,
        cursor: snapshot.isDragging ? 'grabbing' : 'grab',
        boxShadow: snapshot.isDragging
          ? '0 20px 40px rgba(0,0,0,0.35), 0 0 0 1px var(--primary)'
          : hovered
            ? '0 4px 16px rgba(0,0,0,0.2)'
            : '0 1px 3px rgba(0,0,0,0.1)',
        userSelect: 'none',
        transform: snapshot.isDragging ? 'rotate(2deg)' : 'none',
        transition: snapshot.isDragging ? 'none' : 'border-color 0.2s, box-shadow 0.2s',
      }}
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
        {item.annees_exp > 0 && (
          <span style={{
            fontSize: 10, color: 'var(--muted-foreground)',
            display: 'flex', alignItems: 'center', gap: 3,
            background: 'var(--secondary)', padding: '2px 8px', borderRadius: 6,
          }}>
            <Briefcase size={9} />{item.annees_exp}ans
          </span>
        )}
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
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              marginTop: 10, paddingTop: 10,
              borderTop: '1px solid var(--border)',
            }}
          >
            <QuickAction icon={Eye} label="Voir profil" />
            <QuickAction icon={Calendar} label="Planifier entretien" color="#8B5CF6" />
            <QuickAction icon={MessageSquare} label="Ajouter note" color="#3B82F6" />
            <QuickAction icon={ArrowRight} label="D\u00e9placer" color="#F59E0B" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

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
export default function PipelinePage() {
  const [offreFilter, setOffreFilter] = useState<string>('tous')
  const [searchQuery, setSearchQuery] = useState('')
  const queryClient = useQueryClient()

  const { data: offres } = useQuery({
    queryKey: ['offres-pipeline'],
    queryFn: async () => {
      const { data } = await supabase.from('offres').select('id, titre').eq('statut', 'active')
      return data || []
    },
  })

  const { data: candidats, isLoading } = useQuery({
    queryKey: ['pipeline-candidats', offreFilter],
    queryFn: async () => {
      if (offreFilter === 'tous') {
        const { data, error } = await supabase
          .from('candidats')
          .select('id, nom, prenom, titre_poste, annees_exp, statut_pipeline, email, localisation, updated_at, created_at')
          .order('created_at', { ascending: false })
        if (error) throw error
        return data || []
      } else {
        const { data: pipelineData, error } = await supabase
          .from('pipeline')
          .select('etape, candidat_id, score_ia, candidats(id, nom, prenom, titre_poste, annees_exp, statut_pipeline, email, localisation, updated_at, created_at)')
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

  const onDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination } = result
    const newEtape = destination.droppableId as PipelineEtape
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
      toast.error('Erreur mise \u00e0 jour')
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
    }
  }, [candidats, offreFilter, queryClient])

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
                {total} candidat{total > 1 ? 's' : ''} {searchQuery ? 'trouv\u00e9s' : 'au total'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Search */}
            <div style={{
              position: 'relative', width: 240,
            }}>
              <Search size={14} style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--muted-foreground)',
              }} />
              <input
                type="text"
                placeholder="Rechercher un candidat..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px 9px 34px',
                  background: 'var(--secondary)', border: '2px solid var(--border)',
                  borderRadius: 10, color: 'var(--foreground)', fontSize: 13,
                  outline: 'none', fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
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
              Aucun r\u00e9sultat pour &laquo; {searchQuery} &raquo;
            </p>
          </div>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{
            display: 'flex', gap: 12, flex: 1,
            overflowX: 'auto', paddingBottom: 8, minHeight: 0,
          }}>
            {ETAPES.map((etape, colIndex) => (
              <motion.div
                key={etape.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: colIndex * 0.06, duration: 0.4 }}
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
                    <span style={{ fontSize: 13, fontWeight: 700, color: etape.color }}>
                      {etape.label}
                    </span>
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
                <Droppable droppableId={etape.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 8,
                        borderRadius: '0 0 16px 16px',
                        borderLeft: `2px solid ${snapshot.isDraggingOver ? etape.color : etape.borderColor}`,
                        borderRight: `2px solid ${snapshot.isDraggingOver ? etape.color : etape.borderColor}`,
                        borderBottom: `2px solid ${snapshot.isDraggingOver ? etape.color : etape.borderColor}`,
                        background: snapshot.isDraggingOver
                          ? `${etape.color}08`
                          : 'var(--secondary)',
                        minHeight: 100, overflowY: 'auto',
                        transition: 'background 0.25s, border-color 0.25s',
                      }}
                    >
                      {candidatsByEtape[etape.id].map((item: any, index: number) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <CandidatCard
                              provided={provided}
                              snapshot={snapshot}
                              item={item}
                              etapeColor={etape.color}
                            />
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {candidatsByEtape[etape.id].length === 0 && !snapshot.isDraggingOver && (
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
                      {snapshot.isDraggingOver && candidatsByEtape[etape.id].length === 0 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          style={{
                            padding: '24px 16px', textAlign: 'center',
                            borderRadius: 12, border: `2px dashed ${etape.color}`,
                            background: `${etape.color}10`,
                          }}
                        >
                          <p style={{ fontSize: 12, fontWeight: 600, color: etape.color, margin: 0 }}>
                            D\u00e9poser ici
                          </p>
                        </motion.div>
                      )}
                    </div>
                  )}
                </Droppable>
              </motion.div>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  )
}
