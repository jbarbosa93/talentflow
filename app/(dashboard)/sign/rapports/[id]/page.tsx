// TalentFlow Rapports — Détail d'un lien permanent (Phase 5)
// v2.2.6
'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ClipboardList, Copy, Check, Loader2, MessageCircle, Pause, Play, Trash2, Edit3,
} from 'lucide-react'
import { toast } from 'sonner'
import SubmissionHistoryTable from '@/components/report/SubmissionHistoryTable'
import LinkClientsSection from '@/components/report/LinkClientsSection'
import RecapPeriode from '@/components/report/RecapPeriode'
import { createPortal } from 'react-dom'
import { BarChart3, X as XIcon } from 'lucide-react'
import {
  REPORT_LINK_STATUS_LABELS, type ReportLink, type ReportSubmission, type ReportLinkClient,
} from '@/lib/report/types'
import { toWhatsAppSafe } from '@/lib/report/text-format'
import PortalAccountsPanel from '@/components/portal-auth/PortalAccountsPanel'

export default function ReportLinkDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [link, setLink] = useState<ReportLink | null>(null)
  const [submissions, setSubmissions] = useState<ReportSubmission[]>([])
  // v2.9.2 — Entreprises destinataires (pour bouton WhatsApp client par submission)
  const [linkClients, setLinkClients] = useState<ReportLinkClient[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [recapOpen, setRecapOpen] = useState(false)
  // v2.7.1 — Mission liée (chargée si link.mission_id présent)
  const [mission, setMission] = useState<{ id: string; client_nom: string | null; metier: string | null; metier_display: string | null; date_debut: string | null; date_fin: string | null } | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [linkR, subR, clR] = await Promise.all([
        fetch(`/api/admin/reports/${id}`),
        fetch(`/api/admin/reports/${id}/submissions`),
        fetch(`/api/admin/reports/${id}/clients`),
      ])
      const linkD = await linkR.json()
      if (linkR.ok) setLink(linkD.link)
      const subD = await subR.json()
      setSubmissions(subD.submissions || [])
      const clD = await clR.json().catch(() => ({}))
      setLinkClients((clD.clients || []) as ReportLinkClient[])
    } catch {
      toast.error('Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // v2.7.1 — Charge la mission liée si présente
  useEffect(() => {
    const missionId = (link as any)?.mission_id
    if (!missionId) { setMission(null); return }
    let cancelled = false
    fetch(`/api/missions`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.missions) return
        const m = d.missions.find((x: any) => x.id === missionId)
        if (m) setMission({
          id: m.id,
          client_nom: m.client_nom,
          metier: m.metier,
          metier_display: m.metier_display,
          date_debut: m.date_debut,
          date_fin: m.date_fin,
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [link])

  const publicUrl = link
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/report/${link.slug}`
    : ''

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true)
      toast.success('Lien copié')
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const handleSendWhatsApp = () => {
    if (!link) return
    // v2.3.x — Utilise candidat_name (source unique) ; fallback : title nettoyé du préfixe
    const fullName = link.candidat_name
      || (link.title || '').replace(/^Rapport\s+(?:d'?heures\s+)?-?\s*/i, '').split(/\s+[—–-]\s+/)[0].trim()
    // v2.3.9 Bug 7 — toWhatsAppSafe sur le MESSAGE ENTIER (pas seulement prenom).
    // Map LATIN_MAP exhaustive evite ❓ partout dans le contenu envoye.
    const firstName = toWhatsAppSafe(fullName.split(/\s+/)[0] || '')
    // v2.3.11 Bug 2 — 👋 (U+1F44B) retiré : certaines apps WA n'ont pas de
    // glyph pour cet emoji et l'affichent en ◆/carré vide après le prénom.
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,'
    // v2.4.4 — Warning sécurité : le lien permanent permet de SOUMETTRE des rapports
    // en son nom. Si quelqu'un d'autre l'obtient, il peut modifier les données.
    const rawMsg = `${greeting}\n\nVoici votre lien permanent pour soumettre votre rapport d'heures chaque semaine :\n\n${publicUrl}\n\nGardez ce lien — il reste valable, vous pouvez l'utiliser à chaque fin de semaine.\n\n⚠️ IMPORTANT : ne partagez ce lien avec personne. Vous seul devez l'utiliser. Si une autre personne y accède, elle pourrait modifier vos données.\n\n— L-Agence SA`
    const msg = toWhatsAppSafe(rawMsg)
    // v2.3.x Bug 9 — Deep link wa.me/{numero}?text=... si candidat_phone disponible
    // Sinon wa.me/?text=... (user choisit le contact dans WhatsApp).
    // E.164 → digits-only pour wa.me (vire le +).
    const phoneDigits = link.candidat_phone
      ? link.candidat_phone.replace(/\D/g, '')
      : ''
    const url = phoneDigits
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    if (!phoneDigits) {
      toast.warning('Pas de WhatsApp candidat configuré — choisis le contact dans WhatsApp')
    }
    // v2.3.8 Bug 3b — window.open _blank pour ouvrir un nouvel onglet
    // (preserve la page rapport dans l'onglet courant ; la page actuelle reste).
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handlePauseResume = async () => {
    if (!link) return
    // v2.3.10 Bug 1 — Force 'active' quand status est 'revoked' OU 'paused'.
    // Avant : ternary 'paused'?'active':'paused' renvoyait 'paused' pour revoked → KO.
    const newStatus: 'active' | 'paused' = link.status === 'paused' ? 'active'
      : link.status === 'revoked' ? 'active'
      : 'paused'
    try {
      const r = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!r.ok) throw new Error()
      toast.success(newStatus === 'paused' ? 'Lien mis en pause' : 'Lien réactivé')
      fetchData()
    } catch {
      toast.error('Erreur')
    }
  }

  const handleRevoke = async () => {
    if (!link) return
    if (!confirm(`Révoquer le lien ? Les futures soumissions seront bloquées (les anciennes restent accessibles).`)) return
    try {
      const r = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'revoked' }),
      })
      if (!r.ok) throw new Error()
      toast.success('Lien révoqué')
      fetchData()
    } catch {
      toast.error('Erreur')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer définitivement ce lien et toutes ses soumissions ?')) return
    try {
      const r = await fetch(`/api/admin/reports/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      toast.success('Lien supprimé')
      router.push('/sign/rapports')
    } catch {
      toast.error('Erreur suppression')
    }
  }

  if (loading) {
    return (
      <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        <div className="neo-empty">
          <div className="neo-empty-icon">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
          <div className="neo-empty-sub">Chargement…</div>
        </div>
      </div>
    )
  }
  if (!link) {
    return (
      <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
        <div className="neo-empty">
          <div className="neo-empty-title">Lien introuvable</div>
          <div className="neo-empty-sub" style={{ marginTop: 12 }}>
            <Link href="/sign/rapports" className="neo-btn-ghost neo-btn-sm">
              <ChevronLeft size={14} />
              Retour aux liens
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const isActive = link.status === 'active'
  const isPaused = link.status === 'paused'
  const isRevoked = link.status === 'revoked'

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Bouton retour */}
      <div style={{ marginBottom: 8 }}>
        <Link href="/sign/rapports" className="neo-btn-ghost neo-btn-sm" style={{ padding: '4px 10px' }}>
          <ChevronLeft size={14} />
          Liens rapports
        </Link>
      </div>

      {/* Header */}
      <div className="d-page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--primary-soft)',
            border: '1px solid rgba(245,167,35,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
            color: 'var(--primary, #A16207)',
          }}>
            <ClipboardList size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="d-page-title" style={{ marginBottom: 2 }}>{link.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{
                padding: '3px 8px',
                borderRadius: 999,
                background: isActive ? '#D1FAE5' : isPaused ? '#FEF3C7' : '#FEE2E2',
                color:      isActive ? '#059669' : isPaused ? '#A16207' : '#DC2626',
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                {REPORT_LINK_STATUS_LABELS[link.status]}
              </span>
              {/* v2.4.6 — Nom entreprise legacy retiré : les entreprises sont
                  désormais dans la section "Entreprises autorisées" en bas. */}
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {submissions.length} soumission{submissions.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {!isRevoked && (
            <>
              <button type="button" onClick={handleCopy} className="neo-btn-ghost">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                Copier le lien
              </button>
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="neo-btn-ghost"
                style={{ color: '#25D366' }}
              >
                <MessageCircle size={14} />
                WhatsApp
              </button>
              {isPaused
                ? <button type="button" onClick={handlePauseResume} className="neo-btn-yellow">
                    <Play size={14} /> Réactiver
                  </button>
                : <button type="button" onClick={handlePauseResume} className="neo-btn-ghost">
                    <Pause size={14} /> Pause
                  </button>}
              <button type="button" onClick={handleRevoke} className="neo-btn-ghost" style={{ color: 'var(--destructive)' }}>
                <Trash2 size={14} /> Révoquer
              </button>
              {/* v2.3.9 Bug 2b — Bouton Supprimer DÉFINITIF disponible aussi
                  hors statut révoqué (rouge fond, distingue de Révoquer). */}
              <button
                type="button"
                onClick={handleDelete}
                className="neo-btn-ghost"
                style={{
                  color: '#fff',
                  background: 'var(--destructive)',
                  borderColor: 'var(--destructive)',
                }}
                title="Supprime définitivement le lien et toutes ses soumissions (irréversible)"
              >
                <Trash2 size={14} /> Supprimer
              </button>
            </>
          )}
          {/* v2.3.10 Bug 1 — Lien révoqué : Réactiver (vert) + Supprimer définitivement */}
          {isRevoked && (
            <>
              <button
                type="button"
                onClick={handlePauseResume}
                className="neo-btn-ghost"
                style={{ color: '#059669' }}
                title="Réactiver le lien (status passera à actif)"
              >
                <Play size={14} /> Réactiver
              </button>
              <button type="button" onClick={handleDelete} className="neo-btn-ghost" style={{ color: 'var(--destructive)' }}>
                <Trash2 size={14} /> Supprimer définitivement
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lien public */}
      <div style={{
        marginTop: 18,
        padding: '14px 16px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--muted)', marginBottom: 4,
          }}>
            Lien permanent
          </div>
          <div style={{
            fontSize: 13,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            color: 'var(--foreground)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {publicUrl}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="neo-btn-ghost neo-btn-sm"
          title="Copier"
          style={{ flexShrink: 0 }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      {/* v2.7.1 — Card MISSION LIÉE (si lien créé depuis une mission) */}
      {mission && (
        <div style={{
          marginTop: 14,
          padding: 14,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(99,102,241,0.02))',
          border: '1.5px solid rgba(99,102,241,0.25)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 22 }}>🔗</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: '#818CF8', textTransform: 'uppercase', marginBottom: 2 }}>
              Mission liée
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>
              {mission.metier_display || mission.metier || 'Mission'}
              {mission.client_nom ? ` · ${mission.client_nom}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {mission.date_debut ? (
                <>Du {mission.date_debut.split('-').reverse().join('.')}{mission.date_fin ? ` au ${mission.date_fin.split('-').reverse().join('.')}` : ' (indéterminée)'}</>
              ) : '—'}
            </div>
          </div>
          <a
            href={`/missions?highlight=${mission.id}`}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              background: 'rgba(99,102,241,0.12)',
              border: '1.5px solid rgba(99,102,241,0.4)',
              color: '#818CF8',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            → Voir la mission
          </a>
          <button
            type="button"
            onClick={async () => {
              if (!confirm('Délier la mission de ce rapport ?')) return
              const r = await fetch(`/api/admin/reports/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mission_id: null }),
              })
              if (r.ok) { toast.success('Mission déliée'); fetchData() }
              else toast.error('Erreur')
            }}
            style={{
              padding: '7px 10px', borderRadius: 8,
              background: 'transparent', border: '1.5px solid #FCA5A5',
              color: '#B91C1C', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            title="Délier la mission de ce rapport"
          >
            Délier
          </button>
        </div>
      )}

      {/* v2.9.9 — Bouton "Lier une mission" si aucune mission liée */}
      {!mission && link && (
        <LinkMissionButton
          linkId={id}
          candidatId={link.candidat_id}
          candidatName={link.candidat_name}
          onLinked={fetchData}
        />
      )}

      {/* v2.7.3 — Card "Utiliser portail rapports" */}
      {link && (
        <UseClientPortalToggle
          link={link}
          onChanged={(newValue) => setLink({ ...link, use_client_portal: newValue } as ReportLink)}
        />
      )}

      {/* v2.4.3 — InfoCards CANDIDAT uniquement (les coords client vivent désormais
          dans la section "Entreprises autorisées" en bas de page). */}
      <div style={{
        marginTop: 14,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10,
      }}>
        <InfoCard label="Candidat" value={link.candidat_name || '—'} />
        <InfoCard label="Email candidat" value={link.candidat_email || '—'} />
        <InfoCard label="WhatsApp candidat" value={link.candidat_phone || '—'} />
      </div>

      {/* v2.4.0 — Entreprises autorisées (multi-entreprise par lien)
          v2.4.3 — fallbackClient pour auto-create si liste vide (cas legacy / lien créé avant migration) */}
      <div style={{ marginTop: 24 }}>
        <LinkClientsSection
          linkId={link.id}
          fallbackClient={{
            client_name: link.client_name,
            client_email: link.client_email,
            client_contact_name: link.client_contact_name,
            client_phone: link.client_phone,
          }}
        />
      </div>

      {/* v2.9.0 — Accès du candidat au rapport (email + mot de passe) */}
      <div style={{
        marginTop: 24, padding: 18,
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <PortalAccountsPanel
          reportLinkId={link.id}
          accountType="candidat"
          contextLabel={link.candidat_name || undefined}
          authRequired={(link as any).auth_required}
          defaultInviteEmail={link.candidat_email || undefined}
        />
      </div>

      {/* Historique */}
      <div style={{ marginTop: 24 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10, gap: 8, flexWrap: 'wrap',
        }}>
          <h2 style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--muted)', margin: 0,
          }}>
            Historique des soumissions
          </h2>
          {/* v2.4.7 — Bouton Récapitulatif affiché UNIQUEMENT si ≥ 1 soumission validée
              (status completed ou client_signed). Évite d'afficher des chiffres incomplets. */}
          {submissions.some(s => s.status === 'completed' || s.status === 'client_signed') && (
            <button
              type="button"
              onClick={() => setRecapOpen(true)}
              className="neo-btn-ghost neo-btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <BarChart3 size={13} />
              Récapitulatif période
            </button>
          )}
        </div>
        <SubmissionHistoryTable
          submissions={submissions}
          slug={link.slug}
          onCorrected={fetchData}
          clients={linkClients}
          candidatName={link.candidat_name}
        />
      </div>

      {/* v2.4.1 — Modal récap dashboard (scope=dashboard : inclut candidate_signed) */}
      {recapOpen && typeof window !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setRecapOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(680px, 95vw)',
              maxHeight: '88vh',
              background: 'var(--card)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 22px 16px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{
                  fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
                  fontSize: 22, fontWeight: 400, color: 'var(--foreground)',
                  letterSpacing: '-0.01em', lineHeight: 1.15,
                }}>
                  Récapitulatif période
                </div>
                <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--muted)' }}>
                  Inclut rapports complétés ET en attente client
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecapOpen(false)}
                aria-label="Fermer"
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--foreground)',
                }}
              >
                <XIcon size={15} />
              </button>
            </div>
            <div style={{
              flex: 1, overflow: 'auto',
              padding: '18px 22px 24px',
            }}>
              <RecapPeriode slug={link.slug} scope="dashboard" />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// v2.7.3 — Toggle "Utiliser portail rapports" sur la page détail
function UseClientPortalToggle({ link, onChanged }: {
  link: ReportLink
  onChanged: (newValue: boolean) => void
}) {
  const [saving, setSaving] = useState(false)
  const enabled = (link as any).use_client_portal === true

  const toggle = async () => {
    const next = !enabled
    setSaving(true)
    try {
      const r = await fetch(`/api/admin/reports/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_client_portal: next }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success(next ? '🪟 Portail rapports activé' : 'Portail rapports désactivé')
      onChanged(next)
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      marginTop: 12,
      padding: 14,
      borderRadius: 10,
      border: enabled ? '1.5px solid rgba(234,179,8,0.5)' : '1px solid var(--border)',
      background: enabled ? 'rgba(234,179,8,0.06)' : 'var(--surface)',
      display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 22, lineHeight: 1 }}>🪟</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
          Portail rapports {enabled && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: '#A16207', background: 'rgba(234,179,8,0.15)', padding: '2px 7px', borderRadius: 99 }}>ACTIF</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
          {enabled ? (
            <>L&apos;email de validation va à l&apos;adresse principale de l&apos;entreprise (en DB clients). Le client clique → arrive sur son portail avec <strong>tous</strong> les rapports à valider.</>
          ) : (
            <>Aujourd&apos;hui : les notifications candidate_signed envoient un lien unique <code>/report/client/{'{'}token{'}'}</code> (TTL 7j). Active pour passer en mode portail (lien permanent vers <code>/client-portal/{'{'}slug{'}'}?tab=rapports</code>).</>
          )}
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        style={{
          padding: '8px 14px',
          borderRadius: 8,
          border: enabled ? '1.5px solid #EAB308' : '1.5px solid var(--border)',
          background: enabled ? '#EAB308' : 'var(--surface)',
          color: enabled ? '#1c1a14' : 'var(--foreground)',
          fontSize: 12.5, fontWeight: 700,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? '…' : enabled ? 'Désactiver' : 'Activer'}
      </button>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: 12,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--muted)', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--foreground)', wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  )
}

// v2.9.9 — Bouton + modal pour lier une mission à un rapport a posteriori
function LinkMissionButton({
  linkId, candidatId, candidatName, onLinked,
}: {
  linkId: string
  candidatId: string | null
  candidatName: string | null
  onLinked: () => void
}) {
  const [open, setOpen] = useState(false)
  const [missions, setMissions] = useState<Array<{
    id: string; client_nom: string | null; metier: string | null; metier_display: string | null;
    date_debut: string | null; date_fin: string | null; candidat_id: string | null;
  }>>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const openModal = async () => {
    setOpen(true)
    setLoading(true)
    try {
      const r = await fetch('/api/missions', { cache: 'no-store' })
      const d = await r.json()
      const all = (d.missions || []) as any[]
      // Filtre prioritaire : missions du candidat lié. Sinon toutes (au cas où le candidat n'est pas en DB).
      const filtered = candidatId
        ? all.filter(m => m.candidat_id === candidatId)
        : all
      setMissions(filtered.length > 0 ? filtered : all)
    } catch {
      toast.error('Erreur chargement missions')
    } finally {
      setLoading(false)
    }
  }

  const handleLink = async (missionId: string) => {
    setBusy(true)
    const r = await fetch(`/api/admin/reports/${linkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission_id: missionId }),
    })
    setBusy(false)
    if (r.ok) {
      toast.success('Mission liée au rapport')
      setOpen(false)
      onLinked()
    } else {
      toast.error('Erreur')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        style={{
          marginTop: 14,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'transparent',
          border: '1.5px dashed rgba(99,102,241,0.4)',
          color: '#818CF8',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}
        title="Lier ce rapport à une mission (utile pour bloquer les soumissions après la fin de mission)"
      >
        🔗 Lier une mission
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div onClick={() => !busy && setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card)', borderRadius: 14, padding: 24,
            maxWidth: 560, width: '100%', maxHeight: '85vh', overflow: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          }}>
            <h3 style={{
              margin: '0 0 8px',
              fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
              fontSize: 22, fontWeight: 400, color: 'var(--foreground)',
            }}>Lier une mission</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              {candidatName ? `Missions de ${candidatName} :` : 'Sélectionne la mission à lier à ce rapport.'} Une fois liée, les dates de la mission filtreront les semaines disponibles au candidat.
            </p>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: 12 }}>Chargement…</div>
            ) : missions.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: 12 }}>
                Aucune mission trouvée.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {missions.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleLink(m.id)}
                    disabled={busy}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      background: 'var(--surface)',
                      border: '1.5px solid var(--border)',
                      borderRadius: 10,
                      cursor: busy ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)' }}>
                      {m.metier_display || m.metier || 'Mission'}
                      {m.client_nom ? ` · ${m.client_nom}` : ''}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {m.date_debut
                        ? <>Du {m.date_debut.split('-').reverse().join('.')}{m.date_fin ? ` au ${m.date_fin.split('-').reverse().join('.')}` : ' (indéterminée)'}</>
                        : 'Dates non définies'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} disabled={busy} style={{
                padding: '7px 14px', fontSize: 12, fontWeight: 600,
                background: '#F3F4F6', color: '#374151',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
              }}>Annuler</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
