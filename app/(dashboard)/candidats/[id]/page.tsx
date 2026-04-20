'use client'
import Image from 'next/image'
import { formatFullName, formatInitials, formatEmail, formatCity, formatCountry } from '@/lib/format-candidat'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, GraduationCap,
  FileText, ExternalLink, Trash2, MessageSquare, Star, Send,
  Pencil, X, Check, Car, Languages, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown, Info, Download, Printer, RotateCcw, RotateCw,
  Upload, Camera, Loader2, Eye, MoreVertical, Merge, Search, Sparkles, FolderOpen, Activity,
} from 'lucide-react'
import CVCustomizerModal from '@/components/CVCustomizer'
import ActivityHistory from '@/components/ActivityHistory'
import {
  useCandidat, useUpdateCandidat, useUpdateStatutCandidat,
  useAjouterNote, useDeleteNote, useUpdateNote, useDeleteCandidat,
} from '@/hooks/useCandidats'
import { useQueryClient } from '@tanstack/react-query'
import { useMetiers } from '@/hooks/useMetiers'
import { useMetierCategories } from '@/hooks/useMetierCategories'
import { toast } from 'sonner'
import type { PipelineEtape, CandidatDocument } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { markCandidatVu, markCandidatNonVu, getViewedSet, dispatchBadgesChanged } from '@/lib/badge-candidats'
import PhotoCropModal from '@/components/PhotoCropModal'
import DocumentsPanel from '@/components/DocumentsSection'

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

// Catégories de métiers pour le sélecteur groupé
const METIER_CATEGORIES: { label: string; metiers: string[] }[] = [
  { label: 'Bâtiment', metiers: ['Maçonnerie', 'Goudron', 'Ferrailleur', 'Désamianteur', 'Peintre', 'Plâtrier', 'Carreleur', 'Paysagiste', 'Sanitaire', 'Chauffage', 'Électricien', 'Automaticien', 'Ferblantier', 'Couvreur', 'Menuisier', 'Charpentier', 'Étancheur', 'Poseur de sols', 'Storiste', 'Échafaudages', 'Pompage / Solaire'] },
  { label: 'Technique / Industrie', metiers: ['Mécanicien', 'Soudeur', 'Tuyauteur', 'Calorifugeur', 'Serrurier', 'Polymécanicien', 'Logisticien', 'Ventilation'] },
  { label: 'Divers', metiers: ['Chauffeur', 'Ouvrier', 'Manutentionnaire', 'Nettoyage'] },
  { label: 'Commercial', metiers: ['Administratif'] },
  { label: 'Architecture', metiers: ['Architecture'] },
]
const CFC_REGEX = /CFC|certificat de capacit|capacit[eé] f[eé]d[eé]rale|apprentissage/i

