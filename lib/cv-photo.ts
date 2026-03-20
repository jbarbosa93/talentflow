// Extracts the first portrait-ratio image from a PDF using pdf-lib (raw XObject parsing)
// Falls back to pdfjs-dist pixel extraction if pdf-lib finds no JPEG data
// Returns a JPEG buffer or null if no suitable image found

export async function extractPhotoFromPDF(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    // --- Strategy 1: Extract raw JPEG/DCT data directly from PDF XObjects ---
    const result = await extractJpegFromPdfRaw(pdfBuffer)
    if (result) return result

    // --- Strategy 2: Render page via pdfjs-dist and grab pixel image ---
    return await extractImageViaPdfjs(pdfBuffer)
  } catch (e) {
    console.warn('[CV Photo] extraction failed:', (e as Error).message)
    return null
  }
}

/**
 * Strategy 1: Walk the raw PDF byte structure looking for image XObjects
 * with DCTDecode (JPEG) or FlateDecode filters and portrait-ratio dimensions.
 *
 * KEY FIX: pdf-lib dict.get() returns PDFRef objects for indirect objects.
 * We must resolve them with pdfDoc.context.lookup(ref).
 */
async function extractJpegFromPdfRaw(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const pdflib = await import('pdf-lib')
    const { PDFDocument, PDFName, PDFRawStream, PDFRef } = pdflib
    const PDFDict = pdflib.PDFDict

    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
    const sharp = (await import('sharp')).default

    const pagesToCheck = Math.min(2, pdfDoc.getPageCount())

    for (let pageIdx = 0; pageIdx < pagesToCheck; pageIdx++) {
      const page = pdfDoc.getPage(pageIdx)
      const pageDict = page.node

      // Resolve Resources — may be a direct PDFDict or a PDFRef to one
      const rawResources = pageDict.get(PDFName.of('Resources'))
      let resources: any = rawResources
      if (rawResources instanceof PDFRef) {
        resources = pdfDoc.context.lookup(rawResources)
      }
      if (!(resources instanceof PDFDict)) continue

      // Resolve XObject dictionary — same pattern
      const rawXObjects = resources.get(PDFName.of('XObject'))
      let xObjects: any = rawXObjects
      if (rawXObjects instanceof PDFRef) {
        xObjects = pdfDoc.context.lookup(rawXObjects)
      }
      if (!(xObjects instanceof PDFDict)) continue

      // Iterate all XObject entries
      for (const key of xObjects.keys()) {
        try {
          // Resolve the XObject itself — almost always a PDFRef in practice
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

          // Portrait or near-square, headshot dimensions
          if (width < 40 || width > 700 || height < 40) continue
          const ratio = height / width
          if (ratio < 0.75) continue // skip landscape images

          // Get filter name
          const filterObj  = dict.get(PDFName.of('Filter'))
          const filterName = filterObj ? filterObj.toString() : ''

          // Get raw compressed bytes
          const rawBytes: Uint8Array = xobj.getContents()
          if (!rawBytes || rawBytes.length < 100) continue

          // --- DCTDecode = raw JPEG ---
          if (filterName.includes('DCTDecode') || rawBytes[0] === 0xFF && rawBytes[1] === 0xD8) {
            if (rawBytes[0] === 0xFF && rawBytes[1] === 0xD8) {
              const jpegBuf = Buffer.from(rawBytes)
              const resized = await sharp(jpegBuf)
                .resize({ width: 300, height: 400, fit: 'inside' })
                .jpeg({ quality: 85 })
                .toBuffer()
              console.log(`[CV Photo] DCT JPEG found: ${width}×${height}px → ${resized.length} bytes`)
              return resized
            }
            // Sometimes the bytes are the JPEG but don't start with FF D8 due to encoding — try anyway
            try {
              const jpegBuf = Buffer.from(rawBytes)
              const resized = await sharp(jpegBuf)
                .resize({ width: 300, height: 400, fit: 'inside' })
                .jpeg({ quality: 85 })
                .toBuffer()
              console.log(`[CV Photo] DCT JPEG (alt): ${width}×${height}px → ${resized.length} bytes`)
              return resized
            } catch { continue }
          }

          // --- FlateDecode = deflate-compressed raw pixel data ---
          if (filterName.includes('FlateDecode')) {
            // We need to decompress first — use Node.js zlib
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
              const jpegBuf = await sharp(decompressed, {
                raw: { width, height, channels }
              })
                .resize({ width: 300, height: 400, fit: 'inside' })
                .jpeg({ quality: 85 })
                .toBuffer()
              console.log(`[CV Photo] FlateDecode image: ${width}×${height}px ch=${channels} → ${jpegBuf.length} bytes`)
              return jpegBuf
            } catch { continue }
          }

          // --- JPXDecode = JPEG 2000 — try passing raw bytes to sharp ---
          if (filterName.includes('JPXDecode')) {
            try {
              const jpegBuf = await sharp(Buffer.from(rawBytes))
                .resize({ width: 300, height: 400, fit: 'inside' })
                .jpeg({ quality: 85 })
                .toBuffer()
              console.log(`[CV Photo] JPX image: ${width}×${height}px → ${jpegBuf.length} bytes`)
              return jpegBuf
            } catch { continue }
          }

        } catch {
          continue
        }
      }
    }
  } catch (e) {
    console.warn('[CV Photo] pdf-lib strategy failed:', (e as Error).message)
  }
  return null
}

/**
 * Strategy 2: Use pdfjs-dist operator list to find painted images and extract
 * pixel data via the object store.
 */
async function extractImageViaPdfjs(pdfBuffer: Buffer): Promise<Buffer | null> {
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

    for (let pageNum = 1; pageNum <= Math.min(2, pdf.numPages); pageNum++) {
      const page = await pdf.getPage(pageNum)
      const opList = await page.getOperatorList()

      const imgNames: string[] = []
      for (let i = 0; i < opList.fnArray.length; i++) {
        // OPS.paintImageXObject = 85
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

          const ratio = height / width
          if (ratio < 0.75 || width < 40 || width > 700 || height < 40) continue

          const channels = kind === 1 ? 1 : kind === 2 ? 3 : 4

          try {
            const jpegBuffer = await sharp(Buffer.from(data.buffer ?? data), {
              raw: { width, height, channels }
            })
              .resize({ width: 300, height: 400, fit: 'inside' })
              .jpeg({ quality: 85 })
              .toBuffer()
            console.log(`[CV Photo] pdfjs pixel image: ${width}×${height}px → ${jpegBuffer.length} bytes`)
            return jpegBuffer
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
  return null
}
