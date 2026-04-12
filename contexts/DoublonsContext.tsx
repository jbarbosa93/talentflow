'use client'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Candidat = {
  id: string; nom: string; prenom: string | null; email: string | null
  telephone: string | null; titre_poste: string | null; localisation: string | null
  annees_exp: number; competences: string[]; cv_url: string | null
  cv_nom_fichier: string | null; cv_texte_brut: string | null; created_at: string
  photo_url?: string | null; source?: string | null
  experiences?: { poste: string; entreprise: string; periode: string; description?: string }[] | null
  formations_details?: { diplome: string; etablissement: string; annee: string }[] | null
}

export type DoublonPair = {
  id: string
  candidat_a: Candidat
  candidat_b: Candidat
  match_type?: string   // 'email' | 'telephone' | 'nom'
  sim_score?: number    // score trigramme DB
  result: { is_doublon: boolean; score: number; raisons: string[]; explication: string }
  status: 'pending' | 'ignored' | 'merged'
}

interface DoublonsState {
  phase: 'idle' | 'loading' | 'analysing' | 'paused' | 'done'
  totalPairs: number
  checkedPairs: number
  doublons: DoublonPair[]
}

interface DoublonsContextType extends DoublonsState {
  progress: number
  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  markIgnored: (pairId: string) => void
  markMerged: (pairId: string) => void
  markPending: (pairId: string) => void
}

// ─── Helper functions ──────────────────────────────────────────────────────────

function pairKey(idA: string, idB: string) { return [idA, idB].sort().join('|') }

// ─── Module-level persistent state ────────────────────────────────────────────

let _phase: DoublonsState['phase'] = 'idle'
let _totalPairs = 0
let _checkedPairs = 0
let _doublons: DoublonPair[] = []
let _abortFlag = false
let _pairs: Array<{ candidat_a: Candidat; candidat_b: Candidat; match_type?: string; sim_score?: number }> = []
let _pairIndex = 0
let _onUpdate: ((patch: Partial<DoublonsState>) => void) | null = null

const BATCH_SIZE = 5

// ─── Background loop ───────────────────────────────────────────────────────────

async function runDoublonsLoop(fromResume = false) {
  if (!fromResume) {
    _phase = 'loading'
    _onUpdate?.({ phase: 'loading' })

    // Fix 1 : utiliser la RPC find_similar_candidates au lieu du client-side getPairsToCheck
    try {
      const res = await fetch('/api/candidats/doublons/similar?threshold=20')
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const rawPairs = data.pairs || []
      _pairs = rawPairs.map((p: any) => ({
        candidat_a: p.candidat_a,
        candidat_b: p.candidat_b,
        match_type: p.match_type,
        sim_score: p.sim_score,
      }))
    } catch (e) {
      console.error('[DoublonsContext] Error loading pairs:', e)
      _phase = 'paused'
      _onUpdate?.({ phase: 'paused' })
      return
    }

    _totalPairs = _pairs.length
    _checkedPairs = 0
    _pairIndex = 0
    _phase = 'analysing'
    _onUpdate?.({ phase: 'analysing', totalPairs: _totalPairs, checkedPairs: 0 })

    if (_pairs.length === 0) {
      _phase = 'done'
      _onUpdate?.({ phase: 'done', totalPairs: 0 })
      return
    }
  } else {
    _phase = 'analysing'
    _onUpdate?.({ phase: 'analysing' })
  }

  // Fix 2 : batch IA — envoyer 5 paires par appel Claude
  for (let i = _pairIndex; i < _pairs.length; i += BATCH_SIZE) {
    if (_abortFlag) {
      _pairIndex = i
      _phase = 'paused'
      _onUpdate?.({ phase: 'paused' })
      return
    }

    const batch = _pairs.slice(i, Math.min(i + BATCH_SIZE, _pairs.length))

    try {
      const res = await fetch('/api/candidats/doublons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'compare_batch',
          pairs: batch.map(p => ({
            candidat_a: p.candidat_a,
            candidat_b: p.candidat_b,
          })),
        }),
      })

      if (res.ok) {
        const { results } = await res.json()
        if (Array.isArray(results)) {
          for (const r of results) {
            const idx = r.pair_index
            if (idx >= 0 && idx < batch.length && r.is_doublon) {
              const p = batch[idx]
              const pair: DoublonPair = {
                id: pairKey(p.candidat_a.id, p.candidat_b.id),
                candidat_a: p.candidat_a,
                candidat_b: p.candidat_b,
                match_type: p.match_type,
                sim_score: p.sim_score,
                result: {
                  is_doublon: r.is_doublon,
                  score: r.score,
                  raisons: r.raisons || [],
                  explication: r.explication || '',
                },
                status: 'pending',
              }
              _doublons = [..._doublons, pair]
              _onUpdate?.({ doublons: [..._doublons] })
            }
          }
        }
      }
    } catch {
      _pairIndex = i
      _phase = 'paused'
      _onUpdate?.({ phase: 'paused' })
      return
    }

    _checkedPairs = Math.min(i + batch.length, _pairs.length)
    _pairIndex = _checkedPairs
    _onUpdate?.({ checkedPairs: _checkedPairs })
  }

  _phase = 'done'
  _onUpdate?.({ phase: 'done' })
}

