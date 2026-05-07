// TalentFlow Sign — Stamping PDF (Phase 3 + Phase 4b)
// v2.2.0 — Phase 4b
//
// Deux fonctions exposées :
//   - stampTalentflowEnvelopeId : couvre le header DocuSign + stamp notre envelopeId
//     (utilisé en runtime sur /api/sign/document/[token])
//   - stampPdf : stamp final post-signature avec toutes les valeurs candidat,
//     signature image + audit footer (utilisé à finalize)
//
// Coords DocuSign sont en POINTS top-left ; pdf-lib utilise points BOTTOM-LEFT
// → conversion : pdfY = pageHeight - dsY - fieldHeight.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import type { SignField } from './types'
import { computeFormulaValue, formatFormulaValue } from './field-helpers'

// ─── Stamp envelopeId (Phase 3) ─────────────────────────────────────────

/**
 * Couvre le header DocuSign et stamp notre envelopeId à la place.
 * - Rectangle blanc sur les ~22pt du haut de chaque page
 * - Texte "TalentFlow Envelope ID: ..." en gris discret
 *
 * Si la lecture pdf-lib échoue (PDF corrompu, signé, encrypté), retourne
 * le buffer original (fail-safe — l'utilisateur voit au pire l'ancien header).
 */
export async function stampTalentflowEnvelopeId(
  pdfBuffer: Uint8Array | ArrayBuffer | Buffer,
  envelopeId: string,
): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const stampText = `TalentFlow Envelope ID: ${envelopeId}`
    const fontSize = 8

    for (const page of pdfDoc.getPages()) {
      const { width, height } = page.getSize()
      page.drawRectangle({
        x: 0, y: height - 22, width, height: 22,
        color: rgb(1, 1, 1),
      })
      const textWidth = helvetica.widthOfTextAtSize(stampText, fontSize)
      page.drawText(stampText, {
        x: (width - textWidth) / 2, y: height - 14,
        size: fontSize, font: helvetica, color: rgb(0.6, 0.6, 0.6),
      })
    }

    return await pdfDoc.save()
  } catch (e) {
    console.warn('[sign/pdf-stamp] header stamp failed', e)
    if (pdfBuffer instanceof Uint8Array) return pdfBuffer
    return new Uint8Array(pdfBuffer as ArrayBuffer)
  }
}

// ─── Stamp final post-signature (Phase 4b) ───────────────────────────────

interface AutoFill {
  firstName: string
  lastName: string
  fullName: string
  email: string
  today: string
  /** v2.2.2 — Nom de l'entreprise expéditrice (depuis sender meta `entreprise` ou `envelope.context_data.companyName`). Utilisé par les fields type=company. */
  companyName?: string
  /** v2.2.2 — Fonction/poste du destinataire (typiquement candidat.metier_recherche). Utilisé par les fields type=title. */
  title?: string
}

interface StampOptions {
  pdfBuffer: Uint8Array
  fields: SignField[]                        // fields du recipient courant pour CE doc
  fieldValues: Record<string, unknown>
  signatureDataUrl: string | null
  autoFill: AutoFill
  envelopeId: string
  recipientName: string
  recipientEmail: string
  signedAt: Date
  signedIp: string | null
  /** Si true (défaut), ajoute un bandeau d'audit en bas de la dernière page. */
  addAuditFooter?: boolean
}

const SIG_PADDING = 4
const TEXT_FONT_SIZE_DEFAULT = 10
const CHECKBOX_X = 'X'

/**
 * Stamp un PDF source avec toutes les valeurs candidat (texte + signature image
 * + checkmarks + listes) aux coords DocuSign exactes.
 * Retourne le buffer du PDF stampé final.
 */
