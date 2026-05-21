'use client'

// TalentFlow Compliance — Modal viewer recto/verso (plein écran)
// v2.9.34 — Images : ajustement auto à l'écran + zoom + téléchargement + impression.
//           PDF : iframe (zoom natif du navigateur) + téléchargement + impression.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, RotateCcw, ZoomIn, ZoomOut, Maximize2, Download, Printer } from 'lucide-react'

interface DocumentViewerModalProps {
  candidatId: string
  docId: string
  label: string
  initialSide: 'recto' | 'verso'
  hasRecto: boolean
  hasVerso: boolean
  /** Chemins Storage — servent à détecter le type de fichier (PDF vs image) */
  rectoPath?: string | null
  versoPath?: string | null
  onClose: () => void
}

const MIN_SCALE = 1
const MAX_SCALE = 5
const STEP = 0.5

export default function DocumentViewerModal({
  candidatId, docId, label, initialSide, hasRecto, hasVerso,
  rectoPath, versoPath, onClose,
}: DocumentViewerModalProps) {
  const [side, setSide] = useState<'recto' | 'verso'>(initialSide)
  const [scale, setScale] = useState(1)
  // Cache-buster figé à l'ouverture (évite un re-fetch à chaque clic zoom)
  const [ts] = useState(() => Date.now())

  const src = `/api/candidats/${candidatId}/documents/${docId}/file?side=${side}&t=${ts}`
  const currentPath = (side === 'recto' ? rectoPath : versoPath) || ''
  const ext = currentPath.split('.').pop()?.toLowerCase() || ''
  const isPdf = ext === 'pdf'

  // Reset du zoom quand on change de face
  useEffect(() => { setScale(1) }, [side])

  // Échap pour fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof window === 'undefined') return null

  const downloadName = `${label} - ${side}${ext ? '.' + ext : ''}`

  function handlePrint() {
    if (isPdf) {
      window.open(src, '_blank')
      return
    }
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) return
    w.document.write(
      `<!DOCTYPE html><html><head><title>${escapeAttr(label)}</title></head>`
      + `<body style="margin:0;display:flex;align-items:center;justify-content:center;background:#fff">`
      + `<img src="${src}" style="max-width:100%;max-height:100vh" `
      + `onload="setTimeout(function(){window.focus();window.print();},250)"></body></html>`
    )
    w.document.close()
  }

  const zoomLabel = scale <= 1 ? 'Ajusté' : `${Math.round(scale * 100)}%`

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9600,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, flexWrap: 'wrap',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 18, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{label}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            · {side}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Zoom — uniquement pour les images (le PDF a son propre zoom) */}
          {!isPdf && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setScale(s => Math.max(MIN_SCALE, +(s - STEP).toFixed(1)))}
                disabled={scale <= MIN_SCALE}
                title="Zoom arrière"
                style={{ ...whiteIconBtnStyle, opacity: scale <= MIN_SCALE ? 0.4 : 1 }}
              ><ZoomOut size={15} /></button>
              <button
                onClick={() => setScale(1)}
                title="Ajuster à l'écran"
                style={{ ...whiteBtnStyle, minWidth: 72, justifyContent: 'center' }}
              >
                {scale <= 1 ? <Maximize2 size={13} /> : null}{zoomLabel}
              </button>
              <button
                onClick={() => setScale(s => Math.min(MAX_SCALE, +(s + STEP).toFixed(1)))}
                disabled={scale >= MAX_SCALE}
                title="Zoom avant"
                style={{ ...whiteIconBtnStyle, opacity: scale >= MAX_SCALE ? 0.4 : 1 }}
              ><ZoomIn size={15} /></button>
            </div>
          )}

          {hasRecto && hasVerso && (
            <button
              onClick={() => setSide(s => s === 'recto' ? 'verso' : 'recto')}
              style={whiteBtnStyle}
            ><RotateCcw size={13} /> Voir {side === 'recto' ? 'verso' : 'recto'}</button>
          )}

          <a
            href={src}
            download={downloadName}
            title="Télécharger"
            style={{ ...whiteBtnStyle, textDecoration: 'none' }}
          ><Download size={14} /> Télécharger</a>

          <button onClick={handlePrint} title="Imprimer" style={whiteIconBtnStyle}>
            <Printer size={15} />
          </button>

          <button onClick={onClose} title="Fermer" style={whiteIconBtnStyle}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Zone document */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          flex: 1, minHeight: 0,
          display: 'flex',
          overflow: 'auto',
          padding: 20,
        }}
      >
        {isPdf ? (
          <iframe
            src={src}
            title={`${label} - ${side}`}
            style={{
              width: 'min(1100px, 100%)', height: '100%', margin: 'auto',
              background: '#fff', border: 'none', borderRadius: 8,
              boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${label} - ${side}`}
            style={scale <= 1
              ? {
                  margin: 'auto',
                  maxWidth: '100%', maxHeight: '100%',
                  objectFit: 'contain',
                  background: '#fff', borderRadius: 8,
                  boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
                }
              : {
                  margin: 'auto',
                  width: `${scale * 100}%`, height: 'auto', maxWidth: 'none',
                  background: '#fff', borderRadius: 8,
                  boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
                }}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const whiteBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
}

const whiteIconBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', cursor: 'pointer',
}
