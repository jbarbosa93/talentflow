// TalentFlow Sign — Wizard step-by-step (mode candidat mobile-first)
// v2.2.0 — Phase 4a-bis-2
//
// Présente les fields DocuSign sous forme de wizard guidé : 1 étape à la fois,
// barre de progression, validation par étape, étape récap finale.
// Le PDF reste la source de vérité (les coords/fields sont préservés). Au
// finalize : pdf-lib stamp les valeurs sur le PDF source (Phase 4b).
'use client'

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  ChevronLeft, ChevronRight, Check, CheckCircle2, PenLine,
  AlertCircle, Loader2, FileText, ListChecks, Paperclip, Info,
} from 'lucide-react'
import type { SignField, SignFieldType, SignDocument, SignAttachmentValue } from '@/lib/sign/types'
import type { WizardStep, WizardStepAttachment } from '@/lib/sign/wizard-builder'
import { fieldsByStep } from '@/lib/sign/wizard-builder'
import AttachmentField from './AttachmentField'
import FilePreviewModal from './FilePreviewModal'

const AttachmentViewerModal = dynamic(() => import('./AttachmentViewerModal'), { ssr: false })

// ─── Helpers contexte (v2.2.1) ───────────────────────────────────────
// Map "Lundi" → 0, "Mardi" → 1, etc. (insensible à la casse + accents légers)
const DAY_NAMES_FR: Record<string, number> = {
  'lundi': 0, 'mardi': 1, 'mercredi': 2, 'jeudi': 3,
  'vendredi': 4, 'samedi': 5, 'dimanche': 6,
}
const DAY_RE = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i

function normalizeDay(name: string): number | null {
  const m = name.toLowerCase().match(DAY_RE)
  if (!m) return null
  const idx = DAY_NAMES_FR[m[1].toLowerCase()]
  return idx ?? null
}

/** Enrichit un wizardSection si c'est un jour de la semaine et qu'on a une weekStartDate
 *  Ex: ("Lundi", "2026-05-04") → "Lundi 04.05.2026"
 *  Si pas de match jour ou pas de date, retourne tel quel. */
function enrichSection(section: string, weekStartDate?: string | null): string {
  if (!weekStartDate) return section
  const dayIdx = normalizeDay(section)
  if (dayIdx === null) return section
  try {
    const start = new Date(weekStartDate + 'T00:00:00')
    if (isNaN(start.getTime())) return section
    const target = new Date(start)
    target.setDate(start.getDate() + dayIdx)
    const dateStr = target.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
    // Conserve le casing original du nom de jour, ajoute la date
    return `${section} ${dateStr}`
  } catch {
    return section
  }
}
import {
  looksLikeDateField, looksLikeCountrySelect, looksLikeCompanyField, looksLikePhoneField, EUROPEAN_COUNTRIES,
  effectiveFieldState, effectiveCheckedState, computeFormulaValue, formatFormulaValue,
  getGroupDisplayLabel, getFieldErrorLabel,
} from '@/lib/sign/field-helpers'

interface AutoFill {
  firstName: string
  lastName: string
  fullName: string
  email: string
  today: string
  /** v2.2.2 — Nom de l'entreprise expéditrice (rempli auto pour fields type=company) */
  companyName?: string
  /** v2.2.2 — Fonction/poste du destinataire (typiquement candidat.metier_recherche) */
  title?: string
  /** v2.7.6 — Téléphone du candidat (utilisé par les fields number avec autoFillSource='phone') */
  telephone?: string
}

interface Props {
  steps: WizardStep[]
  documents: SignDocument[]
  fieldValues: Record<string, unknown>
  onValueChange: (fieldId: string, value: unknown) => void
  signatureDataUrl: string | null
  onRequestSignature: (force?: boolean) => void
  autoFill: AutoFill
  recipientName: string
  envelopeTitle: string
  completed: boolean
  finalizing: boolean
  onFinalize: () => void
  /** Callback : passer en mode "Document complet" (overlay PDF). */
  onSwitchToDocumentMode?: () => void
  /** Token pour construire les URLs des attachments via /api/sign/document/[token]. Si absent (mode preview admin) : URL Storage signée à la volée. */
  token?: string
  /** Mode preview : index d'étape à forcer (sync avec sélection éditeur). */
  forceStepIdx?: number
  /** v2.2.1 — Contexte enveloppe (ex: weekStartDate pour rapports heures). */
  contextData?: { weekStartDate?: string | null } | null
  /** v2.2.3 Pack 1 — Valeurs déjà remplies par les signers précédents (lecture seule). */
  previousFieldValues?: Record<string, unknown>
  /** v2.2.3 Pack 1 — Map fieldId → nom du signataire qui l'a rempli (tooltip/récap). */
  previousSignerNames?: Record<string, string>
  /** v2.2.3 Pack 1 — Nom du dernier signataire pour titre récap "Rapport rempli par X". */
  previousSignerLabel?: string
  /** v2.2.3 Pack 1 — Tous les fields du doc (incluant ceux des autres rôles). Pour récap. */
  allDocumentFields?: SignField[]
  /** v2.3.x Bug 2 — Si true, ne rend PAS l'étape RecapStep finale. La dernière étape
   *  affiche directement le bouton "Confirmer et envoyer →" qui appelle onFinalize.
   *  Utilisé par les Rapports : la confirmation se fait dans un dialog modal côté page. */
  hideRecap?: boolean
  /** v2.3.x Bug 2 — Label custom du bouton final (par défaut "Terminer la signature").
   *  Ex: "Confirmer et envoyer" pour les rapports. */
  finalizeButtonLabel?: string
  /** v2.5.0 — Titre custom de l'écran "completed" (par défaut "Document signé !").
   *  Permet au Rapports candidat d'afficher "Rapport envoyé !" car le doc n'est
   *  pas encore TOTALEMENT signé (en attente client). */
  completedTitle?: string
  /** v2.5.0 — Sous-titre custom de l'écran "completed" (par défaut "Une copie
   *  signée vous a été envoyée par email…"). Permet au Rapports candidat de
   *  remplacer par "Une copie a été envoyée à l'entreprise pour validation". */
  completedSubtitle?: React.ReactNode
}

