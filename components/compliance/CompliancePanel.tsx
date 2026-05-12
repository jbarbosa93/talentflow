'use client'

// TalentFlow Compliance — Panel principal (slide-in modal)
// v2.5.0
//
// Affiche tous les documents de conformité d'un candidat :
// - Banner chauffeur + checklist documents obligatoires (si is_driver=true)
// - Cards par catégorie (Identité / Permis / Qualifications / Formations / Autres)
// - CRUD complet : ajouter, éditer, supprimer
// - Viewer plein écran recto/verso

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  X, Plus, Pencil, Trash2, Eye, IdCard, Car, Award, GraduationCap,
  FileText, AlertTriangle, CheckCircle2, XCircle, Clock, ToggleLeft, ToggleRight, Loader2,
} from 'lucide-react'
import type {
  DocumentType,
  CandidatDocumentWithStatus,
  ChecklistItem,
  DocumentCategory,
} from '@/lib/compliance/types'
import { DOCUMENT_CATEGORY_CONFIG } from '@/lib/compliance/types'
import {
  DOCUMENT_STATUS_CONFIG,
  formatExpiryDate,
  formatExpiryLong,
} from '@/lib/compliance/document-status'
import DocumentEditorModal from './DocumentEditorModal'
import DocumentViewerModal from './DocumentViewerModal'

interface CompliancePanelProps {
  open: boolean
  onClose: () => void
  candidatId: string
  candidatName?: string
}

const CATEGORY_ORDER: DocumentCategory[] = ['identite', 'permis_conduire', 'qualification', 'formation', 'autre']

const CATEGORY_ICON: Record<DocumentCategory, typeof IdCard> = {
  identite: IdCard,
  permis_conduire: Car,
  qualification: Award,
  formation: GraduationCap,
  autre: FileText,
}

