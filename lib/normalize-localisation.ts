/**
 * Normalisation de localisation au format "CP Ville, Pays" (déterministe, 0 IA).
 *
 * Source CP : datasets geonames officiels (scripts/data/cp_suisse.json, cp_france.json)
 * Aucune hallucination : si la ville n'est pas dans la liste, on retourne sans CP.
 *
 * Format cible :
 *   - Suisse : "1870 Monthey, Suisse"
 *   - France : "74500 Évian-les-Bains, France"
 *   - Autre : "Lisbonne, Portugal"
 *
 * Règles input acceptées :
 *   - Avec rue/voirie : "95 Avenue des Grottes, Evian, France" → "74500 Évian-les-Bains, France"
 *   - Avec sigle canton : "Martigny VS" → "1920 Martigny, Suisse"
 *   - CP déjà présent : "1908 Riddes, Suisse" → inchangé (idempotent)
 *   - Ville seule : "Saillon" → "1913 Saillon, Suisse" (inférence via lookup)
 *   - Ordre cassé : "Riddes, 1908, Suisse" → "1908 Riddes, Suisse"
 *
 * Retourne null si impossible à parser proprement (ex: "voir CV", "à compléter").
 */

import cpCHRaw from '../scripts/data/cp_suisse.json'
import cpFRRaw from '../scripts/data/cp_france.json'
import cpOverridesRaw from '../scripts/data/cp_overrides.json'

type CpEntry = [string, string] // [cp, label canonique]
type CpDict = Record<string, CpEntry>
type OverrideEntry = [string, string, string] // [cp, label canonique, pays]

const CP_CH = cpCHRaw as unknown as CpDict
const CP_FR = cpFRRaw as unknown as CpDict
// Hameaux/villages absents des datasets geonames officiels — patches manuels
const CP_OVERRIDES = (cpOverridesRaw as unknown as { _overrides: Record<string, OverrideEntry> })._overrides

// ─── Pays / aliases ────────────────────────────────────────────────────
const COUNTRY_ALIASES: Record<string, string> = {
  suisse: 'Suisse', switzerland: 'Suisse', ch: 'Suisse', schweiz: 'Suisse', svizzera: 'Suisse',
  france: 'France', francaise: 'France', française: 'France', fr: 'France',
  portugal: 'Portugal', pt: 'Portugal',
  espagne: 'Espagne', spain: 'Espagne', espana: 'Espagne', es: 'Espagne',
  italie: 'Italie', italy: 'Italie', italia: 'Italie', it: 'Italie',
  allemagne: 'Allemagne', germany: 'Allemagne', deutschland: 'Allemagne',
  belgique: 'Belgique', belgium: 'Belgique', belgie: 'Belgique', be: 'Belgique',
  luxembourg: 'Luxembourg', lu: 'Luxembourg',
  'royaume-uni': 'Royaume-Uni', uk: 'Royaume-Uni', england: 'Royaume-Uni', 'great-britain': 'Royaume-Uni',
  'pays-bas': 'Pays-Bas', netherlands: 'Pays-Bas', nl: 'Pays-Bas',
  maroc: 'Maroc', morocco: 'Maroc',
  algerie: 'Algérie', algeria: 'Algérie',
  tunisie: 'Tunisie', tunisia: 'Tunisie',
  turquie: 'Turquie', turkey: 'Turquie',
  cameroun: 'Cameroun', cameroon: 'Cameroun',
  senegal: 'Sénégal',
  brasil: 'Brésil', bresil: 'Brésil', brazil: 'Brésil',
  cap_vert: 'Cap-Vert', 'cap-vert': 'Cap-Vert', 'cabo-verde': 'Cap-Vert',
  pologne: 'Pologne', poland: 'Pologne',
  roumanie: 'Roumanie', romania: 'Roumanie',
  ukraine: 'Ukraine',
  russie: 'Russie', russia: 'Russie',
  serbie: 'Serbie', serbia: 'Serbie',
  croatie: 'Croatie', croatia: 'Croatie',
  bosnie: 'Bosnie', bosnia: 'Bosnie',
  kosovo: 'Kosovo',
  albanie: 'Albanie', albania: 'Albanie',
  bulgarie: 'Bulgarie', bulgaria: 'Bulgarie',
  grece: 'Grèce', greece: 'Grèce',
}

