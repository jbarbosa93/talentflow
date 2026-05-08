// TalentFlow Sign — Overlay HTML interactif sur le PDF (signataire)
// v2.2.0 — Phase 4a-bis (+ guidage SUIVANT + tooltips)
//
// Pour 1 page donnée du PDF, rend les champs cliquables/éditables du destinataire.
// Coords des champs en NORMALISÉ 0-1 → conversion en CSS pixels selon sizePx.
//
// Types de champs gérés :
//  - signature/initial : box cliquable → ouvre SignaturePad (callback parent),
//    affiche image signature si déjà adoptée
//  - text/number       : <input> inline (auto-grow)
//  - email/firstname/lastname/fullname/company/title : auto-fillé + readOnly
//  - date              : <input type="date"> ou pré-rempli "today" pour DocuSign date_signed
//  - checkbox          : toggle
//  - select            : <select> avec listItems
//  - annotation        : juste affiché, non interactif
//  - tabgroup metadata.hidden : ignoré
'use client'

import { useEffect, useRef, useState } from 'react'
import { PenLine, Check } from 'lucide-react'
import type { SignField, SignFieldType } from '@/lib/sign/types'

interface Props {
  page: number
  sizePx: { width: number; height: number }
  /** v2.2.3 Pack 1 — TOUS les fields du document (filtrage par rôle géré ici).
   *  Avant : seulement ceux du recipient courant → le client ne voyait pas les valeurs candidat. */
  fields: SignField[]
  values: Record<string, unknown>    // fieldId → value (inclut les valeurs des signers précédents)
  onValueChange: (fieldId: string, value: unknown) => void
  signatureDataUrl: string | null
  onRequestSignature: () => void     // ouvre le SignaturePad
  recipientColor: { stroke: string; fill: string; text: string }  // pour le rendu
  /** v2.2.3 — Order du destinataire courant (pour distinguer fields éditables vs read-only). */
  currentRecipientOrder?: number
  /** v2.2.3 — Map fieldId → nom du signataire qui l'a rempli (tooltip "Rempli par X"). */
  previousSignerNames?: Record<string, string>
  /**
   * Données auto-fill du destinataire (firstname/lastname/fullname/email).
   * Pré-remplit + readOnly dans le rendu.
   */
  autoFill: {
    firstName: string
    lastName: string
    fullName: string
    email: string
    today: string  // formatted
    /** v2.2.4 — Nom de la société expéditrice (rempli auto pour fields type=company) */
    companyName?: string
    /** v2.2.4 — Fonction/poste candidat (rempli auto pour fields type=title) */
    title?: string
  }
  /** v2.2.0 — id du champ "courant" (highlight pulsant + auto-focus). */
  currentFieldId?: string | null
  /** v2.2.0 — registre des refs pour permettre au parent de scroller au field. */
  registerFieldEl?: (fieldId: string, el: HTMLDivElement | null) => void
}