// ─── Context ───────────────────────────────────────────────────────────────────

const DoublonsContext = createContext<DoublonsContextType | null>(null)

export function useDoublons() {
  const ctx = useContext(DoublonsContext)
  if (!ctx) throw new Error('useDoublons must be inside DoublonsProvider')
  return ctx
}

// ─── Provider ──────────────────────────────────────────────────────────────────

export function DoublonsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DoublonsState>({
    phase: _phase,
    totalPairs: _totalPairs,
    checkedPairs: _checkedPairs,
    doublons: _doublons,
  })

  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    _onUpdate = (patch) => {
      setState(prev => {
        const next = { ...prev, ...patch }
        if (patch.phase !== undefined) _phase = patch.phase
        if (patch.totalPairs !== undefined) _totalPairs = patch.totalPairs
        if (patch.checkedPairs !== undefined) _checkedPairs = patch.checkedPairs
        if (patch.doublons !== undefined) _doublons = patch.doublons
        return next
      })
    }
    setState({ phase: _phase, totalPairs: _totalPairs, checkedPairs: _checkedPairs, doublons: _doublons })
    return () => { _onUpdate = null }
  }, [])

  // Toast when done and not on the doublons page
  useEffect(() => {
    if (state.phase !== 'done') return
    if (pathname === '/parametres/doublons') return
    if (_doublons.filter(d => d.status === 'pending').length > 0) {
      const count = _doublons.filter(d => d.status === 'pending').length
      toast.warning(`Analyse doublons terminee — ${count} doublon${count > 1 ? 's' : ''} detecte${count > 1 ? 's' : ''}`, {
        duration: 8000,
        action: { label: 'Voir', onClick: () => router.push('/parametres/doublons') },
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase])

  const start = useCallback(() => {
    if (_phase === 'loading' || _phase === 'analysing') return
    _abortFlag = false
    _phase = 'loading'
    _totalPairs = 0
    _checkedPairs = 0
    _doublons = []
    _pairs = []
    _pairIndex = 0
    setState({ phase: 'loading', totalPairs: 0, checkedPairs: 0, doublons: [] })
    runDoublonsLoop(false)
  }, [])

  const pause = useCallback(() => {
    _abortFlag = true
  }, [])

  const resume = useCallback(() => {
    if (_phase !== 'paused') return
    _abortFlag = false
    _phase = 'analysing'
    setState(prev => ({ ...prev, phase: 'analysing' }))
    runDoublonsLoop(true)
  }, [])

  const stop = useCallback(() => {
    _abortFlag = true
  }, [])

  const markIgnored = useCallback((pairId: string) => {
    _doublons = _doublons.map(d => d.id === pairId ? { ...d, status: 'ignored' } : d)
    setState(prev => ({ ...prev, doublons: [..._doublons] }))
  }, [])

  const markMerged = useCallback((pairId: string) => {
    _doublons = _doublons.map(d => d.id === pairId ? { ...d, status: 'merged' } : d)
    setState(prev => ({ ...prev, doublons: [..._doublons] }))
  }, [])

  const markPending = useCallback((pairId: string) => {
    _doublons = _doublons.map(d => d.id === pairId ? { ...d, status: 'pending' } : d)
    setState(prev => ({ ...prev, doublons: [..._doublons] }))
  }, [])

  const progress = state.totalPairs > 0 ? Math.min(100, Math.round((state.checkedPairs / state.totalPairs) * 100)) : 0

  return (
    <DoublonsContext.Provider value={{ ...state, progress, start, pause, resume, stop, markIgnored, markMerged, markPending }}>
      {children}
    </DoublonsContext.Provider>
  )
}
