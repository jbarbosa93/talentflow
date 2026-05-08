// TalentFlow Rapports — Liste des liens actifs (Phase 5)
// v2.2.6
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ChevronLeft, ClipboardList, Loader2, Search, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import ReportLinkCard from '@/components/report/ReportLinkCard'
import type { ReportLink, ReportSubmission } from '@/lib/report/types'
import type { SignTemplate } from '@/lib/sign/types'

export default function ReportsListPage() {
  const router = useRouter()
  const [links, setLinks] = useState<ReportLink[]>([])
  const [lastByLink, setLastByLink] = useState<Record<string, ReportSubmission | null>>({})
  const [candidateNameByLink, setCandidateNameByLink] = useState<Record<string, string>>({})
  const [reportTemplatesCount, setReportTemplatesCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'revoked'>('all')

  const fetchLinks = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search.trim()) params.set('search', search.trim())
      const r = await fetch(`/api/admin/reports?${params}`)
      const d = await r.json()
      setLinks(d.links || [])
    } catch {
      toast.error('Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLinks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  // Compte les templates kind='report' (pour onboarding zero-state)
  useEffect(() => {
    fetch('/api/sign/templates')
      .then(r => r.json())
      .then(d => {
        const all = (d.templates || []) as SignTemplate[]
        setReportTemplatesCount(all.filter(t => (t as { kind?: string }).kind === 'report').length)
      })
      .catch(() => setReportTemplatesCount(0))
  }, [])


  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => fetchLinks(), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Charge la dernière submission de chaque lien (best-effort, en parallèle)
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

  // v2.2.6 — Charge le nom complet du candidat pour chaque lien (best-effort)
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
          // Map par candidat_id, puis on retrouve le link via candidat_id
          for (const link of links) {
            if (link.candidat_id === r.id) map[link.id] = r.name
          }
        }
      }
      setCandidateNameByLink(map)
    })
    return () => { cancelled = true }
  }, [links])

  const handleCopyLink = (link: ReportLink) => {
    const url = `${window.location.origin}/report/${link.slug}`
    navigator.clipboard.writeText(url).then(() => toast.success('Lien copié'))
  }

  const handleSendWhatsApp = (link: ReportLink) => {
    const url = `${window.location.origin}/report/${link.slug}`
    const fullName = link.candidat_name
      || candidateNameByLink[link.id]
      || (link.title || '').replace(/^Rapport\s+(?:d'?heures\s+)?-?\s*/i, '').split(/\s+[—–-]\s+/)[0].trim()
    const firstName = fullName.normalize('NFC').split(/\s+/)[0] || ''
    const greeting = firstName ? `Bonjour ${firstName} 👋` : 'Bonjour 👋'
    const msg = `${greeting}\n\nVoici votre lien permanent pour soumettre votre rapport d'heures chaque semaine :\n\n${url}\n\nGardez ce lien — vous pouvez l'utiliser à chaque fin de semaine.\n\n— L-Agence SA`
    // v2.3.x Bug 9 — Deep link wa.me/{numero}?text=... si candidat_phone disponible
    const phoneDigits = link.candidat_phone
      ? link.candidat_phone.replace(/\D/g, '')
      : ''
    const waUrl = phoneDigits
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    if (!phoneDigits) {
      toast.warning('Pas de WhatsApp candidat configuré — choisis le contact dans WhatsApp')
    }
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

  // v2.2.6 — Suppression définitive (uniquement pour les révoqués)
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
            <h1 className="d-page-title" style={{ marginBottom: 2 }}>Rapports hebdomadaires</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Liens permanents partagés aux candidats pour soumettre leur rapport chaque semaine.
            </p>
          </div>
        </div>
        <Link
          href="/sign/rapports/new"
          className="neo-btn-yellow"
          // Désactivé visuellement si aucun template Rapport n'existe encore
          style={{
            opacity: reportTemplatesCount === 0 ? 0.5 : 1,
            pointerEvents: reportTemplatesCount === 0 ? 'none' : 'auto',
          }}
          aria-disabled={reportTemplatesCount === 0}
          title={reportTemplatesCount === 0
            ? 'Crée d\'abord un template Rapport depuis /sign/templates'
            : 'Créer un nouveau lien permanent pour un candidat'}
        >
          <Plus size={14} />
          Nouveau lien
        </Link>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* v2.2.6 — Pattern aligné sur /sign/templates : icône loupe inline dans
            un container flex avec border, plutôt que position:absolute (évitait
            les bugs de positionnement quand l'input est en flex shrink). */}
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
            placeholder="Rechercher par titre…"
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
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface-2)', borderRadius: 8 }}>
          {(['all', 'active', 'paused', 'revoked'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '5px 12px',
                fontSize: 12, fontWeight: 600,
                border: 'none',
                borderRadius: 6,
                background: statusFilter === s ? 'var(--card)' : 'transparent',
                color: statusFilter === s ? 'var(--foreground)' : 'var(--muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: statusFilter === s ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {s === 'all' ? 'Tous' : s === 'active' ? 'Actifs' : s === 'paused' ? 'En pause' : 'Révoqués'}
            </button>
          ))}
        </div>
      </div>

      {/* Grille */}
      {loading ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
          <div className="neo-empty-sub">Chargement…</div>
        </div>
      ) : links.length === 0 ? (
        <div className="neo-empty" style={{ padding: 32 }}>
          {reportTemplatesCount === 0 ? (
            <>
              <FileText size={32} style={{ opacity: 0.4, marginBottom: 8, color: 'var(--muted)' }} />
              <div className="neo-empty-title">Crée d&apos;abord un template Rapport</div>
              <div className="neo-empty-sub" style={{ marginTop: 8, marginBottom: 16, maxWidth: 480 }}>
                Avant de partager un lien à un candidat, il faut un <strong>template de type Rapport d&apos;heures</strong>.
                Va dans <strong>Templates</strong> → bouton <strong>« Nouveau template »</strong> →
                choisis « Rapport d&apos;heures ». Si tu en as déjà un d&apos;un autre type, tu peux le convertir
                via le menu actions ⋮.
              </div>
              <Link href="/sign/templates" className="neo-btn-yellow">
                <FileText size={14} />
                Aller aux templates
              </Link>
            </>
          ) : (
            <>
              <ClipboardList size={32} style={{ opacity: 0.4, marginBottom: 8, color: 'var(--muted)' }} />
              <div className="neo-empty-title">Aucun lien rapport</div>
              <div className="neo-empty-sub" style={{ marginTop: 8, marginBottom: 16, maxWidth: 420 }}>
                Crée un lien permanent par candidat pour qu&apos;il puisse soumettre son rapport d&apos;heures chaque semaine sans avoir à recevoir un nouveau lien.
              </div>
              <Link href="/sign/rapports/new" className="neo-btn-yellow">
                <Plus size={14} />
                Créer le 1er lien
              </Link>
            </>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 14,
        }}>
          {links.map(link => (
            <ReportLinkCard
              key={link.id}
              link={link}
              candidateName={candidateNameByLink[link.id]}
              lastSubmission={lastByLink[link.id]}
              onCopyLink={handleCopyLink}
              onSendWhatsApp={handleSendWhatsApp}
              onPause={l => handlePauseResume(l, 'paused')}
              onResume={l => handlePauseResume(l, 'active')}
              onRevoke={handleRevoke}
              onDelete={handleDelete}
              onEdit={l => router.push(`/sign/rapports/${l.id}/edit`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
