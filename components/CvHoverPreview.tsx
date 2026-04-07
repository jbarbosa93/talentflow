'use client'
// Composant réutilisable pour l'aperçu CV au survol
// Utilisé dans CandidatsList et Pipeline

import { useRef, useState, useEffect } from 'react'
import { Eye, RotateCw } from 'lucide-react'
import { CvPreviewCanvas } from './CvPreviewCanvas'

interface CvHoverPreviewProps {
  cvUrl: string
  cvExt: string
  candidatId: string
  panelW?: number
  /** Side to display: auto if not specified */
  x?: number
}

export interface CvPreviewData {
  url: string
  ext: string
  x: number
  y: number
  rotation: number
  panelW: number
}

interface UseCvHoverPreviewReturn {
  previewData: CvPreviewData | null
  previewVisible: boolean
  previewZoom: number
  hoveredCvTimeout: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  setPreviewData: (d: CvPreviewData | null) => void
  setPreviewVisible: (v: boolean) => void
  setPreviewZoom: (z: number | ((prev: number) => number)) => void
}

export function useCvHoverPreview(): UseCvHoverPreviewReturn {
  const [previewData, setPreviewData] = useState<CvPreviewData | null>(null)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(1)
  const hoveredCvTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  return { previewData, previewVisible, previewZoom, hoveredCvTimeout, setPreviewData, setPreviewVisible, setPreviewZoom }
}

interface CvHoverTriggerProps {
  cvUrl: string
  cvNomFichier?: string | null
  candidatId: string
  children: React.ReactNode
  hook: UseCvHoverPreviewReturn
}

