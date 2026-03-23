import Link from "next/link"

export default function Navbar() {
  return (
    <nav className="l-nav">
      <div className="l-logo">
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8,
          background: '#F7C948', border: '2px solid #1C1A14',
          boxShadow: '2px 2px 0 #1C1A14', flexShrink: 0,
        }}>
          <svg width="17" height="17" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M295 60L140 295h135l-58 157L452 220H305z" fill="#1C1A14"/>
          </svg>
        </span>
        TalentFlow
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Link href="/login" style={{
          color: 'var(--ink)', fontWeight: 700, fontSize: 14,
          textDecoration: 'none', padding: '10px 18px',
          border: '2px solid var(--ink)', borderRadius: 100,
          background: 'transparent', whiteSpace: 'nowrap',
          boxShadow: '3px 3px 0 var(--ink)',
          transition: 'all 0.15s',
        }}>
          Espace Recruteurs
        </Link>
        <Link href="/demande-acces" className="l-nav-btn">
          Demander une démo →
        </Link>
      </div>
    </nav>
  )
}