const CANTONS_CH = new Set([
  'VS','VD','GE','FR','NE','JU','BE','TI','ZH','AG','LU','BL','BS','GR',
  'SG','SH','SO','SZ','TG','UR','ZG','OW','NW','AR','AI','GL',
])

// Mots de voirie déclencheurs (segment à supprimer).
// Utilise lookaround Unicode \p{L} car \b natif JS échoue sur les lettres accentuées
// (ex: "Châtel" matchait "ch" car \b voit â comme non-word).
const VOIRIE_RE = /(?<![\p{L}])(rue|avenue|av\.|route|rte\.|chemin|all[ée]e|boulevard|impasse|quai|cours|esplanade|venelle|sentier|passage|villa|r[ée]sidence|lieu-?dit|hameau|mont[ée]e)(?![\p{L}])/iu

// ─── Helpers ───────────────────────────────────────────────────────────
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function normalizeKey(s: string): string {
  return stripAccents(s).toLowerCase().trim()
    .replace(/['']/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function lookupCP(city: string, country: 'Suisse' | 'France'): CpEntry | null {
  const dict = country === 'Suisse' ? CP_CH : CP_FR
  const key = normalizeKey(city)
  if (dict[key]) return dict[key]
  // Saint-X ↔ St-X partout dans la clé (chatel-saint-denis → chatel-st-denis)
  if (key.includes('saint-')) {
    const alt = key.replace(/(?:^|-)saint-/g, m => m.replace('saint', 'st'))
    if (dict[alt]) return dict[alt]
  }
  if (key.includes('st-')) {
    const alt = key.replace(/(?:^|-)st-/g, m => m.replace('st', 'saint'))
    if (dict[alt]) return dict[alt]
  }
  // Sainte ↔ Ste (Conflans-Ste-Honorine → Conflans-Sainte-Honorine)
  if (key.includes('ste-')) {
    const alt = key.replace(/(?:^|-)ste-/g, m => m.replace('ste', 'sainte'))
    if (dict[alt]) return dict[alt]
  }
  // CH : suffixes canton dans dataset geonames ("ollon-vd", "ollon-vs", "abtwil-ag"...)
  if (country === 'Suisse') {
    for (const c of ['vd','vs','ge','fr','ne','ju','be','ti','zh','ag','lu','bl','bs','gr','sg','sh','so','sz','tg','ur','zg','ow','nw','ar','ai','gl']) {
      const suffixed = `${key}-${c}`
      if (dict[suffixed]) return dict[suffixed]
    }
  }
  // Overrides manuels (hameaux/villages absents geonames)
  const ov = CP_OVERRIDES[key]
  if (ov && ov[2] === country) return [ov[0], ov[1]]
  return null
}

function detectCountry(text: string): string | null {
  const lower = stripAccents(text).toLowerCase()
  // Scan tokens grossièrement
  for (const [alias, canon] of Object.entries(COUNTRY_ALIASES)) {
    const re = new RegExp(`(?:^|[\\s,;])${alias.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:[\\s,;.]|$)`, 'i')
    if (re.test(lower)) return canon
  }
  // Sigle canton CH isolé (Martigny VS) → Suisse
  for (const c of CANTONS_CH) {
    if (new RegExp(`(?:^|\\s|,)${c}(?:\\s|,|$|\\.)`).test(text)) return 'Suisse'
  }
  return null
}

function extractCpFromText(text: string, country: string | null): { cp: string; isCH: boolean } | null {
  // CP suisse 4 chiffres dans range 1000-9999
  // CP français 5 chiffres dans range 01000-95999 + DOM
  const m4 = text.match(/(?:^|[\s,])([1-9]\d{3})(?=[\s,]|$)/)
  const m5 = text.match(/(?:^|[\s,])(\d{5})(?=[\s,]|$)/)
  if (country === 'France' && m5) return { cp: m5[1], isCH: false }
  if (country === 'Suisse' && m4) return { cp: m4[1], isCH: true }
  // pays inconnu : essayer de trancher selon le format trouvé
  if (m5 && !m4) return { cp: m5[1], isCH: false }
  if (m4 && !m5) return { cp: m4[1], isCH: true }
  if (m4 && m5) {
    // les 2 présents : préférer le 5-chiffres (France) si c'est un nombre cohérent
    return { cp: m5[1], isCH: false }
  }
  return null
}

function smartTitleCase(s: string): string {
  const small = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'd', 'et', 'sur', 'sous', 'en', 'lès', 'les', 'sainte', 'saint'])
  return s.split(/(\s+|-)/).map((part, i) => {
    if (/^(\s+|-)$/.test(part)) return part
    if (i > 0 && small.has(part.toLowerCase())) return part.toLowerCase()
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  }).join('')
}

