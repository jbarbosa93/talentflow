'use client'
import { useState, useMemo, useCallback, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search, Trash2, ChevronDown, ChevronRight,
  LayoutGrid, Check, X, SortAsc, Sparkles, Loader2,
  Phone, AlertTriangle, Eye, MapPin, SlidersHorizontal,
  CheckCircle, Archive,
} from 'lucide-react'
import { useCandidats, useDeleteCandidatsBulk, useUpdateImportStatusBulk } from '@/hooks/useCandidats'
import { useQueryClient } from '@tanstack/react-query'
import type { PipelineEtape, ImportStatus } from '@/types/database'

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
  { value: 'date_desc',  label: '⬇ Plus récent' },
  { value: 'date_asc',   label: '⬆ Plus ancien' },
  { value: 'nom_az',     label: 'Nom A → Z' },
  { value: 'titre_az',   label: 'Métier A → Z' },
]

// Calcule l'âge à partir d'une date de naissance (formats DD/MM/YYYY ou YYYY-MM-DD)
const calculerAge = (dateNaissance: string | null): number | null => {
  if (!dateNaissance) return null
  let birthDate: Date | null = null
  const isoMatch = dateNaissance.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
  if (isoMatch) {
    birthDate = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
  } else {
    const euMatch = dateNaissance.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/)
    if (euMatch) {
      birthDate = new Date(parseInt(euMatch[3]), parseInt(euMatch[2]) - 1, parseInt(euMatch[1]))
    }
  }
  if (!birthDate || isNaN(birthDate.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age > 0 && age < 100 ? age : null
}

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function CandidatsATraiterInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const [agenceMetiers, setAgenceMetiers] = useState<string[]>([])
  const [filtreMetier, setFiltreMetier]   = useState('')
  const [search, setSearch]               = useState('')
  const [filtreStatut, setFiltreStatut]   = useState<PipelineEtape | 'tous'>(() => {
    const s = searchParams.get('statut')
    return (s && ['nouveau','contacte','entretien','place','refuse'].includes(s) ? s : 'tous') as PipelineEtape | 'tous'
  })
  const [filtreLocalisation, setFiltreLocalisation] = useState('')
  const [sortBy, setSortBy]               = useState<'date_desc' | 'date_asc' | 'nom_az' | 'titre_az' | 'distance'>('date_desc')
  const [groupByMetier, setGroupByMetier] = useState(false)
  const [groupByLieu, setGroupByLieu]     = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [aiSearching, setAiSearching] = useState(false)
  const [aiResults, setAiResults] = useState<any[] | null>(null)
  const [aiInterpreted, setAiInterpreted] = useState('')


  // Advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [filterMetier, setFilterMetier] = useState('')
  const [filterLieu, setFilterLieu] = useState('')
  const [filterAgeMin, setFilterAgeMin] = useState<number | ''>('')
  const [filterAgeMax, setFilterAgeMax] = useState<number | ''>('')
  const [filterLangue, setFilterLangue] = useState('')
  const [filterPermis, setFilterPermis] = useState<boolean | null>(null)
  const [filterExpMin, setFilterExpMin] = useState<number | ''>('')

  // CV hover preview
  const [hoveredCv, setHoveredCv] = useState<{ url: string; ext: string; x: number; y: number } | null>(null)
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


  // Distance depuis Monthey, Suisse — cache par localisation
  const [distances, setDistances] = useState<Record<string, number>>(() => {
    try {
      const s = typeof localStorage !== 'undefined' ? localStorage.getItem('talentflow_distances_monthey') : null
      return s ? JSON.parse(s) : {}
    } catch { return {} }
  })
  const geocacheRef = useRef<Record<string, { lat: number; lon: number } | null>>({})
  const geocodingRef = useRef<Set<string>>(new Set())

  const [perPage, setPerPage] = useState<number>(20)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('agence_metiers')
      if (stored) setAgenceMetiers(JSON.parse(stored))
    } catch {}
  }, [])

  const { data: candidatsData, isLoading } = useCandidats({ import_status: 'a_traiter' })
  const allCandidats = candidatsData?.candidats || []
  const totalCandidats = candidatsData?.total ?? allCandidats.length
  const deleteBulk   = useDeleteCandidatsBulk()
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

  // Filtrage client-side instantané
  const candidatsFiltres = useMemo(() => {
    const base = aiResults !== null ? aiResults : (allCandidats || [])
    let filtered: any[] = base as any[]

    if (search && aiResults === null) {
      const q = normalize(search)
      filtered = filtered.filter((c: any) =>
        normalize(c.nom || '').includes(q) ||
        normalize(c.prenom || '').includes(q) ||
        normalize(c.titre_poste || '').includes(q) ||
        normalize(c.email || '').includes(q) ||
        normalize(c.formation || '').includes(q) ||
        normalize(c.localisation || '').includes(q) ||
        normalize(c.resume_ia || '').includes(q) ||
        normalize(c.notes || '').includes(q) ||
        (c.competences || []).some((s: string) => normalize(s).includes(q)) ||
        (c.langues || []).some((s: string) => normalize(s).includes(q)) ||
        (c.tags || []).some((s: string) => normalize(s).includes(q)) ||
        (c.experiences || []).some((e: any) =>
          normalize(e.poste || '').includes(q) ||
          normalize(e.entreprise || '').includes(q) ||
          normalize(e.description || '').includes(q)
        ) ||
        normalize(JSON.stringify(c.formations_details || [])).includes(q)
      )
    }

    if (filtreLocalisation.trim()) {
      const loc = normalize(filtreLocalisation)
      filtered = filtered.filter((c: any) =>
        normalize(c.localisation || '').includes(loc)
      )
    }

    if (filtreMetier) {
      filtered = filtered.filter((c: any) => (c.tags || []).includes(filtreMetier))
    }

    // Advanced filters
    filtered = filtered
      .filter(c => !filterMetier || normalize(c.titre_poste || '').includes(normalize(filterMetier)))
      .filter(c => !filterLieu || normalize(c.localisation || '').includes(normalize(filterLieu)))
      .filter(c => {
        if (filterAgeMin === '' && filterAgeMax === '') return true
        const age = c.date_naissance ? calculerAge(c.date_naissance) : null
        if (age === null) return filterAgeMin === ''
        if (filterAgeMin !== '' && age < filterAgeMin) return false
        if (filterAgeMax !== '' && age > filterAgeMax) return false
        return true
      })
      .filter(c => !filterLangue || (c.langues || []).some((l: string) => normalize(l).includes(normalize(filterLangue))))
      .filter(c => filterPermis === null || c.permis_conduire === filterPermis)
      .filter(c => filterExpMin === '' || (c.annees_exp || 0) >= filterExpMin)

    return filtered
  }, [allCandidats, search, aiResults, filtreLocalisation, filtreMetier, filterMetier, filterLieu, filterAgeMin, filterAgeMax, filterLangue, filterPermis, filterExpMin])

  const activeFiltersCount = [
    filterMetier !== '',
    filterLieu !== '',
    filterAgeMin !== '',
    filterAgeMax !== '',
    filterLangue !== '',
    filterPermis !== null,
  ].filter(Boolean).length

  // Client-side sort
  const sorted = useMemo(() => {
    const arr = [...candidatsFiltres]
    switch (sortBy) {
      case 'date_asc':
        return arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      case 'nom_az':
        return arr.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))
      case 'titre_az':
        return arr.sort((a, b) => (a.titre_poste || 'ZZZZ').localeCompare(b.titre_poste || 'ZZZZ', 'fr'))
      case 'distance':
        return arr.sort((a, b) => {
          const da = distances[a.localisation] ?? 99999
          const db = distances[b.localisation] ?? 99999
          return da - db
        })
      default:
        return arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
  }, [candidatsFiltres, sortBy, distances])

  // Alias for readability + pagination
  const candidatesTries = sorted
  const candidatesPagines = perPage === 0 ? candidatesTries : candidatesTries.slice(0, perPage)
  const hasMore = perPage > 0 && candidatesTries.length > perPage

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
    else router.push(`/candidats/${id}`)
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

  const renderCard = (c: any) => {
    const selected = selectedIds.has(c.id)
    const age = calculerAge(c.date_naissance)
    const hasCv = !!c.cv_url
    const cvExt = (c.cv_nom_fichier || '').toLowerCase().split('.').pop() || ''

    return (
      <div
        key={c.id}
        onClick={() => handleCardClick(c.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: selected ? 'var(--primary-soft)' : 'white',
          border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 14, padding: '16px 18px',
          cursor: 'pointer', transition: 'all 0.15s ease',
          boxShadow: selected ? '0 0 0 2px rgba(245,167,35,0.2)' : 'var(--card-shadow)',
          position: 'relative',
        }}
      >
        {/* Checkbox */}
        <div
          onClick={e => { e.stopPropagation(); toggleSelect(c.id) }}
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
            background: selected ? 'var(--primary)' : 'white',
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
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)', lineHeight: 1.3 }}>
            {c.prenom} {c.nom}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {c.titre_poste && (
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{c.titre_poste}</span>
            )}
            {c.localisation && (
              <span style={{ fontSize: 12, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                📍 {c.localisation}
              </span>
            )}
          </div>
        </div>

        {/* Âge (calculé depuis date_naissance) */}
        {age !== null && (
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', flexShrink: 0, background: 'var(--bg-muted, #F1F5F9)', padding: '4px 10px', borderRadius: 8 }}>
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
                setHoveredCv({ url: c.cv_url, ext: cvExt, x: rect.right, y: rect.top })
              }, 250)
            }}
            onMouseLeave={() => {
              if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
              hoveredCvTimeout.current = setTimeout(() => setHoveredCv(null), 400)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 9px', borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--background)',
              cursor: 'default', fontSize: 11, fontWeight: 600,
              color: 'var(--muted)', flexShrink: 0,
              transition: 'all 0.15s',
            }}
            title="Survoler pour prévisualiser le CV"
          >
            <Eye size={11} /> CV
          </div>
        )}

        {/* Quick validate button */}
        <button
          onClick={e => { e.stopPropagation(); handleSingleValidate(c.id) }}
          title="Valider ce candidat"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 8, border: '1px solid #BBF7D0',
            background: '#F0FDF4', cursor: 'pointer', flexShrink: 0,
            transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#DCFCE7'; e.currentTarget.style.borderColor = '#86EFAC' }}
          onMouseOut={e => { e.currentTarget.style.background = '#F0FDF4'; e.currentTarget.style.borderColor = '#BBF7D0' }}
        >
          <CheckCircle size={15} color="#16A34A" />
        </button>

        {/* Date d'ajout */}
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Ajouté le {new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
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
          <h1 className="d-page-title">Candidats à traiter</h1>
          <p className="d-page-sub">
            {isLoading ? '...' : `${totalCandidats} candidat${totalCandidats > 1 ? 's' : ''} à traiter`}
            {aiResults !== null && (
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                {' '}· Résultats IA
              </span>
            )}
            {selCount > 0 && (
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                {' '}· {selCount} sélectionné{selCount > 1 ? 's' : ''}
              </span>
            )}
          </p>
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
          <button onClick={deselectAll} className="neo-btn-ghost neo-btn-sm">
            <X size={13} /> Désélectionner
          </button>
          <button
            onClick={handleBulkValidate}
            disabled={updateImportStatus.isPending}
            className="neo-btn neo-btn-sm"
            style={{ background: '#16A34A', color: 'white', boxShadow: 'none' }}
          >
            <CheckCircle size={13} /> Valider ({selCount})
          </button>
          <button
            onClick={handleBulkArchive}
            disabled={updateImportStatus.isPending}
            className="neo-btn neo-btn-sm"
            style={{ background: '#6B7280', color: 'white', boxShadow: 'none' }}
          >
            <Archive size={13} /> Archiver ({selCount})
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
              style={{ paddingLeft: 38, paddingRight: aiResults !== null ? 32 : 12, width: '100%' }}
              placeholder="Nom, métier, compétence, contenu du CV..."
              value={search}
              onChange={e => { setSearch(e.target.value); if (aiResults !== null) clearAiSearch() }}
              onKeyDown={e => { if (e.key === 'Enter' && search.trim()) handleAiSearch() }}
            />
            {aiResults !== null && (
              <button
                onClick={() => { clearAiSearch(); setSearch('') }}
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
        <button onClick={() => setShowAdvancedFilters(v => !v)} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:showAdvancedFilters?'var(--primary)':'var(--bg-card)',color:showAdvancedFilters?'white':'var(--text)',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
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
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>MÉTIER</label>
            <input value={filterMetier} onChange={e=>setFilterMetier(e.target.value)} placeholder="Ex: Soudeur, Maçon..." style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}} />
          </div>
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
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>PERMIS DE CONDUIRE</label>
            <select value={filterPermis===null?'':filterPermis?'oui':'non'} onChange={e=>setFilterPermis(e.target.value===''?null:e.target.value==='oui')} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}}>
              <option value="">Tous</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
          <div style={{display:'flex',alignItems:'flex-end'}}>
            <button onClick={()=>{setFilterMetier('');setFilterLieu('');setFilterAgeMin('');setFilterAgeMax('');setFilterLangue('');setFilterPermis(null);setFilterExpMin('')}} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,cursor:'pointer',color:'var(--muted)',fontFamily:'inherit'}}>
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
                « {aiInterpreted} »
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
            <div key={i} style={{ height: 68, background: 'white', border: '1px solid var(--border)', borderRadius: 12, opacity: 0.6 }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">🔍</div>
          <div className="neo-empty-title">Aucun candidat à traiter</div>
          <div className="neo-empty-sub">Tous les candidats importés ont été traités</div>
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
                      background: allSel ? 'var(--primary)' : someSel ? 'var(--primary-soft)' : 'white',
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
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            {candidatesPagines.length} candidat{candidatesPagines.length > 1 ? 's' : ''} affichés
          </div>
          {candidatesPagines.map((c: any) => renderCard(c))}

          {/* Bouton Charger plus */}
          {hasMore && (
            <button
              onClick={() => setPerPage(p => p + 20)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '12px 0', marginTop: 8,
                borderRadius: 10, border: '1.5px solid var(--border)',
                background: 'var(--bg-card)', color: 'var(--text)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
            >
              Charger plus ({candidatesTries.length - perPage} restants)
            </button>
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
            background: 'white',
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
              >−</button>
              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 36, textAlign: 'center' }}>{Math.round(previewZoom * 100)}%</span>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setPreviewZoom(z => Math.min(3, +(z + 0.25).toFixed(2))) }}
                style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)', fontWeight: 700 }}
                title="Zoomer"
              >+</button>
            </div>
          </div>
          {/* Content */}
          <div
            ref={previewScrollRef}
            style={{ width: '100%', height: 'calc(100% - 41px)', overflow: 'auto', background: '#F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', cursor: 'grab' }}
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
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'none' }}
                  />
                </div>
              </div>
            ) : hoveredCv.ext === 'pdf' ? (
              <div style={{ width: `${previewZoom * 100}%`, height: `${Math.round(4000 * previewZoom)}px`, minWidth: '100%', minHeight: '100%', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: `${100 / previewZoom}%`, height: '4000px', transform: `scale(${previewZoom})`, transformOrigin: 'top left' }}>
                  <iframe
                    src={`${hoveredCv.url}#toolbar=0&navpanes=0`}
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'none' }}
                    title="Aperçu CV"
                  />
                </div>
              </div>
            ) : ['doc', 'docx'].includes(hoveredCv.ext) ? (
              <div style={{ width: `${previewZoom * 100}%`, height: `${Math.round(4000 * previewZoom)}px`, minWidth: '100%', minHeight: '100%', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: `${100 / previewZoom}%`, height: '4000px', transform: `scale(${previewZoom})`, transformOrigin: 'top left' }}>
                  <iframe
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(hoveredCv.url)}&embedded=true`}
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'none' }}
                    title="Aperçu CV"
                  />
                </div>
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
    </div>
  )
}

export default function CandidatsATraiterPage() {
  return <Suspense fallback={null}><CandidatsATraiterInner /></Suspense>
}
