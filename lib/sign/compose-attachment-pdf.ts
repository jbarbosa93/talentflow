// TalentFlow Sign — Composition des pièces jointes candidat en PDF
// v2.9.31
//
// Quand un candidat charge une ou plusieurs photos dans un champ pièce jointe
// (typiquement recto + verso d'une carte d'identité), on les assemble en UN
// seul PDF A4 — 2 images par page (recto en haut, verso en bas), ou 1 image
// pleine page — pour que le créateur reçoive un document propre « comme un
// scan » au lieu de plusieurs fichiers.
//
// Ne gère que JPEG / PNG (formats embeddables par pdf-lib). Les autres formats
// (webp, heic, pdf) sont laissés au caller pour un attachement séparé.
//
// v2.9.31 — Corrige l'orientation EXIF : les photos iPhone portent un tag
// d'orientation que pdf-lib ignore → image affichée tournée. On lit le tag et
// on applique la rotation à l'affichage.

import { PDFDocument, degrees } from 'pdf-lib'

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
 * v2.10.12 — True si l'image est un HEIC/HEIF (photo iPhone par défaut).
 * Windows ne sait PAS ouvrir les HEIC reçus par email → on les convertit en
 * JPEG avant assemblage pour qu'ils soient lisibles partout.
 */
export function isHeic(mimeType: string | undefined, name: string | undefined): boolean {
  const m = (mimeType || '').toLowerCase()
  if (m === 'image/heic' || m === 'image/heif' || m === 'image/heic-sequence' || m === 'image/heif-sequence') return true
  return /\.(heic|heif)$/i.test(name || '')
}

/**
 * v2.10.12 — Convertit un buffer HEIC/HEIF en JPEG (lisible Windows + composable
 * en PDF). Utilise heic-convert (pur JS/WASM, server-only). Retourne null si la
 * conversion échoue → le caller garde le fichier d'origine en secours.
 */
export async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer | null> {
  try {
    const mod = await import('heic-convert')
    const convert = (mod as any).default || mod
    const out = await convert({ buffer, format: 'JPEG', quality: 0.85 })
    return Buffer.from(out)
  } catch (e) {
    console.warn('[compose-attachment] HEIC→JPEG conversion failed', e)
    return null
  }
}

/**
 * Lit le tag d'orientation EXIF (0x0112) d'un buffer JPEG.
 * Retourne 1 (= normal) si absent / illisible. Parser autonome, sans dépendance.
 */
export function readJpegOrientation(buf: Buffer): number {
  try {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1
    let offset = 2
    while (offset + 4 <= buf.length) {
      if (buf[offset] !== 0xff) break
      const marker = buf[offset + 1]
      // SOS (début image) ou EOI → plus d'en-tête à scanner
      if (marker === 0xda || marker === 0xd9) break
      const size = buf.readUInt16BE(offset + 2)
      if (size < 2) break
      // APP1 (0xE1) avec en-tête "Exif"
      if (marker === 0xe1 && offset + 10 <= buf.length
        && buf.toString('ascii', offset + 4, offset + 8) === 'Exif') {
        return parseExifOrientation(buf, offset + 10)  // skip "Exif\0\0"
      }
      offset += 2 + size
    }
  } catch { /* tag illisible → orientation normale */ }
  return 1
}

function parseExifOrientation(buf: Buffer, tiffStart: number): number {
  if (tiffStart + 8 > buf.length) return 1
  const le = buf.toString('ascii', tiffStart, tiffStart + 2) === 'II'  // little-endian
  const readU16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
  const readU32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  const ifd0 = tiffStart + readU32(tiffStart + 4)
  if (ifd0 + 2 > buf.length) return 1
  const count = readU16(ifd0)
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12
    if (entry + 12 > buf.length) break
    if (readU16(entry) === 0x0112) {
      const value = readU16(entry + 8)
      return value >= 1 && value <= 8 ? value : 1
    }
  }
  return 1
}

/**
 * Compose des images JPEG/PNG en un PDF A4 :
 *   - 1 image  → pleine page (centrée)
 *   - 2 images → empilées (recto en haut, verso en bas)
 * L'orientation EXIF est appliquée pour que les photos ne soient pas tournées.
 * Retourne null si aucune image n'a pu être intégrée (le caller attachera
 * alors les fichiers bruts).
 */
export async function composeImagesToPdf(images: ComposableImage[]): Promise<Buffer | null> {
  if (images.length === 0) return null

  const pdf = await PDFDocument.create()
  const contentW = A4_W - MARGIN * 2
  let embeddedAny = false

  for (let i = 0; i < images.length; i += 2) {
    const pair = images.slice(i, i + 2)
    const page = pdf.addPage([A4_W, A4_H])
    const single = pair.length === 1
    // 1 image → toute la hauteur utile ; 2 images → 2 emplacements verticaux
    const slotH = single ? A4_H - MARGIN * 2 : (A4_H - MARGIN * 3) / 2

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

      // Orientation EXIF : 6/8 = rotation 90° → largeur/hauteur affichées inversées.
      const orient = looksPng(img) ? 1 : readJpegOrientation(img.buffer)
      const swap = orient === 6 || orient === 8
      const dispW = swap ? embedded.height : embedded.width
      const dispH = swap ? embedded.width : embedded.height

      const scale = Math.min(contentW / dispW, slotH / dispH)
      const fw = dispW * scale          // dimensions d'affichage finales
      const fh = dispH * scale
      const drawW = embedded.width * scale   // dimensions de l'image NON tournée
      const drawH = embedded.height * scale

      const boxX = (A4_W - fw) / 2
      // s=0 → emplacement haut ; s=1 → emplacement bas ; image seule → marge basse
      const slotBottom = single ? MARGIN : s === 0 ? A4_H - MARGIN - slotH : MARGIN
      const boxY = slotBottom + (slotH - fh) / 2

      // La rotation pdf-lib pivote autour de (x, y) = coin bas-gauche.
      // On ajuste (x, y) pour que l'image tournée remplisse exactement la boîte.
      let x = boxX
      let y = boxY
      let rot = 0
      if (orient === 3) { rot = 180; x = boxX + fw; y = boxY + fh }
      else if (orient === 6) { rot = 270; x = boxX; y = boxY + fh }
      else if (orient === 8) { rot = 90; x = boxX + fw; y = boxY }

      page.drawImage(embedded, { x, y, width: drawW, height: drawH, rotate: degrees(rot) })
    }
  }

  if (!embeddedAny) return null
  return Buffer.from(await pdf.save())
}
