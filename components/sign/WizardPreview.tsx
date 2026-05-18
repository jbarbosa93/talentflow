// TalentFlow Sign — Preview live du wizard candidat (admin)
// v2.2.0 — Phase 4a-bis-5
//
// Panneau preview affiché à droite de WizardEditor. Rend SignWizard en mode
// "preview" : pas de finalize réel, autoFill mocké, signature mockée localement.
// Toggle device : mobile (frame iPhone 375×812) ou desktop (frame ~960×600).
// Re-render automatique à chaque modif des props (steps/documents) → temps réel.
'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Smartphone, Monitor, X as XIcon, RefreshCw } from 'lucide-react'
import type { SignDocument } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'
import { toast } from 'sonner'

const SignWizard = dynamic(() => import('./SignWizard'), { ssr: false })
const SignaturePad = dynamic(() => import('./SignaturePad'), { ssr: false })

interface Props {
  steps: WizardStep[]
  documents: SignDocument[]
  /** Callback quand l'utilisateur ferme le panneau preview. */
  onClose: () => void
  /** Index de l'étape à afficher initialement (sync avec sélection éditeur). Quand cette
   *  valeur change, le preview saute à cette étape. */
  syncStepIdx?: number
  /** v2.2.1 — Rôle (recipientOrder) à prévisualiser. Default 1. */
  activeRole?: number
}

const MOCK_RECIPIENT_NAME = 'Jean Dupont'
const MOCK_RECIPIENT_EMAIL = 'jean.dupont@example.ch'
const MOCK_ENVELOPE_TITLE = 'Aperçu — Fiche d\'inscription'

