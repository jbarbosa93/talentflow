'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, GraduationCap,
  FileText, ExternalLink, Trash2, MessageSquare, Star, Send,
  Pencil, X, Check, Globe, Car, Languages,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useCandidat, useUpdateCandidat, useUpdateStatutCandidat,
  useAjouterNote, useDeleteCandidat,
} from '@/hooks/useCandidats'
import type { PipelineEtape } from '@/types/database'

const ETAPE_COLORS: Record<PipelineEtape, string> = {
  nouveau:   'bg-sky-500/15 text-sky-400',
  contacte:  'bg-primary/15 text-primary',
  entretien: 'bg-violet-500/15 text-violet-400',
  place:     'bg-emerald-500/15 text-emerald-400',
  refuse:    'bg-rose-500/15 text-rose-400',
}
const ETAPE_LABELS: Record<PipelineEtape, string> = {
  nouveau: 'Nouveau', contacte: 'Contacté', entretien: 'Entretien', place: 'Placé', refuse: 'Refusé',
}

// Styles partagés pour les inputs en mode édition
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1.5px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  color: 'white',
  padding: '5px 10px',
  fontSize: 13,
  width: '100%',
  outline: 'none',
}
const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: 80,
  fontFamily: 'inherit',
  lineHeight: 1.5,
}

