// lib/phone-format.ts
// Détection et formatage des numéros de téléphone avec code pays ISO
// Utilisé par CandidatsList, matching/page, matching/historique
// countryCode = code ISO 2 lettres minuscules ('ch', 'fr', 'es', 'pt', 'it', '')
// Rendu du drapeau : <span className={`fi fi-${countryCode}`} /> via flag-icons CSS

export interface PhoneInfo {
  number: string
  countryCode: string  // ISO 2 lettres : 'ch' | 'fr' | 'es' | 'pt' | 'it' | ''
  country: string
}

export function detectAndFormat(tel: string): PhoneInfo {
  const c = tel.replace(/[\s\-().]/g, '')

  if (c.startsWith('+41')  || c.startsWith('0041'))  return { number: '+41'  + (c.startsWith('+41')  ? c.slice(3) : c.slice(4)), countryCode: 'ch', country: 'Suisse' }
  if (c.startsWith('+33')  || c.startsWith('0033'))  return { number: '+33'  + (c.startsWith('+33')  ? c.slice(3) : c.slice(4)), countryCode: 'fr', country: 'France' }
  if (c.startsWith('+34')  || c.startsWith('0034'))  return { number: '+34'  + (c.startsWith('+34')  ? c.slice(3) : c.slice(4)), countryCode: 'es', country: 'Espagne' }
  if (c.startsWith('+351') || c.startsWith('00351')) return { number: '+351' + (c.startsWith('+351') ? c.slice(4) : c.slice(5)), countryCode: 'pt', country: 'Portugal' }
  if (c.startsWith('+39')  || c.startsWith('0039'))  return { number: '+39'  + (c.startsWith('+39')  ? c.slice(3) : c.slice(4)), countryCode: 'it', country: 'Italie' }

  if (c.startsWith('0')) {
    const local = c.slice(1)
    if (/^7[6-9]/.test(local)) return { number: '+41' + local, countryCode: 'ch', country: 'Suisse' }
    if (/^[67]/.test(local))   return { number: '+33' + local, countryCode: 'fr', country: 'France' }
    if (/^[0-5]/.test(local))  return { number: '+33' + local, countryCode: 'fr', country: 'France' }
    return { number: c, countryCode: '', country: '' }
  }

  if (/^[67]/.test(c) && c.length === 9)  return { number: '+34'  + c, countryCode: 'es', country: 'Espagne' }
  if (/^9/.test(c)    && c.length === 9)  return { number: '+351' + c, countryCode: 'pt', country: 'Portugal' }
  if (/^3/.test(c)    && c.length >= 9)   return { number: '+39'  + c, countryCode: 'it', country: 'Italie' }

  return { number: c, countryCode: '', country: '' }
}
