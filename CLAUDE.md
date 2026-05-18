# TalentFlow — CLAUDE.md

> **Détails techniques** : `docs/CLAUDE-detailed-rules.md` (patterns complets + routes API)
> **Historique audits** : `docs/CLAUDE-history.md` (sécurité, dette technique)
> **Sessions/versions** : `~/.claude/.../memory/MEMORY.md` (auto-memory)

## Règles de comportement

**Langue** : toujours répondre en **français**, même si le code est en anglais.

**Avant de toucher** :
- Auth / middleware / RLS → demander confirmation explicite, risque élevé de régresser l'accès
- Migrations Supabase → toujours montrer le SQL avant d'exécuter
- Suppression de données ou colonnes → demander confirmation, action irréversible
- `app_settings`, `email_otps`, `onedrive_fichiers`, `secretariat_*`, `logs_secretariat` → tables sensibles, vérifier les RLS

**Signaler les risques** :
- Tout changement dans `lib/supabase/`, `middleware.ts` ou `app/(auth)/` → mentionner le risque
- Modifications des routes API existantes → vérifier les usages côté client avant
- Ajout de dépendances npm lourdes → signaler l'impact sur le bundle Vercel

**Style de réponses** : concis, direct, pas de résumé en fin de réponse.

---

## MODÈLE À UTILISER

Avant chaque tâche, choisir le modèle selon la complexité :

| Tâche | Modèle | Pourquoi |
|---|---|---|
| Bug fix ciblé, correction CSS, typo, rename | claude-haiku-4-5 | Rapide, pas besoin de raisonnement profond |
| Nouveau composant UI, route API simple, refacto isolé | claude-sonnet-4-5 | Bon équilibre vitesse/qualité |
| Architecture nouvelle (nouveau module, migration DB complexe, refacto multi-fichiers, logique métier critique) | claude-sonnet-4-5 | Raisonnement étendu activé |
| Audit complet, plan technique multi-phases, décisions irréversibles (migrations prod, breaking changes) | claude-opus-4-5 | Analyse maximale |

### Règle automatique
Avant de commencer TOUTE tâche, afficher EN UNE LIGNE :
`[Modèle: {nom}] [Effort: {faible|moyen|élevé}] [Impact: {fichiers touchés}]`

Exemple :
`[Modèle: Sonnet] [Effort: moyen] [Impact: 3 fichiers — RecipientCard, AdvancedOptions, types.ts]`

Si la tâche demandée dépasse le modèle recommandé (ex: bug fix qui révèle une architecture à revoir) → signaler et proposer de monter en modèle avant de continuer.

---

## Règles de workflow — Modifications & Déploiement

### RÈGLE — Avant chaque modification de code
1. Identifier tous les fichiers qui seront touchés
2. Pour chaque fichier → lister les fonctionnalités qui utilisent ce fichier
3. Signaler avec ⚠️ toute fonctionnalité qui pourrait être impactée par le changement
4. Attendre confirmation de João avant de continuer

### RÈGLE — Après chaque modification
1. Relire les fichiers modifiés
2. Vérifier mentalement qu'aucune fonctionnalité existante n'est cassée
3. Lister les fonctionnalités à tester manuellement
4. Signaler si un test est recommandé avant déploiement

### RÈGLE — Avant chaque `vercel --prod`
1. `git add -A`
2. `git commit -m "feat/fix: description + version"`
3. `git tag vX.X.X`
4. **DEMANDER CONFIRMATION EXPLICITE À JOÃO AVANT TOUT `git push`** — Vercel est connecté au repo GitHub et déploie automatiquement à chaque push sur `main`. Un push = un deploy. Donc jamais de push sans validation.
5. `git push origin main --tags` (seulement après le "oui déploie" de João)
6. Optionnel : `vercel --prod` (normalement plus nécessaire, le push GitHub déclenche le déploiement Vercel)

### ⛔ JAMAIS pusher sur GitHub sans l'accord explicite de João
- Vercel déploie auto sur chaque push vers `main` → pas de safety net
- Toujours préparer le commit localement, montrer le récap, attendre "oui déploie" / "push-le", puis seulement `git push`
- Règle ajoutée le 21/04/2026 suite à un push automatique non-validé (v1.9.71)

### ⛔ RÈGLE — Build local + vérif Vercel après chaque push (v1.9.78)
Ajoutée le 22/04/2026 après bug build Next.js 16 (useSearchParams sans Suspense sur /messages) qui a laissé prod en état ERROR alors que le changelog s'affichait déjà chez João.

**Avant tout `git push` qui touche :**
- Hooks de navigation (`useSearchParams`, `useRouter`, `usePathname`) ajoutés dans un nouveau composant top-level
- Layouts, middleware, `next.config.ts`
- Nouvelles dépendances npm
- Routes API nouvelles ou leur runtime config
- Toute logique SSR/SSG (generateStaticParams, metadata, revalidate)

→ **Obligatoire** : `npm run build` local (pas juste `tsc --noEmit`). `tsc` ne détecte pas les erreurs de prerendering Next.js.

**Après chaque `git push` :**
1. Récupérer l'ID du deploy via MCP Vercel (`list_deployments`)
2. Attendre l'état : soit READY (OK), soit ERROR (fetch build logs)
3. Si ERROR → fix immédiat + re-push + revérif
4. Ne JAMAIS considérer le push comme "déploiement terminé" tant que Vercel ne dit pas READY

Une prod en ERROR = user sees "changelog dans l'app" mais ancienne version active → impression que les fixes n'ont pas été déployés.

### RÈGLE — Commits
- Commiter uniquement avant chaque déploiement prod
- Pas obligatoire pendant le développement localhost
- Message commit clair avec la version et description

### RÈGLE — Mise à jour automatique MEMORY.md et CLAUDE.md
À chaque fin de session (avant `vercel --prod`) :
1. Mettre à jour `MEMORY.md` avec les features/fixes de la session
2. Mettre à jour `CLAUDE.md` si nouvelles règles ou patterns
3. Inclure dans le même commit que le déploiement
4. Ne jamais attendre que João le demande explicitement

**Déploiement Vercel** : ne jamais lancer `vercel --prod` sans avoir suivi la séquence git ci-dessus et obtenu la confirmation explicite de João. Récap obligatoire avant chaque déploiement :

```
✅ Tâches terminées : [liste]
⚠️ Points d'attention : [liste si applicable]
🚀 Prêt à déployer sur Vercel — tu confirmes ? (oui / non)
```

---

## Version actuelle
**v2.9.0 (Auth portail client + rapports candidat + UX polish + Bilan ETP)** — 18/05/2026

