import { describe, it, expect } from 'vitest'
import {
  findExistingCandidat,
  unaccent,
  normalizeTel,
  tel9,
  _internal,
  type CandidatMatchInput,
} from '@/lib/candidat-matching'

const { tokensOfIdentity, strictNomExact, strictNomSubset, normDdn, ddnCompare, normVille, normEmail, scoreCandidat, passesThreshold } = _internal

// ── Faux client Supabase ────────────────────────────────────────────────────
// La présélection DB ne fait que ramener des lignes ; c'est le scoring (pur) qui
// décide. Le faux client renvoie TOUJOURS le même pool → on teste la vraie
// logique de décision sans toucher à la base. Chaque méthode du builder se
// renvoie elle-même et le builder est "thenable" (résout { data: rows }).
function fakeSupabase(rows: any[]) {
  const builder: any = {
    select: () => builder,
    or: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: { data: any[] }) => void) => resolve({ data: rows }),
  }
  return { from: () => builder }
}

const match = (input: CandidatMatchInput, rows: any[], opts?: any) =>
  findExistingCandidat(fakeSupabase(rows) as any, input, opts)

// ── Helpers de normalisation ────────────────────────────────────────────────
describe('helpers normalisation', () => {
  it('unaccent : retire accents + lowercase + trim', () => {
    expect(unaccent('  Fábio MENDES ')).toBe('fabio mendes')
  })

  it('tel9 : garde les 9 derniers chiffres', () => {
    expect(tel9('+41 79 123 45 67')).toBe('791234567')
    expect(normalizeTel('+41 79 123')).toBe('4179123')
    expect(tel9('123')).toBe('') // < 9 chiffres
  })

  it('normEmail : lowercase, exige @', () => {
    expect(normEmail('  JOAO@Mail.CH ')).toBe('joao@mail.ch')
    expect(normEmail('pas-un-email')).toBeNull()
    expect(normEmail('')).toBeNull()
  })

  it('normVille : retire CP, garde avant virgule', () => {
    expect(normVille('1933 Sembrancher')).toBe('sembrancher')
    expect(normVille('Champéry, Suisse')).toBe('champery')
  })

  it('tokensOfIdentity : tokens ≥3 chars, dédupliqués, sans accents', () => {
    expect(tokensOfIdentity('Da Silva', 'Pedro').sort()).toEqual(['pedro', 'silva']) // "Da" < 3 chars
  })
})

// ── DDN : règle métier absolue ────────────────────────────────────────────────
describe('DDN — comparaison et règle 2 personnes', () => {
  it('normDdn : ISO et DD/MM/YYYY → même format', () => {
    expect(normDdn('1990-05-12')).toBe('1990-05-12')
    expect(normDdn('12/05/1990')).toBe('1990-05-12')
    expect(normDdn('12.05.1990')).toBe('1990-05-12')
    expect(normDdn('1990')).toBeNull() // année seule = non comparable
    expect(normDdn('')).toBeNull()
  })

  it('ddnCompare : null si l’une est non comparable', () => {
    expect(ddnCompare('1990-05-12', '12/05/1990')).toBe(true)
    expect(ddnCompare('1990-05-12', '1991-05-12')).toBe(false)
    expect(ddnCompare('1990-05-12', null)).toBeNull()
    expect(ddnCompare('1990', '1990-05-12')).toBeNull()
  })

  it('DDN différentes (les 2 renseignées) = TOUJOURS 2 personnes → pas de match', async () => {
    const rows = [{
      id: '1', nom: 'Mendes', prenom: 'Fabio',
      email: 'fabio@mail.ch', telephone: '+41791234567', date_naissance: '1990-05-12',
    }]
    // Même nom + même email + même tel, mais DDN différente → early reject
    const res = await match(
      { nom: 'Mendes', prenom: 'Fabio', email: 'fabio@mail.ch', telephone: '+41791234567', date_naissance: '1985-01-01' },
      rows,
    )
    expect(res.kind).toBe('none')
  })
})

