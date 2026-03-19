'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Upload, FolderOpen, Play, Pause, RotateCcw, Download,
  CheckCircle, XCircle, Loader2, FileText, AlertTriangle,
  Zap, Clock, TrendingUp, X, Tag,
} from 'lucide-react'
import { toast } from 'sonner'

const FORMATS_OK    = ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png']
const CONCURRENCY   = 3    // 3 CVs en parallèle — évite le rate limit Claude (8k tokens/min)
const MAX_RETRIES   = 4    // tentatives max sur erreur 429 / réseau / timeout
const FETCH_TIMEOUT = 110_000 // 110s — légèrement sous maxDuration=120s de la route

type FileStatus = 'pending' | 'processing' | 'success' | 'error'
type PipelineEtape = 'nouveau' | 'contacte' | 'entretien' | 'place' | 'refuse'

interface FileJob {
  id: string
  file: File
  status: FileStatus
  error?: string
  candidatNom?: string
  duration?: number
  categorie?: string   // nom du sous-dossier (ex: ARCHITECTURE)
  relativePath?: string // chemin relatif complet
}

const ETAPES: { value: PipelineEtape; label: string }[] = [
  { value: 'nouveau',   label: 'Nouveau' },
  { value: 'contacte',  label: 'Contacté' },
  { value: 'entretien', label: 'Entretien' },
  { value: 'place',     label: 'Placé' },
  { value: 'refuse',    label: 'Refusé' },
]

// Palette de couleurs pour les catégories
const CAT_COLORS = [
  '#3B82F6','#8B5CF6','#EC4899','#F97316','#10B981',
  '#F59E0B','#06B6D4','#EF4444','#84CC16','#6366F1',
]
const catColorMap = new Map<string, string>()
function getCatColor(cat: string) {
  if (!catColorMap.has(cat)) {
    catColorMap.set(cat, CAT_COLORS[catColorMap.size % CAT_COLORS.length])
  }
  return catColorMap.get(cat)!
}

function getExt(name: string) { return name.toLowerCase().split('.').pop() || '' }
function formatSize(b: number) {
  if (b < 1024) return `${b} o`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`
  return `${(b / 1024 / 1024).toFixed(1)} Mo`
}
function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
function formatETA(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min ${Math.round(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`
}

/** Extrait la catégorie depuis webkitRelativePath
 * Ex: "2. CV/ARCHITECTURE/candidat.pdf"  →  "ARCHITECTURE"
 *     "2. CV/candidat.pdf"               →  "2. CV"
 *     "candidat.pdf"                     →  undefined
 */
function extractCategorie(file: File): string | undefined {
  const rel = (file as any).webkitRelativePath as string | undefined
  if (!rel) return undefined
  const parts = rel.split('/')
  if (parts.length >= 3) return parts[parts.length - 2] // sous-dossier direct du fichier
  if (parts.length === 2) return parts[0]
  return undefined
}

/** Traverse récursive d'un FileSystemDirectoryEntry avec chemin relatif */
async function traverseEntry(
  entry: FileSystemEntry,
  pathPrefix = ''
): Promise<Array<{ file: File; relativePath: string }>> {
  if (entry.isFile) {
    return new Promise(resolve => {
      ;(entry as FileSystemFileEntry).file(f => {
        resolve([{ file: f, relativePath: pathPrefix + f.name }])
      })
    })
  }
  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry
    const reader = dir.createReader()

    const readAllEntries = (): Promise<FileSystemEntry[]> =>
      new Promise(resolve => {
        const all: FileSystemEntry[] = []
        const read = () => {
          reader.readEntries(batch => {
            if (batch.length === 0) resolve(all)
            else { all.push(...batch); read() }
          })
        }
        read()
      })

    const entries = await readAllEntries()
    const results = await Promise.all(
      entries.map(e => traverseEntry(e, pathPrefix + entry.name + '/'))
    )
    return results.flat()
  }
  return []
}

