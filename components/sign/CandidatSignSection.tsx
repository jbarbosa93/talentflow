// TalentFlow Sign — Section "Signatures électroniques" dans fiche candidat (style v2)
// v2.2.0 — Phase 1
// Insérée dans DocumentsPanel — affiche les enveloppes Sign liées au candidat
// regroupées par catégorie (Mappe / Contrat / Autres).
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Eye, FolderOpen, FileText, Paperclip, Loader2, FileSignature } from 'lucide-react'
import EnvelopeStatusBadge from './EnvelopeStatusBadge'
import type { SignCategory, SignEnvelope } from '@/lib/sign/types'

interface Props {
  candidatId: string
  candidatName?: string
}

// v2.4.9 — Label "Mappe" → "Général" (cohérent avec CATEGORY_LABELS + CreateTemplateModal)
const CATEGORIES: { key: SignCategory; label: string; icon: typeof FolderOpen; color: string; bg: string; border: string }[] = [
  { key: 'mappe',   label: 'Général',            icon: FolderOpen, color: 'var(--warning)', bg: 'var(--warning-soft)', border: 'var(--warning-soft)' },
  { key: 'contrat', label: 'Contrat de travail', icon: FileText,   color: 'var(--info)',    bg: 'var(--info-soft)',    border: 'var(--info-soft)' },
  { key: 'autres',  label: 'Autres',             icon: Paperclip,  color: 'var(--muted)',   bg: 'var(--secondary)',    border: 'var(--border)' },
]

export default function CandidatSignSection({ candidatId, candidatName: _candidatName }: Props) {
  const router = useRouter()
  const [envelopes, setEnvelopes] = useState<SignEnvelope[]>([])
  const [loading, setLoading] = useState(true)

  const goNew = (cat: SignCategory) => {
    const params = new URLSearchParams()
    params.set('candidatId', candidatId)
    params.set('category', cat)
    router.push(`/sign/new?${params.toString()}`)
  }

  const fetchEnvelopes = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/sign/envelopes?candidate_id=${candidatId}&limit=100`)
      const d = await r.json()
      setEnvelopes(d.envelopes || [])
    } catch {
      setEnvelopes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEnvelopes()
  }, [candidatId])

  const grouped: Record<SignCategory, SignEnvelope[]> = { mappe: [], contrat: [], autres: [] }
  envelopes.forEach(e => grouped[e.document_category].push(e))

  return (
    <div style={{ padding: '8px 24px 16px', fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      {/* Header section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 0 12px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 12,
        }}
      >
        <FileSignature size={14} style={{ color: 'var(--primary)' }} />
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--foreground)',
            flex: 1,
          }}
        >
          Signatures électroniques
        </h3>
      </div>

      {loading ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>
          <Loader2 size={16} className="animate-spin" style={{ display: 'inline-block' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {CATEGORIES.map(cat => {
            const list = grouped[cat.key]
            const Icon = cat.icon
            return (
              <div key={cat.key}>
                {/* Category header — pattern DocumentsPanel */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '4px 0' }}>
                  <Icon size={14} style={{ color: cat.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>
                    {cat.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: cat.color,
                      background: cat.bg,
                      border: `1px solid ${cat.border}`,
                      borderRadius: 10,
                      padding: '1px 7px',
                    }}
                  >
                    {list.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => goNew(cat.key)}
                    title={`Nouvelle ${cat.label.toLowerCase()}`}
                    style={{
                      width: 24,
                      height: 24,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {list.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--muted)',
                      padding: '8px 12px',
                      border: '1px dashed var(--border)',
                      borderRadius: 8,
                      textAlign: 'center',
                      background: 'var(--secondary)',
                    }}
                  >
                    Aucun document
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {list.map(env => (
                      <div
                        key={env.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          background: 'var(--secondary)',
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 12.5,
                            color: 'var(--foreground)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {env.title}
                        </span>
                        <EnvelopeStatusBadge status={env.status} size="sm" />
                        <span
                          style={{
                            fontSize: 10.5,
                            color: 'var(--muted)',
                            fontVariantNumeric: 'tabular-nums',
                            flexShrink: 0,
                          }}
                        >
                          {new Date(env.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </span>
                        <Link
                          href={`/sign/${env.id}`}
                          title="Voir"
                          style={{
                            width: 24,
                            height: 24,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            background: 'var(--card)',
                            color: 'var(--foreground)',
                          }}
                        >
                          <Eye size={12} />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
