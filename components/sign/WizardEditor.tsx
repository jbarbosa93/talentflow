// TalentFlow Sign — Éditeur du Wizard candidat (admin)
// v2.2.0 — Phase 4a-bis-3
//
// Permet à l'admin de :
//   - Toggle wizard_enabled global
//   - Renommer / décrire les étapes
//   - Réordonner les étapes (↑ / ↓)
//   - Fusionner / scinder les étapes
//   - Ajouter une étape vide custom
//   - Supprimer une étape (les fields restent dans documents[], juste pas dans le wizard)
//   - Modifier les fields d'une étape : label (= tooltip), type, required
//   - Modifier les listItems d'un select
//   - Configurer la logique conditionnelle (si X est rempli/coché → afficher/cacher Y)
//   - Re-générer automatiquement les étapes depuis l'algo (efface les modifs manuelles)
//
// State management : copie locale `localSteps` + `localDocuments`, "Enregistrer" persist
// l'ensemble via PATCH /api/sign/templates/[id].
'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
// v2.2.4 fix v4 — dnd-kit (lib moderne, Pointer Events, pas de race condition HTML5)
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
// v2.2.4 — Composant partagé Mode Wizard ↔ Mode Document pour éditer les options Formule
import FieldFormulaOptions from './FieldFormulaOptions'
import {
  Save, Plus, Trash2, ChevronUp, ChevronDown,
  ListChecks, FileText, Loader2, GripVertical, Edit3, X as XIcon,
  Eye, EyeOff, AlertTriangle, Info, Settings2, Sparkles, Smartphone, Copy,
  Users, ArrowRightLeft,
} from 'lucide-react'

const WizardPreview = dynamic(() => import('./WizardPreview'), { ssr: false })
import { toast } from 'sonner'
import type { SignDocument, SignField, SignFieldType, SignFieldCondition, SignRecipientSchema } from '@/lib/sign/types'
import { RECIPIENT_COLORS } from '@/lib/sign/types'
import type { WizardStep, WizardStepAttachment } from '@/lib/sign/wizard-builder'
// v2.7.6 — buildWizardSteps/ForAllRoles supprimés des imports (handleRegenerate retiré).
// Toujours dispo côté serveur si besoin (lib/sign/wizard-builder.ts).

interface Props {
  templateId: string
  // v2.2.2 — État partagé contrôlé par le parent (page.tsx) pour synchroniser
  // les modifications entre Mode Wizard et Mode Document.
  documents: SignDocument[]
  setDocuments: React.Dispatch<React.SetStateAction<SignDocument[]>>
  wizardSteps: WizardStep[]
  setWizardSteps: React.Dispatch<React.SetStateAction<WizardStep[]>>
  wizardEnabled: boolean
  setWizardEnabled: React.Dispatch<React.SetStateAction<boolean>>
  /**
   * v2.2.1 — Schema des rôles du template. Permet le sélecteur multi-rôle.
   * Si vide ou non fourni → mode single-recipient (legacy).
   */
  recipientsSchema: SignRecipientSchema[]
  setRecipientsSchema: React.Dispatch<React.SetStateAction<SignRecipientSchema[]>>
  /** v2.2.2 — Counter incrémenté par le parent à chaque fetch successful. Trigger reset dirty. */
  serverVersion?: number
  /** Pour proposer des défauts de listItems (countries) selon contexte (legacy) */
  recipientOrder?: number
  onSaved?: () => void
}

const FIELD_TYPE_OPTIONS: { value: SignFieldType; label: string }[] = [
  { value: 'text',     label: 'Texte libre' },
  { value: 'number',   label: 'Nombre' },
  { value: 'date',     label: 'Date' },
  { value: 'checkbox', label: 'Case Oui/Non' },
  { value: 'select',   label: 'Liste déroulante' },
  { value: 'formula',  label: 'Formule (calcul auto)' },
  { value: 'firstname', label: 'Prénom (auto-rempli)' },
  { value: 'lastname',  label: 'Nom (auto-rempli)' },
  { value: 'fullname',  label: 'Nom complet (auto-rempli)' },
  { value: 'email',     label: 'Email (auto-rempli)' },
  { value: 'company',   label: 'Société (auto-rempli)' },
  { value: 'title',     label: 'Fonction professionnelle (poste — auto-rempli)' },
  { value: 'signature', label: 'Signature' },
  { value: 'initial',   label: 'Paraphe' },
]

