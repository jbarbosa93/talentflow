'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Plug, Clock, User, ExternalLink, Loader2, FolderOpen,
  ChevronDown, Zap, ZapOff, CloudUpload, FileText,
} from 'lucide-react'
import { useSyncMicrosoft } from '@/hooks/useMessages'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'
import { useEffect, Suspense, useState, useRef, useCallback } from 'react'

function IntegrationsContent() {
  const searchParams  = useSearchParams()
  const queryClient   = useQueryClient()
  const sync          = useSyncMicrosoft()

  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [showOneDriveFolderPicker, setShowOneDriveFolderPicker] = useState(false)

  // Boucle auto sync Outlook
  const [outlookSyncing, setOutlookSyncing] = useState(false)
  const [outlookProgress, setOutlookProgress] = useState({ total: 0, created: 0, batch: 0 })
  const outlookStopRef = useRef(false)

  const runOutlookSyncLoop = useCallback(async () => {
    setOutlookSyncing(true)
    outlookStopRef.current = false
    let totalCreated = 0
    let totalProcessed = 0
    let batchNum = 0

    while (!outlookStopRef.current) {
      try {
        const res = await fetch('/api/microsoft/sync', { method: 'POST' })
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('json')) { toast.error('Timeout serveur — batch terminé'); break }
        const data = await res.json()

        if (data.error) { toast.error(data.error); break }

        batchNum++
        totalCreated += data.created?.length || 0
        totalProcessed += (data.created?.length || 0) + (data.skipped || 0) + (data.errors || 0)
        setOutlookProgress({ total: totalProcessed, created: totalCreated, batch: batchNum })

        // Si aucun nouveau traité dans ce batch, on a fini
        if ((data.created?.length || 0) === 0 && (data.errors || 0) === 0) {
          toast.success(`✅ Sync Outlook terminée ! ${totalCreated} CVs importés sur ${batchNum} batch(es)`)
          break
        }

        // Petit délai entre batches
        await new Promise(r => setTimeout(r, 1000))
      } catch {
        toast.error('Erreur réseau — sync arrêtée')
        break
      }
    }

    setOutlookSyncing(false)
    queryClient.invalidateQueries({ queryKey: ['integrations'] })
  }, [queryClient])

  // Boucle auto sync OneDrive
  const [onedriveSyncing, setOnedriveSyncing] = useState(false)
  const [onedriveProgress, setOnedriveProgress] = useState({ total: 0, created: 0, batch: 0 })
  const onedriveStopRef = useRef(false)

  const runOneDriveSyncLoop = useCallback(async () => {
    setOnedriveSyncing(true)
    onedriveStopRef.current = false
    let totalCreated = 0
    let totalProcessed = 0
    let batchNum = 0

    while (!onedriveStopRef.current) {
      try {
        const res = await fetch('/api/onedrive/sync', { method: 'POST' })
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('json')) { toast.error('Timeout serveur — batch terminé'); break }
        const data = await res.json()

        if (data.error) { toast.error(data.error); break }

        batchNum++
        totalCreated += data.created?.length || 0
        totalProcessed += (data.created?.length || 0) + (data.skipped || 0) + (data.errors || 0)
        setOnedriveProgress({ total: totalProcessed, created: totalCreated, batch: batchNum })

        if ((data.created?.length || 0) === 0 && (data.errors || 0) === 0) {
          toast.success(`✅ Sync OneDrive terminée ! ${totalCreated} CVs importés sur ${batchNum} batch(es)`)
          break
        }

        await new Promise(r => setTimeout(r, 1000))
      } catch {
        toast.error('Erreur réseau — sync arrêtée')
        break
      }
    }

    setOnedriveSyncing(false)
    queryClient.invalidateQueries({ queryKey: ['integrations'] })
  }, [queryClient])

  useEffect(() => {
    const success = searchParams.get('success')
    const error   = searchParams.get('error')
    if (success) {
      // Invalider le cache pour recharger les intégrations
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      if (success === 'microsoft_outlook') toast.success('Compte Microsoft Outlook connecté avec succès !')
      else if (success === 'microsoft_onedrive') toast.success('Compte Microsoft OneDrive connecté avec succès !')
      else toast.success('Compte Microsoft connecté avec succès !')
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

  // Helper: find integration by type with backward compat
  const findIntegration = (targetType: string) => {
    const integrations = integrationsData?.integrations || []
    return integrations.find((i: any) => i.type === targetType) || null
  }

  // UNE seule row microsoft — outlook et onedrive stockés dans metadata
  const microsoftRow = (integrationsData?.integrations || []).find((i: any) => i.type === 'microsoft') || null
  const outlookAccount = microsoftRow?.metadata?.outlook || null
  const onedriveAccount = microsoftRow?.metadata?.onedrive || null
  // Construire des objets "fake integration" pour outlook et onedrive
  const outlookIntegration = outlookAccount ? { ...microsoftRow, email: outlookAccount.email, nom_compte: outlookAccount.nom_compte } : null
  const onedriveIntegration = onedriveAccount ? { ...microsoftRow, email: onedriveAccount.email, nom_compte: onedriveAccount.nom_compte } : microsoftRow
  const isOutlookConnected = !!outlookIntegration
  const isOnedriveConnected = !!onedriveIntegration

  const outlookMeta = outlookIntegration?.metadata || {}
  const onedriveMeta = onedriveIntegration?.metadata || {}

  const { data: emailsData } = useQuery({
    queryKey: ['emails-recus'],
    queryFn: async () => {
      const res = await fetch('/api/microsoft/sync')
      return res.json()
    },
    staleTime: 30_000,
    enabled: isOutlookConnected,
  })

  const { data: foldersData, isLoading: loadingFolders } = useQuery({
    queryKey: ['ms-folders'],
    queryFn: async () => {
      const res = await fetch('/api/microsoft/folders?purpose=outlook')
      return res.json()
    },
    staleTime: 60_000,
    enabled: showFolderPicker && isOutlookConnected,
  })

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integrations?id=${id}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Intégration déconnectée')
    },
  })

  const selectFolderMutation = useMutation({
    mutationFn: async ({ folder_id, folder_name }: { folder_id: string, folder_name: string }) => {
      const res = await fetch('/api/microsoft/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id, folder_name, purpose: 'outlook' }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      queryClient.invalidateQueries({ queryKey: ['ms-folders'] })
      setShowFolderPicker(false)
      toast.success(`Dossier "${data.folder_name}" configuré. La sync se fera 1×/jour automatiquement.`)
    },
    onError: () => toast.error('Erreur lors de la configuration'),
  })

  const toggleAutoSyncMutation = useMutation({
    mutationFn: async ({ integrationId, autoSync }: { integrationId: string, autoSync: boolean }) => {
      const res = await fetch('/api/microsoft/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggle_auto_sync: !autoSync, integration_id: integrationId, purpose: 'outlook' }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
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
      toast.success(`Dossier OneDrive "${data.folder_name}" configuré.`)
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
        toast.success(`OneDrive sync: ${data.processed} créé(s), ${data.duplicates} doublon(s)`)
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

  // Outlook derived values
  const emails        = emailsData?.emails || []
  const importedEmails = emails.filter((e: any) => e.candidat_id)
  const configuredFolder = foldersData?.configured || outlookMeta?.email_folder_name || 'CV à traiter'
  const lastSync      = outlookMeta?.last_sync ? new Date(outlookMeta.last_sync) : null
  const autoSyncEnabled = outlookMeta?.auto_sync !== false // true par défaut

  // OneDrive derived values
  const onedriveSubMeta      = onedriveMeta?.onedrive || {} // metadata.onedrive (sub-object avec config SharePoint)
  const onedriveFolderName   = onedriveSubMeta?.sharepoint_folder_name || onedriveMeta?.sharepoint_folder_name || onedriveMeta?.onedrive_folder_name || null
  const onedriveFolderId     = onedriveSubMeta?.sharepoint_folder_id || onedriveMeta?.sharepoint_folder_id || onedriveMeta?.onedrive_folder_id || null
  const onedriveLastSync     = onedriveMeta?.onedrive_last_sync ? new Date(onedriveMeta.onedrive_last_sync) : null
  const onedriveAutoSync     = onedriveMeta?.onedrive_auto_sync !== false // true par défaut
  const onedriveFichiers     = onedriveFilesData?.fichiers || []
  const onedriveImported     = onedriveFichiers.filter((f: any) => f.candidat_id && !f.erreur)

  return (
    <div className="d-page" style={{ maxWidth: 860, paddingBottom: 60 }}>

      {/* Header */}
      <div className="d-page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="d-page-title">Intégrations</h1>
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
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Analyse IA des CVs — clé configurée via variable d&apos;environnement</div>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: 100 }}>Connecté</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CloudUpload size={16} color="#3B82F6" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Supabase</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Base de données et stockage de fichiers</div>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: 100 }}>Connecté</span>
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
          {/* ── Microsoft Outlook Card ── */}
          <div className="neo-card" style={{
            padding: 24, marginBottom: 16,
            borderColor: isOutlookConnected ? 'var(--primary)' : undefined,
            boxShadow: isOutlookConnected ? '4px 4px 0 var(--primary)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              {/* Left */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Microsoft/Outlook logo */}
                <div style={{
                  width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                  border: '2px solid var(--border)', background: 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '2px 2px 0 var(--border)',
                }}>
                  <svg viewBox="0 0 24 24" style={{ width: 28, height: 28 }}>
                    <path fill="#0078D4" d="M24 7.387v10.478c0 .23-.08.424-.238.576-.16.154-.353.23-.578.23h-8.547V6.58h8.547c.225 0 .418.077.578.23.158.153.238.347.238.577zM13.42 3.33v17.34L0 18.4V5.6l13.42-2.27zM9.6 14.4c.384-.6.577-1.337.577-2.214 0-.904-.2-1.656-.6-2.255-.4-.6-.94-.9-1.62-.9-.68 0-1.22.3-1.62.9-.4.6-.6 1.35-.6 2.255 0 .877.193 1.614.577 2.214.384.6.92.9 1.607.9.688 0 1.228-.3 1.68-.9z"/>
                  </svg>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>Microsoft Outlook</h2>
                    {isOutlookConnected ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                        background: '#D1FAE5', color: '#065F46',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <CheckCircle2 size={10} /> Connecté
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                        background: 'var(--background)', color: 'var(--muted)',
                        display: 'flex', alignItems: 'center', gap: 4,
                        border: '1.5px solid var(--border)',
                      }}>
                        <XCircle size={10} /> Non connecté
                      </span>
                    )}
                    {isOutlookConnected && autoSyncEnabled && (
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

                  {isOutlookConnected ? (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <User size={11} /> {outlookIntegration.nom_compte}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Mail size={11} /> {outlookIntegration.email}
                      </p>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Réception des CVs par email (info@l-agence.ch) — import automatique depuis la boîte de réception
                    </p>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                {isOutlookConnected ? (
                  <>
                    {outlookSyncing ? (
                      <button
                        onClick={() => { outlookStopRef.current = true }}
                        style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '2px solid #FECACA', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font-body)' }}
                      >
                        ⏹ Stop ({outlookProgress.created} importés, batch {outlookProgress.batch})
                      </button>
                    ) : (
                      <button
                        onClick={runOutlookSyncLoop}
                        className="neo-btn"
                        style={{ fontSize: 12, padding: '7px 14px' }}
                      >
                        <RefreshCw size={13} />
                        Synchroniser tout
                      </button>
                    )}
                    <button
                      onClick={() => disconnectMutation.mutate(outlookIntegration.id)}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: '7px 14px',
                        borderRadius: 8, border: '2px solid #FECACA',
                        background: 'white', color: '#DC2626', cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      Déconnecter
                    </button>
                  </>
                ) : (
                  <a href="/api/microsoft/auth?purpose=outlook" className="neo-btn" style={{ textDecoration: 'none', fontSize: 13 }}>
                    <Plug size={14} />
                    Connecter Outlook
                  </a>
                )}
              </div>
            </div>

            {/* ── Config dossier + stats si connecté ── */}
            {isOutlookConnected && (
              <>
                {/* Dossier surveillé */}
                <div style={{
                  marginTop: 20, paddingTop: 16, borderTop: '2px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FolderOpen size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1 }}>
                          Dossier surveillé
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          Les CVs reçus dans ce dossier Outlook seront automatiquement importés
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 8,
                        background: 'var(--primary-soft)', border: '2px solid var(--primary)',
                        fontWeight: 700, fontSize: 13, color: 'var(--foreground)',
                      }}>
                        <FolderOpen size={13} style={{ color: 'var(--primary)' }} />
                        {configuredFolder}
                      </div>
                      {/* Bouton Changer supprimé — dossier fixe */}
                    </div>
                  </div>

                  {/* Sélecteur de dossier */}
                  {showFolderPicker && (
                    <div style={{
                      marginTop: 12, padding: 16, borderRadius: 10,
                      background: 'var(--background)', border: '1.5px solid var(--border)',
                    }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 }}>
                        Choisir le dossier Outlook à surveiller :
                      </p>
                      {loadingFolders ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                          Chargement des dossiers...
                        </div>
                      ) : foldersData?.folders?.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {foldersData.folders
                            .filter((f: any) => f.displayName && !['Drafts', 'Brouillons', 'Deleted Items', 'Éléments supprimés', 'Junk Email', 'Courrier indésirable', 'Outbox', 'Boîte d\'envoi', 'Sent Items', 'Éléments envoyés'].includes(f.displayName))
                            .map((folder: any) => (
                            <button
                              key={folder.id}
                              onClick={() => selectFolderMutation.mutate({ folder_id: folder.id, folder_name: folder.displayName })}
                              disabled={selectFolderMutation.isPending}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 8,
                                background: folder.displayName === configuredFolder ? 'var(--primary-soft)' : 'var(--surface)',
                                border: `1.5px solid ${folder.displayName === configuredFolder ? 'var(--primary)' : 'var(--border)'}`,
                                fontSize: 12, fontWeight: 600,
                                color: folder.displayName === configuredFolder ? 'var(--foreground)' : 'var(--muted)',
                                cursor: 'pointer', fontFamily: 'var(--font-body)',
                              }}
                            >
                              <FolderOpen size={11} />
                              {folder._parent ? `${folder._parent} > ` : ''}{folder.displayName}
                              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>
                                ({folder.totalItemCount || 0})
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                          Aucun dossier trouvé. Vérifiez la connexion Microsoft.
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, fontStyle: 'italic' }}>
                        Astuce : glissez les emails avec CVs dans ce dossier Outlook et TalentFlow les importera automatiquement 1×/jour automatiquementutes.
                      </p>
                    </div>
                  )}

                  {/* Infos sync */}
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Zap size={11} />
                      Sync automatique 1×/jour à 1h00
                    </span>
                    {lastSync && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} />
                        Dernier sync : {lastSync.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <div style={{ background: 'var(--background)', borderRadius: 10, padding: '12px 16px', border: '1.5px solid var(--border)' }}>
                    <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>{emails.length}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>Emails analysés</p>
                  </div>
                  <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #BBF7D0' }}>
                    <p style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', lineHeight: 1 }}>{importedEmails.length}</p>
                    <p style={{ fontSize: 11, color: '#15803D', marginTop: 4, fontWeight: 600 }}>CVs importés</p>
                  </div>
                  <div style={{ background: 'var(--background)', borderRadius: 10, padding: '12px 16px', border: '1.5px solid var(--border)' }}>
                    <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--muted)', lineHeight: 1 }}>{emails.length - importedEmails.length}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>Sans CV détecté</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Guide de configuration ── */}
          {!isOutlookConnected && !isOnedriveConnected && (
            <div className="neo-card" style={{ padding: 24, marginBottom: 16, borderColor: 'var(--primary)', background: 'var(--primary-soft)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <AlertCircle size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--foreground)', marginBottom: 12 }}>
                    Configuration requise — Azure App Registration
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { n: 1, text: 'Allez sur', link: 'https://portal.azure.com', linkText: 'portal.azure.com' },
                      { n: 2, text: 'Menu → Azure Active Directory → App registrations → New registration' },
                      { n: 3, text: 'Nom : "TalentFlow ATS" · Supported account types : "Personal Microsoft accounts"' },
                      { n: 4, text: 'Redirect URI (Web) :', code: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.talent-flow.ch'}/api/microsoft/callback` },
                      { n: 5, text: 'Copiez le Client ID (Overview) et créez un Secret (Certificates & secrets)' },
                      { n: 6, text: 'API permissions → Add → Microsoft Graph → Mail.Read, Mail.Send, User.Read, Files.Read, offline_access' },
                    ].map((step) => (
                      <div key={step.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--primary)', color: '#0F172A',
                          fontSize: 11, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{step.n}</div>
                        <p style={{ fontSize: 12, color: 'var(--foreground)', lineHeight: 1.6, marginTop: 1 }}>
                          {step.text}{' '}
                          {(step as any).link && (
                            <a href={(step as any).link} target="_blank" rel="noreferrer"
                              style={{ color: '#2563EB', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              {(step as any).linkText} <ExternalLink size={10} />
                            </a>
                          )}
                          {(step as any).code && (
                            <code style={{ display: 'block', marginTop: 4, padding: '4px 8px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 11, color: '#7C3AED', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                              {(step as any).code}
                            </code>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--surface)', borderRadius: 8, border: '1.5px solid var(--border)' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Ajoutez dans Vercel → Settings → Environment Variables :
                    </p>
                    <pre style={{ fontSize: 12, color: '#059669', fontFamily: 'monospace', lineHeight: 2, margin: 0 }}>
{`MICROSOFT_CLIENT_ID     = <votre-client-id>
MICROSOFT_CLIENT_SECRET  = <votre-secret>
MICROSOFT_TENANT_ID      = common
CRON_SECRET              = <une-clé-secrète-aléatoire>`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Guide workflow email → TalentFlow ── */}
          {isOutlookConnected && (
            <div className="neo-card" style={{ padding: 20, marginBottom: 16, background: '#FFFBEB', borderColor: '#FDE68A', boxShadow: '3px 3px 0 #FDE68A' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>📋</span>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 8 }}>
                    Comment ça marche — Import automatique par email
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      `Vous recevez un email avec un CV en pièce jointe`,
                      `Glissez cet email dans votre dossier Outlook "${configuredFolder}"`,
                      `TalentFlow détecte le nouvel email et importe le CV (1×/jour à 1h00 ou cliquez Synchroniser)`,
                      `Le candidat apparaît dans "À traiter" avec la source E-MAIL`,
                      `Vérifiez et validez le candidat pour l'intégrer dans votre base active`,
                    ].map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          background: '#F59E0B', color: '#fff',
                          fontSize: 10, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginTop: 1,
                        }}>{i + 1}</div>
                        <p style={{ fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

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
                        <CheckCircle2 size={10} /> Connecté
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                        background: 'var(--background)', color: 'var(--muted)',
                        display: 'flex', alignItems: 'center', gap: 4,
                        border: '1.5px solid var(--border)',
                      }}>
                        <XCircle size={10} /> Non connecté
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
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <User size={11} /> {onedriveIntegration.nom_compte}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Mail size={11} /> {onedriveIntegration.email}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        Sync fichiers OneDrive + envoi d&apos;emails
                      </p>
                    </div>
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
                        onClick={() => { onedriveStopRef.current = true }}
                        style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '2px solid #FECACA', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font-body)' }}
                      >
                        ⏹ Stop ({onedriveProgress.created} importés, batch {onedriveProgress.batch})
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
                      Déconnecter
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

            {/* Config dossier + stats si connecté */}
            {isOnedriveConnected && (
              <>
                {/* Dossier OneDrive surveillé */}
                <div style={{
                  marginTop: 20, paddingTop: 16, borderTop: '2px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FolderOpen size={16} style={{ color: '#0078D4', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1 }}>
                          Dossier OneDrive surveillé
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          Déposez vos CVs dans ce dossier pour qu&apos;ils soient automatiquement importés
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
                          Aucun dossier configuré
                        </div>
                      )}
                      {/* Bouton Changer supprimé — dossier fixe */}
                    </div>
                  </div>

                  {/* Sélecteur de dossier OneDrive */}
                  {showOneDriveFolderPicker && (
                    <div style={{
                      marginTop: 12, padding: 16, borderRadius: 10,
                      background: 'var(--background)', border: '1.5px solid var(--border)',
                    }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 }}>
                        Choisir le dossier OneDrive à surveiller :
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
                          Aucun dossier trouvé dans OneDrive. Créez un dossier dans votre OneDrive et réessayez.
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, fontStyle: 'italic' }}>
                        Astuce : créez un dossier &quot;CVs TalentFlow&quot; dans votre OneDrive et déposez-y vos CVs.
                      </p>
                    </div>
                  )}

                  {/* Infos sync + toggle auto-sync */}
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => toggleOneDriveAutoSyncMutation.mutate({ autoSync: onedriveAutoSync })}
                      disabled={toggleOneDriveAutoSyncMutation.isPending}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', borderRadius: 8,
                        background: onedriveAutoSync ? '#EFF6FF' : 'var(--surface)',
                        border: `1.5px solid ${onedriveAutoSync ? '#0078D4' : 'var(--border)'}`,
                        fontSize: 11, fontWeight: 700,
                        color: onedriveAutoSync ? '#1D4ED8' : 'var(--muted)',
                        cursor: 'pointer', fontFamily: 'var(--font-body)',
                      }}
                    >
                      {onedriveAutoSync ? <Zap size={11} /> : <ZapOff size={11} />}
                      Sync automatique {onedriveAutoSync ? 'activée' : 'désactivée'}
                    </button>
                    {onedriveLastSync && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} />
                        Dernier sync : {onedriveLastSync.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Note informationnelle */}
                <div style={{
                  marginTop: 14, padding: '10px 14px', borderRadius: 8,
                  background: '#F0F9FF', border: '1.5px solid #BAE6FD',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <CloudUpload size={14} style={{ color: '#0369A1', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12, color: '#075985', lineHeight: 1.5 }}>
                    Déposez vos CVs dans ce dossier OneDrive pour qu&apos;ils soient automatiquement importés et analysés dans TalentFlow.
                  </p>
                </div>

                {/* Stats OneDrive */}
                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <div style={{ background: 'var(--background)', borderRadius: 10, padding: '12px 16px', border: '1.5px solid var(--border)' }}>
                    <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>{onedriveFichiers.length}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>Fichiers analysés</p>
                  </div>
                  <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #BBF7D0' }}>
                    <p style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', lineHeight: 1 }}>{onedriveImported.length}</p>
                    <p style={{ fontSize: 11, color: '#15803D', marginTop: 4, fontWeight: 600 }}>CVs importés</p>
                  </div>
                  <div style={{ background: 'var(--background)', borderRadius: 10, padding: '12px 16px', border: '1.5px solid var(--border)' }}>
                    <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--muted)', lineHeight: 1 }}>
                      {onedriveFichiers.filter((f: any) => f.erreur && f.erreur !== 'Doublon — candidat déjà existant').length}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>Erreurs</p>
                  </div>
                </div>

                {/* Historique fichiers OneDrive */}
                {onedriveFichiers.length > 0 && (
                  <div style={{ marginTop: 16, borderTop: '2px solid var(--border)', paddingTop: 14 }}>
                    <h4 style={{ fontSize: 12, fontWeight: 800, color: 'var(--foreground)', marginBottom: 10 }}>
                      Derniers fichiers importés
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {onedriveFichiers.slice(0, 5).map((f: any) => (
                        <div key={f.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          padding: '8px 12px', borderRadius: 8,
                          background: 'var(--background)', border: '1.5px solid var(--border)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileText size={13} style={{ color: '#0078D4', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
                              {f.nom_fichier || '—'}
                            </span>
                          </div>
                          {f.candidat_id && !f.erreur ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#D1FAE5', color: '#065F46' }}>
                              {f.candidats?.prenom} {f.candidats?.nom}
                            </span>
                          ) : f.erreur?.includes('Doublon') ? (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: '#FEF3C7', color: '#92400E', border: '1.5px solid #FDE68A' }}>
                              Doublon
                            </span>
                          ) : f.erreur ? (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: '#FEE2E2', color: '#991B1B' }}>
                              Erreur
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
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
                  Migration SQL requise — exécutez <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 3 }}>supabase/migrations/20260323_onedrive_fichiers.sql</code> dans votre dashboard Supabase.
                </p>
              </div>
            )}
          </div>

          {/* ── Google (bientôt) ── */}
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
                  }}>Bientôt</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                  Gmail, Google Drive — synchronisation des CVs reçus
                </p>
              </div>
            </div>
          </div>

          {/* ── Historique emails ── */}
          {isOutlookConnected && emails.length > 0 && (
            <div className="neo-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--foreground)' }}>Historique des emails analysés</h3>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{emails.length} emails</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--background)' }}>
                    {['Expéditeur', 'Sujet', 'Reçu le', 'Résultat'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emails.slice(0, 20).map((email: any) => (
                    <tr key={email.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--foreground)', fontWeight: 600 }}>{email.expediteur || '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.sujet || '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} />
                          {email.recu_le ? new Date(email.recu_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {email.candidat_id ? (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#D1FAE5', color: '#065F46' }}>
                            {email.candidats?.prenom} {email.candidats?.nom}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'var(--background)', color: 'var(--muted)', border: '1.5px solid var(--border)' }}>
                            Pas de CV
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
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