export default function SignWizard({
  steps, documents, fieldValues, onValueChange, signatureDataUrl,
  onRequestSignature, autoFill, recipientName, envelopeTitle,
  completed, finalizing, onFinalize, onSwitchToDocumentMode, token, forceStepIdx,
  contextData, previousFieldValues, previousSignerNames, previousSignerLabel,
  allDocumentFields, hideRecap, finalizeButtonLabel,
  completedTitle, completedSubtitle,
}: Props) {
  // v2.2.3 Pack 1 — Détecte s'il y a des valeurs précédentes à montrer en récap
  const hasPreviousValues = !!previousFieldValues && Object.keys(previousFieldValues).length > 0
  const showPrevRecap = hasPreviousValues && (allDocumentFields || []).length > 0
  const [openAttachment, setOpenAttachment] = useState<{ url: string; filename: string; label: string } | null>(null)
  // v2.2.4 — Lecture initiale depuis sessionStorage : si le candidat avait été à
  // l'étape 3 et a toggle vers Mode Document puis revient → reprend à l'étape 3
  // (au lieu de revenir au début à chaque remount du wizard).
  const initialIdx = (() => {
    if (forceStepIdx !== undefined) return forceStepIdx
    if (typeof window === 'undefined' || !token) return 0
    try {
      const raw = window.sessionStorage.getItem(`sign:${token}:currentStepIdx`)
      if (raw) {
        const n = Number(raw)
        if (Number.isFinite(n) && n >= 0 && n <= steps.length) return n
      }
    } catch { /* silent */ }
    return 0
  })()
  // L'index courant : 0..steps.length-1 = step normale ; steps.length = step récap
  const [currentIdx, setCurrentIdx] = useState(initialIdx)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Mode preview admin : sync avec l'étape sélectionnée dans l'éditeur
  useEffect(() => {
    if (forceStepIdx !== undefined && forceStepIdx >= 0 && forceStepIdx < steps.length) {
      setCurrentIdx(forceStepIdx)
    }
  }, [forceStepIdx, steps.length])

  // v2.2.4 — Persiste l'index courant dans sessionStorage à chaque changement.
  // Permet de revenir au même step après toggle Wizard ↔ Document.
  // Pas de persist en mode preview admin (forceStepIdx contrôlé par l'éditeur).
  useEffect(() => {
    if (forceStepIdx !== undefined) return
    if (typeof window === 'undefined' || !token) return
    try {
      window.sessionStorage.setItem(`sign:${token}:currentStepIdx`, String(currentIdx))
    } catch { /* silent */ }
  }, [currentIdx, forceStepIdx, token])

  // Map fieldId → field (résolution rapide)
  const fieldsByStepMap = useMemo(() => fieldsByStep(steps, documents), [steps, documents])

  // v2.7.6 — Wrapper sur onValueChange qui applique les règles de groupe checkbox :
  // - SelectExactly N=1 ou SelectAtMost N=1 → comportement radio (uncheck siblings on check)
  // - SelectAtMost N>1 ou SelectExactly N>1 → refuse de cocher si déjà N cases cochées
  // - SelectAtLeast → aucune restriction UI (validation au submit seulement)
  const handleValueChange = useMemo(() => {
    return (fieldId: string, value: unknown) => {
      // Résoud le field dans documents
      let target: SignField | null = null
      for (const d of documents) {
        const found = (d.fields || []).find(f => f.id === fieldId)
        if (found) { target = found; break }
      }
      if (!target || target.type !== 'checkbox' || !target.groupId || value !== true) {
        onValueChange(fieldId, value)
        return
      }
      const rule = target.groupRule
      const groupId = target.groupId
      const max = rule === 'SelectExactly' ? (target.groupMin ?? target.groupMax ?? 1)
        : rule === 'SelectAtMost' ? (target.groupMax ?? 1)
        : null
      // Collecte les siblings du groupe
      const siblings: SignField[] = []
      for (const d of documents) {
        for (const f of (d.fields || [])) {
          if (f.groupId === groupId && f.id !== fieldId) siblings.push(f)
        }
      }
      if (max === 1) {
        // Comportement radio : décocher tous les autres puis cocher celui-ci
        for (const s of siblings) {
          const curr = fieldValues[s.id]
          if (curr === true || curr === 'true') onValueChange(s.id, false)
        }
        onValueChange(fieldId, true)
        return
      }
      if (max !== null && max > 1) {
        // Compte les siblings déjà cochés
        let checkedCount = 0
        for (const s of siblings) {
          const curr = fieldValues[s.id]
          if (curr === true || curr === 'true') checkedCount++
        }
        if (checkedCount + 1 > max) {
          // Bloque le check (déjà au max)
          return
        }
      }
      onValueChange(fieldId, value)
    }
  }, [documents, fieldValues, onValueChange])

  // v2.3.x Bug 2 — Si hideRecap, pas de step récap finale (totalSteps = steps.length).
  // La dernière vraie étape affiche directement le CTA finalize.
  const totalSteps = hideRecap ? steps.length : steps.length + 1
  const isRecapStep = !hideRecap && currentIdx >= steps.length
  const isLastStep = currentIdx === steps.length - 1
  const currentStep: WizardStep | null = isRecapStep ? null : steps[currentIdx]
  const stepFields = currentStep ? (fieldsByStepMap.get(currentStep.id) || []) : []

  // v2.9.18 — Nom du PDF de l'étape courante : on cherche le document qui
  // contient les fields de l'étape. Affiché dans le header pour que le
  // candidat sache quel document il est en train de remplir.
  const currentDocName = useMemo(() => {
    if (!currentStep || stepFields.length === 0) return ''
    const stepFieldIds = new Set(stepFields.map(f => f.id))
    for (const doc of documents) {
      if ((doc.fields || []).some(f => stepFieldIds.has(f.id))) {
        return (doc.name || '').replace(/\.pdf$/i, '').trim()
      }
    }
    return ''
  }, [currentStep, stepFields, documents])

  // Reset erreur quand on change d'étape
  useEffect(() => { setValidationError(null) }, [currentIdx])

  // Validation : vérifier les champs requis de l'étape courante
  const validateCurrentStep = (): boolean => {
    if (!currentStep) return true
    // v2.9.45 — Étape d'introduction : aucun champ à remplir, on passe toujours.
    if (currentStep.isIntroStep) return true
    if (currentStep.isSignatureStep) {
      if (!signatureDataUrl) {
        setValidationError('Veuillez signer pour continuer')
        return false
      }
      return true
    }
    for (const f of stepFields) {
      const eff = effectiveFieldState(f, fieldValues)
      if (!eff.visible) continue            // caché par condition
      if (!eff.required) continue           // pas requis (ou allégé par condition)
      // v2.8.10 — Les checkboxes appartenant à un groupe avec règle (SelectExactly/AtLeast/AtMost)
      // sont validées via la règle du groupe, PAS individuellement. Sinon "Oui ET Non doivent
      // être cochés" → impossible. La règle du groupe est la source de vérité.
      if (f.type === 'checkbox' && f.groupId && f.groupRule) continue
      if (isFieldFilled(f, fieldValues[f.id], signatureDataUrl, autoFill, fieldValues)) continue
      // v2.9.67 — Message lisible avec section + tooltip (« Méthodes de paiement — N. Portable : à remplir »)
      setValidationError(`« ${getFieldErrorLabel(f)} » : à remplir pour continuer`)
      return false
    }
    // v2.8.10 — Validation des règles de groupe (checkboxes) : on vérifie que chaque
    // groupe présent dans l'étape respecte sa règle (SelectExactly/AtLeast/AtMost).
    // Sans ça, un groupe « Exactement 1 » non rempli laissait passer Suivant.
    const groupsToCheck = new Map<string, { rule?: string; min?: number; max?: number; name?: string; members: typeof stepFields }>()
    for (const f of stepFields) {
      if (f.type !== 'checkbox' || !f.groupId) continue
      const eff = effectiveFieldState(f, fieldValues)
      if (!eff.visible) continue
      const g = groupsToCheck.get(f.groupId)
      if (g) g.members.push(f)
      else groupsToCheck.set(f.groupId, { rule: f.groupRule, min: f.groupMin, max: f.groupMax, name: f.groupName, members: [f] })
    }
    for (const g of groupsToCheck.values()) {
      if (!g.rule) continue
      const checkedCount = g.members.filter(m => fieldValues[m.id] === true).length
      // v2.9.67 — Label intelligent : groupName si parlant, sinon wizardSection 1er membre, sinon tooltips joints
      const label = getGroupDisplayLabel(g.name, g.members as SignField[])
      if (g.rule === 'SelectExactly' && checkedCount !== (g.min ?? 1)) {
        const want = g.min ?? 1
        setValidationError(`« ${label} » : choisis ${want === 1 ? 'une option' : `${want} options`} pour continuer`)
        return false
      }
      if (g.rule === 'SelectAtLeast' && checkedCount < (g.min ?? 1)) {
        const want = g.min ?? 1
        setValidationError(`« ${label} » : choisis au moins ${want === 1 ? 'une option' : `${want} options`} pour continuer`)
        return false
      }
      if (g.rule === 'SelectAtMost' && checkedCount > (g.max ?? 1)) {
        const want = g.max ?? 1
        setValidationError(`« ${label} » : choisis au plus ${want === 1 ? 'une option' : `${want} options`}`)
        return false
      }
    }
    return true
  }

  const handleNext = () => {
    if (!validateCurrentStep()) return
    // v2.3.x Bug 2 — En mode hideRecap, sur la dernière étape, "Suivant" déclenche
    // directement la finalisation au lieu d'avancer vers une RecapStep inexistante.
    if (hideRecap && isLastStep) {
      onFinalize()
      return
    }
    setCurrentIdx(i => Math.min(i + 1, totalSteps - 1))
  }
  const handlePrev = () => {
    setCurrentIdx(i => Math.max(0, i - 1))
  }

  const handleSubmit = () => {
    onFinalize()
  }

  // Progress %
  const progressPct = Math.round(((currentIdx + 1) / totalSteps) * 100)

  // Done step (après finalize)
  if (completed) {
    return (
      <div style={containerStyle}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 999,
            background: '#D1FAE5', color: '#059669',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
          }}>
            <CheckCircle2 size={38} />
          </div>
          <h2 style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 26, fontWeight: 400, color: '#1C1A14',
            margin: 0, marginBottom: 12,
          }}>
            {completedTitle || 'Document signé !'}
          </h2>
          <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 380, lineHeight: 1.55, margin: 0 }}>
            {completedSubtitle || (
              <>
                Une copie signée vous a été envoyée par email à <strong>{autoFill.email || 'votre adresse'}</strong>.
                Vous pouvez fermer cette fenêtre.
              </>
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* Header — progress + bascule mode document */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#A16207', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <ListChecks size={12} />
            Étape {Math.min(currentIdx + 1, totalSteps)} / {totalSteps}
          </div>
          {/* v2.9.18 — Nom du document courant (à droite, discret) */}
          {currentDocName && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, color: '#6B7280',
              maxWidth: '55%', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <FileText size={11} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentDocName}</span>
            </div>
          )}
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: '#F3F4F6', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: '#EAB308',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </header>

      {/* Body — contenu de l'étape */}
      <main style={bodyStyle}>
        {/* v2.2.3 Pack 1 — Bandeau "Rapport rempli par X" visible sur la 1ère étape.
            Le destinataire courant peut cliquer "Voir le document" pour consulter
            les valeurs déjà remplies par les signers précédents (en lecture seule). */}
        {showPrevRecap && currentIdx === 0 && !isRecapStep && (
          <div style={{
            margin: '0 0 16px',
            padding: '12px 14px',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.35)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <div style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.4, color: '#1C1A14' }}>
              <strong>{previousSignerLabel || 'Le destinataire précédent'}</strong>
              {' '}a déjà rempli le rapport.
              <br />
              <span style={{ fontSize: 12, color: '#374151' }}>
                Vérifie les valeurs ci-dessous avant de signer ta partie.
              </span>
            </div>
            {onSwitchToDocumentMode && (
              <button
                type="button"
                onClick={onSwitchToDocumentMode}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  background: '#15803D',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap',
                }}
              >
                <FileText size={12} />
                Voir le rapport
              </button>
            )}
          </div>
        )}
        {isRecapStep ? (
          <RecapStep
            steps={steps}
            fieldsByStepMap={fieldsByStepMap}
            fieldValues={fieldValues}
            signatureDataUrl={signatureDataUrl}
            autoFill={autoFill}
            envelopeTitle={envelopeTitle}
            recipientName={recipientName}
            onJumpToStep={setCurrentIdx}
          />
        ) : currentStep ? (
          <StepContent
            step={currentStep}
            fields={stepFields}
            values={fieldValues}
            onChange={handleValueChange}
            signatureDataUrl={signatureDataUrl}
            onRequestSignature={onRequestSignature}
            autoFill={autoFill}
            documents={documents}
            token={token}
            onOpenAttachment={setOpenAttachment}
            weekStartDate={contextData?.weekStartDate || null}
          />
        ) : null}

        {validationError && (
          <div style={{
            margin: '16px 0 0',
            padding: '10px 14px',
            background: '#FEE2E2',
            border: '1px solid #FCA5A5',
            borderRadius: 8,
            color: '#991B1B',
            fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={14} />
            {validationError}
          </div>
        )}
      </main>

      {/* Footer — boutons navigation */}
      <footer style={footerStyle}>
        {currentIdx > 0 ? (
          <button
            type="button"
            onClick={handlePrev}
            style={btnSecondary}
          >
            <ChevronLeft size={16} />
            Précédent
          </button>
        ) : (
          <span style={{ flex: '0 0 auto' }} />
        )}
        {isRecapStep ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={finalizing || !signatureDataUrl}
            style={{
              ...btnPrimary,
              opacity: finalizing ? 0.7 : 1,
              cursor: finalizing ? 'wait' : (!signatureDataUrl ? 'not-allowed' : 'pointer'),
              background: !signatureDataUrl ? '#E5E7EB' : '#EAB308',
              color: !signatureDataUrl ? '#9CA3AF' : '#1C1A14',
              borderColor: !signatureDataUrl ? '#D1D5DB' : '#1C1A14',
            }}
            title={!signatureDataUrl ? 'Signez d\'abord à l\'étape précédente' : 'Finaliser la signature'}
          >
            {finalizing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Confirmer et envoyer
          </button>
        ) : (
          <button type="button" onClick={handleNext} style={btnPrimary}>
            {/* v2.3.x Bug 2 — Label adapté en mode hideRecap sur la dernière étape */}
            {hideRecap && isLastStep
              ? (finalizing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />)
              : null}
            {hideRecap && isLastStep
              ? (finalizeButtonLabel || 'Confirmer et envoyer')
              : (currentStep?.isSignatureStep ? 'Vérifier' : 'Suivant')}
            {!(hideRecap && isLastStep) && <ChevronRight size={16} />}
          </button>
        )}
      </footer>

      {/* Modal viewer document attaché */}
      {openAttachment && (
        <AttachmentViewerModal
          open
          url={openAttachment.url}
          filename={openAttachment.filename}
          label={openAttachment.label}
          onClose={() => setOpenAttachment(null)}
        />
      )}
    </div>
  )
}