export default function PublicFieldsLayer({
  page, sizePx, fields, values, onValueChange,
  signatureDataUrl, onRequestSignature, recipientColor, autoFill,
  currentFieldId, registerFieldEl,
  currentRecipientOrder, previousSignerNames,
}: Props) {
  const visible = fields.filter(f => f.page === page && !f.metadata?.hidden)
  const curOrder = currentRecipientOrder ?? 1

  return (
    <>
      {visible.map(f => {
        const x = f.x * sizePx.width
        const y = f.y * sizePx.height
        const w = f.width * sizePx.width
        const h = f.height * sizePx.height
        const isCurrent = currentFieldId === f.id
        // v2.2.3 Pack 1 — Détermine le statut du field :
        //   - belongsToCurrent : field du destinataire courant → éditable
        //   - belongsToPrevious : field d'un destinataire antérieur → read-only avec valeur affichée
        //   - belongsToFuture : field d'un destinataire postérieur → masqué (pas pertinent ici)
        const fieldOrder = f.recipientOrder || 1
        const belongsToCurrent = fieldOrder === curOrder
        const belongsToPrevious = fieldOrder < curOrder
        const belongsToFuture = fieldOrder > curOrder
        if (belongsToFuture) return null  // ne rend pas les fields des futurs signers
        const filledBy = previousSignerNames?.[f.id]
        const wrapperStyle: React.CSSProperties = {
          position: 'absolute',
          left: x, top: y, width: w, height: h,
          // Halo jaune pulsant si champ courant
          boxShadow: isCurrent ? '0 0 0 3px rgba(234,179,8,0.55), 0 0 0 6px rgba(234,179,8,0.18)' : undefined,
          borderRadius: 4,
          transition: 'box-shadow 0.2s',
          animation: isCurrent ? 'tf-sign-pulse 1.5s ease-in-out infinite' : undefined,
          zIndex: isCurrent ? 5 : 1,
          // v2.2.3 — Read-only fields des signers précédents : opacity légèrement réduite
          opacity: belongsToPrevious ? 0.95 : 1,
          pointerEvents: belongsToPrevious ? 'none' : 'auto',
        }
        return (
          <div
            key={f.id}
            ref={el => { registerFieldEl?.(f.id, el) }}
            style={wrapperStyle}
            data-field-id={f.id}
            title={belongsToPrevious && filledBy ? `Rempli par ${filledBy}` : undefined}
          >
            <FieldInput
              field={f}
              value={values[f.id]}
              onChange={v => belongsToCurrent ? onValueChange(f.id, v) : undefined}
              signatureDataUrl={signatureDataUrl}
              onRequestSignature={onRequestSignature}
              recipientColor={recipientColor}
              autoFill={autoFill}
              widthPx={w}
              heightPx={h}
              isCurrent={isCurrent}
              forceReadOnly={belongsToPrevious}
            />
          </div>
        )
      })}
      {/* Animation halo (injectée 1× par overlay, idempotent) */}
      <style jsx global>{`
        @keyframes tf-sign-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(234,179,8,0.55), 0 0 0 6px rgba(234,179,8,0.18); }
          50%      { box-shadow: 0 0 0 4px rgba(234,179,8,0.75), 0 0 0 10px rgba(234,179,8,0.10); }
        }
      `}</style>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// FieldInput — rendu d'1 champ selon son type
// ─────────────────────────────────────────────────────────────────
interface FieldInputProps {
  field: SignField
  value: unknown
  onChange: (value: unknown) => void
  signatureDataUrl: string | null
  onRequestSignature: () => void
  recipientColor: { stroke: string; fill: string; text: string }
  autoFill: Props['autoFill']
  widthPx: number
  heightPx: number
  isCurrent?: boolean
  /** v2.2.3 Pack 1 — Force le champ en lecture seule (rendu seulement la valeur, sans input).
   *  Utilisé pour afficher les valeurs remplies par les signers précédents. */
  forceReadOnly?: boolean
}

function FieldInput({
  field, value, onChange, signatureDataUrl, onRequestSignature,
  recipientColor, autoFill, widthPx, heightPx, isCurrent, forceReadOnly,
}: FieldInputProps) {
  const t = field.type as SignFieldType
  const isRequired = !!field.required
  const isFilled = isFieldFilled(field, value, signatureDataUrl, autoFill)
  const isAutoFill = isAutoFillType(t)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const [tooltipOpen, setTooltipOpen] = useState(false)

  // v2.2.3 Pack 1 — Si forceReadOnly (= field d'un signer précédent),
  // on rend juste la valeur en texte gris, sans input ni bouton signature.
  // C'est ce qui permet au client de VOIR les heures remplies par le candidat.
  if (forceReadOnly) {
    const display = (() => {
      if (t === 'signature' || t === 'initial') {
        if (typeof value === 'string' && value.startsWith('data:image/')) {
          return <img src={value} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        }
        return <span style={{ fontSize: 10, color: '#15803D', fontStyle: 'italic' }}>✓ Signé</span>
      }
      if (t === 'checkbox') {
        return <span style={{ fontSize: Math.min(widthPx, heightPx) * 0.7 }}>{value === true || value === 'true' ? '✓' : ''}</span>
      }
      if (value === undefined || value === null || value === '') return null
      return <span>{String(value)}</span>
    })()
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        padding: '2px 4px',
        background: 'rgba(34,197,94,0.06)',  // léger fond vert = "déjà rempli"
        border: '1px dashed rgba(34,197,94,0.45)',
        borderRadius: 3,
        fontSize: Math.max(9, Math.min(13, heightPx * 0.55)),
        color: '#1C1A14',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}>
        {display}
      </div>
    )
  }

  // Auto-focus quand le champ devient le champ "courant"
  useEffect(() => {
    if (isCurrent && inputRef.current) {
      try { inputRef.current.focus({ preventScroll: true }) } catch { /* */ }
    }
  }, [isCurrent])

  // Indicateur "rempli" : bordure verte ; "requis non rempli" : bordure rouge ; sinon couleur destinataire
  const borderColor = isFilled
    ? '#15803D'
    : isRequired
      ? '#DC2626'
      : recipientColor.stroke
  const bgColor = isFilled ? 'rgba(34,197,94,0.10)' : recipientColor.fill

  // Tooltip : SEULEMENT si défini explicitement par l'admin (pas fallback sur label).
  // Affiché au focus / clic sur le champ.
  const tooltipText = (field.tooltip || '').trim()
  const tooltipBubble = tooltipText && tooltipOpen
    ? <FocusTooltipBubble text={tooltipText} />
    : null
  const showOnFocus = () => { if (tooltipText) setTooltipOpen(true) }
  const hideOnBlur = () => setTooltipOpen(false)

  // ─── SIGNATURE / INITIAL ───
  if (t === 'signature' || t === 'initial') {
    if (signatureDataUrl) {
      // Affiche la signature adoptée (image) — Option A : globale
      return (
        <div
          style={{
            width: '100%', height: '100%',
            background: '#fff',
            border: `1.5px solid ${borderColor}`,
            borderRadius: 3,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
          }}
          onClick={onRequestSignature}
          title="Cliquer pour modifier la signature"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signatureDataUrl}
            alt="Signature"
            style={{ maxWidth: '92%', maxHeight: '92%', objectFit: 'contain' }}
          />
          <Check
            size={Math.min(widthPx * 0.18, 14)}
            style={{ position: 'absolute', top: 2, right: 2, color: '#15803D' }}
          />
          {tooltipBubble}
        </div>
      )
    }
    // Pas encore signé : box cliquable
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <button
          type="button"
          onClick={onRequestSignature}
          onMouseEnter={showOnFocus}
          onMouseLeave={hideOnBlur}
          onFocus={showOnFocus}
          onBlur={hideOnBlur}
          style={{
            width: '100%', height: '100%',
            background: bgColor,
            border: `1.5px dashed ${borderColor}`,
            borderRadius: 3,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 4,
            padding: 0,
            fontFamily: 'inherit',
            fontSize: Math.min(heightPx * 0.4, 12),
            fontWeight: 700,
            color: recipientColor.text,
          }}
        >
          <PenLine size={Math.min(heightPx * 0.5, 14)} />
          {t === 'initial' ? 'Paraphe' : 'Signer'}
        </button>
        {tooltipBubble}
      </div>
    )
  }

  // ─── CHECKBOX ───
  if (t === 'checkbox') {
    const checked = value === true || value === 'true'
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div
          onClick={() => { onChange(!checked); showOnFocus(); setTimeout(hideOnBlur, 1800) }}
          onMouseEnter={showOnFocus}
          onMouseLeave={hideOnBlur}
          style={{
            width: '100%', height: '100%',
            background: checked ? '#15803D' : bgColor,
            border: `1.5px solid ${checked ? '#15803D' : borderColor}`,
            borderRadius: 2,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {checked && <Check size={Math.min(widthPx * 0.7, 14)} style={{ color: 'white', strokeWidth: 3 }} />}
        </div>
        {tooltipBubble}
      </div>
    )
  }

  // ─── SELECT (liste déroulante) ───
  if (t === 'select') {
    const items = (field.metadata?.listItems as { text: string; value: string }[] | undefined) || []
    const stringValue = typeof value === 'string' ? value : ''
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <select
          ref={el => { inputRef.current = el }}
          value={stringValue}
          onChange={e => onChange(e.target.value)}
          onFocus={showOnFocus}
          onBlur={hideOnBlur}
          style={{
            width: '100%', height: '100%',
            background: bgColor,
            border: `1px solid ${borderColor}`,
            borderRadius: 2,
            fontSize: Math.min(heightPx * 0.55, 13),
            color: stringValue ? '#1C1A14' : recipientColor.text,
            padding: '0 4px',
            fontFamily: 'inherit',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="">— Choisir —</option>
          {items.map((it, i) => (
            <option key={i} value={it.value}>{it.text}</option>
          ))}
        </select>
        {tooltipBubble}
      </div>
    )
  }

  // ─── DATE ───
  if (t === 'date') {
    const stringValue = typeof value === 'string' ? value : ''
    // Si auto-fill (DocuSign date_signed) → pré-rempli + readOnly
    const isAutoSignDate = field.metadata?.tabType === 'datesigned'
    if (isAutoSignDate) {
      return (
        <div style={{
          width: '100%', height: '100%',
          background: 'rgba(34,197,94,0.08)',
          border: `1px solid #15803D`,
          borderRadius: 2,
          fontSize: Math.min(heightPx * 0.55, 12),
          color: '#1C1A14',
          padding: '0 6px',
          display: 'flex', alignItems: 'center',
          fontFamily: 'inherit',
          position: 'relative',
        }}>
          {autoFill.today}
          {tooltipBubble}
        </div>
      )
    }
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <input
          ref={el => { inputRef.current = el }}
          type="date"
          value={stringValue}
          onChange={e => onChange(e.target.value)}
          onFocus={showOnFocus}
          onBlur={hideOnBlur}
          style={{
            width: '100%', height: '100%',
            background: bgColor,
            border: `1px solid ${borderColor}`,
            borderRadius: 2,
            fontSize: Math.min(heightPx * 0.55, 12),
            color: '#1C1A14',
            padding: '0 4px',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        {tooltipBubble}
      </div>
    )
  }

  // ─── ANNOTATION ───
  if (t === 'annotation') {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'rgba(245,158,11,0.10)',
        border: '1px dashed rgba(245,158,11,0.4)',
        borderRadius: 2,
        fontSize: Math.min(heightPx * 0.5, 11),
        color: '#A16207',
        padding: '2px 6px',
        display: 'flex', alignItems: 'center',
        fontFamily: 'inherit',
        fontStyle: 'italic',
        lineHeight: 1.2,
        overflow: 'hidden',
      }}>
        {field.label}
      </div>
    )
  }

  // ─── AUTO-FILL (firstname / lastname / fullname / email / company / title) ───
  if (isAutoFill) {
    const autoValue = getAutoFillValue(t, autoFill, value)
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid #15803D',
        borderRadius: 2,
        fontSize: Math.min(heightPx * 0.55, 13),
        color: '#1C1A14',
        padding: '0 6px',
        display: 'flex', alignItems: 'center',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        position: 'relative',
      }}>
        {autoValue || (
          <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>—</span>
        )}
        {tooltipBubble}
      </div>
    )
  }

  // ─── TEXT / NUMBER (par défaut) ───
  const isNumber = t === 'number'
  const stringValue = value !== undefined && value !== null ? String(value) : ''
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <input
        ref={el => { inputRef.current = el }}
        type={isNumber ? 'number' : 'text'}
        value={stringValue}
        onChange={e => onChange(isNumber && e.target.value ? Number(e.target.value) : e.target.value)}
        onFocus={showOnFocus}
        onBlur={hideOnBlur}
        readOnly={!!field.readOnly}
        maxLength={field.maxLength}
        placeholder={field.defaultValue || ''}
        style={{
          width: '100%', height: '100%',
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: 2,
          fontSize: Math.min(heightPx * 0.55, 13),
          color: '#1C1A14',
          padding: '0 6px',
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      {tooltipBubble}
    </div>
  )
}

