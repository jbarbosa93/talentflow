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
  // --- Rejets explicites (anti-icônes / anti-logos / anti-scans / anti-motifs) ---
  if (img.ratio >= 0.9 && img.ratio <= 1.1 && img.width < 80) return -100 // icône carrée petite
  if (img.width > 2000) return -100 // scan document entier, pas une photo

  // v1.9.38 — Veto motifs décoratifs (dots, trames, patterns géométriques).
  // Mesure concrète sur dani.pdf : motif dots 300×348 = 23 uniqueColors après
  // binning 16 niveaux (l'antialiasing JPEG crée des teintes intermédiaires).
  // Vraie photo (ex: Ferreira Da Costa) = 151 uniqueColors → large marge.
  // Seuil 40 : rejette toutes les variantes de patterns décoratifs, garde les
  // vraies photos même N&B basse qualité.
  // v1.9.107 — Bypass si source provient de tryVisionFaceCrop (préfixe
  // 'vision-face:'). Vision Haiku a déjà confirmé visuellement la présence
  // d'un visage avant le crop, donc le veto motif_decoratif est trop strict
  // pour les photos très peu colorées (ex: scan A4 José Antonio Ruiz, uc=39).
  // Seuil assoupli à 35 — en dessous, on conserve le veto même pour Vision
  // (un crop Vision avec uc<35 est très probablement un faux positif).
  if (img.uniqueColors < 40) {
    const visionConfirmed = img.source?.startsWith('vision-face')
    if (!visionConfirmed || img.uniqueColors < 35) return -100
  }

  let score = 0

  // --- Détection photo N&B / niveaux de gris ---
  // Durci v1.9.38 : vraie photo N&B a au moins 50 niveaux de gris (dégradés fins).
  // Le seuil 40 du veto garde passer les N&B réels.
  const likelyBW = img.uniqueColors >= 50 && img.uniqueColors <= 100 && img.skinRatio >= 0.04

  // Peau < 3% sans N&B → probablement icône/logo/image décorative
  if (img.skinRatio < 0.03 && !likelyBW) return -100

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

const MIN_HEADSHOT_SCORE = 25

/**
 * Trace which rules fire when scoring a candidate — used for F5 diagnostic logs.
 * Mirrors scoreHeadshot logic but only collects rule labels (no scoring math).
 */
function explainScore(img: ImageCandidate): string[] {
  const r: string[] = []
  if (img.ratio >= 0.9 && img.ratio <= 1.1 && img.width < 80) r.push('VETO:icone_carree_petite')
  if (img.width > 2000) r.push('VETO:scan_doc_complet(w>2000)')
  if (img.uniqueColors < 40) {
    const visionConfirmed = img.source?.startsWith('vision-face')
    if (visionConfirmed && img.uniqueColors >= 35) {
      r.push('BYPASS:vision_face_uc_35-39')
    } else {
      r.push('VETO:motif_decoratif(uc<40)')
    }
  }
  const likelyBW = img.uniqueColors >= 50 && img.uniqueColors <= 100 && img.skinRatio >= 0.04
  if (likelyBW) r.push('NB:detected')
  if (img.skinRatio < 0.03 && !likelyBW) r.push('VETO:peu_de_peau(<3%)')
  if (img.ratio >= 1.2 && img.ratio <= 1.55) r.push('+50:ratio_portrait')
  else if (img.ratio >= 1.1 && img.ratio <= 1.7) r.push('+25:ratio_proche_portrait')
  else if (img.ratio >= 0.9 && img.ratio < 1.1) r.push('-20:carre')
  else if (img.ratio >= 0.75 && img.ratio < 0.9) r.push('-40:paysage')
  else r.push('-60:ratio_extreme')
  if (img.skinRatio >= 0.10 && img.skinRatio <= 0.55) r.push('+30:skin_ok')
  else if (img.skinRatio >= 0.05) r.push('+10:skin_low')
  else if (img.skinRatio < 0.02) r.push('-15:no_skin')
  if (img.pageIndex === 0) r.push('+12:page1')
  return r
}

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

// ─── Extract portrait from image CV (WhatsApp screenshot, phone scan) ────────

export async function extractPhotoFromImage(imageBuffer: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import('sharp')).default
    const meta = await sharp(imageBuffer).metadata()
    const origW = meta.width || 800, origH = meta.height || 1200

    // Convertir en JPEG pour Vision
    const visionWidth = 800
    const scale = visionWidth / origW
    const visionHeight = Math.round(origH * scale)
    const visionBuf = await sharp(imageBuffer).resize({ width: visionWidth, fit: 'inside' }).jpeg({ quality: 75 }).toBuffer()
    const b64 = visionBuf.toString('base64')

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null

    const visionFetch = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: `This image is ${visionWidth}x${visionHeight} pixels. Is there a passport-style photograph of a real person (showing eyes, nose, mouth)? Not a logo or icon. If YES, give the pixel coordinates of the face center and size. Reply ONLY with JSON: {"face":true,"cx":XXX,"cy":YYY,"size":ZZZ} where cx,cy is the center of the face in pixels and size is the approximate face width in pixels. If no face: {"face":false}` }
          ]
        }]
      }),
    })
    if (!visionFetch.ok) return null
    const visionRes = await visionFetch.json() as any
    const visionText = ((visionRes.content?.[0]?.text) || '').trim()
    const jsonMatch = visionText.match(/\{[^}]+\}/)

    if (jsonMatch) {
      const faceData = JSON.parse(jsonMatch[0])
      if (faceData.face && faceData.cx != null && faceData.cy != null && faceData.size != null) {
        const faceCx = faceData.cx / scale
        const faceCy = faceData.cy / scale
        const faceSize = faceData.size / scale

        const cropSize = faceSize * 1.8
        const cropW = Math.min(Math.round(cropSize), origW)
        const cropH = Math.min(Math.round(cropSize * 1.25), origH)
        const cropLeft = Math.max(0, Math.min(Math.round(faceCx - cropW / 2), origW - cropW))
        const cropTop = Math.max(0, Math.min(Math.round(faceCy - cropH * 0.38), origH - cropH))

        // Rejeter si le crop est trop large (>40% de la page = pas un portrait, c'est la page entière)
        if (cropW > 50 && cropH > 50 && cropW < origW * 0.4 && cropH < origH * 0.4) {
          return await sharp(imageBuffer)
            .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
            .resize({ width: 300, height: 400, fit: 'cover' })
            .jpeg({ quality: 90 })
            .toBuffer()
        }
      }
    }
    return null
  } catch (e) {
    console.warn('[CV Photo] Image extraction failed:', (e as Error).message)
    return null
  }
}