// ─── Step content — rendu d'1 étape ───────────────────────────────
interface StepContentProps {
  step: WizardStep
  fields: SignField[]
  values: Record<string, unknown>
  onChange: (fieldId: string, value: unknown) => void
  signatureDataUrl: string | null
  onRequestSignature: (force?: boolean) => void
  autoFill: AutoFill
  documents: SignDocument[]
  token?: string
  onOpenAttachment: (a: { url: string; filename: string; label: string }) => void
  weekStartDate?: string | null
}

function StepContent({
  step, fields, values, onChange, signatureDataUrl, onRequestSignature, autoFill,
  documents, token, onOpenAttachment, weekStartDate,
}: StepContentProps) {
  // Filtre les fields cachés par les conditions (action='hide' satisfaite)
  // v2.9.28 — Exclut aussi les champs marqués « Masquer dans le wizard »
  // (présents en Mode Document + PDF, mais remplis automatiquement).
  const visibleFields = fields.filter(f => !f.wizardHidden && effectiveFieldState(f, values).visible)
  const attachments = step.attachments || []
  // v2.9.45 — Étape d'INTRODUCTION : écran de contenu (logo + titre + texte + image),
  // pas de champ à remplir. Le signataire lit, clique « Continuer ».
  if (step.isIntroStep) {
    const c = step.introContent || {}
    const bodyParas = (c.body || '').split(/\n+/).map(s => s.trim()).filter(Boolean)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 4px 0' }}>
        {c.showLogo && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="https://www.talent-flow.ch/logo-agence-officiel-noir.png"
            alt="L-Agence"
            style={{ height: 44, width: 'auto', marginBottom: 18, maxWidth: '100%' }}
          />
        )}
        {c.title && (
          <h2 style={{
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 30, fontWeight: 400, color: '#1C1A14',
            lineHeight: 1.15, letterSpacing: '-0.01em',
            margin: '0 0 6px', maxWidth: 540,
          }}>
            {c.title}
          </h2>
        )}
        {c.subtitle && (
          <div style={{ fontSize: 15, color: '#6B7280', fontWeight: 500, marginBottom: 18, maxWidth: 540, lineHeight: 1.4 }}>
            {c.subtitle}
          </div>
        )}
        {c.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={c.imageUrl}
            alt=""
            style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 12, marginBottom: 20, display: 'block' }}
          />
        )}
        {bodyParas.length > 0 && (
          <div style={{ maxWidth: 560, fontSize: 14, color: '#374151', lineHeight: 1.65, textAlign: 'left' }}>
            {bodyParas.map((p, i) => (
              <p key={i} style={{ margin: '0 0 12px' }}>{p}</p>
            ))}
          </div>
        )}
      </div>
    )
  }
  // Étape signature spéciale
  if (step.isSignatureStep) {
    return (
      <div>
        <h2 style={stepTitleStyle}>{prettifySpaces(step.title)}</h2>
{/* v2.4.0 — Note d'étape désactivée. Utiliser l'annotation par champ (helpText) à la place. */}
        <div style={{
          marginTop: 20,
          padding: 24,
          background: signatureDataUrl ? '#F0FDF4' : '#FEF3C7',
          border: `2px dashed ${signatureDataUrl ? '#15803D' : '#EAB308'}`,
          borderRadius: 12,
          textAlign: 'center',
        }}>
          {signatureDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureDataUrl}
                alt="Votre signature"
                style={{ maxWidth: 280, maxHeight: 100, margin: '0 auto 14px', display: 'block' }}
              />
              <div style={{ fontSize: 13, color: '#15803D', fontWeight: 600, marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} />
                Signature adoptée
              </div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                Date : {autoFill.today}
              </div>
              <button
                type="button"
                onClick={() => onRequestSignature(true)}
                style={{
                  marginTop: 14,
                  background: 'transparent',
                  border: '1px solid #15803D',
                  color: '#15803D',
                  padding: '6px 14px',
                  fontSize: 12,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                Modifier ma signature
              </button>
            </>
          ) : (
            <>
              <PenLine size={32} style={{ color: '#A16207', marginBottom: 10 }} />
              <div style={{ fontSize: 14, color: '#1C1A14', fontWeight: 600, marginBottom: 6 }}>
                Adoptez votre signature
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 14 }}>
                Tracez ou tapez — elle sera appliquée à tous les documents
              </div>
              <button
                type="button"
                onClick={() => onRequestSignature()}
                style={{
                  background: '#1C1A14',
                  color: '#EAB308',
                  border: 'none',
                  padding: '10px 20px',
                  fontSize: 14,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <PenLine size={14} />
                Signer maintenant
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={stepTitleStyle}>{prettifySpaces(step.title)}</h2>
{/* v2.4.0 — Note d'étape désactivée. Utiliser l'annotation par champ (helpText) à la place. */}
      {attachments.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attachments.map(a => (
            <AttachmentButton
              key={a.id}
              attachment={a}
              documents={documents}
              token={token}
              onOpen={onOpenAttachment}
            />
          ))}
        </div>
      )}
      <GroupedFields
        fields={visibleFields}
        displayMode={step.displayMode || 'list'}
        values={values}
        onChange={onChange}
        autoFill={autoFill}
        weekStartDate={weekStartDate}
        signatureDataUrl={signatureDataUrl}
        onRequestSignature={onRequestSignature}
        token={token}
      />
    </div>
  )
}

// ─── GroupedFields — rendu list (sub-titres) ou cards (1 carte / section) ───
function GroupedFields({
  fields, displayMode, values, onChange, autoFill, weekStartDate,
  signatureDataUrl, onRequestSignature, token,
}: {
  fields: SignField[]
  displayMode: 'list' | 'cards'
  values: Record<string, unknown>
  onChange: (fieldId: string, value: unknown) => void
  autoFill: AutoFill
  weekStartDate?: string | null
  signatureDataUrl: string | null
  onRequestSignature: (force?: boolean) => void
  token?: string
}) {
  if (fields.length === 0) {
    return (
      <div style={{ marginTop: 20, fontSize: 13, color: '#6B7280', fontStyle: 'italic', padding: '12px 0' }}>
        Aucun champ à remplir dans cette étape selon vos réponses précédentes.
      </div>
    )
  }

  // Grouping par wizardSection — préserve l'ordre des fields (1er field d'une section
  // détermine la position du group)
  const groups: { name: string | null; fields: SignField[] }[] = []
  for (const f of fields) {
    const sec = (f.wizardSection || '').trim() || null
    const last = groups[groups.length - 1]
    if (last && last.name === sec) last.fields.push(f)
    else groups.push({ name: sec, fields: [f] })
  }

  // Si AUCUN field n'a de wizardSection → fallback rendu plat (pas de groupes du tout)
  const hasAnySection = groups.some(g => g.name !== null)
  if (!hasAnySection) {
    return (
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {fields.map(f => (
          <FieldRow key={f.id} field={f} value={values[f.id]} onChange={v => onChange(f.id, v)} autoFill={autoFill} allValues={values} signatureDataUrl={signatureDataUrl} onRequestSignature={onRequestSignature} token={token} />
        ))}
      </div>
    )
  }

  // ─── Mode CARDS : 1 carte par section avec grid 2 cols pour les fields ───
  if (displayMode === 'cards') {
    return (
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map((g, gi) => {
          // v2.7.6 — Description de section : lue depuis le premier field qui en porte une
          const sectionDesc = g.fields.find(f => f.sectionDescription)?.sectionDescription?.trim()
          return g.name ? (
            <div key={gi} style={{
              padding: '14px 16px',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              background: '#FFFCF6',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}>
              <div style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 16,
                fontWeight: 700,
                color: '#1C1A14',
                marginBottom: sectionDesc ? 4 : 12,
                letterSpacing: '-0.2px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 999,
                  background: '#EAB308', flexShrink: 0,
                }} />
                {enrichSection(g.name, weekStartDate)}
              </div>
              {sectionDesc && (
                <div style={{
                  fontSize: 12.5,
                  color: '#6B7280',
                  fontStyle: 'italic',
                  marginBottom: 12,
                  lineHeight: 1.45,
                  paddingLeft: 14,
                }}>
                  {sectionDesc}
                </div>
              )}
              {/* v2.7.6 — Layout adapté au contenu :
                  - Si tous les fields sont des checkboxes (ex: Oui/Non d'un groupe radio) → grid 2 colonnes
                  - Sinon (mix de select, date, text…) → liste verticale (1 par ligne, plus lisible) */}
              <div style={{
                display: g.fields.every(f => f.type === 'checkbox') ? 'grid' : 'flex',
                flexDirection: 'column',
                gridTemplateColumns: g.fields.every(f => f.type === 'checkbox') ? 'repeat(2, 1fr)' : undefined,
                gap: 12,
              }}>
                {g.fields.map(f => (
                  <FieldRow key={f.id} field={f} value={values[f.id]} onChange={v => onChange(f.id, v)} autoFill={autoFill} allValues={values} signatureDataUrl={signatureDataUrl} onRequestSignature={onRequestSignature} token={token} hideLabelIfEmpty />
                ))}
              </div>
            </div>
          ) : (
            // Fields hors-section : empilage vertical normal
            <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {g.fields.map(f => (
                <FieldRow key={f.id} field={f} value={values[f.id]} onChange={v => onChange(f.id, v)} autoFill={autoFill} allValues={values} signatureDataUrl={signatureDataUrl} onRequestSignature={onRequestSignature} token={token} />
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Mode LIST (défaut) : sous-titres séparant les groupes, fields verticaux ───
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map((g, gi) => {
        // v2.7.6 — Description de section : lue depuis le premier field qui en porte une
        const sectionDesc = g.fields.find(f => f.sectionDescription)?.sectionDescription?.trim()
        return (
          <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {g.name && (
              <div style={{ marginTop: gi > 0 ? 8 : 0, borderBottom: '1px solid #E5E7EB', paddingBottom: 6 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                  color: '#A16207',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 999,
                    background: '#EAB308', flexShrink: 0,
                  }} />
                  {enrichSection(g.name, weekStartDate)}
                </div>
                {sectionDesc && (
                  <div style={{
                    fontSize: 12,
                    color: '#6B7280',
                    fontStyle: 'italic',
                    marginTop: 4,
                    lineHeight: 1.45,
                    paddingLeft: 14,
                  }}>
                    {sectionDesc}
                  </div>
                )}
              </div>
            )}
            {g.fields.map(f => (
              <FieldRow key={f.id} field={f} value={values[f.id]} onChange={v => onChange(f.id, v)} autoFill={autoFill} allValues={values} signatureDataUrl={signatureDataUrl} onRequestSignature={onRequestSignature} token={token} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ─── AttachmentButton — bouton pour ouvrir un document attaché ──────────
function AttachmentButton({
  attachment, documents, token, onOpen,
}: {
  attachment: WizardStepAttachment
  documents: SignDocument[]
  token?: string
  onOpen: (a: { url: string; filename: string; label: string }) => void
}) {
  const handleClick = () => {
    let url = ''
    let filename = attachment.label || 'document.pdf'
    if (attachment.externalUrl) {
      url = attachment.externalUrl
    } else if (attachment.docOrder !== undefined) {
      const doc = documents.find(d => (d.order ?? 0) === attachment.docOrder)
        || documents[(attachment.docOrder || 1) - 1]
      if (doc?.storage_path) {
        // Côté candidat (token présent) : passe par le proxy auth
        // Côté preview admin : URL Storage publique signée par le serveur d'upload
        url = token
          ? `/api/sign/document/${token}?path=${encodeURIComponent(doc.storage_path)}`
          : `/api/sign/template-doc?path=${encodeURIComponent(doc.storage_path)}`
        filename = doc.name || filename
      }
    }
    if (!url) return
    onOpen({ url, filename, label: attachment.label || filename })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: '#FEF3C7',
        border: '1px solid #FDE68A',
        borderRadius: 10,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        width: '100%',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#FDE68A'}
      onMouseLeave={e => e.currentTarget.style.background = '#FEF3C7'}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: '#fff', border: '1px solid rgba(234,179,8,0.3)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#A16207', flexShrink: 0,
      }}>
        <Paperclip size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1C1A14', lineHeight: 1.3 }}>
          {attachment.label}
        </div>
        {attachment.description && (
          <div style={{ fontSize: 11.5, color: '#713F12', marginTop: 2, lineHeight: 1.4 }}>
            {attachment.description}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: '#A16207', marginTop: 4, fontWeight: 600, letterSpacing: '0.04em' }}>
          📄 Voir / télécharger / imprimer →
        </div>
      </div>
    </button>
  )
}

// ─── FieldRow — 1 champ avec label + input adapté ────────────────
interface FieldRowProps {
  field: SignField
  value: unknown
  onChange: (v: unknown) => void
  autoFill: AutoFill
  allValues?: Record<string, unknown>
  /** v2.7.6 — Si true et que le field n'a aucun label/tooltip explicite,
   *  on n'affiche pas l'étiquette (évite le doublon avec le titre de la carte). */
  hideLabelIfEmpty?: boolean
  /** v2.9.22 — Pour rendre un champ signature/paraphe placé dans une étape normale. */
  signatureDataUrl?: string | null
  onRequestSignature?: () => void
  /** v2.9.23 — Token de signature, requis pour les champs pièce jointe (upload). */
  token?: string
}

function FieldRow({ field, value, onChange, autoFill, allValues, hideLabelIfEmpty, signatureDataUrl, onRequestSignature, token }: FieldRowProps) {
  const t = field.type as SignFieldType
  // v2.7.6 — Si on est dans une carte ET aucun libellé explicite (tooltip ET label vides
  // ou label = UUID DocuSign), on masque l'étiquette du field (la carte porte déjà le titre).
  const hasExplicitLabel = !!(field.tooltip && field.tooltip.trim())
    || !!(field.label && field.label.trim() && !UUID_LABEL_RE.test(field.label))
  const renderLabel = !hideLabelIfEmpty || hasExplicitLabel
  const label = renderLabel ? humanLabel(field) : ''
  // v2.2.4 — looksLikeCompanyField : type=title/text avec tooltip "société/entreprise" → traité comme company auto-fill
  const isCompanyHeuristic = looksLikeCompanyField(field) && t !== 'company'
  const isAutoFill = ['firstname', 'lastname', 'fullname', 'email', 'company', 'title'].includes(t) || isCompanyHeuristic
  const eff = allValues ? effectiveFieldState(field, allValues) : { visible: true, required: !!field.required }
  // v2.7.6 — Force l'affichage de l'étoile dès que `field.required` est true au niveau source,
  // pour éviter qu'une condition d'unrequire (parfois résiduelle des imports DocuSign)
  // masque le `*` alors que l'admin a explicitement coché "Champ obligatoire".
  const isRequired = !!field.required || eff.required

  // v2.9.28 — Lien hypertexte cliquable (ouvre un nouvel onglet). Sur une
  // checkbox, le clic coche aussi la case (preuve de consultation, ex: quiz).
  const linkEl = (field.linkUrl || '').trim() ? (
    <a
      href={field.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => { if (t === 'checkbox') onChange(true) }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        marginTop: 6, fontSize: 13, fontWeight: 700,
        color: '#1D4ED8', textDecoration: 'underline', cursor: 'pointer',
      }}
    >
      🔗 {field.linkLabel || 'Ouvrir le lien'}
    </a>
  ) : null

  // v2.9.18 — Heuristique "text ressemble à une date" SUPPRIMÉE. Avant : un champ
  // type=text dont le label contenait "date" (ex: "lieu et date de début") était
  // rendu en date picker → faux positif. Maintenant le type choisi est respecté :
  // si l'admin veut une date, il met le type `date`, sinon c'est du texte libre.
  const renderAsDate = false
  // Auto-detect : select Nationalité/Pays avec liste pauvre → liste Europe complète
  const enrichedSelectItems = t === 'select' && looksLikeCountrySelect(field)
    ? EUROPEAN_COUNTRIES
    : null

  // Si c'est un auto-fill : pré-rempli depuis le profil destinataire.
  // v2.7.6 — Par défaut MODIFIABLE (le candidat peut corriger si la valeur est fausse).
  // Seul `autoFillLocked === true` rend le champ verrouillé en lecture seule.
  if (isAutoFill) {
    const val = getAutoFillValue(isCompanyHeuristic ? 'company' : t, autoFill, value)
    if (field.autoFillLocked) {
      return (
        <div>
          {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
          <HelpText text={field.helpText} />
          <div style={{
            ...inputStyle,
            background: '#F0FDF4',
            borderColor: '#86EFAC',
            color: '#1C1A14',
            fontWeight: 500,
          }}>
            {val || <span style={{ color: '#9CA3AF' }}>—</span>}
            <Check size={14} style={{ color: '#15803D', marginLeft: 'auto' }} />
          </div>
        </div>
      )
    }
    // Editable : on pré-remplit l'input avec la valeur auto-fill, mais le candidat peut écraser.
    const inputValue = typeof value === 'string' && value.length > 0 ? value : val
    return (
      <div>
        {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
        <input
          type={t === 'email' ? 'email' : 'text'}
          value={inputValue}
          onChange={e => onChange(e.target.value)}
          placeholder={val}
          style={inputStyle}
        />
      </div>
    )
  }

  // v2.9.22 — Champ signature / paraphe placé dans une étape NORMALE (hors étape
  // signature dédiée). Avant : tombait dans le fallback input texte → le candidat
  // voyait une case texte au lieu d'un pad de signature. Maintenant : box cliquable
  // qui ouvre le même pad de signature global.
  if (t === 'signature' || t === 'initial') {
    return (
      <div>
        {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
        {signatureDataUrl ? (
          <div
            onClick={onRequestSignature}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              background: '#F0FDF4',
              border: '2px solid #15803D',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signatureDataUrl} alt="Signature" style={{ maxWidth: 150, maxHeight: 56, objectFit: 'contain' }} />
            <span style={{ fontSize: 12.5, color: '#15803D', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Check size={14} /> Signature adoptée — toucher pour modifier
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onRequestSignature}
            style={{
              width: '100%',
              padding: 14,
              background: '#FEF3C7',
              border: '2px dashed #EAB308',
              borderRadius: 10,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 14, fontWeight: 700, color: '#A16207',
            }}
          >
            <PenLine size={16} />
            {t === 'initial' ? 'Apposer mon paraphe' : 'Signer ici'}
          </button>
        )}
      </div>
    )
  }

  if (t === 'date' && field.metadata?.tabType === 'datesigned') {
    return (
      <div>
        {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
        <div style={{ ...inputStyle, background: '#F0FDF4', borderColor: '#86EFAC' }}>
          {autoFill.today}
          <Check size={14} style={{ color: '#15803D', marginLeft: 'auto' }} />
        </div>
      </div>
    )
  }

  // v2.9.14 — Annotation : texte informatif (pas un champ à remplir, pas stampé sur PDF).
  // Rendu en bandeau amber italique pour différencier visuellement d'un input.
  if (t === 'annotation') {
    const text = field.label || field.tooltip || field.helpText || ''
    if (!text.trim()) return null
    return (
      <div style={{
        padding: '10px 14px',
        background: '#FEF3C7',
        border: '1px solid #FCD34D',
        borderRadius: 8,
        fontSize: 13,
        color: '#78350F',
        fontStyle: 'italic',
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
      }}>
        💡 {text}
        {linkEl && <div>{linkEl}</div>}
      </div>
    )
  }

  if (t === 'checkbox') {
    // v2.7.7 — Si l'utilisateur n'a pas explicitement cliqué (value undefined),
    // utilise l'auto-cochage des conditions check/uncheck. Sinon respecte le choix user.
    const userExplicit = value === true || value === false || value === 'true' || value === 'false'
    const autoChecked = !userExplicit && allValues ? effectiveCheckedState(field, allValues) : undefined
    const checked = userExplicit
      ? (value === true || value === 'true')
      : (autoChecked !== undefined ? autoChecked : (field.metadata?.selected === true))
    return (
      <div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '8px 0' }}>
        {/* Checkbox HTML caché, accessibilité préservée */}
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        />
        {/* Faux checkbox stylé (jaune brand quand coché, contour neutre sinon) */}
        <span style={{
          width: 22, height: 22,
          marginTop: 1,
          flexShrink: 0,
          border: '2px solid',
          borderColor: checked ? '#EAB308' : '#D1D5DB',
          background: checked ? '#EAB308' : '#fff',
          borderRadius: 5,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          boxShadow: checked ? '0 1px 3px rgba(234,179,8,0.35)' : '0 1px 2px rgba(0,0,0,0.04)',
        }}>
          {checked && (
            <Check size={14} strokeWidth={3} style={{ color: '#1C1A14' }} />
          )}
        </span>
        {renderLabel && (
          <span style={{ fontSize: 14, color: '#1C1A14', lineHeight: 1.4 }}>
            {label}
            {isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}
            <HelpAttachmentButton field={field} token={token} />
            {field.helpText && field.helpText.trim() && (
              <div style={{ marginTop: 3, fontSize: 12, color: '#6B7280', fontStyle: 'italic', lineHeight: 1.45 }}>
                {field.helpText}
              </div>
            )}
          </span>
        )}
      </label>
      {linkEl && <div style={{ marginLeft: 34, marginTop: -2, marginBottom: 6 }}>{linkEl}</div>}
      </div>
    )
  }

  if (t === 'select') {
    const baseItems = (field.metadata?.listItems as { text: string; value: string }[] | undefined) || []
    const items = enrichedSelectItems || baseItems
    const stringValue = typeof value === 'string' ? value : ''
    return (
      <div>
        {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
        <select
          value={stringValue}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">— Choisir —</option>
          {items.map((it, i) => (
            <option key={i} value={it.value}>{it.text}</option>
          ))}
        </select>
      </div>
    )
  }

  if (t === 'date') {
    const stringValue = typeof value === 'string' ? value : ''
    return (
      <div>
        {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
        <input
          type="date"
          value={stringValue}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      </div>
    )
  }

  // v2.2.1 — Formule (calcul auto, read-only)
  if (t === 'formula') {
    const computed = allValues ? computeFormulaValue(field, allValues) : null
    const formatted = formatFormulaValue(field, computed)
    return (
      <div>
        {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
        <div style={{
          ...inputStyle,
          background: 'rgba(34,197,94,0.06)',
          borderColor: '#86EFAC',
          color: '#15803D',
          fontWeight: 700,
          fontSize: 16,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ flex: 1 }}>{formatted || <span style={{ color: '#9CA3AF', fontWeight: 500 }}>0</span>}</span>
          <Check size={14} style={{ color: '#15803D', marginLeft: 'auto' }} />
        </div>
        <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 4 }}>
          🔢 Calcul automatique
        </div>
      </div>
    )
  }

  // v2.9.23 — Pièce jointe : widget de chargement (upload + contrôle Vision)
  if (t === 'attachment') {
    const attVal = (value && typeof value === 'object' && 'files' in (value as object))
      ? (value as SignAttachmentValue)
      : undefined
    return (
      <div>
        {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
        <AttachmentField field={field} value={attVal} onChange={v => onChange(v)} token={token} />
      </div>
    )
  }

  // text / number / fallback (avec auto-detect date)
  const isNumber = t === 'number'
  // v2.7.6 — Numéro avec source 'phone' → pré-remplit avec le téléphone du candidat.
  // Le rendu reste un input modifiable (sauf si autoFillLocked) — le candidat peut corriger.
  // v2.9.28 — Détection téléphone élargie : autoFillSource='phone' OU libellé
  // (« Tél. portable », « Natel »…) → input tel + pré-remplissage candidat.
  const phoneAutoValue = looksLikePhoneField(field) ? (autoFill.telephone || '') : ''
  if (phoneAutoValue && field.autoFillLocked) {
    const explicitOverride = typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : ''
    const displayed = explicitOverride || phoneAutoValue
    return (
      <div>
        {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
        <div style={{
          ...inputStyle,
          background: '#F0FDF4',
          borderColor: '#86EFAC',
          color: '#1C1A14',
          fontWeight: 500,
        }}>
          {displayed || <span style={{ color: '#9CA3AF' }}>—</span>}
          <Check size={14} style={{ color: '#15803D', marginLeft: 'auto' }} />
        </div>
      </div>
    )
  }
  const stringValue = value !== undefined && value !== null
    ? String(value)
    : phoneAutoValue
  if (renderAsDate) {
    return (
      <div>
        {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
        <input
          type="date"
          value={stringValue}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      </div>
    )
  }
  // v2.9.18 — Un field number marqué autoFillSource='phone' EST un champ téléphone,
  // qu'il y ait ou non une valeur d'autofill disponible. Avant : si phoneAutoValue
  // était vide (enveloppe non liée à un candidat DB), le champ tombait en
  // type=number → l'input HTML strip les +, espaces, zéros de tête → impossible
  // de taper un numéro suisse. Maintenant : type=tel dès que c'est un champ phone.
  const isPhoneField = looksLikePhoneField(field)
  const inputType = isPhoneField ? 'tel' : (isNumber ? 'number' : 'text')
  return (
    <div>
      {renderLabel && <label style={labelStyle}>{label}{isRequired && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}<HelpAttachmentButton field={field} token={token} /></label>}
        <HelpText text={field.helpText} />
      <input
        type={inputType}
        inputMode={isPhoneField ? 'tel' : (isNumber ? 'decimal' : 'text')}
        value={stringValue}
        onChange={e => {
          const v = e.target.value
          // Champ téléphone : on garde la string brute (+, espaces, zéros préservés).
          // Champ number pur : cast en Number. Texte : string.
          if (isPhoneField) onChange(v)
          else if (isNumber) onChange(v ? Number(v) : v)
          else onChange(v)
        }}
        readOnly={!!field.readOnly}
        maxLength={field.maxLength}
        placeholder={isPhoneField ? (phoneAutoValue || '+41 79 123 45 67') : (field.defaultValue || '')}
        style={inputStyle}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// v2.9.72 — Bouton « ℹ️ Voir infos » à droite du label d'un field si
// helpAttachment configuré. Clic → ouvre FilePreviewModal portalisé qui
// affiche le PDF/image via /api/sign/document/[token]?path=...
// ─────────────────────────────────────────────────────────────────────
function HelpAttachmentButton({ field, token }: { field: SignField; token?: string }) {
  const help = field.helpAttachment
  const [open, setOpen] = useState(false)
  if (!help || !help.path) return null
  const label = (help.buttonLabel || '').trim() || 'Voir infos'
  // v2.9.73 — Sans token (preview admin dans l'éditeur) : bouton visible
  // mais le clic affiche juste un toast d'info (l'URL signée n'est servie
  // qu'au candidat avec un token valide via /api/sign/document/[token]).
  const isPreview = !token
  const url = token ? `/api/sign/document/${token}?path=${encodeURIComponent(help.path)}` : ''
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (isPreview) {
            // eslint-disable-next-line no-alert
            alert(`Aperçu admin — disponible côté candidat.\nFichier : ${help.fileName || 'aide'} (${help.mimeType})`)
            return
          }
          setOpen(true)
        }}
        title={isPreview
          ? `Aperçu admin (le candidat ouvrira ${help.fileName})`
          : "Voir l'aide explicative"
        }
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          marginLeft: 8, padding: '2px 8px', borderRadius: 999,
          background: 'rgba(245,166,35,0.12)',
          border: '1px solid rgba(245,166,35,0.4)',
          color: '#92400E', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          verticalAlign: 'middle',
        }}
      >
        <Info size={11} />
        {label}
      </button>
      {open && !isPreview && (
        <FilePreviewModal
          url={url}
          name={help.fileName || 'aide.pdf'}
          mimeType={help.mimeType || 'application/pdf'}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ─── RecapStep — récapitulatif avant signer ──────────────────────
interface RecapProps {
  steps: WizardStep[]
  fieldsByStepMap: Map<string, SignField[]>
  fieldValues: Record<string, unknown>
  signatureDataUrl: string | null
  autoFill: AutoFill
  envelopeTitle: string
  recipientName: string
  onJumpToStep: (idx: number) => void
}

function RecapStep({
  steps, fieldsByStepMap, fieldValues, signatureDataUrl, autoFill,
  envelopeTitle, recipientName, onJumpToStep,
}: RecapProps) {
  return (
    <div>
      <h2 style={stepTitleStyle}>Récapitulatif</h2>
      <p style={stepDescStyle}>
        Vérifiez vos informations avant de finaliser. Vous pouvez modifier en cliquant sur une section.
      </p>

      <div style={{
        marginTop: 16,
        padding: 14,
        background: '#FFFBEB',
        border: '1px solid #FDE68A',
        borderRadius: 10,
        fontSize: 13,
        color: '#713F12',
      }}>
        <strong>{recipientName}</strong> · {envelopeTitle}
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s, idx) => {
          const fields = fieldsByStepMap.get(s.id) || []
          const filledCount = fields.filter(f =>
            isFieldFilled(f, fieldValues[f.id], signatureDataUrl, autoFill, fieldValues)
          ).length
          const allFilled = filledCount === fields.length
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onJumpToStep(idx)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 12,
                background: '#fff',
                border: `1px solid ${allFilled ? '#86EFAC' : '#FCA5A5'}`,
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 999,
                background: allFilled ? '#D1FAE5' : '#FEE2E2',
                color: allFilled ? '#059669' : '#DC2626',
                display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {allFilled ? <Check size={14} /> : <AlertCircle size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1C1A14' }}>{prettifySpaces(s.title)}</div>
                <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>
                  {filledCount}/{fields.length} {fields.length > 1 ? 'champs remplis' : 'champ rempli'}
                  {s.isSignatureStep && signatureDataUrl && ' · ✍️ Signé'}
                </div>
              </div>
              <ChevronRight size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Retourne un label humain pour un field : tooltip si défini, sinon label si
 * non-UUID, sinon fallback selon type (jamais d'UUID brut affiché).
 */
const UUID_LABEL_RE = /^(?:Texte|Date|Liste|Signature|Case à cocher|Annotation|Liste déroulante|E.?mail|Prénom|Nom|Société|Fonction|Numéro)\s+[0-9a-fA-F-]{8,}/

function humanLabel(field: SignField): string {
  const tooltip = (field.tooltip || '').trim()
  if (tooltip) return prettifySpaces(tooltip)
  const lbl = (field.label || '').trim()
  if (lbl && !UUID_LABEL_RE.test(lbl)) return prettifySpaces(lbl)
  // Fallback selon type
  switch (field.type) {
    case 'text':       return 'Texte libre'
    case 'number':     return 'Nombre'
    case 'checkbox':   return 'Oui / Non'
    case 'select':     return 'Choisir'
    case 'date':       return 'Date'
    case 'signature':  return 'Signature'
    case 'initial':    return 'Paraphe'
    default:           return 'Champ'
  }
}

/** Restaure les espaces manquants dans le texte extrait du PDF
 *  (ex: "Fiched'inscription" → "Fiche d'inscription"). Heuristique légère.
 */
function prettifySpaces(s: string): string {
  return s
    // Espace entre minuscule+majuscule (camelCase → camel Case)
    .replace(/([a-zàèéêëîïôùûüç])([A-ZÉÈÊËÀÂÎÏÔÙÛÜÇ])/g, '$1 $2')
    // Espace après "d'", "l'", "n'" sans espace
    .replace(/\b([dlnsmctj])'([A-ZÉÈÊËÀÂÎÏÔÙÛÜÇ])/g, "$1' $2")
    // Espace entre LETTRE et chiffre uniquement (ex: "Lundi04" → "Lundi 04")
    // ⚠️ NE PAS séparer chiffre+chiffre (ex: "52" doit rester "52", pas "5 2")
    .replace(/([a-zA-ZàèéêëîïôùûüçÉÈÊËÀÂÎÏÔÙÛÜÇ])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function isFieldFilled(
  f: SignField, value: unknown, signatureDataUrl: string | null, autoFill: AutoFill,
  allValues?: Record<string, unknown>,
): boolean {
  const t = f.type
  if (t === 'signature' || t === 'initial') return !!signatureDataUrl
  if (t === 'checkbox') {
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return true  // user explicitly unchecked
    // v2.7.7 — checkbox sans valeur user : "remplie" si auto-check matche OU si selected par défaut
    if (allValues) {
      const auto = effectiveCheckedState(f, allValues)
      if (auto !== undefined) return true
    }
    return f.metadata?.selected === true
  }
  if (t === 'annotation') return true
  if (t === 'formula') return true  // calcul auto, toujours "rempli" même si 0
  // v2.9.23 — Pièce jointe : remplie si au moins un fichier chargé
  if (t === 'attachment') {
    const v = value as { files?: unknown[] } | undefined
    return !!v && Array.isArray(v.files) && v.files.length > 0
  }
  // v2.2.4 — Heuristique : title/text avec tooltip "société/entreprise" → traité comme company
  if (looksLikeCompanyField(f) && t !== 'company') {
    const auto = getAutoFillValue('company', autoFill, value)
    return !!auto && auto.trim() !== ''
  }
  if (['firstname', 'lastname', 'fullname', 'email', 'company', 'title'].includes(t)) {
    const auto = getAutoFillValue(t, autoFill, value)
    return !!auto && auto.trim() !== ''
  }
  if (t === 'date' && f.metadata?.tabType === 'datesigned') return !!autoFill.today
  // v2.7.6 — Numéro avec source phone : rempli si autoFill.telephone existe (même sans valeur explicite)
  if (t === 'number' && f.autoFillSource === 'phone' && autoFill.telephone) return true
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function getAutoFillValue(t: SignFieldType, af: AutoFill, explicit: unknown): string {
  if (typeof explicit === 'string' && explicit.trim()) return explicit
  switch (t) {
    case 'firstname': return af.firstName
    case 'lastname':  return af.lastName
    case 'fullname':  return af.fullName
    case 'email':     return af.email
    case 'company':   return af.companyName || ''
    case 'title':     return af.title || ''
    default:          return typeof explicit === 'string' ? explicit : ''
  }
}

// ─── Styles ────────────────────────────────────────────────────────
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  background: '#FAFAF7',
  fontFamily: 'inherit',
}

const headerStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '14px 18px',
  background: '#fff',
  borderBottom: '1px solid #E5E7EB',
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 18px 24px',
  WebkitOverflowScrolling: 'touch',
}

const footerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '12px 16px',
  background: '#fff',
  borderTop: '1px solid #E5E7EB',
}

const stepTitleStyle: React.CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: 22,
  fontWeight: 400,
  color: '#1C1A14',
  margin: 0,
  marginBottom: 6,
  lineHeight: 1.25,
  letterSpacing: '-0.3px',
}

// v2.4.0 — HelpText inline (annotation par champ), affiché entre label et input.
// Plus subtile et précise qu'une note d'étape : sert d'explication courte sur
// CE champ précis (ex: "IBAN suisse au format CH..." sous "Méthode paiement").
function HelpText({ text }: { text?: string | null }) {
  const t = (text || '').trim()
  if (!t) return null
  return (
    <div style={{
      marginTop: -2,
      marginBottom: 6,
      fontSize: 12,
      color: '#6B7280',
      fontStyle: 'italic',
      lineHeight: 1.45,
    }}>
      {t}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stepDescStyle: React.CSSProperties = {
  fontSize: 13.5,
  color: '#6B7280',
  margin: 0,
  marginBottom: 4,
  lineHeight: 1.55,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
  letterSpacing: '0.01em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,                   // v2.2.4 — empêche input[type=date] de déborder sur iOS
  padding: '11px 13px',
  fontSize: 16,                  // v2.2.4 — 16 strict pour éviter le zoom auto iOS sur focus
  fontFamily: 'inherit',
  background: '#fff',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  color: '#1C1A14',
  outline: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  boxSizing: 'border-box',
  // v2.2.4 — annule le rendu natif iOS qui force un min-width supérieur sur input[type=date]
  WebkitAppearance: 'none',
  appearance: 'none',
}

const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 700,
  background: '#EAB308',
  color: '#1C1A14',
  border: '1px solid #1C1A14',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
}

const btnSecondary: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 13,
  fontWeight: 600,
  background: '#fff',
  color: '#374151',
  border: '1px solid #D1D5DB',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
}