// ── Identité incomplète / signal unique insuffisant ──────────────────────────
describe('garde-fous identité', () => {
  it('nom OU prénom manquant → insufficient', async () => {
    expect((await match({ nom: 'Mendes' }, [])).kind).toBe('insufficient')
    expect((await match({ prenom: 'Fabio' }, [])).kind).toBe('insufficient')
  })

  it('email identique SEUL (noms totalement différents) ne suffit pas à matcher', async () => {
    const rows = [{ id: '1', nom: 'Dupont', prenom: 'Jean', email: 'shared@mail.ch' }]
    const res = await match({ nom: 'Martin', prenom: 'Sophie', email: 'shared@mail.ch' }, rows)
    expect(res.kind).toBe('none') // score 8 (email) < 16, pas de nom
  })

  it('téléphone identique SEUL (couple/famille) ne suffit pas à matcher', async () => {
    const rows = [{ id: '1', nom: 'Dupont', prenom: 'Jean', telephone: '+41791234567' }]
    const res = await match({ nom: 'Martin', prenom: 'Sophie', telephone: '+41791234567' }, rows)
    expect(res.kind).toBe('none') // score 8 (tel) < 16
  })
})

// ── Noms composés portugais/espagnols ─────────────────────────────────────────
describe('noms composés (jamais tronqués)', () => {
  it('strictNomExact : ordre nom/prénom indifférent + accents', () => {
    expect(strictNomExact({ nom: 'Mendes', prenom: 'Fábio' }, { nom: 'Mendes', prenom: 'Fabio' })).toBe(true)
    expect(strictNomExact({ nom: 'Seare', prenom: 'Andemichael' }, { nom: 'Andemichael', prenom: 'Seare' })).toBe(true)
  })

  it('strictNomSubset : "Dos Santos Francisco Jorge" ⊂ "+Ramalho" (diff 1) = subset', () => {
    expect(strictNomSubset(
      { nom: 'Dos Santos', prenom: 'Francisco Jorge' },
      { nom: 'Dos Santos Ramalho', prenom: 'Francisco Jorge' },
    )).toBe(true)
  })

  it('strictNomSubset : diff > 2 tokens → rejet (inclusion fortuite)', () => {
    // tokens grand = ferreira, silva, ricardo, antonio, miguel (5) ; petit = ferreira, miguel (2)
    // diff = 3 > 2 → rejet
    expect(strictNomSubset(
      { nom: 'Ferreira', prenom: 'Miguel' },
      { nom: 'Ferreira Silva Ricardo Antonio', prenom: 'Miguel' },
    )).toBe(false)
  })

  it('homonymes Daniel Costa ≠ Daniel Fragoso Costa (subset mais pas exact)', () => {
    expect(strictNomExact({ nom: 'Costa', prenom: 'Daniel' }, { nom: 'Fragoso Costa', prenom: 'Daniel' })).toBe(false)
    expect(strictNomSubset({ nom: 'Costa', prenom: 'Daniel' }, { nom: 'Fragoso Costa', prenom: 'Daniel' })).toBe(true)
  })
})

