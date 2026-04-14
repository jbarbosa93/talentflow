// Extracts the best portrait/headshot photo from a PDF or DOCX
// Collects ALL candidate images, scores them, and picks the most likely headshot
// Returns a JPEG buffer or null if no suitable headshot found

export interface ImageCandidate {
  buffer: Buffer
  width: number
  height: number
  ratio: number       // height/width
  area: number        // width * height
  compressedSize: number // JPEG size in bytes (proxy for photo complexity)
  uniqueColors: number  // nombre de couleurs uniques (binned) — icônes < 15, photos > 50
  skinRatio: number     // proportion de pixels couleur peau (0.0 - 1.0)
  pageIndex: number
  source: string      // debug label
}

/**
 * Score an image candidate on how likely it is to be a real headshot photo.
 * Higher score = more likely a headshot.
 */
export function scoreHeadshot(img: ImageCandidate): number {
  // --- Rejets explicites (anti-icônes / anti-logos / anti-scans) ---
  if (img.ratio >= 0.9 && img.ratio <= 1.1 && img.width < 80) return -100 // icône carrée petite
  if (img.width > 2000) return -100 // scan document entier, pas une photo

  let score = 0

  // --- Détection photo N&B / niveaux de gris ---
  const likelyBW = img.uniqueColors <= 20 && img.skinRatio >= 0.04

  // --- Rejet icône monochrome (≤5 couleurs ET pas N&B) ---
  if (img.uniqueColors <= 5 && !likelyBW) return -100

  // --- COLOR DIVERSITY ---
  if (likelyBW) {
    score += 5
  } else {
    if (img.uniqueColors <= 10) score -= 80
    else if (img.uniqueColors <= 20) score -= 40
    else if (img.uniqueColors >= 80) score += 25
    else if (img.uniqueColors >= 40) score += 15
  }

  // --- Photos passeport fond blanc : annuler pénalité couleurs ---
  // Si ratio portrait + peau détectée → le fond blanc n'est pas un problème
  if (score < 0 && img.ratio >= 1.2 && img.ratio <= 1.55 && img.skinRatio >= 0.08) {
    score = 5
  }

  // --- RATIO ---
  if (img.ratio >= 1.2 && img.ratio <= 1.55) score += 50
  else if (img.ratio >= 1.1 && img.ratio <= 1.7) score += 25
  else if (img.ratio >= 0.9 && img.ratio < 1.1) score -= 20
  else if (img.ratio >= 0.75 && img.ratio < 0.9) score -= 40
  else score -= 60

  // --- Dimension scoring ---
  if (img.width >= 100 && img.width <= 600) score += 20
  else if (img.width >= 60 && img.width <= 1500) score += 5
  else if (img.width > 1500) score -= 15
  else score -= 10

  if (img.height >= 130 && img.height <= 800) score += 15
  else if (img.height >= 80 && img.height <= 2000) score += 5
  else score -= 10

  // --- Area scoring ---
  if (img.area >= 15000 && img.area <= 250000) score += 15
  else if (img.area >= 8000 && img.area <= 1500000) score += 5
  else if (img.area < 5000) score -= 25
  else if (img.area > 1500000) score -= 40

  // --- Full-page scan detection ---
  if (img.width > 500 && img.height > 700 && img.ratio >= 1.3 && img.ratio <= 1.5 && img.area > 400000) {
    score -= 20
  }

  // --- JPEG complexity ---
  if (img.compressedSize >= 6000 && img.compressedSize <= 400000) score += 20
  else if (img.compressedSize >= 3000) score += 8
  else if (img.compressedSize < 2000) score -= 25

  // --- Page preference ---
  if (img.pageIndex === 0) score += 12
  else score -= 5

  // --- SKIN TONE detection ---
  // N&B : ×0.6 si portrait avec bonnes dimensions, ×0.3 sinon
  const bwBoost = likelyBW && img.ratio >= 1.1 && img.ratio <= 1.7 && img.width >= 80 && img.height >= 100
  const effectiveSkinRatio = likelyBW ? Math.min(img.skinRatio / (bwBoost ? 0.6 : 0.3), 1.0) : img.skinRatio
  if (effectiveSkinRatio >= 0.10 && effectiveSkinRatio <= 0.55) score += 30
  else if (effectiveSkinRatio >= 0.05 && effectiveSkinRatio < 0.10) score += 10
  else if (effectiveSkinRatio < 0.02) score -= 15

  return score
}

