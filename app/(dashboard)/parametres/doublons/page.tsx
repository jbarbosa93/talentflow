'use client'
import { useState, useCallback, useEffect } from 'react'
import { Copy, Loader2, CheckCircle, XCircle, Merge, Eye, ExternalLink, AlertTriangle, ArrowLeft, Users, RefreshCw, History, Pause, Play, RotateCcw, Square } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useDoublons } from '@/contexts/DoublonsContext'
import type { DoublonPair } from '@/contexts/DoublonsContext'

// ─── Persistence helpers ───────────────────────────────────────────────────────

type MergedHistoryItem = {
  keyId: string
  nomA: string; prenomA: string | null
  nomB: string; prenomB: string | null
  mergedAt: string
}

type DismissedPairItem = {
  id1: string; id2: string
  name1: string; name2: string
  dismissedAt: string
}

const LS_IGNORED = 'doublons-ignored-keys'
const LS_DISMISSED_PAIRS = 'doublons-dismissed-pairs'
const LS_MERGED  = 'doublons-merged-history'

// Migration: load old Set-based ignored keys and convert to new format if needed
function loadDismissedPairs(): DismissedPairItem[] {
  try {
    const raw = localStorage.getItem(LS_DISMISSED_PAIRS)
    if (raw) return JSON.parse(raw)
    // Migrate from old format
    const oldKeys = localStorage.getItem(LS_IGNORED)
    if (oldKeys) {
      const keys: string[] = JSON.parse(oldKeys)
      const migrated: DismissedPairItem[] = keys.map(k => {
        const [id1, id2] = k.split('|')
        return { id1, id2, name1: 'Candidat', name2: 'Candidat', dismissedAt: new Date().toISOString() }
      })
      saveDismissedPairs(migrated)
      return migrated
    }
    return []
  } catch { return [] }
}
function saveDismissedPairs(items: DismissedPairItem[]) {
  try {
    localStorage.setItem(LS_DISMISSED_PAIRS, JSON.stringify(items.slice(-500)))
    // Also update the old key set for backward compat with DoublonsContext filtering
    const keySet = items.map(i => [i.id1, i.id2].sort().join('|'))
    localStorage.setItem(LS_IGNORED, JSON.stringify(keySet))
  } catch {}
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
  id: string; nom: string; prenom: string | null; email: string | null
  telephone: string | null; titre_poste: string | null; localisation: string | null
  annees_exp: number; competences: string[]; cv_url: string | null
  cv_nom_fichier: string | null; cv_texte_brut: string | null; created_at: string
}

// ─── Merge field definitions ──────────────────────────────────────────────────

type MergeFieldDef = {
  key: string
  label: string
  getValue: (c: Record<string, any>) => string
}

