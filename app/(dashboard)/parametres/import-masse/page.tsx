'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Upload, FolderOpen, Play, Pause, RotateCcw, Download,
  CheckCircle, XCircle, Loader2, FileText, AlertTriangle,
  Zap, Clock, X, Copy, HardDriveDownload, ChevronDown,
} from 'lucide-react'
import { useImport, type FileJob } from '@/contexts/ImportContext'
import { CalendarClock } from 'lucide-react'

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
    jobs, statut, running, done, speed, eta, creditExhausted,
    total, succeeded, failed, doublons, processing, pending, completed, progress, categories,
    setStatut, useFilenameDate, setUseFilenameDate, startProcessing, pause, resume, stop, reset, retryErrors, resolveDoublon, exportCSV,
  } = ctx

  const isPaused = !running && !done && completed > 0 && pending > 0

  const filteredJobs = jobs.slice(-100).reverse()

  return (
    <div style={{ padding: '32px 40px', maxWidth: 960, margin: '0 auto' }}>

      {/* Bouton retour */}
      <Link href="/outils" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600, marginBottom: 20 }}>
        ← Outils
      </Link>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--foreground)', letterSpacing: '-0.5px', margin: 0 }}>
              Import en masse
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
              Importez et traitez des centaines de CVs en lot — traitement automatique par IA
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
                <button onClick={reset} className="neo-btn-ghost" style={{ gap: 6, fontSize: 13, color: 'var(--destructive)' }}>
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
            { label: 'En attente', value: pending,     color: 'var(--muted-foreground)',           icon: <Clock size={14} /> },
            { label: 'En cours',   value: processing,  color: 'var(--info)',           icon: <Loader2 size={14} style={{ animation: processing > 0 ? 'spin 1s linear infinite' : undefined }} /> },
            { label: 'Importés',   value: succeeded,   color: 'var(--success)',           icon: <CheckCircle size={14} /> },
            { label: 'Doublons',   value: doublons,    color: 'var(--warning)',           icon: <Copy size={14} /> },
            { label: 'Erreurs',    value: failed,      color: 'var(--destructive)',           icon: <XCircle size={14} /> },
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


      {/* Bannière crédit épuisé */}
      {creditExhausted && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: 'var(--destructive-soft)', border: '2px solid var(--destructive-soft)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
          <XCircle size={22} color="var(--destructive)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--destructive)', marginBottom: 3 }}>
              ⚠️ Crédit Anthropic épuisé — import mis en pause automatiquement
            </div>
            <div style={{ fontSize: 12, color: 'var(--destructive)' }}>
              Rechargez votre solde sur <strong>platform.anthropic.com/settings/billing</strong>, puis cliquez sur Reprendre.
            </div>
          </div>
          <a
            href="https://console.anthropic.com/settings/billing"
            target="_blank"
            rel="noopener noreferrer"
            style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 8, background: '#DC2626', color: 'white', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
          >
            Recharger →
          </a>
          <button onClick={resume} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 8, background: '#16A34A', color: 'white', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            ▶ Reprendre
          </button>
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
                {isPaused && <span style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 700 }}>⏸ En pause</span>}
                {done    && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>✓ Import terminé</span>}
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
                <button onClick={stop} className="neo-btn-ghost" style={{ gap: 6, color: 'var(--destructive)' }}>
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

      {/* Rapport de fin d'import */}
      {done && (failed > 0 || doublons > 0) && (
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={18} color={failed > 0 ? '#DC2626' : '#F59E0B'} />
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>
                Rapport d&apos;import
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {succeeded} importé{succeeded > 1 ? 's' : ''} · {doublons} doublon{doublons > 1 ? 's' : ''} · {failed} erreur{failed > 1 ? 's' : ''}
            </div>
          </div>

          {failed > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--destructive)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <XCircle size={13} />
                {failed} fichier{failed > 1 ? 's' : ''} non importé{failed > 1 ? 's' : ''}
              </div>
              <div style={{ background: 'var(--destructive-soft)', border: '1px solid var(--destructive-soft)', borderRadius: 10, overflow: 'hidden', marginBottom: doublons > 0 ? 16 : 0 }}>
                {jobs.filter(j => j.status === 'error').map(job => (
                  <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--destructive-soft)' }}>
                    <XCircle size={12} color="var(--destructive)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>{job.file.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 6 }}>({formatSize(job.file.size)})</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--destructive)', fontWeight: 600, flexShrink: 0, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.error || 'Erreur inconnue'}
                    </span>
                    {job.duration && (
                      <span style={{ fontSize: 10, color: 'var(--muted-foreground)', flexShrink: 0 }}>{formatDuration(job.duration)}</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {doublons > 0 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Copy size={13} />
              {doublons} doublon{doublons > 1 ? 's' : ''} à traiter — utilisez le filtre ci-dessous
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
              <button onClick={() => inputRef.current?.click()} className="neo-btn-yellow" style={{ gap: 6 }}>
                <FileText size={15} /> Sélectionner des fichiers
              </button>
              <button onClick={() => folderRef.current?.click()} className="neo-btn-yellow" style={{ gap: 6 }}>
                <FolderOpen size={15} /> Ajouter un dossier
                {categories.length > 0 && (
                  <span style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 100, fontSize: 10, fontWeight: 800, padding: '1px 6px', marginLeft: 2 }}>
                    {categories.length} ajouté{categories.length > 1 ? 's' : ''}
                  </span>
                )}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              💡 Cliquez plusieurs fois sur <strong>Ajouter un dossier</strong> pour sélectionner plusieurs dossiers — ils s&apos;accumulent. Vous pouvez aussi glisser plusieurs dossiers d&apos;un coup depuis votre Finder.
            </p>
          </div>

          {/* Option : date depuis nom de fichier */}
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', borderRadius: 12,
              background: useFilenameDate ? 'rgba(245,158,11,0.08)' : 'var(--card)',
              border: `1.5px solid ${useFilenameDate ? '#F59E0B' : 'var(--border)'}`,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <input
              type="checkbox"
              checked={useFilenameDate}
              onChange={e => setUseFilenameDate(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#F59E0B', cursor: 'pointer' }}
            />
            <CalendarClock size={16} style={{ color: useFilenameDate ? '#D97706' : 'var(--muted)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: useFilenameDate ? '#92400E' : 'var(--foreground)' }}>
                Utiliser la date du nom de fichier
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                Si le nom du fichier contient une date (ex: NOM prenom 15.03.2022.pdf), elle sera utilisée comme date d&apos;ajout. Sinon, la date d&apos;import est conservée.
              </div>
            </div>
          </label>
        </div>
      )}

      {/* Warning gros volumes */}
      {total > 500 && !running && !done && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--warning-soft)', border: '1.5px solid #FDE68A', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)', marginBottom: 4 }}>
              Import de {total.toLocaleString('fr-FR')} fichiers — estimation : {formatETA(total / 3 * 12)}
            </div>
            <div style={{ fontSize: 12, color: '#78350F' }}>
              Chaque CV est analysé par IA (5-15s). Gardez cet onglet ouvert ou mettez sur pause et reprenez plus tard.
              Les candidats déjà créés ne seront pas dupliqués si vous relancez.
            </div>
          </div>
        </div>
      )}

      {/* Log d'activité */}
      {jobs.length > 0 && (
        <ImportLog
          jobs={jobs}
          resolveDoublon={resolveDoublon}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

// ─── Composant Log d'activité ──────────────────────────────────────────────────

function ImportLog({ jobs, resolveDoublon }: {
  jobs: FileJob[]
  resolveDoublon: (job: FileJob, action: 'ignorer' | 'remplacer' | 'garder_les_deux') => void
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const pendingDoublons = jobs.filter(j => j.status === 'doublon' && j.candidatExistant)

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Grouper par sessionId (tous les fichiers d'un même import = même session)
  const groups: { label: string; key: string; jobs: FileJob[] }[] = []
  const groupMap = new Map<string, FileJob[]>()
  for (const job of jobs) {
    const key = job.sessionId || (job.addedAt
      ? `${new Date(job.addedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${new Date(job.addedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Import')
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(job)
  }
  groupMap.forEach((gJobs, key) => {
    const firstJob = gJobs[0]
    const d = firstJob?.addedAt ? new Date(firstJob.addedAt) : null
    const label = d
      ? `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Import'
    groups.push({ label, key, jobs: gJobs })
  })
  groups.reverse()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>Log d&apos;activité</div>
        {pendingDoublons.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700 }}>
              {pendingDoublons.length} doublon{pendingDoublons.length > 1 ? 's' : ''} en attente —
            </span>
            <button
              onClick={() => pendingDoublons.forEach(job => resolveDoublon(job, 'ignorer'))}
              style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1.5px solid #E5E7EB', background: 'white', color: 'var(--muted-foreground)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Tout ignorer
            </button>
            <button
              onClick={() => pendingDoublons.forEach(job => resolveDoublon(job, 'remplacer'))}
              style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1.5px solid #3B82F6', background: 'var(--info-soft)', color: 'var(--info)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Tout remplacer
            </button>
          </div>
        )}
      </div>
      {groups.map(group => {
        const gSucceeded = group.jobs.filter(j => j.status === 'success').length
        const gFailed = group.jobs.filter(j => j.status === 'error').length
        const gDoublons = group.jobs.filter(j => j.status === 'doublon' || j.status === 'skipped').length
        const gPending = group.jobs.filter(j => j.status === 'pending' || j.status === 'processing').length
        const isOpen = openGroups.has(group.key)

        return (
          <div key={group.key} style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* En-tête cliquable */}
            <button
              onClick={() => toggleGroup(group.key)}
              style={{
                width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit',
              }}
            >
              <Clock size={14} color="var(--muted)" />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                  Import du {group.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {group.jobs.length} fichier{group.jobs.length > 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {gSucceeded > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, background: 'var(--success-soft)', color: 'var(--success)', border: '1px solid var(--success-soft)' }}>
                    ✓ {gSucceeded} importé{gSucceeded > 1 ? 's' : ''}
                  </span>
                )}
                {gFailed > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, background: 'var(--destructive-soft)', color: 'var(--destructive)', border: '1px solid var(--destructive-soft)' }}>
                    ✗ {gFailed} erreur{gFailed > 1 ? 's' : ''}
                  </span>
                )}
                {gDoublons > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning-soft)' }}>
                    ⚠ {gDoublons} doublon{gDoublons > 1 ? 's' : ''}
                  </span>
                )}
                {gPending > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, background: 'var(--muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    ⏳ {gPending} en cours
                  </span>
                )}
              </div>
              <ChevronDown size={16} color="var(--muted)" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
            </button>

            {/* Contenu dépliable */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', maxHeight: 500, overflowY: 'auto' }}>
                {group.jobs.map(job => {
                  const ext = job.file.name.split('.').pop()?.toUpperCase() || '?'
                  const folder = job.relativePath
                    ? job.relativePath.substring(0, job.relativePath.lastIndexOf('/')) || '/'
                    : null
                  return (
                    <div key={job.id}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px',
                        borderBottom: '1px solid var(--border)',
                        background: job.status === 'error' ? '#FEF2F2'
                          : job.status === 'success' ? '#FAFFF9'
                          : job.status === 'doublon' || job.status === 'skipped' ? '#FFFDF5'
                          : 'transparent',
                      }}>
                        {/* Icône statut */}
                        <div style={{ flexShrink: 0 }}>
                          {job.status === 'pending' && <FileText size={13} color="var(--muted)" />}
                          {job.status === 'processing' && <Loader2 size={13} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />}
                          {job.status === 'success' && <CheckCircle size={13} color="var(--success)" />}
                          {job.status === 'error' && <XCircle size={13} color="var(--destructive)" />}
                          {job.status === 'skipped' && <CheckCircle size={13} color="#9CA3AF" />}
                          {job.status === 'doublon' && <Copy size={13} color="var(--warning)" />}
                        </div>
                        {/* Infos fichier */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {job.file.name}
                            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>
                              {ext} · {formatSize(job.file.size)}
                            </span>
                          </div>
                          {folder && (
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                              📁 {folder}
                            </div>
                          )}
                          {job.status === 'success' && job.candidatNom && (
                            <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 1 }}>→ {job.candidatNom}</div>
                          )}
                          {job.status === 'error' && (
                            <div style={{ fontSize: 11, color: 'var(--destructive)', marginTop: 1, lineHeight: 1.4 }}>
                              {job.error || 'Erreur inconnue'}
                            </div>
                          )}
                          {job.status === 'doublon' && job.candidatExistant && (
                            <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 1 }}>
                              Doublon de {job.candidatExistant.prenom} {job.candidatExistant.nom}
                            </div>
                          )}
                          {job.status === 'skipped' && (
                            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1 }}>{job.candidatNom}</div>
                          )}
                        </div>
                        {/* Bouton télécharger pour erreurs */}
                        {job.status === 'error' && (
                          <button
                            onClick={() => {
                              const url = URL.createObjectURL(job.file)
                              const a = document.createElement('a')
                              a.href = url; a.download = job.file.name
                              document.body.appendChild(a); a.click()
                              document.body.removeChild(a); URL.revokeObjectURL(url)
                            }}
                            title="Télécharger le fichier"
                            style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, border: '1px solid var(--destructive-soft)', background: 'var(--destructive-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                          >
                            <HardDriveDownload size={12} color="var(--destructive)" />
                          </button>
                        )}
                        {job.duration && (
                          <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{formatDuration(job.duration)}</span>
                        )}
                      </div>
                      {/* Résolution doublon */}
                      {job.status === 'doublon' && job.candidatExistant && (
                        <div style={{ margin: '0 20px 8px', background: 'white', border: '1.5px solid #FDE68A', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => resolveDoublon(job, 'ignorer')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1.5px solid #E5E7EB', background: 'white', color: 'var(--muted-foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
                              Garder l&apos;existant
                            </button>
                            <button onClick={() => resolveDoublon(job, 'remplacer')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1.5px solid #3B82F6', background: 'var(--info-soft)', color: 'var(--info)', cursor: 'pointer', fontFamily: 'inherit' }}>
                              Remplacer
                            </button>
                            <button onClick={() => resolveDoublon(job, 'garder_les_deux')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1.5px solid #8B5CF6', background: '#F5F3FF', color: '#7C3AED', cursor: 'pointer', fontFamily: 'inherit' }}>
                              Garder les deux
                            </button>
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
      })}
    </div>
  )
}
