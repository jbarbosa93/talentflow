# TalentFlow — CLAUDE.md

> **Détails techniques** : `docs/CLAUDE-detailed-rules.md` (patterns complets + routes API)
> **Historique complet** : `docs/CLAUDE-history.md` (changelog v2.6.x → v2.9.45, audits sécurité, dette technique)
> **Sessions/versions** : `~/.claude/.../memory/MEMORY.md` (index condensé) + `memory/session_*.md` (détails)

---

## Règles de comportement

**Langue** : toujours répondre en **français**, même si le code est en anglais.

**Avant de toucher** :
- Auth / middleware / RLS → demander confirmation explicite, risque élevé de régresser l'accès
- Migrations Supabase → toujours montrer le SQL avant d'exécuter
- Suppression de données ou colonnes → demander confirmation, action irréversible
- `app_settings`, `email_otps`, `onedrive_fichiers`, `secretariat_*`, `logs_secretariat`, `candidat_documents`, `client_portals`, `report_link_clients`, `report_submissions`, `sign_envelopes`, `sign_tokens`, `portal_accounts`, `portal_tokens`, `portal_login_attempts` → tables sensibles, vérifier les RLS

**Signaler les risques** :
- Tout changement dans `lib/supabase/`, `middleware.ts` ou `app/(auth)/` → mentionner le risque
- Modifications des routes API existantes → vérifier les usages côté client avant
- Ajout de dépendances npm lourdes → signaler l'impact sur le bundle Vercel

**Style de réponses** : concis, direct, pas de résumé en fin de réponse.

---

## MODÈLE À UTILISER

| Tâche | Modèle | Pourquoi |
|---|---|---|
| Bug fix ciblé, correction CSS, typo, rename | claude-haiku-4-5 | Rapide, pas besoin de raisonnement profond |
| Nouveau composant UI, route API simple, refacto isolé | claude-sonnet-4-5/6 | Bon équilibre vitesse/qualité |
| Architecture nouvelle, migration DB complexe, refacto multi-fichiers, logique métier critique | claude-sonnet-4-5/6 | Raisonnement étendu activé |
| Audit complet, plan technique multi-phases, décisions irréversibles (migrations prod, breaking changes) | claude-opus-4-5/7 | Analyse maximale |

### Règle automatique
Avant chaque tâche, afficher EN UNE LIGNE :
`[Modèle: {nom}] [Effort: {faible|moyen|élevé}] [Impact: {fichiers touchés}]`

Si la tâche demandée dépasse le modèle recommandé (ex : bug fix qui révèle une architecture à revoir) → signaler et proposer de monter en modèle avant de continuer.

---

## Règles workflow — Modifications & Déploiement

### Avant chaque modification
1. Identifier tous les fichiers touchés
2. Pour chaque fichier → lister les fonctionnalités qui l'utilisent
3. Signaler avec ⚠️ toute fonctionnalité qui pourrait être impactée
4. Attendre confirmation de João avant de continuer

### Après chaque modification
1. Relire les fichiers modifiés
2. Vérifier mentalement qu'aucune fonctionnalité existante n'est cassée
3. Lister les fonctionnalités à tester manuellement
4. Signaler si un test est recommandé avant déploiement

### Avant chaque déploiement
1. `git add -A`
2. `git commit -m "feat/fix: description + version"`
3. `git tag vX.X.X`
4. **DEMANDER CONFIRMATION EXPLICITE À JOÃO AVANT TOUT `git push`** — Vercel est connecté au repo GitHub et déploie automatiquement à chaque push sur `main`. Un push = un deploy. Donc jamais de push sans validation.
5. `git push origin main --tags` (seulement après le « oui déploie » de João)

### ⛔ JAMAIS pusher sur GitHub sans l'accord explicite de João
- Vercel déploie auto sur chaque push vers `main` → pas de safety net
- Toujours préparer le commit localement, montrer le récap, attendre « oui déploie », puis seulement `git push`

### ⛔ Build local + vérif Vercel après chaque push (v1.9.78)
**Avant tout `git push` qui touche :**
- Hooks de navigation (`useSearchParams`, `useRouter`, `usePathname`) dans un nouveau composant top-level
- Layouts, middleware, `next.config.ts`
- Nouvelles dépendances npm
- Routes API nouvelles ou leur runtime config
- Toute logique SSR/SSG (generateStaticParams, metadata, revalidate)

→ **Obligatoire** : `npm run build` local (pas juste `tsc --noEmit`). `tsc` ne détecte pas les erreurs de prerendering Next.js.

**Après chaque `git push` :**
1. Récupérer l'ID du deploy via MCP Vercel (`list_deployments`)
2. Attendre l'état : READY (OK) ou ERROR (fetch build logs)
3. Si ERROR → fix immédiat + re-push + revérif
4. Ne JAMAIS considérer le push comme « déploiement terminé » tant que Vercel ne dit pas READY

### Commits
- Commiter uniquement avant chaque déploiement prod
- Pas obligatoire pendant le développement localhost
- Message commit clair avec la version et description

### Mise à jour MEMORY.md et CLAUDE.md
À chaque fin de session (avant déploiement) :
1. Mettre à jour `MEMORY.md` (1-ligne par session)
2. Mettre à jour `CLAUDE.md` (version + changelog condensé si pattern nouveau)
3. Inclure dans le même commit que le déploiement

**Récap obligatoire avant déploiement** :
```
✅ Tâches terminées : [liste]
⚠️ Points d'attention : [liste si applicable]
🚀 Prêt à déployer sur Vercel — tu confirmes ? (oui / non)
```

---

## Version actuelle

