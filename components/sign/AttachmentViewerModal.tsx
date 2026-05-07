// TalentFlow Sign — Modal de visualisation d'un document attaché (Phase 4a-bis-5)
// v2.2.0
//
// Affiche un PDF en plein écran avec :
//  - Bouton Télécharger (download attribute)
//  - Bouton Imprimer (open new tab + window.print())
//  - Bouton Fermer
//
// URL d'accès :
//   - Si token (côté candidat) : /api/sign/document/{token}?path=... (proxy auth)
//   - Sinon (preview admin) : URL signée Storage directe
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { X as XIcon, Download, Printer, Loader2 } from 'lucide-react'

const PublicPdfViewer = dynamic(() => import('./PublicPdfViewer'), { ssr: false })

interface Props {
  open: boolean
  url: string                  // URL du PDF (proxy ou direct)
  filename: string
  label: string                // titre affiché en header
  onClose: () => void
}

export default function AttachmentViewerModal({ open, url, filename, label, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Bloque le scroll body quand modal ouvert
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open || !mounted) return null

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handlePrint = () => {
    // Ouvre le PDF dans un nouvel onglet et trigger print après load
    const w = window.open(url, '_blank', 'noopener,noreferrer')
    if (w) {
      w.addEventListener('load', () => {
        try { w.print() } catch { /* navigateur peut bloquer */ }
      })
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
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
          width: 'min(960px, 100%)',
          height: 'min(90vh, 100%)',
          background: '#fff',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        }}
      >
        {/* Header */}
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid #E5E7EB',
          background: '#FAFAF7',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A16207' }}>
              Document
            </div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: '#1C1A14',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              marginTop: 2,
            }}>
              {label}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            style={btnSecondary}
            title="Télécharger le PDF"
          >
            <Download size={13} />
            <span className="tf-hide-mobile">Télécharger</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            style={btnSecondary}
            title="Imprimer le PDF"
          >
            <Printer size={13} />
            <span className="tf-hide-mobile">Imprimer</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            style={btnIcon}
            title="Fermer"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* PDF viewer */}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {url ? (
            <PublicPdfViewer url={url} />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: '#6B7280', gap: 8,
            }}>
              <Loader2 size={18} className="animate-spin" />
              Chargement…
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 640px) {
          .tf-hide-mobile { display: none; }
        }
      `}</style>
    </div>,
    document.body,
  )
}

const btnSecondary: React.CSSProperties = {
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 600,
  background: '#fff',
  color: '#1C1A14',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  whiteSpace: 'nowrap',
}

const btnIcon: React.CSSProperties = {
  width: 32, height: 32,
  background: 'transparent',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
  color: '#6B7280',
  flexShrink: 0,
}
