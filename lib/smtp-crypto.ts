import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO       = 'aes-256-gcm'
const ENC_PREFIX = 'enc:'  // préfixe pour distinguer chiffré vs. plain text legacy

function getKey(): Buffer {
  const hex = process.env.SMTP_ENCRYPTION_KEY
  if (!hex) throw new Error('SMTP_ENCRYPTION_KEY env var manquante')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error('SMTP_ENCRYPTION_KEY doit faire 32 bytes (64 caractères hex)')
  return key
}

/**
 * Chiffre une chaîne avec AES-256-GCM.
 * Format stocké : "enc:iv(24hex):authTag(32hex):ciphertext(hex)"
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv  = randomBytes(12) // 96 bits — recommandé pour GCM
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()
  return `${ENC_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Déchiffre une chaîne produite par encrypt().
 * Rétrocompatibilité : si la valeur ne commence pas par "enc:" → mot de passe en clair (config existante),
 * retourné tel quel sans erreur.
 */
export function decrypt(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored  // legacy plain text — fonctionne encore

  try {
    const inner    = stored.slice(ENC_PREFIX.length)
    const colonIdx1 = inner.indexOf(':')
    const colonIdx2 = inner.indexOf(':', colonIdx1 + 1)
    const ivHex        = inner.slice(0, colonIdx1)
    const authTagHex   = inner.slice(colonIdx1 + 1, colonIdx2)
    const encryptedHex = inner.slice(colonIdx2 + 1)

    const key      = getKey()
    const iv       = Buffer.from(ivHex, 'hex')
    const authTag  = Buffer.from(authTagHex, 'hex')
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8')
  } catch {
    throw new Error('Échec déchiffrement mot de passe SMTP — vérifier SMTP_ENCRYPTION_KEY')
  }
}
