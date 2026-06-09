'use client'
// TalentFlow Mobile /m/candidats/[id] — Fiche simplifiée (v2.9.72)
import { use, useState, useEffect } from 'react'
import PublicPdfViewer from '@/components/sign/PublicPdfViewer'
import { Pencil } from 'lucide-react'
import MCandidatEditModal from '../../_components/MCandidatEditModal'
import { useQuery } from '@tanstack/react-query'
import {
  Mail, Phone, MapPin, Calendar, FileText, Briefcase,
  Languages, Car, Award, Eye
} from 'lucide-react'
import MHeader from '../../_components/MHeader'
import MAvatar from '../../_components/MAvatar'
import MContactActions from '../../_components/MContactActions'
import { useMetiers } from '@/hooks/useMetiers'
import { useMetierCategories } from '@/hooks/useMetierCategories'

interface Candidat {
  id: string
  nom?: string | null
  prenom?: string | null
  email?: string | null
  telephone?: string | null
  telephone_2?: string | null
  localisation?: string | null
  titre_poste?: string | null
  pipeline_metier?: string | null
  tags?: string[] | null
  photo_url?: string | null
  cv_url?: string | null
  cv_nom_fichier?: string | null
  date_naissance?: string | null
  langues?: string[] | null
  permis_conduire?: boolean | null
  cfc?: boolean | null
  competences?: string[] | null
  formation?: string | null
  resume_ia?: string | null
}

