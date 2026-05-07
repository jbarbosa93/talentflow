// TalentFlow Sign — Modal de capture de signature (canvas tracé + typed)
// v2.2.0 — Phase 4a
//
// 2 onglets :
//  - "Tracer" : canvas HTML5 mouse + touch (mobile = signer au doigt)
//  - "Saisir" : input texte rendu en police cursive (Caveat, Google Fonts)
//
// Output : data URL PNG (transparent → on stamp directement sur le PDF Phase 4b).
// Mobile-first : full-width canvas, touch-action: none pour éviter le scroll.
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, PenLine, Type, Trash2, Check } from 'lucide-react'
import { Caveat } from 'next/font/google'

// Import font cursive Caveat (Google Fonts)
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

interface Props {
  open: boolean
  defaultName?: string         // Pré-rempli pour l'onglet "Saisir"
  onClose: () => void
  onAdopt: (dataUrl: string, method: 'drawn' | 'typed') => void
}

type Tab = 'draw' | 'type'

export default function SignaturePad({ open, defaultName, onClose, onAdopt }: Props) {
  const [tab, setTab] = useState<Tab>('draw')
  const [mounted, setMounted] = useState(false)
  const [typedValue, setTypedValue] = useState(defaultName || '')
  const [hasDrawn, setHasDrawn] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (open) {
      setTab('draw')
      setTypedValue(defaultName || '')
      setHasDrawn(false)
      setSubmitting(false)
    }
  }, [open, defaultName])

  // ─── Setup canvas (DPR retina, fond blanc, ligne lisse) ───
  useEffect(() => {
    if (!open || tab !== 'draw') return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0a0a0a'
    ctx.lineWidth = 2.4
    setHasDrawn(false)
  }, [open, tab])

  const getPoint = (e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current!
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = getPoint(e)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const p = getPoint(e)
    const last = lastPointRef.current
    if (last) {
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    lastPointRef.current = p
    if (!hasDrawn) setHasDrawn(true)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPointRef.current = null
    try { canvasRef.current?.releasePointerCapture(e.pointerId) } catch {}
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasDrawn(false)
  }

  // ─── Render typed signature → canvas → data URL ───
  const renderTypedToDataUrl = (text: string): string => {
    const canvas = document.createElement('canvas')
    const w = 600
    const h = 180
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#0a0a0a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Font Caveat — fallback générique cursive si Caveat pas chargée
    ctx.font = `600 64px ${caveat.style.fontFamily}, "Caveat", "Brush Script MT", cursive`
    ctx.fillText(text || ' ', w / 2, h / 2)
    return canvas.toDataURL('image/png')
  }

  const handleAdopt = () => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (tab === 'draw') {
        if (!hasDrawn) {
          alert('Tracez votre signature avant de valider.')
          setSubmitting(false)
          return
        }
        const dataUrl = canvasRef.current!.toDataURL('image/png')
        onAdopt(dataUrl, 'drawn')
      } else {
        const trimmed = typedValue.trim()
        if (!trimmed) {
          alert('Saisissez votre nom avant de valider.')
          setSubmitting(false)
          return
        }
        const dataUrl = renderTypedToDataUrl(trimmed)
        onAdopt(dataUrl, 'typed')
      }
    } catch (e) {
      console.error('[SignaturePad] adopt error', e)
      setSubmitting(false)
    }
  }

  if (!open || !mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
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
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '92vh',
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E5E7EB',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
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
              <PenLine size={16} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14' }}>
                Adopter votre signature
              </div>
              <div style={{ fontSize: 11.5, color: '#6B7280' }}>
                Cette signature sera appliquée à tous les champs du document
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid #E5E7EB', background: '#fff',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '8px 12px',
          background: '#FAFAF7', borderBottom: '1px solid #E5E7EB',
        }}>
          <TabButton active={tab === 'draw'} onClick={() => setTab('draw')} icon={PenLine}>
            Tracer
          </TabButton>
          <TabButton active={tab === 'type'} onClick={() => setTab('type')} icon={Type}>
            Saisir
          </TabButton>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'draw' ? (
            <>
              <p style={{ margin: '0 0 12px 0', fontSize: 12.5, color: '#6B7280' }}>
                Tracez votre signature avec le doigt, le stylet ou la souris dans la zone ci-dessous :
              </p>
              <div
                style={{
                  position: 'relative',
                  border: '2px dashed #E5E7EB',
                  borderRadius: 12,
                  background: '#fff',
                  height: 220,
                  overflow: 'hidden',
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    touchAction: 'none',
                    cursor: 'crosshair',
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />
                {!hasDrawn && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#D1D5DB',
                    fontSize: 13,
                    pointerEvents: 'none',
                    fontStyle: 'italic',
                  }}>
                    Signez ici
                  </div>
                )}
                {/* Ligne de signature en bas */}
                <div style={{
                  position: 'absolute',
                  bottom: 24, left: '8%', right: '8%',
                  borderTop: '1px solid #E5E7EB',
                  pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute',
                  bottom: 6, left: 0, right: 0,
                  textAlign: 'center',
                  fontSize: 10, color: '#D1D5DB', letterSpacing: '0.04em',
                  pointerEvents: 'none',
                }}>
                  ✕ Signature
                </div>
              </div>
              <button
                type="button"
                onClick={clearCanvas}
                disabled={!hasDrawn}
                style={{
                  marginTop: 10,
                  padding: '6px 12px',
                  fontSize: 12, fontWeight: 600,
                  border: '1px solid #E5E7EB', borderRadius: 6,
                  background: '#fff', color: hasDrawn ? '#dc2626' : '#9CA3AF',
                  cursor: hasDrawn ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: 'inherit',
                }}
              >
                <Trash2 size={12} />
                Effacer
              </button>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 12px 0', fontSize: 12.5, color: '#6B7280' }}>
                Saisissez votre nom complet — il sera rendu en signature manuscrite cursive :
              </p>
              <input
                type="text"
                autoFocus
                placeholder="Votre nom complet"
                value={typedValue}
                onChange={e => setTypedValue(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: 14,
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  background: '#FAFAF7',
                  color: '#1C1A14',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{
                marginTop: 16,
                padding: '24px 16px',
                border: '2px dashed #E5E7EB',
                borderRadius: 12,
                background: '#fff',
                minHeight: 140,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <div
                  className={caveat.className}
                  style={{
                    fontSize: 56,
                    fontWeight: 600,
                    color: '#0a0a0a',
                    textAlign: 'center',
                    lineHeight: 1,
                    wordBreak: 'break-word',
                    minHeight: 60,
                  }}
                >
                  {typedValue.trim() || (
                    <span style={{ color: '#D1D5DB', fontStyle: 'italic', fontSize: 24 }}>
                      Aperçu de la signature
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Note légale ZertES */}
          <div style={{
            marginTop: 14,
            padding: '10px 12px',
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: 8,
            fontSize: 11.5,
            color: '#0369A1',
            lineHeight: 1.5,
          }}>
            En cliquant sur <strong>« Adopter et signer »</strong>, j&apos;accepte que la
            représentation électronique de ma signature ait la même valeur juridique
            qu&apos;une signature manuscrite (ZertES).
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #E5E7EB',
          background: '#FAFAF7',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 600,
              border: '1px solid #E5E7EB', borderRadius: 8,
              background: '#fff', color: '#1C1A14', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleAdopt}
            disabled={submitting || (tab === 'draw' && !hasDrawn) || (tab === 'type' && !typedValue.trim())}
            style={{
              padding: '10px 18px', fontSize: 13, fontWeight: 700,
              border: '1px solid #1C1A14', borderRadius: 8,
              background: '#f59e0b', color: '#000', cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: ((tab === 'draw' && !hasDrawn) || (tab === 'type' && !typedValue.trim())) ? 0.4 : 1,
            }}
          >
            <Check size={14} />
            Adopter et signer
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function TabButton({
  active, onClick, icon: Icon, children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof PenLine
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 14px',
        fontSize: 13, fontWeight: 600,
        border: 'none',
        borderRadius: 6,
        background: active ? '#fff' : 'transparent',
        color: active ? '#1C1A14' : '#6B7280',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'all 0.15s',
      }}
    >
      <Icon size={13} />
      {children}
    </button>
  )
}
