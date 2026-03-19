'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Upload, FolderOpen, Play, Pause, RotateCcw, Download,
  CheckCircle, XCircle, Loader2, FileText, AlertTriangle,
  Zap, Clock, X, Tag, Copy,
} from 'lucide-react'
import { useImport, getCatColor, type FileJob } from '@/contexts/ImportContext'

/** Traverse récursive d'un FileSystemDirectoryEntry */
async function traverseEntry(
  entry: FileSystemEntry,
  pathPrefix = ''
): Promise<Array<{ file: File; relativePath: string }>> {
  if (entry.isFile) {
    return new Promise(resolve => {
      ;(entry as FileSystemFileEntry).file(f => {
        resolve([{ file: f, relativePath: pathPrefix + f.name }])
      })
    })
  }
  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry
    const reader = dir.createReader()
    const readAllEntries = (): Promise<FileSystemEntry[]> =>
      new Promise(resolve => {
        const all: FileSystemEntry[] = []
        const read = () => {
          reader.readEntries(batch => {
            if (batch.length === 0) resolve(all)
            else { all.push(...batch); read() }
          })
        }
        read()
      })
    const entries = await readAllEntries()
    const results = await Promise.all(entries.map(e => traverseEntry(e, pathPrefix + entry.name + '/')))
    return results.flat()
  }
  return []
}

function formatSize(b: number) {
  if (b < 1024) return `${b} o`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`
  return `${(b / 1024 / 1024).toFixed(1)} Mo`
}
function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
function formatETA(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min ${Math.round(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`
}

const ETAPES = [
  { value: 'nouveau',   label: 'Nouveau' },
  { value: 'contacte',  label: 'Contacté' },
  { value: 'entretien', label: 'Entretien' },
  { value: 'place',     label: 'Placé' },
  { value: 'refuse',    label: 'Refusé' },
] as const

const CAT_LABELS: Record<string, string> = {
  invitation_entretien: 'Entretien',
  relance: 'Relance',
  refus: 'Refus',
  offre: 'Offre',
  general: 'Général',
}

