import Link from "next/link"
import BlurFade from "@/components/magicui/blur-fade"

export default function Beta() {
  return (
    <section id="beta">
      <BlurFade delay={0} inView>
        <div className="l-beta-wrap">
          <div className="l-beta-card">
            <div className="l-beta-badge">✦ Bêta</div>
            <h2 className="l-beta-title">
              TalentFlow est actuellement<br />en phase de développement.
            </h2>
            <p className="l-beta-sub">
              La plateforme est utilisée activement par des agences de recrutement en Suisse.
              Contactez-nous pour en savoir plus ou planifier une démonstration.
            </p>
            <Link href="/demande-acces" className="l-beta-btn">
              Demander une démo →
            </Link>
          </div>
        </div>
      </BlurFade>
    </section>
  )
}
