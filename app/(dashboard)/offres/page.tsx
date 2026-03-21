'use client'
import { useState, useRef } from 'react'
import { Plus, MapPin, Pencil, Trash2, ChevronDown, Check, Send, Sparkles, ExternalLink, Info, Users, Calendar, Clock, Building2, FileText, Briefcase } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOffres, useCreateOffre, useUpdateOffre } from '@/hooks/useOffres'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Offre, OffreStatut } from '@/types/database'

const supabase = createClient()

const STATUT_BADGE: Record<OffreStatut, string> = {
  active:   'neo-badge neo-badge-green',
  pourvue:  'neo-badge neo-badge-blue',
  archivee: 'neo-badge neo-badge-gray',
}
const STATUT_LABELS: Record<OffreStatut, string> = {
  active: 'Active', pourvue: 'Pourvue', archivee: 'Archivée',
}
const STATUTS: OffreStatut[] = ['active', 'pourvue', 'archivee']

function useDeleteOffre() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('offres').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offres'] })
      toast.success('Commande supprimée')
    },
    onError: () => toast.error('Erreur suppression'),
  })
}

export default function OffresPage() {
  const [activeTab, setActiveTab] = useState<'offres' | 'facebook'>('offres')
  const [showCreate, setShowCreate] = useState(false)
  const [editOffre, setEditOffre] = useState<Offre | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const { data: offres, isLoading } = useOffres(true)
  const updateOffre = useUpdateOffre()
  const deleteOffre = useDeleteOffre()

  const handleStatusChange = (id: string, statut: OffreStatut) => {
    updateOffre.mutate({ id, statut })
  }

  const tabStyle = (active: boolean) => ({
    padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: 'none', borderRadius: 8, fontFamily: 'inherit',
    color: active ? 'var(--ink)' : 'var(--ink2)',
    background: active ? 'white' : 'transparent',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
  } as React.CSSProperties)

  // Formater la date d'affichage
  const formatDate = (d: string | null) => {
    if (!d) return null
    try {
      return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return d }
  }

  return (
    <div className="d-page">
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title">Commandes</h1>
          <p className="d-page-sub">{offres?.length || 0} commande{(offres?.length || 0) > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', background: '#F0EAD8', borderRadius: 10, padding: 4, gap: 2 }}>
            <button style={tabStyle(activeTab === 'offres')} onClick={() => setActiveTab('offres')}>
              Commandes
            </button>
            <button style={tabStyle(activeTab === 'facebook')} onClick={() => setActiveTab('facebook')}>
              <img src="https://www.job-room.ch/favicon.ico" width={14} height={14} style={{ borderRadius: 2 }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
              job-room.ch
            </button>
          </div>
          {activeTab === 'offres' && (
            <button onClick={() => setShowCreate(true)} className="neo-btn">
              <Plus style={{ width: 15, height: 15 }} />
              Nouvelle commande
            </button>
          )}
        </div>
      </div>

      {activeTab === 'facebook' && <JobRoomComposer offres={offres || []} />}
      {activeTab === 'offres' && (<>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: 240, background: 'white', border: '2px solid #E8E0C8', borderRadius: 16, opacity: 0.5 }} />
          ))}
        </div>
      ) : offres?.length === 0 ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">📋</div>
          <div className="neo-empty-title">Aucune commande</div>
          <div className="neo-empty-sub">Créez votre première commande client</div>
          <button onClick={() => setShowCreate(true)} className="neo-btn" style={{ marginTop: 20 }}>
            <Plus style={{ width: 15, height: 15 }} /> Nouvelle commande
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {offres?.map(offre => (
            <div key={offre.id} className="neo-card-soft" style={{ padding: 0, position: 'relative', overflow: 'hidden' }}>
              {/* Top color bar */}
              <div style={{
                height: 4,
                background: offre.statut === 'active' ? 'linear-gradient(90deg, #10B981, #059669)'
                  : offre.statut === 'pourvue' ? 'linear-gradient(90deg, #3B82F6, #2563EB)'
                  : 'linear-gradient(90deg, #94A3B8, #64748B)',
              }} />

              <div style={{ padding: '18px 20px 20px' }}>
                {/* Actions top-right */}
                <div style={{ position: 'absolute', top: 18, right: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <StatusDropdown
                    current={offre.statut}
                    onSelect={(s) => handleStatusChange(offre.id, s)}
                  />
                  <button
                    onClick={() => setEditOffre(offre)}
                    title="Modifier"
                    style={{
                      background: 'none', border: '1.5px solid #E8E0C8', cursor: 'pointer',
                      color: '#7A7060', padding: '4px 7px', borderRadius: 7, display: 'flex',
                      alignItems: 'center', transition: 'all 0.12s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = '#F5F0E0'; e.currentTarget.style.color = '#1C1A14' }}
                    onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#7A7060' }}
                  >
                    <Pencil size={12} />
                  </button>
                  {confirmDelete === offre.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => { deleteOffre.mutate(offre.id); setConfirmDelete(null) }}
                        style={{ fontSize: 10, fontWeight: 700, background: '#DC2626', color: 'white', border: 'none', cursor: 'pointer', padding: '3px 7px', borderRadius: 5 }}
                      >Oui</button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        style={{ fontSize: 10, fontWeight: 700, background: 'none', color: '#7A7060', border: '1px solid #E8E0C8', cursor: 'pointer', padding: '3px 7px', borderRadius: 5 }}
                      >Non</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(offre.id)}
                      title="Supprimer"
                      style={{
                        background: 'none', border: '1.5px solid #E8E0C8', cursor: 'pointer',
                        color: '#7A7060', padding: '4px 7px', borderRadius: 7, display: 'flex',
                        alignItems: 'center', transition: 'all 0.12s',
                      }}
                      onMouseOver={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FECACA' }}
                      onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#7A7060'; e.currentTarget.style.borderColor = '#E8E0C8' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Client name */}
                {offre.client_nom && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Building2 size={12} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {offre.client_nom}
                    </span>
                  </div>
                )}

                {/* Title */}
                <div style={{ marginBottom: 14, paddingRight: 100 }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
                    {offre.titre}
                  </h3>
                </div>

                {/* Key info grid */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  {(offre.nb_postes || 0) > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                      background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8,
                      fontSize: 12, fontWeight: 700, color: '#166534',
                    }}>
                      <Users size={12} />
                      {offre.nb_postes} poste{(offre.nb_postes || 0) > 1 ? 's' : ''}
                    </div>
                  )}
                  {offre.date_debut && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                      background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8,
                      fontSize: 12, fontWeight: 600, color: '#1D4ED8',
                    }}>
                      <Calendar size={12} />
                      {formatDate(offre.date_debut)}
                    </div>
                  )}
                  {offre.duree_mission && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                      background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 8,
                      fontSize: 12, fontWeight: 600, color: '#92400E',
                    }}>
                      <Clock size={12} />
                      {offre.duree_mission}
                    </div>
                  )}
                </div>

                {/* Competences */}
                {offre.competences.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {offre.competences.slice(0, 4).map(c => (
                      <span key={c} className="neo-tag" style={{ fontSize: 10, padding: '3px 10px' }}>{c}</span>
                    ))}
                    {offre.competences.length > 4 && (
                      <span style={{ fontSize: 11, color: 'var(--ink2)', padding: '4px 0' }}>+{offre.competences.length - 4}</span>
                    )}
                  </div>
                )}

                {/* Location + Notes */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>
                  {offre.localisation && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin style={{ width: 11, height: 11 }} />{offre.localisation}
                    </span>
                  )}
                </div>

                {/* Notes preview */}
                {offre.notes && (
                  <div style={{
                    marginTop: 12, padding: '8px 12px',
                    background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <FileText size={10} style={{ color: '#64748B' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#475569', margin: 0, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {offre.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </>)}
      {/* end offres tab */}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Nouvelle commande</DialogTitle>
          </DialogHeader>
          <CommandeForm onSuccess={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editOffre} onOpenChange={v => { if (!v) setEditOffre(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Modifier la commande</DialogTitle>
          </DialogHeader>
          {editOffre && (
            <CommandeForm
              initial={editOffre}
              onSuccess={() => setEditOffre(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Status Dropdown ─────────────────────────────────────────────────────────

function StatusDropdown({ current, onSelect }: { current: OffreStatut; onSelect: (s: OffreStatut) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className={STATUT_BADGE[current] || 'neo-badge neo-badge-gray'}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, border: 'none', fontFamily: 'inherit' }}
      >
        {STATUT_LABELS[current]}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 50,
          background: 'white', border: '1.5px solid #E8E0C8', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: 110, overflow: 'hidden',
        }}>
          {STATUTS.map(s => (
            <button
              key={s}
              onClick={() => { onSelect(s); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
                borderBottom: s !== 'archivee' ? '1px solid #F0EAD8' : 'none',
              }}
              onMouseOver={e => e.currentTarget.style.background = '#F9F5E8'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}
            >
              {STATUT_LABELS[s]}
              {current === s && <Check size={12} color="#7A7060" />}
            </button>
          ))}
        </div>
      )}
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />}
    </div>
  )
}

// ─── Create / Edit Commande Form ─────────────────────────────────────────────

function CommandeForm({ initial, onSuccess }: { initial?: Offre; onSuccess: () => void }) {
  const [clientNom, setClientNom]       = useState(initial?.client_nom || '')
  const [titre, setTitre]               = useState(initial?.titre || '')
  const [nbPostes, setNbPostes]         = useState(initial?.nb_postes || 1)
  const [dateDebut, setDateDebut]       = useState(initial?.date_debut || '')
  const [dureeMission, setDureeMission] = useState(initial?.duree_mission || '')
  const [competences, setCompetences]   = useState(initial?.competences?.join(', ') || '')
  const [localisation, setLocalisation] = useState(initial?.localisation || '')
  const [notes, setNotes]               = useState(initial?.notes || '')
  const [description, setDescription]   = useState(initial?.description || '')

  const createOffre = useCreateOffre()
  const updateOffre = useUpdateOffre()

  const isEdit = !!initial
  const isPending = createOffre.isPending || updateOffre.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      titre,
      type_contrat: 'Mission',
      statut: 'active' as const,
      client_nom: clientNom || undefined,
      nb_postes: nbPostes || 1,
      date_debut: dateDebut || undefined,
      duree_mission: dureeMission || undefined,
      description: description || undefined,
      competences: competences.split(',').map(c => c.trim()).filter(Boolean),
      localisation: localisation || undefined,
      notes: notes || undefined,
      exp_requise: 0,
    }

    if (isEdit) {
      updateOffre.mutate({ id: initial.id, ...payload }, { onSuccess })
    } else {
      createOffre.mutate(payload, { onSuccess })
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0C8',
    borderRadius: 8, fontSize: 14, fontFamily: 'var(--font-body)',
    color: 'var(--ink)', background: 'white', outline: 'none',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)',
    marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}><Building2 size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Nom du client</label>
        <input style={inputStyle} value={clientNom} onChange={e => setClientNom(e.target.value)} placeholder="ex: Bouygues Construction" />
      </div>
      <div>
        <label style={labelStyle}>Poste recherché *</label>
        <input style={inputStyle} value={titre} onChange={e => setTitre(e.target.value)} placeholder="ex: Maçon CFC, Électricien..." required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}><Users size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Nombre de postes</label>
          <input style={inputStyle} type="number" min={1} value={nbPostes} onChange={e => setNbPostes(parseInt(e.target.value) || 1)} />
        </div>
        <div>
          <label style={labelStyle}><Calendar size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Date de début</label>
          <input style={inputStyle} type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}><Clock size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Durée de la mission</label>
          <input style={inputStyle} value={dureeMission} onChange={e => setDureeMission(e.target.value)} placeholder="ex: 3 mois, 6 semaines, CDI..." />
        </div>
        <div>
          <label style={labelStyle}><MapPin size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Localisation</label>
          <input style={inputStyle} value={localisation} onChange={e => setLocalisation(e.target.value)} placeholder="Genève, Lausanne..." />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Compétences requises (séparées par virgule)</label>
        <input style={inputStyle} value={competences} onChange={e => setCompetences(e.target.value)} placeholder="Maçonnerie, Coffrage, CFC..." />
      </div>
      <div>
        <label style={labelStyle}>Description du poste</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description détaillée du poste..." />
      </div>
      <div>
        <label style={labelStyle}><FileText size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />Notes internes</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes pour les consultants (tarif horaire, contact client, etc.)..." />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button type="submit" disabled={!titre || isPending} className="neo-btn">
          {isPending ? 'Sauvegarde...' : isEdit ? 'Enregistrer les modifications' : 'Créer la commande'}
        </button>
      </div>
    </form>
  )
}

// ─── Job-Room Composer ────────────────────────────────────────────────────────

function JobRoomComposer({ offres }: { offres: Offre[] }) {
  const today = new Date().toISOString().split('T')[0]
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]

  const [publishing, setPublishing] = useState(false)
  const [selectedOffre, setSelectedOffre] = useState<string>('')

  // Contact administratif
  const [contactLang, setContactLang] = useState('fr')
  const [contactSal, setContactSal] = useState('MR')
  const [contactFirst, setContactFirst] = useState('')
  const [contactLast, setContactLast] = useState('')
  const [contactPhone, setContactPhone] = useState('+41')
  const [contactEmail, setContactEmail] = useState('')

  // Description poste
  const [jobLang, setJobLang] = useState('fr')
  const [jobTitle, setJobTitle] = useState('')
  const [jobDesc, setJobDesc] = useState('')

  // Lieu de travail
  const [locPostal, setLocPostal] = useState('')
  const [locCity, setLocCity] = useState('')

  // Emploi
  const [workMin, setWorkMin] = useState('100')
  const [workMax, setWorkMax] = useState('100')
  const [startDate, setStartDate] = useState('')
  const [immediately, setImmediately] = useState(true)
  const [permanent, setPermanent] = useState(true)

  // Profession (AVAM)
  const [avamCode, setAvamCode] = useState('')
  const [workExp, setWorkExp] = useState('MORE_THAN_1_YEAR')
  const [eduCode, setEduCode] = useState('132')

  // Entreprise mandante (client)
  const [employerName, setEmployerName] = useState('')
  const [employerPostal, setEmployerPostal] = useState('')
  const [employerCity, setEmployerCity] = useState('')
  const [showEmployer, setShowEmployer] = useState(false)

  // Canal de candidature
  const [applyEmail, setApplyEmail] = useState('')
  const [applyPhone, setApplyPhone] = useState('')
  const [applyForm, setApplyForm] = useState('')

  // Publication
  const [pubStart, setPubStart] = useState(today)
  const [pubEnd, setPubEnd] = useState(in60)
  const [eures, setEures] = useState(false)
  const [publicDisplay, setPublicDisplay] = useState(true)
  const [reportToAvam, setReportToAvam] = useState(false)

  const fillFromOffre = () => {
    const o = offres.find(x => x.id === selectedOffre)
    if (!o) return
    setJobTitle(o.titre || '')
    const desc = [
      o.description || '',
      o.competences?.length ? `## Compétences requises\n${o.competences.map(c => `- ${c}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n')
    setJobDesc(desc)
    if (o.localisation) {
      const parts = o.localisation.split(',')
      setLocCity(parts[0].trim())
    }
  }

  const iStyle = {
    width: '100%', padding: '8px 10px', border: '1.5px solid #E8E0C8', borderRadius: 8,
    fontSize: 13, color: 'var(--ink)', background: 'white', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box' as const,
  }
  const lStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
  const sStyle: React.CSSProperties = { background: '#F8F5ED', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }
  const sTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }

  const handleSubmit = async () => {
    if (!jobTitle || !jobDesc || !locPostal || !locCity || !avamCode || !contactFirst || !contactLast || !contactEmail || !contactPhone) {
      toast.error('Veuillez remplir tous les champs obligatoires (*)'); return
    }
    if (!applyEmail && !applyPhone && !applyForm) {
      toast.error('Au moins un canal de candidature requis'); return
    }
    setPublishing(true)
    const body = {
      reportToAvam,
      numberOfJobs: 1,
      contact: { languageIsoCode: contactLang, salutation: contactSal, firstName: contactFirst, lastName: contactLast, phone: contactPhone, email: contactEmail },
      jobDescriptions: [{ languageIsoCode: jobLang, title: jobTitle, description: jobDesc }],
      company: { name: 'L-Agence SA', street: 'Rue du Bourg', houseNumber: '4', postalCode: '1870', city: 'Monthey', countryIsoCode: 'CH', surrogate: showEmployer },
      ...(showEmployer && employerName ? { employer: { name: employerName, postalCode: employerPostal, city: employerCity, countryIsoCode: 'CH' } } : {}),
      employment: { immediately, permanent, shortEmployment: false, workloadPercentageMin: parseInt(workMin), workloadPercentageMax: parseInt(workMax), ...(startDate && !immediately ? { startDate } : {}), workForms: [] },
      location: { postalCode: locPostal, city: locCity, countryIsoCode: 'CH' },
      occupation: { avamOccupationCode: avamCode, workExperience: workExp, educationCode: eduCode },
      applyChannel: { emailAddress: applyEmail || null, phoneNumber: applyPhone || null, formUrl: applyForm || null },
      publication: { startDate: pubStart, endDate: pubEnd, euresDisplay: eures, publicDisplay },
    }
    try {
      const res = await fetch('/api/jobroom/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Offre publiée sur job-room.ch !')
    } catch (e: any) {
      toast.error(e.message || 'Erreur de publication')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
      <div>
        {/* Auto-fill */}
        {offres.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select value={selectedOffre} onChange={e => setSelectedOffre(e.target.value)} style={{ ...iStyle, flex: 1 }}>
              <option value="">Importer depuis une commande TalentFlow...</option>
              {offres.map(o => <option key={o.id} value={o.id}>{o.titre}</option>)}
            </select>
            <button onClick={fillFromOffre} disabled={!selectedOffre} className="neo-btn" style={{ gap: 6, opacity: selectedOffre ? 1 : 0.5 }}>
              <Sparkles size={13} /> Importer
            </button>
          </div>
        )}

        {/* Description du poste */}
        <div style={sStyle}>
          <p style={sTitle}>📋 Description du poste</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Langue *</label>
              <select value={jobLang} onChange={e => setJobLang(e.target.value)} style={iStyle}>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Titre du poste *</label>
              <input style={iStyle} value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="ex: Électricien CFC" />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={lStyle}>Description (Markdown) *</label>
            <textarea rows={6} style={{ ...iStyle, resize: 'vertical', lineHeight: 1.5 }} value={jobDesc} onChange={e => setJobDesc(e.target.value)} placeholder={'## Missions\n- ...\n\n## Profil\n- ...'} />
          </div>
        </div>

        {/* Lieu + Emploi */}
        <div style={sStyle}>
          <p style={sTitle}>📍 Lieu de travail</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>NPA *</label>
              <input style={iStyle} value={locPostal} onChange={e => setLocPostal(e.target.value)} placeholder="1870" maxLength={10} />
            </div>
            <div>
              <label style={lStyle}>Ville *</label>
              <input style={iStyle} value={locCity} onChange={e => setLocCity(e.target.value)} placeholder="Monthey" />
            </div>
          </div>
        </div>

        {/* Conditions d'emploi */}
        <div style={sStyle}>
          <p style={sTitle}>⚙️ Conditions d&apos;emploi</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Taux min % *</label>
              <input style={iStyle} type="number" min={10} max={100} value={workMin} onChange={e => setWorkMin(e.target.value)} />
            </div>
            <div>
              <label style={lStyle}>Taux max % *</label>
              <input style={iStyle} type="number" min={10} max={100} value={workMax} onChange={e => setWorkMax(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={immediately} onChange={e => { setImmediately(e.target.checked); if (e.target.checked) setStartDate('') }} />
              Entrée immédiate
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={permanent} onChange={e => setPermanent(e.target.checked)} />
              CDI (permanent)
            </label>
          </div>
          {!immediately && (
            <div style={{ marginTop: 10 }}>
              <label style={lStyle}>Date d&apos;entrée</label>
              <input style={iStyle} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          )}
        </div>

        {/* Profession */}
        <div style={sStyle}>
          <p style={sTitle}>🎓 Profession (AVAM)</p>
          <div>
            <label style={lStyle}>Code AVAM * <a href="https://www.arbeit.swiss/secoalv/fr/home.html" target="_blank" rel="noreferrer" style={{ fontWeight: 400, color: '#3B82F6', textDecoration: 'none', fontSize: 10 }}>Trouver le code ↗</a></label>
            <input style={iStyle} value={avamCode} onChange={e => setAvamCode(e.target.value)} placeholder="ex: 102231 (Électricien)" />
          </div>
          <div style={{ ...grid2, marginTop: 10 }}>
            <div>
              <label style={lStyle}>Expérience requise</label>
              <select value={workExp} onChange={e => setWorkExp(e.target.value)} style={iStyle}>
                <option value="LESS_THAN_1_YEAR">Moins d&apos;1 an</option>
                <option value="MORE_THAN_1_YEAR">Plus d&apos;1 an</option>
                <option value="MORE_THAN_3_YEARS">Plus de 3 ans</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Formation</label>
              <select value={eduCode} onChange={e => setEduCode(e.target.value)} style={iStyle}>
                <option value="130">Scolarité obligatoire</option>
                <option value="131">CFC</option>
                <option value="132">Brevet fédéral</option>
                <option value="134">Maturité professionnelle</option>
                <option value="150">Diplôme ES</option>
                <option value="170">Bachelor HES</option>
                <option value="171">Bachelor Université</option>
                <option value="173">Master Université</option>
                <option value="180">Doctorat</option>
              </select>
            </div>
          </div>
        </div>

        {/* Entreprise mandante */}
        <div style={sStyle}>
          <p style={{ ...sTitle, marginBottom: 10 }}>🏢 Entreprise mandante (client)</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: showEmployer ? 12 : 0 }}>
            <input type="checkbox" checked={showEmployer} onChange={e => setShowEmployer(e.target.checked)} />
            Publier au nom d&apos;un client (agence de placement)
          </label>
          {showEmployer && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={lStyle}>Nom de l&apos;entreprise *</label>
                <input style={iStyle} value={employerName} onChange={e => setEmployerName(e.target.value)} placeholder="Nom du client" />
              </div>
              <div style={grid2}>
                <div>
                  <label style={lStyle}>NPA *</label>
                  <input style={iStyle} value={employerPostal} onChange={e => setEmployerPostal(e.target.value)} placeholder="1200" />
                </div>
                <div>
                  <label style={lStyle}>Ville *</label>
                  <input style={iStyle} value={employerCity} onChange={e => setEmployerCity(e.target.value)} placeholder="Genève" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contact administratif */}
        <div style={sStyle}>
          <p style={sTitle}>👤 Contact administratif (notifications SECO)</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Prénom *</label>
              <input style={iStyle} value={contactFirst} onChange={e => setContactFirst(e.target.value)} placeholder="João" />
            </div>
            <div>
              <label style={lStyle}>Nom *</label>
              <input style={iStyle} value={contactLast} onChange={e => setContactLast(e.target.value)} placeholder="Barbosa" />
            </div>
          </div>
          <div style={{ ...grid2, marginTop: 10 }}>
            <div>
              <label style={lStyle}>Téléphone * (+41...)</label>
              <input style={iStyle} value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+41791234567" />
            </div>
            <div>
              <label style={lStyle}>Email *</label>
              <input style={iStyle} type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="contact@lagence.ch" />
            </div>
          </div>
          <div style={{ ...grid2, marginTop: 10 }}>
            <div>
              <label style={lStyle}>Civilité</label>
              <select value={contactSal} onChange={e => setContactSal(e.target.value)} style={iStyle}>
                <option value="MR">M.</option>
                <option value="MS">Mme</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Langue communication</label>
              <select value={contactLang} onChange={e => setContactLang(e.target.value)} style={iStyle}>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Canal de candidature */}
        <div style={sStyle}>
          <p style={sTitle}>📩 Canal de candidature (min. 1 requis)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={lStyle}>Email</label>
              <input style={iStyle} type="email" value={applyEmail} onChange={e => setApplyEmail(e.target.value)} placeholder="candidatures@lagence.ch" />
            </div>
            <div>
              <label style={lStyle}>Téléphone</label>
              <input style={iStyle} value={applyPhone} onChange={e => setApplyPhone(e.target.value)} placeholder="+41791234567" />
            </div>
            <div>
              <label style={lStyle}>Formulaire en ligne (URL)</label>
              <input style={iStyle} value={applyForm} onChange={e => setApplyForm(e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>

        {/* Publication */}
        <div style={sStyle}>
          <p style={sTitle}>📅 Publication</p>
          <div style={grid2}>
            <div>
              <label style={lStyle}>Date début *</label>
              <input style={iStyle} type="date" value={pubStart} onChange={e => setPubStart(e.target.value)} />
            </div>
            <div>
              <label style={lStyle}>Date fin (max 60j)</label>
              <input style={iStyle} type="date" value={pubEnd} onChange={e => setPubEnd(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={publicDisplay} onChange={e => setPublicDisplay(e.target.checked)} />
              Visible publiquement
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={eures} onChange={e => setEures(e.target.checked)} />
              Publier sur EURES (Europe)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={reportToAvam} onChange={e => setReportToAvam(e.target.checked)} />
              Obligation de déclarer (AVAM)
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 8 }}>
          <button onClick={handleSubmit} disabled={publishing} className="neo-btn" style={{ gap: 8, padding: '10px 24px', fontSize: 14 }}>
            <Send size={14} />
            {publishing ? 'Publication en cours...' : 'Publier sur job-room.ch'}
          </button>
        </div>
      </div>

      {/* Sidebar info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 80 }}>
        <div style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#166534', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={13} /> job-room.ch
          </p>
          <p style={{ fontSize: 11, color: '#15803D', margin: '0 0 10px', lineHeight: 1.6 }}>
            Portail officiel de la Confédération (SECO). Gratuit. Satisfait l&apos;obligation légale de déclaration des postes.
          </p>
          <a href="https://www.job-room.ch" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
            Voir job-room.ch <ExternalLink size={10} />
          </a>
        </div>

        <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E', margin: '0 0 8px' }}>⚙️ Accès API requis</p>
          <p style={{ fontSize: 11, color: '#78350F', margin: '0 0 8px', lineHeight: 1.6 }}>
            Envoyez un email à :<br/>
            <strong>jobroom-api@seco.admin.ch</strong><br/>
            Objet : "Job-Room API access"<br/>
            Contenu : nom entreprise, adresse, contact technique, volume mensuel estimé.
          </p>
          <p style={{ fontSize: 11, color: '#78350F', margin: 0 }}>
            Puis ajoutez dans <code>.env.local</code> :<br/>
            <code style={{ fontSize: 10 }}>JOBROOM_USERNAME=...</code><br/>
            <code style={{ fontSize: 10 }}>JOBROOM_PASSWORD=...</code>
          </p>
        </div>

        <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', margin: '0 0 8px' }}>📌 Statuts de publication</p>
          <div style={{ fontSize: 11, color: '#1E40AF', lineHeight: 1.9 }}>
            <div><span style={{ fontWeight: 700 }}>INSPECTING</span> — En validation AVAM</div>
            <div><span style={{ fontWeight: 700 }}>PUBLISHED_RESTRICTED</span> — 5j réservé aux inscrits</div>
            <div><span style={{ fontWeight: 700 }}>PUBLISHED_PUBLIC</span> — Visible publiquement</div>
          </div>
        </div>
      </div>
    </div>
  )
}
