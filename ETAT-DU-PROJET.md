# Etat du Projet - Watcher Service

> Derniere mise a jour : 15 juin 2026

## Vision generale

Le watcher service est un pipeline a 5 modules qui surveille un dossier, valide les fichiers modifies via des chaines sequentielles, applique des corrections automatiques, injecte des fichiers de consignes pour les agents IA, et envoie des notifications.

```
fs.watch natif (surveillance, 1 handle Windows)
  -> Detection (filtrage + debounce + .watchignore)
    -> Processor (N chaines sequentielles)
      -> Prevention (validation + scripts + injection ESLint)
        -> Trigger (corrections + notifications)

  -> Injection (fichiers consignes agents IA)
  -> Environment (banner, doctor, outils)
  -> Monitor (CPU/memoire/heap toutes les 5s)
```

---

## Statut par module

### 1. Detection (surveillance des fichiers) - COMPLET

| Composant | Statut | Details |
|-----------|--------|---------|
| `watcher.ts` | Fonctionnel | `fs.watch` natif (`recursive: true`), 1 seul handle Windows, debouncing, filtrage extension, `.watchignore` |
| `events.ts` | Fonctionnel | EventBus typé avec 10 types d'evenements |
| `filters.ts` | Fonctionnel | 5 types de filtres (extension, patterns, taille, date) + presets |
| `index.ts` | Fonctionnel | Orchestre Watcher + Filter + EventBus, rechargement config |

**Watcher natif** : `fs.watch(dir, { recursive: true })` utilise un seul handle `ReadDirectoryChangesW` au lieu de milliers de watchers par sous-dossier (Chokidar). CPU ~0% au repos.

**Fichier `.watchignore`** : Syntaxe gitignore pour exclure des fichiers/dossiers. Les exclusions par defaut (`node_modules`, `.git`, `dist`, `build`, `.cache`, `.next`, `.nuxt`, `coverage`, `__pycache__`) sont toujours actives.

**Scan initial** : `scanInitialFiles()` compte les fichiers existants sans emettre d'evenements. Le pipeline ne demarre que pour les vrais changements fs.watch.

### 1b. Processor (chaines de traitement) - COMPLET

| Composant | Statut | Details |
|-----------|--------|---------|
| `processing-chain.ts` | Fonctionnel | File d'attente + traitement sequentiel par fichier : prevent -> correct -> re-prevent -> suivant |
| `chain-orchestrator.ts` | Fonctionnel | N chaines (defaut 5), distribution au moins charge |

**Principe** : Chaque chaine traite **un fichier de bout en bout** avant de passer au suivant. `setImmediate` cede l'event loop entre chaque fichier. Le CPU n'est plus sature.

