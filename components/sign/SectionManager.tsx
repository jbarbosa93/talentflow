// TalentFlow Sign — Panneau « Gérer les sections »
// v2.9.21
//
// Modal partagé Mode Wizard ↔ Mode Document. Donne une vue d'ensemble de toutes
// les sections (`wizardSection`) d'un template et permet de :
//   - renommer une section (inline)
//   - replier / déplier (convenance d'édition, jamais envoyé au candidat)
//   - réordonner (Mode Wizard uniquement — le Mode Document est positionné en
//     absolu sur le PDF, le réordonnancement n'a pas de sens)
//   - rendre tous les champs obligatoires / facultatifs
//   - supprimer : « Dégrouper » (vide la section, garde les champs) ou
//     « Supprimer les champs » (destructif, confirmation)
//
// Le composant est PUREMENT présentationnel : toute la logique de mutation est
// déléguée au parent via les callbacks. Pattern #46 (modal portalisé).
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, ChevronRight, ChevronDown, ArrowUp, ArrowDown, Trash2,
  Check, Layers, FoldVertical, UnfoldVertical, Pencil,
} from 'lucide-react'

export interface SectionManagerRow {
  name: string
  count: number
  allRequired: boolean
  collapsed: boolean
  /** Contexte : « Étape 3 » (wizard) ou « Page 1-2 » (document) */
  contextLabel: string
  canMoveUp: boolean
  canMoveDown: boolean
  /**
   * v2.9.70 — Liste des champs de la section (affichée quand section dépliée
   * dans le modal). Permet de supprimer un champ individuel ou de le réordonner
   * sans fermer le modal.
   */
  fields?: Array<{
    id: string
    label: string
    type: string
    required?: boolean
  }>
}

interface SectionManagerProps {
  mode: 'wizard' | 'document'
  rows: SectionManagerRow[]
  unsectionedCount: number
  onRename: (oldName: string, newName: string) => void
  onDelete: (name: string, deleteFields: boolean) => void
  onToggleRequired: (name: string, required: boolean) => void
  onMove: (name: string, dir: -1 | 1) => void
  onToggleCollapse: (name: string) => void
  onCollapseAll: (collapsed: boolean) => void
  onClose: () => void
  /**
   * v2.9.70 — Callbacks pour gérer les champs individuels depuis le modal
   * (visible quand une section est dépliée). Si absents, la liste des champs
   * n'est qu'informative (lecture seule).
   */
  onDeleteField?: (fieldId: string) => void
  onMoveField?: (fieldId: string, dir: -1 | 1) => void
  onToggleFieldRequired?: (fieldId: string, required: boolean) => void
}

