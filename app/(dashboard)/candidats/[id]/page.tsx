'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, GraduationCap,
  FileText, ExternalLink, Trash2, MessageSquare, Star, Send,
  Pencil, X, Check, Car, Languages, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown,
} from 'lucide-react'
import {
  useCandidat, useUpdateCandidat, useUpdateStatutCandidat,
  useAjouterNote, useDeleteCandidat,
} from '@/hooks/useCandidats'
import type { PipelineEtape } from '@/types/database'

const AGENCE_METIERS_LS_KEY = 'agence_metiers'
const CANDIDAT_SECTIONS_LS_KEY = 'candidat_sections_order'

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

const calculerAge = (dateNaissance: string | null): number | null => {
  if (!dateNaissance) return null
  let birthDate: Date | null = null

  // Format ISO : YYYY-MM-DD ou YYYY/MM/DD
  const isoMatch = dateNaissance.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
  if (isoMatch) {
    birthDate = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
  }

  // Format européen : DD/MM/YYYY ou DD.MM.YYYY
  if (!birthDate) {
    const euMatch = dateNaissance.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/)
    if (euMatch) {
      birthDate = new Date(parseInt(euMatch[3]), parseInt(euMatch[2]) - 1, parseInt(euMatch[1]))
    }
  }

  // Année seule : "01/01/1985" (généré quand seulement âge connu) ou "1985"
  if (!birthDate) {
    const yearOnly = dateNaissance.match(/^(\d{4})$/)
    if (yearOnly) {
      birthDate = new Date(parseInt(yearOnly[1]), 0, 1)
    }
  }

  if (!birthDate || isNaN(birthDate.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age > 0 && age < 100 ? age : null
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.1em',
  display: 'block', marginBottom: 6,
}
const smallMuted: React.CSSProperties = { color: 'var(--muted)', fontSize: 12 }

export default function CandidatDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [note, setNote]                   = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditing, setIsEditing]         = useState(false)
  const [editData, setEditData]           = useState<Record<string, any>>({})
  const [showCV, setShowCV]               = useState(true)
  const [cvZoom, setCvZoom]               = useState(1.0)
  const [sectionsOrder, setSectionsOrder] = useState<string[]>(['resume','experiences','formations','candidatures','notes'])
  const [agenceMetiers, setAgenceMetiers] = useState<string[]>([])
  const cvScrollRef     = useRef<HTMLDivElement>(null)
  const imgContainerRef = useRef<HTMLDivElement>(null)
  const cvDragRef  = useRef({ active: false, startX: 0, startY: 0, sl: 0, st: 0 })
  const imgDragRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 })

  const cvDragStart = (e: React.MouseEvent) => {
    const el = cvScrollRef.current; if (!el) return
    cvDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
    el.style.cursor = 'grabbing'
  }
  const cvDragMove = (e: React.MouseEvent) => {
    const d = cvDragRef.current; const el = cvScrollRef.current
    if (!d.active || !el) return
    el.scrollLeft = d.sl - (e.clientX - d.startX)
    el.scrollTop  = d.st - (e.clientY - d.startY)
  }
  const cvDragEnd = () => { cvDragRef.current.active = false; if (cvScrollRef.current) cvScrollRef.current.style.cursor = 'grab' }

  const { data, isLoading, error } = useCandidat(id)
  const updateCandidat  = useUpdateCandidat()
  const updateStatut    = useUpdateStatutCandidat()
  const ajouterNote     = useAjouterNote()
  const deleteCandidat  = useDeleteCandidat()

  const candidat = data as any

  // Distance depuis Monthey, Suisse (46.2548, 6.9567)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('candidat_sections_order')
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) setSectionsOrder(parsed)
      }
    } catch {}
    try {
      const stored = localStorage.getItem(AGENCE_METIERS_LS_KEY)
      if (stored) setAgenceMetiers(JSON.parse(stored))
    } catch {}
  }, [])

  useEffect(() => {
    if (!candidat?.localisation) return
    setDistanceKm(null)
    const loc = candidat.localisation
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(loc)}&format=json&limit=1`)
      .then(r => r.json())
      .then(d => {
        if (d?.[0]) {
          const lat2 = parseFloat(d[0].lat)
          const lon2 = parseFloat(d[0].lon)
          const R = 6371
          const dLat = (lat2 - 46.2548) * Math.PI / 180
          const dLon = (lon2 - 6.9567)  * Math.PI / 180
          const a = Math.sin(dLat/2)**2 + Math.cos(46.2548*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
          setDistanceKm(Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))))
        }
      })
      .catch(() => {})
  }, [candidat?.localisation])

  const set = (field: string, value: any) => setEditData(prev => ({ ...prev, [field]: value }))

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
      metiers: candidat.tags || [],
    })
    setIsEditing(true)
  }

  const addExp    = () => set('experiences', [...(editData.experiences || []), { poste: '', entreprise: '', periode: '', description: '' }])
  const removeExp = (i: number) => set('experiences', (editData.experiences || []).filter((_: any, idx: number) => idx !== i))
  const setExp    = (i: number, field: string, value: string) => {
    const arr = [...(editData.experiences || [])]; arr[i] = { ...arr[i], [field]: value }; set('experiences', arr)
  }
  const addForm    = () => set('formations_details', [...(editData.formations_details || []), { diplome: '', etablissement: '', annee: '' }])
  const removeForm = (i: number) => set('formations_details', (editData.formations_details || []).filter((_: any, idx: number) => idx !== i))
  const setForm    = (i: number, field: string, value: string) => {
    const arr = [...(editData.formations_details || [])]; arr[i] = { ...arr[i], [field]: value }; set('formations_details', arr)
  }

  const cancelEdit = () => { setIsEditing(false); setEditData({}) }
  const saveEdit   = () => {
    const payload: Record<string, any> = {
      ...editData,
      annees_exp:  parseInt(editData.annees_exp) || 0,
      competences: editData.competences ? editData.competences.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      langues:     editData.langues     ? editData.langues.split(',').map((s: string) => s.trim()).filter(Boolean)     : [],
      tags:        editData.metiers || [],
    }
    updateCandidat.mutate({ id, data: payload }, { onSuccess: () => setIsEditing(false) })
  }

  const moveSection = (key: string, dir: -1 | 1) => {
    setSectionsOrder(prev => {
      const next = [...prev]
      const idx = next.indexOf(key)
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      localStorage.setItem(CANDIDAT_SECTIONS_LS_KEY, JSON.stringify(next))
      return next
    })
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="d-page">
        <div style={{ height: 32, width: 200, background: 'var(--border)', borderRadius: 8, marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 620px', gap: 20 }}>
          {[4, 3, 1].map((n, col) => (
            <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} style={{ height: col === 2 ? 500 : 112, background: 'var(--border)', borderRadius: 12, opacity: 0.5 }} />
              ))}
            </div>
          ))}
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

  const initiales    = ((candidat.prenom?.[0] || '') + (candidat.nom?.[0] || '')).toUpperCase() || '??'
  const handleSendNote = () => {
    if (!note.trim()) return
    ajouterNote.mutate({ candidat_id: id, contenu: note.trim() }, { onSuccess: () => setNote('') })
  }
  const handleDelete = () => {
    deleteCandidat.mutate(id, { onSuccess: () => router.push('/candidats') })
  }

  // CV viewer helpers
  const ext          = (candidat.cv_nom_fichier || '').toLowerCase().split('.').pop() || ''
  const cvIsImage    = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  const cvIsPDF      = ext === 'pdf'
  const cvIsWord     = ['doc', 'docx'].includes(ext)
  const docViewerUrl = candidat.cv_url
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(candidat.cv_url)}&embedded=true`
    : ''

  return (
    <div className="d-page" style={{ paddingBottom: 40 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
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
              <button onClick={saveEdit} disabled={updateCandidat.isPending} className="neo-btn neo-btn-sm" style={{ background: '#059669', boxShadow: 'none' }}>
                <Check size={13} />
                {updateCandidat.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button onClick={cancelEdit} className="neo-btn-ghost neo-btn-sm">
                <X size={13} /> Annuler
              </button>
            </>
          )}
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} className="neo-btn-ghost neo-btn-sm" style={{ borderColor: '#FECACA', color: '#DC2626' }}>
              <Trash2 size={13} /> Supprimer
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEE2E2', border: '1px solid #FECACA', padding: '6px 12px', borderRadius: 100 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626' }}>Confirmer ?</span>
              <button onClick={handleDelete} disabled={deleteCandidat.isPending} className="neo-btn neo-btn-sm" style={{ background: '#DC2626', boxShadow: 'none', padding: '4px 10px', fontSize: 11 }}>Supprimer</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="neo-btn-ghost neo-btn-sm" style={{ padding: '4px 10px', fontSize: 11 }}>Annuler</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Grid 3 colonnes ── */}
      <div style={{ display: 'grid', gridTemplateColumns: showCV ? '240px 1fr 620px' : '240px 1fr', gap: 16, alignItems: 'start', transition: 'grid-template-columns 0.2s ease' }}>

        {/* ══ COLONNE 1 — Infos candidat ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Identité */}
          <div className="neo-card-soft" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div className="neo-avatar" style={{ width: 44, height: 44, fontSize: 15, flexShrink: 0 }}>{initiales}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Prénom" value={editData.prenom} onChange={e => set('prenom', e.target.value)} />
                    <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Nom" value={editData.nom} onChange={e => set('nom', e.target.value)} />
                    <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Titre / Poste" value={editData.titre_poste} onChange={e => set('titre_poste', e.target.value)} />
                  </div>
                ) : (
                  <>
                    <h1 style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', lineHeight: 1.3 }}>
                      {candidat.prenom} {candidat.nom}
                    </h1>
                    {candidat.titre_poste && <p style={{ ...smallMuted, marginTop: 2 }}>{candidat.titre_poste}</p>}
                  </>
                )}
              </div>
            </div>

            {/* Statut pipeline */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Pipeline</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {(Object.keys(ETAPE_LABELS) as PipelineEtape[]).map(e => {
                  const isActive = candidat.statut_pipeline === e
                  const colors: Record<PipelineEtape, string> = {
                    nouveau: '#3B82F6', contacte: '#F59E0B', entretien: '#8B5CF6',
                    place: '#10B981', refuse: '#EF4444',
                  }
                  return (
                    <button key={e} onClick={() => updateStatut.mutate({ id, statut: e })}
                      disabled={updateStatut.isPending || isActive}
                      style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: isActive ? 700 : 500,
                        cursor: isActive ? 'default' : 'pointer', transition: 'all 0.15s',
                        border: isActive ? `2px solid ${colors[e]}` : '1px solid var(--border)',
                        background: isActive ? colors[e] : 'white',
                        color: isActive ? 'white' : 'var(--muted)',
                        boxShadow: isActive ? `0 2px 8px ${colors[e]}44` : 'none',
                      }}
                    >{ETAPE_LABELS[e]}</button>
                  )
                })}
              </div>
            </div>

            {/* Coordonnées */}
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle}>Coordonnées</label>
                <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Email"        value={editData.email}       onChange={e => set('email', e.target.value)} />
                <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Téléphone"    value={editData.telephone}   onChange={e => set('telephone', e.target.value)} />
                <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Date de naissance (JJ.MM.AAAA)" value={editData.date_naissance} onChange={e => set('date_naissance', e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 2 }}>
                  <input type="checkbox" checked={editData.permis_conduire} onChange={e => set('permis_conduire', e.target.checked)} style={{ width: 14, height: 14, accentColor: 'var(--primary)' }} />
                  <span style={{ fontSize: 12, color: 'var(--foreground)' }}>Permis de conduire</span>
                </label>
                {agenceMetiers.length > 0 && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 5 }}>Métiers</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {agenceMetiers.map(m => {
                        const active = (editData.metiers || []).includes(m)
                        return (
                          <button key={m} type="button" onClick={() => {
                            const current = editData.metiers || []
                            set('metiers', active ? current.filter((x: string) => x !== m) : [...current, m])
                          }}
                            style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer', border: active ? '2px solid var(--primary)' : '1px solid var(--border)', background: active ? 'var(--primary-soft)' : 'white', color: active ? 'var(--foreground)' : 'var(--muted)', transition: 'all 0.15s' }}>
                            {m}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Localisation" value={editData.localisation} onChange={e => set('localisation', e.target.value)} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {candidat.email && (
                  <a href={`mailto:${candidat.email}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12, textDecoration: 'none' }}>
                    <Mail size={12} style={{ flexShrink: 0, color: 'var(--primary)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidat.email}</span>
                  </a>
                )}
                {candidat.telephone && (
                  <a href={`tel:${candidat.telephone}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12, textDecoration: 'none' }}>
                    <Phone size={12} style={{ flexShrink: 0 }} /><span>{candidat.telephone}</span>
                  </a>
                )}
                {(candidat.date_naissance || calculerAge(candidat.date_naissance) !== null) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...smallMuted }}>
                    <span style={{ fontSize: 12 }}>🎂</span>
                    <span>
                      {calculerAge(candidat.date_naissance) !== null
                        ? <><strong style={{ color: 'var(--foreground)', fontWeight: 700 }}>{calculerAge(candidat.date_naissance)} ans</strong>{candidat.date_naissance && !candidat.date_naissance.startsWith('01/01/') && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>({candidat.date_naissance})</span>}</>
                        : candidat.date_naissance
                      }
                    </span>
                  </div>
                )}
                {candidat.permis_conduire != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...smallMuted }}>
                    <Car size={12} style={{ flexShrink: 0 }} />
                    <span>Permis : {candidat.permis_conduire ? '✅ Oui' : '❌ Non'}</span>
                  </div>
                )}
                {candidat.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                    {candidat.tags.map((m: string) => (
                      <span key={m} style={{ padding: '3px 10px', borderRadius: 20, background: 'var(--primary-soft)', border: '1.5px solid var(--primary)', fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{m}</span>
                    ))}
                  </div>
                )}
                {candidat.localisation && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...smallMuted }}>
                    <MapPin size={12} style={{ flexShrink: 0 }} />
                    <a
                      href={`https://www.google.com/maps/search/${encodeURIComponent(candidat.localisation)}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 12 }}
                      onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}
                    >{candidat.localisation}</a>
                    {distanceKm !== null && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-soft)', padding: '1px 7px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                        ~{distanceKm} km
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Formation */}
          <div className="neo-card-soft" style={{ padding: 14 }}>
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle}>Formation</label>
                <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Formation" value={editData.formation} onChange={e => set('formation', e.target.value)} />
              </div>
            ) : candidat.formation ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <GraduationCap size={12} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
                <span style={{ ...smallMuted, lineHeight: 1.5 }}>{candidat.formation}</span>
              </div>
            ) : null}
          </div>

          {/* Compétences */}
          <div className="neo-card-soft" style={{ padding: 14 }}>
            <label style={labelStyle}>Compétences</label>
            {isEditing ? (
              <div>
                <textarea className="neo-input" style={{ height: 'auto', minHeight: 68, padding: '6px 12px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 12 }} placeholder="React, TypeScript, Node.js..." value={editData.competences} onChange={e => set('competences', e.target.value)} />
                <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>Séparer par des virgules</p>
              </div>
            ) : candidat.competences?.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {candidat.competences.map((c: string) => <span key={c} className="neo-tag">{c}</span>)}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Aucune compétence</p>
            )}
          </div>

          {/* Langues */}
          {(isEditing || candidat.langues?.length > 0) && (
            <div className="neo-card-soft" style={{ padding: 14 }}>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={labelStyle}>Langues</label>
                  <textarea className="neo-input" style={{ height: 'auto', minHeight: 48, padding: '5px 12px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 12 }} placeholder="Français, Anglais..." value={editData.langues} onChange={e => set('langues', e.target.value)} />
                  <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Séparer par des virgules</p>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Languages size={12} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {candidat.langues.map((l: string) => <span key={l} className="neo-badge neo-badge-gray">{l}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Métadonnées */}
          <div className="neo-card-soft" style={{ padding: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                { label: 'Source',  value: candidat.source || '—' },
                { label: 'Créé le', value: new Date(candidat.created_at).toLocaleDateString('fr-FR') },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.value}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ COLONNE 2 — Contenu (résumé, exp, formations, notes) ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Résumé IA */}
          <div className="neo-card-soft" style={{ borderColor: 'rgba(245,167,35,0.25)', background: '#FFFBF0', order: sectionsOrder.indexOf('resume') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Star size={13} style={{ color: 'var(--primary)' }} />
              </div>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Résumé IA</h2>
              {isEditing && (
                <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                  <button type="button" onClick={() => moveSection('resume', -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={11} /></button>
                  <button type="button" onClick={() => moveSection('resume', 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={11} /></button>
                </div>
              )}
            </div>
            {isEditing ? (
              <textarea className="neo-input" style={{ height: 'auto', minHeight: 90, padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 13 }} placeholder="Résumé professionnel..." value={editData.resume_ia} onChange={e => set('resume_ia', e.target.value)} />
            ) : (
              <p style={{ fontSize: 13, color: 'var(--foreground)', lineHeight: 1.7, opacity: candidat.resume_ia ? 1 : 0.5 }}>
                {candidat.resume_ia || 'Aucun résumé IA disponible'}
              </p>
            )}
          </div>

          {/* Expériences professionnelles */}
          <div style={{ order: sectionsOrder.indexOf('experiences') }}>
          {(isEditing || candidat.experiences?.length > 0) && (
            <div className="neo-card-soft">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Briefcase size={13} style={{ color: '#7C3AED' }} />
                  </div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                    Expériences professionnelles
                    {candidat.experiences?.length > 0 && !isEditing && (
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>({candidat.experiences.length})</span>
                    )}
                  </h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isEditing && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button type="button" onClick={() => moveSection('experiences', -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={11} /></button>
                      <button type="button" onClick={() => moveSection('experiences', 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={11} /></button>
                    </div>
                  )}
                  {isEditing && <button onClick={addExp} className="neo-btn-ghost neo-btn-sm" style={{ fontSize: 11 }}>+ Ajouter</button>}
                </div>
              </div>

              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(editData.experiences || []).length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Aucune expérience. Cliquez sur &quot;Ajouter&quot;.</p>}
                  {(editData.experiences || []).map((exp: any, i: number) => (
                    <div key={i} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 5 }}>
                        <button onClick={() => removeExp(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}><X size={12} /></button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        <input className="neo-input" style={{ height: 28, fontSize: 12 }} placeholder="Poste / Titre" value={exp.poste} onChange={e => setExp(i, 'poste', e.target.value)} />
                        <input className="neo-input" style={{ height: 28, fontSize: 12 }} placeholder="Entreprise" value={exp.entreprise} onChange={e => setExp(i, 'entreprise', e.target.value)} />
                        <input className="neo-input" style={{ height: 28, fontSize: 12, gridColumn: '1 / -1' }} placeholder="Période (Jan 2020 - Mars 2023)" value={exp.periode} onChange={e => setExp(i, 'periode', e.target.value)} />
                        <textarea className="neo-input" style={{ height: 'auto', minHeight: 48, padding: '5px 12px', resize: 'vertical', fontFamily: 'inherit', fontSize: 12, lineHeight: 1.4, gridColumn: '1 / -1' }} placeholder="Description des missions..." value={exp.description} onChange={e => setExp(i, 'description', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 18 }}>
                  <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'var(--border)', borderRadius: 2 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {candidat.experiences.map((exp: any, i: number) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', left: -16, top: 4, width: 8, height: 8, borderRadius: '50%', background: '#7C3AED', border: '2px solid white', boxShadow: '0 0 0 1px #7C3AED' }} />
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>{exp.poste}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: exp.description ? 5 : 0 }}>
                          {exp.entreprise && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{exp.entreprise}</span>}
                          {exp.entreprise && exp.periode && <span style={{ fontSize: 11, color: 'var(--border)', fontWeight: 700 }}>·</span>}
                          {exp.periode && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{exp.periode}</span>}
                        </div>
                        {exp.description && <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, fontStyle: 'italic' }}>{exp.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Formations détaillées */}
          <div style={{ order: sectionsOrder.indexOf('formations') }}>
          {(isEditing || candidat.formations_details?.length > 0) && (
            <div className="neo-card-soft">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <GraduationCap size={13} style={{ color: '#059669' }} />
                  </div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                    Formations
                    {candidat.formations_details?.length > 0 && !isEditing && (
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>({candidat.formations_details.length})</span>
                    )}
                  </h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isEditing && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button type="button" onClick={() => moveSection('formations', -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={11} /></button>
                      <button type="button" onClick={() => moveSection('formations', 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={11} /></button>
                    </div>
                  )}
                  {isEditing && <button onClick={addForm} className="neo-btn-ghost neo-btn-sm" style={{ fontSize: 11 }}>+ Ajouter</button>}
                </div>
              </div>

              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(editData.formations_details || []).length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Aucune formation. Cliquez sur &quot;Ajouter&quot;.</p>}
                  {(editData.formations_details || []).map((form: any, i: number) => (
                    <div key={i} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 5 }}>
                        <button onClick={() => removeForm(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}><X size={12} /></button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <input className="neo-input" style={{ height: 28, fontSize: 12 }} placeholder="Diplôme / Titre" value={form.diplome} onChange={e => setForm(i, 'diplome', e.target.value)} />
                        <input className="neo-input" style={{ height: 28, fontSize: 12 }} placeholder="Établissement / École" value={form.etablissement} onChange={e => setForm(i, 'etablissement', e.target.value)} />
                        <input className="neo-input" style={{ height: 28, fontSize: 12 }} placeholder="Année (ex: 2019)" value={form.annee} onChange={e => setForm(i, 'annee', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {candidat.formations_details.map((form: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 7, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <GraduationCap size={14} style={{ color: '#059669' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>{form.diplome}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
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
          </div>

          {/* Candidatures */}
          <div style={{ order: sectionsOrder.indexOf('candidatures') }}>
          {candidat.pipeline?.length > 0 && (
            <div className="neo-card-soft">
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Candidatures ({candidat.pipeline.length})</h2>
                {isEditing && (
                  <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                    <button type="button" onClick={() => moveSection('candidatures', -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={11} /></button>
                    <button type="button" onClick={() => moveSection('candidatures', 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={11} /></button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {candidat.pipeline.map((p: any, i: number) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < candidat.pipeline.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{p.offres?.titre || 'Offre inconnue'}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{p.offres?.type_contrat}{p.offres?.localisation ? ` · ${p.offres.localisation}` : ''}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.score_ia !== null && (
                        <span className={`neo-badge ${p.score_ia >= 75 ? 'neo-badge-green' : p.score_ia >= 50 ? 'neo-badge-yellow' : 'neo-badge-red'}`}>{p.score_ia}%</span>
                      )}
                      <span className={ETAPE_BADGE[p.etape as PipelineEtape]}>{ETAPE_LABELS[p.etape as PipelineEtape]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* Notes */}
          <div className="neo-card-soft" style={{ order: sectionsOrder.indexOf('notes') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <MessageSquare size={14} style={{ color: 'var(--muted)' }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Notes ({candidat.notes_candidat?.length || 0})</h2>
              {isEditing && (
                <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                  <button type="button" onClick={() => moveSection('notes', -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={11} /></button>
                  <button type="button" onClick={() => moveSection('notes', 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={11} /></button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <textarea className="neo-input" placeholder="Ajouter une note... (Cmd+Entrée pour envoyer)" value={note} onChange={e => setNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendNote() }}
                style={{ height: 'auto', minHeight: 68, padding: '7px 12px', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 13, flex: 1 }} />
              <button onClick={handleSendNote} disabled={!note.trim() || ajouterNote.isPending} className="neo-btn neo-btn-sm" style={{ alignSelf: 'flex-end', padding: '8px 12px' }}>
                <Send size={13} />
              </button>
            </div>
            {candidat.notes_candidat?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[...candidat.notes_candidat].reverse().map((n: any) => (
                  <div key={n.id} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{n.auteur}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--foreground)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{n.contenu}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Aucune note pour l&apos;instant.</p>
            )}
          </div>

          {/* Texte brut */}
          {candidat.cv_texte_brut && (
            <details className="neo-card-soft" style={{ padding: 0 }}>
              <summary style={{ padding: '12px 20px', fontSize: 13, fontWeight: 500, color: 'var(--muted)', cursor: 'pointer', borderRadius: 'var(--radius-lg)', userSelect: 'none', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Texte brut du CV <span style={{ fontSize: 11, color: 'var(--muted)' }}>cliquer pour déplier</span>
              </summary>
              <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
                <pre style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.6, maxHeight: 240, overflowY: 'auto', marginTop: 10 }}>
                  {candidat.cv_texte_brut}
                </pre>
              </div>
            </details>
          )}
        </div>

        {/* ══ COLONNE 3 — Viewer CV (sticky) ══ */}
        {showCV && (
        <div style={{ position: 'sticky', top: 0, height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>

            {/* Header du viewer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--background)' }}>
              <FileText size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ flex: 1 }} />
              {candidat.cv_url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {[{ label: '−', action: () => setCvZoom(z => Math.max(0.4, parseFloat((z - 0.2).toFixed(1)))) },
                    { label: Math.round(cvZoom * 100) + '%', action: () => setCvZoom(1.0) },
                    { label: '+', action: () => setCvZoom(z => Math.min(3.0, parseFloat((z + 0.2).toFixed(1)))) }
                  ].map(btn => (
                    <button key={btn.label} onClick={btn.action} style={{ minWidth: btn.label.includes('%') ? 38 : 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setShowCV(false)} title="Masquer le CV"
                style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ChevronRight size={12} />
              </button>
            </div>

            {/* Corps du viewer */}
            {!candidat.cv_url ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                  <FileText size={40} style={{ opacity: 0.25, margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Aucun CV disponible</p>
                  <p style={{ fontSize: 12 }}>Le fichier CV n&apos;a pas été importé</p>
                </div>
              </div>
            ) : cvIsImage ? (
              <div ref={imgContainerRef}
                style={{ flex: 1, overflow: 'auto', background: '#F1F5F9', cursor: 'grab', userSelect: 'none', display: 'flex', justifyContent: 'center', padding: 16 }}
                onMouseDown={e => { const el = imgContainerRef.current; if (!el) return; imgDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }; el.style.cursor = 'grabbing' }}
                onMouseMove={e => { const d = imgDragRef.current; const el = imgContainerRef.current; if (!d.active || !el) return; el.scrollLeft = d.scrollLeft - (e.clientX - d.startX); el.scrollTop = d.scrollTop - (e.clientY - d.startY) }}
                onMouseUp={() => { imgDragRef.current.active = false; if (imgContainerRef.current) imgContainerRef.current.style.cursor = 'grab' }}
                onMouseLeave={() => { imgDragRef.current.active = false; if (imgContainerRef.current) imgContainerRef.current.style.cursor = 'grab' }}
              >
                <img src={candidat.cv_url} alt="CV" style={{ width: `${cvZoom * 100}%`, maxWidth: 'none', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', pointerEvents: 'none', alignSelf: 'flex-start' }} />
              </div>
            ) : (cvIsPDF || cvIsWord) ? (
              <div ref={cvScrollRef}
                style={{ flex: 1, overflow: 'auto', background: '#F1F5F9', cursor: 'grab', userSelect: 'none', position: 'relative' }}
                onMouseDown={cvDragStart} onMouseMove={cvDragMove} onMouseUp={cvDragEnd} onMouseLeave={cvDragEnd}
              >
                <div style={{ width: `${cvZoom * 100}%`, minWidth: '100%', height: `${cvZoom * 100}%`, minHeight: '100%', position: 'relative' }}>
                  {/* Drag overlay — couvre le iframe pour capturer les events souris */}
                  <div style={{ position: 'absolute', inset: 0, zIndex: 6, cursor: 'inherit' }}
                    onMouseDown={cvDragStart} onMouseMove={cvDragMove} onMouseUp={cvDragEnd} onMouseLeave={cvDragEnd} />
                  {cvIsWord && <>
                    {/* Masque bouton [↗] Google Docs (haut droite) */}
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 56, height: 56, background: 'white', zIndex: 10 }} />
                    {/* Masque zoom +/- Google Docs (bas) */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, background: 'white', zIndex: 10 }} />
                  </>}
                  <iframe
                    src={cvIsPDF ? `${candidat.cv_url}#toolbar=0&navpanes=0&view=FitH&zoom=page-width` : docViewerUrl}
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'none' }}
                    title="CV"
                  />
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <FileText size={36} style={{ color: 'var(--muted)', opacity: 0.4, marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>Aperçu non disponible (.{ext})</p>
                  <a href={candidat.cv_url} target="_blank" rel="noopener noreferrer" className="neo-btn-yellow" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <ExternalLink size={13} /> Ouvrir le fichier
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

      </div>

      {/* ── Bouton flottant "Voir CV" quand masqué ── */}
      {!showCV && candidat.cv_url && (
        <button
          onClick={() => setShowCV(true)}
          style={{
            position: 'fixed', bottom: 28, right: 28, zIndex: 50,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 100,
            background: 'var(--primary)', color: '#000',
            fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.24)' }}
          onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.18)' }}
        >
          <ChevronLeft size={15} />
          Voir le CV
        </button>
      )}

    </div>
  )
}
