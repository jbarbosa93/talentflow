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

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PenLine, Check, Paperclip, X } from 'lucide-react'
import type { SignField, SignFieldType, SignAttachmentValue } from '@/lib/sign/types'
import { formatDate } from '@/lib/sign/pdf-stamp'
import { effectiveCheckedState, effectiveFieldState, computeFormulaValue, formatFormulaValue, looksLikePhoneField, isCandidatePhoneField } from '@/lib/sign/field-helpers'
import AttachmentField from './AttachmentField'

interface Props {
  page: number
  sizePx: { width: number; height: number }
  /** v2.2.3 Pack 1 — TOUS les fields du document (filtrage par rôle géré ici).
   *  Avant : seulement ceux du recipient courant → le client ne voyait pas les valeurs candidat. */
  fields: SignField[]
  values: Record<string, unknown>    // fieldId → value (inclut les valeurs des signers précédents)
  onValueChange: (fieldId: string, value: unknown) => void
  signatureDataUrl: string | null
  onRequestSignature: (force?: boolean) => void     // ouvre le SignaturePad
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
    /** v2.7.6 — Téléphone candidat (number avec autoFillSource='phone') */
    telephone?: string
  }
  /** v2.2.0 — id du champ "courant" (highlight pulsant + auto-focus). */
  currentFieldId?: string | null
  /** v2.2.0 — registre des refs pour permettre au parent de scroller au field. */
  registerFieldEl?: (fieldId: string, el: HTMLDivElement | null) => void
  /** v2.6.2 — Map fieldId → raison de blocage (hors mission / déjà déclaré ailleurs).
   *  Le field est rendu grisé/read-only avec tooltip explicatif. */
  blockedFields?: Map<string, { type: 'out_of_mission' | 'already_declared' | 'arret'; message: string; clientName?: string }>
  /** v2.7.3 — Set fieldIds verrouillés en read-only même si appartiennent au signer courant.
   *  Cas usage : fields date auto-fill (Lundi/Mardi/.../Semaine N°) pilotés par
   *  le sélecteur de semaine en haut → l'utilisateur ne doit pas pouvoir les modifier.
   *  Affichage : valeur formatée selon dateFormat (vs input date natif qui ignore le format). */
  lockedFields?: Set<string>
  /** v2.9.23 — Token de signature, requis pour les champs pièce jointe (upload). */
  token?: string
}

