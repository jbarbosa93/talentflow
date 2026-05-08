// TalentFlow Rapports — Modal QR code mode présentiel (Phase 5)
// v2.2.6
//
// Affiche le QR code du lien client + le lien lui-même (à scanner ou copier).
// Le client scanne avec son téléphone → ouvre /report/client/[token] → signe.
// Token valable 2h (mode présentiel — voir CLIENT_TOKEN_TTL_MS.present).
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { Check, Copy, Loader2, X, Smartphone } from 'lucide-react'

interface Props {
  open: boolean
  /** URL complète à encoder (https://talent-flow.ch/report/client/{token}) */
  url: string
  /** Date d'expiration affichée à l'utilisateur (ex: "Valable 2h") */
  expiresAt: Date | string
  onClose: () => void
}

export default function QRCodeModal({ open, url, expiresAt, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open || !url) return
    const canvas = canvasRef.current
    if (!canvas) return
    setGenerating(true)
    QRCode.toCanvas(canvas, url, {
      width: 256,
      margin: 1,
      color: { dark: '#1C1A14', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .catch(e => console.error('[QRCodeModal] generation failed', e))
      .finally(() => setGenerating(false))
  }, [open, url])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.warn('[QRCodeModal] copy failed', e)
    }
  }

  const expiresDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  const remainingMin = Math.max(0, Math.round((expiresDate.getTime() - Date.now()) / 60000))

  if (!open || !mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'inherit',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E5E7EB',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#FEF3C7', color: '#A16207',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Smartphone size={16} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14' }}>
                Faire signer le client
              </div>
              <div style={{ fontSize: 11.5, color: '#6B7280' }}>
                Le client scanne avec son téléphone et signe
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* QR canvas */}
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{
            position: 'relative',
            width: 256, height: 256,
            border: '2px solid #E5E7EB',
            borderRadius: 14,
            background: '#fff',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {generating && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.85)' }}>
                <Loader2 size={20} className="animate-spin" style={{ color: '#A16207' }} />
              </div>
            )}
            <canvas ref={canvasRef} style={{ width: 256, height: 256 }} />
          </div>

          <div style={{
            padding: '6px 12px',
            borderRadius: 999,
            background: '#FEF3C7',
            color: '#A16207',
            fontSize: 11.5, fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            ⏱ Valable {remainingMin >= 60 ? `${Math.round(remainingMin / 60)}h` : `${remainingMin}min`}
          </div>

          <div style={{ width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Lien direct
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 10px',
              background: '#FAFAF7',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
            }}>
              <input
                type="text"
                readOnly
                value={url}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontSize: 11.5,
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                  color: '#374151',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  height: 28, padding: '0 10px',
                  border: '1px solid #E5E7EB',
                  borderRadius: 6,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: 11.5, fontWeight: 600,
                  color: copied ? '#15803D' : '#1C1A14',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontFamily: 'inherit',
                }}
              >
                {copied ? <><Check size={11} /> Copié</> : <><Copy size={11} /> Copier</>}
              </button>
            </div>
          </div>
        </div>

        {/* Hint */}
        <div style={{
          padding: '12px 20px 18px',
          fontSize: 12,
          color: '#6B7280',
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          1. Faites scanner le QR code par le client avec son téléphone<br />
          2. Il ouvre la page de signature sur son appareil<br />
          3. Il signe et confirme — vous recevez le PDF par email
        </div>
      </div>
    </div>,
    document.body,
  )
}
