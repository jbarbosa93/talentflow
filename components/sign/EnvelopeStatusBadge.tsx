// TalentFlow Sign — Badge couleur par statut
// v2.2.0 — Phase 1 (style v2 : neo-badge + variantes existantes)
'use client'

import type { SignStatus } from '@/lib/sign/types'
import { STATUS_LABELS } from '@/lib/sign/types'

// Map statuts Sign → classes neo-badge existantes (cohérent avec badges pipeline)
const BADGE_CLASS: Record<SignStatus, string> = {
  draft:       'neo-badge neo-badge-gray',
  sent:        'neo-badge neo-badge-blue',
  in_progress: 'neo-badge neo-badge-yellow',
  completed:   'neo-badge neo-badge-green',
  expired:     'neo-badge neo-badge-yellow',
  declined:    'neo-badge neo-badge-red',
  cancelled:   'neo-badge neo-badge-gray',
}

export default function EnvelopeStatusBadge({ status, size = 'md' }: { status: SignStatus; size?: 'sm' | 'md' }) {
  return (
    <span
      className={BADGE_CLASS[status]}
      style={size === 'sm' ? { fontSize: 10, padding: '2px 7px' } : undefined}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
