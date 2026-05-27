// TalentFlow Mobile /m — Layout dédié (v2.9.72)
// Bypass complet du shell desktop (sidebar + topbar). Header géré par chaque page.
import './m.css'
import MBottomNav from './_components/MBottomNav'

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-root">
      {children}
      <MBottomNav />
    </div>
  )
}
