'use client'
import { useState, useEffect } from 'react'
import { Shield, LogIn, LogOut, AlertTriangle, Clock, Monitor, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type LogEntry = {
  id: string
  user_email: string | null
  action: string
  ip: string | null
  user_agent: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const ACTION_META: Record<string, { label: string; icon: typeof LogIn; color: string; bg: string }> = {
  login_success:      { label: 'Connexion réussie',       icon: LogIn,        color: '#16A34A', bg: '#F0FDF4' },
  login_failed:       { label: 'Tentative échouée',       icon: AlertTriangle, color: '#DC2626', bg: '#FEF2F2' },
  login_otp_sent:     { label: 'Code OTP envoyé',         icon: Shield,       color: '#6366F1', bg: '#EEF2FF' },
  login_otp_verified: { label: 'OTP vérifié',             icon: Shield,       color: '#16A34A', bg: '#F0FDF4' },
  login_otp_failed:   { label: 'OTP incorrect',           icon: AlertTriangle, color: '#DC2626', bg: '#FEF2F2' },
  logout:             { label: 'Déconnexion',             icon: LogOut,       color: '#64748B', bg: '#F8FAFC' },
  session_timeout:    { label: 'Timeout inactivité',      icon: Clock,        color: '#D97706', bg: '#FFFBEB' },
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CH', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function parseUserAgent(ua: string | null) {
  if (!ua) return 'Inconnu'
  if (ua.includes('iPhone') || ua.includes('iPad')) return '📱 iOS'
  if (ua.includes('Android')) return '📱 Android'
  if (ua.includes('Mac')) return '💻 Mac'
  if (ua.includes('Windows')) return '🖥️ Windows'
  if (ua.includes('Linux')) return '🐧 Linux'
  return '🌐 Navigateur'
}

export default function SecuritePage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  const load = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await (supabase as any)
      .from('logs_acces')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data) setLogs(data as LogEntry[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'all' ? logs : logs.filter(l => l.action === filter)
  const failedCount = logs.filter(l => l.action === 'login_failed').length
  const successCount = logs.filter(l => l.action === 'login_success').length

  return (
    <div className="d-page" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <Shield size={22} color="var(--primary)" />
            Sécurité & Accès
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0 0' }}>
            Historique des 100 derniers événements d&apos;accès à la plateforme
          </p>
        </div>
        <button
          onClick={load}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
        >
          <RefreshCw size={14} />Actualiser
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Connexions réussies', value: successCount, color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
          { label: 'Tentatives échouées', value: failedCount,  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
          { label: 'Événements total',    value: logs.length,  color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: s.color, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtre */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[['all', 'Tous'], ['login_success', 'Connexions'], ['login_failed', 'Échecs'], ['logout', 'Déconnexions'], ['session_timeout', 'Timeouts']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            style={{
              padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              background: filter === val ? 'var(--foreground)' : 'var(--card)',
              color: filter === val ? 'white' : 'var(--muted)',
              border: `1.5px solid ${filter === val ? 'var(--foreground)' : 'var(--border)'}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="neo-empty" style={{ padding: '40px', border: '2px dashed #E8E0C8' }}>
          <div className="neo-empty-icon">🔒</div>
          <div className="neo-empty-title">Aucun événement</div>
          <div className="neo-empty-sub">Les connexions apparaîtront ici automatiquement</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(log => {
            const meta = ACTION_META[log.action] || { label: log.action, icon: Monitor, color: '#64748B', bg: '#F8FAFC' }
            const Icon = meta.icon
            return (
              <div
                key={log.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: 'var(--card)', border: '1.5px solid var(--border)',
                  borderRadius: 10, flexWrap: 'wrap',
                }}
              >
                {/* Icône action */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} color={meta.color} />
                </div>

                {/* Infos */}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {log.user_email || 'Inconnu'} · {parseUserAgent(log.user_agent)}
                  </div>
                </div>

                {/* IP */}
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: 'var(--secondary)', padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                  {log.ip || '—'}
                </div>

                {/* Date */}
                <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, textAlign: 'right' }}>
                  {formatDate(log.created_at)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