export default function ImportMassePage() {
  const ctx = useImport()
  const [dragOver, setDragOver]   = useState(false)
  const [errorFilter, setErrorFilter] = useState(false)
  const [doubFilter, setDoubFilter]   = useState(false)
  const [catFilter, setCatFilter]     = useState<string | null>(null)

  const inputRef  = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const [folderKey, setFolderKey] = useState(0)

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    const items = e.dataTransfer.items
    if (!items) {
      if (e.dataTransfer.files.length > 0) ctx.addFiles(e.dataTransfer.files)
      return
    }

    const allItems: Array<{ file: File; relativePath: string }> = []
    const promises: Promise<void>[] = []
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (!entry) continue
      promises.push(traverseEntry(entry).then(results => { allItems.push(...results) }))
    }
    await Promise.all(promises)
    if (allItems.length > 0) ctx.addFilesWithMeta(allItems)
  }, [ctx])

  const {
    jobs, statut, running, done, speed, eta,
    total, succeeded, failed, doublons, processing, pending, completed, progress, categories,
    setStatut, startProcessing, pause, resume, stop, reset, retryErrors, resolveDoublon, exportCSV,
  } = ctx

  const isPaused = !running && !done && completed > 0 && pending > 0

  const filteredJobs = (() => {
    let list = jobs
    if (errorFilter) list = list.filter(j => j.status === 'error')
    if (doubFilter)  list = list.filter(j => j.status === 'doublon')
    if (catFilter)   list = list.filter(j => j.categorie === catFilter)
    return list.slice(-100).reverse()
  })()

  return (
    <div style={{ padding: '32px 40px', maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--foreground)', letterSpacing: '-0.5px', margin: 0 }}>
              Import en masse
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
              Chargez des milliers de CVs depuis vos dossiers — traitement automatique par IA
            </p>
          </div>
          {jobs.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              {done && failed > 0 && (
                <button onClick={retryErrors} className="neo-btn-ghost" style={{ gap: 6, fontSize: 13 }}>
                  <RotateCcw size={13} /> Réessayer {failed} erreur{failed > 1 ? 's' : ''}
                </button>
              )}
              {(done || isPaused) && (
                <button onClick={exportCSV} className="neo-btn-ghost" style={{ gap: 6, fontSize: 13 }}>
                  <Download size={13} /> Exporter résultats
                </button>
              )}
              {!running && (
                <button onClick={reset} className="neo-btn-ghost" style={{ gap: 6, fontSize: 13, color: '#DC2626' }}>
                  <X size={13} /> Vider
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats cards */}
      {total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 24 }}>
          {[
            { label: 'Total',      value: total,      color: 'var(--foreground)', icon: <FileText size={14} /> },
            { label: 'En attente', value: pending,     color: '#6B7280',           icon: <Clock size={14} /> },
            { label: 'En cours',   value: processing,  color: '#3B82F6',           icon: <Loader2 size={14} style={{ animation: processing > 0 ? 'spin 1s linear infinite' : undefined }} /> },
            { label: 'Importés',   value: succeeded,   color: '#16A34A',           icon: <CheckCircle size={14} /> },
            { label: 'Doublons',   value: doublons,    color: '#F59E0B',           icon: <Copy size={14} /> },
            { label: 'Erreurs',    value: failed,      color: '#DC2626',           icon: <XCircle size={14} /> },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--card)', border: '1.5px solid var(--border)',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: s.color }}>
                {s.icon}
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Catégories détectées */}
      {categories.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Tag size={13} color="var(--muted)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Dossiers détectés :</span>
          </div>
          <button
            onClick={() => setCatFilter(null)}
            style={{
              padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700,
              border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit',
              borderColor: catFilter === null ? 'var(--foreground)' : 'var(--border)',
              background: catFilter === null ? 'var(--foreground)' : 'white',
              color: catFilter === null ? 'white' : 'var(--muted)',
            }}
          >Tous ({total})</button>
          {categories.map(cat => {
            const count = jobs.filter(j => j.categorie === cat).length
            const color = getCatColor(cat)
            return (
              <button
                key={cat}
                onClick={() => setCatFilter(catFilter === cat ? null : cat)}
                style={{
                  padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                  border: `1.5px solid ${color}`,
                  background: catFilter === cat ? color : `${color}18`,
                  color: catFilter === cat ? 'white' : color,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{cat} <span style={{ opacity: 0.8 }}>({count})</span></button>
            )
          })}
        </div>
      )}

      {/* Barre de progression */}
      {total > 0 && (
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: progress === 100 ? '#16A34A' : 'var(--foreground)' }}>
                {progress}%
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                  {completed} / {total} traités
                </div>
                {running && speed > 0 && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Zap size={11} color="#F7C948" /> {speed.toFixed(1)} CVs/min
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> ETA : {formatETA(eta)}
                    </span>
                  </div>
                )}
                {isPaused && <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700 }}>⏸ En pause</span>}
                {done    && <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>✓ Import terminé</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {!running && !done && pending > 0 && (
                <button onClick={isPaused ? resume : startProcessing} className="neo-btn" style={{ gap: 6 }}>
                  <Play size={14} />
                  {isPaused ? 'Reprendre' : `Lancer l'import (${pending})`}
                </button>
              )}
              {running && (
                <button onClick={pause} className="neo-btn-ghost" style={{ gap: 6 }}>
                  <Pause size={14} /> Pause
                </button>
              )}
              {running && (
                <button onClick={stop} className="neo-btn-ghost" style={{ gap: 6, color: '#DC2626' }}>
                  <X size={14} /> Arrêter
                </button>
              )}
            </div>
          </div>

          <div style={{ height: 10, background: 'var(--border)', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: done && failed === 0
                ? 'linear-gradient(90deg, #16A34A, #22C55E)'
                : 'linear-gradient(90deg, var(--primary), #F97316)',
              borderRadius: 100, transition: 'width 0.5s ease',
            }} />
          </div>
          {failed > 0 && (
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 100, overflow: 'hidden', marginTop: 4 }}>
              <div style={{ height: '100%', width: `${Math.round(failed / total * 100)}%`, background: '#DC2626', borderRadius: 100 }} />
            </div>
          )}
        </div>
      )}

      {/* Zone de drop */}
      {!running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 16, padding: '48px 24px', textAlign: 'center',
              background: dragOver ? '#FFFBEB' : 'var(--card)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png"
              style={{ display: 'none' }} onChange={e => e.target.files && ctx.addFiles(e.target.files)} />
            <input key={folderKey} ref={folderRef} type="file"
              // @ts-ignore
              webkitdirectory="" multiple
              style={{ display: 'none' }}
              onChange={e => {
                if (e.target.files) ctx.addFiles(e.target.files)
                setFolderKey(k => k + 1)
              }} />

            <Upload size={36} style={{ color: dragOver ? 'var(--primary)' : 'var(--border)', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--foreground)', marginBottom: 6 }}>
              Glissez vos fichiers ici
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              Ou chargez vos documents et dossiers · PDF, Word, JPG, PNG · Pas de limite de nombre
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => inputRef.current?.click()} className="neo-btn" style={{ gap: 6 }}>
                <FileText size={15} /> Sélectionner des fichiers
              </button>
              <button onClick={() => folderRef.current?.click()} className="neo-btn-ghost" style={{ gap: 6 }}>
                <FolderOpen size={15} /> Ajouter un dossier
              </button>
            </div>
          </div>

          {total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Statut pipeline :</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ETAPES.map(e => (
                  <button key={e.value} onClick={() => setStatut(e.value)} style={{
                    padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700,
                    border: '1.5px solid',
                    borderColor: statut === e.value ? 'var(--foreground)' : 'var(--border)',
                    background: statut === e.value ? 'var(--foreground)' : 'white',
                    color: statut === e.value ? 'white' : 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}>{e.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warning gros volumes */}
      {total > 500 && !running && !done && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#FEF9EC', border: '1.5px solid #FDE68A', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
              Import de {total.toLocaleString('fr-FR')} fichiers — estimation : {formatETA(total / 3 * 12)}
            </div>
            <div style={{ fontSize: 12, color: '#78350F' }}>
              Chaque CV est analysé par IA (5-15s). Gardez cet onglet ouvert ou mettez sur pause et reprenez plus tard.
              Les candidats déjà créés ne seront pas dupliqués si vous relancez.
            </div>
          </div>
        </div>
      )}

      {/* Liste des jobs */}
      {jobs.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
              {errorFilter
                ? `${failed} erreur${failed > 1 ? 's' : ''}`
                : catFilter
                  ? `${jobs.filter(j => j.categorie === catFilter).length} fichiers — ${catFilter}`
                  : `Derniers 100 affichés sur ${total}`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {failed > 0 && (
                <button
                  onClick={() => setErrorFilter(v => !v)}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                    border: '1.5px solid', borderColor: errorFilter ? '#DC2626' : 'var(--border)',
                    background: errorFilter ? '#FEE2E2' : 'white', color: errorFilter ? '#DC2626' : 'var(--muted)',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <XCircle size={11} />
                  {errorFilter ? 'Voir tout' : `Voir erreurs (${failed})`}
                </button>
              )}
              {doublons > 0 && (
                <button
                  onClick={() => { setDoubFilter(v => !v); setErrorFilter(false) }}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                    border: '1.5px solid', borderColor: doubFilter ? '#F59E0B' : 'var(--border)',
                    background: doubFilter ? '#FEF9EC' : 'white', color: doubFilter ? '#D97706' : 'var(--muted)',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <Copy size={11} />
                  {doubFilter ? 'Voir tout' : `Doublons à traiter (${doublons})`}
                </button>
              )}
            </div>
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredJobs.map((job: FileJob) => {
              const catColor = job.categorie ? getCatColor(job.categorie) : undefined
              return (
                <div key={job.id} style={{
                  borderBottom: '1px solid var(--border)',
                  background: job.status === 'success'    ? '#F0FDF4'
                    : job.status === 'error'      ? '#FEF2F2'
                    : job.status === 'doublon'    ? '#FFFBEB'
                    : job.status === 'processing' ? '#FFFBEB'
                    : 'transparent',
                }}>
                  {/* Ligne principale */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px' }}>
                    <div style={{ flexShrink: 0 }}>
                      {job.status === 'pending'    && <FileText size={14} color="var(--muted)" />}
                      {job.status === 'processing' && <Loader2 size={14} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />}
                      {job.status === 'success'    && <CheckCircle size={14} color="#16A34A" />}
                      {job.status === 'error'      && <XCircle size={14} color="#DC2626" />}
                      {job.status === 'doublon'    && <Copy size={14} color="#F59E0B" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.file.name}
                      </div>
                      <div style={{ fontSize: 11, color: job.status === 'success' ? '#16A34A' : job.status === 'error' ? '#DC2626' : job.status === 'doublon' ? '#D97706' : 'var(--muted)' }}>
                        {job.status === 'success'    && job.candidatNom}
                        {job.status === 'error'      && job.error}
                        {job.status === 'pending'    && formatSize(job.file.size)}
                        {job.status === 'processing' && (job.error || 'Analyse IA en cours...')}
                        {job.status === 'doublon'    && `Doublon — existe déjà : ${job.candidatExistant?.prenom} ${job.candidatExistant?.nom}`}
                      </div>
                    </div>
                    {job.categorie && (
                      <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 700, background: `${catColor}18`, color: catColor, border: `1px solid ${catColor}40` }}>
                        {job.categorie}
                      </span>
                    )}
                    {job.duration && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                        {formatDuration(job.duration)}
                      </span>
                    )}
                  </div>

                  {/* Panneau résolution doublon */}
                  {job.status === 'doublon' && job.candidatExistant && (
                    <div style={{ margin: '0 20px 12px', background: 'white', border: '1.5px solid #FDE68A', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                        <div style={{ flex: 1, fontSize: 11 }}>
                          <div style={{ fontWeight: 700, color: '#92400E', marginBottom: 3 }}>Existant dans la base</div>
                          <div style={{ color: 'var(--foreground)', fontWeight: 600 }}>{job.candidatExistant.prenom} {job.candidatExistant.nom}</div>
                          {job.candidatExistant.email && <div style={{ color: 'var(--muted)' }}>{job.candidatExistant.email}</div>}
                          {job.candidatExistant.titre_poste && <div style={{ color: 'var(--muted)' }}>{job.candidatExistant.titre_poste}</div>}
                          <div style={{ color: 'var(--muted)', marginTop: 2 }}>Ajouté le {new Date(job.candidatExistant.created_at).toLocaleDateString('fr-FR')}</div>
                        </div>
                        <div style={{ flex: 1, fontSize: 11 }}>
                          <div style={{ fontWeight: 700, color: '#1D4ED8', marginBottom: 3 }}>Nouveau fichier</div>
                          <div style={{ color: 'var(--foreground)', fontWeight: 600 }}>{job.analyseNouv?.prenom} {job.analyseNouv?.nom}</div>
                          {job.analyseNouv?.email && <div style={{ color: 'var(--muted)' }}>{job.analyseNouv.email}</div>}
                          {job.analyseNouv?.titre_poste && <div style={{ color: 'var(--muted)' }}>{job.analyseNouv.titre_poste}</div>}
                          <div style={{ color: 'var(--muted)', marginTop: 2 }}>{job.file.name}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => resolveDoublon(job, 'ignorer')} style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 700, border: '1.5px solid #E5E7EB', background: 'white', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Garder l&apos;existant
                        </button>
                        <button onClick={() => resolveDoublon(job, 'remplacer')} style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 700, border: '1.5px solid #3B82F6', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Remplacer par le nouveau
                        </button>
                        <button onClick={() => resolveDoublon(job, 'garder_les_deux')} style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 700, border: '1.5px solid #8B5CF6', background: '#F5F3FF', color: '#7C3AED', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Garder les deux
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