// ─── Main entry points ───────────────────────────────────────────────────────

export async function extractPhotoFromPDF(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const candidates: ImageCandidate[] = []
    const rejectedScans: RejectedFullPageScan[] = []

    // --- Strategy 1: Extract raw JPEG/image data from PDF XObjects ---
    await collectImagesFromPdfRaw(pdfBuffer, candidates, rejectedScans)

    // --- Strategy 1b: Vision validation when multiple XObjects compete ---
    // If multiple candidates score > 20, scoreHeadshot alone can't distinguish
    // a real face from a landscape/template image. Validate top 3 via Claude Haiku Vision.
    if (candidates.length > 1) {
      const scored = candidates.map(c => ({ candidate: c, score: scoreHeadshot(c) }))
      const viable = scored.filter(s => s.score > 20)
      if (viable.length > 1) {
        // Sort by score descending, take top 3
        viable.sort((a, b) => b.score - a.score)
        const top3 = viable.slice(0, 3)

        const apiKey = process.env.ANTHROPIC_API_KEY
        if (apiKey) {
          const confirmed: ImageCandidate[] = []
          for (const { candidate } of top3) {
            try {
              const sharp = (await import('sharp')).default
              // Convert candidate buffer to base64 for Vision
              const visionBuf = await sharp(candidate.buffer)
                .resize({ width: 200, height: 260, fit: 'inside' })
                .jpeg({ quality: 70 })
                .toBuffer()
              const b64 = visionBuf.toString('base64')

              const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
                body: JSON.stringify({
                  model: 'claude-haiku-4-5-20251001',
                  max_tokens: 10,
                  messages: [{
                    role: 'user',
                    content: [
                      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
                      { type: 'text', text: 'Is this a real personal photo (ID photo, passport photo, CV headshot of a specific person) and NOT a stock photo, template illustration, or decorative image? Answer only YES or NO.' }
                    ]
                  }]
                }),
              })
              if (resp.ok) {
                const res = await resp.json() as any
                const answer = ((res.content?.[0]?.text) || '').trim().toUpperCase()
                console.log(`[CV Photo] Vision validation: ${candidate.source} ${candidate.width}x${candidate.height} → ${answer}`)
                if (answer.includes('YES') || answer.includes('OUI')) {
                  confirmed.push(candidate)
                }
              }
            } catch (e) {
              console.warn(`[CV Photo] Vision validation failed for ${candidate.source}:`, (e as Error).message)
              // On error, keep candidate as fallback
              confirmed.push(candidate)
            }
          }

          if (confirmed.length > 0) {
            // Replace candidates with only Vision-confirmed faces
            candidates.length = 0
            candidates.push(...confirmed)
            console.log(`[CV Photo] Vision validated ${confirmed.length} face(s) from ${top3.length} candidates`)
          } else {
            // No face confirmed → clear candidates so Strategy 2/3 can try
            candidates.length = 0
            console.log('[CV Photo] Vision confirmed no faces in XObject candidates, falling back')
          }
        }
      }
    }

    // --- Strategy 2: Use pdfjs-dist as fallback ---
    if (candidates.length === 0) {
      console.log('[F5-S2] trigger reason=no_candidates_from_S1')
      await collectImagesViaPdfjs(pdfBuffer, candidates)
    } else {
      console.log(`[F5-S2] skip reason=already_have_candidates count=${candidates.length}`)
    }

    // --- Strategy 1bis (F1bis, v1.9.105): scans pleine page DCTDecode rejetés → Vision face crop ---
    // Pattern : Strategy 1 + 2 ont retourné 0 candidat, ET au moins 1 XObject DCTDecode portrait
    // ≥1500px a été rejeté pour "too_large". On envoie ces scans à Vision Haiku pour
    // localiser et cropper le visage. Récupère ~19/22 cas du banc test (scans A4 pleine page).
    if (candidates.length === 0 && rejectedScans.length > 0) {
      console.log(`[F5-S1bis] trigger rejected_scans=${rejectedScans.length}`)
      // Limite à 3 pages max (couvre tous les CVs courts) — coût Vision contrôlé.
      for (const scan of rejectedScans.slice(0, 3)) {
        console.log(`[F5-S1bis] try src=${scan.source} ${scan.width}x${scan.height} page=${scan.pageIdx + 1}`)
        const faceCandidate = await tryVisionFaceCrop(scan.rawBytes, scan.source, '[F5-S1bis]')
        if (faceCandidate) {
          candidates.push(faceCandidate)
          console.log(`[F5-S1bis] success page=${scan.pageIdx + 1} → stop`)
          break
        }
      }
      if (candidates.length === 0) console.log(`[F5-S1bis] done no_face_extracted`)
    } else if (candidates.length === 0 && rejectedScans.length === 0) {
      console.log('[F5-S1bis] skip reason=no_rejected_scans_to_try')
    } else {
      console.log(`[F5-S1bis] skip reason=already_have_candidates count=${candidates.length}`)
    }

    // --- Strategy 3: Scan pleine page → Claude Vision localise le portrait ---
    // Si un seul candidat = scan de page entière (>1000px, ratio page ~1.2-1.6)
    // → envoyer à Claude Haiku Vision pour localiser les coordonnées du portrait
    const s3CandLen = candidates.length
    const s3W = candidates[0]?.width ?? 0
    const s3R = candidates[0]?.ratio ?? 0
    const s3Eligible = s3CandLen === 1 && s3W > 1000 && s3R >= 1.2 && s3R <= 1.6
    if (!s3Eligible) {
      const reasons: string[] = []
      if (s3CandLen !== 1) reasons.push(`candidates=${s3CandLen}!=1`)
      if (s3CandLen === 1 && s3W <= 1000) reasons.push(`width=${s3W}<=1000`)
      if (s3CandLen === 1 && (s3R < 1.2 || s3R > 1.6)) reasons.push(`ratio=${s3R.toFixed(2)}_out_of_[1.2,1.6]`)
      console.log(`[F5-S3] skip reasons=${reasons.join(',') || 'unknown'}`)
    } else {
      console.log(`[F5-S3] trigger candidates=1 width=${s3W} ratio=${s3R.toFixed(2)}`)
    }
    if (candidates.length === 1 && candidates[0].width > 1000 && candidates[0].ratio >= 1.2 && candidates[0].ratio <= 1.6) {
      try {
        const sharp = (await import('sharp')).default
        // Re-extraire le JPEG original depuis le PDF
        const pdflib = await import('pdf-lib')
        const pdfDoc = await pdflib.PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
        const page = pdfDoc.getPage(0)
        const rawRes = page.node.get(pdflib.PDFName.of('Resources'))
        const resources = rawRes instanceof pdflib.PDFRef ? pdfDoc.context.lookup(rawRes) : rawRes
        let rawBytes: Buffer | null = null
        if (resources instanceof pdflib.PDFDict) {
          const rawXObj = resources.get(pdflib.PDFName.of('XObject'))
          const xObjects = rawXObj instanceof pdflib.PDFRef ? pdfDoc.context.lookup(rawXObj) : rawXObj
          if (xObjects instanceof pdflib.PDFDict) {
            const firstKey = [...xObjects.keys()][0]
            if (firstKey) {
              const rawRef = xObjects.get(firstKey)
              const xobj = rawRef instanceof pdflib.PDFRef ? pdfDoc.context.lookup(rawRef) : rawRef
              if (xobj instanceof pdflib.PDFRawStream) rawBytes = Buffer.from(xobj.getContents())
            }
          }
        }

        if (rawBytes) {
          const meta = await sharp(rawBytes).metadata()
          const origW = meta.width || 1600, origH = meta.height || 2300

          // Envoyer la page entière à Claude — coordonnées en pixels sur image 800px
          const apiKey = process.env.ANTHROPIC_API_KEY
          if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant')

          // Image réduite pour Vision
          const visionWidth = 800
          const scale = visionWidth / origW
          const visionHeight = Math.round(origH * scale)
          const visionBuf = await sharp(rawBytes).resize({ width: visionWidth, fit: 'inside' }).jpeg({ quality: 75 }).toBuffer()
          const b64 = visionBuf.toString('base64')

          const visionFetch = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 100,
              messages: [{
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
                  { type: 'text', text: `This image is ${visionWidth}x${visionHeight} pixels. Is there a passport-style photograph of a real person (showing eyes, nose, mouth)? Not a logo or icon. If YES, give the pixel coordinates of the face center and size. Reply ONLY with JSON: {"face":true,"cx":XXX,"cy":YYY,"size":ZZZ} where cx,cy is the center of the face in pixels and size is the approximate face width in pixels. If no face: {"face":false}` }
                ]
              }]
            }),
          })
          if (!visionFetch.ok) throw new Error(`Vision API ${visionFetch.status}`)
          const visionRes = await visionFetch.json() as any
          const visionText = ((visionRes.content?.[0]?.text) || '').trim()
          const jsonMatch = visionText.match(/\{[^}]+\}/)

          if (jsonMatch) {
            const faceData = JSON.parse(jsonMatch[0])
            if (faceData.face && faceData.cx != null && faceData.cy != null && faceData.size != null) {
              console.log(`[F5-S3] face_detected cx=${faceData.cx} cy=${faceData.cy} size=${faceData.size}`)
              // Convertir pixels Vision → pixels original
              const faceCx = faceData.cx / scale
              const faceCy = faceData.cy / scale
              const faceSize = faceData.size / scale

              // Crop serré autour du visage — 1.8× pour tête + haut épaules
              const cropSize = faceSize * 1.8
              const cropW = Math.min(Math.round(cropSize), origW)
              const cropH = Math.min(Math.round(cropSize * 1.25), origH) // ratio portrait ~4:5
              const cropLeft = Math.max(0, Math.min(Math.round(faceCx - cropW / 2), origW - cropW))
              const cropTop = Math.max(0, Math.min(Math.round(faceCy - cropH * 0.38), origH - cropH)) // visage dans le tiers supérieur

              if (cropW > 50 && cropH > 50 && cropW < origW * 0.4 && cropH < origH * 0.4) {
                const cropped = await sharp(rawBytes)
                  .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
                  .resize({ width: 300, height: 400, fit: 'cover' })
                  .jpeg({ quality: 90 })
                  .toBuffer()

                const cMeta = await sharp(cropped).metadata()
                const w = cMeta.width || 300, h = cMeta.height || 400
                candidates.push({
                  buffer: cropped, width: w, height: h, ratio: h / w, area: w * h,
                  compressedSize: cropped.length, uniqueColors: await countUniqueColors(cropped, false),
                  skinRatio: await detectSkinRatio(cropped), pageIndex: 0, source: 'vision-face',
                })
                candidates.shift()
                console.log(`[F5-S3] crop_accepted ${cropW}x${cropH} → 300x400`)
              } else {
                console.log(`[F5-S3] crop_rejected reason=size_invalid cropW=${cropW} cropH=${cropH} pageW=${origW} pageH=${origH}`)
              }
            } else {
              console.log(`[F5-S3] face_not_detected vision_response=${visionText.slice(0, 100)}`)
            }
          } else {
            console.log(`[F5-S3] no_json_in_response response=${visionText.slice(0, 100)}`)
          }
        } else {
          console.log('[F5-S3] no_raw_bytes_extracted_from_pdf')
        }
      } catch (e) {
        console.warn('[CV Photo] Strategy 3 (Vision crop) failed:', (e as Error).message)
        console.log(`[F5-S3] crash error=${(e as Error).message}`)
      }
    }

    if (candidates.length === 0) {
      console.log('[F5-Final] result=NULL reason=no_candidates_from_any_strategy')
      return null
    }
    const result = await pickBestCandidate(candidates)
    console.log(`[F5-Final] result=${result ? 'OK' : 'NULL'} candidates=${candidates.length} bytes=${result?.length ?? 0}`)
    return result

  } catch (e) {
    console.warn('[CV Photo] extraction failed:', (e as Error).message)
    console.log(`[F5-Final] result=NULL reason=top_level_crash error=${(e as Error).message}`)
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

    // v1.9.107 — Logs F5 instrumentés pour diagnostic. Liste tous les fichiers
    // word/media/* (avec ext) puis raison de skip ou accept par fichier.
    const allMedia = Object.keys(zip.files).filter(f => f.startsWith('word/media/'))
    const candidates: ImageCandidate[] = []
    // Photos rejetées pour too_large mais ratio raisonnable + dimensions ≥ 1500 →
    // candidates F1bis-DOCX (Vision face crop). Cas Soraia #12 : photos JPG 4032×3024
    // (probablement prises au téléphone) skipped en silence par le veto >2000px.
    const oversizedScans: Array<{ buf: Buffer; w: number; h: number; path: string }> = []
    const mediaFiles = allMedia.filter(
      f => /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(f)
    )
    console.log(`[F5-DOCX] start media_total=${allMedia.length} media_with_image_ext=${mediaFiles.length}`)
    if (allMedia.length > 0 && mediaFiles.length === 0) {
      const exts = [...new Set(allMedia.map(f => (f.match(/\.([^./]+)$/) || [, 'noext'])[1].toLowerCase()))]
      console.log(`[F5-DOCX] no_ext_match found_exts=${JSON.stringify(exts)}`)
    }

    for (const mediaPath of mediaFiles) {
      try {
        const imgData = await zip.files[mediaPath].async('nodebuffer')
        if (!imgData || imgData.length < 500) {
          console.log(`[F5-DOCX] file=${mediaPath} skip reason=tiny_or_empty bytes=${imgData?.length || 0}`)
          continue
        }

        const metadata = await sharp(imgData).metadata()
        if (!metadata.width || !metadata.height) {
          console.log(`[F5-DOCX] file=${mediaPath} skip reason=no_dims format=${metadata.format || 'unknown'} bytes=${imgData.length}`)
          continue
        }

        const w = metadata.width
        const h = metadata.height
        if (w < 60 || h < 60) {
          console.log(`[F5-DOCX] file=${mediaPath} ${w}x${h} skip reason=too_small`)
          continue
        }
        if (w > 2000 || h > 2500) {
          // F1bis-DOCX (v1.9.107) : si ratio raisonnable + dimensions ≥1500 → candidat Vision crop.
          // Cas Soraia : photos téléphone 4032×3024 (paysage, ratio 0.75) ignorées en silence.
          const ratio = h / w
          if (ratio >= 0.5 && ratio <= 3.0 && w >= 1500 && h >= 1500) {
            oversizedScans.push({ buf: imgData, w, h, path: mediaPath })
            console.log(`[F5-DOCX] file=${mediaPath} ${w}x${h} skip reason=too_large (captured for F1bis-DOCX Vision crop)`)
          } else {
            console.log(`[F5-DOCX] file=${mediaPath} ${w}x${h} skip reason=too_large`)
          }
          continue
        }
        const ratio = h / w
        if (ratio < 0.5 || ratio > 3.0) {
          console.log(`[F5-DOCX] file=${mediaPath} ${w}x${h} ratio=${ratio.toFixed(2)} skip reason=ratio_out_of_range`)
          continue
        }

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
        console.log(`[F5-DOCX] accept file=${mediaPath} ${w}x${h} ratio=${ratio.toFixed(2)} colors=${uc} skin=${(sr * 100).toFixed(0)}%`)
      } catch (err) {
        console.log(`[F5-DOCX] file=${mediaPath} skip reason=exception err=${(err as Error).message}`)
        continue
      }
    }

    // F1bis-DOCX : si aucun candidat extrait directement mais grandes photos
    // disponibles, envoyer à Vision Haiku (max 2 photos pour contrôler le coût).
    if (candidates.length === 0 && oversizedScans.length > 0) {
      console.log(`[F5-DOCX-S1bis] trigger oversized=${oversizedScans.length}`)
      for (const oc of oversizedScans.slice(0, 2)) {
        console.log(`[F5-DOCX-S1bis] try path=${oc.path} ${oc.w}x${oc.h}`)
        const faceCandidate = await tryVisionFaceCrop(oc.buf, `docx:${oc.path}`, '[F5-DOCX-S1bis]')
        if (faceCandidate) {
          candidates.push(faceCandidate)
          console.log(`[F5-DOCX-S1bis] success path=${oc.path} → stop`)
          break
        }
      }
      if (candidates.length === 0) console.log(`[F5-DOCX-S1bis] done no_face_extracted`)
    }

    console.log(`[F5-DOCX] done candidates=${candidates.length}`)
    if (candidates.length === 0) return null
    return pickBestCandidate(candidates)
  } catch (e) {
    console.warn('[CV Photo] DOCX extraction failed:', (e as Error).message)
    console.log(`[F5-DOCX] crash error=${(e as Error).message}`)
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
    console.log(`[F5-Score] src=${img.source} score=${s} rules=[${explainScore(img).join('|')}]`)
    if (s > bestScore) {
      bestScore = s
      bestCandidate = img
    }
  }

  if (!bestCandidate || bestScore < MIN_HEADSHOT_SCORE) {
    console.log(`[CV Photo] No suitable headshot found. Best score: ${bestScore} (threshold: ${MIN_HEADSHOT_SCORE})`)
    console.log(`[F5-Score] decision=REJECT best=${bestScore} threshold=${MIN_HEADSHOT_SCORE} candidates=${candidates.length}`)
    return null
  }

  console.log(`[CV Photo] Selected: ${bestCandidate.source} ${bestCandidate.width}x${bestCandidate.height} score=${bestScore}`)
  console.log(`[F5-Score] decision=SELECT src=${bestCandidate.source} score=${bestScore} threshold=${MIN_HEADSHOT_SCORE}`)
  return bestCandidate.buffer
}

