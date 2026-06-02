// One-shot : envoie l'email d'invitation portail (template client) à info@l-agence.ch
// pour aperçu visuel. Token d'exemple (le lien ne créera pas de mot de passe réel).
// Lancer : node --env-file=.env.local --import tsx ./scripts/one-shot/send-test-portal-email.ts
import { sendInvitationEmail } from '../../lib/emails/portal-auth'

async function main() {
  const res = await sendInvitationEmail({
    to: 'info@l-agence.ch',
    accountType: 'client',
    token: 'APERCU-TEST-TOKEN-NON-VALIDE',
  })
  console.log('Résultat envoi invitation (client):', res)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
