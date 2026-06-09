// TalentFlow Mobile /m — Layout dédié (v2.9.72)
// Bypass complet du shell desktop (sidebar + topbar). Header géré par chaque page.
import './m.css'
import MBottomNav from './_components/MBottomNav'
import MFaceIdGate from './_components/MFaceIdGate'

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-root">
      <MFaceIdGate />
      {children}
      <MBottomNav />
    </div>
  )
}