export default function WizardEditor({
  templateId,
  documents, setDocuments,
  wizardSteps: steps, setWizardSteps: setSteps,
  wizardEnabled: enabled, setWizardEnabled: setEnabled,
  recipientsSchema: localSchema, setRecipientsSchema: setLocalSchema,
  serverVersion = 0, recipientOrder = 1, onSaved,
}: Props) {
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  // v2.7.6 — confirmRegen supprimé avec handleRegenerate
  const [enriching, setEnriching] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(true)
  const [rolesPopoverOpen, setRolesPopoverOpen] = useState(false)
  const [orphanModalOpen, setOrphanModalOpen] = useState(false)
  const [locatedFieldId, setLocatedFieldId] = useState<string | null>(null)
  // v2.2.1 — Multi-rôles : déduit les rôles RÉELLEMENT présents dans le template
  // Source de vérité : fields.recipientOrder + steps.recipientOrder (pas le schema
  // legacy qui peut avoir order=0 cassé). Fusionne avec roleName du schema si dispo.
  const allRoles = useMemo<SignRecipientSchema[]>(() => {
    const orders = new Set<number>()
    for (const s of steps) {
      const o = s.recipientOrder ?? 0
      if (o > 0) orders.add(o)
    }
    for (const d of documents) {
      for (const f of (d.fields || [])) {
        if (f.recipientOrder && f.recipientOrder > 0) orders.add(f.recipientOrder)
      }
    }
    // Aussi ajoute les orders du schema local (s'ils sont valides ≥ 1)
    for (const s of localSchema) {
      if (s.order && s.order > 0) orders.add(s.order)
    }
    const sorted = Array.from(orders).sort((a, b) => a - b)
    if (sorted.length === 0) return [{ role: 'signer' as const, order: 1, roleName: undefined }]
    return sorted.map(order => {
      const schemaItem = localSchema.find(s => s.order === order)
      return {
        order,
        role: (schemaItem?.role === 'cc' ? 'cc' : 'signer') as 'signer' | 'cc',
        roleName: schemaItem?.roleName,
      }
    })
  }, [localSchema, steps, documents])
  const [activeRole, setActiveRole] = useState<number>(allRoles[0]?.order ?? 1)

  // Sécurité : si activeRole devient orphelin (ex: après refresh), reset au 1er
  useEffect(() => {
    if (!allRoles.some(r => r.order === activeRole) && allRoles.length > 0) {
      setActiveRole(allRoles[0].order)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRoles])

  // v2.2.2 — Reset dirty quand le parent recharge le template (fetchTemplate après save).
  // serverVersion est incrémenté à chaque fetch successful → side-effect ici.
  useEffect(() => {
    if (serverVersion > 0) setDirty(false)
  }, [serverVersion])

  // Map fieldId → { field, docIdx } pour résolution rapide
  const fieldIndex = useMemo(() => {
    const m = new Map<string, { field: SignField; docIdx: number; fieldIdx: number }>()
    documents.forEach((d, di) => {
      (d.fields || []).forEach((f, fi) => m.set(f.id, { field: f, docIdx: di, fieldIdx: fi }))
    })
    return m
  }, [documents])

  // v2.2.1 — Filtre les fields par rôle ACTIF (pas plus le hardcodé recipientOrder)
  const allRecipientFields = useMemo(() => {
    const out: SignField[] = []
    for (const d of documents) {
      for (const f of (d.fields || [])) {
        if (f.recipientOrder === activeRole) out.push(f)
      }
    }
    return out
  }, [documents, activeRole])

  // v2.2.1 — Steps visibles dans la sidebar = uniquement ceux du rôle actif
  // (les autres restent stockés dans `steps` mais cachés ; le save persiste l'ensemble)
  const visibleSteps = useMemo(() => {
    return steps
      .map((s, originalIdx) => ({ step: s, originalIdx }))
      .filter(({ step }) => (step.recipientOrder ?? 1) === activeRole)
  }, [steps, activeRole])

  // Champs orphelins : présents pour le rôle actif mais dans AUCUN step du wizard.
  // Calcul ici (niveau WizardEditor) pour alimenter le bouton toolbar + modal.
  // v2.7.4 — Avant : on excluait firstname/lastname/fullname/email/signature/initial du
  // compteur (supposés auto-fill et donc pas pertinents en wizard). MAIS dans nos templates
  // importés DocuSign (fiche d'inscription L-Agence), le candidat saisit son Nom et Prénom
  // manuellement → ils doivent apparaître comme orphelins quand pas dans un step. Filtre retiré.
  // Le signature pad est intégré au wizard sans souci (case 'signature' dans SignWizard).
  const allUsedInWizard = useMemo(() => {
    const s = new Set<string>()
    for (const step of steps) for (const fid of step.fieldIds) s.add(fid)
    return s
  }, [steps])
  const orphanFields = useMemo(() => {
    return allRecipientFields.filter(f => !allUsedInWizard.has(f.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRecipientFields, allUsedInWizard])

  const markDirty = () => setDirty(true)

  // ─── v2.2.2 — Gestion des rôles (recipients_schema) ────────────────────
  // upsertRole : si l'order existe déjà → patch, sinon ajoute.
  const upsertRole = (order: number, patch: Partial<SignRecipientSchema>) => {
    setLocalSchema(prev => {
      const idx = prev.findIndex(s => s.order === order)
      if (idx >= 0) {
        const next = prev.slice()
        next[idx] = { ...next[idx], ...patch, order }
        return next
      }
      return [...prev, { role: 'signer', order, ...patch }]
    })
    markDirty()
  }
  const addRole = () => {
    // nouveau order = max(existant) + 1, en tenant compte des fields/steps
    const maxOrder = Math.max(0, ...allRoles.map(r => r.order))
    const nextOrder = maxOrder + 1
    setLocalSchema(prev => [...prev, {
      role: 'signer',
      order: nextOrder,
      roleName: `Rôle ${nextOrder}`,
    }])
    setActiveRole(nextOrder)
    markDirty()
  }
  const deleteRole = (order: number) => {
    if (allRoles.length === 1) {
      toast.error('Au moins un rôle doit exister')
      return
    }
    // Compte les fields qui utilisent ce rôle pour avertir
    let fieldCount = 0
    for (const d of documents) {
      for (const f of (d.fields || [])) {
        if (f.recipientOrder === order) fieldCount++
      }
    }
    const stepCount = steps.filter(s => (s.recipientOrder ?? 1) === order).length
    if ((fieldCount > 0 || stepCount > 0) && !confirm(
      `Supprimer le rôle ${order} ?\n` +
      `Cela retirera aussi ${fieldCount} champ${fieldCount > 1 ? 's' : ''}` +
      ` et ${stepCount} étape${stepCount > 1 ? 's' : ''} qui lui sont assignés.\n` +
      `Cette action n'est pas réversible.`
    )) return
    // Retire du schema
    setLocalSchema(prev => prev.filter(s => s.order !== order))
    // Retire les fields assignés à ce rôle
    if (fieldCount > 0) {
      setDocuments(prev => prev.map(d => ({
        ...d,
        fields: (d.fields || []).filter(f => f.recipientOrder !== order),
      })))
    }
    // Retire les steps assignés à ce rôle
    if (stepCount > 0) {
      setSteps(prev => prev.filter(s => (s.recipientOrder ?? 1) !== order))
    }
    // Reset activeRole si on vient de supprimer celui actif
    if (activeRole === order) {
      const remaining = allRoles.filter(r => r.order !== order)
      if (remaining.length > 0) setActiveRole(remaining[0].order)
    }
    markDirty()
  }

  // ─── Steps actions ───────────────────────────────────────────────────────
  const updateStep = (idx: number, patch: Partial<WizardStep>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
    markDirty()
  }
  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= steps.length) return
    setSteps(prev => {
      const next = prev.slice()
      const [it] = next.splice(idx, 1)
      next.splice(newIdx, 0, it)
      return next
    })
    setSelectedStepIdx(newIdx)
    markDirty()
  }
  const deleteStep = (idx: number) => {
    if (!confirm('Supprimer cette étape ? Les champs ne seront plus dans le wizard, mais restent dans le PDF.')) return
    setSteps(prev => prev.filter((_, i) => i !== idx))
    setSelectedStepIdx(i => Math.max(0, Math.min(i, steps.length - 2)))
    markDirty()
  }
  const addStep = () => {
    const newStep: WizardStep = {
      id: 'wstep_' + Math.random().toString(36).slice(2, 11),
      title: 'Nouvelle étape',
      description: '',
      fieldIds: [],
      docOrder: 1,
      recipientOrder: activeRole,  // v2.2.1 : assigne au rôle actif
    }
    setSteps(prev => [...prev, newStep])
    setSelectedStepIdx(steps.length)
    markDirty()
  }
  const mergeStepWithNext = (idx: number) => {
    if (idx >= steps.length - 1) return
    setSteps(prev => {
      const next = prev.slice()
      const cur = next[idx]
      const nxt = next[idx + 1]
      next[idx] = {
        ...cur,
        fieldIds: [...cur.fieldIds, ...nxt.fieldIds],
        title: cur.title,  // garde le titre de la 1re étape
        description: [cur.description, nxt.description].filter(Boolean).join(' · ') || undefined,
      }
      next.splice(idx + 1, 1)
      return next
    })
    markDirty()
  }
  const splitStep = (idx: number, splitAt: number) => {
    setSteps(prev => {
      const next = prev.slice()
      const cur = next[idx]
      const part1 = cur.fieldIds.slice(0, splitAt)
      const part2 = cur.fieldIds.slice(splitAt)
      next[idx] = { ...cur, fieldIds: part1 }
      const newStep: WizardStep = {
        id: 'wstep_' + Math.random().toString(36).slice(2, 11),
        title: cur.title + ' (suite)',
        fieldIds: part2,
        docOrder: cur.docOrder,
      }
      next.splice(idx + 1, 0, newStep)
      return next
    })
    markDirty()
  }

  // ─── Field actions (modifie documents[]) ───────────────────────────────────
  const updateField = (fieldId: string, patch: Partial<SignField>) => {
    const ref = fieldIndex.get(fieldId)
    if (!ref) return
    setDocuments(prev => {
      const next = prev.slice()
      const doc = { ...next[ref.docIdx] }
      const fields = (doc.fields || []).slice()
      fields[ref.fieldIdx] = { ...fields[ref.fieldIdx], ...patch }
      doc.fields = fields
      next[ref.docIdx] = doc
      return next
    })
    markDirty()
  }
  const moveFieldInStep = (stepIdx: number, fieldIdx: number, dir: -1 | 1) => {
    const newIdx = fieldIdx + dir
    const step = steps[stepIdx]
    if (newIdx < 0 || newIdx >= step.fieldIds.length) return
    const next = step.fieldIds.slice()
    const [it] = next.splice(fieldIdx, 1)
    next.splice(newIdx, 0, it)
    updateStep(stepIdx, { fieldIds: next })
  }
  // v2.2.1 — Drag & drop natif HTML5 : déplace from→to dans le tableau fieldIds
  const reorderFieldInStep = (stepIdx: number, from: number, to: number) => {
    if (from === to) return
    const step = steps[stepIdx]
    if (from < 0 || from >= step.fieldIds.length || to < 0 || to >= step.fieldIds.length) return
    const next = step.fieldIds.slice()
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    updateStep(stepIdx, { fieldIds: next })
  }
  const removeFieldFromStep = (stepIdx: number, fieldId: string) => {
    const step = steps[stepIdx]
    updateStep(stepIdx, { fieldIds: step.fieldIds.filter(id => id !== fieldId) })
  }
  const addFieldToStep = (stepIdx: number, fieldId: string) => {
    const step = steps[stepIdx]
    if (step.fieldIds.includes(fieldId)) return
    // Retire de l'étape précédente s'il y en a
    setSteps(prev => prev.map((s, i) => i === stepIdx
      ? { ...s, fieldIds: [...s.fieldIds, fieldId] }
      : { ...s, fieldIds: s.fieldIds.filter(id => id !== fieldId) },
    ))
    markDirty()
  }
  const deleteFieldsById = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    setDocuments(prev => prev.map(d => ({
      ...d,
      fields: (d.fields || []).filter(f => !idSet.has(f.id)),
    })))
    setSteps(prev => prev.map(s => ({
      ...s,
      fieldIds: s.fieldIds.filter(id => !idSet.has(id)),
    })))
    markDirty()
    toast.success(`${ids.length} champ${ids.length > 1 ? 's supprimés' : ' supprimé'}`)
  }, [setDocuments, setSteps])

  // v2.2.2 — Dupliquer un champ : crée une copie avec nouvel id, conserve toute
  // la config (type, tooltip, required, defaultValue, wizardSection, listItems,
  // conditions, formula, recipientOrder, position page/x/y…).
  // Insère la copie juste après la source dans documents[].fields ET dans
  // step.fieldIds. Position légèrement décalée (10% bas) pour éviter superposition.
  const duplicateFieldInStep = (stepIdx: number, fieldId: string) => {
    const ref = fieldIndex.get(fieldId)
    if (!ref) return
    const source = ref.field
    const newId = 'fld_' + Math.random().toString(36).slice(2, 11)
    // Décale légèrement vers le bas pour ne pas superposer dans Mode Document
    const yOffset = 0.03
    const newY = Math.min(0.95, source.y + yOffset)
    const newField: SignField = {
      ...source,
      id: newId,
      y: newY,
      // Reset groupId : la copie n'hérite pas du groupe (sinon comptage cassé)
      groupId: undefined,
    }
    // 1. Insère le nouveau field dans documents[].fields juste après la source
    setDocuments(prev => {
      const next = prev.slice()
      const doc = { ...next[ref.docIdx] }
      const fields = (doc.fields || []).slice()
      fields.splice(ref.fieldIdx + 1, 0, newField)
      doc.fields = fields
      next[ref.docIdx] = doc
      return next
    })
    // 2. Insère le nouveau fieldId dans le step juste après la source
    setSteps(prev => prev.map((s, i) => {
      if (i !== stepIdx) return s
      const idx = s.fieldIds.indexOf(fieldId)
      if (idx < 0) return s
      const next = s.fieldIds.slice()
      next.splice(idx + 1, 0, newId)
      return { ...s, fieldIds: next }
    }))
    markDirty()
    toast.success('Champ dupliqué')
  }

  // ─── Re-génération auto ─────────────────────────────────────────────────
  // v2.7.6 — handleRegenerate supprimé (cf. audit). Cause de bugs récurrents
  // (dates semaine → step Signature). Remplacé par "Améliorer avec l'IA" qui est
  // plus fiable et utilise Claude Vision pour comprendre le contenu réel du PDF.

  // ─── Enrichir avec l'IA (Claude vision PDF) ───────────────────────────
  const handleEnrichWithAI = async () => {
    if (dirty && !confirm('Tu as des modifications non enregistrées qui seront perdues. Lancer l\'analyse IA quand même ?')) return
    if (!confirm('Analyser le PDF avec Claude IA ? L\'opération prend ~30-60s par document et écrasera la structure actuelle des étapes (les fields restent intacts).')) return
    setEnriching(true)
    try {
      // v2.7.6 — Boucle pagination IA pour templates > 5 docs (3 par batch)
      let totalSteps = 0
      let totalNewFields = 0
      let totalUpdated = 0
      let allErrors: string[] = []
      let nextBatch: number | null = 0
      while (nextBatch !== null) {
        const r: Response = await fetch(`/api/sign/templates/${templateId}/enrich-with-ai?batchStart=${nextBatch}`, { method: 'POST' })
        const d: any = await r.json()
        if (!r.ok) throw new Error(d.error || 'Erreur')
        totalSteps += (d.stepsCount as number) ?? 0
        totalNewFields += (d.newFieldsCount as number) ?? 0
        totalUpdated += (d.fieldUpdatesCount as number) ?? 0
        if (Array.isArray(d.errors)) allErrors.push(...(d.errors as string[]))
        nextBatch = d.status === 'partial' ? (d.nextBatchIndex as number | null) : null
      }
      const parts = [`${totalSteps} étapes`]
      if (totalNewFields > 0) parts.push(`${totalNewFields} champs créés`)
      if (totalUpdated > 0) parts.push(`${totalUpdated} champs enrichis`)
      toast.success(`✨ IA : ${parts.join(' · ')}${allErrors.length ? ` (${allErrors.length} avertissements)` : ''}`)
      onSaved?.()
    } catch (e: any) {
      toast.error(e.message || 'Erreur enrichissement IA')
    } finally {
      setEnriching(false)
    }
  }

  // ─── Save ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      // v2.2.4 — Cleanup : retire les fieldIds orphelins (= ids qui pointent vers
      // des fields supprimés en Mode Document). Évite que le compteur reste à
      // "5 champs" alors que seulement 2 sont rendus.
      const validFieldIds = new Set<string>()
      for (const d of documents) {
        for (const f of (d.fields || [])) validFieldIds.add(f.id)
      }
      const cleanedSteps = steps.map(s => ({
        ...s,
        fieldIds: s.fieldIds.filter(id => validFieldIds.has(id)),
      }))
      const r = await fetch(`/api/sign/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wizard_enabled: enabled,
          wizard_steps: cleanedSteps,
          documents,
          // v2.2.2 — Persiste aussi le schema des rôles édité depuis le toolbar
          recipients_schema: localSchema,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      toast.success('Wizard enregistré')
      setDirty(false)
      // v2.7.6 — Plus de onSaved → fetchTemplate ici : le state local est déjà
      // cohérent avec la DB après PATCH 200. Évite le reload qui faisait
      // disparaître l'aperçu live + casser le scroll/sélection.
    } catch (e: any) {
      toast.error(e.message || 'Erreur enregistrement')
    } finally {
      setSaving(false)
    }
  }

  // v2.2.4 — Mémorise l'id du step actif dans sessionStorage pour permettre au
  // TemplateEditor (Mode Document) de placer les nouveaux fields dans LE BON step
  // (= celui que l'admin était en train de regarder, pas le 1er aveuglément).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = steps[selectedStepIdx]
    if (s?.id) sessionStorage.setItem('sign:active-step-id', s.id)
  }, [selectedStepIdx, steps])

  // v2.2.1 — selectedStepIdx pointe dans `steps` (global), mais on l'expose via visibleSteps
  // Si le step actif n'est plus dans le rôle courant, retombe sur le 1er du rôle
  const selectedStep = steps[selectedStepIdx]
  const selectedStepInActiveRole = selectedStep && (selectedStep.recipientOrder ?? 1) === activeRole

  // Quand on change de rôle : sélectionne le 1er step du nouveau rôle
  useEffect(() => {
    if (!selectedStepInActiveRole && visibleSteps.length > 0) {
      setSelectedStepIdx(visibleSteps[0].originalIdx)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 600 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => { setEnabled(e.target.checked); markDirty() }}
            style={{ width: 18, height: 18, accentColor: '#EAB308', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
            Mode Wizard activé
          </span>
        </label>

        {/* v2.2.2 — Sélecteur de rôle + bouton Gérer (visible toujours, même 1 rôle) */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 6px 4px 10px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 999,
          position: 'relative',
        }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
            Édition pour :
          </span>
          {allRoles.map(r => {
            const palette = RECIPIENT_COLORS[(r.order - 1) % RECIPIENT_COLORS.length]
            const isActive = activeRole === r.order
            const label = r.roleName?.trim() || `Rôle ${r.order}`
            return (
              <button
                key={r.order}
                type="button"
                onClick={() => setActiveRole(r.order)}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  border: '1.5px solid',
                  borderColor: isActive ? palette.stroke : 'transparent',
                  background: isActive ? palette.fill : 'transparent',
                  color: 'var(--foreground)',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
                title={`Éditer les étapes du rôle "${label}" (recipientOrder=${r.order})`}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: palette.stroke, flexShrink: 0,
                }} />
                {label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setRolesPopoverOpen(o => !o)}
            title="Renommer / ajouter / supprimer des rôles"
            style={{
              padding: '4px 10px 4px 8px',
              fontSize: 11.5,
              fontWeight: 600,
              border: '1px dashed var(--border)',
              background: rolesPopoverOpen ? 'var(--card)' : 'transparent',
              color: 'var(--muted)',
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginLeft: 4,
            }}
          >
            <Users size={11} />
            Gérer
          </button>

          {/* Popover gestion des rôles */}
          {rolesPopoverOpen && (
            <RolesManagerPopover
              schema={localSchema}
              allRoles={allRoles}
              onUpsert={upsertRole}
              onAdd={addRole}
              onDelete={deleteRole}
              onClose={() => setRolesPopoverOpen(false)}
              fieldCountsByOrder={(() => {
                const m = new Map<number, number>()
                for (const d of documents) {
                  for (const f of (d.fields || [])) {
                    const o = f.recipientOrder || 1
                    m.set(o, (m.get(o) || 0) + 1)
                  }
                }
                return m
              })()}
            />
          )}
        </div>

        {orphanFields.length > 0 && (
          <button
            type="button"
            onClick={() => setOrphanModalOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px',
              fontSize: 12, fontWeight: 700,
              background: 'rgba(234,179,8,0.12)',
              color: '#A16207',
              border: '1px solid rgba(234,179,8,0.45)',
              borderRadius: 999, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            title={`${orphanFields.length} champ${orphanFields.length > 1 ? 's présents' : ' présent'} dans le PDF mais dans aucune étape du wizard`}
          >
            <AlertTriangle size={12} />
            {orphanFields.length} orphelin{orphanFields.length > 1 ? 's' : ''}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleEnrichWithAI}
          disabled={enriching}
          className="neo-btn-ghost neo-btn-sm"
          style={{ background: 'linear-gradient(90deg, rgba(234,179,8,0.10), rgba(168,85,247,0.10))', color: '#7C3AED', fontWeight: 700 }}
          title="Analyser le PDF avec Claude IA — restructure les étapes, enrichit les labels, ajoute les conditions"
        >
          {enriching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {enriching ? 'Analyse IA…' : 'Améliorer avec l\'IA'}
        </button>
        {/* v2.7.6 — "Re-générer auto" supprimé : 3 chemins (manuel / heuristique / IA)
            créaient de la confusion, et l'heuristique cause des régressions (cf. bug
            dates semaine → step Signature documenté dans wizard-builder.ts).
            Utilise "Améliorer avec l'IA" pour reconstruire la structure. */}
        <button
          type="button"
          onClick={addStep}
          className="neo-btn-ghost neo-btn-sm"
        >
          <Plus size={13} />
          Étape
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen(o => !o)}
          className="neo-btn-ghost neo-btn-sm"
          style={{
            background: previewOpen ? 'var(--primary-soft, #FEF3C7)' : undefined,
            color: previewOpen ? '#A16207' : undefined,
            fontWeight: previewOpen ? 700 : 500,
          }}
          title={previewOpen ? 'Fermer l\'aperçu' : 'Ouvrir l\'aperçu live (mobile/desktop)'}
        >
          <Smartphone size={13} />
          {previewOpen ? 'Fermer aperçu' : 'Aperçu live'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="neo-btn-yellow"
          style={{ opacity: !dirty ? 0.5 : 1, cursor: !dirty ? 'not-allowed' : (saving ? 'wait' : 'pointer') }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Enregistrer{dirty ? ' *' : ''}
        </button>
      </div>

      {!enabled && (
        <div style={{
          padding: '10px 16px',
          background: 'var(--warning-soft, #FEF3C7)',
          color: '#713F12',
          fontSize: 12.5,
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid var(--border)',
        }}>
          <AlertTriangle size={13} />
          Mode wizard désactivé : les candidats verront uniquement le PDF en mode overlay.
        </div>
      )}

      {/* Layout principal : éditeur (steps + detail) + preview optionnel.
          v2.2.4 — overflow:visible pour que le preview sticky fonctionne. */}
      <div style={{ display: 'flex', flex: 1, minHeight: 500, alignItems: 'flex-start' }}>
        {/* Bloc éditeur : steps list + step detail */}
        <div style={{ display: 'flex', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* Sidebar steps list */}
        <aside style={{
          width: 280,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
            Étapes ({visibleSteps.length})
            {allRoles.length > 1 && (
              <span style={{ marginLeft: 6, fontWeight: 500, textTransform: 'none', letterSpacing: 'normal' }}>
                · rôle actif
              </span>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visibleSteps.map(({ step: s, originalIdx: i }) => {
              const isSelected = i === selectedStepIdx
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStepIdx(i)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    background: isSelected ? 'var(--primary-soft, #FEF3C7)' : 'transparent',
                    borderLeft: `3px solid ${isSelected ? '#EAB308' : 'transparent'}`,
                    borderTop: 'none',
                    borderRight: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 999,
                    background: isSelected ? '#EAB308' : 'var(--surface-2, #F3F4F6)',
                    color: isSelected ? '#1C1A14' : 'var(--muted)',
                    display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5,
                      fontWeight: isSelected ? 700 : 500,
                      color: 'var(--foreground)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {s.title}
                    </div>
                    {/* v2.2.4 — Compteur : valides (id existe dans documents) / total fieldIds.
                        Si différent, l'admin sait qu'il y a des références orphelines. */}
                    {(() => {
                      const valid = s.fieldIds.filter(id => fieldIndex.has(id)).length
                      const total = s.fieldIds.length
                      const hasOrphans = valid !== total
                      return (
                        <div style={{
                          fontSize: 10.5,
                          color: hasOrphans ? '#A16207' : 'var(--muted)',
                          marginTop: 1,
                          fontWeight: hasOrphans ? 600 : 'normal',
                        }}>
                          {hasOrphans ? `${valid} / ${total}` : valid} champ{valid > 1 ? 's' : ''}
                          {hasOrphans && ' (⚠️ orphelins)'}
                          {s.isAutoFillStep && ' · auto-fill'}
                          {s.isSignatureStep && ' · signature'}
                        </div>
                      )
                    })()}
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Detail panel */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {!selectedStep ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
              Sélectionnez une étape pour la modifier
            </div>
          ) : (
            <StepDetail
              step={selectedStep}
              stepIdx={selectedStepIdx}
              totalSteps={steps.length}
              allSteps={steps}
              fieldIndex={fieldIndex}
              allRecipientFields={allRecipientFields}
              documents={documents}
              onUpdateStep={(p) => updateStep(selectedStepIdx, p)}
              onMoveStep={(d) => moveStep(selectedStepIdx, d)}
              onDeleteStep={() => deleteStep(selectedStepIdx)}
              onMergeNext={() => mergeStepWithNext(selectedStepIdx)}
              onSplitAt={(at) => splitStep(selectedStepIdx, at)}
              onUpdateField={updateField}
              onMoveFieldInStep={(fi, d) => moveFieldInStep(selectedStepIdx, fi, d)}
              onReorderFieldInStep={(from, to) => reorderFieldInStep(selectedStepIdx, from, to)}
              onRemoveFieldFromStep={(fid) => removeFieldFromStep(selectedStepIdx, fid)}
              onAddFieldToStep={(fid) => addFieldToStep(selectedStepIdx, fid)}
              onDuplicateField={(fid) => duplicateFieldInStep(selectedStepIdx, fid)}
              onMoveFieldToStep={(fid, targetIdx) => addFieldToStep(targetIdx, fid)}
              onDeleteFields={deleteFieldsById}
            />
          )}
        </div>
        </div>
        {/* Panneau preview live (à droite) — v2.2.4 : sticky pour suivre le scroll
            de la page. Reste visible en haut du viewport quand l'admin scroll dans la
            liste des champs/options. */}
        {previewOpen && (
          <div style={{
            width: 480,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'sticky',
            top: 16,
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 32px)',
            // v2.7.6 — Isole le layout pour empêcher tout reflow externe (toolbar dirty=*,
            // changements dans la liste d'étapes, etc.) de bouger visuellement le cadre iPhone.
            // Note : on N'ajoute PAS `willChange: transform` car ça force la compositing GPU
            // et dégrade le rendu sub-pixel des polices à l'intérieur du cadre.
            contain: 'layout style',
          }}>
            <WizardPreview
              steps={steps}
              documents={documents}
              onClose={() => setPreviewOpen(false)}
              syncStepIdx={selectedStepIdx}
              activeRole={activeRole}
            />
          </div>
        )}
      </div>

      {orphanModalOpen && (
        <OrphanFieldsModal
          orphanFields={orphanFields}
          steps={steps}
          locatedFieldId={locatedFieldId}
          onLocate={(id) => setLocatedFieldId(id === locatedFieldId ? null : id)}
          onAddToStep={(fieldId, stepIdx) => { addFieldToStep(stepIdx, fieldId); setLocatedFieldId(null) }}
          onAddAllToStep={(fieldIds, stepIdx) => {
            setSteps(prev => prev.map((s, i) => i === stepIdx
              ? { ...s, fieldIds: [...s.fieldIds, ...fieldIds.filter(id => !s.fieldIds.includes(id))] }
              : s,
            ))
            markDirty()
            toast.success(`${fieldIds.length} champ${fieldIds.length > 1 ? 's ajoutés' : ' ajouté'}`)
          }}
          onDelete={(fieldIds) => {
            const list = orphanFields.filter(f => fieldIds.includes(f.id)).map(f => `• ${f.tooltip || f.label || f.type}`).join('\n')
            if (!confirm(`Supprimer définitivement ${fieldIds.length === 1 ? 'ce champ' : `ces ${fieldIds.length} champs`} du PDF ?\n\n${list}`)) return
            deleteFieldsById(fieldIds)
          }}
          onClose={() => { setOrphanModalOpen(false); setLocatedFieldId(null) }}
        />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// StepDetail — édition d'une étape
// ───────────────────────────────────────────────────────────────────────
interface StepDetailProps {
  step: WizardStep
  stepIdx: number
  totalSteps: number
  /** v2.2.4 — Tous les steps pour calculer les fields orphelins du wizard */
  allSteps: WizardStep[]
  fieldIndex: Map<string, { field: SignField; docIdx: number; fieldIdx: number }>
  allRecipientFields: SignField[]
  documents: SignDocument[]
  onUpdateStep: (p: Partial<WizardStep>) => void
  onMoveStep: (dir: -1 | 1) => void
  onDeleteStep: () => void
  onMergeNext: () => void
  onSplitAt: (at: number) => void
  onUpdateField: (fieldId: string, patch: Partial<SignField>) => void
  onMoveFieldInStep: (fieldIdx: number, dir: -1 | 1) => void
  onReorderFieldInStep: (from: number, to: number) => void
  onRemoveFieldFromStep: (fieldId: string) => void
  onAddFieldToStep: (fieldId: string) => void
  onDuplicateField: (fieldId: string) => void
  /** v2.2.4 — Déplacer un field vers une autre étape du même rôle */
  onMoveFieldToStep: (fieldId: string, targetStepIdx: number) => void
  /** v2.2.4 — Supprimer définitivement des fields de documents[] (= du PDF entièrement) */
  onDeleteFields?: (fieldIds: string[]) => void
}

function StepDetail({
  step, stepIdx, totalSteps, allSteps, fieldIndex, allRecipientFields, documents,
  onUpdateStep, onMoveStep, onDeleteStep, onMergeNext, onSplitAt,
  onUpdateField, onMoveFieldInStep, onReorderFieldInStep, onRemoveFieldFromStep, onAddFieldToStep,
  onDuplicateField, onMoveFieldToStep, onDeleteFields,
}: StepDetailProps) {
  const [showAddPicker, setShowAddPicker] = useState(false)
  // v2.2.4 fix v4 — DnD via dnd-kit (Pointer Events, fiable, pas de race condition).
  // PointerSensor avec activationConstraint distance=8 → click sur input/boutons
  // n'active pas le drag tant que le user n'a pas bougé de 8px.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const stepFields = step.fieldIds.map(id => fieldIndex.get(id)?.field).filter(Boolean) as SignField[]
  const usedIds = new Set(step.fieldIds)
  const availableFields = allRecipientFields.filter(f => !usedIds.has(f.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Step controls */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => onMoveStep(-1)} disabled={stepIdx === 0} className="neo-btn-ghost neo-btn-sm" title="Monter">
          <ChevronUp size={13} />
        </button>
        <button onClick={() => onMoveStep(1)} disabled={stepIdx === totalSteps - 1} className="neo-btn-ghost neo-btn-sm" title="Descendre">
          <ChevronDown size={13} />
        </button>
        <button onClick={onMergeNext} disabled={stepIdx === totalSteps - 1} className="neo-btn-ghost neo-btn-sm" title="Fusionner avec l'étape suivante">
          <ListChecks size={13} />
          Fusionner suivante
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={onDeleteStep} className="neo-btn-ghost neo-btn-sm" style={{ color: '#DC2626' }} title="Supprimer cette étape">
          <Trash2 size={13} />
          Supprimer
        </button>
      </div>

      {/* Step title + description */}
      <div>
        <label style={editLabelStyle}>Titre de l&apos;étape</label>
        <input
          type="text"
          value={step.title}
          onChange={e => onUpdateStep({ title: e.target.value })}
          style={editInputStyle}
          placeholder="Ex : Données personnelles"
        />
      </div>
      {/* v2.4.0 — Note d'étape (description) retirée du UI :
          remplacée par l'annotation par CHAMP (helpText) dans les options du champ.
          Chaque field a maintenant son propre champ "Annotation / Instruction"
          affichée en petit texte gris italique entre le label et l'input. */}

      {/* v2.2.1 — Mode d'affichage des champs (Liste vs Cartes par section) */}
      <div>
        <label style={editLabelStyle}>Mode d&apos;affichage</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DisplayModeBtn
            active={(step.displayMode || 'list') === 'list'}
            onClick={() => onUpdateStep({ displayMode: 'list' })}
            label="Liste"
            description="Champs empilés avec sous-titres si groupés"
          />
          <DisplayModeBtn
            active={step.displayMode === 'cards'}
            onClick={() => onUpdateStep({ displayMode: 'cards' })}
            label="Cartes par section"
            description="1 carte par groupe (ex: 1 carte = 1 jour)"
          />
        </div>
        {(() => {
          const sectionsCount = stepFields.filter(f => f.wizardSection && f.wizardSection.trim()).length
          const totalFields = stepFields.length
          const hasNoSection = totalFields > 0 && sectionsCount === 0
          const isCards = step.displayMode === 'cards'

          if (isCards && hasNoSection) {
            return (
              <div style={{
                marginTop: 8,
                padding: '8px 12px',
                background: 'var(--warning-soft)',
                border: '1px solid rgba(234,179,8,0.35)',
                borderRadius: 8,
                fontSize: 11.5,
                color: '#A16207',
                lineHeight: 1.5,
              }}>
                ⚠️ <strong>Aucun champ n&apos;a de « Section d&apos;affichage »</strong> dans cette étape, donc le mode Cartes affiche la même chose que Liste.
                <br />
                Ouvre les options ⚙️ d&apos;un champ et renseigne une section (ex: « Lundi », « Conjoint »…) pour activer le rendu en cartes.
              </div>
            )
          }
          if (isCards && sectionsCount > 0 && sectionsCount < totalFields) {
            const noSection = totalFields - sectionsCount
            return (
              <div style={{
                marginTop: 8,
                padding: '8px 12px',
                background: 'var(--info-soft)',
                borderRadius: 8,
                fontSize: 11.5,
                color: 'var(--info)',
                lineHeight: 1.5,
              }}>
                ℹ️ {sectionsCount} / {totalFields} champs ont une section. Les {noSection} sans section apparaîtront empilés en haut, hors des cartes.
              </div>
            )
          }
          if (!isCards && sectionsCount > 0) {
            return (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
                💡 {sectionsCount} champ{sectionsCount > 1 ? 's ont' : ' a'} une section — affichés en sous-titres dans la liste.
              </div>
            )
          }
          return (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
              💡 Pour grouper visuellement les champs, renseigne « Section d&apos;affichage » dans les options avancées ⚙️ de chaque champ (ex: « Lundi », « Mardi »…).
            </div>
          )
        })()}
      </div>

      {/* Attachments */}
      <AttachmentsEditor
        attachments={step.attachments || []}
        documents={documents}
        onChange={(a) => onUpdateStep({ attachments: a.length === 0 ? undefined : a })}
      />

      {/* Fields list */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ ...editLabelStyle, marginBottom: 0 }}>Champs ({stepFields.length})</label>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setShowAddPicker(s => !s)}
            className="neo-btn-ghost neo-btn-sm"
          >
            <Plus size={12} />
            Ajouter un champ
          </button>
        </div>
        {showAddPicker && (
          <div style={{
            marginBottom: 10,
            padding: 10,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
            maxHeight: 200,
            overflowY: 'auto',
          }}>
            {availableFields.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                Tous les champs du destinataire sont déjà placés.
              </div>
            ) : availableFields.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => { onAddFieldToStep(f.id); setShowAddPicker(false) }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 4,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2, #F3F4F6)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span className="neo-badge neo-badge-gray" style={{ fontSize: 10 }}>{f.type}</span>
                <span style={{ color: 'var(--foreground)' }}>
                  {f.tooltip || f.label || '—'}
                </span>
              </button>
            ))}
          </div>
        )}
        {/* v2.2.4 fix v4 — DnD via dnd-kit. PointerSensor + verticalListSortingStrategy.
            Le drag handle est ⋮⋮ dans FieldEditor (via useSortable listeners passés en prop). */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e: DragEndEvent) => {
            const { active, over } = e
            if (!over || active.id === over.id) return
            // v2.2.4 fix v5 — Indices dans step.fieldIds (PAS dans stepFields filtré
            // qui peut avoir moins d'éléments à cause des orphelins). Bug avant : le
            // reorder déplaçait le mauvais id → field semblait revenir à sa position.
            const fromIdx = step.fieldIds.indexOf(String(active.id))
            const toIdx = step.fieldIds.indexOf(String(over.id))
            if (fromIdx < 0 || toIdx < 0) return
            onReorderFieldInStep(fromIdx, toIdx)
            // v2.2.4 — Auto-section : si le field cible a une wizardSection,
            // l'appliquer au field draggé. Permet "drop dans la carte Mardi → field
            // devient Mardi" en mode Cartes par section.
            const targetField = fieldIndex.get(String(over.id))?.field
            const draggedField = fieldIndex.get(String(active.id))?.field
            if (targetField?.wizardSection && draggedField
                && draggedField.wizardSection !== targetField.wizardSection) {
              onUpdateField(String(active.id), { wizardSection: targetField.wizardSection })
              toast.success(`Champ déplacé vers la section « ${targetField.wizardSection} »`)
            }
          }}
        >
          <SortableContext items={stepFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stepFields.map((f, i) => (
                <SortableFieldRow
                  key={f.id}
                  field={f}
                  fieldIdxInStep={i}
                  totalFieldsInStep={stepFields.length}
                  allRecipientFields={allRecipientFields}
                  onUpdate={(patch) => onUpdateField(f.id, patch)}
                  onUpdateAnyField={onUpdateField}
                  onRemove={() => onRemoveFieldFromStep(f.id)}
                  onSplitAfter={() => onSplitAt(i + 1)}
                  onDuplicate={() => onDuplicateField(f.id)}
                  availableTargetSteps={allSteps
                    .map((s, idx) => ({ ...s, idx }))
                    .filter(s => s.idx !== stepIdx && (s.recipientOrder ?? 1) === (step.recipientOrder ?? 1))}
                  onMoveToStep={(targetIdx) => onMoveFieldToStep(f.id, targetIdx)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// SortableFieldRow — v2.2.4 fix v4 : wrapper dnd-kit autour de FieldEditor
// ───────────────────────────────────────────────────────────────────────
interface SortableFieldRowProps {
  field: SignField
  fieldIdxInStep: number
  totalFieldsInStep: number
  allRecipientFields: SignField[]
  onUpdate: (patch: Partial<SignField>) => void
  onUpdateAnyField?: (fieldId: string, patch: Partial<SignField>) => void
  onRemove: () => void
  onSplitAfter: () => void
  onDuplicate: () => void
  availableTargetSteps?: { id: string; title: string; idx: number }[]
  onMoveToStep?: (targetStepIdx: number) => void
}

function SortableFieldRow(props: SortableFieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.field.id,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // L'opacité du source pendant le drag (DragOverlay rend la "fantome" à la souris)
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
  }
  return (
    <div ref={setNodeRef} style={style}>
      {/* listeners + attributes sont passés au handle ⋮⋮ via FieldEditor.dragHandleProps */}
      <FieldEditor
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// FieldEditor — édition d'un champ (label, type, required, listItems, conditions)
// ───────────────────────────────────────────────────────────────────────
interface FieldEditorProps {
  field: SignField
  fieldIdxInStep: number
  totalFieldsInStep: number
  allRecipientFields: SignField[]
  onUpdate: (patch: Partial<SignField>) => void
  /** v2.7.6 — Update arbitraire par fieldId (utilisé pour syncer la description de section
   *  sur tous les fields siblings avec le même wizardSection). */
  onUpdateAnyField?: (fieldId: string, patch: Partial<SignField>) => void
  onRemove: () => void
  onSplitAfter: () => void
  onDuplicate: () => void
  /** v2.2.4 fix v4 — Props dnd-kit (listeners + attributes) à appliquer sur le drag handle ⋮⋮ */
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  /** v2.2.4 — Steps disponibles pour déplacer ce field (autres étapes du même rôle) */
  availableTargetSteps?: { id: string; title: string; idx: number }[]
  /** v2.2.4 — Callback : déplace ce field vers une autre étape */
  onMoveToStep?: (targetStepIdx: number) => void
}

function FieldEditor({
  field, fieldIdxInStep, totalFieldsInStep, allRecipientFields,
  onUpdate, onUpdateAnyField, onRemove, onSplitAfter, onDuplicate, dragHandleProps,
  availableTargetSteps, onMoveToStep,
}: FieldEditorProps) {
  const [movePopoverOpen, setMovePopoverOpen] = useState(false)
  const [moveAnchorRect, setMoveAnchorRect] = useState<DOMRect | null>(null)
  const moveBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!movePopoverOpen) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-move-popover]') && !moveBtnRef.current?.contains(t)) {
        setMovePopoverOpen(false)
      }
    }
    const id = setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onClick) }
  }, [movePopoverOpen])
  const openMovePopover = () => {
    if (moveBtnRef.current) {
      setMoveAnchorRect(moveBtnRef.current.getBoundingClientRect())
    }
    setMovePopoverOpen(o => !o)
  }
  const [expanded, setExpanded] = useState(false)
  const isAutoFill = ['firstname', 'lastname', 'fullname', 'email', 'company', 'title'].includes(field.type)
  const isSig = field.type === 'signature' || field.type === 'initial'
  // v2.2.4 — Détecte les fields qui n'ont pas de coords valides sur le PDF
  // (généralement créés par l'IA dans wizard_steps sans placement visuel).
  // Ces fields apparaissent dans le wizard candidat mais PAS sur le rapport stampé.
  // Détection large : width OU height trop petite OU x ET y nuls.
  const isPlacedOnPdf = (field.width || 0) > 0.01
    && (field.height || 0) > 0.005
    && ((field.x || 0) > 0.001 || (field.y || 0) > 0.001)
  const needsPlacement = !isPlacedOnPdf
  // v2.2.4 — Pour les fields formula : on affiche TOUJOURS l'info de placement
  // (l'admin doit pouvoir vérifier rapidement que le total apparaîtra bien sur le PDF)
  const isFormula = field.type === 'formula'
  const showPlacementInfo = needsPlacement || isFormula

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 8,
      background: 'var(--card)',
      overflow: 'hidden',
    }}>
      {/* Compact header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        {/* v2.2.4 fix v4 — Drag handle dnd-kit. listeners+attributes via dragHandleProps. */}
        <span
          {...dragHandleProps}
          title="Glisse pour réordonner"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22, height: 22,
            color: 'var(--muted)',
            cursor: 'grab',
            flexShrink: 0,
            borderRadius: 4,
            userSelect: 'none',
            touchAction: 'none',  // évite scroll page sur mobile pendant drag
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2, rgba(0,0,0,0.04))' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <GripVertical size={14} />
        </span>
        {/* v2.6.8 — Badge "Section" TOUJOURS visible (cliquable). Affiche la wizardSection
            si présente, sinon "+ section" en gris pour signaler qu'on peut grouper. Clic
            sur le badge ouvre le panel expand où on peut éditer la section. */}
        {(() => {
          const hasSection = !!(field.wizardSection && field.wizardSection.trim())
          return (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title={hasSection ? `Section : ${field.wizardSection}` : 'Cliquer pour assigner ce champ à une section (Lundi, Mardi…)'}
              style={{
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.02em',
                padding: '2px 7px',
                borderRadius: 999,
                background: hasSection ? 'var(--primary-soft, #FEF3C7)' : 'transparent',
                color: hasSection ? 'var(--accent-foreground, #92400E)' : 'var(--muted, #9CA3AF)',
                border: hasSection ? '1px solid var(--primary, #EAB308)' : '1px dashed var(--border, #E5E7EB)',
                whiteSpace: 'nowrap',
                maxWidth: 110,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {hasSection ? field.wizardSection!.trim() : '+ section'}
            </button>
          )
        })()}
        <input
          type="text"
          value={field.tooltip || field.label || ''}
          placeholder={`(${field.type})`}
          onChange={e => onUpdate({ tooltip: e.target.value, label: e.target.value })}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontSize: 13,
            color: 'var(--foreground)',
            outline: 'none',
            fontFamily: 'inherit',
            padding: '2px 0',
          }}
        />
        <span className="neo-badge neo-badge-gray" style={{ fontSize: 10, flexShrink: 0 }}>{field.type}</span>
        {field.required && <span style={{ color: '#DC2626', fontSize: 13, fontWeight: 700, flexShrink: 0, lineHeight: 1 }}>*</span>}
        {/* v2.2.4 — Bouton "Déplacer vers étape" (visible si autres steps du même rôle) */}
        {availableTargetSteps && availableTargetSteps.length > 0 && (
          <>
            <button
              ref={moveBtnRef}
              onClick={openMovePopover}
              className="neo-btn-ghost"
              style={{ padding: 4 }}
              title="Déplacer vers une autre étape"
            >
              <ArrowRightLeft size={12} />
            </button>
            {/* v2.2.4 — Popover via createPortal pour échapper au overflow:hidden parent.
                v2.2.4 fix — Flip vers le haut si pas assez de place en bas. */}
            {movePopoverOpen && moveAnchorRect && typeof window !== 'undefined' && (() => {
              const POPOVER_HEIGHT_EST = Math.min(60 + (availableTargetSteps?.length || 0) * 38, 360)
              const spaceBelow = window.innerHeight - moveAnchorRect.bottom
              const spaceAbove = moveAnchorRect.top
              const placeAbove = spaceBelow < POPOVER_HEIGHT_EST + 16 && spaceAbove > spaceBelow
              return createPortal(
              <div
                data-move-popover
                style={{
                  position: 'fixed',
                  top: placeAbove ? Math.max(8, moveAnchorRect.top - POPOVER_HEIGHT_EST - 4) : moveAnchorRect.bottom + 4,
                  // Positionne à droite du bouton (right-align). Math.max(8) évite déborder à gauche.
                  left: Math.max(8, moveAnchorRect.right - 240),
                  maxHeight: Math.min(360, placeAbove ? spaceAbove - 16 : spaceBelow - 16),
                  overflowY: 'auto',
                  zIndex: 9999,
                  minWidth: 240,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
                  padding: 6,
                  fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                }}
              >
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--muted)',
                  padding: '6px 10px 4px',
                }}>
                  Déplacer vers
                </div>
                {availableTargetSteps.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onMoveToStep?.(s.idx)
                      setMovePopoverOpen(false)
                      toast.success(`Déplacé vers « ${s.title} »`)
                    }}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '8px 10px',
                      background: 'transparent', border: 'none',
                      borderRadius: 6, cursor: 'pointer',
                      fontSize: 12.5, color: 'var(--foreground)',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2, rgba(0,0,0,0.04))' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: 999,
                      background: 'var(--surface-2, rgba(0,0,0,0.06))',
                      color: 'var(--muted)', fontSize: 10, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>{s.idx + 1}</span>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                  </button>
                ))}
              </div>,
              document.body
            )
            })()}
          </>
        )}
        <button
          onClick={onDuplicate}
          className="neo-btn-ghost"
          style={{ padding: 4 }}
          title="Dupliquer ce champ (copie tout : type, libellé, section, options…)"
        >
          <Copy size={12} />
        </button>
        <button onClick={() => setExpanded(e => !e)} className="neo-btn-ghost" style={{ padding: 4 }} title="Options avancées">
          <Settings2 size={12} />
        </button>
        <button onClick={onRemove} className="neo-btn-ghost" style={{ padding: 4, color: '#DC2626' }} title="Retirer ce champ de l'étape (le champ RESTE sur le PDF — pour le supprimer définitivement, va en Mode Document)">
          <XIcon size={12} />
        </button>
      </div>

      {/* v2.2.4 — Bandeau placement : warning si pas placé OU info+bouton "centrer" pour les formula. */}
      {showPlacementInfo && (
        <div style={{
          padding: '8px 12px',
          background: needsPlacement ? 'rgba(234,179,8,0.10)' : 'rgba(74,144,226,0.08)',
          borderTop: `1px solid ${needsPlacement ? 'rgba(234,179,8,0.35)' : 'rgba(74,144,226,0.25)'}`,
          fontSize: 11.5,
          color: needsPlacement ? '#A16207' : '#1E40AF',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          lineHeight: 1.4,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 14 }}>{needsPlacement ? '⚠️' : '📍'}</span>
          <span style={{ flex: 1, minWidth: 200 }}>
            {needsPlacement ? (
              <>Ce champ apparaît dans le wizard mais <strong>pas sur le PDF stampé</strong> (pas de position définie).</>
            ) : (
              <>Position sur le PDF : <strong>page {field.page || 1}</strong> · x={Math.round((field.x || 0) * 100)}% · y={Math.round((field.y || 0) * 100)}% · taille {Math.round((field.width || 0) * 100)}×{Math.round((field.height || 0) * 100)}%</>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              // Centre au milieu de la page 1 avec une taille raisonnable
              onUpdate({
                page: 1,
                x: 0.4,
                y: 0.4,
                width: 0.18,
                height: 0.025,
              })
              toast.success(needsPlacement
                ? 'Champ placé au centre de la page 1 — ajuste sa position en Mode Document'
                : 'Champ replacé au centre de la page 1')
            }}
            style={{
              padding: '4px 10px',
              fontSize: 11, fontWeight: 700,
              background: needsPlacement ? '#EAB308' : 'var(--card)',
              color: needsPlacement ? '#1C1A14' : '#1E40AF',
              border: needsPlacement ? 'none' : '1px solid #4A90E2',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
            title={needsPlacement ? 'Donne une position par défaut au champ pour qu\'il apparaisse sur le PDF' : 'Remet le champ au centre de la page 1 (puis ajuste en Mode Document)'}
          >
            {needsPlacement ? '📍 Placer sur le PDF' : '📍 Recentrer'}
          </button>
        </div>
      )}

      {expanded && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Type — librement modifiable */}
          <div>
            <label style={editLabelSmall}>Type de champ</label>
            <select
              value={field.type}
              onChange={e => onUpdate({ type: e.target.value as SignFieldType })}
              style={{ ...editInputStyle, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
            >
              {FIELD_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {isSig && (
              <div style={{ fontSize: 10.5, color: 'var(--warning)', marginTop: 4, lineHeight: 1.4 }}>
                ⚠️ Changer le type d&apos;une signature affectera le stamping du PDF final. Vérifie que c&apos;est ce que tu veux.
              </div>
            )}
          </div>

          {/* v2.7.6 — Annotation / Instruction (= Infobulle Mode Document) :
              partage la propriété `helpText` avec TemplateEditor. Affichée en
              italique gris sous le label du champ dans le wizard. */}
          <div>
            <label style={editLabelSmall}>Annotation / Instruction</label>
            <input
              type="text"
              value={field.helpText || ''}
              onChange={e => onUpdate({ helpText: e.target.value.slice(0, 200) || undefined })}
              maxLength={200}
              placeholder="Ex : Indiquez votre IBAN suisse au format CH…"
              style={{ ...editInputStyle, padding: '6px 8px', fontSize: 12 }}
            />
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>
              Texte d&apos;aide visible sous le titre du champ dans le wizard.
            </div>
          </div>

          {/* Required */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--foreground)' }}>
            <input
              type="checkbox"
              checked={!!field.required}
              onChange={e => onUpdate({ required: e.target.checked })}
              style={{ width: 14, height: 14, accentColor: '#EAB308', cursor: 'pointer' }}
            />
            Champ obligatoire
          </label>

          {/* v2.7.6 — Le consultant peut compléter si le candidat laisse vide */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--foreground)' }}>
            <input
              type="checkbox"
              checked={!!(field.metadata?.consultantCanFill)}
              onChange={e => onUpdate({ metadata: { ...field.metadata, consultantCanFill: e.target.checked || undefined } })}
              style={{ width: 14, height: 14, accentColor: '#6366F1', cursor: 'pointer' }}
            />
            Le consultant peut compléter si vide
          </label>

          {/* v2.7.6 — Auto-fill : verrouillage (lecture seule) pour champs type=firstname/lastname/email/etc. */}
          {['firstname', 'lastname', 'fullname', 'email', 'company', 'title'].includes(field.type) && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--foreground)' }}>
              <input
                type="checkbox"
                checked={!!field.autoFillLocked}
                onChange={e => onUpdate({ autoFillLocked: e.target.checked || undefined })}
                style={{ width: 14, height: 14, accentColor: '#15803D', cursor: 'pointer' }}
              />
              Verrouiller la valeur (lecture seule)
              <span style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 4 }}>
                — par défaut, le candidat peut corriger
              </span>
            </label>
          )}

          {/* v2.7.6 — Source auto-fill pour type=number (téléphone candidat) */}
          {field.type === 'number' && (
            <div>
              <label style={editLabelSmall}>Auto-remplir avec</label>
              <select
                value={field.autoFillSource || ''}
                onChange={e => onUpdate({ autoFillSource: (e.target.value || undefined) as 'phone' | undefined })}
                style={{ ...editInputStyle, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
              >
                <option value="">— Aucun —</option>
                <option value="phone">📱 Téléphone du candidat</option>
              </select>
              {field.autoFillSource === 'phone' && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--foreground)', marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!field.autoFillLocked}
                    onChange={e => onUpdate({ autoFillLocked: e.target.checked || undefined })}
                    style={{ width: 14, height: 14, accentColor: '#15803D', cursor: 'pointer' }}
                  />
                  Verrouiller (lecture seule)
                </label>
              )}
            </div>
          )}

          {/* Default value */}
          <div>
            <label style={editLabelSmall}>Valeur par défaut</label>
            <input
              type="text"
              value={field.defaultValue || ''}
              onChange={e => onUpdate({ defaultValue: e.target.value || undefined })}
              style={{ ...editInputStyle, padding: '6px 8px', fontSize: 12 }}
              placeholder="(aucune)"
            />
          </div>

          {/* v2.2.1 — Section d'affichage Wizard (groupage visuel)
              Combobox HTML5 natif : autocomplete sur les sections déjà utilisées + création libre */}
          <div>
            <label style={editLabelSmall}>Section d&apos;affichage</label>
            {(() => {
              // Calcule les sections distinctes utilisées dans tout le template
              const knownSections = Array.from(new Set(
                allRecipientFields
                  .map(f => (f.wizardSection || '').trim())
                  .filter(s => s !== '')
              )).sort((a, b) => a.localeCompare(b, 'fr'))
              const datalistId = `sections-list-${field.id}`
              return (
                <>
                  <input
                    type="text"
                    list={datalistId}
                    value={field.wizardSection || ''}
                    onChange={e => onUpdate({ wizardSection: e.target.value || undefined })}
                    style={{ ...editInputStyle, padding: '6px 8px', fontSize: 12 }}
                    placeholder={knownSections.length > 0
                      ? `Choisis dans la liste ou tape une nouvelle section`
                      : `Ex : Lundi, Mardi, Conjoint…`}
                  />
                  <datalist id={datalistId}>
                    {knownSections.map(s => <option key={s} value={s} />)}
                  </datalist>
                  {knownSections.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {knownSections.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onUpdate({ wizardSection: s })}
                          style={{
                            padding: '3px 8px',
                            fontSize: 10.5,
                            border: '1px solid var(--border)',
                            background: field.wizardSection === s ? 'var(--primary-soft)' : 'var(--card)',
                            color: field.wizardSection === s ? 'var(--accent-foreground)' : 'var(--muted)',
                            borderRadius: 999,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontWeight: field.wizardSection === s ? 700 : 500,
                          }}
                          title={`Réutiliser la section "${s}"`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
              Les champs avec la même section seront groupés visuellement dans le wizard candidat.
            </div>
          </div>

          {/* v2.7.6 — Annotation de la section (affichée à côté du titre de la carte).
              Sync sur tous les fields siblings de la même section. */}
          {field.wizardSection && field.wizardSection.trim() && (
            <div>
              <label style={editLabelSmall}>Annotation de la section</label>
              <input
                type="text"
                value={field.sectionDescription || ''}
                onChange={e => {
                  const newDesc = e.target.value.slice(0, 200) || undefined
                  const sectionName = (field.wizardSection || '').trim()
                  if (onUpdateAnyField && sectionName) {
                    // Sync sur tous les fields avec le même wizardSection
                    for (const sib of allRecipientFields) {
                      if ((sib.wizardSection || '').trim() === sectionName) {
                        onUpdateAnyField(sib.id, { sectionDescription: newDesc })
                      }
                    }
                  } else {
                    onUpdate({ sectionDescription: newDesc })
                  }
                }}
                maxLength={200}
                placeholder="Ex : Veuillez nous dire si vous avez ou pas permis de conduire"
                style={{ ...editInputStyle, padding: '6px 8px', fontSize: 12 }}
              />
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>
                Affichée en italique gris à côté du nom de la section dans le wizard.
              </div>
            </div>
          )}

          {/* List items pour select */}
          {field.type === 'select' && (
            <ListItemsEditor
              items={(field.metadata?.listItems as { text: string; value: string }[] | undefined) || []}
              onChange={items => onUpdate({ metadata: { ...field.metadata, listItems: items } })}
            />
          )}

          {/* v2.2.4 — Éditeur formule via composant partagé (cohérence Mode Wizard ↔ Mode Document) */}
          {field.type === 'formula' && (
            <FieldFormulaOptions
              field={field}
              allRecipientFields={allRecipientFields}
              onUpdate={onUpdate}
            />
          )}

          {/* Conditions */}
          {(() => {
            const sectionName = (field.wizardSection || '').trim()
            const sectionSiblings = sectionName
              ? allRecipientFields.filter(f => (f.wizardSection || '').trim() === sectionName)
              : []
            const conds = field.conditions || []
            const canApplyToSection = !!(sectionName && sectionSiblings.length > 1 && conds.length > 0 && onUpdateAnyField)
            return (
              <ConditionsEditor
                conditions={conds}
                otherFields={allRecipientFields.filter(f => f.id !== field.id)}
                onChange={(c) => onUpdate({ conditions: c.length === 0 ? undefined : c })}
                sectionName={sectionName || undefined}
                sectionFieldCount={sectionSiblings.length}
                onApplyToSection={canApplyToSection ? () => {
                  for (const sib of sectionSiblings) {
                    if (sib.id === field.id) continue
                    onUpdateAnyField!(sib.id, { conditions: conds.length === 0 ? undefined : conds })
                  }
                  toast.success(`✓ Conditions appliquées à ${sectionSiblings.length - 1} autre${sectionSiblings.length - 1 > 1 ? 's' : ''} champ${sectionSiblings.length - 1 > 1 ? 's' : ''}`)
                } : undefined}
              />
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// ListItemsEditor — édite les items d'un select
// ───────────────────────────────────────────────────────────────────────
function ListItemsEditor({
  items, onChange,
}: {
  items: { text: string; value: string }[]
  onChange: (items: { text: string; value: string }[]) => void
}) {
  return (
    <div>
      <label style={editLabelSmall}>Options de la liste</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="text"
              value={it.text}
              onChange={e => onChange(items.map((x, j) => j === i ? { text: e.target.value, value: e.target.value } : x))}
              style={{ ...editInputStyle, padding: '5px 8px', fontSize: 12, flex: 1 }}
              placeholder="Texte affiché"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="neo-btn-ghost"
              style={{ padding: 4, color: '#DC2626' }}
              title="Supprimer"
            >
              <XIcon size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, { text: '', value: '' }])}
          className="neo-btn-ghost neo-btn-sm"
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
        >
          <Plus size={12} />
          Ajouter une option
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// ConditionsEditor — édite les conditions show/hide/require/unrequire
// ───────────────────────────────────────────────────────────────────────
function ConditionsEditor({
  conditions, otherFields, onChange, onApplyToSection, sectionName, sectionFieldCount,
}: {
  conditions: SignFieldCondition[]
  otherFields: SignField[]
  onChange: (c: SignFieldCondition[]) => void
  /** v2.7.6 — Si défini, affiche un bouton pour appliquer ces conditions à tous les
   *  champs de la même section (sauf celui-ci). Pratique pour les blocs conjoint, etc. */
  onApplyToSection?: () => void
  sectionName?: string
  sectionFieldCount?: number
}) {
  const addCondition = () => {
    onChange([...conditions, {
      triggerFieldId: otherFields[0]?.id || '',
      operator: 'equals',
      value: '',
      action: 'show',
    }])
  }
  const update = (idx: number, patch: Partial<SignFieldCondition>) => {
    onChange(conditions.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }
  const remove = (idx: number) => onChange(conditions.filter((_, i) => i !== idx))

  return (
    <div>
      <label style={editLabelSmall}>Logique conditionnelle</label>
      {conditions.length === 0 ? (
        <button
          type="button"
          onClick={addCondition}
          className="neo-btn-ghost neo-btn-sm"
          disabled={otherFields.length === 0}
        >
          <Plus size={12} />
          Ajouter une condition
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {conditions.map((c, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card, #fff)' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Si</span>
                <select
                  value={c.triggerFieldId}
                  onChange={e => update(i, { triggerFieldId: e.target.value })}
                  style={{ ...editInputStyle, padding: '4px 6px', fontSize: 11, flex: 1, minWidth: 140 }}
                >
                  {otherFields.map(f => (
                    <option key={f.id} value={f.id}>{f.tooltip || f.label || `(${f.type})`}</option>
                  ))}
                </select>
                <select
                  value={c.operator}
                  onChange={e => update(i, { operator: e.target.value as SignFieldCondition['operator'] })}
                  style={{ ...editInputStyle, padding: '4px 6px', fontSize: 11, width: 100 }}
                >
                  <option value="equals">=</option>
                  <option value="notEquals">≠</option>
                  <option value="isEmpty">vide</option>
                  <option value="isNotEmpty">rempli</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="gte">≥</option>
                  <option value="lte">≤</option>
                </select>
                {!['isEmpty', 'isNotEmpty'].includes(c.operator) && (
                  <input
                    type="text"
                    value={c.value || ''}
                    onChange={e => update(i, { value: e.target.value })}
                    style={{ ...editInputStyle, padding: '4px 6px', fontSize: 11, width: 80 }}
                    placeholder="valeur"
                  />
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Alors</span>
                <select
                  value={c.action}
                  onChange={e => update(i, { action: e.target.value as SignFieldCondition['action'] })}
                  style={{ ...editInputStyle, padding: '4px 6px', fontSize: 11, flex: 1 }}
                >
                  <option value="show">Afficher ce champ</option>
                  <option value="hide">Cacher ce champ</option>
                  <option value="require">Rendre obligatoire</option>
                  <option value="unrequire">Rendre facultatif</option>
                  <option value="check">☑ Auto-cocher (case à cocher)</option>
                  <option value="uncheck">☐ Auto-décocher (case à cocher)</option>
                </select>
                <button onClick={() => remove(i)} className="neo-btn-ghost" style={{ padding: 4, color: '#DC2626' }}>
                  <XIcon size={12} />
                </button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <button
              type="button"
              onClick={addCondition}
              className="neo-btn-ghost neo-btn-sm"
              style={{ alignSelf: 'flex-start' }}
            >
              <Plus size={12} />
              Ajouter une condition
            </button>
            {/* v2.7.6 — Bouton pour appliquer ces conditions à toute la section (gain de
                temps massif pour blocs type conjoint, enfant, etc.) */}
            {onApplyToSection && sectionName && (sectionFieldCount ?? 0) > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Appliquer ces ${conditions.length} condition${conditions.length > 1 ? 's' : ''} à tous les ${(sectionFieldCount ?? 0) - 1} autres champs de la section « ${sectionName} » ? Leurs conditions existantes seront ÉCRASÉES.`)) {
                    onApplyToSection()
                  }
                }}
                className="neo-btn-ghost neo-btn-sm"
                style={{ alignSelf: 'flex-start', color: 'var(--accent-foreground)', background: 'var(--primary-soft, #FEF3C7)' }}
                title={`Copier ces conditions sur les ${(sectionFieldCount ?? 0) - 1} autres champs de la section`}
              >
                📋 Appliquer à toute la section « {sectionName} »
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// AttachmentsEditor — édite la liste des documents à consulter de l'étape
// ───────────────────────────────────────────────────────────────────────
function AttachmentsEditor({
  attachments, documents, onChange,
}: {
  attachments: WizardStepAttachment[]
  documents: SignDocument[]
  onChange: (a: WizardStepAttachment[]) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const usedDocOrders = new Set(attachments.map(a => a.docOrder).filter(o => o !== undefined))
  const availableDocs = documents.filter((d, i) => {
    const order = d.order ?? (i + 1)
    return !usedDocOrders.has(order)
  })
  const update = (idx: number, patch: Partial<WizardStepAttachment>) => {
    onChange(attachments.map((a, i) => i === idx ? { ...a, ...patch } : a))
  }
  const remove = (idx: number) => onChange(attachments.filter((_, i) => i !== idx))
  const addFromDoc = (doc: SignDocument) => {
    const newAtt: WizardStepAttachment = {
      id: 'att_' + Math.random().toString(36).slice(2, 11),
      label: doc.name.replace(/\.pdf$/i, ''),
      docOrder: doc.order,
    }
    onChange([...attachments, newAtt])
    setShowAdd(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <label style={{ ...editLabelStyle, marginBottom: 0 }}>
          Documents à consulter ({attachments.length})
        </label>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowAdd(s => !s)}
          className="neo-btn-ghost neo-btn-sm"
          disabled={availableDocs.length === 0}
        >
          <Plus size={12} />
          Ajouter un document
        </button>
      </div>
      {showAdd && (
        <div style={{
          marginBottom: 10,
          padding: 10,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
          maxHeight: 200,
          overflowY: 'auto',
        }}>
          {availableDocs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
              Tous les PDFs du template sont déjà attachés.
            </div>
          ) : availableDocs.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => addFromDoc(d)}
              style={{
                width: '100%', textAlign: 'left',
                padding: '6px 8px', background: 'transparent',
                border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4,
                color: 'var(--foreground)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2, #F3F4F6)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              📄 {d.name}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {attachments.map((a, idx) => {
          const sourceDoc = documents.find(d => (d.order ?? 0) === a.docOrder)
          return (
            <div key={a.id} style={{
              padding: 10,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--card)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>📄</span>
                <input
                  type="text"
                  value={a.label}
                  onChange={e => update(idx, { label: e.target.value })}
                  placeholder="Titre affiché au candidat"
                  style={{ ...editInputStyle, flex: 1, padding: '6px 8px', fontSize: 12.5, fontWeight: 600 }}
                />
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  style={{ width: 26, height: 26, border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer' }}
                  title="Retirer"
                >
                  <XIcon size={13} />
                </button>
              </div>
              <input
                type="text"
                value={a.description || ''}
                onChange={e => update(idx, { description: e.target.value || undefined })}
                placeholder="Description (optionnel) — ex: Consultez ce document avant de choisir"
                style={{ ...editInputStyle, padding: '6px 8px', fontSize: 11.5 }}
              />
              {sourceDoc && (
                <div style={{ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' }}>
                  Source : {sourceDoc.name}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// v2.2.4 — FormulaEditor interne supprimé (déplacé dans FieldFormulaOptions.tsx
// pour partage entre Mode Wizard et Mode Document).

// ─── DisplayModeBtn — toggle Liste / Cartes ──────────────────────────
function DisplayModeBtn({
  active, onClick, label, description,
}: {
  active: boolean; onClick: () => void; label: string; description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '1 1 200px',
        padding: '10px 12px',
        textAlign: 'left',
        border: '1.5px solid',
        borderColor: active ? 'var(--primary)' : 'var(--border)',
        background: active ? 'var(--primary-soft)' : 'var(--card)',
        borderRadius: 10,
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)' }}>{label}</span>
      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{description}</span>
    </button>
  )
}

// ─── Styles ────────────────────────────────────────────────────────
const editLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--muted)',
  marginBottom: 6,
}

const editLabelSmall: React.CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted)',
  marginBottom: 4,
}

// ─── RolesManagerPopover — édition des rôles depuis Mode Wizard ────────
// v2.2.2
function RolesManagerPopover({
  schema, allRoles, onUpsert, onAdd, onDelete, onClose, fieldCountsByOrder,
}: {
  schema: SignRecipientSchema[]
  allRoles: SignRecipientSchema[]
  onUpsert: (order: number, patch: Partial<SignRecipientSchema>) => void
  onAdd: () => void
  onDelete: (order: number) => void
  onClose: () => void
  fieldCountsByOrder: Map<number, number>
}) {
  // Click outside → close
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-roles-popover]')) onClose()
    }
    // setTimeout pour éviter de capter le click qui a ouvert le popover
    const t = setTimeout(() => document.addEventListener('mousedown', onDocClick), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDocClick)
    }
  }, [onClose])

  return (
    <div
      data-roles-popover
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        zIndex: 100,
        minWidth: 380,
        maxWidth: 500,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
        padding: 14,
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--muted)',
        }}>
          Rôles ({allRoles.length})
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 26, height: 26, border: 'none', background: 'transparent',
            color: 'var(--muted)', cursor: 'pointer', borderRadius: 6,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Fermer"
        >
          <XIcon size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {allRoles.map(r => {
          const palette = RECIPIENT_COLORS[(r.order - 1) % RECIPIENT_COLORS.length] || RECIPIENT_COLORS[0]
          const schemaItem = schema.find(s => s.order === r.order)
          const fieldCount = fieldCountsByOrder.get(r.order) || 0
          return (
            <div
              key={r.order}
              style={{
                padding: 10,
                borderRadius: 10,
                border: `1.5px solid ${palette.stroke}`,
                background: palette.soft,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: palette.stroke, color: 'white',
                  fontSize: 11, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {r.order}
                </span>
                <input
                  type="text"
                  value={schemaItem?.roleName || r.roleName || ''}
                  placeholder={`Rôle ${r.order} (ex: Candidat, Client…)`}
                  onChange={e => onUpsert(r.order, { roleName: e.target.value })}
                  style={{
                    flex: 1, minWidth: 0,
                    padding: '6px 10px',
                    fontSize: 13, fontWeight: 600,
                    color: 'var(--foreground)',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <span
                  title={`${fieldCount} champ(s) assigné(s)`}
                  style={{
                    fontSize: 10, fontWeight: 700,
                    padding: '3px 8px',
                    background: 'var(--card)',
                    color: palette.stroke,
                    borderRadius: 999,
                    border: `1px solid ${palette.stroke}`,
                    flexShrink: 0,
                  }}
                >
                  {fieldCount} ch.
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(r.order)}
                  title="Supprimer ce rôle"
                  style={{
                    width: 28, height: 28,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: '#DC2626', cursor: 'pointer',
                    borderRadius: 6,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select
                  value={r.role === 'cc' ? 'cc' : 'signer'}
                  onChange={e => onUpsert(r.order, { role: e.target.value as 'signer' | 'cc' })}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    fontSize: 11.5,
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
      <button
        type="button"
        onClick={onAdd}
        className="neo-btn-ghost neo-btn-sm"
        style={{
          marginTop: 10, width: '100%', justifyContent: 'center',
          borderStyle: 'dashed',
        }}
      >
        <Plus size={13} />
        Ajouter un rôle
      </button>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        💡 Renomme avec un libellé clair (« Candidat », « Client »…). Les modifications sont enregistrées en cliquant sur <strong>Enregistrer</strong> en haut.
      </div>
    </div>
  )
}

const editInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--foreground)',
  outline: 'none',
  boxSizing: 'border-box',
  colorScheme: 'light dark',
}

// ───────────────────────────────────────────────────────────────────────
// OrphanFieldsModal — modal champs orphelins
// ───────────────────────────────────────────────────────────────────────
interface OrphanFieldsModalProps {
  orphanFields: SignField[]
  steps: WizardStep[]
  locatedFieldId: string | null
  onLocate: (id: string) => void
  onAddToStep: (fieldId: string, stepIdx: number) => void
  onAddAllToStep: (fieldIds: string[], stepIdx: number) => void
  onDelete: (fieldIds: string[]) => void
  onClose: () => void
}

export function OrphanFieldsModal({
  orphanFields, steps, locatedFieldId,
  onLocate, onAddToStep, onAddAllToStep, onDelete, onClose,
}: OrphanFieldsModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [targetStepIdx, setTargetStepIdx] = useState<number>(0)

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allSelected = orphanFields.length > 0 && selectedIds.size === orphanFields.length
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(orphanFields.map(f => f.id)))
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(680px, 95vw)',
          maxHeight: '85vh',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 20px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <AlertTriangle size={16} color="#A16207" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>
              Champs orphelins ({orphanFields.length})
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Présents dans le PDF mais dans aucune étape du wizard — le candidat ne les verra pas
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
              cursor: 'pointer', color: 'var(--muted)',
            }}
          >
            <XIcon size={14} />
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          {/* Select-all row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 20px', borderBottom: '1px solid var(--border)',
          }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ width: 14, height: 14, accentColor: '#EAB308', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
              {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </span>
          </div>

          {orphanFields.map(f => {
            const lbl = (f.tooltip || '').trim() || (f.label || '').trim() || `(${f.type})`
            const isHidden = f.metadata?.hidden === true
            const isLocated = locatedFieldId === f.id
            const isChecked = selectedIds.has(f.id)
            return (
              <div
                key={f.id}
                style={{
                  borderLeft: isLocated ? '3px solid #EAB308' : '3px solid transparent',
                  background: isLocated ? 'rgba(234,179,8,0.07)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px' }}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(f.id)}
                    style={{ width: 14, height: 14, accentColor: '#EAB308', cursor: 'pointer', flexShrink: 0 }}
                  />
                  {/* Field info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: isHidden ? 'rgba(220,38,38,0.12)' : 'rgba(234,179,8,0.15)',
                        color: isHidden ? '#7F1D1D' : '#A16207',
                        border: `1px solid ${isHidden ? 'rgba(220,38,38,0.35)' : 'rgba(234,179,8,0.35)'}`,
                        padding: '1px 6px', borderRadius: 999,
                      }}>
                        {f.type}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--foreground)', fontWeight: 500 }}>
                        {lbl}
                      </span>
                      {isHidden && (
                        <span style={{ fontSize: 10, color: '#DC2626', fontWeight: 600 }}>🚫 caché</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Page {f.page || 1} · x={Math.round((f.x || 0) * 100)}% y={Math.round((f.y || 0) * 100)}%
                      {f.wizardSection && ` · section: ${f.wizardSection}`}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => onLocate(f.id)}
                      style={{
                        padding: '3px 8px', fontSize: 11, fontWeight: 600,
                        background: isLocated ? '#EAB308' : 'var(--surface-2, #F3F4F6)',
                        border: `1px solid ${isLocated ? '#CA9B00' : 'var(--border)'}`,
                        color: isLocated ? '#1C1A14' : 'var(--muted)',
                        borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                      title="Afficher les détails techniques du champ"
                    >
                      {isLocated ? '▼ Infos' : '▶ Localiser'}
                    </button>
                    <select
                      value={targetStepIdx}
                      onChange={e => setTargetStepIdx(Number(e.target.value))}
                      onClick={e => e.stopPropagation()}
                      style={{
                        fontSize: 11, padding: '3px 24px 3px 6px',
                        background: 'var(--card)', color: 'var(--foreground)',
                        border: '1px solid var(--border)', borderRadius: 5,
                        fontFamily: 'inherit', cursor: 'pointer', maxWidth: 140,
                      }}
                    >
                      {steps.map((s, si) => (
                        <option key={s.id} value={si}>Étape {si + 1} · {s.title.slice(0, 18)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onAddToStep(f.id, targetStepIdx)}
                      style={{
                        padding: '3px 8px', fontSize: 11, fontWeight: 700,
                        background: '#EAB308', color: '#1C1A14',
                        border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                      title="Ajouter ce champ à l'étape sélectionnée"
                    >
                      + Ajouter
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete([f.id])}
                      style={{
                        padding: '3px 6px', fontSize: 11,
                        background: 'transparent', color: '#DC2626',
                        border: '1px solid rgba(220,38,38,0.35)',
                        borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center',
                      }}
                      title="Supprimer définitivement ce champ du PDF"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                {/* Panneau "Localiser" expansible */}
                {isLocated && (
                  <div style={{
                    margin: '0 20px 10px 44px',
                    padding: '10px 12px',
                    background: 'rgba(234,179,8,0.10)',
                    border: '1px solid rgba(234,179,8,0.35)',
                    borderRadius: 8,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: 'var(--foreground)',
                    lineHeight: 1.7,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '2px 8px' }}>
                      <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>ID</span>
                      <span style={{ wordBreak: 'break-all' }}>{f.id}</span>
                      <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>Page</span>
                      <span>{f.page || 1}</span>
                      <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>Position</span>
                      <span>x={Math.round((f.x || 0) * 10000) / 100}% · y={Math.round((f.y || 0) * 10000) / 100}%</span>
                      <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>Taille</span>
                      <span>w={Math.round((f.width || 0) * 10000) / 100}% · h={Math.round((f.height || 0) * 10000) / 100}%</span>
                      {f.recipientOrder != null && (
                        <>
                          <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>Destinataire</span>
                          <span>ordre {f.recipientOrder}</span>
                        </>
                      )}
                      {f.wizardSection && (
                        <>
                          <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>Section</span>
                          <span>{f.wizardSection}</span>
                        </>
                      )}
                      {!!f.metadata?.tabType && (
                        <>
                          <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>tabType</span>
                          <span>{String(f.metadata.tabType)}</span>
                        </>
                      )}
                      {f.label && f.label !== lbl && (
                        <>
                          <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>Label</span>
                          <span>{f.label}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer (bulk actions) */}
        {selectedIds.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-2, #F9FAFB)',
            flexShrink: 0, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>
              {selectedIds.size} champ{selectedIds.size > 1 ? 's sélectionnés' : ' sélectionné'}
            </span>
            <select
              value={targetStepIdx}
              onChange={e => setTargetStepIdx(Number(e.target.value))}
              style={{
                fontSize: 12, padding: '5px 8px',
                background: 'var(--card)', color: 'var(--foreground)',
                border: '1px solid var(--border)', borderRadius: 6,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {steps.map((s, si) => (
                <option key={s.id} value={si}>Étape {si + 1} · {s.title.slice(0, 20)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onAddAllToStep(Array.from(selectedIds), targetStepIdx)}
              style={{
                padding: '5px 14px', fontSize: 12.5, fontWeight: 700,
                background: '#EAB308', color: '#1C1A14',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              + Ajouter {selectedIds.size} à l&apos;étape
            </button>
            <button
              type="button"
              onClick={() => onDelete(Array.from(selectedIds))}
              style={{
                padding: '5px 12px', fontSize: 12.5, fontWeight: 700,
                background: 'transparent', color: '#DC2626',
                border: '1px solid rgba(220,38,38,0.40)',
                borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <Trash2 size={13} />
              Supprimer {selectedIds.size}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
