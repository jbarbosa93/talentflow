'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, Play, Pause, CheckCircle, RefreshCw, ChevronDown, ChevronUp, Loader2, Square } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface DiffItem {
  field: string
  old: any
  new_val: any
}

interface RecheckResult {
  id: string
  candidat_id: string
  candidat_nom: string
  candidat_prenom: string
  old_data: any
  new_data: any
  diffs: DiffItem[]
  diff_count: number
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export default function AnalyseCompletePage() {
  const [status, setStatus] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const [approvingAll, setApprovingAll] = useState(false)
  const [offset, setOffset] = useState(0)
  const [batchErrors, setBatchErrors] = useState(0)
  const runningRef = useRef(false)
  const offsetRef = useRef(0)

  // Keep refs in sync
  runningRef.current = running
  offsetRef.current = offset

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/candidats/recheck-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      })
      const data = await res.json()
      setStatus(data)
      // Restaurer l'offset depuis la base de données (nombre de candidats déjà traités)
      if (data.total_processed && data.total_processed > 0) {
        setOffset(data.total_processed)
        offsetRef.current = data.total_processed
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  // Poll status toutes les 15s
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 15000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // ─── MOTEUR DE BATCH CÔTÉ CLIENT ───
  // Boucle qui appelle l'API batch par batch tant que `running` est true
  const runBatchLoop = useCallback(async (startOffset: number, isStart: boolean) => {
    let currentOffset = startOffset
    let consecutiveErrors = 0

    while (runningRef.current) {
      try {
        const res = await fetch('/api/candidats/recheck-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: isStart && currentOffset === startOffset ? 'start' : 'continue',
            offset: currentOffset,
          }),
        })

        const data = await res.json()

        if (data.done) {
          toast.success(`✅ Analyse terminée ! ${currentOffset} CVs traités.`)
          setRunning(false)
          runningRef.current = false
          fetchStatus()
          break
        }

        if (data.error) {
          consecutiveErrors++
          setBatchErrors(prev => prev + 1)
          if (consecutiveErrors >= 5) {
            toast.error('Trop d\'erreurs consécutives — analyse en pause.')
            setRunning(false)
            runningRef.current = false
            break
          }
          // Attendre un peu avant de réessayer
          await new Promise(r => setTimeout(r, 3000))
          continue
        }

        consecutiveErrors = 0
        currentOffset = data.processed || (currentOffset + 3)
        setOffset(currentOffset)
        offsetRef.current = currentOffset

        // Rafraîchir le status toutes les 10 batches
        if (currentOffset % 30 === 0) {
          fetchStatus()
        }

        // Petit délai entre batches pour ne pas surcharger l'API
        await new Promise(r => setTimeout(r, 500))

      } catch (err: any) {
        consecutiveErrors++
        setBatchErrors(prev => prev + 1)
        if (consecutiveErrors >= 5) {
          toast.error('Erreur réseau — analyse en pause.')
          setRunning(false)
          runningRef.current = false
          break
        }
        await new Promise(r => setTimeout(r, 5000))
      }
    }
  }, [fetchStatus])

  const handleStart = async () => {
    if (!confirm('Lancer l\'analyse complète de tous les CVs ? Cela peut prendre plusieurs heures et consommer des crédits API Claude.\n\nLaissez cette page ouverte — l\'analyse s\'arrête si vous la fermez, mais reprend où elle en était quand vous revenez.')) return
    setRunning(true)
    setOffset(0)
    setBatchErrors(0)
    runningRef.current = true
    toast.success('Analyse lancée !')
    runBatchLoop(0, true)
  }

  const handleResume = async () => {
    setRunning(true)
    runningRef.current = true
    toast.success(`Reprise à partir du candidat #${offset}`)
    runBatchLoop(offset, false)
  }

  const handlePause = () => {
    setRunning(false)
    runningRef.current = false
    toast.info(`Analyse en pause au candidat #${offset}. Cliquez "Reprendre" pour continuer.`)
  }

  const handleApprove = async (resultId: string) => {
    setApproving(resultId)
    try {
      const res = await fetch('/api/candidats/recheck-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result_id: resultId, action: 'approve' }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Candidat mis à jour')
        fetchStatus()
      } else {
        toast.error(data.error || 'Erreur')
      }
    } catch { toast.error('Erreur réseau') }
    setApproving(null)
  }

  const handleReject = async (resultId: string) => {
    setApproving(resultId)
    try {
      await fetch('/api/candidats/recheck-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result_id: resultId, action: 'reject' }),
      })
      toast.success('Ignoré')
      fetchStatus()
    } catch { toast.error('Erreur réseau') }
    setApproving(null)
  }

  const handleApproveAll = async () => {
    if (!confirm(`Approuver les ${status?.pending_count || 0} modifications en attente ? Les profils seront mis à jour (sauf nom, prénom, email, téléphone, localisation, date).`)) return
    setApprovingAll(true)
    try {
      const res = await fetch('/api/candidats/recheck-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_all' }),
      })
      const data = await res.json()
      toast.success(`${data.updated} candidats mis à jour`)
      fetchStatus()
    } catch { toast.error('Erreur') }
    setApprovingAll(false)
  }

  const pendingResults: RecheckResult[] = status?.pending || []
  const totalCvs = status?.total || 0
  const progressPct = totalCvs > 0 ? Math.min(100, Math.round((offset / totalCvs) * 100)) : 0

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <Link href="/outils" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: 20 }}>
        <ArrowLeft size={14} /> Retour aux outils
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>🔍 Analyse complète des CVs</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.6 }}>
        Re-analyse tous les CVs avec le moteur IA actuel. Les candidats avec des différences significatives (≥2 champs)
        apparaîtront ci-dessous pour que vous puissiez valider ou ignorer chaque modification.
      </p>
      <p style={{ fontSize: 13, color: '#D97706', fontWeight: 600, marginBottom: 24 }}>
        ⚠️ Gardez cette page ouverte pendant l'analyse. Si vous fermez, l'analyse se met en pause et reprend quand vous revenez.
      </p>

      {/* Progress bar globale */}
      {running && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
              Progression : {offset} / {totalCvs} CVs analysés ({progressPct}%)
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              ~{Math.round((totalCvs - offset) * 5 / 60)} min restantes
            </span>
          </div>
          <div style={{ height: 8, background: '#E5E7EB', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progressPct}%`,
              background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
              borderRadius: 100, transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total CVs', value: totalCvs, color: '#3B82F6', icon: '📄' },
          { label: 'En attente', value: status?.pending_count || 0, color: '#D97706', icon: '⏳' },
          { label: 'Approuvés', value: status?.approved_count || 0, color: '#10B981', icon: '✅' },
          { label: 'Ignorés', value: status?.rejected_count || 0, color: '#6B7280', icon: '⏭' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '16px 14px', borderRadius: 12, background: 'var(--bg-card)',
            border: '1px solid var(--border)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {!running && offset === 0 && (
          <button onClick={handleStart}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px',
              borderRadius: 10, border: 'none', background: 'var(--primary)',
              color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <Play size={16} /> Lancer l'analyse complète
          </button>
        )}

        {!running && offset > 0 && (
          <button onClick={handleResume}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px',
              borderRadius: 10, border: 'none', background: '#3B82F6',
              color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <Play size={16} /> Reprendre (à partir de #{offset})
          </button>
        )}

        {running && (
          <button onClick={handlePause}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px',
              borderRadius: 10, border: 'none', background: '#EF4444',
              color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <Square size={16} /> Mettre en pause
          </button>
        )}

        <button onClick={fetchStatus}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px',
            borderRadius: 10, border: '1px solid var(--border)', background: 'white',
            color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
          <RefreshCw size={14} /> Actualiser
        </button>

        {(status?.pending_count || 0) > 0 && (
          <button onClick={handleApproveAll} disabled={approvingAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px',
              borderRadius: 10, border: 'none', background: '#10B981',
              color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', opacity: approvingAll ? 0.5 : 1,
            }}>
            <CheckCircle size={14} />
            {approvingAll ? 'Application...' : `Tout approuver (${status.pending_count})`}
          </button>
        )}
      </div>

      {/* Résultats en attente */}
      {pendingResults.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48, background: 'var(--bg-card)',
          borderRadius: 16, border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>
            {status?.approved_count > 0 ? '✅' : running ? '⏳' : '📋'}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            {status?.approved_count > 0
              ? 'Toutes les modifications ont été traitées !'
              : running
              ? 'Analyse en cours... Les résultats apparaîtront ici.'
              : 'Aucun résultat pour l\'instant'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            {status?.approved_count > 0
              ? `${status.approved_count} candidats approuvés, ${status.rejected_count || 0} ignorés.`
              : running
              ? `${offset} CVs analysés sur ${totalCvs}...`
              : 'Lancez l\'analyse pour scanner tous les CVs.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#D97706' }}>
            ⚠️ {pendingResults.length} candidat{pendingResults.length > 1 ? 's' : ''} avec modifications détectées
          </h2>

          {pendingResults.map(result => {
            const isExpanded = expandedId === result.id
            const isProcessing = approving === result.id

            return (
              <div key={result.id} style={{
                background: 'var(--bg-card)', borderRadius: 12,
                border: '1px solid var(--border)', overflow: 'hidden',
              }}>
                {/* Header du résultat */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', cursor: 'pointer',
                }}
                  onClick={() => setExpandedId(isExpanded ? null : result.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, background: '#FEF3C7',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800, color: '#92400E',
                    }}>
                      {(result.candidat_prenom?.[0] || '').toUpperCase()}{(result.candidat_nom?.[0] || '').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {result.candidat_prenom} {result.candidat_nom}
                      </div>
                      <div style={{ fontSize: 12, color: '#D97706', fontWeight: 600 }}>
                        {result.diff_count} modification{result.diff_count > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={e => { e.stopPropagation(); handleApprove(result.id) }}
                      disabled={isProcessing}
                      style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none',
                        background: '#10B981', color: 'white', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit', opacity: isProcessing ? 0.5 : 1,
                      }}>
                      {isProcessing ? '...' : '✓ Appliquer'}
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleReject(result.id) }}
                      disabled={isProcessing}
                      style={{
                        padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
                        background: 'white', color: '#6B7280', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      Ignorer
                    </button>
                    {isExpanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
                  </div>
                </div>

                {/* Détails des diffs */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 12 }}>
                      <thead>
                        <tr style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const }}>
                          <th style={{ textAlign: 'left', padding: '6px 8px', width: '20%' }}>Champ</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', width: '40%' }}>Actuel</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', width: '40%' }}>Nouveau (IA)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.diffs.map((diff: DiffItem, i: number) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px', fontWeight: 600, color: '#D97706' }}>{diff.field}</td>
                            <td style={{ padding: '8px', color: '#DC2626', background: '#FEF2F2', borderRadius: 4 }}>
                              {Array.isArray(diff.old) ? diff.old.join(', ') : String(diff.old || '(vide)')}
                            </td>
                            <td style={{ padding: '8px', color: '#059669', background: '#F0FDF4', borderRadius: 4 }}>
                              {Array.isArray(diff.new_val) ? diff.new_val.join(', ') : String(diff.new_val || '(vide)')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <Link href={`/candidats/${result.candidat_id}`} target="_blank"
                        style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                        Voir la fiche →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
