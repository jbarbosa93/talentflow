'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, RefreshCw, CheckCircle2, XCircle, AlertCircle, Plug, Clock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSyncMicrosoft } from '@/hooks/useMessages'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'

function IntegrationsContent() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const sync = useSyncMicrosoft()

  // Show success/error from OAuth redirect
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success === 'microsoft') toast.success('Compte Microsoft connecté avec succès !')
    if (error) toast.error(`Erreur connexion : ${decodeURIComponent(error)}`)
  }, [searchParams])

  const { data: integrationsData } = useQuery({
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

  const msIntegration = integrationsData?.integrations?.find((i: any) => i.type === 'microsoft')
  const isConnected = !!msIntegration
  const emails = emailsData?.emails || []
  const importedEmails = emails.filter((e: any) => e.candidat_id)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-7">
        <h1 className="text-xl font-bold text-white">Intégrations</h1>
        <p className="text-sm text-white/40 mt-0.5">Connectez vos outils pour automatiser le recrutement</p>
      </div>

      {/* Microsoft 365 Card */}
      <div className={`rounded-xl border p-6 mb-4 transition-colors ${isConnected ? 'border-primary/20 bg-primary/[0.04]' : 'border-white/6 bg-card'}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {/* Microsoft logo */}
            <div className="w-12 h-12 rounded-xl bg-white/8 border border-white/8 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-7 h-7">
                <path fill="#F25022" d="M1 1h10v10H1z"/>
                <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                <path fill="#FFB900" d="M13 13h10v10H13z"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Microsoft 365</h2>
                {isConnected ? (
                  <span className="text-[11px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Connecté
                  </span>
                ) : (
                  <span className="text-[11px] bg-white/8 text-white/35 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Non connecté
                  </span>
                )}
              </div>
              {isConnected ? (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-xs text-white/50 flex items-center gap-1.5">
                    <User className="w-3 h-3" />{msIntegration.nom_compte}
                  </p>
                  <p className="text-xs text-white/35 flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />{msIntegration.email}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-white/35 mt-1">
                  Outlook, Exchange — synchronisation automatique des CVs reçus par email
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isConnected ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sync.mutate()}
                  disabled={sync.isPending}
                  className="border-white/10 text-white/50 hover:text-white hover:bg-white/5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-2 ${sync.isPending ? 'animate-spin' : ''}`} />
                  {sync.isPending ? 'Sync...' : 'Synchroniser'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => disconnectMutation.mutate(msIntegration.id)}
                  className="border-rose-500/20 text-rose-400/60 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30"
                >
                  Déconnecter
                </Button>
              </>
            ) : (
              <Button size="sm" asChild>
                <a href="/api/microsoft/auth">
                  <Plug className="w-4 h-4 mr-2" />
                  Connecter Microsoft
                </a>
              </Button>
            )}
          </div>
        </div>

        {isConnected && (
          <div className="mt-5 pt-4 border-t border-white/5 grid grid-cols-3 gap-4">
            <div className="bg-white/[0.03] rounded-lg p-3">
              <p className="text-2xl font-black text-primary">{emails.length}</p>
              <p className="text-xs text-white/35 mt-0.5">Emails analysés</p>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-3">
              <p className="text-2xl font-black text-emerald-400">{importedEmails.length}</p>
              <p className="text-xs text-white/35 mt-0.5">CVs importés</p>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-3">
              <p className="text-2xl font-black text-white/50">{emails.length - importedEmails.length}</p>
              <p className="text-xs text-white/35 mt-0.5">Sans CV</p>
            </div>
          </div>
        )}
      </div>

      {/* Google (coming soon) */}
      <div className="rounded-xl border border-white/4 bg-card/50 p-6 mb-6 opacity-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white/50">Google Workspace</h2>
              <span className="text-[10px] bg-white/5 text-white/25 px-2 py-0.5 rounded-full font-medium">Bientôt</span>
            </div>
            <p className="text-xs text-white/25 mt-0.5">Gmail, Google Drive — synchronisation des CVs reçus</p>
          </div>
        </div>
      </div>

      {/* Setup instructions */}
      {!isConnected && (
        <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-white/80 mb-2">Configuration requise</h3>
              <p className="text-xs text-white/45 mb-3">Pour connecter Microsoft 365, ajoutez ces variables dans votre <code className="text-primary bg-primary/10 px-1 rounded">.env.local</code> :</p>
              <pre className="text-xs bg-black/40 border border-white/8 rounded-lg p-3 text-emerald-400 font-mono overflow-x-auto">
{`MICROSOFT_CLIENT_ID=votre-client-id
MICROSOFT_CLIENT_SECRET=votre-secret
MICROSOFT_TENANT_ID=common`}
              </pre>
              <p className="text-xs text-white/35 mt-3">
                Créez une application sur <strong className="text-white/50">portal.azure.com</strong> → App registrations → New registration. Redirect URI : <code className="text-primary/80 text-[11px]">http://localhost:3000/api/microsoft/callback</code>. Permissions requises : <code className="text-[11px] text-white/40">Mail.Read, Mail.Send, offline_access, User.Read</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Email history */}
      {isConnected && emails.length > 0 && (
        <div className="rounded-xl border border-white/6 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/80">Historique des emails analysés</h3>
            <span className="text-xs text-white/30">{emails.length} emails</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white/25 uppercase tracking-widest">Expéditeur</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white/25 uppercase tracking-widest">Sujet</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white/25 uppercase tracking-widest">Reçu le</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white/25 uppercase tracking-widest">Résultat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {emails.slice(0, 20).map((email: any) => (
                <tr key={email.id} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-xs text-white/50">{email.expediteur || '—'}</td>
                  <td className="px-5 py-3 text-xs text-white/40 max-w-xs truncate">{email.sujet || '—'}</td>
                  <td className="px-5 py-3 text-xs text-white/30">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {email.recu_le ? new Date(email.recu_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {email.candidat_id ? (
                      <span className="text-[11px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                        {email.candidats?.prenom} {email.candidats?.nom} importé
                      </span>
                    ) : (
                      <span className="text-[11px] bg-white/5 text-white/25 px-2 py-0.5 rounded-full">
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
    </div>
  )
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white/40">Chargement...</div>}>
      <IntegrationsContent />
    </Suspense>
  )
}
