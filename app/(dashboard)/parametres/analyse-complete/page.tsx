'use client'
import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Play, Pause, CheckCircle, XCircle, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Check, X, Loader2 } from 'lucide-react'
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

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/candidats/recheck-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      })
      const data = await res.json()
      setStatus(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  // Poll toutes les 10s si running
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, running ? 10000 : 30000)
    return () => clearInterval(interval)
  }, [fetchStatus, running])

  const handleStart = async () => {
    if (!confirm('Lancer l\'analyse complète de tous les CVs ? Cela peut prendre plusieurs heures et consommer des crédits API Claude.')) return
    setRunning(true)
    try {
      const res = await fetch('/api/candidats/recheck-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', offset: 0 }),
      })
      const data = await res.json()
      toast.success(`Analyse lancée ! ${data.processed || 0} candidats traités pour commencer.`)
      fetchStatus()
    } catch (err: any) {
      toast.error(err.message)
      setRunning(false)
    }
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
    if (!confirm(`Approuver les ${status?.pending_count || 0} modifications en attente ? Les profils seront mis à jour.`)) return
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
      <Link href="/parametres/outils" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: 20 }}>
        <ArrowLeft size={14} /> Retour aux outils
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>🔍 Analyse complète des CVs</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
        Re-analyse tous les CVs avec le moteur IA actuel. Les candidats avec des différences significatives (≥2 champs)
        apparaîtront ci-dessous pour que vous puissiez valider ou ignorer chaque modification.
        <br /><strong>Fonctionne en arrière-plan</strong> — vous pouvez fermer cette page et revenir plus tard.
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total CVs', value: status?.total || 0, color: '#3B82F6', icon: '📄' },
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
        <button onClick={handleStart} disabled={running}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px',
            borderRadius: 10, border: 'none', background: running ? '#9CA3AF' : 'var(--primary)',
            color: 'white', fontSize: 14, fontWeight: 700, cursor: running ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}>
          {running ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={16} />}
          {running ? 'Analyse en cours...' : 'Lancer l\'analyse complète'}
        </button>

        <button onClick={fetchStatus}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px',
            borderRadius: 10, border: '1px solid var(--border)', background: 'white',
            color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
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
            {status?.approved_count > 0 ? '✅' : '📋'}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            {status?.approved_count > 0
              ? 'Toutes les modifications ont été traitées !'
              : 'Aucun résultat pour l\'instant'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            {status?.approved_count > 0
              ? `${status.approved_count} candidats approuvés, ${status.rejected_count || 0} ignorés.`
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
                    {/* Boutons rapides */}
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
