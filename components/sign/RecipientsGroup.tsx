// TalentFlow Sign — Routing parallèle visuel pour /sign/new (v2.2.1)
//
// Affiche les destinataires regroupés par "étape" (order). Plusieurs destinataires
// dans la même étape = parallèle (reçoivent leur lien en même temps).
//
// Drag & drop natif HTML5 :
//   - Drag une card SUR une autre étape → la déplace dans cette étape
//   - Drag une card SUR un séparateur entre 2 étapes → crée une nouvelle étape entre
//   - Drag-out → crée une nouvelle étape à la fin
//
// L'order est normalisé en interne (1, 2, 3...) après chaque réorganisation.
'use client'

import { useState, useMemo } from 'react'
import { Plus, Users, Zap } from 'lucide-react'
import RecipientCard, { type RecipientCandidat } from './RecipientCard'

interface Props {
  recipients: RecipientCandidat[]
  onChange: (recipients: RecipientCandidat[]) => void
  /** Si false, mode "envoi simultané à tous" → 1 seule étape implicite (order=0 partout) */
  orderEnabled: boolean
  /** v2.2.5 Phase 4d — propagé à chaque RecipientCard pour valider le phone */
  requirePhone?: boolean
}

export default function RecipientsGroup({ recipients, onChange, orderEnabled, requirePhone }: Props) {
  // Index local utilisé comme identifiant temporaire pendant le drag
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<DropTarget | null>(null)

  // Group par order (utilise l'order tel quel ; si désactivé tous = 0)
  const groups = useMemo(() => groupByOrder(recipients), [recipients])

  // ─── Mutations ─────────────────────────────────────────────────────
  const updateRecipient = (idx: number, patch: Partial<RecipientCandidat>) =>
    onChange(recipients.map((r, i) => i === idx ? { ...r, ...patch } : r))

  const addRecipient = () => {
    // Ajout à la dernière étape existante (cohérent UX : on ajoute à la même étape)
    const lastOrder = groups.length > 0 ? groups[groups.length - 1].order : 1
    onChange([
      ...recipients,
      { name: '', email: '', role: 'signer', order: orderEnabled ? lastOrder : 0, status: 'pending', signed_at: null },
    ])
  }
  const addRecipientInGroup = (groupOrder: number) => {
    onChange([
      ...recipients,
      { name: '', email: '', role: 'signer', order: groupOrder, status: 'pending', signed_at: null },
    ])
  }
  /** v2.2.1 — Crée une nouvelle étape (vide) à la fin avec un destinataire vide */
  const addNewStep = () => {
    const lastOrder = groups.length > 0 ? Math.max(...groups.map(g => g.order)) : 0
    const newOrder = lastOrder + 1
    onChange([
      ...recipients,
      { name: '', email: '', role: 'signer', order: newOrder, status: 'pending', signed_at: null },
    ])
  }
  const removeRecipient = (idx: number) => {
    if (recipients.length === 1) return
    const next = recipients.filter((_, i) => i !== idx)
    onChange(normalizeOrders(next, orderEnabled))
  }

  /** Reset du state drag — à appeler après chaque action drop (sinon cards restent en opacité 0.4). */
  const resetDrag = () => {
    setDragSrcIdx(null)
    setDragOverTarget(null)
  }

  /** Move : déplace recipient `from` vers la cible (dans étape ou nouvelle étape entre) */
  const moveRecipient = (from: number, target: DropTarget) => {
    if (!orderEnabled) { resetDrag(); return }
    const list = recipients.slice()
    const [moved] = list.splice(from, 1)

    if (target.kind === 'into-group') {
      moved.order = target.order
      list.push(moved)
    } else if (target.kind === 'new-step-between') {
      const newOrder = target.afterOrder + 1
      list.forEach(r => {
        if ((r.order ?? 0) >= newOrder) r.order = (r.order ?? 0) + 1
      })
      moved.order = newOrder
      list.push(moved)
    } else if (target.kind === 'new-step-end') {
      const lastOrder = Math.max(0, ...list.map(r => r.order ?? 0))
      moved.order = lastOrder + 1
      list.push(moved)
    } else if (target.kind === 'new-step-start') {
      list.forEach(r => { r.order = (r.order ?? 0) + 1 })
      moved.order = 1
      list.push(moved)
    }

    // Sort par order asc puis ordre d'apparition
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    onChange(normalizeOrders(list, orderEnabled))
    // ⚠️ CRITIQUE : reset après le move sinon la card source reste en opacité 0.4
    resetDrag()
  }

  // ─── Mode désactivé : 1 seule étape implicite, comportement simple ──
  if (!orderEnabled) {
    return (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recipients.map((r, idx) => (
            <RecipientCard
              key={idx}
              idx={idx}
              total={recipients.length}
              recipient={r}
              showOrder={false}
              draggable={false}
              dragSrcIdx={null}
              setDragSrcIdx={() => {}}
              onUpdate={p => updateRecipient(idx, p)}
              onMove={() => {}}
              onRemove={() => removeRecipient(idx)}
              onDropTo={() => {}}
              requirePhone={requirePhone}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addRecipient}
          className="neo-btn-ghost neo-btn-sm"
          style={{ marginTop: 12 }}
        >
          <Plus size={13} />
          Ajouter un destinataire
        </button>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          📨 Tous les destinataires recevront leur lien <strong>en même temps</strong>.
        </p>
      </div>
    )
  }

  // ─── Mode activé : groupes / étapes parallèles ─────────────────────
  return (
    <div
      onDragEnd={resetDrag}
      // Filet de sécurité : si le drag est aborté (ex: drop hors zones, esc),
      // on reset au mouseup global aussi.
      onMouseUp={() => { if (dragSrcIdx !== null) resetDrag() }}
    >
      {/* Drop zone tout en haut : crée une nouvelle 1ère étape */}
      <DropSeparator
        active={dragOverTarget?.kind === 'new-step-start'}
        onDragOver={() => setDragOverTarget({ kind: 'new-step-start' })}
        onDrop={() => { if (dragSrcIdx !== null) moveRecipient(dragSrcIdx, { kind: 'new-step-start' }) }}
        label="Nouvelle 1ère étape"
        visible={dragSrcIdx !== null}
      />

      {groups.map((g, gIdx) => (
        <div key={`group-${g.order}`}>
          <GroupContainer
            order={g.order}
            count={g.recipients.length}
            isParallel={g.recipients.length > 1}
            isDragOver={dragOverTarget?.kind === 'into-group' && dragOverTarget.order === g.order}
            onDragOver={(e) => {
              e.preventDefault()
              if (dragSrcIdx !== null) setDragOverTarget({ kind: 'into-group', order: g.order })
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragSrcIdx !== null) moveRecipient(dragSrcIdx, { kind: 'into-group', order: g.order })
            }}
            onAdd={() => addRecipientInGroup(g.order)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.recipients.map((r) => {
                const idx = recipients.indexOf(r)
                return (
                  <RecipientCard
                    key={idx}
                    idx={idx}
                    total={recipients.length}
                    recipient={r}
                    showOrder={false}  // l'ordre est porté par la carte parente "ÉTAPE X"
                    draggable={true}
                    dragSrcIdx={dragSrcIdx}
                    setDragSrcIdx={setDragSrcIdx}
                    onUpdate={p => updateRecipient(idx, p)}
                    onMove={() => {}}  // remplacé par DnD entre groupes
                    onRemove={() => removeRecipient(idx)}
                    onDropTo={() => {}}  // remplacé par DnD entre groupes
                    requirePhone={requirePhone}
                  />
                )
              })}
            </div>
          </GroupContainer>

          {/* Drop zone entre groupes : crée une nouvelle étape */}
          {gIdx < groups.length - 1 && (
            <DropSeparator
              active={dragOverTarget?.kind === 'new-step-between' && dragOverTarget.afterOrder === g.order}
              onDragOver={() => setDragOverTarget({ kind: 'new-step-between', afterOrder: g.order })}
              onDrop={() => { if (dragSrcIdx !== null) moveRecipient(dragSrcIdx, { kind: 'new-step-between', afterOrder: g.order }) }}
              label="Nouvelle étape entre"
              visible={dragSrcIdx !== null}
            />
          )}
        </div>
      ))}

      {/* Drop zone en bas : crée une nouvelle dernière étape */}
      <DropSeparator
        active={dragOverTarget?.kind === 'new-step-end'}
        onDragOver={() => setDragOverTarget({ kind: 'new-step-end' })}
        onDrop={() => { if (dragSrcIdx !== null) moveRecipient(dragSrcIdx, { kind: 'new-step-end' }) }}
        label="Nouvelle dernière étape"
        visible={dragSrcIdx !== null}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button
          type="button"
          onClick={addRecipient}
          className="neo-btn-ghost neo-btn-sm"
        >
          <Plus size={13} />
          Ajouter un destinataire
        </button>
        <button
          type="button"
          onClick={addNewStep}
          className="neo-btn-ghost neo-btn-sm"
          style={{
            borderStyle: 'dashed',
            color: 'var(--accent-foreground)',
          }}
          title="Crée une nouvelle étape vide à la fin"
        >
          <Plus size={13} />
          Ajouter une étape
        </button>
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
        💡 Les destinataires d&apos;une <strong>même étape</strong> reçoivent leur lien <strong>en même temps</strong>. L&apos;étape suivante se déclenche quand tous les signataires de l&apos;étape précédente ont signé.
        <br />
        Glisse une carte sur une autre étape pour les regrouper, ou entre deux étapes pour créer une nouvelle étape intermédiaire.
      </p>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────
type DropTarget =
  | { kind: 'into-group'; order: number }
  | { kind: 'new-step-between'; afterOrder: number }
  | { kind: 'new-step-start' }
  | { kind: 'new-step-end' }

function groupByOrder(recipients: RecipientCandidat[]) {
  const map = new Map<number, RecipientCandidat[]>()
  for (const r of recipients) {
    const o = r.order ?? 0
    if (!map.has(o)) map.set(o, [])
    map.get(o)!.push(r)
  }
  return Array.from(map.entries())
    .map(([order, list]) => ({ order, recipients: list }))
    .sort((a, b) => a.order - b.order)
}

/** Renumérote les orders en 1, 2, 3... (préserve les regroupements parallèles). */
function normalizeOrders(list: RecipientCandidat[], orderEnabled: boolean): RecipientCandidat[] {
  if (!orderEnabled) {
    return list.map(r => ({ ...r, order: 0 }))
  }
  const sortedOrders = Array.from(new Set(list.map(r => r.order ?? 0))).sort((a, b) => a - b)
  const remap = new Map<number, number>()
  sortedOrders.forEach((o, i) => remap.set(o, i + 1))
  return list.map(r => ({ ...r, order: remap.get(r.order ?? 0) ?? 1 }))
}

// ─── GroupContainer ─────────────────────────────────────────────────
function GroupContainer({
  order, count, isParallel, isDragOver, onDragOver, onDrop, onAdd, children,
}: {
  order: number
  count: number
  isParallel: boolean
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onAdd: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        padding: 12,
        border: `2px ${isDragOver ? 'solid' : 'dashed'} ${isDragOver ? 'var(--primary)' : 'var(--border)'}`,
        background: isDragOver ? 'var(--primary-soft)' : 'transparent',
        borderRadius: 12,
        marginBottom: 8,
        transition: 'background 0.15s, border 0.15s',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
      }}>
        <div style={{
          minWidth: 28, height: 28, padding: '0 10px',
          borderRadius: 999,
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          fontSize: 12, fontWeight: 800,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          letterSpacing: '0.04em',
        }}>
          {/* v2.8.0 — Affichage 1-based (humain) au lieu du 0-based interne */}
          ÉTAPE {order + 1}
        </div>
        <span style={{
          fontSize: 11.5, color: 'var(--muted)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {isParallel ? (
            <>
              <Zap size={11} style={{ color: '#A16207' }} />
              <strong style={{ color: '#A16207' }}>Parallèle</strong> · {count} destinataires reçoivent en même temps
            </>
          ) : (
            <>
              <Users size={11} />
              {count} destinataire
            </>
          )}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onAdd}
          title="Ajouter un destinataire à cette étape (parallèle)"
          style={{
            padding: '4px 10px',
            fontSize: 11,
            border: '1px solid var(--border)',
            borderRadius: 999,
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'inherit',
          }}
        >
          <Plus size={11} />
          Ajouter ici
        </button>
      </div>
      {children}
    </div>
  )
}

// ─── Drop separator entre groupes ──────────────────────────────────
function DropSeparator({
  active, onDragOver, onDrop, label, visible,
}: {
  active: boolean; onDragOver: () => void; onDrop: () => void; label: string; visible: boolean
}) {
  if (!visible) return <div style={{ height: 4 }} />
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver() }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
      style={{
        height: active ? 36 : 18,
        margin: '4px 0',
        borderRadius: 8,
        background: active ? 'var(--primary-soft)' : 'transparent',
        border: `1.5px dashed ${active ? 'var(--primary)' : 'var(--border)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
        fontSize: 11,
        fontWeight: 600,
        color: active ? 'var(--accent-foreground)' : 'transparent',
      }}
    >
      {active && `+ ${label}`}
    </div>
  )
}
