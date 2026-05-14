I have enough context now to write a comprehensive audit. I've read all 6 main files plus the parent page, lib helpers, and the WizardPreview. Let me deliver the report.

---

# Audit complet — Module Sign (TalentFlow)

**Cible** : João Barbosa, non-développeur. Module de signature électronique destiné à remplacer DocuSign payant.
**Scope** : Mode Document (Konva) + Mode Wizard + parser DocuSign + preview iPhone.
**Date** : 14/05/2026, v2.7.6 en cours.
**Méthode** : lecture intégrale des 6 fichiers (≈ 11 500 lignes), des helpers `lib/sign/*` et de la page parente.

---

## Section 1 — Audit fichier par fichier

### 1.1 `lib/sign/types.ts` (488 lignes) — Référence canonique

**Rôle** : source de vérité TypeScript. Définit `SignField`, `SignFieldType`, `SignFieldCondition`, `RECIPIENT_COLORS`, `SIGNATURE_CONSTRAINTS`, `FIELD_TYPE_LABELS`, `FIELD_TYPE_CATEGORIES`. Tout le module en dépend.

**Architecture**
- Coordonnées **normalisées 0-1**, origine **top-left** (cf. `types.ts:55-58`). Cohérent avec Konva (et incohérent avec PDF natif qui est bottom-left — la conversion est dans `pdf-stamp.ts`).
- `SignField` cumule 35+ champs optionnels — un super-type qui couvre **tous** les types (signature/text/checkbox/select/formula/attachment/date/number/email/...). Pas de polymorphisme. Conséquence : tous les rendus doivent faire `if (field.type === 'X')` partout.
- `metadata: Record<string, unknown>` (`types.ts:154`) est utilisé comme fourre-tout : `tabType` (legacy DocuSign), `listItems`, `tabGroupLabels`, `selected`, `hidden`, `consultantCanFill` (`WizardEditor.tsx:1590`), `numericalValue`. Pas typé fortement → casts partout.

**Lenteur / bugs potentiels**
- `RECIPIENT_COLORS` est un tableau de 5 entrées (`types.ts:434`). Au-delà de 5 destinataires → cycle (`order % 5`). Pour un template à 6+ destinataires (rare mais possible), Candidat (1) et 6e signataire auraient la même couleur. Aucun garde-fou UI.
- `RGB literals` dans `RECIPIENT_COLORS` : commentaire explique « Konva ne résout pas `var(--*)` » — vrai, mais ça empêche le dark mode d'avoir des couleurs adaptées dans le canvas Konva (le panneau de droite, lui, n'a pas ce problème → dissonance visuelle).

**Complexité UX (pour un non-dev qui lit cette source en cas de bug)**
- Le commentaire ligne 192-202 sur `SIGNATURE_CONSTRAINTS` (ratio 3:1 signature, 1:1 initial) est exemplaire. Mais le reste du fichier mélange v2.2.0 / v2.2.4 / v2.7.6 sans toujours expliquer pourquoi un champ a été ajouté. Ex: `autoFillLocked` (`types.ts:111-114`) bien documenté ; `consultantCanFill` (utilisé dans `WizardEditor.tsx:1590`) n'apparaît PAS dans le type → c'est dans `metadata.consultantCanFill`. Incohérence : pourquoi `autoFillLocked` est first-class et pas `consultantCanFill` ?

---

### 1.2 `lib/sign/docusign-import.ts` (516 lignes) — Parser

**Rôle** : convertit un JSON DocuSign en `ParsedDocusign` (recipients_schema + documents avec coords pts), puis `normalizeFields()` convertit en `SignField[]` normalisé 0-1.

**Architecture**
- Pur, testable, sans I/O. ✅ Bien.
- 16 types DocuSign mappés (`docusign-import.ts:332-354`). Couverture honnête.
- Bug historique commenté en clair (`docusign-import.ts:313-320`) : la clé de mapping était `order` au lieu de `documentId` → tabs attribués au mauvais doc. Excellente trace de raisonnement.
- Flip Y faussement ajouté puis retiré en v2.2.0-Phase2 (`docusign-import.ts:434-441`). Encore une fois excellente documentation post-mortem.

**Lenteur potentielle** : aucune. C'est du parsing pur sur un JSON, généralement <500 KB.

**Bugs visuels possibles** : si DocuSign exporte des tabs avec width/height=0 (auto-size côté DS), on applique `DEFAULT_TAB_DIMS` (`docusign-import.ts:158-179`). Les valeurs sont en pts — 200×40 pour une signature, 16×16 pour un checkbox. Sur une page A4 (595×842), ça représente 33%×4.7% → potentiellement trop large pour la cible visuelle. **Pas de vérification que la position+taille ne dépasse pas les bords**. `clamp01` n'est appliqué qu'à `x/y/width/height` séparément (`docusign-import.ts:458-461`), pas à `x+width`. Un tab placé à `x=0.95` avec `width=0.20` se retrouvera coupé au stamping.

**Complexité UX (non-dev)**
- `tabGroups` DocuSign → groupes checkbox propagés sur les membres via `tabGroupLabels` (`docusign-import.ts:380-412`). Le `groupName` est nettoyé d'un préfixe `"Groupe de cases à cocher "` puis d'un suffixe `[a-f0-9-]+` (UUID DocuSign). Un nom non-conforme à ces 2 regex passe en clair → UI affiche le label brut DocuSign. À tester.
- Pas de support des **conditional tabs** DocuSign (`conditionalParentLabel` / `conditionalParentValue`). Toutes les conditions doivent être ressaisies manuellement après import. **Trou fonctionnel majeur** (voir section 4).

**Manque clair**
- Aucun support des **calculated fields** DocuSign avancés (formules avec opérateurs imbriqués, fonctions DateAdd/SumIf). Le `formula` est stocké en `metadata.formula` (free-text) mais jamais évalué (cf. `computeFormulaValue` qui n'utilise que `formulaSourceIds` + `formulaOp` structurés, pas l'expression).

---

### 1.3 `lib/sign/wizard-builder.ts` (339 lignes)

**Rôle** : à partir de `documents[].fields`, construit `WizardStep[]` (étape "Vos informations" → clusters par doc/page → étape Signature).

**Architecture & algorithme**
- Clustering Y avec `gapThreshold = 0.025` (≈ 21 pts) (`wizard-builder.ts:123`). En dessous → même cluster. Au-dessus → nouvelle étape.
- 2e passe : si cluster > 8 fields → split au plus gros gap interne. Heuristique mobile-first **raisonnable**.
- `clusterTitle()` : tooltip majoritaire (≥50%) > 1ère annotation < 80 chars > fallback "Étape N". Bien.

**Lenteur** : O(N log N) par tri + N pour cluster. Pour un PDF avec 200 fields = trivial.

**Faiblesse UX**
- L'algo regroupe par **Y** uniquement (`wizard-builder.ts:127`). Sur la fiche L-Agence (2 colonnes denses), tous les fields à la même hauteur (gauche + droite) tomberont dans le même cluster, mélangeant des champs sans rapport. **Le bouton "Re-générer auto" reste donc dangereux** : il peut produire des étapes "Nom + Adresse" (côte à côte sur la page) qui n'ont aucun sens logique.
- L'algo ignore `wizardSection` (déjà saisi manuellement) lors d'une re-génération → tout est perdu. L'écrasement est confirmé dans `WizardEditor.tsx:441-455` mais sans préavis fin (juste un `confirmRegen` double-clic 5s).
- L'algo ignore les conditions existantes — les groupes sont préservés via `groupId` mais ne sont pas re-clusterisés ensemble (un groupe peut se retrouver scindé sur 2 étapes).

