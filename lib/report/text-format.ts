// TalentFlow Rapports — Helpers format texte (v2.3.8)
//
// stripAccentsForWa : retire tous les diacritiques (a~, e', c,, n~, ...) pour
// produire de l'ASCII safe. Utilise pour les messages WhatsApp ou certaines
// versions de l'app affichent ? a la place des caracteres Unicode etendus
// dans les URLs wa.me / le contenu encode.
//
// Regle (validee Joao v2.3.8) : stripper TOUS les accents pour garantir
// l'affichage uniforme. "Joao" -> "Joao", "Herve" -> "Herve".

export function stripAccentsForWa(s: string): string {
  if (!s) return ''
  // U+0300 a U+036F = combining diacritical marks (apres NFD decomposition)
  // eslint-disable-next-line no-misleading-character-class
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

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
