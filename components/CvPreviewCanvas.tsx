'use client'

/**
 * CvPreviewCanvas — rendu PDF via pdf.js
 * Remplace l'iframe pour un contrôle total du zoom, indépendant du navigateur.
 */

import { useEffect, useRef, useState } from 'react'

interface Props {
  url: string
  zoom: number        // 1 = fit-to-width, 2 = 2×, 0.5 = 0.5× etc.
  rotation?: number   // 0, 90, 180, 270
  containerWidth: number
}

// ── PageCanvas ────────────────────────────────────────────────────────────────
function PageCanvas({
  pageNum,
  pdfDoc,
  scale,
  rotation,
}: {
  pageNum: number
  pdfDoc: any
  scale: number
  rotation: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const taskRef   = useRef<any>(null)

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false

    ;(async () => {
      // Cancel in-progress render
      if (taskRef.current) { try { taskRef.current.cancel() } catch {} }

      try {
        const page = await pdfDoc.getPage(pageNum)
        if (cancelled) return

        const dpr      = window.devicePixelRatio || 1
        const viewport = page.getViewport({ scale: scale * dpr, rotation })
        const canvas   = canvasRef.current!
        const ctx      = canvas.getContext('2d')!

        canvas.width         = viewport.width
        canvas.height        = viewport.height
        canvas.style.width   = `${Math.round(viewport.width  / dpr)}px`
        canvas.style.height  = `${Math.round(viewport.height / dpr)}px`

        const task = page.render({ canvasContext: ctx, viewport })
        taskRef.current = task
        await task.promise
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') console.warn('[CvPreview] render error', e)
      }
    })()

    return () => {
      cancelled = true
      if (taskRef.current) { try { taskRef.current.cancel() } catch {} }
    }
  }, [pageNum, pdfDoc, scale, rotation])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        maxWidth: '100%',
        marginBottom: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        background: '#fff',
        borderRadius: 4,
      }}
    />
  )
}

// ── CvPreviewCanvas ───────────────────────────────────────────────────────────
export function CvPreviewCanvas({ url, zoom, rotation = 0, containerWidth }: Props) {
  const [numPages,  setNumPages]  = useState(0)
  const [fitScale,  setFitScale]  = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const pdfDocRef = useRef<any>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setNumPages(0)

    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist') as any
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        }

        const doc  = await pdfjs.getDocument({ url, withCredentials: false }).promise
        if (cancelled) return
        pdfDocRef.current = doc

        // Calculate fit-to-width scale from first page (at rotation=0 for base size)
        const page    = await doc.getPage(1)
        const baseVp  = page.getViewport({ scale: 1, rotation: 0 })
        const needRot = rotation === 90 || rotation === 270
        const pageW   = needRot ? baseVp.height : baseVp.width
        const fit     = (containerWidth - 16) / pageW  // 8px padding each side
        setFitScale(fit)
        setNumPages(doc.numPages)
      } catch (e: any) {
        if (!cancelled) setError('Impossible de charger le PDF')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [url, containerWidth, rotation])

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 200, color: 'var(--muted)', fontSize: 13, gap: 8,
    }}>
      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 18 }}>⟳</span>
      Chargement…
    </div>
  )

  if (error) return (
    <div style={{ padding: 24, textAlign: 'center', color: '#EF4444', fontSize: 13 }}>
      {error}
    </div>
  )

  return (
    <div style={{ padding: '8px 8px 0' }}>
      {Array.from({ length: numPages }, (_, i) => (
        <PageCanvas
          key={`${url}-${i}`}
          pageNum={i + 1}
          pdfDoc={pdfDocRef.current}
          scale={fitScale * zoom}
          rotation={rotation}
        />
      ))}
    </div>
  )
}
