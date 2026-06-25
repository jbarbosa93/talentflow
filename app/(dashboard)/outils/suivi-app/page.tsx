'use client'
// TalentFlow — Suivi de l'app (usage candidats) — lecture seule.
// Agrège /api/admin/app-usage : comptes portail candidat, statut d'activité,
// notifications push activées. Aucune action, aucune écriture.

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Smartphone, Users, KeyRound, LogIn, Activity, BellOff,
  Bell, RefreshCw, Loader2, Search,
} from 'lucide-react'

// ─── Types (miroir de la réponse API) ──────────────────────────────────────────

type Statut = 'jamais_active' | 'inscrit_jamais_connecte' | 'actif' | 'inactif'

type CandidatUsage = {
  id: string
  nom: string
  email: string
  statut: Statut
  last_login_at: string | null
  invited_at: string | null
  is_revoked: boolean
  notifs: boolean
}

type AppUsage = {
  kpis: {
    total: number
    compte_cree: number
    deja_connecte: number
    actifs_7j: number
    jamais_active: number
    notifs_actives: number
  }
  candidats: CandidatUsage[]
}

// ─── Badges de statut (couleurs douces rgba — autorisé pour les pastilles) ──────

const STATUT_META: Record<Statut, { label: string; fg: string; bg: string }> = {
  actif:                    { label: 'Actif',                fg: '#16A34A', bg: 'rgba(34,197,94,0.14)' },
  inactif:                  { label: 'Inactif',              fg: '#D97706', bg: 'rgba(245,158,11,0.16)' },
  inscrit_jamais_connecte:  { label: 'Jamais connecté',      fg: '#64748B', bg: 'rgba(100,116,139,0.16)' },
  jamais_active:            { label: 'Jamais activé',        fg: '#DC2626', bg: 'rgba(239,68,68,0.14)' },
}

// Filtres disponibles (boutons).
const FILTRES: Array<{ key: 'tous' | Statut; label: string }> = [
  { key: 'tous', label: 'Tous' },
  { key: 'actif', label: 'Actifs' },
  { key: 'inactif', label: 'Inactifs' },
  { key: 'inscrit_jamais_connecte', label: 'Jamais connectés' },
  { key: 'jamais_active', label: 'Jamais activés' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Format fr-CH compact : « 24/06 à 23:37 » ou « jamais ».
function formatLogin(iso: string | null): string {
  if (!iso) return 'jamais'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'jamais'
  const date = d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })
  const heure = d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
  return `${date} à ${heure}`
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuiviAppPage() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<AppUsage>({
    queryKey: ['app-usage'],
    queryFn: async () => {
      const r = await fetch('/api/admin/app-usage')
      if (!r.ok) throw new Error('fetch failed')
      return r.json()
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const [filtre, setFiltre] = useState<'tous' | Statut>('tous')
  const [search, setSearch] = useState('')

  // Liste filtrée + triée (dernière connexion décroissante, « jamais » en bas).
  const liste = useMemo(() => {
    let rows = data?.candidats ?? []
    if (filtre !== 'tous') rows = rows.filter(c => c.statut === filtre)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(c =>
        c.nom.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
      )
    }
    return [...rows].sort((a, b) => {
      const ta = a.last_login_at ? new Date(a.last_login_at).getTime() : 0
      const tb = b.last_login_at ? new Date(b.last_login_at).getTime() : 0
      return tb - ta
    })
  }, [data, filtre, search])

  const k = data?.kpis

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Header */}
      <div className="d-page-header" style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Smartphone size={22} color="var(--primary)" />
            Suivi de l&apos;app
          </h1>
          <p className="d-page-sub">
            Usage de l&apos;app par les candidats — comptes, connexions et notifications push.
            {dataUpdatedAt > 0 && <> · mis à jour {formatLogin(new Date(dataUpdatedAt).toISOString())}</>}
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
      ) : (
        <>
          {/* ─── KPIs ─────────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
            <KpiCard icon={Users}    label="Comptes candidats"   value={k?.total ?? 0}          color="#6366F1" />
            <KpiCard icon={KeyRound} label="Comptes créés"       value={k?.compte_cree ?? 0}    color="#0EA5E9" />
            <KpiCard icon={LogIn}    label="Déjà connectés"      value={k?.deja_connecte ?? 0}  color="#10B981" />
            <KpiCard icon={Activity} label="Actifs (7 j)"        value={k?.actifs_7j ?? 0}      color="#22C55E" />
            <KpiCard icon={BellOff}  label="Jamais activés"      value={k?.jamais_active ?? 0}  color="#EF4444" />
            <KpiCard icon={Bell}     label="Notifs activées"     value={k?.notifs_actives ?? 0} color="#EAB308" />
          </div>

          {/* ─── Filtres + recherche ───────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {FILTRES.map(f => {
              const active = filtre === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setFiltre(f.key)}
                  style={{
                    height: 32, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    background: active ? 'var(--primary)' : 'var(--surface, var(--card))',
                    color: active ? 'var(--primary-foreground, #fff)' : 'var(--foreground)',
                    transition: 'all 0.12s',
                  }}
                >
                  {f.label}
                </button>
              )
            })}
            <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 200 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un candidat…"
                style={{
                  height: 32, width: '100%', padding: '0 10px 0 32px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface, var(--card))',
                  color: 'var(--foreground)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
          </div>

          {/* ─── Tableau candidats ─────────────────────────────────────────── */}
          <div style={{
            background: 'var(--surface, var(--card))', border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            {/* En-tête */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) 1fr 120px 70px',
              gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border)',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
              color: 'var(--muted)',
            }}>
              <span>Candidat</span>
              <span>Statut</span>
              <span>Dernière connexion</span>
              <span style={{ textAlign: 'center' }}>Notifs</span>
            </div>

            {liste.length === 0 ? (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Aucun candidat pour ce filtre.
              </div>
            ) : (
              liste.map((c, i) => {
                const meta = STATUT_META[c.statut]
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) 1fr 120px 70px',
                      gap: 12, padding: '12px 16px', alignItems: 'center',
                      borderBottom: i < liste.length - 1 ? '1px solid var(--border)' : 'none',
                      opacity: c.is_revoked ? 0.55 : 1,
                    }}
                  >
                    {/* Candidat (nom + email) */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        {c.nom}
                        {c.is_revoked && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5,
                            background: 'rgba(100,116,139,0.16)', color: '#64748B',
                            textTransform: 'uppercase', letterSpacing: '0.03em',
                          }}>
                            Révoqué
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11.5, color: 'var(--muted)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {c.email}
                      </div>
                    </div>

                    {/* Badge statut */}
                    <div>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 99,
                        fontSize: 11.5, fontWeight: 700,
                        background: meta.bg, color: meta.fg,
                      }}>
                        {meta.label}
                      </span>
                    </div>

                    {/* Dernière connexion */}
                    <div style={{
                      fontSize: 12, color: c.last_login_at ? 'var(--foreground)' : 'var(--muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {formatLogin(c.last_login_at)}
                    </div>

                    {/* Pictogramme notif */}
                    <div style={{ textAlign: 'center', fontSize: 16 }} title={c.notifs ? 'Notifications activées' : 'Pas de notifications'}>
                      {c.notifs ? '🔔' : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ─── Carte KPI ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string
}) {
  return (
    <div style={{
      background: 'var(--surface, var(--card))', border: '1px solid var(--border)',
      borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: color + '1f', color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}