const MERGE_FIELDS: MergeFieldDef[] = [
  { key: 'nom_complet', label: 'Nom complet', getValue: c => `${c.prenom || ''} ${c.nom || ''}`.trim() || '—' },
  { key: 'email', label: 'Email', getValue: c => c.email || '—' },
  { key: 'telephone', label: 'Telephone', getValue: c => c.telephone || '—' },
  { key: 'titre_poste', label: 'Poste', getValue: c => c.titre_poste || '—' },
  { key: 'localisation', label: 'Localisation', getValue: c => c.localisation || '—' },
  { key: 'competences', label: 'Competences', getValue: c => (c.competences || []).slice(0, 8).join(', ') || '—' },
  { key: 'cv', label: 'CV', getValue: c => c.cv_nom_fichier || (c.cv_url ? 'CV present' : '—') },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function profileScore(c: Record<string, any>): number {
  let score = 0
  if (c.email) score += 1
  if (c.telephone) score += 1
  if (c.localisation) score += 1
  if (c.titre_poste) score += 1
  if (c.formation) score += 1
  score += (c.competences?.length || 0) * 0.5
  score += (c.langues?.length || 0) * 0.3
  score += (c.experiences?.length || 0) * 2
  score += (c.formations_details?.length || 0) * 1
  if (c.resume_ia) score += 1
  if (c.linkedin) score += 0.5
  if (c.date_naissance) score += 0.5
  return score
}

function latestExpYear(c: Record<string, any>): number {
  let max = 0
  for (const exp of c.experiences || []) {
    const match = exp.periode?.match(/(\d{4})/)
    if (match) max = Math.max(max, parseInt(match[1]))
  }
  for (const f of c.formations_details || []) {
    const y = parseInt(f.annee)
    if (y > 0) max = Math.max(max, y)
  }
  return max
}

function getBestProfileId(a: Record<string, any>, b: Record<string, any>): { id: string; reason: string } {
  const scoreA = profileScore(a)
  const scoreB = profileScore(b)
  const yearA = latestExpYear(a)
  const yearB = latestExpYear(b)

  if (yearA > yearB && yearA >= 2020) return { id: a.id, reason: `Experiences plus recentes (${yearA})` }
  if (yearB > yearA && yearB >= 2020) return { id: b.id, reason: `Experiences plus recentes (${yearB})` }
  if (scoreA > scoreB + 1) return { id: a.id, reason: 'Profil plus complet' }
  if (scoreB > scoreA + 1) return { id: b.id, reason: 'Profil plus complet' }
  return { id: a.id, reason: '' }
}

function scoreColor(score: number) {
  if (score >= 90) return { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Certain' }
  if (score >= 70) return { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Probable' }
  return { text: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Possible' }
}

// Determine best default choice per field (most complete)
function getFieldDefault(fieldKey: string, a: Record<string, any>, b: Record<string, any>): 'a' | 'b' {
  const field = MERGE_FIELDS.find(f => f.key === fieldKey)
  if (!field) return 'a'
  const vA = field.getValue(a)
  const vB = field.getValue(b)
  if (vA === '—' && vB !== '—') return 'b'
  if (vB === '—' && vA !== '—') return 'a'
  if (vB.length > vA.length) return 'b'
  return 'a'
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function DoublonsPage() {
  const doublonsCtx = useDoublons()
  const [mergedHistory, setMergedHistory] = useState<MergedHistoryItem[]>([])
  const [dismissedPairs, setDismissedPairs] = useState<DismissedPairItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showPersistentHistory, setShowPersistentHistory] = useState(false)
  const [mergeModal, setMergeModal] = useState<{ pair: DoublonPair; keepId: string; deleteId: string; fieldChoices: Record<string, 'a' | 'b'> } | null>(null)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    setDismissedPairs(loadDismissedPairs())
    setMergedHistory(loadMergedHistory())
  }, [])

  const handleLancer = useCallback(() => {
    doublonsCtx.start()
  }, [doublonsCtx])

  const handleDifferents = (pairId: string) => {
    const pair = doublonsCtx.doublons.find(p => p.id === pairId)
    if (pair) {
      const item: DismissedPairItem = {
        id1: pair.candidat_a.id,
        id2: pair.candidat_b.id,
        name1: `${pair.candidat_a.prenom || ''} ${pair.candidat_a.nom}`.trim(),
        name2: `${pair.candidat_b.prenom || ''} ${pair.candidat_b.nom}`.trim(),
        dismissedAt: new Date().toISOString(),
      }
      setDismissedPairs(prev => {
        const next = [...prev, item]
        saveDismissedPairs(next)
        return next
      })
    }
    doublonsCtx.markIgnored(pairId)
  }

  const handleReanalyser = (dismissedItem: DismissedPairItem) => {
    // Remove this specific pair from dismissed list
    setDismissedPairs(prev => {
      const next = prev.filter(d => !(
        pairKey(d.id1, d.id2) === pairKey(dismissedItem.id1, dismissedItem.id2)
      ))
      saveDismissedPairs(next)
      return next
    })
    // If this pair exists in the current doublons list (session), restore it to pending
    const matchingPair = doublonsCtx.doublons.find(p => {
      const k = pairKey(p.candidat_a.id, p.candidat_b.id)
      return k === pairKey(dismissedItem.id1, dismissedItem.id2)
    })
    if (matchingPair) {
      doublonsCtx.markPending(matchingPair.id)
    }
    toast.success('Paire restauree pour re-analyse')
  }

  const handleFusionnerClick = (pair: DoublonPair) => {
    const a = pair.candidat_a as Candidat
    const b = pair.candidat_b as Candidat
    const best = getBestProfileId(a, b)
    const keepId = best.id
    const deleteId = keepId === a.id ? b.id : a.id

    // Initialize field choices with best defaults
    const fieldChoices: Record<string, 'a' | 'b'> = {}
    for (const field of MERGE_FIELDS) {
      fieldChoices[field.key] = getFieldDefault(field.key, a, b)
    }

    setMergeModal({ pair, keepId, deleteId, fieldChoices })
  }

  const handleVoir = (pair: DoublonPair) => {
    window.open(`/candidats/${pair.candidat_a.id}`, '_blank')
    window.open(`/candidats/${pair.candidat_b.id}`, '_blank')
  }

  const handleMergeConfirm = async () => {
    if (!mergeModal) return
    setMerging(true)
    try {
      const { pair, keepId, deleteId, fieldChoices } = mergeModal

      // Build field_overrides from fieldChoices
      // "keep" means use the keepId candidate's value, "delete" means use the deleteId's value
      const field_overrides: Record<string, string> = {}
      const aIsKeep = keepId === pair.candidat_a.id

      for (const [fieldKey, choice] of Object.entries(fieldChoices)) {
        if (fieldKey === 'nom_complet') continue // nom is tied to the kept profile
        // choice is 'a' or 'b'; we need to map to 'keep' or 'delete'
        if (aIsKeep) {
          field_overrides[fieldKey] = choice === 'a' ? 'keep' : 'delete'
        } else {
          field_overrides[fieldKey] = choice === 'b' ? 'keep' : 'delete'
        }
      }

      const res = await fetch('/api/candidats/doublons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'merge', keep_id: keepId, delete_id: deleteId, field_overrides }),
      })
      if (!res.ok) throw new Error('Erreur fusion')

      doublonsCtx.markMerged(pair.id)

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

      toast.success('Candidats fusionnes avec succes')
      setMergeModal(null)
    } catch {
      toast.error('Erreur lors de la fusion')
    }
    setMerging(false)
  }

  const phase = doublonsCtx.phase
  const doublons = doublonsCtx.doublons
  const totalPairs = doublonsCtx.totalPairs
  const checkedPairs = doublonsCtx.checkedPairs
  const progress = doublonsCtx.progress

  const pendingDoublons = doublons.filter(p => p.status === 'pending')
  const ignoredDoublons = doublons.filter(p => p.status === 'ignored')
  const mergedCount = doublons.filter(p => p.status === 'merged').length
  const totalDismissedPersisted = dismissedPairs.length

  return (
    <div className="d-page" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Link href="/outils" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>
            <ArrowLeft size={14} /> Outils
          </Link>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          <Copy size={22} color="var(--primary)" />
          Analyser les doublons
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6, margin: '6px 0 0 0' }}>
          L&apos;IA analyse tous vos CVs pour detecter les candidats en double · continue en arriere-plan si vous naviguez
        </p>
      </div>

      {/* Stats + bouton lancer */}
      <div className="neo-card-soft" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <StatBadge label="Paires verifiees" value={checkedPairs > 0 ? `${checkedPairs}/${totalPairs}` : '—'} color="#2563EB" />
            <StatBadge label="Doublons" value={doublons.length > 0 ? doublons.length : '—'} color={doublons.length > 0 ? '#DC2626' : 'var(--foreground)'} />
            <StatBadge label="A traiter" value={pendingDoublons.length > 0 ? pendingDoublons.length : '—'} color={pendingDoublons.length > 0 ? '#D97706' : 'var(--foreground)'} />
            <StatBadge label="Fusionnes" value={mergedCount > 0 ? mergedCount : '—'} color="#7C3AED" />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {phase === 'analysing' ? (
              <button onClick={() => doublonsCtx.pause()}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1.5px solid #F59E0B', background: '#FFFBEB', color: '#D97706', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Pause size={14} fill="#D97706" /> Pause
              </button>
            ) : phase === 'paused' ? (
              <button onClick={() => doublonsCtx.resume()}
                className="neo-btn-yellow">
                <Play size={14} fill="#0F172A" /> Continuer
              </button>
            ) : (
              <button onClick={handleLancer}
                className="neo-btn-yellow"
                style={{ padding: '0 24px' }}
              >
                {phase === 'loading'
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />Chargement...</>
                  : <><RefreshCw size={16} />{phase === 'done' ? 'Relancer l\'analyse' : 'Lancer l\'analyse'}</>
                }
              </button>
            )}
            {(phase === 'analysing' || phase === 'paused') && (
              <>
                <button onClick={() => doublonsCtx.start()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1.5px solid var(--border)', background: 'var(--secondary)', color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <RotateCcw size={14} /> Recommencer
                </button>
                <button onClick={() => { doublonsCtx.pause(); setTimeout(() => { window.location.reload() }, 100) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Square size={14} fill="#DC2626" /> Arreter
                </button>
              </>
            )}
            {phase === 'analysing' && (
              <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                Analyse en cours...
              </span>
            )}
            {phase === 'paused' && (
              <span style={{ fontSize: 12, color: '#D97706', fontWeight: 600 }}>
                En pause — {checkedPairs}/{totalPairs} paires
              </span>
            )}
          </div>
        </div>

        {/* Barre de progression */}
        {(phase === 'loading' || phase === 'analysing' || phase === 'paused') && (
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
                {doublons.length} doublon{doublons.length > 1 ? 's' : ''} trouve{doublons.length > 1 ? 's' : ''} jusqu&apos;ici
              </p>
            )}
          </div>
        )}
        {phase === 'done' && totalPairs > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: doublons.length > 0 ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${doublons.length > 0 ? '#FDE68A' : '#BBF7D0'}` }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: doublons.length > 0 ? '#92400E' : '#16A34A', margin: 0 }}>
              {doublons.length > 0
                ? `${doublons.length} doublon${doublons.length > 1 ? 's' : ''} detecte${doublons.length > 1 ? 's' : ''} sur ${totalPairs} paires analysees`
                : `Aucun doublon detecte sur ${totalPairs} paires analysees`
              }
            </p>
          </div>
        )}
      </div>

      {/* Liste des doublons a traiter — groupes par candidat */}
      {pendingDoublons.length > 0 && (() => {
        const clusters: DoublonPair[][] = []
        const assigned = new Set<string>()
        for (const pair of pendingDoublons) {
          if (assigned.has(pair.id)) continue
          const cluster = [pair]
          assigned.add(pair.id)
          const candidatIds = new Set([pair.candidat_a.id, pair.candidat_b.id])
          let changed = true
          while (changed) {
            changed = false
            for (const other of pendingDoublons) {
              if (assigned.has(other.id)) continue
              if (candidatIds.has(other.candidat_a.id) || candidatIds.has(other.candidat_b.id)) {
                cluster.push(other)
                assigned.add(other.id)
                candidatIds.add(other.candidat_a.id)
                candidatIds.add(other.candidat_b.id)
                changed = true
              }
            }
          }
          clusters.push(cluster)
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} color="var(--primary)" />
              Possibles doublons ({pendingDoublons.length} paire{pendingDoublons.length > 1 ? 's' : ''} · {clusters.length} groupe{clusters.length > 1 ? 's' : ''})
            </h2>
            {clusters.map((cluster, ci) => {
              const candidatMap = new Map<string, typeof cluster[0]['candidat_a']>()
              for (const p of cluster) {
                candidatMap.set(p.candidat_a.id, p.candidat_a)
                candidatMap.set(p.candidat_b.id, p.candidat_b)
              }
              const uniqueCandidats = Array.from(candidatMap.values())
              const maxScore = Math.max(...cluster.map(p => p.result.score))

              if (cluster.length === 1) {
                return (
                  <DoublonCard
                    key={cluster[0].id}
                    pair={cluster[0]}
                    onDifferents={handleDifferents}
                    onFusionner={handleFusionnerClick}
                    onVoir={handleVoir}
                  />
                )
              }

              return (
                <div key={`cluster-${ci}`} style={{ background: 'var(--card)', border: '2px solid #FDE68A', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#92400E' }}>
                      {uniqueCandidats.length} profils identiques detectes
                    </span>
                    <span style={{ fontSize: 11, color: '#B45309' }}>
                      Score max : {maxScore}%
                    </span>
                  </div>
                  {cluster.map(pair => (
                    <DoublonCard
                      key={pair.id}
                      pair={pair}
                      onDifferents={handleDifferents}
                      onFusionner={handleFusionnerClick}
                      onVoir={handleVoir}
                      compact
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Historique de session (ignores + fusionnes cette session) */}
      {(ignoredDoublons.length > 0 || mergedCount > 0) && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 12 }}
          >
            <span style={{ fontSize: 16 }}>{showHistory ? '▾' : '▸'}</span>
            Cette session ({ignoredDoublons.length + mergedCount})
            {ignoredDoublons.length > 0 && <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: '#F1F5F9', color: '#64748B', fontWeight: 600 }}>{ignoredDoublons.length} ignore{ignoredDoublons.length > 1 ? 's' : ''}</span>}
            {mergedCount > 0 && <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: '#F0FDF4', color: '#16A34A', fontWeight: 600 }}>{mergedCount} fusionne{mergedCount > 1 ? 's' : ''}</span>}
          </button>

          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ignoredDoublons.map(pair => (
                <div key={pair.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 10, opacity: 0.8 }}>
                  <XCircle size={14} color="var(--muted)" />
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--foreground)' }}>{pair.candidat_a.prenom} {pair.candidat_a.nom}</strong>
                    <span style={{ margin: '0 6px' }}>·</span>
                    <strong style={{ color: 'var(--foreground)' }}>{pair.candidat_b.prenom} {pair.candidat_b.nom}</strong>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>— Personnes differentes</span>
                  </div>
                  <button
                    onClick={() => {
                      // Restore in session
                      doublonsCtx.markPending(pair.id)
                      // Also remove from dismissed pairs
                      const k = pairKey(pair.candidat_a.id, pair.candidat_b.id)
                      setDismissedPairs(prev => {
                        const next = prev.filter(d => pairKey(d.id1, d.id2) !== k)
                        saveDismissedPairs(next)
                        return next
                      })
                    }}
                    style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--foreground)', whiteSpace: 'nowrap' }}
                  >
                    Reanalyser
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
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#16A34A', fontWeight: 600 }}>— Fusionne</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600, whiteSpace: 'nowrap' }}>Irreversible</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historique persistant — personnes differentes (dismissed) + fusions */}
      {(totalDismissedPersisted > 0 || mergedHistory.length > 0) && (
        <div style={{ marginTop: 24, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <button
            onClick={() => setShowPersistentHistory(h => !h)}
            style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}
          >
            <History size={16} color="var(--muted)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', flex: 1, textAlign: 'left' }}>
              Historique complet
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                {totalDismissedPersisted} paire{totalDismissedPersisted > 1 ? 's' : ''} — personnes differentes
                {' · '}{mergedHistory.length} fusionne{mergedHistory.length > 1 ? 's' : ''}
              </span>
            </span>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{showPersistentHistory ? '▾' : '▸'}</span>
          </button>

          {showPersistentHistory && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
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
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', whiteSpace: 'nowrap' }}>Fusionne</span>
                </div>
              ))}

              {/* Dismissed pairs — personnes differentes with individual Reanalyser */}
              {dismissedPairs.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ padding: '8px 12px', borderRadius: '8px 8px 0 0', background: '#F8FAFC', border: '1px solid var(--border)', borderBottom: 'none', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>{dismissedPairs.length} paire{dismissedPairs.length > 1 ? 's' : ''} — personnes differentes</span>
                      {' '}— ne reapparaitront plus
                    </span>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                    {dismissedPairs.slice().reverse().map((item, idx) => (
                      <div key={`${item.id1}-${item.id2}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <XCircle size={12} color="#9CA3AF" />
                        <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>
                          {item.name1}
                        </span>
                        <span style={{ color: 'var(--muted)' }}>·</span>
                        <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>
                          {item.name2}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                          {new Date(item.dismissedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </span>
                        <button
                          onClick={() => handleReanalyser(item)}
                          style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#2563EB', whiteSpace: 'nowrap' }}
                        >
                          <RefreshCw size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />Reanalyser
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mergedHistory.length === 0 && dismissedPairs.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>Aucun historique</div>
              )}
            </div>
          )}
        </div>
      )}


      {/* Modal de fusion avec selection champ par champ */}
      {mergeModal && (
        <MergeModal
          pair={mergeModal.pair}
          keepId={mergeModal.keepId}
          deleteId={mergeModal.deleteId}
          fieldChoices={mergeModal.fieldChoices}
          merging={merging}
          onChangeKeepId={(keepId) => {
            const deleteId = keepId === mergeModal.pair.candidat_a.id ? mergeModal.pair.candidat_b.id : mergeModal.pair.candidat_a.id
            setMergeModal({ ...mergeModal, keepId, deleteId })
          }}
          onChangeFieldChoice={(fieldKey, choice) => {
            setMergeModal({
              ...mergeModal,
              fieldChoices: { ...mergeModal.fieldChoices, [fieldKey]: choice },
            })
          }}
          onConfirm={handleMergeConfirm}
          onCancel={() => setMergeModal(null)}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── Merge Modal ─────────────────────────────────────────────────────────────

function MergeModal({ pair, keepId, deleteId, fieldChoices, merging, onChangeKeepId, onChangeFieldChoice, onConfirm, onCancel }: {
  pair: DoublonPair
  keepId: string
  deleteId: string
  fieldChoices: Record<string, 'a' | 'b'>
  merging: boolean
  onChangeKeepId: (id: string) => void
  onChangeFieldChoice: (fieldKey: string, choice: 'a' | 'b') => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const a = pair.candidat_a as Candidat
  const b = pair.candidat_b as Candidat
  const best = getBestProfileId(a, b)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 16, padding: '24px', maxWidth: 780, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Merge size={22} color="#16A34A" />
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Fusionner les candidats</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
          Choisissez le profil principal puis selectionnez pour chaque champ la valeur a conserver.
        </p>

        {/* Profile selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[a, b].map((candidat) => {
            const isKeep = keepId === candidat.id
            const isBest = candidat.id === best.id && !!best.reason
            return (
              <div
                key={candidat.id}
                onClick={() => !merging && onChangeKeepId(candidat.id)}
                style={{
                  border: `2px solid ${isKeep ? '#16A34A' : 'var(--border)'}`,
                  borderRadius: 12, padding: '12px 14px',
                  cursor: merging ? 'default' : 'pointer',
                  background: isKeep ? '#F0FDF4' : 'var(--secondary)',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  textAlign: 'center', marginBottom: 6,
                  background: isKeep ? '#16A34A' : 'var(--border)',
                  color: isKeep ? 'white' : 'var(--muted)',
                  fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                }}>
                  {isKeep ? 'Profil principal (garde)' : 'Cliquer pour garder'}
                </div>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--foreground)', marginTop: 4 }}>
                  {candidat.prenom} {candidat.nom}
                </div>
                {candidat.titre_poste && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{candidat.titre_poste}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {candidat.email && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{candidat.email}</span>}
                  {isBest && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 99, background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                      {best.reason}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Field-by-field selection */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 40px 1fr', background: '#F8FAFC', borderBottom: '1px solid var(--border)', padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Champ</span>
            <span>Candidat A</span>
            <span />
            <span>Candidat B</span>
          </div>
          {MERGE_FIELDS.map(field => {
            const vA = field.getValue(a)
            const vB = field.getValue(b)
            const choice = fieldChoices[field.key] || 'a'
            const bothSame = vA === vB
            return (
              <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 40px 1fr', padding: '8px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>{field.label}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: choice === 'a' ? '#DBEAFE' : 'transparent', transition: 'background 0.15s' }}>
                  <input
                    type="radio"
                    name={`merge-field-${field.key}`}
                    checked={choice === 'a'}
                    onChange={() => onChangeFieldChoice(field.key, 'a')}
                    disabled={merging}
                    style={{ accentColor: '#2563EB' }}
                  />
                  <span style={{ color: vA === '—' ? 'var(--muted)' : 'var(--foreground)', fontWeight: choice === 'a' ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vA}</span>
                </label>
                <span style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>{bothSame ? '=' : 'vs'}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: choice === 'b' ? '#DBEAFE' : 'transparent', transition: 'background 0.15s' }}>
                  <input
                    type="radio"
                    name={`merge-field-${field.key}`}
                    checked={choice === 'b'}
                    onChange={() => onChangeFieldChoice(field.key, 'b')}
                    disabled={merging}
                    style={{ accentColor: '#2563EB' }}
                  />
                  <span style={{ color: vB === '—' ? 'var(--muted)' : 'var(--foreground)', fontWeight: choice === 'b' ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vB}</span>
                </label>
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 12, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 20 }}>
          Cette action est <strong>irreversible</strong> — le profil non selectionne sera definitivement supprime. Les competences, experiences et formations seront fusionnees automatiquement.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={merging}
            style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: 'var(--foreground)' }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={merging}
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: '#16A34A', color: 'white', cursor: merging ? 'not-allowed' : 'pointer',
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

function DoublonCard({ pair, onDifferents, onFusionner, onVoir, compact }: {
  pair: DoublonPair
  onDifferents: (id: string) => void
  onFusionner: (pair: DoublonPair) => void
  onVoir: (pair: DoublonPair) => void
  compact?: boolean
}) {
  const c = scoreColor(pair.result.score)
  const isMerged = pair.status === 'merged'

  return (
    <div style={{
      background: 'var(--card)',
      border: compact ? 'none' : `1.5px solid ${isMerged ? '#BBF7D0' : c.border}`,
      borderBottom: compact ? '1px solid var(--border)' : undefined,
      borderRadius: compact ? 0 : 14, padding: compact ? '14px 18px' : 20,
      opacity: isMerged ? 0.6 : 1,
      boxShadow: compact ? 'none' : 'var(--card-shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ padding: '4px 12px', borderRadius: 99, background: c.bg, border: `1px solid ${c.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: c.text }}>{pair.result.score}% {c.label}</span>
          </div>
          {pair.result.raisons.map(r => (
            <span key={r} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: '#F1F5F9', color: '#64748B', fontWeight: 600 }}>{r}</span>
          ))}
        </div>
        {isMerged && <span style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} />Fusionne</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <CandidatMiniProfile candidat={pair.candidat_a} />
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)', textAlign: 'center', padding: '0 4px' }}>vs</div>
        <CandidatMiniProfile candidat={pair.candidat_b} />
      </div>

      {pair.result.explication && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#F8FAFC', border: '1px solid var(--border)', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--foreground)' }}>Analyse IA :</strong> {pair.result.explication}
          </p>
        </div>
      )}

      {!isMerged && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => onVoir(pair)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #BFDBFE', background: '#EFF6FF', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#2563EB', fontFamily: 'inherit' }}>
            <Eye size={13} />Voir
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => onDifferents(pair.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'inherit' }}>
            <XCircle size={13} />Differents
          </button>
          <button onClick={() => onFusionner(pair)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#16A34A', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
            <Merge size={13} />Fusionner
          </button>
        </div>
      )}
    </div>
  )
}

function CandidatMiniProfile({ candidat }: { candidat: DoublonPair['candidat_a'] }) {
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
      {candidat.email && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{candidat.email}</div>}
      {candidat.telephone && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{candidat.telephone}</div>}
      {candidat.localisation && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{candidat.localisation}</div>}
    </div>
  )
}
