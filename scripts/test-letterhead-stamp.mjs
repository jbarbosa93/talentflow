// v2.8.0 — Test local rendu stampLAgenceLetterhead
// Usage : node scripts/test-letterhead-stamp.mjs
// Input :  ~/Desktop/contrat brut.pdf
// Output : ~/Desktop/contrat brut STAMPED.pdf (à ouvrir dans Preview)

import { readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import path from 'path'

// Réplique exacte de stampLAgenceLetterhead (lib/sign/pdf-stamp.ts) pour test ESM standalone
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

async function stampLAgenceLetterhead(pdfBuffer, logoPngBuffer) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const logo = await pdfDoc.embedPng(logoPngBuffer)

    const firstPage = pdfDoc.getPages()[0]
    if (!firstPage) return await pdfDoc.save()
    const { width: pw, height: ph } = firstPage.getSize()
    console.log(`Page size: ${pw} x ${ph}`)

    const LOGO_W = 175
    const LOGO_H = 175
    const LOGO_X = 42
    const LOGO_TOP_MARGIN = 30
    firstPage.drawImage(logo, {
      x: LOGO_X,
      y: ph - LOGO_TOP_MARGIN - LOGO_H,
      width: LOGO_W,
      height: LOGO_H,
    })

    const seg1 = '024 552 18 70'
    const seg2 = 'info@l-agence.ch'
    const seg3 = 'Avenue des Alpes 3, 1870 Monthey'
    const SIZE1 = 10
    const SEP_GAP = 14
    const SEP_BOX = 4

    const w1 = helv.widthOfTextAtSize(seg1, SIZE1)
    const w2 = helv.widthOfTextAtSize(seg2, SIZE1)
    const w3 = helv.widthOfTextAtSize(seg3, SIZE1)
    const totalW = w1 + w2 + w3 + (SEP_GAP * 2 + SEP_BOX) * 2

    const LINE1_Y = 52
    let x = (pw - totalW) / 2

    firstPage.drawText(seg1, { x, y: LINE1_Y, size: SIZE1, font: helv, color: rgb(0, 0, 0) })
    x += w1 + SEP_GAP
    firstPage.drawRectangle({ x, y: LINE1_Y + 1.5, width: SEP_BOX, height: SEP_BOX, color: rgb(0, 0, 0) })
    x += SEP_BOX + SEP_GAP
    firstPage.drawText(seg2, { x, y: LINE1_Y, size: SIZE1, font: helv, color: rgb(0, 0, 0) })
    x += w2 + SEP_GAP
    firstPage.drawRectangle({ x, y: LINE1_Y + 1.5, width: SEP_BOX, height: SEP_BOX, color: rgb(0, 0, 0) })
    x += SEP_BOX + SEP_GAP
    firstPage.drawText(seg3, { x, y: LINE1_Y, size: SIZE1, font: helv, color: rgb(0, 0, 0) })

    const SIZE2 = 12
    const www = 'www.l-agence.ch'
    const wwwW = helvBold.widthOfTextAtSize(www, SIZE2)
    firstPage.drawText(www, {
      x: (pw - wwwW) / 2,
      y: 26,
      size: SIZE2,
      font: helvBold,
      color: rgb(0, 0, 0),
    })

    return await pdfDoc.save()
  } catch (e) {
    console.error('stampLAgenceLetterhead failed', e)
    throw e
  }
}

const desktop = path.join(homedir(), 'Desktop')
const inputPdf = path.join(desktop, 'contrat brut.pdf')
const logoPng = path.join(process.cwd(), 'public', 'branding', 'l-agence-logo-noir.png')
const outputPdf = path.join(desktop, 'contrat brut STAMPED.pdf')

console.log('Lecture PDF...', inputPdf)
const pdfBuf = await readFile(inputPdf)
console.log(`PDF : ${pdfBuf.length} bytes`)

console.log('Lecture logo...', logoPng)
const logoBuf = await readFile(logoPng)
console.log(`Logo : ${logoBuf.length} bytes`)

console.log('Stamping...')
const stamped = await stampLAgenceLetterhead(new Uint8Array(pdfBuf), new Uint8Array(logoBuf))
console.log(`Stamped : ${stamped.byteLength} bytes`)

await writeFile(outputPdf, stamped)
console.log(`\n✅ Output : ${outputPdf}`)
console.log('Ouvre-le dans Preview pour valider le rendu visuel.')
