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
  phase: 'idle' | 'running' | 'done'
  processed: number
  found: number
  total: number
  remaining: number
  reviewQueue: ReviewItem[]
  processedLog: ProcessedLogItem[]
}

interface PhotosContextType extends PhotosState {
  progress: number
  start: () => void
  stop: () => void
  approvePhoto: (id: string) => void
  rejectPhoto: (id: string) => Promise<void>
}

// ─── Module-level persistent state ────────────────────────────────────────────
// Survives soft navigation between pages

let _phase: PhotosState['phase'] = 'idle'
let _processed = 0
let _found = 0
let _total = 0
let _remaining = 0
let _reviewQueue: ReviewItem[] = []
let _processedLog: ProcessedLogItem[] = []
let _abortFlag = false
let _onUpdate: ((patch: Partial<PhotosState>) => void) | null = null

// ─── Background loop ───────────────────────────────────────────────────────────

async function runPhotosLoop() {
  // Get initial count of CVs without photo
  try {
    const r = await fetch('/api/cv/extract-photos')
    const data = await r.json()
    _total = data.withoutPhoto || 0
    _remaining = _total
    _onUpdate?.({ total: _total, remaining: _remaining })
  } catch {
    _phase = 'done'
    _onUpdate?.({ phase: 'done' })
    return
  }

  while (!_abortFlag) {
    try {
      const res = await fetch('/api/cv/extract-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 3, force: false }),
      })
      if (!res.ok) break

      const data = await res.json()
      _processed += data.processed || 0
      _found += data.found || 0
      _remaining = data.remaining || 0

      // Accumulate photos found for user review
      if (data.foundCandidats?.length > 0) {
        _reviewQueue = [..._reviewQueue, ...data.foundCandidats]
        _onUpdate?.({ reviewQueue: [..._reviewQueue] })
      }

      // Accumulate all processed candidates for history tracking
      if (data.processedCandidats?.length > 0) {
        _processedLog = [..._processedLog, ...data.processedCandidats]
        _onUpdate?.({ processedLog: [..._processedLog] })
      }

      _onUpdate?.({ processed: _processed, found: _found, remaining: _remaining })

      if (data.done || _remaining === 0 || data.processed === 0) {
        _phase = 'done'
        _onUpdate?.({ phase: 'done' })
        return
      }

      await new Promise(r => setTimeout(r, 300))
    } catch {
      _phase = 'done'
      _onUpdate?.({ phase: 'done' })
      return
    }
  }

  if (_abortFlag) {
    _phase = 'idle'
    _onUpdate?.({ phase: 'idle' })
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
    reviewQueue: _reviewQueue,
    processedLog: _processedLog,
  })

  const pathname = usePathname()
  const router = useRouter()

  // Register the update callback so the background loop can push state into React
  useEffect(() => {
    _onUpdate = (patch) => {
      setState(prev => {
        const next = { ...prev, ...patch }
        // Sync module-level
        if (patch.phase !== undefined) _phase = patch.phase
        if (patch.processed !== undefined) _processed = patch.processed
        if (patch.found !== undefined) _found = patch.found
        if (patch.remaining !== undefined) _remaining = patch.remaining
        if (patch.reviewQueue !== undefined) _reviewQueue = patch.reviewQueue
        if (patch.processedLog !== undefined) _processedLog = patch.processedLog
        return next
      })
    }
    // Sync with current module state on mount (handles navigation back to provider)
    setState({ phase: _phase, processed: _processed, found: _found, total: _total, remaining: _remaining, reviewQueue: _reviewQueue, processedLog: _processedLog })
    return () => { _onUpdate = null }
  }, [])

  // Toast notification when done and not on the page
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

  const start = useCallback(() => {
    if (_phase === 'running') return
    _abortFlag = false
    _phase = 'running'
    _processed = 0
    _found = 0
    _remaining = 0
    _reviewQueue = []
    _processedLog = []
    setState({ phase: 'running', processed: 0, found: 0, total: 0, remaining: 0, reviewQueue: [], processedLog: [] })
    runPhotosLoop()
  }, [])

  const stop = useCallback(() => {
    _abortFlag = true
    // Phase updated async by the loop when it detects abortFlag
  }, [])

  const approvePhoto = useCallback((id: string) => {
    _reviewQueue = _reviewQueue.filter(item => item.id !== id)
    setState(prev => ({ ...prev, reviewQueue: _reviewQueue }))
  }, [])

  const rejectPhoto = useCallback(async (id: string) => {
    try {
      await fetch(`/api/candidats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: 'checked' }),
      })
    } catch {}
    _reviewQueue = _reviewQueue.filter(item => item.id !== id)
    setState(prev => ({ ...prev, reviewQueue: _reviewQueue }))
  }, [])

  const progress = state.total > 0 ? Math.min(100, Math.round((state.processed / state.total) * 100)) : 0

  return (
    <PhotosContext.Provider value={{ ...state, progress, start, stop, approvePhoto, rejectPhoto }}>
      {children}
    </PhotosContext.Provider>
  )
}
