import Link from "next/link"

const candidates = [
  { letter: "M", name: "Marc Dupont",    tag: "En cours",  tagStyle: { background: "#FFF3C4", color: "#7A5F00" }, bg: "#F7C948" },
  { letter: "S", name: "Sophie Martin",  tag: "Validé ✓",  tagStyle: { background: "#D1FAE5", color: "#065F46" }, bg: "#C8E6C9" },
  { letter: "A", name: "Alex Leroy",     tag: "Entretien", tagStyle: { background: "#DBEAFE", color: "#1E3A8A" }, bg: "#BBDEFB" },
]

export default function Hero() {
  return (
    <div className="l-hero">
      {/* ── Left ── */}
      <div>
        <div className="l-eyebrow">🎉 Nouveau — Propulsé par Claude AI</div>

        <h1 className="l-h1">
          Recrutez avec{" "}
          <span className="l-squiggle">clarté</span>{" "}
          et efficacité
        </h1>

        <p className="l-hero-text">
          Fini les CVs perdus dans les emails et les tableurs éparpillés.
          TalentFlow centralise tout et laisse l&apos;IA faire le gros du travail —
          vous, vous vous concentrez sur ce qui compte vraiment.
        </p>

        <div className="l-actions">
          <Link href="/register" className="l-btn-main">
            Commencer gratuitement
          </Link>
          <Link href="/login" className="l-btn-ghost">
            Espace Recruteurs →
          </Link>
        </div>

        <div className="l-social-proof">
          <div className="l-avatars">
            {[
              { l: "M", bg: "#F7C948" },
              { l: "S", bg: "#C8E6C9" },
              { l: "A", bg: "#BBDEFB" },
              { l: "L", bg: "#F8BBD9" },
            ].map((av, i) => (
              <div key={i} className="l-av" style={{ background: av.bg }}>
                {av.l}
              </div>
            ))}
          </div>
          <span>
            Plus de <strong>500 équipes</strong> l&apos;utilisent chaque jour
          </span>
        </div>
      </div>

      {/* ── Right — Dashboard Mockup ── */}
      <div className="l-hero-right">
        <div className="l-mockup-wrap">
          {/* Browser chrome */}
          <div className="l-mock-top">
            <div className="l-dots">
              <div className="l-dot" style={{ background: "#FF6060" }} />
              <div className="l-dot" style={{ background: "#FFD060" }} />
              <div className="l-dot" style={{ background: "#60D080" }} />
            </div>
            <div className="l-mock-title">talentflow.io — Tableau de bord</div>
          </div>

          {/* Body */}
          <div className="l-mock-body">
            <div className="l-mock-greeting">
              Bonjour, <span>Sophie</span> 👋
            </div>

            {/* Stats */}
            <div className="l-mock-stats">
              <div className="l-ms l-ms-active">
                <div className="l-ms-n">24</div>
                <div className="l-ms-l">En cours</div>
              </div>
              <div className="l-ms">
                <div className="l-ms-n">8</div>
                <div className="l-ms-l">À valider</div>
              </div>
              <div className="l-ms">
                <div className="l-ms-n">97%</div>
                <div className="l-ms-l">Score IA</div>
              </div>
            </div>

            {/* Candidate list */}
            <div className="l-mock-list">
              {candidates.map((c, i) => (
                <div key={i} className="l-mock-item">
                  <div className="l-mock-av" style={{ background: c.bg }}>{c.letter}</div>
                  <div className="l-mock-name">{c.name}</div>
                  <span className="l-mock-tag" style={c.tagStyle}>{c.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Floating badge */}
        <div className="l-floating-card">
          <span style={{ fontSize: 20 }}>⚡</span>
          <span>CV analysé en <strong>3 secondes</strong></span>
        </div>
      </div>
    </div>
  )
}
