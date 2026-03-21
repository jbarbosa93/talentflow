'use client'
import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  LogIn, LogOut, UserPlus, UserMinus, Briefcase, FileUp,
  RefreshCw, Link2, Link2Off, GitBranch, Activity, Loader2,
  AlertCircle, Copy, FolderOpen, Filter, ChevronDown, XCircle, Search,
} from 'lucide-react'

type LogEntry = {
  id: string
  action: string
  user_id: string | null
  user_email: string | null
  details: Record<string, unknown>
  ip: string | null
  created_at: string
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  login:                   { label: 'Connexion',           icon: LogIn,       color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  logout:                  { label: 'Deconnexion',         icon: LogOut,      color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  candidat_cree:           { label: 'Candidat cree',       icon: UserPlus,    color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  candidat_supprime:       { label: 'Candidat supprime',   icon: UserMinus,   color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  offre_creee:             { label: 'Offre creee',         icon: Briefcase,   color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  cv_importe:              { label: 'CV importe',          icon: FileUp,      color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  cv_doublon:              { label: 'CV doublon',          icon: Copy,        color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  cv_erreur:               { label: 'CV erreur',           icon: AlertCircle, color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  microsoft_sync:          { label: 'Sync Microsoft',      icon: RefreshCw,   color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  microsoft_connecte:      { label: 'Microsoft connecte',  icon: Link2,       color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  microsoft_deconnecte:    { label: 'Microsoft deconnecte',icon: Link2Off,    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  pipeline_etape_changee:  { label: 'Etape pipeline',      icon: GitBranch,   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
}

const IMPORT_ACTIONS = 'cv_importe,cv_doublon,cv_erreur'

function formatDate(isoStr: string) {
  const d = new Date(isoStr)
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatDetails(details: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return '—'
  return Object.entries(details)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${(v as string[]).join(', ')}]`
      return `${k}: ${v}`
    })
    .join(' · ')
}

type VueType = 'tout' | 'imports' | 'erreurs'

// Extrait le nom sans extension pour la recherche candidat
function nomRecherche(fichier: string): string {
  return fichier
    .replace(/\.[^.]+$/, '')           // enlève extension
    .replace(/^\d+_/, '')              // enlève timestamp préfixé
    .replace(/[_-]+/g, ' ')           // remplace _ et - par espace
    .trim()
}

export default function LogsPage() {
  const [vue, setVue] = useState<VueType>('tout')
  const [pageSize] = useState(100)
  const [loadedPages, setLoadedPages] = useState(1)
  const queryClient = useQueryClient()
  const router = useRouter()

  const buildUrl = useCallback(() => {
    const limit = pageSize * loadedPages
    let url = `/api/logs?limit=${limit}&offset=0`
    if (vue === 'imports') url += `&actions=${IMPORT_ACTIONS}`
    else if (vue === 'erreurs') url += `&action=cv_erreur`
    return url
  }, [vue, loadedPages, pageSize])

  const { data: response, isLoading, error } = useQuery<{ data: LogEntry[]; total: number }>({
    queryKey: ['logs-activite', vue, loadedPages],
    queryFn: async () => {
      const res = await fetch(buildUrl())
      if (!res.ok) throw new Error('Erreur chargement logs')
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const logs = response?.data || []
  const total = response?.total || 0
  const hasMore = logs.length < total

  // Stats for the current view
  const importStats = vue !== 'tout' ? null : undefined // We'll compute from a separate query

  // Get import stats separately
  const { data: statsResponse } = useQuery<{ data: LogEntry[]; total: number }>({
    queryKey: ['logs-stats-imports'],
    queryFn: async () => {
      const res = await fetch(`/api/logs?limit=1&offset=0&actions=${IMPORT_ACTIONS}`)
      if (!res.ok) throw new Error('err')
      return res.json()
    },
    staleTime: 30_000,
  })
  const { data: statsErreurs } = useQuery<{ data: LogEntry[]; total: number }>({
    queryKey: ['logs-stats-erreurs'],
    queryFn: async () => {
      const res = await fetch(`/api/logs?limit=1&offset=0&action=cv_erreur`)
      if (!res.ok) throw new Error('err')
      return res.json()
    },
    staleTime: 30_000,
  })

  const totalImports = statsResponse?.total || 0
  const totalErreurs = statsErreurs?.total || 0

  const handleChangeVue = (v: VueType) => {
    setVue(v)
    setLoadedPages(1)
  }

  const loadMore = () => {
    setLoadedPages(p => p + 1)
  }

  return (
    <div className="d-page" style={{ maxWidth: 1060, paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Activity size={20} style={{ color: 'var(--primary)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
            Logs d&apos;activite
          </h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Historique complet des actions dans TalentFlow ({total} enregistrement{total > 1 ? 's' : ''})
        </p>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'tout' as VueType,    label: 'Toutes les actions', icon: Filter, count: null },
          { key: 'imports' as VueType, label: 'Imports CV', icon: FolderOpen, count: totalImports },
          { key: 'erreurs' as VueType, label: 'Erreurs import', icon: XCircle, count: totalErreurs },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => handleChangeVue(tab.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1.5px solid',
              borderColor: vue === tab.key ? (tab.key === 'erreurs' ? '#EF4444' : 'var(--foreground)') : 'var(--border)',
              background: vue === tab.key ? (tab.key === 'erreurs' ? '#FEF2F2' : 'var(--foreground)') : 'white',
              color: vue === tab.key ? (tab.key === 'erreurs' ? '#EF4444' : 'white') : 'var(--muted)',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <tab.icon size={12} />
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span style={{
                background: tab.key === 'erreurs' ? '#EF4444' : 'var(--primary)',
                color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 800,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Erreurs summary banner */}
      {vue === 'erreurs' && totalErreurs > 0 && (
        <div style={{
          background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 12,
          padding: '14px 20px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertCircle size={20} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#991B1B', margin: 0 }}>
                {totalErreurs} événements d&apos;erreur enregistrés
              </p>
              <p style={{ fontSize: 12, color: '#B91C1C', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Certains CVs n&apos;ont pas pu être importés. Pour chaque ligne, cliquez <strong>Chercher dans la base</strong> pour vérifier si le candidat a quand même été créé.
                <br />
                <span style={{ opacity: 0.8 }}>Note : le compteur inclut les tentatives multiples — le nombre réel de fichiers en erreur est inférieur.</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 10 }}>
          <Loader2 size={22} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement des logs...</span>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '14px 18px', color: '#EF4444', fontSize: 13 }}>
          Erreur lors du chargement des logs.
        </div>
      )}

      {!isLoading && !error && (
        <>
          {logs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--card)', borderRadius: 12, border: '1.5px solid var(--border)' }}>
              Aucun log enregistré pour le moment.
            </div>
          ) : vue === 'tout' ? (
            /* Vue toutes actions — tableau classique */
            <div className="neo-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Date / Heure', 'Action', 'Utilisateur', 'Détails', 'IP'].map(col => (
                        <th key={col} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, idx) => {
                      const cfg = ACTION_CONFIG[log.action] || { label: log.action, icon: Activity, color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' }
                      const Icon = cfg.icon
                      return (
                        <tr key={log.id} style={{ borderBottom: idx < logs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(log.created_at)}</td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700 }}>
                              <Icon size={11} />{cfg.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--foreground)', opacity: 0.7 }}>{log.user_email || '—'}</td>
                          <td style={{ padding: '10px 16px', maxWidth: 280, fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDetails(log.details)}</td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{log.ip || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Vue imports/erreurs — groupé par session */
            <LogGroupedView logs={logs} />
          )}

          {/* Charger plus */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {logs.length} sur {total} affiché{logs.length > 1 ? 's' : ''}
            </span>
            {hasMore && (
              <button onClick={loadMore} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1.5px solid var(--border)', background: 'white', color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ChevronDown size={14} /> Charger 100 de plus
              </button>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

// ─── Vue groupée par session d'import ────────────────────────────────────────

function LogGroupedView({ logs }: { logs: LogEntry[] }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Grouper par date + heure (arrondi à 10 min pour regrouper les sessions)
  const groups: { label: string; key: string; logs: LogEntry[] }[] = []
  const groupMap = new Map<string, LogEntry[]>()
  for (const log of logs) {
    const d = new Date(log.created_at)
    const min10 = Math.floor(d.getMinutes() / 10) * 10
    const key = `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${d.getHours().toString().padStart(2, '0')}:${min10.toString().padStart(2, '0')}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(log)
  }
  groupMap.forEach((gLogs, key) => groups.push({ label: key, key, logs: gLogs }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map(group => {
        const gImported = group.logs.filter(l => l.action === 'cv_importe').length
        const gErrors = group.logs.filter(l => l.action === 'cv_erreur').length
        const gDoublons = group.logs.filter(l => l.action === 'cv_doublon').length
        const isOpen = openGroups.has(group.key)

        return (
          <div key={group.key} style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <button
              onClick={() => toggleGroup(group.key)}
              style={{ width: '100%', padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}
            >
              <FileUp size={14} color="var(--muted)" />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                  Import du {group.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  {group.logs.length} événement{group.logs.length > 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {gImported > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                    ✓ {gImported}
                  </span>
                )}
                {gErrors > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                    ✗ {gErrors}
                  </span>
                )}
                {gDoublons > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>
                    ⚠ {gDoublons}
                  </span>
                )}
              </div>
              <ChevronDown size={16} color="var(--muted)" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
            </button>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', maxHeight: 500, overflowY: 'auto' }}>
                {group.logs.map(log => {
                  const cfg = ACTION_CONFIG[log.action] || { label: log.action, icon: Activity, color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' }
                  const Icon = cfg.icon
                  const d = log.details
                  const fichier = (d.fichier as string) || ''
                  const dossier = (d.dossier as string) || ''
                  const isError = log.action === 'cv_erreur'
                  const isDoublon = log.action === 'cv_doublon'
                  const time = new Date(log.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

                  return (
                    <div key={log.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 18px',
                      borderBottom: '1px solid var(--border)',
                      background: isError ? '#FEF2F2' : isDoublon ? '#FFFDF5' : 'transparent',
                    }}>
                      <div style={{ flexShrink: 0, marginTop: 2 }}>
                        <Icon size={13} color={cfg.color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fichier || (d.candidat as string) || '—'}
                        </div>
                        {dossier && (
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <FolderOpen size={10} /> {dossier}
                          </div>
                        )}
                        {isError && d.erreur && (
                          <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' }}>
                            {String(d.erreur)}
                          </div>
                        )}
                        {!isError && !isDoublon && d.candidat && (
                          <div style={{ fontSize: 11, color: '#16A34A', marginTop: 1 }}>→ {String(d.candidat)}</div>
                        )}
                        {isDoublon && (
                          <div style={{ fontSize: 11, color: '#D97706', marginTop: 1 }}>Doublon détecté</div>
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {time}
                      </span>
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
