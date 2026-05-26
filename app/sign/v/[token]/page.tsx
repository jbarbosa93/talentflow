// TalentFlow Sign — Page PUBLIQUE de signature (Phase 3 — viewer DocuSign-like)
// v2.2.0 — Phase 3
// URL : /sign/v/{token}
// Layout : sidebar gauche (récap + liste documents) + viewer canvas central scroll vertical.
// Mobile-first : sidebar collapsable en drawer.
'use client'

import { useEffect, useState, use, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  FileSignature, FileText, AlertTriangle, Loader2, Clock, CheckCircle2,
  Menu as MenuIcon, X as XIcon, ChevronRight, PenLine, Check as CheckMark,
  ArrowRight, BookOpen, ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import type { SignDocument, SignField, SignAttachmentValue } from '@/lib/sign/types'

const PublicPdfViewer = dynamic(() => import('@/components/sign/PublicPdfViewer'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 8, color: '#6B7280' }}>
      <Loader2 size={18} className="animate-spin" />
      <span style={{ fontSize: 13 }}>Initialisation…</span>
    </div>
  ),
})
const ConsentModal = dynamic(() => import('@/components/sign/ConsentModal'), { ssr: false })
const SignaturePad = dynamic(() => import('@/components/sign/SignaturePad'), { ssr: false })
const SignWizard = dynamic(() => import('@/components/sign/SignWizard'), { ssr: false })
import PublicFieldsLayer, { areAllRequiredFieldsFilled, isFieldFilledExt } from '@/components/sign/PublicFieldsLayer'
import { RECIPIENT_COLORS } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'
import { getDayOffsetFromSection, dateForDayOfWeek, effectiveFieldState, looksLikePhoneField, isCandidatePhoneField } from '@/lib/sign/field-helpers'
import LogoLAgence from '@/components/report/LogoLAgence'

interface PageProps {
  params: Promise<{ token: string }>
}

interface VerifyResponse {
  valid: boolean
  reason?: 'not_found' | 'expired' | 'used' | 'envelope_not_found' | 'missing_token' | 'server_error'
  envelope?: {
    id: string
    title: string
    message: string | null
    status: string
    document_category: string
    sent_at: string | null
  }
  sender?: { name: string; email: string | null } | null
  recipient?: {
    name: string
    /** v2.2.1 — Prénom séparé saisi par l'admin (priorité sur le split de `name`) */
    firstName?: string | null
    /** v2.2.1 — Nom séparé saisi par l'admin (priorité sur le split de `name`) */
    lastName?: string | null
    email: string
    expires_at?: string | null
    terms_accepted_at?: string | null
    // Phase 4a-bis
    order?: number
    role?: string
    isCC?: boolean
    // Phase 4a
    signature_data_url?: string | null
    signature_method?: 'drawn' | 'typed' | 'auto' | null
    signed_at?: string | null
    field_values?: Record<string, unknown>
    // v2.2.2 — Mode d'affichage préféré pour ce destinataire
    preferredViewMode?: 'wizard' | 'document' | 'auto'
  }
  allRecipients?: Array<{
    name: string
    order: number
    role: string
    status: string
    signed_at: string | null
    isCurrent: boolean
  }>
  documents?: SignDocument[]
  // v2.2.0 Phase 4a-bis-2 — Mode Wizard
  wizard?: {
    enabled: boolean
    steps: WizardStep[]
  }
  // v2.2.0 Phase 4a-bis-5 — Données candidat lié pour pré-fill
  candidat?: {
    prenom?: string | null
    nom?: string | null
    email?: string | null
    telephone?: string | null
    date_naissance?: string | null
    localisation?: string | null
    /** v2.2.2 — Métier candidat → utilisé pour fields type=title */
    pipeline_metier?: string | null
  } | null
  /** v2.2.2 — Nom de la société expéditrice → utilisé pour fields type=company */
  companyName?: string
  /** v2.2.3 — Pack 1 : valeurs des signers précédents (lecture seule) */
  previousFieldValues?: Record<string, unknown>
  /** v2.2.3 — Map fieldId → nom du signataire qui l'a rempli (pour tooltip) */
  previousSignerNames?: Record<string, string>
}

const COMPANY = 'L-Agence SA'

