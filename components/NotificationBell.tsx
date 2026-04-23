'use client'
// components/NotificationBell.tsx — v1.9.84
// Cloche notifications unifiée (TopBar) — agrège pipeline_rappels + entretiens.
// Daily reminder : un rappel reste actif chaque jour tant qu'il n'est pas validé (done).
// Bouton "Fermer" → cache pour aujourd'hui (revient demain). Bouton "Valider" → done (historique).

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Bell, X, Check, ChevronRight, GitBranch, Calendar } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

type PipelineRappel = {
  id: string
  candidat_id: string
  rappel_at: string
  note: string | null
  done: boolean
  last_dismissed_at: string | null
  candidats: { id: string; nom: string; prenom: string | null; photo_url: string | null } | null
}

type EntretienRappel = {
  id: string
  titre: string | null
  candidat_id: string | null
  candidat_nom_manuel: string | null
  entreprise_nom: string | null
  poste: string | null
  date_heure: string
  rappel_date: string
  candidats: { nom: string; prenom: string | null } | null
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [bellRect, setBellRect] = useState<DOMRect | null>(null)
  const bellRef = useRef<HTMLButtonElement | null>(null)
  const queryClient = useQueryClient()

  const { data: pipelineData } = useQuery({
    queryKey: ['notif-bell-pipeline'],
    queryFn: async () => {
      const r = await fetch('/api/pipeline/rappels?notif=1')
      if (!r.ok) return { rappels: [] }
      return r.json()
    },
    refetchInterval: 60_000, // refresh chaque minute
    refetchOnWindowFocus: true,
  })

  const { data: entretienData } = useQuery({
    queryKey: ['notif-bell-entretiens'],
    queryFn: async () => {
      const r = await fetch('/api/entretiens/rappels')
      if (!r.ok) return { rappels: [] }
      return r.json()
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const pipelineRappels: PipelineRappel[] = pipelineData?.rappels ?? []
  const entretienRappels: EntretienRappel[] = entretienData?.rappels ?? []
  const total = pipelineRappels.length + entretienRappels.length

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notif-bell-pipeline'] })
    queryClient.invalidateQueries({ queryKey: ['notif-bell-entretiens'] })
    queryClient.invalidateQueries({ queryKey: ['pipeline-rappels'] })
    queryClient.invalidateQueries({ queryKey: ['entretiens-rappels-count'] })
  }, [queryClient])

  // Pipeline actions
  const dismissPipeline = async (id: string) => {
    await fetch('/api/pipeline/rappels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, last_dismissed_at: new Date().toISOString() }),
    })
    refresh()
  }
  const validatePipeline = async (id: string) => {
    await fetch('/api/pipeline/rappels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, done: true }),
    })
    refresh()
  }

  // Entretien actions
  const dismissEntretien = async (id: string) => {
    await fetch('/api/entretiens/rappels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'dismiss' }),
    })
    refresh()
  }
  const validateEntretien = async (id: string) => {
    await fetch('/api/entretiens/rappels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'done' }),
    })
    refresh()
  }

  const togglePopover = () => {
    if (open) { setOpen(false); return }
    if (bellRef.current) setBellRect(bellRef.current.getBoundingClientRect())
    setOpen(true)
  }

  // Fermer au clic extérieur (sur le backdrop)
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open])

  return (
    <>
      <button
        ref={bellRef}
        onClick={togglePopover}
        title={total > 0 ? `${total} alerte${total > 1 ? 's' : ''} en cours` : 'Aucune alerte'}
        style={{
          position: 'relative', width: 38, height: 38, borderRadius: 10,
          background: 'var(--secondary)', border: '1.5px solid var(--border)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: total > 0 ? 'var(--destructive)' : 'var(--muted-foreground)',
          transition: 'all 0.15s', flexShrink: 0,
        }}
      >
        <Bell size={16} />
        {total > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 18, height: 18, padding: '0 5px',
            borderRadius: 99, background: 'var(--destructive)', color: 'var(--destructive-foreground)',
            fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--background)',
          }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && bellRect && typeof document !== 'undefined' && createPortal(
        <NotifPopover
          bellRect={bellRect}
          pipelineRappels={pipelineRappels}
          entretienRappels={entretienRappels}
          onClose={() => setOpen(false)}
          onDismissPipeline={dismissPipeline}
          onValidatePipeline={validatePipeline}
          onDismissEntretien={dismissEntretien}
          onValidateEntretien={validateEntretien}
        />,
        document.body,
      )}
    </>
  )
}

