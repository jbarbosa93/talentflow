'use client'
import { useState } from 'react'
import { Upload, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import UploadCV from '@/components/UploadCV'
import { useCandidats } from '@/hooks/useCandidats'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
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

export default function CandidatsPage() {
  const [search, setSearch]           = useState('')
  const [filtreStatut, setFiltreStatut] = useState<PipelineEtape | 'tous'>('tous')
  const [showUpload, setShowUpload]   = useState(false)
  const queryClient = useQueryClient()

  const { data: candidats, isLoading } = useCandidats({
    search,
    statut: filtreStatut === 'tous' ? undefined : filtreStatut,
  })

  const initiales = (c: any) => {
    const n = (c.nom || '').trim(); const p = (c.prenom || '').trim()
    return `${p[0] || ''}${n[0] || ''}`.toUpperCase() || '?'
  }

  return (
    <div className="d-page">
      {/* Header */}
      <div className="d-page-header">
        <div>
          <h1 className="d-page-title">Candidats</h1>
          <p className="d-page-sub">
            {isLoading ? '...' : `${candidats?.length || 0} candidat${(candidats?.length || 0) > 1 ? 's' : ''} dans la base`}
          </p>
        </div>
        <button onClick={() => setShowUpload(true)} className="neo-btn">
          <Upload style={{ width: 15, height: 15 }} />
          Importer un CV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--ink2)' }} />
          <input
            className="neo-input-soft"
            style={{ paddingLeft: 38 }}
            placeholder="Rechercher un candidat..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTER_OPTS.map(o => (
            <button
              key={o.value}
              onClick={() => setFiltreStatut(o.value as any)}
              style={{
                padding: '6px 14px',
                borderRadius: 100,
                border: '2px solid',
                borderColor: filtreStatut === o.value ? 'var(--ink)' : '#E8E0C8',
                background: filtreStatut === o.value ? 'var(--y)' : 'white',
                color: 'var(--ink)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: filtreStatut === o.value ? '2px 2px 0 var(--ink)' : 'none',
                fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Candidate list */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 72, background: 'white', border: '2px solid #E8E0C8', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : candidats?.length === 0 ? (
        <div className="neo-empty">
          <div className="neo-empty-icon">🔍</div>
          <div className="neo-empty-title">Aucun candidat trouvé</div>
          <div className="neo-empty-sub">Modifiez vos filtres ou importez un nouveau CV</div>
          <button onClick={() => setShowUpload(true)} className="neo-btn" style={{ marginTop: 20 }}>
            <Upload style={{ width: 15, height: 15 }} /> Importer un CV
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {candidats?.map((c: any) => (
            <Link key={c.id} href={`/candidats/${c.id}`} className="neo-candidate-card">
              {/* Avatar */}
              <div className="neo-avatar" style={{ width: 44, height: 44, fontSize: 15 }}>
                {initiales(c)}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>
                  {c.prenom} {c.nom}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                  {c.titre_poste && (
                    <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>{c.titre_poste}</span>
                  )}
                  {c.email && (
                    <span style={{ fontSize: 12, color: 'var(--ink2)' }}>{c.email}</span>
                  )}
                </div>
              </div>

              {/* Score */}
              {c.score_matching != null && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '6px 14px', background: c.score_matching >= 75 ? 'var(--y)' : 'var(--y2)',
                  border: '2px solid var(--ink)', borderRadius: 10, fontSize: 12,
                  boxShadow: '2px 2px 0 var(--ink)',
                }}>
                  <span style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--font-heading)', color: 'var(--ink)' }}>
                    {c.score_matching}%
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink2)' }}>
                    Score IA
                  </span>
                </div>
              )}

              {/* Status badge */}
              <span className={ETAPE_BADGE[c.statut_pipeline as PipelineEtape] || 'neo-badge neo-badge-gray'}>
                {ETAPE_LABELS[c.statut_pipeline as PipelineEtape] || c.statut_pipeline}
              </span>
            </Link>
          ))}
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
