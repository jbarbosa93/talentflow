import Link from "next/link"

export default function Footer() {
  return (
    <footer className="l-footer">
      <div className="l-footer-grid">
        {/* Col 1 — Brand */}
        <div>
          <div className="l-footer-logo">
            <span className="l-logo-dot" style={{ boxShadow: "0 0 0 3px rgba(245,166,35,0.2)" }} />
            TalentFlow
          </div>
          <p className="l-footer-tagline">
            ATS nouvelle génération pour les agences de recrutement. Propulsé par Claude AI.
          </p>
        </div>

        {/* Col 2 — Navigation */}
        <div>
          <p className="l-footer-col-title">Plateforme</p>
          <ul className="l-footer-links">
            <li><a href="/#fonctionnalites">Fonctionnalités</a></li>
            <li><a href="/#beta">Demander une démo</a></li>
            <li><Link href="/login">Espace Recruteurs</Link></li>
          </ul>
        </div>

        {/* Col 3 — Légal */}
        <div>
          <p className="l-footer-col-title">Légal</p>
          <ul className="l-footer-links">
            <li><Link href="/cgu">Conditions d&apos;utilisation</Link></li>
            <li><Link href="/confidentialite">Politique de confidentialité</Link></li>
            <li><Link href="/mentions-legales">Mentions légales</Link></li>
          </ul>
        </div>
      </div>

      <div className="l-footer-bottom">
        <p>© 2026 TalentFlow — Valais, Suisse. Tous droits réservés.</p>
        <span className="l-footer-beta">En phase bêta</span>
      </div>
    </footer>
  )
}
