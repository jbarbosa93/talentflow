// TalentFlow Sign — Éditeur visuel de template (orchestrateur)
// v2.2.0 — Phase 2
// Layout 2 colonnes : viewer PDF (gauche) + toolbar champs/recipients (droite).
// Lazy import PDFViewer + FieldsCanvas (SSR off).
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Save, Loader2,
  PenLine, Type, CheckSquare, Calendar, List as ListIcon, Trash2, Files,
  StickyNote, Plus, Hash, Mail, Building2, Briefcase, User, IdCard,
  Sigma, Paperclip, Pencil, Check as CheckIcon, X as XIcon, Eye,
  Sparkles, Search, FilePlus, ArrowUp, ArrowDown, AlertTriangle, Layers, Clock,
} from 'lucide-react'
// v2.7.6 — Import partagé du modal "Champs orphelins" (défini dans WizardEditor, réutilisé ici)
import { OrphanFieldsModal } from './WizardEditor'
// v2.9.51 — Signature pré-remplie (en dur) sur un field signature/initial
const SignaturePadDynamic = dynamic(() => import('./SignaturePad'), { ssr: false })
// v2.9.21 — Gestion des sections (wizardSection)
import SectionManager, { type SectionManagerRow } from './SectionManager'
import { collectSections, loadCollapsedSections, saveCollapsedSections } from '@/lib/sign/section-helpers'
import PdfPreviewModal from '@/components/report/PdfPreviewModal'
import { toast } from 'sonner'
import type { PageRenderInfo } from './PDFViewer'
import type {
  SignDocument, SignField, SignFieldType,
  SignRecipientSchema, SignFieldCondition, SignConditionOperator, SignConditionAction,
} from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'
// v2.2.4 — Composant partagé Mode Wizard ↔ Mode Document pour éditer les options Formule
import FieldFormulaOptions from './FieldFormulaOptions'
import FieldHelpAttachmentEditor from './FieldHelpAttachmentEditor'
// v2.7.8 — Helpers pour afficher des noms lisibles dans les dropdowns conditions
import { getFieldDisplayLabel, groupFieldsBySection, LIST_PRESETS } from '@/lib/sign/field-helpers'
import {
  RECIPIENT_COLORS, FIELD_TYPE_LABELS, FIELD_TYPE_CATEGORIES,
  CONDITION_OPERATOR_LABELS, CONDITION_ACTION_LABELS,
  AUTO_FILL_FIELD_TYPES, DATE_FORMATS, CURRENCIES,
  FONT_FAMILIES, FONT_SIZES, FONT_COLORS, CROSS_TEMPLATE_KEYS,
  getRecipientPalette,
} from '@/lib/sign/types'

const PDFViewer = dynamic(() => import('./PDFViewer'), {
  ssr: false,
  loading: () => <div style={{ padding: 40, color: 'var(--muted)' }}><Loader2 size={20} className="animate-spin" /></div>,
})
const FieldsCanvas = dynamic(() => import('./FieldsCanvas'), { ssr: false })
// v2.7.6 — Tailles + libellés par défaut, partagés avec FieldsCanvas pour le double-clic palette
import { DEFAULT_FIELD_SIZE_PCT, PLACEHOLDER } from './FieldsCanvas'
// v2.8.11 — Assistant IA template (chatbot) supprimé : retour utilisateur "ne marche pas".
// Le bouton "Améliorer avec l'IA" (détection auto fields) reste, c'est un endpoint séparé.

interface Props {
  templateId: string
  templateName: string
  // v2.2.2 — État partagé contrôlé par le parent (page.tsx)
  documents: SignDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<SignDocument[]>>
  recipientsSchema: SignRecipientSchema[]
  setRecipientsSchema: React.Dispatch<React.SetStateAction<SignRecipientSchema[]>>
  // wizard_steps + wizard_enabled : transmis pour persister au save (atomic).
  // setWizardSteps optionnel pour permettre l'auto-ajout d'un nouveau field au
  // step matching son recipientOrder (v2.2.4).
  wizardSteps: WizardStep[]
  setWizardSteps?: React.Dispatch<React.SetStateAction<WizardStep[]>>
  wizardEnabled: boolean
  /** v2.2.2 — Counter incrémenté par le parent à chaque fetch successful. Trigger reset dirty. */
  serverVersion?: number
  onSaved?: () => void
}

// v2.2.0 Phase 2.5 — toolbar alignée DocuSign avec 4 catégories
const TOOL_ICONS: Record<SignFieldType, typeof PenLine> = {
  signature:  PenLine,
  initial:    IdCard,
  date:       Calendar,
  firstname:  User,
  lastname:   User,
  fullname:   User,
  email:      Mail,
  company:    Building2,
  title:      Briefcase,
  text:       Type,
  number:     Hash,
  time:       Clock,
  pointage:   Clock,
  checkbox:   CheckSquare,
  select:     ListIcon,
  annotation: StickyNote,
  formula:    Sigma,
  attachment: Paperclip,
}

