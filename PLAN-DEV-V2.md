# Plan de Developpement V2 - Watcher Service

> Cree le 12 juin 2026

## Objectif

Passer de V1 (fonctionnel) a V2 (production-ready) en 4 versions mineures, en traitant secu, architecture, performance et DX dans cet ordre de priorite.

---

## V2.0 - Securite + Stabilite ✅

**Objectif** : Eliminer les failles de securite et corriger les bugs critiques de fiabilite.

**Statut** : ✅ COMPLETE - 121/121 tests passent

### 2.0.1 Injection de commandes ✅

**Fichiers** : `src/trigger/correctors.ts`, `src/prevention/validators.ts`

Le probleme : Tous les appels `execAsync(\`npx eslint "${filePath}"\`)` interpolent des paths dans des commandes shell. Un fichier avec `"` ou `$()` dans le nom peut injecter du shell.

**Solution** : Remplacer `execAsync(string)` par `spawn` avec tableau d'arguments.

```
- Remplacer execAsync par spawn("npx", ["eslint", "--fix", filePath])
- Sanitizer les paths avant usage
- Ajouter un validateur de path (pas de .., pas de caracteres dangereux)
```

### 2.0.2 Execution arbitraire de scripts ✅

**Fichier** : `src/trigger/index.ts`

Le probleme : `config.script` est execute directement via `execSync`. Template substitution naive.

**Solution** : Whitelist de commandes autorisees + `spawn()` au lieu de `execSync()`.

```
- Limiter les scripts aux commandes d'un whitelist defini en config
- Utiliser spawn() au lieu de execSync()
- Logger chaque script execute avec son contexte
- Ajouter "allowedCommands" dans la config trigger
```

### 2.0.3 HTML injection dans les emails ✅

**Fichier** : `src/trigger/notifiers.ts`

Le probleme : Noms de fichiers et messages d'erreur inseres dans le HTML sans escaping.

**Solution** : Creer `escapeHtml()` dans `utils.ts`, appliquer sur tout contenu utilisateur.

### 2.0.4 File locking pour corrections ✅

**Fichier** : `src/trigger/correctors.ts`

Le probleme : ESLint et Prettier peuvent ecrire sur le meme fichier en meme temps.

**Solution** : Serialiser les corrections par fichier avec un `Map<string, Promise<void>>`.

```
- Avant chaque writeFile, acquerir le lock
- Liberer le lock apres ecriture
- Timeout 10s pour eviter les deadlocks
```

### 2.0.5 Retry + Circuit Breaker ✅

**Fichier** : `src/trigger/index.ts`

Le probleme : `retryAttempts: 3` est declare mais jamais utilise. Pas de circuit breaker.

**Solution** : Retry avec backoff exponentiel + circuit breaker (CLOSED -> OPEN -> HALF_OPEN).

```
- Config : retryAttempts, retryDelay, circuitBreakerThreshold, circuitBreakerTimeout
- Backoff : 1s, 2s, 4s
- Circuit breaker : apres N echecs consecutifs, desactiver temporairement
```

### 2.0.6 Fix metrics bug ✅

**Fichier** : `src/index.ts`

Le probleme : `fileModified` increment `filesCorrected++` meme si prevention echoue.

**Solution** : Conditionner l'increment sur `preventionResult.success`.

### 2.0.7 Double enregistrement signaux ✅

**Fichiers** : `src/detection/index.ts`, `src/index.ts`

Le probleme : SIGINT/SIGTERM enregistres dans les deux fichiers.

**Solution** : Centraliser le shutdown dans `index.ts` uniquement. Supprimer de `detection/index.ts`.

### 2.0.8 WrapAsyncHandler pour event listeners ✅

**Fichier** : `src/index.ts`

Le probleme : `EventUtils.wrapAsyncHandler()` existe mais n'est jamais utilise.

**Solution** : Wrappeder chaque handler async dans `setupModuleCommunication()`.

### Tests V2.0

```
- Tests d'injection de commandes (paths avec caracteres speciaux)
- Tests de file locking (concurrent writes)
- Tests de circuit breaker (echecs consecutifs)
- Tests de retry (erreurs transitoires)
- Tests de metrics (fileModified avec succes/echec)
```

---

## V2.1 - Architecture

**Objectif** : Rendre le code maintenable, testable et extensible.

