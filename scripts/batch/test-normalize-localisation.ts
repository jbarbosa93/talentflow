/**
 * Test du normaliseur sur 50 échantillons (10 par catégorie).
 * 100% offline : pas d'IA, pas de DB. Juste la fonction lib/normalize-localisation.
 */
import { normalizeLocalisation, isAlreadyNormalized } from '../../lib/normalize-localisation'

type Sample = { cat: number; raw: string }

const samples: Sample[] = [
  // CAT 1 — "Ville, Suisse" sans CP
  { cat: 1, raw: 'Lausanne, Suisse' },
  { cat: 1, raw: 'Remaufens, Suisse' },
  { cat: 1, raw: 'Martigny, Suisse' },
  { cat: 1, raw: 'Vionnaz, Suisse' },
  { cat: 1, raw: 'Martigny, Suisse' },
  { cat: 1, raw: 'Monthey, Suisse' },
  { cat: 1, raw: 'Bulle, Suisse' },
  { cat: 1, raw: 'Massongex, Suisse' },
  { cat: 1, raw: 'Basse-Nendaz, Suisse' },
  { cat: 1, raw: 'Aigle, Suisse' },
  // CAT 2 — "Ville, France" sans CP
  { cat: 2, raw: 'Provence, France' },
  { cat: 2, raw: 'Abondance, France' },
  { cat: 2, raw: 'Divonne-les-Bains, France' },
  { cat: 2, raw: 'Saxon, France' },
  { cat: 2, raw: 'Evian Les Bains, France' },
  { cat: 2, raw: 'Auxerre, France' },
  { cat: 2, raw: 'Glère, France' },
  { cat: 2, raw: 'Lugrin, France' },
  { cat: 2, raw: 'Châtel, France' },
  { cat: 2, raw: 'Thonon les bains, France' },
  // CAT 3 — Avec rue/voirie
  { cat: 3, raw: '2 rue montebello Fontainebleau, France' },
  { cat: 3, raw: 'Rue de la Chapelle 14, 1926 Fully, Suisse' },
  { cat: 3, raw: 'Rue de Boigny 43, 1920 Martigny' },
  { cat: 3, raw: '448 rue du clos de viry' },
  { cat: 3, raw: '197 route du crochédé, Bernex, France' },
  { cat: 3, raw: 'Rue Centrale 22, 1880 Bex, Suisse' },
  { cat: 3, raw: '59, Rue Paul Bert, 94290 Villeneuve-le-Roi, France' },
  { cat: 3, raw: 'Route de Richebourg, Abondance, France' },
  { cat: 3, raw: 'Rue du Leman 29A 1907 Saxon' },
  { cat: 3, raw: 'Rue du Clos-Novex 79B, 1868 Collombey, Suisse' },
  // CAT 4 — Sans virgule / ville seule
  { cat: 4, raw: 'Aigle' },
  { cat: 4, raw: '68500 Guebwiller' },
  { cat: 4, raw: 'Mâcon' },
  { cat: 4, raw: 'Portugal' },
  { cat: 4, raw: 'Suisse' },
  { cat: 4, raw: 'Châtel' },
  { cat: 4, raw: 'Bouilly' },
  { cat: 4, raw: 'Ollon' },
  { cat: 4, raw: 'Monistrol-sur-Loire / Vouvry (Suisse)' },
  { cat: 4, raw: '108 route nationale 74500 Lugrin' },
  // CAT 5 — Multi-tokens / ordre cassé
  { cat: 5, raw: 'Fay aux Loges, 45450, France' },
  { cat: 5, raw: 'La Rivière St Sauveur, 14600, France' },
  { cat: 5, raw: 'Ollon, Vaud, Suisse' },
  { cat: 5, raw: 'Collombey, Valais, Suisse' },
  { cat: 5, raw: 'Martigny, Valais, Suisse' },
  { cat: 5, raw: 'Troistorrents, Valais, Suisse' },
  { cat: 5, raw: 'Route Belvedere 35, Leysin, Suisse' },
  { cat: 5, raw: 'Rue du Monthéolo 17, 1870 Monthey, Suisse' },
  { cat: 5, raw: 'Lugrin, 74500, France' },
  { cat: 5, raw: '11 avenue de Grande Rive, 74500 Evian les Bains, France' },
]

const PAD = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n)

let okCount = 0, nullCount = 0, sameCount = 0
let lastCat = 0

for (const s of samples) {
  if (s.cat !== lastCat) {
    console.log('\n━━━ CAT ' + s.cat + ' ━━━')
    lastCat = s.cat
  }
  const already = isAlreadyNormalized(s.raw)
  const out = normalizeLocalisation(s.raw)
  let tag: string
  if (already && out === s.raw) { tag = '[SKIP]'; sameCount++ }
  else if (out === null) { tag = '[NULL]'; nullCount++ }
  else if (out === s.raw) { tag = '[SAME]'; sameCount++ }
  else { tag = '[OK]  '; okCount++ }
  console.log(`${tag} ${PAD(s.raw, 60)} → ${out ?? 'null'}`)
}

console.log('\n━━━ Bilan ━━━')
console.log(`OK normalisé : ${okCount}/${samples.length}`)
console.log(`SKIP/SAME    : ${sameCount}/${samples.length}`)
console.log(`NULL         : ${nullCount}/${samples.length}`)
