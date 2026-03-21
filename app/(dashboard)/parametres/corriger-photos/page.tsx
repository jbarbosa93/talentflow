'use client'
import { useState, useEffect, useRef } from 'react'
import { Play, Square, CheckCircle, XCircle, Camera, Loader2, RefreshCw } from 'lucide-react'

type Stats = { withPhoto: number; withoutPhoto: number; total: number }
type Phase = 'idle' | 'running' | 'done' | 'error' | 'stopping'

export default function CorrigerPhotosPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [processed, setProcessed] = useState(0)
  const [found, setFound] = useState(0)
  const [total, setTotal] = useState(0)
  const [speed, setSpeed] = useState(0)   // CVs/min
  const [eta, setEta] = useState<number | null>(null)
  const stopRef = useRef(false)
  const startTimeRef = useRef<number>(0)

  // Charger les stats initiales
  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const r = await fetch('/api/cv/extract-photos')
      const d = await r.json()
      setStats(d)
    } catch {}
  }

  async function handleStart() {
    stopRef.current = false
    setPhase('running')
    setProcessed(0)
    setFound(0)
    startTimeRef.current = Date.now()

    // Récupérer le total (seulement ceux sans photo)
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
          body: JSON.stringify({ batchSize: 5, force: false }),
        })

        if (!res.ok) break

        const data = await res.json()
        const batchProcessed = data.processed || 0
        const batchFound = data.found || 0
        totalProcessed += batchProcessed
        totalFound += batchFound

        setProcessed(totalProcessed)
        setFound(totalFound)

        // Calcul vitesse et ETA
        const elapsed = (Date.now() - startTimeRef.current) / 1000 / 60 // minutes
        const spd = elapsed > 0 ? Math.round(totalProcessed / elapsed) : 0
        setSpeed(spd)
        const remaining = data.remaining || 0
        if (spd > 0) setEta(Math.round((remaining / spd) * 60)) // secondes
        else setEta(null)

        if (data.done || remaining === 0 || batchProcessed === 0) {
          setPhase('done')
          fetchStats()
          return
        }

        await new Promise(r => setTimeout(r, 200))
      } catch {
        setPhase('error')
        return
      }
    }

    if (stopRef.current) {
      setPhase('idle')
    }
  }

  function handleStop() {
    stopRef.current = true
    setPhase('idle')
  }

  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0

  function formatETA(secs: number) {
    if (secs < 60) return `${secs}s`
    if (secs < 3600) return `${Math.floor(secs / 60)}min ${secs % 60}s`
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}min`
  }

  return (
    <div className="d-page" style={{ maxWidth: 780, paddingBottom: 60 }}>
      {/* Header */}
      <div className="d-page-header" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Camera size={22} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 className="d-page-title" style={{ margin: 0 }}>Corriger photos candidats</h1>
            <p className="d-page-sub" style={{ margin: 0 }}>Re-analyse tous les CVs avec les filtres stricts — photos de visage uniquement</p>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard label="Avec photo" value={stats.withPhoto} color="#10B981" bg="#F0FDF4" border="#BBF7D0" icon="📸" />
          <StatCard label="Sans photo" value={stats.withoutPhoto} color="#F59E0B" bg="#FEF9C3" border="#FDE68A" icon="📄" />
          <StatCard label="Total CVs" value={stats.total} color="#64748B" bg="#F8FAFC" border="#E2E8F0" icon="📁" />
        </div>
      )}

      {/* Main action card */}
      <div className="neo-card-soft" style={{ padding: 24, marginBottom: 16 }}>

        {/* Info banner */}
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
          <strong>Comment ça fonctionne :</strong> chaque CV PDF est analysé, toutes les images sont extraites et scorées selon leur probabilité d&apos;être un portrait (dimensions, ratio, complexité). Seule la meilleure image passe le seuil — les logos et icônes sont rejetés.
        </div>

        {/* Progress bar */}
        {(phase === 'running' || phase === 'done') && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                {phase === 'done' ? '✓ Terminé' : `${pct}% — ${processed} / ${total} CVs`}
              </span>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)' }}>
                {phase === 'running' && speed > 0 && (
                  <span>⚡ {speed} CVs/min</span>
                )}
                {phase === 'running' && eta !== null && (
                  <span>⏱ ETA {formatETA(eta)}</span>
                )}
                <span style={{ color: '#10B981', fontWeight: 700 }}>📸 {found} photo{found > 1 ? 's' : ''}</span>
              </div>
            </div>
            <div style={{ height: 10, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                borderRadius: 99,
                background: phase === 'done'
                  ? 'linear-gradient(90deg, #10B981, #059669)'
                  : 'linear-gradient(90deg, var(--primary), #F59E0B)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {phase === 'running' ? (
            <button
              onClick={handleStop}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                border: '1.5px solid #EF4444', background: '#FEF2F2', color: '#DC2626',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Square size={15} fill="#DC2626" /> Arrêter
            </button>
          ) : (
            <button
              onClick={handleStart}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                border: 'none',
                background: phase === 'done'
                  ? 'linear-gradient(135deg, #10B981, #059669)'
                  : 'linear-gradient(135deg, var(--primary), #E8940A)',
                color: '#0F172A',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 2px 8px rgba(245,167,35,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {phase === 'done'
                ? <><RefreshCw size={15} /> Relancer</>
                : <><Play size={15} fill="#0F172A" /> Lancer la correction</>
              }
            </button>
          )}

          {phase === 'running' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
              Analyse en cours...
            </div>
          )}

          {phase === 'done' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#10B981', fontWeight: 700 }}>
              <CheckCircle size={16} /> Correction terminée
            </div>
          )}

          {phase === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#EF4444', fontWeight: 700 }}>
              <XCircle size={16} /> Erreur — réessayez
            </div>
          )}
        </div>
      </div>


      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

function StatCard({ label, value, color, bg, border, icon }: {
  label: string; value: number; color: string; bg: string; border: string; icon: string
}) {
  return (
    <div style={{ padding: '16px 20px', borderRadius: 12, background: bg, border: `1.5px solid ${border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{value.toLocaleString('fr-FR')}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color, opacity: 0.75, marginTop: 4 }}>{label}</div>
    </div>
  )
}
