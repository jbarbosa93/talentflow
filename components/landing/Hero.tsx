"use client";
import Link from "next/link"
import BlurFade from "@/components/magicui/blur-fade"
import NumberTicker from "@/components/magicui/number-ticker"

const candidates = [
  { letter: "M", name: "Marc Dupont",    tag: "En cours",  tagStyle: { background: "#FFF3E0", color: "#7A4500" }, bg: "#F5A623" },
  { letter: "S", name: "Sophie Martin",  tag: "Validé ✓",  tagStyle: { background: "#D1FAE5", color: "#065F46" }, bg: "#C8E6C9" },
  { letter: "A", name: "Alex Leroy",     tag: "Entretien", tagStyle: { background: "#DBEAFE", color: "#1E3A8A" }, bg: "#BBDEFB" },
]

export default function Hero() {
  return (
    <div className="l-hero">
      {/* ── Left ── */}
      <div>
        <BlurFade delay={0} inView>
          <div className="l-eyebrow">🤖 Propulsé par Claude AI — OneDrive Sync intégré</div>
        </BlurFade>

        <BlurFade delay={0.1} inView>
          <h1 className="l-h1">
            Recrutez avec{" "}
            <span className="l-squiggle">clarté</span>{" "}
            et efficacité
          </h1>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <p className="l-hero-text">
            Fini les CVs perdus dans les emails et les tableurs éparpillés.
            TalentFlow centralise tout et laisse l&apos;IA faire le gros du travail —
            vous, vous vous concentrez sur ce qui compte vraiment.
          </p>
        </BlurFade>

        <BlurFade delay={0.3} inView>
          <div className="l-actions">
            <Link href="/demande-acces" className="l-btn-main">
              Demander une démo →
            </Link>
          </div>
        </BlurFade>

        <BlurFade delay={0.4} inView>
          <div className="l-social-proof">
            <div className="l-avatars">
              {["JB", "ML", "SV", "AR"].map((initials, i) => (
                <div key={i} className="l-av" style={{ background: i === 0 ? '#F5A623' : i === 1 ? '#C8E6C9' : i === 2 ? '#BBDEFB' : '#F5D0A9' }}>
                  {initials}
                </div>
              ))}
            </div>
            <span><strong style={{ color: 'var(--ink)' }}>En phase bêta</strong> — utilisateurs actifs en Suisse</span>
          </div>
        </BlurFade>
      </div>

      {/* ── Right — Dashboard Mockup ── */}
      <BlurFade delay={0.2} inView className="l-hero-right">
        <div className="l-mockup-wrap">
          {/* Browser chrome */}
          <div className="l-mock-top">
            <div className="l-dots">
              <div className="l-dot" style={{ background: "#FF6060" }} />
              <div className="l-dot" style={{ background: "#FFD060" }} />
              <div className="l-dot" style={{ background: "#60D080" }} />
            </div>
            <div className="l-mock-title">TalentFlow — Tableau de bord</div>
          </div>

          {/* Body */}
          <div className="l-mock-body">
            <div className="l-mock-greeting">
              Bonjour, <span>Sophie</span> 👋
            </div>

            {/* Stats */}
            <div className="l-mock-stats">
              <div className="l-ms l-ms-active">
                <div className="l-ms-n">
                  <NumberTicker value={24} delay={0.5} />
                </div>
                <div className="l-ms-l">Actifs</div>
              </div>
              <div className="l-ms">
                <div className="l-ms-n">
                  <NumberTicker value={8} delay={0.6} />
                </div>
                <div className="l-ms-l">À traiter</div>
              </div>
              <div className="l-ms">
                <div className="l-ms-n">
                  <NumberTicker value={97} delay={0.7} />%
                </div>
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
      </BlurFade>
    </div>
  )
}