export default function WizardPreview({ steps, documents, onClose, syncStepIdx, activeRole = 1 }: Props) {
  // v2.7.6 — Stratégie anti-rebond :
  // 1. Debounce 700ms sur documents/steps pour éviter de propager à chaque frappe.
  // 2. JSON-hash de comparaison pour ne PAS update si le contenu est logiquement
  //    identique (évite les re-render fantômes quand React passe une nouvelle ref
  //    de la même donnée).
  // Résultat : SignWizard reçoit des refs stables, ne se re-render pas pendant la
  // frappe, et n'évolue que quand quelque chose de visible a réellement changé.
  const [snapshot, setSnapshot] = useState({ documents, steps })
  const snapshotHashRef = useRef('')

  useEffect(() => {
    const id = setTimeout(() => {
      // Hash léger : on encode juste les fields (id+type+label+tooltip+required+autoFillLocked+autoFillSource+conditions)
      // et les steps (id+title+fieldIds+recipientOrder). Comparer le hash évite
      // de propager des refs nouvelles dont le contenu est identique.
      const hash = JSON.stringify({
        d: documents.map(d => (d.fields || []).map(f => [
          f.id, f.type, f.label, f.tooltip, f.required, f.autoFillLocked,
          f.autoFillSource, f.wizardSection, f.sectionDescription, f.helpText,
          f.metadata, f.defaultValue, f.maxLength, f.conditions,
          f.groupId, f.groupRule, f.groupMin, f.groupMax, f.groupName,
        ])),
        s: steps.map(s => [s.id, s.title, s.description, s.fieldIds, s.recipientOrder, s.displayMode,
          // v2.9.13 — Inclut attachments dans le hash pour que le rename d'un
          // attachment label propage au preview (sinon snapshot figé)
          (s.attachments || []).map(a => [a.id, a.label, a.description, a.docOrder, a.externalUrl]),
        ]),
      })
      if (hash !== snapshotHashRef.current) {
        snapshotHashRef.current = hash
        setSnapshot({ documents, steps })
      }
    }, 700)
    return () => clearTimeout(id)
  }, [documents, steps])

  const stableSteps = snapshot.steps
  const stableDocuments = snapshot.documents

  // Filtre les steps du rôle actif uniquement — basé sur snapshot stable
  const visibleSteps = useMemo(
    () => stableSteps.filter(s => (s.recipientOrder ?? 1) === activeRole),
    [stableSteps, activeRole],
  )
  // Convertit syncStepIdx (global) en idx local du visibleSteps
  const localSyncStepIdx = useMemo(() => {
    if (syncStepIdx === undefined) return undefined
    const targetStep = stableSteps[syncStepIdx]
    if (!targetStep) return undefined
    const localIdx = visibleSteps.findIndex(s => s.id === targetStep.id)
    return localIdx >= 0 ? localIdx : undefined
  }, [syncStepIdx, stableSteps, visibleSteps])
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile')
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [signaturePadOpen, setSignaturePadOpen] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const today = useMemo(
    () => new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    [],
  )
  const autoFill = useMemo(() => {
    const parts = MOCK_RECIPIENT_NAME.split(/\s+/)
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      fullName: MOCK_RECIPIENT_NAME,
      email: MOCK_RECIPIENT_EMAIL,
      today,
      telephone: '+41 79 123 45 67',
    }
  }, [today])

  const handleFieldChange = useCallback((fieldId: string, value: unknown) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }))
  }, [])

  const handleResetPreview = useCallback(() => {
    setFieldValues({})
    setSignatureDataUrl(null)
    setResetKey(k => k + 1)
  }, [])

  const handleRequestSignature = useCallback(() => setSignaturePadOpen(true), [])

  const handleFinalize = useCallback(() => {
    toast.info('Aperçu : aucune signature envoyée. Termine la configuration puis envoie l\'enveloppe au candidat.')
  }, [])

  // Dimensions device frame — iPhone 17 Pro Max (430×760) en mobile, browser en desktop
  const isMobile = device === 'mobile'
  const frameW = isMobile ? 430 : 900
  const frameH = isMobile ? 760 : 540

  // v2.7.6 — Container responsif : scale auto si la hauteur disponible est plus
  // petite que le cadre iPhone (évite le scrollbar interne).
  const frameContainerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = frameContainerRef.current
    if (!el) return
    const recompute = () => {
      const rect = el.getBoundingClientRect()
      const padding = 36 // padding du container (18 chaque côté)
      const availH = rect.height - padding
      const availW = rect.width - padding
      // Garde-fou : si le container n'est pas encore layouté (0px) ou trop petit,
      // on ne calcule pas un scale absurde — on attend une vraie mesure.
      if (availH < 100 || availW < 100) return
      const totalFrameH = frameH + 36
      const totalFrameW = frameW + 24
      const s = Math.min(1, availH / totalFrameH, availW / totalFrameW)
      setScale(Math.max(0.35, s))
    }
    // Premier calcul après layout (rAF) puis observer pour les resizes ultérieurs
    const rafId = requestAnimationFrame(recompute)
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    window.addEventListener('resize', recompute)
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [frameH, frameW])

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      minHeight: 0,
    }}>
      {/* Toolbar preview */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
          Aperçu live
        </span>
        <span style={{ flex: 1 }} />
        {/* Toggle device */}
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setDevice('mobile')}
            style={{
              padding: '6px 10px',
              background: isMobile ? '#EAB308' : 'transparent',
              color: isMobile ? '#1C1A14' : 'var(--muted)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
            title="Aperçu mobile"
          >
            <Smartphone size={12} />
            Mobile
          </button>
          <button
            type="button"
            onClick={() => setDevice('desktop')}
            style={{
              padding: '6px 10px',
              background: !isMobile ? '#EAB308' : 'transparent',
              color: !isMobile ? '#1C1A14' : 'var(--muted)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
            title="Aperçu desktop"
          >
            <Monitor size={12} />
            Desktop
          </button>
        </div>
        <button
          type="button"
          onClick={handleResetPreview}
          className="neo-btn-ghost neo-btn-sm"
          title="Réinitialiser les valeurs saisies dans le preview"
          style={{ padding: '4px 8px' }}
        >
          <RefreshCw size={11} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="neo-btn-ghost neo-btn-sm"
          style={{ padding: '4px 8px' }}
          title="Fermer l'aperçu"
        >
          <XIcon size={13} />
        </button>
      </div>

      {/* Device frame container */}
      <div ref={frameContainerRef} style={{
        flex: 1,
        overflow: 'hidden',
        padding: 18,
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        minHeight: 0,
      }}>
        {visibleSteps.length === 0 ? (
          <div style={{
            color: 'var(--muted)',
            fontSize: 13,
            textAlign: 'center',
            padding: 40,
            fontStyle: 'italic',
          }}>
            Aucune étape à prévisualiser. Ajoute des étapes ou utilise « Améliorer avec l&apos;IA ».
          </div>
        ) : scale >= 0.999 ? (
          // v2.7.6 — Plein écran : pas de transform du tout → rendu pixel-parfait (anti-blur)
          <MemoizedDeviceWithWizard
            resetKey={resetKey}
            device={device}
            frameW={frameW}
            frameH={frameH}
            steps={visibleSteps}
            documents={stableDocuments}
            fieldValues={fieldValues}
            onValueChange={handleFieldChange}
            signatureDataUrl={signatureDataUrl}
            onRequestSignature={handleRequestSignature}
            autoFill={autoFill}
            forceStepIdx={localSyncStepIdx}
            onFinalize={handleFinalize}
          />
        ) : (
          // Écran trop petit : transform scale pour faire tenir l'iPhone dans l'espace dispo.
          // Outer occupe la taille SCALÉE (layout flex), inner garde la taille originale.
          <div style={{
            width: (frameW + 24) * scale,
            height: (frameH + 36) * scale,
            flexShrink: 0,
            overflow: 'visible',
          }}>
            <div style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: frameW + 24,
              height: frameH + 36,
            }}>
              <MemoizedDeviceWithWizard
                resetKey={resetKey}
                device={device}
                frameW={frameW}
                frameH={frameH}
                steps={visibleSteps}
                documents={stableDocuments}
                fieldValues={fieldValues}
                onValueChange={handleFieldChange}
                signatureDataUrl={signatureDataUrl}
                onRequestSignature={handleRequestSignature}
                autoFill={autoFill}
                forceStepIdx={localSyncStepIdx}
                onFinalize={handleFinalize}
              />
            </div>
          </div>
        )}
      </div>

      {/* SignaturePad mocké pour le preview */}
      <SignaturePad
        open={signaturePadOpen}
        defaultName={MOCK_RECIPIENT_NAME}
        onClose={() => setSignaturePadOpen(false)}
        onAdopt={(dataUrl) => {
          setSignatureDataUrl(dataUrl)
          setSignaturePadOpen(false)
        }}
      />
    </div>
  )
}

