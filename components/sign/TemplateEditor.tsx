// TalentFlow Sign — Éditeur visuel de template (orchestrateur)
// v2.2.0 — Phase 2
// Layout 2 colonnes : viewer PDF (gauche) + toolbar champs/recipients (droite).
// Lazy import PDFViewer + FieldsCanvas (SSR off).
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Save, Loader2,
  PenLine, Type, CheckSquare, Calendar, List as ListIcon, Trash2, Files,
  StickyNote, Plus, Hash, Mail, Building2, Briefcase, User, IdCard,
  Sigma, Paperclip, Pencil, Check as CheckIcon, X as XIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import type { PageRenderInfo } from './PDFViewer'
import type {
  SignDocument, SignField, SignFieldType,
  SignRecipientSchema, SignFieldCondition, SignConditionOperator, SignConditionAction,
} from '@/lib/sign/types'
import type { WizardStep } from '@/lib/sign/wizard-builder'
import {
  RECIPIENT_COLORS, FIELD_TYPE_LABELS, FIELD_TYPE_CATEGORIES,
  CONDITION_OPERATOR_LABELS, CONDITION_ACTION_LABELS,
  AUTO_FILL_FIELD_TYPES, DATE_FORMATS, CURRENCIES, COMMON_MIME_TYPES,
  FONT_FAMILIES, FONT_SIZES, FONT_COLORS,
} from '@/lib/sign/types'

const PDFViewer = dynamic(() => import('./PDFViewer'), {
  ssr: false,
  loading: () => <div style={{ padding: 40, color: 'var(--muted)' }}><Loader2 size={20} className="animate-spin" /></div>,
})
const FieldsCanvas = dynamic(() => import('./FieldsCanvas'), { ssr: false })

interface Props {
  templateId: string
  templateName: string
  // v2.2.2 — État partagé contrôlé par le parent (page.tsx)
  documents: SignDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<SignDocument[]>>
  recipientsSchema: SignRecipientSchema[]
  setRecipientsSchema: React.Dispatch<React.SetStateAction<SignRecipientSchema[]>>
  // wizard_steps + wizard_enabled : transmis pour persister au save (atomic),
  // pas modifiés depuis ce panneau (read-only)
  wizardSteps: WizardStep[]
  wizardEnabled: boolean
  /** v2.2.2 — Counter incrémenté par le parent à chaque fetch successful. Trigger reset dirty. */
  serverVersion?: number
  onSaved?: () => void
}

// v2.2.0 Phase 2.5 — toolbar alignée DocuSign avec 4 catégories
const TOOL_ICONS: Record<SignFieldType, typeof PenLine> = {
  signature:  PenLine,
  initial:    IdCard,
  date:       Calendar,
  firstname:  User,
  lastname:   User,
  fullname:   User,
  email:      Mail,
  company:    Building2,
  title:      Briefcase,
  text:       Type,
  number:     Hash,
  checkbox:   CheckSquare,
  select:     ListIcon,
  annotation: StickyNote,
  formula:    Sigma,
  attachment: Paperclip,
}

