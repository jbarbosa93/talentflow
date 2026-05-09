// TalentFlow Sign — Modal de capture de signature (canvas tracé uniquement)
// v2.3.12 — Phase 4a refondue
//
// Bug 2 v2.3.12 — Onglet "Saisir" SUPPRIMÉ. Garde uniquement "Tracer" (canvas).
//   + Bouton "Adopter" en HAUT du modal sur desktop (en plus du bottom).
// Bug 3 v2.3.12 — Canvas FOND TRANSPARENT (pas de fillRect blanc).
//   La signature stamp directement sur le PDF sans cacher le texte/lignes.
//
// Output : data URL PNG transparent → drawImage pdf-lib respecte l'alpha.
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, PenLine, Trash2, Check } from 'lucide-react'

interface Props {
  open: boolean
  defaultName?: string         // Conservé pour rétrocompat (non utilisé sans onglet Saisir)
  onClose: () => void
  // v2.2.0 → v2.3.12 : `method` reste 'drawn' (pas d'autre option).
  onAdopt: (dataUrl: string, method: 'drawn' | 'typed') => void
}

export default function SignaturePad({ open, onClose, onAdopt }: Props) {
  const [mounted, setMounted] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const check = () => {
      const narrow = typeof window !== 'undefined' && window.innerWidth < 700
      const touch = typeof window !== 'undefined'
        && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
      setIsMobile(!!(narrow || touch))
    }
    check()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', check)
      return () => window.removeEventListener('resize', check)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setHasDrawn(false)
      setSubmitting(false)
    }
  }, [open])

  // ─── Setup canvas (DPR retina, FOND TRANSPARENT, ligne lisse) ───
  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    // v2.3.12 Bug 3 — PAS de fillRect blanc : canvas reste TRANSPARENT.
    // L'alpha sera préservé dans le PNG → la signature stampée ne cache pas
    // les lignes/texte du PDF en dessous.
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0a0a0a'
    ctx.lineWidth = 2.4
    setHasDrawn(false)
  }, [open])

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
    // v2.3.12 Bug 3 — clearRect (transparent) au lieu de fillRect blanc
    ctx.clearRect(0, 0, rect.width, rect.height)
    setHasDrawn(false)
  }

  const handleAdopt = () => {
    if (submitting) return
    if (!hasDrawn) {
      alert('Tracez votre signature avant de valider.')
      return
    }
    setSubmitting(true)
    try {
      const dataUrl = canvasRef.current!.toDataURL('image/png')
      onAdopt(dataUrl, 'drawn')
    } catch (e) {
      console.error('[SignaturePad] adopt error', e)
      setSubmitting(false)
    }
  }

  if (!open || !mounted) return null

  // v2.3.12 Bug 2 — Bouton Adopter (réutilisé en haut desktop + en bas)
  const adoptDisabled = submitting || !hasDrawn
  const renderAdoptButton = (size: 'top' | 'bottom') => (
    <button
      type="button"
      onClick={handleAdopt}
      disabled={adoptDisabled}
      style={{
        flex: size === 'bottom' && isMobile ? 2 : undefined,
        padding: isMobile ? '0 18px' : '0 16px',
        height: isMobile ? 48 : 36,
        fontSize: isMobile ? 15 : 13,
        fontWeight: 700,
        border: '1px solid #1C1A14', borderRadius: 8,
        background: '#f59e0b', color: '#000',
        cursor: adoptDisabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        opacity: adoptDisabled ? 0.4 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <Check size={isMobile ? 16 : 14} />
      Adopter et signer
    </button>
  )

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
          maxWidth: isMobile ? '100%' : 640,
          maxHeight: isMobile ? '100vh' : '92vh',
          height: isMobile ? '100%' : 'auto',
          background: '#fff',
          borderRadius: isMobile ? 0 : 16,
          border: isMobile ? 'none' : '1px solid #E5E7EB',
          boxShadow: isMobile ? 'none' : '0 24px 64px rgba(0,0,0,0.30)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header — v2.3.12 Bug 2 : bouton Adopter en haut sur DESKTOP uniquement */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#FEF3C7', color: '#A16207',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <PenLine size={16} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14' }}>
                Adopter votre signature
              </div>
              <div style={{ fontSize: 11.5, color: '#6B7280' }}>
                Cette signature sera appliquée à tous les champs du document
              </div>
            </div>
          </div>
          {/* Desktop : bouton Adopter en HAUT (raccourci) */}
          {!isMobile && renderAdoptButton('top')}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid #E5E7EB', background: '#fff',
              cursor: 'pointer', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — Tracer uniquement (onglet Saisir supprimé en v2.3.12) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <p style={{ margin: '0 0 12px 0', fontSize: isMobile ? 14 : 12.5, color: '#6B7280' }}>
            {isMobile
              ? <>✍️ <strong>Signez avec votre doigt</strong> dans la zone ci-dessous :</>
              : <>Tracez votre signature avec la souris ou le stylet dans la zone ci-dessous :</>}
          </p>
          <div
            style={{
              position: 'relative',
              border: '2px dashed #E5E7EB',
              borderRadius: 12,
              background: '#fff',
              height: isMobile ? 280 : 220,
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
              padding: isMobile ? '0 16px' : '6px 12px',
              height: isMobile ? 44 : undefined,
              fontSize: isMobile ? 14 : 12,
              fontWeight: 600,
              border: '1px solid #E5E7EB', borderRadius: 8,
              background: '#fff', color: hasDrawn ? '#dc2626' : '#9CA3AF',
              cursor: hasDrawn ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit',
            }}
          >
            <Trash2 size={isMobile ? 14 : 12} />
            Effacer
          </button>

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

        {/* Footer — bouton Adopter en bas (mobile + desktop) */}
        <div style={{
          padding: isMobile ? '14px 16px' : '12px 20px',
          paddingBottom: isMobile ? 'max(14px, env(safe-area-inset-bottom, 14px))' : 12,
          borderTop: '1px solid #E5E7EB',
          background: '#FAFAF7',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: isMobile ? 10 : 8,
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              flex: isMobile ? 1 : undefined,
              padding: isMobile ? '0 16px' : '10px 16px',
              height: isMobile ? 48 : undefined,
              fontSize: isMobile ? 15 : 13,
              fontWeight: 600,
              border: '1px solid #E5E7EB', borderRadius: 8,
              background: '#fff', color: '#1C1A14', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          {renderAdoptButton('bottom')}
        </div>
      </div>
    </div>,
    document.body
  )
}
