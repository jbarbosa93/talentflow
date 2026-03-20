'use client'
import { useState } from 'react'
import { Calendar, Clock, Video, MapPin, Phone, Plus, Users, Briefcase, CheckCircle, XCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEntretiens, useCreateEntretien, useUpdateEntretien, useDeleteEntretien } from '@/hooks/useEntretiens'
import { useCandidats } from '@/hooks/useCandidats'
import { useOffres } from '@/hooks/useOffres'

const STATUT_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  planifie: { label: 'Planifié',  bg: '#FFF7ED', color: '#F5A623' },
  confirme: { label: 'Confirmé',  bg: '#F0FDF4', color: '#16A34A' },
  annule:   { label: 'Annulé',    bg: '#FEF2F2', color: '#DC2626' },
  complete: { label: 'Terminé',   bg: 'var(--secondary)', color: 'var(--muted)' },
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  visio:       { label: 'Visio',       icon: Video },
  presentiel:  { label: 'Présentiel',  icon: MapPin },
  telephone:   { label: 'Téléphone',   icon: Phone },
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
      <div style={{
        background: 'var(--card)', border: '1.5px solid var(--border)',
        borderRadius: 12, padding: 20,
        opacity: isPast ? 0.65 : 1,
        boxShadow: 'var(--card-shadow)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>{entretien.titre}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              {entretien.candidats && (
                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={12} />
                  {entretien.candidats.prenom} {entretien.candidats.nom}
                </span>
              )}
              {entretien.offres && (
                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Briefcase size={12} />{entretien.offres.titre}
                </span>
              )}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: statutConfig.bg, color: statutConfig.color, flexShrink: 0, marginLeft: 12 }}>
            {statutConfig.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 12, color: 'var(--muted)', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} />
            {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} />
            {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ({entretien.duree_minutes}min)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TypeIcon size={13} />
            {typeConf.label}
          </span>
        </div>

        {(entretien.lien_visio || entretien.lieu) && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entretien.type === 'visio' ? (
              <a href={entretien.lien_visio} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                {entretien.lien_visio}
              </a>
            ) : entretien.lieu}
          </p>
        )}

        {!isPast && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {entretien.statut === 'planifie' && (
              <button
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1.5px solid #86EFAC', background: '#F0FDF4', color: '#16A34A', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                onClick={() => updateEntretien.mutate({ id: entretien.id, statut: 'confirme' })}
              >
                <CheckCircle size={12} /> Confirmer
              </button>
            )}
            {entretien.statut !== 'annule' && (
              <button
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                onClick={() => updateEntretien.mutate({ id: entretien.id, statut: 'complete' })}
              >
                Terminer
              </button>
            )}
            <button
              style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 8, border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              onClick={() => deleteEntretien.mutate(entretien.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="d-page" style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Entretiens</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>
            {upcoming.length} à venir · {past.length} passés
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Planifier un entretien
        </Button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 144, background: 'var(--secondary)', borderRadius: 12, animation: 'pulse 2s infinite' }} />
          ))}
        </div>
      ) : (
        <>
          {upcoming.length === 0 && past.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <Calendar size={40} color="var(--border)" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', margin: 0 }}>Aucun entretien planifié</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Cliquez sur &quot;Planifier un entretien&quot; pour commencer</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {upcoming.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>À venir ({upcoming.length})</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {upcoming.map((e: any) => <EntretienCard key={e.id} entretien={e} />)}
                  </div>
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Historique ({past.length})</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {past.map((e: any) => <EntretienCard key={e.id} entretien={e} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
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

  const { data: _candidatsData } = useCandidats()
  const candidats = _candidatsData?.candidats
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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Titre de l&apos;entretien *</label>
        <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="ex: Entretien RH — Développeur Frontend" required />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Candidat</label>
          <Select value={candidatId} onValueChange={setCandidatId}>
            <SelectTrigger style={{ height: 38 }}>
              <SelectValue placeholder="Sélectionner..." />
            </SelectTrigger>
            <SelectContent>
              {candidats?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.prenom} {c.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Offre</label>
          <Select value={offreId} onValueChange={setOffreId}>
            <SelectTrigger style={{ height: 38 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Date et heure *</label>
          <Input type="datetime-local" value={dateHeure} onChange={e => setDateHeure(e.target.value)} required />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Durée (minutes)</label>
          <Input type="number" min="15" step="15" value={duree} onChange={e => setDuree(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Format</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['visio', 'presentiel', 'telephone'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              style={{
                flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                border: '1.5px solid', fontFamily: 'var(--font-body)',
                borderColor: type === t ? 'var(--primary)' : 'var(--border)',
                background: type === t ? '#FFF7ED' : 'transparent',
                color: type === t ? 'var(--primary)' : 'var(--muted)',
              }}
            >
              {TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>
      </div>

      {type === 'visio' && (
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Lien visio</label>
          <Input value={lienVisio} onChange={e => setLienVisio(e.target.value)} placeholder="https://meet.google.com/..." />
        </div>
      )}
      {type === 'presentiel' && (
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Lieu</label>
          <Input value={lieu} onChange={e => setLieu(e.target.value)} placeholder="ex: Rue du Rhône 12, Genève" />
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Intervieweur</label>
        <Input value={intervieweur} onChange={e => setIntervieweur(e.target.value)} placeholder="ex: J. Barbosa" />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Points à aborder, documents à préparer..." rows={2} style={{ resize: 'none' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <Button type="submit" disabled={!titre || !dateHeure || createEntretien.isPending}>
          {createEntretien.isPending ? 'Planification...' : "Planifier l'entretien"}
        </Button>
      </div>
    </form>
  )
}