export default function SectionManager({
  mode, rows, unsectionedCount,
  onRename, onDelete, onToggleRequired, onMove, onToggleCollapse, onCollapseAll,
  onClose,
  onDeleteField, onMoveField, onToggleFieldRequired,
}: SectionManagerProps) {
  // Fermeture sur Echap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  const allCollapsed = rows.length > 0 && rows.every((r) => r.collapsed)

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 95vw)', maxHeight: '88vh',
          background: 'var(--card)', borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif',
              fontSize: 23, fontWeight: 400, color: 'var(--foreground)', lineHeight: 1.15,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Layers size={20} style={{ color: 'var(--primary, #EAB308)' }} />
              Gérer les sections
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3, var(--muted))', marginTop: 4 }}>
              {rows.length} section{rows.length > 1 ? 's' : ''}
              {unsectionedCount > 0 && ` · ${unsectionedCount} champ${unsectionedCount > 1 ? 's' : ''} sans section`}
              {mode === 'document' && ' · le réordonnancement se fait en Mode Wizard'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--card)',
              cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Barre d'actions globales */}
        {rows.length > 0 && (
          <div style={{
            padding: '10px 24px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <button
              type="button"
              onClick={() => onCollapseAll(!allCollapsed)}
              style={ghostBtn}
            >
              {allCollapsed
                ? <><UnfoldVertical size={13} /> Tout déplier</>
                : <><FoldVertical size={13} /> Tout replier</>}
            </button>
          </div>
        )}

        {/* Liste des sections */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
          {rows.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '36px 20px',
              color: 'var(--text-3, var(--muted))', fontSize: 13,
            }}>
              Aucune section pour ce destinataire.<br />
              Renseigne « Section d'affichage » dans les options d'un champ pour en créer une.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map((row) => (
                <SectionRow
                  key={row.name}
                  mode={mode}
                  row={row}
                  onRename={onRename}
                  onDelete={onDelete}
                  onToggleRequired={onToggleRequired}
                  onMove={onMove}
                  onToggleCollapse={onToggleCollapse}
                  onDeleteField={onDeleteField}
                  onMoveField={onMoveField}
                  onToggleFieldRequired={onToggleFieldRequired}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── Une ligne de section ──────────────────────────────────────────────────
function SectionRow({
  mode, row, onRename, onDelete, onToggleRequired, onMove, onToggleCollapse,
  onDeleteField, onMoveField, onToggleFieldRequired,
}: {
  mode: 'wizard' | 'document'
  row: SectionManagerRow
  onRename: (oldName: string, newName: string) => void
  onDelete: (name: string, deleteFields: boolean) => void
  onToggleRequired: (name: string, required: boolean) => void
  onMove: (name: string, dir: -1 | 1) => void
  onToggleCollapse: (name: string) => void
  onDeleteField?: (fieldId: string) => void
  onMoveField?: (fieldId: string, dir: -1 | 1) => void
  onToggleFieldRequired?: (fieldId: string, required: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const commitRename = () => {
    const t = draft.trim()
    if (t && t !== row.name) onRename(row.name, t)
    else setDraft(row.name)
    setEditing(false)
  }

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      background: 'var(--surface, var(--card))',
      borderLeft: '3px solid var(--primary, #EAB308)',
    }}>
      {/* Ligne principale */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      }}>
        {/* Replier / déplier */}
        <button
          type="button"
          onClick={() => onToggleCollapse(row.name)}
          title={row.collapsed ? 'Déplier' : 'Replier'}
          style={iconBtn}
        >
          {row.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>

        {/* Nom (éditable) */}
        {editing ? (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') { setDraft(row.name); setEditing(false) }
            }}
            style={{
              flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700,
              color: 'var(--foreground)', background: 'var(--card)',
              border: '1px solid var(--primary, #EAB308)', borderRadius: 6,
              padding: '4px 8px', outline: 'none', fontFamily: 'inherit',
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => { setDraft(row.name); setEditing(true) }}
            title="Cliquer pour renommer"
            style={{
              flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
              background: 'transparent', border: 'none', padding: '2px 4px',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              fontSize: 13, fontWeight: 700, color: 'var(--foreground)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {row.name}
            </span>
            <Pencil size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          </button>
        )}

        {/* Compteur + contexte */}
        <span style={{
          fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {row.count} champ{row.count > 1 ? 's' : ''} · {row.contextLabel}
        </span>

        {/* Tout obligatoire */}
        <label
          title="Rend tous les champs de la section obligatoires"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
            fontSize: 10.5, fontWeight: 600, color: 'var(--foreground)', cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={row.allRequired}
            onChange={(e) => onToggleRequired(row.name, e.target.checked)}
            style={{ accentColor: 'var(--primary, #EAB308)', cursor: 'pointer' }}
          />
          Oblig.
        </label>

        {/* Réordonnancement (Wizard uniquement) */}
        {mode === 'wizard' && (
          <div style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => onMove(row.name, -1)}
              disabled={!row.canMoveUp}
              title="Monter"
              style={iconBtn}
            >
              <ArrowUp size={14} style={{ opacity: row.canMoveUp ? 1 : 0.3 }} />
            </button>
            <button
              type="button"
              onClick={() => onMove(row.name, 1)}
              disabled={!row.canMoveDown}
              title="Descendre"
              style={iconBtn}
            >
              <ArrowDown size={14} style={{ opacity: row.canMoveDown ? 1 : 0.3 }} />
            </button>
          </div>
        )}

        {/* Supprimer */}
        <button
          type="button"
          onClick={() => setConfirmingDelete((v) => !v)}
          title="Supprimer la section"
          style={{
            ...iconBtn,
            color: confirmingDelete ? '#DC2626' : 'var(--muted)',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* v2.9.70 — Liste des champs (visible quand la section est dépliée).
          Permet de réordonner / supprimer / rendre obligatoire chaque champ
          depuis le modal sans devoir fermer pour aller dans l'éditeur. */}
      {!row.collapsed && row.fields && row.fields.length > 0 && (
        <div style={{
          padding: '4px 12px 12px 38px',
          borderTop: '1px dashed var(--border)',
          background: 'var(--card)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {row.fields.map((f, idx) => {
            const canUp = idx > 0
            const canDown = idx < (row.fields?.length || 0) - 1
            return (
              <div
                key={f.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 6,
                  background: 'var(--surface, transparent)',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  flexShrink: 0, minWidth: 56,
                  background: 'var(--card)', padding: '2px 6px', borderRadius: 4,
                  border: '1px solid var(--border)',
                }}>
                  {f.type}
                </span>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 12, color: 'var(--foreground)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {f.label || '—'}
                </span>
                {onToggleFieldRequired && (
                  <label
                    title="Rend ce champ obligatoire"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                      fontSize: 10, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => onToggleFieldRequired(f.id, e.target.checked)}
                      style={{ accentColor: 'var(--primary, #EAB308)', cursor: 'pointer' }}
                    />
                    Oblig.
                  </label>
                )}
                {onMoveField && mode === 'wizard' && (
                  <div style={{ display: 'inline-flex', gap: 1, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => canUp && onMoveField(f.id, -1)}
                      disabled={!canUp}
                      title="Monter"
                      style={iconBtn}
                    >
                      <ArrowUp size={12} style={{ opacity: canUp ? 1 : 0.3 }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => canDown && onMoveField(f.id, 1)}
                      disabled={!canDown}
                      title="Descendre"
                      style={iconBtn}
                    >
                      <ArrowDown size={12} style={{ opacity: canDown ? 1 : 0.3 }} />
                    </button>
                  </div>
                )}
                {onDeleteField && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer définitivement le champ « ${f.label} » ?`)) {
                        onDeleteField(f.id)
                      }
                    }}
                    title="Supprimer ce champ"
                    style={{ ...iconBtn, color: '#DC2626' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Confirmation suppression (inline) */}
      {confirmingDelete && (
        <div style={{
          padding: '10px 12px', borderTop: '1px solid var(--border)',
          background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            Que faire de la section « {row.name} » ?
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { onDelete(row.name, false); setConfirmingDelete(false) }}
              style={softBtn}
              title="Les champs restent dans le document, ils ne sont plus regroupés"
            >
              <Check size={12} /> Dégrouper ({row.count} champ{row.count > 1 ? 's' : ''} gardés)
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(
                  `Supprimer DÉFINITIVEMENT les ${row.count} champ${row.count > 1 ? 's' : ''} de la section « ${row.name} » ?\n\n`
                  + 'Cette action est irréversible.',
                )) {
                  onDelete(row.name, true)
                  setConfirmingDelete(false)
                }
              }}
              style={dangerBtn}
            >
              <Trash2 size={12} /> Supprimer les {row.count} champ{row.count > 1 ? 's' : ''}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              style={ghostBtn}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6, flexShrink: 0,
  border: '1px solid transparent', background: 'transparent',
  color: 'var(--muted)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', fontSize: 12, fontWeight: 600,
  border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--foreground)', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'inherit',
}
const softBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 11px', fontSize: 12, fontWeight: 700,
  border: '1px solid var(--border)', background: 'var(--surface, var(--card))',
  color: 'var(--foreground)', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'inherit',
}
const dangerBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 11px', fontSize: 12, fontWeight: 700,
  border: '1px solid rgba(220,38,38,0.45)', background: 'rgba(220,38,38,0.08)',
  color: '#DC2626', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'inherit',
}
