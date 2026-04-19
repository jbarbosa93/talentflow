// Phrases motivationnelles pour le dashboard, par STYLE choisi par le consultant.
// v1.9.52 : 4 styles (factuel / motivant / sage / aleatoire) + contextuelles transverses.
// Rotation déterministe seed = date + userId → même phrase toute la journée par user.

export type PhraseStyle = 'factuel' | 'motivant' | 'sage' | 'aleatoire'

export interface Stats {
  aTraiter?: number
  rappels?: number
  nouveauxMatches?: number
  scoreMax?: { candidatName: string; score: number } | null
  placesAujourdhui?: number
  candidatsImportesSemaine?: number
}

// Phrases contextuelles — affichées en priorité si les stats matchent (30% chance).
// Utilisées pour tous les styles, reformulation neutre.
const PHRASES_CONTEXTUELLES: ((s: Stats) => string | null)[] = [
  (s) => s.aTraiter && s.aTraiter > 0 ? `${s.aTraiter} candidat${s.aTraiter > 1 ? 's' : ''} à traiter aujourd'hui.` : null,
  (s) => s.rappels && s.rappels >= 3 ? `${s.rappels} rappels à suivre cette semaine.` : null,
  (s) => s.scoreMax && s.scoreMax.score >= 16 ? `Match fort détecté : ${s.scoreMax.candidatName} (${s.scoreMax.score}/20).` : null,
  (s) => s.placesAujourdhui && s.placesAujourdhui > 0 ? `${s.placesAujourdhui} placement${s.placesAujourdhui > 1 ? 's confirmés' : ' confirmé'} aujourd'hui.` : null,
]

// 🎯 FACTUEL — ton pro, chiffres, objectifs concrets
const PHRASES_FACTUEL = [
  "Chaque CV traité rapproche d'un placement.",
  "Objectif jour : 5 candidats qualifiés.",
  "Une base à jour = des matchs pertinents.",
  "Le suivi post-placement fidélise le client.",
  "Relance = 40% de retour en moyenne.",
  "Un candidat par jour, une commande par semaine.",
  "Les KPIs ne mentent pas — lis-les tous les matins.",
  "Pipeline propre = prévisions fiables.",
  "Qualifie d'abord, propose ensuite.",
  "Un doublon évité aujourd'hui = 10 minutes gagnées demain.",
  "Meilleur taux de conversion : appel en moins de 24h.",
  "Les fiches complètes se placent 3x plus vite.",
  "Chaque entretien passé enrichit ta base de référence.",
  "Le bon candidat est souvent déjà dans ton pipeline.",
  "Une commande bien briefée se remplit 2x plus vite.",
]

// 💪 MOTIVANT — énergie, encouragement, élan
const PHRASES_MOTIVANT = [
  "Aujourd'hui est une bonne journée pour placer quelqu'un.",
  "Un bon recruteur change des vies — parfois deux.",
  "La perle rare existe, continue de chercher.",
  "Chaque appel est une opportunité.",
  "Ton énergie du matin donne le ton de la journée.",
  "Les plus beaux placements commencent par un CV qu'on a failli ignorer.",
  "Crois au talent que tu proposes.",
  "Le succès, c'est la somme des petits efforts répétés.",
  "Un non aujourd'hui, c'est un oui plus tard.",
  "Tu es plus proche du prochain placement qu'il ne te semble.",
  "Fais confiance à ton instinct — il s'affine chaque jour.",
  "Un recruteur qui écoute vaut dix qui vendent.",
  "La prochaine super candidature est à un clic.",
  "L'effort constant bat toujours le sprint isolé.",
  "Chaque journée bien remplie rapproche du mois excellent.",
]

// 🧘 SAGE — proverbes métier, réflexion, posture
const PHRASES_SAGE = [
  "Un bon recrutement commence par une bonne écoute.",
  "La précision bat toujours la précipitation.",
  "Le détail fait la différence — prends ton temps.",
  "Connais ton client avant de proposer.",
  "Un silence en entretien dit autant que mille mots.",
  "Les soft skills se lisent entre les lignes.",
  "Mieux vaut un non clair qu'un peut-être ambigu.",
  "Le bon candidat n'est pas toujours le plus bruyant.",
  "La patience est une compétence, pas une faiblesse.",
  "Sois curieux, sois rigoureux, sois humain.",
  "Ce que tu sèmes en écoute, tu le récoltes en confiance.",
  "Un recruteur sérieux inspire des candidats sérieux.",
  "La clarté est le meilleur argument de vente.",
  "Respecte chaque candidat — ils reviennent toujours.",
  "Une relation professionnelle se construit sur la durée.",
]

function poolFor(style: PhraseStyle): string[] {
  switch (style) {
    case 'factuel':   return PHRASES_FACTUEL
    case 'motivant':  return PHRASES_MOTIVANT
    case 'sage':      return PHRASES_SAGE
    case 'aleatoire':
    default:          return [...PHRASES_FACTUEL, ...PHRASES_MOTIVANT, ...PHRASES_SAGE]
  }
}

// Seed déterministe : jour + user
function dailySeed(userId: string): number {
  const today = new Date().toISOString().slice(0, 10)
  const str = `${today}-${userId}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getMotivationalPhrase(
  userId: string,
  _stats: Stats = {},
  style: PhraseStyle = 'aleatoire',
): string {
  // Afficher toujours une phrase du style choisi (les contextuelles masquaient le choix user).
  // Les stats (à traiter, rappels) sont déjà visibles dans les badges du header.
  const seed = dailySeed(userId)
  const pool = poolFor(style)
  return pool[seed % pool.length]
}
