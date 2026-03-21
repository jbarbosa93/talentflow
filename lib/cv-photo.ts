// Extracts the best portrait/headshot photo from a PDF
// Collects ALL candidate images, scores them, and picks the most likely headshot
// Returns a JPEG buffer or null if no suitable headshot found

interface ImageCandidate {
  buffer: Buffer
  width: number
  height: number
  ratio: number       // height/width
  area: number        // width * height
  compressedSize: number // JPEG size in bytes (proxy for photo complexity)
  pageIndex: number
  source: string      // debug label
}

/**
 * Score an image candidate on how likely it is to be a real headshot photo.
 * Higher score = more likely a headshot.
 *
 * Key insight: headshots have a PORTRAIT ratio (height > width, typically 1.15-1.6).
 * Square or landscape images (furniture, product photos, logos) must be rejected.
 */
function scoreHeadshot(img: ImageCandidate): number {
  let score = 0

  // --- RATIO is the most important discriminator ---
  // Headshots: tall portrait (1.15 - 1.6), sometimes slightly taller
  // Decorative/product: usually square (0.85-1.1) or landscape
  if (img.ratio >= 1.2 && img.ratio <= 1.55) score += 50   // Perfect ID/passport portrait
  else if (img.ratio >= 1.1 && img.ratio <= 1.7) score += 25  // Acceptable portrait
  else if (img.ratio >= 0.9 && img.ratio < 1.1) score -= 20  // Square — likely product/portfolio photo
  else if (img.ratio >= 0.75 && img.ratio < 0.9) score -= 40  // Landscape — almost certainly not headshot
  else score -= 60  // Very wide or very tall — not a headshot

  // --- Dimension scoring ---
  // Ideal headshot: 100-450px wide, 130-600px tall
  if (img.width >= 100 && img.width <= 450) score += 20
  else if (img.width >= 60 && img.width <= 600) score += 5
  else if (img.width > 600) score -= 15  // Too wide — likely a banner or full-width image
  else score -= 10

  if (img.height >= 130 && img.height <= 600) score += 15
  else if (img.height >= 80 && img.height <= 800) score += 5
  else score -= 10

  // --- Area scoring ---
  // Headshots are medium-sized: 15,000 - 250,000 pixels
  if (img.area >= 15000 && img.area <= 250000) score += 15
  else if (img.area >= 8000 && img.area <= 500000) score += 5
  else if (img.area < 5000) score -= 25   // Icon/logo
  else if (img.area > 600000) score -= 15 // Full page scan

  // --- JPEG complexity (compressed size after resize to 300x400) ---
  // Real face photos have lots of color variation → larger JPEG
  // Simple graphics/logos/icons → very small JPEG (< 3KB)
  // Product photos can also be large, but caught by ratio filter above
  if (img.compressedSize >= 6000 && img.compressedSize <= 400000) score += 20
  else if (img.compressedSize >= 3000) score += 8
  else if (img.compressedSize < 2000) score -= 25  // Too simple = not a face photo

  // --- Page preference (headshot almost always on page 1) ---
  if (img.pageIndex === 0) score += 12
  else score -= 5

  return score
}

// Minimum score threshold — images below this are not headshots
const MIN_HEADSHOT_SCORE = 50

export async function extractPhotoFromPDF(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const candidates: ImageCandidate[] = []

    // --- Strategy 1: Extract raw JPEG/image data from PDF XObjects ---
    await collectImagesFromPdfRaw(pdfBuffer, candidates)

    // --- Strategy 2: Use pdfjs-dist as fallback ---
    if (candidates.length === 0) {
      await collectImagesViaPdfjs(pdfBuffer, candidates)
    }

    if (candidates.length === 0) return null

    // Score all candidates and pick the best
    let bestCandidate: ImageCandidate | null = null
    let bestScore = -Infinity

    for (const img of candidates) {
      const s = scoreHeadshot(img)
      console.log(`[CV Photo] Candidate: ${img.source} ${img.width}x${img.height} ratio=${img.ratio.toFixed(2)} compressed=${img.compressedSize}B score=${s}`)
      if (s > bestScore) {
        bestScore = s
        bestCandidate = img
      }
    }

    if (!bestCandidate || bestScore < MIN_HEADSHOT_SCORE) {
      console.log(`[CV Photo] No suitable headshot found. Best score: ${bestScore} (threshold: ${MIN_HEADSHOT_SCORE})`)
      return null
    }

    console.log(`[CV Photo] Selected: ${bestCandidate.source} ${bestCandidate.width}x${bestCandidate.height} score=${bestScore}`)
    return bestCandidate.buffer

  } catch (e) {
    console.warn('[CV Photo] extraction failed:', (e as Error).message)
    return null
  }
}