interface CandDoc {
  id: string
  document_type?: string
  document_label?: string
  file_recto_url?: string | null
  file_verso_url?: string | null
  file_recto_path?: string | null
  status_calculated?: string | null
  expiration_date?: string | null
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function initials(c: Candidat): string {
  return ((c.prenom?.[0] || '') + (c.nom?.[0] || '')).toUpperCase() || '?'
}

export default function MobileCandidatDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [docPreview, setDocPreview] = useState<{ url: string; label: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const { metiers } = useMetiers()
  const { getColorForMetier } = useMetierCategories()

  const { data: candData, isLoading } = useQuery<{ candidat: Candidat }>({
    queryKey: ['m', 'candidat', id],
    queryFn: async () => {
      const r = await fetch(`/api/candidats/${id}`, { credentials: 'include' })
      if (!r.ok) throw new Error('not_found')
      return r.json()
    },
  })

  const { data: docsData } = useQuery<{ documents: CandDoc[] }>({
    queryKey: ['m', 'candidat-docs', id],
    queryFn: async () => {
      const r = await fetch(`/api/candidats/${id}/documents`, { credentials: 'include' })
      if (!r.ok) return { documents: [] }
      return r.json()
    },
  })

  const c = candData?.candidat
  const docs = docsData?.documents || []

  if (isLoading) {
    return (
      <>
        <MHeader title="Candidat" back="/m/candidats" />
        <div className="m-loading">Chargement...</div>
      </>
    )
  }

  if (!c) {
    return (
      <>
        <MHeader title="Candidat" back="/m/candidats" />
        <div className="m-empty">
          <div className="m-empty-emoji">😕</div>
          <div>Candidat introuvable</div>
        </div>
      </>
    )
  }

  const fullName = `${c.prenom || ''} ${c.nom || ''}`.trim() || 'Sans nom'

  return (
    <>
      <MHeader title={fullName} back="/m/candidats" action={
        <button onClick={() => setEditing(true)} className="m-header-action" aria-label="Modifier le candidat">
          <Pencil size={15} /> Modifier
        </button>
      } />
      <div className="m-content">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
          <MAvatar src={c.photo_url} initials={initials(c)} alt={fullName} size={96} className="m-avatar lg" />
          <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>{fullName}</div>
          {c.titre_poste && (
            <div style={{ fontSize: 13, color: 'var(--m-text-soft)', marginTop: 2, textAlign: 'center' }}>
              {c.titre_poste}
            </div>
          )}
          {(() => {
            const assigned = (c.tags || []).filter((t) => metiers.includes(t))
            if (assigned.length === 0) return null
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                {assigned.map((t) => {
                  const color = getColorForMetier(t) || '#9a8a3a'
                  return (
                    <span
                      key={t}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                        color, background: `${color}1a`, border: `1px solid ${color}40`,
                      }}
                    >
                      {t}
                    </span>
                  )
                })}
              </div>
            )
          })()}
          {(c.telephone || c.email) && (
            <div style={{ marginTop: 14 }}>
              <MContactActions phone={c.telephone} email={c.email} size="lg" />
            </div>
          )}
        </div>

        <div className="m-section-title">Coordonnées</div>
        <div className="m-info-list">
          {c.email && (
            <a href={`mailto:${c.email}`} className="m-info-row">
              <Mail size={18} className="m-info-icon" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-info-label">Email</div>
                <div className="m-info-val">{c.email}</div>
              </div>
            </a>
          )}
          {c.telephone && (
            <a href={`tel:${c.telephone}`} className="m-info-row">
              <Phone size={18} className="m-info-icon" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-info-label">Téléphone</div>
                <div className="m-info-val">{c.telephone}</div>
              </div>
            </a>
          )}
          {c.localisation && (
            <div className="m-info-row">
              <MapPin size={18} className="m-info-icon" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-info-label">Localisation</div>
                <div className="m-info-val">{c.localisation}</div>
              </div>
            </div>
          )}
          {c.date_naissance && (
            <div className="m-info-row">
              <Calendar size={18} className="m-info-icon" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-info-label">Naissance</div>
                <div className="m-info-val">{fmtDate(c.date_naissance)}</div>
              </div>
            </div>
          )}
          {!c.email && !c.telephone && !c.localisation && !c.date_naissance && (
            <div className="m-info-row">
              <div style={{ color: 'var(--m-text-soft)', fontSize: 13 }}>Aucune coordonnée renseignée</div>
            </div>
          )}
        </div>

        {(c.langues?.length || c.permis_conduire || c.cfc || c.formation) && (
          <>
            <div className="m-section-title">Profil</div>
            <div className="m-info-list">
              {c.langues && c.langues.length > 0 && (
                <div className="m-info-row">
                  <Languages size={18} className="m-info-icon" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="m-info-label">Langues</div>
                    <div className="m-info-val">{c.langues.join(', ')}</div>
                  </div>
                </div>
              )}
              {c.permis_conduire && (
                <div className="m-info-row">
                  <Car size={18} className="m-info-icon" />
                  <div className="m-info-val">Permis de conduire ✓</div>
                </div>
              )}
              {c.cfc && (
                <div className="m-info-row">
                  <Award size={18} className="m-info-icon" />
                  <div className="m-info-val">CFC ✓</div>
                </div>
              )}
              {c.formation && (
                <div className="m-info-row">
                  <Briefcase size={18} className="m-info-icon" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="m-info-label">Formation</div>
                    <div className="m-info-val" style={{ whiteSpace: 'normal', fontWeight: 500, fontSize: 13 }}>{c.formation}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {c.cv_url && (
          <>
            <div className="m-section-title">CV</div>
            <button
              type="button"
              className="m-card"
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => setDocPreview({ url: c.cv_url!, label: c.cv_nom_fichier || 'CV' })}
            >
              <div className="m-avatar"><FileText size={20} /></div>
              <div className="m-card-body">
                <div className="m-card-title">{c.cv_nom_fichier || 'Voir le CV'}</div>
                <div className="m-card-sub">Aperçu</div>
              </div>
              <Eye size={18} style={{ color: 'var(--m-text-soft)' }} />
            </button>
          </>
        )}

        {docs.length > 0 && (
          <>
            <div className="m-section-title">Documents ({docs.length})</div>
            {docs.map((d) => (
              <button
                key={d.id}
                type="button"
                className="m-card"
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                disabled={!d.file_recto_url}
                onClick={() => d.file_recto_url && setDocPreview({
                  url: d.file_recto_url,
                  label: d.document_label || d.document_type || 'Document',
                })}
              >
                <div className="m-avatar"><FileText size={20} /></div>
                <div className="m-card-body">
                  <div className="m-card-title">{d.document_label || d.document_type || 'Document'}</div>
                  <div className="m-card-sub">
                    {d.status_calculated === 'expired' && '⚠️ Expiré'}
                    {d.status_calculated === 'expires_soon' && '⏰ Expire bientôt'}
                    {d.status_calculated === 'valid' && '✓ Valide'}
                    {d.expiration_date && ` · jusqu'au ${fmtDate(d.expiration_date)}`}
                  </div>
                </div>
                {d.file_recto_url && <Eye size={18} style={{ color: 'var(--m-text-soft)' }} />}
              </button>
            ))}
          </>
        )}

      </div>

      {docPreview && (
        <DocPreviewModal
          url={docPreview.url}
          label={docPreview.label}
          onClose={() => setDocPreview(null)}
        />
      )}

      {editing && (
        <MCandidatEditModal
          candidat={{
            id: c.id,
            prenom: c.prenom,
            nom: c.nom,
            email: c.email,
            telephone: c.telephone,
            telephone_2: c.telephone_2,
            localisation: c.localisation,
            titre_poste: c.titre_poste,
            tags: c.tags,
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

function DocPreviewModal({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  const isImage = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)

  // Autoriser le pinch-zoom pendant l'aperçu (le viewport global de l'app le bloque),
  // puis restaurer à la fermeture. → le doc s'ouvre ajusté à l'écran, l'utilisateur zoome ensuite.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
    const prev = meta?.getAttribute('content') ?? null
    meta?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=6, user-scalable=yes, viewport-fit=cover')
    return () => {
      if (meta) meta.setAttribute('content', prev ?? 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        padding: 12, color: '#fff', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))'
      }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, padding: 8 }}>← Fermer</button>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{label}</div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
        {isImage ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', minHeight: '100%' }}>
            <img src={url} alt={label} style={{ maxWidth: '100%', height: 'auto' }} />
          </div>
        ) : (
          <PublicPdfViewer url={url} />
        )}
      </div>
    </div>
  )
}
