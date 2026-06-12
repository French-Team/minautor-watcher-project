# Plan de Developpement V2 - Watcher Service

> Cree le 12 juin 2026

## Objectif

Passer de V1 (fonctionnel) a V2 (production-ready) en 4 versions mineures, en traitant secu, architecture, performance et DX dans cet ordre de priorite.

---

## V2.0 - Securite + Stabilite

**Objectif** : Eliminer les failles de securite et corriger les bugs critiques de fiabilite.

**Estimation** : 2-3 jours

### 2.0.1 Injection de commandes

**Fichiers** : `src/trigger/correctors.ts`, `src/prevention/validators.ts`

Le probleme : Tous les appels `execAsync(\`npx eslint "${filePath}"\`)` interpolent des paths dans des commandes shell. Un fichier avec `"` ou `$()` dans le nom peut injecter du shell.

**Solution** : Remplacer `execAsync(string)` par `spawn` avec tableau d'arguments.

```
- Remplacer execAsync par spawn("npx", ["eslint", "--fix", filePath])
- Sanitizer les paths avant usage
- Ajouter un validateur de path (pas de .., pas de caracteres dangereux)
```

### 2.0.2 Execution arbitraire de scripts

**Fichier** : `src/trigger/index.ts`

Le probleme : `config.script` est execute directement via `execSync`. Template substitution naive.

**Solution** : Whitelist de commandes autorisees + `spawn()` au lieu de `execSync()`.

```
- Limiter les scripts aux commandes d'un whitelist defini en config
- Utiliser spawn() au lieu de execSync()
- Logger chaque script execute avec son contexte
- Ajouter "allowedCommands" dans la config trigger
```

### 2.0.3 HTML injection dans les emails

**Fichier** : `src/trigger/notifiers.ts`

Le probleme : Noms de fichiers et messages d'erreur inseres dans le HTML sans escaping.

**Solution** : Creer `escapeHtml()` dans `utils.ts`, appliquer sur tout contenu utilisateur.

### 2.0.4 File locking pour corrections

**Fichier** : `src/trigger/correctors.ts`

Le probleme : ESLint et Prettier peuvent ecrire sur le meme fichier en meme temps.

**Solution** : Serialiser les corrections par fichier avec un `Map<string, Promise<void>>`.

```
- Avant chaque writeFile, acquerir le lock
- Liberer le lock apres ecriture
- Timeout 10s pour eviter les deadlocks
```

### 2.0.5 Retry + Circuit Breaker

**Fichier** : `src/trigger/index.ts`

Le probleme : `retryAttempts: 3` est declare mais jamais utilise. Pas de circuit breaker.

**Solution** : Retry avec backoff exponentiel + circuit breaker (CLOSED -> OPEN -> HALF_OPEN).

```
- Config : retryAttempts, retryDelay, circuitBreakerThreshold, circuitBreakerTimeout
- Backoff : 1s, 2s, 4s
- Circuit breaker : apres N echecs consecutifs, desactiver temporairement
```

### 2.0.6 Fix metrics bug

**Fichier** : `src/index.ts`

Le probleme : `fileModified` increment `filesCorrected++` meme si prevention echoue.

**Solution** : Conditionner l'increment sur `preventionResult.success`.

### 2.0.7 Double enregistrement signaux

**Fichiers** : `src/detection/index.ts`, `src/index.ts`

Le probleme : SIGINT/SIGTERM enregistres dans les deux fichiers.

**Solution** : Centraliser le shutdown dans `index.ts` uniquement. Supprimer de `detection/index.ts`.

### 2.0.8 WrapAsyncHandler pour event listeners

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

## V2.2 - Performance

**Objectif** : Reduire la latence et l'usage memoire sur les gros projets.

**Estimation** : 2-3 jours

### 2.2.1 Batch ESLint/Prettier

**Fichiers** : `src/trigger/correctors.ts`, `src/prevention/validators.ts`

Le probleme : Un `npx eslint`/`npx prettier` par fichier. 100 fichiers = 200+ spawns.

**Solution** : Batch processing + API programmatique.

```
- Debounce 500ms pour collecter les fichiers
- Appel unique : eslint --fix file1 file2 file3
- Ou API : new ESLint({ fix: true }).lintFiles([...])
- Batch max 50 fichiers par appel
```

### 2.2.2 Cache ESLint/Prettier availability

**Fichier** : `src/prevention/validators.ts`

Le probleme : `checkESLintAvailability()` spawn un subprocess a chaque validation.

**Solution** : Verifier une seule fois au demarrage. Re-verifier apres `reloadConfig()`.

### 2.2.3 Async I/O dans les hot paths

