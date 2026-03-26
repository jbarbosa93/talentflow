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
}

export type DoublonPair = {
  id: string
  candidat_a: Candidat
  candidat_b: Candidat
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

function normalize(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}
function normalizePhone(s: string) {
  return (s || '').replace(/[\s\-\.\(\)]/g, '').replace(/^00/, '+')
}
function pairKey(idA: string, idB: string) { return [idA, idB].sort().join('|') }

function loadIgnoredKeys(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('doublons-ignored-keys') || '[]')) } catch { return new Set() }
}
function loadMergedKeys(): Set<string> {
  try {
    const items = JSON.parse(localStorage.getItem('doublons-merged-history') || '[]')
    return new Set(items.map((m: { keyId: string }) => m.keyId))
  } catch { return new Set() }
}

function getPairsToCheck(candidats: Candidat[]): Array<[Candidat, Candidat]> {
  const pairs: Array<[Candidat, Candidat]> = []
  const checked = new Set<string>()
  const addPair = (a: Candidat, b: Candidat) => {
    const key = [a.id, b.id].sort().join('|')
    if (!checked.has(key)) { checked.add(key); pairs.push([a, b]) }
  }

  const byEmail: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    if (c.email) {
      const k = normalize(c.email)
      if (!byEmail[k]) byEmail[k] = []
      byEmail[k].push(c)
    }
  }
  for (const group of Object.values(byEmail)) {
    if (group.length >= 2)
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j])
  }

  const byPhone: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    if (c.telephone) {
      const k = normalizePhone(c.telephone)
      if (k.length > 5) {
        if (!byPhone[k]) byPhone[k] = []
        byPhone[k].push(c)
      }
    }
  }
  for (const group of Object.values(byPhone)) {
    if (group.length >= 2)
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j])
  }

  const byName: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    const nom4 = normalize(c.nom).slice(0, 4)
    const prenom4 = normalize(c.prenom || '').slice(0, 4)
    if (nom4.length >= 3) {
      const k = `${nom4}|${prenom4}`
      if (!byName[k]) byName[k] = []
      byName[k].push(c)
    }
  }
  for (const group of Object.values(byName)) {
    if (group.length >= 2)
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j])
  }

  return pairs.slice(0, 500)
}

// ─── Module-level persistent state ────────────────────────────────────────────

let _phase: DoublonsState['phase'] = 'idle'
let _totalPairs = 0
let _checkedPairs = 0
let _doublons: DoublonPair[] = []
let _abortFlag = false
let _pairs: Array<[Candidat, Candidat]> = []
let _pairIndex = 0
let _onUpdate: ((patch: Partial<DoublonsState>) => void) | null = null

// ─── Background loop ───────────────────────────────────────────────────────────

async function runDoublonsLoop(fromResume = false) {
  if (!fromResume) {
    _phase = 'loading'
    _onUpdate?.({ phase: 'loading' })

    let allCandidats: Candidat[] = []
    try {
      const res = await fetch('/api/candidats?per_page=5000')
      const data = await res.json()
      allCandidats = data.candidats || []
    } catch {
      _phase = 'paused'
      _onUpdate?.({ phase: 'paused' })
      return
    }

    if (allCandidats.length < 2) {
      _phase = 'done'
      _onUpdate?.({ phase: 'done' })
      return
    }

    const ignoredKeys = loadIgnoredKeys()
    const mergedKeys = loadMergedKeys()
    _pairs = getPairsToCheck(allCandidats).filter(([a, b]) => {
      const k = pairKey(a.id, b.id)
      return !ignoredKeys.has(k) && !mergedKeys.has(k)
    })

    _totalPairs = _pairs.length
    _checkedPairs = 0
    _pairIndex = 0
    _phase = 'analysing'
    _onUpdate?.({ phase: 'analysing', totalPairs: _totalPairs, checkedPairs: 0 })

    if (_pairs.length === 0) {
      _phase = 'done'
      _onUpdate?.({ phase: 'done' })
      return
    }
  } else {
    _phase = 'analysing'
    _onUpdate?.({ phase: 'analysing' })
  }

  for (let i = _pairIndex; i < _pairs.length; i++) {
    if (_abortFlag) {
      _pairIndex = i
      _phase = 'paused'
      _onUpdate?.({ phase: 'paused' })
      return
    }

    const [a, b] = _pairs[i]
    try {
      const res = await fetch('/api/candidats/doublons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compare', candidat_a: a, candidat_b: b }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.is_doublon) {
          const pair: DoublonPair = {
            id: `${a.id}|${b.id}`,
            candidat_a: a,
            candidat_b: b,
            result,
            status: 'pending',
          }
          _doublons = [..._doublons, pair]
          _onUpdate?.({ doublons: [..._doublons] })
        }
      }
    } catch {
      _pairIndex = i
      _phase = 'paused'
      _onUpdate?.({ phase: 'paused' })
      return
    }

    _checkedPairs = i + 1
    _pairIndex = i + 1
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
      toast.warning(`Analyse doublons terminée — ${count} doublon${count > 1 ? 's' : ''} détecté${count > 1 ? 's' : ''}`, {
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
