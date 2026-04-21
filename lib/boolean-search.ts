// lib/boolean-search.ts — v1.9.70
// Parser à descente récursive pour la recherche booléenne.
// Supporte : ET/AND, OU/OR, SAUF/NOT, parenthèses.
// Priorité : OU (basse) < ET/SAUF (haute). AND implicite entre mots adjacents.
// Insensible à la casse + unaccent via normalize().
//
// Utilisé par : CandidatsList (recherche candidats), ClientPicker (recherche clients mailing).

export const normalize = (s: string): string =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

type BoolTok = { type: 'lparen' | 'rparen' | 'or' | 'and' | 'sauf' | 'word'; value?: string }

function tokenizeBoolean(q: string): BoolTok[] {
  const spaced = q.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ')
  return spaced.split(/\s+/).filter(Boolean).map<BoolTok>(t => {
    if (t === '(') return { type: 'lparen' }
    if (t === ')') return { type: 'rparen' }
    const u = t.toUpperCase()
    if (u === 'OU' || u === 'OR') return { type: 'or' }
    if (u === 'ET' || u === 'AND') return { type: 'and' }
    if (u === 'SAUF' || u === 'NOT') return { type: 'sauf' }
    return { type: 'word', value: t }
  })
}

/** Détecte si la requête contient des opérateurs booléens ou des parenthèses. */
export function hasBooleanSyntax(query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return false
  return /\b(ET|AND|OU|OR|SAUF|NOT)\b/i.test(trimmed) || /[()]/.test(trimmed)
}

/**
 * Retourne un matcher `(text) => boolean` pour évaluer le texte d'un item
 * contre la requête booléenne. Retourne null si pas d'opérateur (recherche basique attendue).
 */
export function parseBooleanSearch(query: string): ((text: string) => boolean) | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  if (!hasBooleanSyntax(trimmed)) return null

  const tokens = tokenizeBoolean(trimmed)
  if (tokens.length === 0) return null
  let pos = 0
  const peek = () => tokens[pos]
  const eat = () => tokens[pos++]
  type Matcher = (nt: string) => boolean

  function parseOr(): Matcher {
    let left = parseAnd()
    while (peek()?.type === 'or') {
      eat()
      const right = parseAnd()
      const L = left, R = right
      left = nt => L(nt) || R(nt)
    }
    return left
  }
  function parseAnd(): Matcher {
    let left: Matcher = parseFactor() ?? (() => true)
    while (peek() && peek()!.type !== 'or' && peek()!.type !== 'rparen') {
      const tk = peek()!
      let negate = false
      if (tk.type === 'sauf') { eat(); negate = true }
      else if (tk.type === 'and') { eat() }
      const next = parseFactor()
      if (!next) break
      const L = left, R = next
      left = negate ? nt => L(nt) && !R(nt) : nt => L(nt) && R(nt)
    }
    return left
  }
  function parseFactor(): Matcher | null {
    const tk = peek()
    if (!tk) return null
    if (tk.type === 'lparen') {
      eat()
      const expr = parseOr()
      if (peek()?.type === 'rparen') eat()
      return expr
    }
    if (tk.type === 'word') {
      eat()
      const w = normalize(tk.value!)
      return nt => nt.includes(w)
    }
    // opérateur isolé : on saute
    eat()
    return parseFactor()
  }

  const matcher = parseOr()
  return (text: string) => matcher(normalize(text))
}
