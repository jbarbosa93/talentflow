'use client'
import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileStatus = 'pending' | 'processing' | 'success' | 'error' | 'doublon'
export type PipelineEtape = 'nouveau' | 'contacte' | 'entretien' | 'place' | 'refuse'

export interface CandidatExistant {
  id: string; prenom: string; nom: string; email?: string
  titre_poste?: string; created_at: string
}
export interface FileJob {
  id: string
  file: File
  status: FileStatus
  error?: string
  candidatNom?: string
  duration?: number
  categorie?: string
  relativePath?: string
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
  addFiles: (files: FileList | File[]) => void
  addFilesWithMeta: (items: Array<{ file: File; relativePath?: string }>) => void
  startProcessing: () => void
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
  const [jobs, setJobs]       = useState<FileJob[]>([])
  const [statut, setStatut]   = useState<PipelineEtape>('nouveau')
  const [running, setRunning] = useState(false)
  const [done, setDone]       = useState(false)
  const [speed, setSpeed]     = useState(0)
  const [eta, setEta]         = useState(0)

  const workerRef    = useRef<Worker | null>(null)
  const startTimeRef = useRef<number>(0)
  const completedRef = useRef(0)

  const pathname    = usePathname()
  const router      = useRouter()
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  // Terminate worker only when the provider unmounts (full app unmount)
  useEffect(() => {
    return () => { workerRef.current?.terminate() }
  }, [])

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
          updateSpeedEta()
          break
        case 'JOB_DUPLICATE':
          setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'doublon', candidatExistant, analyseNouv: analyse, duration } : j))
          completedRef.current++
          updateSpeedEta()
          break
        case 'JOB_ERROR':
          setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'error', error, duration } : j))
          completedRef.current++
          updateSpeedEta()
          break
        case 'JOB_WAITING':
          setJobs(prev => prev.map(j => j.id === id ? { ...j, error } : j))
          break
        case 'DONE':
          setRunning(false)
          setDone(true)
          break
      }
    }
  }, [updateSpeedEta])

  const addFilesWithMeta = useCallback((items: Array<{ file: File; relativePath?: string }>) => {
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
          return { id: `${file.name}-${file.size}-${Math.random()}`, file, status: 'pending' as FileStatus, categorie, relativePath: rel || undefined }
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

      workerRef.current?.terminate()
      const w = new Worker('/import-worker.js')
      workerRef.current = w
      bindWorker(w)

      setRunning(true)
      setDone(false)
      startTimeRef.current = Date.now()
      completedRef.current = current.filter(j => j.status === 'success' || j.status === 'error' || j.status === 'doublon').length

      w.postMessage({
        type: 'START',
        payload: {
          jobs: pendingJobs.map(j => ({ id: j.id, file: j.file, statut, categorie: j.categorie })),
        },
      })
      return current
    })
  }, [statut, bindWorker])

  const pause  = useCallback(() => { workerRef.current?.postMessage({ type: 'PAUSE' });  setRunning(false) }, [])
  const resume = useCallback(() => { workerRef.current?.postMessage({ type: 'RESUME' }); setRunning(true) }, [])
  const stop   = useCallback(() => {
    workerRef.current?.postMessage({ type: 'STOP' })
    workerRef.current?.terminate()
    workerRef.current = null
    setRunning(false)
  }, [])

  const reset = useCallback(() => {
    stop()
    setJobs([])
    setDone(false)
    setSpeed(0)
    setEta(0)
    completedRef.current = 0
    catColorMap.clear()
  }, [stop])

  const retryErrors = useCallback(() => {
    setJobs(prev => prev.map(j => j.status === 'error' ? { ...j, status: 'pending', error: undefined } : j))
    setDone(false)
  }, [])

  const resolveDoublon = useCallback(async (job: FileJob, action: 'ignorer' | 'remplacer' | 'garder_les_deux') => {
    if (action === 'ignorer') {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', error: 'Ignoré — doublon conservé' } : j))
    } else {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing' } : j))
      const formData = new FormData()
      formData.append('cv', job.file)
      formData.append('statut', statut)
      if (action === 'remplacer' && job.candidatExistant) formData.append('replace_id', job.candidatExistant.id)
      if (action === 'garder_les_deux') formData.append('force_insert', 'true')
      if (job.categorie) formData.append('categorie', job.categorie)
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
  }, [statut])

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
  const doublons   = jobs.filter(j => j.status === 'doublon').length
  const processing = jobs.filter(j => j.status === 'processing').length
  const pending    = jobs.filter(j => j.status === 'pending').length
  const completed  = succeeded + failed + doublons
  const progress   = total > 0 ? Math.round((completed / total) * 100) : 0
  const categories = Array.from(new Set(jobs.map(j => j.categorie).filter(Boolean))) as string[]

  return (
    <ImportContext.Provider value={{
      jobs, statut, running, done, speed, eta,
      total, succeeded, failed, doublons, processing, pending, completed, progress, categories,
      setStatut, addFiles, addFilesWithMeta, startProcessing, pause, resume, stop, reset, retryErrors, resolveDoublon, exportCSV,
    }}>
      {children}
    </ImportContext.Provider>
  )
}