/**
 * Apply Claude Haiku Vision face detection on a full-page image buffer
 * (typically a scanned A4 CV) and crop the portrait region.
 *
 * Used by:
 *  - Strategy 3 (when 1 large XObject candidate already extracted)
 *  - Strategy 1bis / F1bis (when XObjects rejected for too_large — v1.9.105)
 *
 * Returns null if Vision finds no face, or if crop would cover too much of the page.
 * The returned candidate goes through scoreHeadshot which acts as final safety net.
 */
async function tryVisionFaceCrop(
  rawBytes: Buffer,
  sourceLabel: string,
  logTag: '[F5-S3]' | '[F5-S1bis]' | '[F5-DOCX-S1bis]' = '[F5-S1bis]',
): Promise<ImageCandidate | null> {
  try {
    const sharp = (await import('sharp')).default
    const meta = await sharp(rawBytes).metadata()
    const origW = meta.width || 1600, origH = meta.height || 2300

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.log(`${logTag} skip reason=no_api_key src=${sourceLabel}`)
      return null
    }

    const visionWidth = 800
    const scale = visionWidth / origW
    const visionHeight = Math.round(origH * scale)
    const visionBuf = await sharp(rawBytes).resize({ width: visionWidth, fit: 'inside' }).jpeg({ quality: 75 }).toBuffer()
    const b64 = visionBuf.toString('base64')

    const visionFetch = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: `This image is ${visionWidth}x${visionHeight} pixels. Is there a passport-style photograph of a real person (showing eyes, nose, mouth)? Not a logo or icon. If YES, give the pixel coordinates of the face center and size. Reply ONLY with JSON: {"face":true,"cx":XXX,"cy":YYY,"size":ZZZ} where cx,cy is the center of the face in pixels and size is the approximate face width in pixels. If no face: {"face":false}` }
          ]
        }]
      }),
    })
    if (!visionFetch.ok) {
      console.log(`${logTag} vision_api_failed src=${sourceLabel} status=${visionFetch.status}`)
      return null
    }
    const visionRes = await visionFetch.json() as any
    const visionText = ((visionRes.content?.[0]?.text) || '').trim()
    const jsonMatch = visionText.match(/\{[^}]+\}/)

    if (!jsonMatch) {
      console.log(`${logTag} no_json src=${sourceLabel} response=${visionText.slice(0, 80)}`)
      return null
    }

    const faceData = JSON.parse(jsonMatch[0])
    if (!faceData.face || faceData.cx == null || faceData.cy == null || faceData.size == null) {
      console.log(`${logTag} face_not_detected src=${sourceLabel} response=${visionText.slice(0, 80)}`)
      return null
    }

    console.log(`${logTag} face_detected src=${sourceLabel} cx=${faceData.cx} cy=${faceData.cy} size=${faceData.size}`)

    const faceCx = faceData.cx / scale
    const faceCy = faceData.cy / scale
    const faceSize = faceData.size / scale

    const cropSize = faceSize * 1.8
    const cropW = Math.min(Math.round(cropSize), origW)
    const cropH = Math.min(Math.round(cropSize * 1.25), origH)
    const cropLeft = Math.max(0, Math.min(Math.round(faceCx - cropW / 2), origW - cropW))
    const cropTop = Math.max(0, Math.min(Math.round(faceCy - cropH * 0.38), origH - cropH))

    if (!(cropW > 50 && cropH > 50)) {
      console.log(`${logTag} crop_rejected src=${sourceLabel} reason=crop_too_small cropW=${cropW} cropH=${cropH}`)
      return null
    }
    // v1.9.107 — Filet de sécurité face cover ratio (orientation-agnostique).
    // Avant : cropW/cropH < orig*0.4 — calibré pour scans PORTRAIT, faux-rejette les
    // photos PAYSAGE car cropH ratio 1.25 explose vs origH < origW (cas Soraia #12 :
    // photo 4032×3024, face 757px = 18.8% de origW, mais cropH 1701 > 1209=0.4×3024).
    // Maintenant : si le visage détecté occupe > 50% de la dimension max, c'est probablement
    // une photo passport déjà cropée (faux positif Vision sur image cible). scoreHeadshot
    // reste filet final (uniqueColors, skinRatio, ratio).
    const faceCoverRatio = faceSize / Math.max(origW, origH)
    if (faceCoverRatio > 0.5) {
      console.log(`${logTag} crop_rejected src=${sourceLabel} reason=face_covers_too_much faceSize=${faceSize} maxDim=${Math.max(origW, origH)} ratio=${faceCoverRatio.toFixed(2)}`)
      return null
    }

    const cropped = await sharp(rawBytes)
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .resize({ width: 300, height: 400, fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer()

    const cMeta = await sharp(cropped).metadata()
    const w = cMeta.width || 300, h = cMeta.height || 400
    // v1.9.107 — Préfixer source 'vision-face:' pour permettre à scoreHeadshot de
    // détecter un crop confirmé par Vision (assouplissement veto uc<40).
    const normalizedSource = sourceLabel.startsWith('vision-face') ? sourceLabel : `vision-face:${sourceLabel}`
    const candidate: ImageCandidate = {
      buffer: cropped,
      width: w,
      height: h,
      ratio: h / w,
      area: w * h,
      compressedSize: cropped.length,
      uniqueColors: await countUniqueColors(cropped, false),
      skinRatio: await detectSkinRatio(cropped),
      pageIndex: 0,
      source: normalizedSource,
    }
    console.log(`${logTag} crop_accepted src=${normalizedSource} ${cropW}x${cropH} colors=${candidate.uniqueColors} skin=${(candidate.skinRatio * 100).toFixed(0)}%`)
    return candidate
  } catch (e) {
    console.warn('[CV Photo] tryVisionFaceCrop failed:', (e as Error).message)
    console.log(`${logTag} crash src=${sourceLabel} error=${(e as Error).message}`)
    return null
  }
}

