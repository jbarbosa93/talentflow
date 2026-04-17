'use client'
// components/TestFolderRunner.tsx
// Banc de test DRY-RUN pour le matching OneDrive (v1.9.18).
// - Toggle "Fichiers scannés (DB)" / "Dossier OneDrive en live (Graph)"
// - Bouton "Tester" → POST /api/onedrive/sync-test (zéro écriture DB/Storage)
// - Affiche erreurs HTTP + banner si driveId/folderId manquants

import { useEffect, useState } from 'react'
import { FlaskConical, Loader2, CheckCircle2, AlertTriangle, XCircle, HelpCircle, FileText, ChevronDown, ChevronUp, RefreshCw, Database, Cloud } from 'lucide-react'

type OneDriveFile = {
  id: string
  onedrive_item_id: string
  nom_fichier: string
  statut_action: string | null
  traite_le: string | null
  candidat_id: string | null
  erreur: string | null
  _supported?: boolean
}

type ListResponse = {
  drive_id: string | null
  folder_name: string | null
  files: OneDriveFile[]
  mode?: 'db' | 'live'
  error?: string
}

type DryRunResult = {
  dry_run?: true
  filename?: string
  decision?: 'create' | 'update' | 'skip_doublon' | 'ambiguous' | 'insufficient' | 'reject' | 'reject_diplome'
  cv_score?: number
  is_diplome?: boolean
  analyse_source?: string
  extracted?: {
    nom: string | null; prenom: string | null; email: string | null; telephone: string | null
    date_naissance?: string | null; titre_poste?: string | null; annees_exp?: number | null
    competences_count?: number; experiences_count?: number
  }
  match?: any
  duration_ms?: number
  error?: string
  side_effects?: 'none'
}

const DECISION_META: Record<string, { color: string; label: string; Icon: any }> = {
  create:         { color: '#10B981', label: 'Créerait un nouveau candidat',      Icon: CheckCircle2 },
  update:         { color: '#3B82F6', label: 'Mettrait à jour un candidat',       Icon: CheckCircle2 },
  ambiguous:      { color: '#F5A623', label: 'Homonymes non résolus',             Icon: AlertTriangle },
  insufficient:   { color: '#6B7280', label: 'Identité insuffisante',             Icon: HelpCircle },
  skip_doublon:   { color: '#6B7280', label: 'Skip (doublon total)',              Icon: HelpCircle },
  reject:         { color: '#EF4444', label: 'Rejeté (illisible)',                Icon: XCircle },
  reject_diplome: { color: '#EF4444', label: 'Rejeté (diplôme, pas un CV)',       Icon: XCircle },
}

