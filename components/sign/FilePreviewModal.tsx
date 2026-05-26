// TalentFlow Sign — Modal preview de fichier (PDF/image)
// Extrait de /sign/[envelopeId]/page.tsx en v2.9.72 pour réutilisation par
// l'aide visuelle des champs (SignField.helpAttachment).
//
// Patterns appliqués :
//  - #10 modal portalisé (createPortal sur document.body) → ignore les ancêtres
//    transform/filter qui cassent position:fixed
//  - Cohérent avec DocumentViewerModal de la Conformité fiche candidat
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileText } from 'lucide-react'

export interface FilePreviewModalProps {
  url: string
  name: string
  mimeType: string
  onClose: () => void
}

export default function FilePreviewModal({ url, name, mimeType, onClose }: FilePreviewModalProps) {
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  const isImg = mimeType.startsWith('image/')
  const isPdf = mimeType === 'application/pdf'
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(960px, 96vw)', height: 'min(92vh, 1100px)',
          background: 'var(--card)', borderRadius: 14,
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}
      >
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </div>
          {isImg && (
            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <button type="button" onClick={() => setZoom(z => Math.max(1, z - 0.5))}
                className="neo-btn-ghost neo-btn-sm" style={{ fontSize: 12, minWidth: 28 }} disabled={zoom <= 1}>−</button>
              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 36, textAlign: 'center' }}>{zoom}×</span>
              <button type="button" onClick={() => setZoom(z => Math.min(5, z + 0.5))}
                className="neo-btn-ghost neo-btn-sm" style={{ fontSize: 12, minWidth: 28 }} disabled={zoom >= 5}>+</button>
            </div>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="neo-btn-ghost neo-btn-sm" style={{ fontSize: 12, textDecoration: 'none' }}
            title="Ouvrir dans un nouvel onglet (pour imprimer)">
            🖨 Imprimer
          </a>
          <a href={url} download={name}
            className="neo-btn-ghost neo-btn-sm" style={{ fontSize: 12, textDecoration: 'none' }}>
            <Download size={12} /> Télécharger
          </a>
          <button type="button" onClick={onClose}
            className="neo-btn-ghost neo-btn-sm" style={{ fontSize: 12 }}>
            ✕
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#f5f5f5',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          {isPdf ? (
            <iframe src={url} title={name}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
          ) : isImg ? (
            <img src={url} alt={name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 120ms' }} />
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
              <FileText size={48} style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 13 }}>Prévisualisation non disponible pour ce type de fichier.</div>
              <a href={url} download={name} className="neo-btn-yellow neo-btn-sm"
                style={{ marginTop: 16, display: 'inline-flex', textDecoration: 'none' }}>
                <Download size={12} /> Télécharger
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
