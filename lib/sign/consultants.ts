// TalentFlow Sign — Liste des consultants signataires (codée en dur).
// v2.10.30 — Quand un template a un rôle « Consultant », l'utilisateur choisit
// João ou Seb à l'envoi : ses coordonnées sont pré-remplies et SA signature
// (Paramètres → Mon profil, table user_preset_signatures) est apposée
// automatiquement (auto-sign). Pratique pour les secrétaires qui envoient les
// contrats au nom de l'un ou l'autre.
//
// Pour ajouter un consultant : ajouter une entrée ci-dessous (key unique + son
// user_id Supabase auth). Sa signature se gère dans Paramètres → Mon profil.

export interface Consultant {
  key: string       // identifiant stable (slug), stocké sur le destinataire
  name: string      // nom affiché + apposé sur le contrat
  email: string     // email du consultant (figure sur le contrat)
  userId: string    // auth.users.id → lookup de sa signature (user_preset_signatures)
}

export const CONSULTANTS: Consultant[] = [
  {
    key: 'joao',
    name: 'João Barbosa',
    email: 'j.barbosa@l-agence.ch',
    userId: 'f0d04538-5bdf-4069-8eea-07186a7c0066',
  },
  {
    key: 'seb',
    name: "Sébastien D'Agostino",
    email: 's.dagostino@l-agence.ch',
    userId: '1e779773-09d9-45f6-9ab6-2fc4aa567c3e',
  },
]

export function getConsultant(key?: string | null): Consultant | null {
  if (!key) return null
  return CONSULTANTS.find(c => c.key === key) || null
}

/** Un rôle est « consultant » si son libellé vaut « consultant » (insensible casse/accents). */
export function isConsultantRoleName(roleName?: string | null): boolean {
  if (!roleName) return false
  return roleName
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // retire accents
    .toLowerCase().trim() === 'consultant'
}
