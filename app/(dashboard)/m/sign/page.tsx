'use client'
// TalentFlow Mobile /m/sign — Liste enveloppes (v2.9.72)
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, FileSignature } from 'lucide-react'
import MHeader from '../_components/MHeader'

type SignStatus = 'all' | 'in_progress' | 'completed' | 'draft' | 'expired' | 'declined' | 'cancelled' | 'sent'

interface Envelope {
  id: string
  title: string
  status: string
  created_at: string
  recipients?: Array<{ name?: string; email?: string; status?: string }>
  candidate_id?: string | null
}

const TABS: { key: SignStatus; label: string }[] = [
  { key: 'in_progress', label: 'En cours' },
  { key: 'sent',        label: 'Envoyées' },
  { key: 'completed',   label: 'Signées' },
  { key: 'draft',       label: 'Brouillons' },
  { key: 'all',         label: 'Toutes' },
]

function statusBadge(s: string): { cls: string; label: string } {
  switch (s) {
    case 'draft':       return { cls: 'draft',     label: 'Brouillon' }
    case 'sent':        return { cls: 'sent',      label: 'Envoyée' }
    case 'in_progress': return { cls: 'progress',  label: 'En cours' }
    case 'completed':   return { cls: 'completed', label: 'Signée' }
    case 'expired':     return { cls: 'expired',   label: 'Expirée' }
    case 'declined':    return { cls: 'declined',  label: 'Refusée' }
    case 'cancelled':   return { cls: 'cancelled', label: 'Annulée' }
    default:            return { cls: 'draft',     label: s }
  }
}

function fmtDate(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function SignListInner() {
  const searchParams = useSearchParams()
  const initialStatus = (searchParams?.get('status') as SignStatus) || 'in_progress'
  const [tab, setTab] = useState<SignStatus>(initialStatus)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<{ envelopes: Envelope[]; count: number }>({
    queryKey: ['m', 'envelopes', tab, search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' })
      if (tab !== 'all') params.set('status', tab)
      if (search.trim()) params.set('search', search.trim())
      const r = await fetch(`/api/sign/envelopes?${params}`, { credentials: 'include' })
      if (!r.ok) return { envelopes: [], count: 0 }
      return r.json()
    },
    staleTime: 30_000,
  })

  const envelopes = data?.envelopes || []

  return (
    <>
      <MHeader title="Signatures" back="/m" action={
        <Link href="/m/sign/new" className="m-header-action" aria-label="Nouvelle enveloppe">
          <Plus size={16} /> Nouvelle
        </Link>
      } />
      <div className="m-content">
        <div className="m-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              className={`m-tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="m-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Rechercher par titre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>

        {isLoading && <div className="m-loading">Chargement...</div>}

        {!isLoading && envelopes.length === 0 && (
          <div className="m-empty">
            <div className="m-empty-emoji">📭</div>
            <div>Aucune enveloppe</div>
          </div>
        )}

        {!isLoading && envelopes.map((env) => {
          const badge = statusBadge(env.status)
          const total = env.recipients?.length || 0
          const signed = env.recipients?.filter(r => r.status === 'signed').length || 0
          return (
            <Link key={env.id} href={`/m/sign/${env.id}`} className="m-card">
              <div className="m-avatar"><FileSignature size={20} /></div>
              <div className="m-card-body">
                <div className="m-card-title">{env.title}</div>
                <div className="m-card-sub">
                  {total > 0 ? `${signed}/${total} signé${signed > 1 ? 's' : ''}` : 'Pas de destinataire'} · {fmtDate(env.created_at)}
                </div>
              </div>
              <span className={`m-badge ${badge.cls}`}>{badge.label}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}

export default function MobileSignPage() {
  return (
    <Suspense fallback={<div className="m-loading">Chargement...</div>}>
      <SignListInner />
    </Suspense>
  )
}
