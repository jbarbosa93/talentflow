'use client'
import Image from 'next/image'
import { detectAndFormat } from '@/lib/phone-format'
import { formatFullName, formatInitials, formatEmail, formatCity } from '@/lib/format-candidat'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { CvPreviewCanvas } from './CvPreviewCanvas'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Upload, Search, Trash2, ChevronDown, ChevronRight,
  Check, X, SortAsc, Sparkles, Loader2,
  MessageSquare, Phone, AlertTriangle, Eye, MapPin, SlidersHorizontal, Star, RotateCw,
  CheckCircle, Archive, Briefcase, Info, GraduationCap, Pencil, LayoutGrid, Users,
} from 'lucide-react'

import { toast } from 'sonner'
import { useUpload } from '@/contexts/UploadContext'
import { useCandidats, useDeleteCandidatsBulk, useUpdateStatutCandidat, useUpdateImportStatusBulk, useCandidatsRealtime } from '@/hooks/useCandidats'
import { useQueryClient } from '@tanstack/react-query'
import { useMetiers } from '@/hooks/useMetiers'
import { useMetierCategories } from '@/hooks/useMetierCategories'
import type { PipelineEtape, ImportStatus } from '@/types/database'

// ── Badge rouge : par candidat, persist dans localStorage ──────────────────
// Badge actif si : created_at dans les 30 derniers jours ET fiche jamais ouverte
import { markCandidatVu, markCandidatNonVu, markTousVus, markAllVu, getViewedSet, ensureInit, hasBadge } from '@/lib/badge-candidats'
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
function MetierPopover({ candidatId, currentTags, onClose, onSave, anchorRect }: {
  candidatId: string
  currentTags: string[]
  onClose: () => void
  onSave: (tags: string[]) => void
  anchorRect: { top: number; left: number; bottom: number; right: number }
}) {
  const [selected, setSelected] = useState<string[]>(currentTags)
  const [search, setSearch] = useState('')
  const { metiers } = useMetiers()
  const { categories, getColorForMetier } = useMetierCategories()
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Position fixe calculée à partir du rect du bouton passé au clic
  const popoverWidth = 240
  const popoverHeight = 340
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const top = spaceBelow < popoverHeight
    ? Math.max(8, anchorRect.top - popoverHeight)
    : anchorRect.bottom + 4
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - popoverWidth - 8))

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

  const content = (
    <div ref={ref} style={{
      position: 'fixed',
      top,
      left,
      zIndex: 9999,
      background: 'var(--card)', borderRadius: 10, padding: 10,
      boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      border: '1px solid var(--border)', width: popoverWidth,
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

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
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

  const [importStatusFilter, setImportStatusFilter] = useState<string>(() => ssGet('importStatus', 'traite'))
  const [filterNonVu, setFilterNonVu] = useState(() => sessionStorage.getItem('candidats_filter_nonvu') === '1')

  const { metiers: agenceMetiers } = useMetiers()
  const { categories: metierCategories, getColorForMetier } = useMetierCategories()
  const [filtreMetier, setFiltreMetier]   = useState<string>(() => ssGet('filtreMetier', ''))
  const [metierDropdownOpen, setMetierDropdownOpen] = useState(false)
  const [metierSearch, setMetierSearch] = useState('')
  const metierDropdownRef = useRef<HTMLDivElement>(null)
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const metierSearchNorm = norm(metierSearch.trim())
  useEffect(() => {
    if (!metierDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (metierDropdownRef.current && !metierDropdownRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-metier-trigger]')) { setMetierDropdownOpen(false); setMetierSearch('') }
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
  const [isReady, setIsReady]             = useState(false) // masquer non-vus avant ensureInit()
  const [nonVusTotal, setNonVusTotal]     = useState(0) // total non-vus tous pages confondus
  const [nonVusParStatut, setNonVusParStatut] = useState<Record<string, number>>({}) // non-vus par import_status
  const [viewedAllAt, setViewedAllAt]     = useState<string | null>(null) // timestamp "Tout marquer vu"

  // Écouter l'événement global de changement de badges (ouverture fiche, marquer vu, etc.)
  useEffect(() => {
    const handler = () => setBadgeTick(t => t + 1)
    window.addEventListener('talentflow:badges-changed', handler)
    return () => window.removeEventListener('talentflow:badges-changed', handler)
  }, [])

  // Init au montage — charge les vus depuis DB (merge avec localStorage existant)
  useEffect(() => {
    ensureInit().then(({ viewedAllAt: vaa }) => {
      setViewedAllAt(vaa)
      setBadgeTick(t => t + 1)
      setIsReady(true)
    })
  }, [])

  // Calculer le total "non vus" réel depuis l'API (tous les candidats, pas juste la page)
  useEffect(() => {
    if (!isReady) return
    fetch(`/api/candidats/count-new?t=${Date.now()}`)
      .then(r => r.json())
      .then(({ ids }: { ids: { id: string; import_status: string; created_at: string; has_update?: boolean }[] }) => {
        const vs = getViewedSet()
        const nonVus = ids.filter(item => hasBadge(item.id, item.created_at, vs, viewedAllAt, item.has_update))
        nonVusBadgeLoaded.current = true
        setNonVusTotal(nonVus.length)
        const parStatut: Record<string, number> = {}
        for (const item of nonVus) {
          parStatut[item.import_status] = (parStatut[item.import_status] || 0) + 1
        }
        setNonVusParStatut(parStatut)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badgeTick, isReady])
  // Auto-désactiver filterNonVu quand plus aucun non-vu (ex: dernier consulté depuis la fiche)
  // Guard : attendre que l'API badge ait répondu au moins une fois — évite le reset prématuré au montage
  useEffect(() => {
    if (!nonVusBadgeLoaded.current) return
    if (filterNonVu && nonVusTotal === 0) {
      setFilterNonVu(false)
      sessionStorage.setItem('candidats_filter_nonvu', '0')
      setImportStatusFilter(statusBeforeNonVuRef.current)
    }
  }, [nonVusTotal, filterNonVu])

  // showUpload géré par UploadContext global
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showMessage, setShowMessage]     = useState(false)
  const [messageText, setMessageText]     = useState('')
  const [smsTemplates, setSmsTemplates]   = useState<any[]>([])
  const [showSmsTplDropdown, setShowSmsTplDropdown] = useState(false)
  const [smsTplId, setSmsTplId]           = useState<string | null>(null)
  const [smsMetier, setSmsMetier]         = useState('')
  const [smsLieu, setSmsLieu]             = useState('')
  const [showSaveTpl, setShowSaveTpl]     = useState(false)
  const [saveTplName, setSaveTplName]     = useState('')

  // Charger les templates SMS à l'ouverture du modal
  useEffect(() => {
    if (!showMessage) return
    fetch('/api/email-templates?type=sms')
      .then(r => r.json())
      .then(d => setSmsTemplates(d.templates || []))
      .catch(() => {})
  }, [showMessage])

  // Recalcul live du message quand on change métier/lieu avec un template actif
  const selectedSmsTpl = smsTemplates.find(t => t.id === smsTplId) || null
  useEffect(() => {
    if (!selectedSmsTpl) return
    const out = (selectedSmsTpl.corps || '')
      .replace(/\[MÉTIER\]/g, smsMetier || '[MÉTIER]')
      .replace(/\[LIEU\]/g, smsLieu || '[LIEU]')
    setMessageText(out)
  }, [selectedSmsTpl, smsMetier, smsLieu])

  const applySmsTemplate = (id: string) => {
    const t = smsTemplates.find(x => x.id === id)
    if (!t) return
    setSmsTplId(id)
    setShowSmsTplDropdown(false)
    const out = (t.corps || '')
      .replace(/\[MÉTIER\]/g, smsMetier || '[MÉTIER]')
      .replace(/\[LIEU\]/g, smsLieu || '[LIEU]')
    setMessageText(out)
  }

  const saveAsSmsTemplate = async () => {
    const nom = saveTplName.trim()
    if (!nom || !messageText.trim()) return
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom,
          corps: messageText,
          categorie: 'general',
          type: 'sms',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setSmsTemplates(prev => [...prev, data.template])
      setShowSaveTpl(false)
      setSaveTplName('')
      toast.success('Template SMS sauvegardé')
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    }
  }

  const tplHasMetier = selectedSmsTpl && /\[MÉTIER\]/.test(selectedSmsTpl.corps || '')
  const tplHasLieu   = selectedSmsTpl && /\[LIEU\]/.test(selectedSmsTpl.corps || '')
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
  const [filterGenre, setFilterGenre] = useState<string>(() => ssGet('fGenre', ''))
  const [filterStarsMin, setFilterStarsMin] = useState<number | ''>(() => ssGet('fStarsMin', ''))
  const [filterCfc, setFilterCfc] = useState<boolean | null>(() => ssGet('fCfc', null))
  const [filterEngage, setFilterEngage] = useState<boolean | null>(() => ssGet('fEngage', null))
  const [showBooleanHelp, setShowBooleanHelp] = useState(false)

  // Fix 3 — sync bidirectionnel filtreMetier ↔ filterMetier
  // filtreMetier = dropdown inline sur la liste | filterMetier = filtres avancés → serveur
  useEffect(() => { if (filtreMetier !== filterMetier) setFilterMetier(filtreMetier) }, [filtreMetier]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (filterMetier !== filtreMetier) setFiltreMetier(filterMetier) }, [filterMetier]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persister les filtres dans sessionStorage
  useEffect(() => { ssSet('sort', sortBy) }, [sortBy])
  useEffect(() => { ssSet('showAdv', showAdvancedFilters) }, [showAdvancedFilters])
  useEffect(() => { ssSet('fMetier', filterMetier) }, [filterMetier])
  useEffect(() => { ssSet('fLieu', filterLieu) }, [filterLieu])
  useEffect(() => { ssSet('fAgeMin', filterAgeMin) }, [filterAgeMin])
  useEffect(() => { ssSet('fAgeMax', filterAgeMax) }, [filterAgeMax])
  useEffect(() => { ssSet('fLangue', filterLangue) }, [filterLangue])
  useEffect(() => { ssSet('fPermis', filterPermis) }, [filterPermis])
  useEffect(() => { ssSet('fGenre', filterGenre) }, [filterGenre])
  useEffect(() => { ssSet('fStarsMin', filterStarsMin) }, [filterStarsMin])
  useEffect(() => { ssSet('fCfc', filterCfc) }, [filterCfc])
  useEffect(() => { ssSet('fEngage', filterEngage) }, [filterEngage])

  // CV hover preview — always mounted, show/hide via CSS for instant open/close
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewData, setPreviewData] = useState<{ url: string; ext: string; x: number; y: number; rotation: number; panelW: number } | null>(null)
  const [metierPopoverId, setMetierPopoverId] = useState<string | null>(null)
  const [metierPopoverRect, setMetierPopoverRect] = useState<{ top: number; left: number; bottom: number; right: number } | null>(null)
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null)
  const [hoveredNoteRect, setHoveredNoteRect] = useState<{ top: number; left: number; right: number } | null>(null)
  const [notePopoverId, setNotePopoverId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [editNoteId, setEditNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [editNoteSaving, setEditNoteSaving] = useState(false)
  const hoveredCvTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const panelTopRef = useRef(20)
  const prevHoveredCvUrl = useRef<string | null>(null)
  const statusBeforeNonVuRef = useRef<string>(sessionStorage.getItem('candidats_status_before_nonvu') || 'traite')
  const nonVusBadgeLoaded = useRef(false) // true dès que l'API count-new a répondu au moins une fois
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
  // Fix 5 — pour les requêtes booléennes ET/AND uniquement : extraire les mots et envoyer
  // au serveur comme pré-filtre (la nouvelle RPC fait AND entre mots → résultat identique).
  // Pour OU/OR/SAUF/NOT : fetch tout côté client (OR serveur n'est pas supporté).
  const booleanHasOr = /\b(OU|OR|SAUF|NOT)\b/i.test(debouncedSearch)
  const booleanServerTerms = hasBooleanSearch && !booleanHasOr
    ? debouncedSearch.replace(/\b(ET|AND)\b/gi, ' ').replace(/\s+/g, ' ').trim()
    : null

  // Reset page + sélection quand les filtres changent (skip au premier render)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setPage(1)
    setSelectedIds(new Set())
  }, [debouncedSearch, filtreStatut, importStatusFilter, sortBy, perPage, filterGenre, filterAgeMin, filterAgeMax, filterLangue, filterPermis, filterLieu, filterMetier, filterNonVu, filterCfc, filterEngage])

  // Si filtre âge ou OU/SAUF booléen → fetch tout (client-side)
  // ET booléen → envoyé au serveur (la RPC fait AND entre mots)
  const ageFilterActive = filterAgeMin !== '' || filterAgeMax !== ''
  const clientSideFilter = ageFilterActive || filterNonVu || (hasBooleanSearch && booleanHasOr)
  const { data: candidatsData, isLoading, isFetching } = useCandidats({
    statut: filtreStatut === 'tous' ? undefined : filtreStatut,
    import_status: importStatusFilter as ImportStatus,
    // Fix 5 : ET booléen → serveur | OU/SAUF booléen → client (fetch all)
    search: booleanServerTerms || (hasBooleanSearch ? undefined : (debouncedSearch || undefined)),
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

  // Restaurer la position scroll au retour (depuis une fiche candidat OU une autre page)
  const scrollRestored = useRef(false)
  useEffect(() => {
    if (scrollRestored.current || isLoading) return
    const savedScroll = sessionStorage.getItem('candidats_scroll')
    if (savedScroll) {
      scrollRestored.current = true
      const y = parseInt(savedScroll, 10)
      setTimeout(() => {
        const container = document.querySelector('.d-content') as HTMLElement | null
        if (container) container.scrollTop = y
        else window.scrollTo(0, y)
      }, 100)
      // NE PAS removeItem : on garde la position pour restaurer aussi depuis /messages, /clients, etc.
      sessionStorage.removeItem('candidats_last_id')
    }
  }, [isLoading])

  // Sauvegarde continue de la position scroll (debounced)
  useEffect(() => {
    const container = document.querySelector('.d-content') as HTMLElement | null
    if (!container) return
    let t: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        sessionStorage.setItem('candidats_scroll', String(container.scrollTop))
      }, 150)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (t) clearTimeout(t)
      container.removeEventListener('scroll', onScroll)
    }
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
    // filtreMetier est désormais synchronisé avec filterMetier (serveur) — pas de double filtre client
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
        const searchable = [c.prenom, c.nom, c.titre_poste, c.email, c.localisation, c.formation, c.notes, c.resume_ia, ...(c.competences || []), ...(c.tags || [])].filter(Boolean).join(' ')
        return booleanMatcher(searchable)
      })
    }

    return filtered
  }, [allCandidats, aiResults, filtreLocalisation, filtreMetier, filterAgeMin, filterAgeMax, filterStarsMin, search])

  const activeFiltersCount = [
    filterMetier !== '',   // filtreMetier est synchronisé avec filterMetier — un seul comptage
    filterLieu !== '',
    filterAgeMin !== '',
    filterAgeMax !== '',
    filterLangue !== '',
    filterPermis !== null,
    filterGenre !== '',
    filterStarsMin !== '',
    filterCfc !== null,
    filterEngage !== null,
    filtreLocalisation !== '',
  ].filter(Boolean).length

  const resetFiltersOnly = () => {
    setFiltreStatut('tous')
    setImportStatusFilter('traite')
    setFilterMetier(''); setFilterLieu(''); setFilterAgeMin(''); setFilterAgeMax('')
    setFilterLangue(''); setFilterPermis(null); setFilterGenre(''); setFilterStarsMin('')
    setFilterCfc(null); setFilterEngage(null)
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
      result = result.filter((c: any) => hasBadge(c.id, c.created_at, vs, viewedAllAt, c.has_update))
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatsFiltres, sortBy, filterNonVu, badgeTick, viewedAllAt])

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
    window.open(`sms:${formatted.length === 1 ? formatted[0] : ''}${body ? `?body=${body}` : ''}`, '_self')
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
      // Sauvegarde position scroll pour la restaurer au retour
      const scrollContainer = document.querySelector('.d-content') as HTMLElement | null
      sessionStorage.setItem('candidats_scroll', (scrollContainer?.scrollTop ?? window.scrollY).toString())
      sessionStorage.setItem('candidats_last_id', id)
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

  const initiales = (c: any) => formatInitials(c.prenom, c.nom) || '?'

  const saveNote = async (candidatId: string) => {
    if (!noteText.trim()) return
    setNoteSaving(true)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidat_id: candidatId, contenu: noteText.trim() }),
      })
      if (!res.ok) throw new Error()
      const { note } = await res.json()
      queryClient.setQueriesData({ queryKey: ['candidats'] }, (old: any) =>
        old?.candidats
          ? { ...old, candidats: old.candidats.map((x: any) =>
              x.id === candidatId
                ? { ...x, notes_candidat: [...(x.notes_candidat || []), note] }
                : x
            )}
          : old
      )
      // Mettre à jour aussi le cache fiche candidat
      queryClient.setQueryData(['candidat', candidatId], (old: any) =>
        old ? { ...old, notes_candidat: [...(old.notes_candidat || []), note] } : old
      )
      setNoteText('')
      setTimeout(() => noteTextareaRef.current?.focus(), 50)
    } catch {
      // silencieux
    } finally {
      setNoteSaving(false)
    }
  }

  const deleteNote = async (noteId: string, candidatId: string) => {
    // Optimiste : retirer immédiatement du cache liste
    queryClient.setQueriesData({ queryKey: ['candidats'] }, (old: any) =>
      old?.candidats
        ? { ...old, candidats: old.candidats.map((x: any) =>
            x.id === candidatId
              ? { ...x, notes_candidat: (x.notes_candidat || []).filter((n: any) => n.id !== noteId) }
              : x
          )}
        : old
    )
    // Optimiste : retirer aussi du cache fiche candidat
    queryClient.setQueryData(['candidat', candidatId], (old: any) =>
      old ? { ...old, notes_candidat: (old.notes_candidat || []).filter((n: any) => n.id !== noteId) } : old
    )
    try {
      await fetch(`/api/notes/${noteId}`, { method: 'DELETE' })
    } catch {
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
      queryClient.invalidateQueries({ queryKey: ['candidat', candidatId] })
    }
  }

  const updateNote = async (noteId: string, candidatId: string) => {
    if (!editNoteText.trim()) return
    setEditNoteSaving(true)
    // Optimiste
    queryClient.setQueriesData({ queryKey: ['candidats'] }, (old: any) =>
      old?.candidats
        ? { ...old, candidats: old.candidats.map((x: any) =>
            x.id === candidatId
              ? { ...x, notes_candidat: (x.notes_candidat || []).map((n: any) =>
                  n.id === noteId ? { ...n, contenu: editNoteText.trim() } : n
                )}
              : x
          )}
        : old
    )
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: editNoteText.trim() }),
      })
      setEditNoteId(null)
      setEditNoteText('')
    } catch {
      queryClient.invalidateQueries({ queryKey: ['candidats'] })
    } finally {
      setEditNoteSaving(false)
    }
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

  // Compter les badges actifs (pour le bouton "Tout marquer vu")
  const badgeCount = useMemo(() => {
    return sorted.filter(c => hasBadge(c.id, c.created_at, viewedSet, viewedAllAt, (c as any).has_update)).length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, badgeTick, viewedAllAt])

  const renderCard = (c: any) => {
    const selected = selectedIds.has(c.id)
    const age = calculerAge(c.date_naissance)
    const hasCv = !!c.cv_url
    const cvExt = (c.cv_nom_fichier || '').toLowerCase().split('.').pop() || ''
    // Badge rouge si : has_update=true OU (créé dans les 30 derniers jours ET fiche jamais ouverte)
    const isNewCandidat = hasBadge(c.id, c.created_at, viewedSet, viewedAllAt, (c as any).has_update)

    return (
      <motion.div
        key={c.id}
        onClick={() => handleCardClick(c.id)}
        onMouseEnter={() => handleCardHover(c.id)}
        whileHover={{ y: -3, boxShadow: selected ? '0 0 0 2px rgba(255,232,0,0.4), 0 16px 36px rgba(0,0,0,0.35)' : '0 16px 36px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,232,0,0.18)' }}
        whileTap={{ scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: selected ? 'var(--primary-soft)' : 'var(--surface)',
          border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 14, padding: '16px 18px',
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 2px rgba(255,232,0,0.2)' : 'var(--card-shadow)',
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
          ? <Image src={c.photo_url} width={56} height={56} unoptimized style={{ objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} alt="" />
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
            {formatFullName(c.prenom, c.nom)}
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
                    {'\uD83D\uDCCD'} {formatCity(c.localisation)}
                  </span>
                )}
                {age !== null && (
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                    {age} ans
                  </span>
                )}
              </>
            ) : (
              <>
                {c.localisation && (
                  <span style={{ fontSize: 14, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {'\uD83D\uDCCD'} {formatCity(c.localisation)}
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
                  queryClient.setQueryData(['candidat', c.id], (old: any) => old ? { ...old, rating: newRating } : old)
                  try {
                    await fetch(`/api/candidats/${c.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rating: newRating }),
                    })
                  } catch {
                    queryClient.invalidateQueries({ queryKey: ['candidats'] })
                    queryClient.invalidateQueries({ queryKey: ['candidat', c.id] })
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
              const mouseX = e.clientX
              const mouseY = e.clientY
              hoveredCvTimeout.current = setTimeout(() => {
                  const savedRot = localStorage.getItem(`cv_rotation_${c.id}`)
                  const rotation = savedRot ? parseInt(savedRot, 10) : 0
                  const screenW = window.innerWidth
                  const screenH = window.innerHeight
                  const spaceRight = screenW - mouseX - 24
                  const spaceLeft  = mouseX - 24
                  const panelW = Math.min(820, Math.max(480, Math.max(spaceRight, spaceLeft)) - 8)
                  const initZoom = Math.min(1, +(panelW / 840).toFixed(2))
                  const panelH = Math.min(Math.round(screenH * 0.82), 800)
                  const idealTop = mouseY - panelH / 2
                  const newTop = Math.max(12, Math.min(idealTop, screenH - panelH - 12))
                  panelTopRef.current = newTop
                  setPreviewData({ url: c.cv_url, ext: cvExt, x: mouseX, y: mouseY, rotation, panelW })
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

        {/* Bouton ajouter note (à-traiter uniquement) */}
        {importStatusFilter === 'a_traiter' && (
          <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={e => {
                e.stopPropagation()
                if (notePopoverId === c.id) { setNotePopoverId(null); setNoteText('') }
                else { setNotePopoverId(c.id); setNoteText(''); setTimeout(() => noteTextareaRef.current?.focus(), 50) }
              }}
              title="Ajouter une note"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
                border: `1.5px solid ${notePopoverId === c.id ? '#6366F1' : 'var(--border)'}`,
                background: notePopoverId === c.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: notePopoverId === c.id ? '#6366F1' : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              <MessageSquare size={13} />
            </button>
            {notePopoverId === c.id && (() => {
              const sortedNotes = [...(c.notes_candidat || [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              return (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute', bottom: '100%', right: 0, marginBottom: 6,
                  background: 'var(--card)', border: '1.5px solid #6366F1',
                  borderRadius: 10, padding: 10, width: 268, zIndex: 200,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  maxHeight: 420, overflowY: 'auto',
                }}
              >
                {/* Notes existantes */}
                {sortedNotes.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {sortedNotes.map((note: any) => (
                      <div key={note.id} style={{
                        borderRadius: 7, padding: '6px 8px', marginBottom: 6,
                        background: 'var(--secondary)', border: '1px solid var(--border)',
                      }}>
                        {editNoteId === note.id ? (
                          <>
                            <textarea
                              autoFocus
                              value={editNoteText}
                              onChange={e => setEditNoteText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) updateNote(note.id, c.id) }}
                              rows={3}
                              style={{
                                width: '100%', fontSize: 12, borderRadius: 6,
                                border: '1px solid #6366F1', background: 'var(--card)',
                                color: 'var(--foreground)', outline: 'none', fontFamily: 'inherit',
                                padding: '5px 7px', resize: 'none', boxSizing: 'border-box',
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                              <button onClick={() => { setEditNoteId(null); setEditNoteText('') }}
                                style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Annuler
                              </button>
                              <button onClick={() => updateNote(note.id, c.id)} disabled={!editNoteText.trim() || editNoteSaving}
                                style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: 'none', background: editNoteText.trim() ? '#6366F1' : 'var(--border)', color: 'white', cursor: editNoteText.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 700 }}>
                                {editNoteSaving ? '…' : 'Sauvegarder'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>
                                {note.auteur || 'Recruteur'} · {new Date(note.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                              </span>
                              <div style={{ display: 'flex', gap: 3 }}>
                                <button
                                  onClick={() => { setEditNoteId(note.id); setEditNoteText(note.contenu) }}
                                  title="Modifier"
                                  style={{ display: 'flex', alignItems: 'center', padding: 3, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                                ><Pencil size={10} /></button>
                                <button
                                  onClick={() => deleteNote(note.id, c.id)}
                                  title="Supprimer"
                                  style={{ display: 'flex', alignItems: 'center', padding: 3, borderRadius: 4, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                                ><Trash2 size={10} /></button>
                              </div>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--foreground)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                              {note.contenu}
                            </p>
                          </>
                        )}
                      </div>
                    ))}
                    <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                  </div>
                )}
                {/* Ajouter une note */}
                <textarea
                  ref={noteTextareaRef}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote(c.id) }}
                  placeholder="Nouvelle note…"
                  rows={3}
                  style={{
                    width: '100%', fontSize: 12, borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--secondary)',
                    color: 'var(--foreground)', outline: 'none', fontFamily: 'inherit',
                    padding: '6px 8px', resize: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                  <button
                    onClick={() => { setNotePopoverId(null); setNoteText(''); setEditNoteId(null) }}
                    style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >Fermer</button>
                  <button
                    onClick={() => saveNote(c.id)}
                    disabled={!noteText.trim() || noteSaving}
                    style={{
                      padding: '4px 10px', fontSize: 11, borderRadius: 6, border: 'none',
                      background: noteText.trim() ? '#6366F1' : 'var(--border)',
                      color: 'white', cursor: noteText.trim() ? 'pointer' : 'default',
                      fontFamily: 'inherit', fontWeight: 700,
                    }}
                  >{noteSaving ? '…' : 'Ajouter'}</button>
                </div>
              </div>
              )
            })()}
          </div>
        )}

        {/* Badge note avec tooltip hover — jusqu'à 3 notes */}
        {c.notes_candidat && c.notes_candidat.length > 0 && (() => {
          const sortedNotes = [...c.notes_candidat].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          const visibleNotes = sortedNotes.slice(0, 3)
          return (
            <div
              style={{ position: 'relative', flexShrink: 0 }}
              onMouseEnter={e => {
                e.stopPropagation()
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setHoveredNoteId(c.id)
                setHoveredNoteRect({ top: rect.bottom + 6, left: rect.left, right: rect.right })
              }}
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
              {hoveredNoteId === c.id && hoveredNoteRect && createPortal(
                <div style={{
                  position: 'fixed',
                  top: Math.min(hoveredNoteRect.top, window.innerHeight - 320),
                  left: Math.max(8, Math.min(hoveredNoteRect.right - 300, window.innerWidth - 308)),
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: 12, width: 300,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  zIndex: 9999, pointerEvents: 'none',
                  display: 'flex', flexDirection: 'column', gap: 0,
                }}>
                  {visibleNotes.map((note: any, i: number) => (
                    <div key={note.id || i}>
                      {i > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />}
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>
                        {i === 0 ? 'Dernière note' : `Note ${i + 1}`} · {new Date(note.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--foreground)', whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {note.contenu}
                      </p>
                    </div>
                  ))}
                  {c.notes_candidat.length > 3 && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>+ {c.notes_candidat.length - 3} autre{c.notes_candidat.length > 4 ? 's' : ''} note{c.notes_candidat.length > 4 ? 's' : ''}</div>
                  )}
                </div>,
                document.body
              )}
            </div>
          )
        })()}

        {/* Toggles CFC + Engagée (a_traiter mode only) */}
        {importStatusFilter === 'a_traiter' && (
          <>
            <button
              onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation()
                const newVal = !c.cfc
                queryClient.setQueriesData({ queryKey: ['candidats'] }, (old: any) =>
                  old?.candidats
                    ? { ...old, candidats: old.candidats.map((x: any) => x.id === c.id ? { ...x, cfc: newVal } : x) }
                    : old
                )
                queryClient.setQueryData(['candidat', c.id], (old: any) => old ? { ...old, cfc: newVal } : old)
                try {
                  const res = await fetch(`/api/candidats/${c.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cfc: newVal }),
                  })
                  if (!res.ok) throw new Error()
                } catch {
                  queryClient.invalidateQueries({ queryKey: ['candidats'] })
                  queryClient.invalidateQueries({ queryKey: ['candidat', c.id] })
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
                queryClient.setQueryData(['candidat', c.id], (old: any) => old ? { ...old, deja_engage: newVal } : old)
                try {
                  const res = await fetch(`/api/candidats/${c.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deja_engage: newVal }),
                  })
                  if (!res.ok) throw new Error()
                } catch {
                  queryClient.invalidateQueries({ queryKey: ['candidats'] })
                  queryClient.invalidateQueries({ queryKey: ['candidat', c.id] })
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
                onClick={e => {
                  e.stopPropagation()
                  if (metierPopoverId === c.id) {
                    setMetierPopoverId(null)
                  } else {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setMetierPopoverRect({ top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right })
                    setMetierPopoverId(c.id)
                  }
                }}
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
              {metierPopoverId === c.id && metierPopoverRect && (
                <MetierPopover
                  candidatId={c.id}
                  currentTags={c.tags || []}
                  anchorRect={metierPopoverRect}
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
                    // Toujours invalider la fiche pour que l'ouverture suivante reflète les nouveaux tags
                    queryClient.invalidateQueries({ queryKey: ['candidat', c.id] })
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
      </motion.div>
    )
  }

  const selCount = selectedIds.size

  // ── Pipeline bulk-add ──
  const [showBulkPipelineModal, setShowBulkPipelineModal] = useState(false)
  const [bulkPipelineConsultant, setBulkPipelineConsultant] = useState('João')
  const [bulkPipelineMetier, setBulkPipelineMetier] = useState('')
  const [bulkPipelineSaving, setBulkPipelineSaving] = useState(false)

  const addSelectionToPipeline = useCallback(async () => {
    setBulkPipelineSaving(true)
    const ids = Array.from(selectedIds)
    try {
      await Promise.all(ids.map(id =>
        fetch(`/api/candidats/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statut_pipeline: 'nouveau', pipeline_consultant: bulkPipelineConsultant, pipeline_metier: bulkPipelineMetier || null }),
        })
      ))
      toast.success(`${ids.length} candidat${ids.length > 1 ? 's' : ''} ajouté${ids.length > 1 ? 's' : ''} au pipeline`)
      setSelectedIds(new Set())
      setShowBulkPipelineModal(false)
      window.location.href = '/pipeline'
    } catch { toast.error('Erreur lors de l\'ajout au pipeline') } finally { setBulkPipelineSaving(false) }
  }, [selectedIds, setSelectedIds, bulkPipelineConsultant, bulkPipelineMetier])

  return (
    <div className="d-page">
      {/* Header */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Users size={22} color="var(--primary)" />Candidats</h1>
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
          {/* Filtre "Non vus" */}
          {nonVusTotal > 0 && (
            <button
              onClick={() => {
                if (!filterNonVu) {
                  statusBeforeNonVuRef.current = importStatusFilter
                  sessionStorage.setItem('candidats_status_before_nonvu', importStatusFilter)
                }
                setFilterNonVu(v => !v)
                setPage(1)
              }}
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
                  const { ids } = await res.json() as { ids: { id: string; import_status: string }[] }
                  markTousVus(ids.map(item => item.id))
                  setNonVusTotal(0)
                  setNonVusParStatut({})
                  if (filterNonVu) {
                    setFilterNonVu(false)
                    setImportStatusFilter(statusBeforeNonVuRef.current)
                  }
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
                  // Persister cross-device dans Supabase user metadata + reset has_update DB
                  fetch('/api/candidats/mark-all-vu', { method: 'POST' }).catch(() => {})
                  markAllVu()
                  // Sync React state (sinon hasBadge() utilise l'ancien viewedAllAt du closure)
                  setViewedAllAt(new Date().toISOString())
                  // Clear has_update dans le cache React Query — évite refetch complet
                  queryClient.setQueriesData({ queryKey: ['candidats'] }, (old: any) => {
                    if (!old) return old
                    if (Array.isArray(old?.candidats)) {
                      return { ...old, candidats: old.candidats.map((c: any) => c?.has_update ? { ...c, has_update: false } : c) }
                    }
                    if (Array.isArray(old)) {
                      return old.map((c: any) => c?.has_update ? { ...c, has_update: false } : c)
                    }
                    return old
                  })
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

      {/* ── Selection action bar ── */}
      {selCount > 0 && (
        <div style={{
          background: 'var(--card)',
          border: '2px solid var(--primary)',
          borderRadius: 14, padding: '10px 14px', marginBottom: 16,
          boxShadow: '0 0 0 4px rgba(245,167,35,0.08)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* Ligne 1 : label + sélection + vu/non vu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Label */}
            <span style={{
              fontSize: 13, fontWeight: 800, color: 'var(--primary)',
              background: 'rgba(245,167,35,0.1)', borderRadius: 8,
              padding: '4px 10px', whiteSpace: 'nowrap',
            }}>
              {selCount} sélectionné{selCount > 1 ? 's' : ''}
            </span>

            {/* Séparateur */}
            <div style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />

            {/* Sélection */}
            <button onClick={selectAll} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'var(--primary)', color: '#0F172A', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <CheckCircle size={12} /> Tout ({sorted.length})
            </button>
            <button onClick={deselectAll} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'var(--secondary)', color: 'var(--foreground)',
              border: '1.5px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <X size={12} /> Désélectionner
            </button>

            {/* Séparateur */}
            <div style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />

            {/* Vu / Non vu */}
            <button onClick={() => { markTousVus(Array.from(selectedIds)); setSelectedIds(new Set()) }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: '#10B981', color: '#fff', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Eye size={12} /> Marquer vu
            </button>
            <button onClick={() => { Array.from(selectedIds).forEach(id => markCandidatNonVu(id)); setSelectedIds(new Set()) }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: '#64748B', color: '#fff', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Eye size={12} /> Non vu
            </button>
          </div>

          {/* Ligne 2 : actions contextuelles + actions globales */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Actions selon l'onglet */}
            {importStatusFilter === 'a_traiter' && (
              <>
                <button onClick={handleBulkValidate} disabled={updateImportStatus.isPending} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#16A34A', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <CheckCircle size={12} /> Valider ({selCount})
                </button>
                <button onClick={handleBulkArchive} disabled={updateImportStatus.isPending} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#6B7280', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Archive size={12} /> Archiver ({selCount})
                </button>
              </>
            )}
            {importStatusFilter === 'traite' && (
              <>
                <button onClick={() => { const ids = Array.from(selectedIds); updateImportStatus.mutate({ ids, status: 'a_traiter' }) }} disabled={updateImportStatus.isPending} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#3B82F6', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <RotateCw size={12} /> À traiter ({selCount})
                </button>
                <button onClick={handleBulkArchive} disabled={updateImportStatus.isPending} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#6B7280', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Archive size={12} /> Archiver ({selCount})
                </button>
                {/* Pipeline */}
                <button onClick={() => setShowBulkPipelineModal(true)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#8B5CF6', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <LayoutGrid size={12} /> Pipeline ({selCount})
                </button>
              </>
            )}
            {importStatusFilter === 'archive' && (
              <>
                <button onClick={handleBulkValidate} disabled={updateImportStatus.isPending} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#16A34A', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <CheckCircle size={12} /> Activer ({selCount})
                </button>
                <button onClick={() => { const ids = Array.from(selectedIds); updateImportStatus.mutate({ ids, status: 'a_traiter' }) }} disabled={updateImportStatus.isPending} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#3B82F6', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <RotateCw size={12} /> À traiter ({selCount})
                </button>
              </>
            )}

            {/* Séparateur */}
            <div style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />

            {/* Actions globales */}
            <button onClick={() => setShowMessage(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: '#0EA5E9', color: '#fff', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <MessageSquare size={12} /> Message ({selCount})
            </button>
            <button onClick={() => setShowDeleteConfirm(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: '#EF4444', color: '#fff', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Trash2 size={12} /> Supprimer ({selCount})
            </button>
          </div>
        </div>
      )}

      {/* Search bar — pleine largeur */}
      <div style={{ position: 'relative', marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <div className="search-wrapper" style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--muted)', transition: 'color 0.2s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)' }} />
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
                    boxShadow: '0 12px 40px rgba(0,0,0,0.15)', width: 280,
                  }}
                >
                  {/* Barre de recherche */}
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Rechercher un métier…"
                      value={metierSearch}
                      onChange={e => setMetierSearch(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                        fontSize: 12, background: 'var(--secondary)', color: 'var(--foreground)',
                        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ maxHeight: 340, overflowY: 'auto', padding: '6px 0' }}>
                  <button
                    onClick={() => { setFiltreMetier(''); setFilterMetier(''); setMetierSearch(''); setMetierDropdownOpen(false) }}
                    style={{
                      width: '100%', padding: '8px 14px', border: 'none', background: !filtreMetier ? 'var(--surface)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: !filtreMetier ? 700 : 400,
                      color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {!filtreMetier && <Check size={13} />} Tous les métiers
                  </button>
                  {metierCategories.map(cat => {
                    const catMetiers = cat.metiers.filter(m => agenceMetiers.includes(m) && (metierSearchNorm ? norm(m).includes(metierSearchNorm) : true))
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
                            onClick={() => { setFiltreMetier(m); setFilterMetier(m); setMetierSearch(''); setImportStatusFilter('traite'); setMetierDropdownOpen(false) }}
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
                  {unassigned.filter(m => metierSearchNorm ? norm(m).includes(metierSearchNorm) : true).length > 0 && (
                    <div>
                      <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Autres</div>
                      {unassigned.filter(m => metierSearchNorm ? norm(m).includes(metierSearchNorm) : true).map(m => (
                        <button
                          key={m}
                          onClick={() => { setFiltreMetier(m); setFilterMetier(m); setMetierSearch(''); setImportStatusFilter('traite'); setMetierDropdownOpen(false) }}
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
                </div>
              )}
            </div>
          )
        })()}

        {/* Statut import — onglets (pas un filtre) */}
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, border: '1px solid var(--border)' }}>
          {IMPORT_STATUS_OPTS.map((o, idx) => {
            const active = importStatusFilter === o.value
            const badgeCount = nonVusParStatut[o.value] || 0
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
                  position: 'relative',
                  borderRadius: idx === 0 ? '7px 0 0 7px' : idx === IMPORT_STATUS_OPTS.length - 1 ? '0 7px 7px 0' : 0,
                  padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: 'none', borderRight: '1px solid var(--border)',
                  background: active ? c.activeBg : c.bg,
                  color: active ? 'white' : c.color,
                  transition: 'all 0.15s',
                }}
              >
                {o.label}
                {badgeCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -5, right: -5, zIndex: 50,
                    background: '#EF4444', color: 'white',
                    borderRadius: '100px', fontSize: 9, fontWeight: 800,
                    padding: '1px 4px', lineHeight: 1.4, minWidth: 14,
                    textAlign: 'center', pointerEvents: 'none',
                    animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                  }}>
                    {badgeCount}
                  </span>
                )}
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
        {(search || activeFiltersCount > 0 || filtreStatut !== 'tous' || filterNonVu) && (
          <button
            onClick={resetAllFilters}
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
          {[...Array(7)].map((_, i) => (
            <div key={i} className="skeleton-card" style={{ opacity: 1 - i * 0.1 }}>
              <div className="shimmer" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }} />
              <div className="shimmer" style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div className="shimmer" style={{ height: 16, width: `${38 + (i % 3) * 10}%` }} />
                <div className="shimmer" style={{ height: 12, width: `${48 + (i % 4) * 8}%` }} />
              </div>
              <div className="shimmer" style={{ width: 44, height: 26, borderRadius: 6, flexShrink: 0 }} />
              <div className="shimmer" style={{ width: 70, height: 26, borderRadius: 6, flexShrink: 0 }} />
            </div>
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

      {/* CV Preview Overlay — rendu via portal pour éviter que les transform Framer Motion cassent position:fixed */}
      {hoveredCv && typeof document !== 'undefined' && createPortal(
        <div
          onMouseEnter={() => {
            if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
            setPreviewVisible(true)
          }}
          onMouseLeave={() => {
            if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
            hoveredCvTimeout.current = setTimeout(() => setPreviewVisible(false), 200)
          }}
          style={{
            position: 'fixed',
            top: panelTopRef.current,
            height: Math.min(Math.round((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.82), 800),
            left: (() => {
              const screenW = typeof window !== 'undefined' ? window.innerWidth : 1440
              const panelW = hoveredCv.panelW ?? 820
              const spaceRight = screenW - hoveredCv.x - 24
              const spaceLeft = hoveredCv.x - 24
              const goLeft = spaceRight < panelW && spaceLeft > spaceRight
              return goLeft ? undefined : hoveredCv.x + 12
            })(),
            right: (() => {
              const screenW = typeof window !== 'undefined' ? window.innerWidth : 1440
              const panelW = hoveredCv.panelW ?? 820
              const spaceRight = screenW - hoveredCv.x - 24
              const spaceLeft = hoveredCv.x - 24
              const goLeft = spaceRight < panelW && spaceLeft > spaceRight
              return goLeft ? screenW - hoveredCv.x + 12 : undefined
            })(),
            width: hoveredCv.panelW ?? 820,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            zIndex: 500,
            pointerEvents: previewVisible ? 'auto' : 'none',
            opacity: previewVisible ? 1 : 0,
            transition: 'opacity 0.15s ease',
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
                  <Image
                    src={hoveredCv.url}
                    alt="CV"
                    width={600}
                    height={850}
                    unoptimized
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
        </div>,
        document.body
      )}

      {/* Bulk pipeline modal */}
      {showBulkPipelineModal && typeof window !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowBulkPipelineModal(false)}>
          <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 16, width: 400, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 12px', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Ajouter {selCount} candidat{selCount > 1 ? 's' : ''} au pipeline</span>
              <button onClick={() => setShowBulkPipelineModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '0 24px 12px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <label style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>Consultant</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {['João', 'Seb'].map(c => (
                  <button key={c} onClick={() => setBulkPipelineConsultant(c)} style={{
                    padding: '6px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                    border: `1.5px solid ${bulkPipelineConsultant === c ? '#F5A623' : 'var(--border)'}`,
                    background: bulkPipelineConsultant === c ? '#F5A623' : 'var(--secondary)',
                    color: bulkPipelineConsultant === c ? '#000' : 'var(--foreground)',
                    fontWeight: bulkPipelineConsultant === c ? 700 : 400,
                  }}>{c}</button>
                ))}
              </div>
              <label style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>Métier (optionnel)</label>
              <input
                value={bulkPipelineMetier}
                onChange={e => setBulkPipelineMetier(e.target.value)}
                placeholder="Ex: Électricien, Maçon…"
                list="bulk-metiers-list"
                style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, background: 'var(--secondary)', color: 'var(--foreground)', boxSizing: 'border-box' }}
              />
              <datalist id="bulk-metiers-list">
                {agenceMetiers.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 24px 18px', borderTop: '1.5px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
              <button onClick={() => setShowBulkPipelineModal(false)} className="neo-btn" style={{ fontSize: 13, padding: '6px 14px' }}>Annuler</button>
              <button onClick={addSelectionToPipeline} disabled={bulkPipelineSaving} className="neo-btn-yellow" style={{ fontSize: 13, padding: '6px 14px' }}>
                {bulkPipelineSaving ? '…' : 'Ajouter au pipeline'}
              </button>
            </div>
          </div>
        </div>,
        document.body
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
            <div className="neo-card" style={{ maxWidth: 500, width: '92%', padding: 0, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
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

              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
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
                      const { number, countryCode, country } = detectAndFormat(c.telephone)
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ width: 30, height: 30, borderRadius: 6, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#64748B', flexShrink: 0 }}>
                            {formatInitials(c.prenom, c.nom)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{formatFullName(c.prenom, c.nom)}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#059669' }}>
                              <Phone size={10} /> {number}
                            </div>
                          </div>
                          {countryCode && (
                            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                              <span className={`fi fi-${countryCode}`} style={{ width: 18, height: 13, display: 'inline-block', backgroundSize: 'contain', borderRadius: 2 }} />
                              {country}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {sansTel.length > 0 && sansTel.map((c: any) => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FEF9EC', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', opacity: 0.8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--muted)', flexShrink: 0 }}>
                          {formatInitials(c.prenom, c.nom)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{formatFullName(c.prenom, c.nom)}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#D97706' }}>
                            <AlertTriangle size={10} /> Pas de numéro — sera ignoré
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Message
                    </div>
                    <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => setShowSmsTplDropdown(v => !v)}
                        style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 700,
                          border: '1.5px solid var(--border)', borderRadius: 7,
                          background: selectedSmsTpl ? '#EEF2FF' : 'var(--surface)',
                          color: selectedSmsTpl ? '#4F46E5' : 'var(--foreground)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {selectedSmsTpl ? `📄 ${selectedSmsTpl.nom}` : 'Templates'}
                        <ChevronDown size={11} />
                      </button>
                      {messageText.trim() && (
                        <button
                          type="button"
                          onClick={() => setShowSaveTpl(true)}
                          title="Sauvegarder le message courant comme template"
                          style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 700,
                            border: '1.5px solid var(--border)', borderRadius: 7,
                            background: 'var(--surface)', color: 'var(--foreground)',
                            cursor: 'pointer',
                          }}
                        >
                          Sauvegarder
                        </button>
                      )}
                      {showSmsTplDropdown && (
                        <div style={{
                          position: 'absolute', top: '100%', right: 0, marginTop: 4,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
                          padding: 4, minWidth: 200, maxHeight: 260, overflowY: 'auto', zIndex: 60,
                        }}>
                          {smsTemplates.length === 0 ? (
                            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)' }}>
                              Aucun template SMS
                            </div>
                          ) : (
                            smsTemplates.map(t => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => applySmsTemplate(t.id)}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left',
                                  padding: '6px 10px', borderRadius: 6, border: 'none',
                                  background: smsTplId === t.id ? 'var(--primary-soft)' : 'transparent',
                                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                  color: 'var(--foreground)', fontFamily: 'inherit',
                                }}
                              >
                                {t.nom}
                              </button>
                            ))
                          )}
                          {selectedSmsTpl && (
                            <button
                              type="button"
                              onClick={() => { setSmsTplId(null); setShowSmsTplDropdown(false); setSmsMetier(''); setSmsLieu('') }}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '6px 10px', borderRadius: 6, border: 'none',
                                background: 'transparent', cursor: 'pointer',
                                fontSize: 11, fontWeight: 600, color: '#DC2626',
                                fontFamily: 'inherit', marginTop: 4, borderTop: '1px solid var(--border)',
                              }}
                            >
                              ✕ Retirer template
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {(tplHasMetier || tplHasLieu) && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {tplHasMetier && (
                        <input
                          type="text"
                          value={smsMetier}
                          onChange={e => setSmsMetier(e.target.value)}
                          placeholder="Métier recherché"
                          style={{
                            flex: 1, padding: '7px 10px', fontSize: 13,
                            border: '1.5px solid #C7D2FE', borderRadius: 8,
                            background: '#EEF2FF', color: 'var(--foreground)',
                            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                          }}
                        />
                      )}
                      {tplHasLieu && (
                        <input
                          type="text"
                          value={smsLieu}
                          onChange={e => setSmsLieu(e.target.value)}
                          placeholder="Lieu de mission"
                          style={{
                            flex: 1, padding: '7px 10px', fontSize: 13,
                            border: '1.5px solid #C7D2FE', borderRadius: 8,
                            background: '#EEF2FF', color: 'var(--foreground)',
                            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                          }}
                        />
                      )}
                    </div>
                  )}

                  <textarea
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    placeholder="Bonjour, nous avons une opportunité qui pourrait vous intéresser..."
                    rows={selectedSmsTpl ? 8 : 4}
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

              </div>

              {/* Footer sticky — boutons toujours visibles */}
              <div style={{ padding: '14px 24px 18px', borderTop: '1.5px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                {avecTel.length === 0 && (
                  <p style={{ fontSize: 12, color: '#D97706', textAlign: 'center', margin: 0 }}>
                    Aucun candidat sélectionné n&apos;a de numéro de téléphone.
                  </p>
                )}
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
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal Sauvegarder template SMS */}
      {showSaveTpl && typeof window !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }} onClick={() => setShowSaveTpl(false)}>
          <div
            className="neo-card"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 420, width: '92%', padding: 0, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '20px 24px 12px', flexShrink: 0, fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>
              Sauvegarder comme template SMS
            </div>
            <div style={{ padding: '0 24px 14px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <input
                type="text"
                autoFocus
                value={saveTplName}
                onChange={e => setSaveTplName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveAsSmsTemplate() }}
                placeholder="Nom du template (ex: Recherche maçon)"
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 14,
                  border: '1.5px solid var(--border)', borderRadius: 10,
                  background: 'var(--background)', color: 'var(--foreground)',
                  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '12px 24px 18px', borderTop: '1.5px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
              <button onClick={() => setShowSaveTpl(false)} className="neo-btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>
                Annuler
              </button>
              <button
                onClick={saveAsSmsTemplate}
                disabled={!saveTplName.trim()}
                className="neo-btn"
                style={{ flex: 1, justifyContent: 'center', background: '#4F46E5', color: 'white', boxShadow: 'none', opacity: saveTplName.trim() ? 1 : 0.4 }}
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

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
