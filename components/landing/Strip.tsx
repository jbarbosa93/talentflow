import Marquee from "@/components/magicui/marquee"

const items = [
  { bold: "Claude AI",   text: "parsing CVs" },
  { bold: "OneDrive",    text: "sync automatique" },
  { bold: "3 sec",       text: "par CV" },
  { bold: "Pipeline",    text: "Kanban drag & drop" },
  { bold: "Matching IA", text: "candidat / offre" },
  { bold: "LPD",         text: "Droit suisse" },
  { bold: "RGPD",        text: "Conforme" },
  { bold: "WhatsApp",    text: "& Email intégrés" },
]

export default function Strip() {
  return (
    <div className="l-strip" style={{ overflow: "hidden" }}>
      <Marquee pauseOnHover repeat={4} className="[--duration:35s] [--gap:0rem] py-0">
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