**Estimation** : 3-4 jours

### 2.1.1 Extraire la CLI

**Fichier** : `src/index.ts` (960 lignes)

Le probleme : `WatcherCLI` (610 lignes) dans le meme fichier que `WatcherService`.

**Solution** :

```
- Creer src/cli/index.ts avec WatcherCLI
- Creer src/cli/commands/ pour chaque commande
- Garder WatcherService dans src/index.ts
```

### 2.1.2 Typage complet (eliminer les any)

**Fichiers** : Tous (~90 warnings ESLint)

**Solution** : Creer `src/types/` avec des interfaces pour tous les contrats publics.

```
src/types/
  watcher-config.ts  : WatcherConfig, DetectionConfig
  prevention.ts      : PreventionProcessResult, PreventionRuleConfig
  trigger.ts         : TriggerActionConfig, TriggerConditionConfig
  common.ts          : ModuleStatus, ServiceMetrics, FileEvent
```

### 2.1.3 Injection de dependances

**Fichiers** : `src/detection/index.ts`, `src/prevention/index.ts`, `src/trigger/index.ts`

**Solution** : Accepter les dependances en option dans les factory functions.

```
- createDetectionModule(config, eventBus?)
- createPreventionModule(config?, validatorRegistry?, scriptRunner?)
- createTriggerModule(config?, correctorRegistry?, notifierRegistry?)
```

### 2.1.4 EventBus non-singleton

**Fichier** : `src/detection/events.ts`

Le probleme : `export const eventBus` est un singleton global.

**Solution** : Supprimer l'export singleton. Chaque module cree son propre eventBus.

### 2.1.5 Systeme de plugins

**Solution** : Registry config-driven + import dynamique de plugins custom.

```
{
  "plugins": {
    "correctors": ["./my-corrector.js"],
    "validators": ["./my-validator.js"],
    "notifiers": ["./my-notifier.js"]
  }
}
```

### 2.1.6 Config unifiee

**Solution** : Un seul `watcher.config.json` avec tout. Retrocompatibilite avec l'ancien format.

```
{
  "watchDir": "...",
  "modules": { "detection": {...}, "prevention": {...}, "trigger": {...} },
  "notifications": {...},
  "plugins": [...]
}
```

### Tests V2.1

```
- Tests d'injection de dependances
- Tests de plugin loading
- Tests de config unifiee
- Typecheck strict sans aucun warning any
```

---

## V2.2 - Performance ✅

**Objectif** : Reduire la latence et l'usage memoire sur les gros projets.

**Statut** : ✅ COMPLETE - 125/125 tests passent, 0 erreurs ESLint

### 2.2.1 Batch ESLint/Prettier ✅

**Fichiers** : `src/trigger/correctors.ts`

**Fait** :
- `BaseCorrector.applyBatchCorrection(files)` : batch 50 fichiers par defaut
- `ESLintFixCorrector.applyBatchCorrection()` : un seul `npx eslint --fix` pour N fichiers
- `PrettierFormatCorrector.applyBatchCorrection()` : un seul `npx prettier --write` pour N fichiers
- `CorrectorRegistry.applyBatchCorrections()` : orchestre le batch sur tous les correcteurs

### 2.2.2 Cache ESLint/Prettier availability ✅

**Fichier** : `src/prevention/validators.ts`

**Fait** :
- `eslintAvailable` cache global, verifie une seule fois au demarrage
- Fallback gracieux si eslint non disponible

### 2.2.3 Async I/O dans les hot paths ✅

**Fichiers** : `src/prevention/config.ts`, `src/prevention/index.ts`, `src/prevention/validators.ts`

**Fait** :
- `PreventionConfigManager` : factory async `static async create()` (constructeur prive)
- `getRulesForFile()` : async, utilise `await fs.stat()` au lieu de `statSync`
- `loadDefaultConfig()` : async, lit les fichiers de config sans bloquer
- `reloadConfig()` : async
- `createPreventionConfig()` : async
- `PreventionModule` : factory async `static async create()`
- `createPreventionModule()` : async
- `getCodeSnippet()` : async dans validators.ts
- Tests mis a jour : 14 appels `new PreventionConfigManager()` remplaces par `await PreventionConfigManager.create()`

### 2.2.4 Bounded processing queue ✅

