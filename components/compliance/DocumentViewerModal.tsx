'use client'

// TalentFlow Compliance — Modal viewer recto/verso (plein écran)
// v2.5.0

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, RotateCcw } from 'lucide-react'

interface DocumentViewerModalProps {
  candidatId: string
  docId: string
  label: string
  initialSide: 'recto' | 'verso'
  hasRecto: boolean
  hasVerso: boolean
  onClose: () => void
}

export default function DocumentViewerModal({
  candidatId, docId, label, initialSide, hasRecto, hasVerso, onClose,
}: DocumentViewerModalProps) {
  const [side, setSide] = useState<'recto' | 'verso'>(initialSide)
  const src = `/api/candidats/${candidatId}/documents/${docId}/file?side=${side}&t=${Date.now()}`

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9600,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
            fontSize: 18, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{label}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            · {side}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasRecto && hasVerso && (
            <button
              onClick={() => setSide(s => s === 'recto' ? 'verso' : 'recto')}
              style={whiteBtnStyle}
            ><RotateCcw size={13} /> Voir {side === 'recto' ? 'verso' : 'recto'}</button>
          )}
          <button onClick={onClose} style={whiteIconBtnStyle}><X size={16} /></button>
        </div>
      </div>
      <div onClick={e => e.stopPropagation()} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20, overflow: 'hidden' }}>
        <iframe
          src={src}
          title={`${label} - ${side}`}
          style={{
            width: 'min(1100px, 100%)', height: '100%',
            background: '#fff', border: 'none',
            borderRadius: 8,
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}
        />
      </div>
    </div>,
    document.body
  )
}

const whiteBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
}

const whiteIconBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', cursor: 'pointer',
}