**Verdict** : `buildWizardSteps` est un **fallback acceptable pour démarrer**, mais l'IA Claude Vision (`/api/sign/templates/[id]/enrich-with-ai`) doit rester le chemin nominal. Le bouton "Re-générer auto" devrait être renommé "**Re-générer (heuristique)**" pour distinguer du bouton IA.

---

### 1.4 `lib/sign/field-helpers.ts` (258 lignes)

**Rôle** : helpers runtime (`evaluateCondition`, `effectiveFieldState`, `computeFormulaValue`, `looksLikeDateField`, `looksLikeCountrySelect`, `EUROPEAN_COUNTRIES`, `getDayOffsetFromSection`).

**Qualité** : code propre, factorisé, partagé entre `SignWizard` et `PublicFieldsLayer`. ✅
**Lenteur** : `evaluateCondition` est appelé pour chaque field × chaque step à chaque keystroke côté wizard (`SignWizard.tsx:519`). Pour 100 fields × 1-2 conditions/field = 200 évals = négligeable.

**Bug subtil potentiel** : `looksLikeCountrySelect` (`field-helpers.ts:77-83`) injecte la liste Europe complète UNIQUEMENT si `listItems` existant ≤ 10. Si DocuSign a exporté 11 pays (cas réel pour un select Nationalité), l'enrichissement est skip → l'admin pense que c'est cassé. Heuristique fragile.

**Manquant** : pas de mémoïsation. `effectiveFieldState` recompute à chaque render. Pour 100 fields × 10 renders/sec = 1000 évals — toujours négligeable, mais ça grimpe vite avec un template à 200 fields + conditions complexes.

---

### 1.5 `components/sign/FieldsCanvas.tsx` (1152 lignes) — **Konva overlay**

**Rôle** : rend une `<Stage>` Konva par-dessus le PDF. Drag & drop, resize, multi-sélection, lasso, ghost preview, snap guides, badges étapes/sections, indicateur condition violet `⚙N`.

**Architecture**
- 1 `<Stage>` avec **4 Layers** (`FieldsCanvas.tsx:563-700`) :
  1. Champs (FieldGroup × N)
  2. Resize handles (1 seul si single-select)
  3. Lasso rectangle
  4. Ghost preview souris
  5. Snap guides bleus
- `FieldGroup` rend l'1 des 6 variantes : checkbox / signature / annotation / attachment / select / texte générique.

**Re-render & performance**

🔴 **Plusieurs problèmes notables** :
1. **`selectedSet = new Set(selectedIds)` recréé à chaque render** (`FieldsCanvas.tsx:118`). Pas dramatique (Set de quelques IDs) mais signal d'absence de `useMemo`.
2. **`fields.filter(f => f.page === page && !f.metadata?.hidden)` également recréé à chaque render** (`:147`). Sur 200 fields × 60 renders/sec pendant un drag = 12 000 filter ops/s. Acceptable mais non-mémoïsé.
3. **`handleStageMouseMoveGlobal` non-mémoïsé** (`:159`) ET appelé sur **chaque mouvement souris** (que `activeTool` soit null ou non) avec un `setMousePos()` qui re-render TOUS les enfants. C'est probablement la source principale de jank ressenti par João. La condition `if (!activeTool) { if (mousePos) setMousePos(null); return }` (`:166-169`) évite le setState quand `mousePos` est déjà null mais NE court-circuite PAS le listener Konva.
4. **`onChange(fields.map(...))` au drag end** (`:425`) reconstruit le tableau entier de fields. Pour 200 fields = 200 alloc + parent re-render + WizardPreview snapshot debounce 700ms relancé. OK individuellement.
5. **`handleDragMove` recalcule `vLines`/`hLines` à chaque frame** (`:336-347`) en parcourant TOUS les autres fields de la page. Pour 200 fields × 60 fps = 12 000 itérations/s. **Mémoïsable** sur la page courante.
6. **Re-render Konva complet sur chaque update de `fields`** : pas de `<Group draggable>` mémoïsé via `React.memo`. Konva re-rend tout. **C'est probablement gérable jusqu'à ~100 fields**, au-delà la latence devient sensible.

**Bugs visuels détectés à la lecture**
- `MIN_FIELD_W_PCT = 0.008` (`:90`) = 0.8% page. Sur 720px de large = 5.7px. **En-dessous de la handle de resize (9px)** → un field minuscule sera quasi-cliquable mais la handle dépasse le rect.
- `colorFor(order)` avec `RECIPIENT_COLORS[(safeOrder - 1) % 5]` cycle silencieusement. Si l'admin nomme 6 rôles, Candidat (#1) et Comptable (#6) auront le même bleu sans warning.
- **Pas de tooltip Konva pour les badges `⚙N`** condition (`:1113-1137`) — l'admin voit une pastille violette mais ne sait pas QUELLE condition tant qu'il n'a pas cliqué le field.
- `dragBoundFunc` (`:846-849`) clamp single drag, mais le commentaire (`:842-845`) note que le multi-drag bypasse → en multi-drag, des champs peuvent visuellement sortir du PDF avant le commit final. Probablement OK car le commit `clamp01` chacun.

**Complexité UX (non-dev)**
- 7 fonctionnalités empilées sur la même surface : drag / resize / lasso / ghost / multi / snap / hover. Un débutant Konva trouverait ça sophistiqué. ✅
- Le ghost preview (Layer 4) est rendu UNIQUEMENT si `activeTool && mousePos && !lassoStart`. Sur mobile (touchscreen) : pas de `mousemove` → pas de ghost → le user clique sans feedback. Mineur car éditeur = desktop-only en pratique.
- L'indicateur `⚙N` est rendu en `x:1, y:1` (`:1114`) coin haut-gauche. **Il chevauche le step badge** (rendu aussi en top-left `bx=-8, by=-8` `:773-774`). Sur un field avec étape + condition → superposition visuelle. À vérifier en localhost.

**Couleurs par destinataire (`recipientColor` palette)**
- Stroke bleu/vert/orange/violet/rose : cohérent avec DocuSign. ✅
- `colorFor(activeRecipientOrder)` est appliqué au ghost preview (`:659`) → bonne UX.
- `c.text` (texte interne field) utilise une teinte foncée du même hue → contraste OK en mode clair, **mauvais en mode sombre** (palette RGB littérale, pas adaptive).

---

### 1.6 `components/sign/TemplateEditor.tsx` (3872 lignes) — **Mode Document orchestrateur**

**Rôle** : layout 2 colonnes. Gauche : PDF + FieldsCanvas Konva. Droite (320px sticky) : bandeau actions (Enregistrer, Aperçu PDF, IA, Ajouter PDF) + `SelectedFieldsPanel` + outils champs catégorisés + recipients + résumé page.

**Architecture des callbacks** (très important pour comprendre les bugs)
- État local : `activeDocIdx`, `activePage`, `activeTool`, `activeRecipientOrder`, `selectedIds`, `saving`, `dirty`, `aiBusy`, `uploadingPdf`, `renamingDocIdx`, `renameDraft`, `previewOpen`, `zoom`, `showSectionBadges`, `showStepBadges`, `past`, `future`, `clipboardRef`.
- État partagé via props depuis page parente : `docs/setDocs`, `recipients/setRecipients`, `wizardSteps/setWizardSteps`, `wizardEnabled`.
- Callbacks distribués à `SelectedFieldsPanel` : `onPatch`, `onPatchMany`, `onPatchManyMixed`, `onApplySizeToSimilar`, `onDelete`, `onGroupCheckboxes`, `onUngroup`, `onPatchAllInGroup`, plus `wizardSteps/setWizardSteps`.

