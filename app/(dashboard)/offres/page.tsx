'use client'
import { useState } from 'react'
import { Plus, MapPin, Clock, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useOffres, useCreateOffre } from '@/hooks/useOffres'
import { formatSalaire } from '@/lib/utils'

const STATUT_BADGE: Record<string, string> = {
  active:   'neo-badge neo-badge-green',
  pourvue:  'neo-badge neo-badge-blue',
  archivee: 'neo-badge neo-badge-gray',
}
const STATUT_LABELS: Record<string, string> = {
  active: 'Active', pourvue: 'Pourvue', archivee: 'Archivée',
}

export default function OffresPage() {
  const [showCreate, setShowCreate] = useState(false)
  const { data: offres, isLoading } = useOffres(true)

  return (
    <div className="d-page">
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title">Offres d&apos;emploi</h1>
          <p className="d-page-sub">{offres?.length || 0} offre{(offres?.length || 0) > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="neo-btn">
          <Plus style={{ width: 15, height: 15 }} />
          Nouvelle offre
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: 200, background: 'white', border: '2px solid #E8E0C8', borderRadius: 16, opacity: 0.5 }} />
          ))}
        </div>
      ) : offres?.length === 0 ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">📋</div>
          <div className="neo-empty-title">Aucune offre</div>
          <div className="neo-empty-sub">Créez votre première offre d&apos;emploi</div>
          <button onClick={() => setShowCreate(true)} className="neo-btn" style={{ marginTop: 20 }}>
            <Plus style={{ width: 15, height: 15 }} /> Créer une offre
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {offres?.map(offre => (
            <div key={offre.id} className="neo-card-soft" style={{ padding: 24, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
                    {offre.titre}
                  </h3>
                  {offre.departement && (
                    <p style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4 }}>{offre.departement}</p>
                  )}
                </div>
                <span className={STATUT_BADGE[offre.statut] || 'neo-badge neo-badge-gray'}>
                  {STATUT_LABELS[offre.statut]}
                </span>
              </div>

              {offre.competences.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {offre.competences.slice(0, 4).map(c => (
                    <span key={c} className="neo-tag" style={{ fontSize: 10, padding: '3px 10px' }}>{c}</span>
                  ))}
                  {offre.competences.length > 4 && (
                    <span style={{ fontSize: 11, color: 'var(--ink2)', padding: '4px 0' }}>+{offre.competences.length - 4}</span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>
                {offre.localisation && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin style={{ width: 11, height: 11 }} />{offre.localisation}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock style={{ width: 11, height: 11 }} />{offre.exp_requise}+ ans
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users style={{ width: 11, height: 11 }} />{offre.type_contrat}
                </span>
              </div>

              {(offre.salaire_min || offre.salaire_max) && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1.5px solid #E8E0C8', fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
                  {formatSalaire(offre.salaire_min, offre.salaire_max)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Nouvelle offre d&apos;emploi</DialogTitle>
          </DialogHeader>
          <CreateOffreForm onSuccess={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateOffreForm({ onSuccess }: { onSuccess: () => void }) {
  const [titre, setTitre]           = useState('')
  const [departement, setDepartement] = useState('')
  const [description, setDescription] = useState('')
  const [competences, setCompetences] = useState('')
  const [expRequise, setExpRequise] = useState('0')
  const [localisation, setLocalisation] = useState('')
  const [typeContrat, setTypeContrat] = useState('CDI')
  const createOffre = useCreateOffre()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createOffre.mutate({
      titre, departement: departement || undefined,
      description: description || undefined,
      competences: competences.split(',').map(c => c.trim()).filter(Boolean),
      exp_requise: parseInt(expRequise) || 0,
      localisation: localisation || undefined,
      type_contrat: typeContrat,
    }, { onSuccess })
  }

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0C8', borderRadius: 8, fontSize: 14, fontFamily: 'var(--font-body)', color: 'var(--ink)', background: 'white', outline: 'none' }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>Titre du poste *</label>
        <input style={inputStyle} value={titre} onChange={e => setTitre(e.target.value)} placeholder="ex: Développeur Frontend Senior" required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Département</label>
          <input style={inputStyle} value={departement} onChange={e => setDepartement(e.target.value)} placeholder="Ingénierie" />
        </div>
        <div>
          <label style={labelStyle}>Contrat</label>
          <input style={inputStyle} value={typeContrat} onChange={e => setTypeContrat(e.target.value)} placeholder="CDI, CDD..." />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Localisation</label>
          <input style={inputStyle} value={localisation} onChange={e => setLocalisation(e.target.value)} placeholder="Genève / Remote" />
        </div>
        <div>
          <label style={labelStyle}>Expérience (ans)</label>
          <input style={{ ...inputStyle }} type="number" min="0" value={expRequise} onChange={e => setExpRequise(e.target.value)} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Compétences (virgule)</label>
        <input style={inputStyle} value={competences} onChange={e => setCompetences(e.target.value)} placeholder="React, TypeScript, Node.js" />
      </div>
      <div>
        <label style={labelStyle}>Description</label>
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description du poste..." />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button type="submit" disabled={!titre || createOffre.isPending} className="neo-btn">
          {createOffre.isPending ? 'Création...' : "Créer l'offre"}
        </button>
      </div>
    </form>
  )
}
