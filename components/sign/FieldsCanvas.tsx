// TalentFlow Sign — Overlay Konva pour placement/édition des champs
// v2.2.0 — Phase 2 (polish DocuSign-like + multi-sélection + fix resize)
'use client'

import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Text, Group, Path } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { SignField, SignFieldType } from '@/lib/sign/types'
import { RECIPIENT_COLORS } from '@/lib/sign/types'

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
}

const DEFAULT_FIELD_SIZE_PCT: Record<SignFieldType, { w: number; h: number }> = {
  // Signature
  signature:  { w: 0.30, h: 0.06 },
  initial:    { w: 0.10, h: 0.05 },
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
  activeTool, activeRecipientOrder, genId,
}: Props) {
  const stageRef = useRef<Konva.Stage>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const selectedSet = new Set(selectedIds)

  const visible = fields.filter(f => f.page === page && !f.metadata?.hidden)

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
        onSelect([])
      }
    }
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

  const handleDragEnd = (id: string, e: KonvaEventObject<DragEvent>) => {
    const node = e.target
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
    onChange(fields.map(ff => ff.id === id ? {
      ...ff,
      width: clamp01(newWPx / width),
      height: clamp01(newHPx / height),
    } : ff))
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
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        cursor: activeTool ? 'crosshair' : 'default',
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
              onClick={ev => handleFieldClick(f.id, ev)}
              onMouseEnter={() => setHoveredId(f.id)}
              onMouseLeave={() => setHoveredId(prev => prev === f.id ? null : prev)}
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
  onClick: (ev: KonvaEventObject<MouseEvent>) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void
  boundW: number
  boundH: number
}

function FieldGroup({
  field, x, y, w, h, color, isSelected, isHovered,
  onClick, onMouseEnter, onMouseLeave, onDragEnd,
  boundW, boundH,
}: FieldGroupProps) {
  const cornerRadius = 3
  const strokeWidth = isSelected ? 1.7 : isHovered ? 1.3 : 1
  const dash = isSelected ? undefined : [3, 2]
  const fontSize = Math.min(13, Math.max(8, h * 0.6))
  const isCheckbox = field.type === 'checkbox'
  // Signature et Paraphe : même rendu visuel (icône stylo + texte), juste placeholder différent
  const isSignature = field.type === 'signature' || field.type === 'initial'
  const isSelect = field.type === 'select'
  const isAnnotation = field.type === 'annotation'
  const isAttachment = field.type === 'attachment'
  const placeholder = PLACEHOLDER[field.type] || ''
  const groupBadge = field.groupId ? (field.groupName || 'G') : null

  const baseGroupProps = {
    x, y,
    draggable: true,
    onClick,
    onTap: onClick as unknown as (e: KonvaEventObject<TouchEvent>) => void,
    onMouseEnter,
    onMouseLeave,
    onDragEnd,
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
      />
      <Text
        x={6}
        y={0}
        width={Math.max(10, w - 12 - (isSelect ? 14 : 0))}
        height={h}
        text={field.defaultValue && field.defaultValue.trim() ? field.defaultValue : placeholder}
        fontSize={fontSize}
        fontStyle={field.defaultValue ? '600' : '500'}
        fontFamily='"DM Sans", "Inter", system-ui, sans-serif'
        fill={field.defaultValue ? color.text : color.text}
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
    </Group>
  )
}