export default function PublicSignPage({ params }: PageProps) {
  const { token } = use(params)
  const [state, setState] = useState<'loading' | 'invalid' | 'expired' | 'used' | 'ok' | 'error'>('loading')
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [activeDocIdx, setActiveDocIdx] = useState(0)
  const [scrollToPage, setScrollToPage] = useState<number | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [docPagesCount, setDocPagesCount] = useState<Record<number, number>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // v2.2.0 Phase 3 — Consentement CGU obligatoire avant viewer (style DocuSign "Vérifier et poursuivre")
  const [hasConsented, setHasConsented] = useState(false)
  // v2.2.0 Phase 4a — Signature électronique
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  // v2.9.57 — Ref synchrone pour éviter race condition (le pad se ré-ouvrait
  // après adoption car signatureDataUrl n'avait pas encore propagé en state).
  const signatureDataUrlRef = useRef<string | null>(null)
  const [signatureMethod, setSignatureMethod] = useState<'drawn' | 'typed' | null>(null)
  const [signaturePadOpen, setSignaturePadOpen] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [completed, setCompleted] = useState(false)
  // v2.2.0 Phase 4a-bis — Valeurs des champs remplis (state local + sync DB debounced)
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const fieldSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // v2.9.24 — Ref synchrone des valeurs courantes : permet un flush fiable
  // (finalisation, fermeture d'onglet) sans dépendre du state capturé.
  const fieldValuesRef = useRef<Record<string, unknown>>({})
  fieldValuesRef.current = fieldValues
  // v2.2.0 — Guidage SUIVANT : champ courant + flag "a démarré" + refs pour scroll
  const [currentFieldId, setCurrentFieldId] = useState<string | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const fieldElsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const registerFieldEl = useCallback((fieldId: string, el: HTMLDivElement | null) => {
    if (el) fieldElsRef.current.set(fieldId, el)
    else fieldElsRef.current.delete(fieldId)
  }, [])
  // v2.2.0 Phase 4a-bis-2 — Mode d'affichage (wizard step-by-step ou overlay PDF)
  // Default : wizard sur mobile, document sur desktop, sauf si wizard désactivé
  const [viewMode, setViewMode] = useState<'wizard' | 'document'>('document')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // v2.2.0 Phase 4a-bis-2 — Auto-switch mode selon device + wizard_enabled
  // v2.2.2 — Priorité à la préférence destinataire (preferredViewMode), fallback auto
  //   - 'wizard'   : forcé wizard (si activé + steps présents, sinon fallback document)
  //   - 'document' : forcé document
  //   - 'auto' (défaut) : wizard sur mobile / document sur desktop
  // L'utilisateur peut toggle manuellement après.
  useEffect(() => {
    if (!data?.wizard) return
    const enabled = data.wizard.enabled !== false
    // v2.9.19 — Inline calcul effectiveRecipientOrder (mapping par index, pattern #71).
    // Le useMemo `effectiveRecipientOrder` est déclaré plus bas (ordre d'apparition),
    // on duplique la logique ici. Index-based : Nème destinataire ↔ Nème order template.
    const recOrder = data.recipient?.order ?? 1
    const orderSet = new Set<number>()
    for (const s of (data.wizard.steps || [])) orderSet.add(s.recipientOrder ?? 1)
    for (const doc of (data.documents || [])) {
      for (const f of (doc.fields || [])) orderSet.add(f.recipientOrder ?? 1)
    }
    const templateOrders = Array.from(orderSet).sort((a, b) => a - b)
    let matchOrder = recOrder
    if (templateOrders.length > 0) {
      const sortedRec = [...(data.allRecipients || [])]
        .filter(r => r.role !== 'cc')
        .sort((a, b) => a.order - b.order)
      const myIdx = sortedRec.findIndex(r => r.isCurrent)
      matchOrder = myIdx >= 0
        ? templateOrders[Math.min(myIdx, templateOrders.length - 1)]
        : (templateOrders.includes(recOrder) ? recOrder
          : templateOrders.includes(recOrder + 1) ? recOrder + 1
          : templateOrders.includes(recOrder - 1) ? recOrder - 1 : recOrder)
    }
    const stepsForCurrentRecipient = (data.wizard.steps || [])
      .filter(s => (s.recipientOrder ?? 1) === matchOrder)
    const hasSteps = stepsForCurrentRecipient.length > 0
    const wizardAvailable = enabled && hasSteps

    // v2.9.20 — Auto-adapt 100% basé sur l'appareil (plus de preferredViewMode) :
    // - Mobile  : wizard guidé si disponible (doigt + petit écran).
    // - Desktop : document complet par défaut. Le toggle en haut permet de
    //   basculer en wizard manuellement si l'utilisateur le souhaite.
    if (isMobile && wizardAvailable) {
      setViewMode('wizard')
    } else {
      setViewMode('document')
    }
  }, [data, isMobile])

  useEffect(() => {
    fetch('/api/sign/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then((d: VerifyResponse) => {
        setData(d)
        if (d.valid) {
          setState('ok')
          // Phase 3 — Si déjà consenté côté DB, on skip le ConsentModal (refresh-friendly)
          if (d.recipient?.terms_accepted_at) {
            setHasConsented(true)
          }
          // Phase 4a — rehydrate la signature si déjà adoptée
          if (d.recipient?.signature_data_url) {
            setSignatureDataUrl(d.recipient.signature_data_url)
            setSignatureMethod((d.recipient.signature_method === 'drawn' || d.recipient.signature_method === 'typed')
              ? d.recipient.signature_method
              : null)
          }
          if (d.recipient?.signed_at) {
            setCompleted(true)
          }
          // Phase 4a-bis — rehydrate les valeurs des champs déjà saisies
          // v2.2.3 Pack 1 — Merge AUSSI les valeurs des signers précédents (read-only).
          // Le destinataire courant ne peut pas les modifier mais doit les VOIR.
          //
          // v2.2.4 — Pré-fill auto depuis context_data :
          //   1. Si un field date "début semaine" existe → injecte weekStartDate
          //   2. Si un field date a une wizardSection = nom de jour (Lundi, Mardi…)
          //      → injecte la date calculée (weekStartDate + offset jour)
          // Le candidat peut toujours override.
          const ctxAutoFill: Record<string, unknown> = {}
          // v2.9.58 — Pré-remplit les fields avec leur `defaultValue` (texte par
          // défaut configuré dans le template, ex: "CCT", "Monthey le").
          // Avant : defaultValue n'était utilisé que comme placeholder visuel.
          // Maintenant : devient une vraie pré-valeur, modifiable par le candidat,
          // et stampée sur le PDF si pas modifiée.
          for (const doc of (d.documents || [])) {
            for (const f of (doc.fields || [])) {
              if (!f.defaultValue || typeof f.defaultValue !== 'string') continue
              if (!f.defaultValue.trim()) continue
              ctxAutoFill[f.id] = f.defaultValue
            }
          }
          const ctxWeekStart = (d.envelope as { context_data?: { weekStartDate?: string | null } | null } | undefined)?.context_data?.weekStartDate
          if (ctxWeekStart && typeof ctxWeekStart === 'string') {
            for (const doc of (d.documents || [])) {
              for (const f of (doc.fields || [])) {
                if (f.type !== 'date') continue
                const txt = `${f.tooltip || ''} ${f.label || ''}`.toLowerCase()
                // 1. Field "début semaine" → injecte la date du lundi
                if (/(d[ée]but.*(semaine)|semaine.*d[ée]but|lundi.*semaine)/.test(txt)) {
                  ctxAutoFill[f.id] = ctxWeekStart
                  continue
                }
                // 2. Field avec wizardSection = nom de jour → injecte la date du jour
                const dayOffset = getDayOffsetFromSection(f.wizardSection)
                if (dayOffset !== null) {
                  const dayDate = dateForDayOfWeek(ctxWeekStart, dayOffset)
                  if (dayDate) ctxAutoFill[f.id] = dayDate
                }
              }
            }
          }
          // v2.2.4 — Backup localStorage : merge si plus récent que la DB
          // (cas typique : candidat ferme le tab pendant le debounce 600ms → DB n'a
          // pas reçu les dernières saisies, mais localStorage si).
          let localBackup: Record<string, unknown> = {}
          try {
            if (typeof window !== 'undefined') {
              const raw = window.localStorage.getItem(`sign:${token}:fieldValues`)
              if (raw) {
                const parsed = JSON.parse(raw) as { values?: Record<string, unknown>; savedAt?: number }
                if (parsed?.values && typeof parsed.values === 'object') {
                  localBackup = parsed.values
                }
              }
            }
          } catch { /* parse error, silent */ }

          const merged: Record<string, unknown> = {
            ...ctxAutoFill,
            ...(d.previousFieldValues || {}),
            ...(d.recipient?.field_values || {}),
            // localBackup en DERNIER (priorité max) : ce sont les dernières saisies
            // potentiellement non sync DB encore.
            ...localBackup,
          }
          if (Object.keys(merged).length > 0) {
            setFieldValues(merged)
          }
        }
        else if (d.reason === 'expired') setState('expired')
        else if (d.reason === 'used') setState('used')
        else setState('invalid')
      })
      .catch(() => setState('error'))
  }, [token])

  // v2.9.12 — Cross-template autofill : récupère les valeurs des champs ayant
  // une `crossTemplateKey` depuis les autres templates déjà signés par ce destinataire.
  // Ne réécrit JAMAIS une valeur déjà saisie (priorité minimale).
  useEffect(() => {
    if (!data || state !== 'ok') return
    // Collecte les crossTemplateKey utilisées dans le template courant
    const keyToFieldIds: Record<string, string[]> = {}
    for (const doc of (data.documents || [])) {
      for (const f of (doc.fields || [])) {
        const k = (f as any).crossTemplateKey
        if (typeof k === 'string' && k.trim()) {
          const key = k.trim()
          ;(keyToFieldIds[key] ||= []).push(f.id)
        }
      }
    }
    if (Object.keys(keyToFieldIds).length === 0) return
    // eslint-disable-next-line no-console
    console.log(`[cross-key/mount] keys présentes dans le template : ${JSON.stringify(Object.keys(keyToFieldIds))} — fetch /api/sign/cross-fill`)
    fetch('/api/sign/cross-fill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((d: { values?: Record<string, string> } | null) => {
        // eslint-disable-next-line no-console
        console.log(`[cross-key/mount] réponse cross-fill : ${JSON.stringify(d?.values || {})}`)
        if (!d?.values) return
        setFieldValues(prev => {
          const next = { ...prev }
          let touched = 0
          let skipped = 0
          for (const [key, value] of Object.entries(d.values || {})) {
            const fieldIds = keyToFieldIds[key]
            if (!fieldIds) continue
            for (const fid of fieldIds) {
              // Skip si le candidat a déjà saisi qqch (ne pas écraser)
              if (next[fid] !== undefined && next[fid] !== null && next[fid] !== '') {
                skipped++
                continue
              }
              next[fid] = value
              touched++
            }
          }
          // eslint-disable-next-line no-console
          console.log(`[cross-key/mount] champs préremplis=${touched} skippés=${skipped}`)
          return touched > 0 ? next : prev
        })
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[cross-key/mount] échec fetch cross-fill', e)
      })
  }, [data, state, token])

  const documents = useMemo(() => data?.documents || [], [data])
  const activeDoc = documents[activeDocIdx]
  const senderDisplayName = data?.sender?.name || COMPANY

  // Reset page when changing doc
  useEffect(() => {
    setCurrentPage(1)
    setScrollToPage(1)
  }, [activeDocIdx])

  // ─── Phase 4a-bis — Hooks calcul fields (DOIVENT rester AVANT les early returns) ───
  // v2.9.17 — recipientOrder est le RAW order du destinataire courant (depuis envelope).
  // effectiveRecipientOrder est l'order qui MATCH les wizard_steps + fields du template.
  // Pattern #71 : envelope.recipients utilise 0-based, template wizard_steps/fields
  // peuvent être 1-based (import DocuSign).
  // v2.9.19 — Le fuzzy ±1 (v2.9.15) échouait quand 2 orders existent : un consultant
  // avec order=1 matchait l'order 1 (candidat) au lieu de 2 → voyait les champs
  // du candidat. Nouvelle approche ROBUSTE : mapping par index. Le Nème destinataire
  // (trié par order) correspond au Nème order distinct du template.
  const recipientOrder = data?.recipient?.order ?? 1
  const effectiveRecipientOrder = useMemo(() => {
    if (!data) return recipientOrder
    // Orders distincts du template (steps + fields), triés.
    const orderSet = new Set<number>()
    for (const s of (data.wizard?.steps || [])) orderSet.add(s.recipientOrder ?? 1)
    for (const doc of (data.documents || [])) {
      for (const f of (doc.fields || [])) orderSet.add(f.recipientOrder ?? 1)
    }
    const templateOrders = Array.from(orderSet).sort((a, b) => a - b)
    if (templateOrders.length === 0) return recipientOrder

    // Index du destinataire courant dans la liste des destinataires triée par order.
    const sortedRecipients = [...(data.allRecipients || [])]
      .filter(r => r.role !== 'cc')
      .sort((a, b) => a.order - b.order)
    const myIdx = sortedRecipients.findIndex(r => r.isCurrent)
    if (myIdx >= 0) {
      // Nème destinataire ↔ Nème order du template (clampé).
      return templateOrders[Math.min(myIdx, templateOrders.length - 1)]
    }
    // Fallback (recipient courant introuvable dans allRecipients) : match exact ou ±1.
    if (templateOrders.includes(recipientOrder)) return recipientOrder
    if (templateOrders.includes(recipientOrder + 1)) return recipientOrder + 1
    if (templateOrders.includes(recipientOrder - 1)) return recipientOrder - 1
    return recipientOrder
  }, [data, recipientOrder])
  const recipientName = data?.recipient?.name || ''
  const recipientEmail = data?.recipient?.email || ''
  const isCC = data?.recipient?.isCC === true
  const nameParts = recipientName.trim().split(/\s+/)
  const fallbackFirst = nameParts[0] || ''
  const fallbackLast = nameParts.slice(1).join(' ') || ''
  const today = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // v2.2.0 Phase 4a-bis-5 — Pré-fill prénom / nom dans l'ordre de priorité :
  //   1. firstName/lastName saisis par l'admin sur le destinataire (v2.2.1)
  //   2. infos candidat lié (si enveloppe.candidate_id)
  //   3. split du recipient_name (fallback)
  const candidat = data?.candidat
  const adminFirst = data?.recipient?.firstName || ''
  const adminLast = data?.recipient?.lastName || ''
  const firstName = adminFirst || candidat?.prenom || fallbackFirst
  const lastName = adminLast || candidat?.nom || fallbackLast
  const fullName = (adminFirst || adminLast)
    ? [adminFirst, adminLast].filter(Boolean).join(' ').trim()
    : candidat
      ? [candidat.prenom, candidat.nom].filter(Boolean).join(' ').trim() || recipientName
      : recipientName

  // v2.2.2 — companyName depuis verify-token (priorité override context_data > sender.entreprise > fallback)
  // title (fonction professionnelle) depuis candidat.pipeline_metier
  const senderCompanyName = data?.companyName || ''
  const candidatTitle = candidat?.pipeline_metier || ''

  const autoFill = useMemo(() => ({
    firstName, lastName, fullName, email: recipientEmail, today,
    // v2.2.2 — pré-fill auto pour fields type=company / type=title
    companyName: senderCompanyName,
    title: candidatTitle,
    // Champs supplémentaires utilisables par les fields type=text qui ressemblent à téléphone/DDN/...
    telephone: candidat?.telephone || '',
    dateNaissance: candidat?.date_naissance || '',
    localisation: candidat?.localisation || '',
  }), [firstName, lastName, fullName, recipientEmail, today, senderCompanyName, candidatTitle,
       candidat?.telephone, candidat?.date_naissance, candidat?.localisation])

  const recipientPalette = RECIPIENT_COLORS[Math.max(0, (recipientOrder - 1) % RECIPIENT_COLORS.length)]

  const fieldsForCurrentRecipient = useMemo(() => {
    if (!activeDoc) return []
    return (activeDoc.fields || []).filter(f => f.recipientOrder === effectiveRecipientOrder)
  }, [activeDoc, effectiveRecipientOrder])

  // v2.9.58 — Calcule la liste détaillée des bloqueurs (fields requis vides +
  // signatures vides + groupes checkbox incomplets). Utilisée à la fois pour
  // canFinalize (bool) ET pour le banner d'erreur affiché en mode Document.
  const finalizeBlockers = useMemo<Array<{ kind: 'field' | 'signature' | 'group'; doc: string; page: number; label: string; detail?: string }>>(() => {
    if (isCC) return []
    const blockers: Array<{ kind: 'field' | 'signature' | 'group'; doc: string; page: number; label: string; detail?: string }> = []
    documents.forEach((d) => {
      // 1. Fields obligatoires non remplis (hors signatures, traitées à part)
      for (const f of (d.fields || [])) {
        if (f.recipientOrder !== effectiveRecipientOrder) continue
        if (f.type === 'signature' || f.type === 'initial') continue
        // Checkboxes groupées : validées via la règle, pas individuellement
        if (f.type === 'checkbox' && f.groupId && f.groupRule) continue
        const eff = effectiveFieldState(f, fieldValues)
        if (!eff.visible || !eff.required) continue
        if (isFieldFilledExt(f, fieldValues[f.id], signatureDataUrl, autoFill)) continue
        blockers.push({
          kind: 'field',
          doc: d.name || '?',
          page: f.page,
          label: (f.label || f.tooltip || 'Champ').slice(0, 50),
        })
      }
      // 2. Signatures requises non signées
      const hasSignatureField = (d.fields || []).some(f =>
        f.recipientOrder === effectiveRecipientOrder
        && (f.type === 'signature' || f.type === 'initial')
        && !f.metadata?.hidden
        && effectiveFieldState(f, fieldValues).visible,
      )
      if (hasSignatureField && !signatureDataUrl) {
        const sigField = (d.fields || []).find(f =>
          f.recipientOrder === effectiveRecipientOrder
          && (f.type === 'signature' || f.type === 'initial'),
        )
        if (sigField) {
          blockers.push({
            kind: 'signature',
            doc: d.name || '?',
            page: sigField.page,
            label: 'Signature manquante',
          })
        }
      }
      // 3. Groupes de checkboxes avec règle non respectée
      const groups = new Map<string, { rule?: string; min?: number; max?: number; name?: string; members: SignField[]; page: number }>()
      for (const f of (d.fields || [])) {
        if (f.type !== 'checkbox' || !f.groupId || !f.groupRule) continue
        if (f.recipientOrder !== effectiveRecipientOrder) continue
        const eff = effectiveFieldState(f, fieldValues)
        if (!eff.visible) continue
        const g = groups.get(f.groupId)
        if (g) g.members.push(f)
        else groups.set(f.groupId, {
          rule: f.groupRule, min: f.groupMin, max: f.groupMax,
          name: f.groupName, members: [f], page: f.page,
        })
      }
      for (const g of groups.values()) {
        if (!g.rule) continue
        const checked = g.members.filter(m => fieldValues[m.id] === true).length
        let isBad = false
        let detail = ''
        if (g.rule === 'SelectExactly') {
          const want = g.min ?? 1
          isBad = checked !== want
          detail = `sélectionne exactement ${want} (actuellement ${checked})`
        } else if (g.rule === 'SelectAtLeast') {
          const want = g.min ?? 1
          isBad = checked < want
          detail = `sélectionne au moins ${want} (actuellement ${checked})`
        } else if (g.rule === 'SelectAtMost') {
          const want = g.max ?? 1
          isBad = checked > want
          detail = `sélectionne au plus ${want} (actuellement ${checked})`
        }
        if (isBad) {
          blockers.push({
            kind: 'group',
            doc: d.name || '?',
            page: g.page,
            label: g.name || 'Groupe de cases à cocher',
            detail,
          })
        }
      }
    })
    return blockers
  }, [documents, effectiveRecipientOrder, fieldValues, signatureDataUrl, autoFill, isCC])

  const canFinalize = useMemo(() => {
    if (isCC) return true
    const allRecipientFields = documents.flatMap(d =>
      (d.fields || []).filter(f => f.recipientOrder === effectiveRecipientOrder)
    )
    const ok = areAllRequiredFieldsFilled(allRecipientFields, fieldValues, signatureDataUrl, autoFill)
    if (!ok) {
      // eslint-disable-next-line no-console
      console.log(`[canFinalize] FALSE — ${finalizeBlockers.length} bloqueur(s) :`, finalizeBlockers)
    }
    return ok
  }, [documents, effectiveRecipientOrder, fieldValues, signatureDataUrl, autoFill, isCC, finalizeBlockers])

  // v2.2.0 — Liste ordonnée des champs requis non-remplis (signature exclue ici, gérée à part)
  // Ordre lecture document : doc → page → y → x
  const nextFieldsQueue = useMemo(() => {
    const queue: Array<{ fieldId: string; docIdx: number; page: number }> = []
    documents.forEach((doc, dIdx) => {
      const fields = (doc.fields || [])
        .filter(f => f.recipientOrder === effectiveRecipientOrder && !f.metadata?.hidden)
        .filter(f => f.type !== 'annotation')
        // v2.9.22 — Conditions appliquées : on saute les champs cachés par
        // condition, et "requis" suit effectiveFieldState (require/unrequire).
        .filter(f => {
          const eff = effectiveFieldState(f, fieldValues)
          if (!eff.visible) return false
          return eff.required || f.type === 'signature' || f.type === 'initial'
        })
        .filter(f => !isFieldFilledExt(f, fieldValues[f.id], signatureDataUrl, autoFill))
        .sort((a, b) => (a.page - b.page) || (a.y - b.y) || (a.x - b.x))
      fields.forEach(f => queue.push({ fieldId: f.id, docIdx: dIdx, page: f.page }))
    })
    return queue
  }, [documents, effectiveRecipientOrder, fieldValues, signatureDataUrl, autoFill])

  // v2.2.0 — Aller au prochain champ (scroll + focus + halo)
  const goToNextField = useCallback(() => {
    setHasStarted(true)
    // Champ signature pas encore signé → ouvre directement le SignaturePad
    const firstSignature = nextFieldsQueue.find(q => {
      const doc = documents[q.docIdx]
      const f = doc?.fields?.find(ff => ff.id === q.fieldId)
      return f && (f.type === 'signature' || f.type === 'initial') && !signatureDataUrl
    })
    // v2.9.56 — Cherche le premier champ NON-signature non rempli (= un vrai
    // champ obligatoire à remplir avant de signer). Si présent → on y va,
    // jamais ouvrir le pad de signature avant d'avoir tout rempli.
    const firstNonSig = nextFieldsQueue.find(q => {
      const doc = documents[q.docIdx]
      const f = doc?.fields?.find(ff => ff.id === q.fieldId)
      return f && f.type !== 'signature' && f.type !== 'initial'
    })
    if (firstNonSig) {
      if (firstNonSig.docIdx !== activeDocIdx) setActiveDocIdx(firstNonSig.docIdx)
      setCurrentFieldId(firstNonSig.fieldId)
      setScrollToPage(firstNonSig.page)
      setTimeout(() => {
        const el = fieldElsRef.current.get(firstNonSig.fieldId)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 350)
      return
    }
    // Si la prochaine étape logique est de signer ET aucun autre champ non-rempli avant → SignaturePad
    if (firstSignature && nextFieldsQueue[0]?.fieldId === firstSignature.fieldId) {
      // v2.9.63 — Garde anti-réouverture si déjà signé (race condition possible)
      if (signatureDataUrlRef.current) {
        // eslint-disable-next-line no-console
        console.log('[goToNextField] firstSignature en tête mais déjà signé → skip pad ouverture')
        setCurrentFieldId(null)
        return
      }
      // eslint-disable-next-line no-console
      console.log('[goToNextField] OUVERTURE pad via firstSignature')
      setSignaturePadOpen(true)
      setCurrentFieldId(firstSignature.fieldId)
      return
    }
    const next = nextFieldsQueue[0]
    if (!next) {
      setCurrentFieldId(null)
      return
    }
    // Si dans un autre document → switcher
    if (next.docIdx !== activeDocIdx) {
      setActiveDocIdx(next.docIdx)
    }
    setCurrentFieldId(next.fieldId)
    setScrollToPage(next.page)
    // Scroll précis vers l'élément (après le rendu de la page)
    setTimeout(() => {
      const el = fieldElsRef.current.get(next.fieldId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 350)
  }, [nextFieldsQueue, documents, signatureDataUrl, activeDocIdx])

  // v2.9.56 — Wrapper UNIQUE pour ouvrir le SignaturePad. Bloque l'ouverture
  // tant que des champs obligatoires NON-signature sont vides (sur l'ensemble
  // des documents). Évite le bug : pad ouvert alors qu'il reste « Date début
  // de mission » à remplir → candidat signe → bouton Terminer grisé.
  // v2.9.57 — Ne ré-ouvre PAS le pad si on a DÉJÀ une signature (race condition
  // entre adoption + re-render React).
  // v2.9.59 — Utilise finalizeBlockers (qui inclut fields + signatures + groupes
  // checkbox) au lieu de nextFieldsQueue (qui rate les groupes). Évite le bug :
  // pad ouvert alors qu'un groupe « Suisse OU Étranger » n'est pas coché.
  // v2.9.63 — `force=true` autorise la réouverture du pad même si déjà signé
  // (cas : bouton « Modifier ma signature » du wizard step Signature). Sans
  // force, la garde signatureDataUrlRef bloque (évite les réouvertures
  // accidentelles dues à la race condition après adoption).
  const tryOpenSignaturePad = useCallback((force: boolean = false) => {
    // Garde anti-réouverture AUTO : si déjà signé ET pas force, on n'ouvre pas.
    if (signatureDataUrlRef.current && !force) {
      // eslint-disable-next-line no-console
      console.log('[tryOpenSignaturePad] déjà signé (force=false), pas de réouverture')
      return
    }
    // Cherche un bloqueur non-signature (= champ obligatoire vide OU groupe
    // checkbox incomplet). Si trouvé → toast + scroll au champ, pas d'ouverture.
    // En mode force (modifier signature), on bypass aussi cette vérif — l'admin
    // a forcément cliqué un bouton explicite « Modifier ».
    if (!force) {
      const nonSigBlocker = finalizeBlockers.find(b => b.kind !== 'signature')
      if (nonSigBlocker) {
        toast.error(
          nonSigBlocker.kind === 'group'
            ? `${nonSigBlocker.label} : ${nonSigBlocker.detail || 'à compléter'}`
            : `Champ obligatoire vide : ${nonSigBlocker.label}`,
        )
        goToNextField()
        return
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[tryOpenSignaturePad] OUVERTURE pad (force=${force}, hasSig=${!!signatureDataUrlRef.current})`)
    setSignaturePadOpen(true)
  }, [finalizeBlockers, goToNextField])

  // v2.2.4 — Sauvegarde localStorage immédiate (zéro latency) + DB en debounce.
  // Permet au candidat de reprendre où il était même si le réseau coupe pendant le
  // debounce (sinon les 600 dernières ms de saisie sont perdues).
  const saveLocalBackup = useCallback((values: Record<string, unknown>) => {
    try {
      if (typeof window !== 'undefined' && token) {
        window.localStorage.setItem(
          `sign:${token}:fieldValues`,
          JSON.stringify({ values, savedAt: Date.now() })
        )
      }
    } catch { /* quota exceeded, silent */ }
  }, [token])

  const syncFieldValues = useCallback((values: Record<string, unknown>) => {
    // 1. Backup local immédiat
    saveLocalBackup(values)
    // 2. Sync DB debounce
    if (fieldSyncTimerRef.current) clearTimeout(fieldSyncTimerRef.current)
    fieldSyncTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/sign/sign-field', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, fieldValues: values }),
        })
      } catch (e) {
        console.warn('[sign/v] sync field_values error', e)
      }
    }, 600)
  }, [token, saveLocalBackup])

  // v2.9.24 — Flush GARANTI des valeurs courantes vers la DB. Annule le debounce
  // en attente et envoie immédiatement. Appelé avant la finalisation (sinon les
  // 600 dernières ms — dont une pièce jointe — peuvent ne jamais être sauvées)
  // et sur fermeture d'onglet (keepalive).
  const flushFieldValues = useCallback(async (opts?: { keepalive?: boolean }) => {
    if (fieldSyncTimerRef.current) {
      clearTimeout(fieldSyncTimerRef.current)
      fieldSyncTimerRef.current = null
    }
    if (!token) return
    try {
      await fetch('/api/sign/sign-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fieldValues: fieldValuesRef.current }),
        keepalive: opts?.keepalive,
      })
    } catch (e) {
      console.warn('[sign/v] flush field_values error', e)
    }
  }, [token])

  // v2.9.24 — Flush sur fermeture/masquage d'onglet (pattern #64 — déjà fait
  // côté éditeur, manquait côté page candidat).
  useEffect(() => {
    if (!token) return
    const onPageHide = () => { void flushFieldValues({ keepalive: true }) }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flushFieldValues({ keepalive: true })
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [token, flushFieldValues])

  // v2.9.23 — Index de tous les champs (tous documents) pour résoudre les
  // pièces jointes et leur case à cocher liée.
  const allFieldsById = useMemo(() => {
    const m = new Map<string, SignField>()
    for (const d of documents) for (const f of (d.fields || [])) m.set(f.id, f)
    return m
  }, [documents])

  const handleFieldChange = useCallback((fieldId: string, value: unknown) => {
    setFieldValues(prev => {
      const next = { ...prev, [fieldId]: value }
      // v2.9.23 — Pièce jointe : coche/décoche automatiquement la case à cocher
      // liée (attachmentLinkedCheckboxId) selon la présence de fichiers.
      const fld = allFieldsById.get(fieldId)
      if (fld?.type === 'attachment' && fld.attachmentLinkedCheckboxId) {
        const files = (value as SignAttachmentValue | undefined)?.files
        next[fld.attachmentLinkedCheckboxId] = Array.isArray(files) && files.length > 0
      }
      // v2.9.27 — Clé partagée : propage la valeur aux autres champs de la
      // MÊME enveloppe portant le même crossTemplateKey.
      // v2.9.53 — Propagation TOUJOURS (synchronisation bidirectionnelle).
      // Avant : la condition « skip si cible déjà remplie » bloquait après
      // le 1er caractère (cible="R" → skip pour "Ro" car déjà rempli avec "R").
      // Désormais : la cible suit toujours la source. Si le candidat veut
      // 2 valeurs différentes, il modifie directement la cible (qui devient
      // alors la source de propagation).
      if (fld?.crossTemplateKey && typeof value === 'string') {
        const targets: string[] = []
        for (const [fid, other] of allFieldsById) {
          if (fid === fieldId) continue
          if (other.crossTemplateKey && other.crossTemplateKey === fld.crossTemplateKey) {
            next[fid] = value
            targets.push(fid.slice(0, 8))
          }
        }
        // eslint-disable-next-line no-console
        console.log(
          `[cross-key] propagation key="${fld.crossTemplateKey}" value="${value.slice(0, 30)}" `
          + `source=${fieldId.slice(0, 8)} `
          + `propagés=[${targets.join(',')}] (${targets.length}) `
          + `total_fields_map=${allFieldsById.size}`,
        )
      }
      syncFieldValues(next)
      return next
    })
  }, [syncFieldValues, allFieldsById])

  // v2.9.27 — Pré-remplissage du téléphone : si l'enveloppe est liée à un
  // candidat (autoFill.telephone dispo), on remplit les champs téléphone vides
  // du destinataire courant — y compris ceux détectés par libellé (« Tél.
  // portable ») même sans réglage « Format → Téléphone ». Écrit dans
  // fieldValues → la valeur est affichée, sauvegardée ET stampée.
  // v2.9.54 — Logs diagnostic Bug A (téléphone pas pré-rempli en prod).
  const phonePrefilledRef = useRef(false)
  useEffect(() => {
    if (phonePrefilledRef.current) return
    const tel = autoFill.telephone
    if (!tel) {
      // eslint-disable-next-line no-console
      console.log('[phone-prefill] autoFill.telephone vide → skip', { candidat: !!candidat, telDb: candidat?.telephone })
      return
    }
    // v2.9.28 — Champs du candidat = ceux de ses étapes wizard OU de son
    // recipientOrder.
    const candidateFieldIds = new Set<string>()
    for (const s of (data?.wizard?.steps || [])) {
      if ((s.recipientOrder ?? 1) === effectiveRecipientOrder) {
        for (const fid of (s.fieldIds || [])) candidateFieldIds.add(fid)
      }
    }
    for (const d of documents) {
      for (const f of (d.fields || [])) {
        if (f.recipientOrder === effectiveRecipientOrder) candidateFieldIds.add(f.id)
      }
    }
    const phoneFieldIds: string[] = []
    const phoneFieldsDetected: Array<{ id: string; label: string; matched: boolean; isCandidate: boolean; cur: unknown }> = []
    for (const d of documents) {
      for (const f of (d.fields || [])) {
        const isPhone = looksLikePhoneField(f)
        if (isPhone) {
          phoneFieldsDetected.push({
            id: f.id.slice(0, 8),
            label: (f.label || f.tooltip || '').slice(0, 30),
            matched: candidateFieldIds.has(f.id),
            isCandidate: isCandidatePhoneField(f),
            cur: fieldValues[f.id],
          })
        }
        if (!candidateFieldIds.has(f.id)) continue
        // v2.9.57 — Ne pré-remplir QUE les champs téléphone DU candidat
        // (exclut urgence, conjoint, parents, employeur, etc.).
        if (!isCandidatePhoneField(f)) continue
        const v = fieldValues[f.id]
        if (v === undefined || v === null || v === '') phoneFieldIds.push(f.id)
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[phone-prefill] tel="${tel}" effectiveRecipientOrder=${effectiveRecipientOrder}`
      + ` candidateFieldIds.size=${candidateFieldIds.size}`
      + ` phoneFieldsDetected=${JSON.stringify(phoneFieldsDetected)}`
      + ` toFill=${phoneFieldIds.length}`,
    )
    if (phoneFieldIds.length === 0) return
    phonePrefilledRef.current = true
    setFieldValues(prev => {
      const next = { ...prev }
      let touched = false
      for (const id of phoneFieldIds) {
        if (next[id] === undefined || next[id] === null || next[id] === '') {
          next[id] = tel
          touched = true
        }
      }
      if (touched) syncFieldValues(next)
      return next
    })
  }, [documents, autoFill, effectiveRecipientOrder, fieldValues, syncFieldValues, data, candidat])

  // ── ÉTATS D'ERREUR ──────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <CenteredCard>
        <p style={{ ...textStyle, margin: 0 }}>Vérification du lien…</p>
        <Loader2 size={28} className="animate-spin" style={{ color: '#EAB308' }} />
      </CenteredCard>
    )
  }
  if (state === 'invalid' || state === 'error') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEE2E2', '#DC2626')}><AlertTriangle size={28} /></div>
        <h1 style={titleStyle}>Lien invalide</h1>
        <p style={textStyle}>
          Ce lien de signature n&apos;existe pas ou a été révoqué. Contactez {COMPANY} si besoin.
        </p>
      </CenteredCard>
    )
  }
  if (state === 'expired') {
    return (
      <CenteredCard>
        <div style={iconWrap('#FEF3C7', '#D97706')}><Clock size={28} /></div>
        <h1 style={titleStyle}>Lien expiré</h1>
        <p style={textStyle}>
          Ce lien a expiré. Demandez un nouveau lien à {COMPANY}.
        </p>
      </CenteredCard>
    )
  }
  if (state === 'used') {
    return (
      <CenteredCard>
        <div style={iconWrap('#D1FAE5', '#059669')}><CheckCircle2 size={28} /></div>
        <h1 style={titleStyle}>Document déjà signé</h1>
        <p style={textStyle}>
          Ce document a déjà été signé. Une copie vous a été envoyée par email.
        </p>
      </CenteredCard>
    )
  }

  // v2.8.5 — Page Merci instantanée après finalize. Avant : on restait sur le
  // viewer avec juste un bandeau vert → le user devait hard-refresh pour voir
  // l'état "déjà signé". Maintenant : transition immédiate vers une vraie page
  // de confirmation (style cohérent avec l'écran 'used'). Évite aussi les bugs
  // de modal qui se rouvrait sur le viewer en arrière-plan.
  if (completed) {
    return (
      <CenteredCard>
        <div style={iconWrap('#D1FAE5', '#059669')}><CheckCircle2 size={32} /></div>
        <h1 style={titleStyle}>Merci, c&apos;est terminé !</h1>
        <p style={textStyle}>
          Nous allons analyser et valider votre dossier. Une copie complète
          vous sera envoyée par email.
        </p>
        <p style={{ ...textStyle, marginTop: 16, fontSize: 12, color: '#9CA3AF' }}>
          Vous pouvez fermer cette fenêtre en toute sécurité.
        </p>
      </CenteredCard>
    )
  }

  // ── ÉTAT OK : layout principal ──────────────────────────────────────────────
  const envelope = data?.envelope
  const recipient = data?.recipient

  const fileUrl = activeDoc
    ? `/api/sign/document/${token}?path=${encodeURIComponent(activeDoc.storage_path)}`
    : ''

  // Sidebar contenu (réutilisé desktop + mobile drawer)
  const sidebarContent = (
    <>
      {/* v2.8.0 — Header logo L-Agence officiel (au lieu du badge jaune
          TalentFlow Sign abstrait). Le destinataire voit immédiatement de qui
          vient le document. Sous-titre discret "Signature électronique". */}
      <div style={{ padding: '22px 18px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
        <LogoLAgence height={32} />
        <div style={{ fontSize: 10.5, color: '#6B7280', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 5 }}>
          <FileSignature size={11} style={{ color: '#A16207' }} />
          Signature électronique · TalentFlow Sign
        </div>
      </div>

      {/* Récap expéditeur */}
      <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #E5E7EB' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 999,
          background: '#FEF3C7', border: '1px solid rgba(234,179,8,0.25)',
          color: '#A16207',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>
          {senderDisplayName.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280' }}>
            De
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: '#1C1A14',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {senderDisplayName}
          </div>
        </div>
      </div>

      {/* Recipient */}
      {recipient && (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 4 }}>
            Destinataire
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1A14' }}>
            {recipient.name}
          </div>
          <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2, wordBreak: 'break-word' }}>
            {recipient.email}
          </div>
        </div>
      )}

      {/* Message */}
      {envelope?.message && (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 4 }}>
            Message
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: '#1C1A14', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {envelope.message}
          </p>
        </div>
      )}

      {/* Documents list */}
      <div style={{ padding: '14px 0 8px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', padding: '0 18px 8px' }}>
          Documents ({documents.length})
        </div>
        {documents.map((d, i) => {
          const active = i === activeDocIdx
          const pageCount = docPagesCount[i]
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => {
                  setActiveDocIdx(i)
                  if (isMobile) setSidebarOpen(false)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 18px',
                  background: active ? '#FEF3C7' : 'transparent',
                  border: 'none',
                  borderLeft: `3px solid ${active ? '#EAB308' : 'transparent'}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}
              >
                <FileText size={14} style={{ color: active ? '#A16207' : '#6B7280', marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5,
                    fontWeight: active ? 700 : 500,
                    color: active ? '#1C1A14' : '#374151',
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}>
                    {d.name}
                  </div>
                  {pageCount && pageCount > 0 && (
                    <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>
                      {pageCount} page{pageCount > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                {active && <ChevronRight size={12} style={{ color: '#EAB308', marginTop: 4, flexShrink: 0 }} />}
              </button>
              {/* Pages list (only for active doc) */}
              {active && pageCount && pageCount > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 18px 8px 36px' }}>
                  {Array.from({ length: pageCount }, (_, p) => {
                    const pageNum = p + 1
                    const isCurrent = currentPage === pageNum
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setScrollToPage(pageNum)}
                        style={{
                          minWidth: 28, height: 24,
                          padding: '0 6px',
                          fontSize: 11, fontWeight: 600,
                          border: `1px solid ${isCurrent ? '#EAB308' : '#E5E7EB'}`,
                          background: isCurrent ? '#EAB308' : '#fff',
                          color: isCurrent ? '#1C1A14' : '#6B7280',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 18px', borderTop: '1px solid #E5E7EB', background: '#FAFAF7' }}>
        {recipient?.expires_at && (
          <div style={{ fontSize: 10.5, color: '#6B7280', marginBottom: 4 }}>
            Lien valable jusqu&apos;au {formatDate(recipient.expires_at)}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4 }}>
          <FileSignature size={10} />
          Sécurisé par TalentFlow Sign
        </div>
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
          Envoyé par {COMPANY}
        </div>
      </div>
    </>
  )

  // ─── Phase 4a — Handlers signature ───
  const handleSignatureAdopted = async (dataUrl: string, method: 'drawn' | 'typed') => {
    // eslint-disable-next-line no-console
    console.log(`[handleSignatureAdopted] adoption signature method=${method} size=${dataUrl.length}B`)
    // v2.9.57 — Ref SYNCHRONE en premier pour empêcher tryOpenSignaturePad
    // de ré-ouvrir le pad pendant le re-render React (race condition).
    signatureDataUrlRef.current = dataUrl
    setSignatureDataUrl(dataUrl)
    setSignatureMethod(method)
    setSignaturePadOpen(false)
    // Persiste tout de suite côté DB (bénéfice : si fermeture browser, signature sauvée)
    try {
      const r = await fetch('/api/sign/sign-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signatureDataUrl: dataUrl, method }),
      })
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erreur')
      toast.success('Signature adoptée — appliquée à tous les champs')
      // Enchaîne au champ suivant non-rempli (laisse le state se mettre à jour avant)
      setHasStarted(true)
      setTimeout(() => { goToNextField() }, 250)
    } catch (e: any) {
      toast.error(e.message || 'Erreur enregistrement signature')
    }
  }

  const handleFinalize = async () => {
    // v2.8.5 — Check étendu : state local OU rehydraté depuis verify-token.
    // Évite le bug "modal s'ouvre à nouveau" si state local desync (race
    // condition entre adoption + sign-field POST).
    const persistedSig = data?.recipient?.signature_data_url
    const hasSignature = signatureDataUrl || persistedSig
    if (!hasSignature) {
      // v2.9.56 — Passe par tryOpenSignaturePad (garde champs obligatoires).
      tryOpenSignaturePad()
      return
    }
    // Rehydrate state local si seule la version DB est connue
    if (!signatureDataUrl && persistedSig) {
      setSignatureDataUrl(persistedSig)
    }
    if (finalizing) return
    if (!confirm('Finaliser la signature ? Cette action est définitive.')) return
    setFinalizing(true)
    try {
      // v2.9.24 — Flush GARANTI des dernières valeurs (pièces jointes incluses)
      // AVANT de finaliser : le debounce 600ms peut ne pas avoir encore tiré.
      await flushFieldValues()
      const r = await fetch('/api/sign/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // v2.9.24 — fieldValues envoyé aussi dans le body : filet de sécurité
        // (le serveur fait un dernier merge avant de lire le token).
        body: JSON.stringify({ token, fieldValues: fieldValuesRef.current }),
      })
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erreur')
      setCompleted(true)
      // v2.2.4 — Clear backup localStorage après finalize (signature OK → données en DB sûrement)
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(`sign:${token}:fieldValues`)
          window.sessionStorage.removeItem(`sign:${token}:currentStepIdx`)
        }
      } catch { /* silent */ }
      toast.success(d.completed
        ? 'Document signé par tous les destinataires !'
        : 'Votre signature a été enregistrée'
      )
    } catch (e: any) {
      toast.error(e.message || 'Erreur finalisation')
    } finally {
      setFinalizing(false)
    }
  }

  // ─── ConsentModal bloquant tant que pas accepté (sauf si déjà signé/expiré) ───
  // Le viewer reste rendu en arrière-plan (UX cohérente DocuSign : on voit qu'il y a
  // bien un document, le modal demande juste l'acceptation des CGU avant de l'examiner).
  const showConsent = !hasConsented

  return (
    <div style={{
      display: 'flex',
      width: '100vw',
      height: '100vh',
      background: '#FAFAF7',
      overflow: 'hidden',
    }}>
      {/* ConsentModal — Phase 3 (bloquant pré-viewer) */}
      {showConsent && envelope && recipient && (
        <ConsentModal
          open
          token={token}
          senderName={senderDisplayName}
          recipientName={recipient.name}
          recipientEmail={recipient.email}
          envelopeTitle={envelope.title}
          isCC={envelope.document_category === 'autres' && false /* TODO Phase 4 : détecter rôle CC depuis token */}
          onAccepted={() => setHasConsented(true)}
        />
      )}

      {/* SignaturePad — Phase 4a (modal canvas tracé / typed) */}
      {recipient && (
        <SignaturePad
          open={signaturePadOpen}
          defaultName={recipient.name}
          onClose={() => setSignaturePadOpen(false)}
          onAdopt={handleSignatureAdopted}
        />
      )}

      {/* Sidebar desktop */}
      {!isMobile && (
        <aside style={{
          width: 280, flexShrink: 0,
          background: '#fff',
          borderRight: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column',
          height: '100vh', overflow: 'hidden',
        }}>
          {sidebarContent}
        </aside>
      )}

      {/* Sidebar mobile drawer */}
      {isMobile && sidebarOpen && (
        <>
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 40,
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
            }}
          />
          <aside style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
            width: 'min(85vw, 320px)',
            background: '#fff', borderRight: '1px solid #E5E7EB',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '4px 0 20px rgba(0,0,0,0.18)',
          }}>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'absolute', top: 8, right: 8, zIndex: 1,
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Fermer le menu"
            >
              <XIcon size={16} />
            </button>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Main viewer */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        {/* Top bar — v2.2.4 : header compact sur mobile pour éviter wrap des boutons.
            Padding latéral 8px et gap 6px (gain ~20px), padding-top safe-area pour éviter
            le chevauchement avec la barre Outlook/iOS. */}
        <header style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10,
          padding: isMobile ? '14px 8px 10px' : '12px 16px',
          paddingTop: isMobile ? 'max(14px, env(safe-area-inset-top, 14px))' : 12,
          background: '#fff',
          borderBottom: '1px solid #E5E7EB',
          minHeight: isMobile ? 60 : 56,
        }}>
          {isMobile && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
              aria-label="Ouvrir le menu"
            >
              <MenuIcon size={16} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* v2.2.4 — Sous-titre "Document à signer" caché sur mobile pour gagner
                de la place horizontale (le titre h1 a déjà le contexte). */}
            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: '#A16207', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <FileSignature size={11} />
                Document à signer
              </div>
            )}
            <h1 style={{
              margin: 0, marginTop: isMobile ? 0 : 2,
              fontSize: isMobile ? 14 : 17,
              fontWeight: 700,
              color: '#1C1A14',
              lineHeight: 1.2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {envelope?.title}
            </h1>
          </div>

          {/* Toggle Mode Wizard ↔ Document — v2.9.15 : caché sur mobile (wizard forcé) */}
          {!isMobile && hasConsented && !completed && data?.wizard?.enabled && (data?.wizard?.steps || []).filter(s => (s.recipientOrder ?? 1) === effectiveRecipientOrder).length > 0 && (
            <button
              type="button"
              onClick={() => setViewMode(m => m === 'wizard' ? 'document' : 'wizard')}
              title={viewMode === 'wizard' ? 'Voir le document complet' : 'Voir le mode wizard guidé'}
              style={{
                flexShrink: 0,
                padding: isMobile ? 0 : '7px 12px',
                width: isMobile ? 32 : undefined,
                height: isMobile ? 32 : undefined,
                fontSize: 11.5,
                fontWeight: 600,
                border: '1px solid #E5E7EB',
                borderRadius: isMobile ? 8 : 999,
                background: '#fff',
                color: '#6B7280',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
              }}
            >
              {viewMode === 'wizard' ? <FileText size={isMobile ? 14 : 11} /> : <ListChecks size={isMobile ? 14 : 11} />}
              {!isMobile && (viewMode === 'wizard' ? 'Document' : 'Wizard')}
            </button>
          )}

          {/* Bouton "Suivant" en haut — guide le candidat de champ en champ (mode document uniquement)
              Disparaît quand tous les champs sont remplis (Terminer prend le relais) */}
          {viewMode === 'document' && hasConsented && !completed && !isCC && nextFieldsQueue.length > 0 && (
            <button
              type="button"
              onClick={goToNextField}
              style={{
                flexShrink: 0,
                padding: isMobile ? '8px 12px' : '10px 16px',
                fontSize: isMobile ? 12.5 : 13,
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: '1px solid #1C1A14',
                borderRadius: 8,
                background: '#EAB308',
                color: '#1C1A14',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
                animation: hasStarted ? undefined : 'tf-sign-pulse-btn 1.6s ease-in-out infinite',
              }}
            >
              {!hasStarted ? 'Commencer' : 'Suivant'}
              <ArrowRight size={isMobile ? 13 : 14} strokeWidth={2.5} />
            </button>
          )}

          {/* CTA "Terminer" (Phase 4a-bis) — disabled tant que tous les champs requis ne sont pas remplis (mode document uniquement) */}
          {viewMode === 'document' && hasConsented && !completed && (
            <button
              type="button"
              onClick={handleFinalize}
              disabled={finalizing || !canFinalize}
              title={!canFinalize ? 'Remplissez tous les champs requis et signez avant de terminer' : 'Finaliser la signature'}
              style={{
                flexShrink: 0,
                padding: isMobile ? '8px 12px' : '10px 16px',
                fontSize: isMobile ? 12.5 : 13,
                fontWeight: 700,
                border: `1px solid ${canFinalize ? '#1C1A14' : '#D1D5DB'}`,
                borderRadius: 8,
                background: canFinalize ? '#f59e0b' : '#E5E7EB',
                color: canFinalize ? '#000' : '#9CA3AF',
                cursor: !canFinalize ? 'not-allowed' : (finalizing ? 'wait' : 'pointer'),
                opacity: finalizing ? 0.7 : 1,
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              {finalizing
                ? <Loader2 size={14} className="animate-spin" />
                : <CheckMark size={14} />
              }
              Terminer
            </button>
          )}
        </header>
        <style jsx global>{`
          @keyframes tf-sign-pulse-btn {
            0%, 100% { box-shadow: 0 0 0 0 rgba(234,179,8,0.5); }
            50%      { box-shadow: 0 0 0 6px rgba(234,179,8,0); }
          }
        `}</style>

        {/* État signature — bandeau dynamique (1 ligne, white-space nowrap mobile-safe) */}
        {viewMode === 'document' && hasConsented && (
          <div style={{
            flexShrink: 0,
            padding: '8px 12px',
            background: completed ? '#D1FAE5' : canFinalize ? '#DBEAFE' : '#FEF3C7',
            borderBottom: `1px solid ${completed ? 'rgba(16,185,129,0.3)' : canFinalize ? 'rgba(59,130,246,0.3)' : 'rgba(234,179,8,0.3)'}`,
            fontSize: isMobile ? 11.5 : 12,
            color: completed ? '#065F46' : canFinalize ? '#1E40AF' : '#713F12',
            textAlign: 'center',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            lineHeight: 1.3,
          }}>
            {completed ? (
              <>
                <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                <span>Document signé — copie envoyée par email</span>
              </>
            ) : canFinalize ? (
              <>
                <CheckMark size={12} style={{ flexShrink: 0 }} />
                <span>Tous les champs sont remplis — cliquez sur <strong>Terminer</strong></span>
              </>
            ) : !hasStarted ? (
              <>
                <BookOpen size={12} style={{ flexShrink: 0 }} />
                <span><strong>Lisez le document</strong>, puis cliquez sur <strong>Commencer</strong></span>
              </>
            ) : (
              <>
                <PenLine size={12} style={{ flexShrink: 0 }} />
                <span>Cliquez sur <strong>Suivant</strong> pour passer au prochain champ</span>
              </>
            )}
          </div>
        )}

        {/* v2.9.58 — Banner d'erreur en mode Document quand le bouton Terminer
            est grisé : liste les champs/groupes/signatures qui bloquent encore.
            Évite à l'utilisateur de chercher à l'aveugle. Limité à 5 entrées
            pour ne pas écraser la page. */}
        {viewMode === 'document' && !completed && !canFinalize && hasStarted && finalizeBlockers.length > 0 && (
          <div style={{
            margin: '0 16px 8px',
            padding: '10px 14px',
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.30)',
            borderRadius: 8,
            fontSize: 12,
            color: '#7F1D1D',
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} />
              {finalizeBlockers.length === 1
                ? '1 élément empêche de terminer :'
                : `${finalizeBlockers.length} éléments empêchent de terminer :`}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {finalizeBlockers.slice(0, 5).map((b, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  <strong>{b.label}</strong>
                  {b.detail ? ` — ${b.detail}` : ''}
                  {' '}<span style={{ color: '#9B1C1C', opacity: 0.8 }}>({b.doc}, page {b.page})</span>
                </li>
              ))}
              {finalizeBlockers.length > 5 && (
                <li style={{ fontStyle: 'italic', opacity: 0.8 }}>
                  … et {finalizeBlockers.length - 5} de plus
                </li>
              )}
            </ul>
          </div>
        )}

        {/* v2.2.0 Phase 4a-bis-2 — Mode WIZARD : remplace le PDF viewer
            v2.2.3 — Filtre les steps par recipientOrder du destinataire courant.
            Avant : le candidat voyait aussi les steps du client (ÉTAPE 1/6 alors qu'il devrait voir 1/4). */}
        {(() => {
          const wizardStepsForRecipient = (data?.wizard?.steps || [])
            .filter(s => (s.recipientOrder ?? 1) === effectiveRecipientOrder)
          return viewMode === 'wizard' && hasConsented && data?.wizard && wizardStepsForRecipient.length > 0
        })() ? (
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <SignWizard
              steps={(data?.wizard?.steps || []).filter(s => (s.recipientOrder ?? 1) === effectiveRecipientOrder)}
              documents={documents}
              fieldValues={fieldValues}
              onValueChange={handleFieldChange}
              signatureDataUrl={signatureDataUrl}
              onRequestSignature={tryOpenSignaturePad}
              autoFill={autoFill}
              recipientName={recipientName}
              envelopeTitle={envelope?.title || ''}
              completed={completed}
              finalizing={finalizing}
              onFinalize={handleFinalize}
              onSwitchToDocumentMode={isMobile ? undefined : () => setViewMode('document')}
              token={token}
              contextData={(envelope as unknown as { context_data?: { weekStartDate?: string | null } | null })?.context_data || null}
              previousFieldValues={data?.previousFieldValues}
              previousSignerNames={data?.previousSignerNames}
              previousSignerLabel={(() => {
                // Trouve le 1er signer précédent pour libellé "Rapport rempli par X"
                const prevRecipient = (data?.allRecipients || [])
                  .filter(r => r.order < recipientOrder && r.status === 'signed')
                  .sort((a, b) => b.order - a.order)[0]
                return prevRecipient?.name
              })()}
              allDocumentFields={activeDoc?.fields || []}
              hideRecap
              completedTitle="Merci, c'est terminé !"
              completedSubtitle={
                <>Nous allons analyser et valider votre dossier. Une copie complète vous sera envoyée par email à <strong>{autoFill.email || 'votre adresse'}</strong>.</>
              }
            />
          </div>
        ) : documents.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 40, color: '#6B7280',
          }}>
            <div style={{ textAlign: 'center' }}>
              <FileText size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1A14' }}>Aucun document</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>L&apos;expéditeur n&apos;a pas joint de PDF.</div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <PublicPdfViewer
              key={fileUrl}
              url={fileUrl}
              scrollToPage={scrollToPage}
              onLoad={(num) => {
                setDocPagesCount(prev => ({ ...prev, [activeDocIdx]: num }))
              }}
              onPageChange={(p) => setCurrentPage(p)}
              renderPageOverlay={!completed ? (pageNum, sizePx) => (
                <PublicFieldsLayer
                  page={pageNum}
                  sizePx={sizePx}
                  // v2.2.3 Pack 1 — Passe TOUS les fields du doc (pas juste current).
                  // PublicFieldsLayer rend les fields d'autres rôles en read-only.
                  fields={activeDoc?.fields || []}
                  values={fieldValues}
                  onValueChange={handleFieldChange}
                  signatureDataUrl={signatureDataUrl}
                  onRequestSignature={tryOpenSignaturePad}
                  recipientColor={recipientPalette}
                  autoFill={autoFill}
                  currentFieldId={currentFieldId}
                  registerFieldEl={registerFieldEl}
                  // v2.9.30 — effectiveRecipientOrder (ordre RÉCONCILIÉ template),
                  // PAS recipientOrder brut. Sinon le consultant (order brut 1)
                  // voyait les champs du candidat (template order 1) comme les
                  // siens, et son propre champ (order 2) restait masqué. Tous les
                  // autres calculs (canFinalize, nextFieldsQueue…) utilisaient déjà
                  // effectiveRecipientOrder — seul ce composant était resté en brut.
                  currentRecipientOrder={effectiveRecipientOrder}
                  previousSignerNames={data?.previousSignerNames}
                  token={token}
                />
              ) : undefined}
            />
          </div>
        )}

        {/* Footer compact CGU (style DocuSign) — visible quand consenté en mode document uniquement */}
        {viewMode === 'document' && hasConsented && (
          <footer style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: '#F8F7F2',
            borderTop: '1px solid #E5E7EB',
            fontSize: 11,
            color: '#6B7280',
            minHeight: 36,
            flexWrap: 'wrap',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#15803D', fontWeight: 600 }}>
              <CheckCircle2 size={11} />
              CGU acceptées
            </span>
            <span style={{ color: '#D1D5DB' }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <FileSignature size={11} />
              Document sécurisé par TalentFlow Sign
            </span>
            <span style={{ color: '#D1D5DB' }}>·</span>
            <span>Conforme ZertES (signature électronique simple suisse)</span>
          </footer>
        )}
      </main>
    </div>
  )
}

// ─────────── Helpers ───────────
function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: '#FAFAF7', gap: 24,
    }}>
      {/* v2.8.0 — Logo L-Agence officiel (texte noir, fond transparent) en haut.
          Même asset que tous les emails L-Agence pour cohérence visuelle. */}
      <LogoLAgence height={48} />
      <div style={{
        maxWidth: 460, width: '100%', padding: 32,
        background: '#fff', border: '1px solid #E5E7EB',
        borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12,
      }}>
        {children}
      </div>
    </div>
  )
}

const iconWrap = (bg: string, color: string): React.CSSProperties => ({
  width: 56, height: 56, borderRadius: 14,
  background: bg, color,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  marginBottom: 16,
})

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: 22, fontWeight: 400, color: '#1C1A14',
  letterSpacing: '-0.3px', lineHeight: 1.2, marginBottom: 8,
}

const textStyle: React.CSSProperties = {
  fontSize: 13.5, color: '#6B7280', lineHeight: 1.55, margin: 0,
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return iso || ''
  }
}
