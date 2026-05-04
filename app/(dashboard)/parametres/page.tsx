'use client'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Building2, KeyRound, Users as UsersIcon, Settings as SettingsIcon, Activity, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''

type Section = {
  href: string
  icon: typeof Briefcase
  title: string
  description: string
  color: string
  bg: string
  adminOnly?: boolean
}

const SECTIONS: Section[] = [
  { href: '/parametres/profil',           icon: User,         title: 'Mon profil',        description: 'Informations personnelles, photo, signature',      color: '#0EA5E9', bg: 'rgba(14,165,233,0.12)' },
  { href: '/parametres/metiers',          icon: Briefcase,    title: 'Métiers',           description: 'Catégories métier et couleurs associées',          color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  { href: '/parametres/secteurs-activite',icon: Building2,    title: 'Secteurs',          description: 'Taxonomie des secteurs d\'activité clients',       color: '#A855F7', bg: 'rgba(168,85,247,0.12)' },
  { href: '/activites',                   icon: Activity,     title: 'Activité',          description: 'Timeline complète : pipeline, messages, imports',  color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  { href: '/parametres/demandes-acces',   icon: KeyRound,     title: 'Demandes d\'accès', description: 'Gérer les demandes via la landing page',           color: '#F97316', bg: 'rgba(249,115,22,0.12)', adminOnly: true },
  { href: '/parametres/admin',            icon: UsersIcon,    title: 'Administration',    description: 'Gestion des utilisateurs et invitations',          color: '#DC2626', bg: 'rgba(220,38,38,0.12)', adminOnly: true },
]

export default function ParametresHubPage() {
  // v2.0.3 — SÉCURITÉ : filtrer les sections adminOnly côté client (cohérent avec sidebar).
  // Critère : email==ADMIN_EMAIL OU user_metadata.role∈{Admin,Administrateur}.
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 60_000,
  })
  const role = (user?.user_metadata as { role?: string } | null | undefined)?.role || ''
  const isAdmin = (ADMIN_EMAIL && user?.email === ADMIN_EMAIL) || role === 'Admin' || role === 'Administrateur'
  const visibleSections = SECTIONS.filter(s => !s.adminOnly || isAdmin)

  return (
    <div className="d-page" style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      <div className="d-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="d-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon size={22} color="var(--primary)" />
            Paramètres
          </h1>
          <p className="d-page-sub">Profil, sécurité, préférences et administration</p>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
      }}>
        {visibleSections.map(s => <SectionCard key={s.href} section={s} />)}
      </div>
    </div>
  )
}

function SectionCard({ section }: { section: Section }) {
  const Icon = section.icon
  return (
    <Link href={section.href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          background: 'var(--surface, var(--card))',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '18px 20px 16px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          cursor: 'pointer',
          transition: 'border-color 0.15s, transform 0.12s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = section.color + '55'
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.transform = 'none'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: section.bg, color: section.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={20} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>
            {section.title}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          {section.description}
        </div>
        <div style={{
          fontSize: 12, fontWeight: 500, color: section.color,
          marginTop: 'auto',
        }}>
          Ouvrir →
        </div>
      </div>
    </Link>
  )
}
