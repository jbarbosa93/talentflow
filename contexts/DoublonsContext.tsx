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
  date_naissance?: string | null; genre?: string | null
  experiences?: { poste: string; entreprise: string; periode: string; description?: string }[] | null
  formations_details?: { diplome: string; etablissement: string; annee: string }[] | null
}

export type DoublonPair = {
  id: string
  candidat_a: Candidat
  candidat_b: Candidat
  match_type: string   // 'email' | 'telephone' | 'nom_prenom'
  result: { is_doublon: boolean; score: number; raisons: string[]; explication: string }
  status: 'pending' | 'ignored' | 'merged'
}

interface DoublonsState {
  phase: 'idle' | 'loading' | 'done'
  doublons: DoublonPair[]
}

interface DoublonsContextType extends DoublonsState {
  start: () => void
  markIgnored: (pairId: string) => void
  markMerged: (pairId: string) => void
  markPending: (pairId: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pairKey(idA: string, idB: string) { return [idA, idB].sort().join('|') }

function normalize(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function normalizePhone(s: string) {
  let p = (s || '').replace(/[\s\-\.\(\)]/g, '')
  // Normaliser les formats suisses
  if (p.startsWith('0041')) p = '+41' + p.slice(4)
  if (p.startsWith('00')) p = '+' + p.slice(2)
  if (p.startsWith('0') && p.length >= 10) p = '+41' + p.slice(1)
  return p
}

// ─── Détection directe (pas d'IA) ────────────────────────────────────────────

function findDoublons(candidats: Candidat[]): DoublonPair[] {
  const doublons: DoublonPair[] = []
  const seen = new Set<string>()

  const addPair = (a: Candidat, b: Candidat, matchType: string, raisons: string[], score: number) => {
    const key = pairKey(a.id, b.id)
    if (seen.has(key)) return
    seen.add(key)
    doublons.push({
      id: key,
      candidat_a: a,
      candidat_b: b,
      match_type: matchType,
      result: {
        is_doublon: true,
        score,
        raisons,
        explication: raisons.join(', '),
      },
      status: 'pending',
    })
  }

  // 1. Même email (exact) → score 100
  const byEmail: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    if (!c.email || c.email.trim().length < 5) continue
    const k = normalize(c.email)
    if (!byEmail[k]) byEmail[k] = []
    byEmail[k].push(c)
  }
  for (const group of Object.values(byEmail)) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j], 'email', ['Email identique'], 100)
    }
  }

  // 2. Même téléphone (normalisé) → score 95
  const byPhone: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    if (!c.telephone) continue
    const k = normalizePhone(c.telephone)
    if (k.length < 8) continue
    if (!byPhone[k]) byPhone[k] = []
    byPhone[k].push(c)
  }
  for (const group of Object.values(byPhone)) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j], 'telephone', ['Telephone identique'], 95)
    }
  }

  // 3. Même nom + prénom (normalisés) → score 85
  const byNomPrenom: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    const nom = normalize(c.nom)
    const prenom = normalize(c.prenom || '')
    if (nom.length < 2 || prenom.length < 2) continue
    const k = `${nom}|${prenom}`
    if (!byNomPrenom[k]) byNomPrenom[k] = []
    byNomPrenom[k].push(c)
  }
  for (const group of Object.values(byNomPrenom)) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          const raisons = ['Nom et prenom identiques']
          let score = 85
          // Bonus si même localisation ou date de naissance
          const locA = normalize(group[i].localisation || '')
          const locB = normalize(group[j].localisation || '')
          if (locA && locB && locA === locB) { raisons.push('Meme localisation'); score += 5 }
          const dnA = group[i].date_naissance
          const dnB = group[j].date_naissance
          if (dnA && dnB && dnA === dnB) { raisons.push('Meme date de naissance'); score += 10 }
          addPair(group[i], group[j], 'nom_prenom', raisons, Math.min(score, 100))
        }
    }
  }

  // Trier par score décroissant
  doublons.sort((a, b) => b.result.score - a.result.score)

  return doublons
}