// ─── Strategy 1: pdf-lib raw XObjects ────────────────────────────────────────

/**
 * Holds the raw bytes of a full-page DCTDecode XObject that was rejected
 * for "too_large" but matches the scan-A4 pattern (portrait ratio, ≥1500px).
 * F1bis (v1.9.105) feeds these to Vision face crop as a last resort.
 */
interface RejectedFullPageScan {
  rawBytes: Buffer
  width: number
  height: number
  pageIdx: number
  source: string
}

async function collectImagesFromPdfRaw(
  pdfBuffer: Buffer,
  candidates: ImageCandidate[],
  rejectedScans: RejectedFullPageScan[] = [],
): Promise<void> {
  try {
    const pdflib = await import('pdf-lib')
    const { PDFDocument, PDFName, PDFRawStream, PDFRef } = pdflib
    const PDFDict = pdflib.PDFDict

    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
    const sharp = (await import('sharp')).default

    const pagesToCheck = Math.min(3, pdfDoc.getPageCount())
    console.log(`[F5-S1] start pages_total=${pdfDoc.getPageCount()} pages_checked=${pagesToCheck}`)

    for (let pageIdx = 0; pageIdx < pagesToCheck; pageIdx++) {
      const page = pdfDoc.getPage(pageIdx)
      const pageDict = page.node

      const rawResources = pageDict.get(PDFName.of('Resources'))
      let resources: any = rawResources
      if (rawResources instanceof PDFRef) {
        resources = pdfDoc.context.lookup(rawResources)
      }
      if (!(resources instanceof PDFDict)) {
        console.log(`[F5-S1] page=${pageIdx + 1} skip reason=no_resources_dict`)
        continue
      }

      const rawXObjects = resources.get(PDFName.of('XObject'))
      let xObjects: any = rawXObjects
      if (rawXObjects instanceof PDFRef) {
        xObjects = pdfDoc.context.lookup(rawXObjects)
      }
      if (!(xObjects instanceof PDFDict)) {
        console.log(`[F5-S1] page=${pageIdx + 1} skip reason=no_xobject_dict`)
        continue
      }

      const xobjKeys = [...xObjects.keys()].length
      console.log(`[F5-S1] page=${pageIdx + 1} xobj_keys=${xobjKeys}`)

      // Process XObjects — including Form XObjects (recursive)
      await processXObjects(xObjects, pdfDoc, sharp, pageIdx, candidates, 0, rejectedScans)
    }
    console.log(`[F5-S1] done candidates_collected=${candidates.length} rejected_full_page_scans=${rejectedScans.length}`)
  } catch (e) {
    console.warn('[CV Photo] pdf-lib strategy failed:', (e as Error).message)
    console.log(`[F5-S1] crash error=${(e as Error).message}`)
  }
}

