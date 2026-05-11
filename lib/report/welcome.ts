// TalentFlow Rapports — Salutation dynamique candidat
// v2.4.0 — Phase 1 mobile-first
//
// Compute le message de bienvenue selon l'heure et la date (jours spéciaux
// + Pâques calculé). Pure, sans dépendances, testable côté serveur ou client.

export interface WelcomeGreeting {
  text: string
  emoji: string
}

/** Calcul du dimanche de Pâques (algo Anonymous Gregorian — Meeus/Jones/Butcher). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function sameMonthDay(d: Date, month: number, day: number): boolean {
  return d.getMonth() + 1 === month && d.getDate() === day
}

/**
 * Retourne la salutation à afficher pour le prénom donné, en se basant sur
 * la date courante (passable en paramètre pour tests). Priorise les jours
 * spéciaux sur le greeting horaire.
 */
export function getWelcomeGreeting(prenom: string, now: Date = new Date()): WelcomeGreeting {
  const safeName = (prenom || '').trim() || 'à toi'
  const month = now.getMonth() + 1
  const day = now.getDate()
  const easter = easterSunday(now.getFullYear())

  if (sameMonthDay(now, 1, 1))  return { text: `Bonne année ${safeName} !`, emoji: '🎆' }
  if (sameMonthDay(now, 8, 1))  return { text: 'Bonne fête nationale !', emoji: '🇨🇭' }
  if (sameMonthDay(now, 12, 25)) return { text: `Joyeux Noël ${safeName} !`, emoji: '🎄' }
  if (month === easter.month && day === easter.day) {
    return { text: `Joyeuses Pâques ${safeName} !`, emoji: '🐣' }
  }

  const hour = now.getHours()
  if (hour >= 5 && hour < 12)  return { text: `Bonjour ${safeName}`, emoji: '🌅' }
  if (hour >= 12 && hour < 18) return { text: `Bonjour ${safeName}`, emoji: '☀️' }
  if (hour >= 18 && hour < 22) return { text: `Bonsoir ${safeName}`, emoji: '🌆' }
  return { text: `Bonsoir ${safeName}`, emoji: '🌙' }
}

/** Mapping weathercode Open-Meteo → libellé FR + emoji. */
export function weatherLabel(code: number | null | undefined): { text: string; emoji: string } | null {
  if (code === null || code === undefined) return null
  if (code === 0) return { text: 'Ensoleillé', emoji: '☀️' }
  if (code === 1 || code === 2) return { text: 'Peu nuageux', emoji: '🌤️' }
  if (code === 3) return { text: 'Nuageux', emoji: '☁️' }
  if (code === 45 || code === 48) return { text: 'Brouillard', emoji: '🌫️' }
  if (code === 51 || code === 53) return { text: 'Bruine', emoji: '🌦️' }
  if (code === 61 || code === 63) return { text: 'Pluie', emoji: '🌧️' }
  if (code === 65) return { text: 'Forte pluie', emoji: '🌧️' }
  if (code === 71 || code === 73) return { text: 'Neige', emoji: '🌨️' }
  if (code === 75) return { text: 'Forte neige', emoji: '❄️' }
  if (code === 80 || code === 81) return { text: 'Averses', emoji: '🌦️' }
  if (code === 95 || code === 96 || code === 99) return { text: 'Orage', emoji: '⛈️' }
  return null
}
