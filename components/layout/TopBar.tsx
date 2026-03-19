'use client'
import { Search, Bell, RefreshCw } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useSyncMicrosoft } from '@/hooks/useMessages'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const PAGE_TITLES: Record<string, string> = {
  '/':            'Tableau de bord',
  '/candidats':   'Candidats',
  '/offres':      'Offres d\'emploi',
  '/pipeline':    'Pipeline',
  '/entretiens':  'Entretiens',
  '/messages':    'Messages',
  '/matching':    'Matching IA',
  '/integrations':'Intégrations',
  '/parametres':  'Paramètres',
}

export function TopBar() {
  const pathname = usePathname()
  const sync = useSyncMicrosoft()

  const title = Object.entries(PAGE_TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([key]) => pathname === key || pathname.startsWith(key + '/'))
    ?.[1] ?? 'TalentFlow'

  const { data: intData } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => fetch('/api/integrations').then(r => r.json()),
    staleTime: 30_000,
  })
  const isMsConnected = intData?.integrations?.some((i: any) => i.type === 'microsoft' && i.actif)

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 60_000,
  })

  const prenom   = user?.user_metadata?.prenom || ''
  const nom      = user?.user_metadata?.nom    || ''
  const initiales = `${prenom[0] || ''}${nom[0] || ''}`.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'
  const displayName = prenom
    ? `${prenom} ${nom[0] ? nom[0] + '.' : ''}`.trim()
    : user?.email?.split('@')[0] || 'Utilisateur'

  return (
    <header className="d-topbar">
      <h2 className="d-topbar-title">{title}</h2>

      <div className="d-search-wrap">
        <Search />
        <input
          type="text"
          placeholder="Rechercher..."
          className="d-search-input"
        />
      </div>

      <div className="d-topbar-actions">
        {isMsConnected && (
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="d-icon-btn"
            title="Synchroniser Microsoft"
          >
            <RefreshCw style={{ width: 14, height: 14 }} className={sync.isPending ? 'animate-spin' : ''} />
          </button>
        )}
        <button className="d-icon-btn">
          <Bell style={{ width: 14, height: 14 }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4 }}>
          <div className="d-topbar-avatar">{initiales}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1 }}>
              {displayName}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Recruteur</span>
          </div>
        </div>
      </div>
    </header>
  )
}
