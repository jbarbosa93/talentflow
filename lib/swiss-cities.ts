// lib/swiss-cities.ts — v1.9.82
// Coordonnées GPS approximatives des principales villes suisses (focus Romandie).
// Utilisé par le matching IA (preselect) pour exclure les candidats trop éloignés
// du lieu de la mission (cutoff 80km par défaut).
//
// Source : coords arrondies à 4 décimales (~10m précision), suffisant pour un seuil 80km.
// Si une ville n'est pas dans cette liste, le matching ne fait PAS de cutoff distance
// (fallback "safe" : on inclut le candidat, à charge pour Claude de juger).

export type CityCoord = {
  name: string       // forme normalisée (lowercase sans accents)
  canton: string     // code canton 2 lettres
  lat: number
  lon: number
}

export const SWISS_CITIES: CityCoord[] = [
  // ─── Vaud (VD) ───────────────────────────────────────────────────────────
  { name: 'lausanne',      canton: 'vd', lat: 46.5197, lon: 6.6323 },
  { name: 'yverdon',       canton: 'vd', lat: 46.7785, lon: 6.6411 },
  { name: 'yverdon-les-bains', canton: 'vd', lat: 46.7785, lon: 6.6411 },
  { name: 'vevey',         canton: 'vd', lat: 46.4628, lon: 6.8419 },
  { name: 'montreux',      canton: 'vd', lat: 46.4312, lon: 6.9107 },
  { name: 'morges',        canton: 'vd', lat: 46.5089, lon: 6.4985 },
  { name: 'nyon',          canton: 'vd', lat: 46.3833, lon: 6.2367 },
  { name: 'gland',         canton: 'vd', lat: 46.4178, lon: 6.2700 },
  { name: 'aigle',         canton: 'vd', lat: 46.3167, lon: 6.9667 },
  { name: 'renens',        canton: 'vd', lat: 46.5413, lon: 6.5878 },
  { name: 'payerne',       canton: 'vd', lat: 46.8222, lon: 6.9389 },
  { name: 'pully',         canton: 'vd', lat: 46.5089, lon: 6.6611 },
  { name: 'prilly',        canton: 'vd', lat: 46.5378, lon: 6.6044 },
  { name: 'echallens',     canton: 'vd', lat: 46.6406, lon: 6.6336 },
  { name: 'orbe',          canton: 'vd', lat: 46.7256, lon: 6.5333 },
  { name: 'moudon',        canton: 'vd', lat: 46.6700, lon: 6.7958 },
  { name: 'lutry',         canton: 'vd', lat: 46.5028, lon: 6.6856 },
  { name: 'cossonay',      canton: 'vd', lat: 46.6133, lon: 6.5061 },
  { name: 'la tour-de-peilz', canton: 'vd', lat: 46.4544, lon: 6.8617 },
  { name: 'bex',           canton: 'vd', lat: 46.2511, lon: 7.0117 },
  { name: 'vallorbe',      canton: 'vd', lat: 46.7117, lon: 6.3742 },
  { name: 'crissier',      canton: 'vd', lat: 46.5494, lon: 6.5778 },
  { name: 'rolle',         canton: 'vd', lat: 46.4583, lon: 6.3389 },
  { name: 'avenches',      canton: 'vd', lat: 46.8800, lon: 7.0400 },
  { name: 'epalinges',     canton: 'vd', lat: 46.5644, lon: 6.6611 },
  { name: 'le mont-sur-lausanne', canton: 'vd', lat: 46.5683, lon: 6.6311 },

  // ─── Valais (VS) ──────────────────────────────────────────────────────────
  { name: 'sion',          canton: 'vs', lat: 46.2333, lon: 7.3500 },
  { name: 'martigny',      canton: 'vs', lat: 46.1028, lon: 7.0728 },
  { name: 'monthey',       canton: 'vs', lat: 46.2533, lon: 6.9528 },
  { name: 'sierre',        canton: 'vs', lat: 46.2917, lon: 7.5333 },
  { name: 'brigue',        canton: 'vs', lat: 46.3167, lon: 7.9886 },
  { name: 'brig',          canton: 'vs', lat: 46.3167, lon: 7.9886 },
  { name: 'visp',          canton: 'vs', lat: 46.2933, lon: 7.8819 },
  { name: 'viege',         canton: 'vs', lat: 46.2933, lon: 7.8819 },
  { name: 'saint-maurice', canton: 'vs', lat: 46.2178, lon: 7.0042 },
  { name: 'st-maurice',    canton: 'vs', lat: 46.2178, lon: 7.0042 },
  { name: 'conthey',       canton: 'vs', lat: 46.2222, lon: 7.3083 },
  { name: 'saxon',         canton: 'vs', lat: 46.1500, lon: 7.1819 },
  { name: 'riddes',        canton: 'vs', lat: 46.1722, lon: 7.2275 },
  { name: 'vetroz',        canton: 'vs', lat: 46.2153, lon: 7.2856 },
  { name: 'chamoson',      canton: 'vs', lat: 46.2008, lon: 7.2256 },
  { name: 'fully',         canton: 'vs', lat: 46.1389, lon: 7.1167 },
  { name: 'vouvry',        canton: 'vs', lat: 46.3372, lon: 6.8889 },
  { name: 'collombey',     canton: 'vs', lat: 46.2767, lon: 6.9558 },
  { name: 'verbier',       canton: 'vs', lat: 46.0967, lon: 7.2289 },
  { name: 'crans-montana', canton: 'vs', lat: 46.3133, lon: 7.4789 },
  { name: 'champery',      canton: 'vs', lat: 46.1789, lon: 6.8742 },
  { name: 'leytron',       canton: 'vs', lat: 46.1842, lon: 7.2069 },
  { name: 'evionnaz',      canton: 'vs', lat: 46.1828, lon: 7.0247 },
  { name: 'salvan',        canton: 'vs', lat: 46.1422, lon: 7.0117 },
  { name: 'ardon',         canton: 'vs', lat: 46.2103, lon: 7.2606 },
  { name: 'sembrancher',   canton: 'vs', lat: 46.0828, lon: 7.1486 },
  { name: 'orsieres',      canton: 'vs', lat: 46.0306, lon: 7.1469 },
  { name: 'bagnes',        canton: 'vs', lat: 46.0833, lon: 7.2253 },
  { name: 'naters',        canton: 'vs', lat: 46.3267, lon: 7.9886 },
  { name: 'leuk',          canton: 'vs', lat: 46.3158, lon: 7.6336 },
  { name: 'loeche',        canton: 'vs', lat: 46.3158, lon: 7.6336 },
  { name: 'savièse',       canton: 'vs', lat: 46.2658, lon: 7.3344 },
  { name: 'saviese',       canton: 'vs', lat: 46.2658, lon: 7.3344 },

  // ─── Genève (GE) ──────────────────────────────────────────────────────────
  { name: 'geneve',        canton: 'ge', lat: 46.2044, lon: 6.1432 },
  { name: 'carouge',       canton: 'ge', lat: 46.1817, lon: 6.1397 },
  { name: 'meyrin',        canton: 'ge', lat: 46.2333, lon: 6.0731 },
  { name: 'versoix',       canton: 'ge', lat: 46.2839, lon: 6.1656 },
  { name: 'vernier',       canton: 'ge', lat: 46.2167, lon: 6.0833 },
  { name: 'onex',          canton: 'ge', lat: 46.1828, lon: 6.1011 },
  { name: 'lancy',         canton: 'ge', lat: 46.1842, lon: 6.1228 },
  { name: 'plan-les-ouates', canton: 'ge', lat: 46.1644, lon: 6.1208 },
  { name: 'thonex',        canton: 'ge', lat: 46.1969, lon: 6.1969 },
  { name: 'chene-bourg',   canton: 'ge', lat: 46.1958, lon: 6.1922 },
  { name: 'chene-bougeries', canton: 'ge', lat: 46.1972, lon: 6.1842 },

  // ─── Fribourg (FR) ────────────────────────────────────────────────────────
  { name: 'fribourg',      canton: 'fr', lat: 46.8065, lon: 7.1619 },
  { name: 'bulle',         canton: 'fr', lat: 46.6181, lon: 7.0567 },
  { name: 'romont',        canton: 'fr', lat: 46.6961, lon: 6.9117 },
  { name: 'estavayer',     canton: 'fr', lat: 46.8500, lon: 6.8500 },
  { name: 'estavayer-le-lac', canton: 'fr', lat: 46.8500, lon: 6.8500 },
  { name: 'chatel-saint-denis', canton: 'fr', lat: 46.5275, lon: 6.9039 },
  { name: 'marly',         canton: 'fr', lat: 46.7847, lon: 7.1611 },
  { name: 'villars-sur-glane', canton: 'fr', lat: 46.7917, lon: 7.1281 },
  { name: 'gruyeres',      canton: 'fr', lat: 46.5847, lon: 7.0817 },
  { name: 'morat',         canton: 'fr', lat: 46.9286, lon: 7.1119 },
  { name: 'murten',        canton: 'fr', lat: 46.9286, lon: 7.1119 },

  // ─── Neuchâtel (NE) ───────────────────────────────────────────────────────
  { name: 'neuchatel',     canton: 'ne', lat: 46.9925, lon: 6.9311 },
  { name: 'la chaux-de-fonds', canton: 'ne', lat: 47.0997, lon: 6.8269 },
  { name: 'le locle',      canton: 'ne', lat: 47.0567, lon: 6.7497 },
  { name: 'boudry',        canton: 'ne', lat: 46.9522, lon: 6.8328 },
  { name: 'marin',         canton: 'ne', lat: 47.0089, lon: 7.0017 },
  { name: 'val-de-ruz',    canton: 'ne', lat: 47.0517, lon: 6.9189 },

  // ─── Jura (JU) ────────────────────────────────────────────────────────────
  { name: 'delemont',      canton: 'ju', lat: 47.3667, lon: 7.3500 },
  { name: 'porrentruy',    canton: 'ju', lat: 47.4167, lon: 7.0750 },
  { name: 'saignelegier',  canton: 'ju', lat: 47.2511, lon: 6.9961 },

  // ─── Berne (BE) ───────────────────────────────────────────────────────────
  { name: 'berne',         canton: 'be', lat: 46.9481, lon: 7.4474 },
  { name: 'bern',          canton: 'be', lat: 46.9481, lon: 7.4474 },
  { name: 'bienne',        canton: 'be', lat: 47.1372, lon: 7.2467 },
  { name: 'biel',          canton: 'be', lat: 47.1372, lon: 7.2467 },
  { name: 'moutier',       canton: 'be', lat: 47.2792, lon: 7.3711 },
  { name: 'tramelan',      canton: 'be', lat: 47.2233, lon: 7.1075 },
  { name: 'saint-imier',   canton: 'be', lat: 47.1528, lon: 6.9892 },
  { name: 'tavannes',      canton: 'be', lat: 47.2233, lon: 7.1972 },
  { name: 'thoune',        canton: 'be', lat: 46.7583, lon: 7.6275 },
  { name: 'thun',          canton: 'be', lat: 46.7583, lon: 7.6275 },
  { name: 'spiez',         canton: 'be', lat: 46.6906, lon: 7.6817 },
  { name: 'interlaken',    canton: 'be', lat: 46.6850, lon: 7.8639 },
  { name: 'langenthal',    canton: 'be', lat: 47.2128, lon: 7.7872 },
  { name: 'burgdorf',      canton: 'be', lat: 47.0594, lon: 7.6258 },

  // ─── Tessin (TI) ──────────────────────────────────────────────────────────
  { name: 'lugano',        canton: 'ti', lat: 46.0050, lon: 8.9536 },
  { name: 'bellinzone',    canton: 'ti', lat: 46.1947, lon: 9.0244 },
  { name: 'bellinzona',    canton: 'ti', lat: 46.1947, lon: 9.0244 },
  { name: 'locarno',       canton: 'ti', lat: 46.1700, lon: 8.7950 },
  { name: 'mendrisio',     canton: 'ti', lat: 45.8700, lon: 8.9831 },

  // ─── Zurich (ZH) ──────────────────────────────────────────────────────────
  { name: 'zurich',        canton: 'zh', lat: 47.3769, lon: 8.5417 },
  { name: 'zürich',        canton: 'zh', lat: 47.3769, lon: 8.5417 },
  { name: 'winterthur',    canton: 'zh', lat: 47.5000, lon: 8.7244 },
  { name: 'uster',         canton: 'zh', lat: 47.3469, lon: 8.7211 },
  { name: 'kloten',        canton: 'zh', lat: 47.4517, lon: 8.5853 },

  // ─── Bâle (BS / BL) ───────────────────────────────────────────────────────
  { name: 'bale',          canton: 'bs', lat: 47.5596, lon: 7.5886 },
  { name: 'basel',         canton: 'bs', lat: 47.5596, lon: 7.5886 },
  { name: 'liestal',       canton: 'bl', lat: 47.4842, lon: 7.7350 },
  { name: 'allschwil',     canton: 'bl', lat: 47.5511, lon: 7.5394 },
  { name: 'reinach',       canton: 'bl', lat: 47.4969, lon: 7.5917 },

  // ─── Soleure (SO) ─────────────────────────────────────────────────────────
  { name: 'soleure',       canton: 'so', lat: 47.2078, lon: 7.5375 },
  { name: 'solothurn',     canton: 'so', lat: 47.2078, lon: 7.5375 },
  { name: 'olten',         canton: 'so', lat: 47.3500, lon: 7.9000 },
  { name: 'grenchen',      canton: 'so', lat: 47.1908, lon: 7.3961 },

  // ─── Argovie (AG) ─────────────────────────────────────────────────────────
  { name: 'aarau',         canton: 'ag', lat: 47.3917, lon: 8.0444 },
  { name: 'baden',         canton: 'ag', lat: 47.4736, lon: 8.3083 },
  { name: 'wohlen',        canton: 'ag', lat: 47.3525, lon: 8.2778 },

  // ─── Lucerne (LU) ─────────────────────────────────────────────────────────
  { name: 'lucerne',       canton: 'lu', lat: 47.0502, lon: 8.3093 },
  { name: 'luzern',        canton: 'lu', lat: 47.0502, lon: 8.3093 },
  { name: 'emmen',         canton: 'lu', lat: 47.0789, lon: 8.3056 },

  // ─── Zoug (ZG) ────────────────────────────────────────────────────────────
  { name: 'zoug',          canton: 'zg', lat: 47.1667, lon: 8.5167 },
  { name: 'zug',           canton: 'zg', lat: 47.1667, lon: 8.5167 },

  // ─── Saint-Gall (SG) ──────────────────────────────────────────────────────
  { name: 'saint-gall',    canton: 'sg', lat: 47.4239, lon: 9.3767 },
  { name: 'st-gallen',     canton: 'sg', lat: 47.4239, lon: 9.3767 },
  { name: 'wil',           canton: 'sg', lat: 47.4622, lon: 9.0506 },

  // ─── Schaffhouse (SH), Grisons (GR), autres ──────────────────────────────
  { name: 'schaffhouse',   canton: 'sh', lat: 47.6975, lon: 8.6347 },
  { name: 'schaffhausen',  canton: 'sh', lat: 47.6975, lon: 8.6347 },
  { name: 'coire',         canton: 'gr', lat: 46.8500, lon: 9.5333 },
  { name: 'chur',          canton: 'gr', lat: 46.8500, lon: 9.5333 },
  { name: 'davos',         canton: 'gr', lat: 46.8000, lon: 9.8333 },
  { name: 'sankt-moritz',  canton: 'gr', lat: 46.4983, lon: 9.8392 },
  { name: 'frauenfeld',    canton: 'tg', lat: 47.5536, lon: 8.8983 },
]

