// TalentFlow Rapports — Helpers format texte (v2.3.9)
//
// toWhatsAppSafe : convertit un texte Unicode en ASCII strict via une map
// LATIN_MAP exhaustive. Utilisé pour les URLs wa.me et le contenu encodé,
// car certaines versions WhatsApp affichent ? à la place des caracteres
// Unicode étendus dans les liens.
//
// Approche map vs NFD : la map est déterministe et ne dépend pas du runtime
// Unicode. Couvre systématiquement les diacritiques latins courants
// (FR/PT/ES/DE/IT). Caracteres non mappés sont conservés tels quels.
//
// Règle (validée João v2.3.9) : appliquer toWhatsAppSafe sur le MESSAGE
// ENTIER (pas seulement le prénom) avant encodeURIComponent.

const LATIN_MAP: Record<string, string> = {
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'ā': 'a', 'ă': 'a', 'ą': 'a',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e', 'ĕ': 'e', 'ė': 'e', 'ę': 'e', 'ě': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ī': 'i', 'ĭ': 'i', 'į': 'i', 'ı': 'i',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o', 'ō': 'o', 'ŏ': 'o', 'ő': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ū': 'u', 'ŭ': 'u', 'ů': 'u', 'ű': 'u', 'ų': 'u',
  'ý': 'y', 'ÿ': 'y', 'ŷ': 'y',
  'ñ': 'n', 'ń': 'n', 'ň': 'n', 'ņ': 'n',
  'ç': 'c', 'ć': 'c', 'č': 'c', 'ĉ': 'c', 'ċ': 'c',
  'ß': 'ss',
  'š': 's', 'ś': 's', 'ş': 's', 'ŝ': 's',
  'ž': 'z', 'ź': 'z', 'ż': 'z',
  'ł': 'l', 'ĺ': 'l', 'ľ': 'l', 'ļ': 'l',
  'ř': 'r', 'ŕ': 'r', 'ŗ': 'r',
  'ť': 't', 'ţ': 't',
  'ď': 'd', 'đ': 'd',
  'ğ': 'g', 'ĝ': 'g', 'ġ': 'g', 'ģ': 'g',
  'ħ': 'h', 'ĥ': 'h',
  'ĵ': 'j',
  'ķ': 'k',
  'œ': 'oe', 'æ': 'ae',
  // Majuscules
  'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Ā': 'A', 'Ă': 'A', 'Ą': 'A',
  'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E', 'Ē': 'E', 'Ĕ': 'E', 'Ė': 'E', 'Ę': 'E', 'Ě': 'E',
  'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I', 'Ī': 'I', 'Ĭ': 'I', 'Į': 'I', 'İ': 'I',
  'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O', 'Ō': 'O', 'Ŏ': 'O', 'Ő': 'O',
  'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U', 'Ū': 'U', 'Ŭ': 'U', 'Ů': 'U', 'Ű': 'U', 'Ų': 'U',
  'Ý': 'Y', 'Ŷ': 'Y',
  'Ñ': 'N', 'Ń': 'N', 'Ň': 'N', 'Ņ': 'N',
  'Ç': 'C', 'Ć': 'C', 'Č': 'C', 'Ĉ': 'C', 'Ċ': 'C',
  'Š': 'S', 'Ś': 'S', 'Ş': 'S', 'Ŝ': 'S',
  'Ž': 'Z', 'Ź': 'Z', 'Ż': 'Z',
  'Ł': 'L', 'Ĺ': 'L', 'Ľ': 'L', 'Ļ': 'L',
  'Ř': 'R', 'Ŕ': 'R', 'Ŗ': 'R',
  'Ť': 'T', 'Ţ': 'T',
  'Ď': 'D', 'Đ': 'D',
  'Ğ': 'G', 'Ĝ': 'G', 'Ġ': 'G', 'Ģ': 'G',
  'Ħ': 'H', 'Ĥ': 'H',
  'Ĵ': 'J',
  'Ķ': 'K',
  'Œ': 'OE', 'Æ': 'AE',
  // v2.3.10 Bug 4 — VRAIE CAUSE ❓ WhatsApp : ponctuation Unicode étendue.
  // Diagnostic hexdump v2.3.9 a révélé `e2 80 94` (em-dash U+2014) dans le
  // template `Gardez ce lien — il reste...` qui passait tel quel dans wa.me
  // → encodé `%E2%80%94` → certaines apps WA affichent ❓ pour ces chars.
  '—': '-',  // U+2014 em-dash
  '–': '-',  // U+2013 en-dash
  '−': '-',  // U+2212 minus
  '‐': '-',  // U+2010 hyphen
  '‑': '-',  // U+2011 non-breaking hyphen
  '‘': "'",  // U+2018 left single quote
  '’': "'",  // U+2019 right single quote (apostrophe typo)
  '‚': "'",  // U+201A single low-9 quote
  '“': '"',  // U+201C left double quote
  '”': '"',  // U+201D right double quote
  '„': '"',  // U+201E double low-9 quote
  '«': '"', '»': '"',  // guillemets
  '…': '...',  // U+2026 horizontal ellipsis
  '→': '->',   // U+2192 rightwards arrow
  '←': '<-',   // U+2190 leftwards arrow
  '↑': '^',    // U+2191
  '↓': 'v',    // U+2193
  ' ': ' ',  // non-breaking space
  ' ': ' ',  // thin space
  '​': '',   // zero-width space
  '‌': '',   // zero-width non-joiner
  '‍': '',   // zero-width joiner
  '°': 'deg', // °
  '€': 'EUR', '£': 'GBP', '¥': 'JPY',
  '©': '(c)', '®': '(r)', '™': '(tm)',
  '×': 'x', '÷': '/', '±': '+/-',
}

/**
 * Convertit un texte en ASCII safe pour WhatsApp (URLs wa.me + body texte).
 * Map LATIN_MAP exhaustive. Caracteres emoji/CJK passent tels quels (encodés
 * par encodeURIComponent côté URL).
 */
export function toWhatsAppSafe(s: string): string {
  if (!s) return ''
  return s.split('').map(c => LATIN_MAP[c] ?? c).join('')
}

/**
 * @deprecated v2.3.9 — Utiliser `toWhatsAppSafe` à la place.
 * Alias conservé pour rétrocompat avec v2.3.8.
 */
export const stripAccentsForWa = toWhatsAppSafe

// Format date "JJ.MM.AAAA" deterministe (independant du locale ICU Vercel
// qui peut renvoyer des slashes au lieu de points sur fr-CH).
export function formatDateChDot(d: Date | string): string {
  try {
    const date = typeof d === 'string' ? new Date(d) : d
    if (isNaN(date.getTime())) return typeof d === 'string' ? d : ''
    const dd = String(date.getDate()).padStart(2, '0')
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const yyyy = date.getFullYear()
    return `${dd}.${mm}.${yyyy}`
  } catch {
    return typeof d === 'string' ? d : ''
  }
}
