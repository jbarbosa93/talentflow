// TalentFlow Sign — Overlay Konva pour placement/édition des champs
// v2.2.0 — Phase 2 (polish DocuSign-like + multi-sélection + fix resize)
'use client'

import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Text, Group, Path } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { SignField, SignFieldType } from '@/lib/sign/types'
import { RECIPIENT_COLORS, SIGNATURE_CONSTRAINTS } from '@/lib/sign/types'

interface Props {
  width: number             // px
  height: number            // px
  page: number              // 1-based
  fields: SignField[]
  onChange: (fields: SignField[]) => void
  selectedIds: string[]     // multi-sélection
  onSelect: (ids: string[]) => void
  activeTool: SignFieldType | null
  activeRecipientOrder: number
  genId: () => string
  /** v2.2.4 — Affichage des badges wizardSection au-dessus de chaque field (toggle UI). Défaut true. */
  showSectionBadges?: boolean
}

const DEFAULT_FIELD_SIZE_PCT: Record<SignFieldType, { w: number; h: number }> = {
  // Signature — v2.3.13 : tailles ratio 3:1 (signature) / 1:1 (initial)
  // alignées sur SIGNATURE_CONSTRAINTS dans lib/sign/types.ts.
  signature:  { w: 0.30, h: 0.10 },
  initial:    { w: 0.05, h: 0.05 },
  date:       { w: 0.16, h: 0.025 },
  // Coordonnées
  firstname:  { w: 0.18, h: 0.025 },
  lastname:   { w: 0.18, h: 0.025 },
  fullname:   { w: 0.25, h: 0.025 },
  email:      { w: 0.28, h: 0.025 },
  company:    { w: 0.25, h: 0.025 },
  title:      { w: 0.22, h: 0.025 },
  // Entrées
  text:       { w: 0.22, h: 0.025 },
  number:     { w: 0.12, h: 0.025 },
  checkbox:   { w: 0.022, h: 0.016 },
  select:     { w: 0.20, h: 0.025 },
  annotation: { w: 0.30, h: 0.030 },
  // Autre
  formula:    { w: 0.18, h: 0.025 },
  attachment: { w: 0.20, h: 0.040 },
}

const PLACEHOLDER: Record<SignFieldType, string> = {
  // Signature
  signature:  'Signer',
  initial:    'Paraphe',
  date:       'Date',
  // Coordonnées
  firstname:  'Prénom',
  lastname:   'Nom',
  fullname:   'Nom complet',
  email:      'E-mail',
  company:    'Société',
  title:      'Fonction',
  // Entrées
  text:       'Texte',
  number:     '0',
  checkbox:   '',
  select:     'Sélectionner',
  annotation: 'Aide pour le signataire',
  // Autre
  formula:    'Formule',
  attachment: 'Joindre fichier',
}

const HANDLE_SIZE = 9
const MIN_FIELD_W_PCT = 0.008
const MIN_FIELD_H_PCT = 0.005

const PEN_PATH = 'M3 21l3-1 11-11-2-2L4 18l-1 3zm14-14l2-2 2 2-2 2-2-2z'

function colorFor(order: number) {
  const idx = Math.max(1, order) - 1
  return RECIPIENT_COLORS[idx % RECIPIENT_COLORS.length]
}


