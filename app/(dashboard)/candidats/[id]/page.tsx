'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, GraduationCap,
  FileText, ExternalLink, Trash2, MessageSquare, Star, Send,
  Pencil, X, Check, Globe, Car, Languages, Maximize2,
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useCandidat, useUpdateCandidat, useUpdateStatutCandidat,
  useAjouterNote, useDeleteCandidat,
} from '@/hooks/useCandidats'
import type { PipelineEtape } from '@/types/database'

const ETAPE_BADGE: Record<PipelineEtape, string> = {
  nouveau:   'neo-badge neo-badge-nouveau',
  contacte:  'neo-badge neo-badge-contacte',
  entretien: 'neo-badge neo-badge-entretien',
  place:     'neo-badge neo-badge-place',
  refuse:    'neo-badge neo-badge-refuse',
}
const ETAPE_LABELS: Record<PipelineEtape, string> = {
  nouveau: 'Nouveau', contacte: 'Contacté', entretien: 'Entretien', place: 'Placé', refuse: 'Refusé',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  display: 'block',
  marginBottom: 6,
}

const mutedText: React.CSSProperties = { color: 'var(--muted)', fontSize: 13 }
const smallMuted: React.CSSProperties = { color: 'var(--muted)', fontSize: 12 }

export default function CandidatDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [note, setNote] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, any>>({})
  const [showCV, setShowCV] = useState(false)

  const { data, isLoading, error } = useCandidat(id)
  const updateCandidat = useUpdateCandidat()
  const updateStatut = useUpdateStatutCandidat()
  const ajouterNote = useAjouterNote()
  const deleteCandidat = useDeleteCandidat()

  const candidat = data as any

  const startEdit = () => {
    setEditData({
      nom:             candidat.nom || '',
      prenom:          candidat.prenom || '',
      email:           candidat.email || '',
      telephone:       candidat.telephone || '',
      localisation:    candidat.localisation || '',
      titre_poste:     candidat.titre_poste || '',
      annees_exp:      candidat.annees_exp ?? 0,
      formation:       candidat.formation || '',
      competences:     (candidat.competences || []).join(', '),
      langues:         (candidat.langues || []).join(', '),
      linkedin:        candidat.linkedin || '',
      permis_conduire: candidat.permis_conduire ?? false,
      date_naissance:  candidat.date_naissance || '',
      resume_ia:       candidat.resume_ia || '',
      experiences:     JSON.parse(JSON.stringify(candidat.experiences || [])),
      formations_details: JSON.parse(JSON.stringify(candidat.formations_details || [])),
    })
    setIsEditing(true)
  }

  // Helpers édition expériences
  const addExp = () => set('experiences', [...(editData.experiences || []), { poste: '', entreprise: '', periode: '', description: '' }])
  const removeExp = (i: number) => set('experiences', (editData.experiences || []).filter((_: any, idx: number) => idx !== i))
  const setExp = (i: number, field: string, value: string) => {
    const arr = [...(editData.experiences || [])]
    arr[i] = { ...arr[i], [field]: value }
    set('experiences', arr)
  }

  // Helpers édition formations
  const addForm = () => set('formations_details', [...(editData.formations_details || []), { diplome: '', etablissement: '', annee: '' }])
  const removeForm = (i: number) => set('formations_details', (editData.formations_details || []).filter((_: any, idx: number) => idx !== i))
  const setForm = (i: number, field: string, value: string) => {
    const arr = [...(editData.formations_details || [])]
    arr[i] = { ...arr[i], [field]: value }
    set('formations_details', arr)
  }

  const cancelEdit = () => { setIsEditing(false); setEditData({}) }

  const saveEdit = () => {
    const payload: Record<string, any> = {
      ...editData,
      annees_exp:  parseInt(editData.annees_exp) || 0,
      competences: editData.competences
        ? editData.competences.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      langues: editData.langues
        ? editData.langues.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
    }
    updateCandidat.mutate({ id, data: payload }, { onSuccess: () => setIsEditing(false) })
  }

  const set = (field: string, value: any) => setEditData(prev => ({ ...prev, [field]: value }))

  if (isLoading) {
    return (
      <div className="d-page">
        <div style={{ height: 32, width: 200, background: 'var(--border)', borderRadius: 8, marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: 112, background: 'var(--border)', borderRadius: 12, opacity: 0.5 }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 144, background: 'var(--border)', borderRadius: 12, opacity: 0.5 }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !candidat) {
    return (
      <div className="d-page">
        <button onClick={() => router.back()} className="neo-btn-ghost neo-btn-sm" style={{ marginBottom: 16 }}>
          <ArrowLeft size={14} /> Retour
        </button>
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Candidat introuvable</p>
          <p style={{ fontSize: 13 }}>Ce candidat n&apos;existe pas ou a été supprimé.</p>
        </div>
      </div>
    )
  }

  const initiales = ((candidat.prenom?.[0] || '') + (candidat.nom?.[0] || '')).toUpperCase() || '??'

  const handleSendNote = () => {
    if (!note.trim()) return
    ajouterNote.mutate({ candidat_id: id, contenu: note.trim() }, { onSuccess: () => setNote('') })
  }

  const handleDelete = () => {
    deleteCandidat.mutate(id, { onSuccess: () => router.push('/candidats') })
  }

  return (
    <div className="d-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button onClick={() => router.back()} className="neo-btn-ghost neo-btn-sm">
          <ArrowLeft size={14} /> Retour aux candidats
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isEditing ? (
            <button onClick={startEdit} className="neo-btn-ghost neo-btn-sm">
              <Pencil size={13} /> Modifier
            </button>
          ) : (
            <>
              <button
                onClick={saveEdit}
                disabled={updateCandidat.isPending}
                className="neo-btn neo-btn-sm"
                style={{ background: '#059669', boxShadow: 'none' }}
              >
                <Check size={13} />
                {updateCandidat.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button onClick={cancelEdit} className="neo-btn-ghost neo-btn-sm">
                <X size={13} /> Annuler
              </button>
            </>
          )}

          {candidat.cv_url && (
            <button onClick={() => setShowCV(true)} className="neo-btn-ghost neo-btn-sm">
              <FileText size={13} /> Voir le CV
            </button>
          )}

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="neo-btn-ghost neo-btn-sm"
              style={{ borderColor: '#FECACA', color: '#DC2626' }}
            >
              <Trash2 size={13} /> Supprimer
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEE2E2', border: '1px solid #FECACA', padding: '6px 12px', borderRadius: 100 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626' }}>Confirmer ?</span>
              <button
                onClick={handleDelete}
                disabled={deleteCandidat.isPending}
                className="neo-btn neo-btn-sm"
                style={{ background: '#DC2626', boxShadow: 'none', padding: '4px 10px', fontSize: 11 }}
              >
                Supprimer
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="neo-btn-ghost neo-btn-sm"
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Identité */}
          <div className="neo-card-soft" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div className="neo-avatar" style={{ width: 48, height: 48, fontSize: 16, flexShrink: 0 }}>
                {initiales}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input className="neo-input" style={{ height: 32, fontSize: 12 }} placeholder="Prénom" value={editData.prenom} onChange={e => set('prenom', e.target.value)} />
                    <input className="neo-input" style={{ height: 32, fontSize: 12 }} placeholder="Nom" value={editData.nom} onChange={e => set('nom', e.target.value)} />
                    <input className="neo-input" style={{ height: 32, fontSize: 12 }} placeholder="Titre / Poste" value={editData.titre_poste} onChange={e => set('titre_poste', e.target.value)} />
                  </div>
                ) : (
                  <>
                    <h1 style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', lineHeight: 1.3 }}>
                      {candidat.prenom} {candidat.nom}
                    </h1>
                    {candidat.titre_poste && (
                      <p style={{ ...smallMuted, marginTop: 2 }}>{candidat.titre_poste}</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Statut pipeline */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Statut pipeline</label>
              <Select
                value={candidat.statut_pipeline}
                onValueChange={(v) => updateStatut.mutate({ id, statut: v as PipelineEtape })}
                disabled={updateStatut.isPending}
              >
                <SelectTrigger style={{ height: 34, fontSize: 12, background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                  <span className={ETAPE_BADGE[candidat.statut_pipeline as PipelineEtape]}>
                    {ETAPE_LABELS[candidat.statut_pipeline as PipelineEtape]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ETAPE_LABELS) as PipelineEtape[]).map(e => (
                    <SelectItem key={e} value={e}>{ETAPE_LABELS[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Coordonnées */}
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Coordonnées</label>
                <input className="neo-input" style={{ height: 32, fontSize: 12 }} placeholder="Email" value={editData.email} onChange={e => set('email', e.target.value)} />
                <input className="neo-input" style={{ height: 32, fontSize: 12 }} placeholder="Téléphone" value={editData.telephone} onChange={e => set('telephone', e.target.value)} />
                <input className="neo-input" style={{ height: 32, fontSize: 12 }} placeholder="Localisation" value={editData.localisation} onChange={e => set('localisation', e.target.value)} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {candidat.email && (
                  <a href={`mailto:${candidat.email}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12, textDecoration: 'none' }}>
                    <Mail size={13} style={{ flexShrink: 0, color: 'var(--primary)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidat.email}</span>
                  </a>
                )}
                {candidat.telephone && (
                  <a href={`tel:${candidat.telephone}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12, textDecoration: 'none' }}>
                    <Phone size={13} style={{ flexShrink: 0 }} />
                    <span>{candidat.telephone}</span>
                  </a>
                )}
                {candidat.localisation && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...smallMuted }}>
                    <MapPin size={13} style={{ flexShrink: 0 }} />
                    <span>{candidat.localisation}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Expérience, Formation, Naissance */}
          <div className="neo-card-soft" style={{ padding: 16 }}>
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Expérience & Formation</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="neo-input"
                    style={{ height: 32, fontSize: 12, width: 60 }}
                    type="number" min={0} max={60}
                    value={editData.annees_exp}
                    onChange={e => set('annees_exp', e.target.value)}
                  />
                  <span style={smallMuted}>ans d&apos;expérience</span>
                </div>
                <input className="neo-input" style={{ height: 32, fontSize: 12 }} placeholder="Formation" value={editData.formation} onChange={e => set('formation', e.target.value)} />
                <input className="neo-input" style={{ height: 32, fontSize: 12 }} placeholder="Date de naissance (JJ/MM/AAAA)" value={editData.date_naissance} onChange={e => set('date_naissance', e.target.value)} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Briefcase size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                    {candidat.annees_exp} an{candidat.annees_exp > 1 ? 's' : ''} d&apos;expérience
                  </span>
                </div>
                {candidat.formation && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <GraduationCap size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ ...smallMuted, lineHeight: 1.5 }}>{candidat.formation}</span>
                  </div>
                )}
                {candidat.date_naissance && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...smallMuted }}>
                    <span>🎂</span>
                    <span>{candidat.date_naissance}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Compétences */}
          <div className="neo-card-soft" style={{ padding: 16 }}>
            <label style={labelStyle}>Compétences</label>
            {isEditing ? (
              <div>
                <textarea
                  className="neo-input"
                  style={{ height: 'auto', minHeight: 72, padding: '8px 13px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 12 }}
                  placeholder="Séparées par des virgules : React, TypeScript, Node.js..."
                  value={editData.competences}
                  onChange={e => set('competences', e.target.value)}
                />
                <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Séparer par des virgules</p>
              </div>
            ) : candidat.competences?.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {candidat.competences.map((c: string) => (
                  <span key={c} className="neo-tag">{c}</span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Aucune compétence</p>
            )}
          </div>

          {/* Langues, LinkedIn, Permis */}
          <div className="neo-card-soft" style={{ padding: 16 }}>
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Autres infos</label>
                <textarea
                  className="neo-input"
                  style={{ height: 'auto', minHeight: 52, padding: '6px 13px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 12 }}
                  placeholder="Langues : Français, Anglais..."
                  value={editData.langues}
                  onChange={e => set('langues', e.target.value)}
                />
                <input className="neo-input" style={{ height: 32, fontSize: 12 }} placeholder="LinkedIn URL" value={editData.linkedin} onChange={e => set('linkedin', e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={editData.permis_conduire}
                    onChange={e => set('permis_conduire', e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--foreground)' }}>Permis de conduire</span>
                </label>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {candidat.langues?.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Languages size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {candidat.langues.map((l: string) => (
                        <span key={l} className="neo-badge neo-badge-gray">{l}</span>
                      ))}
                    </div>
                  </div>
                )}
                {candidat.linkedin && (
                  <a href={candidat.linkedin} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12, textDecoration: 'none' }}
                  >
                    <Globe size={13} style={{ flexShrink: 0 }} />
                    <span>LinkedIn</span>
                    <ExternalLink size={10} />
                  </a>
                )}
                {candidat.permis_conduire != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...smallMuted }}>
                    <Car size={13} style={{ flexShrink: 0 }} />
                    <span>Permis : {candidat.permis_conduire ? '✅ Oui' : '❌ Non'}</span>
                  </div>
                )}
                {!candidat.langues?.length && !candidat.linkedin && candidat.permis_conduire == null && (
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>Aucune info supplémentaire</p>
                )}
              </div>
            )}
          </div>

          {/* Métadonnées */}
          <div className="neo-card-soft" style={{ padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Source', value: candidat.source || '—' },
                { label: 'Créé le', value: new Date(candidat.created_at).toLocaleDateString('fr-FR') },
                { label: 'Fichier', value: candidat.cv_nom_fichier || '—' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.value}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Résumé IA */}
          <div className="neo-card-soft" style={{ borderColor: 'rgba(245,167,35,0.25)', background: '#FFFBF0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Star size={14} style={{ color: 'var(--primary)' }} />
              </div>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Résumé IA</h2>
            </div>
            {isEditing ? (
              <textarea
                className="neo-input"
                style={{ height: 'auto', minHeight: 100, padding: '8px 13px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 13 }}
                placeholder="Résumé professionnel..."
                value={editData.resume_ia}
                onChange={e => set('resume_ia', e.target.value)}
              />
            ) : (
              <p style={{ fontSize: 13, color: 'var(--foreground)', lineHeight: 1.7, opacity: candidat.resume_ia ? 1 : 0.5 }}>
                {candidat.resume_ia || 'Aucun résumé IA disponible'}
              </p>
            )}
          </div>

          {/* Expériences professionnelles */}
          {(isEditing || candidat.experiences?.length > 0) && (
            <div className="neo-card-soft">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Briefcase size={14} style={{ color: '#7C3AED' }} />
                  </div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                    Expériences professionnelles
                    {candidat.experiences?.length > 0 && !isEditing && (
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>
                        ({candidat.experiences.length})
                      </span>
                    )}
                  </h2>
                </div>
                {isEditing && (
                  <button onClick={addExp} className="neo-btn-ghost neo-btn-sm" style={{ fontSize: 11 }}>
                    + Ajouter
                  </button>
                )}
              </div>

              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(editData.experiences || []).length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Aucune expérience. Cliquez sur &quot;Ajouter&quot;.</p>
                  )}
                  {(editData.experiences || []).map((exp: any, i: number) => (
                    <div key={i} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                        <button onClick={() => removeExp(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
                          <X size={13} />
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Poste / Titre" value={exp.poste} onChange={e => setExp(i, 'poste', e.target.value)} />
                        <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Entreprise" value={exp.entreprise} onChange={e => setExp(i, 'entreprise', e.target.value)} />
                        <input className="neo-input" style={{ height: 30, fontSize: 12, gridColumn: '1 / -1' }} placeholder="Période (ex: Jan 2020 - Mars 2023)" value={exp.periode} onChange={e => setExp(i, 'periode', e.target.value)} />
                        <textarea className="neo-input" style={{ height: 'auto', minHeight: 52, padding: '6px 13px', resize: 'vertical', fontFamily: 'inherit', fontSize: 12, lineHeight: 1.4, gridColumn: '1 / -1' }} placeholder="Description des missions..." value={exp.description} onChange={e => setExp(i, 'description', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  {/* Ligne verticale */}
                  <div style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 2, background: 'var(--border)', borderRadius: 2 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {candidat.experiences.map((exp: any, i: number) => (
                      <div key={i} style={{ position: 'relative' }}>
                        {/* Dot */}
                        <div style={{ position: 'absolute', left: -17, top: 4, width: 8, height: 8, borderRadius: '50%', background: '#7C3AED', border: '2px solid white', boxShadow: '0 0 0 1px #7C3AED' }} />
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>{exp.poste}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: exp.description ? 6 : 0 }}>
                          {exp.entreprise && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{exp.entreprise}</span>}
                          {exp.entreprise && exp.periode && <span style={{ fontSize: 11, color: 'var(--border)', fontWeight: 700 }}>·</span>}
                          {exp.periode && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{exp.periode}</span>}
                        </div>
                        {exp.description && (
                          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, fontStyle: 'italic' }}>{exp.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Formations détaillées */}
          {(isEditing || candidat.formations_details?.length > 0) && (
            <div className="neo-card-soft">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <GraduationCap size={14} style={{ color: '#059669' }} />
                  </div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                    Formations
                    {candidat.formations_details?.length > 0 && !isEditing && (
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>
                        ({candidat.formations_details.length})
                      </span>
                    )}
                  </h2>
                </div>
                {isEditing && (
                  <button onClick={addForm} className="neo-btn-ghost neo-btn-sm" style={{ fontSize: 11 }}>
                    + Ajouter
                  </button>
                )}
              </div>

              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(editData.formations_details || []).length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Aucune formation. Cliquez sur &quot;Ajouter&quot;.</p>
                  )}
                  {(editData.formations_details || []).map((form: any, i: number) => (
                    <div key={i} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                        <button onClick={() => removeForm(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
                          <X size={13} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Diplôme / Titre" value={form.diplome} onChange={e => setForm(i, 'diplome', e.target.value)} />
                        <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Établissement / École" value={form.etablissement} onChange={e => setForm(i, 'etablissement', e.target.value)} />
                        <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Année (ex: 2019 ou 2017 - 2019)" value={form.annee} onChange={e => setForm(i, 'annee', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {candidat.formations_details.map((form: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <GraduationCap size={16} style={{ color: '#059669' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>{form.diplome}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          {form.etablissement && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{form.etablissement}</span>}
                          {form.etablissement && form.annee && <span style={{ fontSize: 11, color: 'var(--muted)' }}>·</span>}
                          {form.annee && <span style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>{form.annee}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Candidatures */}
          {candidat.pipeline?.length > 0 && (
            <div className="neo-card-soft">
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12 }}>
                Candidatures ({candidat.pipeline.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {candidat.pipeline.map((p: any, i: number) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: i < candidat.pipeline.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{p.offres?.titre || 'Offre inconnue'}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {p.offres?.type_contrat}{p.offres?.localisation ? ` · ${p.offres.localisation}` : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.score_ia !== null && (
                        <span className={`neo-badge ${p.score_ia >= 75 ? 'neo-badge-green' : p.score_ia >= 50 ? 'neo-badge-yellow' : 'neo-badge-red'}`}>
                          {p.score_ia}%
                        </span>
                      )}
                      <span className={ETAPE_BADGE[p.etape as PipelineEtape]}>
                        {ETAPE_LABELS[p.etape as PipelineEtape]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="neo-card-soft">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <MessageSquare size={15} style={{ color: 'var(--muted)' }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                Notes ({candidat.notes_candidat?.length || 0})
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <textarea
                className="neo-input"
                placeholder="Ajouter une note... (Cmd+Entrée pour envoyer)"
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendNote() }}
                style={{ height: 'auto', minHeight: 72, padding: '8px 13px', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 13, flex: 1 }}
              />
              <button
                onClick={handleSendNote}
                disabled={!note.trim() || ajouterNote.isPending}
                className="neo-btn neo-btn-sm"
                style={{ alignSelf: 'flex-end', padding: '8px 12px' }}
              >
                <Send size={14} />
              </button>
            </div>
            {candidat.notes_candidat?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...candidat.notes_candidat].reverse().map((n: any) => (
                  <div key={n.id} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{n.auteur}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--foreground)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{n.contenu}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>
                Aucune note pour l&apos;instant.
              </p>
            )}
          </div>

          {/* Texte brut */}
          {candidat.cv_texte_brut && (
            <details className="neo-card-soft" style={{ padding: 0 }}>
              <summary style={{
                padding: '14px 22px', fontSize: 13, fontWeight: 500, color: 'var(--muted)',
                cursor: 'pointer', borderRadius: 'var(--radius-lg)', userSelect: 'none',
                listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                Texte brut du CV
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>cliquer pour déplier</span>
              </summary>
              <div style={{ padding: '0 22px 22px', borderTop: '1px solid var(--border)' }}>
                <pre style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.6, maxHeight: 256, overflowY: 'auto', marginTop: 12 }}>
                  {candidat.cv_texte_brut}
                </pre>
              </div>
            </details>
          )}
        </div>
      </div>
      {/* CV Viewer Modal */}
      {showCV && candidat.cv_url && (() => {
        const ext = (candidat.cv_nom_fichier || '').toLowerCase().split('.').pop() || ''
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
        const isPDF   = ext === 'pdf'
        const isWord  = ['doc', 'docx'].includes(ext)
        const docViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(candidat.cv_url)}&embedded=true`

        return (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)',
              display: 'flex', flexDirection: 'column',
            }}
            onClick={e => { if (e.target === e.currentTarget) setShowCV(false) }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 20px',
              background: 'var(--surface)', borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <FileText size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {candidat.cv_nom_fichier || 'CV'}
              </span>
              <a
                href={candidat.cv_url}
                target="_blank"
                rel="noopener noreferrer"
                className="neo-btn-ghost neo-btn-sm"
                style={{ flexShrink: 0 }}
              >
                <Maximize2 size={13} /> Plein écran
              </a>
              <button
                onClick={() => setShowCV(false)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
                  background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <X size={16} color="var(--muted)" />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isImage ? 24 : 0 }}>
              {isPDF && (
                <iframe
                  src={candidat.cv_url}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                  title="CV"
                />
              )}
              {isImage && (
                <img
                  src={candidat.cv_url}
                  alt="CV"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
                />
              )}
              {isWord && (
                <iframe
                  src={docViewerUrl}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                  title="CV"
                />
              )}
              {!isPDF && !isImage && !isWord && (
                <div style={{ textAlign: 'center', color: 'white' }}>
                  <FileText size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
                  <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
                    Aperçu non disponible pour ce format (.{ext})
                  </p>
                  <a
                    href={candidat.cv_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="neo-btn-yellow"
                  >
                    <ExternalLink size={14} /> Télécharger le fichier
                  </a>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