export default function TestFolderRunner() {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<OneDriveFile[]>([])
  const [driveId, setDriveId] = useState<string | null>(null)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [mode, setMode] = useState<'db' | 'live'>('db')
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, DryRunResult>>({})

  const loadFiles = async (m: 'db' | 'live' = mode) => {
    setLoading(true)
    setListError(null)
    try {
      const res = await fetch(`/api/onedrive/sync-test?mode=${m}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setListError(j.error || `HTTP ${res.status}`)
        setFiles([])
        return
      }
      const j = (await res.json()) as ListResponse
      setDriveId(j.drive_id)
      setFolderName(j.folder_name)
      setFiles(j.files || [])
      if (j.error) setListError(j.error)
    } catch (e: any) {
      setListError(e?.message || 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (expanded && files.length === 0 && !listError) loadFiles() }, [expanded])

  const switchMode = (m: 'db' | 'live') => {
    if (m === mode) return
    setMode(m)
    setResults({})
    loadFiles(m)
  }

  const runTest = async (f: OneDriveFile) => {
    if (!driveId) {
      setResults(prev => ({ ...prev, [f.id]: { error: 'sharepoint_drive_id manquant — intégration OneDrive incomplète' } }))
      return
    }
    if (f._supported === false) {
      setResults(prev => ({ ...prev, [f.id]: { error: `Extension non supportée pour "${f.nom_fichier}"` } }))
      return
    }
    setTesting(f.id)
    try {
      const res = await fetch('/api/onedrive/sync-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drive_id: driveId, item_id: f.onedrive_item_id, filename: f.nom_fichier }),
      })
      const j = await res.json().catch(() => ({ error: `Réponse non JSON (HTTP ${res.status})` }))
      if (!res.ok) {
        setResults(prev => ({ ...prev, [f.id]: { error: j.error || `HTTP ${res.status}`, duration_ms: j.duration_ms } }))
        return
      }
      setResults(prev => ({ ...prev, [f.id]: j }))
    } catch (e: any) {
      console.error('[TestFolderRunner] runTest error:', e)
      setResults(prev => ({ ...prev, [f.id]: { error: e?.message || 'Erreur fetch', duration_ms: 0 } }))
    } finally {
      setTesting(null)
    }
  }

  const integrationIncomplete = !driveId

  return (
    <div style={{
      background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14,
      padding: '16px 20px', marginBottom: 20,
    }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FlaskConical size={18} color="#8B5CF6" />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)' }}>Banc de test DRY-RUN</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Simule un import sans rien écrire en DB — vérifie le matching avant la sync réelle</div>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
      </button>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          {integrationIncomplete && !loading && (
            <div style={{
              padding: '10px 12px', marginBottom: 10,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, fontSize: 12, color: '#EF4444',
            }}>
              ⚠ Intégration OneDrive incomplète — <code>sharepoint_drive_id</code> manquant dans <code>integrations.metadata</code>. Le banc de test est désactivé.
            </div>
          )}

          {folderName && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
              Dossier surveillé : <strong>{folderName}</strong>
            </div>
          )}

          {/* Toggle DB / Live */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button
              onClick={() => switchMode('db')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', fontSize: 11, fontWeight: 700,
                background: mode === 'db' ? '#8B5CF6' : 'transparent',
                color: mode === 'db' ? '#fff' : 'var(--muted)',
                border: `1px solid ${mode === 'db' ? '#8B5CF6' : 'var(--border)'}`,
                borderRadius: 6, cursor: 'pointer',
              }}
            >
              <Database size={12} /> Fichiers scannés (DB)
            </button>
            <button
              onClick={() => switchMode('live')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', fontSize: 11, fontWeight: 700,
                background: mode === 'live' ? '#8B5CF6' : 'transparent',
                color: mode === 'live' ? '#fff' : 'var(--muted)',
                border: `1px solid ${mode === 'live' ? '#8B5CF6' : 'var(--border)'}`,
                borderRadius: 6, cursor: 'pointer',
              }}
              title="Listing direct OneDrive Graph API — inclut les nouveaux fichiers pas encore synchronisés"
            >
              <Cloud size={12} /> Dossier OneDrive en live (Graph)
            </button>
            <button
              onClick={() => loadFiles()}
              disabled={loading}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', fontSize: 11, fontWeight: 600,
                background: 'transparent', color: 'var(--muted)',
                border: '1px solid var(--border)', borderRadius: 6,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Rafraîchir
            </button>
          </div>

          {listError && (
            <div style={{
              padding: '8px 12px', marginBottom: 10,
              background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)',
              borderRadius: 8, fontSize: 11, color: '#B45309',
            }}>
              ⚠ {listError}
            </div>
          )}

          {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}><Loader2 size={16} className="animate-spin" /></div>}
          {!loading && files.length === 0 && !listError && <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Aucun fichier.</div>}
          {!loading && files.length > 0 && (
            <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {files.map((f, i) => {
                const r = results[f.id]
                const meta = r?.decision ? DECISION_META[r.decision] : null
                const canTest = !integrationIncomplete && f._supported !== false
                return (
                  <div key={f.id} style={{ borderBottom: i < files.length - 1 ? '1px solid var(--border)' : 'none', padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileText size={14} color="var(--muted)" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nom_fichier}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {f.statut_action || '—'}
                          {f.traite_le && ` · ${new Date(f.traite_le).toLocaleString('fr-CH')}`}
                          {f.candidat_id && ' · déjà rattaché'}
                        </div>
                      </div>
                      <button
                        onClick={() => runTest(f)}
                        disabled={testing === f.id || !canTest}
                        title={!canTest ? (integrationIncomplete ? 'Intégration incomplète' : `Extension non supportée`) : 'Lancer le dry-run'}
                        style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 700,
                          background: testing === f.id ? 'var(--border)' : (canTest ? '#8B5CF6' : '#aaa'),
                          color: '#fff', border: 'none', borderRadius: 6,
                          cursor: testing === f.id ? 'wait' : (canTest ? 'pointer' : 'not-allowed'),
                          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                          opacity: canTest ? 1 : 0.6,
                        }}
                      >
                        {testing === f.id ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                        Tester
                      </button>
                    </div>

                    {r && (
                      <div style={{
                        marginTop: 8, padding: 10,
                        background: meta ? `${meta.color}14` : 'rgba(239,68,68,0.08)',
                        border: `1px solid ${meta ? `${meta.color}55` : 'rgba(239,68,68,0.3)'}`,
                        borderRadius: 6, fontSize: 11,
                      }}>
                        {meta ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: meta.color, marginBottom: 6 }}>
                            <meta.Icon size={13} />
                            {meta.label}
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>{r.duration_ms ?? 0} ms</span>
                          </div>
                        ) : r.error ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>
                            <XCircle size={13} /> Erreur
                          </div>
                        ) : null}
                        {r.extracted && (
                          <div style={{ color: 'var(--foreground)', lineHeight: 1.5 }}>
                            <strong>Extrait IA :</strong> {r.extracted.prenom || '—'} {r.extracted.nom || '—'}
                            {r.extracted.email && <> · {r.extracted.email}</>}
                            {r.extracted.telephone && <> · {r.extracted.telephone}</>}
                            {r.extracted.titre_poste && <> · {r.extracted.titre_poste}</>}
                            {r.cv_score !== undefined && <> · score CV {r.cv_score}/4</>}
                          </div>
                        )}
                        {r.match?.kind === 'match' && (
                          <div style={{ marginTop: 4 }}>
                            <strong>Match :</strong> <a href={`/candidats/${r.match.candidat_id}?from=integrations`} target="_blank" rel="noopener" style={{ color: meta?.color || '#3B82F6' }}>{r.match.candidat_nom}</a> ({r.match.reason})
                            {r.match.diffs?.length > 0 && <span style={{ color: '#F5A623' }}> — diffs : {r.match.diffs.map((d: any) => d.field).join(', ')}</span>}
                          </div>
                        )}
                        {r.match?.kind === 'ambiguous' && (
                          <div style={{ marginTop: 4 }}>
                            <strong>Homonymes :</strong> {r.match.candidates.map((c: any) => `${c.prenom} ${c.nom}`).join(' · ')}
                          </div>
                        )}
                        {r.error && <div style={{ color: '#EF4444', marginTop: 4 }}>⚠ {r.error}</div>}
                        {!r.error && <div style={{ marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>✓ Aucune écriture DB/Storage</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
