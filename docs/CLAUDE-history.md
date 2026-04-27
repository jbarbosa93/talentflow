# TalentFlow — Historique audits & dette technique

Ce fichier conserve les audits sécurité et dette technique passés. L'historique versionné des sessions de travail (v1.5 → v1.9.106) est dans `~/.claude/projects/-Users-joaobarbosa-Dev-talentflow/memory/MEMORY.md` (auto-memory, indexé par session).

---

## Sécurité — dette technique (audit complet 13/04/2026)

✅ **Corrigé (v1.6.1→v1.8.30)** :
- SMTP password chiffré AES-256-GCM (`lib/smtp-crypto.ts`) — rétrocompatible
- `pipeline_rappels` UPDATE filtré par `user_id`
- RLS activé sur les 33 tables de la DB
- Sentry monitoring actif
- Timer inactivité 2h, persisté en localStorage + auto-logout sans OTP
- `pipeline_consultant` obligatoire à l'ajout pipeline (erreur 400 sinon)
- Fix CV rétrogradation : `importedIsOlder` check avant écrasement cv_url
- `candidats_vus` delete après update → badge rouge réapparaît
- Import CV : dédup complète (normFn), `has_update` remplace `import_status` mutation, badges fiables
- Nom CV principal : strip `[Ancien]`/`[Archive]` préfixes à la promotion
- Pipeline : DEFAULT 'nouveau' supprimé sur `statut_pipeline` + 21 fantômes nettoyés (v1.8.31)
- Audit DB v1.8.32 : index dupliqué `idx_candidats_created` supprimé, policy `recruteurs_candidats` supprimée, `auth.uid()` → `(select auth.uid())` sur 8 policies (plannings/candidats_vus/pipeline_rappels), `search_path = public` sur 7 fonctions, tables fantômes `candidates`/`jobs` supprimées, 3 index FK ajoutés, vues SECURITY INVOKER, `.limit(100)` sur demandes_acces

⚠️ **Restant — à traiter (par priorité)** :
- **DB** : 14 FK restantes sans index (3 ajoutées en v1.8.32)
- `sync-quadrigis` : appelé par Cowork (externe) → implémenter API key Bearer token
- Dashboard : 5 count queries séparées (optimiser avec RPC agrégée)
- 21 instances `<img>` au lieu de `<Image>` Next.js (performance)
