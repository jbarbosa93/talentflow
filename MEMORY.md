# TalentFlow — MEMORY.md
> **3 dernières sessions uniquement.** Au-delà → archiver dans `docs/CLAUDE-history.md`.
> Sessions les plus récentes EN TÊTE.

---

# Session 29/06/2026 — Merge Excel → Administration (secretariat_*)

## Ce qui a été fait
Synchronisation **miroir strict** des 2 Excel secrétaires (Candidat actif + Cas Accident-Maladie) vers les 5 tables `secretariat_*`. TalentFlow devient la source de vérité (fin du travail sur Excel).

- **Stratégie** : remplacement complet par année (DELETE annee + ré-insertion Excel). Idempotent, sans collision de matching. `candidat_id`/`couleur`/`mode_paiement`/`archived_at` préservés via index **nom+prénom** (depuis le backup).
- **Résultat** : candidats 548→**590**, accidents 120→**125**, ALFA 194→**208**, ALFA-payer 91→**93**, loyers **2**. Résidus supprimés : Ceesay Ousman + De Sousa Carvalho A.J.
- **Vérifié** : counts exacts, 0 manquant, 0 résidu, 0 vrai doublon, `candidat_id` 186→221 (préservés/améliorés), spot-checks mapping OK.
- **Scripts** : `scripts/one-shot/secretariat-merge-2026/` (01-backup, 02-merge, 03-restore, 04-verify + README). Backup `~/Desktop/backup_secretariat_20260629_092541.json`.

## Pièges rencontrés (CRITIQUES pour la suite)
- **N°Quad NON unique** : 4 quads = 2 personnes différentes (124204 Branco+Fernandes, 124414 Fahim+Omer, 124596 Lauber+Soeurn, 124869 Garriga+Hoti). → NE JAMAIS matcher/dédupliquer sur le Quad. Identité fiable = **nom+prénom**.
- 1er essai (match-upsert par quad) → doublons + collisions (Branco écrasait Fernandes). Corrigé par **restauration backup** + bascule full-replace + index par nom.
- PostgREST bulk insert exige des clés homogènes (PGRST102) → helper `uniform()`.
- Dates Excel impossibles (31.04.1984, 31.11.2025) → validation calendaire (rejet → vide).

## Anomalies Excel signalées à João (à corriger à la source)
4 quads partagés ; 2 dates impossibles (Corcione DDN, Correia échéance permis) ; doublon ALFA Dascalu Stelian-Mihai ; 13 cellules « Mission terminée » non standard (ACCIDENT/MALADIE) → traitées comme actif.

## Mapping de référence
« Mission terminée » : `x`→terminée, `ARCHIVE`→archive, date→`date_fin_mission`. Docs CV/CM/MAPPE→bool ; Carte ID/AVS/IBAN→statut texte (`ok`). Dates `JJ,MM,AAAA`→ISO. Sinistre/AVS : virgules→points. Accidents : CAS→type_cas, Accident→sous_type, Terminé→statut_cas.

---

# Session 22/06/2026 — v2.13.15 → v2.13.18

## Ce qui a été fait

