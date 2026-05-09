// TalentFlow Rapports — Modal viewer PDF inline (Bug 2a v2.3.9)
// Affiche le PDF dans une iframe + bouton Télécharger + bouton Fermer.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  /** URL absolue ou relative du PDF (route API). Le composant fetche en blob
   *  pour pouvoir l'afficher dans iframe + télécharger sans double-fetch. */
  url: string
  /** Nom de fichier souhaité au téléchargement */
  filename: string
  /** Titre affiché dans le header du modal */
  title?: string
  /** v2.3.16 — Si présent, fait fetch en POST avec ce body JSON au lieu de GET.
   *  Utilisé pour preview templates avec données locales non sauvegardées. */
  postBody?: unknown
  onClose: () => void
}

export default function PdfPreviewModal({ url, filename, title, postBody, onClose }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch + convertit en blob URL pour iframe (gère auth/redirects côté API)
  // v2.3.16 — Si postBody fourni, fait POST avec body JSON. Sinon GET.
  // Sérialise postBody en stable JSON pour useEffect dependency (évite refetch
  // si la référence change mais le contenu non).
  const postBodyKey = postBody ? JSON.stringify(postBody) : null
  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    setLoading(true)
    setError(null)
    const fetchOpts: RequestInit = postBodyKey
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: postBodyKey,
        }
      : { method: 'GET' }
    fetch(url, fetchOpts)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.error || `HTTP ${r.status}`)
        }
        return r.blob()
      })
      .then(blob => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setBlobUrl(createdUrl)
      })
      .catch(e => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Erreur chargement PDF')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [url, postBodyKey])

  // ESC pour fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleDownload = () => {
    if (!blobUrl) { toast.error('PDF non chargé'); return }
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success('PDF téléchargé')
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(960px, 95vw)',
          height: 'min(88vh, 900px)',
          background: 'var(--card)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
              fontSize: 22,
              fontWeight: 400,
              color: 'var(--foreground)',
              letterSpacing: '-0.01em',
              lineHeight: 1.1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {title || 'Aperçu du PDF'}
            </div>
            <div style={{
              fontSize: 11.5, color: 'var(--muted)', marginTop: 4,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            }}>
              {filename}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!blobUrl}
            style={{
              padding: '8px 14px',
              fontSize: 13, fontWeight: 700,
              border: '1px solid #1C1A14',
              borderRadius: 10,
              background: '#EAB308', color: '#1C1A14',
              cursor: blobUrl ? 'pointer' : 'not-allowed',
              opacity: blobUrl ? 1 : 0.5,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit',
            }}
          >
            <Download size={13} />
            Télécharger
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 34, height: 34,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--card)',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Viewer */}
        <div style={{
          flex: 1,
          background: '#525659',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {loading && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, color: '#fff',
            }}>
              <Loader2 size={20} className="animate-spin" />
              <span style={{ fontSize: 13 }}>Chargement du PDF…</span>
            </div>
          )}
          {error && !loading && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, color: '#fff', padding: 24, textAlign: 'center',
            }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Erreur de chargement</span>
              <span style={{ fontSize: 12.5, opacity: 0.85 }}>{error}</span>
            </div>
          )}
          {blobUrl && !error && (
            <iframe
              src={blobUrl}
              title={title || 'Aperçu PDF'}
              style={{
                width: '100%', height: '100%',
                border: 'none', display: 'block',
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
