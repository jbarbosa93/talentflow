'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Plug, Clock, User, ExternalLink, Loader2, FolderOpen,
  ChevronDown, Zap, ZapOff,
} from 'lucide-react'
import { useSyncMicrosoft } from '@/hooks/useMessages'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'
import { useEffect, Suspense, useState } from 'react'

function IntegrationsContent() {
  const searchParams  = useSearchParams()
  const queryClient   = useQueryClient()
  const sync          = useSyncMicrosoft()

  const [showFolderPicker, setShowFolderPicker] = useState(false)

  useEffect(() => {
    const success = searchParams.get('success')
    const error   = searchParams.get('error')
    if (success === 'microsoft') toast.success('Compte Microsoft connecté avec succès !')
    if (error) toast.error(`Erreur connexion : ${decodeURIComponent(error)}`)
  }, [searchParams])

  const { data: integrationsData, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations')
      return res.json()
    },
    staleTime: 10_000,
  })

  const { data: emailsData } = useQuery({
    queryKey: ['emails-recus'],
    queryFn: async () => {
      const res = await fetch('/api/microsoft/sync')
      return res.json()
    },
    staleTime: 30_000,
    enabled: !!integrationsData?.integrations?.find((i: any) => i.type === 'microsoft'),
  })

  const { data: foldersData, isLoading: loadingFolders } = useQuery({
    queryKey: ['ms-folders'],
    queryFn: async () => {
      const res = await fetch('/api/microsoft/folders')
      return res.json()
    },
    staleTime: 60_000,
    enabled: showFolderPicker,
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
        body: JSON.stringify({ folder_id, folder_name }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      queryClient.invalidateQueries({ queryKey: ['ms-folders'] })
      setShowFolderPicker(false)
      toast.success(`Dossier "${data.folder_name}" configuré. La sync se fera toutes les 10 min.`)
    },
    onError: () => toast.error('Erreur lors de la configuration'),
  })

  const toggleAutoSyncMutation = useMutation({
    mutationFn: async ({ integrationId, autoSync }: { integrationId: string, autoSync: boolean }) => {
      const res = await fetch('/api/microsoft/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggle_auto_sync: !autoSync, integration_id: integrationId }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
    },
  })

  const msIntegration = integrationsData?.integrations?.find((i: any) => i.type === 'microsoft')
  const isConnected   = !!msIntegration
  const emails        = emailsData?.emails || []
  const importedEmails = emails.filter((e: any) => e.candidat_id)
  const meta          = msIntegration?.metadata || {}
  const configuredFolder = foldersData?.configured || meta?.email_folder_name || 'CV à traiter'
  const lastSync      = meta?.last_sync ? new Date(meta.last_sync) : null
  const autoSyncEnabled = meta?.auto_sync !== false // true par défaut

  return (
    <div className="d-page" style={{ maxWidth: 860, paddingBottom: 60 }}>

      {/* Header */}
      <div className="d-page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="d-page-title">Intégrations</h1>
          <p className="d-page-sub">Connectez vos outils pour automatiser le recrutement</p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <Loader2 size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* ── Microsoft 365 Card ── */}
          <div className="neo-card" style={{
            padding: 24, marginBottom: 16,
            borderColor: isConnected ? 'var(--primary)' : undefined,
            boxShadow: isConnected ? '4px 4px 0 var(--primary)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              {/* Left */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Microsoft logo */}
                <div style={{
                  width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                  border: '2px solid var(--border)', background: 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '2px 2px 0 var(--border)',
                }}>
                  <svg viewBox="0 0 24 24" style={{ width: 28, height: 28 }}>
                    <path fill="#F25022" d="M1 1h10v10H1z"/>
                    <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                    <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                    <path fill="#FFB900" d="M13 13h10v10H13z"/>
                  </svg>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>Microsoft 365</h2>
                    {isConnected ? (
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
                    {isConnected && autoSyncEnabled && (
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

                  {isConnected ? (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <User size={11} /> {msIntegration.nom_compte}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Mail size={11} /> {msIntegration.email}
                      </p>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Outlook, Exchange — synchronisation automatique des CVs reçus par email
                    </p>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                {isConnected ? (
                  <>
                    <button
                      onClick={() => sync.mutate()}
                      disabled={sync.isPending}
                      className="neo-btn"
                      style={{ fontSize: 12, padding: '7px 14px' }}
                    >
                      <RefreshCw size={13} className={sync.isPending ? 'animate-spin' : ''} />
                      {sync.isPending ? 'Sync...' : 'Synchroniser'}
                    </button>
                    <button
                      onClick={() => disconnectMutation.mutate(msIntegration.id)}
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
                  <a href="/api/microsoft/auth" className="neo-btn" style={{ textDecoration: 'none', fontSize: 13 }}>
                    <Plug size={14} />
                    Connecter Microsoft
                  </a>
                )}
              </div>
            </div>

            {/* ── Config dossier + stats si connecté ── */}
            {isConnected && (
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
                      <button
                        onClick={() => setShowFolderPicker(!showFolderPicker)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '6px 10px', borderRadius: 8,
                          background: 'var(--surface)', border: '1.5px solid var(--border)',
                          fontSize: 12, fontWeight: 700, color: 'var(--muted)',
                          cursor: 'pointer', fontFamily: 'var(--font-body)',
                        }}
                      >
                        Changer <ChevronDown size={12} />
                      </button>
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
                              {folder._parent ? `${folder._parent} › ` : ''}{folder.displayName}
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
                        Astuce : glissez les emails avec CVs dans ce dossier Outlook et TalentFlow les importera automatiquement toutes les 10 minutes.
                      </p>
                    </div>
                  )}

                  {/* Infos sync */}
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Zap size={11} />
                      Sync automatique toutes les 10 min
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
          {!isConnected && (
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
                      { n: 6, text: 'API permissions → Add → Microsoft Graph → Mail.Read, Mail.Send, User.Read, offline_access, Calendars.ReadWrite' },
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
          {isConnected && (
            <div className="neo-card" style={{ padding: 20, marginBottom: 16, background: '#FFFBEB', borderColor: '#FDE68A', boxShadow: '3px 3px 0 #FDE68A' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Mail size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 8 }}>
                    Comment ça marche — Import automatique par email
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      `Vous recevez un email avec un CV en pièce jointe`,
                      `Glissez cet email dans votre dossier Outlook "${configuredFolder}"`,
                      `TalentFlow détecte le nouvel email et importe le CV automatiquement (toutes les 10 min)`,
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
          {isConnected && emails.length > 0 && (
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
                            ✓ {email.candidats?.prenom} {email.candidats?.nom}
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
