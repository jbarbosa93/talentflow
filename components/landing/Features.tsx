import { MagicCard } from "@/components/magicui/magic-card"
import BlurFade from "@/components/magicui/blur-fade"

const features = [
  { emoji: "🤖", title: "Parsing CV par IA",                desc: "Claude AI analyse chaque CV : nom, compétences, expériences, formations, langues. PDF, Word, images — tout est extrait automatiquement." },
  { emoji: "📦", title: "Import en masse",                  desc: "Importez des centaines de CVs d'un coup. Traitement en arrière-plan avec détection de doublons et retry automatique." },
  { emoji: "🔍", title: "Détection de doublons IA",         desc: "L'IA compare vos candidats et détecte les profils en double. Fusion intelligente qui combine le maximum d'informations." },
  { emoji: "✅", title: "Workflow de traitement",            desc: "Chaque CV importé passe par une étape de vérification avant d'entrer dans la base active. Rien ne vous échappe." },
  { emoji: "🎯", title: "Matching IA candidat/offre",       desc: "Score de matching détaillé entre candidats et commandes. Analyse continue en arrière-plan avec pause/reprise." },
  { emoji: "📋", title: "Pipeline Kanban",                  desc: "Suivez chaque candidat étape par étape : Nouveau, Contacté, Entretien, Placé. Glissez-déposez pour avancer." },
  { emoji: "📧", title: "Emails & WhatsApp",                desc: "Envoyez emails et messages WhatsApp directement depuis la fiche candidat. Templates personnalisables." },
  { emoji: "📅", title: "Gestion des entretiens",           desc: "Planifiez visio, présentiel ou téléphone. Suivi des statuts et rappels intégrés." },
  { emoji: "🔗", title: "Microsoft 365 & SharePoint",       desc: "Synchronisez vos emails Outlook, importez des CVs depuis SharePoint. Connexion en un clic." },
  { emoji: "📸", title: "Extraction photos automatique",    desc: "L'IA détecte et extrait les photos de portrait depuis les CVs PDF. Validation manuelle avant ajout." },
  { emoji: "📊", title: "Logs & historique complet",         desc: "Traçabilité de toutes les actions : imports, erreurs, fusions, modifications. Groupé par session." },
  { emoji: "🔒", title: "Hébergé en Suisse",                desc: "Données chiffrées, conformes RGPD, sur des serveurs suisses. Authentification 2FA sécurisée." },
]

export default function Features() {
  return (
    <section id="fonctionnalites" className="l-section">
      <BlurFade delay={0} inView>
        <div className="l-tag">✦ Fonctionnalités</div>
      </BlurFade>
      <BlurFade delay={0.1} inView>
        <h2 className="l-h2">
          Tout ce dont vous avez besoin,<br />vraiment.
        </h2>
      </BlurFade>
      <BlurFade delay={0.2} inView>
        <p className="l-sub">
          Pas de fonctions inutiles. Juste les bons outils, bien pensés,
          qui font gagner du temps dès le premier jour.
        </p>
      </BlurFade>

      <div className="l-feat-grid">
        {features.map((feat, i) => (
          <BlurFade key={i} delay={0.1 + i * 0.05} inView>
            <MagicCard className="l-feat-card h-full" gradientColor="#F7C948" gradientOpacity={0.12}>
              <span className="l-feat-emoji">{feat.emoji}</span>
              <h3 className="l-feat-title">{feat.title}</h3>
              <p className="l-feat-desc">{feat.desc}</p>
            </MagicCard>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}
