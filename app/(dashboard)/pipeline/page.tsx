'use client'
import { useState, memo } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Star, GripVertical, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import type { PipelineEtape } from '@/types/database'

const supabase = createClient()

const ETAPES: {
  id: PipelineEtape
  label: string
  color: string
  headerBg: string
  headerBorder: string
  dotColor: string
  emoji: string
}[] = [
  { id: 'nouveau',   label: 'Nouveau',   color: '#0EA5E9', headerBg: '#F0F9FF', headerBorder: '#BAE6FD', dotColor: '#0EA5E9', emoji: '🆕' },
  { id: 'contacte',  label: 'Contacté',  color: '#F5A623', headerBg: '#FFF7ED', headerBorder: '#FDE68A', dotColor: '#F5A623', emoji: '📞' },
  { id: 'entretien', label: 'Entretien', color: '#8B5CF6', headerBg: '#F5F3FF', headerBorder: '#DDD6FE', dotColor: '#8B5CF6', emoji: '🤝' },
  { id: 'place',     label: 'Placé',     color: '#16A34A', headerBg: '#F0FDF4', headerBorder: '#86EFAC', dotColor: '#16A34A', emoji: '✅' },
  { id: 'refuse',    label: 'Refusé',    color: '#DC2626', headerBg: '#FEF2F2', headerBorder: '#FECACA', dotColor: '#DC2626', emoji: '❌' },
]

function scoreColor(score: number | null) {
  if (score === null) return '#CBD5E1'
  if (score >= 75) return '#16A34A'
  if (score >= 50) return '#F5A623'
  return '#DC2626'
}

const CandidatCard = memo(function CandidatCard({ provided, snapshot, item }: { provided: any; snapshot: any; item: any }) {
  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={{
        ...provided.draggableProps.style,
        background: 'white',
        borderRadius: 10,
        padding: 12,
        border: `1.5px solid ${snapshot.isDragging ? 'var(--primary)' : 'var(--border)'}`,
        cursor: snapshot.isDragging ? 'grabbing' : 'grab',
        boxShadow: snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <GripVertical size={14} style={{ color: '#CBD5E1', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.prenom} {item.nom}
          </p>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.titre_poste || 'Sans titre'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            {item.localisation && (
              <span style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <MapPin size={10} />{item.localisation}
              </span>
            )}
            {item.score_ia != null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(item.score_ia), display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                <Star size={11} />{item.score_ia}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

export default function PipelinePage() {
  const [offreFilter, setOffreFilter] = useState<string>('tous')
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
          .select('id, nom, prenom, titre_poste, annees_exp, statut_pipeline, email, localisation')
          .order('created_at', { ascending: false })
        if (error) throw error
        return data || []
      } else {
        const { data: pipelineData, error } = await supabase
          .from('pipeline')
          .select('etape, candidat_id, score_ia, candidats(id, nom, prenom, titre_poste, annees_exp, statut_pipeline, email, localisation)')
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

  const candidatsByEtape = ETAPES.reduce((acc, e) => {
    acc[e.id] = (candidats || []).filter((c: any) => c.statut_pipeline === e.id)
    return acc
  }, {} as Record<PipelineEtape, any[]>)

  const total = candidats?.length || 0

  const onDragEnd = async (result: DropResult) => {
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
      toast.success(`→ ${ETAPES.find(e => e.id === newEtape)?.label}`)
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
    }
  }

  return (
    <div style={{ padding: 24, height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Pipeline</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            {total} candidat{total > 1 ? 's' : ''} · Glissez-déposez pour changer d&apos;étape
          </p>
        </div>
        <Select value={offreFilter} onValueChange={setOffreFilter}>
          <SelectTrigger style={{ width: 220, background: 'var(--secondary)', border: '1.5px solid var(--border)', color: 'var(--foreground)' }}>
            <SelectValue placeholder="Toutes les offres" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les candidats</SelectItem>
            {offres?.map(o => <SelectItem key={o.id} value={o.id}>{o.titre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', gap: 12, flex: 1 }}>
          {ETAPES.map(e => (
            <div key={e.id} style={{ flex: 1, background: 'var(--secondary)', borderRadius: 12, animation: 'pulse 2s infinite', border: '1.5px solid var(--border)' }} />
          ))}
        </div>
      ) : total === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', margin: 0 }}>Aucun candidat dans le pipeline</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Importez des CVs depuis la page Candidats pour commencer</p>
          </div>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{ display: 'flex', gap: 12, flex: 1, overflowX: 'auto', paddingBottom: 8, minHeight: 0 }}>
            {ETAPES.map(etape => (
              <div key={etape.id} style={{ flex: 1, minWidth: 190, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Column header */}
                <div style={{
                  borderRadius: '12px 12px 0 0',
                  padding: '10px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: etape.headerBg,
                  border: `1.5px solid ${etape.headerBorder}`,
                  borderBottom: 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{etape.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: etape.color }}>{etape.label}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--secondary)', padding: '2px 7px', borderRadius: 6 }}>
                    {candidatsByEtape[etape.id].length}
                  </span>
                </div>

                <Droppable droppableId={etape.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 8,
                        borderRadius: '0 0 12px 12px',
                        border: `1.5px solid ${snapshot.isDraggingOver ? 'var(--primary)' : etape.headerBorder}`,
                        borderTop: 'none',
                        background: snapshot.isDraggingOver ? '#FFFBEB' : 'var(--secondary)',
                        minHeight: 80, overflowY: 'auto',
                        transition: 'background 0.2s, border-color 0.2s',
                      }}
                    >
                      {candidatsByEtape[etape.id].map((item: any, index: number) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <CandidatCard provided={provided} snapshot={snapshot} item={item} />
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {candidatsByEtape[etape.id].length === 0 && !snapshot.isDraggingOver && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>Aucun candidat</p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  )
}