**Lenteur potentielle**

🔴 **Plusieurs cas notables**:
1. **`fieldsTotalCount(docs)` appelé 3× dans le render** (`:1120`, `:1227`, et indirectement dans le bouton IA). Itère tous les docs × tous les fields. Pour 5 docs × 100 fields = 500 ops × 3 = 1500 ops par render. Banal. Mais signal d'absence de `useMemo`.
2. **`pushHistory()` clone profond docs** (`:191-196`) à chaque modif (`.map(d => ({ ...d, fields: [...(d.fields || [])] }))`). Pour 5 docs × 100 fields → 500 fields alloués par opération user. Sur 50 ops max → 25 000 fields en mémoire. Acceptable mais pas idéal. **Limite à 50 entrées** OK.
3. **`updateDocFields` est lourde** (`:295-347`) :
   - `pushHistory()` (clone tout)
   - `setDocs(prev => prev.map(...))`
   - puis détecte les fields ajoutés via `new Set(prevFields.map(f => f.id))` → O(N)
   - puis pour chaque field ajouté, parcourt `wizardSteps` 2 fois (étape active + dernier matching rôle)
   - puis `setWizardSteps(prev => ...)` qui re-immute tous les steps
   - puis émet un `toast`
   - Au final 1 click de placement = **5 effets en cascade**. Probablement source de petite latence ressentie au placement (~50-100ms).
4. **Auto-save debounce 800ms** (`:399-406`) : OK en théorie, mais `useEffect([dirty, saving, docs, recipients, wizardSteps, wizardEnabled])` se relance à chaque modif y compris cosmétique (zoom, page, sélection — non, ces 3 ne sont pas dans deps). En revanche le **moindre patch d'un field** relance le timer → si l'admin tape rapidement, le PATCH n'est jamais émis tant qu'il ne s'arrête pas 800ms. Désiré.
5. **`renderInfo` props passées en `useState`** : sur chaque rendu de page, le PDFViewer émet `onPageRendered({renderedWidth, renderedHeight})` qui re-render le parent. Acceptable.
6. **Modal "Ajouter au wizard"** : `addModalOpen` re-render tout l'écran si on entre dans le modal portalisé. Pas dramatique.

**Bugs visuels & subtils**
- `dragBoundFunc` (`FieldsCanvas`) clamp avec `boundW - w` calculé au render initial. Si l'admin **resize** un field près du bord puis le **déplace**, l'ancien `w` du closure peut être stale. À vérifier mais probablement OK car `<Group>` est recréé après chaque `onChange`.
- **Re-render en cascade auto-save → silent → pas `onSaved` → bon**. Mais `setSaving(true)` puis `setSaving(false)` dans `handleSave` provoquent 2 re-renders même en mode silent. Donc le bouton "Enregistrer" disabled vacille 800ms toutes les ~1.5 sec quand l'utilisateur tape. C'est exactement ce que João a remonté comme "clignement". Le pattern #64 documente qu'on a stabilisé le **label**, mais le **disabled** lui fluctue toujours (`disabled={saving || !dirty}` `:1081`). À vérifier visuellement : le bouton passe-t-il en disabled pendant la milliseconde de saving silent ? Si oui → flicker.
- **L'IA détection (`handleAiDetect`)** appelle `onSaved?.()` (`:530`) qui déclenche fetchTemplate parent → reload complet. C'est OK ici car l'utilisateur attend explicitement le résultat.
- **`MultiSelectConditionForm`** (`:2470+`) : `condIndex` Map recréée à chaque render (`:2483-2492`). Recalcule l'agrégation. Pour 20 fields × 3 conditions = 60 iters/render. Banal.

**Complexité UX (non-dev)**

🔴 **Points sensibles** :
1. **Le SelectedFieldsPanel mélange single-select et multi-select** dans le même composant via `if (!isMulti)` (`:1572`). Le code single-select fait 700+ lignes (`:1572-2280`), puis le multi 200+ lignes (`:2283-2462`). C'est volumineux mais lisible.
2. **Champ "Texte du champ (libellé affiché)"** (`:1863-1870`) édite simultanément `label` ET `tooltip`. C'est le pattern #8 du contexte v2.7.6. **MAIS l'éditeur "Avancé > Tooltip"** (`:3254-3262`) édite ENCORE le tooltip. Si l'admin saisit un tooltip différent dans Avancé, le champ principal continue d'écraser avec sa propre valeur dès qu'on retouche. **Source de confusion**.
3. **`isOrphan` warning** (`:1578`) : `(wizardSteps || []).length >= 0` est tautologique (toujours vrai). Le test est : `!isAutoFillType(f.type) && !wizardFieldIds.has(f.id)`. Le `>= 0` est probablement un copier-coller. → tout field non-auto-fill, non-référencé dans un step → warning. Correct logiquement, mais le test booléen est mort.
4. **`SelectedFieldsPanel` n'utilise pas `React.memo`** : à chaque sélection/désélection d'un autre field, tout le panneau (avec ses ConditionalLogicEditor, TypeSpecificOptions, AlignEqualizeSection imbriqués) re-rend.
5. **Le `<details>` "Avancé"** (`:3251-3267`) cache le Tooltip alors qu'on a déjà un champ "Libellé" en haut. Pour un non-dev, ces 2 champs sont identiques. La synchronisation label↔tooltip est une rustine.
6. **"Annotation / Instruction" (helpText)** (`:3236-3245`) est en dehors du `<details>` Avancé → toujours visible → bien. Mais à l'intérieur de "Options X" → un non-dev ne devine pas que helpText est tjs visible alors que tooltip est hover-only.
7. **Bouton "📏 Uniformiser N autres champs"** (`:2240-2253`) : excellent pour les rapports d'heures (case "Lundi/Mardi/..."). Mais la heuristique `fieldNameKeys` (`:594-606`) strip les jours → matche TOUS les jours d'un type. **Effet de bord** : si l'admin a 7 fields "Heures" (un par jour) ET 7 fields "Pause" (un par jour), un click sur un "Heures Lundi" propage au "Heures Mardi" ET PAS au "Pause Mardi" → bon. Mais si l'admin tape `pause` dans tooltip avec un `0` placeholder dans label, le strip-0 (`:599`) skip. Plutôt correct.

**Verdict TemplateEditor** : c'est le **plus gros fichier du codebase** (3872 LOC). Il marche, mais il a clairement dépassé la complexité maintenable. Il faut le splitter (voir Top 5).

---

### 1.7 `components/sign/WizardEditor.tsx` (2675 lignes) — **Mode Wizard**

**Rôle** : sidebar (liste steps) + détail step (titre, displayMode list/cards, attachments, fields list draggable dnd-kit, FieldEditor inline avec Section/Annotation/Type/Conditions). Toolbar haut : toggle activé, sélecteur rôle, gestion rôles (popover), orphans modal, IA, Re-générer auto, Ajouter étape, Aperçu live, Enregistrer.

**Architecture**
- State : `selectedStepIdx`, `saving`, `dirty`, `confirmRegen`, `enriching`, `previewOpen`, `rolesPopoverOpen`, `orphanModalOpen`, `locatedFieldId`, `activeRole`. 10 useState — beaucoup mais chacun a son rôle.
- `useMemo` corrects sur `allRoles`, `fieldIndex`, `allRecipientFields`, `visibleSteps`, `allUsedInWizard`, `orphanFields`.