// Convertit n'importe quel format de téléphone en numéro WhatsApp international
// +41 79 123 45 67 → 41791234567 | 0041... → 41... | 079... → 41... | +33 6... → 336...
const toWaPhone = (tel: string) => {
  const clean = tel.replace(/[\s\-\.\(\)]/g, '')
  if (clean.startsWith('+')) return clean.slice(1)
  if (clean.startsWith('00')) return clean.slice(2)
  if (clean.startsWith('0')) return '41' + clean.slice(1)
  return clean
}

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

  // Année seule : "1985"
  if (!birthDate) {
    const yearOnly = dateNaissance.match(/^(\d{4})$/)
    if (yearOnly) {
      birthDate = new Date(parseInt(yearOnly[1]), 0, 1)
    }
  }

  // Âge explicite avec "ans" : "35ans" ou "35 ans" — retourné par l'IA
  if (!birthDate) {
    const ageAvecAns = dateNaissance.trim().match(/^(\d{1,2})\s*ans$/i)
    if (ageAvecAns) {
      const n = parseInt(ageAvecAns[1])
      if (n >= 16 && n <= 80) return n
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
  const searchParams = useSearchParams()
  const fromPage = searchParams.get('from')
  const backRoute = fromPage === 'pipeline' ? '/pipeline' : fromPage === 'missions' ? '/missions' : fromPage === 'secretariat' ? '/secretariat' : fromPage === 'matching' ? '/matching' : '/candidats'
  const backLabel = fromPage === 'pipeline' ? 'Retour au pipeline' : fromPage === 'missions' ? 'Retour aux missions' : fromPage === 'secretariat' ? 'Retour au secrétariat' : fromPage === 'matching' ? 'Retour au matching' : 'Retour aux candidats'
  const queryClient = useQueryClient()
  const [consultantPrenom, setConsultantPrenom] = useState('João')
  useEffect(() => {
    const supa = createClient()
    supa.auth.getUser().then(({ data }) => {
      const m = data.user?.user_metadata || {}
      const p = (m.prenom || m.first_name || '').toString().trim()
      if (p) setConsultantPrenom(p)
    })
  }, [])
  const [note, setNote]                   = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditing, setIsEditing]         = useState(false)
  const [editData, setEditData]           = useState<Record<string, any>>({})
  const [showCV, setShowCV]               = useState(true)
  const [showMetierPicker, setShowMetierPicker] = useState(false)
  const [metierSearch, setMetierSearch] = useState('')
  const metierPickerRef = useRef<HTMLDivElement>(null)
  const metierSearchRef = useRef<HTMLInputElement>(null)
  const [cvLightbox, setCvLightbox]       = useState(false)
  const [showInfo, setShowInfo]           = useState(false)
  const [showNotes, setShowNotes]         = useState(false)
  const [showNotesTooltip, setShowNotesTooltip] = useState(false)
  const [showMenu, setShowMenu]           = useState(false)
  const [showDocuments, setShowDocuments] = useState(false)
  const [showCvCustomizer, setShowCvCustomizer] = useState(false)
  const [showMergeSearch, setShowMergeSearch] = useState(false)
  const [showActivityHistory, setShowActivityHistory] = useState(false)
  const [mergeSearch, setMergeSearch]     = useState('')
  const [mergeResults, setMergeResults]   = useState<Array<{ id: string; nom: string; prenom: string | null; titre_poste: string | null; email: string | null }>>([])
  const [mergeLoading, setMergeLoading]   = useState(false)
  const [merging, setMerging]             = useState(false)
  const [reanalyseLoading, setReanalyseLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cvZoom, setCvZoom]               = useState(1.0)
  const [cvRotation, setCvRotation]       = useState(() => {
    if (typeof window === 'undefined') return 0
    const saved = localStorage.getItem(`cv_rotation_${id}`)
    return saved ? parseInt(saved, 10) : 0
  })
  const [sectionsOrder, setSectionsOrder] = useState<string[]>(['resume','experiences','formations','candidatures','notes'])
  const { metiers: agenceMetiers } = useMetiers()
  const { categories: metierCategories, getColorForMetier } = useMetierCategories()
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
    const ext = (candidat.cv_nom_fichier || candidat.cv_url || '').split('.').pop()?.toLowerCase()
    if (ext === 'pdf' || ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
      // PDF/images → proxy same-origin → viewer natif du navigateur
      window.open(`/api/cv/print?url=${encodeURIComponent(candidat.cv_url)}`, '_blank')
    } else {
      // Word/autres → Google Docs Viewer (seul moyen de les afficher dans le browser)
      window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(candidat.cv_url)}`, '_blank')
    }
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
  const deleteNote      = useDeleteNote()
  const updateNote      = useUpdateNote()
  const deleteCandidat  = useDeleteCandidat()

  const candidat = data as any

  useEffect(() => {
    if (!id) return
    markCandidatVu(id) // POST /api/candidats/vus {ids:[id]} → upsert candidats_vus pour CE user
    dispatchBadgesChanged() // refresh sidebar count
    // NEW3 — effacer le badge coloré OneDrive (nouveau/reactive/mis_a_jour) à l'ouverture
    fetch(`/api/candidats/${id}/clear-onedrive-badge`, { method: 'POST' }).catch(() => {})
  }, [id])

  // Auto-allumer CFC si détecté dans le texte formation et jamais encore défini (null uniquement)
  useEffect(() => {
    if (!candidat) return
    if (candidat.cfc === null && candidat.formation && CFC_REGEX.test(candidat.formation)) {
      queryClient.setQueryData(['candidat', id], (old: any) => old ? { ...old, cfc: true } : old)
      fetch(`/api/candidats/${candidat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cfc: true }),
      }).catch(() => queryClient.invalidateQueries({ queryKey: ['candidat', id] }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidat?.id, candidat?.formation])

  // Fermer le picker métiers en cliquant dehors
  useEffect(() => {
    if (!showMetierPicker) return
    const handler = (e: MouseEvent) => {
      if (metierPickerRef.current && !metierPickerRef.current.contains(e.target as Node)) { setShowMetierPicker(false); setMetierSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMetierPicker])

  // État "vu" pour afficher le bon libellé dans le menu
  const [isVu, setIsVu] = useState(() => id ? getViewedSet().has(id) : false)
  // Re-sync quand le badge change (ex: on vient d'ouvrir = vu)
  useEffect(() => {
    const handler = () => setIsVu(id ? getViewedSet().has(id) : false)
    window.addEventListener('talentflow:badges-changed', handler)
    return () => window.removeEventListener('talentflow:badges-changed', handler)
  }, [id])

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

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

  // Centrer le scroll horizontal après un changement de zoom CV
  useEffect(() => {
    const el = cvScrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = 0
      const excess = el.scrollWidth - el.clientWidth
      el.scrollLeft = excess > 0 ? Math.round(excess / 2) : 0
    })
  }, [cvZoom])

  const set = (field: string, value: any) => setEditData(prev => ({ ...prev, [field]: value }))

  const startEdit = () => {
    setEditData({
      nom:             candidat.nom || '',
      prenom:          candidat.prenom || '',
      email:           candidat.email || '',
      telephone:       candidat.telephone || '',
      localisation:    candidat.localisation || '',
      titre_poste:     candidat.titre_poste || '',
      formation:       candidat.formation || '',
      competences:     (candidat.competences || []).join(', '),
      langues:         (candidat.langues || []).join(', '),
      permis_conduire: candidat.permis_conduire ?? false,
      date_naissance:  candidat.date_naissance || '',
      genre:           candidat.genre || '',
      created_at:      candidat.created_at ? new Date(candidat.created_at).toISOString().slice(0, 10) : '',
      resume_ia:       candidat.resume_ia || '',
      experiences:     JSON.parse(JSON.stringify(candidat.experiences || [])),
      formations_details: JSON.parse(JSON.stringify(candidat.formations_details || [])),
      metiers: candidat.tags || [],
      rating: candidat.rating ?? 0,
      cfc: candidat.cfc ?? false,
      deja_engage: candidat.deja_engage ?? false,
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
    const { metiers, rating, cfc, deja_engage, ...rest } = editData
    const payload: Record<string, any> = {
      nom:                rest.nom,
      prenom:             rest.prenom,
      email:              rest.email,
      telephone:          rest.telephone,
      localisation:       rest.localisation,
      titre_poste:        rest.titre_poste,
      formation:          rest.formation,
      resume_ia:          rest.resume_ia,
      permis_conduire:    rest.permis_conduire,
      date_naissance:     rest.date_naissance,
      genre:              rest.genre || null,
      competences:        rest.competences ? rest.competences.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      langues:            rest.langues     ? rest.langues.split(',').map((s: string) => s.trim()).filter(Boolean)     : [],
      experiences:        rest.experiences        || [],
      formations_details: rest.formations_details || [],
      tags:               Array.isArray(metiers) ? metiers : [],
      rating:             rating > 0 ? rating : null,
      cfc:                !!cfc,
      deja_engage:        !!deja_engage,
    }
    // Inclure created_at SEULEMENT si l'utilisateur a changé la date manuellement
    const originalDate = candidat.created_at ? new Date(candidat.created_at).toISOString().slice(0, 10) : ''
    if (rest.created_at && rest.created_at !== originalDate) {
      payload.created_at = `${rest.created_at}T12:00:00.000Z`
    }
    updateCandidat.mutate({ id, data: payload }, { onSuccess: () => setIsEditing(false) })
  }

  const [showReanalyseConfirm, setShowReanalyseConfirm] = useState(false)

  const reanalyseIA = async () => {
    if (!candidat?.cv_url) return
    // Afficher popup de confirmation d'abord
    setShowReanalyseConfirm(true)
  }

  const confirmReanalyse = async () => {
    if (!candidat?.cv_url) return
    setShowReanalyseConfirm(false)
    setReanalyseLoading(true)
    try {
      // Étape 1 : uploader le CV sur Supabase via presign (bypass limite 4.5 Mo Vercel)
      const cvRes = await fetch(candidat.cv_url)
      if (!cvRes.ok) throw new Error('Impossible de télécharger le CV')
      const cvBlob = await cvRes.blob()
      const fileName = candidat.cv_nom_fichier || 'cv.pdf'

      // Obtenir une URL pré-signée pour l'upload
      const presignRes = await fetch(`/api/cv/presign?filename=${encodeURIComponent(fileName)}`)
      if (!presignRes.ok) throw new Error('Impossible d\'obtenir l\'URL d\'upload')
      const { signedUrl, path: storagePath } = await presignRes.json()

      // Upload direct vers Supabase (pas via Vercel)
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        body: cvBlob,
        headers: { 'Content-Type': cvBlob.type || 'application/octet-stream' },
      })
      if (!uploadRes.ok) throw new Error('Erreur upload Supabase')

      // Étape 2 : envoyer le storage_path au parse API avec mode=reanalyse (écrasement)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 55000)
      const parseRes = await fetch('/api/cv/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_path: storagePath,
          update_id: candidat.id,
          force_insert: true,
          mode: 'reanalyse', // Mode écrasement : remplace tout sauf nom/prénom/photo
          cv_rotation: cvRotation || 0, // rotation appliquée dans le viewer → appliquée au PDF avant parsing
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const ct = parseRes.headers.get('content-type') || ''
      if (!ct.includes('application/json')) {
        const text = await parseRes.text()
        throw new Error(text.slice(0, 100) || `Erreur serveur (${parseRes.status})`)
      }
      const parseData = await parseRes.json()
      if (!parseRes.ok) throw new Error(parseData.error || 'Erreur lors de l\'analyse IA')

      // Refresh candidate data
      queryClient.invalidateQueries({ queryKey: ['candidat', candidat.id] })
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      toast.success('Profil entièrement mis à jour avec l\'analyse IA')
    } catch (err: any) {
      console.error('[Ré-analyse IA]', err)
      toast.error(err.message || 'Erreur lors de la ré-analyse IA')
    } finally {
      setReanalyseLoading(false)
    }
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

  const initiales    = formatInitials(candidat.prenom, candidat.nom) || '??'
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
      const img = new window.Image()
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
    <div className="d-page" style={{ paddingBottom: 40, display: 'flex', flexDirection: 'column', maxWidth: 'none' }}>

      {/* ── Header ── */}
      <div className="candidat-detail-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8, position: 'sticky', top: 0, zIndex: 30, background: 'var(--background)', paddingTop: 4, paddingBottom: 4 }}>
        <button onClick={() => router.push(backRoute)} className="neo-btn-ghost neo-btn-sm">
          <ArrowLeft size={14} /> {backLabel}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {candidat.import_status === 'a_traiter' && !isEditing && (
            <button
              onClick={async () => {
                await fetch(`/api/candidats/${candidat.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ import_status: 'traite' }),
                })
                queryClient.invalidateQueries({ queryKey: ['candidats'] })
                queryClient.invalidateQueries({ queryKey: ['candidat', candidat.id] })
                queryClient.invalidateQueries({ queryKey: ['candidats-a-traiter-count'] })
                toast.success('Candidat validé')
              }}
              className="neo-btn neo-btn-sm"
              style={{ background: '#059669', boxShadow: 'none', color: 'white' }}
            >
              <Check size={13} /> Valider
            </button>
          )}
          {!isEditing && candidat.cv_url && (
            <button
              onClick={reanalyseIA}
              disabled={reanalyseLoading}
              className="neo-btn-ghost neo-btn-sm"
              style={{
                color: reanalyseLoading ? 'var(--muted)' : '#d97706',
                borderColor: reanalyseLoading ? 'var(--border)' : '#fbbf2433',
                background: reanalyseLoading ? 'transparent' : '#fbbf2410',
              }}
              title="Ré-analyser le CV avec l'IA pour mettre à jour le profil"
            >
              {reanalyseLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
              <span className="candidat-btn-reanalyse-label">{reanalyseLoading ? 'Analyse en cours...' : 'Ré-analyser IA'}</span>
            </button>
          )}
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
          {/* Bouton Notes avec tooltip au survol */}
          <div style={{ position: 'relative' }}
            onMouseEnter={() => setShowNotesTooltip(true)}
            onMouseLeave={() => setShowNotesTooltip(false)}
          >
            <button
              onClick={() => { setShowNotes(true); setShowNotesTooltip(false) }}
              className="neo-btn-ghost neo-btn-sm"
              style={{ padding: '6px 8px', minWidth: 0, position: 'relative' }}
              title="Notes internes"
            >
              <MessageSquare size={15} />
              {(candidat?.notes_candidat?.length ?? 0) > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--primary)', color: 'var(--ink, #1C1A14)', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  {candidat.notes_candidat.length}
                </span>
              )}
            </button>
            {showNotesTooltip && (candidat?.notes_candidat?.length ?? 0) > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 500, width: 300, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.15)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes internes</p>
                {[...candidat.notes_candidat]
                  .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, 3)
                  .map((n: any) => (
                    <div key={n.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{n.auteur}</span>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--foreground)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{n.contenu}</p>
                    </div>
                  ))}
                {candidat.notes_candidat.length > 3 && (
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textAlign: 'center' }}>+{candidat.notes_candidat.length - 3} autre{candidat.notes_candidat.length - 3 > 1 ? 's' : ''} — cliquer pour tout voir</p>
                )}
              </div>
            )}
          </div>

          {/* Menu 3 points */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => setShowMenu(v => !v)}
              className="neo-btn-ghost neo-btn-sm"
              style={{ padding: '6px 8px', minWidth: 0 }}
            >
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
                background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 10,
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)', minWidth: 200, overflow: 'hidden',
              }}>
                <button onClick={() => { setShowInfo(v => !v); setShowMenu(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit', borderBottom: '1px solid var(--border)' }}>
                  <Info size={14} color="var(--muted)" /> Informations
                </button>
                <button onClick={() => { setShowCvCustomizer(true); setShowMenu(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit', borderBottom: '1px solid var(--border)' }}>
                  <FileText size={14} color="var(--primary)" /> Personnaliser CV
                </button>
                <button onClick={() => { setShowMergeSearch(true); setShowMenu(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit', borderBottom: '1px solid var(--border)' }}>
                  <Merge size={14} color="var(--muted)" /> Fusionner avec...
                </button>
                <button onClick={() => { setShowActivityHistory(true); setShowMenu(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'inherit', borderBottom: '1px solid var(--border)' }}>
                  <Activity size={14} color="var(--primary)" /> Historique d&apos;activité
                </button>
                <button onClick={() => {
                    if (isVu) {
                      markCandidatNonVu(id)
                      setIsVu(false)
                    } else {
                      markCandidatVu(id)
                      setIsVu(true)
                    }
                    setShowMenu(false)
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: isVu ? '#F59E0B' : 'var(--foreground)', fontFamily: 'inherit', borderBottom: '1px solid var(--border)' }}>
                  <Eye size={14} color={isVu ? '#F59E0B' : 'var(--muted)'} />
                  {isVu ? 'Marquer comme non vu' : 'Marquer comme vu'}
                </button>
                <button onClick={() => { setShowDeleteConfirm(true); setShowMenu(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--destructive)', fontFamily: 'inherit' }}>
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Grid 3 colonnes ── */}
      <div className="candidat-grid" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>

        {/* ══ COLONNE 1 — Infos candidat ══ */}
        <div className="candidat-col-info" style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Identité */}
          <div className="neo-card-soft" style={{ padding: 18 }}>
            {/* Photo + Nom */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              {/* Photo avec boutons upload/delete */}
              <div style={{ position: 'relative' }}>
                {(candidat.photo_url && candidat.photo_url !== 'checked')
                  ? <Image src={candidat.photo_url} width={140} height={140} style={{ objectFit: 'cover', borderRadius: 12, flexShrink: 0 }} alt="Photo candidat" unoptimized />
                  : <div className="neo-avatar" style={{ width: 140, height: 140, fontSize: 36, flexShrink: 0, background: 'var(--secondary)', color: 'var(--foreground)', boxShadow: 'none', border: '1.5px solid var(--border)', borderRadius: 12 }}>{initiales}</div>
                }
                {photoUploading && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={20} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
                {/* Photo action buttons — visible en mode édition + bouton upload toujours visible */}
                <div style={{ position: 'absolute', bottom: -6, right: -6, display: 'flex', gap: 3 }}>
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    title="Changer la photo (photothèque ou appareil photo)"
                    className="candidat-photo-btn"
                    style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', background: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >
                    <Camera size={11} color="var(--foreground)" />
                  </button>
                  {candidat.cv_url && (
                    <button
                      onClick={() => setShowCropModal(true)}
                      title="Sélectionner manuellement une zone du CV"
                      className="candidat-photo-btn"
                      style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', background: '#FFF7ED', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 11 }}
                    >
                      ✂️
                    </button>
                  )}
                  {candidat.photo_url && candidat.photo_url !== 'checked' && (
                    <>
                      <button
                        onClick={handlePhotoRotate}
                        title="Tourner la photo 90°"
                        className="candidat-photo-btn"
                        style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', background: 'var(--info-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      >
                        <RotateCw size={11} color="var(--info)" />
                      </button>
                      <button
                        onClick={handlePhotoDelete}
                        title="Supprimer la photo"
                        className="candidat-photo-btn"
                        style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', background: 'var(--destructive-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      >
                        <X size={11} color="var(--destructive)" />
                      </button>
                    </>
                  )}
                </div>
                <input ref={photoInputRef} type="file" accept="image/*,.heic,.heif" onChange={handlePhotoUpload} style={{ display: 'none' }} />
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
                    {/* Star rating edit */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 4 }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => set('rating', editData.rating === star ? 0 : star)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                          title={`${star} étoile${star > 1 ? 's' : ''}`}
                        >
                          <Star
                            size={18}
                            color="#EAB308"
                            fill={star <= (editData.rating || 0) ? '#EAB308' : 'none'}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', lineHeight: 1.3 }}>
                      {formatFullName(candidat.prenom, candidat.nom)}
                    </h1>
                    {candidat.titre_poste && <p style={{ ...smallMuted, marginTop: 2 }}>{candidat.titre_poste}</p>}
                    {/* Étoiles cliquables — toujours visibles */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 4 }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={async () => {
                            const newRating = candidat.rating === star ? null : star
                            // Mise à jour optimiste via le cache React Query
                            queryClient.setQueryData(['candidat', id], (old: any) => old ? { ...old, rating: newRating } : old)
                            // Sauvegarder en base via l'API (bypass RLS)
                            try {
                              await fetch(`/api/candidats/${candidat.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ rating: newRating }),
                              })
                              queryClient.invalidateQueries({ queryKey: ['candidats'] })
                            } catch {
                              // Rollback en cas d'erreur
                              queryClient.invalidateQueries({ queryKey: ['candidat', id] })
                            }
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1 }}
                          title={`${star} étoile${star > 1 ? 's' : ''}`}
                        >
                          <Star
                            size={16}
                            color="#EAB308"
                            fill={star <= (candidat.rating || 0) ? '#EAB308' : 'none'}
                          />
                        </button>
                      ))}
                    </div>
                    {/* Pastilles métier déplacées sous la ville */}
                  </>
                )}
                {/* Toggles rapides CFC + Déjà engagé — toujours visibles (mode lecture + édition) */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 5 }}>
                  {/* Toggle CFC */}
                  <button
                    type="button"
                    onClick={async () => {
                      const newVal = !candidat.cfc
                      queryClient.setQueryData(['candidat', id], (old: any) => old ? { ...old, cfc: newVal } : old)
                      try {
                        await fetch(`/api/candidats/${candidat.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ cfc: newVal }),
                        })
                        queryClient.invalidateQueries({ queryKey: ['candidats'] })
                      } catch {
                        queryClient.invalidateQueries({ queryKey: ['candidat', id] })
                      }
                    }}
                    title={candidat.cfc ? 'CFC — cliquer pour désactiver' : 'CFC — cliquer pour activer'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '3px 9px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                      border: `1.5px solid ${candidat.cfc ? '#F59E0B' : 'var(--border)'}`,
                      background: candidat.cfc ? 'rgba(245,158,11,0.12)' : 'transparent',
                      color: candidat.cfc ? '#F59E0B' : 'var(--muted)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <GraduationCap size={11} />
                    CFC
                  </button>
                  {/* Toggle Déjà engagé */}
                  <button
                    type="button"
                    onClick={async () => {
                      const newVal = !candidat.deja_engage
                      queryClient.setQueryData(['candidat', id], (old: any) => old ? { ...old, deja_engage: newVal } : old)
                      try {
                        await fetch(`/api/candidats/${candidat.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ deja_engage: newVal }),
                        })
                        queryClient.invalidateQueries({ queryKey: ['candidats'] })
                      } catch {
                        queryClient.invalidateQueries({ queryKey: ['candidat', id] })
                      }
                    }}
                    title={candidat.deja_engage ? 'Déjà engagé — cliquer pour désactiver' : 'Déjà engagé — cliquer pour activer'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '3px 9px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                      border: `1.5px solid ${candidat.deja_engage ? '#22C55E' : 'var(--border)'}`,
                      background: candidat.deja_engage ? 'rgba(34,197,94,0.12)' : 'transparent',
                      color: candidat.deja_engage ? '#22C55E' : 'var(--muted)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <Briefcase size={11} />
                    Engagé
                  </button>
                </div>
              </div>
            </div>

            {/* Coordonnées */}
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle}>Coordonnées</label>
                <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Email"        value={editData.email}       onChange={e => set('email', e.target.value)} />
                <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Téléphone"    value={editData.telephone}   onChange={e => set('telephone', e.target.value)} />
                <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Âge (ex: 65) ou date (JJ/MM/AAAA)" value={editData.date_naissance} onChange={e => set('date_naissance', e.target.value)} />
                <div style={{ display: 'flex', gap: 5 }}>
                  <input className="neo-input" type="date" style={{ height: 30, fontSize: 12, flex: 1 }} value={editData.created_at || ''} onChange={e => set('created_at', e.target.value)} title="Date d'ajout" />
                  <span style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center', whiteSpace: 'nowrap' }}>Date d&apos;ajout</span>
                </div>
                <select className="neo-input" style={{ height: 30, fontSize: 12 }} value={editData.genre} onChange={e => set('genre', e.target.value)}>
                  <option value="">Genre (non précisé)</option>
                  <option value="homme">Homme</option>
                  <option value="femme">Femme</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 2 }}>
                  <input type="checkbox" checked={editData.permis_conduire} onChange={e => set('permis_conduire', e.target.checked)} style={{ width: 14, height: 14, accentColor: 'var(--primary)' }} />
                  <span style={{ fontSize: 12, color: 'var(--foreground)' }}>Permis de conduire</span>
                </label>
                <input className="neo-input" style={{ height: 30, fontSize: 12 }} placeholder="Localisation" value={editData.localisation} onChange={e => set('localisation', e.target.value)} />
                {agenceMetiers.length > 0 && (
                  <div style={{ position: 'relative' }} ref={metierPickerRef}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>Métiers</label>
                    {/* Pastilles sélectionnées */}
                    {(editData.metiers || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                        {(editData.metiers || []).map((m: string) => {
                          const color = getColorForMetier(m) || '#3B82F6'
                          return (
                            <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: color, color: '#fff' }}>
                              {m}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {/* Bouton ouvrir liste */}
                    <button
                      type="button"
                      onClick={() => setShowMetierPicker(v => !v)}
                      className="neo-input"
                      style={{ height: 30, fontSize: 12, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <span style={{ color: 'var(--muted)' }}>
                        {(editData.metiers || []).length === 0 ? '+ Choisir métier(s)…' : `${(editData.metiers || []).length} sélectionné(s)`}
                      </span>
                      <ChevronDown size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    </button>
                    {/* Popover liste déroulante */}
                    {showMetierPicker && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                        background: 'var(--card)', borderRadius: 10, marginTop: 4,
                        boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
                        border: '1px solid var(--border)',
                        padding: 8,
                      }}>
                        {/* Barre de recherche */}
                        <input
                          ref={metierSearchRef}
                          autoFocus
                          value={metierSearch}
                          onChange={e => setMetierSearch(e.target.value)}
                          placeholder="Rechercher un métier…"
                          style={{
                            width: '100%', padding: '5px 8px', fontSize: 12, borderRadius: 6,
                            border: '1px solid var(--border)', background: 'var(--secondary)',
                            color: 'var(--foreground)', outline: 'none', fontFamily: 'inherit',
                            marginBottom: 6, boxSizing: 'border-box',
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                        {(() => {
                          const currentMetiers: string[] = editData.metiers || []
                          const normM = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                          const qM = normM(metierSearch.trim())
                          const matchesM = (m: string) => !qM || normM(m).includes(qM)
                          const patchMetiers = async (newMetiers: string[]) => {
                            set('metiers', newMetiers)
                            queryClient.setQueryData(['candidat', id], (old: any) => old ? { ...old, tags: newMetiers } : old)
                            try {
                              await fetch(`/api/candidats/${candidat.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tags: newMetiers }),
                              })
                              queryClient.invalidateQueries({ queryKey: ['candidats'] })
                            } catch {
                              queryClient.invalidateQueries({ queryKey: ['candidat', id] })
                            }
                          }
                          const renderItem = (m: string, color: string) => {
                            const on = currentMetiers.includes(m)
                            return (
                              <label key={m} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                                background: on ? `${color}14` : 'transparent',
                                fontSize: 12, fontWeight: on ? 600 : 400,
                              }}>
                                <input type="checkbox" checked={on}
                                  onChange={() => { patchMetiers(on ? currentMetiers.filter(x => x !== m) : [...currentMetiers, m]); setMetierSearch(''); metierSearchRef.current?.focus() }}
                                  style={{ accentColor: color }}
                                />
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                {m}
                              </label>
                            )
                          }
                          const renderGroup = (name: string, color: string, items: string[]) => {
                            const available = items.filter(m => agenceMetiers.includes(m) && matchesM(m)).sort((a, b) => a.localeCompare(b, 'fr'))
                            if (available.length === 0) return null
                            return (
                              <div key={name}>
                                <div style={{ fontSize: 10, fontWeight: 700, color, margin: '6px 0 2px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{name}</div>
                                {available.map(m => renderItem(m, color))}
                              </div>
                            )
                          }
                          const noResults = agenceMetiers.filter(matchesM).length === 0
                          if (metierCategories.length > 0) {
                            const assignedSet = new Set(metierCategories.flatMap(c => c.metiers))
                            const autres = agenceMetiers.filter(m => !assignedSet.has(m))
                            return (
                              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                                {metierCategories.map(cat => renderGroup(cat.name, cat.color, cat.metiers))}
                                {autres.length > 0 && renderGroup('Autres', '#64748B', autres)}
                                {noResults && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 8px' }}>Aucun résultat</p>}
                              </div>
                            )
                          }
                          const allKnown = new Set(METIER_CATEGORIES.flatMap(c => c.metiers))
                          const autres = agenceMetiers.filter(m => !allKnown.has(m))
                          return (
                            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                              {METIER_CATEGORIES.map(cat => renderGroup(cat.label, '#3B82F6', cat.metiers))}
                              {autres.length > 0 && renderGroup('Autres', '#64748B', autres)}
                              {noResults && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 8px' }}>Aucun résultat</p>}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {candidat.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={12} style={{ flexShrink: 0, color: 'var(--primary)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)', flex: 1 }}>{formatEmail(candidat.email)}</span>
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
                      style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--info-soft)', border: '1px solid var(--info-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', cursor: 'pointer' }}
                    >
                      <Send size={10} color="var(--info)" />
                    </a>
                  </div>
                )}
                {candidat.telephone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Phone size={12} style={{ flexShrink: 0, color: 'var(--muted)' }} />
                    <a href={`tel:${candidat.telephone}`} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', flex: 1 }}>{candidat.telephone}</a>
                    <a
                      href={`whatsapp://send?phone=${toWaPhone(candidat.telephone)}&text=${encodeURIComponent(`Bonjour ${candidat.prenom},\n\nJ'espère que vous allez bien.\n\nJe suis à la recherche d'un profil comme vous, n'hésitez pas à me répondre à ce message ou m'appeler.\n\nCordialement,\n${consultantPrenom}\nL-AGENCE SA`)}`}
                      title="Envoyer un message WhatsApp"
                      style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--success-soft)', border: '1px solid var(--success-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', cursor: 'pointer' }}
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
                {candidat.genre && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...smallMuted }}>
                    <span style={{ fontSize: 12 }}>{candidat.genre === 'homme' ? '👨' : '👩'}</span>
                    <span>{candidat.genre === 'homme' ? 'Homme' : 'Femme'}</span>
                  </div>
                )}
                {candidat.permis_conduire != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...smallMuted }}>
                    <Car size={12} style={{ flexShrink: 0 }} />
                    <span>Permis : {candidat.permis_conduire ? '✅ Oui' : '❌ Non'}</span>
                  </div>
                )}
                {/* Pastilles jaunes supprimées — métiers affichés en bleu sous la ville */}
                {candidat.localisation && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...smallMuted }}>
                    <MapPin size={12} style={{ flexShrink: 0 }} />
                    <a
                      href={`https://www.google.com/maps/search/${encodeURIComponent(candidat.localisation)}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 12 }}
                      onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}
                    >{formatCity(candidat.localisation)}</a>
                  </div>
                )}
                {/* Pastilles métier — sous la ville */}
                {candidat.tags && candidat.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                    {candidat.tags.map((tag: string) => (
                      <span key={tag} style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 100,
                        background: 'rgba(59,130,246,0.1)', color: 'var(--info)',
                      }}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Compétences */}
          <div className="neo-card-soft" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Compétences</label>
              {isEditing && (
                <button onClick={() => openEditModal('competences')} title="Modifier les compétences"
                  style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
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
                      padding: '4px 10px', borderRadius: 8,
                      fontSize: 11, fontWeight: 600, lineHeight: 1.3,
                      background: 'var(--primary-soft)',
                      color: 'var(--foreground)',
                      border: '1px solid rgba(245,167,35,0.3)',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
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
                    style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
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
                        padding: '4px 10px', borderRadius: 8,
                        fontSize: 11, fontWeight: 600, lineHeight: 1.3,
                        background: 'rgba(59,130,246,0.1)',
                        color: 'var(--foreground)',
                        border: '1px solid rgba(59,130,246,0.25)',
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

          {/* Documents — ouvre le panneau latéral */}
          <button
            onClick={() => setShowDocuments(true)}
            className="neo-card-soft"
            style={{
              padding: 14, width: '100%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              border: '1px solid var(--border)', background: 'var(--card)',
              fontFamily: 'inherit', textAlign: 'left',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
          >
            <FolderOpen size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>Documents</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--muted)',
              background: 'var(--border)', borderRadius: 10, padding: '2px 7px',
            }}>
              {((candidat.documents as CandidatDocument[]) || []).length + (candidat.cv_url ? 1 : 0)}
            </span>
            <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
          </button>

          {/* Notes et Infos sont maintenant en panneau slide-in (voir en bas du composant) */}
        </div>

        {/* ══ COLONNE 2 — Contenu (résumé, exp, formations, notes) ══ */}
        <div className="candidat-col-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Résumé IA */}
          <div className="neo-card-soft" style={{ borderColor: 'rgba(245,167,35,0.25)', order: sectionsOrder.indexOf('resume') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Star size={13} style={{ color: 'var(--primary)' }} />
              </div>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Résumé IA</h2>
              {isEditing && (
                <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                  <button type="button" onClick={() => moveSection('resume', -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={11} /></button>
                  <button type="button" onClick={() => moveSection('resume', 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={11} /></button>
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
                      <button type="button" onClick={() => moveSection('experiences', -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={11} /></button>
                      <button type="button" onClick={() => moveSection('experiences', 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={11} /></button>
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
                        {exp.periode && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3, marginBottom: 2 }}>{exp.periode}</p>}
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>{exp.poste}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: exp.description ? 5 : 0 }}>
                          {exp.entreprise && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{exp.entreprise}</span>}
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
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--success-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <GraduationCap size={13} style={{ color: 'var(--success)' }} />
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
                      <button type="button" onClick={() => moveSection('formations', -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={11} /></button>
                      <button type="button" onClick={() => moveSection('formations', 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={11} /></button>
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
                      <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--success-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <GraduationCap size={14} style={{ color: 'var(--success)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>{form.diplome}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                          {form.etablissement && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{form.etablissement}</span>}
                          {form.etablissement && form.annee && <span style={{ fontSize: 11, color: 'var(--muted)' }}>·</span>}
                          {form.annee && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)' }}>{form.annee}</span>}
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
                    <button type="button" onClick={() => moveSection('candidatures', -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronUp size={11} /></button>
                    <button type="button" onClick={() => moveSection('candidatures', 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={11} /></button>
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

          {/* cv_texte_brut masqué — reste en DB pour dédup/matching mais plus affiché */}
        </div>

        {/* ══ Resize handle ══ */}
        {showCV && (
          <div
            className="candidat-resize-handle"
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
        <div className="candidat-col-cv" style={{ width: cvWidth, flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>

            {/* Header du viewer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--background)' }}>
              <FileText size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ flex: 1 }} />
              {candidat.cv_url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => setCvLightbox(true)}
                    className="d-icon-btn" style={{ width: 28, height: 28, borderRadius: 7 }}
                    title="Voir en plein écran">
                    <Eye size={13} />
                  </button>
                  <button onClick={downloadCV}
                    className="d-icon-btn" style={{ width: 28, height: 28, borderRadius: 7 }}
                    title="Télécharger le CV">
                    <Download size={13} />
                  </button>
                  <button onClick={printCV}
                    className="d-icon-btn" style={{ width: 28, height: 28, borderRadius: 7 }}
                    title="Imprimer le CV">
                    <Printer size={13} />
                  </button>
                  <button onClick={() => { const r = (cvRotation - 90 + 360) % 360; setCvRotation(r); localStorage.setItem(`cv_rotation_${id}`, r.toString()) }} title="Rotation gauche" className="d-icon-btn" style={{ width: 28, height: 28, borderRadius: 7 }}>
                    <RotateCcw size={13} />
                  </button>
                  <button onClick={() => { const r = (cvRotation + 90) % 360; setCvRotation(r); localStorage.setItem(`cv_rotation_${id}`, r.toString()) }} title="Rotation droite" className="d-icon-btn" style={{ width: 28, height: 28, borderRadius: 7 }}>
                    <RotateCw size={13} />
                  </button>
                  <button onClick={() => setCvZoom(z => Math.max(0.4, Math.round((z - 0.2) * 10) / 10))} className="d-icon-btn" style={{ width: 28, height: 28, borderRadius: 7, fontSize: 14, fontWeight: 700 }}>−</button>
                  <button onClick={() => setCvZoom(1.0)} className="d-icon-btn" style={{ minWidth: 42, height: 28, borderRadius: 7, fontSize: 12, fontWeight: 700 }}>{Math.round(cvZoom * 100)}%</button>
                  <button onClick={() => setCvZoom(z => Math.min(3.0, Math.round((z + 0.2) * 10) / 10))} className="d-icon-btn" style={{ width: 28, height: 28, borderRadius: 7, fontSize: 14, fontWeight: 700 }}>+</button>
                </div>
              )}
              <button onClick={() => setShowCV(false)} title="Masquer le CV"
                className="d-icon-btn" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }}>
                <ChevronRight size={12} />
              </button>
            </div>

            {/* Corps du viewer */}
            {!candidat.cv_url ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--muted)' }}>
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📄❌</div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>Pas de CV dans les documents</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>Ajoutez un CV depuis l&apos;onglet Documents</p>
                </div>
              </div>
            ) : cvIsImage ? (
              <div ref={imgContainerRef}
                style={{
                  flex: 1, overflow: 'auto', background: 'var(--muted)',
                  cursor: cvZoom > 1 ? 'grab' : 'default', userSelect: 'none',
                  padding: 16,
                }}
                onMouseDown={e => { if (cvZoom <= 1) return; const el = imgContainerRef.current; if (!el) return; imgDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }; el.style.cursor = 'grabbing' }}
                onMouseMove={e => { const d = imgDragRef.current; const el = imgContainerRef.current; if (!d.active || !el) return; el.scrollLeft = d.scrollLeft - (e.clientX - d.startX); el.scrollTop = d.scrollTop - (e.clientY - d.startY) }}
                onMouseUp={() => { imgDragRef.current.active = false; if (imgContainerRef.current) imgContainerRef.current.style.cursor = cvZoom > 1 ? 'grab' : 'default' }}
                onMouseLeave={() => { imgDragRef.current.active = false; if (imgContainerRef.current) imgContainerRef.current.style.cursor = cvZoom > 1 ? 'grab' : 'default' }}
                onWheel={cvZoom > 1 ? (e) => {
                  const el = imgContainerRef.current; if (!el) return
                  el.scrollTop += e.deltaY
                  el.scrollLeft += e.deltaX
                } : undefined}
              >
                <div style={{
                  width: `${cvZoom * 100}%`,
                  minWidth: '100%',
                  display: 'flex', justifyContent: 'center',
                }}>
                  <Image src={candidat.cv_url} alt="CV" width={800} height={1130} unoptimized style={{
                    width: '100%', height: 'auto', maxWidth: 'none',
                    borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    pointerEvents: 'none',
                    transform: cvRotation ? `rotate(${cvRotation}deg)` : undefined,
                    transformOrigin: 'center center',
                    transition: 'transform 0.3s ease',
                  }} />
                </div>
              </div>
            ) : (cvIsPDF || cvIsWord) ? (
              <div ref={cvScrollRef}
                style={{
                  flex: 1, overflow: 'auto', background: 'var(--muted)', position: 'relative',
                  cursor: cvZoom > 1 ? 'grab' : 'default',
                }}
                onMouseDown={cvZoom > 1 ? cvDragStart : undefined}
                onMouseMove={cvZoom > 1 ? cvDragMove : undefined}
                onMouseUp={cvZoom > 1 ? cvDragEnd : undefined}
                onMouseLeave={cvZoom > 1 ? cvDragEnd : undefined}
                onWheel={(e) => {
                  if (cvZoom > 1) {
                    const el = cvScrollRef.current; if (!el) return
                    el.scrollTop += e.deltaY
                    el.scrollLeft += e.deltaX
                  }
                }}
              >
                {/* Container agrandi — iframe rendue en HD par Chrome PDF viewer */}
                <div style={{
                  width: `${cvZoom * 100}%`,
                  height: cvZoom === 1 ? '100%' : `${Math.round(cvZoom * 5000)}px`,
                  minWidth: '100%',
                  minHeight: '100%',
                  position: 'relative',
                }}>
                  {cvIsWord && <>
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 56, height: 56, background: 'var(--background)', zIndex: 10 }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, background: 'var(--background)', zIndex: 10 }} />
                  </>}
                  <iframe
                    key={`cv-iframe-${cvRotation}-${cvZoom}`}
                    src={
                      cvIsPDF && cvRotation !== 0
                        ? `/api/cv/rotate?rotation=${cvRotation}&url=${encodeURIComponent(candidat.cv_url)}#toolbar=0&navpanes=0&zoom=${Math.round(cvZoom * 100)}`
                        : cvIsPDF
                          ? `/api/cv/print?url=${encodeURIComponent(candidat.cv_url)}#toolbar=0&navpanes=0&zoom=${Math.round(cvZoom * 100)}`
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
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--muted)' }}>
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
          className="neo-btn-yellow"
          style={{
            position: 'fixed', bottom: 80, right: 28, zIndex: 50,
            borderRadius: 100,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          }}
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
            background: 'var(--card)', borderRadius: 16, padding: 0,
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
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              <Image
                src={candidat.cv_url}
                alt="CV"
                width={800}
                height={1130}
                unoptimized
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, display: 'block', margin: '0 auto', height: 'auto' }}
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

      {/* ── Panneau Notes (slide-in) ── */}
      {showNotes && (
        <div onClick={() => { setShowNotes(false); setEditingNoteId(null) }} style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,0.3)', animation: 'fadeIn 0.15s ease' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, width: 400, height: '100%', background: 'var(--card)', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.2s ease' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={16} color="var(--primary)" /> Notes
                {candidat.notes_candidat?.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--primary)', color: 'var(--ink, #1C1A14)', borderRadius: 99, padding: '1px 7px' }}>
                    {candidat.notes_candidat.length}
                  </span>
                )}
              </h3>
              <button onClick={() => setShowNotes(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="var(--muted)" /></button>
            </div>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea className="neo-input" placeholder="Ajouter une note... (Entrée)" value={note} onChange={e => setNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendNote() } }}
                  style={{ height: 'auto', minHeight: 70, padding: '10px 12px', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 13, flex: 1 }} />
                <button onClick={handleSendNote} disabled={!note.trim() || ajouterNote.isPending} className="neo-btn neo-btn-sm" style={{ alignSelf: 'flex-end', padding: '10px 12px' }}>
                  <Send size={13} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {(!candidat.notes_candidat || candidat.notes_candidat.length === 0) ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 40 }}>Aucune note pour le moment</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...candidat.notes_candidat].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((n: any) => (
                    <div key={n.id} style={{ background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{n.auteur}</span>
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={() => { setEditingNoteId(n.id); setEditingNoteText(n.contenu) }}
                            title="Modifier"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => { if (confirm('Supprimer cette note ?')) deleteNote.mutate({ note_id: n.id, candidat_id: id }) }}
                            title="Supprimer"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, color: 'var(--destructive)', display: 'flex', alignItems: 'center' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      {editingNoteId === n.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <textarea
                            value={editingNoteText}
                            onChange={e => setEditingNoteText(e.target.value)}
                            className="neo-input"
                            style={{ fontSize: 13, lineHeight: 1.5, resize: 'none', minHeight: 60, padding: '8px 10px', fontFamily: 'inherit' }}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Escape') setEditingNoteId(null)
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && editingNoteText.trim()) {
                                updateNote.mutate({ note_id: n.id, candidat_id: id, contenu: editingNoteText.trim() }, { onSuccess: () => setEditingNoteId(null) })
                              }
                            }}
                          />
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditingNoteId(null)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                            <button
                              onClick={() => { if (editingNoteText.trim()) updateNote.mutate({ note_id: n.id, candidat_id: id, contenu: editingNoteText.trim() }, { onSuccess: () => setEditingNoteId(null) }) }}
                              disabled={!editingNoteText.trim() || updateNote.isPending}
                              className="neo-btn neo-btn-sm"
                              style={{ fontSize: 11, padding: '4px 10px' }}
                            >Enregistrer</button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 13, color: 'var(--foreground)', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>{n.contenu}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Panneau Infos (slide-in) ── */}
      {showInfo && (
        <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,0.3)', animation: 'fadeIn 0.15s ease' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, width: 340, height: '100%', background: 'var(--card)', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.2s ease' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Info size={16} color="var(--primary)" /> Informations</h3>
              <button onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="var(--muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Source', value: candidat.source || '—' },
                  { label: 'Créé le', value: new Date(candidat.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) },
                  { label: 'Modifié le', value: new Date(candidat.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) },
                  { label: 'Statut pipeline', value: candidat.statut_pipeline },
                  { label: 'Statut import', value: candidat.import_status === 'a_traiter' ? 'À traiter' : candidat.import_status === 'traite' ? 'Traité' : candidat.import_status || '—' },
                  { label: 'CV', value: candidat.cv_nom_fichier || '—' },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', wordBreak: 'break-word' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmation Ré-analyse IA ── */}
      {showReanalyseConfirm && (
        <div onClick={() => setShowReanalyseConfirm(false)} style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.15s ease',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card)', borderRadius: 16, padding: '28px 32px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            maxWidth: 440, width: '90%', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔄</div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#d97706', marginBottom: 8 }}>
              Ré-analyser ce CV ?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Toutes les informations du profil seront <strong>mises à jour</strong> par rapport au CV actuel.<br />
              Seuls le <strong>nom</strong>, <strong>prénom</strong> et la <strong>photo</strong> seront conservés.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowReanalyseConfirm(false)}
                style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Annuler
              </button>
              <button onClick={confirmReanalyse}
                style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: '#d97706', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Suppression candidat ── */}
      {showDeleteConfirm && (
        <div onClick={() => setShowDeleteConfirm(false)} style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.15s ease',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card)', borderRadius: 16, padding: '28px 32px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            maxWidth: 400, width: '90%', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--destructive)', marginBottom: 8 }}>
              Supprimer ce candidat ?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
              Cette action est <strong>irréversible</strong>. Le candidat, son CV et tous ses documents seront définitivement supprimés.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowDeleteConfirm(false)}
                style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleteCandidat.isPending}
                style={{ padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: '#DC2626', color: 'white', cursor: 'pointer', fontFamily: 'inherit', opacity: deleteCandidat.isPending ? 0.5 : 1 }}>
                {deleteCandidat.isPending ? 'Suppression...' : 'Oui, supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panneau Documents (slide-in) ── */}
      <DocumentsPanel
        open={showDocuments}
        onClose={() => setShowDocuments(false)}
        candidatId={candidat.id}
        documents={(candidat.documents as CandidatDocument[]) || []}
        cvUrl={candidat.cv_url}
        cvFileName={candidat.cv_nom_fichier}
        onUpdate={async (docs) => {
          // PATCH silencieux — les toasts sont gérés par DocumentsPanel
          await fetch(`/api/candidats/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents: docs }),
          })
          queryClient.invalidateQueries({ queryKey: ['candidat', id] })
        }}
        onCvChange={async (url, fileName, skipReparse = false) => {
          // 0. Mise à jour du CV (ou suppression si URL vide) — PATCH atomique
          // Fix v1.8.29 — nettoyer les préfixes [Ancien]/[Archive] du nom promu
          const cleanFileName = (fileName || '').replace(/^\[(Ancien|Archive)\]\s*/i, '') || null
          const updatePayload: Record<string, any> = {
            cv_url: url || null,
            cv_nom_fichier: cleanFileName,
          }
          const currentDocs = (candidat.documents as any[]) || []
          // Bug 6 fix — opération atomique :
          // 1. Retirer le document promu de documents[] (il devient cv_url)
          // 2. Archiver l'ancien CV dans documents[] (s'il existe et est différent)
          let updatedDocs = url
            ? currentDocs.filter((d: any) => d.url !== url)
            : [...currentDocs]
          // Archiver l'ancien CV si on le remplace
          if (url && candidat.cv_url && url !== candidat.cv_url) {
            // Fix v1.8.29 — nettoyer les préfixes éventuels avant d'archiver
            const ancienName = (candidat.cv_nom_fichier || 'CV précédent').replace(/^\[(Ancien|Archive)\]\s*/i, '')
            // Déduplication par URL ou nom (signed URLs ont des tokens différents)
            const isAlreadyArchived = updatedDocs.some((d: any) =>
              d.url === candidat.cv_url || d.name === ancienName || d.name === `[Ancien] ${ancienName}`
            )
            if (!isAlreadyArchived) {
              updatedDocs.push({
                name: `[Ancien] ${ancienName}`,
                url: candidat.cv_url,
                type: 'cv' as any,
                uploaded_at: new Date().toISOString(),
              })
            }
          }
          // Envoyer documents seulement si changé
          if (updatedDocs.length !== currentDocs.length || url) {
            updatePayload.documents = updatedDocs
          }
          const res = await fetch(`/api/candidats/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            console.error('[onCvChange] PATCH failed:', err)
            throw new Error(err.error || 'Erreur serveur')
          }
          queryClient.invalidateQueries({ queryKey: ['candidat', id] })

          // 1. Re-parser seulement si on a un nouveau CV (pas une suppression, pas un simple changement de CV principal)
          if (!url || skipReparse) {
            queryClient.invalidateQueries({ queryKey: ['candidat', id] })
            return
          }
          toast.info('Analyse IA du nouveau CV en cours...')
          try {
            const res = await fetch(url)
            const blob = await res.blob()
            const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf'
            const mimeType = ext === 'pdf' ? 'application/pdf' : blob.type
            const file = new File([blob], fileName, { type: mimeType })
            const formData = new FormData()
            formData.append('cv', file)
            formData.append('update_id', id)
            formData.append('force_insert', 'true')
            const parseRes = await fetch('/api/cv/parse', { method: 'POST', body: formData })
            if (parseRes.ok) {
              queryClient.invalidateQueries({ queryKey: ['candidat', id] })
              toast.success('CV mis à jour et ré-analysé')
            } else {
              const errData = await parseRes.json().catch(() => ({}))
              console.error('[CV Change] Parse error:', errData)
              toast.error('CV chargé mais analyse IA échouée')
            }
          } catch (err) {
            console.error('[CV Change] Error:', err)
          }
        }}
      />

      {/* ── Modal Fusionner avec ── */}
      {showMergeSearch && (
        <div onClick={() => { setShowMergeSearch(false); setMergeSearch(''); setMergeResults([]) }}
          style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 16, width: 480, maxHeight: '80vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px', color: 'var(--foreground)' }}>Fusionner avec un autre candidat</h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>Recherchez le candidat doublon pour fusionner les fiches</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--muted)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
                <Search size={14} color="var(--muted)" />
                <input
                  autoFocus
                  value={mergeSearch}
                  onChange={e => {
                    const q = e.target.value
                    setMergeSearch(q)
                    if (q.trim().length < 2) { setMergeResults([]); setMergeLoading(false); return }
                    setMergeLoading(true)
                    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current)
                    mergeTimerRef.current = setTimeout(async () => {
                      try {
                        const res = await fetch(`/api/candidats?search=${encodeURIComponent(q.trim())}`)
                        if (!res.ok) { setMergeResults([]); setMergeLoading(false); return }
                        const data = await res.json()
                        setMergeResults((data.candidats || []).filter((c: any) => c.id !== candidat.id).slice(0, 8))
                      } catch { setMergeResults([]) }
                      setMergeLoading(false)
                    }, 500)
                  }}
                  placeholder="Nom, email, téléphone..."
                  style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 14, color: 'var(--foreground)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto', padding: '8px 0' }}>
              {mergeLoading && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Recherche...
                </div>
              )}
              {!mergeLoading && mergeResults.length === 0 && mergeSearch.length >= 2 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun résultat</div>
              )}
              {mergeResults.map((c: any) => (
                <button
                  key={c.id}
                  onClick={async () => {
                    if (!confirm(`Fusionner ${candidat.prenom} ${candidat.nom} avec ${c.prenom} ${c.nom} ?\n\nLe profil actuel sera conservé et l'autre sera supprimé.`)) return
                    setMerging(true)
                    try {
                      await fetch('/api/candidats/doublons', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'merge', keep_id: candidat.id, delete_id: c.id }),
                      })
                      queryClient.invalidateQueries({ queryKey: ['candidats'] })
                      queryClient.invalidateQueries({ queryKey: ['candidat', candidat.id] })
                      toast.success(`Fusionné avec ${c.prenom} ${c.nom}`)
                      setShowMergeSearch(false); setMergeSearch(''); setMergeResults([])
                    } catch { toast.error('Erreur lors de la fusion') }
                    setMerging(false)
                  }}
                  disabled={merging}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderBottom: '1px solid var(--border)' }}
                >
                  <div className="neo-avatar" style={{ width: 36, height: 36, fontSize: 13, flexShrink: 0 }}>
                    {formatInitials(c.prenom, c.nom)}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{formatFullName(c.prenom, c.nom)}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {c.titre_poste || ''}{c.email ? ` · ${formatEmail(c.email)}` : ''}
                    </div>
                  </div>
                  <Merge size={14} color="var(--primary)" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CV Customizer Modal ── */}
      {showCvCustomizer && candidat && (
        <CVCustomizerModal candidat={candidat} onClose={() => setShowCvCustomizer(false)} />
      )}

      {showActivityHistory && candidat && (
        <ActivityHistory
          candidatId={candidat.id}
          candidatNom={formatFullName(candidat.prenom, candidat.nom)}
          onClose={() => setShowActivityHistory(false)}
        />
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideInRight { from{transform:translateX(100%)} to{transform:translateX(0)} }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