function NotifPopover({
  bellRect, pipelineRappels, entretienRappels, onClose,
  onDismissPipeline, onValidatePipeline, onDismissEntretien, onValidateEntretien,
}: {
  bellRect: DOMRect
  pipelineRappels: PipelineRappel[]
  entretienRappels: EntretienRappel[]
  onClose: () => void
  onDismissPipeline: (id: string) => void
  onValidatePipeline: (id: string) => void
  onDismissEntretien: (id: string) => void
  onValidateEntretien: (id: string) => void
}) {
  const W = 380
  const H_MAX = 480
  // Position : sous la cloche, alignée à droite (cap au viewport)
  const x = Math.max(12, Math.min(window.innerWidth - W - 12, bellRect.right - W))
  const y = bellRect.bottom + 8

  const total = pipelineRappels.length + entretienRappels.length

  return (
    <>
      {/* Backdrop transparent qui ferme au clic */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }}
      />
      <div
        style={{
          position: 'fixed', left: x, top: y, width: W, maxHeight: H_MAX,
          background: 'var(--card)', border: '1.5px solid var(--border)',
          borderRadius: 14, boxShadow: '0 18px 48px rgba(0,0,0,0.22)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          zIndex: 9999,
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={14} color="var(--destructive)" />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)' }}>
              {total > 0 ? `${total} alerte${total > 1 ? 's' : ''} en cours` : 'Aucune alerte'}
            </span>
          </div>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} />
          </button>
        </div>

        {/* Contenu scrollable */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {total === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)' }}>
              Aucune alerte en cours.<br/>Tu seras notifié à la prochaine échéance.
            </div>
          ) : (
            <>
              {pipelineRappels.length > 0 && (
                <div>
                  <SectionHeader icon={GitBranch} label="Pipeline" count={pipelineRappels.length} />
                  {pipelineRappels.map(r => (
                    <RappelRow
                      key={r.id}
                      titre={r.candidats ? `${r.candidats.prenom || ''} ${r.candidats.nom}`.trim() : 'Candidat'}
                      sousTitre={r.note || 'Pas de note'}
                      date={r.rappel_at}
                      href={r.candidat_id ? `/candidats/${r.candidat_id}?from=pipeline` : null}
                      onDismiss={() => onDismissPipeline(r.id)}
                      onValidate={() => onValidatePipeline(r.id)}
                    />
                  ))}
                </div>
              )}
              {entretienRappels.length > 0 && (
                <div>
                  <SectionHeader icon={Calendar} label="Entretiens / Suivi" count={entretienRappels.length} />
                  {entretienRappels.map(r => {
                    const cand = r.candidats
                      ? `${r.candidats.prenom || ''} ${r.candidats.nom}`.trim()
                      : (r.candidat_nom_manuel || 'Candidat')
                    const sub = [r.poste, r.entreprise_nom].filter(Boolean).join(' · ') || (r.titre || '')
                    return (
                      <RappelRow
                        key={r.id}
                        titre={cand}
                        sousTitre={sub || 'Entretien'}
                        date={r.rappel_date}
                        href={r.candidat_id ? `/candidats/${r.candidat_id}?from=entretiens` : '/entretiens'}
                        onDismiss={() => onDismissEntretien(r.id)}
                        onValidate={() => onValidateEntretien(r.id)}
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--secondary)', fontSize: 11, color: 'var(--muted-foreground)', textAlign: 'center' }}>
          ✕ Fermer = revient demain · ✓ Valider = clôture définitive
        </div>
      </div>
    </>
  )
}

function SectionHeader({ icon: Icon, label, count }: { icon: React.ElementType; label: string; count: number }) {
  return (
    <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--secondary)', borderBottom: '1px solid var(--border)' }}>
      <Icon size={11} />
      {label} <span style={{ marginLeft: 'auto', color: 'var(--destructive)', fontSize: 10, fontWeight: 800 }}>{count}</span>
    </div>
  )
}

function RappelRow({
  titre, sousTitre, date, href, onDismiss, onValidate,
}: {
  titre: string
  sousTitre: string
  date: string
  href: string | null
  onDismiss: () => void
  onValidate: () => void
}) {
  const dt = useMemo(() => new Date(date), [date])
  const dateStr = dt.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const Body = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {titre}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
        {sousTitre}
      </div>
      <div style={{ fontSize: 10, color: 'var(--destructive)', fontWeight: 700, marginTop: 2 }}>
        📅 {dateStr}
      </div>
    </div>
  )

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      {href ? (
        <Link href={href} style={{ flex: 1, display: 'flex', alignItems: 'flex-start', textDecoration: 'none', gap: 6, minWidth: 0 }}>
          {Body}
          <ChevronRight size={12} color="var(--muted-foreground)" style={{ marginTop: 4, flexShrink: 0 }} />
        </Link>
      ) : Body}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button
          onClick={onValidate}
          title="Valider — clôture l'alerte (historique)"
          style={{
            padding: '4px 8px', borderRadius: 6, border: '1px solid var(--success)',
            background: 'var(--success-soft)', color: 'var(--success)',
            fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          <Check size={10} /> Valider
        </button>
        <button
          onClick={onDismiss}
          title="Fermer — revient demain"
          style={{
            padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--card)', color: 'var(--muted-foreground)',
            fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          <X size={10} /> Fermer
        </button>
      </div>
    </div>
  )
}
