'use client'

// TalentFlow — Portail Client : onglet "Rapports d'heures"
// v2.7.2
//
// Affiche les rapports groupés par candidat puis par semaine. 3 états :
//   ⏳ candidate_signed → "À valider" (amber) — bouton "Valider →"
//   ✅ completed        → "Validé"    (vert)  — boutons PDF + Télécharger
//   ✏️ draft            → "Brouillon" (gris)  — lecture seule
//
// Filtres : Tous / À valider (default si count>0) / Validés
// Si token client expiré → bouton "Régénérer mon lien" (POST refresh-token)

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Loader2, FileText, Download, CheckCircle2, Clock, Edit3, AlertTriangle, RefreshCw, X, Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import PublicPdfViewer from '@/components/sign/PublicPdfViewer'

interface Rapport {
  id: string
  link_id: string
  report_link_client_id: string | null
  candidat_id: string | null
  candidat_name: string
  candidat_photo_url: string | null
  week_start: string
  week_end: string
  status: 'draft' | 'candidate_signed' | 'client_signed' | 'completed' | 'cancelled'
  client_contact_name: string | null
  client_name: string
  mission_metier_display: string | null
  mission_start: string | null
  totals: {
    heures_normales: number
    heures_sup: number
    repas: number
    deplacement: number
  }
  notes_candidat: string | null
  notes_client: string | null
  client_token: string | null
  client_token_expired: boolean
  client_token_expires_at: string | null
  has_signed_pdf: boolean
  link_slug: string
  candidate_signed_at: string | null
  client_signed_at: string | null
  created_at: string
  updated_at: string
}

interface ApiResponse {
  rapports: Rapport[]
  counts: { total: number; pending: number; completed: number; draft: number }
}

type FilterMode = 'all' | 'pending' | 'completed'

function frDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function frDateShort(iso: string): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

function isoWeek(weekStart: string): number {
  const d = new Date(weekStart + 'T00:00:00Z')
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const diff = target.getTime() - firstThursday.getTime()
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000))
}

function formatHours(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}

function formatTotalsLine(t: Rapport['totals']): string {
  const parts: string[] = []
  if (t.heures_normales > 0) parts.push(`${formatHours(t.heures_normales)}h normales`)
  if (t.heures_sup > 0) parts.push(`${formatHours(t.heures_sup)}h sup`)
  if (t.repas > 0) parts.push(`${t.repas} repas`)
  if (t.deplacement > 0) parts.push(`${formatHours(t.deplacement)}h dépl.`)
  return parts.join(' · ') || '—'
}

