'use client'
import Image from 'next/image'
import { detectAndFormat, toWaPhone } from '@/lib/phone-format'
import { formatFullName, formatInitials, formatEmail, formatCity } from '@/lib/format-candidat'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { CvPreviewCanvas } from './CvPreviewCanvas'
import DeleteConfirmModal from './DeleteConfirmModal'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Upload, Search, Trash2, ChevronDown, ChevronRight, ChevronLeft,
  Check, X, SortAsc, Sparkles, Loader2,
  MessageSquare, MessageCircle, Phone, AlertTriangle, Eye, MapPin, SlidersHorizontal, Star, RotateCw,
  CheckCircle, Archive, Briefcase, Info, GraduationCap, Pencil, LayoutGrid, Users,
} from 'lucide-react'

import { toast } from 'sonner'
import { RecentContactsWarning, useRecentContacts } from '@/components/RecentContactsWarning'
import LinkOffreModal from '@/components/LinkOffreModal'
import MetierPicker from '@/components/MetierPicker'
import { parseBooleanSearch, normalize } from '@/lib/boolean-search'
import { useUpload } from '@/contexts/UploadContext'
import { useCandidats, useDeleteCandidatsBulk, useUpdateStatutCandidat, useUpdateImportStatusBulk } from '@/hooks/useCandidats'
import { useQueryClient } from '@tanstack/react-query'
import { useMetiers } from '@/hooks/useMetiers'
import { useMetierCategories } from '@/hooks/useMetierCategories'
import type { PipelineEtape, ImportStatus } from '@/types/database'

// ── Badge rouge : par candidat, persist dans localStorage ──────────────────
// Badge actif si : created_at dans les 30 derniers jours ET fiche jamais ouverte
import { markCandidatVu, markCandidatNonVu, markTousVus, markAllVu, getViewedSet, ensureInit, refreshViewedFromDB, hasBadge } from '@/lib/badge-candidats'
import { onRecentlyUpdatedChange, getRecentlyUpdatedEntry, relativeMinutes, getBadgeStyleForType, clearAllRecentlyUpdated } from '@/lib/recently-updated'
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
// v1.9.121 — option additionnelle visible uniquement quand un filtre rayon (ville+km) est actif
const SORT_OPT_DISTANCE = { value: 'distance_asc', label: '📍 Plus proche' }

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

// v1.9.70 : parser booléen extrait dans lib/boolean-search.ts (partagé avec ClientPicker)
// (Import + re-export au top du fichier)

// v2.0.1 — Onglet 'archive' supprimé (inutilisable selon retour João)
const IMPORT_STATUS_OPTS = [
  { value: 'traite',    label: 'Actif' },
  { value: 'a_traiter', label: 'À traiter' },
]