export function CvHoverTrigger({ cvUrl, cvNomFichier, candidatId, children, hook }: CvHoverTriggerProps) {
  const { hoveredCvTimeout, setPreviewData, setPreviewZoom, setPreviewVisible } = hook

  // Utilise le nom de fichier d'abord (plus fiable), puis l'URL en fallback
  const sourceForExt = (cvNomFichier || cvUrl || '').toLowerCase().split('?')[0]
  const rawExtCandidate = sourceForExt.split('.').pop() || ''
  const knownExts = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp']
  const ext = knownExts.includes(rawExtCandidate) ? rawExtCandidate : 'pdf'

  return (
    <div
      onMouseEnter={e => {
        if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        hoveredCvTimeout.current = setTimeout(() => {
          const savedRot = localStorage.getItem(`cv_rotation_${candidatId}`)
          const rotation = savedRot ? parseInt(savedRot, 10) : 0
          const screenW = window.innerWidth
          const spaceRight = screenW - rect.right - 24
          const spaceLeft = rect.right - 24
          const panelW = Math.min(820, Math.max(480, Math.max(spaceRight, spaceLeft)) - 8)
          const initZoom = Math.min(1, +(panelW / 840).toFixed(2))
          setPreviewData({ url: cvUrl, ext, x: rect.right, y: rect.top, rotation, panelW })
          setPreviewZoom(initZoom)
          setPreviewVisible(true)
        }, 120)
      }}
      onMouseLeave={() => {
        if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
        hoveredCvTimeout.current = setTimeout(() => setPreviewVisible(false), 200)
      }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

interface CvHoverPanelProps {
  hook: UseCvHoverPreviewReturn
}

export function CvHoverPanel({ hook }: CvHoverPanelProps) {
  const { previewData, previewVisible, previewZoom, hoveredCvTimeout, setPreviewVisible, setPreviewZoom, setPreviewData } = hook
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const previewPanRef = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 })

  if (!previewData) return null

  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1440
  const panelW = previewData.panelW ?? 820
  const spaceRight = screenW - previewData.x - 24
  const spaceLeft = previewData.x - 24
  const goLeft = spaceRight < panelW && spaceLeft > spaceRight

  return (
    <div
      onMouseEnter={() => {
        if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
        setPreviewVisible(true)
      }}
      onMouseLeave={() => {
        if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current)
        hoveredCvTimeout.current = setTimeout(() => setPreviewVisible(false), 200)
      }}
      style={{
        position: 'fixed',
        top: 20, bottom: 20,
        ...(goLeft ? { right: screenW - previewData.x + 12 } : { left: previewData.x + 12 }),
        width: panelW,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        zIndex: 500,
        pointerEvents: (previewVisible ? 'auto' : 'none') as React.CSSProperties['pointerEvents'],
        opacity: previewVisible ? 1 : 0,
        transition: 'opacity 0.1s ease',
      }}
    >
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--background)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Eye size={13} style={{ color: 'var(--primary)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>Aperçu CV</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setPreviewZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2))) }}
            style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)', fontWeight: 700 }}
          >{'\u2212'}</button>
          <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 36, textAlign: 'center' }}>{Math.round(previewZoom * 100)}%</span>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setPreviewZoom(z => Math.min(3, +(z + 0.25).toFixed(2))) }}
            style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)', fontWeight: 700 }}
          >+</button>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              const r = ((previewData.rotation || 0) + 90) % 360
              setPreviewData({ ...previewData, rotation: r })
            }}
            style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Rotation 90°"
          >
            <RotateCw size={12} style={{ color: 'var(--foreground)' }} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        ref={previewScrollRef}
        style={{ width: '100%', height: 'calc(100% - 41px)', overflow: 'auto', background: '#F1F5F9', cursor: 'grab' }}
        onMouseEnter={() => { if (hoveredCvTimeout.current) clearTimeout(hoveredCvTimeout.current) }}
        onMouseDown={e => {
          const el = previewScrollRef.current; if (!el) return
          previewPanRef.current = { active: true, startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
          el.style.cursor = 'grabbing'
        }}
        onMouseMove={e => {
          const d = previewPanRef.current; const el = previewScrollRef.current
          if (!d.active || !el) return
          el.scrollLeft = d.scrollLeft - (e.clientX - d.startX)
          el.scrollTop = d.scrollTop - (e.clientY - d.startY)
        }}
        onMouseUp={() => { previewPanRef.current.active = false; if (previewScrollRef.current) previewScrollRef.current.style.cursor = 'grab' }}
        onMouseLeave={() => { previewPanRef.current.active = false; if (previewScrollRef.current) previewScrollRef.current.style.cursor = 'grab' }}
      >
        {['jpg', 'jpeg', 'png', 'webp'].includes(previewData.ext) ? (
          <div style={{ width: `${previewZoom * 100}%`, minWidth: '100%', flexShrink: 0, position: 'relative', paddingTop: `${previewZoom * 100}%` }}>
            <div style={{ position: 'absolute', inset: 0, transform: `scale(${previewZoom})`, transformOrigin: 'top left', width: `${100 / previewZoom}%`, height: `${100 / previewZoom}%` }}>
              <img
                src={previewData.url}
                alt="CV"
                draggable={false}
                onDragStart={e => e.preventDefault()}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'none', transform: previewData.rotation ? `rotate(${previewData.rotation}deg)` : undefined, transformOrigin: 'center center' }}
              />
            </div>
          </div>
        ) : previewData.ext === 'pdf' ? (
          <CvPreviewCanvas
            url={previewData.url}
            zoom={previewZoom}
            rotation={previewData.rotation ?? 0}
            containerWidth={previewData.panelW ?? 820}
          />
        ) : ['doc', 'docx'].includes(previewData.ext) ? (
          <div style={{ width: `${previewZoom * 100}%`, height: `${Math.round(previewZoom * 5000)}px`, minWidth: '100%', minHeight: '100%', position: 'relative', flexShrink: 0 }}>
            <iframe
              key={`preview-doc-${previewData.url}`}
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewData.url)}&embedded=true`}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'none' }}
              title="Aperçu CV"
            />
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: 20 }}>
            Aperçu non disponible
          </div>
        )}
      </div>
    </div>
  )
}