// ─── Parser principal ─────────────────────────────────────────────────
export function normalizeLocalisation(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  let s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return null

  // Filtrer les inputs poubelle évidents
  if (/^(voir|cf|n\.?[au]\.?|tbd|à compléter|inconnu)/i.test(s)) return null
  if (s.length < 2) return null

  // Strip parenthèses : "Erde (Conthey), Suisse" → "Erde, Conthey, Suisse"
  // (sauf si parenthèse contient un CP, garder le CP : "Publier (74500)" → "74500 Publier")
  s = s.replace(/\(([^)]*\d{4,5}[^)]*)\)/g, ' $1') // CP entre parens → garder + reformater
  s = s.replace(/\(([^)]+)\)/g, ', $1') // texte entre parens → virgule
  s = s.replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim()

  // 1. Détecter pays + CP dans le texte brut
  const country = detectCountry(s)
  const cpHit = extractCpFromText(s, country)

  // 2. Découper en segments par virgule, retirer ceux contenant voirie OU numéro de rue isolé.
  //    Si un segment contient un pattern "CP+ville" en fin, on extrait juste cette portion
  //    (ex: "Rue du Leman 29A 1907 Saxon" → "1907 Saxon")
  const segments = s.split(',').map(p => p.trim()).filter(Boolean)
  const meaningfulSegments: string[] = []
  for (const seg of segments) {
    // Cherche un CP+ville en fin de segment voirie
    const cpVilleMatch = seg.match(/(\d{4,5})\s+([A-ZÀ-ÿ][\p{L}\- ]+?)(?:\s+(VS|VD|GE|FR|NE|JU|BE|TI|ZH|AG|LU|BL|BS|GR|SG|SH|SO|SZ|TG|UR|ZG|OW|NW|AR|AI|GL))?$/u)
    if (cpVilleMatch && (VOIRIE_RE.test(seg) || /^\d+[a-zA-Z]?\s/.test(seg))) {
      meaningfulSegments.push(`${cpVilleMatch[1]} ${cpVilleMatch[2].trim()}`)
      continue
    }
    if (VOIRIE_RE.test(seg)) continue
    // numéro avec lettre (ex "95 Avenue", "12B chemin") sauf si suivi d'un CP+ville
    if (/^\d+[a-zA-Z]?\s+\S/.test(seg) && !/^\d{4,5}\s+[A-Za-zÀ-ÿ]/.test(seg)) continue
    // segment contient un numéro de rue (1-3 chiffres isolés) sans CP 4-5 chiffres → c'est une rue résiduelle
    const hasStreetNum = /(?:^|\s)\d{1,3}[a-zA-Z]?(?:\s|$)/.test(seg)
    const hasCp = /(?:^|\s)\d{4,5}(?:\s|$)/.test(seg)
    if (hasStreetNum && !hasCp) continue
    meaningfulSegments.push(seg)
  }

  // 3. Identifier le segment-ville parmi les segments restants
  let cityRaw: string | null = null
  for (const seg of meaningfulSegments) {
    // pays seul → skip
    const segLowerStripped = stripAccents(seg).toLowerCase()
    if (COUNTRY_ALIASES[segLowerStripped]) continue
    // canton seul → skip
    if (CANTONS_CH.has(seg.toUpperCase().trim())) continue
    // CP seul → skip
    if (/^\d{4,5}$/.test(seg)) continue

    // segment "CP Ville" ou "CP Ville Canton"
    const mCpFirst = seg.match(/^(\d{4,5})\s+(.+?)(?:\s+(VS|VD|GE|FR|NE|JU|BE|TI|ZH|AG|LU|BL|BS|GR|SG|SH|SO|SZ|TG|UR|ZG|OW|NW|AR|AI|GL))?$/i)
    if (mCpFirst) { cityRaw = mCpFirst[2]; break }

    // segment "Ville CP" ou "Ville Canton CP"
    const mCpLast = seg.match(/^(.+?)\s+(\d{4,5})$/)
    if (mCpLast) { cityRaw = mCpLast[1]; break }

    // segment "Ville CANTON" sans CP
    const mCanton = seg.match(/^(.+?)\s+(VS|VD|GE|FR|NE|JU|BE|TI|ZH|AG|LU|BL|BS|GR|SG|SH|SO|SZ|TG|UR|ZG|OW|NW|AR|AI|GL)\.?$/i)
    if (mCanton) { cityRaw = mCanton[1]; break }

    // segment ville simple
    if (!cityRaw) cityRaw = seg
  }

  if (!cityRaw) return null
  cityRaw = cityRaw.trim()
  // Strip canton tag éventuellement encore collé
  cityRaw = cityRaw.replace(/\s+(VS|VD|GE|FR|NE|JU|BE|TI|ZH|AG|LU|BL|BS|GR|SG|SH|SO|SZ|TG|UR|ZG|OW|NW|AR|AI|GL)\.?$/i, '').trim()
  // Strip CP préfixé/suffixé
  cityRaw = cityRaw.replace(/^\d{4,5}\s+/, '').replace(/\s+\d{4,5}$/, '').trim()

  if (!cityRaw) return null

  // 4. Inférer pays via lookup si manquant
  let finalCountry: string | null = country
  if (!finalCountry) {
    if (lookupCP(cityRaw, 'Suisse')) finalCountry = 'Suisse'
    else if (lookupCP(cityRaw, 'France')) finalCountry = 'France'
  }

  // 5. Lookup CP officiel via dictionnaire (priorité au lookup, fallback CP trouvé dans texte)
  let finalCP: string | null = null
  let canonicalCity: string | null = null

  if (finalCountry === 'Suisse') {
    const found = lookupCP(cityRaw, 'Suisse')
    if (found) { finalCP = found[0]; canonicalCity = found[1] }
  } else if (finalCountry === 'France') {
    const found = lookupCP(cityRaw, 'France')
    if (found) { finalCP = found[0]; canonicalCity = found[1] }
  }

  // Si lookup a échoué mais on a un CP dans le texte → l'utiliser quand même
  if (!finalCP && cpHit && (finalCountry === 'Suisse' || finalCountry === 'France')) {
    finalCP = cpHit.cp
  }

  // Strip suffix canton du label canonique ("Ollon VD" → "Ollon")
  const cityFormatted = (canonicalCity || smartTitleCase(cityRaw))
    .replace(/\s+(VS|VD|GE|FR|NE|JU|BE|TI|ZH|AG|LU|BL|BS|GR|SG|SH|SO|SZ|TG|UR|ZG|OW|NW|AR|AI|GL)$/i, '')

  // 6. Build final
  if (finalCP && finalCountry) return `${finalCP} ${cityFormatted}, ${finalCountry}`
  if (finalCountry) return `${cityFormatted}, ${finalCountry}`
  return cityFormatted
}

// ─── Idempotence check ────────────────────────────────────────────────
// Format strict CH : "XXXX Ville, Suisse" (CP obligatoire pour la Suisse)
const STRICT_RE_CH = /^[1-9]\d{3} [A-ZÀ-ÿ][^,]*, Suisse$/
// Format strict FR : "XXXXX Ville, France" (CP obligatoire pour la France)
const STRICT_RE_FR = /^\d{5} [A-ZÀ-ÿ][^,]*, France$/
// Format strict autre pays : "Ville, Pays" sans CP (pas de CP requis pour pays non-CH/FR)
// — exclut Suisse/France pour forcer leur normalisation avec CP
const STRICT_RE_OTHER = /^[A-ZÀ-ÿ][^,0-9]*, (?!Suisse$|France$)[A-ZÀ-ÿ][^,0-9]*$/

/**
 * Retourne true si la string est déjà au format cible canonique
 * (alors la normalisation peut être skippée).
 */
export function isAlreadyNormalized(s: string): boolean {
  if (!s) return false
  return STRICT_RE_CH.test(s) || STRICT_RE_FR.test(s) || STRICT_RE_OTHER.test(s)
}
