# TalentFlow — CONTEXT.md
> **Lire en PREMIER à chaque session. 1 page max. Ne pas allonger.**

---

## État prod

| Clé | Valeur |
|-----|--------|
| Version | **v2.13.33** |
| URL | talent-flow.ch |
| Supabase | rdpbqnhwhjkngxxitupg (eu-west-1 Frankfurt) |
| Vercel | Pro — région dub1 |
| Dev local | port 3001 — `next dev --port 3001 --webpack` (Turbopack désactivé) |
| **Dernière sync** | **2026-06-25 12:00** |

---

## Dernière session (25/06/2026 — v2.13.32→33 + notifs push iOS débloquées)

- **🎉 Notifs push iOS DÉBLOQUÉES** (repo natif) : l'app iOS n'avait ni capability Push, ni clé APNs Firebase, ni Firebase Messaging → 0 token. Tout ajouté : (1) `App.entitlements` (aps-environment) + Background Modes ; (2) clé APNs `.p8` (Key ID `73SPSXT6A5`) uploadée dans Firebase ; (3) package **FirebaseMessaging** (SPM) + `GoogleService-Info.plist` rattaché ; (4) `AppDelegate.swift` réécrit (FirebaseApp.configure + didRegister→token FCM→plugin Capacitor). **Notifs reçues iPhone + Android, testées OK.** Commits natifs `b814d16` + `d1a6707`.
- **Android** : écran intro « Choisis ton espace » = APK périmé (9 juin) → rebuild + réinstall émulateur, l'app charge bien le splash 100% collaborateur.
- **v2.13.32 — Modal anniversaire** : cron `birthday-notifications` insère un `inapp_messages` (animation confetti) pour TOUS les candidats fêtés (modal à l'ouverture) + push. Garde-fou anti-doublon/jour.
- **v2.13.33 — DDN en gris** : date de naissance affichée grisée + « non modifiable » dans Mon profil (`report/profil`).
- **Démo** : candidat « Lucas Démo » (id `3d2f9b64-...`, DDN 25/06) + mission, pour tester. ⚠️ À supprimer quand inutile.

---

## App iOS + Android (repo séparé `~/Dev/talentflow-sign-app`)

- **À RESOUMETTRE aux 2 stores** (push) → voir `RESOUMISSION-STORES.md` (étapes au clic près)
  - **iOS 1.0.1 (5)** : capability Push + Firebase Messaging ajoutés. AAB/archive via Xcode (Product→Archive, pas de clé API CLI).
  - **Android 1.0.1 (versionCode 2)** : AAB signé prêt → `~/Desktop/TalentFlowSign-1.0.1-v2.aab`. Upload Play Console.
- Auth par **token Bearer JWT** (pas cookie — WKWebView ne stocke pas les cookies httpOnly)
- 100% collaborateur (portail candidat `/report`) — côté client = web uniquement
- Push : `lib/push/fcm.ts` (FCM HTTP v1, projet `talentflow-sign`) · tokens dans `push_tokens`

---

## TODO actif

- [ ] **🔴 Resoumettre les apps aux stores** (push) : Android (AAB prêt sur Bureau → Play Console) + iOS (Xcode Archive → App Store Connect). Étapes : `~/Dev/talentflow-sign-app/RESOUMISSION-STORES.md`. Sans ça, les vrais candidats n'ont pas les notifs.
- [ ] **Supprimer le candidat démo « Lucas Démo »** (`3d2f9b64-608c-4d3e-9eee-aafb45aab1c2`) quand plus utile pour les tests.
- [ ] **Après déploiement v2.13.19** : remettre en file les 7 fichiers suspects + sync manuel + vérifier qu'ils repartent bien (⚠️ Beau Gosse en 404 → peut nécessiter re-dépôt)
- [ ] **Perf recherche candidats** : RPC `search_candidats_filtered` fait un seq scan ~640 ms (OR avec ILIKE unaccent non-indexables). Fix = RPC v4 indexée (fts élargi + index trgm f_unaccent) avec compromis substring→lexème sur CV/compétences. À construire + benchmarker en parallèle avant bascule.
- [ ] **Corrections français** (audit 82/100) : accents `integrations/page.tsx` + `activites/page.tsx` + `doublons` ; tutoiement portail candidat ; `MB`→`Mo` (6 fichiers sign). NE PAS toucher `template`/`wizard` internes.

---

## Bugs connus non bloquants

- Rebond résiduel portail candidat (coque vs body-scroll) — non bloquant, reporté
- 14 FK sans index DB (performance, pas critique)
- 21 `<img>` → `<Image>` Next.js (bundle, pas critique)
- Firefox télécharge le CV au lieu d'afficher (probable réglage navigateur, pas un bug code)

---

## Règles de démarrage session

1. Lire ce fichier (CONTEXT.md)
2. Lire CLAUDE.md (règles, stack, patterns)
3. Lire MEMORY.md (3 dernières sessions)
4. Demander à João ce qu'il veut faire si pas précisé
5. Afficher : `[Modèle: X] [Effort: X] [Impact: fichiers concernés]`

## Règle fin de session

Mettre à jour **ce fichier** :
- Section "Dernière session" → résumé de ce qui a été fait
- Section "TODO actif" → ce qui reste à faire
- Section "Bugs connus" → ajout/suppression si nécessaire
- Incrémenter la version si déploiement

---

## Liens docs

| Doc | Contenu |
|-----|---------|
| `CLAUDE.md` | Règles, stack, patterns, architecture |
| `MEMORY.md` | 3 dernières sessions détaillées |
| `docs/CLAUDE-history.md` | Historique complet v2.6→v2.13 |
| `docs/CLAUDE-detailed-rules.md` | 85+ patterns complets + routes API |
| `memory/app-ios-wkwebview-portail.md` | Pièges WKWebView app native |
