'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Check, Loader2 } from 'lucide-react'

type Rect = { x: number; y: number; w: number; h: number }

type Props = {
  cvUrl: string
  onConfirm: (blob: Blob) => void
  onClose: () => void
}

export default function PhotoCropModal({ cvUrl, onConfirm, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<Rect | null>(null)
  const [dragging, setDragging] = useState(false)
  const startPt = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    // Déterminer le type de fichier
    const urlLower = cvUrl.toLowerCase()
    const isDoc = /\.(doc|docx)($|\?)/i.test(urlLower) ||
      urlLower.includes('_doc_') || urlLower.includes('.doc_') ||
      urlLower.includes('docx_') || urlLower.includes('.docx')
    const isPdf = !isDoc && (/\.pdf($|\?)/i.test(urlLower) || urlLower.includes('.pdf'))
    const isImage = /\.(jpg|jpeg|png|webp)($|\?)/i.test(urlLower)

    if (isDoc) {
      setError('Le crop photo n\'est pas disponible pour les fichiers Word (.doc/.docx). Utilisez le bouton upload photo (📷) pour ajouter une photo manuellement.')
      setLoading(false)
    } else if (isPdf) {
      loadPdf()
    } else if (isImage) {
      loadImage()
    } else {
      // Essayer comme image par défaut
      loadImage()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvUrl])

  async function loadPdf() {
    try {
      setLoading(true)

      // Télécharger via fetch pour éviter les problèmes CORS
      const fetchRes = await fetch(cvUrl)
      if (!fetchRes.ok) throw new Error('Téléchargement échoué')
      const arrayBuffer = await fetchRes.arrayBuffer()

      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
      const page = await pdf.getPage(1)
      const scale = Math.min(2, 900 / page.getViewport({ scale: 1 }).width)
      const viewport = page.getViewport({ scale })

      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      canvas.width = viewport.width
      canvas.height = viewport.height

      await page.render({ canvasContext: ctx as any, viewport, canvas: canvasRef.current! }).promise

      const overlay = overlayRef.current!
      overlay.width = viewport.width
      overlay.height = viewport.height

      setLoading(false)
    } catch {
      setError('Impossible de charger le PDF. Essayez de télécharger le CV et de recadrer l\'image manuellement.')
      setLoading(false)
    }
  }

  async function loadImage() {
    setLoading(true)
    try {
      // Télécharger via fetch pour éviter les problèmes CORS
      const res = await fetch(cvUrl)
      if (!res.ok) throw new Error('Téléchargement échoué')
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)

      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current!
        const scale = Math.min(1, 900 / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)

        const overlay = overlayRef.current!
        overlay.width = canvas.width
        overlay.height = canvas.height
        setLoading(false)
        URL.revokeObjectURL(blobUrl)
      }
      img.onerror = () => { setError('Impossible de charger l\'image'); setLoading(false); URL.revokeObjectURL(blobUrl) }
      img.src = blobUrl
    } catch {
      setError('Impossible de charger l\'image')
      setLoading(false)
    }
  }

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = overlayRef.current!.getBoundingClientRect()
    const sx = overlayRef.current!.width / rect.width
    const sy = overlayRef.current!.height / rect.height
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  const drawOverlay = (sel: Rect | null) => {
    const ov = overlayRef.current!
    const ctx = ov.getContext('2d')!
    ctx.clearRect(0, 0, ov.width, ov.height)
    if (!sel || sel.w < 2 || sel.h < 2) return
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, ov.width, ov.height)
    ctx.clearRect(sel.x, sel.y, sel.w, sel.h)
    ctx.strokeStyle = '#F5A723'
    ctx.lineWidth = 2
    ctx.strokeRect(sel.x, sel.y, sel.w, sel.h)
    // Corner handles
    const hs = 8
    ctx.fillStyle = '#F5A723'
    ;[[sel.x, sel.y], [sel.x + sel.w - hs, sel.y], [sel.x, sel.y + sel.h - hs], [sel.x + sel.w - hs, sel.y + sel.h - hs]].forEach(([hx, hy]) => {
      ctx.fillRect(hx, hy, hs, hs)
    })
  }

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    startPt.current = getPos(e)
    setDragging(true)
    setSelection(null)
    drawOverlay(null)
  }

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !startPt.current) return
    const pt = getPos(e)
    const x = Math.min(pt.x, startPt.current.x)
    const y = Math.min(pt.y, startPt.current.y)
    const w = Math.abs(pt.x - startPt.current.x)
    const h = Math.abs(pt.y - startPt.current.y)
    const sel = { x, y, w, h }
    setSelection(sel)
    drawOverlay(sel)
  }

  const onMouseUp = () => setDragging(false)

  const handleConfirm = () => {
    if (!selection || selection.w < 10 || selection.h < 10) return
    const src = canvasRef.current!
    const out = document.createElement('canvas')
    out.width = Math.round(selection.w)
    out.height = Math.round(selection.h)
    out.getContext('2d')!.drawImage(
      src,
      Math.round(selection.x), Math.round(selection.y),
      Math.round(selection.w), Math.round(selection.h),
      0, 0, out.width, out.height
    )
    out.toBlob(blob => { if (blob) onConfirm(blob) }, 'image/jpeg', 0.92)
  }

  const hasSelection = selection && selection.w > 10 && selection.h > 10

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>✂️ Sélectionner la zone photo</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Cliquez et glissez pour délimiter la zone à utiliser comme photo du candidat</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, overflow: 'auto', background: '#111', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: 200 }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
              <Loader2 size={28} color="#F5A723" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, color: '#64748B' }}>Chargement du CV…</span>
            </div>
          )}
          {error && (
            <div style={{ padding: 40, color: '#EF4444', textAlign: 'center', fontSize: 13, maxWidth: 400 }}>{error}</div>
          )}
          <div style={{ position: 'relative', display: loading ? 'none' : 'inline-block' }}>
            <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
            <canvas
              ref={overlayRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              style={{ position: 'absolute', inset: 0, cursor: 'crosshair', maxWidth: '100%' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
          {hasSelection
            ? <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 'auto' }}>
                Zone : {Math.round(selection!.w)}×{Math.round(selection!.h)}px
              </span>
            : <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 'auto' }}>
                Aucune zone sélectionnée
              </span>
          }
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: 'var(--foreground)' }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!hasSelection}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: hasSelection ? 'var(--primary)' : '#E2E8F0', color: hasSelection ? '#0F172A' : '#94A3B8', cursor: hasSelection ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Check size={14} />Utiliser cette zone
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
