'use client'
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchResult = {
  candidat: {
    id: string; nom: string; prenom: string | null; titre_poste: string | null
    localisation: string | null; photo_url: string | null; annees_exp: number
    telephone: string | null; email: string | null
    cv_url: string | null; cv_nom_fichier: string | null
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

const LS_KEY         = 'tf_matching_state'
const LS_HISTORY_KEY = 'tf_matching_history'
const MAX_HISTORY    = 20
const MAX_RESULTS_IN_HISTORY = 15

export type MatchHistoryItem = {
  id: string
  date: string
  offreId: string
  offreName: string
  totalBase: number
  totalAnalyzed: number
  keywords: string[]
  results: Array<{
    candidat: { id: string; nom: string; prenom: string | null; titre_poste: string | null; photo_url: string | null; telephone: string | null; email: string | null; cv_url?: string | null; cv_nom_fichier?: string | null }
    score: number
    recommandation: string
  }>
}

export function historyLoad(): MatchHistoryItem[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function historySave(item: MatchHistoryItem) {
  try {
    const existing = historyLoad()
    // Remove same offreId if already exists, then prepend new
    const filtered = existing.filter(h => h.id !== item.id)
    const updated = [item, ...filtered].slice(0, MAX_HISTORY)
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated))
  } catch {}
}

type LsData = {
  phase: 'idle' | 'running' | 'paused' | 'done'
  results: MatchResult[]
  total: number
  doneCount: number
  offreId: string
  offreName: string
  totalBase: number
  keywords: string[]
  isExterne?: boolean
}

function lsSave(data: LsData) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

function lsLoad(): LsData | null {
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
  totalBase: number      // nb total de candidats dans la base
  keywords: string[]     // mots-clés extraits de l'offre
  isExterne: boolean     // true si matching sur offre externe
}

interface MatchingContextType extends MatchingState {
  progress: number
  startAnalysis: (offreId: string, offreName: string, isExterne?: boolean) => void
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
}

// Extra module-level fields for new state props
let _totalBase = 0
let _keywords: string[] = []
let _isExterne = false

const MatchingContext = createContext<MatchingContextType | null>(null)

export function useMatching() {
  const ctx = useContext(MatchingContext)
  if (!ctx) throw new Error('useMatching must be inside MatchingProvider')
  return ctx
}

// ─── Analysis loop (module-level — survives soft navigation) ──────────────────

function lsSnap() {
  lsSave({ phase: _phase, results: _results, total: _total, doneCount: _doneCount, offreId: _offreId, offreName: _offreName, totalBase: _totalBase, keywords: _keywords, isExterne: _isExterne })
}

async function runAnalysisLoop(offreId: string, isExterne = false) {
  try {
    // ── Étape 1 : pré-sélection rapide (pas de Claude) ───────────────────────
    const preselectBody = isExterne
      ? { offre_externe_id: offreId }
      : { offre_id: offreId }
    const preRes = await fetch('/api/matching/preselect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preselectBody),
    })
    const preData = await preRes.json()
    const candidats = preData.candidats || []

    _totalBase = preData.total_base || 0
    _keywords  = preData.keywords || []
    _onUpdate?.({ totalBase: _totalBase, keywords: _keywords })

    if (!candidats.length) {
      _phase = 'done'
      lsSnap()
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
            body: JSON.stringify(isExterne
              ? { candidat_id: c.id, offre_externe_id: offreId }
              : { candidat_id: c.id, offre_id: offreId }
            ),
          })
          if (r.ok) {
            const data = await r.json()
            const entry: MatchResult = {
              candidat: {
                id: c.id, nom: c.nom, prenom: c.prenom,
                titre_poste: c.titre_poste, localisation: c.localisation,
                photo_url: c.photo_url, annees_exp: c.annees_exp,
                telephone: c.telephone ?? null, email: c.email ?? null,
                cv_url: c.cv_url ?? null, cv_nom_fichier: c.cv_nom_fichier ?? null,
              },
              ...data.score,
            }
            _results = [..._results, entry].sort((a, b) => b.score - a.score || a.candidat.id.localeCompare(b.candidat.id))
            _onUpdate?.({ results: [..._results] })
          }
        } catch { /* ignore single-candidat errors */ }

        _doneCount++
        _onUpdate?.({ doneCount: _doneCount })
        lsSnap()
      }))
    }
    // Re-sort final : élimine les artifacts d'ordre d'arrivée des batches parallèles
    if (!_abortFlag) {
      _results = [..._results].sort((a, b) => b.score - a.score || a.candidat.id.localeCompare(b.candidat.id))
      _onUpdate?.({ results: [..._results] })
    }
  } catch { /* top-level error */ }

  if (!_abortFlag) {
    _phase = 'done'
    lsSnap()
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
      const restoredPhase = (saved.phase === 'running' || saved.phase === 'paused') ? 'done' : saved.phase
      _phase     = restoredPhase
      _results   = saved.results
      _total     = saved.total
      _doneCount = saved.doneCount
      _offreId   = saved.offreId
      _offreName = saved.offreName
      _totalBase = saved.totalBase || 0
      _keywords  = saved.keywords || []
      _isExterne = saved.isExterne || false
      if (restoredPhase !== saved.phase) lsSave({ ...saved, phase: restoredPhase })
      return { phase: restoredPhase, results: saved.results, total: saved.total, doneCount: saved.doneCount, offreId: saved.offreId, offreName: saved.offreName, totalBase: _totalBase, keywords: _keywords, isExterne: _isExterne }
    }
    return { phase: 'idle', results: [], total: 0, doneCount: 0, offreId: '', offreName: '', totalBase: 0, keywords: [], isExterne: false }
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
    if (patch.totalBase !== undefined) _totalBase = patch.totalBase
    if (patch.keywords !== undefined) _keywords = patch.keywords
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  // Register callback; re-sync module → React on every mount
  useEffect(() => {
    _onUpdate = update
    setState({
      phase: _phase, results: _results, total: _total,
      doneCount: _doneCount, offreId: _offreId, offreName: _offreName,
      totalBase: _totalBase, keywords: _keywords, isExterne: _isExterne,
    })
    return () => { if (_onUpdate === update) _onUpdate = null }
  }, [update])

  // Save to history + toast when analysis finishes
  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    if (prevPhaseRef.current !== 'done' && state.phase === 'done' && state.results.length > 0) {
      // Save to history
      historySave({
        id: `${state.offreId}-${Date.now()}`,
        date: new Date().toISOString(),
        offreId: state.offreId,
        offreName: state.offreName,
        totalBase: state.totalBase,
        totalAnalyzed: state.total,
        keywords: state.keywords,
        results: state.results.slice(0, MAX_RESULTS_IN_HISTORY).map(r => ({
          candidat: { id: r.candidat.id, nom: r.candidat.nom, prenom: r.candidat.prenom, titre_poste: r.candidat.titre_poste, photo_url: r.candidat.photo_url, telephone: r.candidat.telephone ?? null, email: r.candidat.email ?? null, cv_url: r.candidat.cv_url ?? null, cv_nom_fichier: r.candidat.cv_nom_fichier ?? null },
          score: r.score,
          recommandation: r.recommandation,
        })),
      })
      // Toast si pas sur la page matching
      if (pathnameRef.current !== '/matching') {
        const count = state.results.length
        toast.success(
          `Matching terminé — ${count} candidat${count > 1 ? 's' : ''} analysé${count > 1 ? 's' : ''}`,
          { duration: 8000, action: { label: 'Voir résultats', onClick: () => router.push('/matching') } }
        )
      }
    }
    prevPhaseRef.current = state.phase
  }, [state.phase, state.results.length, state.offreId, state.offreName, state.totalBase, state.total, state.keywords, state.results, router])

  const startAnalysis = useCallback((offreId: string, offreName: string, isExterne = false) => {
    _abortFlag = false
    _pauseFlag = false
    _phase     = 'running'
    _results   = []
    _total     = 0
    _doneCount = 0
    _offreId   = offreId
    _offreName = offreName
    _totalBase = 0
    _keywords  = []
    _isExterne = isExterne
    lsSave({ phase: 'running', results: [], total: 0, doneCount: 0, offreId, offreName, totalBase: 0, keywords: [], isExterne })
    setState({ phase: 'running', results: [], total: 0, doneCount: 0, offreId, offreName, totalBase: 0, keywords: [], isExterne })
    runAnalysisLoop(offreId, isExterne)
  }, [])

  const pause = useCallback(() => {
    _pauseFlag = true
    _phase = 'paused'
    lsSnap()
    setState(prev => ({ ...prev, phase: 'paused' }))
  }, [])

  const resume = useCallback(() => {
    _pauseFlag = false
    _phase = 'running'
    lsSnap()
    setState(prev => ({ ...prev, phase: 'running' }))
  }, [])

  const stop = useCallback(() => {
    _abortFlag = true
    _pauseFlag = false
    // Sauvegarder dans l'historique si des résultats existent (analyse arrêtée manuellement)
    if (_results.length > 0) {
      historySave({
        id: `${_offreId}-${Date.now()}`,
        date: new Date().toISOString(),
        offreId: _offreId,
        offreName: _offreName,
        totalBase: _totalBase,
        totalAnalyzed: _doneCount,
        keywords: _keywords,
        results: _results.slice(0, MAX_RESULTS_IN_HISTORY).map(r => ({
          candidat: { id: r.candidat.id, nom: r.candidat.nom, prenom: r.candidat.prenom, titre_poste: r.candidat.titre_poste, photo_url: r.candidat.photo_url, telephone: r.candidat.telephone ?? null, email: r.candidat.email ?? null, cv_url: r.candidat.cv_url ?? null, cv_nom_fichier: r.candidat.cv_nom_fichier ?? null },
          score: r.score,
          recommandation: r.recommandation,
        })),
      })
    }
    _phase     = 'idle'
    _results   = []
    _total     = 0
    _doneCount = 0
    _offreId   = ''
    _offreName = ''
    _totalBase = 0
    _keywords  = []
    _isExterne = false
    lsClear()
    setState({ phase: 'idle', results: [], total: 0, doneCount: 0, offreId: '', offreName: '', totalBase: 0, keywords: [], isExterne: false })
  }, [])

  // reset = vider sans sauvegarder (nouvelle recherche, vider résultats)
  const reset = useCallback(() => {
    _abortFlag = true
    _pauseFlag = false
    _phase     = 'idle'
    _results   = []
    _total     = 0
    _doneCount = 0
    _offreId   = ''
    _offreName = ''
    _totalBase = 0
    _keywords  = []
    _isExterne = false
    lsClear()
    setState({ phase: 'idle', results: [], total: 0, doneCount: 0, offreId: '', offreName: '', totalBase: 0, keywords: [], isExterne: false })
  }, [])

  const progress = state.total > 0 ? Math.round((state.doneCount / state.total) * 100) : 0

  return (
    <MatchingContext.Provider value={{ ...state, progress, startAnalysis, pause, resume, stop, reset }}>
      {children}
    </MatchingContext.Provider>
  )
}
