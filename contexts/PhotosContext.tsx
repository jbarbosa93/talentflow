'use client'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ReviewItem = {
  id: string
  nom: string
  prenom: string | null
  titre_poste: string | null
  photo_url: string
}

export type ProcessedLogItem = {
  id: string
  nom: string
  prenom: string | null
  titre_poste: string | null
  hadPhoto: boolean
  photo_url?: string
}

interface PhotosState {
  phase: 'idle' | 'running' | 'paused' | 'done'
  processed: number
  found: number
  total: number
  remaining: number
  forceMode: boolean
  autoMode: boolean
  reviewQueue: ReviewItem[]
  processedLog: ProcessedLogItem[]
  currentName: string | null
}

interface PhotosContextType extends PhotosState {
  progress: number
  start: () => void
  startAuto: (force?: boolean) => void
  pause: () => void
  resume: () => void
  restart: (force?: boolean) => void
  stop: () => void
  reset: () => void
  approvePhoto: (id: string) => void
  rejectPhoto: (id: string) => Promise<void>
}

// ─── Module-level persistent state ────────────────────────────────────────────

let _phase: PhotosState['phase'] = 'idle'
let _processed = 0
let _found = 0
let _total = 0
let _remaining = 0
let _forceMode = false
let _autoMode = false
let _forceOffset = 0
let _reviewQueue: ReviewItem[] = []
let _processedLog: ProcessedLogItem[] = []
let _currentName: string | null = null
let _abortFlag = false
let _onUpdate: ((patch: Partial<PhotosState>) => void) | null = null

// ─── Background loop ───────────────────────────────────────────────────────────

async function runPhotosLoop(force = false) {
  // Get initial count
  try {
    const r = await fetch('/api/cv/extract-photos')
    const data = await r.json()
    const total = force ? (data.total || 0) : (data.withoutPhoto || 0)
    _total = total
    _remaining = force ? Math.max(0, total - _forceOffset) : total
    _onUpdate?.({ total: _total, remaining: _remaining })
  } catch {
    _phase = 'paused'
    _onUpdate?.({ phase: 'paused' })
    return
  }

  while (!_abortFlag) {
    try {
      const body: Record<string, unknown> = { batchSize: _autoMode ? 15 : 3, force }
      if (force) body.offset = _forceOffset

      const res = await fetch('/api/cv/extract-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        _phase = 'paused'
        _onUpdate?.({ phase: 'paused' })
        return
      }

      const data = await res.json()
      const batchProcessed = data.processed || 0
      _processed += batchProcessed
      _found += data.found || 0
      _remaining = data.remaining || 0
      if (force) _forceOffset += batchProcessed

      if (!_autoMode && data.foundCandidats?.length > 0) {
        _reviewQueue = [..._reviewQueue, ...data.foundCandidats]
        _onUpdate?.({ reviewQueue: [..._reviewQueue] })
      }
      if (data.processedCandidats?.length > 0) {
        _processedLog = [..._processedLog, ...data.processedCandidats]
        const last = data.processedCandidats[data.processedCandidats.length - 1]
        _currentName = last ? `${last.prenom || ''} ${last.nom || ''}`.trim() || null : null
        _onUpdate?.({ processedLog: [..._processedLog], currentName: _currentName })
      }

      _onUpdate?.({ processed: _processed, found: _found, remaining: _remaining })

      if (data.done || _remaining === 0 || batchProcessed === 0) {
        _phase = 'done'
        _onUpdate?.({ phase: 'done' })
        return
      }

      await new Promise(r => setTimeout(r, 300))
    } catch {
      // On error → paused so user can resume/retry
      _phase = 'paused'
      _onUpdate?.({ phase: 'paused' })
      return
    }
  }

  if (_abortFlag) {
    _phase = 'paused'
    _onUpdate?.({ phase: 'paused' })
  }
}

// ─── Context ───────────────────────────────────────────────────────────────────

const PhotosContext = createContext<PhotosContextType | null>(null)

export function usePhotos() {
  const ctx = useContext(PhotosContext)
  if (!ctx) throw new Error('usePhotos must be inside PhotosProvider')
  return ctx
}

// ─── Provider ──────────────────────────────────────────────────────────────────

