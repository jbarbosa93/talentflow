// TalentFlow Sign — Icône par catégorie
// v2.2.0 — Phase 1
'use client'

import { FolderOpen, FileText, Paperclip } from 'lucide-react'
import type { SignCategory } from '@/lib/sign/types'

export default function EnvelopeCategoryIcon({ category, size = 16 }: { category: SignCategory; size?: number }) {
  const Icon = category === 'mappe' ? FolderOpen : category === 'contrat' ? FileText : Paperclip
  const color = category === 'mappe' ? 'var(--warning)' : category === 'contrat' ? 'var(--info)' : 'var(--muted-foreground)'
  return <Icon size={size} style={{ color }} />
}