**Fichiers** : `src/prevention/validators.ts`, `src/prevention/config.ts`

Le probleme : `readFileSync` et `statSync` bloquent l'event loop.

**Solution** : Passer en `await fs.readFile` / `await fs.stat`.

### 2.2.4 Bounded processing queue

**Fichier** : `src/detection/watcher.ts`

Le probleme : `processingQueue` non borne (fuite memoire sur monorepos).

**Solution** : LRU eviction avec `maxQueueSize` (defaut 1000).

### 2.2.5 Supprimer extensions checking en double

**Fichiers** : `src/detection/watcher.ts`, `src/detection/filters.ts`

Le probleme : Verification d'extension en double.

**Solution** : Unifier dans `FileFilter` uniquement.

### 2.2.6 Structured logging pour Docker

**Fichier** : `src/shared/logger.ts`

**Solution** : Option `LOG_FORMAT=json` pour le console transport.

### Tests V2.2

```
- Benchmark : 100 fichiers, temps avant/apres batch
- Test memoire : 10000 fichiers, taille queue bornee
- Test async I/O : pas de block event loop
```

---

## V2.3 - Developer Experience

**Objectif** : Rendre le service facile a deployer, debugger et etendre.

**Estimation** : 2-3 jours

### 2.3.1 Health check HTTP

**Fichier** : Nouveau `src/server/http.ts`

**Solution** : Serveur HTTP minimal avec `node:http` (pas Express).

```
- Option --port ou env PORT pour activer
- GET /health : { status, uptime, modules }
- GET /ready : 200 si initialized, 503 sinon
- GET /metrics : metriques Prometheus
- Desactive par defaut
```

### 2.3.2 Diff/Preview mode (dry-run)

**Fichier** : Nouvelle commande CLI

**Solution** : Commande `preview` qui simule les corrections sans ecrire.

```
watcher preview -f "file.ts"
watcher preview -d "src/" --diff

- Affiche diff unifie (vert/rouge)
- Resumer : X corrections, Y erreurs
```

### 2.3.3 Graceful shutdown avec drain

**Fichier** : `src/index.ts`

**Solution** : Mode drain — finir les traitements en cours avant arret.

```
- Flag draining = true quand stop() est appele
- Nouveaux events ignores
- Traitements en cours continuent
- Timeout configurable (defaut 10s) puis arret force
```

### 2.3.4 Version dynamique

**Fichier** : `src/index.ts`

**Solution** : Lire `package.json` au lieu du hardcode `"1.0.0"`.

### 2.3.5 Observabilite metriques

**Solution** : Exporter les metriques en Prometheus format sur `/metrics`.

```
- watcher_files_processed_total
- watcher_files_corrected_total
- watcher_files_failed_total
- watcher_processing_time_ms
- watcher_uptime_seconds
```

### 2.3.6 Rollback automatique

**Fichier** : `src/trigger/correctors.ts`

Le probleme : Le contenu original est dans `result.originalContent` mais jamais sauvegarde.

**Solution** :

```
- Avant chaque correction, creer un backup (.bak)
- Apres correction, verifier que le fichier est valide
- En cas d'echec, restaurer le backup
- Nettoyer les .bak apres 24h ou au prochain demarrage
```

### Tests V2.3

```
- Tests health check (200/503 selon etat)
- Tests preview/dry-run (pas d'ecriture sur disque)
- Tests graceful drain (traitements en cours finissent)
- Tests rollback (restauration apres echec)
```

---

## Ordre de realisation

```
V2.0 (Securite + Stabilite)     -> 2-3 jours
  2.0.1 Injection de commandes
  2.0.2 Scripts arbitraires
  2.0.3 HTML injection
  2.0.4 File locking
  2.0.5 Retry + Circuit Breaker
  2.0.6-2.0.8 Bug fixes

V2.1 (Architecture)             -> 3-4 jours
  2.1.1 Extraction CLI
  2.1.2 Typage complet
  2.1.3 Injection de dependances
  2.1.4 EventBus non-singleton
  2.1.5 Plugins
  2.1.6 Config unifiee

V2.2 (Performance)              -> 2-3 jours
  2.2.1 Batch ESLint/Prettier
  2.2.2 Cache availability
  2.2.3 Async I/O
  2.2.4 Queue bornee
  2.2.5-2.2.6 Optimisations filtre/logging

V2.3 (Developer Experience)     -> 2-3 jours
  2.3.1 Health check HTTP
  2.3.2 Preview mode
  2.3.3 Graceful drain
  2.3.4-2.3.6 Version/metriques/rollback
```

**Estimation totale V2** : 9-13 jours
