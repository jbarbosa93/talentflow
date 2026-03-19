'use client'
import { useQuery } from '@tanstack/react-query'
import {
  LogIn, LogOut, UserPlus, UserMinus, Briefcase, FileUp,
  RefreshCw, Link2, Link2Off, GitBranch, Activity, Loader2
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
  login:                   { label: 'Connexion',           icon: LogIn,    color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  logout:                  { label: 'Déconnexion',         icon: LogOut,   color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  candidat_cree:           { label: 'Candidat créé',       icon: UserPlus, color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  candidat_supprime:       { label: 'Candidat supprimé',   icon: UserMinus,color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  offre_creee:             { label: 'Offre créée',         icon: Briefcase,color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  cv_importe:              { label: 'CV importé',          icon: FileUp,   color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  microsoft_sync:          { label: 'Sync Microsoft',      icon: RefreshCw,color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  microsoft_connecte:      { label: 'Microsoft connecté',  icon: Link2,    color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  microsoft_deconnecte:    { label: 'Microsoft déconnecté',icon: Link2Off, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  pipeline_etape_changee:  { label: 'Étape pipeline',      icon: GitBranch,color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
}

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

export default function LogsPage() {
  const { data: logs, isLoading, error } = useQuery<LogEntry[]>({
    queryKey: ['logs-activite'],
    queryFn: async () => {
      const res = await fetch('/api/logs')
      if (!res.ok) throw new Error('Erreur chargement logs')
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return (
    <div className="d-page" style={{ maxWidth: 960, paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Activity size={20} style={{ color: 'var(--primary)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
            Logs d&apos;activité
          </h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Historique des 100 dernières actions dans TalentFlow
        </p>
      </div>

      {/* Content */}
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 10 }}>
          <Loader2 size={22} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement des logs...</span>
          <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '14px 18px', color: '#EF4444', fontSize: 13 }}>
          Erreur lors du chargement des logs.
        </div>
      )}

      {!isLoading && !error && logs && (
        <div className="neo-card" style={{ padding: 0, overflow: 'hidden' }}>
          {logs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Aucun log enregistré pour le moment.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Date / Heure', 'Action', 'Utilisateur', 'Détails', 'IP'].map(col => (
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
                    const cfg = ACTION_CONFIG[log.action] || {
                      label: log.action, icon: Activity,
                      color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)',
                    }
                    const Icon = cfg.icon
                    return (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: idx < logs.length - 1 ? '1px solid var(--border)' : 'none',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* Date */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatDate(log.created_at)}
                          </span>
                        </td>

                        {/* Action badge */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', borderRadius: 20,
                            background: cfg.bg, color: cfg.color,
                            fontSize: 11, fontWeight: 700,
                          }}>
                            <Icon size={11} />
                            {cfg.label}
                          </span>
                        </td>

                        {/* Email */}
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 12, color: 'var(--foreground)', opacity: 0.7 }}>
                            {log.user_email || '—'}
                          </span>
                        </td>

                        {/* Détails */}
                        <td style={{ padding: '10px 16px', maxWidth: 280 }}>
                          <span style={{
                            fontSize: 11, color: 'var(--muted)',
                            display: 'block', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {formatDetails(log.details)}
                          </span>
                        </td>

                        {/* IP */}
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                            {log.ip || '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
