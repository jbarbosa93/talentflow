// TalentFlow Sign — PDF Viewer pour l'éditeur (1 page à la fois, canvas manuel)
// v2.2.0 — Phase 2 — réécrit sans react-pdf (cf. bug double-version pdfjs-dist)
//
// Pattern aligné sur components/CvPreviewCanvas.tsx :
// - dynamic import async de pdfjs-dist (évite l'évaluation du module au top-level)
// - worker servi depuis /public/pdf.worker.min.mjs (URL stable, pas de bundling)
// - render canvas manuel avec contrôle DPR pour qualité
//
// API stable : fileUrl, page (1-based), width (px). Émet renderedWidth/Height
// pour que FieldsCanvas overlay fasse 1:1.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

export interface PageRenderInfo {
  page: number
  pdfWidth: number   // pts (intrinsic)
  pdfHeight: number  // pts (intrinsic)
  renderedWidth: number   // px (CSS)
  renderedHeight: number  // px (CSS)
}

interface Props {
  fileUrl: string
  page: number                                  // 1-based
  width: number                                 // largeur cible en px (CSS)
  onLoadSuccess?: (numPages: number) => void
  onPageRendered?: (info: PageRenderInfo) => void
  onLoadError?: (msg: string) => void
}

export default function PDFViewer({
  fileUrl, page, width, onLoadSuccess, onPageRendered, onLoadError,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfDocRef = useRef<any>(null)
  const renderTaskRef = useRef<any>(null)

  // ─── Chargement du document (1 fois par fileUrl) ───
  useEffect(() => {
    if (!fileUrl) return
    let cancelled = false
    setLoading(true)
    setError(null)
    pdfDocRef.current = null

    ;(async () => {
      try {
        // pdfjs-dist v5 + webpack dev (Next 16) → "Object.defineProperty called on non-object"
        // au moment du bundling. On bypass complet du bundler en chargeant le module
        // ESM natif au runtime depuis /public. webpackIgnore: true dit à webpack
        // "ne touche pas à cet import, le navigateur s'en charge".
        // - Le `pdfjsUrl` en variable empêche TS de résoudre le path comme un module typé.
        // - Source : copie de node_modules/pdfjs-dist/legacy/build/pdf.min.mjs (cf scripts).
        const pdfjsUrl: string = '/pdf.legacy.min.mjs'
        const mod = await import(/* webpackIgnore: true */ pdfjsUrl) as any
        const pdfjs = mod.default || mod
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.legacy.min.mjs'
        }
        const doc = await pdfjs.getDocument({ url: fileUrl, withCredentials: false }).promise
        if (cancelled) return
        pdfDocRef.current = doc
        setLoading(false)
        onLoadSuccess?.(doc.numPages)
      } catch (e: any) {
        if (cancelled) return
        const msg = e?.message || 'Impossible de charger le PDF'
        console.error('[sign/PDFViewer] load error', e)
        setError(msg)
        setLoading(false)
        onLoadError?.(msg)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl])

  // ─── Render de la page courante ───
  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas) return

    // Cancel render précédent
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel() } catch {}
      renderTaskRef.current = null
    }

    try {
      const pageObj = await doc.getPage(page)
      const baseVp = pageObj.getViewport({ scale: 1, rotation: 0 })
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      // scale CSS = width / pdfWidth ; on rend à scale * DPR pour qualité retina
      const cssScale = width / baseVp.width
      const viewport = pageObj.getViewport({ scale: cssScale * dpr, rotation: 0 })
      const ctx = canvas.getContext('2d')!

      canvas.width = viewport.width
      canvas.height = viewport.height
      const cssW = Math.round(viewport.width / dpr)
      const cssH = Math.round(viewport.height / dpr)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`

      const task = pageObj.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      await task.promise
      renderTaskRef.current = null

      onPageRendered?.({
        page,
        pdfWidth: baseVp.width,
        pdfHeight: baseVp.height,
        renderedWidth: cssW,
        renderedHeight: cssH,
      })
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') {
        console.warn('[sign/PDFViewer] render error', e)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, width, onPageRendered])

  useEffect(() => {
    if (loading || error) return
    renderPage()
    return () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel() } catch {}
        renderTaskRef.current = null
      }
    }
  }, [loading, error, renderPage])

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        background: 'var(--card)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        lineHeight: 0,
        // Réserve la taille pendant le chargement (évite le saut layout)
        minWidth: width,
        minHeight: Math.round(width * 1.414),
      }}
    >
      {error ? (
        <div style={{ padding: 40, fontSize: 13, color: 'var(--destructive)', minWidth: width, lineHeight: 1.4 }}>
          {error}
        </div>
      ) : (
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      )}
      {loading && !error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            fontSize: 13,
            gap: 8,
          }}
        >
          <Loader2 size={20} className="animate-spin" />
          <span>Chargement…</span>
        </div>
      )}
    </div>
  )
}