/**
 * Recursively process XObjects — handles both Image and Form XObjects.
 * Form XObjects can contain nested images (depth-limited to 3).
 */
async function processXObjects(
  xObjects: any, pdfDoc: any, sharp: any, pageIdx: number,
  candidates: ImageCandidate[], depth: number,
  rejectedScans: RejectedFullPageScan[] = [],
): Promise<void> {
  const { PDFName, PDFRawStream, PDFRef, PDFDict } = await import('pdf-lib')
  if (depth > 3) {
    console.log(`[F5-S1] depth_cut depth=${depth}`)
    return
  }

  for (const key of xObjects.keys()) {
    const keyStr = key.toString()
    try {
      const rawXObj = xObjects.get(key)
      let xobj: any = rawXObj
      if (rawXObj instanceof PDFRef) {
        xobj = pdfDoc.context.lookup(rawXObj)
      }

      if (!(xobj instanceof PDFRawStream)) {
        console.log(`[F5-S1] xobj key=${keyStr} skip reason=not_raw_stream`)
        continue
      }

      const dict = xobj.dict
      const subtype = dict.get(PDFName.of('Subtype'))
      if (!subtype) {
        console.log(`[F5-S1] xobj key=${keyStr} skip reason=no_subtype`)
        continue
      }

      const subtypeStr = subtype.toString()

      // ── Form XObject → recurse into its Resources/XObject ──
      if (subtypeStr === '/Form') {
        console.log(`[F5-S1] xobj key=${keyStr} subtype=Form depth=${depth} → recurse`)
        const formRes = dict.get(PDFName.of('Resources'))
        let formResDict: any = formRes
        if (formRes instanceof PDFRef) formResDict = pdfDoc.context.lookup(formRes)
        if (formResDict instanceof PDFDict) {
          const formXObj = formResDict.get(PDFName.of('XObject'))
          let formXObjDict: any = formXObj
          if (formXObj instanceof PDFRef) formXObjDict = pdfDoc.context.lookup(formXObj)
          if (formXObjDict instanceof PDFDict) {
            await processXObjects(formXObjDict, pdfDoc, sharp, pageIdx, candidates, depth + 1, rejectedScans)
          } else {
            console.log(`[F5-S1] form key=${keyStr} skip reason=no_nested_xobject`)
          }
        } else {
          console.log(`[F5-S1] form key=${keyStr} skip reason=no_form_resources`)
        }
        continue
      }

      // ── Image XObject ──
      if (subtypeStr !== '/Image') {
        console.log(`[F5-S1] xobj key=${keyStr} subtype=${subtypeStr} skip reason=not_image`)
        continue
      }

      let widthObj  = dict.get(PDFName.of('Width'))
      let heightObj = dict.get(PDFName.of('Height'))
      if (!widthObj || !heightObj) {
        console.log(`[F5-S1] image key=${keyStr} skip reason=no_dims`)
        continue
      }
      // Résoudre les références PDF (ex: "6 0 R" → valeur réelle)
      if (widthObj instanceof PDFRef) widthObj = pdfDoc.context.lookup(widthObj)
      if (heightObj instanceof PDFRef) heightObj = pdfDoc.context.lookup(heightObj)

      const width  = Number(widthObj?.toString())
      const height = Number(heightObj?.toString())

      const filterObj  = dict.get(PDFName.of('Filter'))
      const filterName = filterObj ? filterObj.toString() : ''

      if (isNaN(width) || isNaN(height)) {
        console.log(`[F5-S1] image key=${keyStr} filter=${filterName} skip reason=nan_dims`)
        continue
      }
      if (width < 60 || height < 60) {
        console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} skip reason=too_small`)
        continue
      }
      if (width > 2000 || height > 2500) {
        // F1bis — capturer les scans pleine page pour Vision face crop.
        // Pattern : ratio portrait A4-like (1.3-1.55), dimensions ≥ 1500×2000.
        const ratio = height / width
        const isPortraitFullPage = ratio >= 1.3 && ratio <= 1.55 && width >= 1500 && height >= 2000
        if (isPortraitFullPage) {
          // F1bis CAS DCTDecode (v1.9.105) — raw bytes = JPEG natif, passable directement à Vision
          if (filterName.includes('DCTDecode')) {
            const rawBytesScan: Uint8Array = xobj.getContents()
            if (rawBytesScan && rawBytesScan.length >= 1000) {
              rejectedScans.push({
                rawBytes: Buffer.from(rawBytesScan),
                width, height, pageIdx,
                source: `pdf-lib:${filterName}:p${pageIdx + 1}:${keyStr}:full-page-scan`,
              })
              console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} skip reason=too_large (captured for F1bis Vision crop)`)
              continue
            }
          }
          // F1bis CAS FlateDecode (v1.9.107) — décompresser raw pixels + re-encoder en JPEG.
          // Cas Amélie Gorin #21 : scan A4 PNG/raw stocké en FlateDecode pleine page, ignoré
          // par F1bis v1.9.105 (DCTDecode-only). On le décompresse via zlib, on récupère
          // colorSpace/bpc/channels comme dans le bloc FlateDecode standard, puis on
          // re-encode en JPEG pour pouvoir l'envoyer à tryVisionFaceCrop (qui attend une
          // image décodable par sharp).
          else if (filterName.includes('FlateDecode')) {
            const rawBytesScan: Uint8Array = xobj.getContents()
            if (rawBytesScan && rawBytesScan.length >= 1000) {
              try {
                const zlib = await import('zlib')
                const decompressed = await new Promise<Buffer>((resolve, reject) => {
                  zlib.inflate(Buffer.from(rawBytesScan), (err, buf) => {
                    if (err) zlib.inflateRaw(Buffer.from(rawBytesScan), (err2, buf2) => {
                      if (err2) reject(err2); else resolve(buf2)
                    }); else resolve(buf)
                  })
                })
                let colorSpaceObj = dict.get(PDFName.of('ColorSpace'))
                if (colorSpaceObj instanceof PDFRef) colorSpaceObj = pdfDoc.context.lookup(colorSpaceObj)
                const colorSpace = colorSpaceObj ? colorSpaceObj.toString() : ''
                let bpcObj = dict.get(PDFName.of('BitsPerComponent'))
                if (bpcObj instanceof PDFRef) bpcObj = pdfDoc.context.lookup(bpcObj)
                const bpc = bpcObj ? Number(bpcObj.toString()) : 8
                if (bpc !== 8) {
                  console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} F1bis_flate_skip reason=bpc_not_8 bpc=${bpc}`)
                } else {
                  let channels: 1 | 3 | 4 = 3
                  if (colorSpace.includes('Gray') || colorSpace === '/DeviceGray') channels = 1
                  else if (colorSpace.includes('CMYK') || colorSpace === '/DeviceCMYK') channels = 4
                  const expectedBytes = width * height * channels
                  if (decompressed.length < expectedBytes * 0.7) {
                    console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} F1bis_flate_skip reason=underflow got=${decompressed.length} expected=${expectedBytes} cs=${colorSpace}`)
                  } else {
                    const jpegBuf = await sharp(decompressed, { raw: { width, height, channels } })
                      .jpeg({ quality: 85 })
                      .toBuffer()
                    rejectedScans.push({
                      rawBytes: jpegBuf,
                      width, height, pageIdx,
                      source: `pdf-lib:${filterName}:p${pageIdx + 1}:${keyStr}:full-page-scan`,
                    })
                    console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} skip reason=too_large (captured for F1bis Vision crop, FlateDecode→JPEG channels=${channels})`)
                    continue
                  }
                }
              } catch (err) {
                console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} F1bis_flate_capture_failed err=${(err as Error).message}`)
              }
            }
          }
        }
        console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} skip reason=too_large`)
        continue
      }
      const ratio = height / width
      if (ratio < 0.5 || ratio > 3.0) {
        console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} ratio=${ratio.toFixed(2)} skip reason=ratio_out_of_range`)
        continue
      }

      const rawBytes: Uint8Array = xobj.getContents()
      if (!rawBytes || rawBytes.length < 100) {
        console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} skip reason=empty_or_tiny_stream`)
        continue
      }

      console.log(`[F5-S1] image key=${keyStr} filter=${filterName} ${width}x${height} ratio=${ratio.toFixed(2)} bytes=${rawBytes.length} → decode`)

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
            let smaskWObj = smaskObj.dict.get(PDFName.of('Width'))
            let smaskHObj = smaskObj.dict.get(PDFName.of('Height'))
            if (smaskWObj instanceof PDFRef) smaskWObj = pdfDoc.context.lookup(smaskWObj)
            if (smaskHObj instanceof PDFRef) smaskHObj = pdfDoc.context.lookup(smaskHObj)
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
        } catch (err) {
          console.warn(`[CV Photo] DCTDecode resize failed: ${(err as Error).message}`)
          console.log(`[F5-S1] image key=${keyStr} filter=${filterName} skip reason=dct_resize_failed err=${(err as Error).message}`)
          continue
        }
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
        } catch (err) {
          console.log(`[F5-S1] image key=${keyStr} filter=${filterName} skip reason=flate_inflate_failed err=${(err as Error).message}`)
          continue
        }

        let colorSpaceObj = dict.get(PDFName.of('ColorSpace'))
        if (colorSpaceObj instanceof PDFRef) colorSpaceObj = pdfDoc.context.lookup(colorSpaceObj)
        const colorSpace    = colorSpaceObj ? colorSpaceObj.toString() : ''
        let bpcObj        = dict.get(PDFName.of('BitsPerComponent'))
        if (bpcObj instanceof PDFRef) bpcObj = pdfDoc.context.lookup(bpcObj)
        const bpc           = bpcObj ? Number(bpcObj.toString()) : 8
        if (bpc !== 8) {
          console.log(`[F5-S1] image key=${keyStr} filter=${filterName} skip reason=bpc_not_8 bpc=${bpc}`)
          continue
        }

        let channels: 1 | 3 | 4 = 3
        if (colorSpace.includes('Gray') || colorSpace === '/DeviceGray') channels = 1
        else if (colorSpace.includes('CMYK') || colorSpace === '/DeviceCMYK') channels = 4

        const expectedBytes = width * height * channels
        if (decompressed.length < expectedBytes * 0.7) {
          console.log(`[F5-S1] image key=${keyStr} filter=${filterName} skip reason=flate_underflow got=${decompressed.length} expected=${expectedBytes} cs=${colorSpace}`)
          continue
        }

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
        } catch (err) {
          console.log(`[F5-S1] image key=${keyStr} filter=${filterName} skip reason=flate_sharp_failed err=${(err as Error).message}`)
          continue
        }
      }

      // --- JPXDecode = JPEG 2000 ---
      else if (filterName.includes('JPXDecode')) {
        try {
          resizedBuffer = await sharp(Buffer.from(rawBytes))
            .resize({ width: 300, height: 400, fit: 'inside' })
            .jpeg({ quality: 85 })
            .toBuffer()
        } catch (err) {
          console.log(`[F5-S1] image key=${keyStr} filter=${filterName} skip reason=jpx_decode_failed err=${(err as Error).message}`)
          continue
        }
      }

      // --- Filter NON géré (CCITTFaxDecode, JBIG2Decode, RunLengthDecode, LZWDecode...) ---
      else {
        console.log(`[F5-S1] image key=${keyStr} filter=${filterName || 'NONE'} ${width}x${height} skip reason=filter_not_handled`)
        continue
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
        console.log(`[F5-S1] accept key=${keyStr} filter=${filterName} ${width}x${height} smask=${!!smaskBuffer} colors=${uc} skin=${(sr * 100).toFixed(0)}%`)
      }
    } catch (err) {
      console.warn(`[CV Photo] XObject ${key.toString()} error:`, (err as Error).message)
      console.log(`[F5-S1] xobj key=${keyStr} crash error=${(err as Error).message}`)
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
  console.log('[F5-S2] start')
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

    const pagesToCheck = Math.min(3, pdf.numPages)
    console.log(`[F5-S2] pdf_loaded pages_total=${pdf.numPages} pages_checked=${pagesToCheck}`)

    for (let pageNum = 1; pageNum <= pagesToCheck; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const opList = await page.getOperatorList()

      const imgNames: string[] = []
      for (let i = 0; i < opList.fnArray.length; i++) {
        if (opList.fnArray[i] === 85 && opList.argsArray[i]?.[0]) {
          imgNames.push(opList.argsArray[i][0] as string)
        }
      }
      console.log(`[F5-S2] page=${pageNum} img_ops=${imgNames.length}`)

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

          if (!img || !img.data) {
            console.log(`[F5-S2] img=${imgName} skip reason=no_data`)
            continue
          }
          const { width, height, data, kind } = img

          if (width < 60 || height < 60) {
            console.log(`[F5-S2] img=${imgName} ${width}x${height} skip reason=too_small`)
            continue
          }
          if (width > 2000 || height > 2500) {
            console.log(`[F5-S2] img=${imgName} ${width}x${height} skip reason=too_large`)
            continue
          }
          const ratio = height / width
          if (ratio < 0.5 || ratio > 3.0) {
            console.log(`[F5-S2] img=${imgName} ${width}x${height} ratio=${ratio.toFixed(2)} skip reason=ratio_out_of_range`)
            continue
          }

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
            console.log(`[F5-S2] accept img=${imgName} ${width}x${height} ratio=${ratio.toFixed(2)} colors=${uc} skin=${(sr * 100).toFixed(0)}%`)
          } catch (err) {
            console.log(`[F5-S2] img=${imgName} skip reason=sharp_failed err=${(err as Error).message}`)
            continue
          }
        } catch (err) {
          console.log(`[F5-S2] img=${imgName} skip reason=objs_get_failed err=${(err as Error).message}`)
          continue
        }
      }
    }
    console.log(`[F5-S2] done candidates_collected=${candidates.length}`)
  } catch (e) {
    console.warn('[CV Photo] pdfjs strategy failed:', (e as Error).message)
    console.log(`[F5-S2] crash error=${(e as Error).message}`)
  }
}
