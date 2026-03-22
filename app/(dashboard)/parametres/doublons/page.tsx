'use client'
import { useState, useCallback, useEffect } from 'react'
import { Copy, Loader2, CheckCircle, XCircle, Merge, Eye, ExternalLink, AlertTriangle, ArrowLeft, Users, RefreshCw, History, Trash2, Pause, Play, RotateCcw, Square } from 'lucide-react'
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

type IgnoredHistoryItem = {
  keyId: string
  nomA: string; prenomA: string | null
  nomB: string; prenomB: string | null
  ignoredAt: string
}

const LS_IGNORED = 'doublons-ignored-keys'
const LS_IGNORED_HISTORY = 'doublons-ignored-history'
const LS_MERGED  = 'doublons-merged-history'

function loadIgnoredKeys(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_IGNORED) || '[]')) } catch { return new Set() }
}
function saveIgnoredKeys(keys: Set<string>) {
  try { localStorage.setItem(LS_IGNORED, JSON.stringify([...keys])) } catch {}
}
function loadIgnoredHistory(): IgnoredHistoryItem[] {
  try { return JSON.parse(localStorage.getItem(LS_IGNORED_HISTORY) || '[]') } catch { return [] }
}
function saveIgnoredHistory(items: IgnoredHistoryItem[]) {
  try { localStorage.setItem(LS_IGNORED_HISTORY, JSON.stringify(items.slice(-500))) } catch {}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Analyse le contenu réel d'un profil pour déterminer lequel est le meilleur
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

// Trouve l'expérience la plus récente dans un profil (année la plus élevée)
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

  // Si un profil a des expériences plus récentes → priorité
  if (yearA > yearB && yearA >= 2020) return { id: a.id, reason: `Expériences plus récentes (${yearA})` }
  if (yearB > yearA && yearB >= 2020) return { id: b.id, reason: `Expériences plus récentes (${yearB})` }

  // Sinon, le profil le plus complet
  if (scoreA > scoreB + 1) return { id: a.id, reason: 'Profil plus complet' }
  if (scoreB > scoreA + 1) return { id: b.id, reason: 'Profil plus complet' }

  // Sinon, pareil
  return { id: a.id, reason: '' }
}