**Lenteur potentielle**
- `dnd-kit PointerSensor` avec `activationConstraint: { distance: 8 }` (`:961`) : correct, évite faux-positifs de drag sur les inputs.
- Pas de virtualisation de la liste des steps ni de la liste des fields dans le step. Pour 30 steps × 20 fields chacun = 600 rows DOM. ⚠️ **Si un template atteint 100+ fields dans un step, le render commence à ramer**.
- `FieldEditor` re-render à chaque keystroke dans son propre input (label/tooltip). Le `useSortable` de dnd-kit ajoute un `transform` style → forcing reflow. Acceptable mais perceptible.
- `WizardPreview` (snapshot 700ms debounce + React.memo + JSON hash) est très bien fait (`WizardPreview.tsx:38-72`). C'est un **bon pattern à conserver et reproduire** ailleurs si jamais on ajoute un preview ailleurs.

**Bugs visuels**
- **Drag handle ⋮⋮ + multi-clic** : si l'admin maintient ⋮⋮ puis bouge <8px puis relâche, rien ne se passe (correct). Mais si la souris bouge ≥8px en oblique, le drag s'active sur un field, et le scroll vertical du panneau scroll en même temps → confusion potentielle sur les longues étapes.
- **`SortableContext items={stepFields.map(f => f.id)}`** : si un step a des fieldIds orphelins (référence ID supprimé en Mode Document), `stepFields` les filtre via `fieldIndex.get(id)?.field` (`:965`). Donc les orphelins **disparaissent silencieusement** de la sortable. Le compteur (`:806-823`) affiche `valid / total` avec un avertissement orange. ✅ Bien géré.
- **Le badge "+ section"** (`:1337-1361`) est cliquable. Le clic appelle `setExpanded(true)` puis l'utilisateur doit scroller jusqu'à "Section d'affichage" dans le panneau expand. UX dégueulasse pour un non-dev — il faut **scroll-into-view** au minimum.

**Complexité UX (non-dev)**

🔴 **Très complexe** :
1. La toolbar mélange **7 actions** (toggle / rôle / orphelins / IA / Re-générer / Ajouter étape / Aperçu / Enregistrer) sur une ligne `flex-wrap`. Sur écran 1280px → ça reste 1 ligne. Sur 1024px → wrap → 2 lignes → la cohérence visuelle se casse.
2. **"Re-générer auto" vs "Améliorer avec l'IA"** : pour un non-dev, c'est le même mot. La distinction algorithme heuristique vs Claude Vision n'est pas claire. Le double-clic confirm de Re-générer est une bonne sécurité, mais le label devrait être plus explicite : "**Recalculer la structure (heuristique)**" vs "**Améliorer avec l'IA (Claude Vision)**".
3. **DisplayMode list vs cards** : bien expliqué dans `DisplayModeBtn` (`:2103-2132`), avec warning si aucun field n'a de section. ✅
4. **`onApplyToSection`** dans `ConditionsEditor` (`:1947-1960`) : copie les conditions d'un field vers tous ses siblings de la section. Très utile pour blocs "Conjoint", "Enfants". Mais le bouton apparaît seulement si conds.length > 0 — pas découvrable.
5. **`OrphanFieldsModal`** : excellent UX (sélection multi, ajouter à étape X, localiser, supprimer). Probablement la meilleure modale du module. ✅

---

### 1.8 `components/sign/SignWizard.tsx` (1434 lignes) — **Rendu candidat**

**Rôle** : rendu mobile-first du wizard côté candidat (et utilisé aussi pour preview admin via `forceStepIdx`). 1 étape à la fois, validation, signature, RecapStep finale.

**Architecture & qualité**
- Très bien factorisé. `StepContent` rend chaque type via switch sur `field.type`.
- `effectiveFieldState` appelé pour visible/required avec conditions. ✅
- `handleValueChange` wrapper (`:177-224`) applique radio-like logic pour groupes checkbox `SelectExactly N=1`. **Pattern v2.7.6 propre**.
- `sessionStorage` pour persister `currentStepIdx` au toggle Wizard/Document (`:135-168`). Bien pensé.

**Lenteur potentielle**
- `fieldsByStepMap = useMemo(() => fieldsByStep(steps, documents), [steps, documents])` (`:171`). Recompute à chaque mutation. Pour 30 steps × 200 fields = ~6000 iter. OK.
- `visibleFields = fields.filter(f => effectiveFieldState(f, values).visible)` (`:519`) à **chaque keystroke** dans n'importe quel input. Pour 20 fields/step × 3 conditions/field = ~60 évals. Imperceptible.

**Bugs visuels potentiels**
- Le `<style jsx global>` pour `tf-sign-pulse` (`PublicFieldsLayer.tsx:182-188`) est injecté à chaque render. Pas dramatique (CSS-in-JS dedup) mais signal de design.
- **L'écran "Document signé !"** (`:300-315`) avec `completedTitle/Subtitle` overrides : OK.

