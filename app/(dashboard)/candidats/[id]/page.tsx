'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, GraduationCap,
  FileText, ExternalLink, Trash2, MessageSquare, Star, Send,
  Pencil, X, Check, Car, Languages, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown, Info, Download, Printer, RotateCcw, RotateCw,
  Upload, Camera, Loader2, Eye,
} from 'lucide-react'
import {
  useCandidat, useUpdateCandidat, useUpdateStatutCandidat,
  useAjouterNote, useDeleteCandidat,
} from '@/hooks/useCandidats'
import type { PipelineEtape } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import PhotoCropModal from '@/components/PhotoCropModal'

// Drapeau emoji pour chaque langue
const LANG_FLAGS: Record<string, string> = {
  'français': '🇫🇷', 'francais': '🇫🇷', 'french': '🇫🇷',
  'anglais': '🇬🇧', 'english': '🇬🇧',
  'allemand': '🇩🇪', 'german': '🇩🇪', 'deutsch': '🇩🇪',
  'italien': '🇮🇹', 'italian': '🇮🇹', 'italiano': '🇮🇹',
  'espagnol': '🇪🇸', 'spanish': '🇪🇸', 'español': '🇪🇸',
  'portugais': '🇵🇹', 'portuguese': '🇵🇹', 'português': '🇵🇹',
  'néerlandais': '🇳🇱', 'neerlandais': '🇳🇱', 'dutch': '🇳🇱',
  'russe': '🇷🇺', 'russian': '🇷🇺',
  'chinois': '🇨🇳', 'chinese': '🇨🇳', 'mandarin': '🇨🇳',
  'japonais': '🇯🇵', 'japanese': '🇯🇵',
  'coréen': '🇰🇷', 'korean': '🇰🇷',
  'arabe': '🇸🇦', 'arabic': '🇸🇦',
  'turc': '🇹🇷', 'turkish': '🇹🇷',
  'polonais': '🇵🇱', 'polish': '🇵🇱',
  'roumain': '🇷🇴', 'romanian': '🇷🇴',
  'serbe': '🇷🇸', 'serbian': '🇷🇸',
  'croate': '🇭🇷', 'croatian': '🇭🇷',
  'bosniaque': '🇧🇦', 'bosnian': '🇧🇦',
  'albanais': '🇦🇱', 'albanian': '🇦🇱',
  'grec': '🇬🇷', 'greek': '🇬🇷',
  'hongrois': '🇭🇺', 'hungarian': '🇭🇺',
  'tchèque': '🇨🇿', 'czech': '🇨🇿',
  'slovaque': '🇸🇰', 'slovak': '🇸🇰',
  'bulgare': '🇧🇬', 'bulgarian': '🇧🇬',
  'ukrainien': '🇺🇦', 'ukrainian': '🇺🇦',
  'suédois': '🇸🇪', 'swedish': '🇸🇪',
  'norvégien': '🇳🇴', 'norwegian': '🇳🇴',
  'danois': '🇩🇰', 'danish': '🇩🇰',
  'finnois': '🇫🇮', 'finnish': '🇫🇮',
  'hindi': '🇮🇳',
  'tamoul': '🇮🇳', 'tamil': '🇮🇳',
  'thaï': '🇹🇭', 'thai': '🇹🇭',
  'vietnamien': '🇻🇳', 'vietnamese': '🇻🇳',
  'persan': '🇮🇷', 'farsi': '🇮🇷',
  'hébreu': '🇮🇱', 'hebrew': '🇮🇱',
  'tigrigna': '🇪🇷', 'tigrinya': '🇪🇷',
  'amharique': '🇪🇹', 'amharic': '🇪🇹',
  'swahili': '🇰🇪',
  'lingala': '🇨🇩',
  'wolof': '🇸🇳',
  'kurde': '🇮🇶', 'kurdish': '🇮🇶',
}
const getLangFlag = (lang: string) => {
  const key = lang.toLowerCase().replace(/[\s\-()]+/g, '').replace(/maternel.*|courant.*|b[12]|a[12]|c[12]|natif.*|bilingue.*/i, '').trim()
  return LANG_FLAGS[key] || '🌐'
}

