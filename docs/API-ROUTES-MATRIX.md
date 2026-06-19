# Matrice des routes API — TalentFlow

> Généré automatiquement par `/tmp/route-matrix.mjs` le 2026-06-19. À régénérer après ajout/suppression de routes.

**Total : 242 routes.**

Le middleware exclut tout `/api/` → chaque route porte SON garde-fou. Deux patterns d'auth coexistent : helper `requireAuth()` et inline `supabase.auth.getUser()` + 401 (les deux détectés).

## Répartition par niveau d'accès

| Niveau | Routes |
|---|---|
| AUTH | 136 |
| ⚠️ PUBLIC ? | 27 |
| SECRÉTARIAT | 19 |
| PUBLIC (slug) | 16 |
| PORTAIL (token) | 16 |
| CRON | 12 |
| ADMIN (João) | 9 |
| PUBLIC (token) | 7 |

**Légende** : AUTH = utilisateur connecté · ADMIN = gating `ADMIN_EMAIL` (João) · SECRÉTARIAT = `requireSecretariatAccess()` · CRON = `CRON_SECRET` · PORTAIL (token) = session token portail · PUBLIC (token/slug) = accès public par token éphémère ou slug permanent (sécurité par non-devinabilité, cf patterns #51/#60) · **⚠️ PUBLIC ?** = aucun garde-fou détecté → **à auditer manuellement**.

## Conclusions du triage manuel (19/06/2026)

Les routes marquées **⚠️ PUBLIC ?** ont été vérifiées à la main : la quasi-totalité est publique par design.

| Route(s) | Verdict |
|---|---|
| `/admin` | ✅ Login bypass dev — **bloqué en prod** |
| `/api/auth/*` (≈11 routes) | ✅ Flux d'auth (login/OTP/mdp) — publiques par nécessité |
| `/api/microsoft/callback` | ✅ Callback OAuth Microsoft |
| `/api/whatsapp/webhook` | ✅ Webhook Meta — **signature HMAC-SHA256 vérifiée** (`WHATSAPP_APP_SECRET`) |
| `/api/sign/{finalize,sign-field,consent,cross-fill,verify-token,attachment-check,attachment-url}` | ✅ Signature publique TF Sign — **token validé** (`verifyToken`, dans le body) |
| `/api/geo`, `/api/geocode/reverse` | ✅ Géocodage read-only (pointeuse portail public), input validé, aucune écriture |
| `/api/metiers`, `/api/metier-categories` | ✅ Listes de référence non sensibles |
| `/api/avam/search` | ✅ Recherche offres externes (veille publique) |
| `/api/demande-acces` | ✅ Formulaire de demande d'accès (public par design) |
| `/api/rapport-heures` | ⚠️ Générateur PDF — à confirmer (pas de signal d'auth détecté) |
| ~~`/api/jobroom/post`~~ | ✅ **CORRIGÉ v2.12.2** — `requireAuth()` ajouté (était : POST anonyme Job-Room avec creds SECO). |

## ⚠️ À auditer (27) — aucun garde-fou détecté automatiquement

Vérifier que chacune est intentionnellement publique. Routes d'auth/OAuth/webhook = normales.

| Route | Méthodes | Fichier |
|---|---|---|
| `/admin` | GET | `app/admin/route.ts` |
| `/api/auth/auto-reconnect` | GET POST DELETE | `app/api/auth/auto-reconnect/route.ts` |
| `/api/auth/callback` | GET | `app/api/auth/callback/route.ts` |
| `/api/auth/forgot-password` | POST | `app/api/auth/forgot-password/route.ts` |
| `/api/auth/log` | POST | `app/(dashboard)/api/auth/log/route.ts` |
| `/api/auth/logout` | POST | `app/api/auth/logout/route.ts` |
| `/api/auth/otp-grace` | GET POST DELETE | `app/api/auth/otp-grace/route.ts` |
| `/api/auth/password-changed` | POST | `app/api/auth/password-changed/route.ts` |
| `/api/auth/send-otp` | POST PUT | `app/api/auth/send-otp/route.ts` |
| `/api/auth/verify-password` | POST | `app/api/auth/verify-password/route.ts` |
| `/api/auth/welcome` | POST | `app/api/auth/welcome/route.ts` |
| `/api/avam/search` | GET | `app/(dashboard)/api/avam/search/route.ts` |
| `/api/demande-acces` | GET POST | `app/api/demande-acces/route.ts` |
| `/api/geo` | GET | `app/(dashboard)/api/geo/route.ts` |
| `/api/geocode/reverse` | GET | `app/api/geocode/reverse/route.ts` |
| `/api/metier-categories` | GET PUT | `app/(dashboard)/api/metier-categories/route.ts` |
| `/api/metiers` | GET PUT | `app/(dashboard)/api/metiers/route.ts` |
| `/api/microsoft/callback` | GET | `app/(dashboard)/api/microsoft/callback/route.ts` |
| `/api/rapport-heures` | POST | `app/(dashboard)/api/rapport-heures/route.ts` |
| `/api/sign/attachment-check` | POST | `app/api/sign/attachment-check/route.ts` |
| `/api/sign/attachment-url` | POST | `app/api/sign/attachment-url/route.ts` |
| `/api/sign/consent` | POST | `app/api/sign/consent/route.ts` |
| `/api/sign/cross-fill` | POST | `app/api/sign/cross-fill/route.ts` |
| `/api/sign/finalize` | POST | `app/api/sign/finalize/route.ts` |
| `/api/sign/sign-field` | POST | `app/api/sign/sign-field/route.ts` |
| `/api/sign/verify-token` | POST | `app/api/sign/verify-token/route.ts` |
| `/api/whatsapp/webhook` | GET POST | `app/(dashboard)/api/whatsapp/webhook/route.ts` |

## activites (4)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/activites` | GET POST DELETE | AUTH |
| `/api/activites/[id]` | PATCH DELETE | AUTH |
| `/api/activites/check-doublon` | GET | AUTH |
| `/api/activites/counts` | GET | AUTH |

## admin (20)

| Route | Méthodes | Accès |
|---|---|---|
| `/admin` | GET | ⚠️ PUBLIC ? |
| `/api/admin/anomalies-resolve` | GET POST DELETE | AUTH |
| `/api/admin/client-portals` | GET POST | AUTH |
| `/api/admin/client-portals/[id]` | PATCH DELETE | AUTH |
| `/api/admin/detect-anomalies` | GET | ADMIN (João) |
| `/api/admin/portal-accounts` | GET POST | AUTH |
| `/api/admin/portal-accounts/[id]` | PATCH DELETE | AUTH |
| `/api/admin/portal-accounts/[id]/invitation-link` | POST | AUTH |
| `/api/admin/portal-accounts/[id]/resend-invitation` | POST | AUTH |
| `/api/admin/reports` | GET POST | AUTH |
| `/api/admin/reports/[id]` | GET PATCH DELETE | AUTH |
| `/api/admin/reports/[id]/clients` | GET POST | AUTH |
| `/api/admin/reports/[id]/clients/[clientId]` | PATCH DELETE | AUTH |
| `/api/admin/reports/[id]/submissions` | GET | AUTH |
| `/api/admin/reports/submissions/[id]` | DELETE | AUTH |
| `/api/admin/reports/submissions/[id]/admin-correct` | GET POST | AUTH |
| `/api/admin/reports/submissions/[id]/correct-week` | POST | ADMIN (João) |
| `/api/admin/reports/submissions/[id]/request-correction` | POST | AUTH |
| `/api/admin/reports/submissions/recent` | GET | AUTH |
| `/api/admin/users` | GET POST PATCH DELETE | ADMIN (João) |

## annonces (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/annonces/france-travail` | POST | AUTH |

## auth (12)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/auth/auto-reconnect` | GET POST DELETE | ⚠️ PUBLIC ? |
| `/api/auth/callback` | GET | ⚠️ PUBLIC ? |
| `/api/auth/forgot-password` | POST | ⚠️ PUBLIC ? |
| `/api/auth/log` | POST | ⚠️ PUBLIC ? |
| `/api/auth/logout` | POST | ⚠️ PUBLIC ? |
| `/api/auth/otp-grace` | GET POST DELETE | ⚠️ PUBLIC ? |
| `/api/auth/password-changed` | POST | ⚠️ PUBLIC ? |
| `/api/auth/preset-signature` | GET POST DELETE | AUTH |
| `/api/auth/send-otp` | POST PUT | ⚠️ PUBLIC ? |
| `/api/auth/update-password` | POST | AUTH |
| `/api/auth/verify-password` | POST | ⚠️ PUBLIC ? |
| `/api/auth/welcome` | POST | ⚠️ PUBLIC ? |

## avam (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/avam/search` | GET | ⚠️ PUBLIC ? |

## bug-report (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/bug-report` | POST | AUTH |

## candidats (24)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/candidats` | GET DELETE | AUTH |
| `/api/candidats/[id]` | GET PATCH DELETE | AUTH |
| `/api/candidats/[id]/clear-onedrive-badge` | POST | AUTH |
| `/api/candidats/[id]/documents` | GET POST | AUTH |
| `/api/candidats/[id]/documents/[docId]` | PATCH DELETE | AUTH |
| `/api/candidats/[id]/documents/[docId]/file` | GET | AUTH |
| `/api/candidats/[id]/documents/batch` | POST | AUTH |
| `/api/candidats/[id]/driver-override` | PATCH | AUTH |
| `/api/candidats/[id]/notes-partagees` | GET POST DELETE | ADMIN (João) |
| `/api/candidats/audit` | GET | AUTH |
| `/api/candidats/audit/deep` | POST | AUTH |
| `/api/candidats/audit/fix` | POST | AUTH |
| `/api/candidats/audit/fix-candidat` | POST | AUTH |
| `/api/candidats/count-new` | GET | AUTH |
| `/api/candidats/doublons` | POST | AUTH |
| `/api/candidats/doublons/deterministic` | GET | AUTH |
| `/api/candidats/doublons/history` | GET POST DELETE | AUTH |
| `/api/candidats/doublons/similar` | GET | AUTH |
| `/api/candidats/mark-all-vu` | POST | AUTH |
| `/api/candidats/recheck-approve` | POST | AUTH |
| `/api/candidats/recheck-batch` | POST | AUTH |
| `/api/candidats/recheck-init` | POST | AUTH |
| `/api/candidats/search-ia` | POST | AUTH |
| `/api/candidats/vus` | GET POST PATCH DELETE | AUTH |

## client-portal (6)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/client-portal/[slug]` | GET | PORTAIL (token) |
| `/api/client-portal/[slug]/candidats/[candidatId]/notes` | GET POST | PUBLIC (slug) |
| `/api/client-portal/[slug]/document` | GET | PUBLIC (slug) |
| `/api/client-portal/[slug]/rapports` | GET | PUBLIC (slug) |
| `/api/client-portal/[slug]/rapports/[id]/document` | GET | PUBLIC (slug) |
| `/api/client-portal/[slug]/rapports/[id]/refresh-token` | POST | PUBLIC (slug) |

## clients (9)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/clients` | GET POST | AUTH |
| `/api/clients/[id]` | GET PATCH DELETE | AUTH |
| `/api/clients/[id]/add-contact` | POST | AUTH |
| `/api/clients/match-email` | GET | AUTH |
| `/api/clients/prospection/generate` | POST | AUTH |
| `/api/clients/search-ia` | POST | AUTH |
| `/api/clients/secteurs-stats` | GET | AUTH |
| `/api/clients/zefix/search` | POST | AUTH |
| `/api/clients/zefix/verify` | POST | AUTH |

## commandes (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/commandes/analyse-cdc` | POST | AUTH |

## cron (10)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/cron/auto-arret-reports` | GET | CRON |
| `/api/cron/check-sha256-integrity` | GET | CRON |
| `/api/cron/cleanup-old-data` | GET | CRON |
| `/api/cron/document-alerts` | GET | CRON |
| `/api/cron/extract-cv-text` | GET | CRON |
| `/api/cron/extract-cv-text/status` | GET | CRON |
| `/api/cron/offres-sync` | GET | CRON |
| `/api/cron/onedrive-sync` | GET | CRON |
| `/api/cron/paiement-rappel-heures` | GET | CRON |
| `/api/cron/sign-reminders` | GET | CRON |

## cv (9)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/cv/docx-images` | GET | AUTH |
| `/api/cv/extract-photos` | GET POST | AUTH |
| `/api/cv/generate` | GET POST | AUTH |
| `/api/cv/parse` | GET POST | AUTH |
| `/api/cv/parse/cancel` | POST | AUTH |
| `/api/cv/parse/confirm-match` | POST | AUTH |
| `/api/cv/presign` | GET | AUTH |
| `/api/cv/print` | GET | AUTH |
| `/api/cv/rotate` | GET | AUTH |

## cv-customizations (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/cv-customizations` | GET PUT DELETE | AUTH |

## demande-acces (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/demande-acces` | GET POST | ⚠️ PUBLIC ? |
| `/api/demande-acces/[id]` | PATCH DELETE | AUTH |

## document-alerts (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/document-alerts` | GET | AUTH |

## document-types (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/document-types` | GET | AUTH |

## email-templates (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/email-templates` | GET POST PATCH DELETE | AUTH |

## emails (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/emails/history` | GET DELETE | AUTH |
| `/api/emails/suggest` | GET | AUTH |

## entretiens (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/entretiens` | GET POST PATCH DELETE | AUTH |
| `/api/entretiens/rappels` | GET PATCH | AUTH |

## feedback (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/feedback/feature-request` | POST | AUTH |

## geo (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/geo` | GET | ⚠️ PUBLIC ? |

## geocode (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/geocode/reverse` | GET | ⚠️ PUBLIC ? |

## integrations (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/integrations` | GET PATCH DELETE | ADMIN (João) |
| `/api/integrations/status` | GET | AUTH |

## jobroom (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/jobroom/post` | POST | AUTH |

## logs (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/logs` | GET | AUTH |

## matching (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/matching` | POST | AUTH |
| `/api/matching/preselect` | POST | AUTH |

## messages (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/messages/log` | POST | AUTH |
| `/api/messages/recent-contacts` | GET | AUTH |

## metier-categories (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/metier-categories` | GET PUT | ⚠️ PUBLIC ? |

## metiers (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/metiers` | GET PUT | ⚠️ PUBLIC ? |

## microsoft (5)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/microsoft/auth` | GET | AUTH |
| `/api/microsoft/callback` | GET | ⚠️ PUBLIC ? |
| `/api/microsoft/email-disconnect` | DELETE | AUTH |
| `/api/microsoft/email-status` | GET | AUTH |
| `/api/microsoft/send` | POST | AUTH |

## missions (4)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/missions` | GET POST | AUTH |
| `/api/missions/[id]` | PATCH DELETE | AUTH |
| `/api/missions/alertes` | GET | ADMIN (João) |
| `/api/missions/import-notion` | POST | AUTH |

## notes (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/notes` | POST | AUTH |
| `/api/notes/[id]` | PATCH DELETE | AUTH |

## offres (4)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/offres/externes` | GET | AUTH |
| `/api/offres/externes/count` | GET | AUTH |
| `/api/offres/externes/statut` | PATCH | AUTH |
| `/api/offres/sync` | POST | CRON |

## offres-candidats (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/offres-candidats` | GET POST PATCH DELETE | AUTH |

## onedrive (4)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/onedrive/folders` | GET POST | AUTH |
| `/api/onedrive/pending-validation` | GET POST | AUTH |
| `/api/onedrive/sync` | GET POST DELETE | CRON |
| `/api/onedrive/sync-test` | GET POST | ADMIN (João) |

## outils (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/outils/extract-cv-text` | POST | AUTH |

## pipeline (3)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/pipeline/clear` | POST | AUTH |
| `/api/pipeline/rappels` | GET POST PATCH DELETE | AUTH |
| `/api/pipeline/stages` | POST | AUTH |

## portal (5)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/portal/change-email/confirm` | POST | PORTAIL (token) |
| `/api/portal/change-email/request` | POST | PORTAIL (token) |
| `/api/portal/documents` | GET POST | PORTAIL (token) |
| `/api/portal/documents/[docId]/file` | GET | PORTAIL (token) |
| `/api/portal/profile` | GET | PORTAIL (token) |

## portal-auth (7)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/portal-auth/change-password` | POST | PORTAIL (token) |
| `/api/portal-auth/forgot-password` | POST | PORTAIL (token) |
| `/api/portal-auth/login` | POST | PORTAIL (token) |
| `/api/portal-auth/logout` | POST | PORTAIL (token) |
| `/api/portal-auth/me` | GET | PORTAIL (token) |
| `/api/portal-auth/set-password` | POST | PORTAIL (token) |
| `/api/portal-auth/token-info` | GET | PORTAIL (token) |

## push (7)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/push/images` | GET DELETE | AUTH |
| `/api/push/inapp` | GET POST | PORTAIL (token) |
| `/api/push/recipients` | GET | AUTH |
| `/api/push/register` | POST | PORTAIL (token) |
| `/api/push/send` | POST | AUTH |
| `/api/push/test` | POST | AUTH |
| `/api/push/upload-image` | POST | AUTH |

## rapport-heures (3)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/rapport-heures` | POST | ⚠️ PUBLIC ? |
| `/api/rapport-heures/send-email` | POST | AUTH |
| `/api/rapport-heures/send-whatsapp` | POST | AUTH |

## reports (17)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/reports/[slug]` | GET | PORTAIL (token) |
| `/api/reports/[slug]/clients` | GET | PUBLIC (slug) |
| `/api/reports/[slug]/declared-days` | GET | PUBLIC (slug) |
| `/api/reports/[slug]/document` | GET | PUBLIC (slug) |
| `/api/reports/[slug]/recap` | GET | PUBLIC (slug) |
| `/api/reports/[slug]/recap/pdf` | GET | PUBLIC (slug) |
| `/api/reports/[slug]/save-draft` | GET POST | PUBLIC (slug) |
| `/api/reports/[slug]/submissions/[id]` | DELETE | PUBLIC (slug) |
| `/api/reports/[slug]/submissions/[id]/certificate` | GET | PUBLIC (slug) |
| `/api/reports/[slug]/submissions/[id]/download` | GET | PUBLIC (slug) |
| `/api/reports/[slug]/submissions/[id]/resend` | POST | PUBLIC (slug) |
| `/api/reports/[slug]/submit` | POST | PUBLIC (slug) |
| `/api/reports/client/[token]` | GET | PUBLIC (token) |
| `/api/reports/client/[token]/document` | GET | PUBLIC (token) |
| `/api/reports/client/[token]/download` | GET | PUBLIC (token) |
| `/api/reports/client/[token]/sign` | POST | PUBLIC (token) |
| `/api/reports/client/[token]/update-fields` | PATCH | PUBLIC (token) |

## secretariat (19)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/secretariat/accidents` | GET POST | SECRÉTARIAT |
| `/api/secretariat/accidents/[id]` | PATCH DELETE | SECRÉTARIAT |
| `/api/secretariat/alfa` | GET POST | SECRÉTARIAT |
| `/api/secretariat/alfa-paiements` | GET POST | SECRÉTARIAT |
| `/api/secretariat/alfa-paiements/[id]` | PATCH DELETE | SECRÉTARIAT |
| `/api/secretariat/alfa/[id]` | PATCH DELETE | SECRÉTARIAT |
| `/api/secretariat/candidats` | GET POST | SECRÉTARIAT |
| `/api/secretariat/candidats/[id]` | PATCH DELETE | SECRÉTARIAT |
| `/api/secretariat/dashboard-stats` | GET | SECRÉTARIAT |
| `/api/secretariat/import` | POST | SECRÉTARIAT |
| `/api/secretariat/logs` | GET | SECRÉTARIAT |
| `/api/secretariat/loyers` | GET POST | SECRÉTARIAT |
| `/api/secretariat/loyers/[id]` | PATCH DELETE | SECRÉTARIAT |
| `/api/secretariat/notifications` | GET POST | SECRÉTARIAT |
| `/api/secretariat/notifications/[id]/cest-fait` | PATCH | SECRÉTARIAT |
| `/api/secretariat/notifications/[id]/lu` | PATCH | SECRÉTARIAT |
| `/api/secretariat/notifications/assurance-actives` | GET | SECRÉTARIAT |
| `/api/secretariat/notifications/fin-alfa-actives` | GET | SECRÉTARIAT |
| `/api/secretariat/notifications/mark-all-read` | POST | SECRÉTARIAT |

## secteurs-activite (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/secteurs-activite` | GET POST | ADMIN (João) |
| `/api/secteurs-activite/[id]` | PATCH DELETE | ADMIN (João) |

## sign (31)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/sign/attachment-check` | POST | ⚠️ PUBLIC ? |
| `/api/sign/attachment-url` | POST | ⚠️ PUBLIC ? |
| `/api/sign/consent` | POST | ⚠️ PUBLIC ? |
| `/api/sign/cross-fill` | POST | ⚠️ PUBLIC ? |
| `/api/sign/document/[token]` | GET | PUBLIC (token) |
| `/api/sign/download/[envelopeId]` | GET | AUTH |
| `/api/sign/download/public/[token]` | GET | PUBLIC (token) |
| `/api/sign/envelopes` | GET POST | AUTH |
| `/api/sign/envelopes/[id]` | GET PATCH DELETE | AUTH |
| `/api/sign/envelopes/[id]/audit` | GET | AUTH |
| `/api/sign/envelopes/[id]/cancel` | POST | AUTH |
| `/api/sign/envelopes/[id]/regenerate-cert` | POST | AUTH |
| `/api/sign/envelopes/[id]/relaunch` | POST | AUTH |
| `/api/sign/envelopes/[id]/send` | POST | AUTH |
| `/api/sign/envelopes/[id]/tokens` | GET | AUTH |
| `/api/sign/envelopes/[id]/uploads` | GET | AUTH |
| `/api/sign/envelopes/bulk-download` | POST | AUTH |
| `/api/sign/envelopes/counts` | GET | AUTH |
| `/api/sign/finalize` | POST | ⚠️ PUBLIC ? |
| `/api/sign/sign-field` | POST | ⚠️ PUBLIC ? |
| `/api/sign/template-doc` | GET | AUTH |
| `/api/sign/templates` | GET POST | AUTH |
| `/api/sign/templates/[id]` | GET PATCH DELETE | AUTH |
| `/api/sign/templates/[id]/enrich-with-ai` | POST | AUTH |
| `/api/sign/templates/[id]/file` | GET | AUTH |
| `/api/sign/templates/[id]/help-upload` | POST | AUTH |
| `/api/sign/templates/[id]/preview` | POST | AUTH |
| `/api/sign/templates/import` | POST | AUTH |
| `/api/sign/upload` | POST | AUTH |
| `/api/sign/upload-url` | POST | AUTH |
| `/api/sign/verify-token` | POST | ⚠️ PUBLIC ? |

## smtp (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/smtp/send` | POST | AUTH |
| `/api/smtp/settings` | GET POST DELETE | AUTH |

## templates (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/templates/contexte-ia` | POST | AUTH |

## villes (1)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/villes/suggestions` | GET | AUTH |

## whatsapp (2)

| Route | Méthodes | Accès |
|---|---|---|
| `/api/whatsapp/send` | GET POST | AUTH |
| `/api/whatsapp/webhook` | GET POST | ⚠️ PUBLIC ? |