function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export default function FieldsCanvas({
  width, height, page, fields, onChange, selectedIds, onSelect,
  activeTool, activeRecipientOrder, genId, showSectionBadges = true,
}: Props) {
  const stageRef = useRef<Konva.Stage>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const selectedSet = new Set(selectedIds)

  const visible = fields.filter(f => f.page === page && !f.metadata?.hidden)

  // v2.2.4 — Sélection lasso (drag rectangle sur le fond vide).
  // Comme Figma/Photoshop : tu cliques sur le fond + drag → rectangle bleu →
  // tous les fields touchés sont sélectionnés. Shift+drag = additif à la sélection courante.
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null)
  const [lassoEnd, setLassoEnd] = useState<{ x: number; y: number } | null>(null)
  const lassoBaseSelectionRef = useRef<string[]>([])  // sélection avant début du lasso (pour shift+drag)

  // v2.2.4 — Ghost preview à la souris quand un outil est actif (DocuSeal-like).
  // Le user voit où le field va atterrir avant de cliquer.
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const handleStageMouseMoveGlobal = (e: KonvaEventObject<MouseEvent>) => {
    // Aussi gère le lasso existing si dragging
    if (lassoStart) {
      handleStageMouseMove(e)
      return
    }
    if (!activeTool) {
      if (mousePos) setMousePos(null)
      return
    }
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    setMousePos({ x: pos.x, y: pos.y })
  }
  const handleStageMouseLeaveGhost = () => {
    if (mousePos) setMousePos(null)
  }

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage()) {
      if (activeTool) {
        const stage = e.target.getStage()
        const pos = stage?.getPointerPosition()
        if (!pos) return
        const def = DEFAULT_FIELD_SIZE_PCT[activeTool]
        const xN = pos.x / width
        const yN = pos.y / height
        const newField: SignField = {
          id: genId(),
          type: activeTool,
          page,
          x: Math.max(0, Math.min(1 - def.w, xN - def.w / 2)),
          y: Math.max(0, Math.min(1 - def.h, yN - def.h / 2)),
          width: def.w,
          height: def.h,
          recipientOrder: activeRecipientOrder,
          label: PLACEHOLDER[activeTool] || activeTool,
          required: false,
          source: 'manual',
        }
        onChange([...fields, newField])
        onSelect([newField.id])
      } else {
        // v2.2.4 — click simple sur fond : désélectionne SAUF si on vient de finir un lasso
        // (handleStageMouseUp gère déjà la sélection lasso → ne pas écraser ici)
        if (!lassoStart) onSelect([])
      }
    }
  }

  // v2.2.4 — Lasso start : mousedown sur fond vide (pas activeTool, pas sur field)
  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (activeTool) return  // mode placement actif → pas de lasso
    if (e.target !== e.target.getStage()) return  // clicked on a field, not bg
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    const evt = e.evt as MouseEvent
    // Shift = additif (préserve sélection courante)
    lassoBaseSelectionRef.current = (evt.shiftKey || evt.metaKey || evt.ctrlKey) ? [...selectedIds] : []
    setLassoStart({ x: pos.x, y: pos.y })
    setLassoEnd({ x: pos.x, y: pos.y })
  }

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!lassoStart) return
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    setLassoEnd({ x: pos.x, y: pos.y })
    // Calcule la sélection en temps réel pour feedback visuel
    const x1 = Math.min(lassoStart.x, pos.x)
    const y1 = Math.min(lassoStart.y, pos.y)
    const x2 = Math.max(lassoStart.x, pos.x)
    const y2 = Math.max(lassoStart.y, pos.y)
    const insideIds: string[] = []
    for (const f of visible) {
      const fx = f.x * width, fy = f.y * height
      const fw = f.width * width, fh = f.height * height
      // AABB intersection
      if (fx + fw >= x1 && fx <= x2 && fy + fh >= y1 && fy <= y2) {
        insideIds.push(f.id)
      }
    }
    // Fusionne avec la sélection de base (mode shift)
    const baseSet = new Set(lassoBaseSelectionRef.current)
    for (const id of insideIds) baseSet.add(id)
    onSelect(Array.from(baseSet))
  }

  const handleStageMouseUp = () => {
    if (!lassoStart) return
    // Lasso très court (< 4px) = clic simple → désélectionne (déjà fait par handleStageClick)
    if (lassoEnd && Math.hypot(lassoEnd.x - lassoStart.x, lassoEnd.y - lassoStart.y) < 4) {
      onSelect(lassoBaseSelectionRef.current)
    }
    setLassoStart(null)
    setLassoEnd(null)
  }

  const handleFieldClick = (id: string, ev: KonvaEventObject<MouseEvent>) => {
    ev.cancelBubble = true
    const evt = ev.evt as MouseEvent
    const isMulti = evt && (evt.shiftKey || evt.metaKey || evt.ctrlKey)
    if (isMulti) {
      // Toggle dans la sélection
      if (selectedSet.has(id)) {
        onSelect(selectedIds.filter(s => s !== id))
      } else {
        onSelect([...selectedIds, id])
      }
    } else {
      onSelect([id])
    }
  }

  // v2.2.4 — Multi-drag : mémorise positions initiales au dragStart pour calculer le delta.
  const dragStartPosRef = useRef<{ leaderId: string; positions: Map<string, { x: number; y: number }> } | null>(null)

  const handleDragStart = (id: string, e: KonvaEventObject<DragEvent>) => {
    const node = e.target
    // Si le field draggé est dans la sélection multi → mémorise positions de TOUS les selected
    if (selectedIds.includes(id) && selectedIds.length > 1) {
      const positions = new Map<string, { x: number; y: number }>()
      for (const fid of selectedIds) {
        const f = fields.find(x => x.id === fid)
        if (f) positions.set(fid, { x: f.x * width, y: f.y * height })
      }
      // Ajoute aussi la position du leader (= position initiale, AVANT le drag commence)
      positions.set(id, { x: node.x(), y: node.y() })
      dragStartPosRef.current = { leaderId: id, positions }
    } else {
      dragStartPosRef.current = null
    }
  }

  const handleDragMove = (id: string, e: KonvaEventObject<DragEvent>) => {
    const ref = dragStartPosRef.current
    if (!ref || ref.leaderId !== id) return
    const node = e.target
    const initial = ref.positions.get(id)
    if (!initial) return
    const dx = node.x() - initial.x
    const dy = node.y() - initial.y
    // Update visuellement les autres Group Konva nodes (pas de setState pour fluidité)
    const stage = node.getStage()
    if (!stage) return
    for (const [otherId, pos] of ref.positions) {
      if (otherId === id) continue
      const otherNode = stage.findOne(`#fld-${otherId}`)
      if (otherNode) {
        otherNode.x(pos.x + dx)
        otherNode.y(pos.y + dy)
      }
    }
  }

  const handleDragEnd = (id: string, e: KonvaEventObject<DragEvent>) => {
    const node = e.target
    const ref = dragStartPosRef.current
    // Cas multi-drag : applique le delta à TOUS les selected fields
    if (ref && ref.leaderId === id) {
      const initial = ref.positions.get(id)
      if (initial) {
        const dx = node.x() - initial.x
        const dy = node.y() - initial.y
        // Commit en une seule passe
        onChange(fields.map(f => {
          const pos0 = ref.positions.get(f.id)
          if (!pos0) return f
          const newXPx = pos0.x + dx
          const newYPx = pos0.y + dy
          return {
            ...f,
            x: clamp01(newXPx / width),
            y: clamp01(newYPx / height),
          }
        }))
      }
      dragStartPosRef.current = null
      return
    }
    // Cas single-drag : juste le field draggé
    const xPx = node.x()
    const yPx = node.y()
    onChange(fields.map(f => f.id === id ? { ...f, x: clamp01(xPx / width), y: clamp01(yPx / height) } : f))
  }

  // Resize : on récupère la position ABSOLUE de la handle (sur le Stage), pas relative au Group.
  const onHandleDragMove = (id: string, e: KonvaEventObject<DragEvent>) => {
    const f = fields.find(x => x.id === id)
    if (!f) return
    const node = e.target
    // Position du handle dans le Layer (pas dans le Group, car handle est rendu hors Group).
    const hx = node.x()
    const hy = node.y()
    const fxPx = f.x * width
    const fyPx = f.y * height
    const newWPx = Math.max(MIN_FIELD_W_PCT * width, hx - fxPx + HANDLE_SIZE / 2)
    const newHPx = Math.max(MIN_FIELD_H_PCT * height, hy - fyPx + HANDLE_SIZE / 2)
    // Conversion en coords normalisées 0-1
    let nextW = clamp01(newWPx / width)
    let nextH = clamp01(newHPx / height)
    // v2.3.13 — Contraintes signature/initial : ratio fixe + min/max width.
    // - signature : ratio 3:1 + minW=0.15 maxW=0.60
    // - initial   : ratio 1:1 + minW=0.04 maxW=0.15
    // Pour les autres types, pas de contrainte (ratio libre).
    if (f.type === 'signature' || f.type === 'initial') {
      const cfg = SIGNATURE_CONSTRAINTS[f.type]
      // Détecte la direction du resize : largeur change davantage → on contraint h depuis w
      // (et vice-versa). Compare aux dimensions courantes du field.
      const dW = Math.abs(nextW - f.width)
      const dH = Math.abs(nextH - f.height)
      if (dW >= dH) {
        // Resize horizontal → contrainte width [minW, maxW] puis h = w / ratio
        nextW = Math.max(cfg.minW, Math.min(cfg.maxW, nextW))
        nextH = nextW / cfg.ratio
      } else {
        // Resize vertical → contrainte h, puis w = h * ratio
        const minH = cfg.minW / cfg.ratio
        const maxH = cfg.maxW / cfg.ratio
        nextH = Math.max(minH, Math.min(maxH, nextH))
        nextW = nextH * cfg.ratio
      }
    }
    onChange(fields.map(ff => ff.id === id ? { ...ff, width: nextW, height: nextH } : ff))
  }

  // Suppression au clavier (toutes les sélections)
  useEffect(() => {
    if (selectedIds.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      onChange(fields.filter(f => !selectedSet.has(f.id)))
      onSelect([])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, fields, onChange, onSelect])

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      onClick={handleStageClick}
      onTap={handleStageClick as unknown as (e: KonvaEventObject<TouchEvent>) => void}
      onMouseDown={handleStageMouseDown}
      onMouseMove={handleStageMouseMoveGlobal}
      onMouseUp={handleStageMouseUp}
      onMouseLeave={handleStageMouseLeaveGhost}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        cursor: activeTool ? 'crosshair' : (lassoStart ? 'crosshair' : 'default'),
      }}
    >
      {/* Layer 1 : champs */}
      <Layer>
        {visible.map(f => {
          const x = f.x * width
          const y = f.y * height
          const w = f.width * width
          const h = f.height * height
          const isSelected = selectedSet.has(f.id)
          const isHovered = hoveredId === f.id
          const c = colorFor(f.recipientOrder)
          return (
            <FieldGroup
              key={f.id}
              field={f}
              x={x} y={y} w={w} h={h}
              color={c}
              isSelected={isSelected}
              isHovered={isHovered}
              showSectionBadges={showSectionBadges}
              onClick={ev => handleFieldClick(f.id, ev)}
              onMouseEnter={() => setHoveredId(f.id)}
              onMouseLeave={() => setHoveredId(prev => prev === f.id ? null : prev)}
              onDragStart={ev => handleDragStart(f.id, ev)}
              onDragMove={ev => handleDragMove(f.id, ev)}
              onDragEnd={ev => handleDragEnd(f.id, ev)}
              boundW={width}
              boundH={height}
            />
          )
        })}
      </Layer>

      {/* Layer 2 : handles de resize (au-dessus, hors Groups draggable des fields) */}
      <Layer listening>
        {visible.map(f => {
          if (!selectedSet.has(f.id)) return null
          // Avec multi-sélection on n'autorise resize que si UN seul champ est sélectionné
          // (sinon les handles se chevauchent → confusion). Ce comportement est aligné DocuSign.
          if (selectedIds.length !== 1) return null
          const x = f.x * width
          const y = f.y * height
          const w = f.width * width
          const h = f.height * height
          const handleX = x + w
          const handleY = y + h
          const c = colorFor(f.recipientOrder)
          return (
            <Rect
              key={`h_${f.id}`}
              x={handleX - HANDLE_SIZE / 2}
              y={handleY - HANDLE_SIZE / 2}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              fill={c.stroke}
              stroke="white"
              strokeWidth={1.5}
              cornerRadius={2}
              draggable
              onDragMove={ev => onHandleDragMove(f.id, ev)}
              dragBoundFunc={pos => ({
                x: Math.max(x + 8, Math.min(width - HANDLE_SIZE / 2, pos.x)),
                y: Math.max(y + 6, Math.min(height - HANDLE_SIZE / 2, pos.y)),
              })}
            />
          )
        })}
      </Layer>

      {/* v2.2.4 — Layer 3 : rectangle lasso de sélection (au-dessus de tout) */}
      {lassoStart && lassoEnd && (
        <Layer listening={false}>
          <Rect
            x={Math.min(lassoStart.x, lassoEnd.x)}
            y={Math.min(lassoStart.y, lassoEnd.y)}
            width={Math.abs(lassoEnd.x - lassoStart.x)}
            height={Math.abs(lassoEnd.y - lassoStart.y)}
            fill="rgba(74,144,226,0.12)"
            stroke="#4A90E2"
            strokeWidth={1}
            dash={[4, 3]}
          />
        </Layer>
      )}

      {/* v2.2.4 — Layer 4 : ghost preview à la souris quand un outil est actif (DocuSeal-like) */}
      {activeTool && mousePos && !lassoStart && (() => {
        const def = DEFAULT_FIELD_SIZE_PCT[activeTool]
        const wPx = def.w * width
        const hPx = def.h * height
        const c = colorFor(activeRecipientOrder)
        return (
          <Layer listening={false}>
            <Rect
              x={mousePos.x - wPx / 2}
              y={mousePos.y - hPx / 2}
              width={wPx}
              height={hPx}
              fill={c.fill}
              stroke={c.stroke}
              strokeWidth={1.5}
              cornerRadius={3}
              dash={[5, 3]}
              opacity={0.85}
            />
          </Layer>
        )
      })()}
    </Stage>
  )
}