const PDF_TARGET_WIDTH = 720 // px (largeur cible du PDF rendu)

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export default function TemplateEditor({
  templateId, templateName,
  documents: docs, setDocuments: setDocs,
  recipientsSchema: recipients, setRecipientsSchema: setRecipients,
  wizardSteps, wizardEnabled, serverVersion = 0, onSaved,
}: Props) {
  const router = useRouter()

  const [activeDocIdx, setActiveDocIdx] = useState(0)
  const [activePage, setActivePage] = useState(1)
  const [numPages, setNumPages] = useState<number>(0)
  const [renderInfo, setRenderInfo] = useState<PageRenderInfo | null>(null)
  const [activeTool, setActiveTool] = useState<SignFieldType | null>(null)
  const [activeRecipientOrder, setActiveRecipientOrder] = useState<number>(
    () => recipients[0]?.order ?? 1
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [renamingDocIdx, setRenamingDocIdx] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [dirty, setDirty] = useState(false)

  const activeDoc = docs[activeDocIdx]
  const fields = useMemo(() => activeDoc?.fields || [], [activeDoc])

  // Reset page sur changement de doc
  useEffect(() => {
    setActivePage(1)
    setSelectedIds([])
  }, [activeDocIdx])

  // Reset sélection quand on change de page (UX cohérent)
  useEffect(() => {
    setSelectedIds([])
  }, [activePage])

  // v2.2.2 — Reset dirty quand le parent recharge (après save)
  useEffect(() => {
    if (serverVersion > 0) setDirty(false)
  }, [serverVersion])

  // URL du PDF (route authentifiée)
  const fileUrl = useMemo(() => {
    if (!activeDoc) return ''
    return `/api/sign/templates/${templateId}/file?path=${encodeURIComponent(activeDoc.storage_path)}`
  }, [activeDoc, templateId])

  // Update doc fields
  const updateDocFields = (newFields: SignField[]) => {
    setDocs(prev => prev.map((d, i) => i === activeDocIdx ? { ...d, fields: newFields } : d))
    setDirty(true)
  }

  // v2.2.1 — Shift bulk : décale tous les fields du doc actif d'un offset normalisé.
  // Utile pour corriger un décalage uniforme (ex: champs générés par l'IA légèrement off).
  const shiftAllFields = (deltaX: number, deltaY: number) => {
    if (!activeDoc) return
    const newFields = (activeDoc.fields || []).map(f => ({
      ...f,
      x: Math.max(0, Math.min(1 - f.width, f.x + deltaX)),
      y: Math.max(0, Math.min(1 - f.height, f.y + deltaY)),
    }))
    updateDocFields(newFields)
  }

  // Update une recipient
  const updateRecipient = (idx: number, patch: Partial<SignRecipientSchema>) => {
    setRecipients(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
    setDirty(true)
  }

  // Save — v2.2.2 : envoie aussi wizard_steps + wizard_enabled (atomic) pour
  // que les modifs faites dans Mode Wizard ne soient pas perdues si l'admin
  // sauve depuis Mode Document. Le state vient maintenant du parent partagé.
  const handleSave = async () => {
    setSaving(true)
    try {
      const r = await fetch(`/api/sign/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: docs,
          recipients_schema: recipients,
          wizard_steps: wizardSteps,
          wizard_enabled: wizardEnabled,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Template enregistré')
      setDirty(false)
      onSaved?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Delete field(s) selected (bouton aussi exposé dans le panel droit)
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return
    const set = new Set(selectedIds)
    updateDocFields(fields.filter(f => !set.has(f.id)))
    setSelectedIds([])
  }

  // Update partiel d'un champ (par id)
  const patchField = (id: string, patch: Partial<SignField>) => {
    updateDocFields(fields.map(f => f.id === id ? { ...f, ...patch } : f))
  }

  // Update plusieurs champs en une fois
  const patchFields = (ids: string[], patch: Partial<SignField>) => {
    const set = new Set(ids)
    updateDocFields(fields.map(f => set.has(f.id) ? { ...f, ...patch } : f))
  }

  // Patche tous les champs d'un groupe (pour propager nom/règle/min/max)
  const patchAllInGroup = (groupId: string, patch: Partial<SignField>) => {
    updateDocFields(fields.map(f => f.groupId === groupId ? { ...f, ...patch } : f))
  }

  // Grouper les checkboxes sélectionnés
  const handleGroupCheckboxes = (
    rule: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly',
    count: number,
    label?: string,
  ) => {
    const groupId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const selectedFields = fields.filter(f => selectedIds.includes(f.id) && f.type === 'checkbox')
    if (selectedFields.length === 0) return
    const fallbackName = `G${(fields.filter(f => f.groupId).map(f => f.groupId).filter((v, i, a) => a.indexOf(v) === i).length) + 1}`
    const groupName = label || fallbackName
    const set = new Set(selectedFields.map(f => f.id))
    updateDocFields(fields.map(f => {
      if (!set.has(f.id)) return f
      return {
        ...f,
        groupId,
        groupName,
        groupRule: rule,
        groupMin: rule === 'SelectAtMost' ? undefined : count,
        groupMax: rule === 'SelectAtLeast' ? undefined : count,
      }
    }))
  }

  // Retirer un champ d'un groupe
  const handleUngroup = (id: string) => {
    patchField(id, { groupId: undefined, groupName: undefined, groupRule: undefined, groupMin: undefined, groupMax: undefined })
  }

  if (!activeDoc) {
    return (
      <div className="neo-empty">
        <div className="neo-empty-title">Ce template n&apos;a aucun document</div>
        <div className="neo-empty-sub">Ajoute des PDFs depuis le modal de création de template.</div>
      </div>
    )
  }

  // Calcule la taille rendue du PDF — on utilise renderInfo dès qu'il est dispo
  const renderedW = renderInfo?.renderedWidth ?? PDF_TARGET_WIDTH
  const renderedH = renderInfo?.renderedHeight ?? Math.round(PDF_TARGET_WIDTH * 1.414) // A4 ratio fallback
  const fieldsForPage = fields.filter(f => f.page === activePage)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        gap: 16,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        alignItems: 'flex-start',
      }}
    >
      {/* ─── COLONNE GAUCHE : PDF + Konva ─── */}
      <div
        className="neo-card-soft"
        style={{
          padding: 16,
          background: '#e8e3d6',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          minHeight: 600,
        }}
      >
        {/* Toolbar top : navigation docs + pages */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '8px 12px',
          }}
        >
          <Files size={14} style={{ color: 'var(--muted)' }} />
          {renamingDocIdx === activeDocIdx ? (
            <>
              <input
                type="text"
                autoFocus
                className="neo-input"
                style={{ height: 30, flex: 1, fontSize: 12.5 }}
                value={renameDraft}
                onChange={e => setRenameDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const trimmed = renameDraft.trim()
                    if (trimmed) {
                      setDocs(prev => prev.map((d, i) => i === activeDocIdx ? { ...d, name: trimmed } : d))
                      setDirty(true)
                    }
                    setRenamingDocIdx(null)
                  } else if (e.key === 'Escape') {
                    setRenamingDocIdx(null)
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = renameDraft.trim()
                  if (trimmed) {
                    setDocs(prev => prev.map((d, i) => i === activeDocIdx ? { ...d, name: trimmed } : d))
                    setDirty(true)
                  }
                  setRenamingDocIdx(null)
                }}
                title="Valider"
                style={{
                  width: 30, height: 30,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--success-soft)', color: 'var(--success)',
                  cursor: 'pointer',
                }}
              >
                <CheckIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setRenamingDocIdx(null)}
                title="Annuler"
                style={{
                  width: 30, height: 30,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--card)', color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                <XIcon size={14} />
              </button>
            </>
          ) : (
            <>
              <select
                value={activeDocIdx}
                onChange={e => setActiveDocIdx(Number(e.target.value))}
                className="neo-input"
                style={{ height: 30, flex: 1, fontSize: 12.5 }}
              >
                {docs.map((d, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setRenameDraft(docs[activeDocIdx]?.name || '')
                  setRenamingDocIdx(activeDocIdx)
                }}
                title="Renommer ce document"
                style={{
                  width: 30, height: 30,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--card)', color: 'var(--foreground)',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Pencil size={13} />
              </button>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NavBtn onClick={() => setActivePage(1)} disabled={activePage === 1}><ChevronsLeft size={14} /></NavBtn>
            <NavBtn onClick={() => setActivePage(p => Math.max(1, p - 1))} disabled={activePage === 1}><ChevronLeft size={14} /></NavBtn>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', minWidth: 60, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {activePage} / {numPages || '?'}
            </span>
            <NavBtn onClick={() => setActivePage(p => Math.min(numPages || p + 1, p + 1))} disabled={activePage >= numPages}><ChevronRight size={14} /></NavBtn>
            <NavBtn onClick={() => setActivePage(numPages || activePage)} disabled={activePage >= numPages}><ChevronsRight size={14} /></NavBtn>
          </div>
        </div>

        {/* PDF + overlay */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <PDFViewer
            fileUrl={fileUrl}
            page={activePage}
            width={PDF_TARGET_WIDTH}
            onLoadSuccess={n => setNumPages(n)}
            onPageRendered={info => setRenderInfo(info)}
          />
          {renderInfo && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: renderedW,
                height: renderedH,
                pointerEvents: 'auto',
              }}
            >
              <FieldsCanvas
                width={renderedW}
                height={renderedH}
                page={activePage}
                fields={fields}
                onChange={updateDocFields}
                selectedIds={selectedIds}
                onSelect={setSelectedIds}
                activeTool={activeTool}
                activeRecipientOrder={activeRecipientOrder}
                genId={genId}
              />
            </div>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>
          {activeTool
            ? <>Mode <strong style={{ color: 'var(--foreground)' }}>{FIELD_TYPE_LABELS[activeTool]}</strong> : cliquez sur le PDF pour placer un champ. Echap pour annuler.</>
            : <>Cliquez un outil à droite, puis sur le PDF pour placer un champ. Drag pour déplacer, poignée pour redimensionner.</>}
        </div>
      </div>

      {/* ─── COLONNE DROITE : tools + recipients + actions ─── */}
      {/* v2.2.0 Phase 3 — sticky + scroll indépendant pour garder le PDF visible */}
      <div
        className="scroll-thin"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          position: 'sticky',
          top: 16,
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {/* Bandeau actions */}
        <div className="neo-card-soft" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            className="neo-btn-yellow"
            onClick={handleSave}
            disabled={saving || !dirty}
            style={{ width: '100%', justifyContent: 'center', opacity: !dirty ? 0.55 : 1 }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Enregistrement...' : dirty ? 'Enregistrer' : 'Enregistré'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            {fieldsTotalCount(docs)} champ{fieldsTotalCount(docs) > 1 ? 's' : ''} · {docs.length} PDF{docs.length > 1 ? 's' : ''}
          </div>
        </div>

        {/* Tools — catégorisés style DocuSign */}
        <div className="neo-card-soft" style={{ padding: 14 }}>
          <SectionTitle>Champs à placer</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FIELD_TYPE_CATEGORIES.map(cat => (
              <div key={cat.key}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--muted)',
                    marginBottom: 4,
                    paddingLeft: 2,
                  }}
                >
                  {cat.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {cat.types.map(t => {
                    const Icon = TOOL_ICONS[t] || Type
                    const active = activeTool === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActiveTool(active ? null : t)}
                        onKeyDown={e => { if (e.key === 'Escape') setActiveTool(null) }}
                        className="neo-btn-ghost neo-btn-sm"
                        style={{
                          justifyContent: 'flex-start',
                          fontSize: 11.5,
                          padding: '5px 8px',
                          background: active ? 'var(--primary-soft)' : undefined,
                          borderColor: active ? 'var(--primary)' : undefined,
                          color: active ? 'var(--primary)' : 'var(--foreground)',
                          fontWeight: active ? 700 : 500,
                        }}
                      >
                        <Icon size={12} />
                        {FIELD_TYPE_LABELS[t]}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {activeTool && (
            <button
              type="button"
              onClick={() => setActiveTool(null)}
              className="neo-btn-ghost neo-btn-sm"
              style={{ marginTop: 10, fontSize: 11, width: '100%', justifyContent: 'center' }}
            >
              Désactiver l&apos;outil
            </button>
          )}
        </div>

        {/* v2.2.1 — Recalibrer position bulk : décale TOUS les fields du doc actif
            d'un offset uniforme. Fix le décalage de l'IA en quelques clics. */}
        <RecalibratePanel
          fieldCount={(activeDoc?.fields || []).length}
          onShift={shiftAllFields}
        />

        {/* Recipients — v2.2.2 : édition inline (renommer / type / supprimer / ajouter) */}
        <div className="neo-card-soft" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <SectionTitle>Rôles ({recipients.length})</SectionTitle>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => {
                const nextOrder = Math.max(0, ...recipients.map(r => r.order)) + 1
                setRecipients(prev => [...prev, {
                  role: 'signer',
                  order: nextOrder,
                  roleName: `Rôle ${nextOrder}`,
                }])
                setActiveRecipientOrder(nextOrder)
                setDirty(true)
              }}
              className="neo-btn-ghost neo-btn-sm"
              title="Ajouter un nouveau rôle"
            >
              <Plus size={12} />
              Rôle
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recipients.map((r, idx) => {
              // ⚠️ Clamp r.order ≥ 1 — si r.order=0, (0-1)%5 = -1 en JS (modulo négatif autorisé)
              // → RECIPIENT_COLORS[-1] = undefined → crash sur c.stroke
              const safeOrder = Math.max(1, r.order || 1)
              const c = RECIPIENT_COLORS[(safeOrder - 1) % RECIPIENT_COLORS.length] || RECIPIENT_COLORS[0]
              const active = activeRecipientOrder === r.order
              const fieldCount = countFieldsForRecipient(docs, r.order)
              return (
                <div
                  key={`${idx}-${r.order}`}
                  onClick={() => setActiveRecipientOrder(r.order)}
                  style={{
                    padding: '10px 10px',
                    borderRadius: 8,
                    border: `1.5px solid ${active ? c.stroke : 'var(--border)'}`,
                    background: active ? c.soft : 'var(--card)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {/* Ligne principale : badge + roleName editable + count + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: c.stroke, color: 'white',
                        fontSize: 11, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {r.order}
                    </span>
                    <input
                      type="text"
                      value={r.roleName || ''}
                      placeholder={`Rôle ${r.order} (ex: Candidat, Client…)`}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateRecipient(idx, { roleName: e.target.value })}
                      style={{
                        flex: 1, minWidth: 0,
                        padding: '4px 8px',
                        fontSize: 12.5, fontWeight: 600,
                        color: 'var(--foreground)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <span
                      title={`${fieldCount} champ(s) assigné(s) à ce rôle`}
                      style={{
                        fontSize: 10, fontWeight: 700, color: c.stroke,
                        padding: '2px 8px',
                        background: c.fill,
                        borderRadius: 999,
                        flexShrink: 0,
                      }}
                    >
                      {fieldCount} ch.
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        if (recipients.length === 1) {
                          toast.error('Au moins un rôle doit exister')
                          return
                        }
                        if (fieldCount > 0 && !confirm(`Le rôle "${r.roleName || `Rôle ${r.order}`}" a ${fieldCount} champ(s). Les supprimer aussi ?`)) return
                        // Retire le rôle ET les fields qui lui sont assignés
                        setRecipients(prev => prev.filter((_, i) => i !== idx))
                        if (fieldCount > 0) {
                          setDocs(prev => prev.map(d => ({
                            ...d,
                            fields: (d.fields || []).filter(f => f.recipientOrder !== r.order),
                          })))
                        }
                        if (active) {
                          const remaining = recipients.filter((_, i) => i !== idx)
                          setActiveRecipientOrder(remaining[0]?.order ?? 1)
                        }
                        setDirty(true)
                      }}
                      title="Supprimer ce rôle"
                      style={{
                        width: 24, height: 24,
                        border: 'none', background: 'transparent',
                        color: '#DC2626', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {/* Ligne secondaire : type signer/cc */}
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <select
                      value={r.role === 'cc' ? 'cc' : 'signer'}
                      onChange={e => updateRecipient(idx, { role: e.target.value as 'signer' | 'cc' })}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: 11,
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        color: 'var(--foreground)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <option value="signer">✍️ Doit signer</option>
                      <option value="cc">👁 Reçoit une copie (CC)</option>
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            💡 Le rôle ACTIF (cliqué) est appliqué aux nouveaux champs que tu places sur le PDF.
            Pour ré-affecter un champ existant, sélectionne-le sur le PDF puis change son rôle dans le panneau d&apos;édition.
          </div>
        </div>

        {/* Field(s) selected — édition rapide */}
        {selectedIds.length > 0 && (
          <SelectedFieldsPanel
            selectedIds={selectedIds}
            fields={fields}
            recipients={recipients}
            onPatch={patchField}
            onPatchMany={patchFields}
            onDelete={handleDeleteSelected}
            onGroupCheckboxes={handleGroupCheckboxes}
            onUngroup={handleUngroup}
            onPatchAllInGroup={patchAllInGroup}
          />
        )}

        {/* Page courante : résumé champs */}
        <div className="neo-card-soft" style={{ padding: 14 }}>
          <SectionTitle>Page {activePage}</SectionTitle>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {fieldsForPage.length === 0
              ? 'Aucun champ sur cette page.'
              : `${fieldsForPage.length} champ${fieldsForPage.length > 1 ? 's' : ''}.`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Panel "Champ(s) sélectionné(s)" — gère 1 ou plusieurs sélections
// ─────────────────────────────────────────────────────────────────
function SelectedFieldsPanel({
  selectedIds, fields, recipients, onPatch, onPatchMany, onDelete,
  onGroupCheckboxes, onUngroup, onPatchAllInGroup,
}: {
  selectedIds: string[]
  fields: SignField[]
  recipients: SignRecipientSchema[]
  onPatch: (id: string, patch: Partial<SignField>) => void
  onPatchMany: (ids: string[], patch: Partial<SignField>) => void
  onDelete: () => void
  onGroupCheckboxes: (rule: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly', count: number, label?: string) => void
  onUngroup: (id: string) => void
  onPatchAllInGroup: (groupId: string, patch: Partial<SignField>) => void
}) {
  const set = new Set(selectedIds)
  const selectedFields = fields.filter(f => set.has(f.id))
  const isMulti = selectedFields.length > 1
  const allCheckboxes = selectedFields.length >= 2 && selectedFields.every(f => f.type === 'checkbox')

  // Si 1 seul champ → édition complète
  if (!isMulti) {
    const f = selectedFields[0]
    if (!f) return null
    const isText = f.type === 'text'
    const isInGroup = !!f.groupId
    return (
      <div className="neo-card-soft" style={{ padding: 14 }}>
        <SectionTitle>Champ sélectionné</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Field label="Libellé">
            <input
              type="text"
              className="neo-input"
              value={f.label}
              onChange={e => onPatch(f.id, { label: e.target.value })}
            />
          </Field>
          <Field label="Type">
            <select
              className="neo-input"
              value={f.type}
              onChange={e => onPatch(f.id, { type: e.target.value as SignFieldType })}
            >
              {(Object.keys(FIELD_TYPE_LABELS) as SignFieldType[]).map(t => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          {/* v2.2.2 — Pills colorées au lieu de select texte (feedback visuel direct).
              Le champ change INSTANTANÉMENT de couleur sur le PDF Konva en cliquant. */}
          <Field label="Destinataire">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {recipients.map(r => {
                const safeOrder = Math.max(1, r.order || 1)
                const c = RECIPIENT_COLORS[(safeOrder - 1) % RECIPIENT_COLORS.length] || RECIPIENT_COLORS[0]
                const isActive = f.recipientOrder === r.order
                return (
                  <button
                    key={r.order}
                    type="button"
                    onClick={() => onPatch(f.id, { recipientOrder: r.order })}
                    style={{
                      padding: '5px 10px 5px 7px',
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      border: '1.5px solid',
                      borderColor: isActive ? c.stroke : 'var(--border)',
                      background: isActive ? c.fill : 'var(--card)',
                      color: 'var(--foreground)',
                      borderRadius: 999,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.12s',
                    }}
                    title={`Affecter ce champ au rôle ${r.order}`}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: 999,
                      background: c.stroke, flexShrink: 0,
                      boxShadow: isActive ? `0 0 0 2px ${c.fill}` : 'none',
                    }} />
                    {r.order}. {r.roleName || r.name || `Rôle ${r.order}`}
                  </button>
                )
              })}
            </div>
          </Field>

          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={!!f.required}
              onChange={e => onPatch(f.id, { required: e.target.checked })}
            />
            Champ obligatoire
          </label>

          {isText && (
            <>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={!!f.readOnly}
                  onChange={e => onPatch(f.id, { readOnly: e.target.checked })}
                />
                Lecture seule (le destinataire ne peut pas modifier)
              </label>
              <Field label="Texte par défaut (optionnel)">
                <input
                  type="text"
                  className="neo-input"
                  placeholder="Préremplit le champ avec ce texte"
                  value={f.defaultValue || ''}
                  onChange={e => onPatch(f.id, { defaultValue: e.target.value || undefined })}
                />
              </Field>
              <Field label="Limite caractères (optionnel)">
                <input
                  type="number"
                  className="neo-input"
                  min={0}
                  placeholder="Ex : 50"
                  value={f.maxLength ?? ''}
                  onChange={e => {
                    const n = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value))
                    onPatch(f.id, { maxLength: n })
                  }}
                />
              </Field>
            </>
          )}

          {/* Checkbox : Cochée par défaut */}
          {f.type === 'checkbox' && (
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={f.metadata?.selected === true}
                onChange={e => onPatch(f.id, {
                  metadata: { ...(f.metadata || {}), selected: e.target.checked },
                })}
              />
              Cochée par défaut (pré-remplie)
            </label>
          )}

          {/* Annotation : juste un texte d'aide */}
          {f.type === 'annotation' && (
            <Field label="Texte d'aide (visible au signataire)">
              <textarea
                className="neo-input"
                style={{ height: 'auto', padding: '10px 13px', minHeight: 60, resize: 'vertical' }}
                rows={2}
                placeholder="Ex : À remplir si enfants à charge"
                value={f.label}
                onChange={e => onPatch(f.id, { label: e.target.value })}
              />
            </Field>
          )}

          {/* Liste déroulante : éditeur d'options */}
          {f.type === 'select' && (
            <SelectOptionsEditor
              field={f}
              onPatch={patch => onPatch(f.id, patch)}
            />
          )}

          {/* Groupe (checkbox) */}
          {f.type === 'checkbox' && isInGroup && (
            <div
              style={{
                marginTop: 4,
                padding: 10,
                border: '1px dashed var(--border)',
                borderRadius: 8,
                background: 'var(--secondary)',
                fontSize: 12,
                color: 'var(--muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Groupe : {f.groupName || 'G'}
              </div>
              <Field label="Étiquette du groupe">
                <input
                  type="text"
                  className="neo-input"
                  placeholder="Ex : Permis de conduire"
                  value={f.groupName || ''}
                  onChange={e => {
                    // Propager le changement à toutes les cases du même groupe
                    if (!f.groupId) return
                    onPatchAllInGroup(f.groupId, { groupName: e.target.value || undefined })
                  }}
                />
              </Field>
              <Field label="Règle">
                <select
                  className="neo-input"
                  value={f.groupRule || 'SelectAtLeast'}
                  onChange={e => {
                    if (!f.groupId) return
                    onPatchAllInGroup(f.groupId, { groupRule: e.target.value as 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly' })
                  }}
                >
                  <option value="SelectAtLeast">Au moins X</option>
                  <option value="SelectAtMost">Au plus X</option>
                  <option value="SelectExactly">Exactement X</option>
                </select>
              </Field>
              <Field label="Nombre X">
                <input
                  type="number"
                  className="neo-input"
                  min={1}
                  value={f.groupRule === 'SelectAtMost' ? (f.groupMax ?? 1) : (f.groupMin ?? 1)}
                  onChange={e => {
                    if (!f.groupId) return
                    const n = Math.max(1, Number(e.target.value) || 1)
                    if (f.groupRule === 'SelectAtMost') {
                      onPatchAllInGroup(f.groupId, { groupMax: n, groupMin: undefined })
                    } else if (f.groupRule === 'SelectExactly') {
                      onPatchAllInGroup(f.groupId, { groupMin: n, groupMax: n })
                    } else {
                      onPatchAllInGroup(f.groupId, { groupMin: n, groupMax: undefined })
                    }
                  }}
                />
              </Field>
              <button
                type="button"
                onClick={() => onUngroup(f.id)}
                className="neo-btn-ghost neo-btn-sm"
                style={{ alignSelf: 'flex-start', color: 'var(--destructive)' }}
              >
                Retirer du groupe
              </button>
            </div>
          )}

          {/* Sous-options par type (Phase 2.5) */}
          <TypeSpecificOptions
            field={f}
            allFields={fields}
            onPatch={patch => onPatch(f.id, patch)}
          />

          {/* Logique conditionnelle */}
          <ConditionalLogicEditor
            field={f}
            allFields={fields.filter(o => o.id !== f.id && !o.metadata?.hidden)}
            onPatch={patch => onPatch(f.id, patch)}
          />

          {f.source === 'docusign' && (
            <span className="neo-tag" style={{ fontSize: 10, alignSelf: 'flex-start' }}>
              Importé DocuSign
            </span>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="neo-btn-ghost neo-btn-sm"
            style={{ color: 'var(--destructive)', justifyContent: 'center' }}
          >
            Supprimer ce champ
          </button>
        </div>
      </div>
    )
  }

  // Multi-sélection → actions communes
  return (
    <div className="neo-card-soft" style={{ padding: 14 }}>
      <SectionTitle>{selectedFields.length} champs sélectionnés</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* v2.2.2 — Pills colorées (visuel direct) — change la couleur des N champs sélectionnés instantanément */}
        <Field label="Réassigner au destinataire">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recipients.map(r => {
              const safeOrder = Math.max(1, r.order || 1)
              const c = RECIPIENT_COLORS[(safeOrder - 1) % RECIPIENT_COLORS.length] || RECIPIENT_COLORS[0]
              return (
                <button
                  key={r.order}
                  type="button"
                  onClick={() => onPatchMany(selectedIds, { recipientOrder: r.order })}
                  style={{
                    padding: '5px 10px 5px 7px',
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1.5px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--foreground)',
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title={`Affecter les ${selectedFields.length} champs sélectionnés au rôle ${r.order}`}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = c.stroke
                    e.currentTarget.style.background = c.fill
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.background = 'var(--card)'
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: 999,
                    background: c.stroke, flexShrink: 0,
                  }} />
                  {r.order}. {r.roleName || r.name || `Rôle ${r.order}`}
                </button>
              )
            })}
          </div>
        </Field>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => onPatchMany(selectedIds, { required: true })}
            className="neo-btn-ghost neo-btn-sm"
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Obligatoire
          </button>
          <button
            type="button"
            onClick={() => onPatchMany(selectedIds, { required: false })}
            className="neo-btn-ghost neo-btn-sm"
            style={{ flex: 1, justifyContent: 'center' }}
          >
            Facultatif
          </button>
        </div>

        {/* Grouper les checkboxes */}
        {allCheckboxes && (
          <CheckboxGroupForm
            count={selectedFields.length}
            onCreate={onGroupCheckboxes}
          />
        )}

        <button
          type="button"
          onClick={onDelete}
          className="neo-btn-ghost neo-btn-sm"
          style={{ color: 'var(--destructive)', justifyContent: 'center' }}
        >
          Supprimer ces {selectedFields.length} champs
        </button>

        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', paddingTop: 4 }}>
          Astuce : Shift+clic pour ajouter/retirer de la sélection
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Éditeur d'options pour Liste déroulante (type='select')
// Source : field.metadata.listItems → [{ text, value, selected? }]
// ─────────────────────────────────────────────────────────────────
interface ListItem { text: string; value: string; selected?: boolean }

function SelectOptionsEditor({
  field, onPatch,
}: { field: SignField; onPatch: (patch: Partial<SignField>) => void }) {
  const items: ListItem[] = Array.isArray(field.metadata?.listItems)
    ? (field.metadata!.listItems as ListItem[])
    : []

  const updateItems = (newItems: ListItem[]) => {
    onPatch({
      metadata: {
        ...(field.metadata || {}),
        listItems: newItems,
      },
    })
  }

  const updateItem = (idx: number, patch: Partial<ListItem>) => {
    updateItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  const removeItem = (idx: number) => {
    updateItems(items.filter((_, i) => i !== idx))
  }

  const addItem = () => {
    const n = items.length + 1
    updateItems([...items, { text: `Option ${n}`, value: `option_${n}`, selected: false }])
  }

  const setDefault = (idx: number | -1) => {
    updateItems(items.map((it, i) => ({ ...it, selected: i === idx })))
  }

  const defaultIdx = items.findIndex(i => i.selected)

  return (
    <div
      style={{
        marginTop: 4,
        padding: 10,
        border: '1px dashed var(--border)',
        borderRadius: 8,
        background: 'var(--secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Options de la liste
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', padding: 8 }}>
          Aucune option. Ajoutez-en au moins une.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((it, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="radio"
                name="default-option"
                checked={defaultIdx === idx}
                onChange={() => setDefault(idx)}
                title="Option par défaut"
                style={{ flexShrink: 0 }}
              />
              <input
                type="text"
                className="neo-input"
                style={{ height: 30, fontSize: 12.5, padding: '0 8px' }}
                placeholder={`Option ${idx + 1}`}
                value={it.text}
                onChange={e => updateItem(idx, { text: e.target.value, value: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeItem(idx)}
                title="Supprimer"
                style={{
                  width: 26, height: 26, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--card)', color: 'var(--destructive)', cursor: 'pointer',
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          onClick={addItem}
          className="neo-btn-ghost neo-btn-sm"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Plus size={12} />
          Ajouter une option
        </button>
        {defaultIdx >= 0 && (
          <button
            type="button"
            onClick={() => setDefault(-1)}
            className="neo-btn-ghost neo-btn-sm"
            title="Aucune option par défaut"
            style={{ flexShrink: 0 }}
          >
            Aucune par défaut
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Éditeur de logique conditionnelle
// Permet d'ajouter/éditer/supprimer des conditions sur un champ.
// L'évaluation runtime sera Phase 4 (signing time).
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// Sous-options spécifiques par type (Phase 2.5)
// Affiche un bloc d'options selon field.type :
// - number : min, max, décimales, devise
// - formula : expression + helper insertion champ
// - attachment : taille max, types MIME, multiple
// - email : validation format
// - date : format d'affichage
// - auto-fill (firstname/lastname/fullname/email/company/title) : toggle
// ─────────────────────────────────────────────────────────────────
function TypeSpecificOptions({
  field, allFields, onPatch,
}: {
  field: SignField
  allFields: SignField[]
  onPatch: (patch: Partial<SignField>) => void
}) {
  const t = field.type
  const isAutoFillable = AUTO_FILL_FIELD_TYPES.includes(t)
  // Types avec formatage texte (police/taille/B/I/U/couleur)
  const supportsFormatting = (
    t === 'text' || t === 'number' || t === 'date' || t === 'email' ||
    t === 'firstname' || t === 'lastname' || t === 'fullname' ||
    t === 'company' || t === 'title' || t === 'formula'
  )
  // Types avec validation regex
  const supportsValidation = (t === 'text' || t === 'number' || t === 'email' || t === 'formula')
  // Tous les types sauf annotation ont un panel "options"
  const showSection = t !== 'annotation'
  if (!showSection) return null

  return (
    <div
      style={{
        marginTop: 4,
        padding: 10,
        border: '1px dashed var(--border)',
        borderRadius: 8,
        background: 'var(--secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Options {FIELD_TYPE_LABELS[t]}
      </div>

      {/* Auto-fill — pour identités */}
      {isAutoFillable && (
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={!!field.autoFill}
            onChange={e => onPatch({ autoFill: e.target.checked })}
          />
          Pré-remplir automatiquement depuis le profil destinataire
        </label>
      )}

      {/* NUMÉRO */}
      {t === 'number' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Min">
              <input
                type="number"
                className="neo-input"
                placeholder="—"
                value={field.numberMin ?? ''}
                onChange={e => onPatch({ numberMin: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
            <Field label="Max">
              <input
                type="number"
                className="neo-input"
                placeholder="—"
                value={field.numberMax ?? ''}
                onChange={e => onPatch({ numberMax: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Décimales">
              <input
                type="number"
                min={0}
                max={6}
                className="neo-input"
                placeholder="0"
                value={field.numberDecimals ?? ''}
                onChange={e => onPatch({ numberDecimals: e.target.value === '' ? undefined : Math.max(0, Math.min(6, Number(e.target.value))) })}
              />
            </Field>
            <Field label="Devise">
              <select
                className="neo-input"
                value={field.currency || ''}
                onChange={e => onPatch({ currency: e.target.value || undefined })}
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>{c || '— Aucune —'}</option>
                ))}
              </select>
            </Field>
          </div>
        </>
      )}

      {/* FORMULE */}
      {t === 'formula' && (
        <>
          <Field label="Expression">
            <textarea
              className="neo-input"
              style={{ height: 'auto', padding: '8px 10px', minHeight: 50, resize: 'vertical', fontFamily: 'var(--font-mono), ui-monospace, monospace' }}
              placeholder="Ex: [Salaire1] + [Salaire2] ou [Quantité] * [Prix]"
              value={field.formulaExpression || ''}
              onChange={e => onPatch({ formulaExpression: e.target.value || undefined })}
            />
          </Field>
          <FormulaFieldHelper
            allFields={allFields.filter(f => f.id !== field.id && (f.type === 'number' || f.type === 'text'))}
            onInsert={token => {
              const cur = field.formulaExpression || ''
              onPatch({ formulaExpression: cur + (cur && !cur.endsWith(' ') ? ' ' : '') + token })
            }}
          />
          <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            Référence un champ avec <code style={{ background: 'var(--card)', padding: '0 4px', borderRadius: 3 }}>[NomDuChamp]</code>. Opérateurs : <code>+ - * /</code>. Évaluation au signing.
          </div>
        </>
      )}

      {/* PIÈCE JOINTE */}
      {t === 'attachment' && (
        <>
          <Field label="Taille max (Mo)">
            <input
              type="number"
              min={1}
              max={50}
              className="neo-input"
              placeholder="10"
              value={field.attachmentMaxSizeMb ?? ''}
              onChange={e => onPatch({ attachmentMaxSizeMb: e.target.value === '' ? undefined : Math.max(1, Math.min(50, Number(e.target.value))) })}
            />
          </Field>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 6 }}>
              Types autorisés
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {COMMON_MIME_TYPES.map(mime => {
                const checked = (field.attachmentMimeTypes || []).includes(mime.value)
                return (
                  <label
                    key={mime.value}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      fontSize: 11,
                      border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 999,
                      background: checked ? 'var(--primary-soft)' : 'var(--card)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        const cur = field.attachmentMimeTypes || []
                        const next = e.target.checked
                          ? [...cur, mime.value]
                          : cur.filter(m => m !== mime.value)
                        onPatch({ attachmentMimeTypes: next.length > 0 ? next : undefined })
                      }}
                      style={{ display: 'none' }}
                    />
                    {mime.label}
                  </label>
                )
              })}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
              {(field.attachmentMimeTypes?.length || 0) === 0
                ? 'Tous les types acceptés.'
                : `${field.attachmentMimeTypes!.length} type${field.attachmentMimeTypes!.length > 1 ? 's' : ''} sélectionné${field.attachmentMimeTypes!.length > 1 ? 's' : ''}.`}
            </div>
          </div>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={!!field.attachmentMultiple}
              onChange={e => onPatch({ attachmentMultiple: e.target.checked || undefined })}
            />
            Plusieurs fichiers autorisés
          </label>
        </>
      )}

      {/* EMAIL */}
      {t === 'email' && (
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={!!field.validateEmailFormat}
            onChange={e => onPatch({ validateEmailFormat: e.target.checked || undefined })}
          />
          Valider le format email (regex)
        </label>
      )}

      {/* DATE */}
      {t === 'date' && (
        <Field label="Format d'affichage">
          <select
            className="neo-input"
            value={field.dateFormat || 'dd.MM.yyyy'}
            onChange={e => onPatch({ dateFormat: e.target.value })}
          >
            {DATE_FORMATS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </Field>
      )}

      {/* FORMATAGE — police, taille, style, couleur */}
      {supportsFormatting && (
        <details style={{ marginTop: 4 }}>
          <summary style={summaryStyle}>Formatage</summary>
          <div style={detailsBodyStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6 }}>
              <Field label="Police">
                <select
                  className="neo-input"
                  value={field.font || 'Arial'}
                  onChange={e => onPatch({ font: e.target.value || undefined })}
                >
                  {FONT_FAMILIES.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Taille">
                <select
                  className="neo-input"
                  value={field.fontSize || 10}
                  onChange={e => onPatch({ fontSize: Number(e.target.value) || undefined })}
                >
                  {FONT_SIZES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <StyleToggle
                label="B" bold
                active={!!field.bold}
                onClick={() => onPatch({ bold: !field.bold || undefined })}
              />
              <StyleToggle
                label="I" italic
                active={!!field.italic}
                onClick={() => onPatch({ italic: !field.italic || undefined })}
              />
              <StyleToggle
                label="U" underline
                active={!!field.underline}
                onClick={() => onPatch({ underline: !field.underline || undefined })}
              />
            </div>
            <Field label="Couleur">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {FONT_COLORS.map(c => {
                  const isActive = (field.fontColor || 'Black') === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => onPatch({ fontColor: c.value === 'Black' ? undefined : c.value })}
                      title={c.label}
                      style={{
                        width: 22, height: 22,
                        borderRadius: 4,
                        background: c.hex,
                        border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                        cursor: 'pointer',
                        boxShadow: isActive ? '0 0 0 2px var(--primary-soft)' : undefined,
                      }}
                    />
                  )
                })}
              </div>
            </Field>
          </div>
        </details>
      )}

      {/* VALIDATION — regex */}
      {supportsValidation && (
        <details style={{ marginTop: 4 }}>
          <summary style={summaryStyle}>Validation (regex)</summary>
          <div style={detailsBodyStyle}>
            <Field label="Pattern regex">
              <input
                type="text"
                className="neo-input"
                placeholder={
                  t === 'email' ? '(par défaut format email)' :
                  t === 'number' ? '^[0-9]{4}$' :
                  '^[A-Z0-9-]+$'
                }
                value={field.validationPattern || ''}
                onChange={e => onPatch({ validationPattern: e.target.value || undefined })}
                style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace', fontSize: 12 }}
              />
            </Field>
            <Field label="Message d'erreur (optionnel)">
              <input
                type="text"
                className="neo-input"
                placeholder="Ex : Format invalide"
                value={field.validationMessage || ''}
                onChange={e => onPatch({ validationMessage: e.target.value || undefined })}
              />
            </Field>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Évalué au signing (Phase 4). Utiliser une regex JS standard.
            </div>
          </div>
        </details>
      )}

      {/* AVANCÉ — tooltip */}
      <details style={{ marginTop: 4 }}>
        <summary style={summaryStyle}>Avancé</summary>
        <div style={detailsBodyStyle}>
          <Field label="Tooltip (aide au survol)">
            <input
              type="text"
              className="neo-input"
              placeholder="Ex : Indiquez votre date de naissance"
              value={field.tooltip || ''}
              onChange={e => onPatch({ tooltip: e.target.value || undefined })}
            />
          </Field>
          <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            Affiché au signataire au survol du champ (Phase 4).
          </div>
        </div>
      </details>
    </div>
  )
}

const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '6px 8px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--foreground)',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  userSelect: 'none',
}

const detailsBodyStyle: React.CSSProperties = {
  marginTop: 6,
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
}

function StyleToggle({
  label, active, onClick, bold, italic, underline,
}: { label: string; active: boolean; onClick: () => void; bold?: boolean; italic?: boolean; underline?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 32, height: 28,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        background: active ? 'var(--primary-soft)' : 'var(--card)',
        color: active ? 'var(--primary)' : 'var(--foreground)',
        borderRadius: 6,
        fontWeight: bold ? 800 : 600,
        fontStyle: italic ? 'italic' : 'normal',
        textDecoration: underline ? 'underline' : 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
      }}
    >
      {label}
    </button>
  )
}

// Helper d'insertion de référence de champ dans une formule
function FormulaFieldHelper({
  allFields, onInsert,
}: { allFields: SignField[]; onInsert: (token: string) => void }) {
  if (allFields.length === 0) {
    return (
      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' }}>
        Aucun champ Numéro/Texte à référencer.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>
        Insérer une référence
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {allFields.slice(0, 12).map(f => {
          const name = (f.label || FIELD_TYPE_LABELS[f.type]).slice(0, 22)
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onInsert(`[${name.replace(/[\[\]]/g, '')}]`)}
              className="neo-btn-ghost neo-btn-sm"
              style={{ fontSize: 10.5, padding: '3px 8px', height: 24 }}
              title={`Insérer [${name}]`}
            >
              [{name}]
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ConditionalLogicEditor({
  field, allFields, onPatch,
}: {
  field: SignField
  allFields: SignField[]
  onPatch: (patch: Partial<SignField>) => void
}) {
  const conditions = field.conditions || []

  const addCondition = () => {
    if (allFields.length === 0) return
    const newCond: SignFieldCondition = {
      triggerFieldId: allFields[0].id,
      operator: 'equals',
      value: '',
      action: 'unrequire',
    }
    onPatch({ conditions: [...conditions, newCond] })
  }

  const updateCondition = (idx: number, patch: Partial<SignFieldCondition>) => {
    onPatch({ conditions: conditions.map((c, i) => i === idx ? { ...c, ...patch } : c) })
  }

  const removeCondition = (idx: number) => {
    onPatch({ conditions: conditions.filter((_, i) => i !== idx) })
  }

  if (allFields.length === 0) {
    return (
      <div
        style={{
          marginTop: 4,
          padding: 10,
          border: '1px dashed var(--border)',
          borderRadius: 8,
          background: 'var(--secondary)',
          fontSize: 11.5,
          color: 'var(--muted)',
        }}
      >
        Aucun autre champ à utiliser comme déclencheur.
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 4,
        padding: 10,
        border: '1px dashed var(--border)',
        borderRadius: 8,
        background: 'var(--secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--foreground)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <span>Logique conditionnelle</span>
        {conditions.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
            {conditions.length} règle{conditions.length > 1 ? 's' : ''} (toutes vraies)
          </span>
        )}
      </div>

      {conditions.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '4px 0', lineHeight: 1.5 }}>
          Pas de condition. Ce champ est toujours actif.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conditions.map((c, idx) => {
            const trigger = allFields.find(f => f.id === c.triggerFieldId)
            const triggerLabel: string = trigger?.label || (typeof trigger?.metadata?.tabType === 'string' ? trigger.metadata.tabType : '') || 'Champ supprimé'
            const triggerType = trigger?.type
            const needsValue = c.operator !== 'isEmpty' && c.operator !== 'isNotEmpty'
            // Si le trigger est un select, on propose ses listItems comme valeurs
            const triggerListItems: ListItem[] = (triggerType === 'select' && Array.isArray(trigger?.metadata?.listItems))
              ? (trigger!.metadata!.listItems as ListItem[])
              : []
            return (
              <div
                key={idx}
                style={{
                  padding: 8,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Si
                </div>
                <select
                  className="neo-input"
                  style={{ height: 30, fontSize: 12, padding: '0 8px' }}
                  value={c.triggerFieldId}
                  onChange={e => updateCondition(idx, { triggerFieldId: e.target.value })}
                >
                  {allFields.map(f => (
                    <option key={f.id} value={f.id}>
                      {(f.label || `${FIELD_TYPE_LABELS[f.type]}`).slice(0, 60)}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select
                    className="neo-input"
                    style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}
                    value={c.operator}
                    onChange={e => updateCondition(idx, { operator: e.target.value as SignConditionOperator })}
                  >
                    {(Object.keys(CONDITION_OPERATOR_LABELS) as SignConditionOperator[]).map(op => (
                      <option key={op} value={op}>{CONDITION_OPERATOR_LABELS[op]}</option>
                    ))}
                  </select>
                  {needsValue && (
                    triggerListItems.length > 0 ? (
                      <select
                        className="neo-input"
                        style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}
                        value={c.value || ''}
                        onChange={e => updateCondition(idx, { value: e.target.value })}
                      >
                        <option value="">— valeur —</option>
                        {triggerListItems.map((it, i) => (
                          <option key={i} value={it.value}>{it.text}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="neo-input"
                        style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}
                        placeholder={triggerType === 'checkbox' ? 'true / false' : 'valeur'}
                        value={c.value || ''}
                        onChange={e => updateCondition(idx, { value: e.target.value })}
                      />
                    )
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                  Alors
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <select
                    className="neo-input"
                    style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}
                    value={c.action}
                    onChange={e => updateCondition(idx, { action: e.target.value as SignConditionAction })}
                  >
                    {(Object.keys(CONDITION_ACTION_LABELS) as SignConditionAction[]).map(a => (
                      <option key={a} value={a}>{CONDITION_ACTION_LABELS[a]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCondition(idx)}
                    title="Supprimer cette règle"
                    style={{
                      width: 28, height: 30, flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid var(--border)', borderRadius: 6,
                      background: 'var(--card)', color: 'var(--destructive)', cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4, marginTop: 2 }}>
                  {summarizeCondition(c, triggerLabel)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addCondition}
        className="neo-btn-ghost neo-btn-sm"
        style={{ alignSelf: 'flex-start' }}
      >
        <Plus size={11} />
        Ajouter une règle
      </button>
    </div>
  )
}

function summarizeCondition(c: SignFieldCondition, triggerLabel: string): string {
  const op = CONDITION_OPERATOR_LABELS[c.operator]
  const action = CONDITION_ACTION_LABELS[c.action]
  const triggerShort = triggerLabel.slice(0, 30) + (triggerLabel.length > 30 ? '…' : '')
  if (c.operator === 'isEmpty' || c.operator === 'isNotEmpty') {
    return `Si "${triggerShort}" ${op} → ${action}`
  }
  return `Si "${triggerShort}" ${op} "${c.value || ''}" → ${action}`
}

function CheckboxGroupForm({
  count, onCreate,
}: { count: number; onCreate: (rule: 'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly', n: number, label?: string) => void }) {
  const [rule, setRule] = useState<'SelectAtLeast' | 'SelectAtMost' | 'SelectExactly'>('SelectAtLeast')
  const [n, setN] = useState(1)
  const [label, setLabel] = useState('')
  return (
    <div
      style={{
        marginTop: 2,
        padding: 10,
        border: '1px dashed var(--primary)',
        borderRadius: 8,
        background: 'var(--primary-soft)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Grouper {count} cases à cocher
      </div>
      <Field label="Étiquette du groupe (optionnel)">
        <input
          type="text"
          className="neo-input"
          placeholder="Ex : Permis de conduire"
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
      </Field>
      <Field label="Règle">
        <select className="neo-input" value={rule} onChange={e => setRule(e.target.value as typeof rule)}>
          <option value="SelectAtLeast">Au moins X case(s)</option>
          <option value="SelectAtMost">Au plus X case(s)</option>
          <option value="SelectExactly">Exactement X case(s)</option>
        </select>
      </Field>
      <Field label="Nombre X">
        <input
          type="number"
          className="neo-input"
          min={1}
          max={count}
          value={n}
          onChange={e => setN(Math.max(1, Math.min(count, Number(e.target.value) || 1)))}
        />
      </Field>
      <button
        type="button"
        onClick={() => onCreate(rule, n, label.trim() || undefined)}
        className="neo-btn-yellow"
        style={{ height: 36, fontSize: 12.5, justifyContent: 'center' }}
      >
        Créer le groupe
      </button>
    </div>
  )
}

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--foreground)',
  cursor: 'pointer',
}

// ─── RecalibratePanel — décale tous les fields du doc d'un offset uniforme ──────
// v2.2.1 — Pour corriger un décalage de coords généré par l'IA en quelques clics.
function RecalibratePanel({
  fieldCount, onShift,
}: {
  fieldCount: number
  onShift: (deltaX: number, deltaY: number) => void
}) {
  // Step en pourcentage de page : 0.005 = ~5pt sur A4 (≈ 1mm)
  const STEP_FINE = 0.005
  const STEP_MEDIUM = 0.015

  if (fieldCount === 0) return null

  return (
    <div className="neo-card-soft" style={{ padding: 14 }}>
      <SectionTitle>Recalibrer position</SectionTitle>
      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, marginBottom: 10 }}>
        Décale <strong>tous les {fieldCount} champs</strong> du document si l&apos;IA les a placés
        légèrement décalés.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: 180, margin: '0 auto' }}>
        {/* Row haut */}
        <div />
        <ShiftBtn label="↑" onClick={() => onShift(0, -STEP_FINE)} title="1 ligne vers le haut (fin)" />
        <div />
        {/* Row milieu */}
        <ShiftBtn label="←" onClick={() => onShift(-STEP_FINE, 0)} title="Vers la gauche (fin)" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--muted)' }}>
          fin
        </div>
        <ShiftBtn label="→" onClick={() => onShift(STEP_FINE, 0)} title="Vers la droite (fin)" />
        {/* Row bas */}
        <div />
        <ShiftBtn label="↓" onClick={() => onShift(0, STEP_FINE)} title="1 ligne vers le bas (fin)" />
        <div />
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'center' }}>
        <ShiftBtn label="↑↑" onClick={() => onShift(0, -STEP_MEDIUM)} title="Beaucoup vers le haut" small />
        <ShiftBtn label="↓↓" onClick={() => onShift(0, STEP_MEDIUM)} title="Beaucoup vers le bas" small />
        <ShiftBtn label="←←" onClick={() => onShift(-STEP_MEDIUM, 0)} title="Beaucoup à gauche" small />
        <ShiftBtn label="→→" onClick={() => onShift(STEP_MEDIUM, 0)} title="Beaucoup à droite" small />
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
        Ctrl+Z (Cmd+Z) pour annuler
      </div>
    </div>
  )
}

function ShiftBtn({
  label, onClick, title, small,
}: { label: string; onClick: () => void; title: string; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        height: small ? 28 : 36,
        padding: '0 8px',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        borderRadius: 8,
        color: 'var(--foreground)',
        cursor: 'pointer',
        fontSize: small ? 11 : 14,
        fontWeight: 700,
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        margin: '0 0 10px',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--muted)',
      }}
    >
      {children}
    </h3>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--muted)',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26, height: 26,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--card)',
        color: disabled ? 'var(--muted)' : 'var(--foreground)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

function fieldsTotalCount(docs: SignDocument[]): number {
  return docs.reduce((acc, d) => acc + (d.fields?.length || 0), 0)
}

function countFieldsForRecipient(docs: SignDocument[], order: number): number {
  return docs.reduce((acc, d) => acc + (d.fields?.filter(f => f.recipientOrder === order).length || 0), 0)
}