const PDF_TARGET_WIDTH = 720 // px (largeur cible du PDF rendu)

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export default function TemplateEditor({
  templateId, templateName,
  documents: docs, setDocuments: setDocs,
  recipientsSchema: recipients, setRecipientsSchema: setRecipients,
  wizardSteps, setWizardSteps, wizardEnabled, serverVersion = 0, onSaved,
}: Props) {
  const router = useRouter()

  const [activeDocIdx, setActiveDocIdx] = useState(0)
  const [activePage, setActivePage] = useState(1)
  const [numPages, setNumPages] = useState<number>(0)
  const [renderInfo, setRenderInfo] = useState<PageRenderInfo | null>(null)
  const [activeTool, setActiveTool] = useState<SignFieldType | null>(null)
  const [activeRecipientOrder, setActiveRecipientOrder] = useState<number>(
    () => recipients[0]?.order ?? 1
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  // v2.7.6 — État distinct pour le save MANUEL (clic utilisateur sur "Enregistrer").
  // Évite que le bouton flicker pendant les auto-saves silencieux (saving=true 800ms).
  // Le bouton ne devient disabled QUE pendant une vraie sauvegarde manuelle.
  const [manualSaving, setManualSaving] = useState(false)
  // v2.7.4 — Détection auto IA des champs (Claude Vision PDF natif)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiStatus, setAiStatus] = useState<string>('')
  const [aiBanner, setAiBanner] = useState<{ fields: number; pages: number } | null>(null)
  // v2.7.4 — Upload PDF supplémentaire au template existant
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const addPdfInputRef = useRef<HTMLInputElement | null>(null)
  const [renamingDocIdx, setRenamingDocIdx] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  // v2.7.6 — Modal "Champs orphelins" accessible aussi depuis Mode Document
  const [orphanModalOpen, setOrphanModalOpen] = useState(false)
  const [orphanLocatedFieldId, setOrphanLocatedFieldId] = useState<string | null>(null)
  // v2.7.6 — Filtre Mode Document : focus sur les fields d'une étape spécifique
  // (les autres restent visibles mais grisés à 30% opacity). null = pas de filtre.
  const [stepFilterIdx, setStepFilterIdx] = useState<number | null>(null)

  // v2.7.6 — Champs orphelins = présents dans le PDF mais pas dans le wizard
  // (auto-fill types exclus car gérés par le step auto-fill automatique)
  const allTemplateFields = useMemo(
    () => docs.flatMap(d => d.fields || []),
    [docs],
  )
  const orphanFields = useMemo(() => {
    const isAutoFill = (t: string) => ['firstname', 'lastname', 'fullname', 'email', 'company', 'title'].includes(t)
    const wizardFieldIds = new Set<string>()
    for (const s of wizardSteps) {
      for (const fid of s.fieldIds) wizardFieldIds.add(fid)
    }
    return allTemplateFields.filter(f => !isAutoFill(f.type) && !wizardFieldIds.has(f.id))
  }, [allTemplateFields, wizardSteps])

  // v2.7.6 — Set des fields appartenant à l'étape sélectionnée (focus visuel)
  const stepFilterFieldIds = useMemo(() => {
    if (stepFilterIdx === null) return null
    const step = wizardSteps[stepFilterIdx]
    if (!step) return null
    return new Set(step.fieldIds)
  }, [stepFilterIdx, wizardSteps])

  // v2.8.10 — Mapping order → colorIdx (palette custom par rôle)
  const recipientColorMap = useMemo<Record<number, number>>(() => {
    const map: Record<number, number> = {}
    for (const r of recipients) {
      if (typeof r.colorIdx === 'number' && typeof r.order === 'number') {
        map[r.order] = r.colorIdx
      }
    }
    return map
  }, [recipients])

  // v2.3.16 — Modal preview PDF stampé avec données de test
  const [previewOpen, setPreviewOpen] = useState(false)

  const activeDoc = docs[activeDocIdx]
  const fields = useMemo(() => activeDoc?.fields || [], [activeDoc])

  // Reset page sur changement de doc
  useEffect(() => {
    setActivePage(1)
    setSelectedIds([])
  }, [activeDocIdx])

  // Reset sélection quand on change de page (UX cohérent)
  useEffect(() => {
    setSelectedIds([])
  }, [activePage])

  // v2.2.2 — Reset dirty quand le parent recharge (après save)
  useEffect(() => {
    if (serverVersion > 0) setDirty(false)
  }, [serverVersion])

  // v2.9.14 — ESC global désactive l'outil actif (placement de champ)
  useEffect(() => {
    if (!activeTool) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Ne pas intercepter si focus dans un input/textarea (l'utilisateur tape)
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        setActiveTool(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTool])

  // URL du PDF (route authentifiée)
  const fileUrl = useMemo(() => {
    if (!activeDoc) return ''
    return `/api/sign/templates/${templateId}/file?path=${encodeURIComponent(activeDoc.storage_path)}`
  }, [activeDoc, templateId])

  // v2.2.4 — Zoom du PDF (50% à 200%, défaut 100%). Multiplie PDF_TARGET_WIDTH.
  const [zoom, setZoom] = useState(1.0)
  const zoomedWidth = Math.round(PDF_TARGET_WIDTH * zoom)
  const ZOOM_MIN = 0.5
  const ZOOM_MAX = 2.0
  const ZOOM_STEP = 0.1
  const zoomIn = () => setZoom(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10))
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10))
  const zoomReset = () => setZoom(1.0)

  // v2.2.4 — Toggle affichage des badges wizardSection au-dessus de chaque field.
  // Persisté en localStorage pour conserver la préférence entre sessions.
  const [showSectionBadges, setShowSectionBadges] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('sign:showSectionBadges') !== '0'
  })
  const toggleSectionBadges = () => {
    setShowSectionBadges(v => {
      const next = !v
      try { window.localStorage.setItem('sign:showSectionBadges', next ? '1' : '0') } catch {}
      return next
    })
  }

  // Feature 4 — Toggle affichage des badges numéros d'étapes.
  // Activé par défaut si le template a des wizard_steps. Persisté en localStorage.
  const [showStepBadges, setShowStepBadges] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('sign:showStepBadges') !== '0'
  })
  const toggleStepBadges = () => {
    setShowStepBadges(v => {
      const next = !v
      try { window.localStorage.setItem('sign:showStepBadges', next ? '1' : '0') } catch {}
      return next
    })
  }

  // v2.2.4 — Undo / Redo (Cmd+Z / Cmd+Shift+Z) sur les modifications Mode Document.
  // Stack snapshots des docs avant chaque modif user. Limité à 50 entrées (mémoire).
  const HISTORY_MAX = 50
  const [past, setPast] = useState<SignDocument[][]>([])
  const [future, setFuture] = useState<SignDocument[][]>([])
  const docsRef = useRef<SignDocument[]>(docs)
  useEffect(() => { docsRef.current = docs }, [docs])

  /** Pousse l'état COURANT dans past avant la modif. Appelé par les wrappers
   *  updateDocFields / setRecipients tracked. NE PAS appeler pour le sync parent. */
  const pushHistory = () => {
    setPast(p => {
      const next = [...p, docsRef.current.map(d => ({ ...d, fields: [...(d.fields || [])] }))]
      return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next
    })
    setFuture([])
  }
  const undo = () => {
    if (past.length === 0) return
    const prev = past[past.length - 1]
    setPast(p => p.slice(0, -1))
    setFuture(f => [...f, docsRef.current])
    setDocs(prev)
    setDirty(true)
  }
  const redo = () => {
    if (future.length === 0) return
    const next = future[future.length - 1]
    setFuture(f => f.slice(0, -1))
    setPast(p => [...p, docsRef.current])
    setDocs(next)
    setDirty(true)
  }

  // v2.2.4 — Clipboard local pour copier-coller des fields entre sélections / pages.
  // Stocke un snapshot des fields au Cmd+C (avec leurs configs originales). Au Cmd+V,
  // on génère de nouveaux UUIDs + un offset visuel pour ne pas se superposer à la source.
  const clipboardRef = useRef<SignField[]>([])

  // Raccourcis clavier — actifs uniquement quand le focus n'est pas dans un input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const isCmd = e.metaKey || e.ctrlKey
      if (!isCmd) return
      const key = e.key.toLowerCase()

      // v2.2.4 — Undo / Redo
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }

      // v2.2.4 — Copier (Cmd+C)
      if (key === 'c' && selectedIds.length > 0) {
        const sel = (activeDoc?.fields || []).filter(f => selectedIds.includes(f.id))
        if (sel.length === 0) return
        e.preventDefault()
        clipboardRef.current = sel.map(f => ({ ...f }))
        toast.success(`${sel.length} champ${sel.length > 1 ? 's' : ''} copié${sel.length > 1 ? 's' : ''}`)
        return
      }

      // v2.2.4 — Coller (Cmd+V)
      if (key === 'v' && clipboardRef.current.length > 0) {
        e.preventDefault()
        const offset = 0.02  // décale légèrement pour ne pas superposer
        const newFields: SignField[] = clipboardRef.current.map(f => ({
          ...f,
          id: genId(),
          page: activePage,  // colle sur la page courante (utile cross-page)
          x: Math.max(0, Math.min(1 - f.width, f.x + offset)),
          y: Math.max(0, Math.min(1 - f.height, f.y + offset)),
          // Reset groupId : la copie n'hérite pas du groupe source (sinon comptage cassé)
          groupId: undefined,
        }))
        const all = [...(activeDoc?.fields || []), ...newFields]
        updateDocFields(all)
        setSelectedIds(newFields.map(f => f.id))
        toast.success(`${newFields.length} champ${newFields.length > 1 ? 's' : ''} collé${newFields.length > 1 ? 's' : ''}`)
        return
      }

      // v2.2.4 — Dupliquer (Cmd+D) — copy + paste en une touche
      if (key === 'd' && selectedIds.length > 0) {
        const sel = (activeDoc?.fields || []).filter(f => selectedIds.includes(f.id))
        if (sel.length === 0) return
        e.preventDefault()  // évite Cmd+D du navigateur (ajouter aux favoris)
        const offset = 0.02
        const newFields: SignField[] = sel.map(f => ({
          ...f,
          id: genId(),
          x: Math.max(0, Math.min(1 - f.width, f.x + offset)),
          y: Math.max(0, Math.min(1 - f.height, f.y + offset)),
          groupId: undefined,
        }))
        const all = [...(activeDoc?.fields || []), ...newFields]
        updateDocFields(all)
        setSelectedIds(newFields.map(f => f.id))
        toast.success(`${newFields.length} champ${newFields.length > 1 ? 's' : ''} dupliqué${newFields.length > 1 ? 's' : ''}`)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [past, future, selectedIds, activeDoc, activePage])

  // Update doc fields — v2.2.4 : pousse l'état dans history avant modif.
  // v2.2.4 — Auto-ajout au wizard : quand on CRÉE un nouveau field (length augmente),
  // on l'ajoute auto au 1er step du wizard qui matche son recipientOrder, pour éviter
  // les fields orphelins (placés sur PDF mais invisibles côté candidat).
  const updateDocFields = (newFields: SignField[]) => {
    pushHistory()
    const prevFields = activeDoc?.fields || []
    setDocs(prev => prev.map((d, i) => i === activeDocIdx ? { ...d, fields: newFields } : d))
    setDirty(true)
    // Détection de fields ajoutés (compare ids prev vs new)
    if (setWizardSteps && newFields.length > prevFields.length) {
      const prevIds = new Set(prevFields.map(f => f.id))
      const addedFields = newFields.filter(f => !prevIds.has(f.id))
      if (addedFields.length === 0) return
      // v2.2.4 — Priorité d'ajout intelligente :
      //   1. Le step actif dans WizardEditor (sessionStorage 'sign:active-step-id')
      //      mémorisé à chaque sélection de step côté Mode Wizard.
      //   2. Sinon : le DERNIER step matching le rôle (les nouveaux fields sont
      //      en général ajoutés en fin, plus logique que le 1er aveugle).
      const activeStepId = typeof window !== 'undefined'
        ? sessionStorage.getItem('sign:active-step-id') || null
        : null
      let toastedStepTitle: string | null = null
      let toastedCount = 0
      setWizardSteps(prev => {
        const next = prev.slice()
        for (const newF of addedFields) {
          // v2.2.4 fix — Skip seulement les VRAIS auto-fill (firstname/lastname/fullname/email
          // remplis automatiquement depuis le profil destinataire). Signature/initial restent
          // dans le wizard car le candidat doit interagir pour signer.
          if (['firstname', 'lastname', 'fullname', 'email'].includes(newF.type)) continue
          const order = newF.recipientOrder ?? 1
          // 1. Tente le step actif (s'il existe ET matche le rôle du field)
          let stepIdx = -1
          if (activeStepId) {
            const candidate = next.findIndex(s => s.id === activeStepId && (s.recipientOrder ?? 1) === order)
            if (candidate >= 0) stepIdx = candidate
          }
          // 2. Sinon : DERNIER step matching le rôle
          if (stepIdx < 0) {
            for (let i = next.length - 1; i >= 0; i--) {
              if ((next[i].recipientOrder ?? 1) === order) { stepIdx = i; break }
            }
          }
          if (stepIdx < 0) continue
          if (next[stepIdx].fieldIds.includes(newF.id)) continue
          next[stepIdx] = { ...next[stepIdx], fieldIds: [...next[stepIdx].fieldIds, newF.id] }
          if (!toastedStepTitle) toastedStepTitle = next[stepIdx].title
          toastedCount++
        }
        return next
      })
      if (toastedCount > 0 && toastedStepTitle) {
        toast.success(`${toastedCount} champ${toastedCount > 1 ? 's' : ''} ajouté${toastedCount > 1 ? 's' : ''} à l'étape « ${toastedStepTitle} »`, { duration: 3500 })
      }
    }
  }



  // Update une recipient
  const updateRecipient = (idx: number, patch: Partial<SignRecipientSchema>) => {
    setRecipients(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
    setDirty(true)
  }

  // v2.8.11 — GARDE-FOU ANTI-ÉCRASEMENT (incident 17/05/2026 14:56) :
  // Capture les counts au premier load avec data non-vide. Si plus tard un PATCH
  // silent tente d'envoyer docs=[] alors que le template avait des docs, on REFUSE.
  // Protège contre une race condition HMR / state reset qui aurait wipe la DB.
  const initialLoadCountsRef = useRef<{ docs: number; recipients: number; steps: number } | null>(null)
  useEffect(() => {
    if (initialLoadCountsRef.current === null && (docs.length > 0 || recipients.length > 0 || wizardSteps.length > 0)) {
      initialLoadCountsRef.current = {
        docs: docs.length,
        recipients: recipients.length,
        steps: wizardSteps.length,
      }
    }
  }, [docs.length, recipients.length, wizardSteps.length])

  // Save — v2.2.2 : envoie aussi wizard_steps + wizard_enabled (atomic) pour
  // que les modifs faites dans Mode Wizard ne soient pas perdues si l'admin
  // sauve depuis Mode Document. Le state vient maintenant du parent partagé.
  // v2.7.4 — Accepte un flag silent (=true en auto-save) pour ne pas spammer de toasts.
  const handleSave = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    // v2.8.11 — Garde-fou anti-écrasement : refuse tout PATCH (silent OU manuel)
    // qui tenterait d'envoyer un payload vide alors que le template avait du contenu.
    const init = initialLoadCountsRef.current
    if (init) {
      const wipingDocs = init.docs > 0 && docs.length === 0
      const wipingRecipients = init.recipients > 0 && recipients.length === 0
      const wipingSteps = init.steps > 0 && wizardSteps.length === 0
      if (wipingDocs || wipingRecipients || wipingSteps) {
        const msg = `Auto-save annulée (écrasement détecté) — docs:${docs.length}/${init.docs}, recipients:${recipients.length}/${init.recipients}, steps:${wizardSteps.length}/${init.steps}. Recharge la page.`
        console.error('[Sign][SAFEGUARD] Blocked PATCH', { docs: docs.length, recipients: recipients.length, steps: wizardSteps.length, initial: init })
        if (!silent) toast.error(msg)
        else toast.warning(msg, { duration: 10000 })
        return
      }
    }
    setSaving(true)
    if (!silent) setManualSaving(true)
    try {
      const r = await fetch(`/api/sign/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: docs,
          recipients_schema: recipients,
          wizard_steps: wizardSteps,
          wizard_enabled: wizardEnabled,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      if (!silent) toast.success('Template enregistré')
      setDirty(false)
      // v2.7.4 — En mode silent (auto-save / switch onglet / unload) on NE refetch PAS
      // le template. Avant : onSaved=fetchTemplate → setLoading(true) → re-render complet
      // de la page → flash blanc "clignement" à chaque frappe. Le state local est déjà
      // cohérent avec la DB (on vient de l'envoyer), inutile de refaire un GET.
      if (!silent) onSaved?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      // En auto-save : toast d'erreur en warning discret pour signaler à l'user qu'il
      // doit éventuellement cliquer Enregistrer manuellement.
      if (silent) toast.warning(`Auto-save échouée : ${msg}`)
      else toast.error(msg)
    } finally {
      setSaving(false)
      setManualSaving(false)
    }
  }

  // v2.7.4 — Auto-save debounced (800ms après le dernier changement)
  // Déclenche silencieusement handleSave dès que `dirty` est true. Ne re-déclenche
  // pas tant que la sauvegarde précédente n'est pas terminée. Cleanup du timer
  // sur chaque nouveau changement → la dernière modif sera prise en compte.
  useEffect(() => {
    if (!dirty || saving) return
    const handle = setTimeout(() => {
      void handleSave({ silent: true })
    }, 800)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, docs, recipients, wizardSteps, wizardEnabled])

  // v2.7.4 — Ajout d'un PDF supplémentaire au template existant via UPLOAD DIRECT Supabase
  // Storage. Le navigateur PUT directement le fichier → bypass Vercel Functions 4.5 MB limit.
  // Limite : 50 MB par fichier (sanity check), max 10 fichiers à la fois (sécurité UX).
  //
  // Workflow :
  //   1. POST /api/sign/upload-url (light JSON) → renvoie signed uploadUrl + path
  //   2. PUT uploadUrl avec body=File, Content-Type=application/pdf (direct Supabase)
  //   3. Ajoute le doc avec le path retourné
  const handleAddPdf = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const arr = Array.from(files).slice(0, 10)
    setUploadingPdf(true)
    let added = 0
    for (const file of arr) {
      if (!/\.pdf$/i.test(file.name)) {
        toast.warning(`"${file.name}" ignoré (pas un PDF)`)
        continue
      }
      // v2.7.4 — Sanity check 50 MB côté client. Supabase Storage accepte plus mais on
      // garde une limite raisonnable pour éviter les uploads accidentels énormes.
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`"${file.name}" : ${(file.size / 1024 / 1024).toFixed(1)} MB > 50 MB`)
        continue
      }
      try {
        // 1) Demande une signed upload URL (petit JSON, pas de problème de body size)
        const r1 = await fetch('/api/sign/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: 'templates', ownerId: templateId, filename: file.name }),
        })
        const d1 = await r1.json().catch(() => ({}))
        if (!r1.ok || !d1.uploadUrl || !d1.path) {
          throw new Error(d1.error || 'Erreur création URL signée')
        }

        // 2) PUT direct vers Supabase Storage (bypass Vercel)
        const r2 = await fetch(d1.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: file,
        })
        if (!r2.ok) {
          const errText = await r2.text().catch(() => `HTTP ${r2.status}`)
          throw new Error(`Upload direct Supabase: ${errText.slice(0, 120)}`)
        }

        // 3) Ajoute au state docs (le file est déjà dans Storage, pas besoin de re-POST)
        setDocs(prev => [
          ...prev,
          {
            name: file.name,
            storage_path: d1.path,
            order: prev.length,
            fields: [],
          } as SignDocument,
        ])
        added++
      } catch (e: any) {
        toast.error(`${file.name}: ${e.message || 'Erreur upload'}`)
      }
    }
    setUploadingPdf(false)
    if (addPdfInputRef.current) addPdfInputRef.current.value = ''
    if (added > 0) {
      setDirty(true)
      toast.success(`${added} PDF${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} au template (n'oublie pas d'enregistrer)`)
      // Bascule sur le 1er PDF nouvellement ajouté
      setActiveDocIdx(docs.length)
    }
  }

  // v2.7.4 — Détection auto via Claude Vision PDF (mode B = template vide)
  //   OU enrichissement (mode A = template avec fields existants).
  // Bouton selon contexte :
  //   - 0 champs → "🔍 Détecter automatiquement" (amber)
  //   - sinon → "✨ Améliorer avec l'IA" (outline)
  const handleAiDetect = async () => {
    const totalFields = fieldsTotalCount(docs)
    const isEmpty = totalFields === 0

    // Si fields existants : confirme avant d'écraser la structure wizard
    if (!isEmpty) {
      const ok = window.confirm(
        `✨ Améliorer avec l'IA\n\nL'IA va analyser les ${totalFields} champ${totalFields > 1 ? 's' : ''} existants et reconstruire la structure du wizard (étapes, groupes, tooltips, conditions). Les champs eux-mêmes restent intacts (positions, types).\n\nLancer l'analyse ?`,
      )
      if (!ok) return
    } else {
      const ok = window.confirm(
        '🔍 Détecter les champs automatiquement\n\nClaude Vision va analyser le PDF et placer les champs détectés (nom, prénom, dates, signatures, checkboxes...). L\'opération prend 20-30 secondes par document.\n\nLancer la détection ?',
      )
      if (!ok) return
    }

    setAiBusy(true)
    setAiStatus(isEmpty ? '📄 Téléchargement du PDF…' : '🤖 Analyse IA en cours…')
    setAiBanner(null)
    try {
      // v2.7.6 — Boucle sur les batchs jusqu'à status:'complete' (pagination IA pour
      // templates > 5 docs : 3 docs traités par batch pour éviter timeout Vercel 120s).
      let totalNewFields = 0
      let totalUpdated = 0
      let totalSteps = 0
      let nextBatch: number | null = 0
      let totalDocs = 0

      // Petit délai cosmétique avant de changer le texte (effet "étapes")
      setTimeout(() => setAiStatus(isEmpty ? '🤖 Claude analyse votre document…' : '🤖 Restructuration des étapes…'), 1200)

      while (nextBatch !== null) {
        const r: Response = await fetch(`/api/sign/templates/${templateId}/enrich-with-ai?batchStart=${nextBatch}`, { method: 'POST' })
        const d: any = await r.json()
        if (!r.ok) throw new Error(d.error || 'Erreur détection')

        totalNewFields += (d.newFieldsCount as number) ?? 0
        totalUpdated += (d.fieldUpdatesCount as number) ?? 0
        totalSteps += (d.stepsCount as number) ?? 0
        totalDocs = (d.totalDocs as number) ?? 0

        if (d.status === 'partial') {
          nextBatch = d.nextBatchIndex as number | null
          setAiStatus(`🤖 ${d.processedDocs}/${totalDocs} documents traités…`)
        } else {
          nextBatch = null
        }
      }

      if (isEmpty && totalNewFields > 0) {
        const pages = docs.reduce((acc, doc) => acc + (doc.page_count || 1), 0)
        setAiBanner({ fields: totalNewFields, pages })
        toast.success(`✅ ${totalNewFields} champ${totalNewFields > 1 ? 's' : ''} détecté${totalNewFields > 1 ? 's' : ''} et placé${totalNewFields > 1 ? 's' : ''} !`)
      } else if (!isEmpty) {
        const parts: string[] = [`${totalSteps} étape${totalSteps > 1 ? 's' : ''}`]
        if (totalNewFields > 0) parts.push(`${totalNewFields} champs créés`)
        if (totalUpdated > 0) parts.push(`${totalUpdated} enrichis`)
        toast.success(`✨ IA : ${parts.join(' · ')}`)
      } else {
        toast.warning('Aucun champ détecté. Le PDF est peut-être un scan de mauvaise qualité.')
      }

      // Rafraîchit le template (les fields ont été persistés côté serveur)
      onSaved?.()
    } catch (e: any) {
      toast.error(e?.message || 'Erreur détection. Réessaye ou place les champs manuellement.')
    } finally {
      setAiBusy(false)
      setAiStatus('')
    }
  }

  // Delete field(s) selected (bouton aussi exposé dans le panel droit)
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return
    const set = new Set(selectedIds)
    updateDocFields(fields.filter(f => !set.has(f.id)))
    setSelectedIds([])
  }

  // Update partiel d'un champ (par id)
  const patchField = (id: string, patch: Partial<SignField>) => {
    updateDocFields(fields.map(f => f.id === id ? { ...f, ...patch } : f))
  }

  // Update plusieurs champs en une fois
  const patchFields = (ids: string[], patch: Partial<SignField>) => {
    const set = new Set(ids)
    updateDocFields(fields.map(f => set.has(f.id) ? { ...f, ...patch } : f))
  }

  // v2.6.10 — Update plusieurs champs avec un patch DIFFÉRENT par champ
  // (utilisé pour aligner gauche/droite/haut/bas, distribuer, etc.)
  const patchFieldsMixed = (updates: Array<{ id: string; patch: Partial<SignField> }>) => {
    const byId = new Map(updates.map(u => [u.id, u.patch]))
    updateDocFields(fields.map(f => byId.has(f.id) ? { ...f, ...byId.get(f.id)! } : f))
  }

  // ─── v2.9.21 — Gestion des sections (wizardSection) — Mode Document ──────
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    setCollapsedSections(loadCollapsedSections(templateId))
  }, [templateId])
  const persistCollapsedSet = (next: Set<string>) => {
    setCollapsedSections(next)
    saveCollapsedSections(templateId, next)
  }
  const toggleSectionCollapse = (name: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      saveCollapsedSections(templateId, next)
      return next
    })
  }

  // Champs du destinataire actif, tous documents confondus (une section peut
  // exister sur plusieurs PDFs du même template).
  const recipientFieldsAllDocs = useMemo(
    () => allTemplateFields.filter(f => (f.recipientOrder ?? 1) === activeRecipientOrder),
    [allTemplateFields, activeRecipientOrder],
  )
  const sectionRows = useMemo<SectionManagerRow[]>(() => {
    return collectSections(recipientFieldsAllDocs).map(s => {
      const members = recipientFieldsAllDocs.filter(f => (f.wizardSection || '').trim() === s.name)
      const pages = Array.from(new Set(members.map(f => f.page || 1))).sort((a, b) => a - b)
      const contextLabel = pages.length === 0
        ? '—'
        : pages.length === 1 ? `Page ${pages[0]}`
        : `Pages ${pages[0]}-${pages[pages.length - 1]}`
      return {
        name: s.name,
        count: s.count,
        allRequired: s.allRequired,
        collapsed: collapsedSections.has(s.name),
        contextLabel,
        canMoveUp: false,   // réordonnancement = Mode Wizard (positions absolues ici)
        canMoveDown: false,
      }
    })
  }, [recipientFieldsAllDocs, collapsedSections])
  const unsectionedCount = useMemo(
    () => recipientFieldsAllDocs.filter(f => !(f.wizardSection || '').trim()).length,
    [recipientFieldsAllDocs],
  )

  // Patchers cross-documents (history + dirty trackés)
  const patchFieldsAcrossDocs = (ids: Set<string>, patch: Partial<SignField>) => {
    if (ids.size === 0) return
    pushHistory()
    setDocs(prev => prev.map(d => ({
      ...d,
      fields: (d.fields || []).map(f => (ids.has(f.id) ? { ...f, ...patch } : f)),
    })))
    setDirty(true)
  }
  const deleteFieldsAcrossDocs = (ids: Set<string>) => {
    if (ids.size === 0) return
    pushHistory()
    setDocs(prev => prev.map(d => ({
      ...d,
      fields: (d.fields || []).filter(f => !ids.has(f.id)),
    })))
    if (setWizardSteps) {
      setWizardSteps(prev => prev.map(s => ({
        ...s,
        fieldIds: s.fieldIds.filter(id => !ids.has(id)),
      })))
    }
    setDirty(true)
  }

  const renameSectionDoc = (oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    const ids = new Set(
      recipientFieldsAllDocs.filter(f => (f.wizardSection || '').trim() === oldName).map(f => f.id),
    )
    patchFieldsAcrossDocs(ids, { wizardSection: trimmed })
    if (collapsedSections.has(oldName)) {
      const next = new Set(collapsedSections)
      next.delete(oldName); next.add(trimmed)
      persistCollapsedSet(next)
    }
    toast.success(`Section renommée : « ${oldName} » → « ${trimmed} »`)
  }
  const deleteSectionDoc = (name: string, deleteFields: boolean) => {
    const members = recipientFieldsAllDocs.filter(f => (f.wizardSection || '').trim() === name)
    if (members.length === 0) return
    const ids = new Set(members.map(f => f.id))
    if (deleteFields) {
      deleteFieldsAcrossDocs(ids)
      toast.success(`${members.length} champ${members.length > 1 ? 's supprimés' : ' supprimé'}`)
    } else {
      patchFieldsAcrossDocs(ids, { wizardSection: undefined, sectionDescription: undefined })
      toast.success(`Section « ${name} » dégroupée — ${members.length} champ${members.length > 1 ? 's conservés' : ' conservé'}`)
    }
    if (collapsedSections.has(name)) {
      const next = new Set(collapsedSections)
      next.delete(name)
      persistCollapsedSet(next)
    }
  }
  const toggleSectionRequiredDoc = (name: string, required: boolean) => {
    const members = recipientFieldsAllDocs.filter(f => (f.wizardSection || '').trim() === name)
    const targets = members.filter(m => !(m.type === 'checkbox' && m.groupId && m.groupRule))
    patchFieldsAcrossDocs(new Set(targets.map(f => f.id)), { required })
    const skipped = members.length - targets.length
    toast.success(
      `Section « ${name} » : ${required ? 'tout obligatoire' : 'tout facultatif'}`
      + (skipped > 0 ? ` (${skipped} case${skipped > 1 ? 's' : ''} groupée${skipped > 1 ? 's' : ''} ignorée${skipped > 1 ? 's' : ''})` : ''),
    )
  }
  const collapseAllSectionsDoc = (collapsed: boolean) => {
    persistCollapsedSet(collapsed ? new Set(sectionRows.map(r => r.name)) : new Set())
  }

  // v2.6.10 / v2.6.12 / v2.6.13 — Apply size+y d'un champ à tous les autres similaires.
  // "Similaire" = au moins UN nom commun entre tooltip OR label des deux fields (insensible
  // casse + espaces). Plus tolérant que la v2.6.12 qui matchait tooltip XOR label en exclusif.
  // Width + height + y sont propagés (uniformise taille ET aligne verticalement sur la même ligne).
  // Le x reste propre à chaque field (= chaque colonne du tableau a son x).
  const applySizeToSimilar = (sourceId: string) => {
    const src = fields.find(f => f.id === sourceId)
    if (!src) return 0
    const srcKeys = fieldNameKeys(src)
    if (srcKeys.length === 0) return 0  // Pas de critère identifiable → ne fait rien
    let count = 0
    const next = fields.map(f => {
      if (f.id === sourceId) return f
      if (f.type !== src.type) return f  // sécurité : ne propage qu'entre fields du même type
      const fKeys = fieldNameKeys(f)
      if (fKeys.length === 0) return f
      if (srcKeys.some(k => fKeys.includes(k))) {
        count++
        return { ...f, width: src.width, height: src.height, y: src.y }
      }
      return f
    })
    if (count > 0) updateDocFields(next)
    return count
  }

  // v2.6.13 / v2.6.15 — Helper "noms d'un field pour matching" : tooltip + label trim+lower,
  // dédupliqués, PLUS leur variante sans les noms de jours (Lundi/Mardi/...) → permet de
  // matcher "Heures normales Lundi" avec "Heures normales Samedi" sans config supplémentaire.
  function fieldNameKeys(f: SignField): string[] {
    const DAYS_RE = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi
    const t = (f.tooltip || '').trim().toLowerCase()
    const l = (f.label || '').trim().toLowerCase()
    const set = new Set<string>()
    for (const raw of [t, l]) {
      if (!raw || raw === '0') continue
      set.add(raw)
      const stripped = raw.replace(DAYS_RE, '').replace(/\s+/g, ' ').trim()
      if (stripped && stripped !== raw) set.add(stripped)
    }
    return Array.from(set)
  }

  // Patche tous les champs d'un groupe (pour propager nom/règle/min/max)
  const patchAllInGroup = (groupId: string, patch: Partial<SignField>) => {
    updateDocFields(fields.map(f => f.groupId === groupId ? { ...f, ...patch } : f))
  }

  // Grouper les checkboxes sélectionnés
  const handleGroupCheckboxes = (
    rule: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly',
    count: number,
    label?: string,
  ) => {
    const groupId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const selectedFields = fields.filter(f => selectedIds.includes(f.id) && f.type === 'checkbox')
    if (selectedFields.length === 0) {
      toast.error('Aucune case à cocher sélectionnée')
      return
    }
    // v2.8.3 — Si certains champs sont DÉJÀ dans un groupe, on remplace (re-groupe).
    // Avant : silencieux → l'utilisateur croyait que le bouton ne marchait pas.
    const alreadyGrouped = selectedFields.filter(f => f.groupId).length
    const fallbackName = `G${(fields.filter(f => f.groupId).map(f => f.groupId).filter((v, i, a) => a.indexOf(v) === i).length) + 1}`
    const groupName = label || fallbackName
    const set = new Set(selectedFields.map(f => f.id))
    updateDocFields(fields.map(f => {
      if (!set.has(f.id)) return f
      return {
        ...f,
        groupId,
        groupName,
        groupRule: rule,
        groupMin: rule === 'SelectAtMost' ? undefined : count,
        groupMax: rule === 'SelectAtLeast' ? undefined : count,
        // v2.8.10 — Auto-décoche required individuel : la règle du groupe prévaut.
        // Évite l'incohérence "Oui ET Non requis = impossible à satisfaire".
        required: false,
      }
    }))
    const ruleLabel = rule === 'SelectExactly' ? `Exactement ${count}` : rule === 'SelectAtMost' ? `Au plus ${count}` : `Au moins ${count}`
    toast.success(
      `✓ Groupe « ${groupName} » créé (${selectedFields.length} cases · ${ruleLabel})${alreadyGrouped > 0 ? ` — ${alreadyGrouped} case${alreadyGrouped > 1 ? 's étaient' : ' était'} déjà groupée${alreadyGrouped > 1 ? 's' : ''}, remplacement appliqué` : ''}`,
    )
  }

  // Retirer un champ d'un groupe
  const handleUngroup = (id: string) => {
    patchField(id, { groupId: undefined, groupName: undefined, groupRule: undefined, groupMin: undefined, groupMax: undefined })
  }

  if (!activeDoc) {
    return (
      <div className="neo-empty">
        <div className="neo-empty-title">Ce template n&apos;a aucun document</div>
        <div className="neo-empty-sub">Ajoute des PDFs depuis le modal de création de template.</div>
      </div>
    )
  }

  // Calcule la taille rendue du PDF — on utilise renderInfo dès qu'il est dispo
  const renderedW = renderInfo?.renderedWidth ?? PDF_TARGET_WIDTH
  const renderedH = renderInfo?.renderedHeight ?? Math.round(PDF_TARGET_WIDTH * 1.414) // A4 ratio fallback
  const fieldsForPage = fields.filter(f => f.page === activePage)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        gap: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        alignItems: 'flex-start',
      }}
    >
      {/* ─── COLONNE GAUCHE : PDF + Konva ─── */}
      <div
        className="neo-card-soft"
        style={{
          padding: 16,
          background: '#e8e3d6',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          minHeight: 600,
        }}
      >
        {/* Toolbar top : navigation docs + pages */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '8px 12px',
          }}
        >
          <Files size={14} style={{ color: 'var(--muted)' }} />
          {renamingDocIdx === activeDocIdx ? (
            <>
              <input
                type="text"
                autoFocus
                className="neo-input"
                style={{ height: 30, flex: 1, fontSize: 12.5 }}
                value={renameDraft}
                onChange={e => setRenameDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const trimmed = renameDraft.trim()
                    if (trimmed) {
                      pushHistory()
                      setDocs(prev => prev.map((d, i) => i === activeDocIdx ? { ...d, name: trimmed } : d))
                      setDirty(true)
                    }
                    setRenamingDocIdx(null)
                  } else if (e.key === 'Escape') {
                    setRenamingDocIdx(null)
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = renameDraft.trim()
                  if (trimmed) {
                    pushHistory()
                    setDocs(prev => prev.map((d, i) => i === activeDocIdx ? { ...d, name: trimmed } : d))
                    setDirty(true)
                  }
                  setRenamingDocIdx(null)
                }}
                title="Valider"
                style={{
                  width: 30, height: 30,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--success-soft)', color: 'var(--success)',
                  cursor: 'pointer',
                }}
              >
                <CheckIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setRenamingDocIdx(null)}
                title="Annuler"
                style={{
                  width: 30, height: 30,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--card)', color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                <XIcon size={14} />
              </button>
            </>
          ) : (
            <>
              <select
                value={activeDocIdx}
                onChange={e => setActiveDocIdx(Number(e.target.value))}
                className="neo-input"
                style={{ height: 30, flex: 1, fontSize: 12.5 }}
              >
                {docs.map((d, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setRenameDraft(docs[activeDocIdx]?.name || '')
                  setRenamingDocIdx(activeDocIdx)
                }}
                title="Renommer ce document"
                style={{
                  width: 30, height: 30,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--card)', color: 'var(--foreground)',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Pencil size={13} />
              </button>
              {/* v2.7.4 — Bouton supprimer le document actuellement affiché.
                  Désactivé si c'est le SEUL doc du template (on ne peut pas tout supprimer). */}
              <button
                type="button"
                onClick={() => {
                  const currentDoc = docs[activeDocIdx]
                  if (!currentDoc) return
                  const fieldCount = (currentDoc.fields || []).length
                  const detail = fieldCount > 0 ? ` et ses ${fieldCount} champ${fieldCount > 1 ? 's' : ''}` : ''
                  const ok = window.confirm(
                    `Supprimer le document "${currentDoc.name}"${detail} du template ?\n\nCette action sera effective au prochain enregistrement.`,
                  )
                  if (!ok) return
                  // Retire le doc + recale les order
                  setDocs(prev => prev
                    .filter((_, i) => i !== activeDocIdx)
                    .map((d, i) => ({ ...d, order: i }))
                  )
                  // Recale l'index actif (revient sur le précédent si on supprime le dernier)
                  setActiveDocIdx(idx => Math.max(0, Math.min(idx, docs.length - 2)))
                  setActivePage(1)
                  setDirty(true)
                  toast.success(`"${currentDoc.name}" retiré du template (enregistre pour confirmer)`)
                }}
                disabled={docs.length <= 1}
                title={docs.length <= 1 ? 'Impossible de supprimer le dernier document du template' : 'Supprimer ce document du template'}
                style={{
                  width: 30, height: 30,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid ' + (docs.length <= 1 ? 'var(--border)' : 'rgba(239,68,68,0.4)'),
                  borderRadius: 6,
                  background: docs.length <= 1 ? 'var(--card)' : 'rgba(239,68,68,0.08)',
                  color: docs.length <= 1 ? 'var(--muted)' : 'var(--destructive, #DC2626)',
                  cursor: docs.length <= 1 ? 'not-allowed' : 'pointer',
                  opacity: docs.length <= 1 ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                <Trash2 size={13} />
              </button>
              {/* v2.7.4 — Réorganisation : flèches Up / Down pour déplacer le doc actif
                  dans la liste. Affecte l'ordre dans le PDF final assemblé + l'ordre du
                  wizard. Désactivé aux extrémités. */}
              <button
                type="button"
                onClick={() => {
                  if (activeDocIdx <= 0) return
                  setDocs(prev => {
                    const next = [...prev]
                    const tmp = next[activeDocIdx - 1]
                    next[activeDocIdx - 1] = next[activeDocIdx]
                    next[activeDocIdx] = tmp
                    return next.map((d, i) => ({ ...d, order: i }))
                  })
                  setActiveDocIdx(idx => idx - 1)
                  setDirty(true)
                }}
                disabled={activeDocIdx <= 0}
                title={activeDocIdx <= 0 ? 'Déjà en première position' : 'Monter ce document dans la liste'}
                style={{
                  width: 30, height: 30,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--card)', color: 'var(--foreground)',
                  cursor: activeDocIdx <= 0 ? 'not-allowed' : 'pointer',
                  opacity: activeDocIdx <= 0 ? 0.4 : 1,
                  flexShrink: 0,
                }}
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeDocIdx >= docs.length - 1) return
                  setDocs(prev => {
                    const next = [...prev]
                    const tmp = next[activeDocIdx + 1]
                    next[activeDocIdx + 1] = next[activeDocIdx]
                    next[activeDocIdx] = tmp
                    return next.map((d, i) => ({ ...d, order: i }))
                  })
                  setActiveDocIdx(idx => idx + 1)
                  setDirty(true)
                }}
                disabled={activeDocIdx >= docs.length - 1}
                title={activeDocIdx >= docs.length - 1 ? 'Déjà en dernière position' : 'Descendre ce document dans la liste'}
                style={{
                  width: 30, height: 30,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--card)', color: 'var(--foreground)',
                  cursor: activeDocIdx >= docs.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: activeDocIdx >= docs.length - 1 ? 0.4 : 1,
                  flexShrink: 0,
                }}
              >
                <ArrowDown size={13} />
              </button>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NavBtn onClick={() => setActivePage(1)} disabled={activePage === 1}><ChevronsLeft size={14} /></NavBtn>
            <NavBtn onClick={() => setActivePage(p => Math.max(1, p - 1))} disabled={activePage === 1}><ChevronLeft size={14} /></NavBtn>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', minWidth: 60, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {activePage} / {numPages || '?'}
            </span>
            <NavBtn onClick={() => setActivePage(p => Math.min(numPages || p + 1, p + 1))} disabled={activePage >= numPages}><ChevronRight size={14} /></NavBtn>
            <NavBtn onClick={() => setActivePage(numPages || activePage)} disabled={activePage >= numPages}><ChevronsRight size={14} /></NavBtn>
          </div>
        </div>

        {/* v2.2.4 — Toolbar zoom + Undo/Redo au-dessus du PDF */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          marginBottom: 8,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          width: 'fit-content',
        }}>
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            title="Réduire"
            style={zoomBtnStyle(zoom <= ZOOM_MIN)}
          >−</button>
          <button
            type="button"
            onClick={zoomReset}
            title="Réinitialiser à 100%"
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 700,
              border: '1px solid var(--border)',
              background: zoom === 1.0 ? 'var(--card)' : 'var(--surface, var(--card))',
              color: 'var(--foreground)',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
              minWidth: 56,
            }}
          >{Math.round(zoom * 100)}%</button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            title="Agrandir"
            style={zoomBtnStyle(zoom >= ZOOM_MAX)}
          >+</button>
          {/* Séparateur */}
          <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
          {/* v2.2.4 — Undo / Redo */}
          <button
            type="button"
            onClick={undo}
            disabled={past.length === 0}
            title={`Annuler (Cmd+Z)${past.length > 0 ? ` — ${past.length} étape${past.length > 1 ? 's' : ''}` : ''}`}
            style={zoomBtnStyle(past.length === 0)}
            aria-label="Annuler"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13" />
            </svg>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            title={`Refaire (Cmd+Shift+Z)${future.length > 0 ? ` — ${future.length} étape${future.length > 1 ? 's' : ''}` : ''}`}
            style={zoomBtnStyle(future.length === 0)}
            aria-label="Refaire"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3L21 13" />
            </svg>
          </button>
          {/* Séparateur */}
          <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
          {/* v2.2.4 — Toggle "Afficher sections" sur les fields Konva */}
          <button
            type="button"
            onClick={toggleSectionBadges}
            title={showSectionBadges ? 'Masquer les badges section au-dessus des champs' : 'Afficher les badges section'}
            style={{
              padding: '4px 10px',
              fontSize: 11.5, fontWeight: 700,
              border: showSectionBadges ? '1px solid #1C1A14' : '1px solid var(--border)',
              background: showSectionBadges ? '#EAB308' : 'var(--card)',
              color: showSectionBadges ? '#1C1A14' : 'var(--foreground)',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            🏷 Sections
          </button>
          {/* v2.9.21 — Panneau gestion des sections */}
          <button
            type="button"
            onClick={() => setSectionManagerOpen(true)}
            title="Renommer, replier ou supprimer les sections"
            style={{
              padding: '4px 10px',
              fontSize: 11.5, fontWeight: 700,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--foreground)', borderRadius: 6, cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <Layers size={12} />
            Gérer{sectionRows.length > 0 ? ` (${sectionRows.length})` : ''}
          </button>
          {/* Feature 4 — Toggle badges numéros d'étapes (visible seulement si wizard_steps définis) */}
          {wizardSteps.length > 0 && (
            <button
              type="button"
              onClick={toggleStepBadges}
              title={showStepBadges ? 'Masquer les numéros d\'étapes sur les champs' : 'Afficher le numéro d\'étape sur chaque champ'}
              style={{
                padding: '4px 10px',
                fontSize: 11.5, fontWeight: 700,
                border: showStepBadges ? '1px solid #1C1A14' : '1px solid var(--border)',
                background: showStepBadges ? '#EAB308' : 'var(--card)',
                color: showStepBadges ? '#1C1A14' : 'var(--foreground)',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              🔢 Étapes
            </button>
          )}
        </div>

        {/* PDF + overlay */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <PDFViewer
            fileUrl={fileUrl}
            page={activePage}
            width={zoomedWidth}
            onLoadSuccess={n => setNumPages(n)}
            onPageRendered={info => setRenderInfo(info)}
          />
          {renderInfo && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: renderedW,
                height: renderedH,
                pointerEvents: 'auto',
              }}
            >
              <FieldsCanvas
                width={renderedW}
                height={renderedH}
                page={activePage}
                fields={fields}
                onChange={updateDocFields}
                selectedIds={selectedIds}
                onSelect={setSelectedIds}
                activeTool={activeTool}
                activeRecipientOrder={activeRecipientOrder}
                genId={genId}
                showSectionBadges={showSectionBadges}
                collapsedSections={collapsedSections}
                wizardSteps={wizardSteps}
                showStepBadges={showStepBadges}
                stepFilterFieldIds={stepFilterFieldIds}
                recipientColorMap={recipientColorMap}
              />
            </div>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>
          {activeTool
            ? <>Mode <strong style={{ color: 'var(--foreground)' }}>{FIELD_TYPE_LABELS[activeTool]}</strong> : cliquez sur le PDF pour placer un champ. Echap pour annuler.</>
            : <>Cliquez un outil à droite, puis sur le PDF pour placer un champ. Drag pour déplacer, poignée pour redimensionner.</>}
        </div>
      </div>

      {/* ─── COLONNE DROITE : tools + recipients + actions ─── */}
      {/* v2.2.0 Phase 3 — sticky + scroll indépendant pour garder le PDF visible */}
      <div
        className="scroll-thin"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          position: 'sticky',
          top: 16,
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {/* Bandeau actions */}
        <div className="neo-card-soft" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            className="neo-btn-yellow"
            onClick={() => handleSave()}
            disabled={manualSaving || !dirty}
            style={{ width: '100%', justifyContent: 'center', opacity: !dirty ? 0.55 : 1 }}
            title={dirty ? 'Forcer un enregistrement immédiat (auto-save 800ms sinon)' : 'Tout est enregistré'}
          >
            {/* v2.7.6 — Spinner et disabled basés sur manualSaving (clic user), PAS sur
                saving (qui inclut les auto-saves silencieux 800ms → clignement). */}
            {manualSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Enregistrer
          </button>
          {/* v2.3.16 — Aperçu PDF stampé avec données de test (sans sauvegarder).
              Permet à l'admin de visualiser le rendu final EXACT avant de partager
              le template — fini les 300 tests réels. */}
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={!docs[activeDocIdx]?.storage_path}
            style={{
              width: '100%', justifyContent: 'center',
              padding: '8px 14px',
              fontSize: 13, fontWeight: 600,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--card)',
              color: 'var(--foreground)',
              cursor: !docs[activeDocIdx]?.storage_path ? 'not-allowed' : 'pointer',
              opacity: !docs[activeDocIdx]?.storage_path ? 0.5 : 1,
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            title="Visualiser le PDF stampé avec des données de test (sans sauvegarder)"
          >
            <Eye size={14} />
            Aperçu PDF
          </button>

          {/* v2.7.4 — Bouton IA contextuel : Détection si 0 champs / Amélioration sinon */}
          {(() => {
            const isEmpty = fieldsTotalCount(docs) === 0
            if (isEmpty) {
              return (
                <button
                  type="button"
                  onClick={handleAiDetect}
                  disabled={aiBusy || !docs[0]?.storage_path}
                  style={{
                    width: '100%', justifyContent: 'center',
                    padding: '12px 16px',
                    fontSize: 13.5, fontWeight: 700,
                    border: '1.5px solid #EAB308',
                    borderRadius: 10,
                    background: aiBusy ? '#FEF3C7' : '#FDE68A',
                    color: '#78350F',
                    cursor: aiBusy ? 'wait' : 'pointer',
                    opacity: !docs[0]?.storage_path ? 0.5 : 1,
                    fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    flexDirection: 'column',
                  }}
                  title="Claude Vision analyse votre PDF et place les champs détectés (~20-30s)"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {aiBusy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                    {aiBusy ? (aiStatus || 'Analyse en cours…') : 'Détecter les champs automatiquement'}
                  </span>
                  {!aiBusy && (
                    <span style={{ fontSize: 10.5, color: '#78350F', opacity: 0.75, fontWeight: 500 }}>
                      L'IA analyse votre PDF et place les champs en ~30s
                    </span>
                  )}
                </button>
              )
            }
            // Mode "Améliorer" : bouton outline plus discret
            return (
              <button
                type="button"
                onClick={handleAiDetect}
                disabled={aiBusy}
                style={{
                  width: '100%', justifyContent: 'center',
                  padding: '8px 14px',
                  fontSize: 13, fontWeight: 600,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  cursor: aiBusy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
                title="L'IA restructure les étapes du wizard et enrichit les tooltips/conditions"
              >
                {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {aiBusy ? (aiStatus || 'Analyse…') : 'Améliorer avec l\'IA'}
              </button>
            )
          })()}

          {/* v2.7.4 — Banner de succès post-détection (réinitialisé après save/reload) */}
          {aiBanner && (
            <div style={{
              padding: '10px 12px',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.35)',
              borderRadius: 8,
              fontSize: 12, color: '#166534', lineHeight: 1.5,
            }}>
              ✅ <strong>{aiBanner.fields} champ{aiBanner.fields > 1 ? 's' : ''}</strong> placé{aiBanner.fields > 1 ? 's' : ''} automatiquement sur <strong>{aiBanner.pages} page{aiBanner.pages > 1 ? 's' : ''}</strong>. Vérifie et ajuste si nécessaire.
            </div>
          )}

          {/* v2.7.4 — Bouton "Ajouter un PDF" : upload un PDF supplémentaire dans le template
              existant. Fix bug "impossible d'ajouter d'autres documents après création". */}
          <button
            type="button"
            onClick={() => addPdfInputRef.current?.click()}
            disabled={uploadingPdf}
            style={{
              width: '100%', justifyContent: 'center',
              padding: '8px 14px',
              fontSize: 12.5, fontWeight: 600,
              border: '1px dashed var(--border)',
              borderRadius: 8,
              background: uploadingPdf ? 'var(--secondary)' : 'transparent',
              color: 'var(--muted-foreground)',
              cursor: uploadingPdf ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            title="Ajouter un PDF supplémentaire au template (50 MB max, max 10 à la fois)"
          >
            {uploadingPdf ? <Loader2 size={13} className="animate-spin" /> : <FilePlus size={13} />}
            {uploadingPdf ? 'Upload en cours…' : 'Ajouter un PDF'}
          </button>
          <input
            ref={addPdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleAddPdf(e.target.files)}
          />

          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            {fieldsTotalCount(docs)} champ{fieldsTotalCount(docs) > 1 ? 's' : ''} · {docs.length} PDF{docs.length > 1 ? 's' : ''}
          </div>

          {/* v2.7.6 — Filtre par étape wizard : focus visuel sur les fields d'une étape
              (les autres deviennent grisés). Utile sur templates 80+ champs. */}
          {wizardSteps.length > 0 && (
            <select
              className="neo-input"
              value={stepFilterIdx === null ? '' : String(stepFilterIdx)}
              onChange={e => setStepFilterIdx(e.target.value === '' ? null : Number(e.target.value))}
              style={{ fontSize: 12, padding: '6px 8px' }}
              title="Filtrer visuellement les champs d'une étape (les autres restent visibles mais grisés)"
            >
              <option value="">👁 Toutes les étapes</option>
              {wizardSteps.map((s, si) => {
                const role = s.recipientOrder ?? 1
                const stepNum = wizardSteps.filter((x, xi) => xi <= si && (x.recipientOrder ?? 1) === role).length
                return (
                  <option key={s.id} value={si}>
                    Rôle {role} · Étape {stepNum} · {s.title} ({s.fieldIds.length})
                  </option>
                )
              })}
            </select>
          )}

          {/* v2.7.6 — Bouton "Champs orphelins" (visible aussi en Mode Document maintenant) :
              alerte si des fields du PDF ne sont pas inclus dans le wizard candidat. */}
          {setWizardSteps && orphanFields.length > 0 && (
            <button
              type="button"
              onClick={() => setOrphanModalOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '7px 12px',
                fontSize: 12, fontWeight: 700,
                background: 'rgba(234,179,8,0.12)',
                color: '#A16207',
                border: '1px solid rgba(234,179,8,0.45)',
                borderRadius: 8, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              title={`${orphanFields.length} champ${orphanFields.length > 1 ? 's présents' : ' présent'} dans le PDF mais dans aucune étape du wizard`}
            >
              <AlertTriangle size={12} />
              {orphanFields.length} orphelin{orphanFields.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* v2.2.4 — Champ(s) sélectionné(s) en HAUT pour éviter de scroller à chaque sélection */}
        {selectedIds.length > 0 && (
          <SelectedFieldsPanel
            selectedIds={selectedIds}
            fields={fields}
            recipients={recipients}
            templateId={templateId}
            onPatch={patchField}
            onPatchMany={patchFields}
            onPatchManyMixed={patchFieldsMixed}
            onApplySizeToSimilar={applySizeToSimilar}
            onDelete={handleDeleteSelected}
            onGroupCheckboxes={handleGroupCheckboxes}
            onUngroup={handleUngroup}
            onPatchAllInGroup={patchAllInGroup}
            wizardSteps={wizardSteps}
            setWizardSteps={setWizardSteps}
          />
        )}

        {/* Tools — catégorisés style DocuSign */}
        <div className="neo-card-soft" style={{ padding: 14 }}>
          <SectionTitle>Champs à placer</SectionTitle>
          {/* v2.2.4 — Bandeau "Outil actif" pour que l'admin sache immédiatement quel
              outil est sélectionné (avant : juste un highlight pâle sur le bouton) */}
          {activeTool && (() => {
            const Icon = TOOL_ICONS[activeTool] || Type
            return (
              <div style={{
                marginBottom: 12,
                padding: '8px 10px',
                background: '#EAB308',
                color: '#1C1A14',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Icon size={14} />
                <span style={{ flex: 1 }}>Outil actif : <strong>{FIELD_TYPE_LABELS[activeTool]}</strong></span>
                <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.7, whiteSpace: 'nowrap' }}>Cliquez sur le PDF</span>
              </div>
            )
          })()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FIELD_TYPE_CATEGORIES.map(cat => (
              <div key={cat.key}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--muted)',
                    marginBottom: 4,
                    paddingLeft: 2,
                  }}
                >
                  {cat.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {cat.types.map(t => {
                    const Icon = TOOL_ICONS[t] || Type
                    const active = activeTool === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActiveTool(active ? null : t)}
                        onDoubleClick={() => {
                          // v2.7.6 — Double-clic : place le field directement au centre
                          // de la page courante (raccourci pour éviter le clic outil + clic PDF)
                          const def = DEFAULT_FIELD_SIZE_PCT[t]
                          const newField: SignField = {
                            id: genId(),
                            type: t,
                            page: activePage,
                            x: 0.5 - def.w / 2,
                            y: 0.5 - def.h / 2,
                            width: def.w,
                            height: def.h,
                            recipientOrder: activeRecipientOrder,
                            label: PLACEHOLDER[t] || t,
                            required: false,
                            source: 'manual',
                          }
                          updateDocFields([...fields, newField])
                          setSelectedIds([newField.id])
                          setActiveTool(null)
                          toast.success(`${FIELD_TYPE_LABELS[t]} placé au centre de la page`)
                        }}
                        onKeyDown={e => { if (e.key === 'Escape') setActiveTool(null) }}
                        title={`Clic = activer outil • Double-clic = placer au centre de la page ${activePage}`}
                        className="neo-btn-ghost neo-btn-sm"
                        style={{
                          justifyContent: 'flex-start',
                          fontSize: 11.5,
                          padding: '5px 8px',
                          // v2.2.4 — Highlight fort en jaune brand quand actif (avant : pâle, peu visible)
                          background: active ? '#EAB308' : undefined,
                          borderColor: active ? '#1C1A14' : undefined,
                          borderWidth: active ? 1.5 : undefined,
                          color: active ? '#1C1A14' : 'var(--foreground)',
                          fontWeight: active ? 800 : 500,
                          boxShadow: active ? '0 0 0 3px rgba(234,179,8,0.25)' : undefined,
                        }}
                      >
                        <Icon size={12} />
                        {FIELD_TYPE_LABELS[t]}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {activeTool && (
            <button
              type="button"
              onClick={() => setActiveTool(null)}
              className="neo-btn-ghost neo-btn-sm"
              style={{ marginTop: 10, fontSize: 11, width: '100%', justifyContent: 'center' }}
            >
              Désactiver l&apos;outil
            </button>
          )}
        </div>

        {/* v2.2.4 — RecalibratePanel supprimé (peu utilisé en pratique).
            Pour décaler tous les fields, utilise la sélection lasso + drag, ou Cmd+Z. */}

        {/* Recipients — v2.2.2 : édition inline (renommer / type / supprimer / ajouter) */}
        <div className="neo-card-soft" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <SectionTitle>Rôles ({recipients.length})</SectionTitle>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => {
                const nextOrder = Math.max(0, ...recipients.map(r => r.order)) + 1
                setRecipients(prev => [...prev, {
                  role: 'signer',
                  order: nextOrder,
                  roleName: `Rôle ${nextOrder}`,
                }])
                setActiveRecipientOrder(nextOrder)
                setDirty(true)
              }}
              className="neo-btn-ghost neo-btn-sm"
              title="Ajouter un nouveau rôle"
            >
              <Plus size={12} />
              Rôle
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recipients.map((r, idx) => {
              // v2.8.10 — Palette résolue depuis colorIdx (custom) ou fallback order
              const colorIdx = (typeof r.colorIdx === 'number' && r.colorIdx >= 0 && r.colorIdx < RECIPIENT_COLORS.length)
                ? r.colorIdx
                : Math.max(0, r.order ?? 0) % RECIPIENT_COLORS.length
              const c = RECIPIENT_COLORS[colorIdx] || RECIPIENT_COLORS[0]
              const active = activeRecipientOrder === r.order
              const fieldCount = countFieldsForRecipient(docs, r.order)
              return (
                <div
                  key={`${idx}-${r.order}`}
                  onClick={() => setActiveRecipientOrder(r.order)}
                  style={{
                    padding: '10px 10px',
                    borderRadius: 8,
                    border: `1.5px solid ${active ? c.stroke : 'var(--border)'}`,
                    background: active ? c.soft : 'var(--card)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {/* Ligne principale : badge + roleName editable + count + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: c.stroke, color: 'white',
                        fontSize: 11, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {r.order}
                    </span>
                    <input
                      type="text"
                      value={r.roleName || ''}
                      placeholder={`Rôle ${r.order} (ex: Candidat, Client…)`}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateRecipient(idx, { roleName: e.target.value })}
                      style={{
                        flex: 1, minWidth: 0,
                        padding: '4px 8px',
                        fontSize: 12.5, fontWeight: 600,
                        color: 'var(--foreground)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <span
                      title={`${fieldCount} champ(s) assigné(s) à ce rôle`}
                      style={{
                        fontSize: 10, fontWeight: 700, color: c.stroke,
                        padding: '2px 8px',
                        background: c.fill,
                        borderRadius: 999,
                        flexShrink: 0,
                      }}
                    >
                      {fieldCount} ch.
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        if (recipients.length === 1) {
                          toast.error('Au moins un rôle doit exister')
                          return
                        }
                        if (fieldCount > 0 && !confirm(`Le rôle "${r.roleName || `Rôle ${r.order}`}" a ${fieldCount} champ(s). Les supprimer aussi ?`)) return
                        // Retire le rôle ET les fields qui lui sont assignés
                        if (fieldCount > 0) pushHistory()
                        setRecipients(prev => prev.filter((_, i) => i !== idx))
                        if (fieldCount > 0) {
                          setDocs(prev => prev.map(d => ({
                            ...d,
                            fields: (d.fields || []).filter(f => f.recipientOrder !== r.order),
                          })))
                        }
                        if (active) {
                          const remaining = recipients.filter((_, i) => i !== idx)
                          setActiveRecipientOrder(remaining[0]?.order ?? 1)
                        }
                        setDirty(true)
                      }}
                      title="Supprimer ce rôle"
                      style={{
                        width: 24, height: 24,
                        border: 'none', background: 'transparent',
                        color: '#DC2626', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {/* Ligne secondaire : type signer/cc */}
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <select
                      value={r.role === 'cc' ? 'cc' : 'signer'}
                      onChange={e => updateRecipient(idx, { role: e.target.value as 'signer' | 'cc' })}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: 11,
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        color: 'var(--foreground)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <option value="signer">✍️ Doit signer</option>
                      <option value="cc">👁 Reçoit une copie (CC)</option>
                    </select>
                  </div>
                  {/* v2.8.10 — Palette couleur du rôle (8 choix) */}
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginRight: 4 }}>Couleur:</span>
                    {RECIPIENT_COLORS.map((cp, ci) => {
                      const isSel = colorIdx === ci
                      return (
                        <button
                          key={ci}
                          type="button"
                          onClick={() => updateRecipient(idx, { colorIdx: ci })}
                          title={`Couleur ${ci + 1}`}
                          style={{
                            width: 16, height: 16, borderRadius: 4,
                            background: cp.stroke,
                            border: isSel ? `2px solid var(--foreground)` : '2px solid transparent',
                            cursor: 'pointer', padding: 0,
                            outline: 'none',
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            💡 Le rôle ACTIF (cliqué) est appliqué aux nouveaux champs que tu places sur le PDF.
            Pour ré-affecter un champ existant, sélectionne-le sur le PDF puis change son rôle dans le panneau d&apos;édition.
          </div>
        </div>

        {/* v2.2.4 — SelectedFieldsPanel déplacé en haut (juste après le bandeau actions)
            pour éviter de scroller à chaque sélection. */}

        {/* Page courante : résumé champs */}
        <div className="neo-card-soft" style={{ padding: 14 }}>
          <SectionTitle>Page {activePage}</SectionTitle>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {fieldsForPage.length === 0
              ? 'Aucun champ sur cette page.'
              : `${fieldsForPage.length} champ${fieldsForPage.length > 1 ? 's' : ''}.`}
          </div>
        </div>
      </div>

      {/* v2.3.16 — Modal preview PDF stampé avec données de test.
          Sérialise le doc COURANT (avec fields locaux non sauvegardés) et POST
          vers /api/sign/templates/{id}/preview qui stampe avec valeurs fictives. */}
      {previewOpen && docs[activeDocIdx] && (
        <PdfPreviewModal
          url={`/api/sign/templates/${templateId}/preview`}
          postBody={{ document: docs[activeDocIdx] }}
          filename={`apercu-${(docs[activeDocIdx].name || 'template').replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`}
          title={`Aperçu — ${docs[activeDocIdx].name || 'Document'} (données de test)`}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* v2.7.6 — Modal "Champs orphelins" partagé avec WizardEditor.
          Affiche les fields du PDF non rattachés au wizard, permet de les y intégrer
          (un par un ou en lot vers une étape). Locate = scroll + highlight sur le PDF. */}
      {orphanModalOpen && setWizardSteps && (
        <OrphanFieldsModal
          orphanFields={orphanFields}
          steps={wizardSteps}
          locatedFieldId={orphanLocatedFieldId}
          onLocate={(id) => {
            // Localise le field : passe à son doc + sa page + le sélectionne
            const targetDocIdx = docs.findIndex(d => (d.fields || []).some(f => f.id === id))
            const targetField = targetDocIdx >= 0 ? (docs[targetDocIdx].fields || []).find(f => f.id === id) : null
            if (targetField) {
              if (targetDocIdx !== activeDocIdx) setActiveDocIdx(targetDocIdx)
              if (targetField.page !== activePage) setActivePage(targetField.page)
              setSelectedIds([id])
            }
            setOrphanLocatedFieldId(id === orphanLocatedFieldId ? null : id)
          }}
          onAddToStep={(fieldId, stepIdx) => {
            setWizardSteps(prev => prev.map((s, i) => i === stepIdx
              ? { ...s, fieldIds: s.fieldIds.includes(fieldId) ? s.fieldIds : [...s.fieldIds, fieldId] }
              : { ...s, fieldIds: s.fieldIds.filter(id => id !== fieldId) },
            ))
            setOrphanLocatedFieldId(null)
            toast.success('Champ ajouté à l\'étape')
          }}
          onAddAllToStep={(fieldIds, stepIdx) => {
            setWizardSteps(prev => prev.map((s, i) => i === stepIdx
              ? { ...s, fieldIds: [...s.fieldIds, ...fieldIds.filter(id => !s.fieldIds.includes(id))] }
              : { ...s, fieldIds: s.fieldIds.filter(id => !fieldIds.includes(id)) },
            ))
            toast.success(`${fieldIds.length} champ${fieldIds.length > 1 ? 's ajoutés' : ' ajouté'}`)
          }}
          onDelete={(fieldIds) => {
            const idSet = new Set(fieldIds)
            // Supprime des docs ET des wizardSteps
            const newDocs = docs.map(d => ({
              ...d,
              fields: (d.fields || []).filter(f => !idSet.has(f.id)),
            }))
            setDocs(newDocs)
            setWizardSteps(prev => prev.map(s => ({
              ...s,
              fieldIds: s.fieldIds.filter(id => !idSet.has(id)),
            })))
            setDirty(true)
            toast.success(`${fieldIds.length} champ${fieldIds.length > 1 ? 's supprimés' : ' supprimé'}`)
          }}
          onClose={() => { setOrphanModalOpen(false); setOrphanLocatedFieldId(null) }}
        />
      )}

      {/* v2.9.21 — Panneau gestion des sections */}
      {sectionManagerOpen && (
        <SectionManager
          mode="document"
          rows={sectionRows}
          unsectionedCount={unsectionedCount}
          onRename={renameSectionDoc}
          onDelete={deleteSectionDoc}
          onToggleRequired={toggleSectionRequiredDoc}
          onMove={() => { /* réordonnancement = Mode Wizard uniquement */ }}
          onToggleCollapse={toggleSectionCollapse}
          onCollapseAll={collapseAllSectionsDoc}
          onClose={() => setSectionManagerOpen(false)}
        />
      )}

    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// Panel "Champ(s) sélectionné(s)" — gère 1 ou plusieurs sélections
// ─────────────────────────────────────────────────────────────────
function SelectedFieldsPanel({
  selectedIds, fields, recipients, templateId, onPatch, onPatchMany, onPatchManyMixed, onApplySizeToSimilar, onDelete,
  onGroupCheckboxes, onUngroup, onPatchAllInGroup,
  wizardSteps, setWizardSteps,
}: {
  selectedIds: string[]
  fields: SignField[]
  recipients: SignRecipientSchema[]
  /** v2.9.72 — Pour upload des aides visuelles attachées aux champs */
  templateId: string
  onPatch: (id: string, patch: Partial<SignField>) => void
  onPatchMany: (ids: string[], patch: Partial<SignField>) => void
  /** v2.6.10 — Pour aligner/distribuer : patch différent par field */
  onPatchManyMixed: (updates: Array<{ id: string; patch: Partial<SignField> }>) => void
  /** v2.6.10 — Apply size to all fields with same tooltip/label */
  onApplySizeToSimilar: (sourceId: string) => number
  onDelete: () => void
  onGroupCheckboxes: (rule: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly', count: number, label?: string) => void
  onUngroup: (id: string) => void
  onPatchAllInGroup: (groupId: string, patch: Partial<SignField>) => void
  /** v2.2.4 — wizardSteps pour détecter les fields orphelins du wizard candidat */
  wizardSteps?: WizardStep[]
  setWizardSteps?: React.Dispatch<React.SetStateAction<WizardStep[]>>
}) {
  const set = new Set(selectedIds)
  const selectedFields = fields.filter(f => set.has(f.id))
  const isMulti = selectedFields.length > 1
  const allCheckboxes = selectedFields.length >= 2 && selectedFields.every(f => f.type === 'checkbox')

  // v2.2.4 — Helper : un field est-il référencé dans un step du wizard ?
  const wizardFieldIds = new Set<string>()
  for (const s of (wizardSteps || [])) {
    for (const fid of s.fieldIds) wizardFieldIds.add(fid)
  }
  // Auto-fill types : prénom/nom/email/société/fonction — jamais orphelins (toujours dans step auto-fill)
  const isAutoFillType = (t: string) => ['firstname', 'lastname', 'fullname', 'email', 'company', 'title'].includes(t)

  // Modal "Ajouter au wizard" — state local au composant
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addModalStepIdx, setAddModalStepIdx] = useState<number | 'new'>('new')
  const [addModalNewTitle, setAddModalNewTitle] = useState('')

  // Si 1 seul champ → édition complète
  if (!isMulti) {
    const f = selectedFields[0]
    if (!f) return null
    const isText = f.type === 'text'
    const isInGroup = !!f.groupId
    // Field est orphelin du wizard ? (pas auto-fill, pas dans un step)
    const isOrphan = !isAutoFillType(f.type) && !wizardFieldIds.has(f.id) && (wizardSteps || []).length >= 0

    const order = f.recipientOrder ?? 1
    const isSignatureField = f.type === 'signature' || f.type === 'initial'
    const stepsForRole = (wizardSteps || []).filter(s => (s.recipientOrder ?? 1) === order)
    const hasStepsForRole = stepsForRole.length > 0

    const openAddModal = () => {
      // Pré-sélection intelligente : step signature si dispo, sinon 'new'
      if (hasStepsForRole) {
        const sigStep = isSignatureField
          ? stepsForRole.findIndex(s => s.isSignatureStep)
          : -1
        setAddModalStepIdx(sigStep >= 0 ? (wizardSteps || []).indexOf(stepsForRole[sigStep]) : (wizardSteps || []).indexOf(stepsForRole[stepsForRole.length - 1]))
      } else {
        setAddModalStepIdx('new')
      }
      const defaultTitle = isSignatureField ? 'Signature' : 'Nouvelle étape'
      setAddModalNewTitle(defaultTitle)
      setAddModalOpen(true)
    }

    const confirmAddToWizard = () => {
      if (!setWizardSteps) return
      const allSteps = wizardSteps || []

      if (addModalStepIdx === 'new') {
        // Créer un nouveau step et y ajouter le champ
        const newStep: WizardStep = {
          id: 'wstep_' + Math.random().toString(36).slice(2, 11),
          title: addModalNewTitle.trim() || (isSignatureField ? 'Signature' : 'Nouvelle étape'),
          fieldIds: [f.id],
          docOrder: f.page ? 1 : 1,
          recipientOrder: order,
          isSignatureStep: isSignatureField || undefined,
        }
        setWizardSteps(prev => [...prev, newStep])
        toast.success(`Étape « ${newStep.title} » créée — champ ajouté`)
      } else {
        const idx = addModalStepIdx as number
        if (allSteps[idx]?.fieldIds.includes(f.id)) {
          toast.info('Ce champ est déjà dans cette étape')
          setAddModalOpen(false)
          return
        }
        const stepTitle = allSteps[idx]?.title ?? ''
        setWizardSteps(prev => {
          const next = prev.slice()
          if (next[idx] && !next[idx].fieldIds.includes(f.id)) {
            next[idx] = { ...next[idx], fieldIds: [...next[idx].fieldIds, f.id] }
          }
          return next
        })
        toast.success(`Ajouté à l'étape « ${stepTitle} »`)
      }
      setAddModalOpen(false)
    }

    const roleName = recipients.find(r => r.order === order)?.roleName || `Rôle ${order}`

    return (
      <>
      <div className="neo-card-soft" style={{ padding: 14 }}>
        <SectionTitle>Champ sélectionné</SectionTitle>
        {isOrphan && (
          <div style={{
            margin: '4px 0 12px',
            padding: '8px 10px',
            background: 'rgba(234,179,8,0.10)',
            border: '1px solid rgba(234,179,8,0.35)',
            borderRadius: 8,
            fontSize: 11.5,
            color: '#A16207',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            lineHeight: 1.4,
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ flex: 1, minWidth: 140 }}>
              Ce champ n&apos;est <strong>pas affiché dans le wizard</strong>.
            </span>
            <button
              type="button"
              onClick={openAddModal}
              style={{
                padding: '3px 9px', fontSize: 11, fontWeight: 700,
                background: '#EAB308', color: '#1C1A14',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              + Ajouter au wizard
            </button>
          </div>
        )}

      {/* Modal "Ajouter au wizard" */}
      {addModalOpen && createPortal(
        <div
          onClick={() => setAddModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.50)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(460px, 95vw)',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
              fontFamily: 'inherit',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
                  Ajouter au wizard — {roleName}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                  {(f.tooltip || f.label || f.type).slice(0, 60)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', color: 'var(--muted)',
                }}
              >✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 20px' }}>
              {!hasStepsForRole ? (
                <div style={{
                  padding: '12px 14px', marginBottom: 16,
                  background: 'rgba(220,38,38,0.07)',
                  border: '1px solid rgba(220,38,38,0.25)',
                  borderRadius: 8, fontSize: 12.5, color: 'var(--foreground)', lineHeight: 1.5,
                }}>
                  Le rôle <strong>{roleName}</strong> n&apos;a pas encore d&apos;étapes wizard.
                  Donnez un nom à la première étape à créer :
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                    Choisir une étape existante ou en créer une :
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {(wizardSteps || []).map((s, si) => {
                      if ((s.recipientOrder ?? 1) !== order) return null
                      const stepNum = (wizardSteps || []).filter((x, xi) => xi <= si && (x.recipientOrder ?? 1) === order).length
                      return (
                        <label
                          key={s.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px',
                            background: addModalStepIdx === si ? 'rgba(234,179,8,0.12)' : 'var(--surface-2, #F9FAFB)',
                            border: `1.5px solid ${addModalStepIdx === si ? '#EAB308' : 'var(--border)'}`,
                            borderRadius: 8, cursor: 'pointer',
                          }}
                        >
                          <input
                            type="radio"
                            name="step-select"
                            checked={addModalStepIdx === si}
                            onChange={() => setAddModalStepIdx(si)}
                            style={{ accentColor: '#EAB308' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                              Étape {stepNum} · {s.title}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              {s.fieldIds.length} champ{s.fieldIds.length > 1 ? 's' : ''}
                              {s.isSignatureStep ? ' · Signature' : ''}
                              {s.isAutoFillStep ? ' · Auto-fill' : ''}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                    {/* Option nouvelle étape */}
                    <label
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px',
                        background: addModalStepIdx === 'new' ? 'rgba(234,179,8,0.12)' : 'var(--surface-2, #F9FAFB)',
                        border: `1.5px dashed ${addModalStepIdx === 'new' ? '#EAB308' : 'var(--border)'}`,
                        borderRadius: 8, cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="step-select"
                        checked={addModalStepIdx === 'new'}
                        onChange={() => setAddModalStepIdx('new')}
                        style={{ accentColor: '#EAB308' }}
                      />
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#A16207' }}>
                        + Créer une nouvelle étape
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Champ titre si nouvelle étape */}
              {addModalStepIdx === 'new' && (
                <div style={{ marginTop: hasStepsForRole ? 4 : 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                    Nom de la nouvelle étape
                  </div>
                  <input
                    type="text"
                    value={addModalNewTitle}
                    onChange={e => setAddModalNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmAddToWizard() }}
                    autoFocus
                    placeholder={isSignatureField ? 'Signature' : 'Nouvelle étape'}
                    style={{
                      width: '100%', padding: '8px 10px', fontSize: 13,
                      background: 'var(--input, #F9FAFB)',
                      border: '1px solid var(--border)', borderRadius: 7,
                      color: 'var(--foreground)', fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                style={{
                  padding: '7px 16px', fontSize: 13, fontWeight: 600,
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 7, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit',
                }}
              >Annuler</button>
              <button
                type="button"
                onClick={confirmAddToWizard}
                disabled={addModalStepIdx === 'new' && !addModalNewTitle.trim()}
                style={{
                  padding: '7px 18px', fontSize: 13, fontWeight: 700,
                  background: '#EAB308', color: '#1C1A14',
                  border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                  opacity: (addModalStepIdx === 'new' && !addModalNewTitle.trim()) ? 0.5 : 1,
                }}
              >
                {addModalStepIdx === 'new' ? 'Créer et ajouter' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* v2.7.6 — "Libellé" édite À LA FOIS label ET tooltip : c'est le NOM AFFICHÉ
              du champ, partagé entre Mode Document et Mode Wizard. Le "Tooltip" (hover)
              reste séparé en bas (zone Avancé). */}
          <Field label="Texte du champ (libellé affiché)">
            <input
              type="text"
              className="neo-input"
              value={f.tooltip || f.label || ''}
              onChange={e => onPatch(f.id, { label: e.target.value, tooltip: e.target.value })}
            />
          </Field>
          <Field label="Type">
            <select
              className="neo-input"
              value={f.type}
              onChange={e => onPatch(f.id, { type: e.target.value as SignFieldType })}
            >
              {(Object.keys(FIELD_TYPE_LABELS) as SignFieldType[]).map(t => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          {/* v2.9.12 — Clé partagée cross-template pour autofill entre templates
              signés par le même destinataire (ex: adresse saisie dans Fiche d'inscription
              pré-remplit l'adresse dans Mappe). Visible pour text/number/date/email/select. */}
          {(['text', 'number', 'date', 'email', 'select', 'phone'] as SignFieldType[]).includes(f.type) && (
            <Field label="Clé partagée (autofill cross-template)">
              <select
                className="neo-input"
                value={f.crossTemplateKey || ''}
                onChange={e => onPatch(f.id, { crossTemplateKey: e.target.value || undefined })}
                title="Si un autre template signé par le même destinataire a un field avec la même clé, sa valeur pré-remplira ce field."
              >
                {CROSS_TEMPLATE_KEYS.map(k => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </Field>
          )}
          {/* v2.2.2 — Pills colorées au lieu de select texte (feedback visuel direct).
              Le champ change INSTANTANÉMENT de couleur sur le PDF Konva en cliquant. */}
          <Field label="Destinataire">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {recipients.map(r => {
                // v2.9.1 — Utilise colorIdx custom (pattern #71 + getRecipientPalette)
                const c = getRecipientPalette(r)
                const isActive = f.recipientOrder === r.order
                return (
                  <button
                    key={r.order}
                    type="button"
                    onClick={() => onPatch(f.id, { recipientOrder: r.order })}
                    style={{
                      padding: '5px 10px 5px 7px',
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      border: '1.5px solid',
                      borderColor: isActive ? c.stroke : 'var(--border)',
                      background: isActive ? c.fill : 'var(--card)',
                      color: 'var(--foreground)',
                      borderRadius: 999,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.12s',
                    }}
                    title={`Affecter ce champ au rôle ${r.order}`}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: 999,
                      background: c.stroke, flexShrink: 0,
                      boxShadow: isActive ? `0 0 0 2px ${c.fill}` : 'none',
                    }} />
                    {r.order}. {r.roleName || r.name || `Rôle ${r.order}`}
                  </button>
                )
              })}
            </div>
          </Field>

          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={!!f.required}
              onChange={e => onPatch(f.id, { required: e.target.checked })}
            />
            Champ obligatoire
          </label>

          {/* v2.2.4 — Section d'affichage wizard (cohérence avec Mode Wizard).
              Permet de savoir/changer à quelle section/jour ce field appartient
              directement depuis Mode Document. */}
          <Field label="Section d'affichage (wizard)">
            {(() => {
              const knownSections = Array.from(new Set(
                fields
                  .filter(ff => ff.recipientOrder === f.recipientOrder)
                  .map(ff => (ff.wizardSection || '').trim())
                  .filter(s => s !== '')
              )).sort((a, b) => a.localeCompare(b, 'fr'))
              const datalistId = `sections-doc-${f.id}`
              return (
                <>
                  <input
                    type="text"
                    list={datalistId}
                    className="neo-input"
                    value={f.wizardSection || ''}
                    onChange={e => onPatch(f.id, { wizardSection: e.target.value || undefined })}
                    placeholder={knownSections.length > 0
                      ? 'Choisis ou tape (Lundi, Mardi, Total…)'
                      : 'Ex : Lundi, Mardi, Total…'}
                  />
                  <datalist id={datalistId}>
                    {knownSections.map(s => <option key={s} value={s} />)}
                  </datalist>
                  {/* v2.9.27 — Liste déroulante au lieu d'un mur de pastilles
                      (illisible avec 20+ sections). */}
                  {knownSections.length > 0 && (
                    <select
                      className="neo-input"
                      value={knownSections.includes((f.wizardSection || '').trim())
                        ? (f.wizardSection || '').trim() : ''}
                      onChange={e => { if (e.target.value) onPatch(f.id, { wizardSection: e.target.value }) }}
                      style={{ marginTop: 6, cursor: 'pointer' }}
                    >
                      <option value="">— Réutiliser une section existante —</option>
                      {knownSections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </>
              )
            })()}
          </Field>

          {/* v2.7.6 — Annotation de la section (synchronisée sur tous les fields siblings) */}
          {f.wizardSection && f.wizardSection.trim() && (
            <Field label="Annotation de la section">
              <input
                type="text"
                className="neo-input"
                placeholder="Ex : Veuillez nous dire si vous avez ou pas permis de conduire"
                value={f.sectionDescription || ''}
                maxLength={200}
                onChange={e => {
                  const newDesc = e.target.value.slice(0, 200) || undefined
                  const sectionName = (f.wizardSection || '').trim()
                  for (const sib of fields) {
                    if ((sib.wizardSection || '').trim() === sectionName) {
                      onPatch(sib.id, { sectionDescription: newDesc })
                    }
                  }
                }}
              />
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>
                Affichée en italique gris à côté du nom de la section dans le wizard.
              </div>
            </Field>
          )}

          {/* v2.7.6 — Sélecteur d'étape wizard depuis le Mode Document.
              Permet de déplacer le champ vers une autre étape sans aller au Mode Wizard. */}
          {setWizardSteps && (
            <Field label="Étape wizard">
              {(() => {
                const currentStepIdx = (wizardSteps || []).findIndex(s => s.fieldIds.includes(f.id))
                const role = f.recipientOrder ?? 1
                return (
                  <select
                    className="neo-input"
                    value={currentStepIdx >= 0 ? String(currentStepIdx) : ''}
                    onChange={e => {
                      const targetIdx = e.target.value === '' ? -1 : Number(e.target.value)
                      setWizardSteps(prev => prev.map((s, i) => {
                        if (i === targetIdx) {
                          // Ajoute à la nouvelle étape (sans doublon)
                          return s.fieldIds.includes(f.id) ? s : { ...s, fieldIds: [...s.fieldIds, f.id] }
                        }
                        // Retire de toutes les autres étapes
                        return { ...s, fieldIds: s.fieldIds.filter(id => id !== f.id) }
                      }))
                    }}
                  >
                    <option value="">— Aucune (orphelin) —</option>
                    {(wizardSteps || []).map((s, si) => {
                      if ((s.recipientOrder ?? 1) !== role) return null
                      const stepNum = (wizardSteps || []).filter((x, xi) => xi <= si && (x.recipientOrder ?? 1) === role).length
                      return (
                        <option key={s.id} value={si}>
                          Étape {stepNum} · {s.title} ({s.fieldIds.length} champ{s.fieldIds.length > 1 ? 's' : ''})
                        </option>
                      )
                    })}
                  </select>
                )
              })()}
            </Field>
          )}

          {/* v2.9.28 — Masquer dans le wizard (champ rempli automatiquement) */}
          {f.type !== 'annotation' && (
            <>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={!!f.wizardHidden}
                  onChange={e => onPatch(f.id, { wizardHidden: e.target.checked || undefined })}
                />
                Masquer dans le wizard (rempli automatiquement)
              </label>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: -2 }}>
                Le champ reste sur le PDF et en Mode Document, mais le candidat ne
                le voit pas dans le wizard — pour un champ rempli via une clé
                partagée ou un auto-remplissage.
              </div>
            </>
          )}

          {/* v2.9.28 — Lien hypertexte cliquable */}
          <Field label="Lien hypertexte — URL (optionnel)">
            <input
              type="text"
              className="neo-input"
              placeholder="https://…"
              value={f.linkUrl || ''}
              onChange={e => onPatch(f.id, { linkUrl: e.target.value || undefined })}
            />
          </Field>
          {!!(f.linkUrl && f.linkUrl.trim()) && (
            <>
              <Field label="Texte du lien affiché">
                <input
                  type="text"
                  className="neo-input"
                  placeholder="Ex : QUIZ"
                  value={f.linkLabel || ''}
                  onChange={e => onPatch(f.id, { linkLabel: e.target.value || undefined })}
                />
              </Field>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: -2 }}>
                Affiché comme lien cliquable dans le wizard (ouvre un nouvel
                onglet). Sur une case à cocher, le clic sur le lien coche aussi
                automatiquement la case.
              </div>
            </>
          )}

          {isText && (
            <>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={!!f.readOnly}
                  onChange={e => onPatch(f.id, { readOnly: e.target.checked })}
                />
                Lecture seule (le destinataire ne peut pas modifier)
              </label>
              <Field label="Texte par défaut (optionnel)">
                <input
                  type="text"
                  className="neo-input"
                  placeholder="Préremplit le champ avec ce texte"
                  value={f.defaultValue || ''}
                  onChange={e => onPatch(f.id, { defaultValue: e.target.value || undefined })}
                />
              </Field>
              <Field label="Limite caractères (optionnel)">
                <input
                  type="number"
                  className="neo-input"
                  min={0}
                  placeholder="Ex : 50"
                  value={f.maxLength ?? ''}
                  onChange={e => {
                    const n = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value))
                    onPatch(f.id, { maxLength: n })
                  }}
                />
              </Field>
            </>
          )}

          {/* Checkbox : Cochée par défaut */}
          {f.type === 'checkbox' && (
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={f.metadata?.selected === true}
                onChange={e => onPatch(f.id, {
                  metadata: { ...(f.metadata || {}), selected: e.target.checked },
                })}
              />
              Cochée par défaut (pré-remplie)
            </label>
          )}

          {/* Annotation : juste un texte d'aide */}
          {f.type === 'annotation' && (
            <Field label="Texte d'aide (visible au signataire)">
              <textarea
                className="neo-input"
                style={{ height: 'auto', padding: '10px 13px', minHeight: 60, resize: 'vertical' }}
                rows={2}
                placeholder="Ex : À remplir si enfants à charge"
                value={f.label}
                onChange={e => onPatch(f.id, { label: e.target.value })}
              />
            </Field>
          )}

          {/* Liste déroulante : éditeur d'options */}
          {f.type === 'select' && (
            <SelectOptionsEditor
              field={f}
              onPatch={patch => onPatch(f.id, patch)}
            />
          )}

          {/* Groupe (checkbox) */}
          {f.type === 'checkbox' && isInGroup && (
            <div
              style={{
                marginTop: 4,
                padding: 10,
                border: '1px dashed var(--border)',
                borderRadius: 8,
                background: 'var(--secondary)',
                fontSize: 12,
                color: 'var(--muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Groupe : {f.groupName || 'G'}
              </div>
              {/* v2.8.10 — Membres du groupe (toutes les cases qui partagent groupId) */}
              {(() => {
                const members = fields.filter(ff => ff.groupId === f.groupId)
                const pages = Array.from(new Set(members.map(m => m.page))).sort((a, b) => a - b)
                const ruleLabel = f.groupRule === 'SelectExactly' ? `Exactement ${f.groupMin ?? 1}`
                  : f.groupRule === 'SelectAtLeast' ? `Au moins ${f.groupMin ?? 1}`
                  : f.groupRule === 'SelectAtMost' ? `Au plus ${f.groupMax ?? 1}`
                  : 'Libre'
                return (
                  <div style={{ fontSize: 11, color: 'var(--foreground)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', lineHeight: 1.5 }}>
                    <strong>{members.length}</strong> case{members.length > 1 ? 's' : ''} dans ce groupe ·
                    règle <strong>{ruleLabel}</strong> ·
                    page{pages.length > 1 ? 's' : ''} <strong>{pages.join(', ')}</strong>
                    {members.length > 1 && (
                      <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--muted)' }}>
                        {members.map(m => `« ${m.tooltip || m.label || '(sans nom)'} »`).join(' · ')}
                      </div>
                    )}
                  </div>
                )
              })()}
              <Field label="Étiquette du groupe">
                <input
                  type="text"
                  className="neo-input"
                  placeholder="Ex : Permis de conduire"
                  value={f.groupName || ''}
                  onChange={e => {
                    // Propager le changement à toutes les cases du même groupe
                    if (!f.groupId) return
                    onPatchAllInGroup(f.groupId, { groupName: e.target.value || undefined })
                  }}
                />
              </Field>
              <Field label="Règle">
                <select
                  className="neo-input"
                  value={f.groupRule || 'SelectAtLeast'}
                  onChange={e => {
                    if (!f.groupId) return
                    onPatchAllInGroup(f.groupId, { groupRule: e.target.value as 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly' })
                  }}
                >
                  <option value="SelectAtLeast">Au moins X</option>
                  <option value="SelectAtMost">Au plus X</option>
                  <option value="SelectExactly">Exactement X</option>
                </select>
              </Field>
              <Field label="Nombre X">
                <input
                  type="number"
                  className="neo-input"
                  min={1}
                  value={f.groupRule === 'SelectAtMost' ? (f.groupMax ?? 1) : (f.groupMin ?? 1)}
                  onChange={e => {
                    if (!f.groupId) return
                    const n = Math.max(1, Number(e.target.value) || 1)
                    if (f.groupRule === 'SelectAtMost') {
                      onPatchAllInGroup(f.groupId, { groupMax: n, groupMin: undefined })
                    } else if (f.groupRule === 'SelectExactly') {
                      onPatchAllInGroup(f.groupId, { groupMin: n, groupMax: n })
                    } else {
                      onPatchAllInGroup(f.groupId, { groupMin: n, groupMax: undefined })
                    }
                  }}
                />
              </Field>
              <button
                type="button"
                onClick={() => onUngroup(f.id)}
                className="neo-btn-ghost neo-btn-sm"
                style={{ alignSelf: 'flex-start', color: 'var(--destructive)' }}
              >
                Retirer du groupe
              </button>
            </div>
          )}

          {/* Sous-options par type (Phase 2.5) */}
          <TypeSpecificOptions
            field={f}
            allFields={fields}
            onPatch={patch => onPatch(f.id, patch)}
          />

          {/* v2.9.72 — Aide visuelle (PDF/image à afficher au candidat sur clic) */}
          <FieldHelpAttachmentEditor
            templateId={templateId}
            field={f}
            onPatch={patch => onPatch(f.id, patch)}
          />

          {/* v2.6.10 / v2.6.13 / v2.6.15 — Apply size to similar (uniformiser tous les fields portant le même nom)
              Matching tolérant : tooltip OR label match (exclut placeholder "0" + ignore noms de jours), même type requis. */}
          {(() => {
            const fieldKeys = (ff: SignField): string[] => {
              const DAYS_RE = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi
              const t = (ff.tooltip || '').trim().toLowerCase()
              const l = (ff.label || '').trim().toLowerCase()
              const set = new Set<string>()
              for (const raw of [t, l]) {
                if (!raw || raw === '0') continue
                set.add(raw)
                const stripped = raw.replace(DAYS_RE, '').replace(/\s+/g, ' ').trim()
                if (stripped && stripped !== raw) set.add(stripped)
              }
              return Array.from(set)
            }
            const srcKeys = fieldKeys(f)
            if (srcKeys.length === 0) return null
            const similarFields = fields.filter(ff => {
              if (ff.id === f.id) return false
              if (ff.type !== f.type) return false
              const kk = fieldKeys(ff)
              return kk.some(k => srcKeys.includes(k))
            })
            const similarCount = similarFields.length
            if (similarCount === 0) return null
            // Liste des noms pour le tooltip (max 8)
            const previewNames = similarFields.slice(0, 8).map(ff =>
              `${ff.metadata?.wizardSection ? `[${ff.metadata.wizardSection}] ` : ''}${ff.tooltip || ff.label || '(?)'}`
            ).join('\n')
            return (
              <button
                type="button"
                onClick={() => {
                  const n = onApplySizeToSimilar(f.id)
                  if (n > 0) toast.success(`Taille + alignement vertical appliqués à ${n} champ${n > 1 ? 's' : ''}`)
                  else toast.info('Aucun autre champ similaire trouvé')
                }}
                className="neo-btn-ghost neo-btn-sm"
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                title={`Applique aux ${similarCount} autre${similarCount > 1 ? 's' : ''} champ${similarCount > 1 ? 's' : ''} (ce champ-ci sert de référence) :\n${previewNames}${similarCount > 8 ? `\n... +${similarCount - 8}` : ''}\n\n• même largeur\n• même hauteur\n• même y (alignés sur la même ligne)\nLe x de chaque champ est préservé.`}
              >
                📏 Uniformiser {similarCount} autre{similarCount > 1 ? 's' : ''} champ{similarCount > 1 ? 's' : ''} (taille + ligne)
              </button>
            )
          })()}

          {/* Logique conditionnelle */}
          <ConditionalLogicEditor
            field={f}
            allFields={fields.filter(o => o.id !== f.id && !o.metadata?.hidden)}
            onPatch={patch => onPatch(f.id, patch)}
          />

          {f.source === 'docusign' && (
            <span className="neo-tag" style={{ fontSize: 10, alignSelf: 'flex-start' }}>
              Importé DocuSign
            </span>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="neo-btn-ghost neo-btn-sm"
            style={{ color: 'var(--destructive)', justifyContent: 'center' }}
          >
            Supprimer ce champ
          </button>
        </div>
      </div>
      </>
    )
  }

  // Multi-sélection → actions communes
  return (
    <div className="neo-card-soft" style={{ padding: 14 }}>
      <SectionTitle>{selectedFields.length} champs sélectionnés</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* v2.2.2 — Pills colorées (visuel direct) — change la couleur des N champs sélectionnés instantanément */}
        <Field label="Réassigner au destinataire">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recipients.map(r => {
              // v2.9.1 — Utilise colorIdx custom (pattern #71 + getRecipientPalette)
              const c = getRecipientPalette(r)
              return (
                <button
                  key={r.order}
                  type="button"
                  onClick={() => onPatchMany(selectedIds, { recipientOrder: r.order })}
                  style={{
                    padding: '5px 10px 5px 7px',
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1.5px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--foreground)',
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title={`Affecter les ${selectedFields.length} champs sélectionnés au rôle ${r.order}`}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = c.stroke
                    e.currentTarget.style.background = c.fill
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.background = 'var(--card)'
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: 999,
                    background: c.stroke, flexShrink: 0,
                  }} />
                  {r.order}. {r.roleName || r.name || `Rôle ${r.order}`}
                </button>
              )
            })}
          </div>
        </Field>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => onPatchMany(selectedIds, { required: true })}
            className="neo-btn-ghost neo-btn-sm"
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Obligatoire
          </button>
          <button
            type="button"
            onClick={() => onPatchMany(selectedIds, { required: false })}
            className="neo-btn-ghost neo-btn-sm"
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Facultatif
          </button>
        </div>

        {/* v2.6.10 — Aligner & Égaliser (multi-sélection) */}
        <AlignEqualizeSection
          selectedFields={selectedFields}
          onPatchManyMixed={onPatchManyMixed}
          onPatchMany={onPatchMany}
        />

        {/* Grouper les checkboxes */}
        {allCheckboxes && (
          <CheckboxGroupForm
            count={selectedFields.length}
            onCreate={onGroupCheckboxes}
          />
        )}

        {/* v2.7.6 — Ajouter / consulter / supprimer les conditions sur les N champs sélectionnés.
            Utilise onPatchManyMixed (atomique) au lieu de onPatch en boucle, sinon seul le
            dernier patch survit (chaque onPatch repart de `fields` du closure). */}
        <MultiSelectConditionForm
          selectedFields={selectedFields}
          allFields={fields}
          onApply={(cond, mode) => {
            const updates = selectedFields.map(f => {
              const existing = f.conditions || []
              const next = mode === 'replace' ? [cond] : [...existing, cond]
              return { id: f.id, patch: { conditions: next } as Partial<SignField> }
            })
            onPatchManyMixed(updates)
            toast.success(`✓ Condition ${mode === 'replace' ? 'remplacée' : 'ajoutée'} sur ${selectedFields.length} champs`)
          }}
          onRemoveCondition={(condKey) => {
            const updates: Array<{ id: string; patch: Partial<SignField> }> = []
            for (const f of selectedFields) {
              const existing = f.conditions || []
              const filtered = existing.filter(c => `${c.triggerFieldId}|${c.operator}|${c.value || ''}|${c.action}` !== condKey)
              if (filtered.length !== existing.length) {
                updates.push({ id: f.id, patch: { conditions: filtered.length === 0 ? undefined : filtered } })
              }
            }
            if (updates.length > 0) onPatchManyMixed(updates)
            toast.success(`✓ Règle supprimée de ${updates.length} champ${updates.length > 1 ? 's' : ''}`)
          }}
          onClearAll={() => {
            const updates = selectedFields
              .filter(f => f.conditions && f.conditions.length > 0)
              .map(f => ({ id: f.id, patch: { conditions: undefined } as Partial<SignField> }))
            if (updates.length > 0) onPatchManyMixed(updates)
            toast.success(`✓ Toutes les conditions effacées de ${updates.length} champs`)
          }}
        />

        {/* v2.7.6 — Déplacer tous les champs sélectionnés vers une étape wizard */}
        {setWizardSteps && wizardSteps && wizardSteps.length > 0 && (
          <Field label="Déplacer vers étape wizard">
            <select
              className="neo-input"
              value=""
              onChange={e => {
                const v = e.target.value
                if (!v) return
                const targetIdx = v === '-1' ? -1 : Number(v)
                if (targetIdx < 0) {
                  setWizardSteps(prev => prev.map(s => ({
                    ...s,
                    fieldIds: s.fieldIds.filter(id => !selectedIds.includes(id)),
                  })))
                  toast.success(`✓ ${selectedFields.length} champs retirés du wizard`)
                } else {
                  setWizardSteps(prev => prev.map((s, i) => {
                    if (i === targetIdx) {
                      const merged = Array.from(new Set([...s.fieldIds, ...selectedIds]))
                      return { ...s, fieldIds: merged }
                    }
                    return { ...s, fieldIds: s.fieldIds.filter(id => !selectedIds.includes(id)) }
                  }))
                  toast.success(`✓ ${selectedFields.length} champs déplacés`)
                }
                // Reset le select à vide pour pouvoir re-sélectionner
                e.target.value = ''
              }}
            >
              <option value="">— Choisir une étape —</option>
              <option value="-1">⚠️ Retirer du wizard (orphelins)</option>
              {wizardSteps.map((s, si) => {
                const role = s.recipientOrder ?? 1
                const stepNum = wizardSteps.filter((x, xi) => xi <= si && (x.recipientOrder ?? 1) === role).length
                return (
                  <option key={s.id} value={si}>
                    Rôle {role} · Étape {stepNum} · {s.title} ({s.fieldIds.length} champs)
                  </option>
                )
              })}
            </select>
          </Field>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="neo-btn-ghost neo-btn-sm"
          style={{ color: 'var(--destructive)', justifyContent: 'center' }}
        >
          Supprimer ces {selectedFields.length} champs
        </button>

        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', paddingTop: 4 }}>
          Astuce : Shift+clic pour ajouter/retirer de la sélection
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// v2.7.6 — MultiSelectConditionForm — mini-éditeur de condition inline
// dans le panneau multi-sélection. Permet d'appliquer la même condition
// à N champs sélectionnés en 1 clic.
// ─────────────────────────────────────────────────────────────────
function MultiSelectConditionForm({
  selectedFields, allFields, onApply, onRemoveCondition, onClearAll,
}: {
  selectedFields: SignField[]
  allFields: SignField[]
  onApply: (cond: SignFieldCondition, mode: 'append' | 'replace') => void
  onRemoveCondition: (condKey: string) => void
  onClearAll: () => void
}) {
  const selectedIds = new Set(selectedFields.map(f => f.id))

  // v2.7.6 — Agrège les conditions communes / variées sur la sélection
  // Key unique par condition = JSON triggerFieldId|operator|value|action
  const condIndex = new Map<string, { cond: SignFieldCondition; fieldsWithIt: number }>()
  for (const f of selectedFields) {
    for (const c of (f.conditions || [])) {
      const key = `${c.triggerFieldId}|${c.operator}|${c.value || ''}|${c.action}`
      const ex = condIndex.get(key)
      if (ex) ex.fieldsWithIt++
      else condIndex.set(key, { cond: c, fieldsWithIt: 1 })
    }
  }
  const aggregatedConditions = Array.from(condIndex.entries())
  const totalConditionsAcrossFields = selectedFields.reduce((sum, f) => sum + (f.conditions?.length || 0), 0)
  // Trigger candidates = tous les fields SAUF ceux sélectionnés (un field ne peut pas
  // se déclencher lui-même)
  const triggerCandidates = allFields.filter(f => !selectedIds.has(f.id))
  const [open, setOpen] = useState(false)
  const [triggerFieldId, setTriggerFieldId] = useState('')
  const [operator, setOperator] = useState<SignConditionOperator>('equals')
  const [value, setValue] = useState('')
  const [action, setAction] = useState<SignConditionAction>('hide')

  if (triggerCandidates.length === 0) return null

  const handleApply = (mode: 'append' | 'replace', closeAfter: boolean) => {
    if (!triggerFieldId) {
      toast.error('Choisis un champ déclencheur')
      return
    }
    onApply({ triggerFieldId, operator, value: value || undefined, action }, mode)
    if (closeAfter) {
      setOpen(false)
      setTriggerFieldId('')
      setValue('')
    } else {
      // v2.7.6 — Garde le formulaire ouvert pour permettre d'enchaîner plusieurs conditions.
      // On reset juste la valeur, l'utilisateur peut adapter le reste.
      setValue('')
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: 'var(--muted)',
    marginBottom: 4,
  }

  // Petit panneau "Conditions actives sur la sélection" affiché TOUJOURS (que le form soit ouvert ou non)
  const activeConditionsBlock = totalConditionsAcrossFields > 0 && (
    <div style={{ padding: 10, border: '1px dashed #7C3AED', borderRadius: 8, background: 'rgba(124,58,237,0.04)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 6 }}>
        ⚙ Conditions actives ({aggregatedConditions.length})
      </div>
      {aggregatedConditions.map(([key, { cond, fieldsWithIt }]) => {
        const trigger = allFields.find(f => f.id === cond.triggerFieldId)
        const triggerLabel = (trigger ? getFieldDisplayLabel(trigger, FIELD_TYPE_LABELS[trigger.type]) : 'Champ ?').slice(0, 40)
        const opLabel = CONDITION_OPERATOR_LABELS[cond.operator]
        const actionLabel = CONDITION_ACTION_LABELS[cond.action]
        const valuePart = (cond.operator === 'isEmpty' || cond.operator === 'isNotEmpty')
          ? ''
          : ` "${cond.value || ''}"`
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11.5 }}>
            <div style={{ flex: 1, lineHeight: 1.35 }}>
              <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                Si <span style={{ color: '#7C3AED' }}>{triggerLabel}</span> {opLabel}{valuePart}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                → {actionLabel} · sur {fieldsWithIt} / {selectedFields.length} champ{selectedFields.length > 1 ? 's' : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Supprimer cette règle de ${fieldsWithIt} champ${fieldsWithIt > 1 ? 's' : ''} ?`)) {
                  onRemoveCondition(key)
                }
              }}
              className="neo-btn-ghost"
              style={{ padding: '4px 6px', color: 'var(--destructive)', flexShrink: 0 }}
              title="Supprimer cette règle des champs concernés"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => {
          if (confirm(`Effacer TOUTES les ${totalConditionsAcrossFields} conditions de ces ${selectedFields.length} champs ?`)) {
            onClearAll()
          }
        }}
        className="neo-btn-ghost neo-btn-sm"
        style={{ alignSelf: 'flex-start', color: 'var(--destructive)', fontSize: 11 }}
      >
        <Trash2 size={11} /> Tout effacer ({totalConditionsAcrossFields} règles)
      </button>
    </div>
  )

  if (!open) {
    return (
      <>
        {activeConditionsBlock}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="neo-btn-ghost neo-btn-sm"
          style={{ justifyContent: 'center', background: 'var(--primary-soft, #FEF3C7)', color: '#A16207', fontWeight: 600 }}
        >
          ⚙ Ajouter une condition à ces {selectedFields.length} champs
        </button>
      </>
    )
  }

  return (
    <>
      {activeConditionsBlock}
    <div style={{ padding: 10, border: '1.5px solid #EAB308', borderRadius: 8, background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={labelStyle}>Condition pour {selectedFields.length} champs</div>

      <Field label="Si ce champ">
        <select
          className="neo-input"
          value={triggerFieldId}
          onChange={e => setTriggerFieldId(e.target.value)}
        >
          <option value="">— Choisir un champ —</option>
          {/* v2.7.8 — Groupé par section + label lisible */}
          {groupFieldsBySection(triggerCandidates).map((g, gi) => (
            <optgroup key={`s-${gi}`} label={g.section || '(sans section)'}>
              {g.fields.map(f => (
                <option key={f.id} value={f.id}>
                  {getFieldDisplayLabel(f, FIELD_TYPE_LABELS[f.type])} ({f.type})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label="…est">
        <select
          className="neo-input"
          value={operator}
          onChange={e => setOperator(e.target.value as SignConditionOperator)}
        >
          {Object.entries(CONDITION_OPERATOR_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Field>

      {operator !== 'isEmpty' && operator !== 'isNotEmpty' && (
        <Field label="Valeur">
          <input
            type="text"
            className="neo-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Ex: Marié, Suisse, Oui, true…"
          />
        </Field>
      )}

      <Field label="Alors">
        <select
          className="neo-input"
          value={action}
          onChange={e => setAction(e.target.value as SignConditionAction)}
        >
          {Object.entries(CONDITION_ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Field>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => handleApply('append', true)}
          className="neo-btn-ghost neo-btn-sm"
          style={{ flex: '1 1 100px', justifyContent: 'center', background: '#EAB308', color: '#1C1A14', border: 'none', fontWeight: 700 }}
          title="Ajoute cette condition et ferme le formulaire"
        >
          + Ajouter & Fermer
        </button>
        <button
          type="button"
          onClick={() => handleApply('append', false)}
          className="neo-btn-ghost neo-btn-sm"
          style={{ flex: '1 1 100px', justifyContent: 'center' }}
          title="Ajoute cette condition et garde le formulaire ouvert pour en ajouter une autre"
        >
          + Ajouter & Continuer
        </button>
        <button
          type="button"
          onClick={() => handleApply('replace', true)}
          className="neo-btn-ghost neo-btn-sm"
          style={{ flex: '1 1 100px', justifyContent: 'center' }}
          title="Remplace toutes les conditions existantes par celle-ci"
        >
          ↻ Remplacer tout
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="neo-btn-ghost neo-btn-sm"
          style={{ color: 'var(--muted)' }}
        >
          ✕
        </button>
      </div>
    </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Éditeur d'options pour Liste déroulante (type='select')
// Source : field.metadata.listItems → [{ text, value, selected? }]
// ─────────────────────────────────────────────────────────────────
interface ListItem { text: string; value: string; selected?: boolean }

function SelectOptionsEditor({
  field, onPatch,
}: { field: SignField; onPatch: (patch: Partial<SignField>) => void }) {
  const items: ListItem[] = Array.isArray(field.metadata?.listItems)
    ? (field.metadata!.listItems as ListItem[])
    : []

  const updateItems = (newItems: ListItem[]) => {
    onPatch({
      metadata: {
        ...(field.metadata || {}),
        listItems: newItems,
      },
    })
  }

  const updateItem = (idx: number, patch: Partial<ListItem>) => {
    updateItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  const removeItem = (idx: number) => {
    updateItems(items.filter((_, i) => i !== idx))
  }

  const addItem = () => {
    const n = items.length + 1
    updateItems([...items, { text: `Option ${n}`, value: `option_${n}`, selected: false }])
  }

  const setDefault = (idx: number | -1) => {
    updateItems(items.map((it, i) => ({ ...it, selected: i === idx })))
  }

  const defaultIdx = items.findIndex(i => i.selected)

  return (
    <div
      style={{
        marginTop: 4,
        padding: 10,
        border: '1px dashed var(--border)',
        borderRadius: 8,
        background: 'var(--secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Options de la liste
      </div>

      {/* v2.9.18 — Charger une liste prédéfinie (permis, nationalités, cantons…) */}
      <Field label="Liste prédéfinie">
        <select
          className="neo-input"
          value=""
          onChange={e => {
            const preset = LIST_PRESETS.find(p => p.key === e.target.value)
            if (!preset) return
            const replace = items.length === 0 || confirm(
              `Remplacer les ${items.length} option(s) actuelle(s) par « ${preset.label} » (${preset.items.length} options) ?`,
            )
            if (replace) {
              updateItems(preset.items.map(it => ({ text: it.text, value: it.value, selected: false })))
              toast.success(`${preset.items.length} options chargées`)
            }
          }}
        >
          <option value="">— Choisir une liste à charger —</option>
          {LIST_PRESETS.map(p => (
            <option key={p.key} value={p.key}>{p.label} ({p.items.length})</option>
          ))}
        </select>
      </Field>

      {items.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', padding: 8 }}>
          Aucune option. Ajoutez-en au moins une.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((it, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="radio"
                name="default-option"
                checked={defaultIdx === idx}
                onChange={() => setDefault(idx)}
                title="Option par défaut"
                style={{ flexShrink: 0 }}
              />
              <input
                type="text"
                className="neo-input"
                style={{ height: 30, fontSize: 12.5, padding: '0 8px' }}
                placeholder={`Option ${idx + 1}`}
                value={it.text}
                onChange={e => updateItem(idx, { text: e.target.value, value: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeItem(idx)}
                title="Supprimer"
                style={{
                  width: 26, height: 26, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--card)', color: 'var(--destructive)', cursor: 'pointer',
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          onClick={addItem}
          className="neo-btn-ghost neo-btn-sm"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Plus size={12} />
          Ajouter une option
        </button>
        {defaultIdx >= 0 && (
          <button
            type="button"
            onClick={() => setDefault(-1)}
            className="neo-btn-ghost neo-btn-sm"
            title="Aucune option par défaut"
            style={{ flexShrink: 0 }}
          >
            Aucune par défaut
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Éditeur de logique conditionnelle
// Permet d'ajouter/éditer/supprimer des conditions sur un champ.
// L'évaluation runtime sera Phase 4 (signing time).
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// Sous-options spécifiques par type (Phase 2.5)
// Affiche un bloc d'options selon field.type :
// - number : min, max, décimales, devise
// - formula : expression + helper insertion champ
// - attachment : taille max, types MIME, multiple
// - email : validation format
// - date : format d'affichage
// - auto-fill (firstname/lastname/fullname/email/company/title) : toggle
// ─────────────────────────────────────────────────────────────────
// v2.9.23 — Catalogue des types de documents Conformité (cache module-level :
// fetch une seule fois pour tout l'éditeur).
let _complianceDocTypesCache: { id: string; name: string; category?: string }[] | null = null
function useComplianceDocTypes() {
  const [types, setTypes] = useState<{ id: string; name: string; category?: string }[]>(
    () => _complianceDocTypesCache || [],
  )
  useEffect(() => {
    if (_complianceDocTypesCache) return
    fetch('/api/document-types')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.document_types)) {
          _complianceDocTypesCache = d.document_types
          setTypes(d.document_types)
        }
      })
      .catch(() => { /* silencieux — le sélecteur restera vide */ })
  }, [])
  return types
}

function TypeSpecificOptions({
  field, allFields, onPatch,
}: {
  field: SignField
  allFields: SignField[]
  onPatch: (patch: Partial<SignField>) => void
}) {
  const t = field.type
  const complianceDocTypes = useComplianceDocTypes()
  const isAutoFillable = AUTO_FILL_FIELD_TYPES.includes(t)
  // Types avec formatage texte (police/taille/B/I/U/couleur)
  const supportsFormatting = (
    t === 'text' || t === 'number' || t === 'date' || t === 'email' ||
    t === 'firstname' || t === 'lastname' || t === 'fullname' ||
    t === 'company' || t === 'title' || t === 'formula'
  )
  // Types avec validation regex
  const supportsValidation = (t === 'text' || t === 'number' || t === 'email' || t === 'formula')
  // Tous les types sauf annotation ont un panel "options"
  const showSection = t !== 'annotation'
  if (!showSection) return null

  return (
    <div
      style={{
        marginTop: 4,
        padding: 10,
        border: '1px dashed var(--border)',
        borderRadius: 8,
        background: 'var(--secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Options {FIELD_TYPE_LABELS[t]}
      </div>

      {/* Auto-fill — pour identités */}
      {isAutoFillable && (
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={!!field.autoFill}
            onChange={e => onPatch({ autoFill: e.target.checked })}
          />
          Pré-remplir automatiquement depuis le profil destinataire
        </label>
      )}

      {/* v2.7.6 — Verrouiller un champ auto-fill identité (lecture seule) */}
      {['firstname', 'lastname', 'fullname', 'email', 'company', 'title'].includes(t) && (
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={!!field.autoFillLocked}
            onChange={e => onPatch({ autoFillLocked: e.target.checked || undefined })}
          />
          Verrouiller (lecture seule — sinon le candidat peut corriger)
        </label>
      )}

      {/* NUMÉRO */}
      {t === 'number' && (
        <>
          {/* v2.9.18 — "Format du champ" : Nombre pur OU Téléphone.
              Téléphone → input tel (accepte +, espaces, zéros de tête) +
              pré-remplissage auto depuis le téléphone du candidat si l'enveloppe
              est liée à un candidat. Le candidat peut toujours corriger. */}
          <Field label="Format du champ">
            <select
              className="neo-input"
              value={field.autoFillSource === 'phone' ? 'phone' : 'number'}
              onChange={e => onPatch({ autoFillSource: e.target.value === 'phone' ? 'phone' : undefined })}
            >
              <option value="number">🔢 Nombre (chiffres uniquement)</option>
              <option value="phone">📱 Téléphone (+, espaces, format libre)</option>
            </select>
          </Field>
          {field.autoFillSource === 'phone' && (
            <>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginTop: -2 }}>
                Le candidat peut saisir n&apos;importe quel numéro (portable, fixe, urgence).
              </div>
              {/* v2.9.58 — Case explicite : pré-remplir avec le tél du candidat lié.
                  À cocher SEULEMENT sur le « Tél portable du candidat ». NE PAS
                  cocher pour Tél urgence, conjoint, parent, etc. */}
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={!!field.autoFillCandidatePhone}
                  // v2.9.67 — Écrit explicitement true OU false (pas undefined)
                  // pour éliminer le fallback heuristique fragile.
                  onChange={e => onPatch({ autoFillCandidatePhone: e.target.checked })}
                />
                Pré-remplir avec le téléphone du candidat lié à l&apos;enveloppe
              </label>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, marginLeft: 22, marginTop: -4 }}>
                À cocher uniquement sur le champ « Tél portable du candidat ». Pour
                tél urgence / conjoint / parent → laisse décoché.
              </div>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={!!field.autoFillLocked}
                  onChange={e => onPatch({ autoFillLocked: e.target.checked || undefined })}
                />
                Verrouiller (lecture seule — sinon le candidat peut corriger)
              </label>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Min">
              <input
                type="number"
                className="neo-input"
                placeholder="—"
                value={field.numberMin ?? ''}
                onChange={e => onPatch({ numberMin: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
            <Field label="Max">
              <input
                type="number"
                className="neo-input"
                placeholder="—"
                value={field.numberMax ?? ''}
                onChange={e => onPatch({ numberMax: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Décimales">
              <input
                type="number"
                min={0}
                max={6}
                className="neo-input"
                placeholder="0"
                value={field.numberDecimals ?? ''}
                onChange={e => onPatch({ numberDecimals: e.target.value === '' ? undefined : Math.max(0, Math.min(6, Number(e.target.value))) })}
              />
            </Field>
            <Field label="Devise">
              <select
                className="neo-input"
                value={field.currency || ''}
                onChange={e => onPatch({ currency: e.target.value || undefined })}
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>{c || '— Aucune —'}</option>
                ))}
              </select>
            </Field>
          </div>
        </>
      )}

      {/* FORMULE */}
      {t === 'formula' && (
        <>
          <Field label="Expression">
            <textarea
              className="neo-input"
              style={{ height: 'auto', padding: '8px 10px', minHeight: 50, resize: 'vertical', fontFamily: 'var(--font-mono), ui-monospace, monospace' }}
              placeholder="Ex: [Salaire1] + [Salaire2] ou [Quantité] * [Prix]"
              value={field.formulaExpression || ''}
              onChange={e => onPatch({ formulaExpression: e.target.value || undefined })}
            />
          </Field>
          <FormulaFieldHelper
            allFields={allFields.filter(f => f.id !== field.id && (f.type === 'number' || f.type === 'text'))}
            onInsert={token => {
              const cur = field.formulaExpression || ''
              onPatch({ formulaExpression: cur + (cur && !cur.endsWith(' ') ? ' ' : '') + token })
            }}
          />
          <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            Référence un champ avec <code style={{ background: 'var(--card)', padding: '0 4px', borderRadius: 3 }}>[NomDuChamp]</code>. Opérateurs : <code>+ - * /</code>. Évaluation au signing.
          </div>
        </>
      )}

      {/* v2.9.51 — SIGNATURE PRÉ-REMPLIE (signature / initial) */}
      {(t === 'signature' || t === 'initial') && (
        <PresetSignatureOption field={field} onPatch={onPatch} />
      )}

      {/* PIÈCE JOINTE */}
      {t === 'attachment' && (
        <>
          {/* v2.9.46 — Type de document fusionné en UN seul contrôle (3 choix).
              Avant : dropdown « single / recto_verso » + case « Plusieurs fichiers
              autorisés » → 2 contrôles qui se chevauchaient. Maintenant : 1 dropdown,
              3 options claires, plus aucune ambiguïté. */}
          <Field label="Type de document">
            <select
              className="neo-input"
              value={
                field.attachmentMultiple ? 'multiple'
                  : field.attachmentSides === 'recto_verso' ? 'recto_verso'
                  : 'single'
              }
              onChange={e => {
                const v = e.target.value
                if (v === 'multiple') {
                  onPatch({ attachmentSides: 'single', attachmentMultiple: true })
                } else if (v === 'recto_verso') {
                  onPatch({ attachmentSides: 'recto_verso', attachmentMultiple: undefined })
                } else {
                  onPatch({ attachmentSides: 'single', attachmentMultiple: undefined })
                }
              }}
            >
              <option value="single">Une seule face / un fichier</option>
              <option value="recto_verso">Recto + Verso (2 photos)</option>
              <option value="multiple">Plusieurs fichiers</option>
            </select>
          </Field>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: -2 }}>
            « Recto + Verso » affiche au candidat 2 emplacements distincts (Recto / Verso) ;
            les 2 photos sont assemblées sur une seule page A4 dans l&apos;email reçu.
            « Plusieurs fichiers » laisse le candidat charger autant de pages qu&apos;il veut.
          </div>
          <Field label="Taille max (Mo)">
            <input
              type="number"
              min={1}
              max={50}
              className="neo-input"
              placeholder="10"
              value={field.attachmentMaxSizeMb ?? ''}
              onChange={e => onPatch({ attachmentMaxSizeMb: e.target.value === '' ? undefined : Math.max(1, Math.min(50, Number(e.target.value))) })}
            />
          </Field>
          {/* v2.9.29 — Choix simple au lieu d'une liste de types MIME granulaire
              (incohérente : tous les types image doivent marcher). */}
          <Field label="Fichiers acceptés">
            <select
              className="neo-input"
              value={(() => {
                const m = field.attachmentMimeTypes
                if (!m || m.length === 0) return 'all'
                if (m.length === 1 && m[0] === 'application/pdf') return 'pdf'
                if (m.every(x => x.startsWith('image/'))) return 'images'
                return 'all'
              })()}
              onChange={e => {
                const v = e.target.value
                onPatch({
                  attachmentMimeTypes: v === 'images' ? ['image/*']
                    : v === 'pdf' ? ['application/pdf']
                    : undefined,
                })
              }}
            >
              <option value="all">Photos + PDF (recommandé)</option>
              <option value="images">Photos / images uniquement</option>
              <option value="pdf">PDF uniquement</option>
            </select>
          </Field>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: -2 }}>
            « Photos » couvre tous les formats d&apos;image (JPEG, PNG, HEIC iPhone,
            WebP…). Le candidat peut prendre une photo ou choisir un fichier.
          </div>
          {/* v2.9.46 — Case « Plusieurs fichiers autorisés » retirée : fusionnée
              dans le dropdown « Type de document » ci-dessus (3 options). */}

          {/* v2.9.46 — Utiliser comme photo de profil candidat (si fiche sans photo) */}
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={!!field.attachmentSetAsCandidatePhoto}
              onChange={e => onPatch({ attachmentSetAsCandidatePhoto: e.target.checked || undefined })}
            />
            Utiliser comme <strong>photo de profil</strong> du candidat (si sa fiche n&apos;en a pas)
          </label>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: -2, marginLeft: 22 }}>
            Idéal pour une « photo selfie ». À la finalisation, si le candidat n&apos;a pas encore
            de photo, la 1ʳᵉ image chargée devient sa photo de profil.
          </div>

          {/* v2.9.23 — Cocher automatiquement une case à cocher au chargement */}
          <Field label="Cocher automatiquement la case">
            <select
              className="neo-input"
              value={field.attachmentLinkedCheckboxId || ''}
              onChange={e => onPatch({ attachmentLinkedCheckboxId: e.target.value || undefined })}
            >
              <option value="">— Aucune —</option>
              {allFields
                .filter(cf => cf.type === 'checkbox'
                  && cf.recipientOrder === field.recipientOrder
                  && cf.id !== field.id)
                .map(cf => (
                  <option key={cf.id} value={cf.id}>
                    {(cf.wizardSection ? cf.wizardSection + ' — ' : '')
                      + (cf.tooltip || cf.label || 'Case à cocher')}
                  </option>
                ))}
            </select>
          </Field>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: -2 }}>
            La case se coche dès qu&apos;un fichier est chargé (et se décoche si tout est retiré).
          </div>

          {/* v2.9.23 — Classement dans la Conformité de la fiche candidat */}
          <Field label="Classer dans la Conformité comme">
            <select
              className="neo-input"
              value={field.attachmentComplianceTypeId || ''}
              onChange={e => onPatch({ attachmentComplianceTypeId: e.target.value || undefined })}
            >
              <option value="">— Ne pas ajouter à la Conformité (ex : CV) —</option>
              {complianceDocTypes.map(dt => (
                <option key={dt.id} value={dt.id}>{dt.name}</option>
              ))}
            </select>
          </Field>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: -2 }}>
            À la finalisation, les fichiers chargés sont ajoutés à l&apos;onglet 🛡 Conformité
            de la fiche candidat (si l&apos;enveloppe est liée à un candidat). Claude lit
            automatiquement la date d&apos;expiration des documents officiels.
          </div>
        </>
      )}

      {/* EMAIL */}
      {t === 'email' && (
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={!!field.validateEmailFormat}
            onChange={e => onPatch({ validateEmailFormat: e.target.checked || undefined })}
          />
          Valider le format email (regex)
        </label>
      )}

      {/* DATE */}
      {t === 'date' && (
        <>
          <Field label="Format d'affichage">
            <select
              className="neo-input"
              value={field.dateFormat || 'dd.MM.yyyy'}
              onChange={e => onPatch({ dateFormat: e.target.value })}
            >
              {DATE_FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>
          {/* v2.2.4 — Toggle "Date de signature" : auto-fill avec date du jour de signature.
              Stocké via metadata.tabType='datesigned' (compat DocuSign legacy). */}
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={field.metadata?.tabType === 'datesigned'}
              onChange={e => {
                const next = { ...(field.metadata || {}) }
                if (e.target.checked) next.tabType = 'datesigned'
                else delete next.tabType
                onPatch({ metadata: Object.keys(next).length > 0 ? next : undefined })
              }}
            />
            <span>
              <strong>Date de signature</strong> — remplie auto avec la date du jour quand le candidat signe (lecture seule)
            </span>
          </label>
        </>
      )}

      {/* v2.2.4 — FORMULE : options opération + sources + décimales (cohérence avec Mode Wizard) */}
      {t === 'formula' && (
        <details style={{ marginTop: 4 }} open>
          <summary style={summaryStyle}>Options Formule</summary>
          <div style={detailsBodyStyle}>
            <FieldFormulaOptions
              field={field}
              allRecipientFields={allFields.filter(ff => ff.recipientOrder === field.recipientOrder)}
              onUpdate={onPatch}
            />
          </div>
        </details>
      )}

      {/* FORMATAGE — police, taille, style, couleur */}
      {supportsFormatting && (
        <details style={{ marginTop: 4 }}>
          <summary style={summaryStyle}>Formatage</summary>
          <div style={detailsBodyStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6 }}>
              <Field label="Police">
                <select
                  className="neo-input"
                  value={field.font || 'Arial'}
                  onChange={e => onPatch({ font: e.target.value || undefined })}
                >
                  {FONT_FAMILIES.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Taille">
                <select
                  className="neo-input"
                  value={field.fontSize || 10}
                  onChange={e => onPatch({ fontSize: Number(e.target.value) || undefined })}
                >
                  {FONT_SIZES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <StyleToggle
                label="B" bold
                active={!!field.bold}
                onClick={() => onPatch({ bold: !field.bold || undefined })}
              />
              <StyleToggle
                label="I" italic
                active={!!field.italic}
                onClick={() => onPatch({ italic: !field.italic || undefined })}
              />
              <StyleToggle
                label="U" underline
                active={!!field.underline}
                onClick={() => onPatch({ underline: !field.underline || undefined })}
              />
            </div>
            <Field label="Couleur">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {FONT_COLORS.map(c => {
                  const isActive = (field.fontColor || 'Black') === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => onPatch({ fontColor: c.value === 'Black' ? undefined : c.value })}
                      title={c.label}
                      style={{
                        width: 22, height: 22,
                        borderRadius: 4,
                        background: c.hex,
                        border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                        cursor: 'pointer',
                        boxShadow: isActive ? '0 0 0 2px var(--primary-soft)' : undefined,
                      }}
                    />
                  )
                })}
              </div>
            </Field>
          </div>
        </details>
      )}

      {/* VALIDATION — regex */}
      {supportsValidation && (
        <details style={{ marginTop: 4 }}>
          <summary style={summaryStyle}>Validation (regex)</summary>
          <div style={detailsBodyStyle}>
            <Field label="Pattern regex">
              <input
                type="text"
                className="neo-input"
                placeholder={
                  t === 'email' ? '(par défaut format email)' :
                  t === 'number' ? '^[0-9]{4}$' :
                  '^[A-Z0-9-]+$'
                }
                value={field.validationPattern || ''}
                onChange={e => onPatch({ validationPattern: e.target.value || undefined })}
                style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace', fontSize: 12 }}
              />
            </Field>
            <Field label="Message d'erreur (optionnel)">
              <input
                type="text"
                className="neo-input"
                placeholder="Ex : Format invalide"
                value={field.validationMessage || ''}
                onChange={e => onPatch({ validationMessage: e.target.value || undefined })}
              />
            </Field>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Évalué au signing (Phase 4). Utiliser une regex JS standard.
            </div>
          </div>
        </details>
      )}

      {/* v2.4.0 — Annotation visible inline (sous le label, au-dessus de l'input) */}
      <Field label="Annotation / Instruction">
        <input
          type="text"
          className="neo-input"
          placeholder="Ex : Indiquez votre IBAN suisse au format CH..."
          value={field.helpText || ''}
          onChange={e => onPatch({ helpText: e.target.value.slice(0, 200) || undefined })}
          maxLength={200}
        />
      </Field>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: -4 }}>
        Affichée en petit texte sous le titre du champ, visible en permanence.
      </div>

      {/* AVANCÉ — tooltip */}
      <details style={{ marginTop: 4 }}>
        <summary style={summaryStyle}>Avancé</summary>
        <div style={detailsBodyStyle}>
          <Field label="Tooltip (aide au survol)">
            <input
              type="text"
              className="neo-input"
              placeholder="Ex : Indiquez votre date de naissance"
              value={field.tooltip || ''}
              onChange={e => onPatch({ tooltip: e.target.value || undefined })}
            />
          </Field>
          <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            Affiché au signataire au survol du champ (Phase 4).
          </div>
        </div>
      </details>
    </div>
  )
}

const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '6px 8px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--foreground)',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  userSelect: 'none',
}

const detailsBodyStyle: React.CSSProperties = {
  marginTop: 6,
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
}

function StyleToggle({
  label, active, onClick, bold, italic, underline,
}: { label: string; active: boolean; onClick: () => void; bold?: boolean; italic?: boolean; underline?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 32, height: 28,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        background: active ? 'var(--primary-soft)' : 'var(--card)',
        color: active ? 'var(--primary)' : 'var(--foreground)',
        borderRadius: 6,
        fontWeight: bold ? 800 : 600,
        fontStyle: italic ? 'italic' : 'normal',
        textDecoration: underline ? 'underline' : 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
      }}
    >
      {label}
    </button>
  )
}

// Helper d'insertion de référence de champ dans une formule
function FormulaFieldHelper({
  allFields, onInsert,
}: { allFields: SignField[]; onInsert: (token: string) => void }) {
  if (allFields.length === 0) {
    return (
      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' }}>
        Aucun champ Numéro/Texte à référencer.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>
        Insérer une référence
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {allFields.slice(0, 12).map(f => {
          const name = (f.label || FIELD_TYPE_LABELS[f.type]).slice(0, 22)
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onInsert(`[${name.replace(/[\[\]]/g, '')}]`)}
              className="neo-btn-ghost neo-btn-sm"
              style={{ fontSize: 10.5, padding: '3px 8px', height: 24 }}
              title={`Insérer [${name}]`}
            >
              [{name}]
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ConditionalLogicEditor({
  field, allFields, onPatch,
}: {
  field: SignField
  allFields: SignField[]
  onPatch: (patch: Partial<SignField>) => void
}) {
  const conditions = field.conditions || []

  const addCondition = () => {
    if (allFields.length === 0) return
    const newCond: SignFieldCondition = {
      triggerFieldId: allFields[0].id,
      operator: 'equals',
      value: '',
      action: 'unrequire',
    }
    onPatch({ conditions: [...conditions, newCond] })
  }

  const updateCondition = (idx: number, patch: Partial<SignFieldCondition>) => {
    onPatch({ conditions: conditions.map((c, i) => i === idx ? { ...c, ...patch } : c) })
  }

  const removeCondition = (idx: number) => {
    onPatch({ conditions: conditions.filter((_, i) => i !== idx) })
  }

  if (allFields.length === 0) {
    return (
      <div
        style={{
          marginTop: 4,
          padding: 10,
          border: '1px dashed var(--border)',
          borderRadius: 8,
          background: 'var(--secondary)',
          fontSize: 11.5,
          color: 'var(--muted)',
        }}
      >
        Aucun autre champ à utiliser comme déclencheur.
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 4,
        padding: 10,
        border: '1px dashed var(--border)',
        borderRadius: 8,
        background: 'var(--secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--foreground)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <span>Logique conditionnelle</span>
        {conditions.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
            {conditions.length} règle{conditions.length > 1 ? 's' : ''} (toutes vraies)
          </span>
        )}
      </div>

      {conditions.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '4px 0', lineHeight: 1.5 }}>
          Pas de condition. Ce champ est toujours actif.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conditions.map((c, idx) => {
            const trigger = allFields.find(f => f.id === c.triggerFieldId)
            const triggerLabel: string = trigger ? getFieldDisplayLabel(trigger, FIELD_TYPE_LABELS[trigger.type]) : 'Champ supprimé'
            const triggerType = trigger?.type
            const needsValue = c.operator !== 'isEmpty' && c.operator !== 'isNotEmpty'
            // Si le trigger est un select, on propose ses listItems comme valeurs
            const triggerListItems: ListItem[] = (triggerType === 'select' && Array.isArray(trigger?.metadata?.listItems))
              ? (trigger!.metadata!.listItems as ListItem[])
              : []
            return (
              <div
                key={idx}
                style={{
                  padding: 8,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Si
                </div>
                <select
                  className="neo-input"
                  style={{ height: 30, fontSize: 12, padding: '0 8px' }}
                  value={c.triggerFieldId}
                  onChange={e => updateCondition(idx, { triggerFieldId: e.target.value })}
                >
                  {/* v2.7.8 — Groupé par section + label lisible (plus de UUIDs DocuSign) */}
                  {groupFieldsBySection(allFields).map((g, gi) => (
                    g.section ? (
                      <optgroup key={`s-${gi}`} label={g.section}>
                        {g.fields.map(f => (
                          <option key={f.id} value={f.id}>
                            {getFieldDisplayLabel(f, FIELD_TYPE_LABELS[f.type])} ({f.type})
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      <optgroup key={`s-${gi}`} label="(sans section)">
                        {g.fields.map(f => (
                          <option key={f.id} value={f.id}>
                            {getFieldDisplayLabel(f, FIELD_TYPE_LABELS[f.type])} ({f.type})
                          </option>
                        ))}
                      </optgroup>
                    )
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select
                    className="neo-input"
                    style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}
                    value={c.operator}
                    onChange={e => updateCondition(idx, { operator: e.target.value as SignConditionOperator })}
                  >
                    {(Object.keys(CONDITION_OPERATOR_LABELS) as SignConditionOperator[]).map(op => (
                      <option key={op} value={op}>{CONDITION_OPERATOR_LABELS[op]}</option>
                    ))}
                  </select>
                  {needsValue && (
                    triggerListItems.length > 0 ? (
                      <select
                        className="neo-input"
                        style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}
                        value={c.value || ''}
                        onChange={e => updateCondition(idx, { value: e.target.value })}
                      >
                        <option value="">— valeur —</option>
                        {triggerListItems.map((it, i) => (
                          <option key={i} value={it.value}>{it.text}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="neo-input"
                        style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}
                        placeholder={triggerType === 'checkbox' ? 'true / false' : 'valeur'}
                        value={c.value || ''}
                        onChange={e => updateCondition(idx, { value: e.target.value })}
                      />
                    )
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                  Alors
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <select
                    className="neo-input"
                    style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}
                    value={c.action}
                    onChange={e => updateCondition(idx, { action: e.target.value as SignConditionAction })}
                  >
                    {(Object.keys(CONDITION_ACTION_LABELS) as SignConditionAction[]).map(a => (
                      <option key={a} value={a}>{CONDITION_ACTION_LABELS[a]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCondition(idx)}
                    title="Supprimer cette règle"
                    style={{
                      width: 28, height: 30, flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid var(--border)', borderRadius: 6,
                      background: 'var(--card)', color: 'var(--destructive)', cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4, marginTop: 2 }}>
                  {summarizeCondition(c, triggerLabel)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addCondition}
        className="neo-btn-ghost neo-btn-sm"
        style={{ alignSelf: 'flex-start' }}
      >
        <Plus size={11} />
        Ajouter une règle
      </button>
    </div>
  )
}

function summarizeCondition(c: SignFieldCondition, triggerLabel: string): string {
  const op = CONDITION_OPERATOR_LABELS[c.operator]
  const action = CONDITION_ACTION_LABELS[c.action]
  const triggerShort = triggerLabel.slice(0, 30) + (triggerLabel.length > 30 ? '…' : '')
  if (c.operator === 'isEmpty' || c.operator === 'isNotEmpty') {
    return `Si "${triggerShort}" ${op} → ${action}`
  }
  return `Si "${triggerShort}" ${op} "${c.value || ''}" → ${action}`
}

function CheckboxGroupForm({
  count, onCreate,
}: { count: number; onCreate: (rule: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly', n: number, label?: string) => void }) {
  // v2.8.3 — Default SelectExactly car c'est le cas le plus fréquent (radio Oui/Non)
  const [rule, setRule] = useState<'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly'>('SelectExactly')
  const [n, setN] = useState(1)
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  return (
    <div
      style={{
        marginTop: 2,
        padding: 10,
        border: '1px dashed var(--primary)',
        borderRadius: 8,
        background: 'var(--primary-soft)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Grouper {count} cases à cocher
      </div>
      <Field label="Étiquette du groupe (optionnel)">
        <input
          type="text"
          className="neo-input"
          placeholder="Ex : Permis de conduire"
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
      </Field>
      <Field label="Règle">
        <select className="neo-input" value={rule} onChange={e => setRule(e.target.value as typeof rule)}>
          <option value="SelectAtLeast">Au moins X case(s)</option>
          <option value="SelectAtMost">Au plus X case(s)</option>
          <option value="SelectExactly">Exactement X case(s)</option>
        </select>
      </Field>
      <Field label="Nombre X">
        <input
          type="number"
          className="neo-input"
          min={1}
          max={count}
          value={n}
          onChange={e => setN(Math.max(1, Math.min(count, Number(e.target.value) || 1)))}
        />
      </Field>
      <button
        type="button"
        onClick={() => {
          setSubmitting(true)
          onCreate(rule, n, label.trim() || undefined)
          // Reset form après création
          setLabel('')
          setN(1)
          // Brief animation pour confirmer le clic
          setTimeout(() => setSubmitting(false), 500)
        }}
        className="neo-btn-yellow"
        style={{
          height: 36, fontSize: 12.5, justifyContent: 'center',
          opacity: submitting ? 0.6 : 1,
          transition: 'opacity 0.2s',
        }}
        disabled={submitting}
      >
        {submitting ? '✓ Créé !' : 'Créer le groupe'}
      </button>
    </div>
  )
}

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--foreground)',
  cursor: 'pointer',
}

// v2.2.4 — RecalibratePanel + ShiftBtn supprimés (peu utilisés en pratique).
// L'admin peut décaler tous les champs via lasso-sélection + drag.


// v2.9.51 — Signature pré-remplie (« en dur ») sur un champ signature/initial.
// Permet de dupliquer un template par consultant (1 João, 1 Seb) avec la
// signature consultant intégrée. À la finalisation, l'image est stampée auto.
function PresetSignatureOption({
  field, onPatch,
}: {
  field: SignField
  onPatch: (patch: Partial<SignField>) => void
}) {
  const [padOpen, setPadOpen] = useState(false)
  const hasPreset = typeof field.presetSignatureDataUrl === 'string'
    && field.presetSignatureDataUrl.length > 0
  return (
    <div style={{
      borderTop: '1px dashed var(--border)',
      paddingTop: 10,
      marginTop: 4,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--foreground)' }}>
        Signature pré-remplie (consultant en dur)
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.55 }}>
        Si activée, cette image est stampée automatiquement à la place d'attendre
        une signature live. Idéal pour dupliquer le template par consultant
        (Joao / Seb) avec la signature consultant intégrée — le candidat n'aura
        plus que sa propre signature à faire.
      </div>
      {hasPreset ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: 8, border: '1px solid var(--border)', borderRadius: 8,
          background: 'var(--card)',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={field.presetSignatureDataUrl as string}
            alt="Signature pré-remplie"
            style={{ maxHeight: 60, maxWidth: '100%', objectFit: 'contain', background: '#fff', borderRadius: 4, padding: 2 }}
          />
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setPadOpen(true)}
            className="neo-btn-ghost neo-btn-sm"
            style={{ fontSize: 11 }}
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Retirer la signature pré-remplie ? Ce champ deviendra à nouveau interactif.')) {
                onPatch({ presetSignatureDataUrl: null })
              }
            }}
            className="neo-btn-ghost neo-btn-sm"
            style={{ fontSize: 11, color: 'var(--destructive, #DC2626)' }}
          >
            Retirer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPadOpen(true)}
          className="neo-btn"
          style={{ alignSelf: 'flex-start', fontSize: 12 }}
        >
          + Dessiner la signature pré-remplie
        </button>
      )}
      <SignaturePadDynamic
        open={padOpen}
        onClose={() => setPadOpen(false)}
        onAdopt={(dataUrl) => {
          onPatch({ presetSignatureDataUrl: dataUrl })
          setPadOpen(false)
        }}
      />
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        margin: '0 0 10px',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--muted)',
      }}
    >
      {children}
    </h3>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--muted)',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26, height: 26,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--card)',
        color: disabled ? 'var(--muted)' : 'var(--foreground)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

function fieldsTotalCount(docs: SignDocument[]): number {
  return docs.reduce((acc, d) => acc + (d.fields?.length || 0), 0)
}

function countFieldsForRecipient(docs: SignDocument[], order: number): number {
  return docs.reduce((acc, d) => acc + (d.fields?.filter(f => f.recipientOrder === order).length || 0), 0)
}

// v2.2.4 — style des boutons zoom +/-
function zoomBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 28,
    fontSize: 16, fontWeight: 700,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: disabled ? "var(--muted)" : "var(--foreground)",
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: disabled ? 0.5 : 1,
  }
}

// ─────────────────────────────────────────────────────────────────
// v2.6.10 — Aligner & Égaliser (multi-sélection, mode Figma-like)
// ─────────────────────────────────────────────────────────────────
function AlignEqualizeSection({
  selectedFields,
  onPatchManyMixed,
  onPatchMany,
}: {
  selectedFields: SignField[]
  onPatchManyMixed: (updates: Array<{ id: string; patch: Partial<SignField> }>) => void
  onPatchMany: (ids: string[], patch: Partial<SignField>) => void
}) {
  if (selectedFields.length < 2) return null
  const ids = selectedFields.map(f => f.id)
  // Référence = 1er field sélectionné (le "leader") pour l'égalisation taille
  const leader = selectedFields[0]

  // Bornes du groupe
  const minX = Math.min(...selectedFields.map(f => f.x))
  const maxRight = Math.max(...selectedFields.map(f => f.x + f.width))
  const minY = Math.min(...selectedFields.map(f => f.y))
  const maxBottom = Math.max(...selectedFields.map(f => f.y + f.height))
  const centerX = (minX + maxRight) / 2
  const centerY = (minY + maxBottom) / 2

  const alignLeft = () => {
    onPatchManyMixed(selectedFields.map(f => ({ id: f.id, patch: { x: minX } })))
  }
  const alignRight = () => {
    onPatchManyMixed(selectedFields.map(f => ({ id: f.id, patch: { x: maxRight - f.width } })))
  }
  const alignCenterH = () => {
    onPatchManyMixed(selectedFields.map(f => ({ id: f.id, patch: { x: centerX - f.width / 2 } })))
  }
  const alignTop = () => {
    onPatchManyMixed(selectedFields.map(f => ({ id: f.id, patch: { y: minY } })))
  }
  const alignBottom = () => {
    onPatchManyMixed(selectedFields.map(f => ({ id: f.id, patch: { y: maxBottom - f.height } })))
  }
  const alignCenterV = () => {
    onPatchManyMixed(selectedFields.map(f => ({ id: f.id, patch: { y: centerY - f.height / 2 } })))
  }
  // Égaliser largeur / hauteur : applique la dim du leader (1er sélectionné) aux autres
  const equalizeWidth = () => {
    onPatchMany(ids, { width: leader.width })
  }
  const equalizeHeight = () => {
    onPatchMany(ids, { height: leader.height })
  }
  const equalizeBoth = () => {
    onPatchMany(ids, { width: leader.width, height: leader.height })
  }
  // Distribuer horizontalement (espace égal entre fields, basé sur centres)
  const distributeH = () => {
    if (selectedFields.length < 3) return
    const sorted = [...selectedFields].sort((a, b) => a.x - b.x)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalSpan = (last.x + last.width / 2) - (first.x + first.width / 2)
    const step = totalSpan / (sorted.length - 1)
    onPatchManyMixed(sorted.slice(1, -1).map((f, i) => ({
      id: f.id,
      patch: { x: (first.x + first.width / 2) + step * (i + 1) - f.width / 2 },
    })))
  }
  const distributeV = () => {
    if (selectedFields.length < 3) return
    const sorted = [...selectedFields].sort((a, b) => a.y - b.y)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalSpan = (last.y + last.height / 2) - (first.y + first.height / 2)
    const step = totalSpan / (sorted.length - 1)
    onPatchManyMixed(sorted.slice(1, -1).map((f, i) => ({
      id: f.id,
      patch: { y: (first.y + first.height / 2) + step * (i + 1) - f.height / 2 },
    })))
  }

  const btn: React.CSSProperties = {
    flex: '0 0 auto',
    minWidth: 36,
    height: 32,
    padding: '0 8px',
    fontSize: 11,
    fontFamily: 'inherit',
    fontWeight: 600,
    border: '1px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--foreground)',
    borderRadius: 6,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: 'var(--muted)',
    marginBottom: 4,
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
      <div>
        <div style={labelStyle}>Aligner ({selectedFields.length} champs)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button type="button" onClick={alignLeft}    style={btn} title="Aligner à gauche">⬅ G</button>
          <button type="button" onClick={alignCenterH} style={btn} title="Centrer horizontalement">↔ C</button>
          <button type="button" onClick={alignRight}   style={btn} title="Aligner à droite">D ➡</button>
          <span style={{ width: 6 }} />
          <button type="button" onClick={alignTop}     style={btn} title="Aligner en haut">⬆ H</button>
          <button type="button" onClick={alignCenterV} style={btn} title="Centrer verticalement">↕ C</button>
          <button type="button" onClick={alignBottom}  style={btn} title="Aligner en bas">B ⬇</button>
        </div>
      </div>
      <div>
        <div style={labelStyle}>Égaliser taille (référence : 1er sélectionné)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button type="button" onClick={equalizeWidth}  style={btn} title="Largeur identique au 1er">Largeur</button>
          <button type="button" onClick={equalizeHeight} style={btn} title="Hauteur identique au 1er">Hauteur</button>
          <button type="button" onClick={equalizeBoth}   style={{ ...btn, background: '#FEF3C7', borderColor: '#FCD34D' }} title="Largeur + hauteur identiques au 1er">L + H</button>
        </div>
      </div>
      {selectedFields.length >= 3 && (
        <div>
          <div style={labelStyle}>Distribuer (espacement égal)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button type="button" onClick={distributeH} style={btn} title="Distribuer horizontalement">⇆ H</button>
            <button type="button" onClick={distributeV} style={btn} title="Distribuer verticalement">⇅ V</button>
          </div>
        </div>
      )}
    </div>
  )
}