**Config** : `CHAIN_COUNT=5` (variable d'env, defaut 5 chaines).

### 2. Prevention (validation et scripts) - COMPLET

| Composant | Statut | Details |
|-----------|--------|---------|
| `validators.ts` | Fonctionnel | ESLint, JSON, YAML (optionnel), Pattern validators + injection config ESLint auto |
| `scripts.ts` | Fonctionnel | ScriptRunner avec timeout/abort, 5 scripts predefinis |
| `config.ts` | Fonctionnel | Validation Joi, 6 regles par defaut, CRUD complet, rechargement |
| `index.ts` | Fonctionnel | Pipeline processFile -> processRule -> validator + scripts, validateurs custom |

**Scripts predefinis** : `eslint-fix`, `prettier-format`, `typescript-check`, `security-audit`, `dependency-check`

**Injection ESLint** : Si un projet analyse n'a pas de config ESLint, le watcher detecte TS/JS et injecte `.eslintrc.json` automatiquement.

### 3. Trigger (corrections et notifications) - COMPLET

| Composant | Statut | Details |
|-----------|--------|---------|
| `correctors.ts` | Fonctionnel | ESLintFix, PrettierFormat, TextReplacement (enabled par defaut), Command |
| `rules.ts` | Fonctionnel | Matching de regles, cooldowns, convertisseur legacy |
| `notifiers.ts` | Fonctionnel | Slack, Email (skip si credentials manquants), Console, File notifiers |
| `index.ts` | Fonctionnel | Pipeline processEvent -> executeRule -> 5 types d'actions, parseFileSize |

**Types d'actions supportes** : `correct`, `notify`, `log`, `skip`, `custom`

### 4. Shared (utilitaires) - COMPLET

| Composant | Statut | Details |
|-----------|--------|---------|
| `logger.ts` | Fonctionnel | Winston + chalk : console + logs/error.log + logs/combined.log, niveau success (lime green) |
| `utils.ts` | Fonctionnel | 10 utilitaires, parseFileSize, schemas Joi de configuration |
| `config-schema.ts` | Nouveau | Schemas Joi pour validation externe des configs |

### 5. Entree principale (CLI + orchestration) - COMPLET

| Composant | Statut | Details |
|-----------|--------|---------|
| `WatcherService` | Fonctionnel | Orchestre les 3 modules, communication inter-modules, metriques, signal handlers |
| `WatcherCLI` | Fonctionnel | 11 commandes : start, stop, status, reload, test, config, test-all, scan, analyze, env, doctor |

**CLI amelioree** : Couleurs (chalk), formatage, flags `--no-prevention`/`--no-trigger` operationnels

**Signal handlers** : SIGINT/SIGTERM (arret gracieux), SIGUSR1 (reload config), SIGUSR2 (restart gracieux, Unix)

### 6. Environment (V4 : Conscience d'environnement) - COMPLET

| Composant | Statut | Details |
|-----------|--------|---------|
| `system-info.ts` | Fonctionnel | OS, CPU, RAM, GPU (registry QWORD), reseau (netsh + ipconfig), date/annee |
| `tool-detector.ts` | Fonctionnel | Detection outils PATH + versions, cache, suggestions d'installation |
| `dev-environment.ts` | Fonctionnel | IDE (VS Code, JetBrains, Sublime, Vim), shell, Docker, WSL, CI |
| `env-reporter.ts` | Fonctionnel | Agrège tout, genere le banner (compact + complet) |

**Banner compact** : `scripts/env-banner.cjs` — GPU VRAM via registry `qwMemorySize` (QWORD), reseau via `netsh`+`ipconfig`, RAM used/total %

**Installer dynamique** : `scripts/install-tools.cjs` — detecte + installe automatiquement les outils manquants via npm

### 7. Monitor (surveillance systeme) - COMPLET

| Composant | Statut | Details |
|-----------|--------|---------|
| `resource-monitor.ts` | Fonctionnel | CPU/memoire/heap toutes les 5s, alertes a 70%/90%, `timer.unref()` |

**Alertes** : CPU > 70% (warn), CPU > 90% (error), memoire > 80% (warn). Logs structures avec metriques en temps reel.

---

## Bugs corriges

| # | Fichier | Description | Statut |
|---|---------|-------------|--------|
| 1 | `src/detection/index.ts` | Double handler d'evenements | Corrige - un seul handler via setupWatcherEventForwarding |
| 2 | `src/index.ts` | `getStatus().running` toujours false | Corrige - flag isRunning dans start()/stop() |
| 3 | `src/index.ts` | Pas de forwarding fileDeleted | Corrige - evenement forward au TriggerModule |
| 4 | `src/prevention/index.ts` | Enregistrement validateurs custom = stub | Corrige - PatternValidator instances creees et enregistrees |
| 5 | `src/detection/index.ts` | `reloadConfig()` ne fait rien | Corrige - rechargement complet du watcher et filtre |
| 6 | `config/prevention-rules.json` | Format incompatible avec le code | Corrige - adapte au schema PreventionRule |
| 7 | `src/trigger/correctors.ts` | TextReplacement par defaut dangereux | Corrige - enabled par defaut avec guard |
| 8 | `src/trigger/index.ts` | Comparaison maxFileSize string vs number | Corrige - Utils.parseFileSize() convertit les chaines |
| 9 | `src/prevention/config.ts` | addRule() utilise extract("items") inexistant | Corrige - schema Joi inline |
| 10 | `src/prevention/config.ts` | loadDefaultConfig() appelle async sans await | Corrige - utilise fs.readJsonSync() |
| 11 | `src/trigger/correctors.ts` | Incoherence newContent vs newText | Corrige - standardise sur newContent |
| 12 | `src/trigger/correctors.ts` | applyCorrection() ignore enabled flag | Corrige - guard isEnabled() en debut |
| 13 | `src/detection/watcher.ts` | `Activé` vs `Connected` (FR/EN Windows) | Corrige - regex `/connect/i` + parsing correct des colonnes |
| 14 | `src/environment/system-info.ts` | AdapterRAM DWORD cap a 4GB | Corrige - lecture `qwMemorySize` (QWORD) via registry |
| 15 | `src/prevention/validators.ts` | `Unexpected end of JSON input` (ESLint vide) | Corrige - injection config + try/catch defensif |

---

## Configuration

### Fichiers de config

| Fichier | Etat | Description |
|---------|------|-------------|
| `.env.local` | Template | Variables d'environnement toutes vides/par defaut |
| `.env.example` | Nouveau | Documente toutes les variables avec defaults |
| `config/prevention-rules.json` | Corrige | Format adapte au schema PreventionRule |
| `config/trigger-rules.json` | Fonctionnel | Format legacy, converti automatiquement par le code |
| `config/config.example.jsonc` | Nouveau | Exemple de config complete avec commentaires |

### Variables d'environnement cles

| Variable | Defaut | Usage |
|----------|--------|-------|
| `WATCH_DIR` | `process.cwd()` | Dossier a surveiller |
| `EXCLUDED_DIRS` | `node_modules,.git,dist,build` | Dossiers ignores |
| `WATCH_EXTENSIONS` | `js,ts,jsx,tsx,json,md` | Extensions surveillees |
| `PROCESSING_DELAY` | `100` | Delai entre les evenements (ms) |
| `PORT` | - | Port du serveur HTTP health check |
| `LOG_LEVEL` | `success` | Niveau de log (success/info/http/warn/error) |
| `SLACK_TOKEN` | - | Token API Slack (optionnel) |
| `SLACK_CHANNEL` | `#general` | Canal Slack par defaut |
| `EMAIL_HOST` | `smtp.gmail.com` | Serveur SMTP |
| `EMAIL_PORT` | `587` | Port SMTP |
| `EMAIL_USER` / `EMAIL_PASS` | - | SMTP credentials (optionnel, skip si manquants) |
| `EMAIL_FROM` | `watcher@localhost` | Adresse expediteur |
| `EMAIL_TO` | - | Adresse destinataire |

### Signal handlers

| Signal | Action |
|--------|--------|
| `SIGINT` / `SIGTERM` | Arret gracieux (drain + stop) |
| `SIGUSR1` | Reload configuration (Unix) |
| `SIGUSR2` | Restart gracieux : stop + initialize + start (Unix) |

---

## Tests

| Suite | Tests | Description |
|-------|-------|-------------|
| `tests/shared/utils.test.ts` | 27 | Utilitaires, validation, fichiers, parseFileSize |
| `tests/shared/circuit-breaker.test.ts` | 11 | Circuit breaker, retryWithBackoff |
| `tests/shared/unified-config.test.ts` | 4 | Configuration unifiee |
| `tests/detection/filters.test.ts` | 12 | Filtres, presets, patterns |
| `tests/detection/events.test.ts` | 13 | DetectionEventBus, trackListener, cleanupAllListeners |
| `tests/detection/watcher.test.ts` | 12 | Watcher lifecycle, ignoreInitial, debouncing, extensions |
| `tests/prevention/validators.test.ts` | 17 | JSON, Pattern, ESLint validators, injection config |
| `tests/prevention/config.test.ts` | 14 | PreventionConfigManager, CRUD, reload |
| `tests/prevention/scripts.test.ts` | 27 | ScriptRunner, $FILE token, concurrency limiter, runWithLimit |
| `tests/trigger/correctors.test.ts` | 31 | TextReplacement, Command, ESLintFix, PrettierFormat, parallel apply |
| `tests/trigger/rules.test.ts` | 15 | TriggerRuleManager, CRUD, toggle |
| `tests/trigger/notifiers.test.ts` | 13 | Console, File notifiers, registry |
| `tests/server/http.test.ts` | 8 | Health check, ready, metrics, 503 |
| `tests/injection/injection.test.ts` | 45 | Templates, detector, injector, validator, scan |
| `tests/analysis/analysis.test.ts` | 25 | Project analyzer, rules engine |
| `tests/environment/system-info.test.ts` | 5 | SystemInfo, formatage |
| `tests/environment/tool-detector.test.ts` | 4 | ToolDetector, detection, cache |
| `tests/environment/dev-environment.test.ts` | 4 | DevEnvironment, IDE, shell |
| `tests/environment/env-reporter.test.ts` | 4 | EnvReporter, banner |
| `tests/processor/processor.test.ts` | 8 | ProcessingChain, ChainOrchestrator |
| `tests/monitor/resource-monitor.test.ts` | 6 | ResourceMonitor, CPU/memoire/heap |
| `tests/integration/pipeline.test.ts` | 10 | Pipeline complet, drain, dry-run, rollback |
| **Total** | **335** | **22 suites** |

---

## Commandes CLI disponibles

| Commande | Description | Options |
|----------|-------------|---------|
| `start` | Demarrer le service | `-d, --dir`, `--no-prevention`, `--no-trigger` |
| `stop` | Arreter le service | - |
| `status` | Afficher l'etat du service | `--json` |
| `reload` | Recharger la configuration | - |
| `test` | Tester avec un fichier | `-f, --file` |
| `config` | Valider et afficher la config | `--validate`, `--prevention`, `--trigger` |
| `test-all` | Tester le pipeline complet | `-d, --dir`, `-f, --file` |
| `scan` | Mode one-shot : analyse + correction + injection | `-d, --dir`, `--fix`, `--inject`, `--all`, `--dry-run`, `--report`, `--agents` |
| `analyze` | Analyser la structure du projet | `-d, --dir`, `--json`, `--rules-only` |
| `env` | Afficher le rapport d'environnement | `--json`, `--compact` |
| `doctor` | Verifier sante environnement + outils manquants | `--fix` |

---

## Comment lancer

```bat
# Lanceur interactif (menu)
start-watcher.bat

# Ou directement
npm start -- start -d "C:\Mon\Dossier"

# Sans prevention
npm start -- start -d "C:\Mon\Dossier" --no-prevention

# Valider la config
npm start -- config --validate

# Tester le pipeline complet
npm start -- test-all -d "C:\Mon\Dossier"

# Tester un fichier
npm start -- test -f "C:\Mon\Fichier.ts"

# Scanner un projet (one-shot)
npm start -- scan --all "C:\Mon\Projet"

# Analyser un projet
npm start -- analyze "C:\Mon\Projet"

# Voir l'environnement
npm start -- env

# Verifier les outils manquants
npm start -- doctor
```

---

## Ameliorations restantes

- Template versioning system — auto-update des fichiers injectes quand les templates changent
- Test load (10k files) — validation batch processing et memoire sous charge
- Documentation detaillee des API internes
