'use client'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Upload, Search, Trash2, ChevronDown, ChevronRight,
  LayoutGrid, Check, X, SortAsc, Sparkles, Loader2,
  MessageSquare, Phone, AlertTriangle, Eye, MapPin, SlidersHorizontal, Star, RotateCw,
  CheckCircle, Archive, Briefcase,
} from 'lucide-react'

import { useUpload } from '@/contexts/UploadContext'
import { useCandidats, useDeleteCandidatsBulk, useUpdateStatutCandidat, useUpdateImportStatusBulk } from '@/hooks/useCandidats'
import { useQueryClient } from '@tanstack/react-query'
import type { PipelineEtape, ImportStatus } from '@/types/database'

function getCandidatsLastSeen(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const data = JSON.parse(localStorage.getItem('talentflow_last_seen') || '{}')
    return data.candidats || null
  } catch { return null }
}

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
const FILTER_OPTS = [
  { value: 'tous',      label: 'Tous' },
  { value: 'nouveau',   label: 'Nouveau' },
  { value: 'contacte',  label: 'Contacté' },
  { value: 'entretien', label: 'Entretien' },
  { value: 'place',     label: 'Placé' },
  { value: 'refuse',    label: 'Refusé' },
]
const SORT_OPTS = [
  { value: 'date_desc',  label: '\u2B07 Plus récent' },
  { value: 'date_asc',   label: '\u2B06 Plus ancien' },
  { value: 'nom_az',     label: 'Nom A \u2192 Z' },
  { value: 'titre_az',   label: 'Métier A \u2192 Z' },
]

