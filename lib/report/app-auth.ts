// v2.13.6 — Auth par token pour l'app native iOS (TalentFlow Sign / WKWebView).
//
// Problème : WKWebView ne persiste pas de façon fiable le cookie de session
// httpOnly posé par la réponse du fetch de login → l'utilisateur est déconnecté
// dès la 1re requête authentifiée (Accueil, Profil…). Dans Safari le cookie marche.
//
// Solution : DANS L'APP uniquement, on stocke le JWT (renvoyé par login/set-password)
// en localStorage et on l'envoie en `Authorization: Bearer` sur chaque appel /api/.
// Le serveur lit le header OU le cookie (cf. lib/portal-auth.ts getPortalJwt).
// Les navigateurs continuent d'utiliser le cookie → comportement web inchangé.

const TOKEN_KEY = 'tf_portal_token'

/** Vrai si on tourne dans l'app native (UA `TalentFlowSignApp`). */
export function isInApp(): boolean {
  return typeof navigator !== 'undefined' && /TalentFlowSignApp/.test(navigator.userAgent)
}

export function storePortalToken(token: string): void {
  try { if (token) localStorage.setItem(TOKEN_KEY, token) } catch { /* private mode */ }
}
export function getPortalToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function clearPortalToken(): void {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ }
}

/**
 * Installe (une seule fois) un patch de `window.fetch` qui ajoute
 * `Authorization: Bearer <token>` aux requêtes /api/ SAME-ORIGIN quand on est
 * dans l'app et qu'un token est stocké. Le token est lu À CHAQUE appel (donc
 * fonctionne même s'il est stocké après l'installation du patch). Idempotent.
 */
export function installAppFetchAuth(): void {
  if (typeof window === 'undefined') return
  if (!isInApp()) return
  const w = window as unknown as { __tfFetchPatched?: boolean; fetch: typeof fetch }
  if (w.__tfFetchPatched) return
  w.__tfFetchPatched = true
  const orig = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const token = getPortalToken()
      if (token) {
        const url = typeof input === 'string' ? input
          : input instanceof URL ? input.href
          : (input as Request).url || ''
        // SAME-ORIGIN /api/ uniquement → jamais de fuite du token vers un autre domaine.
        const sameApi = url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/')
        if (sameApi) {
          const headers = new Headers(
            (init && init.headers) ||
            (typeof input !== 'string' && !(input instanceof URL) ? (input as Request).headers : undefined),
          )
          if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
          init = { ...(init || {}), headers }
        }
      }
    } catch { /* ne jamais casser un fetch */ }
    return orig(input as RequestInfo, init)
  }
}
