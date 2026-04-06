'use client'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { CvPreviewCanvas } from './CvPreviewCanvas'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Upload, Search, Trash2, ChevronDown, ChevronRight,
  Check, X, SortAsc, Sparkles, Loader2,
  MessageSquare, Phone, AlertTriangle, Eye, MapPin, SlidersHorizontal, Star, RotateCw,
  CheckCircle, Archive, Briefcase, Info, GraduationCap,
} from 'lucide-react'

import { useUpload } from '@/contexts/UploadContext'
import { useCandidats, useDeleteCandidatsBulk, useUpdateStatutCandidat, useUpdateImportStatusBulk, useCandidatsRealtime } from '@/hooks/useCandidats'
import { useQueryClient } from '@tanstack/react-query'
import { useMetiers } from '@/hooks/useMetiers'
import { useMetierCategories } from '@/hooks/useMetierCategories'
import type { PipelineEtape, ImportStatus } from '@/types/database'

// ── Badge rouge : par candidat, persist dans localStorage ──────────────────
// Badge actif si : created_at dans les 30 derniers jours ET fiche jamais ouverte
import { markCandidatVu, markCandidatNonVu, markTousVus, getViewedSet } from '@/lib/badge-candidats'
export { markCandidatVu, markCandidatNonVu, markTousVus, getViewedSet }

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

// ─── Recherche booléenne (ET/AND, OU/OR, SAUF/NOT) ───
function parseBooleanSearch(query: string): ((text: string) => boolean) | null {
  const trimmed = query.trim()
  if (!trimmed) return null

  // Détecter si la requête contient des opérateurs booléens
  const hasBooleanOps = /\b(ET|AND|OU|OR|SAUF|NOT)\b/i.test(trimmed)
  if (!hasBooleanOps) return null

  // Séparer par OU/OR d'abord (priorité la plus basse)
  const orParts = trimmed.split(/\b(?:OU|OR)\b/i).map(s => s.trim()).filter(Boolean)

  return (text: string) => {
    const normalizedText = normalize(text)
    // Au moins un des groupes OU doit matcher
    return orParts.some(orPart => {
      // Dans chaque groupe OU, séparer par SAUF/NOT
      const saufParts = orPart.split(/\b(?:SAUF|NOT)\b/i).map(s => s.trim()).filter(Boolean)
      const mustInclude = saufParts[0] || ''
      const mustExclude = saufParts.slice(1)

      // Séparer les termes "must include" par ET/AND
      const andTerms = mustInclude.split(/\b(?:ET|AND)\b/i).map(s => s.trim()).filter(Boolean)

      // Tous les termes ET doivent être présents
      const allAndMatch = andTerms.every(term => normalizedText.includes(normalize(term)))

      // Aucun terme SAUF ne doit être présent
      const noExcluded = mustExclude.every(term => !normalizedText.includes(normalize(term)))

      return allAndMatch && noExcluded
    })
  }
}

const IMPORT_STATUS_OPTS = [
  { value: 'traite',    label: 'Actif' },
  { value: 'a_traiter', label: 'À traiter' },
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
  const [search, setSearch] = useState('')
  const { metiers } = useMetiers()
  const { categories, getColorForMetier } = useMetierCategories()
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Fermer + sauvegarder sur clic dehors ou ESC — ne garder que les métiers configurés
  const handleClose = useCallback(() => {
    onSave(selected.filter(t => metiers.includes(t)))
    onClose()
  }, [selected, metiers, onSave, onClose])

  useEffect(() => {
    searchRef.current?.focus()
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handleClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [handleClose])

  const toggle = (m: string) =>
    setSelected(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = norm(search.trim())
  const matches = (m: string) => !q || norm(m).includes(q)

  const assignedSet = new Set(categories.flatMap(c => c.metiers))
  const unassigned = metiers.filter(m => !assignedSet.has(m))

  const renderMetierItem = (m: string) => {
    if (!matches(m)) return null
    const color = getColorForMetier(m) || '#3B82F6'
    return (
      <label key={m} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
        background: selected.includes(m) ? `${color}14` : 'transparent',
        fontSize: 12, fontWeight: selected.includes(m) ? 600 : 400,
      }}>
        <input
          type="checkbox"
          checked={selected.includes(m)}
          onChange={() => { toggle(m); setSearch(''); searchRef.current?.focus() }}
          style={{ accentColor: color }}
        />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {m}
      </label>
    )
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 100,
      background: 'var(--card)', borderRadius: 10, padding: 10,
      boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      border: '1px solid var(--border)', minWidth: 230,
    }}
      onClick={e => e.stopPropagation()}
    >
      {/* Barre de recherche */}
      <input
        ref={searchRef}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher un métier…"
        style={{
          width: '100%', padding: '5px 8px', fontSize: 12, borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--secondary)',
          color: 'var(--foreground)', outline: 'none', fontFamily: 'inherit',
          marginBottom: 6, boxSizing: 'border-box',
        }}
      />
      {metiers.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          Aucun métier configuré.<br />Allez dans Paramètres pour en ajouter.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflowY: 'auto' }}>
          {/* Sélectionnés tout en haut (si pas de recherche active) */}
          {!q && selected.filter(m => metiers.includes(m)).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary, #F5A623)', margin: '0 0 2px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Sélectionnés
              </div>
              {selected.filter(m => metiers.includes(m)).map(renderMetierItem)}
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            </div>
          )}
          {/* Toutes les catégories */}
          {categories.map(cat => {
            const catMetiers = cat.metiers
              .filter(m => metiers.includes(m) && (!q || matches(m)) && (q || !selected.includes(m)))
              .sort((a, b) => a.localeCompare(b, 'fr'))
            if (catMetiers.length === 0) return null
            return (
              <div key={cat.name}>
                <div style={{ fontSize: 10, fontWeight: 700, color: cat.color, margin: '6px 0 2px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {cat.name}
                </div>
                {catMetiers.map(renderMetierItem)}
              </div>
            )
          })}
          {unassigned.filter(m => !selected.includes(m) && matches(m)).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', margin: '6px 0 2px 8px', textTransform: 'uppercase' }}>Autres</div>
              {unassigned.filter(m => !selected.includes(m) && matches(m)).sort((a, b) => a.localeCompare(b, 'fr')).map(renderMetierItem)}
            </div>
          )}
          {q && metiers.filter(matches).length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 8px' }}>Aucun résultat</p>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button onClick={handleClose} style={{
          padding: '4px 10px', fontSize: 11, borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
        }}>Fermer</button>
      </div>
    </div>
  )
}

