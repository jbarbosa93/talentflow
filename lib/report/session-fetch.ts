// v2.13.4 — Fetch résilient pour le portail rapport DANS l'app native iOS (WKWebView).
//
// Contexte : l'app (TalentFlow Sign) démarre sur `capacitor://localhost` puis charge
// le site distant. Juste après le login, le cookie de session peut ne pas être
// immédiatement disponible pour la 1re requête d'une nouvelle page → 401 → la page
// renvoyait au login (« connecté puis déconnecté », « Indisponible »).
//
// Ce helper retente un 401 TRANSITOIRE quelques fois avant de le considérer comme
// une vraie déconnexion. `credentials: 'include'` pour forcer l'envoi du cookie.
export async function fetchPortalSession(
  url: string,
  opts?: RequestInit,
  retries = 3,
  delayMs = 350,
): Promise<Response> {
  let res: Response = await fetch(url, { credentials: 'include', ...opts })
  for (let i = 0; i < retries && res.status === 401; i++) {
    await new Promise(r => setTimeout(r, delayMs))
    res = await fetch(url, { credentials: 'include', ...opts })
  }
  return res
}