**v2.13.18** — 22/06/2026 (Envois : modale destinataires portalisée (pattern #10) + libellé lieu simplifié.)

### v2.13.18 (22/06) — Envois : modale destinataires portalisée + libellé lieu

**Modale « Choisir les destinataires »** (`app/(dashboard)/messages/page.tsx` `ClientPickerModal`) était la **seule modale non portalisée** de la page → un ancêtre `transform` cassait son `position:fixed` → modale **coupée en bas / footer non collé** sur petit écran (pattern #10). **Fix** : `createPortal(…, document.body)` + `maxHeight 85vh→90dvh`. Le bug distance v2.13.17 confirmé OK par João (56 mails au lieu de 17). + libellé du lieu : on n'affiche plus le **district** (« Monthey ») à côté de la localité dans la liste déroulante (`slice(1,3)`→`slice(1,2)`).

**Contact « sans nom » en mode portail** (`app/(dashboard)/sign/rapports/new/page.tsx`) : le champ « Nom du contact client » était **masqué quand le portail rapports est activé** (`{!useClientPortal && …}`) → on ne pouvait saisir QUE l'email → le contact enregistré sur la fiche client n'avait pas de nom. **Fix** : champ affiché aussi en mode portail (hint adapté) → le contact est enregistré avec prénom/nom.

### v2.13.17 (22/06) — Pack 3 bugs : import CV, distance clients, portail rapports

**🔴 Import CV — faux « Réactivé » par nom de fichier générique** (`lib/cv-filename.ts` NOUVEAU + `app/(dashboard)/api/cv/parse/route.ts:201`) :
Le pré-check d'idempotence « fichier déjà importé » comparait `file.name` (puis un fallback nettoyé `replace(/^(\d+_)+/,'').replace(/_/g,' ')`) à `candidats.cv_nom_fichier`. Sur un nom **générique** (`CV 2025.pdf`, `cv.pdf`, `scan.pdf`…), ce nom est partagé par plusieurs fiches → collision → faux « Réactivé — <autre personne> ». Cas réel : importer José Batista réactivait Duarte Barbacena (seul candidat portant `cv_nom_fichier='CV 2025.pdf'`, **aucun** signal d'identité commun). Viole la règle métier « jamais matcher sur le nom de fichier ». **Fix** : `isGenericCvFilename()` gate le pré-check → ne s'applique qu'aux noms **discriminants** (≥1 token ≥3 lettres, hors mots génériques/nombres). Les noms génériques passent direct au matching par **contenu (SHA256 + IA)**. Test `lib/__tests__/cv-filename.test.ts`. Cause latente depuis v1.8.28, pas une régression récente.

**🟠 Envois — recherche clients par distance** (`app/(dashboard)/messages/page.tsx` `ClientPickerModal`) :
La modale re-géocodait **chaque ville via Nominatim côté client** (rate-limit + échecs sur formats `"Villeneuve VD 1844 VD"`, `"Muraz (Collombey)"`…) → `dist===null` **exclu** → ~17 entreprises au lieu de centaines. **Fix** : utilise les **coords GPS déjà en base** (`c.latitude/longitude`, sur 1204/1205 clients ; Nominatim = repli pour les rares sans coords). + **distance routière** (`ROAD_DETOUR_FACTOR=1.35`, comme `api/candidats/route.ts`) au lieu du vol d'oiseau pur. + recherche du lieu biaisée `countrycodes=ch,fr`. Résultat : ~285 entreprises dans 20 km du Bouveret.

**🟡 Rapports — portail + email client** (`app/(dashboard)/sign/rapports/new/page.tsx` + `app/(dashboard)/api/admin/reports/last-client-email/route.ts` NOUVEAU) :
Surtout un malentendu (le flux marchait). (1) **email client pré-rempli avec le dernier email réellement utilisé pour l'entreprise** (`report_link_clients.client_email` le plus récent par `client_id`), prioritaire sur l'email générique → plus de re-saisie à chaque candidat ; (2) **texte du toggle clarifié** : l'email part **quand le candidat signe sa semaine** (pas à la création), aucun mot de passe à créer. Rappel : cocher « Utiliser le portail rapports » **auto-crée** le `client_portals` (public, slug) — `/missions/portails` ne sert qu'à gérer/protéger après (optionnel, jamais obligatoire).

### v2.13.7→16 (22/06) — Portail app iOS : fixes UI + app 100% collaborateur resoumise

**Web (déployé, v2.13.16) — corrections portail rapport candidat (`/report`)** :
- **Météo** (`CandidatWelcomeHeader`) : géoloc demandée **une seule fois**, coords+météo en **cache localStorage** (WKWebView ne mémorise pas l'autorisation → sinon prompt à chaque ouverture).
- **`<Toaster>` Sonner** ajouté à `app/report/layout.tsx` (manquait → la confirmation « Mot de passe modifié » ne s'affichait pas).
- **Déconnexion** : `clearPortalToken()` efface aussi `tf_report_last` (sinon `/report` rouvrait le dernier rapport public → semblait encore connecté).
- **`HelpGuideModal`** : verrou scroll de fond + `paddingBottom` safe-area (boutons coupés).
- **Overscroll « bande crème vide »** : `100vh`→`100dvh` partout + suppression du **double `paddingTop` safe-area** (les pages `/report/*` ajoutaient le même que le layout) + `AuthLayout` aligné en haut (`flex-start`, plus de centrage vertical). ⚠️ Le **rebond résiduel** (coque figée vs body-scroll) reste à peaufiner — non bloquant, reporté.

**App native (`~/Dev/talentflow-sign-app`, build 1.0(4), resoumise App Store)** :
- **100% collaborateur** : suppression de la page « Choisis ton espace » + du côté client (les clients passent par le **web**, inchangé). `www/index.html` = **splash logo animé** → redirige vers `/report` (login candidat, ou son rapport si connecté).
- `capacitor.config.ts` : **`server.url` retiré** (le token-auth marche cross-origin) + **`backgroundColor:'#FAFAF7'`** (fin de la bande blanche en bas).
- Build 3→4, archive Release signée (`xcodebuild archive -allowProvisioningUpdates`), upload via **Xcode Organizer → Distribute App**, build 4 sélectionné sur App Store Connect → **version 1.0 « En attente de vérification »** (review 24-48h). Le refus 2.1a (login loop) est corrigé par le token-auth ; 3.2 réglé via unlisted.

→ Détails app + pièges WKWebView : `memory/app-ios-wkwebview-portail.md`.

### v2.13.6 (22/06) — Auth portail par token Bearer dans l'app (fin du bug WKWebView)

**Cause racine prouvée** (inspection conteneur simulateur + test vrai iPhone) : WKWebView (coque Capacitor `ch.talentflow.sign`) **ne stocke PAS** le cookie de session `httpOnly` posé par la réponse du `fetch()` de login → cookie jamais renvoyé → toute page authentifiée (`/api/portal/*` = Accueil/Profil/Documents) → 401 → déconnexion. Safari marche (le site n'expose pas ces onglets app-only). Ni SameSite, ni app-bound domains, ni server.url first-party ne fiabilisent ce cookie (confirmé sur **device réel**, pas le simulateur).

**Fix définitif (web-only, pas de rebuild app)** : token JWT pour l'app, cookie inchangé pour le web.
- `lib/portal-auth.ts` : `getPortalJwt(type)`/`getPortalSession(type)` lisent `Authorization: Bearer` d'abord, sinon le cookie. 11 routes migrées (`portal-auth/{me,change-password}`, `portal/{profile,documents,documents/[docId]/file,change-email/request,change-email/confirm}`, `push/{inapp,register}`, `reports/[slug]` + `client-portal/[slug]` branches auth_required).
- `login`+`set-password` renvoient le `token` (JWT) dans le body.
- Client `lib/report/app-auth.ts` : app (UA `TalentFlowSignApp`) → stocke le token (localStorage) + **patch global `fetch`** ajoutant `Authorization: Bearer` aux appels `/api/` **same-origin** (pas de fuite cross-origin). `AppAuthInit` monté tôt dans `app/report/layout.tsx`. `LoginForm`/`SetPasswordForm` stockent ; logout purge.
- Installé par câble sur le vrai iPhone (Mode développeur + UDID `00008150-000C54210A42401C` enregistré au compte dev 4RBJRRF9R6) → contourne TestFlight (verrou backend Apple 90j). ⚠️ `talentflow-sign-app/capacitor.config.ts` a `server.url='.../report'` en TEST → à retirer pour restaurer le lanceur local une fois validé.

### v2.13.4 (22/06) — Onglets portail résilients au 401 (helper fetchPortalSession)

L'onglet **Accueil** (`/report/accueil`) déconnectait sur 401 (« Indisponible » puis logout) — non durci en v2.13.2. Helper `lib/report/session-fetch.ts` `fetchPortalSession()` (retente un 401 transitoire ≤3× 350ms avec `credentials:'include'`) appliqué à `accueil`, `profil`, `documents`. Complète SameSite=None (v2.13.3) : plus aucun point de déconnexion non durci.

### v2.13.3 (22/06) — Cookie portail SameSite=None pour l'app (vraie cause WKWebView)

v2.13.1/2 insuffisants : le retry n'a rien changé → le cookie n'était **jamais** renvoyé aux XHR. Vraie cause : l'app démarre sur `capacitor://localhost` → WKWebView traite les requêtes API (`/api/portal-auth/me`, `/api/reports/...`) comme **cross-site** → un cookie `SameSite=Lax` n'est pas envoyé → 401 → « connecté puis déconnecté ». Fix : `lib/portal-auth.ts sessionCookieOptions(userAgent)` renvoie **`SameSite=None; Secure` SI UA `TalentFlowSignApp`** (l'app), sinon `Lax` (navigateurs → pas de surface CSRF hors app). Passé l'UA dans `app/api/portal-auth/{login,set-password}/route.ts`. Web-only, **aucun rebuild app**. Testé sur simulateur iOS.

### v2.13.2 (22/06) — Fix déconnexion immédiate post-login (app iOS WKWebView)

Suite v2.13.1 : le login passait mais l'app déconnectait « à la seconde ». Cause : l'app charge le site distant depuis l'origine `capacitor://localhost` → iOS ne rend pas le cookie de session disponible immédiatement pour la 1re requête de la **page suivante** (`/report` puis `/report/{slug}`) → 401 → retour login. Fix web-only : `app/report/page.tsx` (check `me`) et `app/report/[slug]/page.tsx` (fetch `/api/reports/{slug}`) **retentent un 401 transitoire** (≤3-4 essais × 350ms, ~1-1,4s) avant de rediriger vers le login. Testé sur **simulateur iOS** (build local de `~/Dev/talentflow-sign-app`). Si insuffisant (cookie jamais stocké = ITP dur) → correctif natif `WKAppBoundDomains` (Info.plist, rebuild). ⚠️ **TestFlight bloqué** par un verrou backend Apple (build 1 expiré à 90j) — diagnostic dans [[apple-rejection-sign-ios]] ; contournement = simulateur.

### v2.13.1 (22/06) — Fix boucle login portails (app iOS, refus Apple 2.1a)

`components/portal-auth/LoginForm.tsx` : après login réussi, on confirme que `/api/portal-auth/me` renvoie 200 (session lisible) **avant** `window.location.assign(next)`. En WKWebView, le cookie posé par la réponse XHR du login mettait un instant à être disponible → `/report` rappelait `me` trop tôt → 401 → retour login en boucle (« loading icon puis login screen sans erreur », testé iPad iOS 26.5). Boucle ≤6 essais × 300ms. Couvre candidat (`/report`) + client (`/client-portal`). Fix web → effet immédiat dans l'app (coque qui charge le site live), pas de rebuild pour le bug. (Complète v2.11.2 nav dure, insuffisante seule.)

### v2.13.0 (19/06) — Cockpit « Santé système » (Outils)

Nouvelle page admin **`/outils/sante`** (tuile dans `/outils`) + route **`GET /api/admin/system-health`** (gating `ADMIN_EMAIL` serveur, sinon `{allowed:false}`). Lecture seule, agrège des tables existantes (aucune écriture). 4 cartes auto-rafraîchies (60s) avec pastilles vert/orange/rouge :
- **OneDrive/imports** : dernier sync (`onedrive_fichiers.traite_le`), erreurs 7j (`statut_action='error'`), candidats `import_status='a_traiter'`.
- **Rapports & signatures** : `report_links` actifs, `report_submissions` en attente (draft/candidate_signed/client_signed) + finalisés 7j, `sign_envelopes` non signées + qui traînent (>7j).
- **Emails** : `emails_envoyes` confirmés (`statut='envoye'`) + canal natif WhatsApp/SMS (`statut='tentative'`, NON un échec) + en file. ⚠️ Aucun statut `erreur` dans la table → échecs réels = Sentry.
- **Crons** : seul `onedrive-sync` traçable en base (pas de table `cron_runs`) ; les 7 autres affichent leur horaire. Suivi exact = table de logs cron à créer (proposé, non fait).

Colonnes validées contre la prod (`rdpbqnhwhjkngxxitupg`). Route admin-gated comme `/api/missions/alertes`.

### v2.12.3 (19/06) — Fix sécurité : `/api/rapport-heures` protégé

### v2.12.3 (19/06) — Fix sécurité : `/api/rapport-heures` protégé

2e route flaggée par l'audit. `POST /api/rapport-heures` (générateur PDF, outil dashboard) n'avait pas de garde-fou. Ne touche pas la DB (pas de fuite, au pire abus de calcul) mais incohérent → `requireAuth()` ajouté. Toutes les routes « sans garde-fou » restantes dans la matrice sont publiques par design.

### v2.12.2 (19/06) — Fix sécurité : `/api/jobroom/post` protégé

Faille trouvée par l'audit routes (v2.12.1) : `POST /api/jobroom/post` n'avait **aucun garde-fou** → n'importe qui pouvait poster une annonce sur Job-Room avec les identifiants SECO de L-Agence. Ajout de `requireAuth()` (pattern standard). Matrice mise à jour (`docs/API-ROUTES-MATRIX.md`).

### v2.12.1 (19/06) — Alertes missions masquables + audit (tests, matrice routes, README)

- **Alertes cloche masquables** (`components/NotificationBell.tsx`) : les sections **🔚 Fins de mission** et **📄 Rapports manquants** (calculées serveur, donc pas de PATCH) ont désormais une **croix ×** par ligne + un bouton **« Vider »** par section. Masquage persisté en **localStorage** (`tf_mission_alerts_dismissed_v1`, clé par `mission_id`) → permanent, ne revient plus chaque jour. ⚠️ Par navigateur (pas synchro mobile — migration DB possible si besoin).
- **Tests cœur métier (Vitest)** : `npm test` / `test:watch` / `typecheck` ajoutés. 80 tests purs figeant les règles métier absolues : `lib/__tests__/{candidat-matching,document-classification,merge-candidat}.test.ts` + `lib/sign/__tests__/pointage.test.ts`. Vitest = devDependency (zéro impact bundle). Commit `88281d0`.
- **Audit (lecture seule)** : `docs/API-ROUTES-MATRIX.md` (242 routes générées + triage). 🔴 **1 faille trouvée** : `/api/jobroom/post` sans garde-fou (POST anonyme vers Job-Room avec creds SECO) → **à corriger** (`requireAuth()`). `/api/rapport-heures` à confirmer. README par défaut Next.js remplacé par un vrai README TalentFlow.

### v2.12.0 (18/06) — Missions (durée rapide, projection ETP, alertes cloche) + pack bugs

**Missions** (`app/(dashboard)/missions/page.tsx`) :
- Modale Nouvelle mission : boutons **+14 jours / +3 mois** (`fillDateFin`) → date de fin calculée depuis la date de début.
- Carte **ETP actif** : ligne **« → Sem. prochaine : X.XX ETP »** (`computeEtpSemaine(activeEnCours, now+7j)`) + delta coloré. La fonction acceptait déjà une date de référence.
- Retrait du texte rouge « N fins de mission » (→ « Placements actifs »).

**Alertes cloche — João seul** (`ADMIN_EMAIL`, gating serveur) :
- Nouvelle route `GET /api/missions/alertes` → `{ finsMission, rapportsManquants }` (réservée à João, sinon listes vides).
- `NotificationBell` : sections **🔚 Fins de mission** (déjà passées non renouvelées + aujourd'hui + 3 prochains jours) avec badge **À REPLACER** (idée 5 : aucune mission ne prend le relais derrière le candidat) + **📄 Rapports manquants** (idée 6 : mission **indéterminée** + candidat **lié aux rapports** `report_links.status='active'` mais sans soumission `report_submissions.week_start` depuis 14j). Lecture seule, se résolvent toutes seules.

**Pack bugs** :
- **Matching IA** (`matching/page.tsx`) : `MiniBar` débordait (`width:140` dans colonne `110`) → pastille de score chevauchait les barres. Barres → `width:'100%'`, colonne → 128px + `marginRight`.
- **Aperçu documents Sign** (`api/sign/envelopes/[id]/uploads` branche `?path=`) : Content-Type déduit de l'extension quand `blob.type` est générique (`octet-stream`) → Chrome téléchargeait le PDF même en `inline`. Branche `?composed=` était déjà inline.
- **Portail client** (`client-portal/[slug]/page.tsx`) : si `mission.date_fin < today` → « Mission du … au … · terminée » au lieu de « En mission depuis ».
- **Mailing** (`components/EmailChipInput.tsx`) : `focused` restait à `false` dans certains enchaînements → pas d'autocomplete au 2e email. Fix : `onChange` force `setFocused(true)` (reproduit + vérifié en live via fiber React : 0 → 8 suggestions).
- **Non-bugs** : contact client email-seul (déjà corrigé v2.10.48), rôles wizard (s'affichent bien).

### v2.11.2 (10/06) — Fix boucle login portail (refus Apple 2.1a + 3.2)

Apple a refusé TalentFlow Sign iOS 1.0(1) : « when we tried to login the app displayed the connection screen in a loop ». Cause double, 100% côté web (l'app = coque → resoumission du MÊME binaire après deploy Vercel) :
- `lib/portal-auth.ts` — cookie session portail `SameSite: 'strict'` → `'lax'` (Strict pas renvoyé par WKWebView sur la nav post-login → 401 → boucle). Lax bloque toujours le CSRF cross-site POST.
- `components/portal-auth/LoginForm.tsx` — `router.push(next)` → `window.location.assign(next)` (nav DURE : cookie posé par réponse XHR pas garanti dispo pour les fetch d'une nav soft en WKWebView).
- 2e motif : **Guideline 3.2 Business** (app réservée aux collaborateurs/clients L-Agence, distribution publique choisie) → réponse aux 5 questions + demande de distribution **unlisted**.

### v2.10.45→52 (08/06) — App Store + fixes portail app native iOS

Journée **publication App Store** (compte Apple Developer validé — Team ID `4RBJRRF9R6`, Individual). Détails complets : MEMORY.md.

- **v2.10.49** — **« 1 candidat = 1 lien »** : liens rapport centrés candidat. `/sign/rapports/new` → entreprise **optionnelle** + **réutilise le lien existant** du candidat (toast `d.reused`).
- **v2.10.50/51/52** — fixes **app native iOS** (portail `/report`) : bottom nav coupée par barre home (`paddingBottom: max(10px, env(safe-area-inset-bottom))` sur `PortalBottomNav`), modal « Ajouter document » scrollable (`maxHeight calc(100dvh - safe-area-top)`) + boutons fichier stylés « 📷 Prendre une photo », **dark mode verrouillé clair** (vars `--foreground` sur `report/layout`) + **Dynamic Island** (`viewportFit: 'cover'` + `paddingTop env(safe-area-inset-top)` + barre floutée).
- **v2.10.45→48** — Récap Accueil portail (heures/entreprise/repas) ; Sentry bruit réduit ; lien invitation WhatsApp cassé (retour ligne dans `NEXT_PUBLIC_APP_URL`) ; contact client « Erreur serveur » (colonne `updated_at` inexistante).
- **TalentFlow Sign → App Store** : app Capacitor (`ch.talentflow.sign`) **soumise, « En attente de vérification »**. ⚠️ Repo séparé `~/Dev/talentflow-sign-app`. Reste prochain build : footer adresse, persistance session WKWebView, autofill mdp (Associated Domains).
- **Hors TalentFlow** (repos séparés) : **FinanceApp** (Apple ID 6778033852, iOS gratuit paywall Stripe caché via UA) + **Calma** (Apple ID 6778036244, site `calma-bien-etre.ch` créé/Infomaniak, DNS configuré via MCP Chrome) aussi soumises.

### v2.9.93→2.10.17 (02/06) — Post-go-live + App mobile native

**App native (repo séparé `~/Dev/talentflow-sign-app`, Capacitor 8 SPM)** : coque iOS+Android qui charge les portails live distants. Écran d'accueil (Collaborateur → `/report/login` · Client → `/client-portal/login`). `appId: ch.lagence.talentflowsign`. Icône éclair + splash + Face ID (`@aparajita/capacitor-biometric-auth`) + caméra (`@capacitor/camera`). Compte Apple Developer **Individual** soumis (en validation). ⚠️ Une app « Talentflow » (CodeksAI) existe déjà → notre nom « TalentFlow Sign » est distinct. Détails : MEMORY.md.

**Fixes/features web déployés (v2.10.10→17)** :
- **v2.10.14** — FIX critique email validation client (mode portail) : envoie à l'email saisi sur le lien (`report_link_clients.client_email`, ex chef de chantier/RH) au lieu de `clients.email` (placeholder info@l-agence.ch). ⚠️ Règle : **toujours renseigner l'email du client à la création du lien** (sinon repli sur l'adresse entreprise).
- **v2.10.17** — Nouveau rapport repart à l'étape 1 (clé `currentStepIdx` scopée par `weekStartDate`) + signature visible en dark mode (`color-scheme: light` zone signature + report layout).
- **v2.10.12** — Pièces jointes HEIC iPhone → JPEG serveur (`heic-convert`) : lisibles Windows + assemblées recto/verso.
- **v2.10.11** — Signature rognée au tracé (`trimToInk`). **v2.10.15** — champs connexion 16px (anti-zoom iOS). **v2.10.16** — bandeau « app à venir » portail candidat. **v2.10.13** — bandeau PWA install retiré. **v2.10.10** — pauses pointeuse (De..à.. + garde-fous) + page de connexion portail.

### v2.9.82 (29/05) — Pointeuse (timbrage GPS) + email destinataire + annotation client

- **Pointeuse** : nouveau type de champ `pointage` (templates rapport). Widget `PointageField` (`components/sign/PointageField.tsx`) : Début/Fin (input time + bouton « Maintenant ») + pauses dynamiques (début/fin) + total auto + GPS au Début/Fin. Logique pure dans `lib/sign/pointage.ts` (`pointageHours`, `pointageFilled`, `isPointageValue`) — importée serveur (pdf, field-helpers) + client. Valeur stockée en objet `{start,end,pauses[],startGps,endGps}` dans `field_values[id]`.
- **Total semaine** : `computeFormulaValue` op `sum` détecte les valeurs pointeuse → additionne `pointageHours`. (Aussi : type `time` + op `worktime` ajoutés comme briques.)
- **Création de champ en Wizard** : `WizardEditor` → bouton « ➕ Créer un nouveau champ » (avant : seulement assigner des champs du Mode Document). `createFieldInStep`.
- **PDF** : `pointage`/`time` non tamponnés sur le corps (pattern : total via formule). Page annexe `appendTimbrageAnnex` dans `lib/report/pdf-generator.ts` (détail début/pauses/fin/GPS + total/jour + total semaine).
- **Email destinataire interne** : colonne `report_links.notify_email` (migration `20260529_report_links_notify_email.sql`). PATCH `/api/admin/reports/[id]` accepte `notify_email`. Sign route (`api/reports/client/[token]/sign`) : `notify_email` prime sur créateur/ADMIN_EMAIL. UI : carte `NotifyEmailCard` sur `/sign/rapports/[id]`.
- **Annotation WhatsApp client** : encadré explicatif sur `app/report/client/[token]/page.tsx` (bouton WhatsApp = transfert à un collègue, pas à L-Agence ; signer = en bas).
- **Records `SignFieldType`** complétés (`time`+`pointage`) : FieldsCanvas ×2, docusign-import, FIELD_TYPE_LABELS, TemplateEditor TOOL_ICONS.

### v2.9.81 (29/05) — Fiche : Notes Clients lecture seule + fix notes portail bloquées

### v2.9.81 (29/05) — Notes Clients (fiche, lecture seule) + fix chargement portail

- **Notes Clients sur la fiche** : bouton « Notes Clients » (lecture seule) → modal listant les notes `candidat_notes_partagees` avec **nom entreprise** (clients.nom résolu) + date. GET `/api/candidats/[id]/notes-partagees` enrichi (`entreprise` par note). Complète v2.9.78 : bouton « Notes » = interne pur ; « Notes Clients » = ce que le client poste sur le portail.
- **Fix « Chargement… » infini** : `SharedNotesModal` — `onCountChange` (fonction inline) dans les deps de `fetchNotes` → boucle de re-fetch. Stabilisé via `useRef` (deps `[apiBase]`).

### v2.9.80 (29/05) — Portails clients : copier le lien d'invitation

### v2.9.80 (29/05) — Portails clients : copier le lien d'invitation

`PortalAccountsPanel` : bouton « Copier lien » à côté de « Renvoyer » (statut `invited`) → copie le lien set-password que le client reçoit par email (envoi WhatsApp). Nouvelle route `POST /api/admin/portal-accounts/[id]/invitation-link` : retourne le lien (`/client-portal/set-password?token=` ou `/report/set-password?token=`) sans envoyer d'email, en réutilisant le token invitation valide existant (sinon en crée un). Utilisé sur Missions → Portails clients + fiche lien rapport.

### v2.9.79 (29/05) — Rapports : changer le template d'un lien rapport

Nouvelle card « Template du rapport » sur `/sign/rapports/[id]` (`ReportTemplateCard`) : bouton Modifier → `<select>` des templates `kind='report'` → PATCH `template_id`. Non-destructif : les soumissions déjà signées gardent leur template ; seuls les prochains rapports utilisent le nouveau (flux public `getTemplateForLink(link.template_id)` chargé dynamiquement). Route PATCH `/api/admin/reports/[id]` accepte `template_id` (valide existence + `kind='report'`). Use-case : modèle de rapport dédié par entreprise sans recréer le lien.

### v2.9.78 (29/05) — Pack 13 correctifs UX (13 bugs)

### v2.9.78 (29/05) — Pack correctifs UX (13 bugs)

Session de correction de bugs remontés par João (dossier `Desktop/BUG TalentFlow`, 17 captures → 15 bugs distincts, 13 corrigés). Aucune nouvelle dépendance, aucune migration DB.

**Fiche candidat** :
- **Notes unifiées** : un seul bouton Notes (badge gris comme Documents, plus le bleu) → notes internes `notes_candidat` modifiables + survol, lié à la liste. 2e bouton bulle supprimé. Notes partagées (`shared_notes`) retirées de la fiche (client = portail). `SharedNotesModal` reste utilisé côté portail.
- **Panneau Informations** : `createPortal(document.body)` (ne reste plus collé en haut — pattern #10).
- **Boutons photo** : déplacés DANS la photo (bas, au survol via `.candidat-photo-wrap:hover .candidat-photo-actions`), photo 120→140px alignée à gauche, toolbar latérale retirée.
- **Bouton Mail** : helper `lib/utils/open-mail.ts` (`openMail`) → copie l'email + toast d'aide Windows/Mac si pas d'app mail par défaut (heuristique `document.hasFocus()` après 1,2s). Câblé fiche + `MatchingContactModal`.

**Liste candidats** (`CandidatsList.tsx`) :
- **« Tout marquer vu » silencieux** : suppression du `queryClient.invalidateQueries(['candidats'])` (= clignotement). Mise à jour via `viewedSet` + `markTousVus(tous les ids visibles)`.
- **Badges rouge ⟺ coloré couplés** : la pastille colorée s'affiche désormais SSI `isNewCandidat` (= hasBadge, même condition que le point rouge) → les deux apparaissent/disparaissent ensemble. Le fallback dérive `nouveau` (créé récemment) ou `mis_a_jour` (last_import > created+1j) → le badge vert « Nouveau » apparaît enfin.
- **Modale WhatsApp en masse** : `createPortal(document.body)` (était coupée/sticky — pattern #10).

**Historique envois** (`messages/page.tsx` + `api/emails/history`) :
- Destinataires **résolus en noms** : par `candidat_ids`, sinon reverse-lookup candidat par **email** (`.in`) ou **téléphone** (9 derniers chiffres, pagination candidats), sinon **client** par email principal/contact (parsing `contacts` array OU string JSON). Affiche « Entreprise (Contact) » pour les emails clients.
- **Métier ciblé** extrait du corps (`extractMetier`, regex « recherche d'un X pour ») → chip liste + badge panneau.
- Pills candidat cliquables (fiche) + aperçu CV au survol (`CvHoverTrigger`). Bouton « Voir tous » → modal `RecipientsModalButton`/`CandidatsRecipientsButton`.
- API : `pipeline_metier` ajouté au SELECT candidats + champ `recipients[]` + `metier`.

**Divers** :
- **Note rapport au survol** : `SubmissionHistoryTable` — tooltip portalisé (le `title` natif n'affichait pas les `\n`).
- **Contact client via lien rapport** : `api/clients/[id]/add-contact` écrivait `firstName/lastName/phone/role` au lieu de `prenom/nom/telephone/fonction` → contact « sans nom ». Corrigé.
- **CV original Word** (`CVCustomizer`) : `.doc/.docx` → viewer Office (avant `/api/cv/print` servait en `application/pdf` → erreur PDF).
- **Croix modale doublon** (`ConfirmMatchModal`) : couleur `--foreground` (était `--muted-foreground` invisible en light).
- **Job-Room** : identifiants prod configurés en env (`JOBROOM_USERNAME/PASSWORD` + API_URL prod). L'erreur 400 venait des creds de test staging.

**Reportés (besoin input João)** : #11 Firefox télécharge le CV (probable réglage navigateur PDF, pas un bug code — fix pdf.js possible si confirmé) · #15 « badge manquant » (besoin d'un exemple précis).

### v2.9.77 (27/05) — TalentFlow Mobile : modules Sign détail/new + Missions + Rapports

Suite de v2.9.76 qui a livré la fondation `/m/*` (layout, dashboard, candidats, sign liste). Cette release complète les modules manquants :

- `/m/sign/[id]` — détail enveloppe : **qui signé / qui manque** (avatars CheckCircle/Clock + signed_at), boutons Relance (PATCH `action:remind`), Envoyer (draft), Annuler, lien candidat cliquable
- `/m/sign/new` — envoi rapide en 2 étapes : choix template existant → fill destinataires (pré-remplis si `?candidate_id=`) → Créer + Envoyer en 1 tap. **Pas d'éditeur de champs** (utiliser desktop pour ça).
- `/m/missions` — cards par statut (en_cours / terminee / toutes), photo candidat + canton client + métier + dates + marge
- `/m/rapports` — liste `report_links` par statut (active / paused / revoked / tous), recherche, lien candidat + ouvre `/report/[slug]` (nouvel onglet)

**Réutilise** : `/api/sign/envelopes/[id]` (GET + PATCH:remind), `/api/sign/envelopes/[id]/send`, `/cancel`, `/api/sign/templates`, `/api/missions`, `/api/admin/reports`. Zéro nouvelle route API.

### v2.9.76 (27/05) — Administration : Carte ID + Fondation mobile `/m/*`

Outre le travail Administration (checkbox Carte ID + propagation dates fin mission Excel), commit fourre-tout incluant la fondation `/m/*` : layout `DashboardShell` early-return sur `/m/*`, layout mobile dédié, `MBottomNav` (5 tabs), `MHeader`, CSS `m.css`, pages `/m`, `/m/candidats` + `[id]`, `/m/sign` (liste).

### Marathon 26/05 — Sign templates Rapports + UX enveloppe (v2.9.47→71)

**Bugs majeurs corrigés** :
- Tél candidat débordait sur Tél urgence/conjoint (DB patch flag explicite + helper `isCandidatePhoneField`)
- Messages d'erreur incompréhensibles (« Groupe 11 ») → labels intelligents avec `wizardSection`
- Sections wizard dupliquées (algo run-length → Set `seenSections`)
- Crash retour /sign/templates (entrées NULL dans documents JSONB)
- Section PJ disparue (500 sur /uploads — null guard ajouté)
- Badge AUTO-SIGNÉ invisible (route /tokens manquait `signature_method`)
- Édition template Rapport sur mauvaise sidebar (route dédiée `/sign/rapports/templates/[id]/edit`)

**Features ajoutées** :
- Onglet sidebar « Rapports » distinct de « Signatures »
- Bouton « 🔀 Regrouper par section » dans WizardEditor
- Modal « Gérer les sections » dépliable avec gestion fields (case Oblig, ▲▼, 🗑)
- Bouton « 👁 Aperçu » portalisé sur PJ + docs signés (iframe PDF, img zoom 1-5×, Imprimer)
- Recto+verso assemblés en 1 PDF dans l'enveloppe (route `?composed=fieldId`)
- Lien fiche candidat depuis enveloppe (nom destinataire cliquable si `envelope.candidate_id`)
- Titre email récap : `« Nom Prénom — Documents signés »` (au lieu du titre enveloppe)
- Filename PJ : UTF-8 NFC préservé (apostrophes + accents)
- Badge orange « AUTO-SIGNÉ » à côté de « Signé » (preset template)

**DB cleanup one-shot** (via MCP, hors migration versionnée) :
- Template `cb083ae0` : 2 docs null retirés + 2 flags `autoFillCandidatePhone` rendus explicites + 10 groupes renommés depuis `wizardSection`
- Template `289b3bc0` : (inchangé en DB — fix code uniquement)

→ **Détails complets** : `MEMORY.md` (sections marathon 26/05)

### Releases précédentes
- v2.9.46 (25/05) — Sign : intro temps réel + photo selfie → fiche candidat + cleanup type document
- v2.9.45 (22/05) — Sign : étape d'introduction
- v2.9.42→44 (22/05) — Rapports Phase B (3 boutons) + fix mobile
- v2.9.35→41 (21/05) — TalentFlow Mobile PWA + Phase 1-2b polish mobile
- v2.9.21→31 (20-21/05) — Marathon Sign (SectionManager, attachment, finalize fiabilisé, email unique)
- v2.9.0 (18/05) — Auth email+mdp portails client+candidat
- v2.8.11 (17/05) — INCIDENT wipe template + garde-fous client+serveur (pattern #77)
- v2.8.5 (15/05) — Signature pré-enregistrée + page Merci + cert séparé
- v2.8.4 (15/05) — Pipeline contrat L-Agence stamp + fixes multi-destinataires
- v2.7.5 (12/05) — Durcissement sécurité 38 fixes
- v2.7.0 (12/05) — Module Compliance Documents complet

→ **Historique exhaustif** v2.6.x → v2.9.45 : `docs/CLAUDE-history.md`

---

## 🔴 RÈGLES MÉTIER ABSOLUES (jamais violer)

### Import & Matching
- **JAMAIS** utiliser le nom du fichier pour matcher un candidat (ni pour classifier CV/non-CV)
- **JAMAIS** matcher sur un seul signal (prénom seul, tel seul, email seul)
- Toujours : **tous les nom + tous les prénom** d'abord, puis email/tel/DDN pour confirmer
- **DDN différente = toujours 2 personnes différentes**, sans exception
- Couples/familles peuvent partager email/tel → **ne jamais fusionner** sur ces signaux seuls
- **Noms composés portugais/espagnols** (Da Silva, Dos Santos, Fragoso Costa) → ne JAMAIS tronquer
- **"SA", "Sàrl", "AG", "GmbH", "Ltd"** dans le nom extrait → c'est une entreprise → rejeter
- Un certificat/diplôme/lettre ne crée **JAMAIS** un nouveau candidat
- Un non-CV sans candidat identifié → erreur propre, pas de création

### Normalisation données
- **Noms/prénoms** : Title Case (Pedro Ferreira). Extraire tous les mots trouvés.
- **Particules** : `de, da, dos, du, van, von, del, di` → minuscule (sauf en 1ère position)
- **Email** : lowercase + trim. Email vide `""` → `NULL`
- **Téléphone** : avec indicatif pays (+41 79..., +33 6...) si inférable. CP 5 chiffres = France.
- **Localisation** : « Ville, Pays » (Monthey, Suisse)

### Règle UPDATE coords (20/04/2026)
- **email / telephone / localisation** → ÉCRASÉS par le nouveau CV si valeur non vide (manuel + OneDrive). Modale confirm-match affiche les diffs.
- **date_naissance** → **IMMUABLE** (DDN différente = 2 personnes différentes — homonymes)
- **genre** → **IMMUABLE** (Claude se trompe souvent)
- Implémenté dans `lib/merge-candidat.ts`

### Architecture import
- **2 routes d'import actives** : `cv/parse` (manuel UI) + `onedrive/sync` (cron 10min + manuel)
- **`cv/bulk` et `sharepoint/import` SUPPRIMÉES en v1.9.23** (854 lignes de code mort). **Ne pas recréer ces routes**.
- **SHA256 du buffer PDF** = source de vérité (`cv_sha256` + `cv_size_bytes` + index partiel)
- **`findExistingCandidat`** (`lib/candidat-matching.ts`) = source de vérité matching
- **`classifyDocument`** (`lib/document-classification.ts`) = source unique CV vs non-CV

### Seuils matching (ne pas modifier sans simulation sur 6000+ candidats)
- Score ≥ 16 → match certain → update auto
- Score 11-15 → match standard → update (onedrive/sync) ou modale (cv/parse)
- Score 8-10 → zone uncertain → pending_validation dans `/integrations`
- Score < 8 → nouveau candidat
- **strictExact (nom identique) → seuil 8 minimum** (v1.9.27)
- **v1.9.104 — Option B : score ≥ 11 + DDN null des 2 côtés → uncertain** (sauf email+tel identiques)

### UX & Interface
- **Badges** : per-user strict via `candidats_vus + auth.users.candidats_viewed_all_at`, jamais global
- **DB source de vérité** pour `candidats_vus` (pas d'UNION avec localStorage client)
- **Modale confirmation** : score + diff côte à côte + 3 boutons (Update / Créer / Voir fiche)
- **`/integrations`** = supervision imports + anomalies + pending validation
- **`/parametres/doublons`** = fusion candidats existants
- **Jamais d'action irréversible** sans confirmation explicite
- **Invalidation React Query explicite** après toute action user qui modifie candidats (`['candidats']` + `['candidat']`)

### Vision produit João
- Import CVs = cœur du produit, doit être parfait
- **Zéro contamination** de fiches (un CV ne doit jamais écraser la mauvaise fiche)
- **Zéro doublon silencieux** (le système doit toujours demander en cas de doute)
- Normalisation automatique = données propres dès l'entrée
- ML progressif = le système apprend des décisions humaines (`decisions_matching` JSONB → `/api/ml/insights`)

### Ce qu'on ne fait PAS
- ❌ Pas de matching sur filename
- ❌ Pas d'écrasement silencieux sans signal fort
- ❌ Pas de création de candidat depuis un non-CV
- ❌ Pas de déploiement sans test
- ❌ Pas de nouvelle feature avant que les bugs existants soient corrigés
- ❌ Pas de refactoring massif d'un code qui marche

---

## Stack technique

- **Frontend** : Next.js 16.2.6 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- **Backend/DB** : Supabase (PostgreSQL + RLS), Supabase Auth + OTP email
- **State** : React Query v5 (serveur), Context API (client), localStorage/sessionStorage (UI persistant)
- **IA** : Claude API (Anthropic), Google Generative AI, Groq — parsing CV et matching
- **Docs** : pdf-lib, pdfjs-dist v5, mupdf v1.27, tesseract.js v7 (OCR), docx, mammoth, word-extractor
- **Emails** : Resend (prioritaire), Nodemailer/SMTP (fallback chiffré AES-256-GCM), WhatsApp deep links wa.me
- **Intégrations** : Microsoft Graph API (Outlook, OneDrive, SharePoint)
- **UI** : Framer Motion, Recharts (lazy), Leaflet, Radix UI, shadcn, sonner
- **PDF Sign** : Konva + react-konva (éditeur), @dnd-kit (drag&drop)
- **Auth portails** : bcryptjs, jose (JWT HS256)
- **Déploiement** : Vercel Pro — région `dub1`
- **Dev local** : port 3001, commande `next dev --port 3001 --webpack` (Turbopack désactivé en dev)

---

## Structure du projet

```
app/
  (auth)/             — login, register, reset-password, verify-email
  (dashboard)/        — toutes les pages protégées + API routes
    api/              — routes API server-side
    candidats/        — liste + fiche détail [id]
    pipeline/         — grille 3 cols (consultant + métier + rappels)
    secretariat/      — dashboard secrétaire (rôle dédié)
    missions/         — CRUD missions + portails
    clients/          — liste + fiche [id]
    sign/             — Signatures (envelopes, templates, /sign/v/[token] public)
    sign/rapports/    — Rapports hebdomadaires (sous-module avec templates dédiés)
    offres/           — offres emploi
    entretiens/       — calendrier entretiens
    matching/         — scoring candidats ↔ offres (IA)
    messages/         — email/SMS/WhatsApp
    activites/        — timeline activité
    integrations/     — OAuth Microsoft, WhatsApp config
    outils/           — outils spécialisés
    parametres/       — profil, sécurité, admin, logs, doublons, photos, import-masse
    dashboard/        — page d'accueil KPIs
    alertes/          — alertes conformité documents
report/               — portail rapport candidat (PUBLIC, scope /report)
  [slug]/             — page candidat
  client/[token]/     — validation client
  login/, set-password/, account/
client-portal/[slug]/ — portail client public (collaborateurs + rapports)
sign/v/[token]/       — signature publique TalentFlow Sign
components/           — composants React (PascalCase)
contexts/             — Context API (Upload, Import, Matching, Photos, Doublons, Theme)
hooks/                — custom hooks
lib/                  — utils, supabase clients, cv-parser, onedrive, version
  sign/               — types, pdf-stamp, pdf-generator, compose-attachment-pdf, etc.
  report/             — generator PDF rapports, helpers
types/database.ts     — types Supabase auto-générés (snake_case)
supabase/migrations/  — SQL migrations versionnées
docs/                 — docs étendues (CLAUDE-detailed-rules.md, CLAUDE-history.md)
```

---

## Pages et accès

| Page | URL | Rôles | Description |
|------|-----|-------|-------------|
| Dashboard | `/dashboard` | Tous | KPIs : clients actifs, candidats entretien/placés |
| Candidats liste | `/candidats` | Tous | 6302+ candidats, filtres, pagination, hover CV preview |
| Candidats à traiter | `/candidats/a-traiter` | Admin, Consultant | `import_status='a_traiter'` |
| Fiche candidat | `/candidats/[id]` | Tous | Détail + CV zoomable + notes + documents + activité + 🛡 Conformité |
| Pipeline | `/pipeline` | Admin, Consultant | Grille 3 cols, onglets consultants + métiers, rappels |
| Clients | `/clients` | Admin, Consultant | 1200+ entreprises, 4 modes (grille/liste/carte/split), Zefix |
| Fiche client | `/clients/[id]` | Admin, Consultant | Détail + missions + candidats |
| Offres | `/offres` | Admin, Consultant | CRUD + veille externe (scraping Apify) |
| Entretiens | `/entretiens` | Tous | Calendrier + rappels |
| Matching | `/matching` | Admin, Consultant | Scoring IA |
| Missions | `/missions` | Admin, Consultant | CRUD + stats marge + bilan mensuel + sync Quadrigis |
| Missions portails | `/missions/portails` | Admin, Consultant | Gestion portails clients actifs |
| Messages | `/messages` | Admin, Consultant | Email/SMS/WhatsApp multi-candidats, templates |
| Activités | `/activites` | Admin, Consultant | Timeline |
| Secrétariat | `/secretariat` | **Secrétaire uniquement** | 6 modules |
| Import masse | `/import-masse` | Admin, Consultant | ZIP/PDF/Word batch |
| Intégrations | `/integrations` | **Admin uniquement** | OAuth Microsoft 365, WhatsApp |
| Outils | `/outils` | Admin, Consultant | Analyser candidats, rapport heures |
| Sign — Signatures | `/sign` | Admin, Consultant | Enveloppes signatures |
| Sign — Templates | `/sign/templates` | Admin, Consultant | Templates enveloppes |
| Sign — Rapports | `/sign/rapports` | Admin, Consultant | Rapports hebdomadaires |
| Sign — Templates Rapports | `/sign/rapports/templates` | Admin, Consultant | Templates rapports (route dédiée v2.9.66) |
| Alertes conformité | `/alertes` | Admin, Consultant | Documents expirés + filtres |
| Paramètres | `/parametres/*` | Selon | Profil, sécurité, admin, logs, doublons, photos |
| Portail client public | `/client-portal/[slug]` | **PUBLIC** (slug 16c) | Collaborateurs + onglet rapports |
| Portail rapport candidat | `/report/[slug]` | **PUBLIC** (slug permanent) | Soumission rapport hebdo |
| Signature publique | `/sign/v/[token]` | **PUBLIC** (token TTL) | Page signature destinataire |

---

## Routes API critiques

⚠️ Middleware exclut toutes les routes `/api/`. Protection via `requireAuth()` dans chaque route. **Liste exhaustive + détails par catégorie** : `docs/CLAUDE-detailed-rules.md`.

### Helpers d'auth obligatoires
- `requireAuth()` (lib/auth-guard.ts) → 401 si pas connecté
- `requireSecretariatAccess()` (v2.7.5) → 403 sauf Secrétaire/Admin/ADMIN_EMAIL — appliqué aux 19 routes `/api/secretariat/*`

### Routes spéciales
- **`/api/cv/print`** — Proxy PDF (force `Content-Disposition: inline`, requireAuth + whitelist Supabase v2.7.5)
- **`/api/cron/onedrive-sync`** — Cron Vercel 10min
- **`/api/cron/offres-sync`** — Cron Vercel 6h (scraping offres externes)
- **`/api/cron/document-alerts`** — Cron 8h UTC, récap → `info@l-agence.ch` + rappels candidat J-30/J-14 (dedup `metadata.notif_30d_sent_at`). maxDuration 300s.
- **`/api/cron/auto-arret-reports`** — Cron dimanche 20h UTC, rapports auto si arrêt ≥14j
- **`/api/cron/sign-reminders`** — Cron 9h UTC, relances enveloppes Sign non signées
- **`/api/cron/extract-cv-text`** — Cron `*/5min`, alimente `cv_texte_brut` (NULL)
- **`/api/cron/cleanup-old-data`** — Cron quotidien 03h UTC, rétention `emails_envoyes` 30j + `activites` 30j + `logs_activite` 90j + `recheck_results` 30j

### Sign — routes nouvelles v2.9.70
- **`/api/sign/envelopes/[id]/uploads?composed=fieldId`** — Compose images du champ en 1 PDF (réutilise `composeImagesToPdf` pattern #82)
- **`/api/sign/download/[envelopeId]?doc=N&preview=1`** — `disposition='inline'` pour iframe preview (modal œil)
- **`/api/sign/envelopes/[id]/regenerate-cert`** — Régénère cert manquant (v2.9.60)

---

## Features principales (résumé)

- **Candidats** : import masse (ZIP/PDF/Word), parsing IA multi-modèle, CV viewer zoomable, normalisation
- **Doublons** : détection instantanée (email/tel/nom+prénom), historique DB, fusion guidée
- **Clients** : 1200+ entreprises, recherche IA + Zefix, 4 modes (grille/liste/carte/split), logos automatiques
- **Pipeline** : 3 cols, onglets consultants João/Seb + métiers, rappels toast, consultant obligatoire
- **Missions** : marge brute/coefficient, bilan mensuel, vacances/arrêts JSONB, ETP prorata
- **Secrétariat** : dashboard séparé, 6 tables DB (candidats/accidents/ALFA/paiements/loyers/notifs), Excel import
- **Sign** (v2.3 → v2.9.71) : enveloppes, templates, éditeur Konva, certificat ZertES, signature pré-enregistrée, recto+verso assemblé, modal œil, lien fiche candidat
- **Rapports hebdomadaires** : slug permanent, multi-entreprise, mode portail, correction admin
- **Compliance Documents** : permis, CQC, identité, alertes J-30/J-14, portail client public
- **OneDrive** : sync cron 10min, déduplication SHA256
- **Messages** : email/SMS/WhatsApp deep links wa.me, templates 3 canaux
- **Veille offres** : scraping Apify 27 requêtes × 3 sources
- **PWA** : TalentFlow Mobile (consultant, dashboard /dashboard) + TalentFlow Rapport (candidat, /report)
- **Auth portails** : email+mdp bcrypt 12 + JWT HS256 sur `/client-portal/[slug]` et `/report/[slug]`

---

## Variables d'environnement

### Publiques (NEXT_PUBLIC_*)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL                  localhost:3001 dev, talent-flow.ch prod
NEXT_PUBLIC_LOGO_DEV_TOKEN           Optionnel (logo.dev, fallback Google Favicons)
```

### Serveur (jamais exposées)
```
SUPABASE_SERVICE_ROLE_KEY            Admin, bypasse RLS
ANTHROPIC_API_KEY                    Claude API
MICROSOFT_CLIENT_ID / SECRET / TENANT_ID    OAuth Microsoft 365
RESEND_API_KEY                       Emails transactionnels
SMTP_HOST / USER / PASS              SMTP fallback (PASS chiffré AES-256-GCM)
SMTP_ENCRYPTION_KEY                  Clé chiffrement
WHATSAPP_TOKEN / PHONE_ID / VERIFY_TOKEN / APP_SECRET    WhatsApp Business (dormant — wa.me en prod)
CRON_SECRET                          Strict v2.7.5 — route 401 si absent
ADMIN_EMAIL                          OBLIGATOIRE sur Vercel, pas de fallback
PORTAL_AUTH_SECRET                   JWT HS256 portails (32+ chars)
NOTION_TOKEN                         Import missions Notion
APIFY_API_KEY                        Scraping offres externes
JOBROOM_API_URL / USERNAME / PW      Job-Room Suisse (SECO)
```

---

## Patterns critiques

**Liste exhaustive (85+ patterns)** dans `docs/CLAUDE-detailed-rules.md`. Top patterns à connaître :

**#10 — Modaux `position: fixed`** : Toujours `createPortal(jsx, document.body)`. Un ancêtre avec `transform`/`filter` casse `position: fixed`. Pattern hotfix v2.9.71.

**#34 — Photos F1bis Vision crop** : Scans A4 rejetés `processXObjects` → branche Vision Haiku via `tryVisionFaceCrop()`. Source candidats `vision-face:` préfixée. Banc 22/22 + sim 60/100.

**#42 — Modal portalisé v2** : `createPortal` + backdrop `rgba(0,0,0,0.55) blur(6px)` + container `min(640-900px,95vw) maxHeight:88vh`. Header `DialogTitle Instrument Serif 22-24` + sous-titre count.

**#46 — Pipeline grid horizontal + pills par catégorie** : `flex: 0 0 Npx` strict header+row (jamais `width+flexShrink:0`). Pills métiers groupées par catégorie via `useMetierCategories`.

**#47 — Toasts Sonner dédup + dismiss permanent** : `id` stable (`toast.success(msg, { id: 'rappel-deleted-' + rid })`) → Sonner remplace au lieu d'ajouter. `toast.dismiss('rappel-notif-' + rid)` pour notif Infinity.

**#48 — Tri server-side obligatoire avec pagination** : Dès que pagination server-side (LIMIT/OFFSET), tri DOIT l'être aussi. Param `?sort=` propagé via queryKey.

**#49 — Bucket `talentflow-sign` partagé** : UN SEUL bucket privé. Préfixes : `templates/{tplId}/`, `envelopes/{envId}/`, `signed/{envId}/`, `signed/reports/{linkId}/{submId}/`. Service role only.

**#50 — Routes API publiques vs dashboard — namespace strict** : `(dashboard)` ne change pas l'URL. Convention : dashboard sous `/api/admin/...`, publiques sous `/api/...`. NE PAS créer 2 routes au même URL.

**#51 — Slug permanent (Rapports) vs token éphémère (Sign)** : Reports utilise slug permanent `{prenom}-{nom}-lagence-{4c}` jamais réutilisé. Sign utilise tokens à TTL. Sécurité Reports via `link.status='active'`.

**#52 — Réutilisation totale composants Sign dans Reports** : Pas de viewer/wizard/signature custom. Tout mutualisé : `PublicPdfViewer`, `PublicFieldsLayer`, `SignWizard`, `SignaturePad`. `lib/report/pdf-generator.ts` réutilise `lib/sign/pdf-stamp.ts`. NE PAS dupliquer.

**#57 — COMPLIANCE — Métier mission = `pipeline_metier` uniquement** : JAMAIS `titre_poste` (extrait IA peu fiable). Liste `<select>` sur `app_settings.metiers` (64 valeurs).

**#58 — COMPLIANCE — Status calculé dynamique (vue SQL)** : `candidat_documents_with_status` calcule à la lecture. Impossible STORED car `CURRENT_DATE` n'est pas IMMUTABLE.

**#59 — COMPLIANCE — DELETE document safe** : Avant `storage.remove([path])`, count refs `WHERE file_recto_path = path OR file_verso_path = path`. Si count > 1 → DELETE row uniquement.

**#60 — PORTAIL — 3-checks sécurité** : (1) `client_portals.is_active=true`, (2) candidat en mission active chez ce client, (3) doc/rapport appartient au candidat ET au client. Slug 16c circule en clair par design.

**#71 — Sign : recipientOrder mixte 0/1-based** : Éditeur TF Sign crée `order: 0,1,2...` (0-based), import DocuSign `recipientOrder: 1,2,3...` (1-based). **Toujours `??` jamais `||`** (préserve 0). Pattern fix v2.9.55 (PDF vide), v2.8.4 (signatures multi-destinataires).

**#72 — Sign : Templates ad-hoc `parent_template_id`** : Chaque POST envelope avec docs override clone le template en ad-hoc. Filtrage UI seulement (`!parent_template_id`), pas serveur (casse lookup brouillon).

**#73 — DEPRECATED** — Preset signature user-level désactivée v2.9.16, remplacée par template-level v2.9.51 (`SignField.presetSignatureDataUrl`).

**#77 — Anti-écrasement DB Sign templates** : Garde-fou client+serveur après INCIDENT 17/05 wipe. `initialLoadCountsRef` refuse PATCH vidant collection non-vide. Route serveur 409 Conflict sans `?confirm_wipe=1`.

**#78 — Checkboxes groupées : required individuel IGNORÉ** : Quand `groupId + groupRule` (Oui/Non), le flag `required` individuel devient logiquement absurde. La règle du groupe (SelectExactly/AtLeast/AtMost) est seule source de vérité. Skip dans `SignWizard.validateCurrentStep`, `PublicFieldsLayer.areAllRequiredFieldsFilled`, `TemplateEditor.groupCheckboxes`, `WizardEditor.SectionHeader` toggle, calcul `allRequired`.

**#79 — Sign : Gestion des sections sans entité DB** : `wizardSection` = chaîne sur chaque champ, pas une entité. `collectSections()`, `moveSectionBlock()`, `loadCollapsedSections/saveCollapsedSections` (localStorage).

**#82 — Sign : Composition recto/verso en PDF** : `composeImagesToPdf()` assemble JPEG/PNG en PDF A4 (1 image → pleine page, 2 images → empilées). Orientation EXIF corrigée via `readJpegOrientation()`. Utilisé email récap (v2.9.31) + page enveloppe (v2.9.70 route `?composed=fieldId`).

**#83 — Sign : Email unique de finalisation + dédup PJ** : 1 SEUL email créateur (`sendSignFinalRecapEmail`) regroupant docs signés + PJ candidat. `ensurePdfFilename()` ajoute `.pdf` + NFC + strip filesystem-invalid (v2.9.67). Dédup sur `file.path` (pas boucle `field × tokens` naïve).

**#84 — PWA portail rapport candidat installable** : Scope `/report`. Manifeste DÉDIÉ `public/report.webmanifest`. SW `public/sw-report.js` ZÉRO cache (handler fetch vide). ⚠️ JAMAIS cacher cookies/auth dans SW (incident 494 REQUEST_HEADER_TOO_LARGE).

**#85 — PWA TalentFlow Mobile (consultant)** : Scope `/`. Réutilise `public/manifest.json`. `MobileBottomNav` 6 sections + `MobileInstallPrompt`. ≤768px breakpoint. Pas de SW (manifeste seul suffit, ne pas réveiller kill-switch `sw.js`).

---

## Points d'attention techniques

- **Tables sensibles RLS** : `app_settings`, `email_otps`, `onedrive_fichiers`, `secretariat_*`, `logs_secretariat`, `candidat_documents`, `client_portals`, `report_link_clients`, `report_submissions`, `sign_envelopes`, `sign_tokens`, `portal_*` — toujours `createServiceRoleClient`, jamais le client public
- **Vercel bodySizeLimit** : `100mb` pour les imports ZIP volumineux (`serverActions.bodySizeLimit`)
- **Détection extension CV** : utiliser `cv_nom_fichier` en priorité, l'URL Supabase peut être un UUID
- **Login bypass dev** : `localhost:3001/admin` → magic link sans mot de passe — bloqué en production
- **Zefix API** : REST officiel exige HTTP Basic. Utiliser `POST ZefixREST/firm/search.json` (endpoint interne, gratuit).
- **ADMIN_EMAIL** : variable d'env obligatoire sur Vercel
- **Types Supabase** : colonnes ajoutées en migration pas dans `types/database.ts` auto-généré → utiliser `(data as any).colonne` ou régénérer
- **MIME safe** : `safeContentType` (lib/utils/mime.ts) gère `octet-stream` rejeté par whitelist bucket (v2.7.5 régression)
- **X-Frame-Options** : `SAMEORIGIN` (pas `DENY`) pour ne pas casser iframes PDF preview internes (RapportsTab, DocumentViewerModal, FilePreviewModal v2.9.70)

---

## Sécurité — état au 26/05/2026

✅ **Corrigé** v1.6.1 → v2.7.5 : SMTP AES-256, RLS 33 tables, Sentry, timer inactivité, `requireAuth()` 51 routes, fixes import/badges/pipeline, audit DB, SSRF whitelist, headers HSTS/X-Frame-Options/nosniff/Referrer/Permissions, `requireSecretariatAccess()` 19 routes, CRON_SECRET strict, 22 index FK créés, npm audit fix (13→2 vulns), buckets MIMEs whitelist, recharts lazy, 8 fonctions DB `search_path = public, pg_temp`, RLS policies optimisées, rate-limit refresh-token, cleanup-old-data étendu.

⚠️ **Restant** : 14 FK sans index, sync-quadrigis Bearer token, dashboard count queries → RPC, 21 `<img>` → `<Image>` Next.js.

→ **Détails complets** : `docs/CLAUDE-history.md`

---

## graphify

Knowledge graph dans `graphify-out/`.

Règles :
- Avant questions architecture / codebase → lire `graphify-out/GRAPH_REPORT.md` (god nodes + community structure)
- Si `graphify-out/wiki/index.md` existe → naviguer plutôt que lire raw files
- Après modifs code → `graphify update .` pour garder le graph current (AST-only, no API cost)
