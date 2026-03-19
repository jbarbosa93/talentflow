'use client'
import { useState } from 'react'
import { Calendar, Clock, Video, MapPin, Phone, Plus, Users, Briefcase, CheckCircle, XCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEntretiens, useCreateEntretien, useUpdateEntretien, useDeleteEntretien } from '@/hooks/useEntretiens'
import { useCandidats } from '@/hooks/useCandidats'
import { useOffres } from '@/hooks/useOffres'
import { cn } from '@/lib/utils'

const STATUT_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  planifie: { label: 'Planifié', color: 'bg-primary/15 text-primary', icon: Clock },
  confirme: { label: 'Confirmé', color: 'bg-emerald-500/15 text-emerald-400', icon: CheckCircle },
  annule: { label: 'Annulé', color: 'bg-rose-500/15 text-rose-400', icon: XCircle },
  complete: { label: 'Terminé', color: 'bg-white/8 text-white/35', icon: CheckCircle },
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  visio: { label: 'Visio', icon: Video },
  presentiel: { label: 'Présentiel', icon: MapPin },
  telephone: { label: 'Téléphone', icon: Phone },
}

export default function EntretiensPage() {
  const [showCreate, setShowCreate] = useState(false)
  const { data: entretiens, isLoading } = useEntretiens()
  const updateEntretien = useUpdateEntretien()
  const deleteEntretien = useDeleteEntretien()

  const now = new Date()
  const upcoming = (entretiens || []).filter((e: any) => new Date(e.date_heure) >= now && e.statut !== 'annule' && e.statut !== 'complete')
  const past = (entretiens || []).filter((e: any) => new Date(e.date_heure) < now || e.statut === 'complete' || e.statut === 'annule')

  const EntretienCard = ({ entretien }: { entretien: any }) => {
    const typeConf = TYPE_CONFIG[entretien.type] || TYPE_CONFIG.visio
    const TypeIcon = typeConf.icon
    const statutConfig = STATUT_CONFIG[entretien.statut] || STATUT_CONFIG.planifie
    const date = new Date(entretien.date_heure)
    const isPast = date < now

    return (
      <div className={cn('rounded-xl border p-5 transition-all', isPast ? 'border-white/4 bg-white/[0.02] opacity-60' : 'border-white/6 bg-card hover:border-white/10')}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white/80 leading-tight">{entretien.titre}</h3>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {entretien.candidats && (
                <span className="text-xs text-white/40 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {entretien.candidats.prenom} {entretien.candidats.nom}
                </span>
              )}
              {entretien.offres && (
                <span className="text-xs text-white/30 flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />{entretien.offres.titre}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statutConfig.color}`}>
              {statutConfig.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-white/35 mb-3">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ({entretien.duree_minutes}min)
          </span>
          <span className="flex items-center gap-1.5">
            <TypeIcon className="w-3.5 h-3.5" />
            {typeConf.label}
          </span>
        </div>

        {(entretien.lien_visio || entretien.lieu) && (
          <p className="text-xs text-white/30 mb-3 truncate">
            {entretien.type === 'visio' ? (
              <a href={entretien.lien_visio} target="_blank" rel="noopener noreferrer" className="text-primary/70 hover:text-primary transition-colors">
                {entretien.lien_visio}
              </a>
            ) : entretien.lieu}
          </p>
        )}

        {!isPast && (
          <div className="flex items-center gap-2 pt-3 border-t border-white/5">
            {entretien.statut === 'planifie' && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-emerald-500/20 text-emerald-400/70 hover:bg-emerald-500/10 hover:text-emerald-400"
                onClick={() => updateEntretien.mutate({ id: entretien.id, statut: 'confirme' })}
              >
                <CheckCircle className="w-3 h-3 mr-1" /> Confirmer
              </Button>
            )}
            {entretien.statut !== 'annule' && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-white/8 text-white/30 hover:bg-white/5 hover:text-white/50"
                onClick={() => updateEntretien.mutate({ id: entretien.id, statut: 'complete' })}
              >
                Terminer
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-rose-500/15 text-rose-400/50 hover:bg-rose-500/10 hover:text-rose-400 ml-auto"
              onClick={() => deleteEntretien.mutate(entretien.id)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-xl font-bold text-white">Entretiens</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {upcoming.length} à venir · {past.length} passés
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Planifier un entretien
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 bg-white/5 animate-pulse rounded-xl border border-white/5" />
          ))}
        </div>
      ) : (
        <>
          {upcoming.length === 0 && past.length === 0 ? (
            <div className="text-center py-20">
              <Calendar className="w-10 h-10 mx-auto mb-3 text-white/10" />
              <p className="text-sm text-white/30 font-medium">Aucun entretien planifié</p>
              <p className="text-xs text-white/20 mt-1">Cliquez sur &quot;Planifier un entretien&quot; pour commencer</p>
            </div>
          ) : (
            <div className="space-y-6">
              {upcoming.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">À venir ({upcoming.length})</p>
                  <div className="space-y-3">
                    {upcoming.map((e: any) => <EntretienCard key={e.id} entretien={e} />)}
                  </div>
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Historique ({past.length})</p>
                  <div className="space-y-3">
                    {past.map((e: any) => <EntretienCard key={e.id} entretien={e} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg bg-card border-white/10">
          <DialogHeader>
            <DialogTitle>Planifier un entretien</DialogTitle>
          </DialogHeader>
          <CreateEntretienForm onSuccess={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateEntretienForm({ onSuccess }: { onSuccess: () => void }) {
  const [titre, setTitre] = useState('')
  const [candidatId, setCandidatId] = useState('')
  const [offreId, setOffreId] = useState('')
  const [dateHeure, setDateHeure] = useState('')
  const [duree, setDuree] = useState('60')
  const [type, setType] = useState<'visio' | 'presentiel' | 'telephone'>('visio')
  const [lienVisio, setLienVisio] = useState('')
  const [lieu, setLieu] = useState('')
  const [notes, setNotes] = useState('')
  const [intervieweur, setIntervieweur] = useState('')

  const { data: candidats } = useCandidats()
  const { data: offres } = useOffres()
  const createEntretien = useCreateEntretien()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createEntretien.mutate({
      titre,
      candidat_id: candidatId || null,
      offre_id: offreId || null,
      date_heure: new Date(dateHeure).toISOString(),
      duree_minutes: parseInt(duree) || 60,
      type,
      lien_visio: lienVisio || null,
      lieu: lieu || null,
      notes: notes || null,
      intervieweur: intervieweur || null,
      statut: 'planifie',
    }, { onSuccess })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-white/50 text-xs">Titre de l&apos;entretien *</Label>
        <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="ex: Entretien RH — Développeur Frontend" required className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-white/50 text-xs">Candidat</Label>
          <Select value={candidatId} onValueChange={setCandidatId}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white/60 h-9">
              <SelectValue placeholder="Sélectionner..." />
            </SelectTrigger>
            <SelectContent>
              {candidats?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.prenom} {c.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/50 text-xs">Offre</Label>
          <Select value={offreId} onValueChange={setOffreId}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white/60 h-9">
              <SelectValue placeholder="Sélectionner..." />
            </SelectTrigger>
            <SelectContent>
              {offres?.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.titre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-white/50 text-xs">Date et heure *</Label>
          <Input type="datetime-local" value={dateHeure} onChange={e => setDateHeure(e.target.value)} required className="bg-white/5 border-white/10 text-white/70 [color-scheme:dark]" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/50 text-xs">Durée (minutes)</Label>
          <Input type="number" min="15" step="15" value={duree} onChange={e => setDuree(e.target.value)} className="bg-white/5 border-white/10 text-white" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-white/50 text-xs">Format</Label>
        <div className="flex gap-2">
          {(['visio', 'presentiel', 'telephone'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-2 text-xs rounded-md border transition-colors font-medium ${type === t ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/8 text-white/30 hover:border-white/15 hover:text-white/50'}`}
            >
              {TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>
      </div>

      {type === 'visio' && (
        <div className="space-y-1.5">
          <Label className="text-white/50 text-xs">Lien visio</Label>
          <Input value={lienVisio} onChange={e => setLienVisio(e.target.value)} placeholder="https://meet.google.com/..." className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
        </div>
      )}
      {type === 'presentiel' && (
        <div className="space-y-1.5">
          <Label className="text-white/50 text-xs">Lieu</Label>
          <Input value={lieu} onChange={e => setLieu(e.target.value)} placeholder="ex: Rue du Rhône 12, Genève" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-white/50 text-xs">Intervieweur</Label>
        <Input value={intervieweur} onChange={e => setIntervieweur(e.target.value)} placeholder="ex: J. Barbosa" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-white/50 text-xs">Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Points à aborder, documents à préparer..." rows={2} className="bg-white/5 border-white/10 text-white placeholder:text-white/20 resize-none" />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={!titre || !dateHeure || createEntretien.isPending}>
          {createEntretien.isPending ? 'Planification...' : 'Planifier l\'entretien'}
        </Button>
      </div>
    </form>
  )
}