const MIN_HEADSHOT_SCORE = 20

/**
 * Count unique colors (binned to 16 levels per channel) in a resized thumbnail.
 */
export async function countUniqueColors(imageBuffer: Buffer, isRaw?: boolean, rawOpts?: { width: number; height: number; channels: 1 | 3 | 4 }): Promise<number> {
  try {
    const sharpMod = (await import('sharp')).default
    const pipeline = isRaw && rawOpts
      ? sharpMod(imageBuffer, { raw: rawOpts })
      : sharpMod(imageBuffer)

    const { data, info } = await pipeline
      .resize({ width: 40, height: 40, fit: 'fill' })
      .toColorspace('srgb')
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const colors = new Set<string>()
    const ch = info.channels
    for (let i = 0; i + 2 < data.length; i += ch) {
      colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`)
    }
    return colors.size
  } catch (e) {
    console.warn('[CV Photo] countUniqueColors failed:', (e as Error).message)
    return 999
  }
}

/**
 * Detect proportion of skin-tone pixels using HSV heuristics.
 * Works across all skin tones (light to dark):
 * - Hue: 0-50 (skin range — red/orange/yellow)
 * - Saturation: 15-170 (not too gray, not fully saturated)
 * - Value: 50-255 (not too dark)
 * For grayscale/N&B photos: checks luminance range typical of faces (80-200)
 */
export async function detectSkinRatio(imageBuffer: Buffer): Promise<number> {
  try {
    const sharpMod = (await import('sharp')).default
    const { data, info } = await sharpMod(imageBuffer)
      .resize({ width: 50, height: 50, fit: 'fill' })
      .toColorspace('srgb')
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let skinPixels = 0
    const totalPixels = info.width * info.height
    const ch = info.channels

    for (let i = 0; i + 2 < data.length; i += ch) {
      const r = data[i], g = data[i + 1], b = data[i + 2]

      // Convert to HSV
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const delta = max - min

      // Value (brightness)
      const v = max
      if (v < 50) continue // too dark

      // Saturation
      const s = max === 0 ? 0 : (delta / max) * 255

      // Grayscale detection — if very low saturation, use luminance heuristic
      if (s < 15) {
        // Grayscale: mid-range luminance (80-200) is face-like
        if (v >= 80 && v <= 200) skinPixels += 0.3 // partial credit for gray faces
        continue
      }

      // Hue
      let h = 0
      if (delta > 0) {
        if (max === r) h = 60 * (((g - b) / delta) % 6)
        else if (max === g) h = 60 * (((b - r) / delta) + 2)
        else h = 60 * (((r - g) / delta) + 4)
        if (h < 0) h += 360
      }

      // Skin tone heuristic (works for all skin tones)
      // Hue 0-50° covers all human skin tones from very dark to very light
      // Also check 340-360° (reddish skin, some darker complexions)
      const hueOk = (h >= 0 && h <= 50) || (h >= 340 && h <= 360)
      const satOk = s >= 15 && s <= 170
      const valOk = v >= 50 && v <= 255

      if (hueOk && satOk && valOk) skinPixels++
    }

    return totalPixels > 0 ? skinPixels / totalPixels : 0
  } catch {
    return 0
  }
}

// ─── Main entry points ───────────────────────────────────────────────────────

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
    return pickBestCandidate(candidates)

  } catch (e) {
    console.warn('[CV Photo] extraction failed:', (e as Error).message)
    return null
  }
}

/**
 * Extract photo from DOC (Word 97-2003 OLE2 binary) via mammoth image handler.
 */
export async function extractPhotoFromDOC(docBuffer: Buffer): Promise<Buffer | null> {
  try {
    const mammoth = await import('mammoth')
    const sharp   = (await import('sharp')).default
    const candidates: ImageCandidate[] = []

    const imageBuffers: Buffer[] = []
    await mammoth.convertToHtml(
      { buffer: docBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image: any) => {
          try {
            const buf = await image.read() as Buffer
            if (buf && buf.length >= 500) imageBuffers.push(buf)
          } catch { /* skip */ }
          return { src: '' }
        }),
      }
    )

    for (const imgData of imageBuffers) {
      try {
        const metadata = await sharp(imgData).metadata()
        if (!metadata.width || !metadata.height) continue
        const w = metadata.width, h = metadata.height
        if (w < 60 || h < 60) continue
        if (w > 2000 || h > 2500) continue
        const ratio = h / w
        if (ratio < 0.5 || ratio > 3.0) continue

        const resizedBuffer = await sharp(imgData)
          .resize({ width: 300, height: 400, fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer()

        const uc = await countUniqueColors(resizedBuffer, false)
        const sr = await detectSkinRatio(resizedBuffer)
        candidates.push({
          buffer: resizedBuffer, width: w, height: h, ratio,
          area: w * h, compressedSize: resizedBuffer.length,
          uniqueColors: uc, skinRatio: sr, pageIndex: 0,
          source: `doc:mammoth`,
        })
      } catch { continue }
    }

    if (candidates.length === 0) return null
    return pickBestCandidate(candidates)
  } catch (e) {
    console.warn('[CV Photo] DOC extraction failed:', (e as Error).message)
    return null
  }
}

/**
 * Extract photo from DOCX by unzipping and reading word/media/ images.
 */
export async function extractPhotoFromDOCX(docxBuffer: Buffer): Promise<Buffer | null> {
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(docxBuffer)
    const sharp = (await import('sharp')).default

    const candidates: ImageCandidate[] = []
    const mediaFiles = Object.keys(zip.files).filter(
      f => f.startsWith('word/media/') && /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(f)
    )

    for (const mediaPath of mediaFiles) {
      try {
        const imgData = await zip.files[mediaPath].async('nodebuffer')
        if (!imgData || imgData.length < 500) continue // skip tiny icons

        const metadata = await sharp(imgData).metadata()
        if (!metadata.width || !metadata.height) continue

        const w = metadata.width
        const h = metadata.height
        if (w < 60 || h < 60) continue
        if (w > 2000 || h > 2500) continue
        const ratio = h / w
        if (ratio < 0.5 || ratio > 3.0) continue

        const resizedBuffer = await sharp(imgData)
          .resize({ width: 300, height: 400, fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer()

        const uc = await countUniqueColors(resizedBuffer, false)
        const sr = await detectSkinRatio(resizedBuffer)

        candidates.push({
          buffer: resizedBuffer,
          width: w,
          height: h,
          ratio,
          area: w * h,
          compressedSize: resizedBuffer.length,
          uniqueColors: uc,
          skinRatio: sr,
          pageIndex: 0,
          source: `docx:${mediaPath}`,
        })
      } catch { continue }
    }

    if (candidates.length === 0) return null
    return pickBestCandidate(candidates)
  } catch (e) {
    console.warn('[CV Photo] DOCX extraction failed:', (e as Error).message)
    return null
  }
}

/**
 * Pick the best candidate from scored list
 */
async function pickBestCandidate(candidates: ImageCandidate[]): Promise<Buffer | null> {
  let bestCandidate: ImageCandidate | null = null
  let bestScore = -Infinity

  for (const img of candidates) {
    const s = scoreHeadshot(img)
    console.log(`[CV Photo] Candidate: ${img.source} ${img.width}x${img.height} ratio=${img.ratio.toFixed(2)} compressed=${img.compressedSize}B colors=${img.uniqueColors} skin=${(img.skinRatio * 100).toFixed(0)}% score=${s}`)
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
}

// ─── Strategy 1: pdf-lib raw XObjects ────────────────────────────────────────

async function collectImagesFromPdfRaw(pdfBuffer: Buffer, candidates: ImageCandidate[]): Promise<void> {
  try {
    const pdflib = await import('pdf-lib')
    const { PDFDocument, PDFName, PDFRawStream, PDFRef } = pdflib
    const PDFDict = pdflib.PDFDict

    const pdfDoc = await PDFDocument.load(pdfBuffer)
    const sharp = (await import('sharp')).default

    const pagesToCheck = Math.min(3, pdfDoc.getPageCount())

    for (let pageIdx = 0; pageIdx < pagesToCheck; pageIdx++) {
      const page = pdfDoc.getPage(pageIdx)
      const pageDict = page.node

      const rawResources = pageDict.get(PDFName.of('Resources'))
      let resources: any = rawResources
      if (rawResources instanceof PDFRef) {
        resources = pdfDoc.context.lookup(rawResources)
      }
      if (!(resources instanceof PDFDict)) continue

      const rawXObjects = resources.get(PDFName.of('XObject'))
      let xObjects: any = rawXObjects
      if (rawXObjects instanceof PDFRef) {
        xObjects = pdfDoc.context.lookup(rawXObjects)
      }
      if (!(xObjects instanceof PDFDict)) continue

      // Process XObjects — including Form XObjects (recursive)
      await processXObjects(xObjects, pdfDoc, sharp, pageIdx, candidates, 0)
    }
  } catch (e) {
    console.warn('[CV Photo] pdf-lib strategy failed:', (e as Error).message)
  }
}

/**
 * Recursively process XObjects — handles both Image and Form XObjects.
 * Form XObjects can contain nested images (depth-limited to 3).
 */
async function processXObjects(
  xObjects: any, pdfDoc: any, sharp: any, pageIdx: number,
  candidates: ImageCandidate[], depth: number
): Promise<void> {
  const { PDFName, PDFRawStream, PDFRef, PDFDict } = await import('pdf-lib')
  if (depth > 3) return

  for (const key of xObjects.keys()) {
    try {
      const rawXObj = xObjects.get(key)
      let xobj: any = rawXObj
      if (rawXObj instanceof PDFRef) {
        xobj = pdfDoc.context.lookup(rawXObj)
      }

      if (!(xobj instanceof PDFRawStream)) continue

      const dict = xobj.dict
      const subtype = dict.get(PDFName.of('Subtype'))
      if (!subtype) continue

      // ── Form XObject → recurse into its Resources/XObject ──
      if (subtype.toString() === '/Form') {
        const formRes = dict.get(PDFName.of('Resources'))
        let formResDict: any = formRes
        if (formRes instanceof PDFRef) formResDict = pdfDoc.context.lookup(formRes)
        if (formResDict instanceof PDFDict) {
          const formXObj = formResDict.get(PDFName.of('XObject'))
          let formXObjDict: any = formXObj
          if (formXObj instanceof PDFRef) formXObjDict = pdfDoc.context.lookup(formXObj)
          if (formXObjDict instanceof PDFDict) {
            await processXObjects(formXObjDict, pdfDoc, sharp, pageIdx, candidates, depth + 1)
          }
        }
        continue
      }

      // ── Image XObject ──
      if (subtype.toString() !== '/Image') continue

      const widthObj  = dict.get(PDFName.of('Width'))
      const heightObj = dict.get(PDFName.of('Height'))
      if (!widthObj || !heightObj) continue

      const width  = Number(widthObj.toString())
      const height = Number(heightObj.toString())

      if (width < 60 || height < 60) continue
      if (width > 2000 || height > 2500) continue
      const ratio = height / width
      if (ratio < 0.5 || ratio > 3.0) continue

      const filterObj  = dict.get(PDFName.of('Filter'))
      const filterName = filterObj ? filterObj.toString() : ''

      const rawBytes: Uint8Array = xobj.getContents()
      if (!rawBytes || rawBytes.length < 100) continue

      // ── Check for SMask (alpha mask) and recombine ──
      let smaskBuffer: Buffer | null = null
      let smaskW = width, smaskH = height
      const smaskRef = dict.get(PDFName.of('SMask'))
      if (smaskRef) {
        try {
          let smaskObj: any = smaskRef
          if (smaskRef instanceof PDFRef) smaskObj = pdfDoc.context.lookup(smaskRef)
          if (smaskObj instanceof PDFRawStream) {
            const smaskFilter = smaskObj.dict.get(PDFName.of('Filter'))
            const smaskFilterName = smaskFilter ? smaskFilter.toString() : ''
            const smaskRaw: Uint8Array = smaskObj.getContents()
            const smaskWObj = smaskObj.dict.get(PDFName.of('Width'))
            const smaskHObj = smaskObj.dict.get(PDFName.of('Height'))
            if (smaskWObj) smaskW = Number(smaskWObj.toString())
            if (smaskHObj) smaskH = Number(smaskHObj.toString())

            if (smaskFilterName.includes('FlateDecode')) {
              const zlib = await import('zlib')
              smaskBuffer = await new Promise<Buffer>((resolve, reject) => {
                zlib.inflate(Buffer.from(smaskRaw), (err, buf) => {
                  if (err) zlib.inflateRaw(Buffer.from(smaskRaw), (err2, buf2) => {
                    if (err2) reject(err2); else resolve(buf2)
                  }); else resolve(buf)
                })
              })
            } else if (smaskRaw.length >= smaskW * smaskH) {
              smaskBuffer = Buffer.from(smaskRaw)
            }
          }
        } catch {
          smaskBuffer = null
        }
      }

      let resizedBuffer: Buffer | null = null

      // --- DCTDecode = raw JPEG ---
      if (filterName.includes('DCTDecode') || (rawBytes[0] === 0xFF && rawBytes[1] === 0xD8)) {
        try {
          if (smaskBuffer && smaskW === width && smaskH === height) {
            // Recombine JPEG with alpha mask → white background
            resizedBuffer = await compositeWithMask(sharp, Buffer.from(rawBytes), smaskBuffer, width, height)
          } else {
            resizedBuffer = await sharp(Buffer.from(rawBytes))
              .resize({ width: 300, height: 400, fit: 'inside' })
              .jpeg({ quality: 85 })
              .toBuffer()
          }
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
          if (smaskBuffer && smaskW === width && smaskH === height && channels >= 3) {
            // Recombine raw pixels with alpha mask → white background
            const rgbBuf = channels === 4
              ? await sharp(decompressed, { raw: { width, height, channels: 4 } }).toColorspace('srgb').removeAlpha().raw().toBuffer()
              : decompressed
            resizedBuffer = await compositeWithMaskRaw(sharp, rgbBuf, smaskBuffer, width, height, channels === 4 ? 3 : channels)
          } else {
            resizedBuffer = await sharp(decompressed, {
              raw: { width, height, channels }
            })
              .resize({ width: 300, height: 400, fit: 'inside' })
              .jpeg({ quality: 85 })
              .toBuffer()
          }
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
        const uc = await countUniqueColors(resizedBuffer, false)
        const sr = await detectSkinRatio(resizedBuffer)
        candidates.push({
          buffer: resizedBuffer,
          width,
          height,
          ratio,
          area: width * height,
          compressedSize: resizedBuffer.length,
          uniqueColors: uc,
          skinRatio: sr,
          pageIndex: pageIdx,
          source: `pdf-lib:${filterName}:p${pageIdx + 1}:${key.toString()}${smaskBuffer ? ':smask' : ''}`,
        })
      }
    } catch {
      continue
    }
  }
}

/**
 * Composite a JPEG image with an alpha mask on a white background.
 * Fixes the "black background" issue for N&B or masked photos.
 */
async function compositeWithMask(sharp: any, jpegBuffer: Buffer, maskBuffer: Buffer, w: number, h: number): Promise<Buffer> {
  // Decode JPEG to raw RGB
  const { data: rgb } = await sharp(jpegBuffer).raw().toBuffer({ resolveWithObject: true })
  return compositeWithMaskRaw(sharp, rgb, maskBuffer, w, h, 3)
}

async function compositeWithMaskRaw(sharp: any, rgbBuffer: Buffer, maskBuffer: Buffer, w: number, h: number, channels: number): Promise<Buffer> {
  // Build RGBA with white background where mask is transparent
  const rgba = Buffer.alloc(w * h * 4)
  const ch = channels as number
  for (let i = 0; i < w * h; i++) {
    const alpha = i < maskBuffer.length ? maskBuffer[i] : 255
    const factor = alpha / 255
    // Blend pixel color with white background: result = color * alpha + white * (1 - alpha)
    const r = ch >= 3 ? rgbBuffer[i * ch] : (ch === 1 ? rgbBuffer[i] : 255)
    const g = ch >= 3 ? rgbBuffer[i * ch + 1] : (ch === 1 ? rgbBuffer[i] : 255)
    const b = ch >= 3 ? rgbBuffer[i * ch + 2] : (ch === 1 ? rgbBuffer[i] : 255)
    rgba[i * 4]     = Math.round(r * factor + 255 * (1 - factor))
    rgba[i * 4 + 1] = Math.round(g * factor + 255 * (1 - factor))
    rgba[i * 4 + 2] = Math.round(b * factor + 255 * (1 - factor))
    rgba[i * 4 + 3] = 255 // fully opaque result
  }

  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .resize({ width: 300, height: 400, fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer()
}

// ─── Strategy 2: pdfjs-dist operator list ────────────────────────────────────

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

          if (width < 60 || height < 60) continue
          if (width > 2000 || height > 2500) continue
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

            const uc = await countUniqueColors(jpegBuffer, false)
            const sr = await detectSkinRatio(jpegBuffer)
            candidates.push({
              buffer: jpegBuffer,
              width,
              height,
              ratio,
              area: width * height,
              compressedSize: jpegBuffer.length,
              uniqueColors: uc,
              skinRatio: sr,
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
