// TalentFlow Rapports — Génération de slugs permanents (Phase 5)
// v2.2.6
//
// Format : {prenom}-{nom}-lagence-{4 chars random}
// Ex : pedro-ferreira-lagence-a3f2
// Permanent : jamais réutilisé même après révocation (UNIQUE constraint en DB).

import { createAdminClient } from '@/lib/supabase/admin'

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'  // sans 0/o/1/l/i pour lisibilité

function randomSuffix(len = 4): string {
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

/**
 * Slugify un nom : strip accents + lowercase + remplace espaces et caractères
 * spéciaux par des tirets, vire les tirets en début/fin et les doubles tirets.
 */
function slugify(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

/**
 * Génère un slug unique pour un candidat. Vérifie l'unicité en DB et retry
 * jusqu'à 5x avec un nouveau suffixe en cas de collision.
 *
 * Si prenom + nom sont vides → fallback "rapport-lagence-XXXX".
 */
export async function generateSlug(prenom: string | null, nom: string | null): Promise<string> {
  const supabase = createAdminClient()
  const base = [slugify(prenom || ''), slugify(nom || ''), 'lagence']
    .filter(Boolean)
    .join('-') || 'rapport-lagence'

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}-${randomSuffix(4)}`
    const { data } = await supabase
      .from('report_links' as any)
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!data) return candidate
  }
  // Fallback ultra-improbable : suffixe 8 chars
  return `${base}-${randomSuffix(8)}`
}
