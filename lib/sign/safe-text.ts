// TalentFlow Sign — Normalisation texte pour pdf-lib WinAnsi
// v2.9.63 — Extrait de pdf-generator.ts pour éviter d'importer 'fs' côté
// client (pdf-stamp.ts est aussi utilisé côté client via PublicFieldsLayer).
//
// Sans cette normalisation, pdf-lib StandardFonts (Helvetica/Courier) qui
// utilise l'encodage WinAnsi rejette les caractères :
//  - hors Latin-1 (U+0100+) sauf chars Windows usuels (€, ™, ©, ®)
//  - accents combinants U+0300-U+036F (« d » + U+0301 = ḋ sans précomposé)
//  - smart quotes typographiques (’ “ … etc.)
//
// → Throw silencieux dans le catch de generateCertificatePdf ou drawTextInBox
// → PDF stampé vide ou cert manquant.

/**
 * Normalise une chaîne pour qu'elle soit encodable par pdf-lib StandardFonts.
 *
 * 1. NFC : recompose les caractères combinants (é, à, ç, etc.)
 * 2. Strip combinants restants (cas sans précomposé)
 * 3. Smart quotes / dashes typographiques → équivalents ASCII
 * 4. Filet de sécurité final : tout char hors Latin-1 → '?'
 */
export function safePdfText(s: string): string {
  if (!s) return ''
  return s
    .normalize('NFC')
    // Strip les accents combinants RESTANTS après NFC (cas typique :
    // « d » + U+0301 = ḋ qui n'existe pas en précomposé Unicode → l'accent
    // reste détaché → WinAnsi throw « cannot encode U+0301 »).
    // Range : U+0300 à U+036F.
    .replace(/[̀-ͯ]/g, '')
    // Smart quotes / dashes courants en typographie française moderne
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')  // espace insécable → espace normal
    // Filet de sécurité final : tout char hors Latin-1 (>U+00FF) → '?',
    // sauf chars Windows usuels qui sont encodés par WinAnsi (€, ™, ©, ®).
    .replace(/[^\x00-\xFF€™©®]/g, '?')
}
