// TalentFlow Sign — Preview live du wizard candidat (admin)
// v2.2.0 — Phase 4a-bis-5
//
// Panneau preview affiché à droite de WizardEditor. Rend SignWizard en mode
// "preview" : pas de finalize réel, autoFill mocké, signature mockée localement.
// Toggle device : mobile (frame iPhone 375×812) ou desktop (frame ~960×600).
// Re-render automatique à chaque modif des props (steps/documents) → temps réel.
'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Smartphone, Monitor, X as XIcon, RefreshCw } from 'lucide-react'
import type { SignDocument } from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'

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
  // Filtre les steps du rôle actif uniquement
  const visibleSteps = steps.filter(s => (s.recipientOrder ?? 1) === activeRole)
  // Convertit syncStepIdx (global) en idx local du visibleSteps
  const localSyncStepIdx = useMemo(() => {
    if (syncStepIdx === undefined) return undefined
    const targetStep = steps[syncStepIdx]
    if (!targetStep) return undefined
    const localIdx = visibleSteps.findIndex(s => s.id === targetStep.id)
    return localIdx >= 0 ? localIdx : undefined
  }, [syncStepIdx, steps, visibleSteps])
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
    }
  }, [today])

  const handleFieldChange = (fieldId: string, value: unknown) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }))
  }

  const handleResetPreview = () => {
    setFieldValues({})
    setSignatureDataUrl(null)
    setResetKey(k => k + 1)
  }

  // Dimensions device frame — v2.2.4 réduit pour ne pas surcharger la colonne droite
  const isMobile = device === 'mobile'
  const frameW = isMobile ? 320 : 900
  const frameH = isMobile ? 580 : 540

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
      <div style={{
        flex: 1,
        overflow: 'auto',
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
        ) : (
          <DeviceFrame device={device} width={frameW} height={frameH}>
            <SignWizard
              key={resetKey}
              steps={visibleSteps.map(s => s)}
              documents={documents}
              fieldValues={fieldValues}
              onValueChange={handleFieldChange}
              signatureDataUrl={signatureDataUrl}
              onRequestSignature={() => setSignaturePadOpen(true)}
              autoFill={autoFill}
              recipientName={MOCK_RECIPIENT_NAME}
              envelopeTitle={MOCK_ENVELOPE_TITLE}
              completed={false}
              finalizing={false}
              forceStepIdx={localSyncStepIdx}
              onFinalize={() => {
                // Mode preview : pas de vraie finalisation
                alert('Aperçu : aucune signature envoyée. Termine la configuration puis envoie l\'enveloppe au candidat.')
              }}
            />
          </DeviceFrame>
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
    // iPhone frame
    return (
      <div style={{
        width: width + 24,
        background: '#1C1A14',
        borderRadius: 44,
        padding: '12px 12px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
        position: 'relative',
        flexShrink: 0,
      }}>
        {/* Notch */}
        <div style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 110,
          height: 24,
          background: '#1C1A14',
          borderRadius: 16,
          zIndex: 5,
        }} />
        <div style={{
          width,
          height,
          background: '#fff',
          borderRadius: 32,
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
