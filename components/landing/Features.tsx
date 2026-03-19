const features = [
  { emoji: "🤖", title: "IA qui comprend vos candidats",   desc: "Analyse les CVs, résume les profils, suggère les meilleurs matchs — l'IA s'adapte à votre façon de recruter." },
  { emoji: "📋", title: "Pipeline visuel en Kanban",        desc: "Glissez, déposez, avancez. Suivez chaque candidat à chaque étape d'un simple coup d'œil." },
  { emoji: "📬", title: "Hub de communication",            desc: "Emails, rappels et messages au même endroit. Fini les onglets partout." },
  { emoji: "🔗", title: "Intégrations natives",             desc: "Microsoft 365, Google Drive, Slack — connecté en 5 minutes, aucune ligne de code." },
  { emoji: "🔔", title: "Rappels intelligents",             desc: "L'IA anticipe ce que vous risquez d'oublier et vous notifie exactement au bon moment." },
  { emoji: "🔒", title: "Hébergé en Suisse",                desc: "Données chiffrées, conformes RGPD, sur des serveurs suisses. Vos données restent vôtres." },
]

export default function Features() {
  return (
    <section id="fonctionnalites" className="l-section">
      <div className="l-tag">✦ Fonctionnalités</div>
      <h2 className="l-h2">
        Tout ce dont vous avez besoin,<br />vraiment.
      </h2>
      <p className="l-sub">
        Pas de fonctions inutiles. Juste les bons outils, bien pensés,
        qui font gagner du temps dès le premier jour.
      </p>

      <div className="l-feat-grid">
        {features.map((feat, i) => (
          <div key={i} className="l-feat-card">
            <span className="l-feat-emoji">{feat.emoji}</span>
            <h3 className="l-feat-title">{feat.title}</h3>
            <p className="l-feat-desc">{feat.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
