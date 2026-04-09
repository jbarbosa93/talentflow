import { MagicCard } from "@/components/magicui/magic-card"
import BlurFade from "@/components/magicui/blur-fade"

const features = [
  { emoji: "🤖", title: "Parsing CV par IA",                desc: "Claude AI analyse chaque CV : nom, compétences, expériences, formations, langues. PDF, Word, images — tout est extrait automatiquement en quelques secondes." },
  { emoji: "☁️", title: "OneDrive Sync automatique",        desc: "Synchronisation récursive toutes les 10 minutes depuis OneDrive. Déduplication intelligente, détection de mises à jour par contenu, catégorisation des documents." },
  { emoji: "🎯", title: "Matching IA candidat / offre",     desc: "Score de matching détaillé entre candidats et offres. Analyse continue en arrière-plan avec présélection automatique et historique des matchings." },
  { emoji: "📦", title: "Import en masse",                  desc: "Importez des centaines de CVs d'un coup via ZIP, PDF ou Word. Traitement en arrière-plan avec détection de doublons et retry automatique." },
  { emoji: "📋", title: "Pipeline Kanban",                  desc: "Suivez chaque candidat étape par étape : Nouveau, Contacté, Entretien, Placé. Glissez-déposez, aperçu CV au survol, notes toujours visibles." },
  { emoji: "🔍", title: "Détection de doublons IA",         desc: "L'IA compare vos candidats et détecte les profils en double. Fusion intelligente qui combine le maximum d'informations des deux fiches." },
  { emoji: "📧", title: "Emails & WhatsApp",                desc: "Envoyez emails et messages WhatsApp directement depuis la fiche candidat. Templates personnalisables, historique des envois complet." },
  { emoji: "✅", title: "Workflow de traitement",            desc: "Chaque CV importé passe par une étape de vérification avant d'entrer dans la base active. Rien ne vous échappe, tout est traçable." },
  { emoji: "📅", title: "Gestion des entretiens",           desc: "Planifiez visio, présentiel ou téléphone. Rappels avec notifications, suivi des statuts, badge sidebar pour ne rien manquer." },
  { emoji: "📸", title: "Extraction photos automatique",    desc: "L'IA détecte et extrait les photos de portrait depuis les CVs DOCX/PDF. Validation manuelle avant ajout, crop intégré." },
  { emoji: "📊", title: "Logs & historique complet",         desc: "Traçabilité de toutes les actions : imports, erreurs, fusions, messages envoyés. Timeline par onglet, recherche PostgreSQL full-text." },
  { emoji: "🔒", title: "Conformité LPD & RGPD",            desc: "Données hébergées en Suisse, conformes à la LPD et au RGPD. Authentification 2FA sécurisée, RLS Supabase par utilisateur." },
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
          <BlurFade key={i} delay={0.1 + i * 0.04} inView>
            <MagicCard className="l-feat-card h-full" gradientColor="#F5A623" gradientOpacity={0.1}>
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
