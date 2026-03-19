// Web Worker — traitement import en masse en arrière-plan
// Tourne dans un thread séparé, actif même onglet inactif

const CONCURRENCY   = 3
const MAX_RETRIES   = 4
const FETCH_TIMEOUT = 110_000

let queue   = []
let running = false
let paused  = false

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

  let lastError = ''
  const t0 = Date.now()

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Recréer FormData à chaque tentative (body consommé après 1er envoi)
    const formData = new FormData()
    formData.append('cv', job.file)
    formData.append('statut', job.statut || 'nouveau')
    if (job.categorie) formData.append('categorie', job.categorie)

    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    try {
      const res = await fetch('/api/cv/parse', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const ct = res.headers.get('content-type') || ''
      let data = {}
      if (ct.includes('application/json')) {
        data = await res.json()
      } else {
        const text = await res.text()
        if (res.status === 413) {
          self.postMessage({ type: 'JOB_ERROR', id: job.id, error: 'Fichier trop lourd (> 4.5 Mo)', duration: Date.now() - t0 })
          return
        }
        throw new Error(text.slice(0, 120) || `Erreur HTTP ${res.status}`)
      }

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10)
        const wait = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt) * 8000
        lastError = `Rate limit — attente ${Math.round(wait / 1000)}s (${attempt}/${MAX_RETRIES})`
        self.postMessage({ type: 'JOB_WAITING', id: job.id, error: lastError })
        await new Promise(r => setTimeout(r, wait))
        continue
      }

      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)

      // Doublon détecté par l'API
      if (data.isDuplicate) {
        self.postMessage({ type: 'JOB_DUPLICATE', id: job.id, candidatExistant: data.candidatExistant, analyse: data.analyse, duration: Date.now() - t0 })
        return
      }

      const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
      self.postMessage({ type: 'JOB_SUCCESS', id: job.id, candidatNom: nom || 'Candidat créé', duration: Date.now() - t0 })
      return

    } catch (err) {
      clearTimeout(timeoutId)
      const isTimeout = err.name === 'AbortError'
      lastError = isTimeout ? 'Timeout (trop lourd ou serveur lent)' : (err.message || 'Erreur réseau')

      if (attempt < MAX_RETRIES) {
        const wait = Math.pow(2, attempt) * 3000
        self.postMessage({ type: 'JOB_WAITING', id: job.id, error: `${lastError} — retry dans ${Math.round(wait / 1000)}s (${attempt}/${MAX_RETRIES})` })
        await new Promise(r => setTimeout(r, wait))
      }
    }
  }

  self.postMessage({ type: 'JOB_ERROR', id: job.id, error: lastError, duration: Date.now() - t0 })
}

async function workerLoop() {
  while (running) {
    if (paused) {
      await new Promise(r => setTimeout(r, 500))
      continue
    }
    const job = queue.shift()
    if (!job) break
    await processJob(job)
  }

  // Dernier worker à terminer → signale la fin
  if (queue.length === 0 && running) {
    running = false
    self.postMessage({ type: 'DONE' })
  }
}

function startWorkers() {
  const count = Math.min(CONCURRENCY, queue.length)
  for (let i = 0; i < count; i++) workerLoop()
}
