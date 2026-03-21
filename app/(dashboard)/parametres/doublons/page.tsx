'use client'
import { useState, useCallback, useEffect } from 'react'
import { Copy, Loader2, CheckCircle, XCircle, Merge, Eye, ExternalLink, AlertTriangle, ArrowLeft, Users, RefreshCw, History, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

// ─── Persistence helpers ───────────────────────────────────────────────────────

type MergedHistoryItem = {
  keyId: string
  nomA: string; prenomA: string | null
  nomB: string; prenomB: string | null
  mergedAt: string
}

const LS_IGNORED = 'doublons-ignored-keys'
const LS_MERGED  = 'doublons-merged-history'

function loadIgnoredKeys(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_IGNORED) || '[]')) } catch { return new Set() }
}
function saveIgnoredKeys(keys: Set<string>) {
  try { localStorage.setItem(LS_IGNORED, JSON.stringify([...keys])) } catch {}
}
function loadMergedHistory(): MergedHistoryItem[] {
  try { return JSON.parse(localStorage.getItem(LS_MERGED) || '[]') } catch { return [] }
}
function saveMergedHistory(items: MergedHistoryItem[]) {
  try { localStorage.setItem(LS_MERGED, JSON.stringify(items.slice(-500))) } catch {}
}
function pairKey(idA: string, idB: string) { return [idA, idB].sort().join('|') }

// ─── Types ────────────────────────────────────────────────────────────────────

type Candidat = {
  id: string
  nom: string
  prenom: string | null
  email: string | null
  telephone: string | null
  titre_poste: string | null
  localisation: string | null
  annees_exp: number
  competences: string[]
  cv_url: string | null
  cv_nom_fichier: string | null
  cv_texte_brut: string | null
  created_at: string
}

type DoublonResult = {
  is_doublon: boolean
  score: number
  raisons: string[]
  explication: string
}

type DoublonPair = {
  id: string
  candidat_a: Candidat
  candidat_b: Candidat
  result: DoublonResult
  status: 'pending' | 'ignored' | 'merged'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Try to extract a date from a CV filename, e.g. "CV_26.10.2021.pdf" → Date(2021-10-26) */
function extractDateFromFilename(filename: string | null): Date | null {
  if (!filename) return null
  const match = filename.match(/(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})/)
  if (match) {
    const d = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]))
    if (!isNaN(d.getTime())) return d
  }
  return null
}

/** Returns the id of the candidate with the more recent CV/profile */
function getRecentId(a: Candidat, b: Candidat): string {
  const da = extractDateFromFilename(a.cv_nom_fichier)
  const db = extractDateFromFilename(b.cv_nom_fichier)
  // If both have a date in filename, compare those
  if (da && db) return da >= db ? a.id : b.id
  // Fall back to created_at
  return a.created_at >= b.created_at ? a.id : b.id
}

