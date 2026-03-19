'use client'
import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, Search, Trash2, ChevronDown, ChevronRight,
  LayoutGrid, Check, X, SortAsc,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import UploadCV from '@/components/UploadCV'
import { useCandidats, useDeleteCandidatsBulk } from '@/hooks/useCandidats'
import { useQueryClient } from '@tanstack/react-query'
import type { PipelineEtape } from '@/types/database'

const ETAPE_BADGE: Record<PipelineEtape, string> = {
  nouveau:   'neo-badge neo-badge-nouveau',
  contacte:  'neo-badge neo-badge-contacte',
  entretien: 'neo-badge neo-badge-entretien',
  place:     'neo-badge neo-badge-place',
  refuse:    'neo-badge neo-badge-refuse',
}
const ETAPE_LABELS: Record<PipelineEtape, string> = {
  nouveau: 'Nouveau', contacte: 'Contacté', entretien: 'Entretien', place: 'Placé', refuse: 'Refusé',
}
const FILTER_OPTS = [
  { value: 'tous',      label: 'Tous' },
  { value: 'nouveau',   label: 'Nouveau' },
  { value: 'contacte',  label: 'Contacté' },
  { value: 'entretien', label: 'Entretien' },
  { value: 'place',     label: 'Placé' },
  { value: 'refuse',    label: 'Refusé' },
]
const SORT_OPTS = [
  { value: 'date_desc', label: '⬇ Plus récent' },
  { value: 'date_asc',  label: '⬆ Plus ancien' },
  { value: 'nom_az',    label: 'Nom A → Z' },
  { value: 'titre_az',  label: 'Métier A → Z' },
]