export async function stampPdf(opts: StampOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(opts.pdfBuffer, { ignoreEncryption: true })
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const pages = pdf.getPages()

  // Embed image signature 1 fois
  let sigImage: Awaited<ReturnType<typeof pdf.embedPng>> | null = null
  if (opts.signatureDataUrl) {
    try {
      const isJpeg = opts.signatureDataUrl.startsWith('data:image/jpeg')
      const base64 = opts.signatureDataUrl.split(',')[1] || ''
      const buf = Uint8Array.from(Buffer.from(base64, 'base64'))
      sigImage = isJpeg ? await pdf.embedJpg(buf) : await pdf.embedPng(buf)
    } catch (e) {
      console.warn('[pdf-stamp] embed signature failed', e)
    }
  }

  // Group fields par page
  const byPage = new Map<number, SignField[]>()
  for (const f of opts.fields) {
    if (!byPage.has(f.page)) byPage.set(f.page, [])
    byPage.get(f.page)!.push(f)
  }

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx]
    const { width: pw, height: ph } = page.getSize()
    const pageNum = pageIdx + 1
    const pageFields = byPage.get(pageNum) || []
    for (const f of pageFields) {
      const xPts = f.x * pw
      const yPtsTL = f.y * ph
      const wPts = f.width * pw
      const hPts = f.height * ph
      const yPtsBL = ph - yPtsTL - hPts

      switch (f.type) {
        case 'signature':
        case 'initial': {
          if (!sigImage) break
          const imgRatio = sigImage.width / sigImage.height
          const targetW = wPts - SIG_PADDING * 2
          const targetH = hPts - SIG_PADDING * 2
          let drawW = targetW
          let drawH = targetW / imgRatio
          if (drawH > targetH) {
            drawH = targetH
            drawW = targetH * imgRatio
          }
          const offX = xPts + (wPts - drawW) / 2
          const offY = yPtsBL + (hPts - drawH) / 2
          page.drawImage(sigImage, { x: offX, y: offY, width: drawW, height: drawH })
          break
        }

        case 'date': {
          const isAutoSign = f.metadata?.tabType === 'datesigned'
          const value = isAutoSign
            ? opts.autoFill.today
            : (typeof opts.fieldValues[f.id] === 'string' ? formatDate(opts.fieldValues[f.id] as string, f.dateFormat) : '')
          if (value) drawTextInBox(page, value, xPts, yPtsBL, wPts, hPts, helv)
          break
        }

        case 'checkbox': {
          const v = opts.fieldValues[f.id]
          const checked = v === true || v === 'true'
          if (checked) {
            const size = Math.min(wPts, hPts) * 0.85
            const cx = xPts + wPts / 2
            const cy = yPtsBL + hPts / 2
            const txtWidth = helvBold.widthOfTextAtSize(CHECKBOX_X, size)
            page.drawText(CHECKBOX_X, {
              x: cx - txtWidth / 2,
              y: cy - size / 3,
              size, font: helvBold, color: rgb(0, 0, 0),
            })
          }
          break
        }

        case 'select': {
          const v = opts.fieldValues[f.id]
          if (typeof v === 'string' && v.trim()) {
            const items = (f.metadata?.listItems as { text: string; value: string }[] | undefined) || []
            const item = items.find(i => i.value === v)
            const display = item?.text || v
            drawTextInBox(page, display, xPts, yPtsBL, wPts, hPts, helv)
          }
          break
        }

        case 'firstname':
        case 'lastname':
        case 'fullname':
        case 'email':
        case 'company':
        case 'title': {
          const explicit = opts.fieldValues[f.id]
          let value = ''
          if (typeof explicit === 'string' && explicit.trim()) value = explicit
          else {
            switch (f.type) {
              case 'firstname': value = opts.autoFill.firstName; break
              case 'lastname':  value = opts.autoFill.lastName;  break
              case 'fullname':  value = opts.autoFill.fullName;  break
              case 'email':     value = opts.autoFill.email;     break
              case 'company':   value = opts.autoFill.companyName || ''; break
              case 'title':     value = opts.autoFill.title || ''; break
              default: value = ''
            }
          }
          if (value) drawTextInBox(page, value, xPts, yPtsBL, wPts, hPts, helv)
          break
        }

        case 'text':
        case 'number': {
          const v = opts.fieldValues[f.id]
          if (v !== undefined && v !== null && String(v).trim()) {
            drawTextInBox(page, String(v), xPts, yPtsBL, wPts, hPts, helv)
          }
          break
        }

        case 'formula': {
          // v2.2.1 — Calcule la valeur de la formule à partir des autres fieldValues
          const computed = computeFormulaValue(f, opts.fieldValues)
          const formatted = formatFormulaValue(f, computed)
          if (formatted) {
            drawTextInBox(page, formatted, xPts, yPtsBL, wPts, hPts, helv)
          }
          break
        }

        case 'annotation':
        case 'attachment':
          break
      }
    }
  }

  // Bandeau audit footer sur la dernière page
  if (opts.addAuditFooter !== false) {
    const lastPage = pages[pages.length - 1]
    const { width: pw } = lastPage.getSize()
    const footerText1 = `Signé électroniquement le ${formatDateTime(opts.signedAt)} par ${opts.recipientName} (${opts.recipientEmail})`
    const footerText2 = `IP ${opts.signedIp || 'non disponible'} · TalentFlow Sign · Envelope ID ${opts.envelopeId}`

    lastPage.drawRectangle({
      x: 0, y: 0, width: pw, height: 30,
      color: rgb(0.96, 0.94, 0.87),
      opacity: 0.75,
    })
    lastPage.drawText(footerText1, {
      x: 12, y: 18,
      size: 7, font: helv, color: rgb(0.2, 0.2, 0.2),
    })
    lastPage.drawText(footerText2, {
      x: 12, y: 8,
      size: 6, font: helv, color: rgb(0.4, 0.4, 0.4),
    })
  }

  return await pdf.save()
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function drawTextInBox(
  page: any, text: string, x: number, y: number, w: number, h: number, font: PDFFont,
) {
  let size = Math.min(h * 0.65, TEXT_FONT_SIZE_DEFAULT)
  while (size > 6 && font.widthOfTextAtSize(text, size) > w - 4) size -= 0.5
  const textY = y + (h - size) / 2 + 1
  page.drawText(text, {
    x: x + 2, y: textY,
    size, font, color: rgb(0, 0, 0),
  })
}

function formatDate(s: string, format?: string): string {
  if (!s) return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  const [, y, mo, d] = m
  const fmt = format || 'dd.MM.yyyy'
  return fmt
    .replace('dd', d)
    .replace('MM', mo)
    .replace('yyyy', y)
}

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} à ${hh}:${mi}`
}
