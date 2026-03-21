'use client'
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchResult = {
  candidat: {
    id: string; nom: string; prenom: string | null; titre_poste: string | null
    localisation: string | null; photo_url: string | null; annees_exp: number
  }
  score: number
  score_competences: number
  score_experience: number
  competences_matchees: string[]
  competences_manquantes: string[]
  explication: string
  recommandation: 'fort' | 'moyen' | 'faible'
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_KEY = 'tf_matching_state'

function lsSave(data: {
  phase: 'idle' | 'running' | 'paused' | 'done'
  results: MatchResult[]
  total: number
  doneCount: number
  offreId: string
  offreName: string
}) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

function lsLoad(): {
  phase: 'idle' | 'running' | 'paused' | 'done'
  results: MatchResult[]
  total: number
  doneCount: number
  offreId: string
  offreName: string
} | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function lsClear() {
  try { localStorage.removeItem(LS_KEY) } catch {}
}

// ─── Module-level persistent state ───────────────────────────────────────────
// Stored outside React so the async loop survives soft navigation

let _phase: 'idle' | 'running' | 'paused' | 'done' = 'idle'
let _results: MatchResult[] = []
let _total = 0
let _doneCount = 0
let _offreId = ''
let _offreName = ''
let _abortFlag = false
let _pauseFlag = false

// Registered by the provider to push updates into React state
let _onUpdate: ((patch: Partial<MatchingState>) => void) | null = null

// ─── State shape ─────────────────────────────────────────────────────────────

interface MatchingState {
  phase: 'idle' | 'running' | 'paused' | 'done'
  results: MatchResult[]
  total: number
  doneCount: number
  offreId: string
  offreName: string
}

interface MatchingContextType extends MatchingState {
  progress: number
  startAnalysis: (offreId: string, offreName: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
}

const MatchingContext = createContext<MatchingContextType | null>(null)

export function useMatching() {
  const ctx = useContext(MatchingContext)
  if (!ctx) throw new Error('useMatching must be inside MatchingProvider')
  return ctx
}

// ─── Analysis loop (module-level — survives soft navigation) ──────────────────

async function runAnalysisLoop(offreId: string) {
  try {
    const res = await fetch('/api/candidats?limit=500')
    const { candidats } = await res.json()

    if (!candidats?.length) {
      _phase = 'done'
      lsSave({ phase: 'done', results: _results, total: _total, doneCount: _doneCount, offreId: _offreId, offreName: _offreName })
      _onUpdate?.({ phase: 'done' })
      return
    }

    _total = candidats.length
    _onUpdate?.({ total: candidats.length })

    const BATCH = 3

    for (let i = 0; i < candidats.length; i += BATCH) {
      if (_abortFlag) break

      // Pause: spin-wait until resumed or aborted
      while (_pauseFlag && !_abortFlag) {
        await new Promise(r => setTimeout(r, 200))
      }
      if (_abortFlag) break

      const batch = candidats.slice(i, i + BATCH)

      await Promise.all(batch.map(async (c: any) => {
        if (_abortFlag) return
        try {
          const r = await fetch('/api/matching', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidat_id: c.id, offre_id: offreId }),
          })
          if (r.ok) {
            const data = await r.json()
            const entry: MatchResult = {
              candidat: {
                id: c.id, nom: c.nom, prenom: c.prenom,
                titre_poste: c.titre_poste, localisation: c.localisation,
                photo_url: c.photo_url, annees_exp: c.annees_exp,
              },
              ...data.score,
            }
            _results = [..._results, entry].sort((a, b) => b.score - a.score)
            _onUpdate?.({ results: [..._results] })
          }
        } catch { /* ignore single-candidat errors */ }

        _doneCount++
        _onUpdate?.({ doneCount: _doneCount })

        // Persist results to localStorage regularly
        lsSave({ phase: _phase, results: _results, total: _total, doneCount: _doneCount, offreId: _offreId, offreName: _offreName })
      }))
    }
  } catch { /* top-level error */ }

  if (!_abortFlag) {
    _phase = 'done'
    lsSave({ phase: 'done', results: _results, total: _total, doneCount: _doneCount, offreId: _offreId, offreName: _offreName })
    _onUpdate?.({ phase: 'done' })
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MatchingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MatchingState>(() => {
    // On first render, try to restore last analysis from localStorage
    // (handles page reload — the module state is already reset)
    const saved = lsLoad()
    if (saved) {
      // If it was running/paused when the page was reloaded, show as done
      // since the loop can't be resumed across a hard reload
      const restoredPhase = (saved.phase === 'running' || saved.phase === 'paused') ? 'done' : saved.phase
      _phase     = restoredPhase
      _results   = saved.results
      _total     = saved.total
      _doneCount = saved.doneCount
      _offreId   = saved.offreId
      _offreName = saved.offreName
      if (restoredPhase !== saved.phase) {
        lsSave({ ...saved, phase: restoredPhase })
      }
      return { phase: restoredPhase, results: saved.results, total: saved.total, doneCount: saved.doneCount, offreId: saved.offreId, offreName: saved.offreName }
    }
    return { phase: 'idle', results: [], total: 0, doneCount: 0, offreId: '', offreName: '' }
  })

  const pathname = usePathname()
  const router = useRouter()
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  // Sync module-level mutations → React state
  const update = useCallback((patch: Partial<MatchingState>) => {
    if (patch.phase !== undefined) _phase = patch.phase
    if (patch.results !== undefined) _results = patch.results
    if (patch.total !== undefined) _total = patch.total
    if (patch.doneCount !== undefined) _doneCount = patch.doneCount
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  // Register callback; re-sync module → React on every mount
  useEffect(() => {
    _onUpdate = update
    // Re-sync in case module state changed while provider was unmounted
    setState({
      phase: _phase, results: _results, total: _total,
      doneCount: _doneCount, offreId: _offreId, offreName: _offreName,
    })
    return () => { if (_onUpdate === update) _onUpdate = null }
  }, [update])

  // Toast notification when analysis finishes away from /matching
  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    if (prevPhaseRef.current !== 'done' && state.phase === 'done') {
      if (pathnameRef.current !== '/matching') {
        const count = state.results.length
        toast.success(
          `Matching terminé — ${count} candidat${count > 1 ? 's' : ''} analysé${count > 1 ? 's' : ''}`,
          { duration: 8000, action: { label: 'Voir résultats', onClick: () => router.push('/matching') } }
        )
      }
    }
    prevPhaseRef.current = state.phase
  }, [state.phase, state.results.length, router])

  const startAnalysis = useCallback((offreId: string, offreName: string) => {
    _abortFlag = false
    _pauseFlag = false
    _phase     = 'running'
    _results   = []
    _total     = 0
    _doneCount = 0
    _offreId   = offreId
    _offreName = offreName
    lsSave({ phase: 'running', results: [], total: 0, doneCount: 0, offreId, offreName })
    setState({ phase: 'running', results: [], total: 0, doneCount: 0, offreId, offreName })
    runAnalysisLoop(offreId)
  }, [])

  const pause = useCallback(() => {
    _pauseFlag = true
    _phase = 'paused'
    lsSave({ phase: 'paused', results: _results, total: _total, doneCount: _doneCount, offreId: _offreId, offreName: _offreName })
    setState(prev => ({ ...prev, phase: 'paused' }))
  }, [])

  const resume = useCallback(() => {
    _pauseFlag = false
    _phase = 'running'
    lsSave({ phase: 'running', results: _results, total: _total, doneCount: _doneCount, offreId: _offreId, offreName: _offreName })
    setState(prev => ({ ...prev, phase: 'running' }))
  }, [])

  const stop = useCallback(() => {
    _abortFlag = true
    _pauseFlag = false
    _phase     = 'idle'
    _results   = []
    _total     = 0
    _doneCount = 0
    _offreId   = ''
    _offreName = ''
    lsClear()
    setState({ phase: 'idle', results: [], total: 0, doneCount: 0, offreId: '', offreName: '' })
  }, [])

  const reset = useCallback(() => { stop() }, [stop])

  const progress = state.total > 0 ? Math.round((state.doneCount / state.total) * 100) : 0

  return (
    <MatchingContext.Provider value={{ ...state, progress, startAnalysis, pause, resume, stop, reset }}>
      {children}
    </MatchingContext.Provider>
  )
}