function scoreColor(score: number) {
  if (score >= 90) return { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Certain' }
  if (score >= 70) return { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Probable' }
  return { text: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Possible' }
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function DoublonsPage() {
  const doublonsCtx = useDoublons()
  const [mergedHistory, setMergedHistory] = useState<MergedHistoryItem[]>([])
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set())
  const [ignoredHistory, setIgnoredHistory] = useState<IgnoredHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showPersistentHistory, setShowPersistentHistory] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ pair: DoublonPair; keepId: string; deleteId: string } | null>(null)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    setIgnoredKeys(loadIgnoredKeys())
    setIgnoredHistory(loadIgnoredHistory())
    setMergedHistory(loadMergedHistory())
  }, [])

  const handleLancer = useCallback(() => {
    doublonsCtx.start()
  }, [doublonsCtx])

  const handleIgnorer = (pairId: string) => {
    const pair = doublonsCtx.doublons.find(p => p.id === pairId)
    if (pair) {
      const k = pairKey(pair.candidat_a.id, pair.candidat_b.id)
      setIgnoredKeys(keys => {
        const next = new Set(keys)
        next.add(k)
        saveIgnoredKeys(next)
        return next
      })
      // Sauvegarder les noms dans l'historique ignoré
      setIgnoredHistory(prev => {
        const item: IgnoredHistoryItem = {
          keyId: k,
          nomA: pair.candidat_a.nom, prenomA: pair.candidat_a.prenom,
          nomB: pair.candidat_b.nom, prenomB: pair.candidat_b.prenom,
          ignoredAt: new Date().toISOString(),
        }
        const next = [...prev, item]
        saveIgnoredHistory(next)
        return next
      })
    }
    doublonsCtx.markIgnored(pairId)
  }

  const handleRestorer = (pairId: string) => {
    const pair = doublonsCtx.doublons.find(p => p.id === pairId)
    if (pair) {
      const k = pairKey(pair.candidat_a.id, pair.candidat_b.id)
      setIgnoredKeys(keys => {
        const next = new Set(keys)
        next.delete(k)
        saveIgnoredKeys(next)
        return next
      })
    }
    doublonsCtx.markPending(pairId)
  }

  const handleFusionnerClick = (pair: DoublonPair) => {
    const keepId = getBestProfileId(pair.candidat_a as Candidat, pair.candidat_b as Candidat).id
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

      toast.success('Candidats fusionnés avec succès')
      setConfirmModal(null)
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
  const totalIgnoredPersisted = ignoredKeys.size

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
          L&apos;IA analyse tous vos CVs pour détecter les candidats en double · continue en arrière-plan si vous naviguez
        </p>
      </div>

      {/* Stats + bouton lancer */}
      <div className="neo-card-soft" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <StatBadge label="Paires vérifiées" value={checkedPairs > 0 ? `${checkedPairs}/${totalPairs}` : '—'} color="#2563EB" />
            <StatBadge label="Doublons" value={doublons.length > 0 ? doublons.length : '—'} color={doublons.length > 0 ? '#DC2626' : 'var(--foreground)'} />
            <StatBadge label="À traiter" value={pendingDoublons.length > 0 ? pendingDoublons.length : '—'} color={pendingDoublons.length > 0 ? '#D97706' : 'var(--foreground)'} />
            <StatBadge label="Fusionnés" value={mergedCount > 0 ? mergedCount : '—'} color="#7C3AED" />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {phase === 'analysing' ? (
              <button onClick={() => doublonsCtx.pause()}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1.5px solid #F59E0B', background: '#FFFBEB', color: '#D97706', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Pause size={14} fill="#D97706" /> Pause
              </button>
            ) : phase === 'paused' ? (
              <button onClick={() => doublonsCtx.resume()}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', background: 'linear-gradient(135deg, var(--primary), #E8940A)', color: '#0F172A', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(245,167,35,0.3)' }}>
                <Play size={14} fill="#0F172A" /> Continuer
              </button>
            ) : (
              <button onClick={handleLancer}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700,
                  borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: 'linear-gradient(135deg, var(--primary), #E8940A)', color: '#0F172A',
                  boxShadow: '0 4px 14px rgba(245,167,35,0.35)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(245,167,35,0.4)' }}
                onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(245,167,35,0.35)' }}
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
                  <Square size={14} fill="#DC2626" /> Arrêter
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
                ⏸ En pause — {checkedPairs}/{totalPairs} paires
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

      {/* Liste des doublons à traiter — groupés par candidat */}
      {pendingDoublons.length > 0 && (() => {
        // Grouper les paires qui partagent un candidat commun (clusters)
        const clusters: DoublonPair[][] = []
        const assigned = new Set<string>()
        for (const pair of pendingDoublons) {
          if (assigned.has(pair.id)) continue
          // Trouver toutes les paires liées par des candidats communs
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
              À traiter ({pendingDoublons.length} paire{pendingDoublons.length > 1 ? 's' : ''} · {clusters.length} groupe{clusters.length > 1 ? 's' : ''})
            </h2>
            {clusters.map((cluster, ci) => {
              // Extraire les candidats uniques du cluster
              const candidatMap = new Map<string, typeof cluster[0]['candidat_a']>()
              for (const p of cluster) {
                candidatMap.set(p.candidat_a.id, p.candidat_a)
                candidatMap.set(p.candidat_b.id, p.candidat_b)
              }
              const uniqueCandidats = Array.from(candidatMap.values())
              const maxScore = Math.max(...cluster.map(p => p.result.score))

              if (cluster.length === 1) {
                // Cluster simple (1 paire) → affichage classique
                return (
                  <DoublonCard
                    key={cluster[0].id}
                    pair={cluster[0]}
                    onIgnorer={handleIgnorer}
                    onFusionner={handleFusionnerClick}
                  />
                )
              }

              // Cluster multiple → affichage groupé
              return (
                <div key={`cluster-${ci}`} style={{ background: 'var(--card)', border: '2px solid #FDE68A', borderRadius: 14, overflow: 'hidden' }}>
                  {/* En-tête du groupe */}
                  <div style={{ padding: '12px 18px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#92400E' }}>
                      {uniqueCandidats.length} profils identiques détectés
                    </span>
                    <span style={{ fontSize: 11, color: '#B45309' }}>
                      Score max : {maxScore}%
                    </span>
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={() => cluster.forEach(p => handleIgnorer(p.id))}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1.5px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--muted)', fontFamily: 'inherit' }}
                    >
                      <XCircle size={12} />Tous différents
                    </button>
                  </div>
                  {/* Paires du cluster */}
                  {cluster.map(pair => (
                    <DoublonCard
                      key={pair.id}
                      pair={pair}
                      onIgnorer={handleIgnorer}
                      onFusionner={handleFusionnerClick}
                      compact
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Historique de session (ignorés + fusionnés cette session) */}
      {(ignoredDoublons.length > 0 || mergedCount > 0) && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 12 }}
          >
            <span style={{ fontSize: 16 }}>{showHistory ? '▾' : '▸'}</span>
            Cette session ({ignoredDoublons.length + mergedCount})
            {ignoredDoublons.length > 0 && <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: '#F1F5F9', color: '#64748B', fontWeight: 600 }}>{ignoredDoublons.length} ignoré{ignoredDoublons.length > 1 ? 's' : ''}</span>}
            {mergedCount > 0 && <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: '#F0FDF4', color: '#16A34A', fontWeight: 600 }}>{mergedCount} fusionné{mergedCount > 1 ? 's' : ''}</span>}
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

              {totalIgnoredPersisted > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ padding: '8px 12px', borderRadius: '8px 8px 0 0', background: '#F8FAFC', border: '1px solid var(--border)', borderBottom: ignoredHistory.length > 0 ? 'none' : undefined, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>{totalIgnoredPersisted} paire{totalIgnoredPersisted > 1 ? 's' : ''} — personnes différentes</span>
                      {' '}— ne réapparaîtront plus
                    </span>
                    <button
                      onClick={() => {
                        if (!confirm('Réinitialiser ? Les paires pourront réapparaître.')) return
                        saveIgnoredKeys(new Set())
                        saveIgnoredHistory([])
                        setIgnoredKeys(new Set())
                        setIgnoredHistory([])
                      }}
                      style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontFamily: 'inherit', color: '#DC2626' }}
                    >
                      <Trash2 size={10} style={{ display: 'inline', marginRight: 3 }} />Réinitialiser
                    </button>
                  </div>
                  {ignoredHistory.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                      {ignoredHistory.slice().reverse().map(item => (
                        <div key={item.keyId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                          <XCircle size={12} color="#9CA3AF" />
                          <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>
                            {item.prenomA} {item.nomA}
                          </span>
                          <span style={{ color: 'var(--muted)' }}>·</span>
                          <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>
                            {item.prenomB} {item.nomB}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                            {new Date(item.ignoredAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          </span>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#F1F5F9', color: '#64748B', fontWeight: 700 }}>
                            Différents
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
        <div style={{ padding: '60px 24px', border: '2px dashed #E8E0C8', borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--foreground)', marginBottom: 6 }}>Prêt à analyser</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>L&apos;IA va comparer les candidats pour détecter les doublons</div>
        </div>
      )}

      {/* Modal de confirmation fusion */}
      {confirmModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 16, padding: '20px', maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <AlertTriangle size={22} color="#D97706" />
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Choisir le profil à garder</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Cliquez sur le profil que vous souhaitez <strong>conserver</strong>. L&apos;autre sera supprimé et ses données fusionnées dans le profil principal.
            </p>

            {(() => {
              const a = confirmModal.pair.candidat_a as Candidat
              const b = confirmModal.pair.candidat_b as Candidat
              const best = getBestProfileId(a, b)
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[a, b].map((candidat) => {
                    const isSelected = confirmModal.keepId === candidat.id
                    const isBest = candidat.id === best.id && !!best.reason
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
                          borderRadius: 12, padding: '12px 14px', minWidth: 0, overflow: 'hidden',
                          cursor: merging ? 'default' : 'pointer',
                          background: isSelected ? '#F0FDF4' : 'var(--secondary)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{
                          textAlign: 'center', marginBottom: 6,
                          background: isSelected ? '#16A34A' : 'var(--border)',
                          color: isSelected ? 'white' : 'var(--muted)',
                          fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                          whiteSpace: 'nowrap', transition: 'all 0.15s',
                        }}>
                          {isSelected ? '✅ Garder ce profil' : 'Cliquer pour garder'}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--foreground)', marginBottom: 3, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candidat.prenom} {candidat.nom}
                        </div>
                        {candidat.titre_poste && (
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{candidat.titre_poste}</div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {candidat.email && <span style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>📧 {candidat.email}</span>}
                          {candidat.telephone && <span style={{ fontSize: 10, color: 'var(--muted)' }}>📞 {candidat.telephone}</span>}
                          {candidat.localisation && <span style={{ fontSize: 10, color: 'var(--muted)' }}>📍 {candidat.localisation}</span>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                              🗓 Ajouté le {new Date(candidat.created_at).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            {isBest && (
                              <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 99, background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE', whiteSpace: 'nowrap' }}>
                                ⭐ {best.reason}
                              </span>
                            )}
                          </div>
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

function DoublonCard({ pair, onIgnorer, onFusionner, compact }: {
  pair: DoublonPair
  onIgnorer: (id: string) => void
  onFusionner: (pair: DoublonPair) => void
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
        {isMerged && <span style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} />Fusionné</span>}
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
            <XCircle size={13} />Personnes différentes
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
      {candidat.email && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>📧 {candidat.email}</div>}
      {candidat.telephone && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>📞 {candidat.telephone}</div>}
      {candidat.localisation && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {candidat.localisation}</div>}
    </div>
  )
}
