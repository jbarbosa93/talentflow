'use client'

// TalentFlow Mobile — Barre de navigation basse (PWA consultant)
// v2.9.38
//
// Visible uniquement sur mobile (≤768px, géré en CSS dans dashboard.css).
// 6 sections : Accueil · Candidats · Clients · Missions · Signatures · Rapports.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Building2, TrendingUp, FileSignature, FileText } from 'lucide-react'

const ITEMS = [
  { href: '/dashboard',     label: 'Accueil',    Icon: LayoutDashboard },
  { href: '/candidats',     label: 'Candidats',  Icon: Users },
  { href: '/clients',       label: 'Clients',    Icon: Building2 },
  { href: '/missions',      label: 'Missions',   Icon: TrendingUp },
  { href: '/sign',          label: 'Signatures', Icon: FileSignature },
  { href: '/sign/rapports', label: 'Rapports',   Icon: FileText },
]

function isActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  // /sign et /sign/rapports se chevauchent → on désambiguïse
  if (href === '/sign') return pathname.startsWith('/sign') && !pathname.startsWith('/sign/rapports')
  if (href === '/sign/rapports') return pathname.startsWith('/sign/rapports')
  return pathname === href || pathname.startsWith(href + '/')
}

export default function MobileBottomNav() {
  const pathname = usePathname() || ''
  return (
    <nav className="d-bottom-nav" aria-label="Navigation">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(href, pathname)
        return (
          <Link
            key={href}
            href={href}
            className={`d-bottom-nav-item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
