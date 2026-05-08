// TalentFlow Rapports — Liste cross-link des dernières soumissions (Phase 5)
// v2.2.6
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ClipboardList, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import SubmissionHistoryTable from '@/components/report/SubmissionHistoryTable'
import type { ReportLink, ReportSubmission } from '@/lib/report/types'

type SubWithLink = ReportSubmission & {
  link?: Pick<ReportLink, 'id' | 'slug' | 'title' | 'candidat_id' | 'client_name'>
}

export default function RecentSubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubWithLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/reports/submissions/recent?limit=100')
      .then(r => r.json())
      .then(d => setSubmissions(d.submissions || []))
      .catch(() => toast.error('Erreur chargement'))
      .finally(() => setLoading(false))
  }, [])

  const linksMeta: Record<string, { id: string; slug: string; title: string; candidat_id?: string | null; client_name?: string | null }> = {}
  for (const s of submissions) {
    if (s.link) linksMeta[s.id] = s.link
  }

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/sign/rapports" className="neo-btn-ghost neo-btn-sm" style={{ padding: '4px 10px' }}>
          <ChevronLeft size={14} />
          Liens rapports
        </Link>
      </div>

      <div className="d-page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--primary-soft)',
            border: '1px solid rgba(245,167,35,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
            color: 'var(--primary, #A16207)',
          }}>
            <ClipboardList size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="d-page-title" style={{ marginBottom: 2 }}>Soumissions récentes</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              100 dernières soumissions tous liens confondus.
            </p>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {loading ? (
          <div className="neo-empty">
            <div className="neo-empty-icon">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted)' }} />
            </div>
            <div className="neo-empty-sub">Chargement…</div>
          </div>
        ) : (
          <SubmissionHistoryTable
            submissions={submissions}
            showLinkColumn
            linksMeta={linksMeta}
          />
        )}
      </div>
    </div>
  )
}