export default function CandidatsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [search, setSearch]               = useState('')
  const [filtreStatut, setFiltreStatut]   = useState<PipelineEtape | 'tous'>('tous')
  const [sortBy, setSortBy]               = useState<'date_desc' | 'date_asc' | 'nom_az' | 'titre_az'>('date_desc')
  const [groupByMetier, setGroupByMetier] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [showUpload, setShowUpload]       = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: candidats, isLoading } = useCandidats({
    search,
    statut: filtreStatut === 'tous' ? undefined : filtreStatut,
  })
  const deleteBulk = useDeleteCandidatsBulk()

  // Client-side sort
  const sorted = useMemo(() => {
    if (!candidats) return []
    const arr = [...candidats] as any[]
    switch (sortBy) {
      case 'date_asc':
        return arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      case 'nom_az':
        return arr.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))
      case 'titre_az':
        return arr.sort((a, b) => (a.titre_poste || 'ZZZZ').localeCompare(b.titre_poste || 'ZZZZ', 'fr'))
      default: // date_desc
        return arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
  }, [candidats, sortBy])

  // Group by métier
  const grouped = useMemo(() => {
    if (!groupByMetier) return null
    const groups: Record<string, any[]> = {}
    for (const c of sorted) {
      const key = c.titre_poste?.trim() || 'Sans métier'
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Sans métier') return 1
      if (b === 'Sans métier') return -1
      return a.localeCompare(b, 'fr')
    })
  }, [sorted, groupByMetier])

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = () => setSelectedIds(new Set(sorted.map((c: any) => c.id)))
  const deselectAll = () => setSelectedIds(new Set())

  const toggleSelectGroup = (ids: string[]) => {
    const allSelected = ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  const handleBulkDelete = () => {
    deleteBulk.mutate(Array.from(selectedIds), {
      onSuccess: () => {
        setSelectedIds(new Set())
        setShowDeleteConfirm(false)
      },
    })
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleCardClick = (id: string) => {
    if (selectedIds.size > 0) toggleSelect(id)
    else router.push(`/candidats/${id}`)
  }

  const initiales = (c: any) => {
    const p = (c.prenom || '').trim()
    const n = (c.nom || '').trim()
    return `${p[0] || ''}${n[0] || ''}`.toUpperCase() || '?'
  }

  const renderCard = (c: any) => {
    const selected = selectedIds.has(c.id)
    return (
      <div
        key={c.id}
        onClick={() => handleCardClick(c.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: selected ? 'var(--primary-soft)' : 'white',
          border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 12, padding: '12px 16px',
          cursor: 'pointer', transition: 'all 0.15s ease',
          boxShadow: selected ? '0 0 0 2px rgba(245,167,35,0.2)' : 'var(--card-shadow)',
        }}
      >
        {/* Checkbox */}
        <div
          onClick={e => { e.stopPropagation(); toggleSelect(c.id) }}
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
            background: selected ? 'var(--primary)' : 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {selected && <Check size={11} color="#0F172A" strokeWidth={3} />}
        </div>

        {/* Avatar */}
        <div
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--primary)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 14, fontWeight: 800,
            color: '#0F172A', flexShrink: 0,
          }}
        >
          {initiales(c)}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', lineHeight: 1.2 }}>
            {c.prenom} {c.nom}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            {c.titre_poste && (
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{c.titre_poste}</span>
            )}
            {c.localisation && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {c.localisation}</span>
            )}
            {c.competences?.slice(0, 3).map((comp: string) => (
              <span key={comp} className="neo-tag" style={{ fontSize: 10, padding: '1px 7px' }}>{comp}</span>
            ))}
          </div>
        </div>

        {/* Exp */}
        {c.annees_exp != null && c.annees_exp > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {c.annees_exp} ans
          </span>
        )}

        {/* Date */}
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>

        {/* Status */}
        <span
          className={ETAPE_BADGE[c.statut_pipeline as PipelineEtape] || 'neo-badge neo-badge-gray'}
          style={{ flexShrink: 0 }}
        >
          {ETAPE_LABELS[c.statut_pipeline as PipelineEtape] || c.statut_pipeline}
        </span>
      </div>
    )
  }

  const selCount = selectedIds.size

  return (
    <div className="d-page">
      {/* Header */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title">Candidats</h1>
          <p className="d-page-sub">
            {isLoading ? '...' : `${sorted.length} candidat${sorted.length > 1 ? 's' : ''}`}
            {selCount > 0 && (
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                {' '}· {selCount} sélectionné{selCount > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <button onClick={() => setShowUpload(true)} className="neo-btn">
          <Upload size={15} /> Importer un CV
        </button>
      </div>

      {/* Selection action bar */}
      {selCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: 'var(--primary-soft)', border: '1px solid rgba(245,167,35,0.35)',
          borderRadius: 12, padding: '10px 16px', marginBottom: 16,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>
            {selCount} candidat{selCount > 1 ? 's' : ''} sélectionné{selCount > 1 ? 's' : ''}
          </span>
          <button onClick={selectAll} className="neo-btn-ghost neo-btn-sm">
            Tout sélectionner ({sorted.length})
          </button>
          <button onClick={deselectAll} className="neo-btn-ghost neo-btn-sm">
            <X size={13} /> Désélectionner
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="neo-btn neo-btn-sm"
            style={{ background: '#DC2626', boxShadow: 'none' }}
          >
            <Trash2 size={13} /> Supprimer ({selCount})
          </button>
        </div>
      )}

      {/* Filters + Sort + Group */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 420 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--muted)' }} />
          <input
            className="neo-input-soft"
            style={{ paddingLeft: 38 }}
            placeholder="Nom, métier, compétence, contenu du CV..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Sort */}
        <div style={{ position: 'relative' }}>
          <SortAsc style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--muted)', pointerEvents: 'none' }} />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="neo-input-soft"
            style={{ paddingLeft: 30, width: 'auto', cursor: 'pointer', fontSize: 13, paddingRight: 8 }}
          >
            {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Group by métier */}
        <button
          onClick={() => { setGroupByMetier(v => !v); setCollapsedGroups(new Set()) }}
          className={groupByMetier ? 'neo-btn neo-btn-sm' : 'neo-btn-ghost neo-btn-sm'}
          style={groupByMetier ? { background: 'var(--primary)', color: '#0F172A' } : {}}
        >
          <LayoutGrid size={13} /> Par métier
        </button>

        {/* Status pills */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {FILTER_OPTS.map(o => (
            <button
              key={o.value}
              onClick={() => setFiltreStatut(o.value as any)}
              style={{
                padding: '5px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700,
                border: '1.5px solid',
                borderColor: filtreStatut === o.value ? 'var(--foreground)' : 'var(--border)',
                background: filtreStatut === o.value ? 'var(--foreground)' : 'white',
                color: filtreStatut === o.value ? 'white' : 'var(--muted)',
                cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 68, background: 'white', border: '1px solid var(--border)', borderRadius: 12, opacity: 0.6 }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">🔍</div>
          <div className="neo-empty-title">Aucun candidat trouvé</div>
          <div className="neo-empty-sub">Modifiez vos filtres ou importez un nouveau CV</div>
          <button onClick={() => setShowUpload(true)} className="neo-btn" style={{ marginTop: 20 }}>
            <Upload size={15} /> Importer un CV
          </button>
        </div>
      ) : grouped ? (
        /* Grouped by métier */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(([metier, items]) => {
            const ids = items.map((c: any) => c.id)
            const allSel = ids.every(id => selectedIds.has(id))
            const someSel = ids.some(id => selectedIds.has(id))
            const isCollapsed = collapsedGroups.has(metier)
            return (
              <div key={metier}>
                {/* Group header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: '2px solid var(--border)', cursor: 'pointer' }}>
                  {/* Group checkbox */}
                  <div
                    onClick={e => { e.stopPropagation(); toggleSelectGroup(ids) }}
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${someSel ? 'var(--primary)' : 'var(--border)'}`,
                      background: allSel ? 'var(--primary)' : someSel ? 'var(--primary-soft)' : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}
                  >
                    {allSel && <Check size={10} color="#0F172A" strokeWidth={3} />}
                    {someSel && !allSel && <div style={{ width: 8, height: 2, background: 'var(--primary)', borderRadius: 2 }} />}
                  </div>

                  <div
                    onClick={() => toggleGroup(metier)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}
                  >
                    {isCollapsed
                      ? <ChevronRight size={15} color="var(--muted)" />
                      : <ChevronDown size={15} color="var(--muted)" />
                    }
                    <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--foreground)' }}>{metier}</span>
                    <span className="neo-badge neo-badge-gray">{items.length}</span>
                  </div>
                </div>

                {/* Group cards */}
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((c: any) => renderCard(c))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Flat list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((c: any) => renderCard(c))}
        </div>
      )}

      {/* Bulk delete confirmation */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div className="neo-card" style={{ maxWidth: 420, width: '90%', padding: 28 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', marginBottom: 8 }}>
              Supprimer {selCount} candidat{selCount > 1 ? 's' : ''} ?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
              Cette action est irréversible. Les candidats et toutes leurs données associées (notes, pipeline) seront définitivement supprimés.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(false)} className="neo-btn-ghost">
                Annuler
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleteBulk.isPending}
                className="neo-btn"
                style={{ background: '#DC2626', boxShadow: 'none' }}
              >
                {deleteBulk.isPending ? 'Suppression...' : `Supprimer (${selCount})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>Importer un CV</DialogTitle>
          </DialogHeader>
          <UploadCV onSuccess={() => {
            setShowUpload(false)
            queryClient.invalidateQueries({ queryKey: ['candidats'] })
          }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
