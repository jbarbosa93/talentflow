// TalentFlow Sign — Helpers gestion des sections (wizardSection)
// v2.9.21
//
// Une « section » n'est PAS une entité : c'est la valeur `wizardSection` posée
// sur chaque champ. Ces helpers centralisent la liste, le réordonnancement et
// l'état replié des sections. Partagés entre :
//   - Mode Wizard    (components/sign/WizardEditor.tsx)
//   - Mode Document  (components/sign/TemplateEditor.tsx + FieldsCanvas.tsx)
//
// Aucune migration DB : tout repose sur la chaîne `wizardSection` existante.

import type { SignField } from './types'

export interface SectionSummary {
  name: string
  /** ids des champs membres, dans l'ordre d'apparition */
  fieldIds: string[]
  /** nombre de champs membres */
  count: number
  /** true si tous les champs non-groupés sont obligatoires (cf. pattern #78) */
  allRequired: boolean
}

/**
 * Liste les sections présentes dans un ensemble de champs, dans l'ordre
 * d'apparition (le premier champ rencontré donne la première section).
 * Les champs sans `wizardSection` sont ignorés.
 */
export function collectSections(fields: SignField[]): SectionSummary[] {
  const order: string[] = []
  const members = new Map<string, SignField[]>()
  for (const f of fields) {
    const sec = (f.wizardSection || '').trim()
    if (!sec) continue
    if (!members.has(sec)) { members.set(sec, []); order.push(sec) }
    members.get(sec)!.push(f)
  }
  return order.map((name) => {
    const list = members.get(name)!
    return {
      name,
      fieldIds: list.map((f) => f.id),
      count: list.length,
      allRequired: sectionAllRequired(list),
    }
  })
}

/** Nombre de champs sans aucune section. */
export function countUnsectioned(fields: SignField[]): number {
  return fields.filter((f) => !(f.wizardSection || '').trim()).length
}

/**
 * Pattern #78 : les checkboxes groupées (`groupId` + `groupRule`) sont exclues
 * du calcul « tout obligatoire » — leur obligation est portée par la règle du
 * groupe, pas par le flag `required` individuel.
 */
export function sectionAllRequired(members: SignField[]): boolean {
  const targets = members.filter(
    (m) => !(m.type === 'checkbox' && m.groupId && m.groupRule),
  )
  return targets.length > 0 && targets.every((m) => !!m.required)
}

/**
 * Réordonne un tableau de `fieldIds` en déplaçant le BLOC d'une section d'un
 * cran (vers le haut si dir=-1, vers le bas si dir=1). Les champs consécutifs
 * d'une même section forment un bloc ; les champs sans section forment chacun
 * leur propre bloc. Le bloc de section est échangé avec le bloc voisin.
 *
 * `sectionOf` résout la section d'un fieldId ('' si aucune).
 * Retourne un NOUVEAU tableau, ou l'original si le déplacement est impossible.
 */
export function moveSectionBlock(
  fieldIds: string[],
  sectionOf: (id: string) => string,
  sectionName: string,
  dir: -1 | 1,
): string[] {
  // Découpe en blocs consécutifs : chaque bloc = { section, ids }
  const blocks: { section: string; ids: string[] }[] = []
  for (const id of fieldIds) {
    const sec = sectionOf(id)
    const last = blocks[blocks.length - 1]
    if (last && last.section === sec && sec !== '') last.ids.push(id)
    else blocks.push({ section: sec, ids: [id] })
  }
  const idx = blocks.findIndex((b) => b.section === sectionName)
  if (idx < 0) return fieldIds
  const target = idx + dir
  if (target < 0 || target >= blocks.length) return fieldIds
  const next = blocks.slice()
  const [moved] = next.splice(idx, 1)
  next.splice(target, 0, moved)
  return next.flatMap((b) => b.ids)
}

// ─── Persistance de l'état replié (localStorage, par template) ─────────────
// Partagé entre Mode Wizard et Mode Document : replier une section dans un
// mode la replie aussi dans l'autre. Convenance d'édition uniquement (jamais
// envoyé au candidat).

function collapseKey(templateId: string): string {
  return `sign:collapsed-sections:${templateId}`
}

export function loadCollapsedSections(templateId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(collapseKey(templateId))
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr)
      ? new Set(arr.filter((x): x is string => typeof x === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}

export function saveCollapsedSections(templateId: string, set: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(collapseKey(templateId), JSON.stringify([...set]))
  } catch {
    /* quota plein / mode privé → on ignore */
  }
}
