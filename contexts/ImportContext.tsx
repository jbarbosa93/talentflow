'use client'
import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileStatus = 'pending' | 'processing' | 'success' | 'error' | 'doublon' | 'skipped'
export type PipelineEtape = 'nouveau' | 'contacte' | 'entretien' | 'place' | 'refuse'

export interface CandidatExistant {
  id: string; prenom: string; nom: string; email?: string
  titre_poste?: string; created_at: string
}
export interface FileJob {
  sessionId?: string   // UUID partagé par tous les fichiers d'un même import
  id: string
  file: File
  status: FileStatus
  error?: string
  candidatNom?: string
  duration?: number
  categorie?: string
  relativePath?: string
  addedAt?: string
  candidatExistant?: CandidatExistant
  analyseNouv?: { prenom?: string; nom?: string; email?: string; titre_poste?: string }
}

const FORMATS_OK    = ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png']
const MAX_FILE_SIZE = 100 * 1024 * 1024

const CAT_COLORS = [
  '#3B82F6','#8B5CF6','#EC4899','#F97316','#10B981',
  '#F59E0B','#06B6D4','#EF4444','#84CC16','#6366F1',
]
const catColorMap = new Map<string, string>()
export function getCatColor(cat: string) {
  if (!catColorMap.has(cat)) catColorMap.set(cat, CAT_COLORS[catColorMap.size % CAT_COLORS.length])
  return catColorMap.get(cat)!
}

function getExt(name: string) { return name.toLowerCase().split('.').pop() || '' }

// ─── État persistant (module-level) ──────────────────────────────────────────
// Stocké hors du composant React pour survivre aux re-montages du provider
// (ex : navigation entre pages qui cause un hard refresh du layout)
let _worker: Worker | null = null
let _workerRunning = false
let _workerPaused = false
let _jobs: FileJob[] = []
let _done = false
let _startTime = 0
let _completedCount = 0

// ─── Context Interface ────────────────────────────────────────────────────────

interface ImportContextType {
  jobs: FileJob[]
  statut: PipelineEtape
  running: boolean
  done: boolean
  speed: number
  eta: number
  total: number
  succeeded: number
  failed: number
  doublons: number
  processing: number
  pending: number
  completed: number
  progress: number
  categories: string[]
  setStatut: (s: PipelineEtape) => void
  useFilenameDate: boolean
  setUseFilenameDate: (v: boolean) => void
  addFiles: (files: FileList | File[]) => void
  addFilesWithMeta: (items: Array<{ file: File; relativePath?: string }>) => void
  startProcessing: () => void
  creditExhausted: boolean
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
  retryErrors: () => void
  resolveDoublon: (job: FileJob, action: 'ignorer' | 'remplacer' | 'garder_les_deux') => void
  exportCSV: () => void
}

