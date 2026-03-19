'use client'
import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock, Star, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { PipelineEtape, VuePipelineComplet } from '@/types/database'

const supabase = createClient()

const ETAPES: {
  id: PipelineEtape
  label: string
  accent: string
  headerBg: string
  dotColor: string
}[] = [
  { id: 'nouveau',   label: 'Nouveau',   accent: 'text-sky-400',     headerBg: 'bg-sky-500/10 border-sky-500/15',     dotColor: 'bg-sky-400' },
  { id: 'contacte',  label: 'Contacté',  accent: 'text-primary',     headerBg: 'bg-primary/10 border-primary/15',     dotColor: 'bg-primary' },
  { id: 'entretien', label: 'Entretien', accent: 'text-violet-400',   headerBg: 'bg-violet-500/10 border-violet-500/15', dotColor: 'bg-violet-400' },
  { id: 'place',     label: 'Placé',     accent: 'text-emerald-400',  headerBg: 'bg-emerald-500/10 border-emerald-500/15', dotColor: 'bg-emerald-400' },
  { id: 'refuse',    label: 'Refusé',    accent: 'text-rose-400',     headerBg: 'bg-rose-500/10 border-rose-500/15',   dotColor: 'bg-rose-400' },
]

function scoreColor(score: number | null) {
  if (score === null) return 'text-white/30'
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-primary'
  return 'text-rose-400'
}

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

  const { data: pipelineData, isLoading } = useQuery({
    queryKey: ['pipeline', offreFilter],
    queryFn: async () => {
      let query = supabase
        .from('vue_pipeline_complet')
        .select('*')
        .order('score_ia', { ascending: false, nullsFirst: false })
      if (offreFilter !== 'tous') query = query.eq('offre_id', offreFilter)
      const { data, error } = await query
      if (error) throw error
      return data as VuePipelineComplet[]
    },
  })

  const candidatsByEtape = ETAPES.reduce((acc, e) => {
    acc[e.id] = pipelineData?.filter(p => p.etape === e.id) || []
    return acc
  }, {} as Record<PipelineEtape, VuePipelineComplet[]>)

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination } = result
    const newEtape = destination.droppableId as PipelineEtape
    const item = pipelineData?.find(p => p.id === draggableId)
    if (!item || item.etape === newEtape) return

    queryClient.setQueryData(['pipeline', offreFilter], (old: VuePipelineComplet[] | undefined) =>
      old?.map(p => p.id === draggableId ? { ...p, etape: newEtape } : p)
    )

    const { error } = await supabase.from('pipeline').update({ etape: newEtape }).eq('id', draggableId)
    if (error) {
      toast.error('Erreur mise à jour pipeline')
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    } else {
      toast.success(`Déplacé vers ${ETAPES.find(e => e.id === newEtape)?.label}`)
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
    }
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Pipeline</h1>
          <p className="text-sm text-white/40 mt-0.5">Glissez les candidats d&apos;une étape à l&apos;autre</p>
        </div>
        <Select value={offreFilter} onValueChange={setOffreFilter}>
          <SelectTrigger className="w-52 bg-white/5 border-white/8 text-white/60">
            <SelectValue placeholder="Toutes les offres" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Toutes les offres</SelectItem>
            {offres?.map(o => <SelectItem key={o.id} value={o.id}>{o.titre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex gap-3 flex-1">
          {ETAPES.map(e => (
            <div key={e.id} className="flex-1 bg-white/[0.03] rounded-xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 flex-1 overflow-x-auto pb-2">
            {ETAPES.map(etape => (
              <div key={etape.id} className="flex-1 min-w-[190px] flex flex-col">
                {/* Column header */}
                <div className={cn('rounded-t-xl px-3 py-2.5 flex items-center justify-between border border-b-0', etape.headerBg)}>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-1.5 h-1.5 rounded-full', etape.dotColor)} />
                    <span className={cn('text-xs font-semibold', etape.accent)}>{etape.label}</span>
                  </div>
                  <span className="text-xs font-bold text-white/30 bg-white/5 px-1.5 py-0.5 rounded-md">
                    {candidatsByEtape[etape.id].length}
                  </span>
                </div>

                <Droppable droppableId={etape.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        'flex-1 p-2 space-y-2 rounded-b-xl border border-t-0 min-h-[200px] transition-colors',
                        snapshot.isDraggingOver
                          ? 'bg-primary/5 border-primary/20'
                          : 'bg-white/[0.02] border-white/5'
                      )}
                    >
                      {candidatsByEtape[etape.id].map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={cn(
                                'bg-card rounded-lg p-3 border cursor-grab active:cursor-grabbing transition-all',
                                snapshot.isDragging
                                  ? 'shadow-2xl shadow-black/50 border-primary/30 rotate-1 scale-[1.02]'
                                  : 'border-white/6 hover:border-white/12'
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <div {...provided.dragHandleProps} className="mt-0.5 flex-shrink-0">
                                  <GripVertical className="w-3.5 h-3.5 text-white/20" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-white/80 truncate">
                                    {item.candidat_prenom} {item.candidat_nom}
                                  </p>
                                  <p className="text-[11px] text-white/30 truncate mt-0.5">
                                    {item.titre_poste || item.offre_titre}
                                  </p>
                                  <div className="flex items-center justify-between mt-2.5">
                                    <span className="text-[11px] text-white/25 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />{item.annees_exp}a
                                    </span>
                                    {item.score_ia !== null && (
                                      <span className={cn('text-[11px] font-bold flex items-center gap-0.5', scoreColor(item.score_ia))}>
                                        <Star className="w-3 h-3" />{item.score_ia}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {candidatsByEtape[etape.id].length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-[11px] text-white/20 text-center py-6">Aucun candidat</p>
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