export default function CandidatsList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { openUpload } = useUpload()
  useCandidatsRealtime() // Sync temps réel — changements d'un autre utilisateur se reflètent automatiquement

  // Helper pour restaurer les filtres depuis sessionStorage (clé unique candidats_filters)
  const FILTERS_KEY = 'candidats_filters'
  const getFiltersFromStorage = (): Record<string, any> => {
    try { return JSON.parse(sessionStorage.getItem(FILTERS_KEY) || '{}') } catch { return {} }
  }
  const ssGet = (key: string, fallback: any = '') => {
    try {
      const all = getFiltersFromStorage()
      return key in all ? all[key] : fallback
    } catch { return fallback }
  }
  const ssSet = (key: string, val: any) => {
    try {
      const all = getFiltersFromStorage()
      all[key] = val
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify(all))
    } catch {}
  }

  const [importStatusFilter, setImportStatusFilter] = useState<string>(() => ssGet('importStatus', 'a_traiter'))
  const [filterNonVu, setFilterNonVu] = useState(() => sessionStorage.getItem('candidats_filter_nonvu') === '1')

  const { metiers: agenceMetiers } = useMetiers()
  const { categories: metierCategories, getColorForMetier } = useMetierCategories()
  const [filtreMetier, setFiltreMetier]   = useState<string>(() => ssGet('filtreMetier', ''))
  const [metierDropdownOpen, setMetierDropdownOpen] = useState(false)
  const metierDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!metierDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (metierDropdownRef.current && !metierDropdownRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-metier-trigger]')) setMetierDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [metierDropdownOpen])
  const [search, setSearch]               = useState(() => ssGet('search', ''))
  const [filtreStatut, setFiltreStatut]   = useState<PipelineEtape | 'tous'>(() => {
    const s = searchParams.get('statut')
    return (s && ['nouveau','contacte','entretien','place','refuse'].includes(s) ? s : 'tous') as PipelineEtape | 'tous'
  })
  const [filtreLocalisation, setFiltreLocalisation] = useState(() => ssGet('filtreLocalisation', ''))

  const [sortBy, setSortBy]               = useState<'date_desc' | 'date_asc' | 'nom_az' | 'titre_az'>(() => ssGet('sort', 'date_desc'))
  const [groupByMetier, setGroupByMetier] = useState(false)
  const [groupByLieu, setGroupByLieu]     = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [badgeTick, setBadgeTick]         = useState(0) // forcer re-render quand badges changent
  const [nonVusTotal, setNonVusTotal]     = useState(0) // total non-vus tous pages confondus

  // Écouter l'événement global de changement de badges (ouverture fiche, marquer vu, etc.)
  useEffect(() => {
    const handler = () => setBadgeTick(t => t + 1)
    window.addEventListener('talentflow:badges-changed', handler)
    return () => window.removeEventListener('talentflow:badges-changed', handler)
  }, [])

  // Calculer le total "non vus" réel depuis l'API (tous les candidats, pas juste la page)
  useEffect(() => {
    fetch(`/api/candidats/count-new?t=${Date.now()}`)
      .then(r => r.json())
      .then(({ ids }: { ids: string[] }) => {
        const vs = getViewedSet()
        setNonVusTotal(ids.filter((id: string) => !vs.has(id)).length)
      })
      .catch(() => {})
  }, [badgeTick])
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
  const [filterStarsMin, setFilterStarsMin] = useState<number | ''>(() => ssGet('fStarsMin', ''))
  const [filterCfc, setFilterCfc] = useState<boolean | null>(() => ssGet('fCfc', null))
  const [filterEngage, setFilterEngage] = useState<boolean | null>(() => ssGet('fEngage', null))
  const [showBooleanHelp, setShowBooleanHelp] = useState(false)

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
  useEffect(() => { ssSet('fStarsMin', filterStarsMin) }, [filterStarsMin])
  useEffect(() => { ssSet('fCfc', filterCfc) }, [filterCfc])
  useEffect(() => { ssSet('fEngage', filterEngage) }, [filterEngage])

  // CV hover preview — always mounted, show/hide via CSS for instant open/close
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewData, setPreviewData] = useState<{ url: string; ext: string; x: number; y: number; rotation: number; panelW: number } | null>(null)
  const [metierPopoverId, setMetierPopoverId] = useState<string | null>(null)
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null)
  const hoveredCvTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const prevHoveredCvUrl = useRef<string | null>(null)
  const previewPanRef = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 })
  const previewScrollRef = useRef<HTMLDivElement>(null)
  // Keep hoveredCv as alias for backward compat in JSX
  const hoveredCv = previewData
  useEffect(() => {
    if (!previewData) prevHoveredCvUrl.current = null
    else prevHoveredCvUrl.current = previewData.url
  }, [previewData])


  // Persist search, filtreMetier, filtreLocalisation in sessionStorage (consolidated key)
  useEffect(() => { ssSet('search', search) }, [search])
  useEffect(() => { ssSet('filtreMetier', filtreMetier) }, [filtreMetier])
  useEffect(() => { ssSet('filtreLocalisation', filtreLocalisation) }, [filtreLocalisation])

  // Pipeline dropdown inline (only used in 'all' mode)
  const [openPipelineId, setOpenPipelineId] = useState<string | null>(null)
  const [pipelinePos, setPipelinePos] = useState<{ top: number; left: number } | null>(null)
  const [perPage, setPerPage] = useState<number>(() => ssGet('perPage', 20))

  // Persist import status filter (consolidated key)
  useEffect(() => { ssSet('importStatus', importStatusFilter) }, [importStatusFilter])

  // Debounced search pour ne pas spammer l'API
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const [page, setPage] = useState<number>(() => ssGet('page', 1))
  // Persist page + perPage
  useEffect(() => { ssSet('page', page) }, [page])
  useEffect(() => { ssSet('perPage', perPage) }, [perPage])
  // Détecter la recherche booléenne
  const hasBooleanSearch = /\b(ET|AND|OU|OR|SAUF|NOT)\b/i.test(debouncedSearch)

  // Reset page + sélection quand les filtres changent (skip au premier render)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setPage(1)
    setSelectedIds(new Set())
  }, [debouncedSearch, filtreStatut, importStatusFilter, sortBy, perPage, filterGenre, filterAgeMin, filterAgeMax, filterLangue, filterPermis, filterLieu, filterMetier, filterNonVu, filterCfc, filterEngage])

  // Si filtre âge ou recherche booléenne → fetch tout (client-side)
  // CFC et Déjà engagé sont désormais filtrés côté serveur
  const ageFilterActive = filterAgeMin !== '' || filterAgeMax !== ''
  const clientSideFilter = ageFilterActive || filterNonVu || hasBooleanSearch
  const { data: candidatsData, isLoading, isFetching } = useCandidats({
    statut: filtreStatut === 'tous' ? undefined : filtreStatut,
    import_status: importStatusFilter as ImportStatus,
    // Recherche booléenne → pas de search serveur (géré côté client)
    search: hasBooleanSearch ? undefined : (debouncedSearch || undefined),
    page: clientSideFilter ? 1 : page,
    per_page: clientSideFilter ? 0 : perPage, // 0 = fetch all (max 10000)
    sort: sortBy,
    genre: filterGenre || undefined,
    langue: filterLangue || undefined,
    permis: filterPermis,
    lieu: filterLieu || undefined,
    metier: filterMetier || undefined,
    cfc: filterCfc === true ? 'true' : undefined,
    engage: filterEngage === true ? 'true' : undefined,
  })
  const allCandidats = candidatsData?.candidats || []
  const totalCandidatsRaw = candidatsData?.total ?? allCandidats.length
  const deleteBulk   = useDeleteCandidatsBulk()
  const updateStatut = useUpdateStatutCandidat()
  const updateImportStatus = useUpdateImportStatusBulk()

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

    // Filtre étoiles minimum
    if (filterStarsMin !== '') {
      filtered = filtered.filter(c => (c.rating || 0) >= filterStarsMin)
    }

    // Recherche booléenne côté client (ET/OU/SAUF)
    const booleanMatcher = parseBooleanSearch(search)
    if (booleanMatcher) {
      filtered = filtered.filter(c => {
        const searchable = [c.prenom, c.nom, c.titre_poste, c.email, c.localisation, c.formation, c.notes, ...(c.competences || []), ...(c.tags || [])].filter(Boolean).join(' ')
        return booleanMatcher(searchable)
      })
    }

    return filtered
  }, [allCandidats, aiResults, filtreLocalisation, filtreMetier, filterExpMin, filterAgeMin, filterAgeMax, filterStarsMin, search])

  const activeFiltersCount = [
    filterMetier !== '',
    filterLieu !== '',
    filterAgeMin !== '',
    filterAgeMax !== '',
    filterLangue !== '',
    filterPermis !== null,
    filterGenre !== '',
    filterStarsMin !== '',
    filterExpMin !== '',
    filterCfc !== null,
    filterEngage !== null,
    filtreLocalisation !== '',
    filtreMetier !== '',
  ].filter(Boolean).length

  const resetFiltersOnly = () => {
    setFiltreStatut('tous')
    setImportStatusFilter('a_traiter')
    setFilterMetier(''); setFilterLieu(''); setFilterAgeMin(''); setFilterAgeMax('')
    setFilterLangue(''); setFilterPermis(null); setFilterGenre(''); setFilterStarsMin('')
    setFilterExpMin(''); setFilterCfc(null); setFilterEngage(null)
    setFiltreMetier(''); setFiltreLocalisation('')
    setFilterNonVu(false)
  }

  const resetAllFilters = () => {
    setSearch(''); ssSet('search', '')
    resetFiltersOnly()
  }

  // Tri côté serveur — seul le tri par distance reste côté client
  const sorted = useMemo(() => {
    let result = candidatsFiltres
    // Filtre "non vu" — client-side
    if (filterNonVu) {
      const vs = getViewedSet()
      const seuil = 30 * 24 * 60 * 60 * 1000
      const n = Date.now()
      result = result.filter((c: any) => !vs.has(c.id) && c.created_at && n - new Date(c.created_at).getTime() < seuil)
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatsFiltres, sortBy, filterNonVu, badgeTick])

  // Pagination : client-side quand filtre âge ou "non vus" actif, sinon serveur
  const candidatesTries = sorted
  const clientPaginated = clientSideFilter
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

  const openMessages = async (formatted: string[]) => {
    if (formatted.length === 0) return
    const body = encodeURIComponent(messageText || '')

    // Copier les numéros dans le presse-papier (un par ligne)
    // L'utilisateur colle dans le champ "À :" de iMessage → ajoute tous les destinataires
    await navigator.clipboard.writeText(formatted.join('\n'))
    setNumCopied(true)
    setTimeout(() => setNumCopied(false), 3000)

    // Ouvrir Messages avec le message pré-rempli (sans numéros dans l'URL)
    // Les numéros sont dans le presse-papier → Cmd+V dans le champ "À :"
    window.open(`sms:${formatted.length === 1 ? formatted[0] : ''}${body ? `${formatted.length === 1 ? '?' : ''}body=${body}` : ''}`, '_self')
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
      // Persiste l'état du filtre "non vus" pour le restaurer en revenant
      sessionStorage.setItem('candidats_filter_nonvu', filterNonVu ? '1' : '0')
      // NE PAS marquer vu ici → la fiche le fait sur son useEffect, évite la disparition visuelle
      router.push(`/candidats/${id}`)
    }
  }

  // Prefetch des données candidat au survol pour accélérer l'ouverture
  const handleCardHover = (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ['candidat', id],
      queryFn: async () => {
        const res = await fetch(`/api/candidats/${id}`)
        if (!res.ok) throw new Error('Candidat introuvable')
        const { candidat } = await res.json()
        return candidat
      },
      staleTime: 60_000,
    })
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

  // badgeTick force la re-lecture du localStorage à chaque changement de badge
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void badgeTick
  const viewedSet = getViewedSet()
  const now = Date.now()
  const SEUIL_MS = 30 * 24 * 60 * 60 * 1000

  // Compter les badges actifs (pour le bouton "Tout marquer vu")
  const badgeCount = useMemo(() => {
    return sorted.filter(c =>
      !viewedSet.has(c.id) &&
      c.created_at &&
      now - new Date(c.created_at).getTime() < SEUIL_MS
    ).length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, badgeTick])

  const renderCard = (c: any) => {
    const selected = selectedIds.has(c.id)
    const age = calculerAge(c.date_naissance)
    const hasCv = !!c.cv_url
    const cvExt = (c.cv_nom_fichier || '').toLowerCase().split('.').pop() || ''
    // Badge rouge si : créé dans les 30 derniers jours ET fiche jamais ouverte
    const isNewCandidat = !viewedSet.has(c.id) && !!c.created_at && now - new Date(c.created_at).getTime() < SEUIL_MS

    return (
      <div
        key={c.id}
        onClick={() => handleCardClick(c.id)}
        onMouseEnter={() => handleCardHover(c.id)}
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
            {/* En mode à-traiter, lieu + âge sur la même ligne sous le titre */}
            {importStatusFilter === 'a_traiter' ? (
              <>
                {c.localisation && (
                  <span style={{ fontSize: 13, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {'\uD83D\uDCCD'} {c.localisation}
                  </span>
                )}
                {age !== null && (
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                    · {age} ans
                  </span>
                )}
              </>
            ) : (
              <>
                {c.localisation && (
                  <span style={{ fontSize: 14, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {'\uD83D\uDCCD'} {c.localisation}
                  </span>
                )}
                {/* Badges CFC + Engagée (hors à-traiter) — uniquement basé sur le champ DB */}
                {c.cfc === true && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#DCFCE7', color: '#15803D', letterSpacing: '0.03em' }}>CFC</span>
                )}
                {c.deja_engage === true && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#DCFCE7', color: '#15803D', letterSpacing: '0.03em' }}>Engagé</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Étoiles : interactives en à-traiter, lecture seule sinon */}
        {importStatusFilter === 'a_traiter' ? (
          <div
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', gap: 2, flexShrink: 0 }}
          >
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={async e => {
                  e.stopPropagation()
                  const newRating = c.rating === star ? null : star
                  queryClient.setQueriesData({ queryKey: ['candidats'] }, (old: any) =>
                    old?.candidats
                      ? { ...old, candidats: old.candidats.map((x: any) => x.id === c.id ? { ...x, rating: newRating } : x) }
                      : old
                  )
                  try {
                    await fetch(`/api/candidats/${c.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rating: newRating }),
                    })
                  } catch {
                    queryClient.invalidateQueries({ queryKey: ['candidats'] })
                  }
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, flexShrink: 0 }}
                title={`${star} étoile${star > 1 ? 's' : ''}`}
              >
                <Star size={15} color="#EAB308" fill={star <= (c.rating || 0) ? '#EAB308' : 'none'} />
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Star rating lecture seule */}
            {c.rating > 0 && (
              <div className="clist-stars" style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <Star key={star} size={13} color="#EAB308" fill={star <= c.rating ? '#EAB308' : 'none'} />
                ))}
              </div>
            )}
            {/* Âge (calculé depuis date_naissance) */}
            {age !== null && (
              <span className="clist-age" style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', flexShrink: 0, background: 'var(--secondary)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                {age} ans
              </span>
            )}
          </>
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
                const screenW = window.innerWidth
                const spaceRight = screenW - rect.right - 24
                const spaceLeft  = rect.right - 24
                const panelW = Math.min(820, Math.max(480, Math.max(spaceRight, spaceLeft)) - 8)
                // A4 portrait PDF native render ≈ 816px — calc initial zoom to fit panel
                const initZoom = Math.min(1, +(panelW / 840).toFixed(2))
                setPreviewData({ url: c.cv_url, ext: cvExt, x: rect.right, y: rect.top, rotation, panelW })
                setPreviewZoom(initZoom)
                setPreviewVisible(true)
              }, 120)
            }}
            onMouseLeave={() => {
              if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
              hoveredCvTimeout.current = setTimeout(() => setPreviewVisible(false), 200)
            }}
            className="clist-cv-btn"
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

        {/* Badge note avec tooltip hover */}
        {c.notes_candidat && c.notes_candidat.length > 0 && (() => {
          const lastNote = [...c.notes_candidat].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
          return (
            <div
              style={{ position: 'relative', flexShrink: 0 }}
              onMouseEnter={e => { e.stopPropagation(); setHoveredNoteId(c.id) }}
              onMouseLeave={() => setHoveredNoteId(null)}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 7,
                border: '1px solid rgba(99,102,241,0.3)',
                background: 'rgba(99,102,241,0.08)',
                cursor: 'default', fontSize: 11, fontWeight: 700,
                color: '#6366F1',
              }}>
                <MessageSquare size={11} />
                {c.notes_candidat.length}
              </div>
              {hoveredNoteId === c.id && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: 12, width: 260,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                zIndex: 9999, pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                  Dernière note · {new Date(lastNote.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </div>
                <p style={{ fontSize: 12, color: 'var(--foreground)', whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {lastNote.contenu}
                </p>
                {c.notes_candidat.length > 1 && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>+ {c.notes_candidat.length - 1} autre{c.notes_candidat.length > 2 ? 's' : ''} note{c.notes_candidat.length > 2 ? 's' : ''}</div>
                )}
              </div>
              )}
            </div>
          )
        })()}

        {/* Toggles CFC + Engagée (a_traiter mode only) */}
        {importStatusFilter === 'a_traiter' && (
          <>
            <button
              onClick={async e => {
                e.stopPropagation()
                const newVal = !c.cfc
                queryClient.setQueriesData({ queryKey: ['candidats'] }, (old: any) =>
                  old?.candidats
                    ? { ...old, candidats: old.candidats.map((x: any) => x.id === c.id ? { ...x, cfc: newVal } : x) }
                    : old
                )
                try {
                  const res = await fetch(`/api/candidats/${c.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cfc: newVal }),
                  })
                  if (!res.ok) throw new Error()
                } catch {
                  queryClient.invalidateQueries({ queryKey: ['candidats'] })
                }
              }}
              title={c.cfc ? 'CFC — désactiver' : 'CFC — activer'}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 100, fontSize: 10, fontWeight: 800,
                border: `1.5px solid ${c.cfc ? '#22C55E' : 'var(--border)'}`,
                background: c.cfc ? 'rgba(34,197,94,0.12)' : 'transparent',
                color: c.cfc ? '#15803D' : 'var(--muted)',
                cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              <GraduationCap size={10} />
              CFC
            </button>
            <button
              onClick={async e => {
                e.stopPropagation()
                const newVal = !c.deja_engage
                queryClient.setQueriesData({ queryKey: ['candidats'] }, (old: any) =>
                  old?.candidats
                    ? { ...old, candidats: old.candidats.map((x: any) => x.id === c.id ? { ...x, deja_engage: newVal } : x) }
                    : old
                )
                try {
                  const res = await fetch(`/api/candidats/${c.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deja_engage: newVal }),
                  })
                  if (!res.ok) throw new Error()
                } catch {
                  queryClient.invalidateQueries({ queryKey: ['candidats'] })
                }
              }}
              title={c.deja_engage ? 'Engagé — désactiver' : 'Engagé — activer'}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 100, fontSize: 10, fontWeight: 800,
                border: `1.5px solid ${c.deja_engage ? '#22C55E' : 'var(--border)'}`,
                background: c.deja_engage ? 'rgba(34,197,94,0.12)' : 'transparent',
                color: c.deja_engage ? '#15803D' : 'var(--muted)',
                cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              <Briefcase size={10} />
              Engagé
            </button>
          </>
        )}

        {/* Métier — pastille colorée selon catégorie si assigné, bouton discret sinon */}
        {(() => {
          const configuredTags = (c.tags || []).filter((t: string) => agenceMetiers.includes(t))
          const hasTags = configuredTags.length > 0
          const tagColor = hasTags ? (getColorForMetier(configuredTags[0]) || '#3B82F6') : '#3B82F6'
          return (
            <div onClick={e => e.stopPropagation()} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={e => { e.stopPropagation(); setMetierPopoverId(metierPopoverId === c.id ? null : c.id) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 9px', borderRadius: 100,
                  border: hasTags ? 'none' : '1px dashed var(--border)',
                  background: hasTags ? `${tagColor}18` : 'transparent',
                  cursor: 'pointer', fontSize: 10, fontWeight: hasTags ? 700 : 600,
                  color: hasTags ? tagColor : 'var(--muted)',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  opacity: hasTags ? 1 : 0.6,
                }}
                title={hasTags ? 'Modifier les métiers' : 'Assigner un métier'}
              >
                <Briefcase size={10} />
                {hasTags ? (configuredTags[0] + (configuredTags.length > 1 ? ` +${configuredTags.length - 1}` : '')) : 'Métier'}
              </button>
              {metierPopoverId === c.id && (
                <MetierPopover
                  candidatId={c.id}
                  currentTags={c.tags || []}
                  onClose={() => setMetierPopoverId(null)}
                  onSave={async (tags) => {
                    // Mise à jour optimiste — structure { candidats: [...], total, ... }
                    queryClient.setQueriesData({ queryKey: ['candidats'] }, (old: any) =>
                      old?.candidats
                        ? { ...old, candidats: old.candidats.map((x: any) => x.id === c.id ? { ...x, tags } : x) }
                        : old
                    )
                    const { createClient } = await import('@/lib/supabase/client')
                    const supabase = createClient()
                    const { error } = await supabase.from('candidats').update({ tags }).eq('id', c.id)
                    if (error) queryClient.invalidateQueries({ queryKey: ['candidats'] })
                  }}
                />
              )}
            </div>
          )
        })()}

        {/* Date d'ajout — toujours created_at (modifiable manuellement) */}
        <span className="clist-date" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500 }}>
          {new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        {/* Quick validate button (a_traiter mode only) — après la date */}
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
          {(search || activeFiltersCount > 0 || filtreStatut !== 'tous' || filterNonVu) && (
            <button onClick={resetAllFilters} className="neo-btn-ghost" style={{ fontSize: 13, gap: 6 }}>
              <X size={14} /> Nouvelle recherche
            </button>
          )}
          {/* Filtre "Non vus" */}
          {nonVusTotal > 0 && (
            <button
              onClick={() => { setFilterNonVu(v => !v); setPage(1) }}
              className="neo-btn-ghost"
              style={{
                fontSize: 13, gap: 6,
                borderColor: filterNonVu ? '#EF4444' : undefined,
                color: filterNonVu ? '#EF4444' : undefined,
                background: filterNonVu ? 'rgba(239,68,68,0.06)' : undefined,
              }}
              title="Voir uniquement les profils non consultés"
            >
              <Eye size={14} />
              {filterNonVu ? 'Tous les profils' : 'Non vus'}
              <span style={{
                background: '#EF4444', color: 'white', borderRadius: 100,
                fontSize: 10, fontWeight: 800, padding: '1px 6px', lineHeight: 1.4,
              }}>
                {nonVusTotal}
              </span>
            </button>
          )}
          {/* Tout marquer vu — marque TOUS les récents (pas juste la page visible) */}
          {nonVusTotal > 0 && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/candidats/count-new?t=${Date.now()}`)
                  const { ids } = await res.json() as { ids: string[] }
                  markTousVus(ids)
                  setNonVusTotal(0)
                  if (filterNonVu) setFilterNonVu(false)
                } catch {
                  // Fallback : marquer ceux avec badge sur la page courante
                  const vs = getViewedSet()
                  const n = Date.now()
                  const seuil = 30 * 24 * 60 * 60 * 1000
                  const idsAvecBadge = sorted
                    .filter((c: any) => !vs.has(c.id) && c.created_at && n - new Date(c.created_at).getTime() < seuil)
                    .map((c: any) => c.id)
                  markTousVus(idsAvecBadge)
                } finally {
                  // Persister cross-device dans Supabase user metadata
                  fetch('/api/candidats/mark-all-vu', { method: 'POST' }).catch(() => {})
                }
              }}
              className="neo-btn-ghost"
              style={{ fontSize: 13, gap: 6 }}
              title="Marquer tous les nouveaux candidats comme vus"
            >
              <CheckCircle size={14} />
              Tout marquer vu
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
          <button onClick={selectAll} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 12.5,
            background: '#F59E0B', color: '#fff', border: 'none',
            fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
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
          {/* Marquer vu / non vu — toujours disponible */}
          <button
            onClick={() => { markTousVus(Array.from(selectedIds)); setSelectedIds(new Set()) }}
            className="neo-btn neo-btn-sm"
            style={{ background: '#10B981', color: 'white', boxShadow: 'none' }}
          >
            <Eye size={13} /> Marquer vu ({selCount})
          </button>
          <button
            onClick={() => { Array.from(selectedIds).forEach(id => markCandidatNonVu(id)); setSelectedIds(new Set()) }}
            className="neo-btn neo-btn-sm"
            style={{ background: '#F59E0B', color: 'white', boxShadow: 'none' }}
          >
            <Eye size={13} /> Marquer non vu ({selCount})
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

      {/* Search bar — pleine largeur */}
      <div style={{ position: 'relative', marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--muted)' }} />
            <input
              className="neo-input-soft"
              style={{ paddingLeft: 38, paddingRight: (search || aiResults !== null) ? 32 : 12, width: '100%', height: 42, fontSize: 14 }}
              placeholder="Nom, métier, compétence, contenu du CV..."
              value={search}
              onChange={e => { setSearch(e.target.value); if (aiResults !== null) clearAiSearch() }}
              onKeyDown={e => { if (e.key === 'Enter' && search.trim()) handleAiSearch() }}
            />
            {(search || aiResults !== null) && (
              <button
                onClick={() => { clearAiSearch(); setSearch(''); ssSet('search', '') }}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
          {/* Aide recherche booléenne */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowBooleanHelp(v => !v)}
              style={{
                background: showBooleanHelp ? 'var(--primary)' : 'none', border: '1px solid var(--border)',
                borderRadius: '50%', width: 26, height: 26, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: showBooleanHelp ? 'var(--foreground)' : 'var(--muted)', flexShrink: 0, transition: 'all 0.15s',
              }}
              title="Aide recherche avancée"
            >
              <Info size={14} />
            </button>
            {showBooleanHelp && (
              <div style={{
                position: 'absolute', top: '110%', right: 0, zIndex: 200,
                background: 'var(--card)', borderRadius: 12, padding: 16,
                boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
                border: '1px solid var(--border)', width: 340,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--foreground)', marginBottom: 10 }}>
                  Recherche avancée
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
                  Utilisez des opérateurs pour affiner votre recherche :
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 2 }}>ET / AND</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Les deux termes doivent être présents</div>
                    <code style={{ fontSize: 11, color: 'var(--foreground)', background: '#E2E8F0', padding: '2px 6px', borderRadius: 4 }}>Électricien ET Genève</code>
                  </div>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', marginBottom: 2 }}>OU / OR</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>L&apos;un ou l&apos;autre terme</div>
                    <code style={{ fontSize: 11, color: 'var(--foreground)', background: '#E2E8F0', padding: '2px 6px', borderRadius: 4 }}>Soudeur OU Tuyauteur</code>
                  </div>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 2 }}>SAUF / NOT</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Exclure un terme</div>
                    <code style={{ fontSize: 11, color: 'var(--foreground)', background: '#E2E8F0', padding: '2px 6px', borderRadius: 4 }}>Maçon SAUF intérimaire</code>
                  </div>
                </div>
                <button
                  onClick={() => setShowBooleanHelp(false)}
                  style={{
                    marginTop: 12, width: '100%', padding: '6px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--muted)',
                  }}
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Filtre métier — dropdown custom avec couleurs catégorie */}
        {agenceMetiers.length > 0 && (() => {
          const assigned = new Set(metierCategories.flatMap(c => c.metiers))
          const unassigned = agenceMetiers.filter(m => !assigned.has(m))
          return (
            <div style={{ position: 'relative' }}>
              <button
                data-metier-trigger
                onClick={() => setMetierDropdownOpen(!metierDropdownOpen)}
                className="neo-input-soft"
                style={{
                  height: 38, fontSize: 13, paddingLeft: 10, paddingRight: 28, minWidth: 140,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
                  color: filtreMetier ? 'var(--foreground)' : 'var(--muted)', fontWeight: filtreMetier ? 600 : 400,
                  background: filtreMetier ? getColorForMetier(filtreMetier) + '18' : undefined,
                  borderColor: filtreMetier ? getColorForMetier(filtreMetier) + '60' : undefined,
                }}
              >
                {filtreMetier && <span style={{ width: 8, height: 8, borderRadius: '50%', background: getColorForMetier(filtreMetier), flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {filtreMetier || 'Tous les métiers'}
                </span>
                <ChevronDown size={13} style={{ position: 'absolute', right: 8, color: 'var(--muted)' }} />
              </button>
              {metierDropdownOpen && (
                <div
                  ref={metierDropdownRef}
                  style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.15)', width: 280, maxHeight: 400,
                    overflowY: 'auto', padding: '6px 0',
                  }}
                >
                  <button
                    onClick={() => { setFiltreMetier(''); setMetierDropdownOpen(false) }}
                    style={{
                      width: '100%', padding: '8px 14px', border: 'none', background: !filtreMetier ? 'var(--surface)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: !filtreMetier ? 700 : 400,
                      color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {!filtreMetier && <Check size={13} />} Tous les métiers
                  </button>
                  {metierCategories.map(cat => {
                    const catMetiers = cat.metiers.filter(m => agenceMetiers.includes(m))
                    if (catMetiers.length === 0) return null
                    return (
                      <div key={cat.name}>
                        <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, color: cat.color, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color }} />
                          {cat.name}
                        </div>
                        {catMetiers.map(m => (
                          <button
                            key={m}
                            onClick={() => { setFiltreMetier(m); setMetierDropdownOpen(false) }}
                            style={{
                              width: '100%', padding: '6px 14px 6px 28px', border: 'none',
                              background: filtreMetier === m ? cat.color + '15' : 'transparent',
                              cursor: 'pointer', textAlign: 'left', fontSize: 13,
                              fontWeight: filtreMetier === m ? 600 : 400,
                              color: filtreMetier === m ? cat.color : 'var(--foreground)',
                            }}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                  {unassigned.length > 0 && (
                    <div>
                      <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Autres</div>
                      {unassigned.map(m => (
                        <button
                          key={m}
                          onClick={() => { setFiltreMetier(m); setMetierDropdownOpen(false) }}
                          style={{
                            width: '100%', padding: '6px 14px 6px 28px', border: 'none',
                            background: filtreMetier === m ? 'var(--surface)' : 'transparent',
                            cursor: 'pointer', textAlign: 'left', fontSize: 13,
                            fontWeight: filtreMetier === m ? 600 : 400, color: 'var(--foreground)',
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* Statut import — onglets (pas un filtre) */}
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {IMPORT_STATUS_OPTS.map(o => {
            const active = importStatusFilter === o.value
            const colors: Record<string, { bg: string; color: string; activeBg: string }> = {
              traite:    { bg: 'transparent', color: 'var(--muted)', activeBg: '#059669' },
              a_traiter: { bg: 'transparent', color: 'var(--muted)', activeBg: '#D97706' },
              archive:   { bg: 'transparent', color: 'var(--muted)', activeBg: '#6B7280' },
            }
            const c = colors[o.value] || colors.traite
            return (
              <button
                key={o.value}
                onClick={() => setImportStatusFilter(o.value)}
                style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: 'none', borderRight: '1px solid var(--border)',
                  background: active ? c.activeBg : c.bg,
                  color: active ? 'white' : c.color,
                  transition: 'all 0.15s',
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>

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

        {/* Group by lieu */}
        <button
          onClick={() => {
            const newVal = !groupByLieu
            setGroupByLieu(newVal)
            if (newVal) setGroupByMetier(false)
            setCollapsedGroups(new Set())
          }}
          className={groupByLieu ? 'neo-btn neo-btn-sm' : 'neo-btn-ghost neo-btn-sm'}
          style={groupByLieu ? { background: 'var(--primary)', color: 'var(--ink, #1C1A14)' } : {}}
        >
          <MapPin size={13} /> Par lieu
        </button>

        {/* Filtres avancés button */}
        <button onClick={() => setShowAdvancedFilters((v: boolean) => !v)} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:showAdvancedFilters?'var(--primary)':'var(--bg-card)',color:showAdvancedFilters?'white':'var(--text)',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
          <SlidersHorizontal size={14} />
          Filtres avancés
          {activeFiltersCount > 0 && <span style={{background:'#EF4444',color:'white',borderRadius:10,padding:'1px 6px',fontSize:11}}>{activeFiltersCount}</span>}
        </button>

        {/* Reset all filters */}
        {(activeFiltersCount > 0 || filtreStatut !== 'tous' || filterNonVu) && (
          <button
            onClick={resetFiltersOnly}
            title="Réinitialiser tous les filtres"
            style={{display:'flex',alignItems:'center',gap:5,padding:'8px 12px',borderRadius:8,border:'1px solid #FCA5A5',background:'#FEF2F2',color:'#DC2626',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}
          >
            <X size={13} /> Tout effacer
          </button>
        )}

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
          {totalPages > 1 && (
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginLeft: 8 }}>
              Page {page} / {totalPages}
            </span>
          )}
        </div>
      </div>

      {/* Advanced filters panel */}
      {showAdvancedFilters && (
        <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:16,marginBottom:12,display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))',gap:12}}>
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>LIEU</label>
            <input value={filterLieu} onChange={e=>setFilterLieu(e.target.value)} placeholder="Ex: Genève, Lausanne..." style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}} />
          </div>

          {/* ÂGE — dual-handle range slider */}
          <div style={{gridColumn:'span 2'}}>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>
              ÂGE &nbsp;
              <span style={{fontWeight:700,color:'var(--text)'}}>
                {filterAgeMin !== '' || filterAgeMax !== ''
                  ? `${filterAgeMin !== '' ? filterAgeMin : 18} – ${filterAgeMax !== '' ? filterAgeMax : 65} ans`
                  : 'Tous âges'}
              </span>
            </label>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:11,color:'var(--muted)',minWidth:20,textAlign:'center'}}>18</span>
              <div className="dual-range" style={{flex:1}}>
                <div className="dual-range-track" />
                <div className="dual-range-fill" style={{
                  left:`${((Number(filterAgeMin)||18)-18)/(65-18)*100}%`,
                  right:`${(65-(Number(filterAgeMax)||65))/(65-18)*100}%`,
                }} />
                <input type="range" min={18} max={65} step={1}
                  value={Number(filterAgeMin)||18}
                  onChange={e=>{const v=Number(e.target.value);setFilterAgeMin(v===18?'':Math.min(v,(Number(filterAgeMax)||65)))}}
                />
                <input type="range" min={18} max={65} step={1}
                  value={Number(filterAgeMax)||65}
                  onChange={e=>{const v=Number(e.target.value);setFilterAgeMax(v===65?'':Math.max(v,(Number(filterAgeMin)||18)))}}
                />
              </div>
              <span style={{fontSize:11,color:'var(--muted)',minWidth:20,textAlign:'center'}}>65</span>
            </div>
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
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>ÉTOILES MINIMUM</label>
            <select value={filterStarsMin} onChange={e=>setFilterStarsMin(e.target.value?Number(e.target.value):'')} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}}>
              <option value="">Toutes</option>
              <option value="1">⭐ 1+</option>
              <option value="2">⭐ 2+</option>
              <option value="3">⭐ 3+</option>
              <option value="4">⭐ 4+</option>
              <option value="5">⭐ 5</option>
            </select>
          </div>

          {/* CFC toggle ON/OFF */}
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>CFC</label>
            <button
              onClick={()=>setFilterCfc(filterCfc===null?true:null)}
              style={{width:'100%',padding:'6px 10px',borderRadius:6,border:`1.5px solid ${filterCfc?'#F59E0B':'var(--border)'}`,fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:700,
                background:filterCfc?'rgba(245,158,11,0.12)':'var(--bg)',color:filterCfc?'#B45309':'var(--muted)',transition:'all 0.15s'
              }}
            >
              {filterCfc ? '✓ CFC actif' : 'CFC'}
            </button>
          </div>

          {/* Déjà engagé toggle ON/OFF */}
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>DÉJÀ ENGAGÉ</label>
            <button
              onClick={()=>setFilterEngage(filterEngage===null?true:null)}
              style={{width:'100%',padding:'6px 10px',borderRadius:6,border:`1.5px solid ${filterEngage?'#22C55E':'var(--border)'}`,fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:700,
                background:filterEngage?'rgba(34,197,94,0.12)':'var(--bg)',color:filterEngage?'#15803D':'var(--muted)',transition:'all 0.15s'
              }}
            >
              {filterEngage ? '✓ Déjà engagé' : 'Déjà engagé'}
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

      {/* CV Preview Overlay — always mounted, shown/hidden via CSS for instant open/close */}
      {hoveredCv && (
        <div
          onMouseEnter={() => {
            if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
            setPreviewVisible(true)
          }}
          onMouseLeave={() => {
            if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
            hoveredCvTimeout.current = setTimeout(() => setPreviewVisible(false), 200)
          }}
          style={(() => {
            const screenW = typeof window !== 'undefined' ? window.innerWidth : 1440
            const panelW  = hoveredCv.panelW ?? 820
            const spaceRight = screenW - hoveredCv.x - 24
            const spaceLeft  = hoveredCv.x - 24
            const goLeft  = spaceRight < panelW && spaceLeft > spaceRight
            return {
              position: 'fixed' as const,
              top: 20, bottom: 20,
              ...(goLeft
                ? { right: screenW - hoveredCv.x + 12 }
                : { left: hoveredCv.x + 12 }),
              width: panelW,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
              overflow: 'hidden',
              zIndex: 500,
              pointerEvents: (previewVisible ? 'auto' : 'none') as React.CSSProperties['pointerEvents'],
              opacity: previewVisible ? 1 : 0,
              transition: 'opacity 0.1s ease',
            }
          })()}
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
                  setPreviewData({ ...hoveredCv, rotation: r })
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
              <CvPreviewCanvas
                url={hoveredCv.url}
                zoom={previewZoom}
                rotation={hoveredCv.rotation ?? 0}
                containerWidth={hoveredCv.panelW ?? 820}
              />
            ) : ['doc', 'docx'].includes(hoveredCv.ext) ? (
              <div style={{ width: `${previewZoom * 100}%`, height: `${Math.round(previewZoom * 5000)}px`, minWidth: '100%', minHeight: '100%', position: 'relative', flexShrink: 0 }}>
                <iframe
                  key={`preview-doc-${hoveredCv.url}`}
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
