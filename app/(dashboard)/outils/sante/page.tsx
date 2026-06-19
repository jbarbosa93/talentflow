'use client'
// TalentFlow — Cockpit Santé système (v2.13) — lecture seule, João seul.
// Agrège /api/admin/system-health. Aucune action, aucune écriture.

import { useQuery } from '@tanstack/react-query'
import {
  Activity, HardDriveDownload, FileSignature, Mail, Clock,
  RefreshCw, AlertTriangle, CheckCircle2, MinusCircle, Loader2, ShieldAlert,
} from 'lucide-react'

type Health = {
  allowed: boolean
  generatedAt?: string
  onedrive?: {
    lastSync: string | null
    errors7d: number | null
    aTraiter: number | null
    errors: Array<{ nom_fichier: string; erreur: string | null; traite_le: string | null }>
  }
  reports?: {
    reportLinksActifs: number | null
    submissionsEnAttente: number | null
    submissionsCompletees7d: number | null
    signEnvoyeesNonSignees: number | null
    signTrainantes: Array<{ id: string; status: string; created_at: string | null; title: string | null }>
  }
  emails?: {
    envoyes7d: number | null
    natifs7d: number | null
    enFile: number | null
  }
  crons?: Array<{ name: string; label: string; schedule: string; lastRun: string | null; tracked: boolean; stale: boolean }>
  cronTrackingAvailable?: boolean
}

type Status = 'ok' | 'warn' | 'error' | 'neutral'
const COLORS: Record<Status, string> = { ok: '#22C55E', warn: '#F59E0B', error: '#EF4444', neutral: '#94A3B8' }

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'à l\'instant'
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'à l\'instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  return `il y a ${j} j`
}

const n = (v: number | null | undefined): string => (v == null ? '—' : String(v))

export default function SanteSystemePage() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<Health>({
    queryKey: ['system-health'],
    queryFn: async () => {
      const r = await fetch('/api/admin/system-health')
      if (!r.ok) throw new Error('fetch failed')
      return r.json()
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      <div className="d-page-header" style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={22} color="var(--primary)" />
            Santé système
          </h1>
          <p className="d-page-sub">
            Cockpit lecture seule — état des imports, rapports, emails et crons.
            {dataUpdatedAt > 0 && <> · mis à jour {relTime(new Date(dataUpdatedAt).toISOString())}</>}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px',
            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, var(--card))',
            color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}
        >
          {isFetching ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          Rafraîchir
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
          <Loader2 size={22} className="spin" /><div style={{ marginTop: 8, fontSize: 13 }}>Chargement…</div>
        </div>
      ) : !data?.allowed ? (
        <div style={{
          padding: 32, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface, var(--card))',
          display: 'flex', alignItems: 'center', gap: 12, color: 'var(--muted)',
        }}>
          <ShieldAlert size={20} color={COLORS.warn} />
          <span style={{ fontSize: 13 }}>Cockpit réservé à l'administrateur (João).</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
          <OneDriveCard d={data.onedrive!} />
          <ReportsCard d={data.reports!} />
          <EmailsCard d={data.emails!} />
          <CronsCard crons={data.crons || []} />
        </div>
      )}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ─── Briques UI ────────────────────────────────────────────────────────────────

function Card({ icon: Icon, title, status, children }: {
  icon: React.ElementType; title: string; status: Status; children: React.ReactNode
}) {
  const StatusIcon = status === 'ok' ? CheckCircle2 : status === 'neutral' ? MinusCircle : AlertTriangle
  return (
    <div style={{
      background: 'var(--surface, var(--card))', border: '1px solid var(--border)',
      borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: COLORS[status] + '1f', color: COLORS[status],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} />
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>{title}</div>
        <StatusIcon size={16} color={COLORS[status]} />
      </div>
      {children}
    </div>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Status }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: tone === 'neutral' ? 'var(--foreground)' : COLORS[tone] }}>{value}</span>
    </div>
  )
}

function IssueList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((t, i) => (
        <div key={i} style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</div>
      ))}
    </div>
  )
}

// ─── Cartes ──────────────────────────────────────────────────────────────────

function OneDriveCard({ d }: { d: NonNullable<Health['onedrive']> }) {
  const staleSync = !d.lastSync || Date.now() - new Date(d.lastSync).getTime() > 30 * 60_000
  const hasErrors = (d.errors7d ?? 0) > 0
  const status: Status = staleSync ? 'error' : hasErrors ? 'warn' : 'ok'
  return (
    <Card icon={HardDriveDownload} title="Imports CV / OneDrive" status={status}>
      <Metric label="Dernier sync" value={relTime(d.lastSync)} tone={staleSync ? 'error' : 'ok'} />
      <Metric label="Erreurs (7 j)" value={n(d.errors7d)} tone={hasErrors ? 'warn' : 'ok'} />
      <Metric label="Candidats à traiter" value={n(d.aTraiter)} />
      <IssueList items={d.errors.map(e => `⚠️ ${e.nom_fichier} — ${e.erreur || 'erreur'}`)} />
    </Card>
  )
}

function ReportsCard({ d }: { d: NonNullable<Health['reports']> }) {
  const trainantes = d.signTrainantes.length
  const status: Status = trainantes > 0 ? 'warn' : 'ok'
  return (
    <Card icon={FileSignature} title="Rapports & signatures" status={status}>
      <Metric label="Liens rapport actifs" value={n(d.reportLinksActifs)} />
      <Metric label="Rapports en attente" value={n(d.submissionsEnAttente)} />
      <Metric label="Finalisés (7 j)" value={n(d.submissionsCompletees7d)} tone="ok" />
      <Metric label="Enveloppes Sign non signées" value={n(d.signEnvoyeesNonSignees)} tone={trainantes > 0 ? 'warn' : 'neutral'} />
      <IssueList items={d.signTrainantes.map(e =>
        `🕓 ${e.title || 'Enveloppe'} — ${e.status}, ${relTime(e.created_at)}`)} />
    </Card>
  )
}

function EmailsCard({ d }: { d: NonNullable<Health['emails']> }) {
  const enFile = d.enFile ?? 0
  // Pas de statut 'erreur' dans cette table → on ne déclenche pas d'alerte rouge.
  const status: Status = enFile > 0 ? 'warn' : 'ok'
  return (
    <Card icon={Mail} title="Emails / envois (7 j)" status={status}>
      <Metric label="Confirmés envoyés" value={n(d.envoyes7d)} tone="ok" />
      <Metric label="Canal natif (WhatsApp/SMS)" value={n(d.natifs7d)} />
      <Metric label="En file d'attente" value={n(d.enFile)} tone={enFile > 0 ? 'warn' : 'neutral'} />
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        Les échecs d'envoi réels remontent à Sentry, pas dans cette table. « Canal natif » = liens WhatsApp/SMS (non confirmables).
      </div>
    </Card>
  )
}

function CronsCard({ crons }: { crons: NonNullable<Health['crons']> }) {
  const anyStale = crons.some(c => c.stale)
  const status: Status = anyStale ? 'error' : 'ok'
  return (
    <Card icon={Clock} title="Crons Vercel" status={status}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {crons.map(c => {
          const tone: Status = c.stale ? 'error' : c.tracked ? 'ok' : 'neutral'
          return (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: COLORS[tone], flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.label}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--muted)', flexShrink: 0 }}>
                {c.tracked ? relTime(c.lastRun) : c.schedule}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        Seul l'import OneDrive est tracé en base (dernier passage). Les autres affichent leur horaire planifié — un suivi exact nécessiterait une table de logs cron.
      </div>
    </Card>
  )
}
