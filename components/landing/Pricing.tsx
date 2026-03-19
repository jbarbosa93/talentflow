import Link from "next/link"

const features = [
  "Toutes les fonctionnalités incluses",
  "IA illimitée, sans restriction",
  "Intégrations Microsoft 365, Slack",
  "Support prioritaire en moins de 24h",
  "Hébergement cloud Suisse sécurisé",
]

export default function Pricing() {
  return (
    <section id="tarifs" className="l-section">
      <div className="l-pricing-wrap">
        <div className="l-pricing-inner">
          {/* Left */}
          <div>
            <div className="l-tag">✦ Tarif</div>
            <h2 className="l-h2">
              Un prix clair.<br />Tout inclus.
            </h2>
            <p className="l-sub" style={{ marginBottom: 0 }}>
              Pas d&apos;abonnement caché, pas de module en extra. Un seul plan
              avec tout ce qu&apos;il vous faut pour démarrer et grandir.
            </p>
          </div>

          {/* Right — Price card */}
          <div className="l-price-card">
            <div className="l-price-name">⭐ TalentFlow Pro</div>

            <div className="l-price-num">
              <sup>CHF</sup>49
            </div>
            <div className="l-price-per">
              par utilisateur / mois · facturation annuelle
            </div>

            <ul className="l-price-list">
              {features.map((feat, i) => (
                <li key={i}>
                  <span className="l-price-check">✓</span>
                  {feat}
                </li>
              ))}
            </ul>

            <Link href="/candidats" className="l-price-btn">
              Démarrer l&apos;essai gratuit →
            </Link>
            <p className="l-price-note">
              14 jours gratuits · Sans carte bancaire · Résiliable à tout moment
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
