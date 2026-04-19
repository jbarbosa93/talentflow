'use client'
import { useState, useEffect } from 'react'
import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ReminderPopup } from '@/components/ReminderPopup'

function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  // v1.9.47 — persist sidebar collapsed state
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('talentflow_sidebar_collapsed')
    if (saved === '1') setDesktopCollapsed(true)
  }, [])
  const toggleDesktop = () => {
    setDesktopCollapsed(v => {
      const next = !v
      if (typeof window !== 'undefined') {
        localStorage.setItem('talentflow_sidebar_collapsed', next ? '1' : '0')
      }
      return next
    })
  }
  const pathname = usePathname()

  const isOnCandidats = pathname === '/candidats' || pathname.startsWith('/candidats/')

  return (
    <>
      <div className="d-layout">
        {/* Mobile overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              className="d-mobile-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} desktopCollapsed={desktopCollapsed} />

        <div className="d-main">
          <TopBar onMenuClick={() => setSidebarOpen(true)} onToggleDesktop={toggleDesktop} desktopCollapsed={desktopCollapsed} />
          <main className="d-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(6px)' }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{ height: '100%' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <ReminderPopup />
    </>
  )
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <Shell>{children}</Shell>
    </ThemeProvider>
  )
}
