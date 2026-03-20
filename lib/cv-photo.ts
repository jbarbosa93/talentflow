// Extracts the first portrait-ratio image from a PDF using pdfjs-dist
// Returns a JPEG buffer or null if no suitable image found

export async function extractPhotoFromPDF(pdfBuffer: Buffer): Promise<Buffer | null> {
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

    // Check first 2 pages only
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
          const img: any = await new Promise((resolve, reject) => {
            page.objs.get(imgName, (imgData: any) => {
              if (imgData) resolve(imgData)
              else reject(new Error('no data'))
            })
          })

          if (!img || !img.data) continue
          const { width, height, data, kind } = img

          // Portrait ratio (or close to square), reasonable headshot size
          const ratio = height / width
          if (ratio < 0.8 || width < 50 || width > 600 || height < 50) continue

          // Convert raw pixel data to JPEG using sharp
          const sharp = (await import('sharp')).default
          const channels = kind === 1 ? 1 : kind === 2 ? 3 : 4  // GRAYSCALE=1, RGB=2, RGBA=3

          try {
            const jpegBuffer = await sharp(Buffer.from(data.buffer ?? data), {
              raw: { width, height, channels }
            })
            .resize({ width: 300, height: 400, fit: 'inside' })
            .jpeg({ quality: 85 })
            .toBuffer()

            console.log(`[CV Photo] Extracted photo: ${width}x${height} px (${kind} channels) → ${jpegBuffer.length} bytes`)
            return jpegBuffer
          } catch (sharpErr) {
            console.warn('[CV Photo] sharp conversion failed:', (sharpErr as Error).message)
            continue
          }
        } catch {
          continue
        }
      }
    }
  } catch (e) {
    console.warn('[CV Photo] extraction failed:', (e as Error).message)
  }
  return null
}