// ─── FocusTooltipBubble ─────────────────────────────────────────
// Bulle d'aide ancrée au-dessus du champ, affichée tant que le champ a le focus
// (ou est cliqué/tapé). Pas d'icône ⓘ visible — invisible jusqu'à interaction.
function FocusTooltipBubble({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        minWidth: 140,
        maxWidth: 260,
        background: '#1C1A14',
        color: '#fff',
        padding: '8px 11px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.45,
        boxShadow: '0 4px 16px rgba(0,0,0,0.30)',
        pointerEvents: 'none',
        whiteSpace: 'normal',
        zIndex: 50,
        textAlign: 'center',
      }}
    >
      {text}
      <div style={{
        position: 'absolute',
        bottom: -4, left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: 8, height: 8,
        background: '#1C1A14',
      }} />
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function isAutoFillType(t: SignFieldType): boolean {
  return t === 'firstname' || t === 'lastname' || t === 'fullname' ||
    t === 'email' || t === 'company' || t === 'title'
}

function getAutoFillValue(t: SignFieldType, af: Props['autoFill'], explicit: unknown): string {
  if (typeof explicit === 'string' && explicit.trim()) return explicit
  switch (t) {
    case 'firstname': return af.firstName
    case 'lastname':  return af.lastName
    case 'fullname':  return af.fullName
    case 'email':     return af.email
    case 'company':   return af.companyName || ''
    case 'title':     return af.title || ''
    default:          return typeof explicit === 'string' ? explicit : ''
  }
}

