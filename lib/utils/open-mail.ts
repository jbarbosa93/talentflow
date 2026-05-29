// v2.9.78 — Ouverture d'email robuste avec fallback.
// Problème : window.location='mailto:' ne fait rien si l'OS n'a pas d'app mail par défaut
// (cas de Seb). On copie l'adresse + on avertit l'utilisateur, avec la marche à suivre.
import { toast } from 'sonner'

export function openMail(email: string | null | undefined, opts?: { subject?: string; body?: string }) {
  const addr = (email || '').trim()
  if (!addr) {
    toast.error('Aucune adresse email pour ce contact')
    return
  }

  // ⚠️ NE PAS utiliser URLSearchParams : il encode les espaces en « + », que les clients
  // mail (Outlook, etc.) affichent littéralement. mailto exige encodeURIComponent (→ %20).
  const parts: string[] = []
  if (opts?.subject) parts.push(`subject=${encodeURIComponent(opts.subject)}`)
  if (opts?.body) parts.push(`body=${encodeURIComponent(opts.body)}`)
  const qs = parts.join('&')
  const mailto = `mailto:${addr}${qs ? `?${qs}` : ''}`

  // Copie l'adresse — utile immédiatement si aucune app mail ne s'ouvre
  try { void navigator.clipboard?.writeText(addr) } catch { /* clipboard indisponible */ }

  // Tente d'ouvrir l'app mail par défaut
  try { window.location.href = mailto } catch { /* ignore */ }

  // Avertissement différé : si après ~1,2s la page a toujours le focus, c'est qu'aucune
  // app mail par défaut n'a pris le relais (sinon le navigateur aurait perdu le focus).
  window.setTimeout(() => {
    if (typeof document === 'undefined') return
    if (document.hidden || !document.hasFocus()) return // une app mail a bien pris le relais
    toast.info(`Aucune application mail par défaut ne s'est ouverte — l'adresse ${addr} a été copiée.`, {
      duration: 14000,
      description:
        'Windows : Paramètres → Applications → Applications par défaut → choisissez votre messagerie (Outlook/Courrier) comme app par défaut. ' +
        'Mac : ouvrez l’app Mail → menu Mail → Réglages → Général → « Logiciel de messagerie par défaut ».',
    })
  }, 1200)
}