// Calcule ou retourne l'âge depuis date_naissance
// Accepte : DD/MM/YYYY · DD.MM.YYYY · YYYY-MM-DD · YYYY/MM/DD · "1985" (année) · "65" (âge direct)
const calculerAge = (dateNaissance: string | null): number | null => {
  if (!dateNaissance) return null
  const s = dateNaissance.trim()

  // Âge direct : nombre entre 1 et 120 (ex: "65", "42")
  if (/^\d{1,3}$/.test(s)) {
    const n = parseInt(s, 10)
    return n >= 1 && n <= 120 ? n : null
  }

  // Année seule sur 4 chiffres (ex: "1985")
  if (/^\d{4}$/.test(s)) {
    const age = new Date().getFullYear() - parseInt(s, 10)
    return age > 0 && age < 120 ? age : null
  }

  let birthDate: Date | null = null
  // ISO ou YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
  if (isoMatch) {
    birthDate = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
  } else {
    // DD/MM/YYYY ou DD.MM.YYYY
    const euMatch = s.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/)
    if (euMatch) {
      birthDate = new Date(parseInt(euMatch[3]), parseInt(euMatch[2]) - 1, parseInt(euMatch[1]))
    }
  }
  if (!birthDate || isNaN(birthDate.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age > 0 && age < 120 ? age : null
}

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

const IMPORT_STATUS_OPTS = [
  { value: 'a_traiter', label: 'À traiter' },
  { value: 'traite',    label: 'Actif' },
  { value: 'archive',   label: 'Archivé' },
]

// ─── Popover de sélection de métier ───
function MetierPopover({ candidatId, currentTags, onClose, onSave }: {
  candidatId: string
  currentTags: string[]
  onClose: () => void
  onSave: (tags: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>(currentTags)
  const [metiers, setMetiers] = useState<string[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('agence_metiers')
    if (stored) {
      try { setMetiers(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  const toggle = (m: string) => {
    setSelected(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  return (
    <div style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 100,
      background: 'white', borderRadius: 10, padding: 10,
      boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      border: '1px solid var(--border)', minWidth: 200, maxHeight: 280, overflowY: 'auto',
    }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
        Métier(s)
      </div>
      {metiers.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          Aucun métier configuré.<br />Allez dans Paramètres pour en ajouter.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {metiers.map(m => (
            <label key={m} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
              background: selected.includes(m) ? 'rgba(59,130,246,0.08)' : 'transparent',
              fontSize: 12, fontWeight: selected.includes(m) ? 600 : 400,
            }}>
              <input
                type="checkbox"
                checked={selected.includes(m)}
                onChange={() => toggle(m)}
                style={{ accentColor: '#3B82F6' }}
              />
              {m}
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{
          padding: '4px 10px', fontSize: 11, borderRadius: 6,
          border: '1px solid var(--border)', background: 'white',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
        }}>Annuler</button>
        <button onClick={() => onSave(selected)} style={{
          padding: '4px 10px', fontSize: 11, borderRadius: 6,
          border: 'none', background: '#3B82F6', color: 'white',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
        }}>Enregistrer</button>
      </div>
    </div>
  )
}

export default function CandidatsList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { openUpload } = useUpload()

  const [importStatusFilter, setImportStatusFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('candidats_import_status')
      if (saved) return saved
    }
    return 'a_traiter'
  })

  const sessionStorageKey = 'candidats_search'

  const [agenceMetiers, setAgenceMetiers] = useState<string[]>([])
  const [filtreMetier, setFiltreMetier]   = useState('')
  const [search, setSearch]               = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(sessionStorageKey)
      if (saved) return saved
    }
    return ''
  })
  const [filtreStatut, setFiltreStatut]   = useState<PipelineEtape | 'tous'>(() => {
    const s = searchParams.get('statut')
    return (s && ['nouveau','contacte','entretien','place','refuse'].includes(s) ? s : 'tous') as PipelineEtape | 'tous'
  })
  const [filtreLocalisation, setFiltreLocalisation] = useState('')
  // Helper pour restaurer les filtres depuis sessionStorage
  const ssGet = (key: string, fallback: any = '') => {
    try { const v = sessionStorage.getItem(`candidats_${key}`); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
  }
  const ssSet = (key: string, val: any) => { try { sessionStorage.setItem(`candidats_${key}`, JSON.stringify(val)) } catch {} }

  const [sortBy, setSortBy]               = useState<'date_desc' | 'date_asc' | 'nom_az' | 'titre_az' | 'distance'>(() => ssGet('sort', 'date_desc'))
  const [groupByMetier, setGroupByMetier] = useState(false)
  const [groupByLieu, setGroupByLieu]     = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  // showUpload géré par UploadContext global
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showMessage, setShowMessage]     = useState(false)
  const [messageText, setMessageText]     = useState('')
  const [numCopied, setNumCopied]         = useState(false)

  const [aiSearching, setAiSearching] = useState(false)
  const [aiResults, setAiResults] = useState<any[] | null>(null)
  const [aiInterpreted, setAiInterpreted] = useState('')


  // Advanced filters — restaurés depuis sessionStorage
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() => ssGet('showAdv', false))
  const [filterMetier, setFilterMetier] = useState(() => ssGet('fMetier', ''))
  const [filterLieu, setFilterLieu] = useState(() => ssGet('fLieu', ''))
  const [filterAgeMin, setFilterAgeMin] = useState<number | ''>(() => ssGet('fAgeMin', ''))
  const [filterAgeMax, setFilterAgeMax] = useState<number | ''>(() => ssGet('fAgeMax', ''))
  const [filterLangue, setFilterLangue] = useState(() => ssGet('fLangue', ''))
  const [filterPermis, setFilterPermis] = useState<boolean | null>(() => ssGet('fPermis', null))
  const [filterExpMin, setFilterExpMin] = useState<number | ''>(() => ssGet('fExpMin', ''))
  const [filterGenre, setFilterGenre] = useState<string>(() => ssGet('fGenre', ''))

  // Persister les filtres dans sessionStorage
  useEffect(() => { ssSet('sort', sortBy) }, [sortBy])
  useEffect(() => { ssSet('showAdv', showAdvancedFilters) }, [showAdvancedFilters])
  useEffect(() => { ssSet('fMetier', filterMetier) }, [filterMetier])
  useEffect(() => { ssSet('fLieu', filterLieu) }, [filterLieu])
  useEffect(() => { ssSet('fAgeMin', filterAgeMin) }, [filterAgeMin])
  useEffect(() => { ssSet('fAgeMax', filterAgeMax) }, [filterAgeMax])
  useEffect(() => { ssSet('fLangue', filterLangue) }, [filterLangue])
  useEffect(() => { ssSet('fPermis', filterPermis) }, [filterPermis])
  useEffect(() => { ssSet('fExpMin', filterExpMin) }, [filterExpMin])
  useEffect(() => { ssSet('fGenre', filterGenre) }, [filterGenre])

  // CV hover preview
  const [hoveredCv, setHoveredCv] = useState<{ url: string; ext: string; x: number; y: number; rotation: number } | null>(null)
  const [metierPopoverId, setMetierPopoverId] = useState<string | null>(null)
  const hoveredCvTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const prevHoveredCvUrl = useRef<string | null>(null)
  const previewPanRef = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 })
  const previewScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (hoveredCv && hoveredCv.url !== prevHoveredCvUrl.current) {
      setPreviewZoom(1)
      prevHoveredCvUrl.current = hoveredCv.url
    }
    if (!hoveredCv) prevHoveredCvUrl.current = null
  }, [hoveredCv])


  // Persist search in sessionStorage
  useEffect(() => {
    if (search) sessionStorage.setItem(sessionStorageKey, search)
    else sessionStorage.removeItem(sessionStorageKey)
  }, [search, sessionStorageKey])
  // Restore search from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(sessionStorageKey)
    if (saved && !search) setSearch(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Distance depuis Monthey, Suisse — cache par localisation
  const [distances, setDistances] = useState<Record<string, number>>(() => {
    try {
      const s = typeof localStorage !== 'undefined' ? localStorage.getItem('talentflow_distances_monthey') : null
      return s ? JSON.parse(s) : {}
    } catch { return {} }
  })
  const geocacheRef = useRef<Record<string, { lat: number; lon: number } | null>>({})
  const geocodingRef = useRef<Set<string>>(new Set())

  // Pipeline dropdown inline (only used in 'all' mode)
  const [openPipelineId, setOpenPipelineId] = useState<string | null>(null)
  const [pipelinePos, setPipelinePos] = useState<{ top: number; left: number } | null>(null)
  const [perPage, setPerPage] = useState<number>(20)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('agence_metiers')
      if (stored) setAgenceMetiers(JSON.parse(stored))
    } catch {}
  }, [])

  // Persist import status filter
  useEffect(() => {
    sessionStorage.setItem('candidats_import_status', importStatusFilter)
  }, [importStatusFilter])

  // Debounced search pour ne pas spammer l'API
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const [page, setPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('candidats_page')
      if (saved) return parseInt(saved, 10)
    }
    return 1
  })
  // Persist page
  useEffect(() => { sessionStorage.setItem('candidats_page', String(page)) }, [page])
  // Reset page + sélection quand les filtres changent (skip au premier render)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setPage(1)
    setSelectedIds(new Set())
  }, [debouncedSearch, filtreStatut, importStatusFilter, sortBy, perPage, filterGenre, filterAgeMin, filterAgeMax, filterLangue, filterPermis, filterLieu, filterMetier])

  // Si filtre âge actif → fetch tout (client-side, car date_naissance a des formats mixtes)
  const ageFilterActive = filterAgeMin !== '' || filterAgeMax !== ''
  const { data: candidatsData, isLoading, isFetching } = useCandidats({
    statut: filtreStatut === 'tous' ? undefined : filtreStatut,
    import_status: importStatusFilter as ImportStatus,
    search: debouncedSearch || undefined,
    page: ageFilterActive ? 1 : page,
    per_page: ageFilterActive ? 0 : perPage, // 0 = fetch all (max 10000)
    sort: sortBy,
    genre: filterGenre || undefined,
    langue: filterLangue || undefined,
    permis: filterPermis,
    lieu: filterLieu || undefined,
    metier: filterMetier || undefined,
  })
  const allCandidats = candidatsData?.candidats || []
  const totalCandidatsRaw = candidatsData?.total ?? allCandidats.length
  const deleteBulk   = useDeleteCandidatsBulk()
  const updateStatut = useUpdateStatutCandidat()
  const updateImportStatus = useUpdateImportStatusBulk()

  useEffect(() => {
    if (!allCandidats.length) return
    const locs = [...new Set(allCandidats.map((c: any) => c.localisation).filter(Boolean))] as string[]
    // Skip locs already in distances (loaded from localStorage) or already being geocoded
    const todo = locs.filter(loc => distances[loc] === undefined && !(loc in geocacheRef.current) && !geocodingRef.current.has(loc))
    if (!todo.length) return

    let i = 0
    const next = () => {
      if (i >= todo.length) return
      const loc = todo[i++]
      geocodingRef.current.add(loc)
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(loc)}&format=json&limit=1`)
        .then(r => r.json())
        .then(d => {
          if (d?.[0]) {
            const lat2 = parseFloat(d[0].lat)
            const lon2 = parseFloat(d[0].lon)
            geocacheRef.current[loc] = { lat: lat2, lon: lon2 }
            const R = 6371
            const dLat = (lat2 - 46.2548) * Math.PI / 180
            const dLon = (lon2 - 6.9567)  * Math.PI / 180
            const a = Math.sin(dLat/2)**2 + Math.cos(46.2548*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
            const km = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
            setDistances(prev => {
              const next = { ...prev, [loc]: km }
              try { localStorage.setItem('talentflow_distances_monthey', JSON.stringify(next)) } catch {}
              return next
            })
          } else {
            geocacheRef.current[loc] = null
          }
          setTimeout(next, 1100) // 1 req/sec max (Nominatim limit)
        })
        .catch(() => { geocacheRef.current[loc] = null; setTimeout(next, 1100) })
    }
    next()
  }, [allCandidats])

  // Fermer le dropdown pipeline en cliquant ailleurs
  useEffect(() => {
    const close = () => { setOpenPipelineId(null); setPipelinePos(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // Filtrage — la plupart des filtres sont côté serveur
  // Restent côté client : âge (format mixte), dropdown par métier/localisation, exp min
  const candidatsFiltres = useMemo(() => {
    const base = aiResults !== null ? aiResults : (allCandidats || [])
    let filtered: any[] = base as any[]

    if (filtreLocalisation.trim()) {
      const loc = normalize(filtreLocalisation)
      filtered = filtered.filter((c: any) => normalize(c.localisation || '').includes(loc))
    }
    if (filtreMetier) {
      filtered = filtered.filter((c: any) => (c.tags || []).includes(filtreMetier))
    }
    if (filterExpMin !== '') {
      filtered = filtered.filter(c => (c.annees_exp || 0) >= filterExpMin)
    }
    // Filtre âge côté client (date_naissance peut être "54", "15/03/1990", etc.)
    if (filterAgeMin !== '' || filterAgeMax !== '') {
      filtered = filtered.filter(c => {
        const age = c.date_naissance ? calculerAge(c.date_naissance) : null
        if (age === null) return false
        if (filterAgeMin !== '' && age < filterAgeMin) return false
        if (filterAgeMax !== '' && age > filterAgeMax) return false
        return true
      })
    }

    return filtered
  }, [allCandidats, aiResults, filtreLocalisation, filtreMetier, filterExpMin, filterAgeMin, filterAgeMax])

  const activeFiltersCount = [
    filterMetier !== '',
    filterLieu !== '',
    filterAgeMin !== '',
    filterAgeMax !== '',
    filterLangue !== '',
    filterPermis !== null,
    filterGenre !== '',
  ].filter(Boolean).length

  // Tri côté serveur — seul le tri par distance reste côté client
  const sorted = useMemo(() => {
    if (sortBy === 'distance') {
      return [...candidatsFiltres].sort((a, b) => {
        const da = distances[a.localisation] ?? 99999
        const db = distances[b.localisation] ?? 99999
        return da - db
      })
    }
    return candidatsFiltres // Déjà trié par le serveur
  }, [candidatsFiltres, sortBy, distances])

  // Pagination : client-side quand filtre âge actif, sinon serveur
  const candidatesTries = sorted
  const clientPaginated = ageFilterActive
  const candidatesPagines = clientPaginated
    ? candidatesTries.slice((page - 1) * perPage, page * perPage)
    : candidatesTries
  const totalCandidats = clientPaginated ? candidatesTries.length : totalCandidatsRaw
  const totalFiltered = clientPaginated ? candidatesTries.length : (candidatsData?.total ?? 0)
  const totalPages = clientPaginated
    ? Math.ceil(candidatesTries.length / perPage) || 1
    : (candidatsData?.total_pages || 1)
  const hasMore = page < totalPages

  // Group by métier ou lieu
  const grouped = useMemo(() => {
    if (!groupByMetier && !groupByLieu) return null
    const groups: Record<string, any[]> = {}
    for (const c of sorted) {
      const key = groupByMetier
        ? (c.titre_poste?.trim() || 'Sans métier')
        : (c.localisation?.trim() || 'Sans lieu')
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    }
    const noVal = groupByMetier ? 'Sans métier' : 'Sans lieu'
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === noVal) return 1
      if (b === noVal) return -1
      return a.localeCompare(b, 'fr')
    })
  }, [sorted, groupByMetier, groupByLieu])

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = () => setSelectedIds(new Set(sorted.map((c: any) => c.id)))
  const deselectAll = () => setSelectedIds(new Set())

  const toggleSelectGroup = (ids: string[]) => {
    const allSelected = ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  // Détecte et formate automatiquement un numéro en international
  const detectAndFormat = (tel: string): { number: string; flag: string; country: string } => {
    const c = tel.replace(/[\s\-().]/g, '')

    if (c.startsWith('+41')  || c.startsWith('0041'))  return { number: '+41'  + (c.startsWith('+41')  ? c.slice(3) : c.slice(4)), flag: '\uD83C\uDDE8\uD83C\uDDED', country: 'Suisse' }
    if (c.startsWith('+33')  || c.startsWith('0033'))  return { number: '+33'  + (c.startsWith('+33')  ? c.slice(3) : c.slice(4)), flag: '\uD83C\uDDEB\uD83C\uDDF7', country: 'France' }
    if (c.startsWith('+34')  || c.startsWith('0034'))  return { number: '+34'  + (c.startsWith('+34')  ? c.slice(3) : c.slice(4)), flag: '\uD83C\uDDEA\uD83C\uDDF8', country: 'Espagne' }
    if (c.startsWith('+351') || c.startsWith('00351')) return { number: '+351' + (c.startsWith('+351') ? c.slice(4) : c.slice(5)), flag: '\uD83C\uDDF5\uD83C\uDDF9', country: 'Portugal' }
    if (c.startsWith('+39')  || c.startsWith('0039'))  return { number: '+39'  + (c.startsWith('+39')  ? c.slice(3) : c.slice(4)), flag: '\uD83C\uDDEE\uD83C\uDDF9', country: 'Italie' }

    if (c.startsWith('0')) {
      const local = c.slice(1)
      if (/^7[6-9]/.test(local)) return { number: '+41' + local, flag: '\uD83C\uDDE8\uD83C\uDDED', country: 'Suisse' }
      if (/^[67]/.test(local))   return { number: '+33' + local, flag: '\uD83C\uDDEB\uD83C\uDDF7', country: 'France' }
      if (/^[0-5]/.test(local))  return { number: '+33' + local, flag: '\uD83C\uDDEB\uD83C\uDDF7', country: 'France' }
      return { number: c, flag: '\u2753', country: '' }
    }

    if (/^[67]/.test(c) && c.length === 9)      return { number: '+34'  + c, flag: '\uD83C\uDDEA\uD83C\uDDF8', country: 'Espagne' }
    if (/^9/.test(c)    && c.length === 9)       return { number: '+351' + c, flag: '\uD83C\uDDF5\uD83C\uDDF9', country: 'Portugal' }
    if (/^3/.test(c)    && c.length >= 9)        return { number: '+39'  + c, flag: '\uD83C\uDDEE\uD83C\uDDF9', country: 'Italie' }

    return { number: c, flag: '\uD83D\uDCF1', country: '' }
  }

  const copyNumbers = async (formatted: string[]) => {
    await navigator.clipboard.writeText(formatted.join('\n'))
    setNumCopied(true)
    setTimeout(() => setNumCopied(false), 2500)
  }

  const openMessages = (formatted: string[]) => {
    // Ouvrir Messages avec numéros ET message pré-rempli
    // sms:NUM1,NUM2?body=MESSAGE → ouvre Messages avec les destinataires et le texte
    const numbers = formatted.join(',')
    const body = encodeURIComponent(messageText || '')
    window.open(`sms:${numbers}${body ? `?body=${body}` : ''}`, '_self')
  }

  const handleBulkDelete = () => {
    deleteBulk.mutate(Array.from(selectedIds), {
      onSuccess: () => {
        setSelectedIds(new Set())
        setShowDeleteConfirm(false)
        queryClient.invalidateQueries({ queryKey: ['candidats'] })
      },
    })
  }

  const handleBulkValidate = () => {
    updateImportStatus.mutate(
      { ids: Array.from(selectedIds), status: 'traite' as ImportStatus },
      {
        onSuccess: () => {
          setSelectedIds(new Set())
          queryClient.invalidateQueries({ queryKey: ['candidats'] })
        },
      }
    )
  }

  const handleBulkArchive = () => {
    updateImportStatus.mutate(
      { ids: Array.from(selectedIds), status: 'archive' as ImportStatus },
      {
        onSuccess: () => {
          setSelectedIds(new Set())
          queryClient.invalidateQueries({ queryKey: ['candidats'] })
        },
      }
    )
  }

  const handleSingleValidate = (id: string) => {
    updateImportStatus.mutate(
      { ids: [id], status: 'traite' as ImportStatus },
      {
        onSuccess: () => {
          setSelectedIds(prev => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
          queryClient.invalidateQueries({ queryKey: ['candidats'] })
        },
      }
    )
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleCardClick = (id: string) => {
    if (selectedIds.size > 0) toggleSelect(id)
    else {
      sessionStorage.setItem('candidats_last_list', importStatusFilter === 'a_traiter' ? 'a_traiter' : 'all')
      router.push(`/candidats/${id}`)
    }
  }

  const initiales = (c: any) => {
    const p = (c.prenom || '').trim()
    const n = (c.nom || '').trim()
    return `${p[0] || ''}${n[0] || ''}`.toUpperCase() || '?'
  }

  const handleAiSearch = async () => {
    if (!search.trim()) return
    setAiSearching(true)
    setAiResults(null)
    setAiInterpreted('')
    try {
      const res = await fetch('/api/candidats/search-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: search }),
      })
      if (!res.ok) throw new Error('Erreur recherche IA')
      const { candidats: results, query_interpreted } = await res.json()
      setAiResults(results || [])
      setAiInterpreted(query_interpreted || search)
    } catch (e) {
      console.error(e)
    } finally {
      setAiSearching(false)
    }
  }

  const clearAiSearch = () => {
    setAiResults(null)
    setAiInterpreted('')
  }

  const candidatsLastSeen = getCandidatsLastSeen()

  const renderCard = (c: any) => {
    const selected = selectedIds.has(c.id)
    const age = calculerAge(c.date_naissance)
    const hasCv = !!c.cv_url
    const cvExt = (c.cv_nom_fichier || '').toLowerCase().split('.').pop() || ''
    const isNewCandidat = candidatsLastSeen && c.created_at ? new Date(c.created_at) > new Date(candidatsLastSeen) : false

    return (
      <div
        key={c.id}
        onClick={() => handleCardClick(c.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: selected ? 'var(--primary-soft)' : 'var(--surface)',
          border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 14, padding: '16px 18px',
          cursor: 'pointer', transition: 'all 0.15s ease',
          boxShadow: selected ? '0 0 0 2px rgba(245,167,35,0.2)' : 'var(--card-shadow)',
          position: 'relative',
        }}
      >
        {/* Badge "nouveau" en haut à gauche */}
        {isNewCandidat && (
          <span style={{
            position: 'absolute', top: 6, left: 6,
            width: 10, height: 10, borderRadius: '50%',
            background: '#EF4444', border: '2px solid var(--surface)',
            boxShadow: '0 0 6px rgba(239,68,68,0.5)',
            zIndex: 2,
          }} />
        )}
        {/* Checkbox */}
        <div
          onClick={e => { e.stopPropagation(); toggleSelect(c.id) }}
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
            background: selected ? 'var(--primary)' : 'var(--surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {selected && <Check size={11} color="#0F172A" strokeWidth={3} />}
        </div>

        {/* Avatar */}
        {(c.photo_url && c.photo_url !== 'checked')
          ? <img src={c.photo_url} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} alt="" />
          : (
            <div
              style={{
                width: 56, height: 56, borderRadius: 8,
                background: 'var(--bg-muted, #F1F5F9)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 18, fontWeight: 800,
                color: 'var(--text-muted, #64748B)', flexShrink: 0, overflow: 'hidden',
              }}
            >
              {initiales(c)}
            </div>
          )
        }

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--foreground)', lineHeight: 1.3 }}>
            {c.prenom} {c.nom}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {c.titre_poste && (
              <span style={{ fontSize: 15, color: 'var(--foreground)', fontWeight: 400 }}>{c.titre_poste}</span>
            )}
            {c.localisation && (
              <span style={{ fontSize: 14, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {'\uD83D\uDCCD'} {c.localisation}
              </span>
            )}
          </div>
        </div>

        {/* Star rating — à gauche de l'âge */}
        {c.rating > 0 && (
          <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            {[1, 2, 3, 4, 5].map(star => (
              <Star
                key={star}
                size={13}
                color="#EAB308"
                fill={star <= c.rating ? '#EAB308' : 'none'}
              />
            ))}
          </div>
        )}

        {/* Âge (calculé depuis date_naissance) */}
        {age !== null && (
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0, background: 'var(--secondary)', padding: '4px 10px', borderRadius: 8 }}>
            {age} ans
          </span>
        )}

        {/* Bouton CV hover preview */}
        {hasCv && (
          <div
            onClick={e => e.stopPropagation()}
            onMouseEnter={e => {
              if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              hoveredCvTimeout.current = setTimeout(() => {
                const savedRot = localStorage.getItem(`cv_rotation_${c.id}`)
                const rotation = savedRot ? parseInt(savedRot, 10) : 0
                setHoveredCv({ url: c.cv_url, ext: cvExt, x: rect.right, y: rect.top, rotation })
              }, 250)
            }}
            onMouseLeave={() => {
              if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
              hoveredCvTimeout.current = setTimeout(() => setHoveredCv(null), 400)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 9px', borderRadius: 7,
              border: '1px solid rgba(245,167,35,0.35)',
              background: 'var(--primary-soft)',
              cursor: 'default', fontSize: 11, fontWeight: 700,
              color: 'var(--primary)', flexShrink: 0,
              transition: 'all 0.15s',
            }}
            title="Survoler pour prévisualiser le CV"
          >
            <Eye size={11} /> CV
          </div>
        )}

        {/* Quick validate button (a_traiter mode only) */}
        {importStatusFilter === 'a_traiter' && (
          <button
            onClick={e => { e.stopPropagation(); handleSingleValidate(c.id) }}
            title="Valider ce candidat"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, border: '1.5px solid #16A34A',
              background: '#16A34A', cursor: 'pointer', flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#15803D'; e.currentTarget.style.borderColor = '#15803D' }}
            onMouseOut={e => { e.currentTarget.style.background = '#16A34A'; e.currentTarget.style.borderColor = '#16A34A' }}
          >
            <CheckCircle size={15} color="white" />
          </button>
        )}

        {/* Métier — pastille bleue si assigné, bouton discret sinon */}
        <div onClick={e => e.stopPropagation()} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setMetierPopoverId(metierPopoverId === c.id ? null : c.id) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 100,
              border: (c.tags && c.tags.length > 0) ? 'none' : '1px dashed var(--border)',
              background: (c.tags && c.tags.length > 0) ? 'rgba(59,130,246,0.1)' : 'transparent',
              cursor: 'pointer', fontSize: 10, fontWeight: (c.tags && c.tags.length > 0) ? 700 : 600,
              color: (c.tags && c.tags.length > 0) ? '#3B82F6' : 'var(--muted)',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
              opacity: (c.tags && c.tags.length > 0) ? 1 : 0.6,
            }}
            title={(c.tags && c.tags.length > 0) ? 'Modifier les métiers' : 'Assigner un métier'}
          >
            <Briefcase size={10} />
            {(c.tags && c.tags.length > 0) ? (c.tags[0] + (c.tags.length > 1 ? ` +${c.tags.length - 1}` : '')) : 'Métier'}
          </button>
          {metierPopoverId === c.id && (
            <MetierPopover
              candidatId={c.id}
              currentTags={c.tags || []}
              onClose={() => setMetierPopoverId(null)}
              onSave={async (tags) => {
                const { createClient } = await import('@/lib/supabase/client')
                const supabase = createClient()
                await supabase.from('candidats').update({ tags }).eq('id', c.id)
                setMetierPopoverId(null)
                queryClient.invalidateQueries({ queryKey: ['candidats'] })
              }}
            />
          )}
        </div>

        {/* Date d'ajout */}
        <span style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0, opacity: 0.7 }}>
          {new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>
    )
  }

  const selCount = selectedIds.size

  return (
    <div className="d-page">
      {/* Header */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title">Candidats</h1>
          <p className="d-page-sub">
            {isLoading ? '...' : `${totalCandidats} candidat${totalCandidats > 1 ? 's' : ''}`}
            {aiResults !== null && (
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                {' '}&middot; Résultats IA
              </span>
            )}
            {selCount > 0 && (
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                {' '}&middot; {selCount} sélectionné{selCount > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {search && (
            <button onClick={() => { setSearch(''); sessionStorage.removeItem(sessionStorageKey) }} className="neo-btn-ghost" style={{ fontSize: 13, gap: 6 }}>
              <X size={14} /> Nouvelle recherche
            </button>
          )}
          <button onClick={() => openUpload()} className="neo-btn-yellow">
            <Upload size={15} /> Importer Candidat/s
          </button>
        </div>
      </div>

      {/* Selection action bar */}
      {selCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: 'var(--primary-soft)', border: '1px solid rgba(245,167,35,0.35)',
          borderRadius: 12, padding: '10px 16px', marginBottom: 16,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>
            {selCount} candidat{selCount > 1 ? 's' : ''} sélectionné{selCount > 1 ? 's' : ''}
          </span>
          <button onClick={selectAll} className="neo-btn-ghost neo-btn-sm">
            Tout sélectionner ({sorted.length})
          </button>
          <button onClick={deselectAll} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 12.5,
            background: '#1F2937', color: '#fff', border: 'none',
            fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#000', border: '2px solid #fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={8} color="#fff" />
            </span>
            Tout désélectionner
          </button>
          {importStatusFilter === 'a_traiter' && (
            <>
              <button onClick={handleBulkValidate} disabled={updateImportStatus.isPending} className="neo-btn neo-btn-sm" style={{ background: '#16A34A', color: 'white', boxShadow: 'none' }}>
                <CheckCircle size={13} /> Valider ({selCount})
              </button>
              <button onClick={handleBulkArchive} disabled={updateImportStatus.isPending} className="neo-btn neo-btn-sm" style={{ background: '#6B7280', color: 'white', boxShadow: 'none' }}>
                <Archive size={13} /> Archiver ({selCount})
              </button>
            </>
          )}
          {importStatusFilter === 'traite' && (
            <>
              <button onClick={() => { const ids = Array.from(selectedIds); updateImportStatus.mutate({ ids, status: 'a_traiter' }) }} disabled={updateImportStatus.isPending} className="neo-btn neo-btn-sm" style={{ background: '#F59E0B', color: 'white', boxShadow: 'none' }}>
                <RotateCw size={13} /> À traiter ({selCount})
              </button>
              <button onClick={handleBulkArchive} disabled={updateImportStatus.isPending} className="neo-btn neo-btn-sm" style={{ background: '#6B7280', color: 'white', boxShadow: 'none' }}>
                <Archive size={13} /> Archiver ({selCount})
              </button>
            </>
          )}
          {importStatusFilter === 'archive' && (
            <>
              <button onClick={handleBulkValidate} disabled={updateImportStatus.isPending} className="neo-btn neo-btn-sm" style={{ background: '#16A34A', color: 'white', boxShadow: 'none' }}>
                <CheckCircle size={13} /> Activer ({selCount})
              </button>
              <button onClick={() => { const ids = Array.from(selectedIds); updateImportStatus.mutate({ ids, status: 'a_traiter' }) }} disabled={updateImportStatus.isPending} className="neo-btn neo-btn-sm" style={{ background: '#F59E0B', color: 'white', boxShadow: 'none' }}>
                <RotateCw size={13} /> À traiter ({selCount})
              </button>
            </>
          )}
          <button
            onClick={() => setShowMessage(true)}
            className="neo-btn neo-btn-sm"
            style={{ background: '#007AFF', color: 'white', boxShadow: 'none' }}
          >
            <MessageSquare size={13} /> Message ({selCount})
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="neo-btn neo-btn-sm"
            style={{ background: '#DC2626', boxShadow: 'none' }}
          >
            <Trash2 size={13} /> Supprimer ({selCount})
          </button>
        </div>
      )}

      {/* Filters + Sort + Group */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 500, display: 'flex', gap: 6 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--muted)' }} />
            <input
              className="neo-input-soft"
              style={{ paddingLeft: 38, paddingRight: (search || aiResults !== null) ? 32 : 12, width: '100%' }}
              placeholder="Nom, métier, compétence, contenu du CV..."
              value={search}
              onChange={e => { setSearch(e.target.value); if (aiResults !== null) clearAiSearch() }}
              onKeyDown={e => { if (e.key === 'Enter' && search.trim()) handleAiSearch() }}
            />
            {(search || aiResults !== null) && (
              <button
                onClick={() => { clearAiSearch(); setSearch(''); sessionStorage.removeItem(sessionStorageKey) }}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Filtre métier */}
        {agenceMetiers.length > 0 && (
          <select
            className="neo-input-soft"
            style={{ height: 38, fontSize: 13, paddingLeft: 10, minWidth: 140 }}
            value={filtreMetier}
            onChange={e => setFiltreMetier(e.target.value)}
          >
            <option value="">Tous les métiers</option>
            {agenceMetiers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}

        {/* Statut import filter */}
        <select
          value={importStatusFilter}
          onChange={e => setImportStatusFilter(e.target.value)}
          className="neo-input-soft"
          style={{ width: 'auto', cursor: 'pointer', fontSize: 13, paddingRight: 8, fontWeight: 700,
            color: importStatusFilter === 'a_traiter' ? '#D97706' : importStatusFilter === 'archive' ? '#6B7280' : '#059669',
            borderColor: importStatusFilter === 'a_traiter' ? '#FDE68A' : importStatusFilter === 'archive' ? '#E5E7EB' : '#BBF7D0',
            background: importStatusFilter === 'a_traiter' ? '#FFFBEB' : importStatusFilter === 'archive' ? '#F9FAFB' : '#F0FDF4',
          }}
        >
          {IMPORT_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Sort */}
        <div style={{ position: 'relative' }}>
          <SortAsc style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--muted)', pointerEvents: 'none' }} />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="neo-input-soft"
            style={{ paddingLeft: 30, width: 'auto', cursor: 'pointer', fontSize: 13, paddingRight: 8 }}
          >
            {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Group by métier */}
        <button
          onClick={() => {
            const newVal = !groupByMetier
            setGroupByMetier(newVal)
            if (newVal) setGroupByLieu(false)
            setCollapsedGroups(new Set())
          }}
          className={groupByMetier ? 'neo-btn neo-btn-sm' : 'neo-btn-ghost neo-btn-sm'}
          style={groupByMetier ? { background: 'var(--primary)', color: '#0F172A' } : {}}
        >
          <LayoutGrid size={13} /> Par métier
        </button>

        {/* Group by lieu */}
        <button
          onClick={() => {
            const newVal = !groupByLieu
            setGroupByLieu(newVal)
            if (newVal) setGroupByMetier(false)
            setCollapsedGroups(new Set())
          }}
          className={groupByLieu ? 'neo-btn neo-btn-sm' : 'neo-btn-ghost neo-btn-sm'}
          style={groupByLieu ? { background: 'var(--primary)', color: '#0F172A' } : {}}
        >
          <MapPin size={13} /> Par lieu
        </button>

        {/* Filtres avancés button */}
        <button onClick={() => setShowAdvancedFilters((v: boolean) => !v)} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:showAdvancedFilters?'var(--primary)':'var(--bg-card)',color:showAdvancedFilters?'white':'var(--text)',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
          <SlidersHorizontal size={14} />
          Filtres avancés
          {activeFiltersCount > 0 && <span style={{background:'#EF4444',color:'white',borderRadius:10,padding:'1px 6px',fontSize:11}}>{activeFiltersCount}</span>}
        </button>

        {/* Nombre de résultats par page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value={20}>20</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={0}>Tous</option>
          </select>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>/ {candidatesTries.length}</span>
        </div>
      </div>

      {/* Advanced filters panel */}
      {showAdvancedFilters && (
        <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:16,marginBottom:12,display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))',gap:12}}>
          {/* Métier filtré via le dropdown principal — supprimé ici pour éviter doublon */}
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>LIEU</label>
            <input value={filterLieu} onChange={e=>setFilterLieu(e.target.value)} placeholder="Ex: Genève, Lausanne..." style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}} />
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>ÂGE MIN</label>
            <input type="number" min={16} max={80} value={filterAgeMin} onChange={e=>setFilterAgeMin(e.target.value?Number(e.target.value):'')} placeholder="18" style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}} />
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>ÂGE MAX</label>
            <input type="number" min={16} max={80} value={filterAgeMax} onChange={e=>setFilterAgeMax(e.target.value?Number(e.target.value):'')} placeholder="65" style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}} />
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>LANGUE</label>
            <input value={filterLangue} onChange={e=>setFilterLangue(e.target.value)} placeholder="Ex: Français, Anglais..." style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}} />
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>GENRE</label>
            <select value={filterGenre} onChange={e=>setFilterGenre(e.target.value)} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}}>
              <option value="">Tous</option>
              <option value="homme">Homme</option>
              <option value="femme">Femme</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>PERMIS DE CONDUIRE</label>
            <select value={filterPermis===null?'':filterPermis?'oui':'non'} onChange={e=>setFilterPermis(e.target.value===''?null:e.target.value==='oui')} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}}>
              <option value="">Tous</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
          <div style={{display:'flex',alignItems:'flex-end'}}>
            <button onClick={()=>{setFilterMetier('');setFilterLieu('');setFilterAgeMin('');setFilterAgeMax('');setFilterLangue('');setFilterPermis(null);setFilterExpMin('');setFilterGenre('')}} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,cursor:'pointer',color:'var(--muted)',fontFamily:'inherit'}}>
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {/* Bannière résultat IA */}
      {aiResults !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--primary-soft)', border: '1px solid rgba(245,167,35,0.4)',
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
        }}>
          <Sparkles size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
              Recherche IA — {aiResults.length} résultat{aiResults.length !== 1 ? 's' : ''}
            </span>
            {aiInterpreted && (
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
                &laquo; {aiInterpreted} &raquo;
              </span>
            )}
          </div>
          <button
            onClick={() => { clearAiSearch(); setSearch('') }}
            className="neo-btn-ghost neo-btn-sm"
            style={{ fontSize: 11 }}
          >
            <X size={12} /> Effacer
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 68, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, opacity: 0.6 }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">{'\uD83D\uDD0D'}</div>
          <div className="neo-empty-title">Aucun candidat trouvé</div>
          <div className="neo-empty-sub">Modifiez vos filtres ou importez de nouveaux candidats</div>
          <button onClick={() => openUpload()} className="neo-btn-yellow" style={{ marginTop: 20 }}>
            <Upload size={15} /> Importer Candidat/s
          </button>
        </div>
      ) : grouped ? (
        /* Grouped */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(([groupKey, items]) => {
            const ids = items.map((c: any) => c.id)
            const allSel = ids.every(id => selectedIds.has(id))
            const someSel = ids.some(id => selectedIds.has(id))
            const isCollapsed = collapsedGroups.has(groupKey)
            return (
              <div key={groupKey}>
                {/* Group header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: '2px solid var(--border)', cursor: 'pointer' }}>
                  {/* Group checkbox */}
                  <div
                    onClick={e => { e.stopPropagation(); toggleSelectGroup(ids) }}
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${someSel ? 'var(--primary)' : 'var(--border)'}`,
                      background: allSel ? 'var(--primary)' : someSel ? 'var(--primary-soft)' : 'var(--surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}
                  >
                    {allSel && <Check size={10} color="#0F172A" strokeWidth={3} />}
                    {someSel && !allSel && <div style={{ width: 8, height: 2, background: 'var(--primary)', borderRadius: 2 }} />}
                  </div>

                  <div
                    onClick={() => toggleGroup(groupKey)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}
                  >
                    {isCollapsed
                      ? <ChevronRight size={15} color="var(--muted)" />
                      : <ChevronDown size={15} color="var(--muted)" />
                    }
                    <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--foreground)' }}>{groupKey}</span>
                    <span className="neo-badge neo-badge-gray">{items.length}</span>
                  </div>
                </div>

                {/* Group cards */}
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((c: any) => renderCard(c))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Flat list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Compteur supprimé — total affiché en haut */}
          {candidatesPagines.map((c: any) => renderCard(c))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-card)', color: page <= 1 ? 'var(--border)' : 'var(--foreground)',
                  fontSize: 13, fontWeight: 600, cursor: page <= 1 ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                ← Précédent
              </button>
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-card)', color: page >= totalPages ? 'var(--border)' : 'var(--foreground)',
                  fontSize: 13, fontWeight: 600, cursor: page >= totalPages ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      )}

      {/* CV Preview Overlay (hover) */}
      {hoveredCv && (
        <div
          onMouseEnter={() => {
            if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
          }}
          onMouseLeave={() => {
            if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
            hoveredCvTimeout.current = setTimeout(() => {
              setHoveredCv(null)
              if (previewZoom < 1) setPreviewZoom(1)
            }, 900)
          }}
          style={{
            position: 'fixed',
            top: 20,
            bottom: 20,
            ...(hoveredCv.x + 680 > (typeof window !== 'undefined' ? window.innerWidth : 1400)
              ? { right: (typeof window !== 'undefined' ? window.innerWidth : 1400) - hoveredCv.x + 12 }
              : { left: hoveredCv.x + 12 }),
            width: 640,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            zIndex: 500,
            pointerEvents: 'auto',
          }}
        >
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--background)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={13} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>Aperçu CV</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setPreviewZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2))) }}
                style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)', fontWeight: 700 }}
                title="Dézoomer"
              >{'\u2212'}</button>
              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 36, textAlign: 'center' }}>{Math.round(previewZoom * 100)}%</span>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setPreviewZoom(z => Math.min(3, +(z + 0.25).toFixed(2))) }}
                style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)', fontWeight: 700 }}
                title="Zoomer"
              >+</button>
              <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation()
                  const r = ((hoveredCv.rotation || 0) + 90) % 360
                  setHoveredCv({ ...hoveredCv, rotation: r })
                }}
                style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Rotation 90°"
              >
                <RotateCw size={12} style={{ color: 'var(--foreground)' }} />
              </button>
            </div>
          </div>
          {/* Content */}
          <div
            ref={previewScrollRef}
            style={{ width: '100%', height: 'calc(100% - 41px)', overflow: 'auto', background: '#F1F5F9', cursor: 'grab' }}
            onMouseEnter={() => { if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current) }}
            onMouseDown={e => {
              const el = previewScrollRef.current; if (!el) return
              previewPanRef.current = { active: true, startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
              el.style.cursor = 'grabbing'
            }}
            onMouseMove={e => {
              const d = previewPanRef.current; const el = previewScrollRef.current
              if (!d.active || !el) return
              el.scrollLeft = d.scrollLeft - (e.clientX - d.startX)
              el.scrollTop = d.scrollTop - (e.clientY - d.startY)
            }}
            onMouseUp={() => { previewPanRef.current.active = false; if (previewScrollRef.current) previewScrollRef.current.style.cursor = 'grab' }}
            onMouseLeave={() => { previewPanRef.current.active = false; if (previewScrollRef.current) previewScrollRef.current.style.cursor = 'grab' }}
          >
            {['jpg', 'jpeg', 'png', 'webp'].includes(hoveredCv.ext) ? (
              <div style={{ width: `${previewZoom * 100}%`, minWidth: '100%', flexShrink: 0, position: 'relative', paddingTop: `${previewZoom * 100}%` }}>
                <div style={{ position: 'absolute', inset: 0, transform: `scale(${previewZoom})`, transformOrigin: 'top left', width: `${100 / previewZoom}%`, height: `${100 / previewZoom}%` }}>
                  <img
                    src={hoveredCv.url}
                    alt="CV"
                    draggable={false}
                    onDragStart={e => e.preventDefault()}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'none', transform: hoveredCv.rotation ? `rotate(${hoveredCv.rotation}deg)` : undefined, transformOrigin: 'center center' }}
                  />
                </div>
              </div>
            ) : hoveredCv.ext === 'pdf' ? (
              <div style={{ width: `${previewZoom * 100}%`, height: `${Math.round(previewZoom * 5000)}px`, minWidth: '100%', minHeight: '100%', position: 'relative', flexShrink: 0 }}>
                  <iframe
                    key={`preview-${previewZoom}`}
                    src={hoveredCv.rotation ? `/api/cv/rotate?rotation=${hoveredCv.rotation}&url=${encodeURIComponent(hoveredCv.url)}#toolbar=0&navpanes=0&zoom=page-width` : `${hoveredCv.url}#toolbar=0&navpanes=0&zoom=page-width`}
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'none' }}
                    title="Aperçu CV"
                  />
              </div>
            ) : ['doc', 'docx'].includes(hoveredCv.ext) ? (
              <div style={{ width: `${previewZoom * 100}%`, height: `${Math.round(previewZoom * 5000)}px`, minWidth: '100%', minHeight: '100%', position: 'relative', flexShrink: 0 }}>
                  <iframe
                    key={`preview-doc-${previewZoom}`}
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(hoveredCv.url)}&embedded=true`}
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'none' }}
                    title="Aperçu CV"
                  />
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                Aperçu non disponible
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div className="neo-card" style={{ maxWidth: 420, width: '90%', padding: 28 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', marginBottom: 8 }}>
              Supprimer {selCount} candidat{selCount > 1 ? 's' : ''} ?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
              Cette action est irréversible. Les candidats et toutes leurs données associées (notes, pipeline) seront définitivement supprimés.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(false)} className="neo-btn-ghost">
                Annuler
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleteBulk.isPending}
                className="neo-btn"
                style={{ background: '#DC2626', boxShadow: 'none' }}
              >
                {deleteBulk.isPending ? 'Suppression...' : `Supprimer (${selCount})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Message */}
      {showMessage && (() => {
        const selected = sorted.filter((c: any) => selectedIds.has(c.id))
        const avecTel   = selected.filter((c: any) => c.telephone)
        const sansTel   = selected.filter((c: any) => !c.telephone)
        const formatted = avecTel.map((c: any) => detectAndFormat(c.telephone).number)
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}>
            <div className="neo-card" style={{ maxWidth: 500, width: '92%', padding: 0, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1.5px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageSquare size={15} color="white" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--foreground)' }}>Envoyer un message</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ouvre l&apos;app Messages sur votre Mac</div>
                  </div>
                </div>
                <button onClick={() => setShowMessage(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Numéros à coller dans Messages
                  </div>
                  <div style={{ position: 'relative' }}>
                    <textarea
                      readOnly
                      value={formatted.join('\n')}
                      rows={Math.min(formatted.length, 5)}
                      style={{
                        width: '100%', padding: '10px 14px', paddingRight: 90,
                        fontSize: 13, fontFamily: 'monospace', fontWeight: 600,
                        border: '1.5px solid var(--border)', borderRadius: 10,
                        resize: 'none', background: '#F8F9FA', color: 'var(--foreground)',
                        outline: 'none', boxSizing: 'border-box', lineHeight: 1.8,
                      }}
                      onFocus={e => e.target.select()}
                    />
                    <button
                      onClick={() => copyNumbers(formatted)}
                      style={{
                        position: 'absolute', right: 8, top: 8,
                        padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                        border: '1.5px solid',
                        borderColor: numCopied ? '#16A34A' : 'var(--border)',
                        background: numCopied ? '#F0FDF4' : 'var(--surface)',
                        color: numCopied ? '#16A34A' : 'var(--foreground)',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                      }}
                    >
                      {numCopied ? '\u2713 Copié' : 'Copier'}
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                    Un numéro par ligne &middot; Ouvrez Messages &rarr; champ <strong>À :</strong> &rarr; <strong>{'\u2318'}V</strong>
                  </p>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Destinataires — {avecTel.length} avec numéro
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    {avecTel.map((c: any) => {
                      const { number, flag, country } = detectAndFormat(c.telephone)
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ width: 30, height: 30, borderRadius: 6, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#64748B', flexShrink: 0 }}>
                            {((c.prenom||'')[0]||'') + ((c.nom||'')[0]||'')}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{c.prenom} {c.nom}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#059669' }}>
                              <Phone size={10} /> {number}
                            </div>
                          </div>
                          {flag && (
                            <span style={{ fontSize: 12, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', fontWeight: 600 }}>
                              {flag} {country}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {sansTel.length > 0 && sansTel.map((c: any) => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FEF9EC', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', opacity: 0.8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--muted)', flexShrink: 0 }}>
                          {((c.prenom||'')[0]||'') + ((c.nom||'')[0]||'')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{c.prenom} {c.nom}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#D97706' }}>
                            <AlertTriangle size={10} /> Pas de numéro — sera ignoré
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Message
                  </div>
                  <textarea
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    placeholder="Bonjour, nous avons une opportunité qui pourrait vous intéresser..."
                    rows={4}
                    style={{
                      width: '100%', padding: '10px 14px', fontSize: 14,
                      border: '1.5px solid var(--border)', borderRadius: 10,
                      resize: 'vertical', fontFamily: 'inherit', color: 'var(--foreground)',
                      background: 'var(--background)', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    {messageText.length} caractères &middot; Le message sera pré-rempli dans l&apos;app Messages
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowMessage(false)} className="neo-btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>
                    Annuler
                  </button>
                  <button
                    onClick={() => openMessages(formatted)}
                    disabled={avecTel.length === 0}
                    className="neo-btn"
                    style={{ flex: 2, justifyContent: 'center', background: '#007AFF', color: 'white', boxShadow: 'none', opacity: avecTel.length === 0 ? 0.4 : 1 }}
                  >
                    <MessageSquare size={14} />
                    Ouvrir Messages
                  </button>
                </div>

                {avecTel.length === 0 && (
                  <p style={{ fontSize: 12, color: '#D97706', textAlign: 'center', margin: 0 }}>
                    Aucun candidat sélectionné n&apos;a de numéro de téléphone.
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Pipeline dropdown (fixed position — bypass overflow clipping) — all mode only */}
      {importStatusFilter === 'traite' && openPipelineId && pipelinePos && (() => {
        const cand = allCandidats.find((x: any) => x.id === openPipelineId)
        if (!cand) return null
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => { setOpenPipelineId(null); setPipelinePos(null) }} />
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'fixed', top: pipelinePos.top, left: pipelinePos.left, zIndex: 999,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
                padding: 4, minWidth: 145,
              }}
            >
              {(Object.entries(ETAPE_LABELS) as [PipelineEtape, string][]).map(([etape, label]) => (
                <button
                  key={etape}
                  onClick={() => {
                    if (cand.statut_pipeline !== etape) {
                      updateStatut.mutate({ id: cand.id, statut: etape })
                    }
                    setOpenPipelineId(null)
                    setPipelinePos(null)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%',
                    padding: '7px 10px', borderRadius: 7, border: 'none',
                    background: cand.statut_pipeline === etape ? 'var(--primary-soft)' : 'transparent',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    color: 'var(--foreground)', fontFamily: 'inherit', textAlign: 'left', gap: 8,
                  }}
                >
                  <span className={ETAPE_BADGE[etape]}>{label}</span>
                  {cand.statut_pipeline === etape && <Check size={11} style={{ marginLeft: 'auto', color: 'var(--primary)' }} />}
                </button>
              ))}
            </div>
          </>
        )
      })()}

      {/* Upload géré globalement via UploadContext + GlobalUploadPanel */}
    </div>
  )
}
