'use client'
import { useState, useEffect, useRef } from 'react'
import { Play, Square, CheckCircle, XCircle, Camera, Loader2, RefreshCw, ThumbsUp, ThumbsDown, User, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

type Stats = { withPhoto: number; withoutPhoto: number; total: number }
type Phase = 'idle' | 'running' | 'done' | 'error'

type ReviewItem = {
  id: string
  nom: string
  prenom: string | null
  titre_poste: string | null
  photo_url: string
}

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
  const [stats, setStats] = useState<Stats | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [processed, setProcessed] = useState(0)
  const [found, setFound] = useState(0)
  const [approved, setApproved] = useState(0)
  const [rejected, setRejected] = useState(0)
  const [total, setTotal] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [eta, setEta] = useState<number | null>(null)
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([])
  const [validating, setValidating] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'photo' | 'no_photo' | 'rejected'>('all')
  const stopRef = useRef(false)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    fetchStats()
    setHistory(loadHistory())
  }, [])

  async function fetchStats() {
    try {
      const r = await fetch('/api/cv/extract-photos')
      setStats(await r.json())
    } catch {}
  }

  function addToHistory(items: HistoryItem[]) {
    setHistory(prev => {
      // Avoid duplicates: update existing by id, or prepend new
      const map = new Map(prev.map(h => [h.id, h]))
      for (const item of items) {
        map.set(item.id, item)
      }
      const merged = Array.from(map.values())
      saveHistory(merged)
      return merged
    })
  }

  function updateHistoryStatus(id: string, status: 'approved' | 'rejected') {
    setHistory(prev => {
      const updated = prev.map(h => h.id === id ? { ...h, status } : h)
      saveHistory(updated)
      return updated
    })
  }

  async function handleStart() {
    stopRef.current = false
    setPhase('running')
    setProcessed(0)
    setFound(0)
    setApproved(0)
    setRejected(0)
    setReviewQueue([])
    startTimeRef.current = Date.now()

    const statsRes = await fetch('/api/cv/extract-photos')
    const statsData = await statsRes.json()
    setTotal(statsData.withoutPhoto || 0)
    setStats(statsData)

    let totalProcessed = 0
    let totalFound = 0

    while (!stopRef.current) {
      try {
        const res = await fetch('/api/cv/extract-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 3, force: false }),
        })
        if (!res.ok) break

        const data = await res.json()
        totalProcessed += data.processed || 0
        totalFound += data.found || 0

        setProcessed(totalProcessed)
        setFound(totalFound)

        // Add found candidates to review queue
        if (data.foundCandidats?.length > 0) {
          setReviewQueue(prev => [...prev, ...data.foundCandidats])
        }

        // Add ALL processed candidates to persistent history
        if (data.processedCandidats?.length > 0) {
          const now = new Date().toISOString()
          const newItems: HistoryItem[] = data.processedCandidats.map((c: any) => ({
            id: c.id,
            nom: c.nom,
            prenom: c.prenom,
            titre_poste: c.titre_poste,
            hadPhoto: c.hadPhoto,
            photo_url: c.photo_url,
            status: c.hadPhoto ? 'approved' : 'no_photo',
            processedAt: now,
          }))
          addToHistory(newItems)
        }

        const elapsed = (Date.now() - startTimeRef.current) / 1000 / 60
        const spd = elapsed > 0 ? Math.round(totalProcessed / elapsed) : 0
        setSpeed(spd)
        const remaining = data.remaining || 0
        setEta(spd > 0 ? Math.round((remaining / spd) * 60) : null)

        if (data.done || remaining === 0 || data.processed === 0) {
          setPhase('done')
          fetchStats()
          return
        }

        await new Promise(r => setTimeout(r, 300))
      } catch {
        setPhase('error')
        return
      }
    }

    if (stopRef.current) setPhase('idle')
  }

  function handleStop() {
    stopRef.current = true
    setPhase('idle')
  }

  // User approves the current photo
  function handleApprove() {
    const item = reviewQueue[0]
    if (item) updateHistoryStatus(item.id, 'approved')
    setApproved(a => a + 1)
    setReviewQueue(prev => prev.slice(1))
  }

  // User rejects — set photo_url = 'checked' so batch skips it next time
  async function handleReject() {
    if (reviewQueue.length === 0) return
    const item = reviewQueue[0]
    setValidating(true)
    try {
      await fetch(`/api/candidats/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: 'checked' }),
      })
    } catch {}
    updateHistoryStatus(item.id, 'rejected')
    setRejected(r => r + 1)
    setReviewQueue(prev => prev.slice(1))
    setValidating(false)
  }

  function handleClearHistory() {
    if (!confirm('Effacer tout l\'historique ?')) return
    localStorage.removeItem(HISTORY_KEY)
    setHistory([])
  }

  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0
  const current = reviewQueue[0] ?? null
  const pendingCount = reviewQueue.length

  const filteredHistory = history.filter(h => {
    if (historyFilter === 'photo') return h.hadPhoto
    if (historyFilter === 'no_photo') return !h.hadPhoto
    if (historyFilter === 'rejected') return h.status === 'rejected'
    return true
  }).slice().reverse() // most recent first

  function formatETA(secs: number) {
    if (secs < 60) return `${secs}s`
    if (secs < 3600) return `${Math.floor(secs / 60)}min`
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}min`
  }

  const remainingCount = stats ? stats.withoutPhoto : 0

  return (
    <div className="d-page" style={{ maxWidth: 860, paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Camera size={22} style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h1 className="d-page-title" style={{ margin: 0 }}>Corriger photos candidats</h1>
          <p className="d-page-sub" style={{ margin: 0 }}>Analyse les CVs et valide chaque photo trouvée en temps réel · reprend là où vous vous êtes arrêté</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard label="Avec photo" value={stats.withPhoto} color="#10B981" bg="#F0FDF4" border="#BBF7D0" icon="📸" />
          <StatCard label="À analyser" value={stats.withoutPhoto} color="#F59E0B" bg="#FEF9C3" border="#FDE68A" icon="📄" />
          <StatCard label="Total CVs" value={stats.total} color="#64748B" bg="#F8FAFC" border="#E2E8F0" icon="📁" />
          <StatCard label="Historique" value={history.length} color="#6366F1" bg="#EEF2FF" border="#C7D2FE" icon="📋" />
        </div>
      )}

      {/* Progress + controls */}
      <div className="neo-card-soft" style={{ padding: 20, marginBottom: 20 }}>
        {(phase === 'running' || phase === 'done') && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                {phase === 'done' ? '✓ Analyse terminée' : `${pct}% — ${processed} / ${total} CVs`}
              </span>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--muted)' }}>
                {speed > 0 && phase === 'running' && <span>⚡ {speed} CVs/min</span>}
                {eta !== null && phase === 'running' && <span>⏱ {formatETA(eta)}</span>}
                <span style={{ color: '#10B981', fontWeight: 700 }}>📸 {found} trouvé{found > 1 ? 's' : ''}</span>
                {approved > 0 && <span style={{ color: '#16A34A', fontWeight: 700 }}>✓ {approved} validé{approved > 1 ? 's' : ''}</span>}
                {rejected > 0 && <span style={{ color: '#DC2626', fontWeight: 700 }}>✗ {rejected} rejeté{rejected > 1 ? 's' : ''}</span>}
              </div>
            </div>
            <div style={{ height: 8, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`, borderRadius: 99,
                background: phase === 'done'
                  ? 'linear-gradient(90deg, #10B981, #059669)'
                  : 'linear-gradient(90deg, var(--primary), #F59E0B)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {phase === 'running' ? (
            <button onClick={handleStop} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1.5px solid #EF4444', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Square size={14} fill="#DC2626" /> Arrêter
            </button>
          ) : (
            <button onClick={handleStart} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', background: 'linear-gradient(135deg, var(--primary), #E8940A)', color: '#0F172A', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(245,167,35,0.3)' }}>
              {phase === 'done'
                ? <><RefreshCw size={14} /> Relancer</>
                : remainingCount > 0
                  ? <><Play size={14} fill="#0F172A" /> Continuer l&apos;analyse ({remainingCount} restant{remainingCount > 1 ? 's' : ''})</>
                  : <><Play size={14} fill="#0F172A" /> Lancer l&apos;analyse</>
              }
            </button>
          )}
          {phase === 'running' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
              Analyse en cours…
            </div>
          )}
          {phase === 'idle' && remainingCount === 0 && stats && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#10B981', fontWeight: 700 }}>
              <CheckCircle size={15} /> Tous les CVs ont été analysés
            </div>
          )}
          {phase === 'done' && pendingCount === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#10B981', fontWeight: 700 }}>
              <CheckCircle size={15} /> Tout validé
            </div>
          )}
          {phase === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#EF4444', fontWeight: 700 }}>
              <XCircle size={15} /> Erreur — réessayez
            </div>
          )}
        </div>
      </div>

      {/* Review zone */}
      {(current || pendingCount > 0) && (
        <div style={{ marginBottom: 20 }}>
          {pendingCount > 1 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                {phase === 'running' && (
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
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 10, border: '2px solid #16A34A', background: '#F0FDF4', color: '#16A34A', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                    >
                      <ThumbsUp size={16} /> Oui, c&apos;est correct
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={validating}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 10, border: '2px solid #DC2626', background: '#FEF2F2', color: '#DC2626', fontSize: 14, fontWeight: 800, cursor: validating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', opacity: validating ? 0.7 : 1 }}
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
      {phase === 'running' && !current && pendingCount === 0 && processed > 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 10, color: 'var(--primary)' }} />
          <div>Analyse en cours — les photos trouvées apparaîtront ici</div>
        </div>
      )}

      {/* Done, all validated */}
      {phase !== 'idle' && phase !== 'running' && pendingCount === 0 && (approved + rejected) > 0 && (
        <div style={{ marginBottom: 20, padding: '20px 24px', borderRadius: 12, background: '#F0FDF4', border: '1.5px solid #BBF7D0' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#16A34A', marginBottom: 4 }}>✅ Validation terminée</div>
          <div style={{ fontSize: 13, color: '#166534' }}>
            {approved} photo{approved > 1 ? 's' : ''} validée{approved > 1 ? 's' : ''}
            {rejected > 0 && ` · ${rejected} rejetée${rejected > 1 ? 's' : ''} (retirées)`}
          </div>
        </div>
      )}

      {/* History panel */}
      {history.length > 0 && (
        <div className="neo-card-soft" style={{ overflow: 'hidden' }}>
          {/* History header */}
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', flex: 1, textAlign: 'left' }}>
              📋 Historique d&apos;analyse
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                {history.length} CV{history.length > 1 ? 's' : ''} analysé{history.length > 1 ? 's' : ''}
                {' · '}{history.filter(h => h.hadPhoto).length} avec photo
                {' · '}{history.filter(h => !h.hadPhoto).length} sans photo
              </span>
            </span>
            {showHistory ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
          </button>

          {showHistory && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {/* Filter tabs + clear */}
              <div style={{ padding: '10px 20px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {([
                  { key: 'all', label: `Tous (${history.length})` },
                  { key: 'photo', label: `Avec photo (${history.filter(h => h.hadPhoto).length})` },
                  { key: 'no_photo', label: `Sans photo (${history.filter(h => !h.hadPhoto).length})` },
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

              {/* History list */}
              <div style={{ maxHeight: 400, overflowY: 'auto', padding: '0 20px 16px' }}>
                {filteredHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: 13 }}>Aucune entrée</div>
                ) : (
                  filteredHistory.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      {/* Photo thumbnail or placeholder */}
                      {item.photo_url && item.status !== 'rejected' ? (
                        <img src={item.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={16} color="var(--muted)" />
                        </div>
                      )}

                      {/* Name */}
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

                      {/* Date */}
                      <div style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                        {new Date(item.processedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </div>

                      {/* Status badge */}
                      <StatusBadge status={item.status} />
                    </div>
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
    approved:  { label: '✓ Photo ok',       color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
    rejected:  { label: '✗ Rejetée',        color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    no_photo:  { label: '— Sans photo',     color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  }[status]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, flexShrink: 0, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function StatCard({ label, value, color, bg, border, icon }: {
  label: string; value: number; color: string; bg: string; border: string; icon: string
}) {
  return (
    <div style={{ padding: '16px 20px', borderRadius: 12, background: bg, border: `1.5px solid ${border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value.toLocaleString('fr-FR')}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color, opacity: 0.75, marginTop: 4 }}>{label}</div>
    </div>
  )
}
