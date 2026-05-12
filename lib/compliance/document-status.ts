// TalentFlow Compliance — Statut documents
// v2.5.0
//
// Status calculé côté client/serveur :
//   valide         → > 30 jours ou pas d'échéance
//   attention      → 15-30 jours
//   expire_bientot → 0-14 jours
//   expire         → date passée

import type { DocumentStatus } from './types'

export interface StatusConfig {
  label: string
  color: string
  bg: string
  dot: string
}

export const DOCUMENT_STATUS_CONFIG: Record<DocumentStatus, StatusConfig> = {
  valide: {
    label: 'Valide',
    color: 'var(--success)',
    bg: 'rgba(34,197,94,0.12)',
    dot: '#22C55E',
  },
  attention: {
    label: 'Attention',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.14)',
    dot: '#F59E0B',
  },
  expire_bientot: {
    label: 'Expire bientôt',
    color: '#C2410C',
    bg: 'rgba(249,115,22,0.14)',
    dot: '#F97316',
  },
  expire: {
    label: 'Expiré',
    color: 'var(--destructive)',
    bg: 'rgba(239,68,68,0.14)',
    dot: '#EF4444',
  },
}

export function computeDocumentStatus(expiryDate: string | null | undefined): DocumentStatus {
  if (!expiryDate) return 'valide'
  const days = daysUntilExpiry(expiryDate)
  if (days === null) return 'valide'
  if (days < 0) return 'expire'
  if (days < 14) return 'expire_bientot'
  if (days < 30) return 'attention'
  return 'valide'
}

export function daysUntilExpiry(d: string | null | undefined): number | null {
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(d); exp.setHours(0, 0, 0, 0)
  if (isNaN(exp.getTime())) return null
  return Math.floor((exp.getTime() - today.getTime()) / 86400000)
}

export function formatExpiryDate(d: string | null | undefined): string {
  if (!d) return 'Aucune échéance'
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return d
  return `${day}.${m}.${y}`
}

export function formatExpiryLong(d: string | null | undefined): string {
  if (!d) return 'aucune échéance'
  const days = daysUntilExpiry(d)
  if (days === null) return d
  const formatted = formatExpiryDate(d)
  if (days < 0) return `expiré depuis ${Math.abs(days)}j (${formatted})`
  if (days === 0) return `expire aujourd'hui (${formatted})`
  if (days === 1) return `expire demain (${formatted})`
  if (days < 31) return `expire dans ${days}j (${formatted})`
  return `valide jusqu'au ${formatted}`
}
