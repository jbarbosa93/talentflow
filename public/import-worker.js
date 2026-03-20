// Web Worker — traitement import en masse en arrière-plan
// Tourne dans un thread séparé, actif même onglet inactif

const CONCURRENCY        = 8
const MAX_RETRIES        = 3
const FETCH_TIMEOUT      = 57_000   // 57s — laisse le temps à la route (55s global) de répondre
const LARGE_FILE_LIMIT   = 3 * 1024 * 1024  // 3 Mo → upload direct Supabase au-delà

let queue          = []
let running        = false
let paused         = false
let activeWorkers  = 0   // compteur pour envoyer DONE seulement quand le DERNIER worker finit

self.onmessage = function (e) {
  const { type, payload } = e.data

  switch (type) {
    case 'START':
      queue   = [...payload.jobs]
      paused  = false
      running = true
      startWorkers()
      break

    case 'PAUSE':
      paused = true
      break

    case 'RESUME':
      paused = false
      break

    case 'STOP':
      running = false
      paused  = false
      queue   = []
      break
  }
}

async function processJob(job) {
  self.postMessage({ type: 'JOB_START', id: job.id })
  const t0 = Date.now()

  if (job.file.size > LARGE_FILE_LIMIT) {
    await processJobLarge(job, t0)
  } else {
    await processJobDirect(job, t0)
  }
}

// Fichiers ≤ 3 Mo : envoi direct en FormData
async function processJobDirect(job, t0) {
  let lastError = ''
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const formData = new FormData()
    formData.append('cv', job.file)
    formData.append('statut', job.statut || 'nouveau')
    if (job.categorie)   formData.append('categorie', job.categorie)
    if (job.forceInsert) formData.append('force_insert', 'true')
    if (job.replaceId)   formData.append('replace_id', job.replaceId)

    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    try {
      const res = await fetch('/api/cv/parse', { method: 'POST', body: formData, signal: controller.signal })
      clearTimeout(timeoutId)
      const result = await parseResponse(res, job, t0)
      if (result === 'retry') {
        const wait = Math.pow(2, attempt) * 8000
        self.postMessage({ type: 'JOB_WAITING', id: job.id, error: `Rate limit — attente ${Math.round(wait/1000)}s` })
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      return
    } catch (err) {
      clearTimeout(timeoutId)
      // Affiche le message exact pour diagnostiquer l'erreur réelle
      const isTimeout = err.name === 'AbortError' || (err.message && err.message.includes('Timeout'))
      lastError = err.name === 'AbortError' ? 'Timeout (52s)' : (err.message || 'Erreur inconnue')
      // Ne pas retenter les timeouts — le PDF est trop lourd, ça échouera à chaque fois
      if (isTimeout) break
      if (attempt < MAX_RETRIES) {
        const wait = attempt * 3000
        self.postMessage({ type: 'JOB_WAITING', id: job.id, error: `${lastError} — retry dans ${Math.round(wait/1000)}s` })
        await new Promise(r => setTimeout(r, wait))
      }
    }
  }
  self.postMessage({ type: 'JOB_ERROR', id: job.id, error: lastError, duration: Date.now() - t0 })
}

// Fichiers > 3 Mo : upload direct Supabase, puis parse via chemin storage
async function processJobLarge(job, t0) {
  let lastError = ''
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      self.postMessage({ type: 'JOB_WAITING', id: job.id, error: `Fichier ${(job.file.size/1024/1024).toFixed(1)} Mo — upload direct Supabase...` })

      // 1. URL pré-signée
      const presignRes = await fetch(`/api/cv/presign?filename=${encodeURIComponent(job.file.name)}`)
      if (!presignRes.ok) throw new Error('Impossible d\'obtenir l\'URL d\'upload')
      const { signedUrl, path: storagePath } = await presignRes.json()

      // 2. Upload direct navigateur → Supabase (bypass Vercel)
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        body: job.file,
        headers: { 'Content-Type': job.file.type || 'application/octet-stream' },
      })
      if (!uploadRes.ok) throw new Error(`Erreur upload Supabase : ${uploadRes.status}`)

      // 3. Parse via storage_path (corps JSON léger, pas de fichier)
      const controller = new AbortController()
      const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
      const res = await fetch('/api/cv/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_path: storagePath,
          statut: job.statut || 'nouveau',
          categorie: job.categorie,
          force_insert: job.forceInsert,
          replace_id: job.replaceId,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const result = await parseResponse(res, job, t0)
      if (result === 'retry') {
        const wait = Math.pow(2, attempt) * 8000
        self.postMessage({ type: 'JOB_WAITING', id: job.id, error: `Rate limit — attente ${Math.round(wait/1000)}s` })
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      return

    } catch (err) {
      const isTimeout = err.name === 'AbortError' || (err.message && err.message.includes('Timeout'))
      lastError = err.name === 'AbortError' ? 'Timeout (52s)' : (err.message || 'Erreur inconnue')
      if (isTimeout) break
      if (attempt < MAX_RETRIES) {
        const wait = attempt * 3000
        self.postMessage({ type: 'JOB_WAITING', id: job.id, error: `${lastError} — retry dans ${Math.round(wait/1000)}s` })
        await new Promise(r => setTimeout(r, wait))
      }
    }
  }
  self.postMessage({ type: 'JOB_ERROR', id: job.id, error: lastError, duration: Date.now() - t0 })
}

// Parse la réponse HTTP
async function parseResponse(res, job, t0) {
  const ct = res.headers.get('content-type') || ''
  let data = {}
  if (ct.includes('application/json')) {
    data = await res.json()
  } else {
    const text = await res.text()
    if (res.status === 413) {
      self.postMessage({ type: 'JOB_ERROR', id: job.id, error: 'Fichier trop lourd', duration: Date.now() - t0 })
      return 'done'
    }
    throw new Error(text.slice(0, 120) || `Erreur HTTP ${res.status}`)
  }

  if (res.status === 429) return 'retry'
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)

  if (data.isDuplicate) {
    self.postMessage({ type: 'JOB_DUPLICATE', id: job.id, candidatExistant: data.candidatExistant, analyse: data.analyse, duration: Date.now() - t0 })
    return 'done'
  }

  const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
  self.postMessage({ type: 'JOB_SUCCESS', id: job.id, candidatNom: nom || 'Candidat créé', duration: Date.now() - t0 })
  return 'done'
}

async function workerLoop() {
  try {
    while (running) {
      if (paused) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }
      const job = queue.shift()
      if (!job) break
      await processJob(job)
    }
  } finally {
    // Décrémente et envoie DONE seulement quand le DERNIER worker actif termine
    activeWorkers--
    if (activeWorkers === 0 && running) {
      running = false
      self.postMessage({ type: 'DONE' })
    }
  }
}

function startWorkers() {
  const count = Math.min(CONCURRENCY, queue.length)
  activeWorkers = count
  for (let i = 0; i < count; i++) workerLoop()
}
