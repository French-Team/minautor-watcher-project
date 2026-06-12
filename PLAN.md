# Plan de Reprise — Watcher Service

## Statut général

**Phase actuelle :** 4 — Dette technique ✅
**Dernière mise à jour :** 11/06/2026

---

## Phases

### 🔴 Phase 1 — Correction des bugs bloquants ✅

| #   | Fichier                                             | Description                                     | Statut |
| --- | --------------------------------------------------- | ----------------------------------------------- | ------ |
| 1   | `src/index.ts:15,360`                               | Double export de `WatcherService`               | ✅     |
| 2   | `src/index.ts:114,149`                              | `eventBus` privé mais accédé de l'extérieur     | ✅     |
| 3   | `src/index.ts:203`                                  | `reloadConfig()` manquant sur `DetectionModule` | ✅     |
| 4   | `src/prevention/validators.ts`                      | `severity` absent de `ValidationWarning`        | ✅     |
| 5   | `src/trigger/rules.ts`                              | `error` absent de `TriggerResult`               | ✅     |
| 6   | `src/shared/utils.ts`                               | `Utils.fs` inexistant                           | ✅     |
| 7   | `src/trigger/notifiers.ts:161,168`                  | Types Slack `fields`/`elements` invalides       | ✅     |
| 8   | `src/trigger/correctors.ts:514,526,539`             | Signature constructeur `BaseCorrector` erronée  | ✅     |
| 9   | `src/prevention/config.ts` / `src/trigger/rules.ts` | Types Joi `Schema` vs `ObjectSchema`            | ✅     |
| 10  | `src/index.ts:364`                                  | `import.meta.url` mal comparé (Windows)         | ✅     |

**Vérification :** `npx tsc --noEmit` ✅ **|** `npx tsx src/index.ts --help` ✅

---

### 🟡 Phase 2 — Configuration du build ✅

| #   | Tâche                                                           | Statut |
| --- | --------------------------------------------------------------- | ------ |
| 1   | Créer `tsconfig.json` racine (target: ES2022, module: NodeNext) | ✅     |
| 2   | Ajouter `"type": "module"` dans `package.json`                  | ✅     |
| 3   | Corriger `"main"` vers `dist/index.js`                          | ✅     |
| 4   | Ajouter scripts `"build"`, `"clean"`, `"start:prod"`            | ✅     |
| 5   | Corriger `"lint"` pour cibler uniquement `*.ts`                 | ✅     |
| 6   | Renommer `eslint.config.js` → `.eslintrc.cjs` (compat. ESM)     | ✅     |
| 7   | Installer `@types/fs-extra`, `@types/nodemailer`                | ✅     |
| 8   | Corriger `unknown` dans les catch, `await` manquants, typo API  | ✅     |

**Vérification :** `npm run build` ✅ **|** `npm run typecheck` ✅ **|** `npm start -- --help` ✅

---

### 🟠 Phase 3 — Tests unitaires ✅

| #   | Tâche                            | Statut | Tests |
| --- | -------------------------------- | ------ | ----- |
| 1   | Configurer Jest + ts-jest (ESM)  | ✅     | —     |
| 2   | Tests `shared/utils.ts`          | ✅     | 18    |
| 3   | Tests `detection/filters.ts`     | ✅     | 12    |
| 4   | Tests `prevention/validators.ts` | ✅     | 11    |
| 5   | Tests `trigger/notifiers.ts`     | ✅     | 13    |
| 6   | Tests `prevention/config.ts`     | ❌     | —     |
| 7   | Tests `detection/watcher.ts`     | ❌     | —     |

**Résultat :** 54 tests, 4 suites, 0 échec ✅

---

### 🟢 Phase 4 — Dette technique & fonctionnalités

| #   | Tâche                                                             | Statut |
| --- | ----------------------------------------------------------------- | ------ |
| 1   | Nettoyer `createIgnorePatterns` (doublons)                        | ✅     |
| 2   | Centraliser les shutdown handlers dans l'orchestrateur            | ✅     |
| 3   | Implémenter custom actions (`trigger/index.ts:448`)               | ✅     |
| 4   | Implémenter text insertion/deletion (`correctors.ts:240,250`)     | ✅     |
| 5   | Intégrer les conditions/notifications depuis `trigger-rules.json` | ✅     |

---

### 🔵 Phase 5 — Corrections résiduelles (11/06/2026) ✅

| #   | Fichier                                  | Description                                         | Statut |
| --- | ---------------------------------------- | --------------------------------------------------- | ------ |
| 1   | `src/trigger/rules.ts`                   | Fichier vide → reconstruit depuis le JS compilé     | ✅     |
| 2   | `src/trigger/correctors.ts:242,341`      | Regex non échappé (`console.log(` → crash)          | ✅     |
| 3   | `src/index.ts:317,352`                   | `JSON.stringify(...)` sans `console.log()`          | ✅     |
| 4   | `tests/prevention/validators.test.ts:55` | Contenu de test ne contenant pas `console.log(`     | ✅     |
| 5   | `src/trigger/rules.ts`                   | Convertisseur legacy → moderne (trigger-rules.json) | ✅     |

**Vérification :** `npm run typecheck` ✅ **|** `npm test` (54/54) ✅ **|** `npm run build` ✅

---

## Problèmes connus (icebox)

- Support YAML : dépendance optionnelle `yaml` non listée dans `package.json`
- Suppression des émojis des notifications (compatibilité terminal)
- Support des notifications HTTP/webhook
- ESLint : config `.eslintrc.cjs` référence `@typescript-eslint/recommended` non installé

---

## Légende

| Symbole | Signification            |
| ------- | ------------------------ |
| ❌      | Pas commencé             |
| 🔄      | En cours                 |
| ✅      | Terminé                  |
| ➖      | Non applicable / reporté |
