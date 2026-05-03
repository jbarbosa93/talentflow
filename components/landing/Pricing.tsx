import Link from "next/link"
import BlurFade from "@/components/magicui/blur-fade"

export default function Beta() {
  return (
    <section id="demo">
      <BlurFade delay={0} inView>
        <div className="l-beta-wrap">
          <div className="l-beta-card">
            <div className="l-beta-badge">✦ Démo</div>
            <h2 className="l-beta-title">
              Prêt à voir TalentFlow<br />en action&nbsp;?
            </h2>
            <p className="l-beta-sub">
              La plateforme est utilisée activement par des agences de recrutement en Suisse.
              Contactez-nous pour planifier une démonstration personnalisée.
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