// v2.7.6 — Composant mémoïsé encapsulant DeviceFrame + SignWizard.
// Évite tout re-render du cadre iPhone + SignWizard quand le parent re-render
// suite à des frappes dans l'éditeur (auto-save TemplateEditor en arrière-plan,
// mutations dirty=*, etc.). Re-render UNIQUEMENT si une prop change.
interface MemoProps {
  resetKey: number
  device: 'mobile' | 'desktop'
  frameW: number
  frameH: number
  steps: WizardStep[]
  documents: SignDocument[]
  fieldValues: Record<string, unknown>
  onValueChange: (id: string, v: unknown) => void
  signatureDataUrl: string | null
  onRequestSignature: () => void
  autoFill: {
    firstName: string; lastName: string; fullName: string; email: string;
    today: string; telephone?: string;
  }
  forceStepIdx?: number
  onFinalize: () => void
}

const MemoizedDeviceWithWizard = React.memo(function MemoizedDeviceWithWizard(props: MemoProps) {
  const {
    resetKey, device, frameW, frameH, steps, documents,
    fieldValues, onValueChange, signatureDataUrl, onRequestSignature,
    autoFill, forceStepIdx, onFinalize,
  } = props
  return (
    <DeviceFrame device={device} width={frameW} height={frameH}>
      <SignWizard
        key={resetKey}
        steps={steps}
        documents={documents}
        fieldValues={fieldValues}
        onValueChange={onValueChange}
        signatureDataUrl={signatureDataUrl}
        onRequestSignature={onRequestSignature}
        autoFill={autoFill}
        recipientName={MOCK_RECIPIENT_NAME}
        envelopeTitle={MOCK_ENVELOPE_TITLE}
        completed={false}
        finalizing={false}
        forceStepIdx={forceStepIdx}
        onFinalize={onFinalize}
      />
    </DeviceFrame>
  )
})

// ─── DeviceFrame — wrapper visuel iPhone / desktop ────────────────────
function DeviceFrame({
  device, width, height, children,
}: {
  device: 'mobile' | 'desktop'
  width: number
  height: number
  children: React.ReactNode
}) {
  if (device === 'mobile') {
    // iPhone 17 Pro Max frame
    return (
      <div style={{
        width: width + 24,
        background: '#1C1A14',
        borderRadius: 60,
        padding: '14px 12px',
        boxShadow: '0 16px 56px rgba(0,0,0,0.22)',
        position: 'relative',
        flexShrink: 0,
      }}>
        {/* Dynamic Island */}
        <div style={{
          position: 'absolute',
          top: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 36,
          background: '#1C1A14',
          borderRadius: 20,
          zIndex: 5,
        }} />
        <div style={{
          width,
          height,
          background: '#fff',
          borderRadius: 48,
          overflow: 'hidden',
          position: 'relative',
        }}>
          {children}
        </div>
      </div>
    )
  }
  // Desktop frame (browser-like)
  return (
    <div style={{
      width,
      maxWidth: '100%',
      background: '#1C1A14',
      borderRadius: 12,
      padding: 0,
      boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      <div style={{
        height: 28,
        background: '#1C1A14',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 12px',
      }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: '#FF5F57' }} />
        <span style={{ width: 10, height: 10, borderRadius: 999, background: '#FEBC2E' }} />
        <span style={{ width: 10, height: 10, borderRadius: 999, background: '#28C840' }} />
        <span style={{
          flex: 1,
          textAlign: 'center',
          fontSize: 10,
          color: '#9CA3AF',
          fontFamily: 'ui-monospace, monospace',
        }}>
          talent-flow.ch/sign/v/…
        </span>
      </div>
      <div style={{
        width,
        height,
        background: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}
