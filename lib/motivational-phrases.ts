// Phrases motivationnelles pour le dashboard
// Rotation déterministe : seed = date (YYYY-MM-DD) + userId (ou email) → même phrase toute la journée par user

export interface Stats {
  aTraiter?: number
  rappels?: number
  alertes?: number
  nouveauxMatches?: number
  scoreMax?: { candidatName: string; score: number } | null
  placesAujourdhui?: number
  candidatsImportesSemaine?: number
}

const PHRASES_CONTEXTUELLES: ((s: Stats) => string | null)[] = [
  (s) => s.aTraiter && s.aTraiter > 0 ? `${s.aTraiter} nouveaux candidats attendent ton regard.` : null,
  (s) => s.rappels && s.rappels >= 3 ? `${s.rappels} rappels cette semaine, prends un café et c'est parti ☕` : null,
  (s) => s.scoreMax && s.scoreMax.score >= 16 ? `${s.scoreMax.candidatName} vient d'obtenir un score de matching de ${s.scoreMax.score}/20.` : null,
  (s) => s.placesAujourdhui && s.placesAujourdhui > 0 ? `${s.placesAujourdhui} placement${s.placesAujourdhui > 1 ? 's' : ''} aujourd'hui — belle journée !` : null,
  (s) => s.candidatsImportesSemaine && s.candidatsImportesSemaine >= 100 ? `${s.candidatsImportesSemaine} CVs traités cette semaine, 👏 impressionnant.` : null,
  (s) => s.aTraiter && s.aTraiter === 0 ? `Zéro candidat en attente. Tu es à jour, bravo !` : null,
  (s) => s.nouveauxMatches && s.nouveauxMatches > 0 ? `${s.nouveauxMatches} nouveaux matches potentiels à examiner.` : null,
]

const PHRASES_GENERALES = [
  "Chaque CV est une histoire, bien lu = bien matché.",
  "La meilleure candidature est celle qu'on a pris le temps d'analyser.",
  "Aujourd'hui est une bonne journée pour trouver la perle rare.",
  "Un bon recrutement change une vie. Parfois deux.",
  "La qualité bat toujours la quantité.",
  "Respire, écoute, match. Dans cet ordre.",
  "Un détail sur un CV peut tout changer, reste attentif.",
  "Le bon candidat existe — il faut juste le trouver.",
  "Bien placer un candidat, c'est un double succès.",
  "La patience est une compétence de recruteur.",
  "Un email bien écrit vaut dix mal pensés.",
  "Relire un CV, c'est parfois y trouver l'évidence qu'on a manquée.",
  "Le matching parfait n'existe pas, mais la meilleure option oui.",
  "Chaque entretien est une occasion d'apprendre.",
  "Les talents sont partout, il suffit de savoir regarder.",
  "Fais confiance à ton instinct, mais vérifie les faits.",
  "Une bonne note sur une fiche peut sauver un match plus tard.",
  "Le détail qui fait la différence, c'est toi qui le vois.",
  "L'écoute active est ton meilleur outil.",
  "Un candidat satisfait en parle à 5 personnes.",
]

const PHRASES_LEGERES = [
  "Café ☕ + TalentFlow = combo gagnant.",
  "Encore un CV ? Allons-y champion 💪",
  "Les candidats t'attendent. Enfin, leurs CV.",
  "Recruter, c'est un peu comme Tinder, mais sérieux.",
  "Un CV par jour éloigne le chômage pour toujours.",
  "TalentFlow, ton copilote recrutement.",
  "Let's match! (professionnellement, évidemment)",
  "Ton super-pouvoir : matcher les bonnes personnes.",
  "Plus qu'un CV à traiter et c'est l'apéro 🍹",
  "Tu es à 1 match près du héros du jour.",
]

// Seed déterministe : jour + identifiant user
function dailySeed(userId: string): number {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const str = `${today}-${userId}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getMotivationalPhrase(userId: string, stats: Stats = {}): string {
  const seed = dailySeed(userId)

  // 40% chance d'avoir une phrase contextuelle si elle existe
  const contextuelles = PHRASES_CONTEXTUELLES.map(fn => fn(stats)).filter(Boolean) as string[]
  if (contextuelles.length > 0 && seed % 100 < 40) {
    return contextuelles[seed % contextuelles.length]
  }

  // 70% générales / 30% légères
  const useGenerale = seed % 100 < 70
  const pool = useGenerale ? PHRASES_GENERALES : PHRASES_LEGERES
  return pool[seed % pool.length]
}
