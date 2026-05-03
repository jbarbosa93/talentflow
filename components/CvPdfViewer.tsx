/**
 * v1.9.127 — Viewer PDF moderne basé sur react-pdf (PDF.js de Mozilla).
 * Remplace l'iframe Chrome native par un viewer custom :
 * - Rendu canvas haute résolution (zoom fluide)
 * - Miniatures de toutes les pages à gauche
 * - Navigation page par page
 * - Pas de bandes noires : fond crème doux comme une feuille de papier
 * - Compteur "Page X / N"
 * - Loader pendant le chargement
 *
 * Pour les CVs non-PDF (Word, image), continuer à utiliser l'iframe (proxy /api/cv/print).
 */
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

/* v1.9.127 — Configure le worker PDF.js via unpkg (URL stable, version pinnée
   à celle de react-pdf pour éviter mismatch). Évite l'erreur
   "Object.defineProperty called on non-object" qui survient quand
   webpack/turbopack tente de bundler le worker .mjs. */
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc =
    `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
}

interface Props {
  url: string
  rotation?: number          /* 0, 90, 180, 270 */
  zoom?: number              /* 0.5 — 3.0 (défaut 1) */
  showThumbnails?: boolean   /* miniatures à gauche, défaut true */
  className?: string
}

export default function CvPdfViewer({
  url, rotation = 0, zoom = 1, showThumbnails = true, className,
}: Props) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(720)
  const containerRef = useRef<HTMLDivElement>(null)

  /* Mesure la largeur du container pour rendre le PDF en pleine largeur (responsive) */
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width || 720
      setContainerWidth(Math.max(360, w - 32))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const onLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
    setCurrentPage(1)
  }, [])

  const onLoadError = useCallback((err: Error) => {
    console.error('[CvPdfViewer]', err)
    setError(err.message || 'Impossible de charger le PDF')
    setLoading(false)
  }, [])

  /* Source proxy pour éviter les pb CORS sur les signed URLs Supabase */
  const proxiedUrl = `/api/cv/print?url=${encodeURIComponent(url)}`

  /* File pour react-pdf (gardé stable via useMemo dans le parent idéalement) */
  const file = proxiedUrl

  /* Scroll vers la page courante quand on clique sur une miniature */
  const goToPage = (n: number) => {
    setCurrentPage(n)
    const el = document.querySelector(`[data-pdf-page="${n}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: 'flex', flexDirection: 'row', height: '100%', width: '100%',
        background: '#e8e3d6', /* fond crème comme proto V2 */
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Miniatures (sidebar gauche) — affichées seulement si plus d'une page */}
      {showThumbnails && numPages > 1 && (
        <aside style={{
          width: 110, flexShrink: 0,
          background: 'rgba(255,255,255,.4)',
          borderRight: '1px solid rgba(0,0,0,.06)',
          overflowY: 'auto', padding: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => goToPage(n)}
              title={`Page ${n}`}
              style={{
                background: 'white',
                border: `2px solid ${currentPage === n ? '#EAB308' : 'rgba(0,0,0,.08)'}`,
                borderRadius: 6, padding: 0, cursor: 'pointer',
                overflow: 'hidden', position: 'relative',
                transition: 'border-color 0.15s, transform 0.1s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
            >
              <Document file={file} loading={null} error={null}>
                <Page
                  pageNumber={n}
                  width={86}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  rotate={rotation}
                />
              </Document>
              <span style={{
                position: 'absolute', bottom: 2, right: 4,
                fontSize: 9, fontWeight: 700,
                color: currentPage === n ? '#A07A07' : 'rgba(0,0,0,.55)',
                background: 'rgba(255,255,255,.85)',
                padding: '0 4px', borderRadius: 3, lineHeight: 1.4,
              }}>{n}</span>
            </button>
          ))}
        </aside>
      )}

      {/* Pages PDF rendues en colonne */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'auto',
        padding: '24px 16px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 18,
      }}>
        {loading && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            padding: '60px 20px', color: '#5C5645',
          }}>
            <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Chargement du CV…</span>
          </div>
        )}
        {error && (
          <div style={{
            padding: '40px 20px', color: '#C2410C', fontSize: 13, textAlign: 'center',
            maxWidth: 400,
          }}>
            ⚠ Impossible d&apos;afficher le PDF.<br />
            <span style={{ opacity: 0.7, fontSize: 12 }}>{error}</span>
          </div>
        )}
        <Document
          file={file}
          onLoadSuccess={onLoadSuccess}
          onLoadError={onLoadError}
          loading={null}
          error={null}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              data-pdf-page={n}
              onMouseEnter={() => setCurrentPage(n)}
              style={{
                background: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 8px 32px -12px rgba(0,0,0,.18)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <Page
                pageNumber={n}
                width={containerWidth * zoom}
                rotate={rotation}
                renderTextLayer
                renderAnnotationLayer={false}
                loading={
                  <div style={{
                    width: containerWidth * zoom,
                    minHeight: containerWidth * zoom * 1.414,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#fafafa',
                  }}>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
                  </div>
                }
              />
            </div>
          ))}
        </Document>
      </div>

      {/* Compteur de pages flottant en bas-centre */}
      {numPages > 1 && !loading && !error && (
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(28,26,20,.85)', color: 'white',
          padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8, zIndex: 5,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 24px rgba(0,0,0,.15)',
        }}>
          <button
            onClick={() => goToPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            style={{
              background: 'transparent', border: 'none', color: 'white',
              cursor: currentPage <= 1 ? 'default' : 'pointer',
              opacity: currentPage <= 1 ? 0.4 : 1, padding: 0, display: 'flex',
            }}
          ><ChevronLeft size={14} /></button>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{currentPage} / {numPages}</span>
          <button
            onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
            style={{
              background: 'transparent', border: 'none', color: 'white',
              cursor: currentPage >= numPages ? 'default' : 'pointer',
              opacity: currentPage >= numPages ? 0.4 : 1, padding: 0, display: 'flex',
            }}
          ><ChevronRight size={14} /></button>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