### v2.9.0 — Auth email + mot de passe sur portails + UX polish
**Feature majeure** : auth email + mot de passe pour `/client-portal/[slug]` et `/report/[slug]`. Sign / signatures / validation client rapport NON TOUCHÉS (gardent leur fonctionnement par token email). Multi-comptes par portail (plusieurs emails partagent le même portal_id via UNIQUE partiel). Flag `auth_required` DEFAULT FALSE → activation portail par portail (zéro régression sur l'existant).

**DB** : 2 migrations — (a) `portal_accounts` (13 cols, multi-comptes), `portal_tokens` (invitation 7j / reset 1h), `portal_login_attempts` (rate-limit) + RLS service_role only + 8 indexes. (b) `auth_required BOOLEAN DEFAULT FALSE` sur `client_portals` + `report_links` (lié par UUID portal_id/report_link_id, résistant au changement de slug).

**Flow invitation** : Admin clique "+ Inviter" (modal email) → POST `/api/admin/portal-accounts` → INSERT compte + token 7j → email branding L-Agence (logo officiel) → utilisateur clique → page `/set-password?token=xxx` avec card contexte (logo entreprise + nom + email destinataire) + 2 champs mdp avec œil → POST `/api/portal-auth/set-password` → auto-login (cookie JWT 30j) → écran succès "✅ Mot de passe créé !" + bouton "Accéder à mon portail" qui redirige vers le bon slug.

**Flow login** : `/client-portal/login?next=URL` ou `/report/login?next=URL` (slug extrait du `next` pour disambiguer si même email sur plusieurs portails). Toggle "Mot de passe oublié ?" inline (pas de page séparée). Rate-limit 5 fails/IP/15min → 429. Compte révoqué → 403 avec message contact L-Agence. Compte pas activé (password_hash NULL) → 403 "Compte non activé, vérifiez vos emails".

**Sécurité** : Bcrypt 12 rounds. JWT HS256 signé via `PORTAL_AUTH_SECRET` (env var obligatoire, 32+ chars). Cookies HttpOnly + Secure (prod) + SameSite=Strict, séparés client/candidat (`tf_portal_client` / `tf_portal_candidat`). Anti-énumération sur forgot-password (200 always). Tokens reset/invitation invalidés après usage. RLS sans policy = service_role only sur les 3 tables.

**Page Mon compte** (`/client-portal/account` + `/report/account`) : composant partagé `AccountPage` — infos compte (email, date création, dernière connexion en format CH), formulaire changement mdp (ancien + nouveau + confirm + œil), bouton retour portail (via slug récupéré par `/api/portal-auth/me?full=1`), bouton déconnexion. Boutons "Mon compte" + "Déconnexion" dans le header du portail (visibles uniquement si `auth_required` = utilisateur connecté).

**Bilan missions ETP** : card hebdo affiche `X.XX ETP` en chiffre principal (au lieu de "N candidats"), cohérent avec le KPI Total ETP en haut. Sous-titre "N missions · Coeff moy. ×0.95". Le vrai coeff moyen calculé sans pondération prorata (l'ancienne formule mélangeait coefficient × prorata et n'avait aucun sens).

**Rename PDF rapport** : `Nom_Prenom_Semaine_X.pdf` (rapport) et `Nom_Prenom_Semaine_X_Certificat.pdf` (cert). Helper `buildCandidatNamePart()` : priorité aux champs prenom/nom du candidat lié (DB), fallback split sur 1er espace de `candidat_name`. Noms composés gérés ("Mamadou Fara Diop Niang" → `Fara_Diop_Niang_Mamadou`). Accents retirés (NFD). Effet rétroactif uniquement sur nouveaux PDFs générés.

**UX polish** : Mode liste 1 colonne pleine largeur sur desktop ≥769px pour portail client (au lieu de grille 3 cols qui coupait Documents). Mobile inchangé. Header portail restructuré mobile ≤640px (logo + badge ligne 1, ClientLogo + nom ligne 2). Spinner loading centré sous texte sur 4 pages publiques. Footer auth pages sans répétition "L-Agence SA". Liste `/missions/portails` épurée.

**Cron cleanup** étendu : portal_login_attempts >30j, portal_tokens utilisés >30j, portal_tokens expirés >7j. Stack : `bcryptjs ^3.0.3` ajouté, `jose` réutilisé.


### v2.8.11 — INCIDENT wipe template + garde-fous + 5 fixes Sign Templates
**INCIDENT 17/05 14:56** — Template `cb083ae0` (« Documents à signer ») wipé en DB (race condition probable HMR/auto-save → PATCH silent avec `docs=[]` envoyé pendant hydration React). Restauration depuis daily backup 17/05 01:56 UTC vers projet clone Supabase (TalentFlow-Recovery, plan Pro permet « Restore to new project »), puis UPSERT row sur prod via MCP `execute_sql` + script Node admin (5 docs, 102 fields, 16 wizard steps, 2 destinataires récupérés intacts, 0 perte). Clone supprimé après restauration. ~15 min total wipe→restore.

**GARDE-FOUS ANTI-ÉCRASEMENT** (pattern #77) — défense en profondeur client + serveur :
- **Client** (`components/sign/TemplateEditor.tsx` `handleSave`) : capture counts au premier load avec data non-vide via `initialLoadCountsRef`. Tout PATCH (silent OU manuel) qui tenterait d'envoyer `docs/recipients/wizard_steps` vide alors qu'il y en avait au load → REFUSÉ + toast rouge `Auto-save annulée (écrasement détecté)`. `console.error` détaillé pour debug.
- **Serveur** (`app/(dashboard)/api/sign/templates/[id]/route.ts` PATCH) : SELECT actuel + compare avant UPDATE. Si payload tente de vider une collection alors que la DB en contient → 409 Conflict avec `{conflicts, existingCounts}`. Override via `?confirm_wipe=1` uniquement (action explicite).

**Règle d'incohérence checkboxes groupées** (pattern #78) : quand une checkbox a `groupId` + `groupRule`, son flag `required` individuel est IGNORÉ partout :
- `SignWizard.validateCurrentStep` skip required individuel
- `PublicFieldsLayer.areAllRequiredFieldsFilled` skip required individuel
- Création de groupe auto-décoche `required:false` sur tous membres
- Toggle « Tout obligatoire » de section exclut les groupées (toast informatif `2 cases groupées ignorées — règle du groupe prévaut`)
- Calcul `allRequired` ignore les groupées
Évite l'absurdité « Oui ET Non doivent être cochés ». La règle du groupe (`SelectExactly`/`SelectAtLeast`/`SelectAtMost`) est seule source de vérité.

**Validation groupe en wizard FIXÉE** : `SignWizard.validateCurrentStep` vérifie les règles de groupe avec message d'erreur précis : « Etes vous au chomage ? : sélectionne exactement 1 case (actuellement 0) ». Plus de skip silencieux du bouton Suivant.

**Mode Wizard — regroupement visuel par section** : composant `SectionHeader` éditable inline (clic = renomme propagé à tous les fields de la section). Toggle « Tout obligatoire » par section. Champs indentés `marginLeft: 18`. Symbole `§` retiré (UX retour user). Insertion dans `WizardEditor.tsx` autour du `SortableContext`.

**Mode Document — infos groupe au clic** : sélection checkbox groupée affiche directement membres + règle + pages + noms autres cases dans le panneau Groupe existant (`fields.filter(ff => ff.groupId === f.groupId)`), pas de panneau sidebar séparé.

**Couleurs rôles personnalisables** : palette 8 couleurs (vert/orange/bleu/violet/rose/cyan/indigo/rouge) sous chaque rôle. Champ `colorIdx` sur `SignRecipient` + helper `getRecipientPalette(rec, fallbackIdx)`. `FieldsCanvas` hérite via prop `recipientColorMap`.

**Chatbot Assistant IA supprimé** — composant `components/sign/TemplateAssistantBar.tsx` + route `/api/sign/templates/[id]/assistant/route.ts` retirés du code (retour user : « ne marche pas »). Bouton « Améliorer avec l'IA » (détection auto fields via Claude Vision PDF) RESTE : c'est `enrich-with-ai`, endpoint séparé fonctionnel.

**One-shot DB** : 12 cases groupées avec `required:true` (héritage import DocuSign) patchées en `required:false` sur le template `cb083ae0` pour cohérence avec nouvelle règle #78 (script Node ad-hoc avec service role).

### v2.8.5 — TalentFlow Sign : Signature pré-enregistrée + UX post-déploiement
**Feature majeure** : signature manuscrite pré-enregistrée pour les consultants. `/parametres/profil` nouvelle card "Ma signature manuscrite" → SignaturePad → stockée dans `auth.users.raw_user_meta_data.preset_signature_data_url`. À l'envoi : si le créateur est dans les destinataires + a preset signature → auto-apposée + skip étape + candidat reçoit email direct. Skippe le flow secrétaire (pas dans destinataires). Endpoint dédié `/api/auth/preset-signature` (GET/POST/DELETE).

**Page Merci instantanée** sur `/sign/v/[token]` après finalize : transition immédiate vers CenteredCard avec logo L-Agence + check vert + message. Évite les bugs de modal réouvert sur viewer en arrière-plan.

**Certificat séparé du contrat** : nouvelle fonction `generateCertificatePdf()` produit un PDF certificat STANDALONE. `signed_pdf_paths` contient `[contrat.pdf, Certificat de signature - contrat.pdf]`. Certificat **exclu des emails completed** (pollution boîte candidat) → accessible UNIQUEMENT via page détail `/sign/[envelopeId]`. Fix bug page blanche en tête du PDF cert (PDFDocument.create() crée page implicite côté Aperçu macOS).

**FIX CRITIQUE PDF generator** : `recipientOrder = recIdx + 1` forçait 1-based alors que les fields TF Sign sont 0-based. La signature du consultant n'était JAMAIS stampée. Fix `rec.order ?? (recIdx + 1)` + `f.recipientOrder ?? 1` (cohérent pattern #71).

**Plus de double email consultant** : skip `sendSenderNotif` si sender est DANS les recipients (il reçoit déjà `sendSignCompletedEmail` avec PDF en PJ).

**Vraies signatures previous signers (vue candidat)** : `verify-token` injecte `signature_data_url` des previous signers dans `previousFieldValues` pour les fields signature/initial → le candidat voit la vraie signature consultant au lieu de "✓ Signé".

**UX** : footer audit ZertES PDF réduit 30→16pt + textes 5pt/5.5pt (ne cache plus mentions contrat). Stamp OFF par défaut sur upload contrat (was ON). Brouillon ad-hoc visible dans dropdown avec nom propre (sans "[Envoi] "). Modal Terminer ne se rouvre plus 2× (handleFinalize check étendu state local OU DB).

### v2.8.4 — TalentFlow Sign : Pipeline contrat L-Agence
**Feature majeure** : upload PDF brut → stamp logo + adresse L-Agence page 1 (imite le papier à en-tête imprimé). 2 versions Storage (original + stampé) via nouvelle fn `stampLAgenceLetterhead()` dans `lib/sign/pdf-stamp.ts`. Toggle pill par doc temps réel dans `DocumentUploader` (swap entre `storage_path_original` ↔ `storage_path_stamped` sans appel serveur). Visible uniquement pour template `template_category='contrat'`.

**Bugs critiques signature multi-destinataires** : `PublicFieldsLayer` traitait `recipientOrder=0` comme falsy (`|| 1`) → 1er destinataire voyait + signait 2 zones d'un coup. Corrigé `?? 1` (pattern #71). `verify-token` utilise maintenant `recipient.order` réel au lieu de forcer `idx + 1`. `s.order > 0` → `>= 0` dans /sign/new (acceptait pas order=0).

**Sync bidirectionnelle rôles** : `roleName` input éditable dans /sign/new (RoleFixedRecipients). PATCH /api/sign/envelopes propage recipients → recipients_schema du template ad-hoc lié (vérifié via parent_template_id).

**Audit logo emails** : 11 templates uniformisés `logo-agence-officiel-noir.png` (200×42 PNG transparent). Avant : Sign emails utilisaient texte Georgia, auth/admin utilisaient badge ⚡ TalentFlow noir, france-travail/rapport-heures sans logo. Liste documentée en mémoire avec script d'audit bash pour éviter régression.

**UX** : champ Catégorie supprimé de /sign/new (auto-déduit). « ÉTAPE 0 » → « ÉTAPE 1 » (1-based humain). Page détail enveloppe affiche badges `[ÉTAPE 1] [Candidat]` au lieu de juste « Signataire ». Page /sign/v/[token] avec logo L-Agence officiel sidebar + écrans loading/erreur. Skip auto-notif « X a signé » quand sender == signataire.

**Migration DB** : `sign_templates.parent_template_id UUID REFERENCES sign_templates(id)` + index partiel. Distingue les templates ad-hoc (créés auto à chaque envoi pour stocker docs override) des vrais templates. Backfill rétro des « [Envoi] ... ». Filtrage UI seulement (route GET renvoie tout pour préserver lookup brouillon).

### v2.7.5 — Durcissement sécurité (audit global)
Bloc de 17 corrections issues de l'audit du 12/05 : (1) `requireAuth()` + whitelist anti-SSRF sur 3 routes proxy CV ; (2) `requireAuth()` sur rapport-heures/send-email + send-whatsapp + bug-report ; (3) bump Next.js 16.1.7 → 16.2.6 (CVE middleware bypass) ; (4) headers HSTS + X-Frame-Options + nosniff + Referrer-Policy + Permissions-Policy ; (5) helper `requireSecretariatAccess()` sur 19 routes secrétariat (Sébastien bloqué côté API, secrétaires + João OK) ; (6) signature Meta `X-Hub-Signature-256` sur webhook WhatsApp ; (7) `CRON_SECRET` strict (route bloquée si absent, plus ouverte) ; (8) maxDuration 60→300s sur document-alerts + auto-arret-reports ; (9) 12 `alert()` → toasts Sonner ; (10) 4 composants morts supprimés (ReminderPopup/ClientSearch/CvPdfViewer/usePipeline) ; (11) 4 routes API orphelines supprimées ; (12) `lib/utils/date.ts` source canonique formatDate (migration progressive) ; (13) dashboard counts déjà parallélisés (audit incorrect) ; (14) bandeau erreur dashboard + fallback /alertes via `isError` React Query ; (15) couleurs erreur/neutres hardcodées → tokens CSS (FranceTravailComposer + BetaBadge) ; (16) 22 index FK créés (`add_missing_fk_indexes_v2_7_5`) ; (17) patterns #57-69 documentés. + One-shot cleanup Storage `cvs` (3 842 fichiers / 4.15 GB récupérés).

### v2.7.4 (nuit) — Détection automatique des champs template via Claude Vision + auto-save invisible
- **Auto-save invisible TemplateEditor** : avant ça "clignotait" à chaque frappe (label bouton mutait + `onSaved={fetchTemplate}` provoquait un re-render complet de la page). Fix : (a) `handleSave({silent:true})` n'appelle plus `onSaved` (le state local est déjà cohérent avec la DB, refetch inutile) — le clic manuel garde le refetch (utile après ajout/suppression PDF) ; (b) label bouton STABLE "Enregistrer" en permanence (disabled si !dirty) ; (c) flush PATCH au switch d'onglet Wizard ↔ Document (`handleTabSwitch` dans la page parent avant `setActiveTab`) ; (d) flush PATCH avec `keepalive:true` sur `beforeunload` + `pagehide` + `visibilitychange='hidden'` (survit à la fermeture d'onglet). Auto-save 800ms debounce conservée mais désormais 100% silencieuse.
- **Bouton "🔍 Détecter les champs automatiquement"** apparaît dans l'éditeur de template (TemplateEditor) quand 0 champ défini. Lance Claude Vision (Sonnet 4.6) sur le PDF natif et place les champs en ~20-30s. Wizard steps construits auto par sections logiques.
- **Bouton "✨ Améliorer avec l'IA"** (outline discret) sur templates avec fields existants → restructure les étapes wizard + enrichit tooltips/conditions sans toucher aux positions.
- **SYSTEM_PROMPT enrichi L-Agence SA** : 10 conventions spécifiques injectées dans le prompt (signatures GAUCHE collaborateur / DROITE L-Agence, format date jj.mm.aaaa, vocabulaire CH NPA/AVS/CCT/Helsana/SUVA, pattern Oui/Non en 2 checkboxes, recipientOrder=1 candidat vs 2 consultant, champs conditionnels required=false + helpText, ne pas halluciner sur les pages de texte SECO, autoFill pour firstname/lastname/email, CHF only).
- **Bump modèle** : `claude-sonnet-4-5` → `claude-sonnet-4-6` (plus précis sur les formulaires denses comme la fiche d'inscription ~85 champs/page).
- **États progressifs** : Spinner + texte "📄 Téléchargement…" puis "🤖 Claude analyse…". Banner vert post-détection avec compteur fields + pages.
- **Sécurité** : confirmation modale avant "Améliorer" sur template existant (l'opération restructure les étapes wizard ; les champs eux-mêmes restent intacts).
- **Parallélisation** : `Promise.allSettled` sur les N documents → 5 docs ~125s → ~35s (-72%). Évite timeout Vercel 120s. `placeholderToUuid` local à chaque doc.
- **Bug fix Ajout PDF template existant** : nouveau bouton dashed "📄 Ajouter un PDF" dans bandeau actions TemplateEditor. Avant : UI manquante, impossible d'ajouter un PDF après création. File picker multi-fichiers (max 10, 50MB chacun) via /api/sign/upload existant.

### v2.7.3 (soir) — Mode portail rapports + lien mission + alertes routing unifié
- **Mode portail rapports** : toggle "🪟 Utiliser portail rapports" sur `/sign/rapports/new` et `[id]`. Quand activé → email signature candidat envoyé à `clients.email` (mail principal entreprise) avec lien vers `/client-portal/{slug}?tab=rapports` (slug permanent, pas TTL). Auto-création portail si absent. Nouvelle colonne `report_links.use_client_portal`.
- **Onglet Rapports portail client** : 2e onglet sur `/client-portal/{slug}`. Filtres Tous/À valider/Validés. Groupage par candidat (photo carré + métier + count). Bouton jaune "Voir le rapport à valider →" qui régénère auto le token expiré. Bandeaux notes_candidat (amber) + notes_client (bleu). Modal PDF preview.
- **Lien mission ↔ rapport** : bouton "📋 Rapport" sur liste missions → redirect `/sign/rapports/new` pré-rempli (candidat_id + mission_id + dates). Nouvelle colonne `report_links.mission_id`. Card "🔗 Mission liée" sur page détail. PATCH missions sync auto dates → `report_link_clients`. Jours d'arrêt mission désactivés sur form candidat. Cron `auto-arret-reports` dimanche 20h UTC (rapport auto si arrêt >= 14j couvre toute la semaine).
- **Notes / Remarques client** : bouton "📝 Notes" sur `/report/client/[token]` à côté de "Modifier les données" → modal portalisé → PATCH `notes_client` immédiat. Diffusion 4 surfaces : admin tooltip, candidat tooltip historique, portail client bandeau bleu, emails à la signature.
- **Boutons Télécharger + WhatsApp** sur page validation client : nouvelle route `/api/reports/client/[token]/download` qui génère PDF stampé à la volée (pattern #53). WhatsApp via `wa.me?text=` avec lien PDF (limitation API : pas de pièce jointe directe).
- **Alertes conformité → unifié sur info@l-agence.ch** : refonte cron `document-alerts`. Email récap quotidien → 1 seul envoi à `info@l-agence.ch` (toute l'équipe). Suppression du routage par consultant. Rappels candidat J-30/J-14 : `to` candidat, `cc` info@l-agence.ch systématique.
- **Modal "Ma mission" candidat** (Bug 2 A) : clic "Mes missions" sur `/report/[slug]` ouvre modal portalisé (dates + durée calculée + responsable + boutons Appeler/WhatsApp/Email). Plus de bascule formulaire.
- **Fix dates format candidat desktop** : fields date auto-fill (Lundi/.../Semaine N°) verrouillés en lecture seule, respectent `field.dateFormat` (`dd.MM` → `11.05`) au lieu de l'input HTML natif qui tronquait. Nouvelle prop `lockedFields` sur `PublicFieldsLayer`.
- **Format weekLabel global** : `Semaine 20 du 11 au 17 mai 2026` partout (modif `formatWeekLabel()` accepte `weekNumber` paramètre).
- **Bouton retour "← Portail"** sur `/report/client/[token]` quand lien en mode portail (lookup auto serveur).
- **Bouton "🪟 Rapports"** sur cards portail Collaborateurs → bascule onglet Rapports.
- **Email signature mode portail** : "Bonjour" sans nom contact. Mode direct préservé. Candidat affiché avec métier : `Mickael Voyenet (Chauffeur PL)`.
- **DB** : 2 migrations appliquées (`v271_mission_report_link` + `v273_use_client_portal`). 0 nouvelle dépendance npm.

### v2.7.0 (12/05 matin) — Compliance Documents
Voir `docs/CLAUDE-history.md` pour le détail.

Marathon Opus 4.7 du 12/05 — 3 releases prod le même jour (v2.6.17 matin + v2.7.0 midi + v2.7.3 soir).

### v2.6.17 (matin) — Rapports : correction semaine signée
- **Bouton "🔄 Corriger semaine"** dans `/sign/rapports/[id]` — admin + consultants peuvent corriger une submission signée par erreur. Pipeline : check conflit, UPDATE `week_start`+`week_end`, recalcul `field_values` auto-fill (dates par jour + n° semaine), regen PDF stampé (signatures préservées), audit `report_audit_log` action `week_corrected`.
- **Email correction** (3 audiences admin/candidat/client) avec PDF en PJ + raison saisie. Mention "corrigé" uniquement dans l'email, pas sur le PDF.
- **Préventif** : modal confirmation semaine avant signature candidat (tutoiement) + client (vouvoiement). Pavé jaune semaine en gros + bandeau rouge "définitif".

### v2.7.0 (après-midi) — Module Compliance Documents complet
Contexte : chauffeur PL contrôlé avec permis C échu → cette release outille la gestion des documents de conformité.

#### DB
- 3 tables : `document_types` (8 seedés), `candidat_documents` + view `candidat_documents_with_status` (status calculé dynamiquement — CURRENT_DATE non-IMMUTABLE bloque STORED), `client_portals` (slug 16 chars imprévisible).
- 2 colonnes : `missions.metier_display`, `candidats.is_driver_override` (NULL=auto, TRUE=forcé chauffeur, FALSE=exclu).
- `candidat_documents.metadata jsonb` (dedup rappels candidat : `notif_30d_sent_at`, `notif_14d_sent_at`).
- Bucket privé `candidat-documents` (10 MB max, PDF/JPG/PNG/WebP).

#### Fiche candidat
- Bouton **🛡 Conformité** ouvre panel CRUD avec catégories Identité 🪪 / Permis 🚗 / Qualifications 🏆 / Formations 📋 / Autres 📄.
- Détection chauffeur auto (`pipeline_metier === 'Chauffeur PL'` OU `/chauffeur/i`) + override manuel `is_driver_override`. Si chauffeur → banner amber + checklist 3 docs obligatoires.
- **Multi-permis batch** : pour `permis_conduire` en création, chips multi-select sous-cat (B + C + CE en 1 click) + date d'échéance par chip. POST `/api/candidats/[id]/documents/batch` crée N rows partageant le même fichier (1 upload). Sous-cats FR+CH : AM, M, A1, A2, A, B1, B, BE, C1, C1E, C, CE, D1, D1E, D, DE, F, G.
- **DELETE safe** : count refs `file_recto_path`/`file_verso_path` AVANT remove Storage (pattern #59).

#### Modal mission
- Champ Métier devenu `<select>` sur `app_settings.metiers` (64 métiers paramétrés). Source unique : `pipeline_metier` du candidat (jamais `titre_poste` IA, pattern #57).
- Champ "Intitulé affiché (optionnel)" → `missions.metier_display` (max 100, affichage portail/rapports priorité `metier_display || metier`).
- Soft block chauffeur : POST renvoie 422 `COMPLIANCE_BLOCKED` si docs manquants/expirés. Modal "Ignorer et créer" → note auto avec email actor + liste docs.

#### Alertes (3 surfaces)
- Cloche header `NotificationBell` : section "🪪 Documents conformité" agrégée avec pipeline + entretiens (refresh 5 min).
- Page `/alertes` : filtres Tous / Expirés / <14j / 15-30j + toggle "Mes candidats uniquement". KPI cards. Badge "EN MISSION".
- Cron `0 8 * * *` quotidien `/api/cron/document-alerts` (Bearer CRON_SECRET) :
  - Email récap agrégé HTML à `ADMIN_EMAIL` + 1 par consultant assigné (ses candidats)
  - **+ Rappel candidat individuel J-30 et J-14** pour types permis_conduire + qualification. Boutons WhatsApp/Email pré-remplis. Dedup metadata (pattern #61).

#### Portail client public `/client-portal/{slug}`
- Slug 16 chars `crypto.getRandomValues`. Layout dédié hors middleware d'auth.
- **3-checks sécurité** : portal.is_active + candidat en mission active chez ce client + ownership doc (pattern #60).
- Aucune donnée sensible (marge, tarif, notes internes, consultant).
- Header : logo L-Agence + ClientLogo officiel client + nom entreprise Instrument Serif.
- Card candidat : photo (fallback initiales via state imgError, pattern #62), badge 🚛 PL + âge orange, métier, **âge + localisation 1 ligne nowrap+ellipsis**, "En mission depuis le X · {durée}" (pattern #64), section permis avec date uniquement card (modal montre tout) + label "⏰ Date d'expiration", bordure rouge/orange si expiré/urgent, bar contact Appel/WhatsApp/Email.
- Tri cards par `mission.date_debut DESC`, `alignItems: start` (pas étirement).
- Modal "Voir tous les documents" : contact tel/email VISIBLES en texte + boutons, catégories headers colorés (Permis rouge, Identité bleu...), legacy docs affichent **label catégorie en gros** au lieu filename moche.
- Gestion `/missions/portails` (déplacée de `/sign/portails` car contexte mission).

#### DB / Stack
- 0 nouvelle dépendance npm
- ~5800 lignes / 37 fichiers / commit `a256881`
- Tags v2.6.17 + v2.7.0
- Patterns #57-64 ajoutés ci-dessous

---

## v2.6.2 prod — historique (mai 2026)
**v2.6.2 prod (Secrétariat Accidents v2 + Fix retour Edge + Photo crop Word)** — 11/05/2026

Phase 1 du chantier Rapports v2 (FEATURE 1 → 5 du brief João) :

### Multi-entreprise par lien candidat
1. **Table `report_link_clients`** : un lien candidat peut autoriser plusieurs entreprises destinataires. 1 rapport par semaine par entreprise (UNIQUE `link_id+week_start+report_link_client_id`).
2. **Routes API** : admin `/api/admin/reports/[id]/clients` (GET/POST/DELETE) + public `/api/reports/[slug]/clients`.
3. **Section dashboard** `LinkClientsSection.tsx` dans `/sign/rapports/[id]` (ajout/suppression entreprises, téléphone WhatsApp dédié par entreprise).
4. **Backfill auto** : tous les liens existants reçoivent 1 row `report_link_clients` recopiée depuis les champs `client_*` historiques.

### Page accueil candidat (Mobile First)
5. **Refonte complète** `/report/[slug]` avec phases `landing → select_client → form`. Skip `select_client` si 0 ou 1 entreprise.
6. **`CandidatWelcomeHeader.tsx`** : logo L-Agence + salutation dynamique (heure/jour spécial/Pâques Meeus-Jones-Butcher) + météo Open-Meteo gratuite sans clé (silent si géoloc refusée).
7. **`ClientSelector.tsx`** : cards verticales pleine largeur, contact + téléphone cliquable (`tel:`).
8. **`MissionList.tsx`** : 5 derniers rapports en cards compactes avec badge statut coloré.

### Notes candidat + client
9. **`notes_candidat`** (max 300 chars) — textarea collapsible candidat. Bandeau amber sur page client.
10. **`notes_client`** (max 300 chars) — textarea collapsible client. PATCH `update-fields` juste avant signature.
11. **Email créateur** : 2 bandeaux distincts (amber candidat + bleu client). JAMAIS dans PDF/email candidat/email client.
12. **Icône 📝 + tooltip** dans `SubmissionHistoryTable` si note présente.

### Bouton WhatsApp candidat
13. **Nouveau bouton** "Envoyer par WhatsApp à mon responsable" (#25D366) qui : (a) submit DB → marque `submitted=true` + notif email client, (b) ouvre `wa.me` deep link avec message pré-rempli `toWhatsAppSafe`. Bouton grisé si `client_phone` entreprise vide.
14. **Bandeaux** sous les 2 boutons : amber "Si pas de WhatsApp, utilise Envoyer au client" + rouge "⚠️ N'envoyez PAS ce lien à L-Agence SA — uniquement à votre responsable direct".

### Contact L-Agence
15. **`ContactAgenceButton.tsx`** : bouton fixe en bas à droite (pill jaune) + bottom sheet portalisé avec WhatsApp `+41 76 297 97 95` + bureau `+41 24 552 18 70` + horaires Lun-Ven 8h-12h/13h-17h.
16. **`lib/lagence-contact.ts`** : helpers centralisés `waMeUrl()`, `telUrl()`, `phoneDigits()` réutilisables.

### DB / Stack
- 1 nouvelle table : `report_link_clients` + 3 colonnes sur `report_submissions` (`report_link_client_id`, `notes_candidat`, `notes_client`)
- Nouveau UNIQUE constraint `report_submissions_link_week_client_unique`
- Aucune nouvelle dépendance npm (Open-Meteo via `fetch` natif)

---

## v2.3.0 prod — historique (mai 2026)

Phase consolidée v2.3.0 → v2.3.19 (mai 2026). 14 changements clés :

### Sign (Phase 4 complète)
1. **Signature canvas** mobile-friendly (drawn uniquement, fond transparent), génération PDF stampé final via `stampPdf` multi-pass + **page certificat A4 ZertES** (logo L-Agence, tableau signataires, IP, hash SHA-256, footer RS 943.03 + eIDAS)
2. **Workflow séquentiel** (`triggerNextSigner` parallel routing + notif sender à chaque signature) + routes download auth + lien public ZIP DEFLATE multi-docs
3. **WhatsApp** comme canal de livraison (`delivery_channel email/whatsapp/both` + `recipient_phone` E.164)
4. **Refonte UI DocuSign-style** : `/sign` mini-sidebar 5 sections + filtres avancés + TemplatesTable bulk + `/sign/new` full-screen + importateur DocuSign JSON + **éditeur visuel template Konva** (drag&drop, lasso, multi-drag, undo/redo, copy/paste, zoom)
5. **Contraintes resize signature/initial** (ratio 3:1 / 1:1 + minW/maxW clampés)
6. **Bouton "Aperçu PDF"** dans l'éditeur (route `POST /api/sign/templates/[id]/preview` avec données fictives) → WYSIWYG total
7. **WYSIWYG strict** `drawTextInBox` calé sur Konva `verticalAlign="middle"` (formule `y + (h - size × 0.7) / 2`)

### Rapports (nouveau module)
8. **Module `/sign/rapports`** intégré dans Sign (pas de sidebar séparée). Liens permanents par candidat (slug `prenom-nom-lagence-XXXX`). Réutilise `sign_templates` avec `kind=report`. Réutilise `PublicPdfViewer` + `PublicFieldsLayer` + `SignWizard` + `SignaturePad` (zéro doublon)
9. **Page candidat** `/report/[slug]` : sélecteur 8 dernières semaines + auto-fill dates par jour + auto-save localStorage + DB toutes les 30s
10. **Refonte mode liste DocuSign-style** (sidebar Liens + tableau Candidat/Client/Contact/Statut/Dernière/Actions, menu ⋮ portalisé)
11. **Page `/sign/rapports/new`** : autocomplete candidat (prénom+nom+email+tél depuis DB) + autocomplete client+contacts (1 ligne par contact + dialog "Enregistrer ce contact ?")
12. **Pipeline finalisation** : créateur reçoit RAPPORT + CERTIFICAT, client + candidat reçoivent UNIQUEMENT le rapport (cert privé créateur). Notif WhatsApp candidat post-signature
13. **Modal viewer iframe** + boutons Aperçu / Rapport / Certificat dans tableau historique submissions

### Cross-cutting
14. **WhatsApp safe** : `toWhatsAppSafe` LATIN_MAP exhaustive (FR/PT/ES/DE/IT + ponctuation Unicode em-dash, smart quotes, etc.) + retrait emoji 👋 (rendu ◆) + `window.open _blank` + deep link `wa.me/{phoneDigits}`

### DB / Stack
- 7 nouvelles tables : `sign_templates`, `sign_envelopes`, `sign_tokens`, `sign_audit_log`, `report_links`, `report_submissions`, `report_audit_log`
- Bucket Storage `talentflow-sign` (préfixes `templates/` `envelopes/` `signed/` `signed/reports/{linkId}/`)
- Nouvelles deps : `konva` + `react-konva`, `@dnd-kit/core+sortable+utilities`, `qrcode` (legacy)

---

## 🔴 RÈGLES MÉTIER ABSOLUES (jamais violer)

Règles consolidées après 2 jours de travail intensif avec João. À appliquer avant toute autre décision technique.

### Import & Matching
- **JAMAIS** utiliser le nom du fichier pour matcher un candidat (ni pour classifier CV/non-CV)
- **JAMAIS** matcher sur un seul signal (prénom seul, tel seul, email seul)
- Toujours : **tous les nom + tous les prénom** d'abord, puis email/tel/DDN pour confirmer
- **DDN différente = toujours 2 personnes différentes**, sans exception
- Couples/familles peuvent partager email/tel → **ne jamais fusionner** sur ces signaux seuls
- **Noms composés portugais/espagnols** (Da Silva, Dos Santos, Fragoso Costa) → ne JAMAIS tronquer, extraire tous les mots du nom
- **"SA", "Sàrl", "AG", "GmbH", "Ltd"** dans le nom extrait → c'est une entreprise, pas un candidat → rejeter
- Un certificat/diplôme/lettre ne crée **JAMAIS** un nouveau candidat
- Un non-CV sans candidat identifié → erreur propre, pas de création

### Normalisation données
- **Noms/prénoms** : toujours Title Case (Pedro Ferreira, pas PEDRO FERREIRA ni pedro ferreira). Extraire tous les mots trouvés (plusieurs prénoms, nom composé).
- **Particules** : `de, da, dos, du, van, von, del, di` → minuscule (sauf en 1ère position)
- **Email** : toujours lowercase + trim. Email vide `""` → `NULL` (jamais chaîne vide)
- **Téléphone** : toujours avec indicatif pays (+41 79..., +33 6...) si inférable, sinon copier-coller l'extraction du CV
- **Localisation** : toujours "Ville, Pays" (Monthey, Suisse)

### Règle UPDATE coords (changement 20/04/2026, décision João)
- **email / telephone / localisation** → ÉCRASÉS par le nouveau CV si valeur non vide (manuel + OneDrive). Avant : IMMUABLES (remplis seulement si vides). Raison : un candidat change de mail / déménage → la fiche doit refléter. Modale confirm-match affiche déjà les diffs → user valide consciemment.
- **date_naissance** → **IMMUABLE** (règle métier absolue : DDN différente = 2 personnes différentes — homonymes).
- **genre** → **IMMUABLE** (Claude se trompe souvent sur le genre, normalisation fragile).
- Implémenté dans `lib/merge-candidat.ts` (sections 1a DDN immuable / 1b coords replaced) + `onedrive/sync` branche classique.

### Déploiement
- **TOUJOURS** tester en localhost avant `vercel --prod`
- **JAMAIS** déployer un fix sans avoir testé le scénario exact qui a causé le bug
- Un fix non testé n'est pas un fix
- Confirmation explicite "oui déploie" obligatoire avant `vercel --prod`
- Bump version (`lib/version.ts`) + entrée changelog à chaque déploiement
- À chaque déploiement validé : mettre à jour CLAUDE.md + MEMORY.md **dans le même commit**, supprimer les règles obsolètes des versions précédentes

### Architecture import
- **2 routes d'import actives** : `cv/parse` (manuel UI) + `onedrive/sync` (cron auto 10min + manuel)
  - `cv/parse` → modale de confirmation si match trouvé (UX interactive)
  - `onedrive/sync` → silencieux, pas de modale (cron)
- **`cv/bulk` et `sharepoint/import` SUPPRIMÉES en v1.9.23** (854 lignes de code mort, 0 trafic prod vérifié). **Ne pas recréer ces routes**. Toute la logique batch passe par `cv/parse` avec `skip_confirmation=true`.
- **SHA256 du buffer PDF** = source de vérité pour identifier un fichier identique (`cv_sha256` + `cv_size_bytes` + index partiel). Jamais filename, jamais texte extrait.
- **`findExistingCandidat`** (`lib/candidat-matching.ts`) = source de vérité pour identifier un candidat existant
- **`classifyDocument`** (`lib/document-classification.ts`) = source unique CV vs non-CV (patterns contenu + email générique + hasName && !hasExperiences)

### Seuils matching (ne pas modifier sans simulation sur 6000+ candidats)
- Score ≥ 16 → match certain → update automatique
- Score 11-15 → match standard → update (onedrive/sync) ou modale (cv/parse)
- Score 8-10 → zone uncertain → pending_validation dans `/integrations`
- Score < 8 → nouveau candidat
- **strictExact (nom identique) → seuil 8 minimum** (v1.9.27, pas 5 qui fusionnait les homonymes)
- **v1.9.104 — Option B : score ≥ 11 + DDN null des 2 côtés → uncertain** (sauf si email+tel identiques = garde-fou vrai update). Protège les homonymes avec tel/email partagé (couples, familles, indépendants) contre fusion silencieuse en OneDrive sync auto.
- **Simulation obligatoire** avant tout changement de seuil (scripts `scripts/tests/sim-*.mjs`)

### UX & Interface
- **Badges** : per-user strict via `candidats_vus + auth.users.candidats_viewed_all_at`, jamais global
- **DB source de vérité** pour `candidats_vus` (pas d'UNION avec localStorage client)
- **Modale confirmation** : score + diff côte à côte + 3 boutons (Update / Créer / Voir fiche)
- **`/integrations`** = supervision imports + anomalies + pending validation
- **`/parametres/doublons`** = fusion candidats existants (4 catégories SQL v1.9.45 + fallback client)
- **Jamais d'action irréversible** sans confirmation explicite
- **Invalidation React Query explicite** après toute action user qui modifie candidats (`['candidats']` + `['candidat']`)

### Vision produit João
- Import CVs = cœur du produit, doit être parfait
- **Zéro contamination** de fiches (un CV ne doit jamais écraser la mauvaise fiche)
- **Zéro doublon silencieux** (le système doit toujours demander en cas de doute)
- Normalisation automatique = données propres dès l'entrée
- Traitement parfait des non-CV, mappés dans la bonne catégorie (`mapDocumentType`)
- **Ne pas dupliquer un CV dans `documents[]`** si déjà existant : juste changer date d'import + badge (reactivated/updated)
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
- **Frontend** : Next.js 16.1.7 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- **Backend/DB** : Supabase (PostgreSQL + RLS), Supabase Auth + OTP email
- **State** : React Query v5 (serveur), Context API (client), localStorage/sessionStorage (UI persistant)
- **IA** : Claude API (Anthropic `^0.79`), Google Generative AI (`^0.24`), Groq (`^1.1`) — parsing CV et matching
- **Docs** : pdf-lib, pdfjs-dist v5, mupdf v1.27, tesseract.js v7 (OCR), docx, mammoth, word-extractor
- **Emails** : Resend (prioritaire), Nodemailer/SMTP (fallback, chiffré AES-256-GCM), WhatsApp Business API
- **Intégrations** : Microsoft Graph API (Outlook, OneDrive, SharePoint)
- **UI** : Framer Motion, Recharts, Leaflet, Radix UI, shadcn, sonner
- **Déploiement** : Vercel Pro — région `dub1`
- **Dev local** : port 3001, commande `next dev --port 3001 --webpack` (Turbopack désactivé en dev)

---

## Structure du projet
```
app/
  (auth)/             — login, register, reset-password, verify-email, auth.css
  (dashboard)/        — toutes les pages protégées + API routes
    api/              — routes API server-side
    candidats/        — liste + fiche détail [id]
    pipeline/         — grille 3 cols (consultant + métier + rappels)
    secretariat/      — dashboard secrétaire (rôle dédié)
    missions/         — CRUD missions
    clients/          — liste + fiche [id]
    offres/           — offres emploi
    entretiens/       — calendrier entretiens
    matching/         — scoring candidats ↔ offres + historique
    messages/         — email/SMS/WhatsApp
    activites/        — timeline activité
    integrations/     — OAuth Microsoft, WhatsApp config
    outils/           — outils spécialisés (analyser candidats, rapport heures)
    parametres/       — profil, sécurité, admin, logs, doublons, photos, import-masse
    dashboard/        — page d'accueil avec KPIs
    import-masse/     — upload ZIP/PDF/Word batch
components/           — composants React (PascalCase)
contexts/             — Context API (Upload, Import, Matching, Photos, Doublons, Theme)
hooks/                — custom hooks (useCandidats, useClients, useMetiers…)
lib/                  — utils, supabase clients, cv-parser, onedrive, version, format-candidat, normalize-candidat
types/database.ts     — types Supabase auto-générés (snake_case)
supabase/migrations/  — SQL migrations versionnées
```

---

## Pages et accès

| Page | URL | Rôles | Description |
|------|-----|-------|-------------|
| Dashboard | `/dashboard` | Tous | KPIs: clients actifs, candidats entretien/placés. 5 count queries |
| Candidats liste | `/candidats` | Tous | Liste 6302+ candidats, filtres, pagination, hover CV preview |
| Candidats à traiter | `/candidats/a-traiter` | Admin, Consultant | Vue filtrée `import_status='a_traiter'` |
| Fiche candidat | `/candidats/[id]` | Tous | Détail complet + CV zoomable + notes + documents + activité |
| Pipeline | `/pipeline` | Admin, Consultant | Grille 3 cols, onglets consultants (João/Seb), onglets métiers, rappels |
| Clients | `/clients` | Admin, Consultant | 1200+ entreprises, recherche IA (Claude web_search) |
| Fiche client | `/clients/[id]` | Admin, Consultant | Détail + missions + candidats proposés |
| Offres | `/offres` | Admin, Consultant | CRUD offres emploi + veille offres externes (scraping) |
| Entretiens | `/entretiens` | Tous | Calendrier entretiens, rappels, badge sidebar |
| Matching | `/matching` | Admin, Consultant | Scoring candidats ↔ offres (IA) |
| Missions | `/missions` | Admin, Consultant | CRUD missions, stats marge, bilan mensuel, sync Quadrigis |
| Messages | `/messages` | Admin, Consultant | Envoi email/SMS/WhatsApp multi-candidats, templates |
| Activités | `/activites` | Admin, Consultant | Timeline: Pipeline, Messages, Candidats, Imports OneDrive |
| Secrétariat | `/secretariat` | **Secrétaire uniquement** | 6 modules: candidats/accidents/ALFA/paiements/loyers/notifs |
| Import masse | `/import-masse` | Admin, Consultant | Upload ZIP/PDF/Word batch |
| Intégrations | `/integrations` | **Admin uniquement** | OAuth Microsoft 365, WhatsApp config |
| Outils | `/outils` | Admin, Consultant | Index outils spécialisés |
| Analyser candidats | `/outils/analyser-candidats` | Admin, Consultant | Analyse batch IA |
| Rapport heures | `/outils/rapport-heures` | Admin, Consultant | Rapport heures + envoi email/WhatsApp |
| Paramètres | `/parametres` | Tous | Index paramètres |
| Profil | `/parametres/profil` | Tous | Édition profil |
| Sécurité | `/parametres/securite` | Tous | MDP, OTP 2FA, session timeout |
| Admin users | `/parametres/admin` | **Admin uniquement** | CRUD utilisateurs, invitations |
| Logs | `/parametres/logs` | Admin, Consultant | Logs accès + modifications |
| Doublons | `/parametres/doublons` | Admin, Consultant | Historique doublons résolus |
| Corriger photos | `/parametres/corriger-photos` | Admin, Consultant | Extraction photos CV |
| Demandes accès | `/parametres/demandes-acces` | **Admin uniquement** | Gestion demandes landing page |
| Import masse (params) | `/parametres/import-masse` | Admin | Import Excel secrétariat |
| Alertes conformité | `/alertes` | Admin, Consultant | Documents expirés/à expirer + filtres + KPIs |
| Missions portails | `/missions/portails` | Admin, Consultant | Gestion portails clients actifs |
| Portail client public | `/client-portal/[slug]` | **PUBLIC (slug 16c)** | Liste collaborateurs + onglet rapports |

---

## Routes API critiques

⚠️ **État au 13/04/2026 (v1.8.33)** : middleware exclut TOUTES les routes `/api/`. Protection via `requireAuth()` dans chaque route. **51 routes protégées sur 63**. 12 routes sans auth toutes justifiées (cron `CRON_SECRET`, webhook Meta, OAuth callback, formulaires publics, données référence). Route unifiée d'import : `/api/cv/parse` ; sync auto : `/api/onedrive/sync` (cron 10min).

→ **Liste exhaustive + détails par catégorie** : `docs/CLAUDE-detailed-rules.md` (section Routes API).

### Routes spéciales à connaître
- **`/api/cv/print`** — Proxy PDF (force `Content-Disposition: inline`, requireAuth + whitelist Supabase v2.7.5)
- **`/api/cron/onedrive-sync`** — Cron Vercel 10min
- **`/api/cron/offres-sync`** — Cron Vercel 6h (scraping offres externes)
- **`/api/cron/document-alerts`** — Cron quotidien 8h UTC, récap → `info@l-agence.ch` + rappels candidat J-30/J-14 (dedup `metadata.notif_30d_sent_at`). maxDuration 300s.
- **`/api/cron/auto-arret-reports`** — Cron dimanche 20h UTC, rapports auto si arrêt ≥14j. maxDuration 300s.
- **`/api/cron/sign-reminders`** — Cron quotidien 9h UTC, relances enveloppes Sign non signées.
- **`/api/auth/*`** — Auth flows (OTP, MDP, OAuth callback)

---

## Features principales

- **Candidats** : import masse (ZIP/PDF/Word, rotation 180°, fallback Vision, timeouts par étape), parsing IA multi-modèle, fiche détaillée, CV viewer zoomable, photos, normalisation affichage (Prénom Nom, email minuscule, ville capitalisée)
- **cv_texte_brut** : colonne texte brut du CV (max 10 000 chars). Alimentée automatiquement par les 3 pipelines (import normal, import masse, OneDrive sync). Utilisée par : matching (pré-sélection 3000 chars + score final 2500 chars), recherche IA (snippet 300 chars), doublons (400 chars), recheck-batch (source principale), dédup import (500 chars anti-doublon). **Cron Vercel `*/5min`** (`/api/cron/extract-cv-text`) traite automatiquement les candidats avec cv_texte_brut NULL/vide — batch 20, filtre exclut `[scan-non-lisible]`/`[pdf-chiffre]`. Route status `/api/cron/extract-cv-text/status` (requireAuth) utilisée par la card Outils et la Sidebar. L'outil `/api/outils/extract-cv-text` reste disponible pour forçage manuel. Vision IA (Claude Haiku) en fallback pour PDFs scannés et images JPG/PNG — passés via URL source (pas de limite taille).
- **Doublons** : détection instantanée par critères exacts (email score 100, téléphone normalisé +41 score 95, nom+prénom score 85), historique en DB (`doublons_historique`), fusion guidée champ par champ — sans IA
- **Clients** : base de 1200+ entreprises, campagnes e-mail, gestion des contacts, filtre géographique, recherche IA (Claude web_search + zefix.ch/local.ch)
- **Pipeline** : grille 3 colonnes, onglets consultants (João/Seb) avec compteurs, sous-onglets métiers filtrés par consultant actif avec compteurs, cards enrichies, rappels (toast permanent), ModifierModal, aperçu CV au survol, catégorie "Non classés". Consultant **obligatoire** — erreur 400 si ajout sans consultant
- **Missions** : CRUD complet, stats marge brute/coefficient, bilan mensuel (jours fériés cantonaux), import Notion, sync Quadrigis (validation manuelle via missions_pending). Colonnes `vacances` et `arrets` (JSONB) — badges colorés par priorité (arrêt orange, vacances bleu, absence jaune, début bientôt, fin de mission), tri automatique, ETP prorata déduit absences/vacances/arrêts, marge moyenne dès avril 2026
- **Secrétariat** : dashboard séparé (rôle Secrétaire), 6 tables DB (candidats, accidents, ALFA, paiements, loyers, notifications), import Excel (430 candidats + 113 accidents + 180 ALFA + 76 paiements + 2 loyers), historique modifications, notifications auto+manuelles avec badge sidebar, WhatsApp partout, lien fiche candidat
- **Entretiens / Suivi** : vue liste, rappels avec notification, badge sidebar (lien sidebar masqué)
- **OneDrive** : sync automatique récursif (cron 10min), déduplication, historique fichiers, `cvScore=0` classé diplôme/certificat
- **France Travail** : formulaire Word pré-rempli, envoi Resend, CC fixe, historique
- **Messages** : email/SMS/WhatsApp avec templates, activité loggée
- **Intégrations** : Microsoft 365 OAuth par utilisateur (Outlook multi-compte)
- **Veille offres** : scraping automatique jobs.ch, jobup.ch, Indeed CH via Apify (27 requêtes métier × 3 sources). Table `offres_externes` avec upsert par `url_source`. Détection agences (60+ mots-clés). Modération 3 onglets (À traiter / Ouvertes / Ignorées). Badge sidebar compteur. Cron Vercel 6h + sync manuelle. Ciblage Suisse romande uniquement.
- **CDC viewer** : analyse IA d'un cahier des charges (PDF/DOCX/image) upload le fichier original vers `cvs/cdc/` (signed URL 10 ans), stocké dans `offres.cdc_url`. Bouton 📄 CDC sur les cards commandes ouvre un modal portalisé (`createPortal`). PDF/image via iframe `/api/cv/print`, DOCX/DOC via Office Web Viewer (`view.officeapps.live.com`), fallback "Télécharger" sinon.
- **Activité** : timeline par onglets (Pipeline, Messages, Candidats, Imports OneDrive)

---

## Variables d'environnement

### Publiques (NEXT_PUBLIC_*)
```
NEXT_PUBLIC_SUPABASE_URL          URL projet Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY     Anon key publique
NEXT_PUBLIC_APP_URL               Base URL app (localhost:3001 dev, talent-flow.ch prod)
```

### Serveur (jamais exposées côté client)
```
SUPABASE_SERVICE_ROLE_KEY         Service role (admin, bypasse RLS)
ANTHROPIC_API_KEY                 Claude API
MICROSOFT_CLIENT_ID               OAuth Microsoft 365
MICROSOFT_CLIENT_SECRET           OAuth secret
MICROSOFT_TENANT_ID               Tenant ID (défaut: common)
RESEND_API_KEY                    Emails transactionnels (OTP, France Travail)
SMTP_HOST / SMTP_USER / SMTP_PASS SMTP fallback (PASS chiffré AES-256-GCM)
SMTP_ENCRYPTION_KEY               Clé chiffrement SMTP
WHATSAPP_TOKEN                    WhatsApp Business API
WHATSAPP_PHONE_ID                 WhatsApp phone ID
WHATSAPP_VERIFY_TOKEN             Webhook verify
CRON_SECRET                       Protège /api/cron/*
ADMIN_EMAIL                       Email admin (OBLIGATOIRE sur Vercel, pas de fallback)
NOTION_TOKEN                      Import missions Notion
APIFY_API_KEY                     Scraping offres externes (Apify)
JOBROOM_API_URL / USERNAME / PW   Job-Room Suisse (SECO)
```

---

## Patterns critiques — résumés (détails dans `docs/CLAUDE-detailed-rules.md`)

> Chaque pattern résumé ci-dessous a un texte complet (cas edge, raisons, dates, fixes) dans `docs/CLAUDE-detailed-rules.md`. **Consulter le fichier détaillé avant toute modification d'un pattern**.

**1. Zoom CV** (`candidats/[id]/page.tsx`) — Wrapper div + iframe `/api/cv/print#zoom=page-width`. Jamais `transform:scale` ni CSS `zoom`.

**2. Batch filtering** (`api/candidats/route.ts`) — Filtrer les IDs RPC par groupes de 200 AVANT pagination. `.limit(10000)` obligatoire sur RPC.

**3. CV inline** — Toujours `/api/cv/print` comme proxy iframe PDF (sinon Supabase peut forcer download).

**4. Pipeline pas d'auto-ajout** — `statut_pipeline` reste `null` à l'import. `pipeline_consultant` obligatoire si non-null (400). DEFAULT supprimé v1.8.31.

**5. Import status** — `'traite'`=Actif, `'a_traiter'`=À traiter, `'archive'`=Archivé. JAMAIS modifier `import_status` sur UPDATE existant (juste `has_update:true`).

**6. Import CV — logique** (v1.8.30) — Même CV+même date→SKIP. Même CV+date diff→réactivé. Nouveau contenu→update complet. Plus ancien→archivé `documents[]`. Dédup URL+nom de base, jamais filename.

**7. Badges per-user** (v1.9.16, durci v1.9.95) — 🔴 Badge rouge = changement de CV UNIQUEMENT. `last_import_at` jamais écrit hors import. Vu/non-vu strict per-user via `candidats_vus` + `viewedAllAt`. Realtime exige REPLICA IDENTITY FULL + filtre `oldTs!==newTs`.

**8. Normalisation noms fichiers CV** — Storage `_` au lieu d'espaces. Toute compare via `normFn()` (strip timestamp + lowercase). Jamais `file.name` brut vs `cv_nom_fichier`.

**9. "Définir comme CV principal" — nettoyage noms** — Strip `[Ancien]`/`[Archive]` à la promotion. 2 routes import préfixent `[Ancien]`. Dédup 3 variantes (URL, brut, préfixé).

**10. Modaux `position: fixed`** — Toujours `createPortal(jsx, document.body)`. Framer Motion `transform` casse `position: fixed` sur enfants.

**11. Turbopack** — Dev local : `--webpack` (crash sur `auth.css`). Prod Vercel : Turbopack via `turbopack.resolveAlias` dans `next.config.ts`. Coexistence des 2 configs.

**12. Scroll position** — Conteneur `.d-content` (PAS `window`). `document.querySelector('.d-content')?.scrollTop`.

**13. Navigation retour fiche** — `?from=pipeline|missions|secretariat`. Bouton retour route dynamique.

**14. Classification CV/non-CV** — Source unique `lib/document-classification.ts`. JAMAIS détection par filename (v1.9.33). 7 règles IA-first (v1.9.102) : IA explicite > patterns 0-500 chars > CV-markers (variantes A/B) > email générique > texte<1500 > nom sans exp > fallback IA. Warning `name_ambiguity` validator. Simulation 100+ CVs obligatoire.

**15. SHA256 buffer CV** (v1.9.42) — `cv_sha256` + `cv_size_bytes` + index partiel. `contenuIdentique = hashMatch || sizeMatch || textMatch || memeItemLiee`. Backfill opportuniste à chaque réactivation.

**16. Badge rouge per-user — DB strict** (v1.9.40) — `viewedSet = dbSet` (PAS d'UNION localStorage). localStorage aligné sur DB à chaque init.

**17. SHA256 orphelins — garde-fou** (v1.9.43) — Cron `/api/cron/check-sha256-integrity` (dimanche 03h UTC). Toujours écrire `cv_sha256+cv_size_bytes` dans tout INSERT/UPDATE qui touche `cv_url`.

**18. Invalidation RQ après sync OneDrive** (v1.9.43) — Invalider `['candidats']` + `['onedrive-fichiers']` + `['integrations']` après `setOnedriveSyncing(false)`.

**19. Invalidation RQ après import UploadCV** (v1.9.44) — Invalider `['candidats']` + `['candidat']` au `setDone(true)`. Sidebar debounce 500ms. **AWAIT avant `dispatchBadgesChanged()`** sinon stale cache → badge invisible.

**20. Dark mode tokens** (v1.9.50) — `:root`=LIGHT, `.dark`=DARK. Tokens : `--foreground/background/card/popover/muted/border/input/primary/secondary/accent/ring/destructive/success/warning/info` + variantes `-foreground`, `-soft`. **JAMAIS hardcoder hex** (sauf branding externe Microsoft/Google/WhatsApp). `--destructive-foreground` blanc constant.

**21. Dashboard consultant enrichi** (v1.9.50) — Header gradient `--warning-soft → --success-soft` + phrase motivationnelle. 3 badges À TRAITER/RAPPELS/ALERTES. KPIs 3-4 cards. Card Pipeline par métier (João+Seb). Chart Imports BarChart + LabelList + Cell. RecentActivityWidget + Tips IA déterministes.

**22. TopBar bouton Importer** (v1.9.50) — Jaune brand, gauche du toggle thème, dans `TopBar.tsx`. `useUpload().openUpload()` depuis `UploadContext`. Visible sur toutes pages dashboard. Mobile : `.d-topbar-import-label` cache texte.

**23. Badges colorés changement CV** (v1.9.65) — 🟢 Nouveau / 🟡 Réactivé / 🔵 Actualisé. 2 sources : manuel (`lib/recently-updated.ts` localStorage TTL 10min) > OneDrive (DB `onedrive_change_type`+`onedrive_change_at`). Indépendant du badge rouge per-user. Clear OneDrive quand n'importe quel user ouvre la fiche.

**24. Recherche booléenne candidats** (v1.9.66) — Parser recursive descent dans `CandidatsList.tsx` (`parseBooleanSearch`+`tokenizeBoolean`). Supporte `ET/AND, OU/OR, SAUF/NOT`, parenthèses, AND implicite. Trigger : opérateur ou `()`. OR/SAUF/() → fetch 10k + filtrage JS. ET seul → RPC SQL. Pas `cv_texte_brut` en booléen.

**25. Popover note portalisé** (v1.9.66) — `notePopoverRect` via `getBoundingClientRect()`. `createPortal` + `position: fixed`. Calcul `spaceAbove`/`spaceBelow` + `maxHeight` clampé 180-420.

**26. Persistance matching IA** (v1.9.66) — `matching/page.tsx` ne reset PLUS au mount si `phase==='done'`. Boutons "Nouvelle analyse" + "Vider résultats" seuls reset. Hover CV via `useCvHoverPreview`+`CvHoverPanel`.

**27. WhatsApp bulk séquentiel** (v1.9.67) — 1 clic = 1 chat (popup-blocker bloque la boucle). Modal dans `CandidatsList.tsx`. Bouton `#25D366`. `personalize(tpl,c)` par candidat. `toWaPhone()` factorisé `lib/phone-format.ts`. Log fire-and-forget.

**28. /messages nettoyé** (v1.9.67) — Onglets WhatsApp+SMS/iMessage **supprimés** (254 lignes dead code). TabId : `'email'|'templates'|'historique'`. Bulk passe par `/candidats`. **Ne pas recréer**.

**29. Historique team partagé + warning 7j** (v1.9.70) — RLS `emails_envoyes` SELECT `USING true`. Colonne `user_name`. Endpoint `/api/messages/recent-contacts?candidat_ids=` (2 fetches parallèles + merge). Composant `RecentContactsWarning` non-bloquant intégré 3 modals.

**30. Mailing refondu** (v1.9.70) — Mode `individual` (boucle) vs `grouped` (1 POST avec `cc:string[]`). Overrides per-destinataire (`overrides`+`previewIdx`+flèches). Aperçu fond blanc dur. `ClientPickerModal` : `per_page:2000` + `parseBooleanSearch()` (lib partagée). `EmailChipInput` autocomplete via `/api/emails/suggest` (clients+team+récents) + cache module-level.

**31. Templates 3 canaux + variables harmonisées** (v1.9.68-70) — `email_templates.type` CHECK `'email'|'sms'|'whatsapp'`. TemplatesTab grouped par canal. CreateTemplateForm radio-cards. Bouton "Copier vers" canal. Variables `{prenom}/{nom}/{metier}/{civilite}` courtes + legacy `{candidat_*}` + SMS `[MÉTIER]/[LIEU]` rétrocompat.

**32. Activités compteurs + cron cleanup 30j** (v1.9.70) — `/api/activites/counts` (4 count parallèles, respecte filtres). Badges pill cap `9999+`. **Cron `/api/cron/cleanup-old-data`** quotidien `15 3 * * *` UTC. Rétention 30j sur `emails_envoyes` + `activites`.

**33. Signature email per-user** (v1.9.70) — `auth.users.raw_user_meta_data.signature_html`. Script `setup-seb-signature.mjs` idempotent. Reconnexion users requise pour récup nouvelle meta.

**34. Extraction photos F1bis Vision crop** (v1.9.105, étendu v1.9.107) — Scans A4 (ratio 1.3-1.55, ≥1500×2000px) rejetés `processXObjects` → collectés `RejectedFullPageScan` → branche Vision Haiku entre Strategy 2 et 3 via helper `tryVisionFaceCrop()`. **v1.9.107** : (a) FlateDecode aussi capturé (décompressé+ré-encodé JPEG, pas seulement DCTDecode), (b) F1bis-DOCX : grandes photos word/media/* (>2000px, ratio 0.5-3.0) → Vision face crop (cas Soraia 4032×3024), (c) source candidats Vision préfixée `vision-face:` → scoreHeadshot assouplit veto `uniqueColors<40` à `uc≥35` pour ces sources (cas José Antonio uc=39), (d) garde-fou face cover ratio (`faceSize/max(origW,origH) > 0.5 → reject`) remplace l'ancien `crop<orig*0.4` faux-restrictif sur photos paysage. Logs F5 prod tags structurés (`[F5-S1]`, `[F5-S2]`, `[F5-S1bis]`, `[F5-DOCX]`, `[F5-DOCX-S1bis]`, `[F5-S3]`, `[F5-Score]`, `[F5-Final]`). Bancs test `scripts/tests/test-photo-extraction.ts` (cible 22/22, atteint v1.9.107) + `sim-photo-extraction.ts` (cible 58/100, atteint 60/100 v1.9.107). Marqueur magique `photo_url='checked'` (tenté+échoué) ≠ NULL (jamais tenté). Batch rétroactif `scripts/batch/retro-photo-extraction.ts` (commit 332d365, 662/2824 photos extraites).

**35. Retry OneDrive non-CVs orphelins stoppé** (v1.9.106) — `onedrive/sync/route.ts` L1579 → `traite:true` sur erreur définitive "candidat introuvable". Erreurs transitoires (timeout, exception, fichier>10MB) conservent `traite:false`. Recovery manuel : ré-import via UploadCV ou SQL `traite=false`.

**36. Bandeau "Actualisé" pending-validation** (v1.9.106) — `pending-validation/route.ts` L161-180 ajoute `onedrive_change_type:'mis_a_jour'` + `onedrive_change_at` au payload. Cohérent cv/parse cvUpdated, onedrive/sync update, candidats/[id] onCvChange.

**56. RAPPORTS — Route `/resend` séparée de `/submit`** (v2.3.2) — Plutôt que d'overload `/api/reports/[slug]/submit/route.ts` avec un mode resend (et risquer corruption types submission), créer une route dédiée `/api/reports/[slug]/submissions/[id]/resend/route.ts` qui ne fait QUE : (a) refresh `client_token_expires_at` (TTL 7j), (b) renvoi email/WhatsApp client selon `delivery_channel`, (c) audit log `client_notified` avec `source='resend'`. Status **409 si pas en `candidate_signed`** (sinon resend de quoi ?). Pas besoin de re-vérifier la signature candidat ni de regénérer fields — juste réveiller le client. Pattern applicable à tout flow async qui a une primitive "réveiller le destinataire suivant".

**55. RAPPORTS — Bouton WhatsApp deep link `wa.me`** (v2.3.2) — Format URL : `https://wa.me/{digits}?text={encodeURIComponent(msg)}`. `digits` = numéro E.164 sans le `+`, sans espaces, sans tirets. Helper : `phone.replace(/\D/g, '')`. Sans numéro → `wa.me/?text=...` ouvre le picker contact WhatsApp. Stocké côté Reports via colonne dédiée `report_links.candidat_phone TEXT CHECK ('^\+\d{10,15}$')` (E.164 strict). Pages `/sign/rapports[/id]` génèrent le bouton coloré `#25D366` avec ce lien. **NE PAS** réutiliser le format `whatsapp://` (mobile only, pas de fallback web).

**54. RAPPORTS — Notification croisée candidat ↔ client à signature** (v2.3.2) — Quand le client signe (`/api/reports/client/[token]/sign`), notifier ENSUITE le candidat qui a soumis avec : (a) email confirmation + PDF en PJ via `sendCompletedEmailToCandidat()`, (b) WhatsApp si `link.candidat_phone` rempli via `sendCompletedWhatsAppToCandidat()` (helper dans `lib/report/send-notifications.ts`). Le candidat n'avait jamais été notifié AVANT — pendant des jours João testait et croyait que tout marchait alors que le candidat ne savait pas que son rapport était validé. Pattern général : tout workflow async multi-acteurs doit notifier le **soumissionneur** quand le **valideur** termine, pas seulement l'admin.

**53. RAPPORTS — Génération PDF on-the-fly pour preview download** (v2.3.2) — Quand le PDF final n'existe pas encore (`status='candidate_signed'`, en attente client), la route `/api/reports/[slug]/submissions/[id]/download/route.ts` génère une preview à la volée via `generateReportPdf()` au lieu de renvoyer 404. Évite de stocker des intermédiaires en Storage (`signed/reports/.../draft.pdf`) qui devraient être nettoyés. Une fois le client signé → le PDF final stampé est en Storage et la route le renvoie directement (signed URL ou stream). Pattern applicable à tout flow où un état "intermédiaire" justifie un téléchargement (visualisation, audit, transmission tierce). Coût : regénération PDF à chaque clic preview → acceptable si <2s.

**52. RAPPORTS — Réutilisation totale composants Sign** (v2.3.0) — Le module Rapports n'a PAS de viewer/wizard/signature custom. Tout est mutualisé avec Sign : `PublicPdfViewer` (PDF zoomable), `PublicFieldsLayer` (overlay fields cliquables read-only via `currentRecipientOrder`), `SignWizard` (mode pas-à-pas pré-construit depuis `wizard_steps` du template), `SignaturePad` (canvas/typed mobile-friendly). Côté lib : `lib/report/pdf-generator.ts` réutilise `lib/sign/pdf-stamp.ts` + `lib/sign/storage.ts` (préfixe `signed/reports/{linkId}/{submissionId}/`). Côté template : `sign_templates.kind='report'` (pas de table séparée). Si modif d'un de ces composants pour Sign, le rapport en bénéficie auto. **NE PAS dupliquer** ces composants dans `components/report/` même si tentation.

**51. RAPPORTS — Slug permanent (vs token éphémère)** (v2.3.0) — Différence cruciale Sign vs Reports : Sign utilise des `sign_tokens` à TTL configurable (7-30j), Rapports utilise un `slug` permanent jamais réutilisé même après révocation. Format : `{prenom}-{nom}-lagence-{4chars}` via `lib/report/slug.ts` (retry 5x sur collision). Sécurité : page publique vérifie `link.status === 'active'` à chaque GET. Le slug peut donc se balader en clair dans WhatsApp/email — c'est par design. UNIQUE constraint en DB. **Le client_token (côté signature client)** lui est éphémère et UUID DEFAULT en DB : 2h en mode présentiel (QR), 7j en mode envoi distant (`CLIENT_TOKEN_TTL_MS` dans `lib/report/types.ts`).

**50. Routes API publiques vs dashboard — namespace strict** (v2.3.0) — Next.js Route Groups `(dashboard)` ne changent PAS l'URL. Donc `app/api/reports/[slug]/route.ts` (publique) ET `app/(dashboard)/api/reports/[slug]/route.ts` (dashboard) résolvent au même URL `/api/reports/[slug]` → CONFLIT (Next ignore l'une des 2 silencieusement, lesquelle dépend de l'ordre alphabétique). **Convention** : routes dashboard sous `/api/admin/...` (namespace distinct), routes publiques sous `/api/...`. Dans `(dashboard)/api/admin/reports/[id]/route.ts` on peut utiliser `[id]` même si la publique utilise `[slug]` car les chemins URL sont différents (`/api/admin/reports/...` vs `/api/reports/...`). À retenir : tout nouveau module avec partie publique + partie dashboard → 2 namespaces séparés (`/api/X/...` vs `/api/admin/X/...`).

**49. Sign — bucket Storage `talentflow-sign` partagé** (v2.3.0) — UN SEUL bucket privé pour TOUTES les opérations Sign + Reports. Préfixes hiérarchiques :
- `templates/{tplId}/{ts}_{file}.pdf` — PDFs source uploadés à la création template
- `envelopes/{envelopeId}/{ts}_{file}.pdf` — PDFs custom d'une enveloppe (ad-hoc, sans template)
- `signed/{envelopeId}/{ts}_{file}.pdf` — PDFs finaux stampés post-signature Sign
- `signed/reports/{linkId}/{submissionId}/{ts}_{file}.pdf` — PDFs finaux stampés post-signature Rapport

Service role only (RLS bloque l'accès public direct). Accès via routes proxy : `/api/sign/document/[token]` (Sign) ou `/api/reports/[slug]/document` (Rapport candidat) ou `/api/reports/client/[token]/document` (Rapport client). Tous vérifient que le path demandé appartient bien au template/envelope avant le download. **NE PAS** créer un nouveau bucket pour un nouveau module qui s'intègre à Sign — utiliser un préfixe.

**48. Tri server-side obligatoire avec pagination** (v2.1.9) — Le sélecteur "Plus récents / A→Z / Z→A" sur `/clients` ne triait QUE la page courante (20 résultats) côté front, après que `/api/clients` ait trié par `nom_entreprise ASC` par défaut. Résultat : un nouveau client (Z Truc Sàrl, page 62) restait invisible en mode "Plus récents". **Règle générale** : dès que la pagination est server-side (LIMIT/OFFSET sur Supabase), le tri DOIT l'être aussi. Tri client-only = ne fonctionne que pour les éléments DÉJÀ dans la page renvoyée. Fix : param `?sort=recent|az|za` à l'API + propagation via hook (`filters.sort` dans queryKey → refetch automatique). Vérifier les autres listes paginées (candidats, missions, offres) si même piège.

**47. Toasts Sonner dédup + dismiss permanent** (v2.1.5) — 2 patterns à connaître pour les toasts longs/répétés :
1. **Dédup** : passer un `id` stable au toast (`toast.success(msg, { id: 'rappel-deleted-' + rid })`) → si le même id est ré-émis (ex : suppression cascade modal+panel), Sonner remplace au lieu d'ajouter. Évite les doubles toasts.
2. **Notif permanente dismissable** : pour un toast `duration: Infinity` (ex : alerte rappel à valider), utiliser un id stable (`'rappel-notif-' + rid`) ET appeler `toast.dismiss('rappel-notif-' + rid)` quand l'action devient obsolète (rappel marqué done/supprimé) — sinon le toast reste affiché avec un bouton "Valider" qui ne fait plus rien.

**46. Modal portalisé v2 — pattern Documents** (v2.1.6) — Pour tout nouveau modal centré (Notes, Pipeline-actions, etc.) reproduire la structure DocumentsPanel : `createPortal` + backdrop `rgba(0,0,0,0.55) blur(6px)` + container `width: min(640-900px, 95vw) maxHeight: 88vh background: var(--card) borderRadius: 16 boxShadow: 0 24px 64px rgba(0,0,0,0.30)` + header `padding 20px 24px 18px borderBottom 1px solid var(--border)` avec **DialogTitle Instrument Serif 22-24** + sous-titre count en `var(--text-3)` + bouton X 34×34 `border 1px var(--border) hover background var(--surface-2)`. Boutons CTA primary en jaune brand (pas surface gris). NE PAS utiliser de slide-over à droite pour les actions principales (réservé aux panneaux info secondaires).

**45. Modals shadcn/ui en design V2** (v2.1.0) — Les composants `<Dialog>` shadcn ont des classes par défaut (`bg-background`, `text-base font-medium`) qui n'utilisent pas DM Sans / Instrument Serif. Pour respecter le design V2 : (a) sur `DialogContent` ajouter `style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif', background: 'var(--card)', padding: 24, gap: 16, border: '1px solid var(--border)', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.35)' }}` ; (b) sur `DialogTitle` ajouter `style={{ fontFamily: 'var(--font-instrument-serif), "Instrument Serif", Georgia, serif', fontSize: 26, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.01em', color: 'var(--foreground)' }}`. **NE PAS modifier `components/ui/dialog.tsx`** (composant shadcn générique réutilisé partout) — appliquer les overrides au point d'usage. Précédent : modals templates `/messages` v2.1.0.

**44. Pipeline grid horizontal + pills par catégorie** (v2.1.0) — Ancien pipeline (v2.0.1) en LISTE single column ne respectait pas l'alignement de colonnes (chaque card avait ses widths internes flottants). Refonte v2.1.0 : grid horizontal STRICT avec `flex: '0 0 Npx'` (Photo 48 / Nom+métier flex 1 / Lieu 200 / Âge 50 / Notes 220 / Rappel 90 / Actions 180) + header colonnes Jakarta uppercase 10.5px au-dessus. Pills métiers GROUPÉES PAR CATÉGORIE via `useMetierCategories` : pour chaque catégorie, label coloré uppercase à gauche (min 110px) + pills à droite, séparés par `borderTop: 1px dashed`. "Tous" et "Autres" isolés en haut. Renderer factorisé en helper `renderPill(label, count, accent)`. Ne JAMAIS revenir au wrap flat (illisible quand >10 métiers).

**43. Alignement liste candidats — `flex: 0 0 Npx` strict obligatoire** (v2.0.0) — Bug récurrent vu sur 4 sessions : les wrappers row utilisaient `width: Npx + flexShrink: 0` mais les spans header n'avaient pas tous `flexShrink: 0` → en flex étroit, les cellules header se compressaient (130 → 80px) alors que rows gardaient leurs 130 → décalage 30-90px visuellement. **Fix définitif** : remplacer tout par `flex: '0 0 Npx'` (shorthand strict no-grow/no-shrink/basis) sur header ET row simultanément. Ajouter `width: 68, height: 68` explicite sur le wrapper avatar du row (qui n'avait pas de width). NE JAMAIS revenir à `width + flexShrink:0` qui peut diverger silencieusement.

**42. WelcomeV2Modal accueil v2.0** (v2.0.0) — `components/WelcomeV2Modal.tsx` affiché 1 fois par user via `localStorage('seen_v2_welcome')`. Confettis `canvas-confetti@^1.9.4` : burst central 120 particules + flux latéraux 4×4 particules sur 2.5s (palette `#EAB308 #F5A623 #1C1A14 #FFFDF5`). Dynamic import du module pour éviter de charger la lib si modal jamais affiché. Header `Instrument Serif 36px` "TalentFlow 2.0 est là 🎉". 10 highlights `HIGHLIGHTS` constant en haut du fichier — éditer cette liste pour la prochaine release majeure. Intégré dans `DashboardShell` après `RealtimeBridge` (s'affiche sur toutes les pages dashboard à la première visite). Bouton "Découvrir →" jaune brand setLocalStorage + close. Respect `prefers-reduced-motion` via animations CSS standards. **Pour réutiliser pour future v3** : changer `STORAGE_KEY = 'seen_v3_welcome'` + remplacer `HIGHLIGHTS` + bump version.

**41. Vue carte interactive /clients** (v1.9.118, enrichi v1.9.119) — `components/ClientsMap.tsx` + intégration toggle dans `app/(dashboard)/clients/page.tsx` (4 modes : grille / liste / carte / split). 2 colonnes DB `clients.latitude/longitude FLOAT` + index partiel `idx_clients_geo`. Stack : `leaflet@1.9.4` + `react-leaflet@5` + `leaflet.markercluster@1.5.3`. Lazy load via `next/dynamic({ ssr:false })` car Leaflet incompatible SSR. ClusterLayer en sub-component qui utilise `useMap()` + `L.markerClusterGroup` directement (pas de wrapper react-leaflet pour markercluster en v5). Markers : 1 par client, popup HTML statique avec ClientLogo+nom+badge Zefix+secteurs. Mode split = grid 40/60, carte sticky `top:16` `height:calc(100vh - 240px)`. Hook `useClients` étendu avec `options.enabled` pour ne pas fetch 5000 lignes en mode liste. Mode persisté dans `sessionStorage('clients_view')`. Tuiles OSM gratuites sans clé. **v1.9.119 améliorations** : (a) géocodage rue précise via `geocodeAddress(adresse, npa, ville, pays)` dans `lib/geocode-localisation.ts` (séparé de `geocodeLocalisation` qui reste pour candidats) — Nominatim avec query complète "Rue X 26, 1870 Monthey, Suisse", fallback centroïde NPA si Nominatim KO ; (b) pipeline POST/PATCH `/api/clients` non-bloquant via `after()` de `next/server` — response immédiate avec centroïde NPA (lookup local sync ~1ms), Nominatim adresse précise en background → UPDATE coords quand prêt ; PATCH re-géocode si `adresse` OU `npa` OU `ville` change ; (c) fitBounds **percentile 5-95** sur lat/lng séparément — ignore outliers géographiques (1 client en Suisse alémanique ne tire plus le viewport jusqu'à Bern), tous markers restent rendus, viewport initial serré ; (d) **click card en mode split = focus marker carte** (au lieu d'ouvrir fiche) via prop `focusedClientId` + `useRef<Map<id,Marker>>` + `cluster.zoomToShowLayer(marker, () => marker.openPopup())` ; bouton "Voir la fiche →" dédié en bas de card avec `stopPropagation` ; border jaune sur card sélectionnée ; (e) fix split view — `flexDirection:'column'` étendu au mode split (cards empilées verticalement lisibles, plus écrasées en row). Batch `scripts/batch/geocode-clients.ts` (centroïde, 1219/1219 en <5s) + `geocode-clients-addresses.ts` (rue précise, 875/1025 = 85.4% via Nominatim ~19 min, 0 régression sur les 150 KO qui gardent centroïde). Test interactif Leaflet doit être validé en localhost — non testable en CI/build.

**40. Vérification Zefix (registre du commerce suisse)** (v1.9.117) — Source unique `lib/zefix.ts`. API publique sans auth via `POST https://www.zefix.admin.ch/ZefixREST/api/v1/firm/search.json` (endpoint interne du site web zefix.ch — le `ZefixPublicREST` documenté Swagger demande Basic Auth, lui). 4 colonnes en DB : `clients.zefix_uid` (CHE-XXX.XXX.XXX, index unique partiel) + `zefix_status` (EXISTIEREND/AUFGELOEST/GELOESCHT) + `zefix_name` (raison sociale RC) + `zefix_verified_at` (timestamptz). `searchZefix()` fait retry intelligent : si nom complet → 404, retente sans suffixes commerciaux (SA/Sàrl/AG/GmbH/SAS/EURL/SARL/SNC) car Zefix ne match pas "SA" ↔ "S.A." en string. `nameSimilarity()` Levenshtein normalisé + bonus containment. Fuzzy threshold 75 (verify) / 88 (already_in_talentflow). 2 routes : `POST /api/clients/zefix/search` (proxy + flag déjà-en-DB) + `POST /api/clients/zefix/verify` (cherche + persiste les 4 zefix_*, log activité, bonus +5 si ville Zefix matche ville DB). UI : modale "Ajouter un client" avec 3 onglets `Zefix RC` (default, gratuit, instantané) → `Recherche IA` (Claude+web_search, lent mais récupère adresse/tel/site) → `Saisie manuelle`. Section "Registre du commerce" sur fiche `/clients/[id]` avec badge statut coloré, bouton Vérifier/Re-vérifier, bandeau alerte rouge si GELOESCHT et orange si AUFGELOEST, lien `cantonalExcerptWeb`. Batch `scripts/batch/zefix-audit-clients.ts` : DRY-RUN par défaut, `--apply` pour persister, rate limit 300ms, skip si vérifié <30j, CSV `~/Desktop/zefix-audit-clients.csv` avec 6 actions (OK_ACTIF/EN_LIQUIDATION/RADIE/NOM_DIFFERENT/NOT_FOUND/ALREADY_VERIFIED). UPDATE DB **uniquement** les 4 zefix_*, **JAMAIS** le statut client — João décide manuellement après. Limitation API : pas d'adresse postale complète (juste `legalSeat` = ville RC), pas de tel/site web — pour ces données utiliser onglet Recherche IA.

**39. Logos entreprises automatiques** (v1.9.115) — `components/ClientLogo.tsx` rend le logo d'un client à partir de `site_web`. Cascade fallback : logo.dev (si `NEXT_PUBLIC_LOGO_DEV_TOKEN` présent, free tier 1000/mois, vrais logos haute qualité) → Google Favicons (gratuit sans clé, qualité variable) → initiales colorées sur palette 12 couleurs (hash stable du nom → index). `<img>` natif (pas Next/Image, évite whitelist next.config), lazy loading, skeleton pulse pendant load, `onError` cascade automatique entre les 3 stages. Tailles `sm` 32px (cards) / `md` 48px / `lg` 64px (header fiche). Helpers : `extractDomain` (strip protocol/www/path/query), `getInitials` (strip SA/Sàrl/AG/GmbH/Ltd, 2 lettres max). Intégré 4 endroits : `/clients` cards (sm), `/clients/[id]` header (lg), `ClientPickerModal` mailing (sm), `ProspectionModal` (sm). **Clearbit Logo API a été sunset par HubSpot 2024** (DNS `logo.clearbit.com` dead) — ne pas réintroduire. Setup token : signup logo.dev → `.env.local` + Vercel env vars `NEXT_PUBLIC_LOGO_DEV_TOKEN=tok_xxx`. Sans token, mode dégradé Google Favicons immédiat (pas de blocage déploiement).

**38. Secteurs d'activité clients** (v1.9.114, remplace v1.9.113 metiers_recherches) — Colonne `clients.secteurs_activite TEXT[]` + index GIN `idx_clients_secteurs`. Source unique `lib/secteurs-extractor.ts` : `SECTEURS_ACTIVITE` (25 valeurs fermées ordonnées par catégorie : Maçonnerie [Gros Œuvre] → Électricité, Peinture, Plâtrerie, Sanitaire, Chauffage, Ventilation, Menuiserie, Charpente, Ferblanterie, Couverture, Étanchéité, Carrelage, Paysagisme [Second Œuvre] → Serrurerie, Soudure, Tuyauterie, Industrie [Technique] → Architecture, Ingénierie → Logistique → Manutention → Nettoyage → Restauration, Autres), `extractSecteursFromClient(notes, secteur)` priorité notes → fallback NOGA Zefix → none, `sanitizeSecteurs()` valide inputs UI/API, `SECTEUR_REPRESENTATIVE_METIER` mapping pour résolution couleurs via `useMetierCategories` (Architecture en bleu clair, Logistique en vert). Pipeline auto : `POST /api/clients` extrait à la création si non fourni, `PATCH /api/clients/[id]` recalcule à chaque modif notes (sauf si `secteurs_activite` fourni explicitement = édition manuelle prioritaire). Filtre API `?secteurs=Sanitaire,Chauffage` (CSV) → `.overlaps()` OR logique + `?ville=`, `?npa=`, `?canton=`, `?contacts=avec|sans`, `?created_after=`, `?created_before=`. Endpoint stats `GET /api/clients/secteurs-stats` (agrégat + sort desc, cache 5min). UI /clients : dropdown multi-select (popover checkboxes pastille couleur trié par fréquence avec count) dans filtres avancés ; pills card max 2 + "+X" + header fiche max 3 + "+X" colorées par catégorie ; pagination header style /candidats (per_page 20/50/100/1000/Tous) ; recherche RPC `search_clients_filtered` avec tiebreaker succursales (`jsonb_array_length(contacts) DESC` puis présence notes DESC) — quand search actif, le tri front 'recent' par created_at est désactivé pour respecter relevance serveur. Modale création + ContactsEditor display+edit (mode card avec bouton Pencil → mode édition 5 inputs + Check/Cancel). Bug NPA : `lib/cp-to-ville.ts` (datasets geonames CH+FR) résout `1000` → `Lausanne%` prefix-match (couvre 1000-1018, exclut Romanel-sur-Lausanne). ClientPickerModal mailing + ProspectionModal partagent le même multi-select secteurs. Batch one-shot `scripts/batch/extract-secteurs-clients.ts` enrichit 1174/1221 (96.2%) ; `scripts/batch/clean-notes-metiers-only.ts` vide 980/1191 notes redondantes ; `scripts/batch/report-contacts-incomplets.ts` génère CSV 181 contacts à compléter. Source distincte du `secteur` NOGA Zefix qui reste intact (pas affiché en UI).

**37. Géolocalisation par rayon** (v1.9.110) — Colonnes `candidats.latitude/longitude` FLOAT + index partiel `idx_candidats_geo`. RPC PostgreSQL `haversine_km` IMMUTABLE + `candidats_dans_rayon(p_lat, p_lng, p_rayon_km, p_ids[])` STABLE retourne `(id, distance_km)` ASC NULLS LAST. Pipeline import géocode auto via `lib/geocode-localisation.ts` (lookup local CP `scripts/data/cp_geo.json` 23780 entrées CH+FR ~95% des cas, fallback Nominatim async timeout 3s). UPDATE coords dans `merge-candidat.ts` recalcule lat/lng dès que localisation change. API `/api/candidats?lat=...&lng=...&rayon_km=...` branche RPC après pré-filtre (search + colonnes). Endpoint `/api/villes/suggestions?q=...` autocomplete instantané (pas de DB, pas de réseau). UI : champ VILLE & RAYON dans filtres avancés + presets 10/25/50/100 km + valeur libre 1-500. Badge orange "12 km" sur card si filtre actif. Validation Europe (35-72°N, -10 à +40°E) rejette FP géographiques. Candidats sans coords toujours affichés en queue.

**57. COMPLIANCE — Métier mission = `pipeline_metier` uniquement** (v2.7.0) — La modal mission lit `pipeline_metier` du candidat comme source unique. JAMAIS `titre_poste` (extrait IA du CV, peu fiable). Liste `<select>` sur `app_settings.metiers` (64 valeurs paramétrées). Champ secondaire "Intitulé affiché (optionnel)" → `missions.metier_display` (priorité d'affichage `metier_display || metier` côté portail/rapports).

**58. COMPLIANCE — Status calculé dynamique (vue SQL)** (v2.7.0) — `candidat_documents_with_status` calcule le statut (valide / expire_30d / expire_14d / expire / sans_date) à la lecture. **Impossible** de faire colonne STORED car `CURRENT_DATE` n'est pas IMMUTABLE en PostgreSQL. Lire via la vue, jamais la table directement pour les listes filtrées par statut.

**59. COMPLIANCE — DELETE document safe (count refs avant remove Storage)** (v2.7.0) — Avant `storage.remove([path])`, compter `WHERE file_recto_path = path OR file_verso_path = path`. Si count > 1 (cas multi-permis batch B+C+CE partage 1 fichier) → DELETE row uniquement, garder le fichier Storage. Sinon, double DELETE row + Storage.

**60. PORTAIL — 3-checks sécurité ownership** (v2.7.0) — Toute route `/api/client-portal/[slug]/**` vérifie : (1) `client_portals.is_active=true` + slug existe, (2) candidat demandé en mission active chez ce client (jointure `missions` statut actif), (3) doc/rapport demandé appartient bien au candidat ET au client (jointure `report_link_clients.client_id`). Slug 16c `crypto.getRandomValues` permet circulation publique (par design) — la sécurité repose entièrement sur ces 3 checks serveur, jamais sur le slug lui-même.

**61. COMPLIANCE — Dedup rappels candidat metadata jsonb** (v2.7.0) — `candidat_documents.metadata.notif_30d_sent_at` + `notif_14d_sent_at` (timestamptz). Cron `document-alerts` checke ces champs avant d'envoyer un rappel J-30/J-14, et les écrit après envoi. Pas de table séparée. Permet re-trigger manuel en clearant le champ (`UPDATE ... SET metadata = metadata - 'notif_30d_sent_at'`).

**62. PORTAIL — Fallback photo via state imgError** (v2.7.0) — Pas `onError={() => setSrc(fallback)}` (boucle infinie possible) mais `useState(false)` `imgError` + render conditionnel : `{photo && !imgError ? <img onError={()=>setImgError(true)} /> : <Initials />}`. Réinitialiser sur `useEffect([photo])` si l'URL change.

**63. SIGN — Détection auto IA champs template via Claude Vision** (v2.7.4) — Route `POST /api/sign/templates/[id]/enrich-with-ai`. 2 modes : (a) 0 champ → détection from scratch (bouton amber "🔍 Détecter automatiquement"), (b) champs existants → restructure wizard + enrichit tooltips sans toucher positions (bouton outline "✨ Améliorer"). Modèle `claude-sonnet-4-6` (plus précis sur formulaires denses). SYSTEM_PROMPT enrichi avec 10 conventions L-Agence (signatures GAUCHE candidat / DROITE consultant, format `jj.mm.aaaa`, NPA/AVS/CCT, Oui/Non en 2 checkboxes, `recipientOrder=1` candidat vs `2` consultant, autoFill firstname/lastname/email, CHF only, Nom+Prénom toujours séparés JAMAIS fullname). `Promise.allSettled` sur N docs en parallèle (5 docs : 125s→35s, évite timeout Vercel 120s). `placeholderToUuid` local à chaque doc (évite collision).

**64. SIGN — Auto-save invisible 3 règles d'or** (v2.7.4) — Pour qu'un auto-save debounced ne "clignote" pas : (1) **pas de re-render observable** en mode silent (jamais `onSaved={refetch}` qui setLoading(true) parent — le state local après PATCH 200 est déjà cohérent), le refetch reste pour le clic manuel ; (2) **label bouton STABLE** "Enregistrer" en permanence (disabled si !dirty) — ne JAMAIS muter en "Enregistrement…"/"Enregistré ✓" toutes les 800ms ; (3) **flush aux frontières** : switch d'onglet via callback parent, et `flushSave` avec `fetch(..., {keepalive:true})` sur `beforeunload` + `pagehide` + `visibilitychange='hidden'` (survit à la fermeture d'onglet). `stateRef` sync à chaque render permet de lire la dernière valeur sans deps changeantes dans le useEffect.

**65. PORTAIL RAPPORTS — Mode portail vs mode direct** (v2.7.3) — `report_links.use_client_portal boolean DEFAULT false`. Quand `true` au moment signature candidat : (a) email signature → `clients.email` (mail principal entreprise) au lieu du contact saisi sur le lien, (b) lien `/client-portal/{slug}?tab=rapports` (slug permanent) au lieu de `/report/client/{token}` (TTL 7j). `client_token` reste généré defensivement (fallback). Helper `getOrCreateClientPortal(client_id)` auto-crée le portail si absent. **Exige `client_id` lié en DB** (le portail est indexé par client_id, sinon erreur 400).

**66. SÉCURITÉ — requireSecretariatAccess() sur /api/secretariat/*** (v2.7.5) — Helper dans `lib/auth-guard.ts` qui complète `requireAuth()` : 403 si l'utilisateur n'a pas le rôle `Secrétaire`, `Admin` ou `Administrateur` (ou email == ADMIN_EMAIL). Appliqué aux 19 routes `/api/secretariat/**/route.ts`. La Sidebar cachait déjà l'onglet pour les consultants — ce helper bloque aussi l'appel API direct (Sébastien ne peut plus forger un POST). Convention alignée sur `components/layout/Sidebar.tsx` (`isAdminUser` + `isSecretaire`).

**67. SÉCURITÉ — Whitelist anti-SSRF sur routes proxy CV** (v2.7.5) — Toute route serveur qui fait `fetch(searchParams.get('url'))` doit (a) `requireAuth()` et (b) whitelister le host : `new URL(url).hostname === new URL(NEXT_PUBLIC_SUPABASE_URL).hostname`. Sans ça, n'importe qui pouvait faire `?url=http://169.254.169.254/...` (AWS IMDS) ou cibler des services internes. Appliqué à `/api/cv/print`, `/api/cv/rotate`, `/api/cv/docx-images`.

**68. SÉCURITÉ — CRON_SECRET strict (route bloquée si absent)** (v2.7.5) — L'ancien pattern `if (cronSecret && authHeader !== ...)` laissait la route ouverte si `CRON_SECRET` jamais défini (typo env, oubli sur preview). Le nouveau pattern : `if (!cronSecret || authHeader !== ...) return 401`. Appliqué aux 8 crons de production. Vercel injecte `CRON_SECRET` automatiquement quand configuré dans les env vars du projet.

**69. SÉCURITÉ — Webhook WhatsApp signature Meta** (v2.7.5) — POST `/api/whatsapp/webhook` lit le `rawBody` AVANT JSON.parse pour calculer `HMAC-SHA256(rawBody, WHATSAPP_APP_SECRET)` et comparer à `x-hub-signature-256` via `timingSafeEqual`. Mode dégradé non-bloquant si `WHATSAPP_APP_SECRET` absent (log warning + accept). Une fois la variable configurée côté Meta + Vercel, le webhook devient infalsifiable.

**70. SIGN — Stamp papier à en-tête L-Agence 2 versions Storage** (v2.8.4) — Upload PDF brut avec `letterhead=lagence` → `/api/sign/upload` stocke 2 versions : `path_original` (PDF brut) + `path_stamped` (avec logo carré + footer noir stampés page 1 via `stampLAgenceLetterhead()`). Réponse : `{ path: path_stamped || path_original, path_original, path_stamped, letterhead }`. `SignDocument` track les 2 paths : toggle UI dans `DocumentUploader` swap `storage_path` entre original ↔ stamped **localement sans nouvel appel serveur**. Mode `contractMode` visible UNIQUEMENT si template `template_category='contrat'`. **NE PAS** confondre le logo carré `/branding/l-agence-logo-noir.png` (stamp PDF, imite le papier imprimé) avec le logo officiel `/logo-agence-officiel-noir.png` (200×42 PNG transparent, emails web). Les 2 ont des usages distincts.

**71. SIGN — recipientOrder mixte 0/1-based** (v2.8.4) — Pendant longtemps deux conventions cohabitaient : éditeur TF Sign crée des rôles `order: 0, 1, 2...` (0-based), parser DocuSign import génère `field.recipientOrder: 1, 2, 3...` (1-based). Bug critique : `f.recipientOrder || 1` traitait 0 comme falsy → tous les fields recipientOrder=0 se voyaient + se signaient avec le 1er destinataire forcé curOrder=1. **Règle absolue maintenant** : (1) Toujours `f.recipientOrder ?? 1` (préserve 0). (2) `verify-token` : `currentRecipientOrder = recipient.order ?? (idx + 1)` (respect order réel). (3) Filtres dérivation rôles : `s.order >= 0` (pas `> 0`). (4) Création de rôles dans TemplateEditor : nextOrder peut commencer à 0 ou 1, l'important est la cohérence interne. Pour tout nouveau code qui touche recipientOrder, jamais `||`, toujours `??`.

**72. SIGN — Templates ad-hoc `parent_template_id`** (v2.8.4) — Chaque POST `/api/sign/envelopes` avec docs override clone le template parent en un template ad-hoc (container technique pour stocker les fields override + docs upload du jour). Ces ad-hoc doivent être INVISIBLES dans la liste UI mais ACCESSIBLES par ID pour le lookup brouillon. Solution : nouvelle colonne `sign_templates.parent_template_id UUID REFERENCES sign_templates(id) ON DELETE SET NULL`. Route GET `/api/sign/templates` renvoie TOUT (ad-hoc inclus). Filtrage côté front uniquement : dropdown `/sign/new` + liste `/sign/templates` filtrent `!parent_template_id`. **NE PAS** filtrer côté serveur (casse le lookup `templates.find(t => t.id === templateId)` quand un brouillon pointe vers un ad-hoc). Backfill rétro des templates `[Envoi] %` existants : `UPDATE sign_templates SET parent_template_id = (SELECT id FROM sign_templates parent WHERE parent.name = REPLACE(sign_templates.name, '[Envoi] ', ''))`. Aussi : à chaque PATCH `/api/sign/envelopes/[id]` avec `body.recipients`, propager les nouveaux roleName vers `recipients_schema` du template ad-hoc lié pour sync bidirectionnelle.

**73. SIGN — Signature consultant pré-enregistrée (auto-apposition)** (v2.8.5) — Stockage dans `auth.users.raw_user_meta_data.preset_signature_data_url` (data URL PNG base64, max 500KB). Endpoint dédié `/api/auth/preset-signature` (GET/POST/DELETE). À l'envoi `/api/sign/envelopes/[id]/send` : (1) check user.user_metadata.preset_signature_data_url, (2) cherche dans recipients un signer avec email === user.email ET status !== 'signed', (3) génère un token pour ce destinataire, (4) update token avec `signature_data_url=preset, signature_method='drawn', signed_at=now()`, (5) mark recipient.status='signed', (6) audit log avec `metadata.signed_via='preset_signature'` (preuve ZertES). Le `recipientsToSendNow` filtre maintenant aussi `r.status !== 'signed'` → le candidat reçoit son email direct sans attendre. Si secrétaire crée envoi (pas dans destinataires) → flow normal sans preset. Toast spécifique côté UI : "Ta signature a été apposée automatiquement".

**74. SIGN — Page Merci instantanée après finalize** (v2.8.5) — Avant : `setCompleted(true)` mais on restait sur le viewer avec juste un bandeau vert ; user devait hard-refresh pour voir l'état "déjà signé" ; potentiels bugs de modal qui se rouvre sur viewer en arrière-plan. Maintenant : `if (completed) return <CenteredCard>...` AVANT le layout principal. Logo L-Agence + check vert + "Merci pour votre signature !" + "Vous pouvez fermer cette fenêtre en toute sécurité". Style cohérent avec écran "Document déjà signé". Universel pour tous types d'envois (contrat, mappe, autres).

**75. SIGN — Certificat séparé du contrat (PDF standalone)** (v2.8.5) — `generateCertificatePdf()` produit un PDF certificat à 1 seule page. Implémentation : `PDFDocument.create()` puis save (PDF vide 0 page) puis `appendCertificatePage` ajoute la page cert. **PIÈGE** : viewers macOS Aperçu interprètent le PDF vide comme ayant une page blanche implicite → résultat 2 pages. Fix : après `appendCertificatePage`, re-load et `removePage(0..n-2)` jusqu'à ne garder que la dernière (= vraie page cert). Distribution : `signed_pdf_paths = [contrat.pdf, Certificat de signature - contrat.pdf]`. Le certificat est **EXCLU des emails completed** (filter `!d.name.startsWith('Certificat de signature')` dans `attachments`) → reste accessible UNIQUEMENT via la page détail `/sign/[envelopeId]` pour le créateur / admin L-Agence.

**76. SIGN — recipientOrder 0-based dans PDF generator** (v2.8.5) — `pdf-generator.ts` ligne 156 forçait `recipientOrder = recIdx + 1` (1-based depuis l'index). Mais les fields de l'éditeur TF Sign sont en 0-based → le consultant rec[0] cherchait `f.recipientOrder === 1`, ne matchait aucun field, **la signature consultant n'était JAMAIS stampée sur le PDF final**. Fix : `typeof rec.order === 'number' ? rec.order : (recIdx + 1)` + `(f.recipientOrder ?? 1) === recipientOrder`. Cohérent avec pattern #71 (toujours `??`, jamais `||`).

**77. SIGN — Garde-fous anti-écrasement DB client+serveur** (v2.8.11, incident 17/05 14:56) — Race condition probable HMR/auto-save : pendant le rechargement à chaud Next.js, le state local `docs` peut être remonté à `[]` (valeur initiale `useState`) AVANT que le fetch parent ne le repeuple, et si `setDirty(true)` se déclenche dans cet intervalle, l'auto-save 800ms tire `PATCH documents:[]` qui wipe la DB. Double garde-fou :
- **Client** (`TemplateEditor.handleSave`) : `initialLoadCountsRef = useRef<{docs,recipients,steps}|null>(null)` capturé au premier render avec data non-vide. AVANT chaque PATCH (silent OU manuel) : si `init && (init.docs>0 && docs.length===0)` (idem recipients/steps) → REFUSE le PATCH + toast rouge `Auto-save annulée (écrasement détecté)`.
- **Serveur** (`/api/sign/templates/[id]` PATCH) : si payload contient `documents=[]` OU `wizard_steps=[]` OU `recipients_schema=[]` → SELECT existing AVANT update, compare counts. Si DB en contient → **409 Conflict** avec `{conflicts:string[], existingCounts:Record<string,number>}`. Override **uniquement** via `?confirm_wipe=1` (action explicite).

Pattern général à appliquer à tout endpoint PATCH qui gère des arrays JSONB côté serveur : ne JAMAIS accepter silencieusement un remplacement complet par `[]` sans confirm. Coût : 1 SELECT supplémentaire par PATCH avec wipe potentiel (rare, donc négligeable).

**78. SIGN — Règle incohérence checkboxes groupées : required individuel ignoré** (v2.8.11) — Quand une checkbox a `groupId` + `groupRule`, son flag `required` individuel devient logiquement absurde : un groupe `SelectExactly 1` (typique Oui/Non) avec les deux cases `required:true` est **impossible à satisfaire** (« Oui doit être coché ET Non doit être coché » sont contradictoires). La règle du groupe (`SelectExactly`/`SelectAtLeast`/`SelectAtMost`) est seule source de vérité. Appliqué à 5 endroits :
1. `SignWizard.validateCurrentStep` : skip `if (f.type === 'checkbox' && f.groupId && f.groupRule) continue` avant le check required
2. `PublicFieldsLayer.areAllRequiredFieldsFilled` : même skip dans le filter `requiredFields`
3. `TemplateEditor.groupCheckboxes` : auto-set `required: false` à la création
4. `WizardEditor.SectionHeader` toggle « Tout obligatoire » : exclut groupées via `.filter(m => !(m.type === 'checkbox' && m.groupId && m.groupRule))`. Toast informatif `N cases groupées ignorées — règle du groupe prévaut`.
5. Calcul `allRequired` pour cocher visuellement le toggle : itère uniquement sur non-groupées (sinon resterait jamais coché à 100%).

One-shot DB pour template existant : `UPDATE documents` JSONB pour passer `required:false` sur toute checkbox avec `groupId+groupRule+required=true` (12 cases sur template `cb083ae0` héritées de l'import DocuSign).

---

## Points d'attention techniques

- **Tables sensibles RLS** : `app_settings`, `email_otps`, `onedrive_fichiers`, `secretariat_*`, `logs_secretariat`, `candidat_documents`, `client_portals`, `report_link_clients`, `report_submissions`, `sign_envelopes`, `sign_tokens` — toujours utiliser `createServiceRoleClient`, jamais le client public
- **Vercel bodySizeLimit** : configuré à `100mb` pour les imports ZIP volumineux (`serverActions.bodySizeLimit`)
- **Détection extension CV** : utiliser `cv_nom_fichier` en priorité (plus fiable), l'URL Supabase peut être un UUID sans extension visible
- **Login bypass dev** : `localhost:3001/admin` → magic link sans mot de passe via `supabase.auth.admin.generateLink` — bloqué en production
- **Zefix API** : l'API REST (ZefixREST + ZefixPublicREST) exige des credentials HTTP Basic — utiliser Claude `web_search_20250305` comme source principale pour la recherche d'entreprises suisses
- **ADMIN_EMAIL** : variable d'env obligatoire sur Vercel, pas de fallback hardcodé
- **Types Supabase** : colonnes ajoutées en migration ne sont pas dans `types/database.ts` auto-généré → utiliser `(data as any).colonne` ou régénérer les types
- **Migration onedrive_fichiers v1.9.31** : colonnes `match_suspect_candidat_id`, `match_suspect_score`, `cv_url_temp`, `analyse_json` appliquées via Supabase Studio sans fichier .sql versionné. À formaliser si on retouche `pending_validation`.

---

## Sécurité — dette technique

État au 13/04/2026 : audit complet effectué. ✅ Corrigé v1.6.1→v1.8.32 (SMTP AES-256, RLS 33 tables, Sentry, timer inactivité, requireAuth() 51 routes, fixes import/badges/pipeline, audit DB). ⚠️ Restant : 14 FK sans index, sync-quadrigis Bearer token, dashboard count queries → RPC, 21 `<img>` → `<Image>` Next.js.

→ **Détails complets** : `docs/CLAUDE-history.md`

---

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
