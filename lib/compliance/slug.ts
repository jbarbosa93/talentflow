// TalentFlow Compliance — Génération slug portail client
// v2.5.0
//
// Q9 (b) : slug long random imprévisible (16 chars).
// Le client n'a pas besoin de retenir l'URL : envoyée 1× par email/WhatsApp.

import { createAdminClient } from '@/lib/supabase/admin'

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function randomToken(len: number): string {
  let s = ''
  const cryptoObj = (typeof globalThis !== 'undefined' && (globalThis as any).crypto) || null
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const arr = new Uint32Array(len)
    cryptoObj.getRandomValues(arr)
    for (let i = 0; i < len; i++) s += ALPHABET[arr[i] % ALPHABET.length]
    return s
  }
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

export async function generatePortalSlug(): Promise<string> {
  const supabase = createAdminClient()
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomToken(16)
    const { data } = await supabase
      .from('client_portals' as any)
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!data) return candidate
  }
  return randomToken(24)
}
