'use client'
// TalentFlow Mobile /m/candidats/[id] — Fiche simplifiée (v2.9.72)
import { use, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Mail, Phone, MapPin, Calendar, FileText, Briefcase,
  Languages, Car, Award, FileSignature, ExternalLink, Eye
} from 'lucide-react'
import MHeader from '../../_components/MHeader'

interface Candidat {
  id: string
  nom?: string | null
  prenom?: string | null
  email?: string | null
  telephone?: string | null
  localisation?: string | null
  titre_poste?: string | null
  pipeline_metier?: string | null
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
      <MHeader title={fullName} back="/m/candidats" />
      <div className="m-content">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
          <div className="m-avatar lg">
            {c.photo_url
              ? <img src={c.photo_url} alt={fullName} />
              : initials(c)}
          </div>
          <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800, textAlign: 'center' }}>{fullName}</div>
          {(c.titre_poste || c.pipeline_metier) && (
            <div style={{ fontSize: 13, color: 'var(--m-text-soft)', marginTop: 2, textAlign: 'center' }}>
              {c.titre_poste || c.pipeline_metier}
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

        <div className="m-section-title">Actions</div>
        <a href={`/candidats/${id}`} className="m-btn secondary full" style={{ marginBottom: 8 }}>
          <ExternalLink size={16} /> Fiche complète (desktop)
        </a>
        <a href={`/m/sign/new?candidate_id=${id}`} className="m-btn primary full">
          <FileSignature size={16} /> Envoyer un document à signer
        </a>
      </div>

      {docPreview && (
        <DocPreviewModal
          url={docPreview.url}
          label={docPreview.label}
          onClose={() => setDocPreview(null)}
        />
      )}
    </>
  )
}

function DocPreviewModal({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  const isImage = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        padding: 12, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))'
      }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, padding: 8 }}>← Fermer</button>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{label}</div>
        <div style={{ width: 60 }} />
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
      >
        {isImage ? (
          <img src={url} alt={label} style={{ maxWidth: '100%', height: 'auto' }} />
        ) : (
          <iframe src={url} title={label} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        )}
      </div>
    </div>
  )
}
