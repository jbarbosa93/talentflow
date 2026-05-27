'use client'
// TalentFlow Mobile /m — Barre de navigation basse dédiée (v2.9.72)
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, FileSignature, TrendingUp, FileText } from 'lucide-react'

const ITEMS = [
  { href: '/m',          label: 'Accueil',    Icon: Home },
  { href: '/m/candidats', label: 'Candidats', Icon: Users },
  { href: '/m/sign',     label: 'Sign',       Icon: FileSignature },
  { href: '/m/missions', label: 'Missions',   Icon: TrendingUp },
  { href: '/m/rapports', label: 'Rapports',   Icon: FileText },
]

function isActive(href: string, pathname: string): boolean {
  if (href === '/m') return pathname === '/m'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function MBottomNav() {
  const pathname = usePathname() || ''
  return (
    <nav className="m-bottom-nav" aria-label="Navigation mobile">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(href, pathname)
        return (
          <Link
            key={href}
            href={href}
            className={`m-bottom-nav-item${active ? ' is-active' : ''}`}
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
