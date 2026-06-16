// TalentFlow Sign — Viewer PDF public multi-pages (canvas pdfjs)
// v2.2.0 — Phase 3
//
// Pattern aligné sur CvPreviewCanvas.tsx + bypass webpack via /public/pdf.legacy.min.mjs
// Rendu toutes les pages d'un PDF en scroll vertical (style DocuSign, pas l'iframe Chrome).
// Mobile-first : taille auto-adapte au container, DPR pour qualité retina.
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  url: string
  /** Numéro de page à scroll-to quand prop change (1-indexed). */
  scrollToPage?: number
  /** Callback : nombre total de pages détecté */
  onLoad?: (numPages: number) => void
  /** Callback : page actuellement la plus visible à l'écran */
  onPageChange?: (page: number) => void
  /**
   * v2.2.0 Phase 4a-bis — Renderer optionnel d'overlay HTML par-dessus chaque page.
   * Reçoit les dimensions CSS rendues. Positionné absolu, scrolle avec le canvas.
   */
  renderPageOverlay?: (pageNum: number, sizePx: { width: number; height: number }) => React.ReactNode
}

interface PageRenderProps {
  pageNum: number
  pdfDoc: any
  containerWidth: number
  rootRef: React.RefObject<HTMLDivElement | null>
  onVisible: (pageNum: number) => void
  renderPageOverlay?: (pageNum: number, sizePx: { width: number; height: number }) => React.ReactNode
}

// Canvas par page (scroll vertical)
function PageCanvas({ pageNum, pdfDoc, containerWidth, rootRef, onVisible, renderPageOverlay }: PageRenderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const taskRef = useRef<any>(null)
  const [sizePx, setSizePx] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    ;(async () => {
      if (taskRef.current) { try { taskRef.current.cancel() } catch {} }
      try {
        const page = await pdfDoc.getPage(pageNum)
        if (cancelled) return
        const dpr = window.devicePixelRatio || 1
        // fit-to-container, max 920px (lisibilité desktop)
        const targetWidth = Math.min(containerWidth - 16, 920)
        const baseVp = page.getViewport({ scale: 1 })
        const scale = targetWidth / baseVp.width
        const viewport = page.getViewport({ scale: scale * dpr })
        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d')!
        canvas.width = viewport.width
        canvas.height = viewport.height
        const cssW = Math.round(viewport.width / dpr)
        const cssH = Math.round(viewport.height / dpr)
        canvas.style.width = `${cssW}px`
        canvas.style.height = `${cssH}px`
        const task = page.render({ canvasContext: ctx, viewport })
        taskRef.current = task
        await task.promise
        if (!cancelled) setSizePx({ width: cssW, height: cssH })
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') console.warn('[PublicPdfViewer]', e)
      }
    })()
    return () => {
      cancelled = true
      if (taskRef.current) { try { taskRef.current.cancel() } catch {} }
    }
  }, [pageNum, pdfDoc, containerWidth])

  // Track visibility for "current page" indicator
  useEffect(() => {
    if (!wrapRef.current) return
    const target = wrapRef.current
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting && e.intersectionRatio > 0.5) {
            onVisible(pageNum)
          }
        })
      },
      { threshold: [0.5], root: rootRef.current || undefined }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [pageNum, onVisible, rootRef])

  return (
    <div
      ref={wrapRef}
      data-page={pageNum}
      style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: 16,
        position: 'relative',
      }}
    >
      <div style={{
        position: 'relative',
        background: '#fff',
        boxShadow: '0 2px 16px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
        {/* v2.2.0 Phase 4a-bis — Overlay HTML interactif (champs à remplir) */}
        {sizePx && renderPageOverlay && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0,
            width: sizePx.width,
            height: sizePx.height,
            pointerEvents: 'auto',
            // v2.11.3 — FIX scroll Android : l'overlay couvre TOUTE la page, il
            // capturait le glissement à un doigt même hors champ (scroll bloqué,
            // l'utilisateur devait scroller à deux doigts). `pan-y` laisse passer
            // le scroll vertical tout en gardant les taps. iOS était déjà OK.
            touchAction: 'pan-y',
          }}>
            {renderPageOverlay(pageNum, sizePx)}
          </div>
        )}
        {/* Numéro page en overlay coin haut-droit */}
        <div style={{
          position: 'absolute',
          top: 6, right: 6,
          background: 'rgba(0,0,0,0.55)',
          color: 'white',
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 7px',
          borderRadius: 999,
          backdropFilter: 'blur(2px)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {pageNum}
        </div>
      </div>
    </div>
  )
}

