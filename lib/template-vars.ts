// lib/template-vars.ts
// Moteur de remplacement de variables pour les templates (email/WhatsApp/SMS).

export type Civilite = 'Monsieur' | 'Madame' | 'Monsieur/Madame'

export interface TemplateCandidat {
  prenom?: string | null
  nom?: string | null
  titre_poste?: string | null
  genre?: 'homme' | 'femme' | null
  resume_ia?: string | null
}

export interface TemplateClient {
  nom_entreprise?: string | null
  contact_prenom?: string | null
  contact_nom?: string | null
  contacts?: any[] | null
}

export interface TemplateConsultant {
  prenom?: string | null
  email?: string | null
}

export interface RenderContext {
  candidat?: TemplateCandidat | null
  client?: TemplateClient | null
  consultant?: TemplateConsultant | null
  civilite_override?: Civilite | null   // depuis cv_customizations.data.civilite
  contexte_ia?: string | null           // texte généré Claude (seule la saisie explicite le remplit)
}

/** Déduit la civilité à partir du genre, avec override prioritaire. */
export function getCivilite(
  candidat?: TemplateCandidat | null,
  override?: Civilite | null,
): Civilite {
  if (override === 'Monsieur' || override === 'Madame' || override === 'Monsieur/Madame') {
    return override
  }
  const g = candidat?.genre
  if (g === 'homme') return 'Monsieur'
  if (g === 'femme') return 'Madame'
  return 'Monsieur/Madame'
}

/** Premier contact client : soit { contact_prenom, contact_nom } directs, soit contacts[0]. */
function pickClientContact(client?: TemplateClient | null): { prenom: string; nom: string } {
  if (!client) return { prenom: '', nom: '' }
  if (client.contact_prenom || client.contact_nom) {
    return { prenom: client.contact_prenom || '', nom: client.contact_nom || '' }
  }
  const first = Array.isArray(client.contacts) && client.contacts.length > 0 ? client.contacts[0] : null
  if (first && typeof first === 'object') {
    return {
      prenom: first.prenom || first.firstName || first.first_name || '',
      nom: first.nom || first.lastName || first.last_name || '',
    }
  }
  return { prenom: '', nom: '' }
}

export interface VarInfo {
  key: string        // "{candidat_prenom}"
  label: string      // description courte
  example: string
  kind: 'candidat' | 'client' | 'consultant' | 'ia'
}

export const TEMPLATE_VARS: VarInfo[] = [
  { key: '{candidat_prenom}',    label: 'Prénom du candidat',                example: 'Jean',        kind: 'candidat' },
  { key: '{candidat_nom}',       label: 'Nom du candidat',                   example: 'Dupont',      kind: 'candidat' },
  { key: '{candidat_metier}',    label: 'Titre/poste du candidat',           example: 'Maçon',       kind: 'candidat' },
  { key: '{candidat_civilite}',  label: 'Civilité (Monsieur/Madame)',        example: 'Monsieur',    kind: 'candidat' },
  { key: '{un_e}',               label: 'Article indéfini accordé (un/une)', example: 'un',          kind: 'candidat' },
  { key: '{resume_ia}',          label: 'Résumé IA du candidat',             example: '(extrait)',   kind: 'candidat' },
  { key: '{client_prenom}',      label: 'Prénom du contact client',          example: 'Marc',        kind: 'client' },
  { key: '{client_nom}',         label: 'Nom du contact client',             example: 'Meier',       kind: 'client' },
  { key: '{client_entreprise}',  label: 'Nom de l’entreprise',               example: 'Acme SA',     kind: 'client' },
  { key: '{consultant_prenom}',  label: 'Votre prénom',                      example: 'João',        kind: 'consultant' },
  { key: '{contexte_ia}',        label: 'Paragraphe IA (Haiku)',             example: '(généré)',    kind: 'ia' },
]

/** Article indéfini accordé (un / une / un(e)) selon le genre du candidat. */
function getUnE(candidat?: TemplateCandidat | null): string {
  const g = candidat?.genre
  if (g === 'homme') return 'un'
  if (g === 'femme') return 'une'
  return 'un(e)'
}

/** Remplace toutes les variables {xxx} dans `text` selon le contexte fourni. */
export function renderTemplate(text: string, ctx: RenderContext): string {
  if (!text) return ''
  const c = ctx.candidat || {}
  const cl = ctx.client || {}
  const co = ctx.consultant || {}
  const contact = pickClientContact(cl)
  const civilite = getCivilite(c, ctx.civilite_override ?? null)

  const vars: Record<string, string> = {
    // Notation courte (nouveau standard v1.9.68)
    '{prenom}':            c.prenom || '',
    '{nom}':               c.nom || '',
    '{metier}':            c.titre_poste || '',
    '{civilite}':          civilite,
    // Notation longue (legacy email, backward compat)
    '{candidat_prenom}':   c.prenom || '',
    '{candidat_nom}':      c.nom || '',
    '{candidat_metier}':   c.titre_poste || '',
    '{candidat_civilite}': civilite,
    // Autres
    '{un_e}':              getUnE(c),
    '{resume_ia}':         c.resume_ia || '',
    '{client_prenom}':     contact.prenom,
    '{client_nom}':        contact.nom,
    '{client_entreprise}': cl.nom_entreprise || '',
    '{consultant_prenom}': co.prenom || '',
    '{contexte_ia}':       ctx.contexte_ia || '',
  }

  // Legacy : {{prenom}} / {{nom}} → candidat
  let out = text
    .replace(/\{\{\s*prenom\s*\}\}/g, c.prenom || '')
    .replace(/\{\{\s*nom\s*\}\}/g, c.nom || '')

  for (const [k, v] of Object.entries(vars)) {
    out = out.split(k).join(v)
  }
  return cleanupRendered(out)
}

/**
 * Nettoie le texte après substitution : supprime les variables vides proprement.
 * Ex: "Bonjour  ," → "Bonjour,"   |   "Bonjour   Monsieur ," → "Bonjour Monsieur,"
 */
export function cleanupRendered(text: string): string {
  return text
    .split('\n')
    .map(line => line
      // Espaces multiples → un seul
      .replace(/[ \t]{2,}/g, ' ')
      // Espace avant ponctuation
      .replace(/\s+([,;:.!?])/g, '$1')
      // Ligne "Bonjour ," / "Bonjour  ," → "Bonjour,"
      .replace(/\s+,/g, ',')
      // Trim trailing
      .replace(/[ \t]+$/g, ''),
    )
    .join('\n')
}

/** Détecte si un texte contient la variable {contexte_ia}. */
export function hasContexteIA(text: string): boolean {
  return /\{contexte_ia\}/.test(text || '')
}
