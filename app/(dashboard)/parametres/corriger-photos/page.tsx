'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Play, Pause, CheckCircle, Camera, Loader2, ThumbsUp, ThumbsDown, User, ChevronDown, ChevronUp, Trash2, RotateCcw, ArrowLeft, Zap, RefreshCw, X } from 'lucide-react'
import { usePhotos } from '@/contexts/PhotosContext'
import type { ProcessedLogItem } from '@/contexts/PhotosContext'

type Stats = { withPhoto: number; withoutPhoto: number; total: number; checked: number }

type HistoryItem = {
  id: string
  nom: string
  prenom: string | null
  titre_poste: string | null
  hadPhoto: boolean
  photo_url?: string
  status: 'approved' | 'rejected' | 'no_photo'
  processedAt: string
}

const HISTORY_KEY = 'corriger-photos-history'
const MAX_HISTORY = 2000

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(-MAX_HISTORY)))
  } catch {}
}

export default function CorrigerPhotosPage() {
  const photos = usePhotos()
  const [stats, setStats] = useState<Stats | null>(null)
  const [approved, setApproved] = useState(0)
  const [rejected, setRejected] = useState(0)
  const [validating, setValidating] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'photo' | 'no_photo' | 'rejected'>('all')

  // Load history and stats on mount
  useEffect(() => {
    fetchStats()
    setHistory(loadHistory())
  }, [])

  // Sync context processedLog → localStorage history
  // On ne stocke que les candidats avec photo trouvée (hadPhoto=true)
  useEffect(() => {
    if (photos.processedLog.length === 0) return
    const now = new Date().toISOString()
    setHistory(prev => {
      const map = new Map(prev.map(h => [h.id, h]))
      for (const item of photos.processedLog) {
        if (!item.hadPhoto) continue // ignorer les candidats sans portrait
        if (!map.has(item.id)) {
          map.set(item.id, {
            id: item.id,
            nom: item.nom,
            prenom: item.prenom,
            titre_poste: item.titre_poste,
            hadPhoto: true,
            photo_url: item.photo_url,
            status: 'approved',
            processedAt: now,
          })
        }
      }
      const merged = Array.from(map.values())
      saveHistory(merged)
      return merged
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.processedLog.length])

  // Refresh stats when analysis finishes
  useEffect(() => {
    if (photos.phase === 'done') fetchStats()
  }, [photos.phase])

  async function fetchStats() {
    try {
      const r = await fetch('/api/cv/extract-photos')
      setStats(await r.json())
    } catch {}
  }

  function handleReset() {
    photos.reset()
    fetchStats()
  }

  function updateHistoryStatus(id: string, status: 'approved' | 'rejected') {
    setHistory(prev => {
      const updated = prev.map(h => h.id === id ? { ...h, status } : h)
      saveHistory(updated)
      return updated
    })
  }

  function handleApprove() {
    const item = photos.reviewQueue[0]
    if (item) {
      updateHistoryStatus(item.id, 'approved')
      photos.approvePhoto(item.id)
    }
    setApproved(a => a + 1)
  }

  async function handleReject() {
    if (photos.reviewQueue.length === 0) return
    const item = photos.reviewQueue[0]
    setValidating(true)
    await photos.rejectPhoto(item.id)
    updateHistoryStatus(item.id, 'rejected')
    setRejected(r => r + 1)
    setValidating(false)
  }

  function handleClearHistory() {
    if (!confirm('Effacer tout l\'historique ?')) return
    localStorage.removeItem(HISTORY_KEY)
    setHistory([])
  }

  function handleStart() {
    setApproved(0)
    setRejected(0)
    photos.start()
  }

  function handleStartAuto(force = false) {
    setApproved(0)
    setRejected(0)
    photos.startAuto(force)
  }

  function handleRestart(force = false) {
    setApproved(0)
    setRejected(0)
    photos.restart(force)
  }

  const current = photos.reviewQueue[0] ?? null
  const pendingCount = photos.reviewQueue.length
  const remainingCount = stats ? stats.withoutPhoto : 0

  const filteredHistory = history.filter(h => {
    if (historyFilter === 'rejected') return h.status === 'rejected'
    return true
  }).slice().reverse()

  return (
    <div className="d-page" style={{ maxWidth: 860, paddingBottom: 60 }}>
      {/* Back */}
      <div style={{ marginBottom: 16 }}>
        <Link href="/outils" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>
          <ArrowLeft size={14} /> Outils
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Camera size={22} style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h1 className="d-page-title" style={{ margin: 0 }}>Corriger photos candidats</h1>
          <p className="d-page-sub" style={{ margin: 0 }}>Analyse les CVs et valide chaque photo trouvée · reprend là où vous vous êtes arrêté</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button onClick={fetchStats} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <RefreshCw size={11} /> Actualiser
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <StatCard label="Avec photo" value={stats.withPhoto} color="var(--success)" icon="📸" />
          <StatCard label="Sans portrait" value={stats.checked} color="#94A3B8" icon="🔍" />
          <StatCard label="À analyser" value={stats.withoutPhoto} color="var(--warning)" icon="📄" />
          <StatCard label="Total CVs" value={stats.total} color="var(--muted-foreground)" icon="📁" />
          <StatCard label="Historique" value={history.length} color="#6366F1" icon="📋" />
        </div>
        </div>
      )}

      {/* Progress + controls */}
      <div className="neo-card-soft" style={{ padding: 20, marginBottom: 20 }}>
        {(photos.phase === 'running' || photos.phase === 'paused' || photos.phase === 'done') && photos.total > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                {photos.phase === 'done'
                  ? `✓ Analyse terminée${photos.forceMode ? ' (complète)' : ''}`
                  : photos.phase === 'paused'
                    ? `⏸ En pause — ${photos.progress}% — ${photos.processed} / ${photos.total} CVs`
                    : `${photos.progress}% — ${photos.processed} / ${photos.total} CVs${photos.forceMode ? ' (ré-analyse complète)' : ''}`
                }
              </span>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--muted)' }}>
                <span style={{ color: 'var(--success)', fontWeight: 700 }}>📸 {photos.found} trouvé{photos.found > 1 ? 's' : ''}</span>
                {approved > 0 && <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓ {approved} validé{approved > 1 ? 's' : ''}</span>}
                {rejected > 0 && <span style={{ color: 'var(--destructive)', fontWeight: 700 }}>✗ {rejected} rejeté{rejected > 1 ? 's' : ''}</span>}
              </div>
            </div>
            <div style={{ height: 8, background: 'var(--muted)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${photos.progress}%`, borderRadius: 99,
                background: photos.phase === 'done'
                  ? 'linear-gradient(90deg, #10B981, #059669)'
                  : photos.phase === 'paused'
                    ? 'linear-gradient(90deg, #F59E0B, #D97706)'
                    : 'linear-gradient(90deg, var(--primary), #F59E0B)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {photos.phase === 'running' ? (
            <>
              <button onClick={photos.pause} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1.5px solid #F59E0B', background: 'var(--warning-soft)', color: 'var(--warning)', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Pause size={14} fill="#D97706" /> Pause
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                {photos.currentName
                  ? <span>Analyse en cours — <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>{photos.currentName}</span></span>
                  : 'Analyse en cours…'
                }
              </div>
            </>
          ) : photos.phase === 'paused' ? (
            <>
              <button onClick={photos.resume} className="neo-btn-yellow">
                <Play size={14} fill="#0F172A" /> Continuer
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>
                ⏸ En pause
              </div>
              <button onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
                <X size={12} /> Annuler
              </button>
            </>
          ) : (
            <>
              {/* Bouton principal — analyser les nouveaux */}
              <button
                onClick={() => handleStartAuto(false)}
                disabled={remainingCount === 0}
                className={remainingCount > 0 ? 'neo-btn-yellow' : undefined}
                style={remainingCount === 0 ? { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1.5px solid var(--border)', background: 'var(--secondary)', color: 'var(--muted)', cursor: 'not-allowed', fontFamily: 'inherit' } : undefined}
                title="Analyse automatiquement tous les CVs sans photo et sauvegarde les portraits trouvés"
              >
                <Zap size={14} />
                {remainingCount > 0
                  ? <>Analyser les nouveaux <span style={{ fontWeight: 500, opacity: 0.7 }}>({remainingCount})</span></>
                  : <>Analyser les nouveaux ✓</>
                }
              </button>

              {/* Valider les photos — visible seulement si des photos attendent */}
              {pendingCount > 0 && (
                <button
                  onClick={handleStart}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '2px solid var(--primary)', background: 'var(--primary-soft)', color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}
                  title="Valider manuellement les photos en attente"
                >
                  <Camera size={14} /> Valider les photos
                  <span style={{ background: 'var(--primary)', color: 'var(--foreground)', borderRadius: 99, fontSize: 10, fontWeight: 800, padding: '1px 6px' }}>{pendingCount}</span>
                </button>
              )}

              {/* Bouton ré-analyser supprimé — ne jamais toucher aux photos existantes */}

              {/* Messages état */}
              {photos.phase === 'done' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--success)', fontWeight: 700 }}>
                  <CheckCircle size={15} /> {photos.found > 0 ? `${photos.found} photo${photos.found > 1 ? 's' : ''} trouvée${photos.found > 1 ? 's' : ''}` : 'Analyse terminée'}
                </div>
              )}
              {photos.phase === 'done' && (
                <button onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
                  <X size={12} /> Réinitialiser
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Review zone — masquée en mode automatique */}
      {!photos.autoMode && (current || pendingCount > 0) && (
        <div style={{ marginBottom: 20 }}>
          {pendingCount > 1 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>
              <span style={{ padding: '2px 8px', borderRadius: 99, background: 'var(--secondary)', border: '1px solid var(--border)' }}>
                {pendingCount} photo{pendingCount > 1 ? 's' : ''} en attente de validation
              </span>
            </div>
          )}

          {current && (
            <div style={{ background: 'var(--card)', border: '2px solid var(--primary)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(245,167,35,0.15)' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245,167,35,0.05)' }}>
                <Camera size={15} color="var(--primary)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Photo trouvée — à valider</span>
                {photos.phase === 'running' && (
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
                    <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Analyse en cours
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 0 }}>
                <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border)', background: 'var(--secondary)' }}>
                  <img
                    src={current.photo_url}
                    alt="Photo extraite"
                    style={{ width: 152, height: 152, objectFit: 'cover', borderRadius: 12, border: '3px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
                  />
                </div>

                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={16} color="var(--primary)" />
                      </div>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.2 }}>
                          {current.prenom} {current.nom}
                        </div>
                        {current.titre_poste && (
                          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{current.titre_poste}</div>
                        )}
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: '16px 0', lineHeight: 1.6 }}>
                      Cette photo a été extraite automatiquement du CV. Est-ce qu&apos;il s&apos;agit bien d&apos;un portrait du candidat ?
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={handleApprove}
                      disabled={validating}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 10, border: '2px solid #16A34A', background: 'var(--success-soft)', color: 'var(--success)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <ThumbsUp size={16} /> Oui, c&apos;est correct
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={validating}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 10, border: '2px solid #DC2626', background: 'var(--destructive-soft)', color: 'var(--destructive)', fontSize: 14, fontWeight: 800, cursor: validating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: validating ? 0.7 : 1 }}
                    >
                      {validating ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ThumbsDown size={16} />}
                      Non, mauvaise photo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Running but no photo yet */}
      {!photos.autoMode && photos.phase === 'running' && !current && pendingCount === 0 && photos.processed > 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 10, color: 'var(--primary)' }} />
          <div>Analyse en cours — les photos trouvées apparaîtront ici</div>
        </div>
      )}

      {/* Done, all validated */}
      {!photos.autoMode && photos.phase !== 'idle' && photos.phase !== 'running' && pendingCount === 0 && (approved + rejected) > 0 && (
        <div style={{ marginBottom: 20, padding: '20px 24px', borderRadius: 12, background: 'var(--success-soft)', border: '1.5px solid #BBF7D0' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--success)', marginBottom: 4 }}>✅ Validation terminée</div>
          <div style={{ fontSize: 13, color: 'var(--success)' }}>
            {approved} photo{approved > 1 ? 's' : ''} validée{approved > 1 ? 's' : ''}
            {rejected > 0 && ` · ${rejected} rejetée${rejected > 1 ? 's' : ''} (retirées)`}
          </div>
        </div>
      )}

      {/* History panel */}
      {history.length > 0 && (
        <div className="neo-card-soft" style={{ overflow: 'hidden' }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', flex: 1, textAlign: 'left' }}>
              📋 Portraits trouvés
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                {history.length} portrait{history.length > 1 ? 's' : ''}
                {history.filter(h => h.status === 'rejected').length > 0 && (
                  <> · {history.filter(h => h.status === 'rejected').length} rejeté{history.filter(h => h.status === 'rejected').length > 1 ? 's' : ''}</>
                )}
              </span>
            </span>
            {showHistory ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
          </button>

          {showHistory && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <div style={{ padding: '10px 20px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {([
                  { key: 'all',      label: `Tous (${history.length})` },
                  { key: 'rejected', label: `Rejetés (${history.filter(h => h.status === 'rejected').length})` },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setHistoryFilter(tab.key)}
                    style={{
                      padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      border: '1.5px solid',
                      borderColor: historyFilter === tab.key ? 'var(--primary)' : 'var(--border)',
                      background: historyFilter === tab.key ? 'var(--primary-soft)' : 'transparent',
                      color: historyFilter === tab.key ? 'var(--primary)' : 'var(--muted)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
                <button
                  onClick={handleClearHistory}
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <Trash2 size={11} /> Effacer
                </button>
              </div>

              <div style={{ maxHeight: 400, overflowY: 'auto', padding: '0 20px 16px' }}>
                {filteredHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: 13 }}>Aucune entrée</div>
                ) : (
                  filteredHistory.map(item => (
                    <Link key={item.id} href={`/candidats/${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', cursor: 'pointer' }}>
                      {item.photo_url && item.status !== 'rejected' ? (
                        <img src={item.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={16} color="var(--muted)" />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2 }}>
                          {item.prenom} {item.nom}
                        </div>
                        {item.titre_poste && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.titre_poste}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                        {new Date(item.processedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </div>
                      <StatusBadge status={item.status} />
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function StatusBadge({ status }: { status: HistoryItem['status'] }) {
  const cfg = {
    approved:  { label: '✓ Photo ok',    color: 'var(--success)', bg: '#F0FDF4', border: '#BBF7D0' },
    rejected:  { label: '✗ Rejetée',     color: 'var(--destructive)', bg: '#FEF2F2', border: '#FECACA' },
    no_photo:  { label: '— Sans photo',  color: 'var(--muted-foreground)', bg: '#F8FAFC', border: '#E2E8F0' },
  }[status]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, flexShrink: 0, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function StatCard({ label, value, color, icon }: {
  label: string; value: number; color: string; bg?: string; border?: string; icon: string
}) {
  return (
    <div className="neo-kpi" style={{ padding: '20px 20px 16px', borderRadius: 16, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      {/* top accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '16px 16px 0 0', opacity: 0.7 }} />
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, fontFamily: 'var(--font-heading)' }}>{value.toLocaleString('fr-FR')}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}