// ─── Popover de sélection de métier (exporté pour réutilisation sur la fiche candidat) ───
export function MetierPopover({ candidatId, currentTags, onClose, onSave, anchorRect }: {
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
  // v1.9.94 — useCandidatsRealtime() retiré : déplacé dans <RealtimeBridge /> au layout level
  // pour rester actif sur TOUTES les pages dashboard (pas juste /candidats). Capte ainsi les
  // UPDATE pendant un sync OneDrive lancé depuis /integrations → badge instantané au retour.

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

  const [sortBy, setSortBy]               = useState<'date_desc' | 'date_asc' | 'nom_az' | 'titre_az' | 'distance_asc'>(() => ssGet('sort', 'date_desc'))
  const [groupByMetier, setGroupByMetier] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // v1.9.71 : persiste la sélection checkbox dans sessionStorage (même session, réapparait au retour)
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem('candidats_selected_ids')
      if (!raw) return new Set()
      const arr = JSON.parse(raw)
      return new Set(Array.isArray(arr) ? arr : [])
    } catch { return new Set() }
  })
  const [badgeTick, setBadgeTick]         = useState(0) // forcer re-render quand badges changent
  const [recentlyUpdatedTick, setRecentlyUpdatedTick] = useState(0) // re-render badge vert "Actualisé"
  const [isReady, setIsReady]             = useState(false) // masquer non-vus avant ensureInit()
  const [nonVusTotal, setNonVusTotal]     = useState(0) // total non-vus tous pages confondus
  const [nonVusParStatut, setNonVusParStatut] = useState<Record<string, number>>({}) // non-vus par import_status
  const [viewedAllAt, setViewedAllAt]     = useState<string | null>(null) // timestamp "Tout marquer vu"

  // Listener badge vert "✓ Actualisé" — recalcule l'affichage au changement du map
  // + tick 60s pour auto-expirer visuellement le badge sans reload.
  useEffect(() => {
    const unsub = onRecentlyUpdatedChange(() => setRecentlyUpdatedTick(t => t + 1))
    const interval = setInterval(() => setRecentlyUpdatedTick(t => t + 1), 60_000)
    return () => { unsub(); clearInterval(interval) }
  }, [])

  // Écouter l'événement global de changement de badges (ouverture fiche, marquer vu, etc.)
  // v1.9.91 — le handler refetch AUSSI le viewedSet depuis DB (avant: juste re-render).
  //           Sans ça, après un upload manuel ou cron OneDrive, le serveur DELETE candidats_vus
  //           par candidat_id pour faire réapparaître le badge, mais le viewedSet local garde
  //           l'ID → hasBadge(viewedSet.has(id)=true) → badge invisible jusqu'au prochain focus.
  //           Désormais instantané après dispatchBadgesChanged().
  useEffect(() => {
    const refresh = () => {
      refreshViewedFromDB().then(({ viewedAllAt: vaa }) => {
        setViewedAllAt(vaa)
        setBadgeTick(t => t + 1)
      })
    }
    window.addEventListener('talentflow:badges-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('talentflow:badges-changed', refresh)
      window.removeEventListener('focus', refresh)
    }
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
      .then(({ ids }: { ids: { id: string; import_status: string; created_at: string; last_import_at?: string | null }[] }) => {
        const vs = getViewedSet()
        const nonVus = ids.filter(item => hasBadge(item.id, item.created_at, vs, viewedAllAt, item.last_import_at))
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
  const [showWhatsApp, setShowWhatsApp]   = useState(false)
  const [showLinkOffre, setShowLinkOffre] = useState(false) // v1.9.71 — modal "Lier à commande"
  const [waOpenedIds, setWaOpenedIds]     = useState<Set<string>>(new Set())
  const [waCampagneId, setWaCampagneId]   = useState<string | null>(null)
  const [waLogged, setWaLogged]           = useState(false)
  const [messageText, setMessageText]     = useState('')
  const [smsTemplates, setSmsTemplates]   = useState<any[]>([])
  const [waTemplates, setWaTemplates]     = useState<any[]>([])
  const [warningDismissed, setWarningDismissed] = useState(false) // v1.9.68
  const [showSmsTplDropdown, setShowSmsTplDropdown] = useState(false)
  const [smsTplId, setSmsTplId]           = useState<string | null>(null)
  const [smsMetier, setSmsMetier]         = useState('')
  const [smsLieu, setSmsLieu]             = useState('')
  const [showSaveTpl, setShowSaveTpl]     = useState(false)
  const [saveTplName, setSaveTplName]     = useState('')

  // Charger les templates SMS à l'ouverture du modal iMessage/SMS
  useEffect(() => {
    if (!showMessage) return
    fetch('/api/email-templates?type=sms')
      .then(r => r.json())
      .then(d => setSmsTemplates(d.templates || []))
      .catch(() => {})
    setWarningDismissed(false) // v1.9.68 — reset warning à chaque ouverture
  }, [showMessage])

  // v1.9.68 — Charger les templates WhatsApp à l'ouverture du modal WhatsApp bulk
  useEffect(() => {
    if (!showWhatsApp) return
    fetch('/api/email-templates?type=whatsapp')
      .then(r => r.json())
      .then(d => setWaTemplates(d.templates || []))
      .catch(() => {})
    // Reset template selection + champs quand on rouvre la modal (évite de garder l'état SMS précédent)
    setSmsTplId(null)
    setSmsMetier('')
    setSmsLieu('')
    setMessageText('')
    setWarningDismissed(false) // v1.9.68 — reset warning à chaque ouverture
  }, [showWhatsApp])

  // v1.9.68 — Warning 7 jours : fetch les contacts récents des candidats sélectionnés
  const selectedIdsArray = Array.from(selectedIds)
  const { contacts: recentContacts } = useRecentContacts(
    selectedIdsArray,
    (showMessage || showWhatsApp) && selectedIdsArray.length > 0
  )

  // Recalcul live du message quand on change métier/lieu avec un template actif
  // (couvre SMS ET WhatsApp — un seul smsTplId, on cherche dans les 2 listes)
  const selectedSmsTpl = smsTemplates.find(t => t.id === smsTplId) || null
  const selectedWaTpl = waTemplates.find(t => t.id === smsTplId) || null
  const activeTpl = selectedSmsTpl || selectedWaTpl
  useEffect(() => {
    if (!activeTpl) return
    const out = (activeTpl.corps || '')
      .replace(/\[MÉTIER\]/g, smsMetier || '[MÉTIER]')
      .replace(/\[LIEU\]/g, smsLieu || '[LIEU]')
    setMessageText(out)
  }, [activeTpl, smsMetier, smsLieu])

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
  // v1.9.110 — Filtre rayon (autocomplete ville + slider km)
  const [villeRayon, setVilleRayon] = useState<{ lat: number; lng: number; label: string; pays?: 'Suisse' | 'France' } | null>(() => ssGet('fVilleRayon', null))
  const [rayonKm, setRayonKm] = useState<number>(() => ssGet('fRayonKm', 25))
  const [villeQuery, setVilleQuery] = useState('')
  const [villeSuggestions, setVilleSuggestions] = useState<Array<{ label: string; cp: string; ville: string; pays: 'Suisse' | 'France'; lat: number; lng: number }>>([])
  const [showVilleDropdown, setShowVilleDropdown] = useState(false)
  const villeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // v1.9.71 : Persiste la sélection checkbox (sessionStorage = reset au logout/fermeture onglet)
  useEffect(() => {
    try {
      sessionStorage.setItem('candidats_selected_ids', JSON.stringify(Array.from(selectedIds)))
    } catch {}
  }, [selectedIds])

  // Persister les filtres dans sessionStorage
  useEffect(() => { ssSet('sort', sortBy) }, [sortBy])
  // v1.9.74 : sync filterNonVu → sessionStorage (évite désalignement state/ss après resetAllFilters)
  useEffect(() => { sessionStorage.setItem('candidats_filter_nonvu', filterNonVu ? '1' : '0') }, [filterNonVu])
  useEffect(() => { ssSet('showAdv', showAdvancedFilters) }, [showAdvancedFilters])
  useEffect(() => { ssSet('fMetier', filterMetier) }, [filterMetier])
  useEffect(() => { ssSet('fLieu', filterLieu) }, [filterLieu])
  // v1.9.110 — persist rayon filter
  useEffect(() => { ssSet('fVilleRayon', villeRayon) }, [villeRayon])
  useEffect(() => { ssSet('fRayonKm', rayonKm) }, [rayonKm])
  // v1.9.121 — auto-reset du tri "Plus proche" si l'utilisateur retire le filtre rayon
  useEffect(() => {
    if (!villeRayon && sortBy === 'distance_asc') setSortBy('date_desc')
  }, [villeRayon, sortBy])
  // v1.9.110 — debounce autocomplete ville (200ms)
  useEffect(() => {
    if (villeDebounceRef.current) clearTimeout(villeDebounceRef.current)
    if (villeQuery.trim().length < 2) { setVilleSuggestions([]); return }
    villeDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/villes/suggestions?q=${encodeURIComponent(villeQuery.trim())}`)
        if (res.ok) {
          const data = await res.json()
          setVilleSuggestions(Array.isArray(data) ? data : [])
        }
      } catch {}
    }, 200)
    return () => { if (villeDebounceRef.current) clearTimeout(villeDebounceRef.current) }
  }, [villeQuery])
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
  // v1.9.129 — tooltip métiers multi : portalisé (échappe au overflow:hidden du wrapper info col)
  const [metierTooltip, setMetierTooltip] = useState<{ tags: string[]; top: number; left: number; bottom: number; width: number } | null>(null)
  const [notePopoverRect, setNotePopoverRect] = useState<{ top: number; left: number; bottom: number; right: number } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)

  // v1.9.128 — Fermer le popover notes au click outside + Esc
  useEffect(() => {
    if (!notePopoverId) return
    const close = () => { setNotePopoverId(null); setNoteText(''); setNotePopoverRect(null); setEditNoteId(null) }
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Ne pas fermer si on clique dans le popover lui-même OU sur le bouton notes qui l'a ouvert
      if (target.closest('[data-notes-popover]') || target.closest('[data-notes-trigger]')) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [notePopoverId])
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
  // v1.9.65 : 300ms → 150ms. Couplé avec placeholderData=(prev)=>prev dans useCandidats,
  // la liste ne flicker pas entre deux fetchs → feel quasi-instantané.
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 150)
    return () => clearTimeout(timer)
  }, [search])

  const [page, setPage] = useState<number>(() => ssGet('page', 1))
  // Persist page + perPage
  useEffect(() => { ssSet('page', page) }, [page])
  useEffect(() => { ssSet('perPage', perPage) }, [perPage])
  // Détecter la recherche booléenne
  const hasBooleanSearch = /\b(ET|AND|OU|OR|SAUF|NOT)\b/i.test(debouncedSearch) || /[()]/.test(debouncedSearch)
  // Fix 5 — pour les requêtes booléennes ET/AND uniquement : extraire les mots et envoyer
  // au serveur comme pré-filtre (la nouvelle RPC fait AND entre mots → résultat identique).
  // Pour OU/OR/SAUF/NOT ou parenthèses : fetch tout côté client.
  const booleanHasOr = /\b(OU|OR|SAUF|NOT)\b/i.test(debouncedSearch) || /[()]/.test(debouncedSearch)
  const booleanServerTerms = hasBooleanSearch && !booleanHasOr
    ? debouncedSearch.replace(/\b(ET|AND)\b/gi, ' ').replace(/\s+/g, ' ').trim()
    : null

  // Reset page + sélection quand les filtres changent (skip au premier render)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setPage(1)
    setSelectedIds(new Set())
  }, [debouncedSearch, filtreStatut, importStatusFilter, sortBy, perPage, filterGenre, filterAgeMin, filterAgeMax, filterLangue, filterPermis, filterLieu, filterMetier, filterNonVu, filterCfc, filterEngage, villeRayon, rayonKm])

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
    // v1.9.110 — filtre rayon
    lat: villeRayon?.lat,
    lng: villeRayon?.lng,
    rayon_km: villeRayon ? rayonKm : undefined,
  })
  const allCandidats = candidatsData?.candidats || []
  const totalCandidatsRaw = candidatsData?.total ?? allCandidats.length

  // v1.9.65 — Prefetch de la page suivante dès que la courante est chargée
  // → clic "page suivante" = instantané (React Query lit le cache).
  useEffect(() => {
    if (clientSideFilter) return
    const totalPagesDyn = candidatsData?.total_pages || 1
    if (page >= totalPagesDyn) return
    const nextFilters = {
      statut: filtreStatut === 'tous' ? undefined : filtreStatut,
      import_status: importStatusFilter as ImportStatus,
      search: booleanServerTerms || (hasBooleanSearch ? undefined : (debouncedSearch || undefined)),
      page: page + 1,
      per_page: perPage,
      sort: sortBy,
      genre: filterGenre || undefined,
      langue: filterLangue || undefined,
      permis: filterPermis,
      lieu: filterLieu || undefined,
      metier: filterMetier || undefined,
      cfc: filterCfc === true ? 'true' as const : undefined,
      engage: filterEngage === true ? 'true' as const : undefined,
      // v1.9.110
      lat: villeRayon?.lat,
      lng: villeRayon?.lng,
      rayon_km: villeRayon ? rayonKm : undefined,
    }
    queryClient.prefetchQuery({
      queryKey: ['candidats', nextFilters],
      queryFn: async () => {
        const params = new URLSearchParams()
        Object.entries(nextFilters).forEach(([k, v]) => {
          if (v === undefined || v === null || v === '') return
          if (typeof v === 'boolean') params.set(k, v ? 'true' : 'false')
          else params.set(k, String(v))
        })
        const res = await fetch(`/api/candidats?${params}`)
        if (!res.ok) throw new Error('Erreur chargement candidats')
        const data = await res.json()
        return {
          candidats: data.candidats || [],
          total: data.total ?? 0,
          page: data.page || 1,
          per_page: data.per_page || 20,
          total_pages: data.total_pages || 1,
        }
      },
      staleTime: 30_000,
    })
  }, [page, candidatsData?.total_pages, clientSideFilter, debouncedSearch, filtreStatut, importStatusFilter, perPage, sortBy, filterGenre, filterLangue, filterPermis, filterLieu, filterMetier, filterCfc, filterEngage, hasBooleanSearch, booleanServerTerms, queryClient])

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

    // v1.9.65.1 — Instant narrow-down pendant que la recherche serveur est en vol.
    // Dès que l'user tape une lettre, on filtre la page déjà affichée → aucun lag perçu.
    // Quand le serveur répond (debounce 150ms + round-trip), il remplace avec le résultat complet.
    if (search && search !== debouncedSearch && search.trim().length >= 1 && !parseBooleanSearch(search)) {
      const q = normalize(search.trim())
      filtered = filtered.filter((c: any) => {
        const hay = normalize([
          c.prenom, c.nom, c.titre_poste, c.email, c.telephone,
          c.localisation, c.formation,
          ...(c.competences || []),
          ...(c.tags || []),
        ].filter(Boolean).join(' '))
        return hay.includes(q)
      })
    }

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
    villeRayon !== null,
  ].filter(Boolean).length

  const resetFiltersOnly = () => {
    setFiltreStatut('tous')
    setImportStatusFilter('traite')
    setFilterMetier(''); setFilterLieu(''); setFilterAgeMin(''); setFilterAgeMax('')
    setFilterLangue(''); setFilterPermis(null); setFilterGenre(''); setFilterStarsMin('')
    setFilterCfc(null); setFilterEngage(null)
    setFiltreMetier(''); setFiltreLocalisation('')
    setFilterNonVu(false)
    // v1.9.110 — reset rayon filter
    setVilleRayon(null); setRayonKm(25); setVilleQuery(''); setVilleSuggestions([])
  }

  const resetAllFilters = () => {
    setSearch(''); ssSet('search', '')
    resetFiltersOnly()
    // v1.9.71 : "Tout effacer" vide aussi la sélection
    setSelectedIds(new Set())
    // v1.9.74 : nettoyage COMPLET des clés sessionStorage externes à candidats_filters
    try {
      sessionStorage.removeItem('candidats_filter_nonvu')
      sessionStorage.removeItem('candidats_status_before_nonvu')
      sessionStorage.removeItem('candidats_selected_ids')
      sessionStorage.removeItem(FILTERS_KEY) // clé consolidée — tout reset d'un coup
    } catch {}
  }

  // Tri côté serveur — seul le tri par distance reste côté client
  const sorted = useMemo(() => {
    let result = candidatsFiltres
    // Filtre "non vu" — client-side
    if (filterNonVu) {
      const vs = getViewedSet()
      result = result.filter((c: any) => hasBadge(c.id, c.created_at, vs, viewedAllAt, c.last_import_at))
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

  // Group by métier
  const grouped = useMemo(() => {
    if (!groupByMetier) return null
    const groups: Record<string, any[]> = {}
    for (const c of sorted) {
      const key = c.titre_poste?.trim() || 'Sans métier'
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Sans métier') return 1
      if (b === 'Sans métier') return -1
      return a.localeCompare(b, 'fr')
    })
  }, [sorted, groupByMetier])

  // Selection helpers
  // v1.9.122 — Cache des candidats sélectionnés (donnée complète) pour préserver
  // la sélection lors de changements de page. Avant : `sorted.filter(selectedIds.has(...))`
  // ne ramenait que la page courante → modal Message/WhatsApp / bulk Pipeline ne voyaient
  // pas les candidats sélectionnés sur d'autres pages. useRef = lecture au moment du clic
  // (modaux), pas besoin de re-render.
  const selectedDataRef = useRef<Map<string, any>>(new Map())

  // Synchronise le cache avec la page courante : à chaque update de `sorted`, on rafraîchit
  // les entrées des candidats sélectionnés ET visibles (au cas où la donnée en DB a changé).
  useEffect(() => {
    for (const c of sorted) {
      if (selectedIds.has(c.id)) selectedDataRef.current.set(c.id, c)
    }
  }, [sorted, selectedIds])

  // Helper : récupère tous les candidats sélectionnés (toutes pages confondues).
  // Cache en priorité, fallback sur `sorted` (cas de cache manquant après hard refresh).
  const getAllSelectedCandidats = useCallback((): any[] => {
    const out: any[] = []
    for (const id of selectedIds) {
      const c = selectedDataRef.current.get(id) || sorted.find((s: any) => s.id === id)
      if (c) out.push(c)
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, sorted])

  const toggleSelect = useCallback((id: string, candidat?: any) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        selectedDataRef.current.delete(id)
      } else {
        next.add(id)
        if (candidat) selectedDataRef.current.set(id, candidat)
      }
      return next
    })
  }, [])

  const selectAll = () => {
    for (const c of sorted) selectedDataRef.current.set(c.id, c)
    setSelectedIds(new Set(sorted.map((c: any) => c.id)))
  }
  const deselectAll = () => {
    selectedDataRef.current.clear()
    setSelectedIds(new Set())
  }

  const toggleSelectGroup = (ids: string[]) => {
    const allSelected = ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        ids.forEach(id => { next.delete(id); selectedDataRef.current.delete(id) })
      } else {
        ids.forEach(id => {
          next.add(id)
          const c = sorted.find((s: any) => s.id === id)
          if (c) selectedDataRef.current.set(id, c)
        })
      }
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

    // v1.9.66 — log fire-and-forget AVANT ouverture de l'app native.
    // L'UI ne bloque pas dessus : si le log échoue, l'envoi continue normalement.
    // v1.9.122 — utilise le cache toutes-pages au lieu de sorted (filtrait page courante).
    const selectedCandidats = getAllSelectedCandidats()
    const avecTelIds = selectedCandidats.filter((c: any) => c.telephone).map((c: any) => c.id)
    if (avecTelIds.length > 0 && messageText?.trim()) {
      fetch('/api/messages/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          candidat_ids: avecTelIds,
          destinataires: formatted,
          canal: 'imessage',
          corps: messageText,
        }),
      }).catch(() => { /* silent */ })
    }

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

  const handleCardClick = (id: string, candidat?: any) => {
    if (selectedIds.size > 0) toggleSelect(id, candidat)
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
    return sorted.filter(c => hasBadge(c.id, c.created_at, viewedSet, viewedAllAt, (c as any).last_import_at)).length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, badgeTick, viewedAllAt])

  const renderCard = (c: any) => {
    const selected = selectedIds.has(c.id)
    const age = calculerAge(c.date_naissance)
    const hasCv = !!c.cv_url
    const cvExt = (c.cv_nom_fichier || '').toLowerCase().split('.').pop() || ''
    // Badge rouge si : last_import_at > seen_at OU (créé dans les 30 derniers jours ET fiche jamais ouverte)
    const isNewCandidat = hasBadge(c.id, c.created_at, viewedSet, viewedAllAt, (c as any).last_import_at)

    return (
      <motion.div
        key={c.id}
        onClick={() => handleCardClick(c.id, c)}
        onMouseEnter={() => handleCardHover(c.id)}
        whileTap={{ scale: 0.997 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="clist-row-v2"
        style={{
          // v2.0.3 — Compaction (demande João) : padding 12/18→8/14, gap 14→10, radius 14→12
          display: 'flex', alignItems: 'center', gap: 10,
          background: selected ? 'var(--primary-soft)' : 'var(--surface)',
          border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 12, padding: '8px 14px',
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 2px rgba(255,232,0,0.2)' : 'none',
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
        {/* Badge coloré "nouveau/actualisé/réactivé" :
            - Import MANUEL (localStorage)  - Import ONEDRIVE (DB onedrive_change_type + onedrive_change_at)
            Types : 'nouveau' (vert), 'mis_a_jour' (bleu), 'reactive' (jaune).
            Priorité : manuel (plus frais) sur OneDrive.
            v1.9.111 — Aligné sur le badge rouge "non vu" : disparaît dès que l'utilisateur
            a ouvert la fiche (viewedSet). Plus de TTL 10 min — reste visible tant que pas vu. */}
        {(() => {
          void recentlyUpdatedTick
          void badgeTick
          // v1.9.111 — masquer dès que la fiche est ouverte (cohérent avec badge rouge non-vu)
          if (viewedSet.has(c.id)) return null
          const manuel = getRecentlyUpdatedEntry(c.id)
          const onedriveType = (c as any).onedrive_change_type as ('nouveau' | 'reactive' | 'mis_a_jour' | null) | undefined
          const type = manuel?.type ?? onedriveType ?? null
          if (!type) return null
          const style = getBadgeStyleForType(type)
          const titleExtra = manuel ? ` — ${relativeMinutes(manuel.ts)}` : ' (OneDrive)'
          return (
            <span
              title={`${style.label}${titleExtra}`}
              style={{
                position: 'absolute', top: 6, right: 6,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 999,
                background: style.bg, color: style.fg,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
                border: `1px solid ${style.border}`,
                zIndex: 2, whiteSpace: 'nowrap',
              }}
            >
              {style.label}
            </span>
          )
        })()}
        {/* Checkbox */}
        <div
          onClick={e => { e.stopPropagation(); toggleSelect(c.id, c) }}
          style={{
            flex: '0 0 20px', height: 20, borderRadius: 6,
            border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
            background: selected ? 'var(--primary)' : 'var(--surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {selected && <Check size={11} color="var(--foreground)" strokeWidth={3} />}
        </div>

        {/* Avatar — v1.9.135 : hover déclenche preview CV ancré à DROITE DE LA PHOTO (pas à la souris) */}
        <div
          onMouseEnter={hasCv ? (e) => {
            if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
            // v1.9.135 — capturer le rect de l'avatar maintenant (le rect après async timeout n'est plus fiable)
            const avatarRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            hoveredCvTimeout.current = setTimeout(() => {
              const savedRot = localStorage.getItem(`cv_rotation_${c.id}`)
              const rotation = savedRot ? parseInt(savedRot, 10) : 0
              const screenW = window.innerWidth
              const screenH = window.innerHeight
              // Anchor : panel TOUJOURS à droite de la photo (just-after avec 12 px gap)
              const anchorX = avatarRect.right    // bord droit de la photo
              const anchorY = avatarRect.top + avatarRect.height / 2  // centre vertical de la photo
              const spaceRight = screenW - anchorX - 24
              const spaceLeft  = avatarRect.left - 24
              const panelW = Math.min(820, Math.max(480, Math.max(spaceRight, spaceLeft)) - 8)
              const initZoom = Math.min(1, +(panelW / 840).toFixed(2))
              const panelH = Math.min(Math.round(screenH * 0.82), 800)
              // Top du panel : aligné sur le centre de la photo
              const idealTop = anchorY - panelH / 2
              const newTop = Math.max(12, Math.min(idealTop, screenH - panelH - 12))
              panelTopRef.current = newTop
              setPreviewData({ url: c.cv_url, ext: cvExt, x: anchorX, y: anchorY, rotation, panelW })
              setPreviewZoom(initZoom)
              setPreviewVisible(true)
            }, 60) // v2.0.3 — délai 200→60ms pour ouverture quasi instantanée
          } : undefined}
          onMouseLeave={hasCv ? () => {
            if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
            hoveredCvTimeout.current = setTimeout(() => setPreviewVisible(false), 80) // v2.0.3 — disparition rapide
          } : undefined}
          style={{
            position: 'relative', flex: '0 0 56px',
            height: 56,
            cursor: hasCv ? 'zoom-in' : 'default',
            transition: 'transform 0.12s ease',
          }}
          onMouseOver={hasCv ? (e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)' } : undefined}
          onMouseOut={hasCv ? (e) => { (e.currentTarget as HTMLElement).style.transform = 'none' } : undefined}
          title={hasCv ? 'Survoler pour prévisualiser le CV' : ''}
        >
          {(c.photo_url && c.photo_url !== 'checked')
            ? <Image src={c.photo_url} width={56} height={56} unoptimized style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 9, flexShrink: 0, display: 'block' }} alt="" />
            : (
              <div
                style={{
                  width: 56, height: 56, borderRadius: 9,
                  background: 'var(--bg-muted, #F1F5F9)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18, fontWeight: 700,
                  color: 'var(--text-muted, #64748B)', flexShrink: 0, overflow: 'hidden',
                }}
              >
                {initiales(c)}
              </div>
            )
          }
          {/* Petit badge CV en bas-droit pour signaler la disponibilité */}
          {/* v2.0.3 — Petit œil supprimé (la fonctionnalité hover CV est conservée sur l'avatar) */}
        </div>

        {/* Info — largeur fixe + fade à droite quand le contenu déborde (nom long, métier long…) */}
        <div style={{
          flex: '0 0 260px', minWidth: 0, overflow: 'hidden', position: 'relative',
          // Masque dégradé sur les 24 derniers px pour fade gracieux quand débordement
          WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 24px), transparent 100%)',
          maskImage: 'linear-gradient(to right, #000 calc(100% - 24px), transparent 100%)',
        }}>
          <div title={formatFullName(c.prenom, c.nom)} style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatFullName(c.prenom, c.nom)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'nowrap', alignItems: 'center', overflow: 'hidden' }}>
            {/* v1.9.127 — Sous-titre = pill MÉTIER ASSIGNÉ cliquable (ouvre le picker MetierPopover).
                Le bouton métier dupliqué à la fin est désormais caché (display:none).
                v1.9.127 — flex-wrap nowrap + overflow hidden pour rester sur 1 ligne avec fade au parent. */}
            {(() => {
              const configuredTags = (c.tags || []).filter((t: string) => agenceMetiers.includes(t))
              const hasTags = configuredTags.length > 0
              const tagColor = hasTags ? (getColorForMetier(configuredTags[0]) || '#3B82F6') : '#3B82F6'
              return (
                <button
                  onMouseDown={(e) => {
                    // v1.9.128 — Bloquer mousedown DOM natif (le listener du popover écoute en bubble natif,
                    // React stopPropagation seul ne suffit pas). On le fait UNIQUEMENT si ce candidat a le popover
                    // ouvert pour permettre le toggle (sinon pas besoin de bloquer).
                    if (metierPopoverId === c.id) {
                      e.stopPropagation()
                      e.nativeEvent.stopImmediatePropagation()
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (metierPopoverId === c.id) {
                      setMetierPopoverId(null)
                    } else {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMetierPopoverRect({ top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right })
                      setMetierPopoverId(c.id)
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (hasTags && configuredTags.length > 1) {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMetierTooltip({ tags: configuredTags, top: r.top, left: r.left, bottom: r.bottom, width: r.width })
                    }
                  }}
                  onMouseLeave={() => setMetierTooltip(null)}
                  aria-label={hasTags ? (configuredTags.length > 1 ? `${configuredTags.length} métiers` : 'Cliquer pour modifier') : 'Assigner un métier'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 999,
                    border: hasTags ? `1px solid ${tagColor}40` : '1px dashed var(--border)',
                    background: hasTags ? `${tagColor}14` : 'transparent',
                    color: hasTags ? tagColor : 'var(--muted)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  <Briefcase size={11} />
                  {/* v2.0.2 — Affiche jusqu'à 2 métiers (séparés par virgule), puis +N si plus.
                      Le tooltip portal au mouseEnter affiche TOUS les métiers (cf. metierTooltip state). */}
                  {hasTags ? (
                    configuredTags.length <= 2
                      ? configuredTags.join(', ')
                      : `${configuredTags[0]}, ${configuredTags[1]} +${configuredTags.length - 2}`
                  ) : (c.titre_poste || 'Métier')}
                </button>
              )
            })()}
            {/* v1.9.127 — Localisation + distance + âge déplacés en colonnes grid dédiées (alignement vertical entre rows).
                Mode actif/archivé : badges CFC/Engagé uniquement à côté du métier. */}
            {/* v1.9.134 — Pills CFC/Engagé déplacées hors de la cellule INFO (cf. plus bas, après Âge) */}
          </div>
        </div>

        {/* v2.0.1 — Colonne LOCALISATION : minWidth:0 + ellipsis strict + tooltip natif au hover */}
        <div style={{ flex: '0 0 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
          {c.localisation ? (
            <span
              title={formatCity(c.localisation)}
              style={{
                fontSize: 13, color: 'var(--muted)',
                display: 'flex', alignItems: 'center', gap: 4,
                overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0,
                fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
              }}
            >
              <MapPin size={11} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                {formatCity(c.localisation)}
              </span>
            </span>
          ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>}
          {villeRayon && typeof (c as any).distance_km === 'number' && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5,
              background: 'var(--info-soft)', color: 'var(--info)',
              alignSelf: 'flex-start',
            }}>
              {(c as any).distance_km < 1 ? '<1 km' : `${Math.round((c as any).distance_km)} km`}
            </span>
          )}
        </div>

        {/* v1.9.127 — Colonne ÂGE (largeur fixe, collée à Lieu) */}
        <div style={{ flex: '0 0 80px' }}>
          {age !== null ? (
            <span style={{
              fontSize: 12, fontWeight: 700,
              padding: '3.5px 10px', borderRadius: 7,
              background: 'var(--primary-soft)',
              color: 'var(--primary)',
              border: '1px solid rgba(245,167,35,0.35)',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
            }}>
              {age} ans
            </span>
          ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>}
        </div>

        {/* v1.9.134 — Pills CFC + Engagé APRÈS l'Âge (mode Actif/Archivé seulement) — couleur vert */}
        {importStatusFilter !== 'a_traiter' && (c.cfc === true || c.deja_engage === true) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {c.cfc === true && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6,
                background: 'var(--success-soft)', color: 'var(--success)',
                border: '1px solid rgba(34,197,94,0.30)',
              }}>
                <GraduationCap size={11} strokeWidth={2} /> CFC
              </span>
            )}
            {c.deja_engage === true && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6,
                background: 'var(--success-soft)', color: 'var(--success)',
                border: '1px solid rgba(34,197,94,0.30)',
              }}>
                <CheckCircle size={11} strokeWidth={2} /> Engagé
              </span>
            )}
          </div>
        )}

        {/* v1.9.127 — Spacer flex pour pousser étoiles / CV / notes / date à droite */}
        <div style={{ flex: 1 }} />

        {/* Étoiles interactives (tous onglets) — v1.9.128 width fixe 130, aligné gauche pour matcher header */}
        <div
          onClick={e => e.stopPropagation()}
          style={{ display: 'flex', gap: 2, flex: '0 0 110px' }}
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
              <Star size={14} color="#EAB308" fill={star <= (c.rating || 0) ? '#EAB308' : 'none'} />
            </button>
          ))}
        </div>
        {/* v1.9.71 — Âge déplacé inline après localisation (cohérent avec à-traiter). Badge pill droite supprimé. */}

        {/* v1.9.128 — Bouton "CV" supprimé : preview CV désormais déclenchée
            par le hover sur la photo/avatar du candidat (gain de place dans la row). */}

        {/* v1.9.127 — Bouton notes unifié : icône seule si vide, icône + compteur si notes existent.
            v1.9.128 — wrapper width 60 aligné à gauche pour matcher header "Notes". */}
        <div style={{ position: 'relative', flex: '0 0 56px', display: 'flex' }} onClick={e => e.stopPropagation()}>
            {(() => {
              const noteCount = c.notes_candidat?.length || 0
              const hasNotes = noteCount > 0
              const isOpen = notePopoverId === c.id
              return (
                <button
                  data-notes-trigger
                  onClick={e => {
                    e.stopPropagation()
                    if (isOpen) { setNotePopoverId(null); setNoteText(''); setNotePopoverRect(null); setHoveredNoteId(null); setHoveredNoteRect(null) }
                    else {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setNotePopoverRect({ top: r.top, left: r.left, bottom: r.bottom, right: r.right })
                      setNotePopoverId(c.id); setNoteText(''); setTimeout(() => noteTextareaRef.current?.focus(), 50)
                    }
                  }}
                  // v2.0.2 — Hover preview : si candidat a des notes, afficher la dernière au mouseover (sans clic)
                  onMouseEnter={hasNotes && !isOpen ? e => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setHoveredNoteRect({ top: r.top, left: r.left, right: r.right })
                    setHoveredNoteId(c.id)
                  } : undefined}
                  onMouseLeave={hasNotes ? () => { setHoveredNoteId(null); setHoveredNoteRect(null) } : undefined}
                  title={hasNotes ? `${noteCount} note${noteCount > 1 ? 's' : ''} — clique pour voir / ajouter` : 'Ajouter une note'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    height: 26, padding: hasNotes ? '0 7px' : 0, minWidth: 26,
                    borderRadius: 7, cursor: 'pointer', flexShrink: 0,
                    border: `1px solid ${isOpen ? '#6366F1' : (hasNotes ? 'rgba(99,102,241,0.35)' : 'var(--border)')}`,
                    background: isOpen ? 'rgba(99,102,241,0.10)' : (hasNotes ? 'rgba(99,102,241,0.08)' : 'transparent'),
                    color: (isOpen || hasNotes) ? '#6366F1' : 'var(--muted)',
                    fontSize: 11, fontWeight: 600,
                    fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                    transition: 'all 0.15s',
                  }}
                >
                  <MessageSquare size={12} />
                  {hasNotes && <span>{noteCount}</span>}
                </button>
              )
            })()}
            {/* v2.0.2 — Note preview au hover (portalisée pour échapper aux overflow) */}
            {hoveredNoteId === c.id && hoveredNoteRect && notePopoverId !== c.id && typeof document !== 'undefined' && (() => {
              const lastNote = [...(c.notes_candidat || [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
              if (!lastNote) return null
              const screenW = window.innerWidth
              const PANEL_W = 280
              const left = Math.max(12, Math.min(screenW - PANEL_W - 12, hoveredNoteRect.right - PANEL_W))
              const top = hoveredNoteRect.top + 32 + 6
              const totalNotes = c.notes_candidat?.length || 0
              return createPortal(
                <div
                  style={{
                    position: 'fixed', top, left, width: PANEL_W, zIndex: 9999,
                    background: 'var(--surface, var(--card))',
                    border: '1px solid rgba(99,102,241,0.30)',
                    borderRadius: 10, padding: 12,
                    boxShadow: '0 12px 32px -8px rgba(28,26,20,0.20)',
                    pointerEvents: 'none',
                    fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>📝 Dernière note</span>
                    {totalNotes > 1 && <span style={{ color: 'var(--muted)' }}>+{totalNotes - 1}</span>}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                    {lastNote.auteur || 'Recruteur'} · {new Date(lastNote.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--foreground)', lineHeight: 1.45, margin: 0, whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {lastNote.contenu}
                  </p>
                </div>,
                document.body
              )
            })()}
            {notePopoverId === c.id && notePopoverRect && typeof document !== 'undefined' && (() => {
              const sortedNotes = [...(c.notes_candidat || [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              const PANEL_W = 320
              const PANEL_MAX_H = 380
              const MARGIN = 16
              const GAP = 8
              const screenW = window.innerWidth
              const screenH = window.innerHeight
              // v1.9.132 — Popover COLLÉ au bouton notes, auto-flip intelligent :
              // - vertical : sous le bouton si place, sinon au-dessus (jamais sur le bouton)
              // - horizontal : aligné droite-droite (le popover s'étend vers la gauche depuis le bouton),
              //   sinon aligné gauche-gauche si déborde à gauche.
              const spaceBelow = screenH - notePopoverRect.bottom - MARGIN
              const spaceAbove = notePopoverRect.top - MARGIN
              const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow
              const maxH = Math.min(PANEL_MAX_H, Math.max(180, placeAbove ? spaceAbove - GAP : spaceBelow - GAP))
              // v1.9.132 — Quand au-dessus du bouton, on utilise `bottom` pour que le popover SOIT collé
              // au bouton par sa base (sinon avec `top` calculé sur maxH, il y a un gap blanc quand le contenu est petit)
              const positionStyle: React.CSSProperties = placeAbove
                ? { bottom: screenH - notePopoverRect.top + GAP }
                : { top: notePopoverRect.bottom + GAP }
              // Aligné right-edge-to-right-edge par défaut (popover déborde à gauche depuis le bouton)
              let left = notePopoverRect.right - PANEL_W
              if (left < MARGIN) left = notePopoverRect.left   // sinon aligné left-edge-to-left-edge
              if (left + PANEL_W > screenW - MARGIN) left = screenW - PANEL_W - MARGIN
              if (left < MARGIN) left = MARGIN
              return createPortal(
              <div
                data-notes-popover
                onClick={e => e.stopPropagation()}
                className="scroll-thin"
                style={{
                  position: 'fixed', left,
                  ...positionStyle,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: 14, width: PANEL_W, zIndex: 10000,
                  boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
                  maxHeight: maxH, overflowY: 'auto',
                  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                }}
              >
                {/* v1.9.131 — Header du panel : nom du candidat */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <MessageSquare size={14} color="#6366F1" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Notes — {formatFullName(c.prenom, c.nom)}
                    </span>
                  </div>
                  <button
                    onClick={() => { setNotePopoverId(null); setNoteText(''); setNotePopoverRect(null); setEditNoteId(null) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex' }}
                  >
                    <X size={14} />
                  </button>
                </div>
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
                    onClick={() => { setNotePopoverId(null); setNoteText(''); setEditNoteId(null); setNotePopoverRect(null) }}
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
              </div>,
              document.body
              )
            })()}
          </div>

        {/* v1.9.127 — Badge note dupliqué supprimé : le compteur est intégré au bouton unique ci-dessus. */}

        {/* Toggles CFC + Engagée (a_traiter mode only) — v1.9.128 chaque toggle dans un wrapper fixe pour alignement header */}
        {importStatusFilter === 'a_traiter' && (
          <>
            <div style={{ flex: '0 0 64px', display: 'flex' }}>
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
                padding: '3px 8px', borderRadius: 100, fontSize: 10, fontWeight: 700,
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
            </div>
            <div style={{ flex: '0 0 80px', display: 'flex' }}>
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
                padding: '3px 8px', borderRadius: 100, fontSize: 10, fontWeight: 700,
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
            </div>
          </>
        )}

        {/* v1.9.127 — Bloc métier d'origine masqué : le bouton est maintenant
            directement dans le sous-titre du candidat (à côté du nom).
            Le wrapper reste dans le DOM uniquement pour héberger le MetierPopover
            qui peut être ouvert depuis le sous-titre via metierPopoverId. */}
        {(() => {
          return (
            <div onClick={e => e.stopPropagation()} style={{ position: 'relative', flexShrink: 0, display: 'none' }}>
              <button style={{ display: 'none' }}>
                <Briefcase size={10} />
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

        {/* v1.9.90 — Date la plus récente : last_import_at (si plus récent que created_at) sinon created_at.
            Affiche la date pertinente pour la liste : date du dernier import = dernière activité sur le candidat. */}
        <span className="clist-date" style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap', flex: '0 0 110px', fontWeight: 600, textAlign: 'left', display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
          {(() => {
            const lastImport = (c as any).last_import_at as string | null | undefined
            const createdAt = c.created_at
            const displayDate = lastImport && new Date(lastImport).getTime() > new Date(createdAt).getTime()
              ? lastImport
              : createdAt
            return new Date(displayDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
          })()}
        </span>

        {/* Quick validate button (a_traiter mode only) — après la date */}
        {importStatusFilter === 'a_traiter' && (
          <div style={{ flex: '0 0 38px', display: 'flex' }}>
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
          </div>
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
          <h1 className="d-page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <span>Candidats</span>
            {!isLoading && (
              <span
                title={`${totalCandidats} candidat${totalCandidats > 1 ? 's' : ''}`}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 14, fontWeight: 700,
                  color: 'var(--muted-foreground)',
                  background: 'var(--secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '3px 10px',
                  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                  letterSpacing: '0.01em',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.4,
                }}
              >
                {totalCandidats.toLocaleString('fr-CH')}
              </span>
            )}
          </h1>
          <p className="d-page-sub">
            Base de talents, filtres et actions rapides
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
                  // v2.1.5 — Activation "Non vus" reset search + filtres avancés AVANT
                  // pour que les non-vus s'affichent direct (logique : si l'user clique Non vu
                  // il s'attend à voir les non-vus, pas une intersection avec les filtres actuels).
                  statusBeforeNonVuRef.current = importStatusFilter
                  sessionStorage.setItem('candidats_status_before_nonvu', importStatusFilter)
                  setSearch(''); ssSet('search', '')
                  resetFiltersOnly()
                  setFilterNonVu(true)
                } else {
                  setFilterNonVu(false)
                }
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
                fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: 1.4,
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
                  // v2.0.1 (16-B) — Tout marquer vu reset AUSSI les badges colorés Actualisé/Réactivé/Nouveau :
                  //  - DB OneDrive (onedrive_change_type=null) → handled par la route /api/candidats/mark-all-vu
                  //  - localStorage manuel (recently-updated) → clearAllRecentlyUpdated()
                  //  - Invalider React Query pour refresh visuel immédiat
                  await fetch('/api/candidats/mark-all-vu', { method: 'POST' }).catch(() => {})
                  clearAllRecentlyUpdated()
                  markAllVu()
                  // Sync React state (sinon hasBadge() utilise l'ancien viewedAllAt du closure)
                  setViewedAllAt(new Date().toISOString())
                  // Refetch pour récupérer les onedrive_change_type=null et purger l'affichage
                  queryClient.invalidateQueries({ queryKey: ['candidats'] })
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
          {/* v2.1.5 — Ligne 1 : Tout / Désélectionner / Non vu / Action onglet (pill "X sélectionnés" supprimée car déjà dans le titre Candidats) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* SECTION SÉLECTION (gauche) — Tout / Désélectionner / Non vu / À traiter */}
              <button onClick={selectAll} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'var(--primary)', color: 'var(--foreground)', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <CheckCircle size={12} /> Tout ({sorted.length})
              </button>
              <button onClick={deselectAll} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'var(--secondary)', color: 'var(--foreground)',
                border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <X size={12} /> Désélectionner
              </button>

              {/* v2.1.5 — Vu/Non vu DÉPLACÉ ICI à GAUCHE (avant : ligne 2) */}
              {(() => {
                const selectedArr = Array.from(selectedIds)
                const selectedCandidats = getAllSelectedCandidats()
                const anyUnseen = selectedCandidats.some(c => hasBadge(c.id, c.created_at, viewedSet, viewedAllAt, c.last_import_at))
                const anySeen   = selectedCandidats.some(c => !hasBadge(c.id, c.created_at, viewedSet, viewedAllAt, c.last_import_at))
                return (
                  <>
                    {anyUnseen && (
                      <button onClick={() => { markTousVus(selectedArr); setSelectedIds(new Set()) }} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: 'var(--success)', color: 'var(--destructive-foreground)', border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        <Eye size={12} /> Marquer vu
                      </button>
                    )}
                    {anySeen && (
                      <button onClick={() => { selectedArr.forEach(id => markCandidatNonVu(id)); setSelectedIds(new Set()) }} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: 'var(--muted-foreground)', color: 'var(--destructive-foreground)', border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        <Eye size={12} /> Non vu
                      </button>
                    )}
                  </>
                )
              })()}

              {/* Actions selon l'onglet — restent à GAUCHE (Valider/À traiter/Activer). v2.1.5 : "Archiver" supprimé */}
              {importStatusFilter === 'a_traiter' && (
                <button onClick={handleBulkValidate} disabled={updateImportStatus.isPending} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#16A34A', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <CheckCircle size={12} /> Valider ({selCount})
                </button>
              )}
              {importStatusFilter === 'traite' && (
                <button onClick={() => { const ids = Array.from(selectedIds); updateImportStatus.mutate({ ids, status: 'a_traiter' }) }} disabled={updateImportStatus.isPending} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#3B82F6', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <RotateCw size={12} /> À traiter ({selCount})
                </button>
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
            </div>

            {/* Ligne 2 : Actions globales (Message / WhatsApp / Pipeline / Lier à commande / Supprimer) — v2.1.5 ordre */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setShowMessage(true)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: '#0EA5E9', color: '#fff', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <MessageSquare size={12} /> Message ({selCount})
              </button>
              <button
                onClick={() => {
                  setShowWhatsApp(true)
                  setWaOpenedIds(new Set())
                  setWaLogged(false)
                  setWaCampagneId(
                    (globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
                  )
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#25D366', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
                title="Ouvrir WhatsApp pour chaque candidat (séquentiel)"
              >
                <MessageCircle size={12} /> WhatsApp ({selCount})
              </button>
              {/* v2.1.5 — Pipeline DÉPLACÉ ici à droite (avant : à gauche dans actions onglet) */}
              {importStatusFilter === 'traite' && (
                <button onClick={() => setShowBulkPipelineModal(true)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#8B5CF6', color: '#fff', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <LayoutGrid size={12} /> Pipeline ({selCount})
                </button>
              )}
              <button onClick={() => setShowLinkOffre(true)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }} title="Lier ces candidats à une commande ouverte">
                <Briefcase size={12} /> Lier à commande ({selCount})
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
            <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--muted-foreground, var(--muted))', pointerEvents: 'none', zIndex: 2 }} />
            <input
              style={{
                paddingLeft: 40, paddingRight: (search || aiResults !== null) ? 36 : 14,
                width: '100%', height: 42, fontSize: 14, fontWeight: 500,
                fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                background: 'var(--surface, var(--card))',
                border: '1px solid var(--border)',
                borderRadius: 10,
                color: 'var(--text, var(--foreground))',
                outline: 'none', boxShadow: 'none',
              }}
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
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 }}>
                  Recherche avancée
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '0 0 12px', lineHeight: 1.6 }}>
                  Utilisez des opérateurs pour affiner votre recherche :
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: 'var(--success-soft)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--success-soft)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 3 }}>ET / AND</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 5 }}>Les deux termes doivent être présents</div>
                    <code style={{ fontSize: 11, color: 'var(--foreground)', background: 'var(--card)', padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>Électricien ET Genève</code>
                  </div>
                  <div style={{ background: 'var(--info-soft)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--info-soft)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--info)', marginBottom: 3 }}>OU / OR</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 5 }}>L&apos;un ou l&apos;autre terme</div>
                    <code style={{ fontSize: 11, color: 'var(--foreground)', background: 'var(--card)', padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>Soudeur OU Tuyauteur</code>
                  </div>
                  <div style={{ background: 'var(--destructive-soft)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--destructive-soft)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--destructive)', marginBottom: 3 }}>SAUF / NOT</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 5 }}>Exclure un terme</div>
                    <code style={{ fontSize: 11, color: 'var(--foreground)', background: 'var(--card)', padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>Maçon SAUF intérimaire</code>
                  </div>
                  <div style={{ background: 'var(--primary-soft)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--primary-soft)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginBottom: 3 }}>( ) Parenthèses</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 5 }}>Grouper des termes pour combiner les opérateurs</div>
                    <code style={{ fontSize: 11, color: 'var(--foreground)', background: 'var(--card)', padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>(magasinier OU logisticien) ET bâtiment</code>
                  </div>
                </div>
                <button
                  onClick={() => setShowBooleanHelp(false)}
                  style={{
                    marginTop: 12, width: '100%', padding: '7px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--secondary)',
                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--foreground)', fontWeight: 600,
                  }}
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        {/* v2.0.2 — fontFamily Jakarta forcée sur tout le wrapper barre filtres (uniformise selecteurs natifs et labels) */}
        {/* Filtre métier — multi-select checkbox (v1.9.65) */}
        {agenceMetiers.length > 0 && (() => {
          const assigned = new Set(metierCategories.flatMap(c => c.metiers))
          const unassigned = agenceMetiers.filter(m => !assigned.has(m))
          const selectedMetiers = filtreMetier ? filtreMetier.split(',').map(s => s.trim()).filter(Boolean) : []
          const metierSet = new Set(selectedMetiers)
          const toggleMetier = (m: string) => {
            const next = new Set(metierSet)
            if (next.has(m)) next.delete(m)
            else next.add(m)
            const joined = [...next].join(',')
            setFiltreMetier(joined)
            setFilterMetier(joined)
            setImportStatusFilter('traite')
          }
          const clearMetiers = () => {
            setFiltreMetier(''); setFilterMetier('')
            setMetierSearch(''); setMetierDropdownOpen(false)
          }
          const nSelected = selectedMetiers.length
          const triggerLabel = nSelected === 0
            ? 'Tous les métiers'
            : nSelected === 1
              ? selectedMetiers[0]
              : `${nSelected} métiers sélectionnés`
          const triggerColor = nSelected === 1 ? getColorForMetier(selectedMetiers[0]) : null
          return (
            <div style={{ position: 'relative' }}>
              <button
                data-metier-trigger
                onClick={() => setMetierDropdownOpen(!metierDropdownOpen)}
                style={{
                  height: 28, fontSize: 12.5, paddingLeft: 10, paddingRight: 24, minWidth: 150,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
                  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                  fontWeight: nSelected > 0 ? 600 : 500,
                  lineHeight: 1,
                  borderRadius: 10, outline: 'none',
                  color: nSelected > 0 ? 'var(--text, var(--foreground))' : 'var(--text-3, var(--muted-foreground))',
                  background: triggerColor ? triggerColor + '18' : (nSelected > 1 ? 'var(--primary-soft)' : 'var(--surface, var(--card))'),
                  border: `1px solid ${triggerColor ? triggerColor + '60' : (nSelected > 1 ? 'var(--primary)' : 'var(--border)')}`,
                }}
              >
                {triggerColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: triggerColor, flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {triggerLabel}
                </span>
                <ChevronDown size={13} style={{ position: 'absolute', right: 8, color: 'var(--muted)' }} />
              </button>
              {metierDropdownOpen && (
                <div
                  ref={metierDropdownRef}
                  style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.15)', width: 320,
                  }}
                >
                  {/* Barre de recherche + action clear */}
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Rechercher un métier…"
                      value={metierSearch}
                      onChange={e => setMetierSearch(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                        fontSize: 12, background: 'var(--secondary)', color: 'var(--foreground)',
                        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                      }}
                    />
                    {nSelected > 0 && (
                      <button
                        onClick={clearMetiers}
                        title="Tout désélectionner"
                        style={{
                          padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                          border: '1px solid var(--border)', background: 'var(--card)',
                          color: 'var(--destructive)', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Vider
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 400, overflowY: 'auto', padding: '6px 0' }}>
                  <button
                    onClick={clearMetiers}
                    style={{
                      width: '100%', padding: '8px 14px', border: 'none', background: nSelected === 0 ? 'var(--surface)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: nSelected === 0 ? 700 : 400,
                      color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {nSelected === 0 && <Check size={13} />} Tous les métiers
                  </button>
                  {metierCategories.map(cat => {
                    const catMetiers = cat.metiers.filter(m => agenceMetiers.includes(m) && (metierSearchNorm ? norm(m).includes(metierSearchNorm) : true))
                    if (catMetiers.length === 0) return null
                    return (
                      <div key={cat.name}>
                        {/* v2.0.2 — Police catégorie augmentée 11→12.5px + lettering + uppercase pour lisibilité */}
                        <div style={{
                          padding: '10px 14px 6px', fontSize: 12.5, fontWeight: 700,
                          color: cat.color, display: 'flex', alignItems: 'center', gap: 7,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                        }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: cat.color }} />
                          {cat.name}
                        </div>
                        {catMetiers.map(m => {
                          const isSelected = metierSet.has(m)
                          return (
                            <button
                              key={m}
                              onClick={() => toggleMetier(m)}
                              style={{
                                width: '100%', padding: '6px 14px 6px 14px', border: 'none',
                                background: isSelected ? cat.color + '15' : 'transparent',
                                cursor: 'pointer', textAlign: 'left', fontSize: 13,
                                fontWeight: isSelected ? 600 : 400,
                                color: isSelected ? cat.color : 'var(--foreground)',
                                display: 'flex', alignItems: 'center', gap: 8,
                              }}
                            >
                              <span style={{
                                width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                                border: `1.5px solid ${isSelected ? cat.color : 'var(--border)'}`,
                                background: isSelected ? cat.color : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
                              </span>
                              {m}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                  {unassigned.filter(m => metierSearchNorm ? norm(m).includes(metierSearchNorm) : true).length > 0 && (
                    <div>
                      <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Autres</div>
                      {unassigned.filter(m => metierSearchNorm ? norm(m).includes(metierSearchNorm) : true).map(m => {
                        const isSelected = metierSet.has(m)
                        return (
                          <button
                            key={m}
                            onClick={() => toggleMetier(m)}
                            style={{
                              width: '100%', padding: '6px 14px 6px 14px', border: 'none',
                              background: isSelected ? 'var(--primary-soft)' : 'transparent',
                              cursor: 'pointer', textAlign: 'left', fontSize: 13,
                              fontWeight: isSelected ? 600 : 400, color: 'var(--foreground)',
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}
                          >
                            <span style={{
                              width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                              border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                              background: isSelected ? 'var(--primary)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isSelected && <Check size={10} color="var(--primary-foreground)" strokeWidth={3} />}
                            </span>
                            {m}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  </div>
                  {/* Footer avec bouton Appliquer / Fermer */}
                  {nSelected > 0 && (
                    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>
                        {nSelected} sélectionné{nSelected > 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => { setMetierSearch(''); setMetierDropdownOpen(false) }}
                        style={{
                          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          background: 'var(--primary)', color: 'var(--primary-foreground)',
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Appliquer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* v2.0.1 — Onglets statut import V2 : segmented control élégant, fond pill global,
            item actif avec ombre/élévation + couleur sémantique douce. Police DM Sans. */}
        <div style={{
          display: 'inline-flex', gap: 0,
          background: 'var(--secondary)',
          padding: 3, borderRadius: 10,
          border: '1px solid var(--border)',
        }}>
          {IMPORT_STATUS_OPTS.map((o) => {
            const active = importStatusFilter === o.value
            const badgeCount = nonVusParStatut[o.value] || 0
            const palette: Record<string, { color: string; bg: string; ring: string }> = {
              traite:    { color: '#15803D', bg: 'rgba(34,197,94,0.12)',  ring: 'rgba(34,197,94,0.30)'  },
              a_traiter: { color: '#B45309', bg: 'rgba(245,158,11,0.14)', ring: 'rgba(245,158,11,0.35)' },
            }
            const p = palette[o.value] || palette.traite
            return (
              <button
                key={o.value}
                onClick={() => setImportStatusFilter(o.value)}
                style={{
                  position: 'relative',
                  borderRadius: 7,
                  /* v2.0.3 — compaction onglets : padding 0 16/h32 → 0 12/h28 */
                  padding: '0 12px', height: 28,
                  fontSize: 12.5, fontWeight: 700,
                  cursor: 'pointer',
                  border: active ? `1px solid ${p.ring}` : '1px solid transparent',
                  background: active ? p.bg : 'transparent',
                  color: active ? p.color : 'var(--muted-foreground)',
                  transition: 'all 0.15s ease',
                  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  lineHeight: 1,
                  boxShadow: active ? '0 1px 2px rgba(28,26,20,0.04)' : 'none',
                  letterSpacing: '0.005em',
                }}
              >
                {o.label}
                {badgeCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -5, right: -5, zIndex: 50,
                    background: '#EF4444', color: 'white',
                    borderRadius: '100px', fontSize: 9, fontWeight: 700,
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

        {/* Sort — v1.9.127 styles inline (sans neo-input-soft pour éviter conflit avec arrow custom des selects) */}
        <div style={{ position: 'relative' }}>
          <SortAsc style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--muted-foreground, var(--muted))', pointerEvents: 'none', zIndex: 2 }} />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            style={{
              paddingLeft: 34, paddingRight: 30,
              width: 'auto', cursor: 'pointer',
              height: 28, fontSize: 12.5, fontWeight: 500,
              fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
              background: 'var(--surface, var(--card))',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text, var(--foreground))',
              outline: 'none', boxShadow: 'none',
              appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '16px 16px',
            }}
          >
            {/* v1.9.121 — option "Plus proche" injectée seulement si filtre rayon actif */}
            {(villeRayon ? [...SORT_OPTS, SORT_OPT_DISTANCE] : SORT_OPTS)
              .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Filtres avancés button */}
        <button onClick={() => setShowAdvancedFilters((v: boolean) => !v)} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'0 12px',height:28,borderRadius:8,border:'1px solid var(--border)',background:showAdvancedFilters?'var(--primary)':'var(--surface, var(--card))',color:showAdvancedFilters?'var(--primary-foreground)':'var(--text, var(--foreground))',fontSize:12.5,fontWeight:500,cursor:'pointer',fontFamily:'var(--font-jakarta), inherit',transition:'all 0.15s',lineHeight:1}}>
          <SlidersHorizontal size={14} />
          Filtres avancés
          {activeFiltersCount > 0 && <span style={{background:'#EF4444',color:'white',borderRadius:10,padding:'1px 6px',fontSize:11}}>{activeFiltersCount}</span>}
        </button>

        {/* Reset all filters */}
        {(search || activeFiltersCount > 0 || filtreStatut !== 'tous' || filterNonVu) && (
          <button
            onClick={resetAllFilters}
            title="Réinitialiser tous les filtres"
            style={{display:'inline-flex',alignItems:'center',gap:5,padding:'0 10px',height:28,borderRadius:8,border:'1px solid var(--destructive-soft, #FCA5A5)',background:'var(--destructive-soft, #FEF2F2)',color:'var(--destructive, #DC2626)',fontSize:12,cursor:'pointer',fontFamily:'var(--font-jakarta), inherit',fontWeight:500,lineHeight:1}}
          >
            <X size={13} /> Tout effacer
          </button>
        )}

        {/* Nombre de résultats par page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} style={{ fontSize: 12.5, fontWeight: 500, height: 28, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, var(--card))', color: 'var(--text, var(--foreground))', cursor: 'pointer', fontFamily: 'var(--font-jakarta), inherit' }}>
            <option value={20}>20</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={0}>Tous</option>
          </select>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>/ {candidatesTries.length}</span>
          {/* v2.0.3 — Mini-pager inline (chevrons + Page X/Y) à côté du compteur, plus de ligne séparée */}
          {totalPages > 1 && (
            <>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                title="Page précédente"
                style={{
                  width: 24, height: 24, borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: page <= 1 ? 'var(--border)' : 'var(--muted-foreground)',
                  cursor: page <= 1 ? 'default' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginLeft: 6, transition: 'all 0.12s',
                }}
              >
                <ChevronLeft size={12} />
              </button>
              <span style={{
                fontSize: 11.5, fontWeight: 600, color: 'var(--muted-foreground)',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
                fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                whiteSpace: 'nowrap',
              }}>
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                title="Page suivante"
                style={{
                  width: 24, height: 24, borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: page >= totalPages ? 'var(--border)' : 'var(--muted-foreground)',
                  cursor: page >= totalPages ? 'default' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s',
                }}
              >
                <ChevronRight size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Advanced filters panel — v1.9.127 polices Jakarta cohérentes */}
      {showAdvancedFilters && (
        <div style={{background:'var(--surface, var(--card))',border:'1px solid var(--border)',borderRadius:14,padding:16,marginBottom:12,display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))',gap:12,fontFamily:'var(--font-jakarta), system-ui, sans-serif'}}>
          {/* v1.9.110 — Filtre rayon : autocomplete ville + slider km */}
          <div style={{gridColumn:'span 2',position:'relative'}}>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>
              VILLE & RAYON
              {villeRayon && (
                <span style={{marginLeft:8,fontWeight:700,color:'var(--text)'}}>
                  {villeRayon.pays === 'France' ? '🇫🇷' : villeRayon.pays === 'Suisse' ? '🇨🇭' : ''} {villeRayon.label} · {rayonKm} km
                  <button
                    onClick={() => { setVilleRayon(null); setVilleQuery(''); setVilleSuggestions([]) }}
                    title="Effacer la ville"
                    style={{marginLeft:6,background:'transparent',border:'none',color:'#EF4444',cursor:'pointer',fontSize:13,fontWeight:700}}
                  >
                    ×
                  </button>
                </span>
              )}
            </label>
            {!villeRayon && (
              <div style={{position:'relative'}}>
                <input
                  value={villeQuery}
                  onChange={e => { setVilleQuery(e.target.value); setShowVilleDropdown(true) }}
                  onFocus={() => setShowVilleDropdown(true)}
                  onBlur={() => setTimeout(() => setShowVilleDropdown(false), 150)}
                  placeholder="Tape une ville ou un CP (ex: Genève, 1870)"
                  style={{width:'100%',padding:'6px 30px 6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:13,color:'var(--text)'}}
                />
                {villeQuery.length > 0 && (
                  <button
                    onMouseDown={(e) => { e.preventDefault() }}
                    onClick={() => { setVilleQuery(''); setVilleSuggestions([]); setShowVilleDropdown(false) }}
                    title="Effacer la recherche"
                    style={{
                      position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',
                      width:18,height:18,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                      background:'var(--muted-soft, rgba(0,0,0,0.08))',border:'none',color:'var(--muted)',
                      cursor:'pointer',fontSize:12,lineHeight:1,padding:0,
                    }}
                  >
                    ×
                  </button>
                )}
                {showVilleDropdown && villeSuggestions.length > 0 && (
                  <div style={{
                    position:'absolute',top:'100%',left:0,right:0,zIndex:50,marginTop:4,
                    background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,
                    boxShadow:'0 6px 20px rgba(0,0,0,0.12)',maxHeight:240,overflowY:'auto',
                  }}>
                    {villeSuggestions.map((s, i) => {
                      const isNum = /^\d+$/.test(villeQuery.trim())
                      const display = isNum ? `${s.cp} ${s.ville}` : s.ville
                      const flag = s.pays === 'France' ? '🇫🇷' : '🇨🇭'
                      return (
                        <button
                          key={`${s.pays}-${s.cp}-${s.ville}-${i}`}
                          onMouseDown={(e) => { e.preventDefault() }}
                          onClick={() => {
                            setVilleRayon({ lat: s.lat, lng: s.lng, label: display, pays: s.pays })
                            setVilleQuery('')
                            setVilleSuggestions([])
                            setShowVilleDropdown(false)
                          }}
                          style={{
                            display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px 12px',
                            background:'transparent',border:'none',borderBottom:i<villeSuggestions.length-1?'1px solid var(--border)':'none',
                            textAlign:'left',cursor:'pointer',fontSize:13,color:'var(--text)',fontFamily:'inherit',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--secondary)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <MapPin size={12} style={{color:'var(--muted)',flexShrink:0}} />
                          <span style={{fontWeight:600}}>{display}</span>
                          <span style={{color:'var(--muted)',fontSize:11,marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:4}}>
                            <span aria-hidden="true">{flag}</span> {s.pays}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {villeRayon && (
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                {[10, 25, 50, 100].map(km => (
                  <button
                    key={km}
                    onClick={() => setRayonKm(km)}
                    style={{
                      padding:'4px 10px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                      border:`1.5px solid ${rayonKm===km ? 'var(--primary)' : 'var(--border)'}`,
                      background: rayonKm===km ? 'var(--primary-soft)' : 'var(--bg)',
                      color: rayonKm===km ? 'var(--text)' : 'var(--muted)',
                    }}
                  >
                    {km} km
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={rayonKm}
                  onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) setRayonKm(Math.min(500, v)) }}
                  style={{width:60,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',fontSize:12,color:'var(--text)'}}
                  title="Rayon personnalisé (km)"
                />
              </div>
            )}
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

          {/* CFC toggle ON/OFF — v2.0.1 : VERT (aligné sur la pill verte de la liste) */}
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6,fontFamily:'var(--font-jakarta), system-ui, sans-serif'}}>CFC</label>
            <button
              onClick={()=>setFilterCfc(filterCfc===null?true:null)}
              style={{width:'100%',padding:'6px 10px',borderRadius:6,border:`1.5px solid ${filterCfc?'#22C55E':'var(--border)'}`,fontSize:13,cursor:'pointer',fontFamily:'var(--font-jakarta), system-ui, sans-serif',fontWeight:700,
                background:filterCfc?'rgba(34,197,94,0.12)':'var(--bg)',color:filterCfc?'#15803D':'var(--muted)',transition:'all 0.15s'
              }}
            >
              {filterCfc ? '✓ CFC actif' : 'CFC'}
            </button>
          </div>

          {/* Déjà engagé toggle ON/OFF — v2.0.1 vert (déjà OK) + label Jakarta forcé */}
          <div>
            <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6,fontFamily:'var(--font-jakarta), system-ui, sans-serif'}}>DÉJÀ ENGAGÉ</label>
            <button
              onClick={()=>setFilterEngage(filterEngage===null?true:null)}
              style={{width:'100%',padding:'6px 10px',borderRadius:6,border:`1.5px solid ${filterEngage?'#22C55E':'var(--border)'}`,fontSize:13,cursor:'pointer',fontFamily:'var(--font-jakarta), system-ui, sans-serif',fontWeight:700,
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
                    {allSel && <Check size={10} color="var(--foreground)" strokeWidth={3} />}
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
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>{groupKey}</span>
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
        <div className="clist-v2" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* v2.0.3 — Mini-pagination déplacée à côté du compteur "/ 20" en barre filtres (demande João) */}

          {/* v1.9.127 — Header colonnes V2 aligné EXACTEMENT sur les largeurs flex de renderCard.
              Inclut checkbox "Tout sélectionner" en cellule 1 (même width 20px que les rows). */}
          {(() => {
            const visibleIds = candidatesPagines.map((c: any) => c.id)
            const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
            const someSelected = !allSelected && visibleIds.some(id => selectedIds.has(id))
            const headerCellStyle: React.CSSProperties = {
              fontSize: 11, fontWeight: 600, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
              // v1.9.133 — display flex pour matcher exactement le comportement des cellules row (qui sont des div flex)
              display: 'flex', alignItems: 'center',
              boxSizing: 'border-box',
            }
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '8px 18px 8px',
                // v1.9.129 — border transparente 1px gauche/droite pour matcher exactement le décalage
                // des rows (qui ont border: 1px solid var(--border) all sides). Sinon contenu du row décalé de 1px.
                border: '1px solid transparent',
                borderBottom: '1px solid var(--border)',
                marginBottom: 4,
              }}>
                {/* Checkbox "Tout sélectionner" — aligné avec les checkboxes des rows */}
                <div
                  onClick={() => allSelected ? deselectAll() : selectAll()}
                  title={allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  style={{
                    flex: '0 0 20px', height: 20, borderRadius: 6,
                    border: `2px solid ${allSelected || someSelected ? 'var(--primary)' : 'var(--border)'}`,
                    background: allSelected ? 'var(--primary)' : (someSelected ? 'var(--primary-soft)' : 'transparent'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {allSelected && <Check size={11} color="var(--foreground)" strokeWidth={3} />}
                  {someSelected && !allSelected && <span style={{ width: 8, height: 2, background: 'var(--primary)', borderRadius: 1 }} />}
                </div>
                <span style={{ flex: '0 0 56px' }} />
                <span style={{ flex: '0 0 260px', ...headerCellStyle }}>Nom</span>
                <span style={{ flex: '0 0 150px', ...headerCellStyle }}>Lieu</span>
                <span style={{ flex: '0 0 80px', ...headerCellStyle }}>Âge</span>
                <span style={{ flex: 1 }} />
                {/* v1.9.134 — `flex: 0 0 Npx` shorthand strict (no-grow, no-shrink, basis=Npx)
                    GARANTIT la même width header ↔ row, indépendamment du contenu environnant. */}
                <span style={{ flex: '0 0 110px', ...headerCellStyle }}>Évaluation</span>
                <span style={{ flex: '0 0 56px', ...headerCellStyle }}>Notes</span>
                {importStatusFilter === 'a_traiter' && (
                  <>
                    <span style={{ flex: '0 0 64px', ...headerCellStyle }}>CFC</span>
                    <span style={{ flex: '0 0 80px', ...headerCellStyle }}>Engagé</span>
                  </>
                )}
                <span style={{ flex: '0 0 110px', ...headerCellStyle }}>Mise à jour</span>
                {importStatusFilter === 'a_traiter' && (
                  <span style={{ flex: '0 0 38px', ...headerCellStyle }}>Valider</span>
                )}
              </div>
            )
          })()}
          {candidatesPagines.map((c: any) => renderCard(c))}

          {/* Pagination — v2.0.2 police Jakarta + style V2 cohérent */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--surface, var(--card))', color: page <= 1 ? 'var(--border)' : 'var(--foreground)',
                  fontSize: 13, fontWeight: 600, cursor: page <= 1 ? 'default' : 'pointer',
                  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                }}
              >
                ← Précédent
              </button>
              <span style={{
                fontSize: 13, color: 'var(--muted-foreground)', fontWeight: 600,
                fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
              }}>
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--surface, var(--card))', color: page >= totalPages ? 'var(--border)' : 'var(--foreground)',
                  fontSize: 13, fontWeight: 600, cursor: page >= totalPages ? 'default' : 'pointer',
                  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                }}
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      )}

      {/* v1.9.129 — Tooltip métiers multi (portalisé : échappe au overflow:hidden du wrapper info col) */}
      {metierTooltip && typeof document !== 'undefined' && (() => {
        const screenH = window.innerHeight
        const spaceAbove = metierTooltip.top
        const spaceBelow = screenH - metierTooltip.bottom
        const placeAbove = spaceAbove > 120 && spaceAbove > spaceBelow
        const top = placeAbove ? metierTooltip.top - 8 : metierTooltip.bottom + 8
        return createPortal(
          <div
            style={{
              position: 'fixed',
              top,
              left: metierTooltip.left,
              transform: placeAbove ? 'translateY(-100%)' : 'none',
              background: 'var(--foreground, #1f2937)',
              color: 'var(--background, #fff)',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 12, fontWeight: 500,
              fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
              boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
              zIndex: 99999,
              pointerEvents: 'none',
              display: 'flex', flexDirection: 'column', gap: 4,
              minWidth: 160, maxWidth: 280,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, opacity: 0.6, textTransform: 'uppercase', marginBottom: 2 }}>
              Métiers ({metierTooltip.tags.length})
            </span>
            {metierTooltip.tags.map(t => (
              <span key={t} style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}>· {t}</span>
            ))}
          </div>,
          document.body
        )
      })()}

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
            style={{ width: '100%', height: 'calc(100% - 41px)', overflow: 'auto', background: 'var(--muted)', cursor: 'grab' }}
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
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, width: 480, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
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
              {/* v1.9.73 : MetierPicker partagé avec la page Pipeline (UX cohérente) */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                <MetierPicker
                  metiers={agenceMetiers}
                  categories={metierCategories}
                  value={bulkPipelineMetier}
                  onChange={setBulkPipelineMetier}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 24px 18px', borderTop: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
              <button onClick={() => setShowBulkPipelineModal(false)} className="neo-btn" style={{ fontSize: 13, padding: '6px 14px' }}>Annuler</button>
              <button onClick={addSelectionToPipeline} disabled={bulkPipelineSaving} className="neo-btn-yellow" style={{ fontSize: 13, padding: '6px 14px' }}>
                {bulkPipelineSaving ? '…' : 'Ajouter au pipeline'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk delete confirmation (v1.9.96 — confirmation forte avec input "SUPPRIMER") */}
      <DeleteConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        isPending={deleteBulk.isPending}
        title={`Supprimer ${selCount} candidat${selCount > 1 ? 's' : ''} ?`}
        description={
          <>
            Cette action supprimera <strong>définitivement</strong> {selCount} candidat{selCount > 1 ? 's' : ''}
            {' '}ainsi que toutes leurs données associées (notes, pipeline, documents, CV).
          </>
        }
        confirmLabel={`Supprimer (${selCount})`}
      />

      {/* Modal Message — v1.9.130 design V2 + portal + scrollbar discrète */}
      {showMessage && typeof document !== 'undefined' && (() => {
        // v1.9.122 — cache toutes-pages (avant : page courante seulement = bug Seb 18 sélectionnés / 8 affichés)
        const selected = getAllSelectedCandidats()
        const avecTel   = selected.filter((c: any) => c.telephone)
        const sansTel   = selected.filter((c: any) => !c.telephone)
        const formatted = avecTel.map((c: any) => detectAndFormat(c.telephone).number)
        return createPortal(
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
            backdropFilter: 'blur(2px)',
            fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
          }}>
            <div style={{
              maxWidth: 720, width: '92%', maxHeight: '92vh',
              display: 'flex', flexDirection: 'column',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageSquare size={15} color="white" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>Envoyer un message</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ouvre l&apos;app Messages sur votre Mac</div>
                  </div>
                </div>
                <button onClick={() => setShowMessage(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>

              <div className="scroll-thin" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {/* v1.9.68 — Warning si déjà contacté dans les 7 derniers jours */}
                {!warningDismissed && (
                  <RecentContactsWarning
                    candidats={selected}
                    contacts={recentContacts}
                    onContinue={() => setWarningDismissed(true)}
                    onDismiss={() => setWarningDismissed(true)}
                  />
                )}
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
                        border: '1px solid var(--border)', borderRadius: 10,
                        resize: 'none', background: 'var(--secondary)', color: 'var(--foreground)',
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
                        borderColor: numCopied ? 'var(--success)' : 'var(--border)',
                        background: numCopied ? 'var(--success-soft)' : 'var(--card)',
                        color: numCopied ? 'var(--success)' : 'var(--foreground)',
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
                  <div className="scroll-thin" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}>
                    {avecTel.map((c: any) => {
                      const { number, countryCode, country } = detectAndFormat(c.telephone)
                      const hasPhoto = c.photo_url && c.photo_url !== 'checked'
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--success-soft)', border: '1px solid var(--success-soft)', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--foreground)', flexShrink: 0, overflow: 'hidden' }}>
                            {hasPhoto ? (
                              <Image src={c.photo_url} alt="" width={34} height={34} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              formatInitials(c.prenom, c.nom)
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{formatFullName(c.prenom, c.nom)}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--success)' }}>
                              <Phone size={10} /> {number}
                            </div>
                          </div>
                          {countryCode && (
                            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>
                              <span className={`fi fi-${countryCode}`} style={{ width: 18, height: 13, display: 'inline-block', backgroundSize: 'contain', borderRadius: 2 }} />
                              {country}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {sansTel.length > 0 && sansTel.map((c: any) => {
                      const hasPhoto = c.photo_url && c.photo_url !== 'checked'
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--warning-soft)', border: '1px solid var(--warning-soft)', borderRadius: 8, padding: '8px 12px', opacity: 0.85 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', flexShrink: 0, overflow: 'hidden' }}>
                            {hasPhoto ? (
                              <Image src={c.photo_url} alt="" width={34} height={34} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              formatInitials(c.prenom, c.nom)
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{formatFullName(c.prenom, c.nom)}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--warning)' }}>
                              <AlertTriangle size={10} /> Pas de numéro — sera ignoré
                            </div>
                          </div>
                        </div>
                      )
                    })}
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
                          border: '1px solid var(--border)', borderRadius: 7,
                          background: selectedSmsTpl ? 'var(--info-soft)' : 'var(--card)',
                          color: selectedSmsTpl ? 'var(--info)' : 'var(--foreground)',
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
                            border: '1px solid var(--border)', borderRadius: 7,
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
                                fontSize: 11, fontWeight: 600, color: 'var(--destructive)',
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
                            border: '1.5px solid var(--info)', borderRadius: 8,
                            background: 'var(--info-soft)', color: 'var(--foreground)',
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
                            border: '1.5px solid var(--info)', borderRadius: 8,
                            background: 'var(--info-soft)', color: 'var(--foreground)',
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
                      border: '1px solid var(--border)', borderRadius: 10,
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
              <div style={{ padding: '14px 24px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                {avecTel.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--warning)', textAlign: 'center', margin: 0 }}>
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
          </div>,
          document.body
        )
      })()}

      {/* Modal WhatsApp bulk (v1.9.67) — séquentiel user-driven, anti-popup-blocker */}
      {showWhatsApp && (() => {
        // v1.9.122 — cache toutes-pages (même fix que modal Message)
        const selected = getAllSelectedCandidats()
        const avecTel  = selected.filter((c: any) => c.telephone)
        const sansTel  = selected.filter((c: any) => !c.telephone)
        // v1.9.68 — Harmonisation : {prenom} {nom} {metier} {civilite} + rétrocompat {candidat_*} + [MÉTIER]/[LIEU] legacy
        const personalize = (tpl: string, c: any) =>
          (tpl || '')
            .replace(/\{prenom\}/gi, c.prenom || '')
            .replace(/\{nom\}/gi, c.nom || '')
            .replace(/\{metier\}/gi, c.titre_poste || '')
            .replace(/\{candidat_prenom\}/gi, c.prenom || '')
            .replace(/\{candidat_nom\}/gi, c.nom || '')
            .replace(/\{candidat_metier\}/gi, c.titre_poste || '')
        const nextCandidat = avecTel.find((c: any) => !waOpenedIds.has(c.id))
        const previewCandidat = nextCandidat || avecTel[0]
        const previewMsg = previewCandidat ? personalize(messageText, previewCandidat) : ''

        // v1.9.68 — Templates WhatsApp dédiés (séparés des templates SMS/iMessage)
        const activeTemplates = waTemplates
        const selectedTpl = activeTemplates.find(t => t.id === smsTplId) || null
        const applyTemplate = (id: string) => {
          const t = activeTemplates.find(x => x.id === id)
          if (!t) return
          setSmsTplId(id)
          setShowSmsTplDropdown(false)
          const out = (t.corps || '')
            .replace(/\[MÉTIER\]/g, smsMetier || '[MÉTIER]')
            .replace(/\[LIEU\]/g, smsLieu || '[LIEU]')
          setMessageText(out)
        }
        const waTplHasMetier = selectedTpl && /\[MÉTIER\]/.test(selectedTpl.corps || '')
        const waTplHasLieu   = selectedTpl && /\[LIEU\]/.test(selectedTpl.corps || '')

        const logCampagneOnce = () => {
          if (waLogged) return
          if (avecTel.length === 0 || !messageText.trim()) return
          const candidatIds = avecTel.map((c: any) => c.id)
          const destinataires = avecTel.map((c: any) => toWaPhone(c.telephone))
          fetch('/api/messages/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              candidat_ids: candidatIds,
              destinataires,
              canal: 'whatsapp',
              corps: messageText,
              campagne_id: waCampagneId,
            }),
          }).catch(() => { /* silent */ })
          setWaLogged(true)
        }

        const openWhatsApp = (c: any) => {
          const msg = personalize(messageText, c)
          const phone = toWaPhone(c.telephone)
          const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`
          logCampagneOnce()
          window.open(url, '_blank')
          setWaOpenedIds(prev => new Set(prev).add(c.id))
        }

        const openNext = () => {
          if (nextCandidat) openWhatsApp(nextCandidat)
        }

        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}>
            <div className="neo-card" style={{ maxWidth: 720, width: '92%', padding: 0, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
              {/* Header vert WhatsApp */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageCircle size={15} color="white" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>Envoyer WhatsApp en masse</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ouvre un chat à la fois (anti-blocage navigateur)</div>
                  </div>
                </div>
                <button onClick={() => setShowWhatsApp(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>

                {/* v1.9.68 — Warning si déjà contacté dans les 7 derniers jours */}
                {!warningDismissed && (
                  <RecentContactsWarning
                    candidats={selected}
                    contacts={recentContacts}
                    onContinue={() => setWarningDismissed(true)}
                    onDismiss={() => setWarningDismissed(true)}
                  />
                )}

                {/* Barre progression */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--success-soft)', border: '1px solid var(--success-soft)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                    {waOpenedIds.size} / {avecTel.length} ouverts
                  </div>
                  <div style={{ flex: 1, height: 6, background: 'var(--card)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${avecTel.length > 0 ? (waOpenedIds.size / avecTel.length) * 100 : 0}%`,
                      background: '#25D366',
                      transition: 'width 0.25s ease',
                    }} />
                  </div>
                  <button
                    onClick={openNext}
                    disabled={!nextCandidat || !messageText.trim()}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: nextCandidat && messageText.trim() ? '#25D366' : 'var(--border)',
                      color: nextCandidat && messageText.trim() ? '#fff' : 'var(--muted)',
                      border: 'none', cursor: nextCandidat && messageText.trim() ? 'pointer' : 'default',
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    title="Ouvrir WhatsApp pour le prochain candidat non-ouvert"
                  >
                    <MessageCircle size={12} />
                    {nextCandidat ? `Suivant (${nextCandidat.prenom || ''} ${nextCandidat.nom || ''})`.trim() : 'Tout ouvert ✓'}
                  </button>
                </div>

                {/* Message / template */}
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
                          border: '1px solid var(--border)', borderRadius: 7,
                          background: selectedTpl ? 'var(--success-soft)' : 'var(--card)',
                          color: selectedTpl ? 'var(--success)' : 'var(--foreground)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {selectedTpl ? `📱 ${selectedTpl.nom}` : 'Templates WhatsApp'}
                        <ChevronDown size={11} />
                      </button>
                      {showSmsTplDropdown && (
                        <div style={{
                          position: 'absolute', top: '100%', right: 0, marginTop: 4,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
                          padding: 4, minWidth: 240, maxHeight: 280, overflowY: 'auto', zIndex: 60,
                        }}>
                          {activeTemplates.length === 0 ? (
                            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                              Aucun template WhatsApp.<br />
                              <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>
                                Créez-en depuis /messages → Templates, ou cliquez « Copier vers WhatsApp » sur un template iMessage.
                              </span>
                            </div>
                          ) : (
                            activeTemplates.map((t: any) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => applyTemplate(t.id)}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left',
                                  padding: '6px 10px', borderRadius: 6, border: 'none',
                                  background: smsTplId === t.id ? 'var(--success-soft)' : 'transparent',
                                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                  color: 'var(--foreground)', fontFamily: 'inherit',
                                }}
                              >
                                {t.nom}
                              </button>
                            ))
                          )}
                          {selectedTpl && (
                            <button
                              type="button"
                              onClick={() => { setSmsTplId(null); setShowSmsTplDropdown(false); setSmsMetier(''); setSmsLieu('') }}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '6px 10px', borderRadius: 6, border: 'none',
                                background: 'transparent', cursor: 'pointer',
                                fontSize: 11, fontWeight: 600, color: 'var(--destructive)',
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

                  {(waTplHasMetier || waTplHasLieu) && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {waTplHasMetier && (
                        <input
                          type="text"
                          value={smsMetier}
                          onChange={e => setSmsMetier(e.target.value)}
                          placeholder="Métier recherché"
                          style={{
                            flex: 1, padding: '7px 10px', fontSize: 13,
                            border: '1.5px solid var(--info)', borderRadius: 8,
                            background: 'var(--info-soft)', color: 'var(--foreground)',
                            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                          }}
                        />
                      )}
                      {waTplHasLieu && (
                        <input
                          type="text"
                          value={smsLieu}
                          onChange={e => setSmsLieu(e.target.value)}
                          placeholder="Lieu de mission"
                          style={{
                            flex: 1, padding: '7px 10px', fontSize: 13,
                            border: '1.5px solid var(--info)', borderRadius: 8,
                            background: 'var(--info-soft)', color: 'var(--foreground)',
                            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                          }}
                        />
                      )}
                    </div>
                  )}

                  <textarea
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    placeholder="Bonjour {prenom}, nous avons une opportunité..."
                    rows={selectedSmsTpl ? 6 : 4}
                    style={{
                      width: '100%', padding: '10px 14px', fontSize: 14,
                      border: '1px solid var(--border)', borderRadius: 10,
                      resize: 'vertical', fontFamily: 'inherit', color: 'var(--foreground)',
                      background: 'var(--background)', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span>{messageText.length} caractères</span>
                    <span>Variables : <code style={{ background: 'var(--secondary)', padding: '1px 5px', borderRadius: 3 }}>{'{prenom}'}</code> <code style={{ background: 'var(--secondary)', padding: '1px 5px', borderRadius: 3 }}>{'{nom}'}</code></span>
                  </div>
                </div>

                {/* Aperçu personnalisé */}
                {previewCandidat && messageText.trim() && (/\{prenom\}|\{nom\}/i.test(messageText)) && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--primary-soft)', border: '1px solid rgba(245,167,35,0.25)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Aperçu pour {formatFullName(previewCandidat.prenom, previewCandidat.nom)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--foreground)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {previewMsg}
                    </div>
                  </div>
                )}

                {/* Liste destinataires — 1 bouton Ouvrir par candidat */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Destinataires — {avecTel.length} avec numéro{sansTel.length > 0 ? ` · ${sansTel.length} sans` : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                    {avecTel.map((c: any) => {
                      const opened = waOpenedIds.has(c.id)
                      const { number, countryCode, country } = detectAndFormat(c.telephone)
                      const hasPhoto = c.photo_url && c.photo_url !== 'checked'
                      return (
                        <div
                          key={c.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: opened ? 'var(--success-soft)' : 'var(--secondary)',
                            border: `1px solid ${opened ? 'var(--success)' : 'var(--border)'}`,
                            borderRadius: 8, padding: '8px 12px',
                          }}
                        >
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--foreground)', flexShrink: 0, overflow: 'hidden' }}>
                            {hasPhoto ? (
                              <Image src={c.photo_url} alt="" width={34} height={34} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              formatInitials(c.prenom, c.nom)
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{formatFullName(c.prenom, c.nom)}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: opened ? 'var(--success)' : 'var(--muted-foreground)' }}>
                              <Phone size={10} /> {number}
                            </div>
                          </div>
                          {countryCode && (
                            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>
                              <span className={`fi fi-${countryCode}`} style={{ width: 18, height: 13, display: 'inline-block', backgroundSize: 'contain', borderRadius: 2 }} />
                              {country}
                            </span>
                          )}
                          <button
                            onClick={() => openWhatsApp(c)}
                            disabled={!messageText.trim()}
                            style={{
                              padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                              background: opened ? 'var(--card)' : '#25D366',
                              color: opened ? 'var(--success)' : '#fff',
                              border: opened ? '1.5px solid var(--success)' : 'none',
                              cursor: messageText.trim() ? 'pointer' : 'not-allowed',
                              opacity: messageText.trim() ? 1 : 0.5,
                              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                            }}
                            title={opened ? 'Déjà ouvert — cliquer pour rouvrir' : 'Ouvrir WhatsApp avec ce candidat'}
                          >
                            {opened ? '✓ Ouvert' : 'Ouvrir'}
                          </button>
                        </div>
                      )
                    })}
                    {sansTel.length > 0 && sansTel.map((c: any) => {
                      const hasPhoto = c.photo_url && c.photo_url !== 'checked'
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--destructive-soft)', border: '1px solid var(--destructive-soft)', borderRadius: 8, padding: '8px 12px', opacity: 0.85 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', flexShrink: 0, overflow: 'hidden' }}>
                            {hasPhoto ? (
                              <Image src={c.photo_url} alt="" width={34} height={34} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              formatInitials(c.prenom, c.nom)
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{formatFullName(c.prenom, c.nom)}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--destructive)' }}>
                              <AlertTriangle size={10} /> Pas de numéro — ignoré
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '14px 24px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                {avecTel.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--warning)', textAlign: 'center', margin: 0 }}>
                    Aucun candidat sélectionné n&apos;a de numéro de téléphone.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setShowWhatsApp(false)}
                    className="neo-btn-ghost"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {waOpenedIds.size > 0 ? 'Terminer' : 'Annuler'}
                  </button>
                  {waOpenedIds.size > 0 && waOpenedIds.size < avecTel.length && (
                    <button
                      onClick={() => setWaOpenedIds(new Set(avecTel.map((c: any) => c.id)))}
                      className="neo-btn-ghost"
                      style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                      title="Marquer tous les candidats comme ouverts (sans ouvrir WhatsApp)"
                    >
                      Tout marquer ouvert
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* v1.9.71 — Modal Lier à commande */}
      {showLinkOffre && (
        <LinkOffreModal
          candidatIds={Array.from(selectedIds)}
          onClose={() => setShowLinkOffre(false)}
          onSuccess={() => { /* selection reste, user peut re-lier si besoin */ }}
        />
      )}

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
            <div style={{ padding: '20px 24px 12px', flexShrink: 0, fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
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
                  border: '1px solid var(--border)', borderRadius: 10,
                  background: 'var(--background)', color: 'var(--foreground)',
                  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '12px 24px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
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