function normalize(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function normalizePhone(s: string) {
  return (s || '').replace(/[\s\-\.\(\)]/g, '').replace(/^00/, '+')
}

function nameKey(c: Candidat) {
  return normalize(c.nom) + '|' + normalize(c.prenom || '')
}

function scoreColor(score: number) {
  if (score >= 90) return { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Certain' }
  if (score >= 70) return { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Probable' }
  return { text: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Possible' }
}

// Pre-filter: generate suspicious pairs without calling Claude
function getPairsToCheck(candidats: Candidat[]): Array<[Candidat, Candidat]> {
  const pairs: Array<[Candidat, Candidat]> = []
  const checked = new Set<string>()

  const addPair = (a: Candidat, b: Candidat) => {
    const key = [a.id, b.id].sort().join('|')
    if (!checked.has(key)) { checked.add(key); pairs.push([a, b]) }
  }

  // Group by email
  const byEmail: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    if (c.email) {
      const k = normalize(c.email)
      if (!byEmail[k]) byEmail[k] = []
      byEmail[k].push(c)
    }
  }
  for (const group of Object.values(byEmail)) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j])
    }
  }

  // Group by phone
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
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j])
    }
  }

  // Group by similar name (first 3 chars nom + first 3 chars prenom)
  const byName: Record<string, Candidat[]> = {}
  for (const c of candidats) {
    const nom3 = normalize(c.nom).slice(0, 4)
    const prenom3 = normalize(c.prenom || '').slice(0, 4)
    if (nom3.length >= 3) {
      const k = `${nom3}|${prenom3}`
      if (!byName[k]) byName[k] = []
      byName[k].push(c)
    }
  }
  for (const group of Object.values(byName)) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addPair(group[i], group[j])
    }
  }

  // Limit to 60 pairs max to avoid timeout
  return pairs.slice(0, 60)
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function DoublonsPage() {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'analysing' | 'done'>('idle')
  const [candidats, setCandidats] = useState<Candidat[]>([])
  const [totalPairs, setTotalPairs] = useState(0)
  const [checkedPairs, setCheckedPairs] = useState(0)
  const [doublons, setDoublons] = useState<DoublonPair[]>([])
  const [ignoredPairs, setIgnoredPairs] = useState<DoublonPair[]>([])
  const [mergedHistory, setMergedHistory] = useState<MergedHistoryItem[]>([])
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const [showPersistentHistory, setShowPersistentHistory] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ pair: DoublonPair; keepId: string; deleteId: string } | null>(null)
  const [merging, setMerging] = useState(false)

  // Load persistent data on mount
  useEffect(() => {
    const keys = loadIgnoredKeys()
    setIgnoredKeys(keys)
    setMergedHistory(loadMergedHistory())
  }, [])

  const handleLancer = useCallback(async () => {
    setPhase('loading')
    setDoublons([])
    setIgnoredPairs([])
    setCheckedPairs(0)
    setTotalPairs(0)

    // Reload ignored keys from storage (may have changed)
    const currentIgnoredKeys = loadIgnoredKeys()
    setIgnoredKeys(currentIgnoredKeys)

    // 1. Charger tous les candidats
    let allCandidats: Candidat[] = []
    try {
      const res = await fetch('/api/candidats?limit=1000')
      const data = await res.json()
      allCandidats = data.candidats || []
    } catch {
      toast.error('Impossible de charger les candidats')
      setPhase('idle')
      return
    }

    setCandidats(allCandidats)

    if (allCandidats.length < 2) {
      toast.info('Pas assez de candidats pour analyser les doublons')
      setPhase('done')
      return
    }

    // 2. Pré-filtrer les paires suspectes (excluant les ignorées et déjà fusionnées)
    const mergedKeys = new Set(loadMergedHistory().map(m => m.keyId))
    const pairs = getPairsToCheck(allCandidats).filter(([a, b]) => {
      const k = pairKey(a.id, b.id)
      return !currentIgnoredKeys.has(k) && !mergedKeys.has(k)
    })
    setTotalPairs(pairs.length)
    setPhase('analysing')

    if (pairs.length === 0) {
      toast.success('Aucun doublon potentiel détecté (analyse rapide)')
      setPhase('done')
      return
    }

    // 3. Analyser chaque paire avec Claude
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i]
      try {
        const res = await fetch('/api/candidats/doublons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'compare', candidat_a: a, candidat_b: b }),
        })
        if (!res.ok) throw new Error('API error')
        const result: DoublonResult = await res.json()

        if (result.is_doublon) {
          const pair: DoublonPair = {
            id: `${a.id}|${b.id}`,
            candidat_a: a,
            candidat_b: b,
            result,
            status: 'pending',
          }
          setDoublons(prev => [...prev, pair])
        }
      } catch {
        // Ignore erreurs individuelles
      }
      setCheckedPairs(i + 1)
    }

    setPhase('done')
    toast.success('Analyse terminée !')
  }, [])

  const handleIgnorer = (pairId: string) => {
    setDoublons(prev => {
      const pair = prev.find(p => p.id === pairId)
      if (pair) {
        setIgnoredPairs(ign => [...ign, { ...pair, status: 'ignored' }])
        // Persist to localStorage
        const k = pairKey(pair.candidat_a.id, pair.candidat_b.id)
        setIgnoredKeys(keys => {
          const next = new Set(keys)
          next.add(k)
          saveIgnoredKeys(next)
          return next
        })
      }
      return prev.filter(p => p.id !== pairId)
    })
  }

  const handleRestorer = (pairId: string) => {
    setIgnoredPairs(prev => {
      const pair = prev.find(p => p.id === pairId)
      if (pair) {
        setDoublons(d => [...d, { ...pair, status: 'pending' }])
        // Remove from localStorage
        const k = pairKey(pair.candidat_a.id, pair.candidat_b.id)
        setIgnoredKeys(keys => {
          const next = new Set(keys)
          next.delete(k)
          saveIgnoredKeys(next)
          return next
        })
      }
      return prev.filter(p => p.id !== pairId)
    })
  }

  const handleFusionnerClick = (pair: DoublonPair) => {
    const keepId = getRecentId(pair.candidat_a, pair.candidat_b)
    const deleteId = keepId === pair.candidat_a.id ? pair.candidat_b.id : pair.candidat_a.id
    setConfirmModal({ pair, keepId, deleteId })
  }

  const handleMergeConfirm = async () => {
    if (!confirmModal) return
    setMerging(true)
    try {
      const res = await fetch('/api/candidats/doublons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'merge', keep_id: confirmModal.keepId, delete_id: confirmModal.deleteId }),
      })
      if (!res.ok) throw new Error('Erreur fusion')

      const pair = confirmModal.pair
      setDoublons(prev => prev.map(p => p.id === pair.id ? { ...p, status: 'merged' } : p))

      // Persist merge to history
      const item: MergedHistoryItem = {
        keyId: pairKey(pair.candidat_a.id, pair.candidat_b.id),
        nomA: pair.candidat_a.nom, prenomA: pair.candidat_a.prenom,
        nomB: pair.candidat_b.nom, prenomB: pair.candidat_b.prenom,
        mergedAt: new Date().toISOString(),
      }
      setMergedHistory(prev => {
        const next = [...prev, item]
        saveMergedHistory(next)
        return next
      })

      toast.success('Candidats fusionnés avec succès')
      setConfirmModal(null)
    } catch {
      toast.error('Erreur lors de la fusion')
    }
    setMerging(false)
  }

  const progress = totalPairs > 0 ? Math.round((checkedPairs / totalPairs) * 100) : 0
  const mergedCount = doublons.filter(p => p.status === 'merged').length
  const doublonCandidatIds = new Set(doublons.flatMap(p => [p.candidat_a.id, p.candidat_b.id]))
  const cleanCount = phase === 'done' && candidats.length > 0 ? candidats.length - doublonCandidatIds.size : 0
  const totalIgnoredPersisted = ignoredKeys.size

  return (
    <div className="d-page" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Link href="/parametres" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>
            <ArrowLeft size={14} /> Paramètres
          </Link>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          <Copy size={22} color="var(--primary)" />
          Analyser les doublons
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6, margin: '6px 0 0 0' }}>
          L&apos;IA analyse tous vos CVs pour détecter les candidats en double
        </p>
      </div>

      {/* Stats + bouton lancer */}
      <div className="neo-card-soft" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <StatBadge label="Candidats" value={candidats.length || '—'} color="var(--foreground)" />
            <StatBadge label="Paires vérifiées" value={checkedPairs > 0 ? `${checkedPairs}/${totalPairs}` : '—'} color="#2563EB" />
            <StatBadge label="Doublons" value={doublons.length || '—'} color={doublons.length > 0 ? '#DC2626' : 'var(--foreground)'} />
            <StatBadge label="Sans doublon" value={cleanCount > 0 ? cleanCount : '—'} color="#16A34A" />
            <StatBadge label="Fusionnés" value={mergedCount > 0 ? mergedCount : '—'} color="#7C3AED" />
          </div>
          <button
            onClick={handleLancer}
            disabled={phase === 'loading' || phase === 'analysing'}
            className="neo-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', fontSize: 14, opacity: phase === 'loading' || phase === 'analysing' ? 0.7 : 1 }}
          >
            {phase === 'loading' || phase === 'analysing'
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />Analyse en cours...</>
              : <><RefreshCw size={16} />Lancer l&apos;analyse</>
            }
          </button>
        </div>

        {/* Barre de progression */}
        {(phase === 'loading' || phase === 'analysing') && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                {phase === 'loading' ? 'Chargement des candidats...' : `Analyse paire ${checkedPairs} / ${totalPairs}`}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{phase === 'loading' ? '...' : `${progress}%`}</span>
            </div>
            <div style={{ height: 8, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: phase === 'loading' ? '8%' : `${progress}%`,
                background: 'var(--primary)',
                borderRadius: 99,
                transition: 'width 0.4s ease',
              }} />
            </div>
            {doublons.length > 0 && (
              <p style={{ fontSize: 12, color: '#D97706', marginTop: 8, fontWeight: 600 }}>
                🔍 {doublons.length} doublon{doublons.length > 1 ? 's' : ''} trouvé{doublons.length > 1 ? 's' : ''} jusqu&apos;ici
              </p>
            )}
          </div>
        )}
        {phase === 'done' && totalPairs > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: doublons.length > 0 ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${doublons.length > 0 ? '#FDE68A' : '#BBF7D0'}` }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: doublons.length > 0 ? '#92400E' : '#16A34A', margin: 0 }}>
              {doublons.length > 0
                ? `⚠️ ${doublons.length} doublon${doublons.length > 1 ? 's' : ''} détecté${doublons.length > 1 ? 's' : ''} sur ${totalPairs} paires analysées`
                : `✅ Aucun doublon détecté sur ${totalPairs} paires analysées`
              }
            </p>
          </div>
        )}
      </div>

      {/* Liste des doublons */}
      {doublons.filter(p => p.status === 'pending').length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} color="var(--primary)" />
            À traiter ({doublons.filter(p => p.status === 'pending').length})
          </h2>

          {doublons.filter(p => p.status === 'pending').map(pair => (
            <DoublonCard
              key={pair.id}
              pair={pair}
              onIgnorer={handleIgnorer}
              onFusionner={handleFusionnerClick}
            />
          ))}
        </div>
      )}

      {/* Historique de session (ignorés + fusionnés cette session) */}
      {(ignoredPairs.length > 0 || mergedCount > 0) && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 12 }}
          >
            <span style={{ fontSize: 16 }}>{showHistory ? '▾' : '▸'}</span>
            Cette session ({ignoredPairs.length + mergedCount})
            {ignoredPairs.length > 0 && <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: '#F1F5F9', color: '#64748B', fontWeight: 600 }}>{ignoredPairs.length} ignoré{ignoredPairs.length > 1 ? 's' : ''}</span>}
            {mergedCount > 0 && <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: '#F0FDF4', color: '#16A34A', fontWeight: 600 }}>{mergedCount} fusionné{mergedCount > 1 ? 's' : ''}</span>}
          </button>

          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ignoredPairs.map(pair => (
                <div key={pair.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 10, opacity: 0.8 }}>
                  <XCircle size={14} color="var(--muted)" />
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--foreground)' }}>{pair.candidat_a.prenom} {pair.candidat_a.nom}</strong>
                    <span style={{ margin: '0 6px' }}>·</span>
                    <strong style={{ color: 'var(--foreground)' }}>{pair.candidat_b.prenom} {pair.candidat_b.nom}</strong>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>— Ignoré (persisté)</span>
                  </div>
                  <button
                    onClick={() => handleRestorer(pair.id)}
                    style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--foreground)', whiteSpace: 'nowrap' }}
                  >
                    ↩ Restaurer
                  </button>
                </div>
              ))}
              {doublons.filter(p => p.status === 'merged').map(pair => (
                <div key={pair.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: 10, opacity: 0.8 }}>
                  <CheckCircle size={14} color="#16A34A" />
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--foreground)' }}>{pair.candidat_a.prenom} {pair.candidat_a.nom}</strong>
                    <span style={{ margin: '0 6px' }}>·</span>
                    <strong style={{ color: 'var(--foreground)' }}>{pair.candidat_b.prenom} {pair.candidat_b.nom}</strong>
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#16A34A', fontWeight: 600 }}>— Fusionné</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Irréversible</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historique persistant (toutes sessions) */}
      {(totalIgnoredPersisted > 0 || mergedHistory.length > 0) && (
        <div style={{ marginTop: 24, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <button
            onClick={() => setShowPersistentHistory(h => !h)}
            style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}
          >
            <History size={16} color="var(--muted)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', flex: 1, textAlign: 'left' }}>
              Historique complet
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                {totalIgnoredPersisted} ignoré{totalIgnoredPersisted > 1 ? 's' : ''}
                {' · '}{mergedHistory.length} fusionné{mergedHistory.length > 1 ? 's' : ''}
              </span>
            </span>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{showPersistentHistory ? '▾' : '▸'}</span>
          </button>

          {showPersistentHistory && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
              {/* Merged history */}
              {mergedHistory.slice().reverse().map(item => (
                <div key={item.keyId + item.mergedAt} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <CheckCircle size={13} color="#16A34A" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--foreground)' }}>{item.prenomA} {item.nomA}</strong>
                    <span style={{ margin: '0 5px' }}>·</span>
                    <strong style={{ color: 'var(--foreground)' }}>{item.prenomB} {item.nomB}</strong>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                    {new Date(item.mergedAt).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', whiteSpace: 'nowrap' }}>Fusionné</span>
                </div>
              ))}

              {/* Info about persistent ignored pairs */}
              {totalIgnoredPersisted > 0 && (
                <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, background: '#F8FAFC', border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>{totalIgnoredPersisted} paire{totalIgnoredPersisted > 1 ? 's' : ''} ignorée{totalIgnoredPersisted > 1 ? 's' : ''}</span>
                  {' '}— ces paires ne réapparaîtront plus lors des prochaines analyses.
                  <button
                    onClick={() => {
                      if (!confirm('Réinitialiser les paires ignorées ?')) return
                      saveIgnoredKeys(new Set())
                      setIgnoredKeys(new Set())
                    }}
                    style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#DC2626' }}
                  >
                    <Trash2 size={10} style={{ display: 'inline', marginRight: 3 }} />Réinitialiser
                  </button>
                </div>
              )}

              {mergedHistory.length === 0 && totalIgnoredPersisted === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>Aucun historique</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {phase === 'idle' && (
        <div className="neo-empty" style={{ padding: '60px 24px', border: '2px dashed #E8E0C8' }}>
          <div className="neo-empty-icon">🔍</div>
          <div className="neo-empty-title">Prêt à analyser</div>
          <div className="neo-empty-sub">Cliquez sur &quot;Lancer l&apos;analyse&quot; pour détecter les doublons dans votre base de candidats</div>
        </div>
      )}

      {/* Modal de confirmation fusion */}
      {confirmModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: '28px 28px 24px', maxWidth: 700, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <AlertTriangle size={22} color="#D97706" />
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Choisir le profil à garder</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Cliquez sur le profil que vous souhaitez <strong>conserver</strong>. L&apos;autre sera supprimé et ses données fusionnées dans le profil principal.
            </p>

            {/* Sélection interactive du profil à garder */}
            {(() => {
              const a = confirmModal.pair.candidat_a
              const b = confirmModal.pair.candidat_b
              const recentId = getRecentId(a, b)
              return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[a, b].map((candidat) => {
                const isSelected = confirmModal.keepId === candidat.id
                const isRecent = candidat.id === recentId
                return (
                  <div
                    key={candidat.id}
                    onClick={() => !merging && setConfirmModal({
                      ...confirmModal,
                      keepId: candidat.id,
                      deleteId: candidat.id === confirmModal.pair.candidat_a.id
                        ? confirmModal.pair.candidat_b.id
                        : confirmModal.pair.candidat_a.id,
                    })}
                    style={{
                      border: `2px solid ${isSelected ? '#16A34A' : 'var(--border)'}`,
                      borderRadius: 12,
                      padding: '14px 16px',
                      cursor: merging ? 'default' : 'pointer',
                      background: isSelected ? '#F0FDF4' : 'var(--secondary)',
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}
                  >
                    {/* Badge sélection */}
                    <div style={{
                      position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                      background: isSelected ? '#16A34A' : 'var(--border)',
                      color: isSelected ? 'white' : 'var(--muted)',
                      fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 99,
                      whiteSpace: 'nowrap', transition: 'all 0.15s',
                    }}>
                      {isSelected ? '✅ Garder ce profil' : 'Cliquer pour garder'}
                    </div>

                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--foreground)', marginBottom: 4, marginTop: 4 }}>
                      {candidat.prenom} {candidat.nom}
                    </div>
                    {candidat.titre_poste && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{candidat.titre_poste}</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {candidat.email && <span style={{ fontSize: 11, color: 'var(--muted)' }}>📧 {candidat.email}</span>}
                      {candidat.telephone && <span style={{ fontSize: 11, color: 'var(--muted)' }}>📞 {candidat.telephone}</span>}
                      {candidat.localisation && <span style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {candidat.localisation}</span>}

                      {/* Date d'ajout avec badge "plus récent" */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          🗓 Ajouté le {new Date(candidat.created_at).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        {isRecent && (() => {
                          const da = extractDateFromFilename(a.cv_nom_fichier)
                          const db = extractDateFromFilename(b.cv_nom_fichier)
                          const basedOnFile = da && db
                          return (
                            <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 99, background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE', whiteSpace: 'nowrap' }}>
                              🕐 {basedOnFile ? 'CV le plus récent' : 'Ajouté en premier'}
                            </span>
                          )
                        })()}
                      </div>

                      {/* Nom du fichier CV */}
                      {candidat.cv_nom_fichier && (
                        <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%' }} title={candidat.cv_nom_fichier}>
                          📄 {candidat.cv_nom_fichier}
                        </span>
                      )}

                      {candidat.competences?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {candidat.competences.slice(0, 3).map(c => (
                            <span key={c} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: isSelected ? '#DCFCE7' : 'var(--border)', color: isSelected ? '#166534' : 'var(--muted)', fontWeight: 600 }}>{c}</span>
                          ))}
                          {candidat.competences.length > 3 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{candidat.competences.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              </div>
              )
            })()}

            <p style={{ fontSize: 12, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 20 }}>
              ⚠️ Cette action est <strong>irréversible</strong> — le profil non sélectionné sera définitivement supprimé.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmModal(null)}
                disabled={merging}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: 'var(--foreground)' }}
              >
                Annuler
              </button>
              <button
                onClick={handleMergeConfirm}
                disabled={merging}
                style={{
                  padding: '9px 18px', borderRadius: 8, border: 'none',
                  background: '#DC2626', color: 'white', cursor: merging ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
                  opacity: merging ? 0.7 : 1,
                }}
              >
                {merging
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Fusion...</>
                  : <><Merge size={14} />Fusionner</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function StatBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

function DoublonCard({ pair, onIgnorer, onFusionner }: {
  pair: DoublonPair
  onIgnorer: (id: string) => void
  onFusionner: (pair: DoublonPair) => void
}) {
  const c = scoreColor(pair.result.score)
  const isMerged = pair.status === 'merged'

  return (
    <div style={{
      background: 'var(--card)', border: `1.5px solid ${isMerged ? '#BBF7D0' : c.border}`,
      borderRadius: 14, padding: 20, opacity: isMerged ? 0.6 : 1,
      boxShadow: 'var(--card-shadow)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ padding: '4px 12px', borderRadius: 99, background: c.bg, border: `1px solid ${c.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: c.text }}>{pair.result.score}% {c.label}</span>
          </div>
          {pair.result.raisons.map(r => (
            <span key={r} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: '#F1F5F9', color: '#64748B', fontWeight: 600 }}>{r}</span>
          ))}
        </div>
        {isMerged && <span style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} />Fusionné</span>}
      </div>

      {/* Deux candidats côte à côte */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <CandidatMiniProfile candidat={pair.candidat_a} />
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)', textAlign: 'center', padding: '0 4px' }}>vs</div>
        <CandidatMiniProfile candidat={pair.candidat_b} />
      </div>

      {/* Explication IA */}
      {pair.result.explication && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#F8FAFC', border: '1px solid var(--border)', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--foreground)' }}>Analyse IA :</strong> {pair.result.explication}
          </p>
        </div>
      )}

      {/* Actions */}
      {!isMerged && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Link href={`/candidats/${pair.candidat_a.id}`} target="_blank"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
            <Eye size={13} />Voir A
          </Link>
          <Link href={`/candidats/${pair.candidat_b.id}`} target="_blank"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
            <Eye size={13} />Voir B
          </Link>
          {pair.candidat_a.cv_url && (
            <a href={pair.candidat_a.cv_url} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
              <ExternalLink size={13} />CV A
            </a>
          )}
          {pair.candidat_b.cv_url && (
            <a href={pair.candidat_b.cv_url} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
              <ExternalLink size={13} />CV B
            </a>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => onIgnorer(pair.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'inherit' }}>
            <XCircle size={13} />Ignorer
          </button>
          <button onClick={() => onFusionner(pair)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#DC2626', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
            <Merge size={13} />Fusionner
          </button>
        </div>
      )}
    </div>
  )
}

function CandidatMiniProfile({ candidat }: { candidat: Candidat }) {
  const initials = `${(candidat.prenom || '')[0] || ''}${(candidat.nom || '')[0] || ''}`.toUpperCase() || '?'
  return (
    <div style={{ padding: 12, borderRadius: 10, background: 'var(--background)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#0F172A', flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {candidat.prenom} {candidat.nom}
          </div>
          {candidat.titre_poste && (
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {candidat.titre_poste}
            </div>
          )}
        </div>
      </div>
      {candidat.email && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>📧 {candidat.email}</div>}
      {candidat.telephone && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>📞 {candidat.telephone}</div>}
      {candidat.localisation && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {candidat.localisation}</div>}
    </div>
  )
}

function MiniCandidatCard({ candidat, label, color, border }: { candidat: Candidat; label: string; color: string; border: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: color, border: `1px solid ${border}` }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 2px 0' }}>{candidat.prenom} {candidat.nom}</p>
      {candidat.email && <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{candidat.email}</p>}
      {candidat.titre_poste && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0 0' }}>{candidat.titre_poste}</p>}
    </div>
  )
}
