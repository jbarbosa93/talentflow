// TalentFlow Sign — Tableau templates style DocuSign (refonte v2.2.1)
// v2.2.1
//
// Colonnes : checkbox | ⭐ | Nom (titre + nb docs/champs) | Propriétaire
//          | Création | Modif | Actions (Utiliser + ⋮)
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import TemplateSettingsModal from './TemplateSettingsModal'
import {
  Star, MoreVertical, Edit3, Copy, Trash2, Sparkles, Settings,
  FolderOpen, Loader2, FileText, ClipboardList, Tag, Check, X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { SignTemplate, SignTemplateKind } from '@/lib/sign/types'

interface Props {
  templates: SignTemplate[]
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
  onChange: () => void
}

const FAV_KEY = 'tf_sign_template_favs'

function loadFavs(): Set<string> {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(FAV_KEY) : null
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch { return new Set() }
}
function saveFavs(s: Set<string>) {
  try { window.localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(s))) } catch { /* */ }
}

export default function TemplatesTable({
  templates, selectedIds, onToggleSelect, onToggleAll, onChange,
}: Props) {
  const [favs, setFavs] = useState<Set<string>>(new Set())
  useEffect(() => { setFavs(loadFavs()) }, [])

  const toggleFav = (id: string) => {
    setFavs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      saveFavs(next)
      return next
    })
  }

  // Sort: favoris en premier, puis date desc
  const sorted = [...templates].sort((a, b) => {
    const aFav = favs.has(a.id), bFav = favs.has(b.id)
    if (aFav && !bFav) return -1
    if (!aFav && bFav) return 1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  if (sorted.length === 0) {
    return (
      <div className="neo-empty">
        <div className="neo-empty-icon">
          <FolderOpen size={36} style={{ color: 'var(--muted)' }} />
        </div>
        <div className="neo-empty-title">Aucun template</div>
        <div className="neo-empty-sub">
          Créez votre premier template pour réutiliser vos PDFs et destinataires.
        </div>
      </div>
    )
  }

  const allSelected = selectedIds.length === sorted.length && sorted.length > 0
  const someSelected = selectedIds.length > 0 && !allSelected

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
      background: 'var(--card)',
      boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
    }}>
      {/* Header */}
      <div style={headerRowStyle}>
        <CellCheckbox checked={allSelected} indeterminate={someSelected} onChange={onToggleAll} />
        <div style={{ ...cellStyle, width: 40, flexShrink: 0 }}></div>
        <div style={{ ...cellStyle, flex: 1, minWidth: 0 }}>Nom</div>
        <div style={{ ...cellStyle, width: 140, flexShrink: 0 }}>Propriétaire</div>
        <div style={{ ...cellStyle, width: 120, flexShrink: 0 }}>Création</div>
        <div style={{ ...cellStyle, width: 120, flexShrink: 0 }}>Modif.</div>
        <div style={{ ...cellStyle, width: 180, flexShrink: 0, textAlign: 'right' }}>Actions</div>
      </div>

      {sorted.map((t, i) => (
        <TemplateRow
          key={t.id}
          tpl={t}
          isLast={i === sorted.length - 1}
          isSelected={selectedIds.includes(t.id)}
          isFav={favs.has(t.id)}
          onToggle={() => onToggleSelect(t.id)}
          onToggleFav={() => toggleFav(t.id)}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────
function TemplateRow({
  tpl, isLast, isSelected, isFav, onToggle, onToggleFav, onChange,
}: {
  tpl: SignTemplate; isLast: boolean; isSelected: boolean; isFav: boolean
  onToggle: () => void; onToggleFav: () => void; onChange: () => void
}) {
  const router = useRouter()
  const docsCount = (tpl.documents || []).length
  const fieldsCount = (tpl.documents || []).reduce((s, d) => s + ((d.fields || []).length), 0)
  const isDocusignImport = (tpl.documents || []).some(d => (d.fields || []).some(f => f.source === 'docusign'))
  const created = new Date(tpl.created_at)
  const updated = new Date(tpl.updated_at)

  const handleUse = () => {
    // Ouvre la page création d'enveloppe avec ce template pré-sélectionné
    router.push(`/sign/new?template=${tpl.id}`)
  }

  const [busy, setBusy] = useState<string | null>(null)
  // v2.8.6 — Modal léger pour éditer nom + description + message par défaut
  const [showSettings, setShowSettings] = useState(false)
  const tplKind: SignTemplateKind = (tpl.kind === 'report' ? 'report' : 'envelope')
  const handleEdit = () => router.push(`/sign/templates/${tpl.id}/edit`)
  const handleSettings = () => setShowSettings(true)
  const handleDuplicate = async () => {
    setBusy('dup')
    try {
      const r = await fetch('/api/sign/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tpl.name + ' (copie)',
          description: tpl.description,
          documents: tpl.documents,
          recipients_schema: tpl.recipients_schema,
          kind: tplKind,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Template dupliqué')
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }
  const handleDelete = async () => {
    if (!confirm(`Supprimer définitivement "${tpl.name}" ?`)) return
    setBusy('del')
    try {
      const r = await fetch(`/api/sign/templates/${tpl.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Erreur')
      toast.success('Supprimé')
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }
  // v2.2.6 Phase 5 — Convertir le template entre 'envelope' (Mappe/Contrat) et 'report' (Rapport hebdo).
  const handleChangeKind = async (newKind: SignTemplateKind) => {
    if (tplKind === newKind) return
    const label = newKind === 'report' ? 'Rapport d\'heures' : 'Général / Contrat (envelope)'
    if (!confirm(`Changer le type vers « ${label} » ?`)) return
    setBusy('kind')
    try {
      const r = await fetch(`/api/sign/templates/${tpl.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: newKind }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur')
      }
      toast.success(`Type changé : ${label}`)
      onChange()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: isSelected ? 'var(--primary-soft)' : 'transparent',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
    >
      <CellCheckbox checked={isSelected} onChange={onToggle} />
      <div style={{ ...cellStyle, width: 40, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onToggleFav}
          style={{
            width: 28, height: 28,
            border: 'none', background: 'transparent',
            cursor: 'pointer',
            color: isFav ? '#EAB308' : 'var(--muted)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          <Star size={14} fill={isFav ? '#EAB308' : 'none'} />
        </button>
      </div>
      <div style={{ ...cellStyle, flex: 1, minWidth: 0 }}>
        <Link
          href={`/sign/templates/${tpl.id}/edit`}
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: 'var(--foreground)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {tpl.name}
          {tplKind === 'report' && (
            <span style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 999,
              background: '#FEF3C7',
              color: '#A16207',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              flexShrink: 0,
              letterSpacing: '0.04em',
            }} title="Type : Rapport d'heures hebdomadaire">
              <ClipboardList size={9} />
              Rapport
            </span>
          )}
          {isDocusignImport && (
            <span style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 999,
              background: 'var(--primary-soft)',
              color: 'var(--accent-foreground)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              flexShrink: 0,
              letterSpacing: '0.04em',
            }}>
              <Sparkles size={9} />
              DocuSign
            </span>
          )}
        </Link>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={11} />
          {docsCount} PDF{docsCount > 1 ? 's' : ''} · {fieldsCount} champ{fieldsCount > 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ ...cellStyle, width: 140, flexShrink: 0, fontSize: 12.5, color: 'var(--muted)' }}>
        {tpl.created_by ? 'Vous' : '—'}
      </div>
      <div style={{ ...cellStyle, width: 120, flexShrink: 0, fontSize: 12.5, color: 'var(--text-2, var(--foreground))', fontVariantNumeric: 'tabular-nums' }}>
        {created.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
      </div>
      <div style={{ ...cellStyle, width: 120, flexShrink: 0, fontSize: 12.5, color: 'var(--text-2, var(--foreground))', fontVariantNumeric: 'tabular-nums' }}>
        {updated.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
      </div>
      <div style={{ ...cellStyle, width: 180, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        <button
          type="button"
          onClick={handleUse}
          className="neo-btn-yellow neo-btn-sm"
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          Utiliser
        </button>
        <TplActionMenu
          onSettings={handleSettings}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onChangeKind={handleChangeKind}
          currentKind={tplKind}
          busy={busy}
        />
      </div>

      {/* v2.8.6 — Modal Paramètres template (nom + description + message défaut) */}
      <TemplateSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        templateId={tpl.id}
        initialName={tpl.name}
        initialDescription={tpl.description}
        initialDefaultMessage={(tpl as unknown as { default_message?: string | null }).default_message}
        onSaved={() => onChange()}
      />
    </div>
  )
}

// ─── Action menu ⋮ ──────────────────────────────────────────────────
function TplActionMenu({
  onSettings, onEdit, onDuplicate, onDelete, onChangeKind, currentKind, busy,
}: {
  onSettings: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onChangeKind: (k: SignTemplateKind) => void
  currentKind: SignTemplateKind
  busy: string | null
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // ⚠️ Vérifier que le clic est en dehors DU BOUTON ET DU MENU PORTALISÉ
    // (sinon le menu se ferme avant que le onClick des items ne fire → boutons KO)
    const onDocClick = (e: MouseEvent) => {
      const tgt = e.target as Node
      if (btnRef.current?.contains(tgt)) return
      if (menuRef.current?.contains(tgt)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.right - 200 })
    }
    setOpen(o => !o)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={!!busy}
        style={{
          width: 30, height: 30,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: open ? 'var(--surface-2)' : 'var(--card)',
          color: 'var(--muted)',
          cursor: busy ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <MoreVertical size={14} />}
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: Math.max(12, pos.left),
            width: 200,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            padding: 4,
            zIndex: 9999,
            // ⚠️ Le portail est monté hors du DOM normal → perd l'héritage CSS
            // → on force la police explicitement sinon fallback navigateur
            fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
            color: 'var(--foreground)',
          }}
        >
          {/* v2.8.6 — Paramètres léger (nom + description + message défaut) */}
          <MenuItem icon={Settings} label="Paramètres" onClick={() => { setOpen(false); onSettings() }} />
          <MenuItem icon={Edit3} label="Éditeur visuel" onClick={() => { setOpen(false); onEdit() }} />
          <MenuItem icon={Copy} label="Dupliquer" onClick={() => { setOpen(false); onDuplicate() }} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
          {/* v2.2.6 Phase 5 — Convertir le template entre types */}
          {currentKind === 'envelope' ? (
            <MenuItem
              icon={ClipboardList}
              label="Convertir en Rapport"
              onClick={() => { setOpen(false); onChangeKind('report') }}
            />
          ) : (
            <MenuItem
              icon={Tag}
              label="Convertir en Général / Contrat"
              onClick={() => { setOpen(false); onChangeKind('envelope') }}
            />
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
          <MenuItem icon={Trash2} label="Supprimer" onClick={() => { setOpen(false); onDelete() }} danger />
        </div>,
        document.body,
      )}
    </>
  )
}

function MenuItem({
  icon: Icon, label, onClick, danger,
}: { icon: typeof Edit3; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        border: 'none',
        background: 'transparent',
        color: danger ? 'var(--destructive)' : 'var(--foreground)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12.5,
        textAlign: 'left',
        borderRadius: 6,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

function CellCheckbox({
  checked, indeterminate, onChange,
}: { checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return (
    <div style={{ ...cellStyle, width: 44, flexShrink: 0, padding: '12px 8px 12px 14px' }}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
      />
    </div>
  )
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'var(--surface-2)',
  borderBottom: '1px solid var(--border)',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--muted)',
}

const cellStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 12.5,
}