### v2.13.18 — Modale destinataires + fix contact sans nom
- `ClientPickerModal` (`messages/page.tsx`) : seule modale non portalisée → `createPortal(document.body)` + `maxHeight 90dvh` (pattern #10)
- Contact « sans nom » en mode portail : champ nom affiché aussi quand `useClientPortal=true`

### v2.13.17 — Pack 3 bugs
- **Import CV faux « Réactivé »** : `lib/cv-filename.ts` (nouveau) — `isGenericCvFilename()` gate le pré-check SHA256. Les noms génériques (`CV 2025.pdf`, `cv.pdf`) passent direct au matching IA. Bug latent depuis v1.8.28.
- **Distance clients** : `ClientPickerModal` utilisait Nominatim côté client → rate-limit + échecs. Fix : coords GPS en base (`c.latitude/longitude`). +`ROAD_DETOUR_FACTOR=1.35`. Résultat : ~285 entreprises au lieu de ~17.
- **Rapports portail** : email client pré-rempli depuis `report_link_clients.client_email` le plus récent. Route `GET /api/admin/reports/last-client-email` (nouvelle).

### v2.13.7→16 — Portail app iOS + corrections
- Météo : géoloc une seule fois + cache localStorage (WKWebView ne mémorise pas l'autorisation)
- `<Toaster>` Sonner ajouté à `app/report/layout.tsx`
- Déconnexion : `clearPortalToken()` efface aussi `tf_report_last`
- `100dvh` partout + suppression double `paddingTop` safe-area

## Décisions techniques
- **Pattern coords clients** : toujours utiliser `latitude/longitude` en base en priorité, Nominatim = repli uniquement pour les rares enregistrements sans coords
- **Noms CV génériques** : `isGenericCvFilename()` = moins d'1 token ≥3 lettres hors mots génériques → bypass SHA256 → matching contenu uniquement

## Fichiers clés modifiés
- `app/(dashboard)/messages/page.tsx` (ClientPickerModal)
- `lib/cv-filename.ts` (nouveau)
- `app/(dashboard)/api/cv/parse/route.ts` (gate isGenericCvFilename)
- `app/(dashboard)/api/admin/reports/last-client-email/route.ts` (nouveau)
- `app/sign/rapports/new/page.tsx`
- `app/report/layout.tsx`

---

# Session 22/06/2026 — v2.13.0 → v2.13.6

## Ce qui a été fait

### v2.13.6 — Auth portail par token Bearer JWT (fix définitif WKWebView)
- **Cause racine** : WKWebView (`ch.talentflow.sign`) ne stocke PAS le cookie `httpOnly` → 401 sur toutes les routes auth portail
- **Fix web-only** (pas de rebuild app) : `lib/portal-auth.ts` lit `Authorization: Bearer` en priorité, cookie en fallback
- 11 routes migrées vers double lecture Bearer/cookie
- `login` + `set-password` renvoient le `token` JWT dans le body
- Client : `lib/report/app-auth.ts` — stocke token en localStorage + patch global `fetch` pour ajouter `Authorization: Bearer` sur tous les appels `/api/` same-origin (app UA `TalentFlowSignApp` uniquement)
- `AppAuthInit` monté dans `app/report/layout.tsx`
- Installé sur vrai iPhone par câble (UDID `00008150-000C54210A42401C`, compte dev `4RBJRRF9R6`)
- ⚠️ `server.url` dans `capacitor.config.ts` = mode TEST → à retirer pour build prod

### v2.13.4 — `fetchPortalSession()` helper
- Retente un 401 transitoire ≤3× 350ms avant de rediriger login
- Appliqué à `/report/accueil`, `profil`, `documents`

### v2.13.3 — Cookie `SameSite=None` pour l'app
- `SameSite=None; Secure` si UA `TalentFlowSignApp`, sinon `Lax`
- Résout le cross-site WKWebView (capacitor://localhost → cross-site)
- Insuffisant seul (résolu définitivement par le token Bearer en v2.13.6)

### v2.13.0 — Cockpit Santé système
- Page `/outils/sante` + route `GET /api/admin/system-health` (gating `ADMIN_EMAIL`)
- 4 cartes auto-rafraîchies (60s) : OneDrive/imports, Rapports & signatures, Emails, Crons
- ⚠️ `onedrive-sync` seul traçable en base (pas de table `cron_runs`)

## Décisions techniques
- Auth portail = **deux stratégies coexistantes** : token Bearer (app) + cookie httpOnly (web). Ne pas unifier — les deux doivent marcher indépendamment.
- Le patch global `fetch` ne s'applique qu'aux URLs same-origin commençant par `/api/` — pas de fuite cross-origin

## Fichiers clés modifiés
- `lib/portal-auth.ts`
- `lib/report/app-auth.ts` (nouveau)
- `app/report/layout.tsx` (`AppAuthInit`)
- `components/portal-auth/LoginForm.tsx`
- `components/portal-auth/SetPasswordForm.tsx`
- 11 routes `/api/portal-auth/*` + `/api/portal/*` + `/api/push/*`
- `app/(dashboard)/outils/sante/page.tsx` (nouveau)
- `app/(dashboard)/api/admin/system-health/route.ts` (nouveau)

---

# Session 22/06/2026 — v2.12.0 → v2.12.3

## Ce qui a été fait

### v2.12.3 — Fix sécurité : `/api/rapport-heures` protégé
- `requireAuth()` ajouté (ne touche pas la DB mais incohérent sans garde-fou)

### v2.12.2 — Fix sécurité : `/api/jobroom/post` protégé
- Faille : POST anonyme vers Job-Room avec identifiants SECO de L-Agence
- Fix : `requireAuth()` ajouté. Matrice mise à jour (`docs/API-ROUTES-MATRIX.md`)

### v2.12.1 — Alertes cloche masquables + audit sécurité
- Sections cloche masquables : croix × par ligne + bouton « Vider » par section
- Masquage persisté en **localStorage** `tf_mission_alerts_dismissed_v1` (par navigateur, pas synchro mobile)
- 80 tests Vitest : `lib/__tests__/{candidat-matching,document-classification,merge-candidat}.test.ts`
- Audit routes : `docs/API-ROUTES-MATRIX.md` (242 routes générées)

### v2.12.0 — Missions ETP + Alertes cloche João
- Boutons +14j / +3 mois dans modale Nouvelle mission
- Carte ETP actif : ligne « → Sem. prochaine : X.XX ETP »
- Alertes cloche : `GET /api/missions/alertes` (réservée `ADMIN_EMAIL`) → fins mission + rapports manquants

## Fichiers clés modifiés
- `components/NotificationBell.tsx`
- `app/(dashboard)/api/missions/alertes/route.ts` (nouveau)
- `app/(dashboard)/missions/page.tsx`
- `lib/__tests__/` (nouveaux — Vitest)

---

# Historique condensé sessions précédentes

| Date | Version | Résumé |
|------|---------|--------|
| 10/06 | v2.11.2 | Fix boucle login portail (refus Apple 2.1a) — `SameSite: lax` + nav dure |
| 08/06 | v2.10.45→52 | Publication App Store + fixes portail iOS (safe-area, dark mode, Dynamic Island) |
| 02/06 | v2.9.93→v2.10.17 | Post-go-live + app Capacitor native. Fix email client mode portail (v2.10.14 critique) |
| 29/05 | v2.9.82 | Pointeuse GPS + email destinataire interne + annotation WhatsApp client |
| 29/05 | v2.9.78→81 | Pack 13 bugs UX (notes, modals, historique envois, contact client) |
| 27/05 | v2.9.76→77 | Admin carte ID + fondation mobile `/m/*` + modules Sign détail/new |
| 26/05 | v2.9.47→75 | Marathon Sign : templates rapports, UX enveloppe, 7 bugs majeurs |
| 22/05 | v2.9.35→46 | Sign intro + photo selfie + rapports Phase B |
| 20-21/05 | v2.9.0→34 | Auth portails email+mdp + marathon Sign complet |
| 17/05 | v2.8.11 | INCIDENT wipe template + garde-fous client+serveur (pattern #77) |
| 15/05 | v2.8.4→5 | Signature pré-enregistrée + stamp pipeline + multi-destinataires |
| 12/05 | v2.7.0→5 | Module Compliance Documents + durcissement sécurité 38 fixes |

→ Détails complets : `docs/CLAUDE-history.md`