// ─── Module-level persistent state ────────────────────────────────────────────

let _phase: DoublonsState['phase'] = 'idle'
let _doublons: DoublonPair[] = []
let _onUpdate: ((patch: Partial<DoublonsState>) => void) | null = null

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
    doublons: _doublons,
  })

  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    _onUpdate = (patch) => {
      setState(prev => {
        const next = { ...prev, ...patch }
        if (patch.phase !== undefined) _phase = patch.phase
        if (patch.doublons !== undefined) _doublons = patch.doublons
        return next
      })
    }
    setState({ phase: _phase, doublons: _doublons })
    return () => { _onUpdate = null }
  }, [])

  // Toast when done and not on the doublons page
  useEffect(() => {
    if (state.phase !== 'done') return
    if (pathname === '/parametres/doublons') return
    const pending = _doublons.filter(d => d.status === 'pending')
    if (pending.length > 0) {
      toast.warning(`${pending.length} doublon${pending.length > 1 ? 's' : ''} detecte${pending.length > 1 ? 's' : ''}`, {
        duration: 8000,
        action: { label: 'Voir', onClick: () => router.push('/parametres/doublons') },
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase])

  const start = useCallback(async () => {
    if (_phase === 'loading') return
    _phase = 'loading'
    _doublons = []
    setState({ phase: 'loading', doublons: [] })
    _onUpdate?.({ phase: 'loading' })

    try {
      // v1.9.45 — détection SQL déterministe 4 catégories (sha256, email, ddn_nom, metier_contact)
      // + fallback legacy client (nom+prénom trigram) pour compléter
      const [detRes, candRes] = await Promise.all([
        fetch('/api/candidats/doublons/deterministic'),
        fetch('/api/candidats?per_page=10000'),
      ])
      const detData = detRes.ok ? await detRes.json() : { pairs: [] }
      const candData = candRes.ok ? await candRes.json() : { candidats: [] }

      // 1. Paires SQL déterministes (serveur) — déjà filtrées par historique DB
      const serverPairs: DoublonPair[] = (detData.pairs || []).map((p: any) => ({
        id: pairKey(p.candidat_a.id, p.candidat_b.id),
        candidat_a: p.candidat_a,
        candidat_b: p.candidat_b,
        match_type: p.match_type,
        result: {
          is_doublon: true,
          score: p.score,
          raisons: p.reasons || [],
          explication: (p.reasons || []).join(' · '),
        },
        status: 'pending',
      }))

      // 2. Détection client legacy (nom+prénom sans DDN) — fallback pour anciens cas
      const allCandidats: Candidat[] = candData.candidats || []

      let treatedKeys = new Set<string>()
      try {
        const hRes = await fetch('/api/candidats/doublons/history')
        const hData = await hRes.json()
        for (const h of hData.history || []) {
          treatedKeys.add(pairKey(h.candidat_a_id, h.candidat_b_id))
        }
      } catch {}

      const clientPairs = findDoublons(allCandidats).filter(d => !treatedKeys.has(d.id))

      // 3. Merge : les paires serveur sont prioritaires (score + raisons plus riches),
      //    les paires client qui n'existent pas déjà côté serveur sont ajoutées en bas
      const serverKeys = new Set(serverPairs.map(p => p.id))
      const onlyClient = clientPairs.filter(p => !serverKeys.has(p.id))
      const merged = [...serverPairs, ...onlyClient]

      _doublons = merged
      _phase = 'done'
      _onUpdate?.({ phase: 'done', doublons: merged })
    } catch (e) {
      console.error('[DoublonsContext] Error:', e)
      _phase = 'done'
      _onUpdate?.({ phase: 'done', doublons: [] })
    }
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

  return (
    <DoublonsContext.Provider value={{ ...state, start, markIgnored, markMerged, markPending }}>
      {children}
    </DoublonsContext.Provider>
  )
}
