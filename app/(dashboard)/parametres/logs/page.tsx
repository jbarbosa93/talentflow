'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  LogIn, UserPlus, UserMinus, FileUp,
  RefreshCw, GitBranch, Activity, Loader2,
  AlertCircle, Copy, FolderOpen, Filter, ChevronDown, XCircle,
  Mail, MessageCircle, UserCheck, Tag, Send, FolderSync,
} from 'lucide-react'

type ActiviteEntry = {
  id: string
  type: string
  titre: string
  description: string | null
  candidat_id: string | null
  candidat_nom: string | null
  user_name: string
  metadata: Record<string, unknown> | string | null
  created_at: string
}

function parseMeta(raw: Record<string, unknown> | string | null): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return raw
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  cv_importe:        { label: 'CV importé',       icon: FileUp,        color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  cv_actualise:      { label: 'CV actualisé',      icon: RefreshCw,     color: '#0EA5E9', bg: 'rgba(14,165,233,0.12)' },
  cv_doublon:        { label: 'Doublon',           icon: Copy,          color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  cv_erreur:         { label: 'Erreur import',     icon: AlertCircle,   color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  onedrive_sync:     { label: 'Sync OneDrive',     icon: FolderSync,    color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  connexion:         { label: 'Connexion',         icon: LogIn,         color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  statut_change:     { label: 'Pipeline',          icon: GitBranch,     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  candidat_importe:  { label: 'Import candidat',   icon: UserPlus,      color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  candidat_modifie:  { label: 'Modification',      icon: UserMinus,     color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
  candidat_valide:   { label: 'Validé',            icon: UserCheck,     color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  candidat_fusionne: { label: 'Fusion',            icon: Copy,          color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  email_envoye:      { label: 'Email',             icon: Mail,          color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  email_envoye_masse:{ label: 'Email en masse',    icon: Send,          color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  whatsapp_envoye:   { label: 'WhatsApp',          icon: MessageCircle, color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  metier_assigne:    { label: 'Métier assigné',    icon: Tag,           color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
}

const IMPORT_TYPES = 'cv_importe,cv_doublon,cv_erreur'

function formatDate(isoStr: string) {
  const d = new Date(isoStr)
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatMeta(meta: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return '—'
  return Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 4)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${(v as string[]).join(', ')}]`
      return `${k}: ${v}`
    })
    .join(' · ')
}

type VueType = 'tout' | 'imports' | 'erreurs'

export default function LogsPage() {
  const [vue, setVue] = useState<VueType>('tout')
  const [allLogs, setAllLogs] = useState<ActiviteEntry[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  // Stats counts
  const [totalImports, setTotalImports] = useState(0)
  const [totalErreurs, setTotalErreurs] = useState(0)

  const router = useRouter()

  const fetchPage = useCallback(async (vueType: VueType, page: number, append: boolean) => {
    setIsLoading(true)
    setHasError(false)
    try {
      let typeParam = ''
      if (vueType === 'imports') typeParam = `&type=${IMPORT_TYPES}`
      else if (vueType === 'erreurs') typeParam = '&type=cv_erreur'
      const res = await fetch(`/api/activites?per_page=100&page=${page}${typeParam}`)
      if (!res.ok) throw new Error()
      const { activites, total: t } = await res.json()
      setAllLogs(prev => append ? [...prev, ...(activites || [])] : (activites || []))
      setTotal(t || 0)
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch stats separately
  useEffect(() => {
    fetch(`/api/activites?type=${IMPORT_TYPES}&per_page=1&page=1`)
      .then(r => r.json()).then(({ total: t }) => setTotalImports(t || 0)).catch(() => {})
    fetch('/api/activites?type=cv_erreur&per_page=1&page=1')
      .then(r => r.json()).then(({ total: t }) => setTotalErreurs(t || 0)).catch(() => {})
  }, [])

  // Fetch when vue changes — reset
  useEffect(() => {
    setCurrentPage(1)
    fetchPage(vue, 1, false)
  }, [vue, fetchPage])

  const handleChangeVue = (v: VueType) => {
    if (v !== vue) setVue(v)
  }

  const loadMore = () => {
    const next = currentPage + 1
    setCurrentPage(next)
    fetchPage(vue, next, true)
  }

  const hasMore = allLogs.length < total

  return (
    <div className="d-page" style={{ maxWidth: 1060, paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Activity size={20} style={{ color: 'var(--primary)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
            Logs d&apos;activité
          </h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Historique complet des actions dans TalentFlow ({total} enregistrement{total > 1 ? 's' : ''})
        </p>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'tout' as VueType,    label: 'Toutes les actions', icon: Filter,  count: null },
          { key: 'imports' as VueType, label: 'Imports CV',         icon: FolderOpen, count: totalImports },
          { key: 'erreurs' as VueType, label: 'Erreurs import',     icon: XCircle, count: totalErreurs },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => handleChangeVue(tab.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1.5px solid',
              borderColor: vue === tab.key ? (tab.key === 'erreurs' ? '#EF4444' : 'var(--foreground)') : 'var(--border)',
              background: vue === tab.key ? (tab.key === 'erreurs' ? '#FEF2F2' : 'var(--foreground)') : 'var(--card)',
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

      {/* Erreurs banner */}
      {vue === 'erreurs' && totalErreurs > 0 && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 12, padding: '14px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertCircle size={20} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#991B1B', margin: 0 }}>
                {totalErreurs} événement{totalErreurs > 1 ? 's' : ''} d&apos;erreur enregistré{totalErreurs > 1 ? 's' : ''}
              </p>
              <p style={{ fontSize: 12, color: '#B91C1C', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Certains CVs n&apos;ont pas pu être importés. Pour chaque ligne, cliquez sur le candidat pour vérifier s&apos;il a quand même été créé.
                <br />
                <span style={{ opacity: 0.8 }}>Note : le compteur inclut les tentatives multiples — le nombre réel de fichiers en erreur est inférieur.</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading && allLogs.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 10 }}>
          <Loader2 size={22} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement des logs...</span>
        </div>
      )}

      {hasError && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '14px 18px', color: '#EF4444', fontSize: 13 }}>
          Erreur lors du chargement des logs.
        </div>
      )}

      {!isLoading && !hasError && allLogs.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--card)', borderRadius: 12, border: '1.5px solid var(--border)' }}>
          Aucun log enregistré pour le moment.
        </div>
      )}

      {allLogs.length > 0 && (
        <>
          {vue === 'tout' ? (
            <div className="neo-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Date / Heure', 'Type', 'Utilisateur', 'Détails'].map(col => (
                        <th key={col} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allLogs.map((log, idx) => {
                      const cfg = TYPE_CONFIG[log.type] || { label: log.type, icon: Activity, color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' }
                      const Icon = cfg.icon
                      const meta = parseMeta(log.metadata)
                      const detail = log.description || formatMeta(meta)
                      return (
                        <tr
                          key={log.id}
                          style={{ borderBottom: idx < allLogs.length - 1 ? '1px solid var(--border)' : 'none', cursor: log.candidat_id ? 'pointer' : 'default' }}
                          onClick={() => { if (log.candidat_id) router.push(`/candidats/${log.candidat_id}`) }}
                        >
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(log.created_at)}</td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700 }}>
                              <Icon size={11} />{cfg.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--foreground)', opacity: 0.7, whiteSpace: 'nowrap' }}>{log.user_name || '—'}</td>
                          <td style={{ padding: '10px 16px', maxWidth: 320, fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.titre}{detail && detail !== '—' ? ` — ${detail}` : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <LogGroupedView logs={allLogs} />
          )}

          {/* Charger plus */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {allLogs.length} sur {total} affiché{allLogs.length > 1 ? 's' : ''}
            </span>
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={isLoading}
                style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: isLoading ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: isLoading ? 0.6 : 1 }}
              >
                {isLoading
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Chargement...</>
                  : <><ChevronDown size={14} /> Charger 100 de plus</>
                }
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

function LogGroupedView({ logs }: { logs: ActiviteEntry[] }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const router = useRouter()

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Grouper par date + heure (arrondi à 10 min)
  const groups: { label: string; key: string; logs: ActiviteEntry[] }[] = []
  const groupMap = new Map<string, ActiviteEntry[]>()
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
        const gImported = group.logs.filter(l => l.type === 'cv_importe').length
        const gErrors   = group.logs.filter(l => l.type === 'cv_erreur').length
        const gDoublons = group.logs.filter(l => l.type === 'cv_doublon').length
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
                {gImported > 0 && <span style={{ padding: '2px 8px', borderRadius: 99, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}>✓ {gImported}</span>}
                {gErrors   > 0 && <span style={{ padding: '2px 8px', borderRadius: 99, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>✗ {gErrors}</span>}
                {gDoublons > 0 && <span style={{ padding: '2px 8px', borderRadius: 99, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>⚠ {gDoublons}</span>}
              </div>
              <ChevronDown size={16} color="var(--muted)" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
            </button>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', maxHeight: 500, overflowY: 'auto' }}>
                {group.logs.map(log => {
                  const cfg = TYPE_CONFIG[log.type] || { label: log.type, icon: Activity, color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' }
                  const Icon = cfg.icon
                  const meta = parseMeta(log.metadata)
                  const fichier  = String(meta.fichier  || '')
                  const dossier  = String(meta.dossier  || '')
                  const erreur   = String(meta.erreur   || log.description || '')
                  const candidat = log.candidat_nom || String(meta.candidat || '')
                  const isError   = log.type === 'cv_erreur'
                  const isDoublon = log.type === 'cv_doublon'
                  const time = new Date(log.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

                  return (
                    <div
                      key={log.id}
                      onClick={() => { if (log.candidat_id) router.push(`/candidats/${log.candidat_id}`) }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 18px',
                        borderBottom: '1px solid var(--border)',
                        background: isError ? '#FEF2F2' : isDoublon ? '#FFFDF5' : 'transparent',
                        cursor: log.candidat_id ? 'pointer' : 'default',
                      }}
                    >
                      <div style={{ flexShrink: 0, marginTop: 2 }}>
                        <Icon size={13} color={cfg.color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fichier || candidat || log.titre || '—'}
                        </div>
                        {dossier && (
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <FolderOpen size={10} /> {dossier}
                          </div>
                        )}
                        {isError && !!erreur && (
                          <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' }}>
                            {erreur}
                          </div>
                        )}
                        {!isError && !isDoublon && !!candidat && fichier && (
                          <div style={{ fontSize: 11, color: '#16A34A', marginTop: 1 }}>→ {candidat}</div>
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