export default function RapportsTab({ slug }: { slug: string }) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [initialFilterSet, setInitialFilterSet] = useState(false)
  const [pdfOpen, setPdfOpen] = useState<{ rapport: Rapport; mode: 'view' } | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/client-portal/${slug}/rapports`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      setData(d)
      // Q4=B : default filter = "À valider" si count>0
      if (!initialFilterSet) {
        setFilter(d.counts?.pending > 0 ? 'pending' : 'all')
        setInitialFilterSet(true)
      }
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [slug, initialFilterSet])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === 'pending') return data.rapports.filter(r => r.status === 'candidate_signed')
    if (filter === 'completed') return data.rapports.filter(r => r.status === 'completed' || r.status === 'client_signed')
    return data.rapports
  }, [data, filter])

  // Groupage par candidat (préserve l'ordre des submissions = week_start DESC)
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; photo: string | null; items: Rapport[] }>()
    for (const r of filtered) {
      const key = r.candidat_id || r.candidat_name
      if (!map.has(key)) {
        map.set(key, { name: r.candidat_name, photo: r.candidat_photo_url, items: [] })
      }
      map.get(key)!.items.push(r)
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }))
  }, [filtered])

  // v2.9.94 — Param retour vers le portail (bouton « Retour » sur la page de validation)
  const backParam = `?back=${encodeURIComponent(`/client-portal/${slug}?tab=rapports`)}`

  // Action "Valider →" : si token expiré → refresh, sinon ouvrir direct
  const handleValidate = async (rapport: Rapport) => {
    if (rapport.client_token && !rapport.client_token_expired) {
      window.location.href = `/report/client/${rapport.client_token}${backParam}`
      return
    }
    // Token expiré ou absent → régénère
    setRefreshingId(rapport.id)
    try {
      const r = await fetch(`/api/client-portal/${slug}/rapports/${rapport.id}/refresh-token`, {
        method: 'POST',
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      window.location.href = `/report/client/${d.client_token}${backParam}`
    } catch (e: any) {
      toast.error(e.message || 'Impossible de régénérer le lien. Contactez L-Agence SA : +41 24 552 18 70')
      setRefreshingId(null)
    }
  }

  // v2.9.91 — « Envoyer au chef » : partage le lien de validation (Web Share / presse-papier),
  // pour qu'un collègue (chef de secteur) ouvre et valide le rapport.
  const handleTransfer = async (rapport: Rapport) => {
    let token = rapport.client_token && !rapport.client_token_expired ? rapport.client_token : null
    if (!token) {
      setRefreshingId(rapport.id)
      try {
        const r = await fetch(`/api/client-portal/${slug}/rapports/${rapport.id}/refresh-token`, { method: 'POST' })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Erreur')
        token = d.client_token as string
      } catch (e: any) {
        toast.error(e.message || 'Impossible de préparer le lien.')
        setRefreshingId(null)
        return
      }
      setRefreshingId(null)
    }
    const url = `${window.location.origin}/report/client/${token}`
    const shareData = {
      title: `Rapport à valider — ${rapport.candidat_name || ''}`.trim(),
      text: `Rapport d'heures à valider (semaine ${isoWeek(rapport.week_start)}). Merci d'ouvrir le lien pour vérifier et valider les heures :`,
      url,
    }
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share(shareData)
        return
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Lien copié — à transmettre par WhatsApp ou email au responsable')
    } catch {
      toast.error('Partage non supporté — copie le lien manuellement')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        {/* v2.7.3 — Fade-in décalé : spinner d'abord, texte 0.25s plus tard */}
        <style>{`@keyframes tfFadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }`}</style>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#EAB308' }} />
        <p style={{ marginTop: 16, fontSize: 14, color: '#6B7280', animation: 'tfFadeIn 0.6s ease-out 0.25s backwards' }}>
          Chargement des rapports…
        </p>
      </div>
    )
  }
  if (error) {
    return (
      <div style={{
        padding: 40, textAlign: 'center',
        background: '#fff', border: '1px solid #FCA5A5', borderRadius: 12,
        color: '#991B1B',
      }}>
        <AlertTriangle size={28} style={{ marginBottom: 12 }} />
        <p style={{ margin: 0, fontWeight: 600 }}>Erreur de chargement</p>
        <p style={{ margin: '6px 0 0', fontSize: 13 }}>{error}</p>
      </div>
    )
  }
  if (!data || data.rapports.length === 0) {
    return (
      <div style={{
        padding: 60, textAlign: 'center',
        background: '#fff', border: '1px dashed #E5E7EB', borderRadius: 14,
        color: '#6B7280', fontSize: 14,
      }}>
        Aucun rapport d&apos;heures pour le moment.<br/>
        <span style={{ fontSize: 12, marginTop: 8, display: 'inline-block' }}>
          Les rapports apparaîtront ici dès que vos collaborateurs les auront soumis.
        </span>
      </div>
    )
  }

  return (
    <>
      {/* v2.9.94 — Banner d'appel à l'action (ton formel, portail client) */}
      {data.counts.pending > 0 && (
        <button
          type="button"
          onClick={() => setFilter('pending')}
          style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18,
            padding: '14px 16px', borderRadius: 12,
            background: filter === 'pending' ? '#FFFBEB' : '#FEF9EC',
            border: '1px solid #FCD34D',
          }}
        >
          <span style={{
            flexShrink: 0, width: 38, height: 38, borderRadius: 10,
            background: '#FEF3C7', color: '#A16207',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Clock size={19} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#78350F' }}>
              {data.counts.pending} rapport{data.counts.pending > 1 ? 's' : ''} à valider
            </span>
            <span style={{ display: 'block', fontSize: 12.5, color: '#92400E', marginTop: 2 }}>
              Ouvrez, vérifiez les heures, puis validez — ou transmettez au responsable concerné.
            </span>
          </span>
        </button>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          Tous ({data.counts.total})
        </FilterChip>
        <FilterChip
          active={filter === 'pending'}
          onClick={() => setFilter('pending')}
          highlight={data.counts.pending > 0}
        >
          À valider {data.counts.pending > 0 && (
            <span style={{
              marginLeft: 6, padding: '1px 7px', borderRadius: 99,
              background: filter === 'pending' ? '#1C1A14' : '#DC2626',
              color: '#fff', fontSize: 10, fontWeight: 800,
            }}>{data.counts.pending}</span>
          )}
        </FilterChip>
        <FilterChip active={filter === 'completed'} onClick={() => setFilter('completed')}>
          Validés ({data.counts.completed})
        </FilterChip>
      </div>

      {/* Liste groupée par candidat */}
      {grouped.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14,
          background: '#fff', border: '1px dashed #E5E7EB', borderRadius: 12,
        }}>
          Aucun rapport ne correspond à ce filtre.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {grouped.map(group => (
            <section key={group.key}>
              <CandidatHeader
                name={group.name}
                photo={group.photo}
                count={group.items.length}
                metier={group.items[0]?.mission_metier_display || null}
                missionStart={group.items[0]?.mission_start || null}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {group.items.map(r => (
                  <RapportCard
                    key={r.id}
                    rapport={r}
                    onValidate={() => handleValidate(r)}
                    onTransfer={() => handleTransfer(r)}
                    onView={() => setPdfOpen({ rapport: r, mode: 'view' })}
                    refreshing={refreshingId === r.id}
                    slug={slug}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Modal PDF */}
      {pdfOpen && (
        <PdfModal rapport={pdfOpen.rapport} slug={slug} onClose={() => setPdfOpen(null)} />
      )}
    </>
  )
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function FilterChip({ active, onClick, highlight, children }: {
  active: boolean
  onClick: () => void
  highlight?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 99,
        border: active ? '1.5px solid #EAB308' : '1px solid #E5E7EB',
        background: active ? '#FEF3C7' : highlight ? '#FFF7ED' : '#fff',
        color: active ? '#78350F' : '#374151',
        fontSize: 13, fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center',
        minHeight: 36,
      }}
    >
      {children}
    </button>
  )
}

function CandidatHeader({ name, photo, count, metier, missionStart }: {
  name: string
  photo: string | null
  count: number
  metier?: string | null
  missionStart?: string | null
}) {
  const [imgError, setImgError] = useState(false)
  // v2.7.3 — Photo TOUJOURS affichée. Si pas de photo (ou erreur), fallback initiales
  // dans un carré gris (cohérent avec /client-portal Collaborateurs).
  const showImg = !!(photo && !imgError)
  const initials = name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 12,
        background: showImg ? '#fff' : '#E5E7EB',
        border: '1px solid #E5E7EB',
        boxShadow: showImg ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#6B7280', fontWeight: 700, fontSize: 16,
        flexShrink: 0,
        overflow: 'hidden',
        letterSpacing: 0.5,
      }}>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo!} alt={name} onError={() => setImgError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
          fontSize: 22, fontWeight: 400, lineHeight: 1.1, color: '#1C1A14',
          letterSpacing: '-0.01em',
        }}>
          {name}
        </div>
        {/* v2.7.3 + v2.9.95 — Métier + date de début de mission (si disponibles) */}
        {(metier || missionStart) && (
          <div style={{ fontSize: 13, color: '#4B5563', fontWeight: 500, marginTop: 3 }}>
            {metier}
            {metier && missionStart && <span style={{ color: '#D1D5DB' }}> · </span>}
            {missionStart && <span>En mission depuis le {frDateShort(missionStart)}</span>}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 4 }}>
          {count} rapport{count > 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

function RapportCard({ rapport: r, onValidate, onTransfer, onView, refreshing, slug }: {
  rapport: Rapport
  onValidate: () => void
  onTransfer: () => void
  onView: () => void
  refreshing: boolean
  slug: string
}) {
  const week = isoWeek(r.week_start)
  const dateRange = `${frDateShort(r.week_start)} au ${frDateShort(r.week_end)}`

  // Couleurs selon statut
  let badgeStyle: React.CSSProperties = {}
  let badgeLabel = ''
  let badgeIcon: React.ReactNode = null
  let borderColor = '#E5E7EB'

  if (r.status === 'candidate_signed') {
    borderColor = '#FCD34D'
    badgeStyle = { background: '#FEF3C7', color: '#92400E' }
    badgeLabel = 'À valider'
    badgeIcon = <Clock size={11} />
  } else if (r.status === 'completed' || r.status === 'client_signed') {
    borderColor = '#86EFAC'
    badgeStyle = { background: '#DCFCE7', color: '#15803D' }
    badgeLabel = 'Validé'
    badgeIcon = <CheckCircle2 size={11} />
  } else if (r.status === 'draft') {
    badgeStyle = { background: '#F3F4F6', color: '#6B7280' }
    badgeLabel = 'Brouillon'
    badgeIcon = <Edit3 size={11} />
  } else {
    badgeStyle = { background: '#F3F4F6', color: '#6B7280' }
    badgeLabel = r.status
  }

  return (
    <article
      style={{
        background: '#fff',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Ligne 1 : semaine + statut */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14' }}>
            Semaine {week} <span style={{ color: '#9CA3AF', fontWeight: 500 }}>· {dateRange} {r.week_start.slice(0, 4)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#4B5563', marginTop: 4 }}>
            {formatTotalsLine(r.totals)}
          </div>
          {/* v2.7.3 — client_name + métier RETIRÉS de la card : déjà présents dans
              le header de groupe (CandidatHeader) au-dessus. Évite la redondance. */}
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 99,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          flexShrink: 0,
          ...badgeStyle,
        }}>
          {badgeIcon} {badgeLabel}
        </span>
      </div>

      {/* Bandeau notes_candidat */}
      {r.notes_candidat && (
        <div style={{
          padding: '8px 12px',
          background: '#FFFBEB',
          border: '1px solid #FCD34D',
          borderRadius: 8,
          fontSize: 12.5,
          color: '#78350F',
          lineHeight: 1.45,
        }}>
          <strong style={{ fontWeight: 700 }}>Note du collaborateur :</strong> {r.notes_candidat}
        </div>
      )}
      {/* v2.7.3 — Bandeau notes_client (saisies par le client lors d'une validation) */}
      {r.notes_client && (
        <div style={{
          padding: '8px 12px',
          background: '#EFF6FF',
          border: '1px solid #93C5FD',
          borderRadius: 8,
          fontSize: 12.5,
          color: '#1E40AF',
          lineHeight: 1.45,
        }}>
          <strong style={{ fontWeight: 700 }}>Votre note :</strong> {r.notes_client}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {r.status === 'candidate_signed' && (
          <button
            onClick={onValidate}
            disabled={refreshing}
            style={{
              flex: '1 1 200px',
              padding: '10px 16px',
              borderRadius: 8,
              border: '1.5px solid #1C1A14',
              // v2.7.3 — Jaune brand L-Agence (au lieu d'orange)
              background: refreshing ? '#9CA3AF' : '#EAB308',
              color: '#1C1A14',
              fontWeight: 700, fontSize: 13.5,
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 44,
            }}
          >
            {refreshing ? (
              <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Préparation…</>
            ) : (
              // v2.7.3 — Nouveau texte "Voir le rapport à valider"
              <>Voir le rapport à valider →</>
            )}
          </button>
        )}
        {/* v2.9.91 — Transférer au chef de secteur pour validation */}
        {r.status === 'candidate_signed' && (
          <button
            onClick={onTransfer}
            disabled={refreshing}
            style={{
              flex: '0 1 auto',
              padding: '10px 14px', borderRadius: 8,
              border: '1.5px solid #128C7E',
              background: '#25D366', color: '#fff',
              fontWeight: 700, fontSize: 13,
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 44,
            }}
          >
            <Share2 size={14} /> Envoyer au responsable
          </button>
        )}
        {(r.status === 'completed' || r.status === 'client_signed') && (
          <>
            <button
              onClick={onView}
              style={{
                flex: '1 1 140px',
                padding: '10px 14px', borderRadius: 8,
                border: '1.5px solid #1C1A14',
                background: '#fff', color: '#1C1A14',
                fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                minHeight: 44,
              }}
            >
              <FileText size={14} /> Aperçu PDF
            </button>
            <a
              href={`/api/client-portal/${slug}/rapports/${r.id}/document`}
              style={{
                flex: '1 1 140px',
                padding: '10px 14px', borderRadius: 8,
                background: '#1C1A14', color: '#fff',
                fontWeight: 700, fontSize: 13, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                minHeight: 44,
              }}
            >
              <Download size={14} /> Télécharger
            </a>
          </>
        )}
        {r.status === 'draft' && (
          <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', padding: '8px 0' }}>
            Le collaborateur n&apos;a pas encore soumis ce rapport.
          </div>
        )}
      </div>
    </article>
  )
}

function PdfModal({ rapport: r, slug, onClose }: { rapport: Rapport; slug: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const week = isoWeek(r.week_start)
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14,
          width: 'min(900px, 100%)', height: 'min(90vh, 100%)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        <header style={{
          padding: '14px 18px', borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Rapport · Semaine {week}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1A14', marginTop: 2 }}>
              {r.candidat_name}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={`/api/client-portal/${slug}/rapports/${r.id}/document`}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: '#1C1A14', color: '#fff',
                fontWeight: 700, fontSize: 13, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Download size={14} /> Télécharger
            </a>
            <button
              onClick={onClose}
              style={{
                width: 36, height: 36, borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#fff',
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          </div>
        </header>
        {/* v2.9.91 — pdf.js (canvas) au lieu d'iframe : aperçu fiable iOS Safari. */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#F3F4F6' }}>
          <PublicPdfViewer
            key={r.id}
            url={`/api/client-portal/${slug}/rapports/${r.id}/document?inline=1`}
          />
        </div>
      </div>
    </div>
  )
}
