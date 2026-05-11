// TalentFlow Rapports — Modal viewer rapport complété (candidat)
// v2.4.2 — Phase 2.1
//
// Affiche le PDF du rapport en iframe + boutons :
//   - Télécharger (lien direct PDF, target=_blank)
//   - Partager (Web Share API : iOS Safari, Android Chrome, fallback clipboard)
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Share2, X as XIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  /** URL publique du PDF (route /api/reports/[slug]/submissions/[id]/download) */
  pdfUrl: string
  /** Titre du rapport pour le partage Web Share */
  title: string
  /** Sous-titre affiché dans le header (ex: "Semaine 19 · 11.05 → 17.05") */
  subtitle?: string
}

export default function SubmissionViewerModal({ open, onClose, pdfUrl, title, subtitle }: Props) {
  const [mounted, setMounted] = useState(false)
  const [sharing, setSharing] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const handleDownload = () => {
    window.open(pdfUrl, '_blank', 'noopener,noreferrer')
  }

  const handleShare = async () => {
    setSharing(true)
    try {
      const absoluteUrl = pdfUrl.startsWith('http')
        ? pdfUrl
        : `${window.location.origin}${pdfUrl}`
      const shareData = {
        title,
        text: `${title}${subtitle ? ` — ${subtitle}` : ''}`,
        url: absoluteUrl,
      }
      // Web Share API native (iOS Safari + Android Chrome récents)
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        try {
          await (navigator as any).share(shareData)
          return
        } catch (err: any) {
          // AbortError = user a annulé, pas une vraie erreur
          if (err?.name === 'AbortError') return
          // Sinon → fallback clipboard
        }
      }
      // Fallback : copie l'URL dans le presse-papier
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(absoluteUrl)
        toast.success('Lien copié — colle-le où tu veux (WhatsApp, SMS, mail…)')
      } else {
        toast.error('Partage non supporté sur ce navigateur')
      }
    } finally {
      setSharing(false)
    }
  }

  if (!mounted || !open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          height: '100%',
          maxWidth: 900,
          maxHeight: '100vh',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px',
          borderBottom: '1px solid #E5E7EB',
          paddingTop: 'max(12px, env(safe-area-inset-top, 12px))',
        }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: '1px solid #E5E7EB',
              background: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#1C1A14',
              flexShrink: 0,
            }}
          >
            <XIcon size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1A14', lineHeight: 1.2 }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ marginTop: 2, fontSize: 11.5, color: '#6B7280' }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {/* PDF iframe */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#F3F4F6' }}>
          <iframe
            src={pdfUrl}
            title={title}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>

        {/* Footer actions */}
        <div style={{
          flexShrink: 0,
          display: 'flex', gap: 8,
          padding: '12px 14px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
          borderTop: '1px solid #E5E7EB',
          background: '#fff',
        }}>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            style={{
              flex: 1, minHeight: 48,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 14px',
              background: '#25D366',
              color: '#fff',
              border: '1px solid #128C7E',
              borderRadius: 10,
              fontSize: 14, fontWeight: 700,
              cursor: sharing ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: sharing ? 0.7 : 1,
            }}
          >
            {sharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
            Partager
          </button>
          <button
            type="button"
            onClick={handleDownload}
            style={{
              flex: 1, minHeight: 48,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 14px',
              background: '#EAB308',
              color: '#1C1A14',
              border: '1px solid #1C1A14',
              borderRadius: 10,
              fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Download size={16} />
            Télécharger
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
