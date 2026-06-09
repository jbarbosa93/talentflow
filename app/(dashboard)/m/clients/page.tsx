'use client'
// TalentFlow Mobile /m/clients — Liste entreprises (v2.10.x app consultant)
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronLeft, ChevronRight, Building2, Plus } from 'lucide-react'
import MHeader from '../_components/MHeader'
import MMultiSelectSheet from '../_components/MMultiSelectSheet'
import { useSecteursList } from '@/hooks/useSecteursActiviteConfig'

interface ClientRow {
  id: string
  nom_entreprise?: string | null
  ville?: string | null
  npa?: string | null
  canton?: string | null
  telephone?: string | null
  email?: string | null
  secteurs_activite?: string[] | null
  statut?: string | null
}

const PER_PAGE = 20

export default function MobileClientsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [secteursSel, setSecteursSel] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const secteurs = useSecteursList()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const secteursParam = secteursSel.join(',')
  useEffect(() => { setPage(1) }, [debouncedSearch, secteursParam])

  const { data, isLoading } = useQuery<{ clients: ClientRow[]; total: number; total_pages?: number }>({
    queryKey: ['m', 'clients', debouncedSearch, secteursParam, page],
    queryFn: async () => {
      const params = new URLSearchParams({ per_page: String(PER_PAGE), page: String(page) })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (secteursParam) params.set('secteurs', secteursParam)
      const r = await fetch(`/api/clients?${params}`, { credentials: 'include' })
      if (!r.ok) return { clients: [], total: 0 }
      return r.json()
    },
    staleTime: 30_000,
  })

  const clients = data?.clients || []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <>
      <MHeader title="Clients" action={
        <Link href="/m/clients/new" className="m-header-action" aria-label="Nouveau client">
          <Plus size={16} /> Ajouter
        </Link>
      } />
      <div className="m-content">
        <div className="m-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Rechercher entreprise, ville, NPA..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <MMultiSelectSheet
            options={secteurs}
            selected={secteursSel}
            onChange={setSecteursSel}
            placeholder="Tous les secteurs"
            title="Filtrer par secteur"
          />
        </div>

        {isLoading && <div className="m-loading">Chargement...</div>}

        {!isLoading && clients.length === 0 && (
          <div className="m-empty">
            <div className="m-empty-emoji">🏢</div>
            <div>Aucune entreprise trouvée</div>
          </div>
        )}

        {!isLoading && clients.length > 0 && (
          <>
            <div className="m-section-title">
              {total} entreprise{total > 1 ? 's' : ''}{debouncedSearch && ` · "${debouncedSearch}"`}
            </div>
            {clients.map((cl) => {
              const loc = [cl.npa, cl.ville].filter(Boolean).join(' ')
                + (cl.canton ? ` · ${cl.canton}` : '')
              return (
                <Link key={cl.id} href={`/m/clients/${cl.id}`} className="m-card">
                  <div className="m-avatar"><Building2 size={20} /></div>
                  <div className="m-card-body">
                    <div className="m-card-title">{cl.nom_entreprise || 'Sans nom'}</div>
                    <div className="m-card-meta">{loc || '—'}</div>
                  </div>
                </Link>
              )
            })}

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '20px 0 32px' }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, border: '1px solid var(--m-border, #e7e5df)', background: '#fff', opacity: page <= 1 ? 0.4 : 1 }}
                  aria-label="Page précédente"
                >
                  <ChevronLeft size={20} />
                </button>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Page {page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, border: '1px solid var(--m-border, #e7e5df)', background: '#fff', opacity: page >= totalPages ? 0.4 : 1 }}
                  aria-label="Page suivante"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