export function PhotosProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PhotosState>({
    phase: _phase,
    processed: _processed,
    found: _found,
    total: _total,
    remaining: _remaining,
    forceMode: _forceMode,
    autoMode: _autoMode,
    reviewQueue: _reviewQueue,
    processedLog: _processedLog,
    currentName: _currentName,
  })

  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    _onUpdate = (patch) => {
      setState(prev => {
        const next = { ...prev, ...patch }
        if (patch.phase !== undefined) _phase = patch.phase
        if (patch.processed !== undefined) _processed = patch.processed
        if (patch.found !== undefined) _found = patch.found
        if (patch.remaining !== undefined) _remaining = patch.remaining
        if (patch.reviewQueue !== undefined) _reviewQueue = patch.reviewQueue
        if (patch.processedLog !== undefined) _processedLog = patch.processedLog
        if (patch.currentName !== undefined) _currentName = patch.currentName
        return next
      })
    }
    setState({ phase: _phase, processed: _processed, found: _found, total: _total, remaining: _remaining, forceMode: _forceMode, autoMode: _autoMode, reviewQueue: _reviewQueue, processedLog: _processedLog, currentName: _currentName })
    return () => { _onUpdate = null }
  }, [])

  useEffect(() => {
    if (state.phase !== 'done') return
    if (pathname === '/parametres/corriger-photos') return
    if (_found > 0) {
      toast.success(`Analyse photos terminée — ${_found} photo${_found > 1 ? 's' : ''} trouvée${_found > 1 ? 's' : ''}`, {
        duration: 8000,
        action: { label: 'Valider', onClick: () => router.push('/parametres/corriger-photos') },
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase])

  // Start fresh — normal mode (only unprocessed CVs)
  const start = useCallback(() => {
    if (_phase === 'running') return
    _abortFlag = false
    _phase = 'running'
    _forceMode = false
    _autoMode = false
    _forceOffset = 0
    _processed = 0
    _found = 0
    _remaining = 0
    _reviewQueue = []
    _processedLog = []
    setState({ phase: 'running', processed: 0, found: 0, total: 0, remaining: 0, forceMode: false, autoMode: false, reviewQueue: [], processedLog: [], currentName: null })
    runPhotosLoop(false)
  }, [])

  // Start fresh — auto mode (processes all, no review queue)
  const startAuto = useCallback((force = false) => {
    if (_phase === 'running') return
    _abortFlag = false
    _phase = 'running'
    _forceMode = force
    _autoMode = true
    _forceOffset = 0
    _processed = 0
    _found = 0
    _remaining = 0
    _reviewQueue = []
    _processedLog = []
    setState({ phase: 'running', processed: 0, found: 0, total: 0, remaining: 0, forceMode: force, autoMode: true, reviewQueue: [], processedLog: [], currentName: null })
    runPhotosLoop(force)
  }, [])

  // Pause — stops the loop, preserves progress
  const pause = useCallback(() => {
    _abortFlag = true
    // Loop will set phase to 'paused' when it detects the flag
  }, [])

  // Resume — continues from where it stopped
  const resume = useCallback(() => {
    if (_phase !== 'paused') return
    _abortFlag = false
    _phase = 'running'
    setState(prev => ({ ...prev, phase: 'running' }))
    runPhotosLoop(_forceMode)
  }, [])

  // Restart — resets all counters and restarts (optionally force=true for all CVs)
  const restart = useCallback((force = false) => {
    _abortFlag = false
    _phase = 'running'
    _forceMode = force
    _forceOffset = 0
    _processed = 0
    _found = 0
    _remaining = 0
    _reviewQueue = []
    _processedLog = []
    setState({ phase: 'running', processed: 0, found: 0, total: 0, remaining: 0, forceMode: force, autoMode: _autoMode, reviewQueue: [], processedLog: [], currentName: null })
    runPhotosLoop(force)
  }, [])

  // Stop completely — alias for pause (kept for backward compat)
  const stop = useCallback(() => {
    _abortFlag = true
  }, [])

  // Reset to idle — clears stale progress without restarting
  const reset = useCallback(() => {
    _abortFlag = true
    _phase = 'idle'
    _forceMode = false
    _autoMode = false
    _forceOffset = 0
    _processed = 0
    _found = 0
    _remaining = 0
    _reviewQueue = []
    _processedLog = []
    setState({ phase: 'idle', processed: 0, found: 0, total: 0, remaining: 0, forceMode: false, autoMode: false, reviewQueue: [], processedLog: [], currentName: null })
  }, [])

  const approvePhoto = useCallback((id: string) => {
    _reviewQueue = _reviewQueue.filter(item => item.id !== id)
    setState(prev => ({ ...prev, reviewQueue: _reviewQueue }))
  }, [])

  const rejectPhoto = useCallback(async (id: string) => {
    try {
      // Supprime le fichier Storage + met photo_url = 'checked'
      await fetch('/api/cv/extract-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidatId: id, reject: true }),
      })
    } catch {}
    _reviewQueue = _reviewQueue.filter(item => item.id !== id)
    setState(prev => ({ ...prev, reviewQueue: _reviewQueue }))
  }, [])

  const progress = state.total > 0 ? Math.min(100, Math.round((state.processed / state.total) * 100)) : 0

  return (
    <PhotosContext.Provider value={{ ...state, progress, start, startAuto, pause, resume, restart, stop, reset, approvePhoto, rejectPhoto }}>
      {children}
    </PhotosContext.Provider>
  )
}
