'use client'
import { useState } from 'react'
import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // TopBar returns null on /candidats pages, so we need a floating hamburger there
  const isOnCandidats = pathname === '/candidats' || pathname.startsWith('/candidats/')

  return (
    <>
      <div className="d-layout">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="d-mobile-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="d-main">
          <TopBar onMenuClick={() => setSidebarOpen(true)} />
          <main className="d-content">
            {children}
          </main>
        </div>
      </div>

      {/* Floating hamburger — only on candidats pages where TopBar is hidden */}
      {isOnCandidats && (
        <button
          className="d-mobile-menu-btn"
          onClick={() => setSidebarOpen(prev => !prev)}
          aria-label="Ouvrir le menu"
        >
          <Menu size={20} />
        </button>
      )}
    </>
  )
}