// Index pour lookup rapide par nom normalisé
const CITY_INDEX = new Map<string, CityCoord>()
for (const c of SWISS_CITIES) CITY_INDEX.set(c.name, c)

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .trim()
}

/**
 * Cherche une ville suisse dans une chaîne de localisation libre.
 * Tokenise sur séparateurs courants (`,`, `/`, espace, tiret en mot final) et compare au CITY_INDEX.
 * Match plusieurs tokens : retourne le premier hit en partant de la gauche
 * (les chaînes typiques sont "Monthey, Suisse" ou "Lausanne, Vaud" → la ville est en 1er).
 *
 * Retourne null si rien trouvé (l'appelant doit traiter le fallback).
 */
export function findCity(loc: string | null | undefined): CityCoord | null {
  if (!loc) return null
  const norm = normalize(loc)
  if (!norm) return null

  // Match direct sur la chaîne entière (ex. "lausanne")
  const direct = CITY_INDEX.get(norm)
  if (direct) return direct

  // Tokenise et essaie chaque token + paires de tokens (ex. "la chaux-de-fonds" composé)
  const tokens = norm.split(/[\s,;\/]+/).filter(t => t.length >= 2)
  // Essai chaîne entière sans virgules
  const flat = tokens.join(' ')
  const flatHit = CITY_INDEX.get(flat)
  if (flatHit) return flatHit

  // Essai paire de tokens consécutifs (max 3 mots) puis tokens seuls
  for (let span = 3; span >= 1; span--) {
    for (let i = 0; i + span <= tokens.length; i++) {
      const candidate = tokens.slice(i, i + span).join(' ')
      const hit = CITY_INDEX.get(candidate)
      if (hit) return hit
      // Aussi avec tirets (ex. "saint-maurice")
      const withDash = tokens.slice(i, i + span).join('-')
      const hitDash = CITY_INDEX.get(withDash)
      if (hitDash) return hitDash
    }
  }

  return null
}

/**
 * Distance haversine entre 2 points GPS, en kilomètres.
 * Précision suffisante pour des seuils > 5km en Suisse.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // rayon Terre km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Distance entre 2 chaînes de localisation libres (ex. "Monthey, Suisse" et "Sion VS").
 * Retourne null si l'une des 2 villes n'est pas dans la table → l'appelant doit
 * appliquer un fallback "safe" (ne pas exclure le candidat sur cette base).
 */
export function distanceBetweenLocations(
  loc1: string | null | undefined,
  loc2: string | null | undefined,
): number | null {
  const a = findCity(loc1)
  const b = findCity(loc2)
  if (!a || !b) return null
  return haversineKm(a.lat, a.lon, b.lat, b.lon)
}
