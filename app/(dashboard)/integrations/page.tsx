'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Plug, Clock, User, ExternalLink, Loader2, FolderOpen,
  ChevronDown, ChevronUp, Zap, ZapOff, CloudUpload, FileText,
} from 'lucide-react'
import { useSyncMicrosoft } from '@/hooks/useMessages'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'
import { useEffect, Suspense, useState, useRef, useCallback } from 'react'

function IntegrationsContent() {
  const searchParams  = useSearchParams()
  const queryClient   = useQueryClient()
  const sync          = useSyncMicrosoft()

  const [showOneDriveFolderPicker, setShowOneDriveFolderPicker] = useState(false)
  const [syncReport, setSyncReport] = useState<any>(null)

  // Boucle auto sync OneDrive
  const [onedriveSyncing, setOnedriveSyncing] = useState(false)
  const [onedriveProgress, setOnedriveProgress] = useState({ total: 0, created: 0, updated: 0, reactivated: 0, errors: 0, batch: 0 })
  const onedriveStopRef = useRef(false)
  const [onedriveStopping, setOnedriveStopping] = useState(false)

  const runOneDriveSyncLoop = useCallback(async () => {
    setOnedriveSyncing(true)
    onedriveStopRef.current = false
    let totalCreated = 0
    let totalProcessed = 0
    let totalUpdated = 0
    let totalReactivated = 0
    let totalErrors = 0
    let totalSkipped = 0
    let batchNum = 0
    const allCreatedNames: string[] = []
    const allUpdatedNames: string[] = []
    const allReactivatedNames: string[] = []
    const allErrorFiles: string[] = []

    while (!onedriveStopRef.current) {
      try {
        const res = await fetch('/api/onedrive/sync', { method: 'POST' })
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('json')) { toast.error('Timeout serveur — batch termine'); break }
        const data = await res.json()

        if (data.stopped) { break }
        if (data.error) { toast.error(data.error); break }

        batchNum++
        totalCreated += data.created?.length || 0
        totalUpdated += data.updated || 0
        totalReactivated += data.reactivated || 0
        totalErrors += data.errors || 0
        totalSkipped += data.skipped || 0
        totalProcessed += (data.created?.length || 0) + (data.skipped || 0) + (data.errors || 0) + (data.updated || 0) + (data.reactivated || 0)
        if (data.created) allCreatedNames.push(...data.created)
        if (data.updatedNames) allUpdatedNames.push(...data.updatedNames)
        if (data.reactivatedNames) allReactivatedNames.push(...data.reactivatedNames)
        if (data.errorFiles) allErrorFiles.push(...data.errorFiles)
        setOnedriveProgress({ total: totalProcessed, created: totalCreated, updated: totalUpdated, reactivated: totalReactivated, errors: totalErrors, batch: batchNum })

        // Rafraichir les stats apres chaque batch
        queryClient.invalidateQueries({ queryKey: ['integrations'] })
        queryClient.invalidateQueries({ queryKey: ['onedrive-fichiers'] })

        const batchActivity2 = (data.created?.length || 0) + (data.updated || 0) + (data.reactivated || 0) + (data.errors || 0)
        if (batchActivity2 === 0) {
          break
        }

        await new Promise(r => setTimeout(r, 1000))
      } catch {
        toast.error('Erreur reseau — sync arretee')
        break
      }
    }

    // Fetch updated files to get names
    try {
      const filesRes = await fetch('/api/onedrive/sync')
      const filesJson = await filesRes.json()
      const updatedFiles = (filesJson.fichiers || []).filter((f: any) => f.erreur?.startsWith('Mis à jour'))
      allUpdatedNames.push(...updatedFiles.map((f: any) => f.erreur.replace('Mis à jour — ', '')).slice(0, 50))
      const reactivatedFiles = (filesJson.fichiers || []).filter((f: any) => f.erreur?.startsWith('Réactivé'))
      allReactivatedNames.push(...reactivatedFiles.map((f: any) => f.erreur.replace('Réactivé — ', '')).slice(0, 50))
    } catch { /* ignore */ }

    setSyncReport({
      type: 'onedrive',
      totalAnalysed: totalProcessed,
      created: totalCreated,
      createdNames: allCreatedNames,
      updated: totalUpdated,
      updatedNames: [...new Set(allUpdatedNames)].slice(0, 30),
      reactivated: totalReactivated,
      reactivatedNames: [...new Set(allReactivatedNames)].slice(0, 30),
      errors: totalErrors,
      errorFiles: allErrorFiles,
      skipped: totalSkipped,
    })

    setOnedriveSyncing(false)
    queryClient.invalidateQueries({ queryKey: ['integrations'] })
  }, [queryClient])

  useEffect(() => {
    const success = searchParams.get('success')
    const error   = searchParams.get('error')
    if (success) {
      // Invalider le cache pour recharger les integrations
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      if (success === 'microsoft_onedrive') toast.success('Compte Microsoft OneDrive connecte avec succes !')
      else toast.success('Compte Microsoft connecte avec succes !')
    }
    if (error) toast.error(`Erreur connexion : ${decodeURIComponent(error)}`)
  }, [searchParams, queryClient])

  const { data: integrationsData, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations')
      return res.json()
    },
    staleTime: 10_000,
  })

  // OneDrive integration
  const integrations = integrationsData?.integrations || []
  const onedriveIntegration = integrations.find((i: any) => i.type === 'microsoft_onedrive')
    || integrations.find((i: any) => i.type === 'microsoft' && i.metadata?.purpose === 'onedrive')
    || integrations.find((i: any) => i.type === 'microsoft' && !i.metadata?.purpose) || null
  const isOnedriveConnected = !!onedriveIntegration

  const onedriveMeta = onedriveIntegration?.metadata || {}

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integrations?id=${id}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integration deconnectee')
    },
  })

  // ── OneDrive queries & mutations ──────────────────────────────────────────

  const { data: onedriveFoldersData, isLoading: loadingOneDriveFolders } = useQuery({
    queryKey: ['onedrive-folders'],
    queryFn: async () => {
      const res = await fetch('/api/onedrive/folders')
      return res.json()
    },
    staleTime: 60_000,
    enabled: showOneDriveFolderPicker && isOnedriveConnected,
  })

  const { data: onedriveFilesData } = useQuery({
    queryKey: ['onedrive-fichiers'],
    queryFn: async () => {
      const res = await fetch('/api/onedrive/sync')
      return res.json()
    },
    staleTime: 30_000,
    enabled: isOnedriveConnected,
  })

  const selectOneDriveFolderMutation = useMutation({
    mutationFn: async ({ folder_id, folder_name }: { folder_id: string, folder_name: string }) => {
      const res = await fetch('/api/onedrive/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id, folder_name }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      queryClient.invalidateQueries({ queryKey: ['onedrive-folders'] })
      setShowOneDriveFolderPicker(false)
      toast.success(`Dossier OneDrive "${data.folder_name}" configure.`)
    },
    onError: () => toast.error('Erreur lors de la configuration OneDrive'),
  })

  const syncOneDriveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/onedrive/sync', { method: 'POST' })
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      queryClient.invalidateQueries({ queryKey: ['onedrive-fichiers'] })
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`OneDrive sync: ${data.processed} cree(s), ${data.duplicates} doublon(s)`)
      }
    },
    onError: () => toast.error('Erreur lors de la sync OneDrive'),
  })

  const toggleOneDriveAutoSyncMutation = useMutation({
    mutationFn: async ({ autoSync }: { autoSync: boolean }) => {
      const res = await fetch('/api/onedrive/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggle_auto_sync: !autoSync }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
    },
  })

  // OneDrive derived values — config SharePoint directement dans metadata
  const onedriveFolderName   = onedriveMeta?.sharepoint_folder_name || null
  const onedriveFolderId     = onedriveMeta?.sharepoint_folder_id || null
  const onedriveLastSync     = onedriveMeta?.onedrive_last_sync ? new Date(onedriveMeta.onedrive_last_sync) : null
  const onedriveAutoSync     = onedriveMeta?.onedrive_auto_sync !== false // true par defaut
  const onedriveFichiers     = onedriveFilesData?.fichiers || []
  const onedriveImported     = onedriveFichiers.filter((f: any) => f.candidat_id && !f.erreur)

  return (
    <div className="d-page" style={{ maxWidth: 860, paddingBottom: 60 }}>

      {/* Header */}
      <div className="d-page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="d-page-title">Integrations</h1>
          <p className="d-page-sub">Connectez vos outils pour automatiser le recrutement</p>
        </div>
      </div>

      {/* Configuration API */}
      <div style={{ background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--foreground)', margin: '0 0 16px' }}>Configuration</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Zap size={16} color="var(--primary)" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Claude AI (Anthropic)</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Analyse IA des CVs — cle configuree via variable d&apos;environnement</div>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: 100 }}>Connecte</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CloudUpload size={16} color="#3B82F6" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Supabase</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Base de donnees et stockage de fichiers</div>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: 100 }}>Connecte</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ExternalLink size={16} color="var(--muted)" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>URL de l&apos;application</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>https://www.talent-flow.ch</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <Loader2 size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* ── Microsoft OneDrive Card ── */}
          <div className="neo-card" style={{
            padding: 24, marginBottom: 16,
            borderColor: isOnedriveConnected && onedriveFolderId ? 'var(--primary)' : undefined,
            boxShadow: isOnedriveConnected && onedriveFolderId ? '4px 4px 0 var(--primary)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              {/* Left */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* OneDrive logo */}
                <div style={{
                  width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                  border: '2px solid var(--border)', background: 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '2px 2px 0 var(--border)',
                }}>
                  <svg viewBox="0 0 24 24" style={{ width: 30, height: 30 }} fill="none">
                    <path d="M6.5 20C4 20 2 18 2 15.5c0-2.1 1.4-3.9 3.3-4.4C5.1 10.4 5 9.7 5 9c0-3.3 2.7-6 6-6 2.6 0 4.8 1.6 5.6 3.9.3-.1.7-.1 1-.1 2.5 0 4.4 2 4.4 4.4 0 .2 0 .4-.1.6C23 12.4 24 13.9 24 15.5c0 2.5-2 4.5-4.5 4.5H6.5z" fill="#0078D4"/>
                  </svg>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>Microsoft OneDrive</h2>
                    {isOnedriveConnected ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                        background: '#D1FAE5', color: '#065F46',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <CheckCircle2 size={10} /> Connecte
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                        background: 'var(--background)', color: 'var(--muted)',
                        display: 'flex', alignItems: 'center', gap: 4,
                        border: '1.5px solid var(--border)',
                      }}>
                        <XCircle size={10} /> Non connecte
                      </span>
                    )}
                    {isOnedriveConnected && onedriveFolderId && onedriveAutoSync && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                        background: '#EFF6FF', color: '#1D4ED8',
                        display: 'flex', alignItems: 'center', gap: 4,
                        border: '1.5px solid #BFDBFE',
                      }}>
                        <Zap size={10} /> Sync auto
                      </span>
                    )}
                  </div>

                  {isOnedriveConnected ? (
                    <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                      <Mail size={11} /> {onedriveIntegration.email}
                    </p>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Sync fichiers OneDrive (j.barbosa@l-agence.ch) + envoi d&apos;emails aux candidats
                    </p>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                {isOnedriveConnected ? (
                  <>
                    {onedriveSyncing ? (
                      <button
                        onClick={() => {
                          onedriveStopRef.current = true
                          setOnedriveStopping(true)
                          // Stop background sync too
                          fetch('/api/integrations', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'microsoft_onedrive', metadata_update: { sync_stop_requested: true } }),
                          })
                        }}
                        style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '2px solid #FECACA', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font-body)' }}
                      >
                        ⏹ Stop ({onedriveProgress.created} importes, batch {onedriveProgress.batch})
                      </button>
                    ) : (
                      <button
                        onClick={runOneDriveSyncLoop}
                        disabled={!onedriveFolderId}
                        className="neo-btn"
                        style={{ fontSize: 12, padding: '7px 14px' }}
                      >
                        <RefreshCw size={13} />
                        Synchroniser tout
                      </button>
                    )}
                    <button
                      onClick={() => disconnectMutation.mutate(onedriveIntegration.id)}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: '7px 14px',
                        borderRadius: 8, border: '2px solid #FECACA',
                        background: 'white', color: '#DC2626', cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      Deconnecter
                    </button>
                  </>
                ) : (
                  <a href="/api/microsoft/auth?purpose=onedrive" className="neo-btn" style={{ textDecoration: 'none', fontSize: 13 }}>
                    <Plug size={14} />
                    Connecter OneDrive
                  </a>
                )}
              </div>
            </div>

            {/* Config dossier + stats si connecte */}
            {isOnedriveConnected && (
              <>
                {/* Dossier OneDrive surveille */}
                <div style={{
                  marginTop: 20, paddingTop: 16, borderTop: '2px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FolderOpen size={16} style={{ color: '#0078D4', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1 }}>
                          Dossier OneDrive surveille
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          Deposez vos CVs dans ce dossier pour qu&apos;ils soient automatiquement importes
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {onedriveFolderName ? (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 8,
                          background: '#EFF6FF', border: '2px solid #BFDBFE',
                          fontWeight: 700, fontSize: 13, color: 'var(--foreground)',
                        }}>
                          <FolderOpen size={13} style={{ color: '#0078D4' }} />
                          {onedriveFolderName}
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 8,
                          background: 'var(--background)', border: '1.5px dashed var(--border)',
                          fontWeight: 600, fontSize: 12, color: 'var(--muted)',
                        }}>
                          <FolderOpen size={12} />
                          Aucun dossier configure
                        </div>
                      )}
                      {/* Bouton Changer supprime — dossier fixe */}
                    </div>
                  </div>

                  {/* Selecteur de dossier OneDrive */}
                  {showOneDriveFolderPicker && (
                    <div style={{
                      marginTop: 12, padding: 16, borderRadius: 10,
                      background: 'var(--background)', border: '1.5px solid var(--border)',
                    }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 }}>
                        Choisir le dossier OneDrive a surveiller :
                      </p>
                      {loadingOneDriveFolders ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                          Chargement des dossiers OneDrive...
                        </div>
                      ) : onedriveFoldersData?.folders?.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {onedriveFoldersData.folders.map((folder: any) => (
                            <button
                              key={folder.id}
                              onClick={() => selectOneDriveFolderMutation.mutate({ folder_id: folder.id, folder_name: folder.name })}
                              disabled={selectOneDriveFolderMutation.isPending}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 8,
                                background: folder.id === onedriveFolderId ? '#EFF6FF' : 'var(--surface)',
                                border: `1.5px solid ${folder.id === onedriveFolderId ? '#0078D4' : 'var(--border)'}`,
                                fontSize: 12, fontWeight: 600,
                                color: folder.id === onedriveFolderId ? '#1D4ED8' : 'var(--muted)',
                                cursor: 'pointer', fontFamily: 'var(--font-body)',
                              }}
                            >
                              <FolderOpen size={11} />
                              {folder.path}
                            </button>
                          ))}
                        </div>
                      ) : onedriveFoldersData?.error ? (
                        <p style={{ fontSize: 12, color: '#DC2626' }}>
                          {onedriveFoldersData.error}
                        </p>
                      ) : (
                        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                          Aucun dossier trouve dans OneDrive. Creez un dossier dans votre OneDrive et reessayez.
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, fontStyle: 'italic' }}>
                        Astuce : creez un dossier &quot;CVs TalentFlow&quot; dans votre OneDrive et deposez-y vos CVs.
                      </p>
                    </div>
                  )}

                  {/* Infos sync + toggle auto-sync */}
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => toggleOneDriveAutoSyncMutation.mutate({ autoSync: onedriveAutoSync })}
                      disabled={toggleOneDriveAutoSyncMutation.isPending}
                      style={{
                        fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 100, cursor: 'pointer',
                        border: `1.5px solid ${onedriveAutoSync ? '#BBF7D0' : '#E5E7EB'}`,
                        background: onedriveAutoSync ? '#F0FDF4' : 'var(--background)',
                        color: onedriveAutoSync ? '#15803D' : 'var(--muted)',
                        fontWeight: 700, fontFamily: 'var(--font-body)',
                      }}
                    >
                      {onedriveAutoSync ? <Zap size={11} /> : <ZapOff size={11} />}
                      Sync auto {onedriveAutoSync ? 'toutes les 10 min' : 'desactivee'}
                    </button>
                    {onedriveLastSync && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} />
                        Dernier sync : {onedriveLastSync.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats OneDrive — uniquement aujourd'hui (reset chaque jour) */}
                {(() => {
                  const today = new Date().toISOString().slice(0, 10)
                  const todayFiles = onedriveFichiers.filter((f: any) => f.created_at?.slice(0, 10) === today)
                  const todayImported = todayFiles.filter((f: any) => f.candidat_id && !f.erreur?.startsWith('Mis à jour') && !f.erreur?.startsWith('Réactivé') && !f.erreur?.startsWith('Doublon'))
                  const todayUpdated = todayFiles.filter((f: any) => f.erreur?.startsWith('Mis à jour'))
                  const todayReactivated = todayFiles.filter((f: any) => f.erreur?.startsWith('Réactivé'))
                  return (
                    <div style={{ marginTop: 14 }}>
                      <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>
                        📊 Aujourd'hui ({new Date().toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })})
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        <div style={{ background: 'var(--background)', borderRadius: 10, padding: '12px 16px', border: '1.5px solid var(--border)' }}>
                          <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>{onedriveSyncing ? todayFiles.length + onedriveProgress.total : todayFiles.length}</p>
                          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>Fichiers analysés</p>
                        </div>
                        <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #BBF7D0' }}>
                          <p style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', lineHeight: 1 }}>{onedriveSyncing ? todayImported.length + onedriveProgress.created : todayImported.length}</p>
                          <p style={{ fontSize: 11, color: '#15803D', marginTop: 4, fontWeight: 600 }}>CVs importés</p>
                        </div>
                        <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #BFDBFE' }}>
                          <p style={{ fontSize: 26, fontWeight: 800, color: '#2563EB', lineHeight: 1 }}>{onedriveSyncing ? todayUpdated.length + onedriveProgress.updated : todayUpdated.length}</p>
                          <p style={{ fontSize: 11, color: '#1D4ED8', marginTop: 4, fontWeight: 600 }}>Mis à jour</p>
                        </div>
                        <div style={{ background: '#FFFBEB', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #FDE68A' }}>
                          <p style={{ fontSize: 26, fontWeight: 800, color: '#D97706', lineHeight: 1 }}>{onedriveSyncing ? todayReactivated.length + onedriveProgress.reactivated : todayReactivated.length}</p>
                          <p style={{ fontSize: 11, color: '#92400E', marginTop: 4, fontWeight: 600 }}>Réactivés</p>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Historique fichiers OneDrive */}
                {onedriveFichiers.length > 0 && (
                  <div style={{ marginTop: 16, borderTop: '2px solid var(--border)', paddingTop: 14 }}>
                    <h4 style={{ fontSize: 12, fontWeight: 800, color: 'var(--foreground)', marginBottom: 10 }}>
                      Derniers fichiers importes ({onedriveFichiers.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                      {onedriveFichiers.map((f: any) => (
                        <div key={f.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          padding: '8px 12px', borderRadius: 8,
                          background: 'var(--background)', border: '1.5px solid var(--border)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <FileText size={13} style={{ color: '#0078D4', flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.nom_fichier || '—'}
                              </span>
                              {f.created_at && (
                                <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 1 }}>
                                  {new Date(f.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            {f.candidat_id && !f.erreur ? (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#D1FAE5', color: '#065F46' }}>
                                {f.candidats?.prenom} {f.candidats?.nom}
                              </span>
                            ) : f.erreur?.startsWith('Mis à jour') ? (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#DBEAFE', color: '#1D4ED8', border: '1.5px solid #BFDBFE' }}>
                                {f.erreur}
                              </span>
                            ) : f.erreur?.startsWith('Réactivé') ? (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#FEF3C7', color: '#92400E', border: '1.5px solid #FDE68A' }}>
                                {f.erreur}
                              </span>
                            ) : f.erreur?.includes('Doublon') ? (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#FEF3C7', color: '#92400E', border: '1.5px solid #FDE68A' }}>
                                {f.erreur}
                              </span>
                            ) : f.erreur?.startsWith('Document') || f.erreur?.startsWith('Certificat') || f.erreur?.startsWith('Diplôme') || f.erreur?.startsWith('Formation') || f.erreur?.startsWith('Attestation') || f.erreur?.startsWith('Permis') ? (
                              <span title={f.erreur} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: '#FEF3C7', color: '#92400E', border: '1.5px solid #FDE68A', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                ⚠️ {f.erreur}
                              </span>
                            ) : f.erreur ? (
                              <span title={f.erreur} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: '#FEE2E2', color: '#991B1B', border: '1.5px solid #FECACA', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                ❌ {f.erreur}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Historique conserve pour eviter les re-doublons */}
                  </div>
                )}
              </>
            )}

            {/* Migration needed notice */}
            {isOnedriveConnected && onedriveFilesData?.migration_needed && (
              <div style={{
                marginTop: 14, padding: '10px 14px', borderRadius: 8,
                background: '#FEF3C7', border: '1.5px solid #FDE68A',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <AlertCircle size={14} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                  Migration SQL requise — executez <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 3 }}>supabase/migrations/20260323_onedrive_fichiers.sql</code> dans votre dashboard Supabase.
                </p>
              </div>
            )}
          </div>

          {/* ── Google (bientot) ── */}
          <div className="neo-card" style={{ padding: 24, marginBottom: 16, opacity: 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                border: '2px solid var(--border)', background: 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" style={{ width: 26, height: 26 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>Google Workspace</h2>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                    background: 'var(--background)', color: 'var(--muted)', border: '1.5px solid var(--border)',
                  }}>Bientot</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                  Gmail, Google Drive — synchronisation des CVs recus
                </p>
              </div>
            </div>
          </div>

        </>
      )}

      {/* ── Sync Report Modal ── */}
      {syncReport && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }} onClick={() => setSyncReport(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card, white)', borderRadius: 16, padding: '28px 32px',
              maxWidth: 520, width: '100%', maxHeight: '80vh', overflowY: 'auto',
              border: '2px solid var(--border)', boxShadow: '6px 6px 0 var(--border)',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', marginBottom: 20 }}>
              Rapport de synchronisation — OneDrive
            </h3>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
              <div style={{ background: 'var(--background)', borderRadius: 10, padding: '10px 14px', border: '1.5px solid var(--border)' }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>{syncReport.totalAnalysed}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, fontWeight: 600 }}>Fichiers analyses</p>
              </div>
              <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '10px 14px', border: '1.5px solid #BBF7D0' }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', lineHeight: 1 }}>{syncReport.created}</p>
                <p style={{ fontSize: 11, color: '#15803D', marginTop: 3, fontWeight: 600 }}>CVs importes</p>
              </div>
              <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '10px 14px', border: '1.5px solid #BFDBFE' }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', lineHeight: 1 }}>{syncReport.updated || 0}</p>
                <p style={{ fontSize: 11, color: '#1D4ED8', marginTop: 3, fontWeight: 600 }}>CVs mis a jour</p>
              </div>
              <div style={{ background: '#FFFBEB', borderRadius: 10, padding: '10px 14px', border: '1.5px solid #FDE68A' }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: '#D97706', lineHeight: 1 }}>{syncReport.reactivated || 0}</p>
                <p style={{ fontSize: 11, color: '#92400E', marginTop: 3, fontWeight: 600 }}>Reactives</p>
              </div>
            </div>

            {/* Created list */}
            {syncReport.createdNames?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', marginBottom: 6 }}>
                  Candidats importes ({syncReport.created}) :
                </p>
                <div style={{ maxHeight: 120, overflowY: 'auto', padding: '8px 10px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  {syncReport.createdNames.map((name: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: '#065F46', padding: '2px 0' }}>• {name}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Updated list */}
            {syncReport.updatedNames?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 6 }}>
                  CVs mis a jour ({syncReport.updated}) :
                </p>
                <div style={{ maxHeight: 120, overflowY: 'auto', padding: '8px 10px', borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                  {syncReport.updatedNames.map((name: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: '#1E40AF', padding: '2px 0' }}>• {name}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Reactivated list */}
            {syncReport.reactivatedNames?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
                  Candidats reactives ({syncReport.reactivated}) :
                </p>
                <div style={{ maxHeight: 120, overflowY: 'auto', padding: '8px 10px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  {syncReport.reactivatedNames.map((name: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: '#92400E', padding: '2px 0' }}>• {name}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Fichiers en erreur */}
            {syncReport.errors > 0 && (
              <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1.5px solid #FECACA' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#991B1B', marginBottom: syncReport.errorFiles?.length ? 6 : 0 }}>
                  ⚠️ {syncReport.errors} fichier{syncReport.errors > 1 ? 's' : ''} non traité{syncReport.errors > 1 ? 's' : ''} — seront retentés au prochain sync
                </p>
                {syncReport.errorFiles?.length > 0 && (
                  <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                    {syncReport.errorFiles.map((f: string, i: number) => (
                      <div key={i} style={{ fontSize: 11, color: '#B91C1C', padding: '1px 0' }}>• {f}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => setSyncReport(null)}
                style={{
                  fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8,
                  border: '2px solid var(--border)', background: 'var(--background)',
                  color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                Fermer
              </button>
              {syncReport.created > 0 && (
                <a
                  href="/candidats"
                  style={{
                    fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8,
                    border: '2px solid var(--primary)', background: 'var(--primary)',
                    color: 'white', cursor: 'pointer', fontFamily: 'var(--font-body)',
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <User size={14} />
                  Voir les candidats importes
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={
      <div className="d-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Loader2 size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    }>
      <IntegrationsContent />
    </Suspense>
  )
}
