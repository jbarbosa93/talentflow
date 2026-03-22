# TalentFlow Design V2 — Brief

## Objectif
Redesign complet du SAAS TalentFlow style **Maxton Bootstrap 5 Admin Dashboard**.
Référence : https://codervent.com/maxton/demo/vertical-menu/index.html

## Exigences
- **Deux thèmes** : Light (blanc) et Dark (sombre) — toggle dans les paramètres
- **Style Maxton** : sidebar élégante, cards avec ombres, graphiques interactifs
- **Animations Framer Motion** : page transitions, stagger, hover effects, micro-interactions
- **Couleur accent** : Jaune/Or L'Agence SA (#EAB308 / #F5A623)
- **NE PAS toucher aux fonctionnalités** — uniquement le visuel
- **Branche séparée** : `design-v2` (ne pas merger sur main sans validation)

## Stack technique à utiliser
- `framer-motion` pour animations
- CSS variables pour le theming light/dark
- `next-themes` ou contexte custom pour le toggle
- Recharts pour les graphiques dashboard (déjà installé?)

## Pages à redesigner (par priorité)
1. **Sidebar** — blanche/sombre, hover animations, active state avec accent
2. **TopBar** — recherche moderne, avatar, notifications
3. **Dashboard** — KPI cards animées, graphiques, welcome banner
4. **Liste candidats** — cards hover lift, transitions
5. **Fiche candidat** — layout 3 colonnes modernisé
6. **Paramètres** — layout propre
7. **Login page** — moderne avec animation

## Fichiers clés
- `app/(dashboard)/dashboard.css` — variables CSS + styles globaux
- `components/layout/Sidebar.tsx` — sidebar navigation
- `components/layout/TopBar.tsx` — barre supérieure
- `app/(dashboard)/dashboard/page.tsx` — page dashboard
- `components/CandidatsList.tsx` — liste candidats
- `app/(dashboard)/candidats/[id]/page.tsx` — fiche candidat

## Backup
- Tag stable actuel : `v0.12.0-stable`
- Branche design existante : `design-v2` (premiers essais)

## Notes
- Le SAAS a 4600+ candidats en base — les perf comptent
- L'utilisateur veut de l'INTERACTIVITÉ et des ANIMATIONS
- Pas juste un changement de couleurs — un vrai redesign moderne
- Tester sur localhost avant de montrer
