// Phrases motivationnelles pour le dashboard
// Rotation déterministe : seed = date (YYYY-MM-DD) + userId → même phrase toute la journée par user.
// v1.9.51 : tonalité professionnelle, sans blagues, sans émojis bateau.

export interface Stats {
  aTraiter?: number
  rappels?: number
  alertes?: number
  nouveauxMatches?: number
  scoreMax?: { candidatName: string; score: number } | null
  placesAujourdhui?: number
  candidatsImportesSemaine?: number
}

// Phrases contextuelles utiles — déclenchées si les stats correspondent.
// Gardées courtes, factuelles, actionnables.
const PHRASES_CONTEXTUELLES: ((s: Stats) => string | null)[] = [
  (s) => s.aTraiter && s.aTraiter > 0 ? `${s.aTraiter} candidat${s.aTraiter > 1 ? 's' : ''} à traiter aujourd'hui.` : null,
  (s) => s.rappels && s.rappels >= 3 ? `${s.rappels} rappels à suivre cette semaine.` : null,
  (s) => s.scoreMax && s.scoreMax.score >= 16 ? `Match fort détecté : ${s.scoreMax.candidatName} (${s.scoreMax.score}/20).` : null,
  (s) => s.placesAujourdhui && s.placesAujourdhui > 0 ? `${s.placesAujourdhui} placement${s.placesAujourdhui > 1 ? 's confirmés' : ' confirmé'} aujourd'hui.` : null,
]

// Phrases générales — sobres, pro, recrutement-oriented
const PHRASES_GENERALES = [
  "Un bon recrutement commence par une bonne écoute.",
  "La précision bat toujours la précipitation.",
  "Chaque CV mérite une lecture attentive.",
  "Le détail fait la différence — prends ton temps.",
  "Un candidat bien placé, c'est une relation qui dure.",
  "La qualité du matching dépend de la qualité des données.",
  "Pose les bonnes questions avant de proposer la bonne personne.",
  "Un recrutement réussi se prépare, il ne s'improvise pas.",
  "Le meilleur candidat n'est pas toujours celui qui postule en premier.",
  "Connais ton client, connais ton candidat.",
  "Une fiche bien remplie aujourd'hui, c'est un match gagné demain.",
  "L'instinct se nourrit de l'expérience — fais-lui confiance.",
  "Un mail bien rédigé vaut dix relances brouillonnes.",
  "Les soft skills se lisent entre les lignes.",
  "Le silence d'un candidat dit autant que ses réponses.",
  "Mieux vaut un non clair qu'un peut-être ambigu.",
  "La confiance se construit au premier contact.",
  "Un bon recruteur vend le projet, pas seulement le poste.",
  "Respecte chaque candidat — ils reviennent toujours plus vite qu'on ne pense.",
  "Le suivi post-placement est la meilleure publicité.",
  "Sois curieux, sois rigoureux, sois humain.",
  "Chaque entretien est une opportunité d'apprendre.",
  "Le bon recruteur ne place pas, il matche.",
  "L'écoute active est le premier outil du métier.",
  "Une base de candidats propre vaut mille placements.",
  "Prends le temps de comprendre avant de proposer.",
  "La patience n'est pas une faiblesse — c'est une compétence.",
  "Les meilleurs candidats ne sont pas toujours les plus bruyants.",
  "Un recruteur sérieux inspire des candidats sérieux.",
  "La clarté est le meilleur argument de vente.",
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

  // 35% chance d'afficher une phrase contextuelle utile (si disponible)
  const contextuelles = PHRASES_CONTEXTUELLES.map(fn => fn(stats)).filter(Boolean) as string[]
  if (contextuelles.length > 0 && seed % 100 < 35) {
    return contextuelles[seed % contextuelles.length]
  }

  return PHRASES_GENERALES[seed % PHRASES_GENERALES.length]
}
