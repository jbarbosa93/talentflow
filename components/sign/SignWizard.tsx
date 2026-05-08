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
  AlertCircle, Loader2, FileText, ListChecks, Paperclip,
} from 'lucide-react'
import type { SignField, SignFieldType, SignDocument } from '@/lib/sign/types'
import type { WizardStep, WizardStepAttachment } from '@/lib/sign/wizard-builder'
import { fieldsByStep } from '@/lib/sign/wizard-builder'

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
  looksLikeDateField, looksLikeCountrySelect, EUROPEAN_COUNTRIES,
  effectiveFieldState, computeFormulaValue, formatFormulaValue,
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
}

interface Props {
  steps: WizardStep[]
  documents: SignDocument[]
  fieldValues: Record<string, unknown>
  onValueChange: (fieldId: string, value: unknown) => void
  signatureDataUrl: string | null
  onRequestSignature: () => void
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
}

export default function SignWizard({
  steps, documents, fieldValues, onValueChange, signatureDataUrl,
  onRequestSignature, autoFill, recipientName, envelopeTitle,
  completed, finalizing, onFinalize, onSwitchToDocumentMode, token, forceStepIdx,
  contextData, previousFieldValues, previousSignerNames, previousSignerLabel,
  allDocumentFields,
}: Props) {
  // v2.2.3 Pack 1 — Détecte s'il y a des valeurs précédentes à montrer en récap
  const hasPreviousValues = !!previousFieldValues && Object.keys(previousFieldValues).length > 0
  const showPrevRecap = hasPreviousValues && (allDocumentFields || []).length > 0
  const [openAttachment, setOpenAttachment] = useState<{ url: string; filename: string; label: string } | null>(null)
  // L'index courant : 0..steps.length-1 = step normale ; steps.length = step récap
  const [currentIdx, setCurrentIdx] = useState(forceStepIdx ?? 0)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Mode preview admin : sync avec l'étape sélectionnée dans l'éditeur
  useEffect(() => {
    if (forceStepIdx !== undefined && forceStepIdx >= 0 && forceStepIdx < steps.length) {
      setCurrentIdx(forceStepIdx)
    }
  }, [forceStepIdx, steps.length])

  // Map fieldId → field (résolution rapide)
  const fieldsByStepMap = useMemo(() => fieldsByStep(steps, documents), [steps, documents])

  const totalSteps = steps.length + 1  // +1 pour récap final
  const isRecapStep = currentIdx >= steps.length
  const currentStep: WizardStep | null = isRecapStep ? null : steps[currentIdx]
  const stepFields = currentStep ? (fieldsByStepMap.get(currentStep.id) || []) : []

  // Reset erreur quand on change d'étape
  useEffect(() => { setValidationError(null) }, [currentIdx])

  // Validation : vérifier les champs requis de l'étape courante
  const validateCurrentStep = (): boolean => {
    if (!currentStep) return true
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
      if (isFieldFilled(f, fieldValues[f.id], signatureDataUrl, autoFill)) continue
      setValidationError(`"${f.tooltip || f.label || 'Champ'}" est requis`)
      return false
    }
    return true
  }

  const handleNext = () => {
    if (!validateCurrentStep()) return
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
            Document signé !
          </h2>
          <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 380, lineHeight: 1.55, margin: 0 }}>
            Une copie signée vous a été envoyée par email à <strong>{autoFill.email || 'votre adresse'}</strong>.
            Vous pouvez fermer cette fenêtre.
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
          {/* v2.2.3 — Bouton "Document complet" retiré du wizard pour éviter doublon
              avec le toggle "Document" présent dans le header global de la page. */}
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
            onChange={onValueChange}
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
            {currentStep?.isSignatureStep ? 'Vérifier' : 'Suivant'}
            <ChevronRight size={16} />
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
  onRequestSignature: () => void
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
  const visibleFields = fields.filter(f => effectiveFieldState(f, values).visible)
  const attachments = step.attachments || []
  // Étape signature spéciale
  if (step.isSignatureStep) {
    return (
      <div>
        <h2 style={stepTitleStyle}>{prettifySpaces(step.title)}</h2>
        {step.description && <p style={stepDescStyle}>{step.description}</p>}
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
                onClick={onRequestSignature}
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
                onClick={onRequestSignature}
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
      {step.description && <p style={stepDescStyle}>{step.description}</p>}
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
      />
    </div>
  )
}