export default function ImportMassePage() {
  const [jobs, setJobs] = useState<FileJob[]>([])
  const [statut, setStatut] = useState<PipelineEtape>('nouveau')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [errorFilter, setErrorFilter] = useState(false)
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [speed, setSpeed] = useState(0)
  const [eta, setEta] = useState(0)

  const pausedRef = useRef(false)
  const runningRef = useRef(false)
  const startTimeRef = useRef<number>(0)
  const completedCountRef = useRef(0)

  const inputRef  = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const [folderKey, setFolderKey] = useState(0) // reset input après chaque sélection

  // Stats
  const total = jobs.length
  const succeeded = jobs.filter(j => j.status === 'success').length
  const failed = jobs.filter(j => j.status === 'error').length
  const processing = jobs.filter(j => j.status === 'processing').length
  const pending = jobs.filter(j => j.status === 'pending').length
  const completed = succeeded + failed
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  // Catégories uniques
  const categories = Array.from(new Set(jobs.map(j => j.categorie).filter(Boolean))) as string[]

  const addFilesWithMeta = useCallback((items: Array<{ file: File; relativePath?: string }>) => {
    const valid = items.filter(({ file }) => FORMATS_OK.includes(getExt(file.name)))
    const invalid = items.filter(({ file }) => !FORMATS_OK.includes(getExt(file.name)))

    if (invalid.length > 0) {
      toast.warning(`${invalid.length} fichier(s) ignoré(s) — formats non supportés`)
    }

    setJobs(prev => {
      const existing = new Set(prev.map(j => `${j.file.name}-${j.file.size}`))
      const toAdd = valid
        .filter(({ file }) => !existing.has(`${file.name}-${file.size}`))
        .map(({ file, relativePath }) => {
          // Essaye webkitRelativePath d'abord, sinon relativePath passé manuellement
          const rel = relativePath || (file as any).webkitRelativePath || ''
          let categorie: string | undefined
          if (rel) {
            const parts = rel.split('/')
            if (parts.length >= 3) categorie = parts[parts.length - 2]
            else if (parts.length === 2) categorie = parts[0]
          }
          return {
            id: `${file.name}-${file.size}-${Math.random()}`,
            file,
            status: 'pending' as FileStatus,
            categorie,
            relativePath: rel || undefined,
          }
        })
      if (toAdd.length < valid.length) {
        toast.info(`${valid.length - toAdd.length} doublon(s) ignoré(s)`)
      }
      return [...prev, ...toAdd]
    })
  }, [])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).map(f => ({ file: f }))
    addFilesWithMeta(arr)
  }, [addFilesWithMeta])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    const items = e.dataTransfer.items
    if (!items) {
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
      return
    }

    const allItems: Array<{ file: File; relativePath: string }> = []
    const promises: Promise<void>[] = []

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (!entry) continue

      promises.push(
        traverseEntry(entry).then(results => {
          allItems.push(...results)
        })
      )
    }

    await Promise.all(promises)
    if (allItems.length > 0) addFilesWithMeta(allItems)
  }, [addFiles, addFilesWithMeta])

  const updateJob = (id: string, patch: Partial<FileJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }

  const processJob = async (job: FileJob) => {
    const t0 = Date.now()
    updateJob(job.id, { status: 'processing' })

    const formData = new FormData()
    formData.append('cv', job.file)
    formData.append('statut', statut)
    if (job.categorie) formData.append('categorie', job.categorie)

    let lastError = ''
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // AbortController pour timeout explicite côté client
      const controller = new AbortController()
      const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        const res = await fetch('/api/cv/parse', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        const data = await res.json()

        // Rate limit (429) → attendre et réessayer
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10)
          const wait = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt) * 8000
          lastError = `Rate limit — attente ${Math.round(wait / 1000)}s (${attempt}/${MAX_RETRIES})`
          updateJob(job.id, { error: lastError })
          await new Promise(r => setTimeout(r, wait))
          continue
        }

        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)

        const nom = `${data.candidat?.prenom || ''} ${data.candidat?.nom || ''}`.trim()
        updateJob(job.id, { status: 'success', candidatNom: nom || 'Candidat créé', duration: Date.now() - t0, error: undefined })
        completedCountRef.current++

        // Mise à jour vitesse/ETA
        const elapsed = (Date.now() - startTimeRef.current) / 1000 / 60
        if (elapsed > 0) {
          const spd = completedCountRef.current / elapsed
          setSpeed(spd)
          const rem = jobs.filter(j => j.status === 'pending').length
          setEta(rem / spd * 60)
        }
        return // succès → sortir de la boucle

      } catch (err: any) {
        clearTimeout(timeoutId)

        // Timeout → message clair + attente avant retry
        const isTimeout = err.name === 'AbortError'
        const isNetwork = err.message === 'Failed to fetch' || err.message?.includes('network')

        if (isTimeout) {
          lastError = `Timeout (fichier trop lourd ou serveur lent)`
        } else if (isNetwork) {
          lastError = `Connexion interrompue`
        } else {
          lastError = err.message || 'Erreur inconnue'
        }

        if (attempt < MAX_RETRIES) {
          const wait = Math.pow(2, attempt) * 3000 // 6s, 12s, 24s
          updateJob(job.id, { error: `${lastError} — retry dans ${Math.round(wait / 1000)}s (${attempt}/${MAX_RETRIES})` })
          await new Promise(r => setTimeout(r, wait))
        }
      }
    }

    // Toutes les tentatives épuisées
    updateJob(job.id, { status: 'error', error: lastError, duration: Date.now() - t0 })
    completedCountRef.current++
  }

  const startProcessing = async () => {
    const pendingJobs = jobs.filter(j => j.status === 'pending')
    if (pendingJobs.length === 0) return

    setRunning(true)
    setDone(false)
    pausedRef.current = false
    runningRef.current = true
    startTimeRef.current = Date.now()
    completedCountRef.current = completed

    const queue = [...pendingJobs]

    const worker = async () => {
      while (queue.length > 0 && runningRef.current) {
        if (pausedRef.current) {
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }
        const job = queue.shift()
        if (job) await processJob(job)
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, pendingJobs.length) }, worker)
    await Promise.all(workers)

    if (runningRef.current) {
      setRunning(false)
      setDone(true)
      runningRef.current = false
      toast.success(`Import terminé — ${completedCountRef.current} CVs traités`)
    }
  }

  const pause  = () => { pausedRef.current = true; setRunning(false) }
  const resume = () => { pausedRef.current = false; setRunning(true) }
  const stop   = () => { runningRef.current = false; pausedRef.current = false; setRunning(false) }

  const reset = () => {
    stop()
    setJobs([])
    setDone(false)
    setSpeed(0)
    setEta(0)
    setCatFilter(null)
    completedCountRef.current = 0
    catColorMap.clear()
  }

  const retryErrors = () => {
    setJobs(prev => prev.map(j => j.status === 'error' ? { ...j, status: 'pending', error: undefined } : j))
    setDone(false)
  }

  const exportCSV = () => {
    const rows = [['Fichier', 'Catégorie', 'Statut', 'Candidat', 'Durée', 'Erreur']]
    jobs.forEach(j => rows.push([
      j.file.name,
      j.categorie || '',
      j.status,
      j.candidatNom || '',
      j.duration ? formatDuration(j.duration) : '',
      j.error || '',
    ]))
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `import-cvs-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const filteredJobs = (() => {
    let list = jobs
    if (errorFilter) list = list.filter(j => j.status === 'error')
    if (catFilter)   list = list.filter(j => j.categorie === catFilter)
    return list.slice(-100).reverse()
  })()

  const isPaused = !running && !done && completed > 0 && pending > 0

  return (
    <div style={{ padding: '32px 40px', maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--foreground)', letterSpacing: '-0.5px', margin: 0 }}>
              Import en masse
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
              Chargez des milliers de CVs depuis vos dossiers — traitement automatique par IA
            </p>
          </div>
          {jobs.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              {done && failed > 0 && (
                <button onClick={retryErrors} className="neo-btn-ghost" style={{ gap: 6, fontSize: 13 }}>
                  <RotateCcw size={13} /> Réessayer {failed} erreur{failed > 1 ? 's' : ''}
                </button>
              )}
              {(done || isPaused) && (
                <button onClick={exportCSV} className="neo-btn-ghost" style={{ gap: 6, fontSize: 13 }}>
                  <Download size={13} /> Exporter résultats
                </button>
              )}
              {!running && (
                <button onClick={reset} className="neo-btn-ghost" style={{ gap: 6, fontSize: 13, color: '#DC2626' }}>
                  <X size={13} /> Vider
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats cards */}
      {total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
          {[
            { label: 'Total',      value: total,      color: 'var(--foreground)', icon: <FileText size={14} /> },
            { label: 'En attente', value: pending,     color: '#6B7280',          icon: <Clock size={14} /> },
            { label: 'En cours',   value: processing,  color: '#3B82F6',          icon: <Loader2 size={14} style={{ animation: processing > 0 ? 'spin 1s linear infinite' : undefined }} /> },
            { label: 'Importés',   value: succeeded,   color: '#16A34A',          icon: <CheckCircle size={14} /> },
            { label: 'Erreurs',    value: failed,      color: '#DC2626',          icon: <XCircle size={14} /> },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--card)', border: '1.5px solid var(--border)',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: s.color }}>
                {s.icon}
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Catégories détectées */}
      {categories.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Tag size={13} color="var(--muted)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Dossiers détectés :</span>
          </div>
          <button
            onClick={() => setCatFilter(null)}
            style={{
              padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700,
              border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit',
              borderColor: catFilter === null ? 'var(--foreground)' : 'var(--border)',
              background: catFilter === null ? 'var(--foreground)' : 'white',
              color: catFilter === null ? 'white' : 'var(--muted)',
            }}
          >Tous ({total})</button>
          {categories.map(cat => {
            const count = jobs.filter(j => j.categorie === cat).length
            const color = getCatColor(cat)
            return (
              <button
                key={cat}
                onClick={() => setCatFilter(catFilter === cat ? null : cat)}
                style={{
                  padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                  border: `1.5px solid ${color}`,
                  background: catFilter === cat ? color : `${color}18`,
                  color: catFilter === cat ? 'white' : color,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{cat} <span style={{ opacity: 0.8 }}>({count})</span></button>
            )
          })}
        </div>
      )}

      {/* Barre de progression */}
      {total > 0 && (
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: progress === 100 ? '#16A34A' : 'var(--foreground)' }}>
                {progress}%
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                  {completed} / {total} traités
                </div>
                {running && speed > 0 && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Zap size={11} color="#F7C948" /> {speed.toFixed(1)} CVs/min
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> ETA : {formatETA(eta)}
                    </span>
                  </div>
                )}
                {isPaused && <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700 }}>⏸ En pause</span>}
                {done    && <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>✓ Import terminé</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {!running && !done && pending > 0 && (
                <button onClick={isPaused ? resume : startProcessing} className="neo-btn" style={{ gap: 6 }}>
                  <Play size={14} />
                  {isPaused ? 'Reprendre' : `Lancer l'import (${pending})`}
                </button>
              )}
              {running && (
                <button onClick={pause} className="neo-btn-ghost" style={{ gap: 6 }}>
                  <Pause size={14} /> Pause
                </button>
              )}
              {running && (
                <button onClick={stop} className="neo-btn-ghost" style={{ gap: 6, color: '#DC2626' }}>
                  <X size={14} /> Arrêter
                </button>
              )}
            </div>
          </div>

          <div style={{ height: 10, background: 'var(--border)', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: done && failed === 0
                ? 'linear-gradient(90deg, #16A34A, #22C55E)'
                : 'linear-gradient(90deg, var(--primary), #F97316)',
              borderRadius: 100, transition: 'width 0.5s ease',
            }} />
          </div>
          {failed > 0 && (
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 100, overflow: 'hidden', marginTop: 4 }}>
              <div style={{ height: '100%', width: `${Math.round(failed / total * 100)}%`, background: '#DC2626', borderRadius: 100 }} />
            </div>
          )}
        </div>
      )}

      {/* Zone de drop */}
      {!running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 16, padding: '40px 24px', textAlign: 'center',
              background: dragOver ? 'var(--primary-soft)' : 'var(--card)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png"
              style={{ display: 'none' }} onChange={e => e.target.files && addFiles(e.target.files)} />
            {/* key= force le remontage après chaque sélection → permet de re-sélectionner */}
            <input key={folderKey} ref={folderRef} type="file"
              // @ts-ignore
              webkitdirectory="" multiple
              style={{ display: 'none' }}
              onChange={e => {
                if (e.target.files) addFiles(e.target.files)
                setFolderKey(k => k + 1) // reset pour pouvoir re-ouvrir le picker
              }} />

            <Upload size={32} style={{ color: dragOver ? 'var(--primary)' : 'var(--muted)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', marginBottom: 6 }}>
              Glissez plusieurs dossiers en même temps
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
              PDF, Word, JPG, PNG · Pas de limite de nombre
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, opacity: 0.85 }}>
              💡 Depuis Finder, sélectionnez <strong>ARCHITECTURE + ÉLECTRICITÉ + CHAUFFAGISTE…</strong> en même temps (⌘+clic) et glissez-les tous ici — ou glissez directement le dossier parent <strong>«&nbsp;2. CV&nbsp;»</strong>
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => inputRef.current?.click()} className="neo-btn" style={{ gap: 6 }}>
                <FileText size={15} /> Sélectionner des fichiers
              </button>
              <button onClick={() => folderRef.current?.click()} className="neo-btn-ghost" style={{ gap: 6 }}>
                <FolderOpen size={15} /> Ajouter un dossier
              </button>
            </div>
            {categories.length > 0 && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>
                Cliquez <strong>«&nbsp;Ajouter un dossier&nbsp;»</strong> autant de fois que nécessaire pour ajouter chaque dossier l'un après l'autre
              </p>
            )}
          </div>

          {total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Statut pipeline :</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ETAPES.map(e => (
                  <button key={e.value} onClick={() => setStatut(e.value)} style={{
                    padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700,
                    border: '1.5px solid',
                    borderColor: statut === e.value ? 'var(--foreground)' : 'var(--border)',
                    background: statut === e.value ? 'var(--foreground)' : 'white',
                    color: statut === e.value ? 'white' : 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}>{e.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warning gros volumes */}
      {total > 500 && !running && !done && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#FEF9EC', border: '1.5px solid #FDE68A', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
              Import de {total.toLocaleString('fr-FR')} fichiers — estimation : {formatETA(total / CONCURRENCY * 12)}
            </div>
            <div style={{ fontSize: 12, color: '#78350F' }}>
              Chaque CV est analysé par IA (5-15s). Gardez cet onglet ouvert ou mettez sur pause et reprenez plus tard.
              Les candidats déjà créés ne seront pas dupliqués si vous relancez.
            </div>
          </div>
        </div>
      )}

      {/* Liste des jobs */}
      {jobs.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
              {errorFilter
                ? `${failed} erreur${failed > 1 ? 's' : ''}`
                : catFilter
                  ? `${jobs.filter(j => j.categorie === catFilter).length} fichiers — ${catFilter}`
                  : `Derniers 100 affichés sur ${total}`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {failed > 0 && (
                <button
                  onClick={() => setErrorFilter(v => !v)}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                    border: '1.5px solid', borderColor: errorFilter ? '#DC2626' : 'var(--border)',
                    background: errorFilter ? '#FEE2E2' : 'white', color: errorFilter ? '#DC2626' : 'var(--muted)',
                    fontFamily: 'inherit',
                  }}
                >
                  <XCircle size={11} style={{ display: 'inline', marginRight: 4 }} />
                  {errorFilter ? 'Voir tout' : `Voir erreurs (${failed})`}
                </button>
              )}
            </div>
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredJobs.map(job => {
              const catColor = job.categorie ? getCatColor(job.categorie) : undefined
              return (
                <div key={job.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
                  borderBottom: '1px solid var(--border)',
                  background: job.status === 'success' ? '#F0FDF4'
                    : job.status === 'error' ? '#FEF2F2'
                    : job.status === 'processing' ? 'var(--primary-soft)'
                    : 'transparent',
                }}>
                  {/* Icône statut */}
                  <div style={{ flexShrink: 0 }}>
                    {job.status === 'pending'    && <FileText size={14} color="var(--muted)" />}
                    {job.status === 'processing' && <Loader2 size={14} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />}
                    {job.status === 'success'    && <CheckCircle size={14} color="#16A34A" />}
                    {job.status === 'error'      && <XCircle size={14} color="#DC2626" />}
                  </div>

                  {/* Nom fichier + candidat */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.file.name}
                    </div>
                    <div style={{ fontSize: 11, color: job.status === 'success' ? '#16A34A' : job.status === 'error' ? '#DC2626' : 'var(--muted)' }}>
                      {job.status === 'success'    && job.candidatNom}
                      {job.status === 'error'      && job.error}
                      {job.status === 'pending'    && formatSize(job.file.size)}
                      {job.status === 'processing' && 'Analyse IA en cours...'}
                    </div>
                  </div>

                  {/* Badge catégorie */}
                  {job.categorie && (
                    <span style={{
                      flexShrink: 0,
                      padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 700,
                      background: `${catColor}18`, color: catColor, border: `1px solid ${catColor}40`,
                    }}>
                      {job.categorie}
                    </span>
                  )}

                  {/* Durée */}
                  {job.duration && (
                    <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                      {formatDuration(job.duration)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* État vide */}
      {total === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
          <TrendingUp size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
            Prêt pour l&apos;import en masse
          </p>
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            Glissez <strong>plusieurs dossiers à la fois</strong> depuis Finder (⌘+clic pour multi-sélection),<br />
            ou glissez le dossier parent <strong>«&nbsp;2. CV&nbsp;»</strong>, ou cliquez <strong>«&nbsp;Ajouter un dossier&nbsp;»</strong> plusieurs fois
          </p>
          <p style={{ fontSize: 12, opacity: 0.7 }}>
            Les sous-dossiers (ARCHITECTURE, ÉLECTRICITÉ, CHAUFFAGISTE…) sont détectés automatiquement comme catégories
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
