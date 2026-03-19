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
        <li><a href="#">Blog</a></li>
      </ul>

      <Link href="/candidats" className="l-nav-btn">
        Essai gratuit →
      </Link>
    </nav>
  )
}