**Fichier** : `src/detection/watcher.ts`

**Fait** :
- `maxQueueSize` (defaut 1000) dans `WatcherConfig`
- LRU eviction dans `handleFileEvent()` : evicts oldest Map entry quand plein
- Log warning quand eviction se produit

### 2.2.5 Documentation extension checking double ✅

**Fichiers** : `src/detection/index.ts`

**Fait** :
- Documente que les extensions sont filtrees par `Watcher.shouldProcessFile()` ET `FileFilter.filterByExtension()`
- Double-check intentionnel pour defense-in-depth quand FileFilter est utilise standalone

### 2.2.6 Structured logging ✅

**Fichier** : `src/shared/logger.ts`

**Fait** :
- Variable d'environnement `LOG_FORMAT=json` active le format JSON pour le console transport
- Par defaut : format humain colore (inchange)
- Utile pour Docker/ELK qui consomment du JSON

### Tests V2.2

```
- Benchmark : 100 fichiers, temps avant/apres batch
- Test memoire : 10000 fichiers, taille queue bornee
- Test async I/O : pas de block event loop
```

---

## V2.3 - Developer Experience ✅

**Objectif** : Rendre le service facile a deployer, debugger et etendre.

**Statut** : ✅ COMPLETE - 137/137 tests passent, 0 erreurs ESLint

### 2.3.1 Health check HTTP ✅

**Fichier** : `src/server/http.ts`

**Fait** :
- Serveur HTTP minimal avec `node:http` (pas Express)
- GET `/health` : status detaille (ok/stopped, uptime, modules)
- GET `/ready` : readiness probe (200 si initialized, 503 sinon)
- GET `/metrics` : format Prometheus text
- Active via `PORT` env ou `config.port`
- Desactive par defaut
- 7 tests unitaires

### 2.3.2 Preview mode (dry-run) ✅

**Fichier** : `src/cli/index.ts`

**Fait** :
- Commande `watcher preview <files...>`
- Dry-run via parametre `dryRun` sur `applyCorrection()`
- Affiche diff unifie (vert/rouge) sans ecrire
- Resumer : X corrections sur Y fichiers

### 2.3.3 Graceful shutdown avec drain ✅

**Fichiers** : `src/index.ts`, `src/types/common.ts`

**Fait** :
- Flag `draining` empeche les nouveaux events
- Compteur `activeTasks` + resolveurs pour drain
- `drainTimeout` configurable (defaut 10s)
- Nouveaux events ignores pendant le drain
- Traitements en cours finissent avant arret
- `isDraining()` expose

### 2.3.4 Version dynamique ✅

**Fichier** : `src/cli/index.ts`

**Fait** :
- Lit `package.json` au lieu du hardcode `"1.0.0"`
- `fs.readJsonSync()` au demarrage du CLI

### 2.3.5 Metriques Prometheus ✅

**Fichier** : `src/server/http.ts`

**Fait** :
- Endpoint `/metrics` en format Prometheus text
- `watcher_files_processed_total`, `watcher_files_corrected_total`, `watcher_files_failed_total`
- `watcher_processing_time_ms`, `watcher_uptime_seconds`

### 2.3.6 Rollback automatique ✅

**Fichiers** : `src/trigger/correctors.ts`

**Fait** :
- `writeFileWithBackup()` : crée `.bak` avant écriture
- `restoreFromBackup()` : restaure depuis `.bak`
- `cleanupBackups()` : supprime les `.bak` > 24h
- Integre dans `TextReplacementCorrector.applyCorrection()`
- 4 tests unitaires (backup creation, restore, cleanup)

---

## V2.1 - Architecture ✅

**Objectif** : Rendre le code maintenable, testable et extensible.

**Statut** : ✅ COMPLETE - 137/137 tests passent, 0 erreurs ESLint

### 2.1.1 Extraction CLI ✅

**Fichier** : `src/cli/index.ts`, `src/index.ts`

**Fait** :
- `WatcherCLI` extraite (~600 lignes) vers `src/cli/index.ts`
- `src/index.ts` exporte uniquement `WatcherService` (default export) + `ServiceMetrics`
- Import dynamique du CLI via `await import("./cli/index.js")`
- Accesseurs publics `getPreventionModule()` / `getTriggerModule()` ajoutes

### 2.1.2 Typage complet ✅