export default function CandidatDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [note, setNote] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, any>>({})

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
    })
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditData({})
  }

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
    updateCandidat.mutate({ id, data: payload }, {
      onSuccess: () => setIsEditing(false),
    })
  }

  const set = (field: string, value: any) =>
    setEditData(prev => ({ ...prev, [field]: value }))

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-white/5 animate-pulse rounded-md mb-6" />
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-1 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-white/5 animate-pulse rounded-xl border border-white/5" />
            ))}
          </div>
          <div className="col-span-2 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 bg-white/5 animate-pulse rounded-xl border border-white/5" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !candidat) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4 text-white/40 hover:text-white">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Button>
        <div className="text-center py-20 text-white/30">
          <p className="text-lg font-semibold text-white/50">Candidat introuvable</p>
          <p className="text-sm mt-1">Ce candidat n&apos;existe pas ou a été supprimé.</p>
        </div>
      </div>
    )
  }

  const initiales = ((candidat.prenom?.[0] || '') + (candidat.nom?.[0] || '')).toUpperCase() || '??'

  const handleSendNote = () => {
    if (!note.trim()) return
    ajouterNote.mutate({ candidat_id: id, contenu: note.trim() }, {
      onSuccess: () => setNote(''),
    })
  }

  const handleDelete = () => {
    deleteCandidat.mutate(id, {
      onSuccess: () => router.push('/candidats'),
    })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-white/40 hover:text-white hover:bg-white/5">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour aux candidats
        </Button>
        <div className="flex items-center gap-2">
          {/* Bouton édition */}
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={startEdit}
              className="border-white/10 text-white/60 hover:text-white hover:bg-white/5"
            >
              <Pencil className="w-3.5 h-3.5 mr-2" />
              Modifier
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={updateCandidat.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <Check className="w-3.5 h-3.5 mr-2" />
                {updateCandidat.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEdit}
                className="border-white/10 text-white/50 hover:text-white"
              >
                <X className="w-3.5 h-3.5 mr-2" />
                Annuler
              </Button>
            </>
          )}

          {candidat.cv_url && (
            <Button variant="outline" size="sm" asChild className="border-white/10 text-white/50 hover:text-white hover:bg-white/5">
              <a href={candidat.cv_url} target="_blank" rel="noopener noreferrer">
                <FileText className="w-4 h-4 mr-2" />
                Voir le CV
                <ExternalLink className="w-3 h-3 ml-1 opacity-60" />
              </a>
            </Button>
          )}
          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              size="sm"
              className="border-rose-500/20 text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </Button>
          ) : (
            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-md">
              <span className="text-xs text-rose-400 font-medium">Confirmer ?</span>
              <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={handleDelete} disabled={deleteCandidat.isPending}>
                Supprimer
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-white/40 hover:text-white" onClick={() => setShowDeleteConfirm(false)}>
                Annuler
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Left column */}
        <div className="col-span-1 space-y-3">

          {/* Identité */}
          <div className="bg-card border border-white/6 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-lg font-black text-primary flex-shrink-0">
                {initiales}
              </div>
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <input style={inputStyle} placeholder="Prénom" value={editData.prenom} onChange={e => set('prenom', e.target.value)} />
                    <input style={inputStyle} placeholder="Nom" value={editData.nom} onChange={e => set('nom', e.target.value)} />
                    <input style={inputStyle} placeholder="Titre / Poste" value={editData.titre_poste} onChange={e => set('titre_poste', e.target.value)} />
                  </div>
                ) : (
                  <>
                    <h1 className="font-bold text-sm text-white leading-tight">{candidat.prenom} {candidat.nom}</h1>
                    {candidat.titre_poste && <p className="text-xs text-white/40 mt-0.5">{candidat.titre_poste}</p>}
                  </>
                )}
              </div>
            </div>

            {/* Statut pipeline */}
            <div className="mb-4">
              <label className="text-[10px] font-semibold text-white/25 uppercase tracking-widest block mb-2">Statut pipeline</label>
              <Select
                value={candidat.statut_pipeline}
                onValueChange={(v) => updateStatut.mutate({ id, statut: v as PipelineEtape })}
                disabled={updateStatut.isPending}
              >
                <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white/70">
                  <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${ETAPE_COLORS[candidat.statut_pipeline as PipelineEtape]}`}>
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
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-white/25 uppercase tracking-widest block">Coordonnées</label>
                <input style={inputStyle} placeholder="Email" value={editData.email} onChange={e => set('email', e.target.value)} />
                <input style={inputStyle} placeholder="Téléphone" value={editData.telephone} onChange={e => set('telephone', e.target.value)} />
                <input style={inputStyle} placeholder="Localisation" value={editData.localisation} onChange={e => set('localisation', e.target.value)} />
              </div>
            ) : (
              <div className="space-y-2.5">
                {candidat.email && (
                  <a href={`mailto:${candidat.email}`} className="flex items-center gap-2.5 text-sm text-white/40 hover:text-primary transition-colors">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate text-xs">{candidat.email}</span>
                  </a>
                )}
                {candidat.telephone && (
                  <a href={`tel:${candidat.telephone}`} className="flex items-center gap-2.5 text-sm text-white/40 hover:text-primary transition-colors">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs">{candidat.telephone}</span>
                  </a>
                )}
                {candidat.localisation && (
                  <div className="flex items-center gap-2.5 text-white/40">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs">{candidat.localisation}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Expérience, Formation, Naissance */}
          <div className="bg-card border border-white/6 rounded-xl p-4 space-y-3">
            {isEditing ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-white/25 uppercase tracking-widest block">Expérience & Formation</label>
                <div className="flex items-center gap-2">
                  <input
                    style={{ ...inputStyle, width: 60 }}
                    type="number"
                    min={0}
                    max={60}
                    value={editData.annees_exp}
                    onChange={e => set('annees_exp', e.target.value)}
                  />
                  <span className="text-xs text-white/40">ans d&apos;expérience</span>
                </div>
                <input style={inputStyle} placeholder="Formation" value={editData.formation} onChange={e => set('formation', e.target.value)} />
                <input style={inputStyle} placeholder="Date de naissance (JJ/MM/AAAA)" value={editData.date_naissance} onChange={e => set('date_naissance', e.target.value)} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <Briefcase className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-semibold text-white/70">
                    {candidat.annees_exp} an{candidat.annees_exp > 1 ? 's' : ''} d&apos;expérience
                  </span>
                </div>
                {candidat.formation && (
                  <div className="flex items-start gap-2.5">
                    <GraduationCap className="w-3.5 h-3.5 text-white/30 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-white/40 leading-relaxed">{candidat.formation}</span>
                  </div>
                )}
                {candidat.date_naissance && (
                  <div className="flex items-center gap-2.5 text-white/40">
                    <span className="text-xs">🎂</span>
                    <span className="text-xs">{candidat.date_naissance}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Compétences */}
          <div className="bg-card border border-white/6 rounded-xl p-4">
            <h3 className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Compétences</h3>
            {isEditing ? (
              <div className="space-y-1">
                <textarea
                  style={textareaStyle}
                  placeholder="Séparées par des virgules : React, TypeScript, Node.js..."
                  value={editData.competences}
                  onChange={e => set('competences', e.target.value)}
                />
                <p className="text-[10px] text-white/25">Séparer par des virgules</p>
              </div>
            ) : candidat.competences?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {candidat.competences.map((c: string) => (
                  <span key={c} className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">{c}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/20">Aucune compétence</p>
            )}
          </div>

          {/* Langues, LinkedIn, Permis */}
          <div className="bg-card border border-white/6 rounded-xl p-4 space-y-3">
            {isEditing ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-white/25 uppercase tracking-widest block">Autres infos</label>
                <div className="space-y-1">
                  <textarea
                    style={{ ...textareaStyle, minHeight: 48 }}
                    placeholder="Langues (séparées par des virgules) : Français, Anglais..."
                    value={editData.langues}
                    onChange={e => set('langues', e.target.value)}
                  />
                </div>
                <input style={inputStyle} placeholder="LinkedIn URL" value={editData.linkedin} onChange={e => set('linkedin', e.target.value)} />
                <label className="flex items-center gap-2.5 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={editData.permis_conduire}
                    onChange={e => set('permis_conduire', e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: 'var(--primary)' }}
                  />
                  <span className="text-xs text-white/60">Permis de conduire</span>
                </label>
              </div>
            ) : (
              <>
                {candidat.langues?.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <Languages className="w-3.5 h-3.5 text-white/30 mt-0.5 flex-shrink-0" />
                    <div className="flex flex-wrap gap-1">
                      {candidat.langues.map((l: string) => (
                        <span key={l} className="text-xs bg-white/5 text-white/50 px-2 py-0.5 rounded-full">{l}</span>
                      ))}
                    </div>
                  </div>
                )}
                {candidat.linkedin && (
                  <a href={candidat.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-white/40 hover:text-primary transition-colors">
                    <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs truncate">LinkedIn</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                  </a>
                )}
                {candidat.permis_conduire != null && (
                  <div className="flex items-center gap-2.5">
                    <Car className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                    <span className="text-xs text-white/40">
                      Permis : {candidat.permis_conduire ? '✅ Oui' : '❌ Non'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Métadonnées */}
          <div className="bg-card border border-white/6 rounded-xl p-4">
            <div className="space-y-2 text-xs">
              {[
                { label: 'Source', value: candidat.source || '—' },
                { label: 'Créé le', value: new Date(candidat.created_at).toLocaleDateString('fr-FR') },
                { label: 'Fichier', value: candidat.cv_nom_fichier || '—' },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-white/25">{item.label}</span>
                  <span className="text-white/50 font-medium truncate max-w-[120px]" title={item.value}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-2 space-y-4">

          {/* Résumé IA */}
          <div className="bg-card border border-primary/15 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Star className="w-3.5 h-3.5 text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-white/80">Résumé IA</h2>
            </div>
            {isEditing ? (
              <textarea
                style={{ ...textareaStyle, minHeight: 100 }}
                placeholder="Résumé professionnel..."
                value={editData.resume_ia}
                onChange={e => set('resume_ia', e.target.value)}
              />
            ) : (
              <p className="text-sm text-white/50 leading-relaxed">
                {candidat.resume_ia || <span className="text-white/20 italic">Aucun résumé IA disponible</span>}
              </p>
            )}
          </div>

          {/* Candidatures */}
          {candidat.pipeline?.length > 0 && (
            <div className="bg-card border border-white/6 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white/80 mb-4">Candidatures ({candidat.pipeline.length})</h2>
              <div className="space-y-2">
                {candidat.pipeline.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-white/70">{p.offres?.titre || 'Offre inconnue'}</p>
                      <p className="text-xs text-white/30 mt-0.5">
                        {p.offres?.type_contrat}{p.offres?.localisation ? ` · ${p.offres.localisation}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {p.score_ia !== null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.score_ia >= 75 ? 'bg-emerald-500/15 text-emerald-400' : p.score_ia >= 50 ? 'bg-primary/15 text-primary' : 'bg-rose-500/15 text-rose-400'}`}>
                          {p.score_ia}%
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ETAPE_COLORS[p.etape as PipelineEtape]}`}>
                        {ETAPE_LABELS[p.etape as PipelineEtape]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-card border border-white/6 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-white/30" />
              <h2 className="text-sm font-semibold text-white/80">Notes ({candidat.notes_candidat?.length || 0})</h2>
            </div>
            <div className="flex gap-2 mb-4">
              <Textarea
                placeholder="Ajouter une note... (Cmd+Entrée pour envoyer)"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="resize-none text-sm min-h-[72px] bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/40"
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendNote() }}
              />
              <Button size="sm" className="self-end" onClick={handleSendNote} disabled={!note.trim() || ajouterNote.isPending}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
            {candidat.notes_candidat?.length > 0 ? (
              <div className="space-y-2.5">
                {[...candidat.notes_candidat].reverse().map((n: any) => (
                  <div key={n.id} className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white/50">{n.auteur}</span>
                      <span className="text-xs text-white/25">
                        {new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-sm text-white/40 whitespace-pre-wrap leading-relaxed">{n.contenu}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/20 text-center py-4">Aucune note pour l&apos;instant.</p>
            )}
          </div>

          {/* Texte brut */}
          {candidat.cv_texte_brut && (
            <details className="bg-card border border-white/6 rounded-xl group">
              <summary className="px-5 py-3.5 text-sm font-medium text-white/40 cursor-pointer hover:text-white/60 rounded-xl select-none transition-colors list-none flex items-center justify-between">
                Texte brut du CV
                <span className="text-xs text-white/20">cliquer pour déplier</span>
              </summary>
              <div className="px-5 pb-5 pt-2 border-t border-white/5">
                <pre className="text-xs text-white/25 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                  {candidat.cv_texte_brut}
                </pre>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