function isFieldFilled(
  f: SignField,
  value: unknown,
  signatureDataUrl: string | null,
  autoFill: Props['autoFill'],
): boolean {
  const t = f.type
  if (t === 'signature' || t === 'initial') return !!signatureDataUrl
  if (t === 'checkbox') return value === true || value === 'true'
  if (t === 'annotation') return true // toujours "rempli" (informatif)
  if (t === 'formula') return true // calcul auto
  if (isAutoFillType(t)) {
    const auto = getAutoFillValue(t, autoFill, value)
    return !!auto && auto.trim() !== ''
  }
  if (t === 'date' && f.metadata?.tabType === 'datesigned') return !!autoFill.today
  return value !== undefined && value !== null && String(value).trim() !== ''
}

/**
 * v2.2.0 Phase 4a-bis — Helper exporté : check si TOUS les champs requis du
 * destinataire sont remplis. Utilisé par la page parent pour activer "Terminer".
 */
export function areAllRequiredFieldsFilled(
  fields: SignField[],
  values: Record<string, unknown>,
  signatureDataUrl: string | null,
  autoFill: Props['autoFill'],
): boolean {
  const requiredFields = fields.filter(f =>
    f.required &&
    !f.metadata?.hidden &&
    f.type !== 'annotation'
  )
  // Aussi : tous les champs signature/initial doivent avoir une signature globale
  const hasSignatureField = fields.some(f =>
    (f.type === 'signature' || f.type === 'initial') && !f.metadata?.hidden
  )
  if (hasSignatureField && !signatureDataUrl) return false
  return requiredFields.every(f => isFieldFilled(f, values[f.id], signatureDataUrl, autoFill))
}

/**
 * v2.2.0 Phase 4a-bis — Helper exporté : retourne si UN champ est rempli.
 */
export function isFieldFilledExt(
  f: SignField,
  value: unknown,
  signatureDataUrl: string | null,
  autoFill: { firstName: string; lastName: string; fullName: string; email: string; today: string },
): boolean {
  return isFieldFilled(f, value, signatureDataUrl, autoFill)
}
