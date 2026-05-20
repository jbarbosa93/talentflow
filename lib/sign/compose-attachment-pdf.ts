// TalentFlow Sign — Composition des pièces jointes candidat en PDF
// v2.9.25
//
// Quand un candidat charge plusieurs photos dans un champ pièce jointe
// (typiquement recto + verso d'une carte d'identité), on les assemble en UN
// seul PDF A4 — 2 images par page (recto en haut, verso en bas) — pour que le
// créateur reçoive un document propre « comme un scan » au lieu de 2 fichiers.
//
// Ne gère que JPEG / PNG (formats embeddables par pdf-lib). Les autres formats
// (webp, heic, pdf) sont laissés au caller pour un attachement séparé.

import { PDFDocument } from 'pdf-lib'

export interface ComposableImage {
  buffer: Buffer
  mimeType: string
  name: string
}

const A4_W = 595.28
const A4_H = 841.89
const MARGIN = 32

function looksPng(img: ComposableImage): boolean {
  return img.mimeType.toLowerCase() === 'image/png' || /\.png$/i.test(img.name)
}

/** True si l'image est composable (JPEG ou PNG). */
export function isComposableImage(mimeType: string | undefined, name: string | undefined): boolean {
  const m = (mimeType || '').toLowerCase()
  if (m === 'image/jpeg' || m === 'image/jpg' || m === 'image/png') return true
  return /\.(jpe?g|png)$/i.test(name || '')
}

/**
 * Compose des images JPEG/PNG en un PDF A4 : 2 images par page, empilées
 * verticalement (haut / bas). Retourne null si aucune image n'a pu être
 * intégrée (le caller attachera alors les fichiers bruts).
 */
export async function composeImagesToPdf(images: ComposableImage[]): Promise<Buffer | null> {
  if (images.length === 0) return null

  const pdf = await PDFDocument.create()
  const slotH = (A4_H - MARGIN * 3) / 2  // 2 emplacements verticaux
  const slotW = A4_W - MARGIN * 2
  let embeddedAny = false

  for (let i = 0; i < images.length; i += 2) {
    const pair = images.slice(i, i + 2)
    const page = pdf.addPage([A4_W, A4_H])
    for (let s = 0; s < pair.length; s++) {
      const img = pair[s]
      let embedded
      try {
        embedded = looksPng(img) ? await pdf.embedPng(img.buffer) : await pdf.embedJpg(img.buffer)
      } catch {
        // Mauvaise détection du format → on tente l'autre
        try {
          embedded = looksPng(img) ? await pdf.embedJpg(img.buffer) : await pdf.embedPng(img.buffer)
        } catch {
          continue  // image non intégrable → on saute
        }
      }
      embeddedAny = true
      const scale = Math.min(slotW / embedded.width, slotH / embedded.height)
      const w = embedded.width * scale
      const h = embedded.height * scale
      const x = (A4_W - w) / 2
      // s=0 → emplacement haut ; s=1 → emplacement bas
      const slotBottom = s === 0 ? (A4_H - MARGIN - slotH) : MARGIN
      const y = slotBottom + (slotH - h) / 2
      page.drawImage(embedded, { x, y, width: w, height: h })
    }
  }

  if (!embeddedAny) return null
  return Buffer.from(await pdf.save())
}