const ImportContext = createContext<ImportContextType | null>(null)
export function useImport() {
  const ctx = useContext(ImportContext)
  if (!ctx) throw new Error('useImport must be used inside ImportProvider')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ImportProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobsState]  = useState<FileJob[]>(() => _jobs)
  const [statut, setStatut]   = useState<PipelineEtape>('nouveau')
  const [useFilenameDate, setUseFilenameDate] = useState(false)
  const [running, setRunning]           = useState(() => _workerRunning)
  const [done, setDone]                 = useState(() => _done)
  const [creditExhausted, setCreditExhausted] = useState(false)
  const [speed, setSpeed]     = useState(0)
  const [eta, setEta]         = useState(0)

  const startTimeRef = useRef<number>(_startTime)
  const completedRef = useRef(_completedCount)

  // Wrapper setJobs qui synchronise l'état module-level
  const setJobs: typeof setJobsState = useCallback((action) => {
    setJobsState(prev => {
      const next = typeof action === 'function' ? action(prev) : action
      _jobs = next
      return next
    })
  }, [])

  const pathname    = usePathname()
  const router      = useRouter()
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  // Notification quand l'import se termine — seulement si on n'est pas sur la page d'import
  useEffect(() => {
    if (!done) return
    if (pathnameRef.current === '/parametres/import-masse') return

    setJobs(current => {
      const ok  = current.filter(j => j.status === 'success').length
      const err = current.filter(j => j.status === 'error').length

      if (err > 0) {
        toast.error(
          `Import terminé — ${ok} importé${ok > 1 ? 's' : ''}, ${err} erreur${err > 1 ? 's' : ''}`,
          {
            duration: 10000,
            action: { label: 'Voir', onClick: () => router.push('/parametres/import-masse') },
          }
        )
      } else {
        toast.success(
          `Import terminé — ${ok} candidat${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''} avec succès`,
          {
            duration: 8000,
            action: { label: 'Voir', onClick: () => router.push('/parametres/import-masse') },
          }
        )
      }
      return current
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  const updateSpeedEta = useCallback(() => {
    setJobs(prev => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000 / 60
      if (elapsed > 0) {
        const spd = completedRef.current / elapsed
        setSpeed(spd)
        const rem = prev.filter(j => j.status === 'pending' || j.status === 'processing').length
        setEta(rem / spd * 60)
      }
      return prev
    })
  }, [])

  const bindWorker = useCallback((w: Worker) => {
    w.onmessage = (e) => {
      const { type, id, candidatNom, candidatExistant, analyse, error, duration } = e.data
      switch (type) {
        case 'JOB_START':
          setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'processing', error: undefined } : j))
          break
        case 'JOB_SUCCESS':
          setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'success', candidatNom, duration, error: undefined } : j))
          completedRef.current++
          _completedCount = completedRef.current
          updateSpeedEta()
          // Mettre à jour le badge sidebar en temps réel
          window.dispatchEvent(new CustomEvent('talentflow:badges-changed'))
          break
        case 'JOB_DUPLICATE':
          setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'doublon', candidatExistant, analyseNouv: analyse, duration } : j))
          completedRef.current++
          _completedCount = completedRef.current
          updateSpeedEta()
          break
        case 'JOB_ERROR':
          setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'error', error, duration } : j))
          completedRef.current++
          _completedCount = completedRef.current
          updateSpeedEta()
          break
        case 'JOB_WAITING':
          setJobs(prev => prev.map(j => j.id === id ? { ...j, error } : j))
          break
        case 'CREDIT_EXHAUSTED':
          _workerRunning = false
          _workerPaused = true
          setRunning(false)
          setCreditExhausted(true)
          break
        case 'DONE':
          _workerRunning = false
          _workerPaused = false
          _done = true
          setRunning(false)
          setDone(true)
          break
      }
    }
  }, [updateSpeedEta])

  // Re-bind au worker existant si le provider se re-monte pendant un import
  useEffect(() => {
    if (_worker && (_workerRunning || _workerPaused)) {
      bindWorker(_worker)
      setRunning(_workerRunning)
      setDone(_done)
      // Sync jobs from module-level state
      if (_jobs.length > 0) {
        setJobsState(_jobs)
      }
      // Sync completed count and speed
      completedRef.current = _completedCount
      startTimeRef.current = _startTime
      if (_workerRunning) updateSpeedEta()
    }
  }, [bindWorker, updateSpeedEta])

  const addFilesWithMeta = useCallback((items: Array<{ file: File; relativePath?: string }>) => {
    const sessionId = crypto.randomUUID()
    const sessionStart = new Date().toISOString()
    const valid    = items.filter(({ file }) => FORMATS_OK.includes(getExt(file.name)) && file.size <= MAX_FILE_SIZE)
    const invalid  = items.filter(({ file }) => !FORMATS_OK.includes(getExt(file.name)))
    const tooLarge = items.filter(({ file }) => FORMATS_OK.includes(getExt(file.name)) && file.size > MAX_FILE_SIZE)
    if (tooLarge.length > 0) toast.warning(`${tooLarge.length} fichier(s) ignoré(s) — dépasse 100 Mo`)
    if (invalid.length  > 0) toast.warning(`${invalid.length} fichier(s) ignoré(s) — formats non supportés`)

    setJobs(prev => {
      const existing = new Set(prev.map(j => `${j.file.name}-${j.file.size}`))
      const toAdd = valid
        .filter(({ file }) => !existing.has(`${file.name}-${file.size}`))
        .map(({ file, relativePath }) => {
          const rel = relativePath || (file as any).webkitRelativePath || ''
          let categorie: string | undefined
          if (rel) {
            const parts = rel.split('/')
            if (parts.length >= 3) categorie = parts[parts.length - 2]
            else if (parts.length === 2) categorie = parts[0]
          }
          return { id: `${file.name}-${file.size}-${Math.random()}`, file, status: 'pending' as FileStatus, categorie, relativePath: rel || undefined, addedAt: sessionStart, sessionId }
        })
      if (toAdd.length < valid.length) toast.info(`${valid.length - toAdd.length} doublon(s) de fichiers ignoré(s)`)
      return [...prev, ...toAdd]
    })
  }, [])

  const addFiles = useCallback((files: FileList | File[]) => {
    addFilesWithMeta(Array.from(files).map(f => ({ file: f })))
  }, [addFilesWithMeta])

  const startProcessing = useCallback(() => {
    setJobs(current => {
      const pendingJobs = current.filter(j => j.status === 'pending')
      if (pendingJobs.length === 0) return current

      _worker?.terminate()
      const w = new Worker('/import-worker.js')
      _worker = w
      _workerRunning = true
      bindWorker(w)

      setRunning(true)
      setDone(false)
      _done = false
      startTimeRef.current = Date.now()
      _startTime = startTimeRef.current
      completedRef.current = current.filter(j => j.status === 'success' || j.status === 'error' || j.status === 'doublon').length
      _completedCount = completedRef.current

      w.postMessage({
        type: 'START',
        payload: {
          jobs: pendingJobs.map(j => ({ id: j.id, file: j.file, statut, categorie: j.categorie })),
          useFilenameDate,
        },
      })
      return current
    })
  }, [statut, useFilenameDate, bindWorker])

  const pause  = useCallback(() => { _worker?.postMessage({ type: 'PAUSE' });  _workerRunning = false; _workerPaused = true; setRunning(false) }, [])
  const resume = useCallback(() => { _worker?.postMessage({ type: 'RESUME' }); _workerRunning = true;  _workerPaused = false; setRunning(true); setCreditExhausted(false) }, [])
  const stop   = useCallback(() => {
    _worker?.postMessage({ type: 'STOP' })
    _worker?.terminate()
    _worker = null
    _workerRunning = false
    _workerPaused = false
    setRunning(false)
  }, [])

  const reset = useCallback(() => {
    stop()
    setJobs([])
    setDone(false)
    _done = false
    _workerPaused = false
    setSpeed(0)
    setEta(0)
    completedRef.current = 0
    _completedCount = 0
    _startTime = 0
    catColorMap.clear()
  }, [stop])

  const retryErrors = useCallback(() => {
    setJobs(prev => {
      const updated = prev.map(j => j.status === 'error' ? { ...j, status: 'pending' as FileStatus, error: undefined } : j)
      _jobs = updated
      return updated
    })
    setDone(false)
    _done = false
    // Relancer le worker pour traiter les jobs remis en pending
    setTimeout(() => startProcessing(), 100)
  }, [startProcessing])

  const resolveDoublon = useCallback(async (job: FileJob, action: 'ignorer' | 'remplacer' | 'garder_les_deux') => {
    if (action === 'ignorer') {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'skipped', candidatNom: 'Doublon ignoré — existant conservé' } : j))
    } else {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing' } : j))
      const formData = new FormData()
      formData.append('cv', job.file)
      formData.append('statut', statut)
      if (action === 'remplacer' && job.candidatExistant) formData.append('replace_id', job.candidatExistant.id)
      if (action === 'garder_les_deux') formData.append('force_insert', 'true')
      if (job.categorie) formData.append('categorie', job.categorie)
      if (useFilenameDate) formData.append('use_filename_date', 'true')
      try {
        const res = await fetch('/api/cv/parse', { method: 'POST', body: formData })
        const data = await res.json()
        const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
        const suffix = action === 'remplacer' ? ' (remplacé)' : ''
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'success', candidatNom: (nom || 'Candidat créé') + suffix } : j))
      } catch {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', error: 'Erreur résolution doublon' } : j))
      }
    }
  }, [statut, useFilenameDate])

  const exportCSV = useCallback(() => {
    const rows = [['Fichier', 'Catégorie', 'Statut', 'Candidat', 'Durée', 'Erreur']]
    jobs.forEach(j => rows.push([
      j.file.name, j.categorie || '', j.status,
      j.candidatNom || (j.status === 'doublon' ? `DOUBLON: ${j.candidatExistant?.prenom} ${j.candidatExistant?.nom}` : ''),
      j.duration ? `${(j.duration / 1000).toFixed(1)}s` : '',
      j.error || '',
    ]))
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `import-cvs-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [jobs])

  // Derived
  const total      = jobs.length
  const succeeded  = jobs.filter(j => j.status === 'success').length
  const failed     = jobs.filter(j => j.status === 'error').length
  const skipped    = jobs.filter(j => j.status === 'skipped').length
  const doublons   = jobs.filter(j => j.status === 'doublon').length
  const processing = jobs.filter(j => j.status === 'processing').length
  const pending    = jobs.filter(j => j.status === 'pending').length
  const completed  = succeeded + failed + skipped + doublons
  const progress   = total > 0 ? Math.round((completed / total) * 100) : 0
  const categories = Array.from(new Set(jobs.map(j => j.categorie).filter(Boolean))) as string[]

  return (
    <ImportContext.Provider value={{
      jobs, statut, running, done, speed, eta, creditExhausted,
      total, succeeded, failed, doublons, processing, pending, completed, progress, categories,
      setStatut, useFilenameDate, setUseFilenameDate, addFiles, addFilesWithMeta, startProcessing, pause, resume, stop, reset, retryErrors, resolveDoublon, exportCSV,
    }}>
      {children}
    </ImportContext.Provider>
  )
}