export default function PublicFieldsLayer({
  page, sizePx, fields, values, onValueChange,
  signatureDataUrl, onRequestSignature, recipientColor, autoFill,
  currentFieldId, registerFieldEl,
  currentRecipientOrder, previousSignerNames,
  blockedFields, lockedFields, token,
}: Props) {
  // v2.9.22 — Applique aussi les conditions show/hide via effectiveFieldState.
  // Avant : seul `metadata.hidden` (flag statique) était pris en compte → les
  // règles conditionnelles « masquer si X » / « afficher si X » ne marchaient
  // PAS en Mode Document (elles ne marchaient qu'en Mode Wizard). Cohérence
  // totale entre les 2 modes maintenant.
  const visible = fields.filter(f =>
    f.page === page
    && !f.metadata?.hidden
    && effectiveFieldState(f, values).visible
  )
  const curOrder = currentRecipientOrder ?? 1

  // v2.7.6 — Wrapper appliquant les règles de groupe checkbox (radio-like si max=1,
  // refuse si déjà au max). Cohérent avec SignWizard.
  const handleValueChange = (fieldId: string, value: unknown) => {
    const target = fields.find(f => f.id === fieldId)
    if (!target || target.type !== 'checkbox' || !target.groupId || value !== true) {
      onValueChange(fieldId, value)
      return
    }
    const rule = target.groupRule
    const groupId = target.groupId
    const max = rule === 'SelectExactly' ? (target.groupMin ?? target.groupMax ?? 1)
      : rule === 'SelectAtMost' ? (target.groupMax ?? 1)
      : null
    const siblings = fields.filter(f => f.groupId === groupId && f.id !== fieldId)
    if (max === 1) {
      for (const s of siblings) {
        const curr = values[s.id]
        if (curr === true || curr === 'true') onValueChange(s.id, false)
      }
      onValueChange(fieldId, true)
      return
    }
    if (max !== null && max > 1) {
      let checkedCount = 0
      for (const s of siblings) {
        const curr = values[s.id]
        if (curr === true || curr === 'true') checkedCount++
      }
      if (checkedCount + 1 > max) return
    }
    onValueChange(fieldId, value)
  }

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
        // v2.8.0 — Avant : `f.recipientOrder || 1` traitait 0 comme falsy →
        // fields avec recipientOrder=0 devenaient 1 → mismatch avec curOrder
        // et le 1er destinataire voyait tous les fields. Maintenant : ?? 1.
        const fieldOrder = f.recipientOrder ?? 1
        const belongsToCurrent = fieldOrder === curOrder
        const belongsToPrevious = fieldOrder < curOrder
        const belongsToFuture = fieldOrder > curOrder
        if (belongsToFuture) return null  // ne rend pas les fields des futurs signers
        const filledBy = previousSignerNames?.[f.id]
        // v2.6.2 — Field bloqué (hors mission / déjà déclaré chez autre entreprise)
        const blockReason = blockedFields?.get(f.id)
        const isBlocked = !!blockReason && belongsToCurrent
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
          // v2.6.2 — Fields bloqués : opacity réduite + curseur not-allowed
          opacity: belongsToPrevious ? 0.95 : isBlocked ? 0.55 : 1,
          pointerEvents: belongsToPrevious || isBlocked ? 'none' : 'auto',
        }
        const titleText = belongsToPrevious && filledBy
          ? `Rempli par ${filledBy}`
          : isBlocked
            ? blockReason!.message
            : undefined
        return (
          <div
            key={f.id}
            ref={el => { registerFieldEl?.(f.id, el) }}
            style={wrapperStyle}
            data-field-id={f.id}
            data-blocked={isBlocked || undefined}
            title={titleText}
          >
            {isBlocked ? (
              <BlockedFieldDisplay reason={blockReason!} widthPx={w} heightPx={h} />
            ) : (
              <FieldInput
                field={f}
                value={values[f.id]}
                onChange={v => belongsToCurrent ? handleValueChange(f.id, v) : undefined}
                signatureDataUrl={signatureDataUrl}
                onRequestSignature={onRequestSignature}
                recipientColor={recipientColor}
                autoFill={autoFill}
                widthPx={w}
                heightPx={h}
                isCurrent={isCurrent}
                forceReadOnly={belongsToPrevious || !!lockedFields?.has(f.id)}
                allValues={values}
                token={token}
              />
            )}
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
  onRequestSignature: (force?: boolean) => void
  recipientColor: { stroke: string; fill: string; text: string }
  autoFill: Props['autoFill']
  widthPx: number
  heightPx: number
  isCurrent?: boolean
  /** v2.2.3 Pack 1 — Force le champ en lecture seule (rendu seulement la valeur, sans input).
   *  Utilisé pour afficher les valeurs remplies par les signers précédents. */
  forceReadOnly?: boolean
  /** v2.7.7 — Toutes les valeurs courantes (pour évaluer les conditions check/uncheck) */
  allValues?: Record<string, unknown>
  /** v2.9.23 — Token de signature, requis pour les champs pièce jointe (upload). */
  token?: string
}