export default function PublicPdfViewer({ url, scrollToPage, onLoad, onPageChange, renderPageOverlay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [numPages, setNumPages] = useState(0)
  const [containerWidth, setContainerWidth] = useState(720)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1)

  // Refs pour stabiliser les callbacks parents (évite re-déclenchement useEffect en boucle
  // quand onLoad/onPageChange sont inline arrow functions côté parent)
  const onLoadRef = useRef(onLoad)
  const onPageChangeRef = useRef(onPageChange)
  useEffect(() => { onLoadRef.current = onLoad }, [onLoad])
  useEffect(() => { onPageChangeRef.current = onPageChange }, [onPageChange])

  // Mesure largeur container (responsive)
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width || 720
      setContainerWidth(Math.max(280, w))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Charge PDF (bypass webpack via /public, cf PDFViewer.tsx Phase 2.1)
  // ⚠️ Deps SEULEMENT [url] — onLoad est dans un ref pour ne pas relancer en boucle
  useEffect(() => {
    if (!url) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setPdfDoc(null)
    ;(async () => {
      try {
        const pdfjsUrl: string = '/pdf.legacy.min.mjs'
        const mod = await import(/* webpackIgnore: true */ pdfjsUrl) as any
        const pdfjs = mod.default || mod
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.legacy.min.mjs'
        }
        const doc = await pdfjs.getDocument({ url, withCredentials: false }).promise
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setLoading(false)
        onLoadRef.current?.(doc.numPages)
      } catch (e: any) {
        if (cancelled) return
        console.error('[PublicPdfViewer] load error', e)
        setError(e?.message || 'Impossible de charger le PDF')
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [url])

  // Scroll to page externe (depuis sidebar)
  useEffect(() => {
    if (!scrollToPage || !containerRef.current) return
    const el = containerRef.current.querySelector(`[data-page="${scrollToPage}"]`)
    if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [scrollToPage])

  const handlePageVisible = useCallback((p: number) => {
    setCurrentVisiblePage(p)
    onPageChangeRef.current?.(p)
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: '#F1ECE0', // crème un peu plus chaud que le fond
        padding: '16px 8px 80px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 60, color: '#6B7280', fontSize: 13, gap: 8,
        }}>
          <Loader2 size={18} className="animate-spin" />
          Chargement du document…
        </div>
      )}
      {error && (
        <div style={{
          padding: 24, textAlign: 'center', color: '#DC2626', fontSize: 13,
          background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8,
          maxWidth: 480, margin: '40px auto',
        }}>
          {error}
        </div>
      )}
      {pdfDoc && Array.from({ length: numPages }, (_, i) => (
        <PageCanvas
          key={`${url}-${i + 1}`}
          pageNum={i + 1}
          pdfDoc={pdfDoc}
          containerWidth={containerWidth}
          rootRef={containerRef}
          onVisible={handlePageVisible}
          renderPageOverlay={renderPageOverlay}
        />
      ))}
      {/* Page indicator floating bottom-center */}
      {pdfDoc && numPages > 1 && (
        <div style={{
          position: 'sticky',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'fit-content',
          margin: '0 auto',
          background: 'rgba(28,26,20,0.85)',
          color: 'white',
          fontSize: 12,
          fontWeight: 600,
          padding: '6px 12px',
          borderRadius: 999,
          backdropFilter: 'blur(8px)',
          fontVariantNumeric: 'tabular-nums',
          pointerEvents: 'none',
        }}>
          Page {currentVisiblePage} / {numPages}
        </div>
      )}
    </div>
  )
}
