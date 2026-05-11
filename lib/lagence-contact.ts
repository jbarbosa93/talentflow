// TalentFlow — Coordonnées L-Agence centralisées
// v2.4.0 — Phase 1 Rapports v2
//
// Source unique pour les numéros affichés dans le modal "Contacter L-Agence"
// de la page candidat /report/[slug]. Si tu changes ici, change aussi le
// pied de page emails si pertinent.

export const LAGENCE_CONTACT = {
  /** WhatsApp Business — visible dans wa.me */
  whatsapp: '+41 76 297 97 95',
  /** Téléphone bureau — lien tel: */
  bureau: '+41 24 552 18 70',
  /** Horaires ouverture (libellé affiché tel quel) */
  horaires: 'Lun-Ven · 8h-12h / 13h-17h',
  /** Nom légal complet — affiché dans le modal */
  raisonSociale: 'L-Agence SA',
} as const

/** Convertit un numéro affiché ("+41 76 297 97 95") en digits seuls pour wa.me/tel:. */
export function phoneDigits(formatted: string): string {
  return formatted.replace(/\D/g, '')
}

/** URL wa.me avec message optionnel. Sans message → ouvre le picker contact. */
export function waMeUrl(phone: string, message?: string): string {
  const digits = phoneDigits(phone)
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/'
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/** URL tel:+41XXXXXXXXX (avec le +, sans espaces). */
export function telUrl(phone: string): string {
  const digits = phoneDigits(phone)
  return digits ? `tel:+${digits}` : 'tel:'
}