function FieldInput({
  field, value, onChange, signatureDataUrl, onRequestSignature,
  recipientColor, autoFill, widthPx, heightPx, isCurrent, forceReadOnly, allValues, token,
}: FieldInputProps) {
  const t = field.type as SignFieldType
  const isRequired = !!field.required
  const isFilled = isFieldFilled(field, value, signatureDataUrl, autoFill)
  const isAutoFill = isAutoFillType(t)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false)

  // v2.5.1 — FIX CRITICAL : useEffect doit être appelé AVANT tout early return,
  // sinon les Rules of Hooks sont violées (l'ordre des hooks change quand
  // forceReadOnly bascule true→false → React crash "Rendered fewer hooks").
  // C'est ce qui causait l'erreur "Application error: a client-side exception"
  // au clic sur "Modifier les données" côté client.
  useEffect(() => {
    if (forceReadOnly) return
    if (isCurrent && inputRef.current) {
      try { inputRef.current.focus({ preventScroll: true }) } catch { /* */ }
    }
  }, [isCurrent, forceReadOnly])

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
      // v2.9.22 — Formule : valeur calculée (jamais stockée → on recalcule)
      if (t === 'formula') {
        const c = allValues ? computeFormulaValue(field, allValues) : null
        return <span>{formatFormulaValue(field, c) || '0'}</span>
      }
      // v2.9.23 — Pièce jointe (signataire précédent) : nombre de fichiers chargés
      if (t === 'attachment') {
        const c = (value as { files?: unknown[] } | undefined)?.files?.length || 0
        return <span style={{ fontSize: 10, color: '#15803D' }}>📎 {c} fichier{c > 1 ? 's' : ''}</span>
      }
      if (value === undefined || value === null || value === '') return null
      // v2.3.12 Bug 1 — Format date ISO → format configuré dans le template
      // (jj.mm court suisse = "04.05" / dd.MM.yyyy = "04.05.2026" / etc.)
      // Réutilise formatDate de pdf-stamp pour cohérence avec le PDF stampé.
      if (t === 'date' && typeof value === 'string') {
        return <span>{formatDate(value, field.dateFormat)}</span>
      }
      return <span>{String(value)}</span>
    })()
    // v2.5.1 — Affichage épuré pour les fields déjà remplis : juste la valeur
    // en texte, sans cadre vert ni fond. Le PDF de fond montre déjà la grille
    // du contrat, pas besoin de doubler avec un rectangle vert. Plus propre.
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        padding: '2px 4px',
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

  // v2.5.1 — useEffect d'auto-focus déplacé EN HAUT du composant (avant le
  // early return forceReadOnly) pour respecter les Rules of Hooks.

  // Indicateur "rempli" : bordure verte ; "requis non rempli" : bordure rouge ; sinon couleur destinataire
  const borderColor = isFilled
    ? '#15803D'
    : isRequired
      ? '#DC2626'
      : recipientColor.stroke
  const bgColor = isFilled ? 'rgba(34,197,94,0.10)' : recipientColor.fill

  // Tooltip : SEULEMENT si défini explicitement par l'admin (pas fallback sur label).
  // Affiché au focus / clic sur le champ.
  // v2.4.0 — helpText (annotation visible inline en mode Wizard) est aussi affiché
  // ici dans la bubble — concatène avec tooltip si les 2 existent.
  const helpTextRaw = (field.helpText || '').trim()
  const tooltipRaw = (field.tooltip || '').trim()
  const tooltipText = [helpTextRaw, tooltipRaw].filter(Boolean).join(' — ')
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
          onClick={() => onRequestSignature(true)}
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
          onClick={() => onRequestSignature()}
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
    // v2.7.7 — Auto-check si conditions match et pas de valeur explicite candidat
    const userExplicit = value === true || value === false || value === 'true' || value === 'false'
    const autoChecked = !userExplicit && allValues ? effectiveCheckedState(field, allValues) : undefined
    const checked = userExplicit
      ? (value === true || value === 'true')
      : (autoChecked !== undefined ? autoChecked : (field.metadata?.selected === true))
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
  // v2.7.6 — Par défaut MODIFIABLE (le candidat peut corriger). Verrouillé en lecture
  // seule uniquement si `autoFillLocked === true`.
  if (isAutoFill) {
    const autoValue = getAutoFillValue(t, autoFill, value)
    if (field.autoFillLocked) {
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
    const inputValue = typeof value === 'string' && value.length > 0 ? value : autoValue
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <input
          ref={el => { inputRef.current = el }}
          type={t === 'email' ? 'email' : 'text'}
          value={inputValue}
          onChange={e => onChange(e.target.value)}
          onFocus={showOnFocus}
          onBlur={hideOnBlur}
          placeholder={autoValue}
          style={{
            width: '100%', height: '100%',
            border: '1px solid #15803D',
            borderRadius: 2,
            fontSize: Math.min(heightPx * 0.55, 13),
            padding: '0 6px',
            background: 'rgba(34,197,94,0.06)',
            color: '#1C1A14',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        {tooltipBubble}
      </div>
    )
  }

  // ─── PIÈCE JOINTE ───
  // v2.9.23 — Box compacte sur le PDF → ouvre un modal avec le widget de chargement.
  if (t === 'attachment') {
    const attVal = (value && typeof value === 'object' && 'files' in (value as object))
      ? (value as SignAttachmentValue)
      : undefined
    const count = attVal?.files?.length || 0
    const done = count > 0
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <button
          type="button"
          onClick={() => setAttachmentModalOpen(true)}
          onMouseEnter={showOnFocus}
          onMouseLeave={hideOnBlur}
          style={{
            width: '100%', height: '100%',
            background: done ? 'rgba(34,197,94,0.10)' : bgColor,
            border: `1.5px ${done ? 'solid' : 'dashed'} ${done ? '#15803D' : borderColor}`,
            borderRadius: 3, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            fontSize: Math.min(heightPx * 0.4, 11), fontWeight: 700,
            color: done ? '#15803D' : recipientColor.text,
          }}
        >
          <Paperclip size={Math.min(heightPx * 0.5, 13)} />
          {done ? `${count} fichier${count > 1 ? 's' : ''}` : 'Joindre'}
        </button>
        {tooltipBubble}
        {attachmentModalOpen && typeof document !== 'undefined' && createPortal(
          <div
            onClick={() => setAttachmentModalOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <div onClick={e => e.stopPropagation()} style={{
              width: 'min(460px, 95vw)', background: '#fff', borderRadius: 14,
              overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '16px 18px', borderBottom: '1px solid #E5E7EB',
              }}>
                <Paperclip size={16} style={{ color: '#A16207' }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#1C1A14' }}>
                  {field.tooltip || field.label || 'Pièce jointe'}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachmentModalOpen(false)}
                  style={{
                    width: 30, height: 30, borderRadius: 7, border: '1px solid #E5E7EB',
                    background: '#fff', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={15} />
                </button>
              </div>
              <div style={{ padding: 18 }}>
                <AttachmentField field={field} value={attVal} onChange={v => onChange(v)} token={token} />
              </div>
              <div style={{ padding: '12px 18px', borderTop: '1px solid #E5E7EB', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => setAttachmentModalOpen(false)}
                  style={{
                    padding: '8px 16px', background: '#1C1A14', color: '#EAB308',
                    border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Terminé
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>
    )
  }

  // ─── FORMULE (calcul automatique, lecture seule) ───
  // v2.9.22 — Avant : `formula` tombait dans le fallback input texte → le
  // candidat voyait un champ éditable et pouvait écraser le calcul. Maintenant :
  // affiché en lecture seule, vert, valeur calculée — cohérent avec le Mode Wizard.
  if (t === 'formula') {
    const computed = allValues ? computeFormulaValue(field, allValues) : null
    const formatted = formatFormulaValue(field, computed)
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'rgba(34,197,94,0.10)',
        border: '1px solid #15803D',
        borderRadius: 2,
        fontSize: Math.min(heightPx * 0.6, 13),
        color: '#15803D',
        fontWeight: 700,
        padding: '0 6px',
        display: 'flex', alignItems: 'center',
        fontFamily: 'inherit',
        fontVariantNumeric: 'tabular-nums',
        position: 'relative',
      }}>
        {formatted || '0'}
        {tooltipBubble}
      </div>
    )
  }

  // ─── TEXT / NUMBER (par défaut) ───
  const isNumber = t === 'number'
  // v2.9.28 — Détection téléphone élargie : autoFillSource='phone' OU libellé
  // (« Tél. portable », « Natel »…) → input tel (format + espaces accepté).
  const isPhoneNumber = looksLikePhoneField(field)
  // v2.9.58 — Pré-remplissage tél candidat UNIQUEMENT si le flag explicite
  // `autoFillCandidatePhone` est coché (ou matche heuristique en rétrocompat).
  // Avant : tous les champs téléphone étaient pré-remplis → Tél urgence /
  // conjoint recevaient aussi le tél du candidat.
  const usesCandidatePhone = isCandidatePhoneField(field)
  const phoneAutoValue = usesCandidatePhone ? (autoFill.telephone || '') : ''
  const stringValue = value !== undefined && value !== null
    ? String(value)
    : phoneAutoValue
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <input
        ref={el => { inputRef.current = el }}
        type={isPhoneNumber ? 'tel' : (isNumber ? 'number' : 'text')}
        inputMode={isPhoneNumber ? 'tel' : (isNumber ? 'decimal' : 'text')}
        value={stringValue}
        onChange={e => {
          const v = e.target.value
          if (isPhoneNumber) onChange(v)
          else if (isNumber) onChange(v ? Number(v) : v)
          else onChange(v)
        }}
        onFocus={showOnFocus}
        onBlur={hideOnBlur}
        readOnly={!!field.readOnly}
        maxLength={field.maxLength}
        placeholder={phoneAutoValue || field.defaultValue || ''}
        style={{
          width: '100%', height: '100%',
          // v2.9.44 — iOS : sans ces 4 props, l'input garde une hauteur minimale
          // intrinsèque et déborde sa cellule sur les petits champs (rapport mobile).
          minHeight: 0,
          boxSizing: 'border-box',
          WebkitAppearance: 'none',
          appearance: 'none',
          margin: 0,
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
// v2.6.2 — Affichage d'un field bloqué (hors mission / déjà déclaré ailleurs)
// Remplace l'input par un overlay grisé avec hachures discrètes + petit icône cadenas.
function BlockedFieldDisplay({
  reason, widthPx, heightPx,
}: {
  reason: { type: 'out_of_mission' | 'already_declared' | 'arret'; message: string; clientName?: string }
  widthPx: number
  heightPx: number
}) {
  // Pattern hachuré pour faire ressortir le blocage (similaire à un "disabled" visuel)
  const stripes = 'repeating-linear-gradient(45deg, rgba(0,0,0,0.04) 0 6px, rgba(0,0,0,0.08) 6px 12px)'
  const small = Math.min(widthPx, heightPx) < 26
  return (
    <div style={{
      width: '100%', height: '100%',
      background: stripes,
      border: '1px dashed #9CA3AF',
      borderRadius: 3,
      display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      cursor: 'not-allowed',
      overflow: 'hidden',
    }}>
      {!small && (
        <span style={{
          fontSize: Math.max(8, Math.min(10, heightPx * 0.42)),
          color: '#6B7280',
          fontWeight: 600,
          padding: '0 4px',
          textAlign: 'center',
          lineHeight: 1.15,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '95%',
        }}>
          🔒 {reason.type === 'out_of_mission' ? 'Hors mission' : reason.type === 'arret' ? 'Arrêt' : `Chez ${reason.clientName || 'autre'}`}
        </span>
      )}
    </div>
  )
}

function FocusTooltipBubble({ text }: { text: string }) {
  // v2.9.57 — Flip auto : si la bulle déborde par le haut du viewport
  // (champ en haut de page → pas la place au-dessus), on bascule en bas.
  const ref = useRef<HTMLDivElement | null>(null)
  const [flip, setFlip] = useState(false)
  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    // Si la bulle déborde le bord supérieur du viewport (< 8px) → flip
    if (rect.top < 8) setFlip(true)
  }, [text])
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        ...(flip
          ? { top: 'calc(100% + 6px)' }
          : { bottom: 'calc(100% + 6px)' }),
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
        ...(flip
          ? { top: -4 }  // flèche pointe vers le haut (vers le champ au-dessus)
          : { bottom: -4 }),  // flèche pointe vers le bas (vers le champ en dessous)
        left: '50%',
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
  allValues?: Record<string, unknown>,
): boolean {
  const t = f.type
  if (t === 'signature' || t === 'initial') return !!signatureDataUrl
  if (t === 'checkbox') {
    if (value === true || value === 'true' || value === false || value === 'false') return true
    if (allValues) {
      const auto = effectiveCheckedState(f, allValues)
      if (auto !== undefined) return true
    }
    return f.metadata?.selected === true
  }
  if (t === 'annotation') return true // toujours "rempli" (informatif)
  if (t === 'formula') return true // calcul auto
  // v2.9.23 — Pièce jointe : remplie si au moins un fichier chargé
  if (t === 'attachment') {
    const v = value as { files?: unknown[] } | undefined
    return !!v && Array.isArray(v.files) && v.files.length > 0
  }
  if (isAutoFillType(t)) {
    const auto = getAutoFillValue(t, autoFill, value)
    return !!auto && auto.trim() !== ''
  }
  if (t === 'date' && f.metadata?.tabType === 'datesigned') return !!autoFill.today
  // v2.7.6 — Numéro avec source phone : rempli si autoFill.telephone existe
  // v2.9.58 — UNIQUEMENT pour les vrais champs candidat (flag explicite ou
  // heuristique). Évite que Tél urgence / conjoint soient considérés comme
  // remplis automatiquement par le tél du candidat.
  if (t === 'number' && isCandidatePhoneField(f) && autoFill.telephone) return true
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
  /** v2.6.2 — Set des fieldIds bloqués (hors mission / déjà déclarés). Exclus de la validation
   *  car ils ne peuvent pas être remplis volontairement par le candidat. */
  blockedFieldIds?: Set<string>,
): boolean {
  // v2.9.22 — Conditions appliquées : un champ caché par condition n'est PAS
  // requis (impossible à remplir) ; le caractère obligatoire suit
  // effectiveFieldState (require/unrequire conditionnels). Cohérent Mode Wizard.
  const requiredFields = fields.filter(f => {
    if (f.metadata?.hidden) return false
    if (f.type === 'annotation') return false
    if (blockedFieldIds?.has(f.id)) return false
    // v2.8.10 — Checkboxes groupées : validées via la règle du groupe (plus bas),
    // pas individuellement (sinon Oui+Non tous requis = impossible).
    if (f.type === 'checkbox' && f.groupId && f.groupRule) return false
    const eff = effectiveFieldState(f, values)
    if (!eff.visible) return false
    return eff.required
  })
  // Aussi : tous les champs signature/initial visibles doivent avoir une signature globale
  const hasSignatureField = fields.some(f =>
    (f.type === 'signature' || f.type === 'initial')
    && !f.metadata?.hidden
    && effectiveFieldState(f, values).visible
  )
  if (hasSignatureField && !signatureDataUrl) return false
  if (!requiredFields.every(f => isFieldFilled(f, values[f.id], signatureDataUrl, autoFill))) return false

  // v2.8.10 — Validation des groupes de cases : si une case du groupe est dans
  // la liste des fields à valider (= step courant), TOUT le groupe doit respecter sa règle.
  const fieldIdSet = new Set(fields.map(f => f.id))
  const groupsToCheck = new Map<string, { rule?: string; min?: number; max?: number; members: SignField[] }>()
  for (const f of fields) {
    if (f.type !== 'checkbox' || !f.groupId) continue
    if (blockedFieldIds?.has(f.id)) continue
    if (!fieldIdSet.has(f.id)) continue
    // v2.9.22 — Groupe masqué par condition → on ne valide pas sa règle
    if (!effectiveFieldState(f, values).visible) continue
    const g = groupsToCheck.get(f.groupId)
    if (g) g.members.push(f)
    else groupsToCheck.set(f.groupId, { rule: f.groupRule, min: f.groupMin, max: f.groupMax, members: [f] })
  }
  for (const g of groupsToCheck.values()) {
    if (!g.rule) continue
    const checkedCount = g.members.filter(m => values[m.id] === true).length
    if (g.rule === 'SelectExactly' && checkedCount !== (g.min ?? 1)) return false
    if (g.rule === 'SelectAtLeast' && checkedCount < (g.min ?? 1)) return false
    if (g.rule === 'SelectAtMost' && checkedCount > (g.max ?? 1)) return false
  }
  return true
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