// ─── GroupedFields — rendu list (sub-titres) ou cards (1 carte / section) ───
function GroupedFields({
  fields, displayMode, values, onChange, autoFill, weekStartDate,
}: {
  fields: SignField[]
  displayMode: 'list' | 'cards'
  values: Record<string, unknown>
  onChange: (fieldId: string, value: unknown) => void
  autoFill: AutoFill
  weekStartDate?: string | null
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
          <FieldRow key={f.id} field={f} value={values[f.id]} onChange={v => onChange(f.id, v)} autoFill={autoFill} allValues={values} />
        ))}
      </div>
    )
  }

  // ─── Mode CARDS : 1 carte par section avec grid 2 cols pour les fields ───
  if (displayMode === 'cards') {
    return (
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map((g, gi) => (
          g.name ? (
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
                marginBottom: 12,
                letterSpacing: '-0.2px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 999,
                  background: '#EAB308', flexShrink: 0,
                }} />
                {enrichSection(g.name, weekStartDate)}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
              }}>
                {g.fields.map(f => (
                  <FieldRow key={f.id} field={f} value={values[f.id]} onChange={v => onChange(f.id, v)} autoFill={autoFill} allValues={values} />
                ))}
              </div>
            </div>
          ) : (
            // Fields hors-section : empilage vertical normal
            <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {g.fields.map(f => (
                <FieldRow key={f.id} field={f} value={values[f.id]} onChange={v => onChange(f.id, v)} autoFill={autoFill} allValues={values} />
              ))}
            </div>
          )
        ))}
      </div>
    )
  }

  // ─── Mode LIST (défaut) : sous-titres séparant les groupes, fields verticaux ───
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map((g, gi) => (
        <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {g.name && (
            <div style={{
              fontSize: 11.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#A16207',
              borderBottom: '1px solid #E5E7EB',
              paddingBottom: 6,
              marginTop: gi > 0 ? 8 : 0,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 999,
                background: '#EAB308', flexShrink: 0,
              }} />
              {enrichSection(g.name, weekStartDate)}
            </div>
          )}
          {g.fields.map(f => (
            <FieldRow key={f.id} field={f} value={values[f.id]} onChange={v => onChange(f.id, v)} autoFill={autoFill} allValues={values} />
          ))}
        </div>
      ))}
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
}

function FieldRow({ field, value, onChange, autoFill, allValues }: FieldRowProps) {
  const t = field.type as SignFieldType
  const label = humanLabel(field)
  const isAutoFill = ['firstname', 'lastname', 'fullname', 'email', 'company', 'title'].includes(t)
  const eff = allValues ? effectiveFieldState(field, allValues) : { visible: true, required: !!field.required }
  const isRequired = eff.required

  // Auto-detect : text qui ressemble à une date → date picker
  const renderAsDate = looksLikeDateField(field)
  // Auto-detect : select Nationalité/Pays avec liste pauvre → liste Europe complète
  const enrichedSelectItems = t === 'select' && looksLikeCountrySelect(field)
    ? EUROPEAN_COUNTRIES
    : null

  // Si c'est un auto-fill on l'affiche en lecture seule pré-rempli
  if (isAutoFill) {
    const val = getAutoFillValue(t, autoFill, value)
    return (
      <div>
        <label style={labelStyle}>{label}{isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}</label>
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

  if (t === 'date' && field.metadata?.tabType === 'datesigned') {
    return (
      <div>
        <label style={labelStyle}>{label}{isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}</label>
        <div style={{ ...inputStyle, background: '#F0FDF4', borderColor: '#86EFAC' }}>
          {autoFill.today}
          <Check size={14} style={{ color: '#15803D', marginLeft: 'auto' }} />
        </div>
      </div>
    )
  }

  if (t === 'checkbox') {
    const checked = value === true || value === 'true'
    return (
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
        <span style={{ fontSize: 14, color: '#1C1A14', lineHeight: 1.4 }}>
          {label}
          {isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}
        </span>
      </label>
    )
  }

  if (t === 'select') {
    const baseItems = (field.metadata?.listItems as { text: string; value: string }[] | undefined) || []
    const items = enrichedSelectItems || baseItems
    const stringValue = typeof value === 'string' ? value : ''
    return (
      <div>
        <label style={labelStyle}>{label}{isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}</label>
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
        <label style={labelStyle}>{label}{isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}</label>
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
        <label style={labelStyle}>{label}{isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}</label>
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

  // text / number / fallback (avec auto-detect date)
  const isNumber = t === 'number'
  const stringValue = value !== undefined && value !== null ? String(value) : ''
  if (renderAsDate) {
    return (
      <div>
        <label style={labelStyle}>{label}{isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}</label>
        <input
          type="date"
          value={stringValue}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      </div>
    )
  }
  return (
    <div>
      <label style={labelStyle}>{label}{isRequired && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}</label>
      <input
        type={isNumber ? 'number' : 'text'}
        inputMode={isNumber ? 'decimal' : 'text'}
        value={stringValue}
        onChange={e => onChange(isNumber && e.target.value ? Number(e.target.value) : e.target.value)}
        readOnly={!!field.readOnly}
        maxLength={field.maxLength}
        placeholder={field.defaultValue || ''}
        style={inputStyle}
      />
    </div>
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
            isFieldFilled(f, fieldValues[f.id], signatureDataUrl, autoFill)
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
): boolean {
  const t = f.type
  if (t === 'signature' || t === 'initial') return !!signatureDataUrl
  if (t === 'checkbox') return value === true || value === 'true'
  if (t === 'annotation') return true
  if (t === 'formula') return true  // calcul auto, toujours "rempli" même si 0
  if (['firstname', 'lastname', 'fullname', 'email', 'company', 'title'].includes(t)) {
    const auto = getAutoFillValue(t, autoFill, value)
    return !!auto && auto.trim() !== ''
  }
  if (t === 'date' && f.metadata?.tabType === 'datesigned') return !!autoFill.today
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
  padding: '11px 13px',
  fontSize: 15,                  // ≥16 sur mobile pour éviter zoom iOS — 15 OK avec font-size adaptatif
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
