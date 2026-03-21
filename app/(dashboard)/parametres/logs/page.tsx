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
          <div className="neo-card" style={{ padding: 0, overflow: 'hidden' }}>
            {logs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Aucun log enregistre pour le moment.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {(vue === 'tout'
                        ? ['Date / Heure', 'Action', 'Utilisateur', 'Details', 'IP']
                        : ['Date / Heure', 'Statut', 'Nom du fichier', 'Dossier', 'Détail', '']
                      ).map(col => (
                        <th key={col} style={{
                          padding: '12px 16px', textAlign: 'left',
                          fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                          whiteSpace: 'nowrap',
                        }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, idx) => {
                      const cfg = ACTION_CONFIG[log.action] || { label: log.action, icon: Activity, color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' }
                      const Icon = cfg.icon
                      const d = log.details

                      if (vue !== 'tout') {
                        const isError = log.action === 'cv_erreur'
                        const fichier = (d.fichier as string) || ''
                        const searchTerm = fichier ? nomRecherche(fichier) : ((d.candidat as string) || '')
                        return (
                          <tr key={log.id} style={{
                            borderBottom: idx < logs.length - 1 ? '1px solid var(--border)' : 'none',
                            background: isError ? 'rgba(239,68,68,0.03)' : 'transparent',
                          }}>
                            <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                              {formatDate(log.created_at)}
                            </td>
                            <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700 }}>
                                <Icon size={10} />{cfg.label}
                              </span>
                            </td>
                            {/* Nom du fichier — colonne principale */}
                            <td style={{ padding: '10px 16px', maxWidth: 260 }}>
                              {fichier ? (
                                <div>
                                  <span style={{ fontSize: 12, color: 'var(--foreground)', fontWeight: 700, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {fichier}
                                  </span>
                                  {!isError && !!d.candidat && (
                                    <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 1 }}>
                                      → {String(d.candidat)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <FolderOpen size={11} />{(d.dossier as string) || '—'}
                              </span>
                            </td>
                            {/* Détail erreur ou email */}
                            <td style={{ padding: '10px 16px', maxWidth: 260 }}>
                              {isError && d.erreur ? (
                                <span style={{ fontSize: 11, color: '#EF4444', display: 'block', lineHeight: 1.4 }}>
                                  {String(d.erreur).length > 100 ? String(d.erreur).slice(0, 100) + '…' : String(d.erreur)}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                  {d.email && d.email !== '—' ? String(d.email) : '—'}
                                </span>
                              )}
                            </td>
                            {/* Bouton Chercher dans la base */}
                            <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                              {searchTerm && (
                                <button
                                  onClick={() => router.push(`/candidats?search=${encodeURIComponent(searchTerm)}`)}
                                  title={`Rechercher "${searchTerm}" dans les candidats`}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                                    border: '1.5px solid rgba(99,102,241,0.3)',
                                    background: 'rgba(99,102,241,0.08)', color: '#6366F1',
                                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                  }}
                                >
                                  <Search size={11} />Chercher
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      }

                      // All actions view
                      return (
                        <tr key={log.id} style={{ borderBottom: idx < logs.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(log.created_at)}</span>
                          </td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700 }}>
                              <Icon size={11} />{cfg.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ fontSize: 12, color: 'var(--foreground)', opacity: 0.7 }}>{log.user_email || '—'}</span>
                          </td>
                          <td style={{ padding: '10px 16px', maxWidth: 280 }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {formatDetails(log.details)}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{log.ip || '—'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Load more / stats */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {logs.length} sur {total} affiche{logs.length > 1 ? 's' : ''}
            </span>
            {hasMore && (
              <button
                onClick={loadMore}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  border: '1.5px solid var(--border)', background: 'white', color: 'var(--foreground)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
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