export default function CompliancePanel({ open, onClose, candidatId, candidatName }: CompliancePanelProps) {
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<CandidatDocumentWithStatus[]>([])
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [types, setTypes] = useState<DocumentType[]>([])
  const [isDriver, setIsDriver] = useState(false)
  const [isDriverOverride, setIsDriverOverride] = useState<boolean | null>(null)
  const [editing, setEditing] = useState<CandidatDocumentWithStatus | null>(null)
  const [creating, setCreating] = useState<{ prefilledTypeId?: string } | null>(null)
  const [viewing, setViewing] = useState<{ doc: CandidatDocumentWithStatus; side: 'recto' | 'verso' } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CandidatDocumentWithStatus | null>(null)
  const [togglingOverride, setTogglingOverride] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [docsRes, typesRes] = await Promise.all([
        fetch(`/api/candidats/${candidatId}/documents`, { cache: 'no-store' }),
        fetch(`/api/document-types`, { cache: 'no-store' }),
      ])
      const docs = await docsRes.json()
      const tps = await typesRes.json()
      if (!docsRes.ok) throw new Error(docs.error || 'Erreur chargement')
      setDocuments(docs.documents || [])
      setChecklist(docs.checklist || [])
      setIsDriver(!!docs.candidat?.is_driver)
      setIsDriverOverride(docs.candidat?.is_driver_override ?? null)
      setTypes(tps.document_types || [])
    } catch (e: any) {
      toast.error(e.message || 'Erreur chargement')
    } finally {
      setLoading(false)
    }
  }, [candidatId])

  useEffect(() => { if (open) load() }, [open, load])

  const grouped = useMemo(() => {
    const map: Record<DocumentCategory, CandidatDocumentWithStatus[]> = {
      identite: [], permis_conduire: [], qualification: [], formation: [], autre: [],
    }
    for (const d of documents) {
      const cat = (d.document_type?.category || 'autre') as DocumentCategory
      ;(map[cat] || map.autre).push(d)
    }
    return map
  }, [documents])

  const handleDelete = async (doc: CandidatDocumentWithStatus) => {
    try {
      const res = await fetch(`/api/candidats/${candidatId}/documents/${doc.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      toast.success('Document supprimé')
      setConfirmDelete(null)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleSaved = async () => {
    setEditing(null); setCreating(null)
    await load()
  }

  const handleToggleOverride = async (newValue: boolean | null) => {
    setTogglingOverride(true)
    try {
      const res = await fetch(`/api/candidats/${candidatId}/driver-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_driver_override: newValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setIsDriverOverride(newValue)
      toast.success('Statut chauffeur mis à jour')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setTogglingOverride(false)
    }
  }

  if (!open || typeof window === 'undefined') return null

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          animation: 'fadeIn 0.15s ease',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: 'min(920px, 95vw)',
            maxHeight: '92vh',
            background: 'var(--card)',
            borderRadius: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.30), 0 4px 16px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '20px 24px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, flexShrink: 0,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{
                fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
                fontSize: 22, fontWeight: 400, margin: 0, lineHeight: 1.15,
                letterSpacing: '-0.01em', color: 'var(--foreground)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Conformité{candidatName && <span style={{ color: 'var(--muted-foreground)' }}> · {candidatName}</span>}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '4px 0 0', fontWeight: 500 }}>
                {documents.length === 0 ? 'Aucun document' : `${documents.length} document${documents.length > 1 ? 's' : ''}`}
                {isDriver && <span style={{ color: '#22C55E', marginLeft: 8 }}>· 🚛 Chauffeur</span>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setCreating({})}
                style={primaryBtnStyle}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}
              >
                <Plus size={14} /> Ajouter
              </button>
              <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
            </div>
          </div>

          {/* Body */}
          <div style={{ overflow: 'auto', padding: 24, flex: 1 }}>
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--muted)' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}

            {!loading && isDriver && (
              <DriverBanner
                checklist={checklist}
                overrideState={isDriverOverride}
                onToggleOverride={handleToggleOverride}
                toggling={togglingOverride}
                onAdd={(typeId) => setCreating({ prefilledTypeId: typeId })}
                onView={(doc, side) => setViewing({ doc, side })}
              />
            )}

            {!loading && !isDriver && (
              <NonDriverHint
                overrideState={isDriverOverride}
                onForceDriver={() => handleToggleOverride(true)}
                toggling={togglingOverride}
              />
            )}

            {!loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 22 }}>
                {CATEGORY_ORDER.map(cat => {
                  const docs = grouped[cat]
                  if (!docs || docs.length === 0) return null
                  const Icon = CATEGORY_ICON[cat]
                  const cfg = DOCUMENT_CATEGORY_CONFIG[cat]
                  return (
                    <div key={cat}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                        paddingBottom: 8, borderBottom: '1px dashed var(--border)',
                      }}>
                        <Icon size={16} style={{ color: 'var(--muted-foreground)' }} />
                        <h3 style={{
                          margin: 0, fontSize: 11, fontWeight: 700,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: 'var(--muted-foreground)',
                        }}>{cfg.label}</h3>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {docs.length}</span>
                      </div>
                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                        {docs.map(doc => (
                          <DocumentCard
                            key={doc.id}
                            doc={doc}
                            onView={(side) => setViewing({ doc, side })}
                            onEdit={() => setEditing(doc)}
                            onDelete={() => setConfirmDelete(doc)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {documents.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
                    Aucun document. Clique sur <strong style={{ color: 'var(--primary)' }}>+ Ajouter</strong> pour démarrer.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals enfants */}
      {(editing || creating) && (
        <DocumentEditorModal
          types={types}
          candidatId={candidatId}
          existingDoc={editing}
          prefilledTypeId={creating?.prefilledTypeId}
          onClose={() => { setEditing(null); setCreating(null) }}
          onSaved={handleSaved}
        />
      )}
      {viewing && (
        <DocumentViewerModal
          candidatId={candidatId}
          docId={viewing.doc.id}
          label={viewing.doc.label}
          initialSide={viewing.side}
          hasRecto={!!viewing.doc.file_recto_path}
          hasVerso={!!viewing.doc.file_verso_path}
          onClose={() => setViewing(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDeleteModal
          doc={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </>,
    document.body
  )
}

// ─── Banner chauffeur + checklist ──────────────────────────────────────────────

function DriverBanner({ checklist, overrideState, onToggleOverride, toggling, onAdd, onView }: {
  checklist: ChecklistItem[]
  overrideState: boolean | null
  onToggleOverride: (v: boolean | null) => void
  toggling: boolean
  onAdd: (typeId: string) => void
  onView: (doc: CandidatDocumentWithStatus, side: 'recto' | 'verso') => void
}) {
  const missing = checklist.filter(i => i.status === 'missing').length
  const expired = checklist.filter(i => i.status === 'expired').length
  const okCount = checklist.filter(i => i.status === 'valid').length

  return (
    <div style={{
      background: 'rgba(245,166,35,0.10)',
      border: '1px solid rgba(245,166,35,0.35)',
      borderRadius: 12, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <AlertTriangle size={18} style={{ color: '#F5A623', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
            Ce candidat est chauffeur — vérifie ses documents obligatoires
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            <strong style={{ color: '#22C55E' }}>{okCount} valide{okCount > 1 ? 's' : ''}</strong>
            {missing > 0 && <> · <strong style={{ color: 'var(--destructive)' }}>{missing} manquant{missing > 1 ? 's' : ''}</strong></>}
            {expired > 0 && <> · <strong style={{ color: 'var(--destructive)' }}>{expired} expiré{expired > 1 ? 's' : ''}</strong></>}
          </div>
        </div>
        <button
          onClick={() => onToggleOverride(overrideState === false ? null : false)}
          disabled={toggling}
          title={overrideState === false ? 'Forcé non-chauffeur — clique pour revenir auto' : 'Forcer ce candidat comme non-chauffeur'}
          style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 6,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--muted-foreground)', cursor: 'pointer',
          }}
        >
          {overrideState === false ? '← Auto' : 'Pas chauffeur'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {checklist.map(item => (
          <ChecklistRow
            key={item.document_type.id}
            item={item}
            onAdd={() => onAdd(item.document_type.id)}
            onView={(side) => item.document && onView(item.document, side)}
          />
        ))}
      </div>
    </div>
  )
}

function ChecklistRow({ item, onAdd, onView }: {
  item: ChecklistItem
  onAdd: () => void
  onView: (side: 'recto' | 'verso') => void
}) {
  const { document_type: t, status, document: doc } = item
  const isOk = status === 'valid'
  const isExpired = status === 'expired'
  const isExpiringSoon = status === 'expiring_soon'

  let icon: React.ReactNode = null
  let color = 'var(--muted-foreground)'
  let text = ''
  if (status === 'missing') {
    icon = <XCircle size={14} />
    color = 'var(--destructive)'
    text = 'Manquant'
  } else if (isExpired) {
    icon = <XCircle size={14} />
    color = 'var(--destructive)'
    text = `Expiré le ${formatExpiryDate(doc?.expiry_date)}`
  } else if (isExpiringSoon) {
    icon = <Clock size={14} />
    color = '#F97316'
    text = `Expire le ${formatExpiryDate(doc?.expiry_date)}`
  } else if (isOk) {
    icon = <CheckCircle2 size={14} />
    color = '#22C55E'
    text = doc?.expiry_date ? `Valide jusqu'au ${formatExpiryDate(doc.expiry_date)}` : 'Valide'
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      background: 'var(--card)', border: '1px solid var(--border)',
    }}>
      <span style={{ color, display: 'flex' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{t.name}</div>
        <div style={{ fontSize: 11, color, fontWeight: 500 }}>{text}</div>
      </div>
      {doc ? (
        <button onClick={() => onView('recto')} style={ghostBtnStyle}>
          <Eye size={12} /> Voir
        </button>
      ) : (
        <button onClick={onAdd} style={ghostPrimaryBtnStyle}>
          <Plus size={12} /> Ajouter
        </button>
      )}
    </div>
  )
}

function NonDriverHint({ overrideState, onForceDriver, toggling }: {
  overrideState: boolean | null
  onForceDriver: () => void
  toggling: boolean
}) {
  if (overrideState === true) {
    // Affiché si forcé chauffeur — mais isDriver=true → ne devrait pas atterrir ici
    return null
  }
  return (
    <div style={{
      background: 'var(--secondary)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 12,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 18 }}>ℹ️</span>
      <div style={{ flex: 1, fontSize: 12, color: 'var(--muted-foreground)' }}>
        Ce candidat n'est pas détecté comme chauffeur. Si c'est une erreur (ex: grutier avec permis C),{' '}
        <button
          onClick={onForceDriver}
          disabled={toggling}
          style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}
        >
          forcer chauffeur
        </button>{' '}
        pour activer la checklist obligatoire.
      </div>
    </div>
  )
}

// ─── Document card ─────────────────────────────────────────────────────────────

function DocumentCard({ doc, onView, onEdit, onDelete }: {
  doc: CandidatDocumentWithStatus
  onView: (side: 'recto' | 'verso') => void
  onEdit: () => void
  onDelete: () => void
}) {
  const statusCfg = DOCUMENT_STATUS_CONFIG[doc.status]
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 12,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: 4,
          background: statusCfg.dot, flexShrink: 0, marginTop: 6,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: 'var(--foreground)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{doc.label}</div>
          {doc.sub_category && (
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>
              Catégorie : {doc.sub_category}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: statusCfg.color, fontWeight: 600 }}>
        {formatExpiryLong(doc.expiry_date).charAt(0).toUpperCase() + formatExpiryLong(doc.expiry_date).slice(1)}
      </div>

      {doc.document_number && (
        <div style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
          N° {doc.document_number}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {doc.file_recto_path && (
          <button onClick={() => onView('recto')} style={fileBtnStyle}><Eye size={11} /> Recto</button>
        )}
        {doc.file_verso_path && (
          <button onClick={() => onView('verso')} style={fileBtnStyle}><Eye size={11} /> Verso</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={onEdit} style={iconBtnStyle} title="Modifier"><Pencil size={12} /></button>
          <button onClick={onDelete} style={iconBtnDangerStyle} title="Supprimer"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm delete modal ──────────────────────────────────────────────────────

function ConfirmDeleteModal({ doc, onCancel, onConfirm }: {
  doc: CandidatDocumentWithStatus
  onCancel: () => void
  onConfirm: () => void
}) {
  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(440px, 95vw)', background: 'var(--card)',
          borderRadius: 14, padding: 20, border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
        }}
      >
        <h3 style={{ margin: 0, fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontSize: 20, fontWeight: 400, color: 'var(--foreground)' }}>
          Supprimer ce document ?
        </h3>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
          <strong style={{ color: 'var(--foreground)' }}>{doc.label}</strong> sera supprimé définitivement. Cette action est irréversible.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} style={secondaryBtnStyle}>Annuler</button>
          <button onClick={onConfirm} style={dangerBtnStyle}>Supprimer</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 36, padding: '0 16px', borderRadius: 10,
  background: 'var(--primary)', border: '1.5px solid var(--primary)',
  color: '#1C1A14', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', transition: 'all 0.15s',
  boxShadow: '0 4px 12px -4px rgba(234,179,8,.45)',
}

const closeBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid var(--border)',
  cursor: 'pointer', color: 'var(--muted-foreground)',
}

const fileBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 26, padding: '0 8px', borderRadius: 6,
  background: 'var(--secondary)', border: '1px solid var(--border)',
  color: 'var(--foreground)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
}

const iconBtnStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--muted-foreground)', cursor: 'pointer',
}

const iconBtnDangerStyle: React.CSSProperties = {
  ...iconBtnStyle,
  color: 'var(--destructive)',
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 8px', borderRadius: 6,
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--muted-foreground)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
}

const ghostPrimaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 8px', borderRadius: 6,
  background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.45)',
  color: 'var(--primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
}

const secondaryBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 14px', borderRadius: 8,
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const dangerBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 14px', borderRadius: 8,
  background: 'var(--destructive)', border: '1px solid var(--destructive)',
  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