/**
 * Strategy 1: Walk raw PDF structure for image XObjects.
 * Collects ALL qualifying images instead of returning the first.
 */
async function collectImagesFromPdfRaw(pdfBuffer: Buffer, candidates: ImageCandidate[]): Promise<void> {
  try {
    const pdflib = await import('pdf-lib')
    const { PDFDocument, PDFName, PDFRawStream, PDFRef } = pdflib
    const PDFDict = pdflib.PDFDict

    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
    const sharp = (await import('sharp')).default

    const pagesToCheck = Math.min(3, pdfDoc.getPageCount())

    for (let pageIdx = 0; pageIdx < pagesToCheck; pageIdx++) {
      const page = pdfDoc.getPage(pageIdx)
      const pageDict = page.node

      // Resolve Resources
      const rawResources = pageDict.get(PDFName.of('Resources'))
      let resources: any = rawResources
      if (rawResources instanceof PDFRef) {
        resources = pdfDoc.context.lookup(rawResources)
      }
      if (!(resources instanceof PDFDict)) continue

      // Resolve XObject dictionary
      const rawXObjects = resources.get(PDFName.of('XObject'))
      let xObjects: any = rawXObjects
      if (rawXObjects instanceof PDFRef) {
        xObjects = pdfDoc.context.lookup(rawXObjects)
      }
      if (!(xObjects instanceof PDFDict)) continue

      for (const key of xObjects.keys()) {
        try {
          const rawXObj = xObjects.get(key)
          let xobj: any = rawXObj
          if (rawXObj instanceof PDFRef) {
            xobj = pdfDoc.context.lookup(rawXObj)
          }

          if (!(xobj instanceof PDFRawStream)) continue

          const dict = xobj.dict

          // Must be an Image XObject
          const subtype = dict.get(PDFName.of('Subtype'))
          if (!subtype || subtype.toString() !== '/Image') continue

          // Get dimensions
          const widthObj  = dict.get(PDFName.of('Width'))
          const heightObj = dict.get(PDFName.of('Height'))
          if (!widthObj || !heightObj) continue

          const width  = Number(widthObj.toString())
          const height = Number(heightObj.toString())

          // Basic pre-filter: skip tiny icons and huge full-page scans
          if (width < 60 || height < 60) continue
          if (width > 1200 || height > 1600) continue
          const ratio = height / width
          // Skip extreme ratios (banners, thin lines, etc.)
          if (ratio < 0.5 || ratio > 3.0) continue

          const filterObj  = dict.get(PDFName.of('Filter'))
          const filterName = filterObj ? filterObj.toString() : ''

          const rawBytes: Uint8Array = xobj.getContents()
          if (!rawBytes || rawBytes.length < 100) continue

          let resizedBuffer: Buffer | null = null

          // --- DCTDecode = raw JPEG ---
          if (filterName.includes('DCTDecode') || (rawBytes[0] === 0xFF && rawBytes[1] === 0xD8)) {
            try {
              resizedBuffer = await sharp(Buffer.from(rawBytes))
                .resize({ width: 300, height: 400, fit: 'inside' })
                .jpeg({ quality: 85 })
                .toBuffer()
            } catch { continue }
          }

          // --- FlateDecode = deflate-compressed raw pixel data ---
          else if (filterName.includes('FlateDecode')) {
            const zlib = await import('zlib')
            let decompressed: Buffer
            try {
              decompressed = await new Promise<Buffer>((resolve, reject) => {
                zlib.inflate(Buffer.from(rawBytes), (err, buf) => {
                  if (err) zlib.inflateRaw(Buffer.from(rawBytes), (err2, buf2) => {
                    if (err2) reject(err2); else resolve(buf2)
                  }); else resolve(buf)
                })
              })
            } catch { continue }

            const colorSpaceObj = dict.get(PDFName.of('ColorSpace'))
            const colorSpace    = colorSpaceObj ? colorSpaceObj.toString() : ''
            const bpcObj        = dict.get(PDFName.of('BitsPerComponent'))
            const bpc           = bpcObj ? Number(bpcObj.toString()) : 8
            if (bpc !== 8) continue

            let channels: 1 | 3 | 4 = 3
            if (colorSpace.includes('Gray') || colorSpace === '/DeviceGray') channels = 1
            else if (colorSpace.includes('CMYK') || colorSpace === '/DeviceCMYK') channels = 4

            const expectedBytes = width * height * channels
            if (decompressed.length < expectedBytes * 0.7) continue

            try {
              resizedBuffer = await sharp(decompressed, {
                raw: { width, height, channels }
              })
                .resize({ width: 300, height: 400, fit: 'inside' })
                .jpeg({ quality: 85 })
                .toBuffer()
            } catch { continue }
          }

          // --- JPXDecode = JPEG 2000 ---
          else if (filterName.includes('JPXDecode')) {
            try {
              resizedBuffer = await sharp(Buffer.from(rawBytes))
                .resize({ width: 300, height: 400, fit: 'inside' })
                .jpeg({ quality: 85 })
                .toBuffer()
            } catch { continue }
          }

          if (resizedBuffer) {
            candidates.push({
              buffer: resizedBuffer,
              width,
              height,
              ratio,
              area: width * height,
              compressedSize: resizedBuffer.length,
              pageIndex: pageIdx,
              source: `pdf-lib:${filterName}:p${pageIdx + 1}:${key.toString()}`,
            })
          }
        } catch {
          continue
        }
      }
    }
  } catch (e) {
    console.warn('[CV Photo] pdf-lib strategy failed:', (e as Error).message)
  }
}

