import mammoth from 'mammoth'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'

// Prendre le premier argument = chemin du DOCX
const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/test-docx-to-pdf.mjs chemin/vers/cv.docx')
  process.exit(1)
}

console.log('📄 Lecture du DOCX...')

// 1. DOCX → texte brut avec mammoth
const result = await mammoth.extractRawText({ path: inputPath })
const text = result.value
console.log(`✅ Texte extrait : ${text.length} caractères`)
console.log('--- Aperçu (200 premiers chars) ---')
console.log(text.substring(0, 200))
console.log('---')

// 2. Texte → PDF avec pdf-lib
console.log('\n📝 Création du PDF...')

const pdfDoc = await PDFDocument.create()
const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
const fontSize = 11
const lineHeight = fontSize * 1.4
const margin = 50
const pageWidth = 595  // A4
const pageHeight = 842 // A4
const maxWidth = pageWidth - margin * 2

// Découper le texte en lignes
const lines = []
for (const paragraph of text.split('\n')) {
  if (paragraph.trim() === '') {
    lines.push('')
    continue
  }
  const words = paragraph.split(' ')
  let currentLine = ''
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const width = font.widthOfTextAtSize(testLine, fontSize)
    if (width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)
}

// Créer les pages
let page = pdfDoc.addPage([pageWidth, pageHeight])
let y = pageHeight - margin

for (const line of lines) {
  if (y < margin + lineHeight) {
    page = pdfDoc.addPage([pageWidth, pageHeight])
    y = pageHeight - margin
  }
  if (line.trim()) {
    page.drawText(line, {
      x: margin,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0)
    })
  }
  y -= lineHeight
}

// 3. Sauvegarder le PDF
const outputPath = inputPath.replace(/\.(docx|doc)$/i, '_converti.pdf')
const pdfBytes = await pdfDoc.save()
fs.writeFileSync(outputPath, pdfBytes)

console.log(`\n✅ PDF créé : ${outputPath}`)
console.log(`📊 Taille : ${(pdfBytes.length / 1024).toFixed(1)} KB`)
console.log(`📃 Pages : ${pdfDoc.getPageCount()}`)
console.log('\nOuvre le PDF pour voir le résultat !')