**Fichiers** : `src/types/`, `src/trigger/rules.ts`, `src/trigger/index.ts`

**Fait** :
- Types crees : `WatcherServiceConfig`, `ServiceMetrics`, `ModuleStatus`, `ServiceStatus`, `Metadata`, `ErrorInfo`, `TriggerAction`, `TriggerActionResult`, `LegacyTriggerConfig`, `CustomValidatorConfig`, `CustomScriptConfig`, `LegacyPreventionConfig`
- `WatcherService.config` type `WatcherServiceConfig`
- `getStatus()` retourne `ServiceStatus`
- `TriggerRule`/`TriggerContext`/`TriggerResult` utilisons `unknown` au lieu de `any`
- `TriggerRule["actions"][number]` remplace tous les `any` pour les parametres action
- `NotificationLevel`/`NotificationChannel` importes et castes
- `error: unknown` remplace `error: any` dans `sendErrorNotification`
- `result` type etendu avec `Record<string, unknown>`

### 2.1.3 Injection de dependances ✅

**Fichiers** : Tous les modules et factories

**Fait** :
- `PreventionModule` : parametre `dependencies?` (validatorRegistry, scriptRunner, configManager)
- `TriggerModule` : parametre `dependencies?` (ruleManager, correctorRegistry, notifierRegistry)
- `DetectionModule` : parametre `dependencies?` (eventBus)
- Toutes les factories acceptent options `skipDefaults?` :
  - `createCorrectorRegistry({ skipDefaults? })`
  - `createNotifierRegistry({ skipDefaults? })`
  - `createValidatorRegistry({ skipDefaults? })`
  - `createScriptRunner({ skipDefaults? })`

### 2.1.4 EventBus non-singleton ✅

**Fichiers** : `src/detection/index.ts`, `src/detection/events.ts`

**Fait** :
- `DetectionModule` accepte `dependencies?.eventBus`
- Fallback sur le singleton `defaultEventBus` si non fourni
- Factory `createDetectionModule` accepte `dependencies?`
- Le singleton reste exporte pour retrocompatibilite

### 2.1.5 Plugin system ✅

**Fichiers** : `src/shared/plugin-registry.ts`, `src/types/plugin.ts`

**Fait** :
- Interfaces : `WatcherPlugin`, `PluginManifest`, `PluginContext`, `PluginLoaderConfig`
- `PluginRegistry` : register, unregister, loadPluginsFromDir, unregisterAll
- Chargement dynamique via `import()` de modules JS/TS
- Support enable/disable par nom de plugin
- Types exportes depuis `src/types/index.ts`

### 2.1.6 Config unifiee ✅

**Fichiers** : `src/shared/unified-config.ts`

**Fait** :
- Interface `WatcherConfig` avec sections prevention, trigger, plugins
- `loadUnifiedConfig()` : charge watcher.config.json en priorite
- Fallback sur fichiers legacy (prevention-rules.json, trigger-rules.json)
- `saveUnifiedConfig()` pour persister
- Validation Joi sur la config
- 4 tests unitaires

---

## Ordre de realisation

```
V2.0 (Securite + Stabilite)     -> 2-3 jours ✅
  2.0.1 Injection de commandes
  2.0.2 Scripts arbitraires
  2.0.3 HTML injection
  2.0.4 File locking
  2.0.5 Retry + Circuit Breaker
  2.0.6-2.0.8 Bug fixes

V2.1 (Architecture)             -> 3-4 jours ✅
  2.1.1 Extraction CLI
  2.1.2 Typage complet
  2.1.3 Injection de dependances
  2.1.4 EventBus non-singleton
  2.1.5 Plugins
  2.1.6 Config unifiee

V2.2 (Performance)              -> 2-3 jours ✅
  2.2.1 Batch ESLint/Prettier
  2.2.2 Cache availability
  2.2.3 Async I/O
  2.2.4 Queue bornee
  2.2.5-2.2.6 Optimisations filtre/logging

V2.3 (Developer Experience)     -> 2-3 jours ✅
  2.3.1 Health check HTTP
  2.3.2 Preview mode
  2.3.3 Graceful drain
  2.3.4 Version dynamique
  2.3.5 Metriques Prometheus
  2.3.6 Rollback automatique
```

**Estimation totale V2** : 9-13 jours
