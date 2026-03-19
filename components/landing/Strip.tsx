import Marquee from "@/components/magicui/marquee"

const items = [
  { bold: "70%",    text: "de temps gagné" },
  { bold: "3×",     text: "plus rapide" },
  { bold: "<24h",   text: "Support" },
  { bold: "Claude", text: "IA intégrée" },
  { bold: "Suisse", text: "Cloud sécurisé" },
  { bold: "RGPD",   text: "Conforme" },
]

export default function Strip() {
  return (
    <div className="l-strip" style={{ overflow: "hidden" }}>
      <Marquee pauseOnHover repeat={4} className="[--duration:30s] [--gap:0rem] py-0">
        {items.map((item, i) => (
          <span key={i} className="l-strip-item">
            <b>{item.bold}</b> {item.text}
            <span className="l-strip-sep">✦</span>
          </span>
        ))}
      </Marquee>
    </div>
  )
}