**Complexité UX (côté candidat — c'est ça qui compte pour la cible)**
- Progress bar jaune, mobile-first, validation par étape avec message d'erreur clair → ✅ bien.
- Sur un iPhone réel : `frameW=430 frameH=760` est le iPhone 17 Pro Max. La preview admin et l'écran réel candidat utilisent le même `SignWizard` → fidélité élevée.

---

### 1.9 `components/sign/PublicFieldsLayer.tsx` (758 lignes) — **Overlay PDF côté candidat (mode Document)**

**Rôle** : pour 1 page PDF, rend les fields cliquables en absolute par-dessus l'iframe PDF. Gère signature/text/checkbox/select/date/etc. Inclut `forceReadOnly` pour les valeurs de signers précédents, `blockedFields` (compliance), `lockedFields` (dates auto-fill jour/semaine).

**Architecture**
- `visible = fields.filter(...)` recréé à chaque render (`:77`). Acceptable pour 1 page de fields.
- Wrapper `handleValueChange` pour groupes checkbox (`:82-111`) — duplicate de `SignWizard.tsx:177-224`. **Code dupliqué entre les 2 modes** — devrait être extrait en helper `applyCheckboxGroupRule(field, value, fields, onValueChange)`.

**Bugs subtils**
- **`useEffect` avant early return** (`:228-233`) : commentaire v2.5.1 explique le crash "Rendered fewer hooks". Excellente correction défensive. ✅
- `boxShadow` halo pulsant via `animation: 'tf-sign-pulse 1.5s'` (`:141`) appliqué inline → reflow sur chaque field courant. Acceptable.

**Manquant**
- Pas de support clavier (Tab pour passer field → field) dans le mode Document candidat. Sur desktop, un user veut Tab. C'est dégradé.

---

## Section 2 — Analyse UX Mode Document

### Placement des champs
- **Mode unique** : sélectionner un outil dans la sidebar droite (catégorie + bouton) puis **cliquer sur le PDF**. Le clic place le field centré sur le curseur (`TemplateEditor.tsx:186-200`).
- **PAS de drag depuis la sidebar** vers le PDF. C'est plus simple, mais moins découvrable que DocuSign/DocuSeal qui supportent les deux.
- **Ghost preview** (FieldsCanvas Layer 4) : excellent ✅. Le user voit la taille/couleur du futur field avant de cliquer.
- **Bandeau "Outil actif : Signature"** (`:1258-1273`) en jaune brand : très bien, sécurise un non-dev.
- **Echap pour annuler** : géré (`onKeyDown` sur les boutons outils `:1301`).

### Resize
- **1 handle** au coin bas-droit uniquement (`FieldsCanvas.tsx:611-633`). Pas de handles aux 8 points classiques.
- Resize libre pour texte/checkbox/date/etc.
- Signature/initial : **ratio fixe** 3:1 / 1:1, `minW/maxW` clampés (`types.ts:199-202` + `FieldsCanvas.tsx:500-517`). Excellente protection.
- **Snap pendant resize** vers les bords des autres fields (`:443-489`). Subtil et bien.
- Pas de resize multi-select (single uniquement, `:602`). Pertinent pour éviter confusion.

### Sélection du type
- **Boutons par catégorie** (Signature / Coordonnées / Entrées / Autre) — `FIELD_TYPE_CATEGORIES`. 16 types répartis en 4 sections. ✅
- Mais une fois placé, **changer le type d'un field** se fait dans le panneau via `<select>` (`:1872-1881`). Pour un non-dev, "Type = Texte / Numéro / Date" est clair, mais "Annotation / Formule / Pièce jointe" demande contexte.

### Assignation signataire
- **Pills colorées** dans le panneau (`:1884-1923`) : badge rond + numéro + nom du rôle. Le PDF change de couleur **instantanément** au clic. ✅ Pattern #?, mais excellent.
- Multi-select : **Pills hover→couleur** (`:2287-2331`). Cohérent.
- Rôle ACTIF (= qui sera appliqué aux nouveaux fields placés) est désigné dans le panneau Rôles. Distinction "actif" vs "assigné à ce field" assez subtile pour un non-dev.

### Visualisation des champs par étape
- **Badge numéro étape** (cercle coloré 16×16 en top-left du field via `STEP_COLORS` palette 6 couleurs `FieldsCanvas.tsx:14-21`).
- Toggle "🔢 Étapes" pour masquer (`TemplateEditor.tsx:992-1011`).
- Pas de filtre par étape (= voir seulement les fields de l'étape 3). **Manque**.

### Modal "champs orphelins"
- Déclenchée par le bouton **dans `WizardEditor`** uniquement (`WizardEditor.tsx:648-667`), **pas** dans `TemplateEditor`. C'est dommage : un admin qui travaille en Mode Document a un bandeau warning inline par field (`TemplateEditor.tsx:1642-1672`), mais pas de vue agrégée.
- Pas bloquante : peut être ignorée.
- Excellente UX (localiser, multi-select, bulk add to step, delete). ✅

### Vitesse Konva
- 1 Stage + ~4 Layers, ~200 fields par page max → fluide jusqu'à ~100 fields. Au-delà, le drag commence à montrer du jank.
- `listening` est `true` partout (par défaut). Sur Layer 1 (champs draggables) c'est nécessaire. Sur Layer 4 (ghost) c'est `listening={false}` ✅. Sur Layer 2 (handles), `listening` est explicite (`:597`).
- **`stageRef` jamais utilisé pour batchDraw()** — pas critique mais c'est l'optim Konva standard pour éviter re-paint inutiles.

### Fluidité drag
- Drag d'un field existant : fluide (`onDragMove` sur Konva Group).
- Multi-drag avec leader : le code calcule un delta et applique aux autres via `stage.findOne(#fld-${id})` (`FieldsCanvas.tsx:307-313`). Astucieux mais coûteux (findOne est O(N) sur le Layer).
- **Drag depuis sidebar non-supporté** — voir Top 5.

### Clarté visuelle
- 5 couleurs destinataires distinctes.
- Halo subtil au hover (shadowBlur=4) et plus fort à la sélection (shadowBlur=8). Discret mais visible.
- Badge groupe (`G`) pour checkboxes groupées.
- Badge `⚙N` violet pour conditions. **Mais superposition possible avec badge étape** (voir bug détecté section 1.5).

### Feedback
- Sélection : stroke épaissi (1.7) + shadow. ✅
- Hover : stroke moyen (1.3) + shadow léger. ✅
- Lasso : rectangle bleu pointillé + selection en temps réel (additive shift). ✅
- Snap : guides bleus pointillés sur les axes. ✅
- **PAS de message d'erreur si l'utilisateur place un field à width<MIN_W ou hors page** — silencieux (clamp01 absorbe).

---

## Section 3 — Analyse UX Mode Wizard

### Création d'étapes
- **Bouton "+ Étape"** dans toolbar (`WizardEditor.tsx:689-696`). Crée vide assignée au `activeRole`.
- **Re-générer auto** : heuristique clustering Y → écrase la structure. **DANGEREUX** : double-clic confirm 5s.
- **Améliorer avec l'IA** : Claude Sonnet 4.6, 30-60s par doc, écrase la structure (les champs restent).
- **3 chemins de création**. Pour un non-dev, **trop**. Le bouton "Re-générer auto" est probablement à archiver maintenant que l'IA fonctionne.

### Assignation champ → étape
- **Drag inter-étapes** : non, **drag à l'intérieur d'une étape uniquement** via dnd-kit (`SortableContext`).
- **Bouton "Déplacer vers étape" ↔** dans header field (`WizardEditor.tsx:1382-1462`) avec popover liste des autres steps. Bien.
- **Modal "Ajouter au wizard"** depuis Mode Document (warning orange field orphelin) `TemplateEditor.tsx:1675-1858`. Bien.
- **Sélecteur "Étape wizard"** dans Mode Document `TemplateEditor.tsx:2018-2053`. Permet aussi de déplacer ou orpheliner. ✅ v2.7.6.
- **Auto-section sur drop** : si on drop un field A sur un field B avec `wizardSection="Mardi"`, A devient `wizardSection="Mardi"` (`WizardEditor.tsx:1158-1167`). Astucieux et utile pour rapports d'heures.

### Réordonnement étapes
- **Boutons ↑↓** dans `StepDetail` header (`WizardEditor.tsx:973-978`).
- **PAS de drag** sur la sidebar des étapes. Pour un non-dev habitué à Notion/Trello, c'est surprenant.

### Notes/description par étape
- **Supprimé en v2.4.0** (`WizardEditor.tsx:1001-1004`). Remplacé par `helpText` par champ. Décision discutable : un titre d'étape "Conjoint" + une description "À remplir si marié" était plus claire qu'un helpText par field. **Régression UX** potentielle.

### Preview iPhone 17 Pro Max
- 430×760 hardcodé (`WizardPreview.tsx:125-126`).
- **Snapshot 700ms debounce + JSON hash + React.memo** : excellent (cf. analyse §1.7).
- `contain: 'layout style'` (`WizardEditor.tsx:881`) sur le conteneur sticky : v2.7.6 anti-reflow.
- ResizeObserver pour scale auto si écran trop petit (`WizardPreview.tsx:130-158`).
- **AutoFill mocké** : Jean Dupont, jean.dupont@example.ch, téléphone +41 79 123 45 67, today auto. Adapté aux conventions L-Agence ✅.

### Bouton "Re-générer auto"
- **Dangereux** : écrase wizard_steps. Heuristique simpliste (cluster Y).
- Double-clic confirm 5s. Suffisant mais le label devrait porter un warning explicite genre "(⚠ écrase les étapes manuelles)".

### Bouton "Améliorer avec l'IA"
- Modèle `claude-sonnet-4-6`. Promp avec 10 conventions L-Agence (cf. CLAUDE.md v2.7.4).
- Sortie attendue : steps restructurés + helpText/tooltip enrichis + conditions ajoutées.
- En mode "0 fields" → détection from scratch.
- En mode "fields existants" → restructure le wizard, garde les positions Konva. ✅
- **Limitation** : `Promise.allSettled` sur N docs en parallèle (5 docs ≈ 35s). Au-delà de 5-7 docs, risque de **timeout Vercel 120s** (maxDuration). Pas de pagination.

### Cohérence Mode Wizard ↔ Mode Document après v2.7.6
- **Libellé** (label/tooltip) : sync via un seul champ dans les 2 modes (`TemplateEditor.tsx:1867-1869` et `WizardEditor.tsx:1363-1378`). ✅
- **helpText** : édité dans les 2 modes (`TemplateEditor.tsx:3236-3245`, `WizardEditor.tsx:1559-1572`). ✅
- **sectionDescription** : sync sur tous les fields de la même `wizardSection` (`TemplateEditor.tsx:1992-2014` + `WizardEditor.tsx:1712-1740`). ✅ Pattern propre.
- **Étape wizard selector** : présent dans Mode Document (`TemplateEditor.tsx:2018-2053`). ✅ v2.7.6.
- **Conditions** : éditeur différent dans les 2 modes (`ConditionalLogicEditor` plus complet en Document, `ConditionsEditor` plus simple en Wizard). Le **schéma** est identique. ✅

### Preview update timing
- 700ms debounce. Adapté. Si l'admin tape vite, le preview reste figé puis met à jour 700ms après la dernière touche. C'est le bon compromis.

### Qualité du wizard auto-généré (heuristique vs IA)
- Heuristique : OK pour un PDF simple (formulaire à 1 colonne). Mauvais pour la fiche L-Agence multi-colonnes.
- IA : excellente quand ça marche. Mais 30-60s/doc + dépendance Anthropic API + coût (Sonnet 4.6 ≈ $0.003 par doc ≈ €25/mois si utilisé 1000×).

---

## Section 4 — Comparaison DocuSign

### Ce que DocuSign a et qu'on n'a PAS

| Feature | DocuSign | TalentFlow Sign | Impact |
|---|---|---|---|
| **Conditional tabs avancés** | Oui (parentLabel + parentValue par tab) | Schéma simplifié 1-niveau (`SignFieldCondition` AND-only) | Moyen |
| **Formula calculations** (DateAdd, SumIf, conditional) | Riche | Basique : sum/avg/mul/min/max/sub | Faible |
| **Group radio buttons** (RadioGroupTabs natifs) | Oui | Émulé via checkbox groupId + SelectExactly=1 | Faible (résolu en v2.7.6) |
| **Multi-language tabs** (locale per recipient) | Oui | Non | Faible (L-Agence FR uniquement) |
| **Templates partagés (organisation)** | Oui | Non (par-user via `created_by`) | Moyen |
| **Bulk send** (1 enveloppe → 1000 destinataires) | Oui | Non | Faible (L-Agence est 1-by-1) |
| **In-Person Signing** (host + signer en présentiel) | Oui | Partiel via QR code TTL 2h | OK |
| **Reminders configurables par signataire** | Oui | Cron quotidien global `sign-reminders` | Moyen |
| **Webhook events** | Oui (200+ events) | Non | Faible |
| **Date validation** (range, dynamic min/max) | Oui | Format display only | Faible |
| **Fonts custom upload** | Oui | 7 polices fixes (Arial/Helvetica/Calibri/Times/Courier/Georgia/Verdana) | Faible |
| **Drag from palette** | Oui (toolbar latérale draggable) | Non (click+place uniquement) | **Important UX** |
| **Field validation regex live** | Oui (live au signing) | Spec stockée mais validation faite seulement au submit | Moyen |
| **Stamp Tabs** (cachet entreprise) | Oui | Non | Faible |
| **Notarize** | Oui | Non | Inapplicable (suisse) |
| **Routing conditionnel** (recipient B reçoit selon réponse de A) | Oui | Linéaire uniquement | Faible |

### Ce qu'on a de mieux que DocuSign

1. **Wizard mobile-first natif** : DocuSign n'a pas de wizard step-by-step pour mobile aussi propre. C'est l'avantage clé.
2. **IA enrichment** (Claude Vision avec prompt L-Agence) : détecte les fields automatiquement à partir d'un PDF natif sans tabs DocuSign existants. DocuSign n'a pas ça (AutoTagging existait mais limité au string matching).
3. **Signature ZertES suisse** : page certificat A4 avec hash SHA-256 + IP + footer RS 943.03 (eIDAS). DocuSign offre quelque chose d'équivalent mais payant haut tarif.
4. **Multi-select batch fluide** : lasso + alignement/distribution (Figma-like). DocuSign a un éditeur plus rigide.
5. **Coût** : €0 vs €25-100/user/mois.
6. **Intégration native ATS** : auto-fill firstname/lastname/email depuis fiche candidat, lien direct mission, données contextuelles (weekStartDate pour rapports, companyName client). **Avantage majeur** pour le workflow L-Agence.
7. **Preview live admin** : iPhone 17 Pro Max responsive, snapshot intelligent. DocuSign a un preview mais moins fluide.

### Verdict objectif
TalentFlow Sign est **suffisant pour le cas L-Agence** (fiche inscription, contrat, rapports d'heures). Il **n'égale pas** DocuSign sur les fonctionnalités avancées (routing conditionnel, formulas complexes, bulk send, fonts custom, validations regex live). Pour le scope produit, c'est OK. Pour un éventuel produit SaaS commercialisable, les gaps deviendraient bloquants face à concurrents.

---

## Section 5 — Performance Konva (FieldsCanvas.tsx)

### useEffect (`FieldsCanvas.tsx`)
- 1 seul : suppression au clavier (`:529-542`). Deps `[selectedIds, fields, onChange, onSelect]` avec `eslint-disable-next-line react-hooks/exhaustive-deps` (`:542`). **`selectedSet` qui dérive de `selectedIds` est utilisé dans le closure mais non listé** → le `selectedSet` du closure est l'ancien à chaque event, mais comme on le recrée à chaque render via `new Set(selectedIds)`, le re-attach du listener compense. **Fragile mais fonctionnel**.

### useState
- `hoveredId`, `lassoStart`, `lassoEnd`, `mousePos`, `snapGuides`. Tous légitimes.

### useMemo
- 1 seul : `fieldStepMap` (`:123-142`) avec deps `[wizardSteps, fields]`. Recompute à chaque modif fields. Pour 30 steps × 30 fields = 900 iters. OK.

### useCallback
- **AUCUN** dans FieldsCanvas. Toutes les fonctions (`handleStageClick`, `handleStageMouseDown`, `handleDragStart`, etc.) sont recréées à chaque render. C'est passé à Konva qui ne ré-attache pas ses listeners à chaque render (binding interne), mais **`handleStageMouseMoveGlobal`** est attaché via prop sur `<Stage>` (`:552`) → potentiellement re-attaché 60×/sec pendant un drag.

### Re-renders Konva
- **`Layer` re-render complet** à chaque changement de `fields` : Konva fait son diff interne mais reconstruit les `<Rect>`/`<Text>`/`<Group>` selon React. Pas de virtualisation Konva-style.
- **FieldGroup pas mémoïsé** : peut être un quick-win avec `React.memo(FieldGroup, (prev, next) => prev.field === next.field && ...)`.

### Image PDF en cache
- PDF rendu par `PDFViewer` (pdfjs-dist). 1 page rendue à la fois. Re-render canvas à chaque changement de page ou de zoom. **PAS de cache cross-page** : passer de page 1 → 2 → 1 re-render page 1. Acceptable pour 1-10 pages, lourd pour 50+ pages.

### Zoom/pan
- Zoom : `[0.5, 2.0]` step `0.1`, applique multiplicateur sur `PDF_TARGET_WIDTH=720`. Pas de zoom Konva natif (transform), c'est un re-render du PDF à la nouvelle width. **Cohérent visuel** mais coûteux à chaque tap zoomIn/Out.
- Pan : aucun. Le scroll naturel du conteneur fait office.

### Conclusion perf Konva
Pour un template typique (50-100 fields, 2-5 pages), c'est **fluide**. Pour les templates extrêmes (200+ fields ou 30+ pages), la latence devient sensible. **Pas d'urgence** mais des leviers existent (memo FieldGroup, mémoïsation `visible`, useCallback pour les handlers `<Stage>`).

---

## Section 6 — Rapport final

### 🟢 Points forts (5-10)

1. **Auto-save 3 règles d'or v2.7.4 implémentée proprement** : silent skip onSaved, label stable, flush au switch tab + unload keepalive. C'est probablement l'élément le plus mature du module.
2. **Preview iPhone snapshot intelligent** (`WizardPreview.tsx:38-72`) : debounce 700ms + JSON hash + React.memo. Pattern reproductible et excellent.
3. **Architecture canalisée des types** : `SignField` est l'unique source de vérité, `lib/sign/types.ts` est bien commenté.
4. **Documentation historique des bugs** : `docusign-import.ts:313-320` et `:434-441` archivent les fausses pistes. C'est rare et précieux pour João + futurs Claude.
5. **Multi-select / lasso / align / distribute** : niveau Figma. DocuSign n'a pas ça.
6. **Snap guides bleus** pendant drag/resize : DocuSign-level.
7. **Confirmation double-clic 5s** sur Re-générer : pattern UX sain.
8. **`SIGNATURE_CONSTRAINTS`** (ratio 3:1 / 1:1 + min/max width) : excellente garde-fou.
9. **Helpers `effectiveFieldState` + `evaluateCondition`** dans `field-helpers.ts` : factorisés et partagés. ✅
10. **Pattern v2.7.6 sectionDescription synchronisée** : édition sur 1 field → patch tous les siblings. Élégant.

### 🔴 Problèmes critiques UX au quotidien João

1. **Le bouton "Enregistrer" disabled flicker pendant l'auto-save silencieux**. Le label est stable mais `disabled={saving || !dirty}` (`TemplateEditor.tsx:1081`) fluctue 800ms. À tester en localhost — si flicker confirmé, ajouter `useDeferredValue(saving)` ou un délai de 200ms avant d'appliquer le saving au bouton.
2. **`TemplateEditor.tsx` 3872 LOC = dette technique**. Le moindre changement risque de toucher quelque chose d'inattendu (cas des bugs récents 1/5/6/8 v2.7.6). Splitter en 5-6 sous-composants.
3. **3 chemins de génération étapes** (manuel "+Étape" / heuristique "Re-générer" / IA "Améliorer") **confondent**. Le bouton "Re-générer auto" est obsolète depuis l'IA et devrait être supprimé ou planqué dans "Avancé".
4. **Pas de drag depuis la palette d'outils** vers le PDF. Le user doit cliquer outil → cliquer PDF. Sur DocuSeal / DocuSign le drag from palette est standard.
5. **Pas de filtre "Voir uniquement les fields de l'étape X"** dans Mode Document. Quand un template a 80 fields sur 7 étapes, c'est dur de focus.
6. **"Libellé affiché"** sync à la fois label ET tooltip (`:1867-1869`), mais le `<details>` Avancé permet d'éditer tooltip seul (`:3254-3262`) → désync silencieuse possible. **Ambigu**.
7. **Modal "Champs orphelins" accessible UNIQUEMENT en Mode Wizard**. En Mode Document on a un warning par-field mais pas de vue globale. Mettre le bouton aussi dans Mode Document.
8. **Le badge `⚙N` (conditions) et le badge étape se chevauchent** au coin haut-gauche du field. À vérifier visuellement et déplacer le badge condition en haut-droite.
9. **Drag handle ⋮⋮ de dnd-kit + scroll vertical** peut conflit-er sur les longues étapes. Distance=8px aide mais ne résout pas le scroll vertical pendant un drag.
10. **L'IA peut timeout à 5+ docs** sans pagination. Risque réel le jour où L-Agence importe un contrat 8 pages avec 5 PDFs annexes.

### 🟡 Améliorations prioritaires (tableau triable)

| # | Domaine | Action | Effort | Impact | Risque |
|---|---|---|---|---|---|
| 1 | Perf | `React.memo(FieldGroup)` dans FieldsCanvas | Faible | Moyen | Faible |
| 2 | UX | Drag-from-palette vers PDF | Élevé | Élevé | Moyen |
| 3 | UX | Filtre fields par étape en Mode Document | Moyen | Élevé | Faible |
| 4 | Refactor | Splitter TemplateEditor en 5 sous-composants | Élevé | Élevé | Moyen |
| 5 | UX | Supprimer/cacher "Re-générer auto" maintenant que l'IA existe | Faible | Moyen | Faible |
| 6 | UX | Bouton "Champs orphelins" dans Mode Document toolbar | Faible | Moyen | Faible |
| 7 | Bug visuel | Déplacer badge `⚙N` en haut-droite pour éviter chevauchement | Faible | Faible | Faible |
| 8 | UX | Tooltip dans `<details>` Avancé renommé "Tooltip technique (avancé)" + warning quand divergent du Libellé | Faible | Moyen | Faible |
| 9 | UX | Drag réordonnement des étapes dans la sidebar (pas seulement ↑↓) | Moyen | Moyen | Faible |
| 10 | Perf | `useCallback` sur les handlers `<Stage>` | Faible | Faible | Faible |
| 11 | Perf | Mémoïser `visible = fields.filter(...)` dans FieldsCanvas | Faible | Faible | Faible |
| 12 | UX | Note d'étape (description) RÉ-INTRODUIRE en option (régression v2.4.0) | Moyen | Moyen | Faible |
| 13 | Sécurité | clamp01 sur (x+width) et (y+height) dans `normalizeFields` | Faible | Moyen | Faible |
| 14 | UX | Bouton "Tester en preview" sur un step → ouvre directement le step dans WizardPreview | Faible | Moyen | Faible |
| 15 | Bug | Vérifier flicker `disabled` du bouton Enregistrer | Faible | Élevé | Faible |
| 16 | Refactor | Extraire `applyCheckboxGroupRule` dupliqué entre SignWizard et PublicFieldsLayer | Faible | Faible | Faible |
| 17 | UX | Tooltip Konva sur badges `⚙N` et `🏷section` | Moyen | Moyen | Faible |
| 18 | Perf | Pagination IA enrichment >5 docs (éviter timeout Vercel 120s) | Moyen | Élevé | Faible |
| 19 | UX | Renommer "Re-générer auto" → "Recalculer structure (heuristique)" si conservé | Faible | Faible | Faible |
| 20 | UX | Bouton "Réinitialiser tout l'éditeur" (cas extrême : tout supprimer) | Faible | Faible | Moyen |

### 📊 Comparaison DocuSign honnête

| Critère | DocuSign | TalentFlow Sign | Verdict |
|---|---|---|---|
| Placement fields | Drag + Click | Click only | DocuSign supérieur |
| Multi-select / Align | Basique | Excellent (Figma-like) | **TF supérieur** |
| Lasso | Non | Oui | **TF supérieur** |
| Snap guides | Oui | Oui | Égalité |
| Resize ratio fixe signature | Oui | Oui | Égalité |
| Wizard mobile candidat | Non (mode formulaire générique) | Excellent | **TF supérieur** |
| Preview live admin | Oui mais lent | Excellent (iPhone, debounce, memo) | **TF supérieur** |
| Auto-fill ATS contextuel | Limité (CRM Salesforce uniquement) | Natif (Supabase candidats) | **TF supérieur** |
| Conditional logic (UI) | Excellent (parent label + value) | Bon (operator+value+action) | DocuSign supérieur |
| Formulas | Riche (DateAdd, SumIf, conditional) | Basique (sum/avg/mul/min/max/sub) | DocuSign supérieur |
| Multi-language | Oui | Non | DocuSign supérieur |
| Bulk send 1→1000 | Oui | Non | DocuSign supérieur |
| Routing conditionnel | Oui | Linéaire | DocuSign supérieur |
| Webhooks | 200+ | 0 | DocuSign supérieur |
| Validation regex live au signing | Oui | Au submit only | DocuSign supérieur |
| Reminder per-signer config | Oui | Cron global | DocuSign supérieur |
| Stamp / Notarize | Oui | Non | DocuSign supérieur |
| AI auto-detection fields | Limité (AutoTagging) | Excellent (Claude Vision + L-Agence prompt) | **TF supérieur** |
| Coût mensuel L-Agence | €100-500 | €0 + tokens Anthropic | **TF supérieur** |
| Certif suisse ZertES intégré | Payant haut tarif | Inclus | **TF supérieur** |
| Stabilité éditeur (un non-dev seul) | Excellent (équipe 1000+ devs) | Bon mais fragile (TemplateEditor 3872 LOC) | DocuSign supérieur |

**Score** : 11/20 TF / 9/20 DocuSign. TF gagne sur les **points clés du use-case L-Agence** (wizard mobile, IA, contexte ATS, coût). DocuSign reste meilleur sur les **fonctionnalités avancées** rarement utilisées par L-Agence.

### 🚀 Top 5 changements à plus haut impact (classés)

#### **#1 — Splitter `TemplateEditor.tsx` (3872 LOC) en 5-6 composants** ⭐⭐⭐⭐⭐
**Pourquoi** : c'est la dette technique #1. Chaque modif récente (bugs 1/5/6/8/10 v2.7.6) a coûté plus que prévu parce qu'on touche un mastodonte. Tant que ce fichier reste à 3800 lignes, chaque nouvelle feature ajoute du risque exponentiellement.

**Comment** :
- `TemplateEditorShell.tsx` (~400 LOC) : layout 2 colonnes, état parent, save handler
- `TemplateEditorPdfPanel.tsx` (~500 LOC) : PDF + FieldsCanvas + toolbar zoom/undo/redo/sections/steps
- `TemplateEditorToolbar.tsx` (~200 LOC) : palette outils par catégorie
- `TemplateEditorRecipients.tsx` (~300 LOC) : panel rôles éditable inline
- `SelectedFieldsPanel.tsx` extracté en fichier (~900 LOC, lui-même à splitter ensuite)
- `TypeSpecificOptions.tsx` extracté (~500 LOC)
- `ConditionalLogicEditor.tsx` + `MultiSelectConditionForm.tsx` extracté (~400 LOC)

Effort 3-4 jours. Risque : tester chaque sous-composant après split. Le tooling Bun/Next existant facilite (tsc strict).

#### **#2 — Drag from palette + filtre par étape en Mode Document** ⭐⭐⭐⭐
**Pourquoi** : double impact UX. Le drag élimine le 2-clic actuel. Le filtre par étape permet à João de focus quand un template a 80+ fields.

**Comment** :
- Palette : ajouter `draggable` HTML5 sur les boutons d'outils. Au drop sur Konva, intercepter `onDrop` via wrapper div parent du Stage et placer un field aux coords.
- Filtre : nouvelle `<select>` "Voir étape X" en toolbar Mode Document → filtre les fields rendus dans FieldsCanvas (les autres deviennent fantômes opacité 0.15).

Effort 1-2 jours. Risque faible.

#### **#3 — Vérifier et fixer le flicker du bouton Enregistrer (`disabled` fluctuant)** ⭐⭐⭐⭐
**Pourquoi** : c'est la régression sourde post-v2.7.4. Le label est stable mais le disabled bouge. João perçoit ça comme "ça clignote toujours" même si on lui dit que c'est corrigé.

**Comment** :
```tsx
// Au lieu de :
disabled={saving || !dirty}
// Faire :
const deferredSaving = useDeferredValue(saving)
const showSaving = deferredSaving && saving  // true seulement si persist > 1 frame
disabled={showSaving || !dirty}
```
Ou plus simple : un `useState` `[visibleSaving, setVisibleSaving]` qui n'active que si `saving` reste true > 200ms.

Effort 30min. Test en localhost : taper rapidement et observer le bouton.

#### **#4 — Supprimer ou archiver "Re-générer auto" + pagination IA** ⭐⭐⭐
**Pourquoi** : 3 chemins de génération étapes = confusion. La heuristique Y-clustering n'est utile QUE pour démarrer un template vide quand Claude API est indispo. L'IA est devenue le chemin nominal et fiable.

**Comment** :
- Soit supprimer le bouton (le code de `buildWizardSteps` reste comme fallback côté serveur pour la 1ère création).
- Soit cacher dans `<details>"Avancé"</details>` avec label "Recalculer (heuristique, écrase tout)".
- Pagination IA : batcher par groupes de 3 docs avec messages "Analyse 3/8 en cours…". Évite timeout 120s.

Effort 1 jour. Risque très faible.

#### **#5 — Bouton "Champs orphelins" dans Mode Document toolbar** ⭐⭐⭐
**Pourquoi** : vue globale absente en Mode Document. Un admin qui place 80 fields ne sait pas combien sont absents du wizard tant qu'il ne switch pas en Mode Wizard. Le warning per-field aide localement mais pas globalement.

**Comment** : copier le bouton + modal `OrphanFieldsModal` depuis `WizardEditor.tsx:648-667` vers le toolbar de Mode Document. Le composant `OrphanFieldsModal` est déjà autonome (props pures).

Effort 1h. Risque nul.

---

## Notes finales

Le module Sign de TalentFlow est **fonctionnel et utilisé en production**. Il a un **avantage différenciant clair** sur le couple Wizard mobile + IA enrichment + contexte ATS, qui justifie l'effort de remplacement de DocuSign.

Les **frustrations quotidiennes de João** convergent autour de **3 axes** :
1. **Latence / flicker** perçus → la cause principale est le re-render fréquent + auto-save trop visible sur quelques éléments (bouton disabled).
2. **Confusion sur les 3 chemins de génération étapes** (manuel / heuristique / IA) → simplifier en supprimant la heuristique.
3. **Le mastodonte TemplateEditor.tsx** rend chaque évolution risquée et coûteuse → split obligatoire à moyen terme.

Les **fonctionnalités manquantes vs DocuSign** sont **acceptables pour le scope L-Agence**. Si le produit doit un jour être commercialisé en SaaS, les gaps (formulas avancées, multi-language, webhooks, bulk send, routing conditionnel) deviendraient bloquants.

**Priorité absolue** : split du TemplateEditor + fix flicker bouton + drag palette + filtre étape. Tout le reste peut attendre.

Fichiers de référence pour les futures interventions :
- `/Users/joaobarbosa/Dev/talentflow/lib/sign/types.ts` (source de vérité types)
- `/Users/joaobarbosa/Dev/talentflow/components/sign/TemplateEditor.tsx` (à splitter)
- `/Users/joaobarbosa/Dev/talentflow/components/sign/FieldsCanvas.tsx` (Konva, peut accueillir React.memo)
- `/Users/joaobarbosa/Dev/talentflow/components/sign/WizardEditor.tsx` (à conserver tel quel — bien factorisé)
- `/Users/joaobarbosa/Dev/talentflow/components/sign/WizardPreview.tsx` (excellence patterns — modèle à reproduire)
- `/Users/joaobarbosa/Dev/talentflow/lib/sign/wizard-builder.ts` (heuristique, à archiver derrière l'IA)
- `/Users/joaobarbosa/Dev/talentflow/lib/sign/docusign-import.ts` (parser, stable)
