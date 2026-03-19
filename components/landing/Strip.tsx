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
    <div className="l-strip">
      <div className="l-strip-inner">
        {[...items, ...items].map((item, i) => (
          <span key={i} className="l-strip-item">
            <b>{item.bold}</b> {item.text}
            <span className="l-strip-sep">✦</span>
          </span>
        ))}
      </div>
    </div>
  )
}
