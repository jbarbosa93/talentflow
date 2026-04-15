import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// ── Types ──────────────────────────────────────────────────────────────────────

type LineType = 'travail' | 'ferie' | 'vacances' | 'absence' | 'maladie'

const TYPE_LABELS: Record<LineType, string> = {
  travail: '',
  ferie: 'Férié',
  vacances: 'Vac.',
  absence: 'Abs.',
  maladie: 'Mal.',
}

const TYPE_COLORS: Record<LineType, { r: number; g: number; b: number }> = {
  travail:  { r: 0, g: 0, b: 0 },
  ferie:    { r: 0.96, g: 0.62, b: 0.04 },  // amber
  vacances: { r: 0.23, g: 0.51, b: 0.96 },  // blue
  absence:  { r: 0.94, g: 0.27, b: 0.27 },  // red
  maladie:  { r: 0.55, g: 0.36, b: 0.96 },  // purple
}

interface RapportPayload {
  collaborateur: string
  entreprise: string
  semaine: number
  annee: number
  dates: string[]   // ['21.03', '22.03', ...]  — 7 entries
  gridData: { [rowKey: string]: { [day: string]: string } }
  dayTypes?: { [day: string]: LineType }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const NUMERIC_ROWS = ['heuresNormales', 'repas', 'heuresSupp', 'tempsDepl']

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcTotal(rowKey: string, gridData: RapportPayload['gridData']): string {
  if (!NUMERIC_ROWS.includes(rowKey)) return ''
  const sum = DAYS.reduce((acc, day) => {
    const val = parseFloat(gridData[rowKey]?.[day] || '0')
    return acc + (isNaN(val) ? 0 : val)
  }, 0)
  return sum === 0 ? '' : String(Math.round(sum * 100) / 100)
}

// Simple greedy word-wrap returning array of lines
function wrapText(
  text: string,
  fontObj: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxW: number,
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (fontObj.widthOfTextAtSize(test, size) > maxW && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines
}

// ── PDF Generation ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: RapportPayload = await req.json()
    const { collaborateur, entreprise, semaine, dates, gridData, dayTypes } = body

    const pdfDoc = await PDFDocument.create()
    // A4 portrait
    const page = pdfDoc.addPage([595.28, 841.89])
    const { width, height } = page.getSize()

    const fB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const f  = await pdfDoc.embedFont(StandardFonts.Helvetica)

    const K  = rgb(0, 0, 0)          // black
    const W  = rgb(1, 1, 1)          // white
    const DG = rgb(0.35, 0.35, 0.35) // dark gray for sub-labels
    const MG = rgb(0.5, 0.5, 0.5)    // mid gray

    const mg = 30                    // page margin
    const cW = width - mg * 2        // content width: 535.28

    // ── HEADER ────────────────────────────────────────────────────────────────

    const hTop = height - mg          // 811.89
    const hH   = 68

    // Black box — "Rapport de travail"
    page.drawRectangle({ x: mg, y: hTop - hH, width: 192, height: hH, color: K })
    page.drawText('Rapport de travail', {
      x: mg + 14, y: hTop - hH + 26,
      size: 18, font: fB, color: W,
    })

    // L-AGENCE box (right side)
    const lbW = 168
    const lbX = width - mg - lbW
    const lbY = hTop - hH
    page.drawRectangle({ x: lbX, y: lbY, width: lbW, height: hH, borderColor: K, borderWidth: 1, color: W })
    page.drawText('L-AGENCE', {
      x: lbX + 10, y: lbY + 46,
      size: 16, font: fB, color: K,
    })
    page.drawText('Emplois fixes & temporaires', {
      x: lbX + 10, y: lbY + 33,
      size: 7, font: f, color: DG,
    })
    page.drawText('+41 24 552 18 70 \u2014 info@l-agence.ch', {
      x: lbX + 10, y: lbY + 19,
      size: 7, font: f, color: DG,
    })
    page.drawText('Av. des Alpes 3 \u2013 1870 Monthey', {
      x: lbX + 10, y: lbY + 8,
      size: 7, font: f, color: DG,
    })

    // ── COLLABORATEUR / ENTREPRISE ─────────────────────────────────────────────

    const collabLabel = 'COLLABORATEUR(TRICE):'
    const entrepriseLabel = 'ENTREPRISE:'

    const y1 = hTop - hH - 22
    page.drawText(collabLabel, { x: mg, y: y1, size: 8, font: fB, color: K })
    const cl1W = fB.widthOfTextAtSize(collabLabel, 8)
    page.drawLine({ start: { x: mg + cl1W + 6, y: y1 - 2 }, end: { x: width - mg, y: y1 - 2 }, thickness: 0.75, color: K })
    if (collaborateur) {
      page.drawText(collaborateur, { x: mg + cl1W + 10, y: y1, size: 9, font: f, color: K })
    }

    const y2 = y1 - 22
    page.drawText(entrepriseLabel, { x: mg, y: y2, size: 8, font: fB, color: K })
    const el2W = fB.widthOfTextAtSize(entrepriseLabel, 8)
    page.drawLine({ start: { x: mg + el2W + 6, y: y2 - 2 }, end: { x: width - mg, y: y2 - 2 }, thickness: 0.75, color: K })
    if (entreprise) {
      page.drawText(entreprise, { x: mg + el2W + 10, y: y2, size: 9, font: f, color: K })
    }

    // ── TABLE ─────────────────────────────────────────────────────────────────
    //  Columns: [label 148] [7 × day 47] [total 58.28]
    const lCW = 148                          // label col width
    const dCW = 47                           // each day col width
    const tCW = cW - lCW - dCW * 7          // total col width (≈ 58)
    const tX  = mg                           // table left x
    const tCX = tX + lCW + dCW * 7          // total-col start x
    const rH  = 27                           // row height

    // Helper: draw one row (borders + label + day values + total)
    const drawRow = (
      rowY: number,
      label: string,
      subLabel: string,
      values: string[],   // 7 entries
      totalVal: string,
      boldValues = false,
    ) => {
      // Row outer border
      page.drawRectangle({ x: tX, y: rowY, width: cW, height: rH, borderColor: K, borderWidth: 0.5, color: W })

      // Label text
      if (label) {
        page.drawText(label, { x: tX + 6, y: rowY + rH / 2 - 3, size: 8, font: fB, color: K })
        if (subLabel) {
          const lW = fB.widthOfTextAtSize(label, 8)
          page.drawText(subLabel, { x: tX + 6 + lW + 6, y: rowY + rH / 2 - 3, size: 7, font: f, color: DG })
        }
      }

      // Label col right divider
      page.drawLine({ start: { x: tX + lCW, y: rowY }, end: { x: tX + lCW, y: rowY + rH }, thickness: 0.5, color: K })

      // Day cells
      for (let di = 0; di < 7; di++) {
        const cX = tX + lCW + di * dCW
        page.drawLine({ start: { x: cX, y: rowY }, end: { x: cX, y: rowY + rH }, thickness: 0.5, color: K })
        const v = values[di] || ''
        if (v) {
          const useFont = boldValues ? fB : f
          const vW = useFont.widthOfTextAtSize(v, 8)
          page.drawText(v, { x: cX + (dCW - vW) / 2, y: rowY + rH / 2 - 3, size: 8, font: useFont, color: K })
        }
      }

      // Total col divider
      page.drawLine({ start: { x: tCX, y: rowY }, end: { x: tCX, y: rowY + rH }, thickness: 0.5, color: K })

      // Total value
      if (totalVal) {
        const tvW = fB.widthOfTextAtSize(totalVal, 8)
        page.drawText(totalVal, { x: tCX + (tCW - tvW) / 2, y: rowY + rH / 2 - 3, size: 8, font: fB, color: K })
      }
    }

    let curY = y2 - 14

    // ── Header row: Semaine N° | Lundi … | TOTAL ──
    const headerRowY = curY - rH
    drawRow(headerRowY, `Semaine N\u00b0${semaine}`, '', DAYS, 'TOTAL', true)
    curY = headerRowY

    // ── Section 1: Date / Type / Heures normales / Repas ──

    // Date row
    curY -= rH
    const dateVals = DAYS.map((_, di) => dates[di] || '')
    drawRow(curY, 'Date', '', dateVals, '', true)

    // Type row (only if dayTypes has non-travail entries)
    const hasTypes = dayTypes && DAYS.some(d => dayTypes[d] && dayTypes[d] !== 'travail')
    if (hasTypes) {
      curY -= rH
      // Draw row manually with colored text
      page.drawRectangle({ x: tX, y: curY, width: cW, height: rH, borderColor: K, borderWidth: 0.5, color: W })
      page.drawText('Type', { x: tX + 6, y: curY + rH / 2 - 3, size: 8, font: fB, color: K })
      page.drawLine({ start: { x: tX + lCW, y: curY }, end: { x: tX + lCW, y: curY + rH }, thickness: 0.5, color: K })
      for (let di = 0; di < 7; di++) {
        const cX = tX + lCW + di * dCW
        page.drawLine({ start: { x: cX, y: curY }, end: { x: cX, y: curY + rH }, thickness: 0.5, color: K })
        const dayType = (dayTypes?.[DAYS[di]] || 'travail') as LineType
        const label = TYPE_LABELS[dayType]
        if (label) {
          const tc = TYPE_COLORS[dayType]
          const vW = fB.widthOfTextAtSize(label, 7)
          // Colored background pill
          page.drawRectangle({
            x: cX + (dCW - vW) / 2 - 3, y: curY + rH / 2 - 5,
            width: vW + 6, height: 12, color: rgb(tc.r, tc.g, tc.b),
            borderWidth: 0,
          })
          page.drawText(label, { x: cX + (dCW - vW) / 2, y: curY + rH / 2 - 3, size: 7, font: fB, color: W })
        }
      }
      page.drawLine({ start: { x: tCX, y: curY }, end: { x: tCX, y: curY + rH }, thickness: 0.5, color: K })
    }

    // Heures normales + Repas rows
    const sec1Rest = [
      { key: 'heuresNormales', label: 'Heures normales', sub: 'en centi\u00e8mes' },
      { key: 'repas',          label: 'Repas',           sub: '' },
    ]
    for (const row of sec1Rest) {
      curY -= rH
      const vals = DAYS.map(d => gridData[row.key]?.[d] || '')
      const tot = calcTotal(row.key, gridData)
      drawRow(curY, row.label, row.sub, vals, tot)
    }

    // ── Gap between sections ──
    curY -= 9

    // ── Section 2: Heures supp / Centre / Temps / Divers / (empty) ──
    const sec2 = [
      { key: 'heuresSupp',  label: 'Heures suppl\u00e9mentaires'     },
      { key: 'centreCouts', label: 'Centre de co\u00fbts / chantier'  },
      { key: 'tempsDepl',   label: 'Temps de d\u00e9placement'        },
      { key: 'divers',      label: 'Divers'                           },
      { key: '_empty',      label: ''                                  },
    ]
    for (const row of sec2) {
      curY -= rH
      const vals = row.key === '_empty' ? Array(7).fill('') : DAYS.map(d => gridData[row.key]?.[d] || '')
      const tot  = row.key !== '_empty' ? calcTotal(row.key, gridData) : ''
      drawRow(curY, row.label, '', vals, tot)
    }

    const tableBottom = curY

    // ── LEGAL TEXT (two columns) ───────────────────────────────────────────────
    const lTop  = tableBottom - 14
    const lFS   = 6.4
    const lLH   = 8.2
    const colW  = (cW - 12) / 2

    const leftText = "Entreprise: Ce rapport de travail permet l\u2019\u00e9tablissement de la facture conform\u00e9ment aux conditions g\u00e9n\u00e9rales et au contrat de location que vous avez re\u00e7u de L-AGENCE. Par votre signature, vous reconnaissez l\u2019exactitude de ce rapport de travail. En cas de besoin, cette signature vaut l\u2019acceptation du contrat de location relatif \u00e0 cette mission. Le pr\u00e9sent rapport de travail est une reconnaissance de dette au sens de l\u2019art.82LP qui permet d\u2019obtenir la mainlev\u00e9e d\u2019opposition, dont le montant est \u00e9gal au nombre d\u2019heures multipli\u00e9 par le tarif horaire, y compris les \u00e9ventuels suppl\u00e9ments pour heures d\u2019\u00e9quipes ou suppl\u00e9mentaires, temps compensatoire, etc., ainsi que les fais."

    const rightText = "Le (la) collaborateur(trice) confirme par sa carte de timbrage ou par sa signature appos\u00e9e sur le pr\u00e9sent rapport de travail, que des \u00e9carts par rapport \u00e0 la dur\u00e9e de travail convenue par contrat sont exclusivement l\u2019effet de sa volont\u00e9. Il(elle) se d\u00e9clare formellement d\u2019accord avec le fait que seules les heures de travail fournies faisant l\u2019objet du timbrage ou du pr\u00e9sent rapport de travail et confirm\u00e9es par la signature de l\u2019entreprise locataire de services seront r\u00e9mun\u00e9r\u00e9es. Il(elle) renonce donc express\u00e9ment \u00e0 faire valoir juridiquement la demeure de l\u2019employeur au sens de l\u2019atic 324 CO. Le (la) collaborateur(trice): Par votre signature, vous confirmez accepter votre contrat de mission et certifiez que ce rapport de travail est correct."

    const leftLines  = wrapText(leftText,  f, lFS, colW - 4)
    const rightLines = wrapText(rightText, f, lFS, colW - 4)
    const rColX = mg + colW + 12

    leftLines.forEach((line, i) => {
      page.drawText(line, { x: mg, y: lTop - i * lLH, size: lFS, font: f, color: K })
    })
    rightLines.forEach((line, i) => {
      page.drawText(line, { x: rColX, y: lTop - i * lLH, size: lFS, font: f, color: K })
    })

    // ── SIGNATURE LINES ────────────────────────────────────────────────────────

    const sigY = mg + 16
    const sig1 = 'Timbre et signature du client'
    const sig2 = 'Signature du (de la) collaborateur(trice)'

    page.drawText(sig1, { x: mg, y: sigY, size: 8, font: fB, color: K })
    page.drawLine({
      start: { x: mg + fB.widthOfTextAtSize(sig1, 8) + 6, y: sigY - 2 },
      end:   { x: mg + cW / 2 - 12,                        y: sigY - 2 },
      thickness: 0.75, color: K,
    })

    const sig2X = mg + cW / 2 + 12
    page.drawText(sig2, { x: sig2X, y: sigY, size: 8, font: fB, color: K })
    page.drawLine({
      start: { x: sig2X + fB.widthOfTextAtSize(sig2, 8) + 6, y: sigY - 2 },
      end:   { x: mg + cW,                                     y: sigY - 2 },
      thickness: 0.75, color: K,
    })

    // ── Serialize ──────────────────────────────────────────────────────────────

    const pdfBytes = await pdfDoc.save()
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="rapport-heures-s${semaine}.pdf"`,
      },
    })
  } catch (e: any) {
    console.error('[rapport-heures] Error generating PDF:', e)
    return NextResponse.json({ error: 'Erreur g\u00e9n\u00e9ration PDF' }, { status: 500 })
  }
}