// ── Scoring + seuils (cœur du matching) ───────────────────────────────────────
describe('scoring et seuils', () => {
  it('barème : DDN+10, tel+8, email+8, exact+5, subset+3, ville+3', () => {
    const s = scoreCandidat(
      { nom: 'Mendes', prenom: 'Fabio', date_naissance: '1990-05-12', telephone: '+41791234567', email: 'f@m.ch', localisation: 'Monthey' },
      { id: '1', nom: 'Mendes', prenom: 'Fabio', date_naissance: '1990-05-12', telephone: '+41791234567', email: 'f@m.ch', localisation: 'Monthey' },
    )!
    expect(s.score).toBe(10 + 8 + 8 + 5 + 3) // 34
    expect(s.strictExact).toBe(true)
  })

  it('strictExact SEUL (score 5) NE passe PAS le seuil (homonymes) — v1.9.27', () => {
    const s = scoreCandidat({ nom: 'Costa', prenom: 'Daniel' }, { id: '1', nom: 'Costa', prenom: 'Daniel' })!
    expect(s.score).toBe(5)
    expect(passesThreshold(s)).toBe(false) // exige ≥ 8
  })

  it('strictExact + ville (score 8) passe le seuil', () => {
    const s = scoreCandidat(
      { nom: 'Costa', prenom: 'Daniel', localisation: 'Monthey' },
      { id: '1', nom: 'Costa', prenom: 'Daniel', localisation: 'Monthey' },
    )!
    expect(s.score).toBe(8)
    expect(passesThreshold(s)).toBe(true)
  })

  it('subset exige ≥ 11 (un signal fort en plus)', () => {
    const subsetSeul = scoreCandidat({ nom: 'Costa', prenom: 'Daniel' }, { id: '1', nom: 'Fragoso Costa', prenom: 'Daniel' })!
    expect(subsetSeul.score).toBe(3)
    expect(passesThreshold(subsetSeul)).toBe(false)

    const subsetTel = scoreCandidat(
      { nom: 'Costa', prenom: 'Daniel', telephone: '+41791234567' },
      { id: '1', nom: 'Fragoso Costa', prenom: 'Daniel', telephone: '+41791234567' },
    )!
    expect(subsetTel.score).toBe(3 + 8) // 11
    expect(passesThreshold(subsetTel)).toBe(true)
  })

  it('sans aucun nom strict : exige 2 signaux forts (≥16)', () => {
    const unSignal = scoreCandidat(
      { nom: 'Dupont', prenom: 'Jean', email: 'a@b.ch' },
      { id: '1', nom: 'Autre', prenom: 'Personne', email: 'a@b.ch' },
    )!
    expect(passesThreshold(unSignal)).toBe(false) // 8 < 16
  })

  it('end-to-end : match certain renvoyé avec breakdown', async () => {
    const rows = [{
      id: '42', nom: 'Mendes', prenom: 'Fabio',
      date_naissance: '1990-05-12', telephone: '+41791234567', email: 'f@m.ch',
    }]
    const res = await match(
      { nom: 'Mendes', prenom: 'Fabio', date_naissance: '1990-05-12', telephone: '+41791234567', email: 'f@m.ch' },
      rows,
    )
    expect(res.kind).toBe('match')
    if (res.kind === 'match') {
      expect(res.candidat.id).toBe('42')
      expect(res.scoreBreakdown.ddnMatch).toBe(true)
    }
  })

  it('pool vide → none', async () => {
    expect((await match({ nom: 'Inexistant', prenom: 'Personne' }, [])).kind).toBe('none')
  })
})

// ── Bande uncertain ───────────────────────────────────────────────────────────
describe('bande uncertain', () => {
  it('strictExact + ville seule (score 8) → uncertain', async () => {
    const rows = [{ id: '1', nom: 'Costa', prenom: 'Daniel', localisation: 'Monthey' }]
    const res = await match({ nom: 'Costa', prenom: 'Daniel', localisation: 'Monthey' }, rows)
    expect(res.kind).toBe('uncertain')
  })

  it('Option B : score ≥ 11 sans DDN des 2 côtés → uncertain (sauf email+tel identiques)', async () => {
    // subset + tel = 11, pas de DDN → uncertain
    const rows = [{ id: '1', nom: 'Fragoso Costa', prenom: 'Daniel', telephone: '+41791234567' }]
    const res = await match({ nom: 'Costa', prenom: 'Daniel', telephone: '+41791234567' }, rows)
    expect(res.kind).toBe('uncertain')
  })

  it('garde-fou Option B : email ET tel identiques → vrai match (pas uncertain)', async () => {
    // exact + tel + email = 21, pas de DDN, mais email+tel → match
    const rows = [{ id: '1', nom: 'Mendes', prenom: 'Fabio', telephone: '+41791234567', email: 'f@m.ch' }]
    const res = await match(
      { nom: 'Mendes', prenom: 'Fabio', telephone: '+41791234567', email: 'f@m.ch' },
      rows,
    )
    expect(res.kind).toBe('match')
  })
})

// ── attachmentMode (rattachement non-CV) ──────────────────────────────────────
describe('attachmentMode', () => {
  it('seuil relâché (≥3) mais exige UN seul candidat (sinon none)', async () => {
    const deux = [
      { id: '1', nom: 'Costa', prenom: 'Daniel' },
      { id: '2', nom: 'Costa', prenom: 'Daniel' },
    ]
    const res = await match({ nom: 'Costa', prenom: 'Daniel' }, deux, { attachmentMode: true })
    expect(res.kind).toBe('none') // ambiguïté → refus
  })

  it('priorité strictExact sur subset : 1 exact + 1 subset → rattache à l’exact', async () => {
    const rows = [
      { id: 'exact', nom: 'Costa', prenom: 'Daniel' },
      { id: 'subset', nom: 'Fragoso Costa', prenom: 'Daniel' },
    ]
    const res = await match({ nom: 'Costa', prenom: 'Daniel' }, rows, { attachmentMode: true })
    expect(res.kind).toBe('match')
    if (res.kind === 'match') expect(res.candidat.id).toBe('exact')
  })
})
