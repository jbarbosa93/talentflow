import Link from "next/link"

export default function Navbar() {
  return (
    <nav className="l-nav">
      <div className="l-logo">
        <span className="l-logo-dot" />
        TalentFlow
      </div>

      <ul className="l-nav-links">
        <li><a href="#fonctionnalites">Fonctionnalités</a></li>
        <li><a href="#tarifs">Tarifs</a></li>
      </ul>

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
          Essai gratuit →
        </Link>
      </div>
    </nav>
  )
}