/**
 * Strategy 2: Use pdfjs-dist operator list to find painted images.
 * Collects ALL qualifying images.
 */
async function collectImagesViaPdfjs(pdfBuffer: Buffer, candidates: ImageCandidate[]): Promise<void> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs' as string)
    const lib = (pdfjs as any).default ?? pdfjs
    if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = ''

    const loadingTask = lib.getDocument({
      data: new Uint8Array(pdfBuffer),
      verbosity: 0,
      useWorkerFetch: false,
      isEvalSupported: false,
    })
    const pdf = await loadingTask.promise
    const sharp = (await import('sharp')).default

    for (let pageNum = 1; pageNum <= Math.min(3, pdf.numPages); pageNum++) {
      const page = await pdf.getPage(pageNum)
      const opList = await page.getOperatorList()

      const imgNames: string[] = []
      for (let i = 0; i < opList.fnArray.length; i++) {
        if (opList.fnArray[i] === 85 && opList.argsArray[i]?.[0]) {
          imgNames.push(opList.argsArray[i][0] as string)
        }
      }

      for (const imgName of imgNames) {
        try {
          const img: any = await Promise.race([
            new Promise((resolve, reject) => {
              try {
                page.objs.get(imgName, (imgData: any) => {
                  if (imgData) resolve(imgData)
                  else reject(new Error('no data'))
                })
              } catch (e) {
                reject(e)
              }
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
          ])

          if (!img || !img.data) continue
          const { width, height, data, kind } = img

          // Basic pre-filter
          if (width < 60 || height < 60) continue
          if (width > 1200 || height > 1600) continue
          const ratio = height / width
          if (ratio < 0.5 || ratio > 3.0) continue

          const channels = kind === 1 ? 1 : kind === 2 ? 3 : 4

          try {
            const jpegBuffer = await sharp(Buffer.from(data.buffer ?? data), {
              raw: { width, height, channels }
            })
              .resize({ width: 300, height: 400, fit: 'inside' })
              .jpeg({ quality: 85 })
              .toBuffer()

            candidates.push({
              buffer: jpegBuffer,
              width,
              height,
              ratio,
              area: width * height,
              compressedSize: jpegBuffer.length,
              pageIndex: pageNum - 1,
              source: `pdfjs:p${pageNum}:${imgName}`,
            })
          } catch {
            continue
          }
        } catch {
          continue
        }
      }
    }
  } catch (e) {
    console.warn('[CV Photo] pdfjs strategy failed:', (e as Error).message)
  }
}