// Convertit n'importe quel format de téléphone en numéro WhatsApp international
// +41 79 123 45 67 → 41791234567 | 0041... → 41... | 079... → 41... | +33 6... → 336...
const toWaPhone = (tel: string) => {
  const clean = tel.replace(/[\s\-\.\(\)]/g, '')
  if (clean.startsWith('+')) return clean.slice(1)
  if (clean.startsWith('00')) return clean.slice(2)
  if (clean.startsWith('0')) return '41' + clean.slice(1)
  return clean
}

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
  const [cvLightbox, setCvLightbox]       = useState(false)
  const [showInfo, setShowInfo]           = useState(false)
  const [showNotes, setShowNotes]         = useState(false)
  const [cvZoom, setCvZoom]               = useState(1.0)
  const [cvRotation, setCvRotation]       = useState(() => {
    if (typeof window === 'undefined') return 0
    const saved = localStorage.getItem(`cv_rotation_${id}`)
    return saved ? parseInt(saved, 10) : 0
  })
  const [sectionsOrder, setSectionsOrder] = useState<string[]>(['resume','experiences','formations','candidatures','notes'])
  const [agenceMetiers, setAgenceMetiers] = useState<string[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [editModal, setEditModal]         = useState<'formation' | 'competences' | 'langues' | null>(null)
  const [modalValue, setModalValue]       = useState('')
  const [cvWidth, setCvWidth]             = useState(() => {
    if (typeof window === 'undefined') return 620
    const saved = localStorage.getItem('cv_panel_width')
    return saved ? parseInt(saved, 10) : 620
  })
  const photoInputRef   = useRef<HTMLInputElement>(null)
  const cvScrollRef     = useRef<HTMLDivElement>(null)
  const imgContainerRef = useRef<HTMLDivElement>(null)
  const resizeDragRef   = useRef({ active: false, startX: 0, startWidth: 0 })
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

  const printCV = () => {
    if (!candidat?.cv_url) return
    // Proxy same-origin avec Content-Type forcé → ouvre le PDF viewer natif du navigateur
    window.open(`/api/cv/print?url=${encodeURIComponent(candidat.cv_url)}`, '_blank')
  }

  const downloadCV = async () => {
    if (!candidat?.cv_url) return
    try {
      const res = await fetch(candidat.cv_url)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = candidat.cv_nom_fichier || 'cv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Fallback: open in new tab
      window.open(candidat.cv_url, '_blank')
    }
  }

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
    const { metiers, ...rest } = editData
    const payload: Record<string, any> = {
      nom:                rest.nom,
      prenom:             rest.prenom,
      email:              rest.email,
      telephone:          rest.telephone,
      localisation:       rest.localisation,
      titre_poste:        rest.titre_poste,
      annees_exp:         parseInt(rest.annees_exp) || 0,
      formation:          rest.formation,
      resume_ia:          rest.resume_ia,
      linkedin:           rest.linkedin || '',
      permis_conduire:    rest.permis_conduire,
      date_naissance:     rest.date_naissance,
      competences:        rest.competences ? rest.competences.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      langues:            rest.langues     ? rest.langues.split(',').map((s: string) => s.trim()).filter(Boolean)     : [],
      experiences:        rest.experiences        || [],
      formations_details: rest.formations_details || [],
      tags:               metiers || [],
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

  // Photo upload handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUploading(true)
    try {
      const supabase = createClient()
      const timestamp = Date.now()
      const ext = file.name.split('.').pop() || 'jpg'
      const photoPath = `photos/${id}_${timestamp}_upload.${ext}`

      // Delete old photo if exists
      if (candidat.photo_url && candidat.photo_url !== 'checked') {
        try {
          const oldPath = candidat.photo_url.split('/cvs/')[1]?.split('?')[0]
          if (oldPath) await supabase.storage.from('cvs').remove([decodeURIComponent(oldPath)])
        } catch {}
      }

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cvs')
        .upload(photoPath, file, { contentType: file.type, upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = await supabase.storage
        .from('cvs')
        .createSignedUrl(uploadData.path, 60 * 60 * 24 * 365 * 10)

      if (urlData?.signedUrl) {
        updateCandidat.mutate({ id, data: { photo_url: urlData.signedUrl } })
      }
    } catch (err: any) {
      console.error('Photo upload error:', err)
      alert('Erreur upload photo: ' + err.message)
    } finally {
      setPhotoUploading(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  // Photo delete handler
  const handlePhotoDelete = async () => {
    if (!confirm('Supprimer la photo du candidat ?')) return
    setPhotoUploading(true)
    try {
      const supabase = createClient()
      if (candidat.photo_url && candidat.photo_url !== 'checked') {
        try {
          const oldPath = candidat.photo_url.split('/cvs/')[1]?.split('?')[0]
          if (oldPath) await supabase.storage.from('cvs').remove([decodeURIComponent(oldPath)])
        } catch {}
      }
      updateCandidat.mutate({ id, data: { photo_url: null } })
    } catch (err: any) {
      console.error('Photo delete error:', err)
    } finally {
      setPhotoUploading(false)
    }
  }

  // Photo rotate handler — rotate 90° clockwise using canvas
  const handlePhotoRotate = async () => {
    if (!candidat?.photo_url || candidat.photo_url === 'checked') return
    setPhotoUploading(true)
    try {
      // Load image into canvas
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Impossible de charger la photo'))
        img.src = candidat.photo_url
      })

      // Rotate 90° clockwise
      const canvas = document.createElement('canvas')
      canvas.width = img.height
      canvas.height = img.width
      const ctx = canvas.getContext('2d')!
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', 0.9)
      })

      // Upload rotated photo
      const supabase = createClient()
      const timestamp = Date.now()
      const photoPath = `photos/${id}_${timestamp}_rotated.jpg`

      // Delete old photo
      if (candidat.photo_url) {
        try {
          const oldPath = candidat.photo_url.split('/cvs/')[1]?.split('?')[0]
          if (oldPath) await supabase.storage.from('cvs').remove([decodeURIComponent(oldPath)])
        } catch {}
      }

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cvs')
        .upload(photoPath, blob, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = await supabase.storage
        .from('cvs')
        .createSignedUrl(uploadData.path, 60 * 60 * 24 * 365 * 10)

      if (urlData?.signedUrl) {
        updateCandidat.mutate({ id, data: { photo_url: urlData.signedUrl } })
      }
    } catch (err: any) {
      console.error('Photo rotate error:', err)
      alert('Erreur rotation photo: ' + err.message)
    } finally {
      setPhotoUploading(false)
    }
  }

  // Extraire photo du CV via API
  const handleExtractPhotoFromCV = async () => {
    if (!candidat?.cv_url) return
    setPhotoUploading(true)
    try {
      const res = await fetch('/api/cv/extract-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidatId: id }),
      })
      const data = await res.json()
      if (data.found && data.photo_url) {
        // Update local state via mutate
        updateCandidat.mutate({ id, data: { photo_url: data.photo_url } })
      } else {
        alert(data.message || 'Aucune photo de visage détectée dans ce CV')
      }
    } catch (err: any) {
      console.error('Extract photo error:', err)
      alert('Erreur lors de l\'extraction de la photo')
    } finally {
      setPhotoUploading(false)
    }
  }

  // Upload blob from crop modal
  const handleCropConfirm = async (blob: Blob) => {
    if (!candidat?.id) return
    setShowCropModal(false)
    setPhotoUploading(true)
    try {
      const supabase = createClient()
      const ext = 'jpg'
      const path = `photos/${candidat.id}_${Date.now()}_crop.${ext}`
      const { error: upErr } = await supabase.storage.from('cvs').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw upErr
      const { data: signed } = await supabase.storage.from('cvs').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
      if (!signed?.signedUrl) throw new Error('Signed URL failed')
      updateCandidat.mutate({ id, data: { photo_url: signed.signedUrl } })
    } catch (err: any) {
      alert('Erreur lors de l\'enregistrement de la photo : ' + err.message)
    } finally {
      setPhotoUploading(false)
    }
  }

  // Modal edit handlers
  const openEditModal = (field: 'formation' | 'competences' | 'langues') => {
    setModalValue(editData[field] || '')
    setEditModal(field)
  }
  const saveEditModal = () => {
    if (editModal) {
      set(editModal, modalValue)
    }
    setEditModal(null)
  }

  // Resize panel handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    resizeDragRef.current = { active: true, startX: e.clientX, startWidth: cvWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    let latestWidth = cvWidth
    const handleMove = (ev: MouseEvent) => {
      if (!resizeDragRef.current.active) return
      const delta = resizeDragRef.current.startX - ev.clientX
      latestWidth = Math.min(900, Math.max(300, resizeDragRef.current.startWidth + delta))
      setCvWidth(latestWidth)
    }
    const handleUp = () => {
      resizeDragRef.current.active = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('cv_panel_width', latestWidth.toString())
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
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
    <div className="d-page" style={{ paddingBottom: 40, display: 'flex', flexDirection: 'column' }}>

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
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflowX: 'auto', minWidth: 0 }}>

        {/* ══ COLONNE 1 — Infos candidat ══ */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Identité */}
          <div className="neo-card-soft" style={{ padding: 18 }}>
            {/* Photo + Nom */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              {/* Photo avec boutons upload/delete */}
              <div style={{ position: 'relative' }}>
                {(candidat.photo_url && candidat.photo_url !== 'checked')
                  ? <img src={candidat.photo_url} style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 12, flexShrink: 0 }} alt="Photo candidat" />
                  : <div className="neo-avatar" style={{ width: 140, height: 140, fontSize: 36, flexShrink: 0, background: '#F1F5F9', color: '#64748B', boxShadow: 'none', border: 'none', borderRadius: 12 }}>{initiales}</div>
                }
                {photoUploading && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={20} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
                {/* Photo action buttons — visible uniquement en mode édition */}
                {isEditing && (
                <div style={{ position: 'absolute', bottom: -6, right: -6, display: 'flex', gap: 3 }}>
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    title="Changer la photo"
                    style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', background: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >
                    <Camera size={11} color="#0F172A" />
                  </button>
                  {candidat.cv_url && (
                    <>
                      <button
                        onClick={handleExtractPhotoFromCV}
                        title="Extraire photo du CV automatiquement"
                        style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', background: '#F0FDF4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      >
                        <FileText size={11} color="#16A34A" />
                      </button>
                      <button
                        onClick={() => setShowCropModal(true)}
                        title="Sélectionner manuellement une zone du CV"
                        style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', background: '#FFF7ED', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 11 }}
                      >
                        ✂️
                      </button>
                    </>
                  )}
                  {candidat.photo_url && candidat.photo_url !== 'checked' && (
                    <>
                      <button
                        onClick={handlePhotoRotate}
                        title="Tourner la photo 90°"
                        style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', background: '#EFF6FF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      >
                        <RotateCw size={11} color="#3B82F6" />
                      </button>
                      <button
                        onClick={handlePhotoDelete}
                        title="Supprimer la photo"
                        style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', background: '#FEE2E2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      >
                        <X size={11} color="#DC2626" />
                      </button>
                    </>
                  )}
                </div>
                )}
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                {showCropModal && candidat.cv_url && (
                  <PhotoCropModal
                    cvUrl={candidat.cv_url}
                    onConfirm={handleCropConfirm}
                    onClose={() => setShowCropModal(false)}
                  />
                )}
              </div>

              {/* Nom / Edit fields */}
              <div style={{ width: '100%', textAlign: 'center' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={12} style={{ flexShrink: 0, color: 'var(--primary)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)', flex: 1 }}>{candidat.email}</span>
                    <a
                      href={`mailto:${candidat.email}?subject=${encodeURIComponent(`Bonjour ${candidat.prenom || ''},`)}`}
                      title="Envoyer un email"
                      onClick={(e) => {
                        e.preventDefault()
                        // Tenter d'ouvrir Outlook d'abord, sinon fallback mailto
                        const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(candidat.email)}&subject=${encodeURIComponent(`Bonjour ${candidat.prenom || ''},`)}`
                        const mailtoUrl = `mailto:${candidat.email}?subject=${encodeURIComponent(`Bonjour ${candidat.prenom || ''},`)}`
                        // Essayer Outlook web/app, fallback sur mailto natif
                        window.location.href = mailtoUrl
                      }}
                      style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', cursor: 'pointer' }}
                    >
                      <Send size={10} color="#3B82F6" />
                    </a>
                  </div>
                )}
                {candidat.telephone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Phone size={12} style={{ flexShrink: 0, color: 'var(--muted)' }} />
                    <a href={`tel:${candidat.telephone}`} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', flex: 1 }}>{candidat.telephone}</a>
                    <a
                      href={`whatsapp://send?phone=${toWaPhone(candidat.telephone)}&text=${encodeURIComponent(`Bonjour ${candidat.prenom},`)}`}
                      title="Envoyer un message WhatsApp"
                      style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', cursor: 'pointer' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </a>
                  </div>
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
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Formation */}
          {(() => {
            const hasCFC = candidat.formation && /CFC|certificat de capacit|capacit[eé] f[eé]d[eé]rale|apprentissage/i.test(candidat.formation)
            if (!isEditing && !hasCFC) return null
            return (
              <div className="neo-card-soft" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isEditing ? 0 : undefined }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Formation</label>
                  {isEditing && (
                    <button onClick={() => openEditModal('formation')} title="Modifier la formation"
                      style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
                      <Pencil size={10} color="var(--muted)" />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
                  <GraduationCap size={12} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ ...smallMuted, lineHeight: 1.5 }}>{isEditing ? (editData.formation || 'Aucune') : candidat.formation}</span>
                </div>
              </div>
            )
          })()}

          {/* Compétences */}
          <div className="neo-card-soft" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Compétences</label>
              {isEditing && (
                <button onClick={() => openEditModal('competences')} title="Modifier les compétences"
                  style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
                  <Pencil size={10} color="var(--muted)" />
                </button>
              )}
            </div>
            {(() => {
              const comps = isEditing
                ? (editData.competences || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                : (candidat.competences || [])
              return comps.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {comps.map((c: string) => (
                    <span key={c} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 9px', borderRadius: 6,
                      fontSize: 11, fontWeight: 600, lineHeight: 1.3,
                      background: '#F1F5F9', color: '#334155',
                      border: '1px solid #E2E8F0',
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Aucune compétence</p>
              )
            })()}
          </div>

          {/* Langues */}
          {(isEditing || candidat.langues?.length > 0) && (
            <div className="neo-card-soft" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Langues</label>
                {isEditing && (
                  <button onClick={() => openEditModal('langues')} title="Modifier les langues"
                    style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
                    <Pencil size={10} color="var(--muted)" />
                  </button>
                )}
              </div>
              {(() => {
                const langs = isEditing
                  ? (editData.langues || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                  : (candidat.langues || [])
                return langs.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {langs.map((l: string) => (
                      <span key={l} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 6,
                        fontSize: 11, fontWeight: 600, lineHeight: 1.3,
                        background: '#F8FAFC', color: '#334155',
                        border: '1px solid #E2E8F0',
                      }}>
                        <span style={{ fontSize: 13 }}>{getLangFlag(l)}</span>
                        {l}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>Aucune langue</p>
                )
              })()}
            </div>
          )}

          {/* Info + Notes — boutons ronds */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowInfo(v => !v)} title="Infos"
              style={{ width: 34, height: 34, borderRadius: '50%', border: showInfo ? '2px solid var(--primary)' : '1px solid var(--border)', background: showInfo ? 'var(--primary-soft)' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
              <Info size={15} style={{ color: showInfo ? 'var(--primary)' : 'var(--muted)' }} />
            </button>
            <button onClick={() => setShowNotes(v => !v)} title="Notes"
              style={{ width: 34, height: 34, borderRadius: '50%', border: showNotes ? '2px solid var(--primary)' : '1px solid var(--border)', background: showNotes ? 'var(--primary-soft)' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s', position: 'relative' }}>
              <MessageSquare size={15} style={{ color: showNotes ? 'var(--primary)' : 'var(--muted)' }} />
              {(candidat.notes_candidat?.length || 0) > 0 && (
                <span style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: 'var(--primary)', color: '#000', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {candidat.notes_candidat.length}
                </span>
              )}
            </button>
          </div>

          {/* Métadonnées (expandable) */}
          {showInfo && (
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
          )}

          {/* Notes (expandable in-place) */}
          {showNotes && (
            <div className="neo-card-soft" style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: candidat.notes_candidat?.length > 0 ? 10 : 0 }}>
                <textarea className="neo-input" placeholder="Ajouter une note... (Cmd+Entrée)" value={note} onChange={e => setNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendNote() }}
                  style={{ height: 'auto', minHeight: 56, padding: '7px 12px', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 12, flex: 1 }} />
                <button onClick={handleSendNote} disabled={!note.trim() || ajouterNote.isPending} className="neo-btn neo-btn-sm" style={{ alignSelf: 'flex-end', padding: '8px 10px' }}>
                  <Send size={12} />
                </button>
              </div>
              {candidat.notes_candidat?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 250, overflowY: 'auto' }}>
                  {[...candidat.notes_candidat].reverse().map((n: any) => (
                    <div key={n.id} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--foreground)' }}>{n.auteur}</span>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--foreground)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{n.contenu}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ COLONNE 2 — Contenu (résumé, exp, formations, notes) ══ */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

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

          {/* Notes déplacées dans colonne 1 (boutons ronds) */}

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

        {/* ══ Resize handle ══ */}
        {showCV && (
          <div
            onMouseDown={handleResizeStart}
            style={{
              width: 6, flexShrink: 0, cursor: 'col-resize',
              background: 'transparent', borderRadius: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary)')}
            onMouseLeave={e => { if (!resizeDragRef.current.active) e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ width: 2, height: 40, borderRadius: 2, background: 'var(--border)' }} />
          </div>
        )}

        {/* ══ COLONNE 3 — Viewer CV (sticky) ══ */}
        {showCV && (
        <div style={{ width: cvWidth, flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>

            {/* Header du viewer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--background)' }}>
              <FileText size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ flex: 1 }} />
              {candidat.cv_url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => setCvLightbox(true)}
                    style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', marginRight: 4 }}
                    title="Voir en plein écran">
                    <Eye size={12} />
                  </button>
                  <button onClick={downloadCV}
                    style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', marginRight: 4 }}
                    title="Télécharger le CV">
                    <Download size={12} />
                  </button>
                  <button
                    onClick={printCV}
                    title="Imprimer le CV"
                    style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'var(--text)', display:'flex', alignItems:'center', gap:4, fontSize:12, marginRight: 4 }}
                  >
                    <Printer size={14} />
                  </button>
                  <button onClick={() => { const r = (cvRotation - 90 + 360) % 360; setCvRotation(r); localStorage.setItem(`cv_rotation_${id}`, r.toString()) }} title="Rotation gauche" style={{ minWidth: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                    <RotateCcw size={14} />
                  </button>
                  <button onClick={() => { const r = (cvRotation + 90) % 360; setCvRotation(r); localStorage.setItem(`cv_rotation_${id}`, r.toString()) }} title="Rotation droite" style={{ minWidth: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', marginRight: 4 }}>
                    <RotateCw size={14} />
                  </button>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', overflow: cvRotation !== 0 ? 'visible' : 'hidden' }}>
                  <img src={candidat.cv_url} alt="CV" style={{ width: (cvRotation === 90 || cvRotation === 270) ? `${cvZoom * 100}vh` : `${cvZoom * 100}%`, maxWidth: 'none', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', pointerEvents: 'none', transform: `rotate(${cvRotation}deg)`, transformOrigin: 'center center', transition: 'transform 0.3s ease' }} />
                </div>
              </div>
            ) : (cvIsPDF || cvIsWord) ? (
              <div ref={cvScrollRef}
                style={{ flex: 1, overflow: 'auto', background: '#F1F5F9', position: 'relative' }}
                onMouseDown={cvZoom > 1 ? cvDragStart : undefined}
                onMouseMove={cvZoom > 1 ? cvDragMove : undefined}
                onMouseUp={cvZoom > 1 ? cvDragEnd : undefined}
                onMouseLeave={cvZoom > 1 ? cvDragEnd : undefined}
              >
                <div style={{
                  width: cvZoom === 1 ? '100%' : `${cvZoom * 100}%`,
                  height: cvZoom === 1 ? '100%' : `${cvZoom * 100}%`,
                  background: '#F1F5F9',
                  position: 'relative',
                  cursor: cvZoom > 1 ? 'grab' : 'default',
                }}>
                  {cvIsWord && <>
                    {/* Masque bouton [↗] Google Docs (haut droite) */}
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 56, height: 56, background: 'white', zIndex: 10 }} />
                    {/* Masque zoom +/- Google Docs (bas) */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, background: 'white', zIndex: 10 }} />
                  </>}
                  <iframe
                    key={`cv-iframe-${cvRotation}`}
                    src={
                      cvIsPDF && cvRotation !== 0
                        ? `/api/cv/rotate?rotation=${cvRotation}&url=${encodeURIComponent(candidat.cv_url)}#toolbar=0&navpanes=0&zoom=page-width`
                        : cvIsPDF
                          ? `${candidat.cv_url}#toolbar=0&navpanes=0&zoom=page-width`
                          : docViewerUrl
                    }
                    style={{
                      width: '100%', height: '100%', border: 'none', display: 'block',
                      pointerEvents: cvZoom > 1 ? 'none' : 'auto',
                    }}
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
            position: 'fixed', bottom: 80, right: 28, zIndex: 50,
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
          Voir CV
        </button>
      )}

      {/* ── Modal édition (Formation / Compétences / Langues) ── */}
      {editModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.15s ease',
        }}
        onClick={e => { if (e.target === e.currentTarget) setEditModal(null) }}
        >
          <div style={{
            background: 'white', borderRadius: 16, padding: 0,
            width: '90%', maxWidth: 520, boxShadow: '0 20px 60px rgba(15,23,42,0.2)',
            animation: 'slideUp 0.2s ease',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              background: 'var(--background)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {editModal === 'formation' && <GraduationCap size={16} style={{ color: 'var(--primary)' }} />}
                {editModal === 'competences' && <Star size={16} style={{ color: 'var(--primary)' }} />}
                {editModal === 'langues' && <Languages size={16} style={{ color: 'var(--primary)' }} />}
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
                  {editModal === 'formation' ? 'Modifier la formation' :
                   editModal === 'competences' ? 'Modifier les compétences' : 'Modifier les langues'}
                </span>
              </div>
              <button onClick={() => setEditModal(null)}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} color="var(--muted)" />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 20 }}>
              {editModal === 'formation' ? (
                <div>
                  <label style={labelStyle}>Formation / Diplôme</label>
                  <input className="neo-input" autoFocus value={modalValue} onChange={e => setModalValue(e.target.value)} placeholder="Ex: CFC de peintre, Bachelor en informatique..." style={{ fontSize: 14 }} />
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>
                    {editModal === 'competences' ? 'Compétences (séparées par des virgules)' : 'Langues (séparées par des virgules)'}
                  </label>
                  <textarea
                    className="neo-input"
                    autoFocus
                    value={modalValue}
                    onChange={e => setModalValue(e.target.value)}
                    placeholder={editModal === 'competences' ? 'React, TypeScript, Node.js, Python...' : 'Français, Anglais, Allemand...'}
                    style={{ height: 'auto', minHeight: 120, padding: '10px 13px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, fontSize: 14 }}
                  />
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Séparez chaque élément par une virgule</p>
                </div>
              )}

              {/* Preview tags */}
              {editModal !== 'formation' && modalValue.trim() && (
                <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--background)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Aperçu</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {modalValue.split(',').map((s: string) => s.trim()).filter(Boolean).map((item: string) => (
                      <span key={item} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: editModal === 'competences' ? '#F1F5F9' : '#F8FAFC',
                        color: '#334155',
                        border: '1px solid #E2E8F0',
                      }}>
                        {editModal === 'competences'
                          ? <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)' }} />
                          : <span style={{ fontSize: 13 }}>{getLangFlag(item)}</span>
                        }
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              padding: '14px 20px', borderTop: '1px solid var(--border)',
              background: 'var(--background)',
            }}>
              <button onClick={() => setEditModal(null)} className="neo-btn-ghost neo-btn-sm">Annuler</button>
              <button onClick={saveEditModal} className="neo-btn-yellow neo-btn-sm">
                <Check size={13} /> Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox CV plein écran ── */}
      {cvLightbox && candidat.cv_url && (
        <div
          onClick={() => setCvLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
            display: 'flex', flexDirection: 'column',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Toolbar */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              gap: 8, padding: '10px 16px', flexShrink: 0,
            }}
          >
            <button
              onClick={() => setCvLightbox(false)}
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
            >
              <X size={16} />
            </button>
          </div>
          {/* Contenu */}
          <div onClick={e => e.stopPropagation()} style={{ flex: 1, padding: '0 24px 24px', minHeight: 0 }}>
            {cvIsImage ? (
              <img
                src={candidat.cv_url}
                alt="CV"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, display: 'block', margin: '0 auto' }}
              />
            ) : (
              <iframe
                src={cvIsPDF ? `${candidat.cv_url}#toolbar=1&zoom=100` : docViewerUrl}
                style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
                title="CV plein écran"
              />
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
