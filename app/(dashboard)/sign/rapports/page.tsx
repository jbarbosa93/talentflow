// TalentFlow Rapports — Liste des liens (refonte v2.3.8)
// Layout DocuSign-style : mini-sidebar gauche + main (filtres + tableau).
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, ChevronLeft, ClipboardList, Loader2, Search, FileText, X,
} from 'lucide-react'
import { toast } from 'sonner'
import ReportsSidebar, { type ReportSection } from '@/components/report/ReportsSidebar'
import ReportLinksTable from '@/components/report/ReportLinksTable'
import type { ReportLink, ReportSubmission } from '@/lib/report/types'
import type { SignTemplate } from '@/lib/sign/types'
import { toWhatsAppSafe } from '@/lib/report/text-format'

const SECTION_TO_STATUS: Record<ReportSection, ReportLink['status'] | null> = {
  all:     null,
  active:  'active',
  paused:  'paused',
  revoked: 'revoked',
}

interface Counts {
  all: number
  active: number
  paused: number
  revoked: number
}

const EMPTY_COUNTS: Counts = { all: 0, active: 0, paused: 0, revoked: 0 }

function isMobileWindow() {
  return typeof window !== 'undefined' && window.innerWidth < 900
}

export default function ReportsListPage() {
  const router = useRouter()
  const [links, setLinks] = useState<ReportLink[]>([])
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)
  const [lastByLink, setLastByLink] = useState<Record<string, ReportSubmission | null>>({})
  const [candidateNameByLink, setCandidateNameByLink] = useState<Record<string, string>>({})
  const [reportTemplatesCount, setReportTemplatesCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<ReportSection>('all')
  const [search, setSearch] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(isMobileWindow())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ─── Fetch tous les liens (pas de filtre côté serveur — counts dérivés du tout) ───
  const fetchLinks = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (search.trim()) params.set('search', search.trim())
      const r = await fetch(`/api/admin/reports?${params}`)
      const d = await r.json()
      const all = (d.links || []) as ReportLink[]
      setLinks(all)
      // Counts dérivés du résultat (sans filtre statut)
      setCounts({
        all: all.length,
        active: all.filter(l => l.status === 'active').length,
        paused: all.filter(l => l.status === 'paused').length,
        revoked: all.filter(l => l.status === 'revoked').length,
      })
    } catch {
      toast.error('Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  // Compte les templates kind='report' (zero-state)
  useEffect(() => {
    fetch('/api/sign/templates')
      .then(r => r.json())
      .then(d => {
        const all = (d.templates || []) as SignTemplate[]
        setReportTemplatesCount(all.filter(t => (t as { kind?: string }).kind === 'report').length)
      })
      .catch(() => setReportTemplatesCount(0))
  }, [])

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => fetchLinks(), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Charge la dernière submission pour chaque lien (best-effort, parallèle)
  useEffect(() => {
    if (links.length === 0) return
    let cancelled = false
    Promise.all(links.map(async l => {
      try {
        const r = await fetch(`/api/admin/reports/${l.id}/submissions`)
        const d = await r.json()
        const last = (d.submissions || [])[0] as ReportSubmission | undefined
        return { id: l.id, last: last || null }
      } catch {
        return { id: l.id, last: null }
      }
    })).then(results => {
      if (cancelled) return
      const map: Record<string, ReportSubmission | null> = {}
      for (const r of results) map[r.id] = r.last
      setLastByLink(map)
    })
    return () => { cancelled = true }
  }, [links])

  // Charge le nom complet du candidat pour chaque lien (best-effort)
  useEffect(() => {
    const candidateIds = Array.from(new Set(links.map(l => l.candidat_id).filter((x): x is string => !!x)))
    if (candidateIds.length === 0) return
    let cancelled = false
    Promise.all(candidateIds.map(async id => {
      try {
        const r = await fetch(`/api/candidats/${id}`)
        const d = await r.json()
        const c = d?.candidat as { prenom?: string | null; nom?: string | null } | null
        if (!c) return { id, name: null as string | null }
        const name = [c.prenom, c.nom].filter(Boolean).join(' ').trim() || null
        return { id, name }
      } catch {
        return { id, name: null as string | null }
      }
    })).then(results => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const r of results) {
        if (r.name) {
          for (const link of links) {
            if (link.candidat_id === r.id) map[link.id] = r.name
          }
        }
      }
      setCandidateNameByLink(map)
    })
    return () => { cancelled = true }
  }, [links])

  // Filtre côté client : section
  const filtered = useMemo(() => {
    const sectionStatus = SECTION_TO_STATUS[section]
    return links.filter(l => sectionStatus === null || l.status === sectionStatus)
  }, [links, section])

  // ─── Actions ───
  const handleCopyLink = (link: ReportLink) => {
    const url = `${window.location.origin}/report/${link.slug}`
    navigator.clipboard.writeText(url).then(() => toast.success('Lien copié'))
  }

  const handleSendWhatsApp = (link: ReportLink) => {
    const url = `${window.location.origin}/report/${link.slug}`
    const fullName = link.candidat_name
      || candidateNameByLink[link.id]
      || (link.title || '').replace(/^Rapport\s+(?:d'?heures\s+)?-?\s*/i, '').split(/\s+[—–-]\s+/)[0].trim()
    // v2.3.9 Bug 7 — toWhatsAppSafe sur le MESSAGE ENTIER + prenom
    const firstName = toWhatsAppSafe(fullName.split(/\s+/)[0] || '')
    // v2.3.11 Bug 2 — 👋 retiré (rendu ◆ par certaines apps WA)
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,'
    const rawMsg = `${greeting}\n\nVoici votre lien permanent pour soumettre votre rapport d'heures chaque semaine :\n\n${url}\n\nGardez ce lien — vous pouvez l'utiliser à chaque fin de semaine.\n\n— L-Agence SA`
    const msg = toWhatsAppSafe(rawMsg)
    const phoneDigits = link.candidat_phone
      ? link.candidat_phone.replace(/\D/g, '')
      : ''
    const waUrl = phoneDigits
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    if (!phoneDigits) {
      toast.warning('Pas de WhatsApp candidat configuré — choisis le contact dans WhatsApp')
    }
    // v2.3.8 Bug 3b — Nouvel onglet (preserve la page liste)
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  const handlePauseResume = async (link: ReportLink, newStatus: 'active' | 'paused') => {
    try {
      const r = await fetch(`/api/admin/reports/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!r.ok) throw new Error()
      toast.success(newStatus === 'paused' ? 'Lien mis en pause' : 'Lien réactivé')
      fetchLinks()
    } catch {
      toast.error('Erreur')
    }
  }

  const handleRevoke = async (link: ReportLink) => {
    const headline = candidateNameByLink[link.id] || link.title
    if (!confirm(`Révoquer le lien de ${headline} ? Les futures soumissions seront bloquées (les anciennes restent accessibles).`)) return
    try {
      const r = await fetch(`/api/admin/reports/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'revoked' }),
      })
      if (!r.ok) throw new Error()
      toast.success('Lien révoqué')
      fetchLinks()
    } catch {
      toast.error('Erreur révocation')
    }
  }

  const handleDelete = async (link: ReportLink) => {
    const headline = candidateNameByLink[link.id] || link.title
    if (!confirm(`Supprimer DÉFINITIVEMENT le lien de ${headline} et toutes ses soumissions ? Cette action est irréversible.`)) return
    try {
      const r = await fetch(`/api/admin/reports/${link.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      toast.success('Lien supprimé')
      fetchLinks()
    } catch {
      toast.error('Erreur suppression')
    }
  }

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Bouton retour */}
      <div style={{ marginBottom: 8 }}>
        <Link href="/sign" className="neo-btn-ghost neo-btn-sm" style={{ padding: '4px 10px' }}>
          <ChevronLeft size={14} />
          Signatures
        </Link>
      </div>

      {/* Header — pattern aligné sur /sign */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <ClipboardList size={22} color="var(--primary)" />
            <span>Rapports hebdomadaires</span>
            {!loading && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--muted-foreground)',
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '3px 10px',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {counts.all.toLocaleString('fr-CH')}
              </span>
            )}
          </h1>
          <p className="d-page-sub">
            Liens permanents partagés aux candidats pour soumettre leur rapport chaque semaine.
          </p>
        </div>
        {/* v2.3.9 Bug 3 — Bouton "Envois" supprimé du header rapports */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/sign/templates?kind=report" className="neo-btn-ghost">
            <FileText size={14} />
            Templates
          </Link>
          <Link
            href="/sign/rapports/new"
            className="neo-btn-yellow"
            style={{
              opacity: reportTemplatesCount === 0 ? 0.5 : 1,
              pointerEvents: reportTemplatesCount === 0 ? 'none' : 'auto',
            }}
            aria-disabled={reportTemplatesCount === 0}
            title={reportTemplatesCount === 0
              ? 'Crée d\'abord un template Rapport depuis /sign/templates'
              : 'Créer un nouveau lien permanent pour un candidat'}
          >
            <Plus size={15} />
            Nouveau lien
          </Link>
        </div>
      </div>

      {/* Layout 2 cols : sidebar + main */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {!isMobile && (
          <ReportsSidebar active={section} onChange={setSection} counts={counts} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Mobile : tabs horizontaux à la place de la sidebar */}
          {isMobile && (
            <MobileSectionTabs active={section} onChange={setSection} counts={counts} />
          )}

          {/* Filtres (search uniquement — sections gérées par sidebar) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 14,
            flexWrap: 'wrap',
            gap: 10,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              flex: '1 1 280px', minWidth: 200, maxWidth: 380,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10, height: 38, overflow: 'hidden',
            }}>
              <span style={{ padding: '0 8px 0 14px', color: 'var(--muted)', display: 'inline-flex' }}>
                <Search size={15} />
              </span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher par titre, candidat, client…"
                style={{
                  flex: 1, minWidth: 0,
                  padding: '0 12px 0 4px',
                  border: 'none', outline: 'none', background: 'transparent',
                  color: 'var(--foreground)', fontSize: 13, fontFamily: 'inherit',
                  height: '100%',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ padding: '0 10px', height: '100%', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {filtered.length} {filtered.length > 1 ? 'liens' : 'lien'}
            </span>
          </div>

          {/* Contenu principal */}
          {loading ? (
            <div className="neo-empty">
              <div className="neo-empty-icon">
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted)' }} />
              </div>
              <div className="neo-empty-sub">Chargement…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="neo-empty" style={{ padding: 32 }}>
              {reportTemplatesCount === 0 ? (
                <>
                  <FileText size={32} style={{ opacity: 0.4, marginBottom: 8, color: 'var(--muted)' }} />
                  <div className="neo-empty-title">Crée d&apos;abord un template Rapport</div>
                  <div className="neo-empty-sub" style={{ marginTop: 8, marginBottom: 16, maxWidth: 480 }}>
                    Avant de partager un lien à un candidat, il faut un <strong>template de type Rapport d&apos;heures</strong>.
                    Va dans <strong>Templates</strong> → bouton <strong>« Nouveau template »</strong> →
                    choisis « Rapport d&apos;heures ».
                  </div>
                  <Link href="/sign/templates" className="neo-btn-yellow">
                    <FileText size={14} />
                    Aller aux templates
                  </Link>
                </>
              ) : (
                <>
                  <ClipboardList size={32} style={{ opacity: 0.4, marginBottom: 8, color: 'var(--muted)' }} />
                  <div className="neo-empty-title">
                    {section === 'all' ? 'Aucun lien rapport' : 'Aucun lien dans cette catégorie'}
                  </div>
                  <div className="neo-empty-sub" style={{ marginTop: 8, marginBottom: 16, maxWidth: 420 }}>
                    {section === 'all'
                      ? 'Crée un lien permanent par candidat pour qu\'il puisse soumettre son rapport d\'heures chaque semaine.'
                      : 'Aucun lien ne correspond à ces filtres.'}
                  </div>
                  {section === 'all' && (
                    <Link href="/sign/rapports/new" className="neo-btn-yellow">
                      <Plus size={14} />
                      Créer le 1er lien
                    </Link>
                  )}
                </>
              )}
            </div>
          ) : (
            <ReportLinksTable
              links={filtered}
              candidateNameByLink={candidateNameByLink}
              lastByLink={lastByLink}
              onCopyLink={handleCopyLink}
              onSendWhatsApp={handleSendWhatsApp}
              onPause={l => handlePauseResume(l, 'paused')}
              onResume={l => handlePauseResume(l, 'active')}
              onRevoke={handleRevoke}
              onDelete={handleDelete}
              onEdit={l => router.push(`/sign/rapports/${l.id}/edit`)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Mobile section tabs (au lieu de la sidebar) ─────────────────────
function MobileSectionTabs({
  active, onChange, counts,
}: {
  active: ReportSection; onChange: (s: ReportSection) => void; counts: Counts
}) {
  const items: { key: ReportSection; label: string }[] = [
    { key: 'all',     label: 'Tous' },
    { key: 'active',  label: 'Actifs' },
    { key: 'paused',  label: 'En pause' },
    { key: 'revoked', label: 'Révoqués' },
  ]
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      marginBottom: 8,
      overflowX: 'auto',
      paddingBottom: 4,
      WebkitOverflowScrolling: 'touch',
    }}>
      {items.map(it => {
        const isActive = active === it.key
        const c = counts[it.key]
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            style={{
              flexShrink: 0,
              padding: '7px 12px',
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 500,
              border: '1px solid',
              borderColor: isActive ? 'var(--primary)' : 'var(--border)',
              background: isActive ? 'var(--primary-soft)' : 'var(--card)',
              color: isActive ? 'var(--accent-foreground)' : 'var(--text-2, var(--foreground))',
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {it.label}
            {c > 0 && <span style={{ opacity: 0.7 }}>({c})</span>}
          </button>
        )
      })}
    </div>
  )
}
