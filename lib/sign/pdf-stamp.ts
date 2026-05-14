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
  /** v2.7.6 — Téléphone candidat (utilisé par les fields number avec autoFillSource='phone'). */
  telephone?: string
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

// v2.3.8 Bug 7a — réduit de 4 à 2pt pour augmenter la surface utile signature
// quand le field est petit dans le template (ex: case 80×24pt → +12% surface).
const SIG_PADDING = 2
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
    // v2.3.10 Bug 5 — Log diagnostic : alerte si la page source n'est pas A4 (595×842).
    // Les coords des fields sont stockées en proportions de la page rendue dans
    // l'éditeur de template (qui suppose A4). Si la vraie page diffère, le stamp
    // sera décalé. Tolérance ±5pt pour tenir compte des PDF générés par Word/etc.
    if (pageFields.length > 0 && (Math.abs(pw - 595) > 5 || Math.abs(ph - 842) > 5)) {
      console.warn('[pdf-stamp] ⚠️ Page size NON-A4 — stamp peut être décalé', {
        envelopeId: opts.envelopeId,
        pageNum,
        actual: { width: Math.round(pw), height: Math.round(ph) },
        expected: { width: 595, height: 842, format: 'A4 portrait' },
        delta: { dw: Math.round(pw - 595), dh: Math.round(ph - 842) },
        fields_count: pageFields.length,
        recommendation: pw > ph ? 'PDF en paysage ? Editeur template suppose portrait.' : 'Vérifier le format du PDF source (US Letter 612×792 ?).',
      })
    }
    for (const f of pageFields) {
      const xPts = f.x * pw
      const yPtsTL = f.y * ph
      const wPts = f.width * pw
      const hPts = f.height * ph
      const yPtsBL = ph - yPtsTL - hPts
      // v2.3.11 Bug 3 — Log diagnostic : coords pt + page size pour chaque field
      // stampé (utile pour comprendre les décalages stamp vs viewer en prod).
      console.log('[pdf-stamp] field', {
        id: f.id.slice(0, 8),
        type: f.type,
        page: pageNum,
        norm: { x: f.x.toFixed(3), y: f.y.toFixed(3), w: f.width.toFixed(3), h: f.height.toFixed(3) },
        pt: { x: Math.round(xPts), y: Math.round(yPtsBL), w: Math.round(wPts), h: Math.round(hPts) },
        pageSize: { w: Math.round(pw), h: Math.round(ph) },
      })

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
          if (value) drawTextInBox(page, value, xPts, yPtsBL, wPts, hPts, helv, f)
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
            drawTextInBox(page, display, xPts, yPtsBL, wPts, hPts, helv, f)
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
            // v2.2.4 — Heuristique title→company si tooltip ressemble entreprise/société
            const txt = `${f.tooltip || ''} ${f.label || ''}`.toLowerCase()
            const titleLooksLikeCompany = f.type === 'title'
              && /(entreprise|soci[ée]t[ée]|raison\s*sociale|nom\s*du\s*client|cliente)/.test(txt)
            if (titleLooksLikeCompany) {
              value = opts.autoFill.companyName || ''
            } else {
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
          }
          if (value) drawTextInBox(page, value, xPts, yPtsBL, wPts, hPts, helv, f)
          break
        }

        case 'text':
        case 'number': {
          const v = opts.fieldValues[f.id]
          let toDraw = ''
          if (v !== undefined && v !== null && String(v).trim()) {
            toDraw = String(v)
          } else if (f.type === 'number' && f.autoFillSource === 'phone' && opts.autoFill.telephone) {
            // v2.7.6 — Fallback téléphone candidat si le champ n'a pas été modifié
            toDraw = opts.autoFill.telephone
          }
          if (toDraw) drawTextInBox(page, toDraw, xPts, yPtsBL, wPts, hPts, helv, f)
          break
        }

        case 'formula': {
          // v2.2.1 — Calcule la valeur de la formule à partir des autres fieldValues
          const computed = computeFormulaValue(f, opts.fieldValues)
          const formatted = formatFormulaValue(f, computed)
          if (formatted) {
            drawTextInBox(page, formatted, xPts, yPtsBL, wPts, hPts, helv, f)
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

// v2.3.15 Bug A (revert v2.3.12) — Texte centré pour TOUS les types pour
// garantir le WYSIWYG : l'éditeur Konva utilise `verticalAlign="middle"`
// (FieldsCanvas.tsx ligne 811), le stamp pdf-lib doit donc CENTRER aussi.
// L'ancien BOTTOM_ALIGNED_TYPES (v2.3.12) cassait cette cohérence pour
// fullname/company → texte affiché en bas dans le PDF mais centré dans
// l'éditeur → décalage visible et illogique pour le user.
//
// La formule alignée Konva : `(h - size × 0.6) / 2` centre la BASELINE pdf-lib
// au même point visuel que `verticalAlign="middle"` Konva (qui centre le bloc
// texte de hauteur ≈ fontSize × 1, baseline à 80% du haut → en BL = 0.2×size
// au-dessus du centre vertical de la box).
function drawTextInBox(
  page: any, text: string, x: number, y: number, w: number, h: number, font: PDFFont,
  field?: SignField,
) {
  // v2.2.4 — Si l'admin a configuré field.fontSize via panneau Formatage,
  // on l'utilise comme taille INITIALE. Sinon fallback auto-fit selon hauteur.
  let size = field?.fontSize
    ? Math.min(field.fontSize, h - 1)  // borné à la hauteur du field
    : Math.min(h * 0.65, TEXT_FONT_SIZE_DEFAULT)
  // Réduit si le texte dépasse la largeur (priorité fit > taille demandée)
  while (size > 6 && font.widthOfTextAtSize(text, size) > w - 4) size -= 0.5
  // v2.3.15 — Centrage WYSIWYG calé sur Konva verticalAlign="middle".
  // Baseline pdf-lib (BL coords) tel que le texte apparaisse au même endroit
  // visuel que dans l'éditeur Konva. Formule : (h - size × 0.7) / 2
  // (factor 0.7 = ratio empirique baseline/fontSize pour Helvetica/DM Sans).
  const textY = y + (h - size * 0.7) / 2
  // v2.2.4 — Couleur custom si field.fontColor défini
  const colorMap: Record<string, [number, number, number]> = {
    Black: [0, 0, 0], Gray: [0.42, 0.45, 0.5], Blue: [0.12, 0.25, 0.69],
    Red: [0.86, 0.15, 0.15], Green: [0.08, 0.5, 0.24], Orange: [0.92, 0.35, 0.05],
  }
  const c = field?.fontColor && colorMap[field.fontColor] ? colorMap[field.fontColor] : [0, 0, 0]
  page.drawText(text, {
    x: x + 2, y: textY,
    size, font, color: rgb(c[0], c[1], c[2]),
  })
}

// v2.3.12 Bug 1 — Exporté pour réutilisation côté front (PublicFieldsLayer)
// afin d'afficher les dates en read-only au format configuré dans le template
// (au lieu du format ISO 2026-05-04 brut).
// v2.6.6 — Support des tokens EEEE/EEE (jour de la semaine) + MMMM/MMM (nom du mois)
// en français, déduits automatiquement de la date ISO.
const WEEKDAYS_FR_LONG  = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const WEEKDAYS_FR_SHORT = ['Dim',      'Lun',   'Mar',   'Mer',      'Jeu',   'Ven',      'Sam']
const MONTHS_FR_LONG    = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const MONTHS_FR_SHORT   = ['janv.','févr.','mars','avril','mai','juin','juill.','août','sept.','oct.','nov.','déc.']

export function formatDate(s: string, format?: string): string {
  if (!s) return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  const [, y, mo, d] = m
  const fmt = format || 'dd.MM.yyyy'
  // Calcule le jour de la semaine (0=Dim, 1=Lun, ..., 6=Sam) via UTC pour éviter TZ shift
  const dateObj = new Date(`${y}-${mo}-${d}T00:00:00Z`)
  const dow = isNaN(dateObj.getTime()) ? -1 : dateObj.getUTCDay()
  const moIdx = parseInt(mo, 10) - 1
  // v2.6.9 — Numéro de semaine ISO 8601 (semaine 1 = celle du 1er jeudi de l'année)
  let isoWeekStr = ''
  if (!isNaN(dateObj.getTime())) {
    const dCopy = new Date(dateObj.getTime())
    const dayNum = dCopy.getUTCDay() || 7
    dCopy.setUTCDate(dCopy.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(dCopy.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((dCopy.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    isoWeekStr = String(week)
  }
  // Ordre important : tokens longs AVANT les courts (EEEE avant EEE, MMMM avant MMM,
  // yyyy avant yy si on l'ajoutait). Sinon "EEEE" deviendrait "Lun" + "E".
  return fmt
    .replace('EEEE', dow >= 0 ? (WEEKDAYS_FR_LONG[dow] || '') : '')
    .replace('EEE',  dow >= 0 ? (WEEKDAYS_FR_SHORT[dow] || '') : '')
    .replace('MMMM', moIdx >= 0 && moIdx < 12 ? MONTHS_FR_LONG[moIdx] : mo)
    .replace('MMM',  moIdx >= 0 && moIdx < 12 ? MONTHS_FR_SHORT[moIdx] : mo)
    .replace('WW',   isoWeekStr)
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
