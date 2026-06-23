# TalentFlow — CONTEXT.md
> **Lire en PREMIER à chaque session. 1 page max. Ne pas allonger.**

---

## État prod

| Clé | Valeur |
|-----|--------|
| Version | **v2.13.18** |
| URL | talent-flow.ch |
| Supabase | rdpbqnhwhjkngxxitupg (eu-west-1 Frankfurt) |
| Vercel | Pro — région dub1 |
| Dev local | port 3001 — `next dev --port 3001 --webpack` (Turbopack désactivé) |
| **Dernière sync** | **2026-06-23** |

---

## Dernière session (22/06/2026 — v2.13.18)

- Fix modale destinataires portalisée (`createPortal` → pattern #10)
- Fix contact « sans nom » en mode portail rapports
- Fix import CV faux « Réactivé » par nom de fichier générique (`lib/cv-filename.ts`)
- Fix distance clients — coords GPS en base au lieu de Nominatim côté client
- Fix email client pré-rempli avec le dernier email utilisé

---

## App iOS (repo séparé `~/Dev/talentflow-sign-app`)

- Build 1.0(4) soumis App Store — **« En attente de vérification »**
- Auth par **token Bearer JWT** (pas cookie — WKWebView ne stocke pas les cookies httpOnly)
- `server.url` retiré de `capacitor.config.ts` pour le build prod
- 100% collaborateur (portail candidat `/report`) — côté client = web uniquement

---

## TODO actif

- [ ] _(João : ajoute ici la prochaine tâche avant de démarrer la session)_

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