// ─────────────────────────────────────────────────────────────────
// FieldGroup — rendu d'un champ selon son type (DocuSign-like)
// ─────────────────────────────────────────────────────────────────
interface FieldGroupProps {
  field: SignField
  x: number; y: number; w: number; h: number
  color: { stroke: string; fill: string; text: string; soft?: string; fillSolid?: string }
  isSelected: boolean
  isHovered: boolean
  showSectionBadges: boolean
  onClick: (ev: KonvaEventObject<MouseEvent>) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onDragStart: (e: KonvaEventObject<DragEvent>) => void
  onDragMove: (e: KonvaEventObject<DragEvent>) => void
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void
  boundW: number
  boundH: number
}

function FieldGroup({
  field, x, y, w, h, color, isSelected, isHovered, showSectionBadges,
  onClick, onMouseEnter, onMouseLeave, onDragStart, onDragMove, onDragEnd,
  boundW, boundH,
}: FieldGroupProps) {
  // v2.2.4 — Helper local : rend le badge wizardSection (utilisé dans toutes les
  // branches type — checkbox/signature/select/text/etc.) pour cohérence visuelle.
  const sectionBadge = showSectionBadges && field.wizardSection && field.wizardSection.trim() ? (() => {
    const sectionText = field.wizardSection!.trim()
    const sectionFontSize = Math.min(10, Math.max(8, h * 0.45))
    const padX = 4, padY = 2
    const estimatedWidth = sectionText.length * sectionFontSize * 0.55 + padX * 2
    return (
      <>
        <Rect
          x={0}
          y={-sectionFontSize - padY * 2 - 2}
          width={estimatedWidth}
          height={sectionFontSize + padY * 2}
          fill={color.stroke}
          cornerRadius={3}
          listening={false}
          opacity={isHovered || isSelected ? 1 : 0.85}
        />
        <Text
          x={padX}
          y={-sectionFontSize - padY - 1}
          text={sectionText}
          fontSize={sectionFontSize}
          fontFamily='"DM Sans", "Inter", system-ui, sans-serif'
          fontStyle="bold"
          fill="white"
          listening={false}
        />
      </>
    )
  })() : null
  const cornerRadius = 3
  const strokeWidth = isSelected ? 1.7 : isHovered ? 1.3 : 1
  const dash = isSelected ? undefined : [3, 2]
  // v2.2.4 — Si l'admin a explicitement défini field.fontSize via le panneau Formatage,
  // on respecte cette valeur (× scale Konva si nécessaire). Sinon fallback auto-fit.
  // field.fontSize est en POINTS (PDF). Konva travaille en pixels CSS, ratio ~0.95-1.0.
  const fontSize = field.fontSize
    ? Math.max(6, Math.min(h - 2, field.fontSize))
    : Math.min(13, Math.max(8, h * 0.6))
  // v2.2.4 — Bold / italic configurés via panneau formatage (avant : ignorés)
  const fontStyle = `${field.bold ? 'bold' : ''} ${field.italic ? 'italic' : ''}`.trim() || 'normal'
  // Couleur du texte rendu : utilise field.fontColor si défini (palette couleur du panneau)
  const FONT_COLOR_MAP: Record<string, string> = {
    Black: '#000000', Gray: '#6B7280', Blue: '#1E40AF',
    Red: '#DC2626', Green: '#15803D', Orange: '#EA580C',
  }
  const customTextColor = field.fontColor ? (FONT_COLOR_MAP[field.fontColor] || field.fontColor) : null
  const isCheckbox = field.type === 'checkbox'
  // Signature et Paraphe : même rendu visuel (icône stylo + texte), juste placeholder différent
  const isSignature = field.type === 'signature' || field.type === 'initial'
  const isSelect = field.type === 'select'
  const isAnnotation = field.type === 'annotation'
  const isAttachment = field.type === 'attachment'
  const placeholder = PLACEHOLDER[field.type] || ''
  const groupBadge = field.groupId ? (field.groupName || 'G') : null

  const baseGroupProps = {
    // v2.2.4 — id Konva pour findOne lors du multi-drag (handleDragMove)
    id: `fld-${field.id}`,
    x, y,
    draggable: true,
    onClick,
    onTap: onClick as unknown as (e: KonvaEventObject<TouchEvent>) => void,
    onMouseEnter,
    onMouseLeave,
    onDragStart,
    onDragMove,
    onDragEnd,
    // Bound function désactivé en multi-drag : sinon le leader est clampé
    // mais les autres dépassent et créent un décalage permanent.
    // En single drag → clamp normal. En multi → laisse aller, le commit final
    // applique clamp01 sur chaque field individuellement.
    dragBoundFunc: (pos: { x: number; y: number }) => ({
      x: Math.max(0, Math.min(boundW - w, pos.x)),
      y: Math.max(0, Math.min(boundH - h, pos.y)),
    }),
  }

  if (isCheckbox) {
    const checked = field.metadata?.selected === true
    return (
      <Group {...baseGroupProps}>
        <Rect
          x={0} y={0} width={w} height={h}
          fill={color.fill}
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          cornerRadius={2}
        />
        {checked && (
          <Path
            x={w * 0.18} y={h * 0.22}
            data="M0 4l3 3 6-7"
            stroke={color.stroke}
            strokeWidth={Math.max(1.4, w * 0.15)}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {/* v2.2.4 — Badge wizardSection (cohérence avec autres types) */}
        {sectionBadge}
        {/* Badge "G" si membre d'un groupe */}
        {groupBadge && (
          <>
            <Rect
              x={w - 9} y={-5}
              width={12} height={10}
              fill={color.stroke}
              cornerRadius={2}
              listening={false}
            />
            <Text
              x={w - 9} y={-5}
              width={12} height={10}
              text={groupBadge.length === 1 ? groupBadge : 'G'}
              fontSize={7.5}
              fontStyle="700"
              fontFamily='"DM Sans", system-ui, sans-serif'
              fill="white"
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          </>
        )}
      </Group>
    )
  }

  if (isSignature) {
    const iconSize = Math.min(h * 0.55, 22)
    const padX = 10
    return (
      <Group {...baseGroupProps}>
        <Rect
          x={0} y={0} width={w} height={h}
          fill={color.fill}
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          cornerRadius={cornerRadius}
        />
        <Path
          x={padX} y={(h - iconSize) / 2}
          data={PEN_PATH}
          fill={color.text}
          scaleX={iconSize / 24}
          scaleY={iconSize / 24}
          listening={false}
        />
        <Text
          x={padX + iconSize + 6}
          y={0}
          width={Math.max(20, w - padX - iconSize - 12)}
          height={h}
          text={field.type === 'initial' ? 'Paraphe' : 'Signer'}
          fontSize={Math.max(11, Math.min(15, h * 0.42))}
          fontStyle="700"
          fontFamily='"DM Sans", "Inter", system-ui, sans-serif'
          fill={color.text}
          align="left"
          verticalAlign="middle"
          listening={false}
          ellipsis
          wrap="none"
        />
        {sectionBadge}
      </Group>
    )
  }

  // Annotation : icône 📝 + texte d'aide, fond doux semi-transparent
  // (Affiché pendant le signing, disparait après remplissage côté Phase 4)
  if (isAnnotation) {
    const annotationText = field.label || PLACEHOLDER.annotation
    const padX = 6
    const iconSize = Math.min(h * 0.65, 14)
    return (
      <Group {...baseGroupProps}>
        <Rect
          x={0} y={0} width={w} height={h}
          fill={color.fill}
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          dash={isSelected ? undefined : [2, 2]}
          cornerRadius={3}
          opacity={0.85}
        />
        {/* Icône note (papier avec lignes) */}
        <Path
          x={padX} y={(h - iconSize) / 2}
          data="M3 3h12v18H3V3zm2 4h8v1H5V7zm0 3h8v1H5v-1zm0 3h6v1H5v-1z"
          fill={color.text}
          scaleX={iconSize / 24}
          scaleY={iconSize / 24}
          listening={false}
          opacity={0.85}
        />
        <Text
          x={padX + iconSize + 6}
          y={0}
          width={Math.max(20, w - padX - iconSize - 12)}
          height={h}
          text={annotationText}
          fontSize={Math.min(11, Math.max(8, h * 0.48))}
          fontStyle="500"
          fontFamily='"DM Sans", "Inter", system-ui, sans-serif'
          fill={color.text}
          align="left"
          verticalAlign="middle"
          listening={false}
          ellipsis
          wrap="none"
          opacity={0.95}
        />
        {sectionBadge}
      </Group>
    )
  }

  // Pièce jointe : icône paperclip + texte "Joindre fichier"
  if (isAttachment) {
    const iconSize = Math.min(h * 0.55, 18)
    const padX = 8
    return (
      <Group {...baseGroupProps}>
        <Rect
          x={0} y={0} width={w} height={h}
          fill={color.fill}
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          dash={isSelected ? undefined : [4, 3]}
          cornerRadius={cornerRadius}
        />
        <Path
          x={padX} y={(h - iconSize) / 2}
          data="M21 11.5v3.5a6 6 0 0 1-12 0V6.5a4 4 0 0 1 8 0v8.5a2 2 0 0 1-4 0V7"
          stroke={color.text}
          strokeWidth={1.5}
          scaleX={iconSize / 24}
          scaleY={iconSize / 24}
          listening={false}
        />
        <Text
          x={padX + iconSize + 6}
          y={0}
          width={Math.max(20, w - padX - iconSize - 12)}
          height={h}
          text="Joindre fichier"
          fontSize={Math.min(12, Math.max(9, h * 0.4))}
          fontStyle="600"
          fontFamily='"DM Sans", "Inter", system-ui, sans-serif'
          fill={color.text}
          align="left"
          verticalAlign="middle"
          listening={false}
          ellipsis
          wrap="none"
        />
        {sectionBadge}
      </Group>
    )
  }

  // Text / Date / Select / Number / Identity / Email / Company / Title / Formula
  const isReadOnly = field.readOnly === true
  return (
    <Group {...baseGroupProps}>
      <Rect
        x={0} y={0} width={w} height={h}
        fill={color.fill}
        stroke={color.stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        cornerRadius={cornerRadius}
        opacity={isReadOnly ? 0.7 : 1}
        // v2.2.4 — Ombre subtile au hover/select pour effet "élévation" DocuSeal-like
        shadowColor={isSelected || isHovered ? color.stroke : undefined}
        shadowBlur={isSelected ? 8 : isHovered ? 4 : 0}
        shadowOpacity={isSelected ? 0.35 : isHovered ? 0.2 : 0}
        shadowOffsetY={isSelected ? 2 : isHovered ? 1 : 0}
      />
      <Text
        x={6}
        y={0}
        width={Math.max(10, w - 12 - (isSelect ? 14 : 0))}
        height={h}
        text={field.defaultValue && field.defaultValue.trim() ? field.defaultValue : placeholder}
        fontSize={fontSize}
        // v2.2.4 — Si l'admin a configuré bold/italic via panneau Formatage : applique-les
        fontStyle={
          field.bold || field.italic
            ? `${field.bold ? 'bold' : ''} ${field.italic ? 'italic' : ''}`.trim()
            : (field.defaultValue ? '600' : '500')
        }
        fontFamily={field.font ? `"${field.font}", "DM Sans", system-ui, sans-serif` : '"DM Sans", "Inter", system-ui, sans-serif'}
        fill={customTextColor || color.text}
        textDecoration={field.underline ? 'underline' : undefined}
        align="left"
        verticalAlign="middle"
        listening={false}
        ellipsis
        wrap="none"
        opacity={field.defaultValue ? 0.9 : 0.7}
      />
      {isSelect && (
        <Text
          x={w - 14}
          y={0}
          width={12}
          height={h}
          text="▾"
          fontSize={Math.min(12, h * 0.6)}
          fontStyle="700"
          fontFamily='"DM Sans", system-ui, sans-serif'
          fill={color.text}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
      {field.required && !isReadOnly && (
        <Rect
          x={w - 4}
          y={2}
          width={3}
          height={3}
          fill="#EF4444"
          cornerRadius={1.5}
          listening={false}
        />
      )}
      {isReadOnly && (
        <Path
          x={w - 12} y={2}
          data="M2 5a3 3 0 1 1 6 0v2H7V5a2 2 0 1 0-4 0v2H2V5zM1 8h8v6H1V8z"
          fill={color.text}
          scaleX={0.5} scaleY={0.5}
          listening={false}
          opacity={0.7}
        />
      )}
      {sectionBadge}
    </Group>
  )
}
