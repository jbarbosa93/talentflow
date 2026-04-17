'use client'
// components/TestFolderRunner.tsx
// Banc de test DRY-RUN pour le matching OneDrive.
// - Liste les 30 derniers fichiers vus par la sync
// - Bouton "Tester matching" → POST /api/onedrive/sync-test (zéro écriture DB/Storage)
// - Affiche inline la décision simulée + nom/prénom extraits + candidat matché
//
// Purement additif — n'interagit avec aucun code existant.

import { useEffect, useState } from 'react'
import { FlaskConical, Loader2, CheckCircle2, AlertTriangle, XCircle, HelpCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react'

type OneDriveFile = {
  id: string
  onedrive_item_id: string
  nom_fichier: string
  statut_action: string | null
  traite_le: string | null
  candidat_id: string | null
  erreur: string | null
}

type DryRunResult = {
  dry_run: true
  filename: string
  decision: 'create' | 'update' | 'skip_doublon' | 'ambiguous' | 'insufficient' | 'reject' | 'reject_diplome'
  cv_score?: number
  is_diplome?: boolean
  analyse_source?: string
  extracted?: {
    nom: string | null; prenom: string | null; email: string | null; telephone: string | null
    date_naissance?: string | null; titre_poste?: string | null; annees_exp?: number | null
    competences_count?: number; experiences_count?: number
  }
  match?: any
  duration_ms: number
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
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, DryRunResult>>({})

  const loadFiles = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/onedrive/sync-test', { cache: 'no-store' })
      if (!res.ok) { setLoading(false); return }
      const j = await res.json()
      setDriveId(j.drive_id)
      setFolderName(j.folder_name)
      setFiles(j.files || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (expanded && files.length === 0) loadFiles() }, [expanded])

  const runTest = async (f: OneDriveFile) => {
    if (!driveId) return
    setTesting(f.id)
    try {
      const res = await fetch('/api/onedrive/sync-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drive_id: driveId, item_id: f.onedrive_item_id, filename: f.nom_fichier }),
      })
      const j = await res.json()
      setResults(prev => ({ ...prev, [f.id]: j }))
    } catch (e: any) {
      setResults(prev => ({ ...prev, [f.id]: { dry_run: true, filename: f.nom_fichier, decision: 'reject', error: e.message, duration_ms: 0 } as any }))
    } finally {
      setTesting(null)
    }
  }

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
          {folderName && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
              Dossier surveillé : <strong>{folderName}</strong> — 30 derniers fichiers vus par la sync
            </div>
          )}
          {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}><Loader2 size={16} className="animate-spin" /></div>}
          {!loading && files.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Aucun fichier enregistré.</div>}
          {!loading && files.length > 0 && (
            <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {files.map((f, i) => {
                const r = results[f.id]
                const meta = r ? DECISION_META[r.decision] : null
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
                        disabled={testing === f.id || !driveId}
                        style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 700,
                          background: testing === f.id ? 'var(--border)' : '#8B5CF6',
                          color: '#fff', border: 'none', borderRadius: 6,
                          cursor: testing === f.id ? 'wait' : 'pointer',
                          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        {testing === f.id ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                        Tester
                      </button>
                    </div>

                    {r && meta && (
                      <div style={{ marginTop: 8, padding: 10, background: `${meta.color}14`, border: `1px solid ${meta.color}55`, borderRadius: 6, fontSize: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: meta.color, marginBottom: 6 }}>
                          <meta.Icon size={13} />
                          {meta.label}
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>{r.duration_ms} ms</span>
                        </div>
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
                            <strong>Match :</strong> <a href={`/candidats/${r.match.candidat_id}?from=integrations`} style={{ color: meta.color }}>{r.match.candidat_nom}</a> ({r.match.reason})
                            {r.match.diffs?.length > 0 && <span style={{ color: '#F5A623' }}> — diffs : {r.match.diffs.map((d: any) => d.field).join(', ')}</span>}
                          </div>
                        )}
                        {r.match?.kind === 'ambiguous' && (
                          <div style={{ marginTop: 4 }}>
                            <strong>Homonymes :</strong> {r.match.candidates.map((c: any) => `${c.prenom} ${c.nom}`).join(' · ')}
                          </div>
                        )}
                        {r.error && <div style={{ color: '#EF4444' }}>⚠ {r.error}</div>}
                        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>✓ Aucune écriture DB/Storage</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <button
            onClick={loadFiles}
            disabled={loading}
            style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Rafraîchir la liste
          </button>
        </div>
      )}
    </div>
  )
}
