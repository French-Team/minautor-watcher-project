# ⚡ Minautor Watcher Project ⚡

<p align="center">
  <img src="./assets/logo-minautor.png" alt="Logo Minautor" width="800" />
</p>

## Un service de surveillance de code modulaire, automatisé et portable. 
Détecte les changements en temps réel, prévient les erreurs avant propagation, corrige automatiquement — et **injecte des fichiers de consignes pour guider les agents IA**.

### Le watcher résout un problème concret : 
les agents IA laissent des erreurs partout dans les projets. 
Le watcher les détecte, les corrige, et **injecte des fichiers CLAUDE.md / AGENTS.md** pour que tous les agents suivent les mêmes directives.

---

## Table des matières

- [Philosophie](#philosophie)
- [Architecture](#architecture)
- [Modules](#modules)
  - [Detection](#detection)
  - [Prevention](#prevention)
  - [Trigger](#trigger)
  - [Injection](#injection) *(V3)*
  - [Analysis](#analysis) *(V3)*
  - [Environment](#environment-v4) *(V4)*
  - [Processor](#processor-v5) *(V5)*
  - [Monitor](#monitor-v5) *(V5)*
- [Sécurité et stabilité (V2)](#sécurité-et-stabilité-v2)
- [Configuration](#configuration)
- [CLI](#cli)
- [API programmatique](#api-programmatique)
- [Tests](#tests)
- [Stack](#stack)

---

## Philosophie

minautor watcher project est né d'un constat simple : les agents IA laissent des erreurs partout dans les projets sans s'en rendre compte. Le watcher agit en continu pour :

1. **Détecter** les changements et les erreurs dès qu'ils surviennent
2. **Prévenir** les mauvaises pratiques par validation immédiate
3. **Déclencher** des corrections automatiques ou des notifications
4. **Injecter** des fichiers de consignes pour guider les agents IA *(V3)*
5. **Analyser** les projets et adapter ses règles *(V3)*
6. **Se connaître** : OS, GPU, RAM, réseau, outils disponibles *(V4)*

L'objectif n'est pas de remplacer les outils existants, mais de les **orchestrer en continu** et de **standardiser le comportement des agents IA** à travers tous les projets.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          WatcherService                              │
├────────────┬──────────────┬──────────────────┬───────────┬───────────┤
│ Detection  │  Prevention  │     Trigger      │ Injection │Environment│
│            │              │                  │   (V3)    │   (V4)    │
│ fs.watch    │  validateurs │  correcteurs     │ templates │ sysinfo   │
│ filters    │  scripts     │  notifieurs      │ detector  │ tools     │
│ events     │  config      │  rules engine    │ injector  │ banner    │
│            │  ESLint auto │                  │ ESLint cfg│ doctor    │
└─────┬──────┴──────┬───────┴────────┬─────────┴─────┬─────┴─────┬─────┘
      │             │                │               │           │
      └─────────────┴────────────────┴───────────────┴───────────┘
                             │
                    Event Bus (DetectionEventBus)
                             │
                  ┌──────────┴──────────┐
                  │    Analysis (V3)    │
                  │   project-analyzer  │
                  │   rules-engine      │
                  └─────────────────────┘
```

---

## Modules

### Detection

Surveille le système de fichiers et filtre les événements pertinents.

**Fichiers :** `src/detection/`

| Classe / Fichier    | Rôle                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `Watcher`           | Interface avec `fs.watch` natif (`recursive: true`), un seul handle Windows |
| `FileFilter`        | Filtre par extension, pattern, taille, date de modification          |
| `DetectionEventBus` | Bus d'événements typé, relaye les événements filtrés                 |
| `FilterPresets`     | Presets prêts à l'emploi (`jsTsProject`, `minimal`, `comprehensive`) |

**Événements émis :**

```
FILE_DETECTED    → fichier ajouté
FILE_MODIFIED    → fichier modifié
FILE_DELETED     → fichier supprimé
DETECTION_ERROR  → erreur du watcher
```

**Filtres disponibles :**

| Filtre                        | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `extensions`                  | Liste blanche d'extensions (ex: `['ts', 'js']`)     |
| `excludePatterns`             | Patterns glob à exclure (ex: `['node_modules/**']`) |
| `includePatterns`             | Patterns glob à inclure                             |
| `maxFileSize` / `minFileSize` | Taille en bytes                                     |
| `modifiedWithin`              | Délai max depuis la dernière modification (ms)      |

**Fichier `.watchignore` :**

Le watcher supporte un fichier `.watchignore` (syntaxe gitignore) pour exclure des fichiers/dossiers de la surveillance.

```gitignore
# Commentaires
node_modules        # nom exact
*.log               # suffixe
dist/               # dossier
temp*               # prefixe
```

Les exclusions par défaut s'appliquent toujours : `node_modules`, `.git`, `dist`, `build`, `.cache`, `.next`, `.nuxt`, `coverage`, `__pycache__`.

---

### Prevention

Valide le code dès qu'un fichier est détecté ou modifié.

**Fichiers :** `src/prevention/`

| Classe / Fichier          | Rôle                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| `PreventionModule`        | Orchestre la validation et l'exécution des scripts                  |
| `BaseValidator`           | Classe abstraite pour les validateurs                               |
| `ESLintValidator`         | Exécute ESLint sur les fichiers JS/TS + injecte la config manquante |
| `JSONValidator`           | Vérifie la syntaxe JSON                                             |
| `YAMLValidator`           | Vérifie la syntaxe YAML (optionnel)                                 |
| `PatternValidator`        | Détecte des patterns personnalisés (console.log, TODO, etc.)        |
| `ValidatorRegistry`       | Enregistre et résout les validateurs par nom                        |
| `ScriptRunner`            | Exécute des scripts shell (ESLint --fix, Prettier, tsc, etc.)       |
| `PreventionConfigManager` | Gère les règles depuis `config/prevention-rules.json`               |

**Injection ESLint automatique :**

Lorsqu'un projet analysé n'a pas de configuration ESLint (`.eslintrc*`, `eslint.config.*`, ou `eslintConfig` dans `package.json`), le watcher :
1. Détecte si le projet est TypeScript ou JavaScript
2. Injecte un `.eslintrc.json` adapté via le système d'injection
3. Log : `ESLint config injected: .eslintrc.json (TypeScript)`

**Scripts intégrés :**

- `npx eslint --fix`
- `npx prettier --write`
- `npx tsc --noEmit`
- `npm audit`
- `npx depcheck`

---

### Trigger

Corrige les problèmes détectés et notifie les canaux configurés.

**Fichiers :** `src/trigger/`

| Classe / Fichier           | Rôle                                               |
| -------------------------- | -------------------------------------------------- |
| `TriggerModule`            | Orchestre règles, correcteurs et notifieurs        |
| `TriggerRuleManager`       | Évalue les règles déclencheurs, gère les cooldowns |
| `BaseCorrector`            | Classe abstraite pour les corrections              |
| `ESLintFixCorrector`       | Exécute `eslint --fix` sur un fichier              |
| `PrettierFormatCorrector`  | Exécute `prettier --write` sur un fichier          |
| `TextReplacementCorrector` | Remplace, insère ou supprime du texte              |
| `CommandCorrector`         | Exécute des commandes shell arbitraires            |
| `CorrectorRegistry`        | Enregistre et résout les correcteurs               |
| `BaseNotifier`             | Classe abstraite pour les notifications            |
| `SlackNotifier`            | Envoie des messages structurés sur Slack           |
| `EmailNotifier`            | Envoie des emails via Nodemailer                   |
| `ConsoleNotifier`          | Log dans la console                                |
| `FileNotifier`             | Écrit dans un fichier de log dédié                 |
| `NotifierRegistry`         | Enregistre et résout les notifieurs                |

**Backup / Rollback (V2) :**

Chaque correction crée un fichier `.bak` avant modification. En cas d'erreur, le fichier est restauré automatiquement.

```typescript
import { writeFileWithBackup, restoreFromBackup } from "./trigger/correctors.js";

await writeFileWithBackup(filePath, newContent);
await restoreFromBackup(filePath); // restaure .bak
```

**Notifications skip si credentials manquants :**

- Slack : warn si `SLACK_TOKEN` manquant, pas d'erreur
- Email : warn si `EMAIL_USER`/`EMAIL_PASS` manquants, pas d'erreur

---

### Injection *(V3)*

Injecte des fichiers de consignes dans les projets pour guider les agents IA.

**Fichiers :** `src/injection/`

| Classe / Fichier        | Rôle                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `checkInjectionStatus`  | Détecte les fichiers de consignes manquants/obsolètes        |
| `injectFiles`           | Crée/met à jour les fichiers avec backup automatique         |
| `validateConsignmentFiles` | Intègre la vérification dans le pipeline Prevention       |
| Templates               | 6 agents : Claude, AGENTS, Cursor, Copilot, Windsurf, ESLint |

**Templates disponibles :**

| Agent     | Fichier                          | Version |
| --------- | -------------------------------- | ------- |
| Claude    | `CLAUDE.md`                      | 1.0.0   |
| Générique | `AGENTS.md`                      | 1.0.0   |
| Cursor    | `.cursorrules`                   | 1.0.0   |
| Copilot   | `.github/copilot-instructions.md`| 1.0.0   |
| Windsurf  | `.windsurfrules`                 | 1.0.0   |
| ESLint TS | `.eslintrc.json`                 | 1.0.0   |
| ESLint JS | `.eslintrc.json`                 | 1.0.0   |

**Contenu des templates :**

Chaque template contient :
- Règles de sécurité (`safeSpawn()`, `sanitizePath()`, pas d'injection)
- Interdiction du type `any` → utiliser `unknown`
- Logging structuré (Winston, pas de `console.log`)
- Instructions de test
- Structure du projet
- Erreurs courantes des agents IA à éviter

**Utilisation :**

```typescript
import {
  checkInjectionStatus,
  injectFiles,
  formatCheckResult,
} from "./injection/index.js";

// Vérifier l'état
const status = await checkInjectionStatus({
  projectDir: "./my-project",
  agents: ["claude", "generic"],
});
console.log(formatCheckResult(status));

// Injecter les fichiers manquants
const results = await injectFiles({
  projectDir: "./my-project",
  agents: ["claude"],
  force: false,
  dryRun: false,
});
```

---

### Analysis *(V3)*

Analyse la structure d'un projet et évalue des règles adaptatives.

**Fichiers :** `src/analysis/`

| Classe / Fichier     | Rôle                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `analyzeProject`     | Détecte langage, package manager, framework, conventions, archi  |
| `evaluateRules`      | Évalue 12 règles adaptatives contre l'analyse                    |
| `getTriggeredRules`  | Retourne uniquement les règles déclenchées                       |
| `formatEvaluations`  | Formate les résultats en texte lisible                           |

**Ce que détecte `analyzeProject()` :**

| Aspect         | Détection                                       |
| -------------- | ----------------------------------------------- |
| Langage        | TypeScript, JavaScript, mixed, unknown          |
| Package manager| npm, yarn, pnpm                                 |
| Test framework | jest, vitest, mocha                             |
| Architecture   | monorepo, single, library                       |
| Framework      | react, vue, angular, svelte, express, next, etc.|
| Conventions    | indent, quotes, semicolons, line endings        |
| Consignment    | CLAUDE.md, AGENTS.md, .cursorrules, etc.        |

**12 règles adaptatives :**

| Règle                | Type    | Condition                           |
| -------------------- | ------- | ----------------------------------- |
| `no-any-type`        | enforce | TypeScript détecté                  |
| `eslint-required`    | suggest | Pas d'ESLint → injecte config       |
| `prettier-recommended`| suggest| ESLint sans Prettier                |
| `tests-required`     | suggest | Pas de tests                        |
| `winston-logging`    | enforce | TypeScript                          |
| `safe-spawn`         | enforce | Toujours                            |
| `sanitize-paths`     | enforce | Toujours                            |
| `monorepo-structure` | suggest | Monorepo                            |
| `consignment-files`  | suggest | Pas de fichiers consignes           |
| `esm-modules`        | enforce | TypeScript                          |
| `config-validation`  | enforce | Dossier config                      |
| `no-console-log`     | enforce | TypeScript ou ESLint                |

**Utilisation :**

```typescript
import {
  analyzeProject,
  evaluateRules,
  formatAnalysis,
  formatEvaluations,
} from "./analysis/index.js";

const analysis = await analyzeProject("./my-project");
console.log(formatAnalysis(analysis));

const evaluations = evaluateRules(analysis);
console.log(formatEvaluations(evaluations));
```

---

### Environment *(V4)*

Détecte l'environnement système, les outils disponibles, et affiche un banner au démarrage.

**Fichiers :** `src/environment/`

| Classe / Fichier     | Rôle                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `getSystemInfo`      | OS, CPU, RAM, GPU (registry QWORD), réseau (netsh+ipconfig)      |
| `detectTools`        | Détecte outils dans le PATH + versions                           |
| `detectDevEnvironment` | IDE (VS Code, JetBrains, Sublime, Vim), shell, Docker, WSL, CI |
| `generateEnvReport`  | Agrège toutes les infos en un rapport                            |
| `printBanner`        | Affiche le banner complet (détails)                              |
| `printCompactBanner` | Affiche le banner compact (une ligne)                            |

**Ce que détecte `getSystemInfo()` :**

| Donnée      | Source                                       |
| ----------- | -------------------------------------------- |
| Platform    | `os.platform()` — win32 / linux / darwin     |
| CPU         | `os.cpus()` — model, cores                   |
| RAM         | `os.totalmem()` / `os.freemem()`             |
| GPU VRAM    | Registry QWORD `qwMemorySize` (accurate)     |
| Réseau      | `netsh` + `ipconfig` — interfaces, IP        |
| Node/npm    | `process.version` + `npm --version`          |
| Date/année  | `new Date().getFullYear()`                   |

**Banner compact :**

```
minautor watcher v4.0.0 | Windows x64 | Node v24.2.0 | 12 GB GPU | 14/16 GB RAM | 3 tools OK
```

**Installer dynamique :** `scripts/install-tools.cjs` — détecte et installe automatiquement les outils manquants via npm.

**Utilisation :**

```typescript
import {
  generateEnvReport,
  printBanner,
  printCompactBanner,
} from "./environment/index.js";

const report = await generateEnvReport();
printBanner(report);        // Affichage complet
printCompactBanner(report); // Une ligne
```

---

### Processor (V5) — Chaines de traitement sequentielles

Le module Processor gere N chaines de traitement paralleles (defaut 5, configurable via `CHAIN_COUNT`). Chaque chaine traite **un fichier de bout en bout** avant de passer au suivant.

**Fichiers :** `src/processor/`

| Composant | Role |
|-----------|------|
| `ProcessingChain` | File d'attente + traitement sequentiel : prevent -> correct -> re-prevent -> suivant |
| `ChainOrchestrator` | N chaines, distribution au moins charge, metriques temps reel |

**Avantages** : Pas de saturation CPU (setImmediate yield), parallelisme borne, monitoring temps reel.

```typescript
import { ChainOrchestrator } from "./processor/index.js";

const orchestrator = new ChainOrchestrator(5);
orchestrator.onComplete((result) => {
  console.log(`${result.file}: ${result.success ? "OK" : "FAIL"}`);
});
orchestrator.enqueue({ filePath: "src/index.ts", type: "file_added" });
orchestrator.getStats(); // { chains: 5, queued: 0, busy: 2 }
```

---

### Monitor (V5) — Surveillance systeme

Le module Monitor surveille CPU, memoire et heap toutes les 5 secondes avec alertes configurables.

**Fichiers :** `src/monitor/`

| Composant | Role |
|-----------|------|
| `ResourceMonitor` | CPU/memoire/heap, alertes a 70%/90%, `timer.unref()` pour arret propre |

**Alertes** : CPU > 70% (warn), CPU > 90% (error), memoire > 80% (warn).

```typescript
import { ResourceMonitor } from "./monitor/index.js";

const monitor = new ResourceMonitor({ cpuWarn: 70, cpuError: 90, memWarn: 80 });
monitor.onAlert((alert) => console.warn(alert));
monitor.start(); // Surveillance toutes les 5s
// ...
monitor.stop(); // Arret propre (timer.unref())
```

---

## Sécurité et stabilité (V2)

Le watcher intègre un ensemble de protections issues de V2 :

| Fonctionnalité                | Description                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| `safeSpawn()`                 | Exécution de commandes shell sans injection de paths                   |
| `safeExecFile()`              | Exécution d'exécutables avec timeout                                   |
| `sanitizePath()`              | Nettoyage des paths avant utilisation                                  |
| `escapeHtml()`                | Échappement HTML pour les notifications                                |
| `withFileLock()`              | Verrouillage par fichier pour éviter les concurrences                  |
| `CircuitBreaker`              | Protection contre les erreurs répétées (5 échecs → OPEN)               |
| `retryWithBackoff()`          | Retry avec backoff exponentiel (3 tentatives)                          |
| `writeFileWithBackup()`       | Écriture avec sauvegarde `.bak` automatique                            |
| `restoreFromBackup()`         | Restauration depuis le backup                                          |
| Script whitelist              | Seuls `npx eslint`, `npx prettier`, `npm run`, `node` autorisés        |
| Batch ESLint/Prettier         | 50 fichiers par invocation pour la performance                         |
| LRU eviction                  | File d'attente bornée (1000 max) avec éviction                         |
| Health check HTTP             | `GET /health`, `/ready`, `/metrics` (Prometheus)                       |
| Graceful drain                | Arrêt propre avec timeout configurable                                 |
| Logging structuré JSON        | `LOG_FORMAT=json` pour la production                                   |
| Signal handlers               | `SIGINT`/`SIGTERM` (shutdown), `SIGUSR1` (reload), `SIGUSR2` (restart) |
| Injection auto ESLint         | Config `.eslintrc.json` injectée si manquante                          |
| Skip notifications            | Slack/Email skip si credentials manquants (warn, pas error)            |
| Processor chains (V5)         | N chaînes séquentielles (CHAIN_COUNT=5), bounded parallelism           |
| Resource monitor (V5)         | CPU/mémoire/heap toutes les 5s, alertes configurables                   |
| scanInitialFiles (V5)         | Comptage sans émission d'événements (pas de CPU flood au démarrage)     |

---

## Configuration

### `.env.example`

Toutes les variables d'environnement sont documentées dans `.env.example` :

```env
# Watcher / Core
WATCH_DIR=./src
EXCLUDED_DIRS=node_modules,.git,dist,build
WATCH_EXTENSIONS=js,ts,jsx,tsx,json,md
PROCESSING_DELAY=100
PORT=3000

# Logging
LOG_LEVEL=success        # success | info | http | warn | error
NODE_ENV=development
LOG_FORMAT               # json pour la production

# Slack
SLACK_TOKEN=
SLACK_CHANNEL=#general

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=watcher@localhost
EMAIL_TO=
```

### `config/prevention-rules.json`

Définit les règles de validation par type de fichier, sévérité, et scripts associés.

### `config/trigger-rules.json`

Définit les règles de correction (corrections, conditions, notifications). Deux formats sont supportés :

- **Format moderne :** `{ "rules": [ TriggerRule, ... ] }`
- **Format legacy (supporté) :** `{ "corrections": [...], "conditions": [...], "notifications": {...} }`

### `watcher.config.json` *(V2)*

Configuration unifiée qui prend le dessus sur les fichiers legacy.

---

## CLI

```bash
npm start -- [command] [options]

Commands:
  start [options]              Lance la surveillance
    -d, --dir <dir>            Dossier à surveiller
    --no-prevention            Désactive le module de prévention
    --no-trigger               Désactive le module de déclenchement

  stop                         Arrête le service

  status [--json]              Affiche l'état des modules

  reload                       Recharge la configuration

  test -f <file>               Teste les règles sur un fichier

  preview <files...>           Preview des corrections (dry-run)
    Affiche les différences sans écrire

  scan [options]               Mode one-shot : analyse + correction + injection
    -d, --dir <dir>            Dossier à scanner
    --fix                      Corriger les erreurs détectées
    --inject                   Injecter les fichiers de consignes manquants
    --all                      --fix + --inject
    --dry-run                  Afficher sans modifier
    --report <file>            Générer un rapport JSON
    --agents <agents>          Agents cibles (claude,generic,copilot,cursor,windsurf)

  analyze [options]            Analyser la structure du projet
    -d, --dir <dir>            Dossier à analyser
    --json                     Sortie JSON
    --rules-only               Afficher uniquement les règles

  env [options]                Afficher le rapport d'environnement
    --json                     Sortie JSON
    --compact                  Banner compact uniquement

  doctor [options]             Vérifier santé environnement + outils manquants
    --fix                      Installer automatiquement les outils manquants

  config [--validate]          Valide et affiche la configuration
```

**Exemples :**

```bash
# Scanner un projet et tout corriger
watcher scan --all ./mon-projet

# Voir ce qui serait corrigé sans modifier
watcher scan --dry-run --all ./mon-projet

# Analyser un projet et voir les règles adaptatives
watcher analyze ./mon-projet

# Injecter les fichiers de consignes uniquement
watcher scan --inject ./mon-projet

# Générer un rapport pour CI/CD
watcher scan --all --report report.json ./mon-projet

# Voir l'environnement
watcher env

# Vérifier et installer les outils manquants
watcher doctor --fix
```

---

## API programmatique

```typescript
import { WatcherService } from "watcher-service";

const service = new WatcherService({ watchDir: "./src" });

await service.initialize();
await service.start();

// Plus tard
await service.stop();
```

Utilisation modulaire :

```typescript
import { analyzeProject, evaluateRules } from "./analysis/index.js";
import {
  checkInjectionStatus,
  injectFiles,
} from "./injection/index.js";
import { generateEnvReport } from "./environment/index.js";

// Analyser un projet
const analysis = await analyzeProject("./my-project");
const rules = evaluateRules(analysis);

// Injecter des fichiers de consignes
const status = await checkInjectionStatus({
  projectDir: "./my-project",
  agents: ["claude", "generic"],
});

if (status.missingCount > 0) {
  await injectFiles({
    projectDir: "./my-project",
    agents: ["claude"],
  });
}

// Voir l'environnement
const report = await generateEnvReport();
console.log(report.systemInfo.osType);
console.log(report.missingTools);
```

---

## Tests

```bash
npm test              # 335 tests, 22 suites
npm run test:watch    # Mode watch
npm run typecheck     # Verification TypeScript
npm run lint          # ESLint
```

**Couverture :**

| Module                          | Tests | Couvert                                          |
| ------------------------------- | ----- | ------------------------------------------------ |
| `shared/utils.ts`               | 27    | Utilitaires fichiers, validation, debounce       |
| `shared/circuit-breaker.ts`     | 11    | Circuit breaker, retryWithBackoff                |
| `shared/unified-config.ts`      | 4     | Configuration unifiée                            |
| `detection/filters.ts`          | 12    | Filtres extension, pattern, taille, presets      |
| `detection/events.ts`           | 13    | EventBus, trackListener, cleanupAllListeners     |
| `detection/watcher.ts`          | 12    | Lifecycle, ignoreInitial, debouncing, extensions |
| `prevention/validators.ts`      | 17    | JSON, patterns, ESLint, injection config         |
| `prevention/config.ts`          | 14    | Config manager, async factory                    |
| `prevention/scripts.ts`         | 27    | ScriptRunner, $FILE token, runWithLimit, V5     |
| `trigger/rules.test.ts`         | 15    | Trigger rules, CRUD, import/export               |
| `trigger/correctors.test.ts`    | 31    | TextReplacement, Command, ESLintFix, Prettier   |
| `trigger/notifiers.test.ts`     | 13    | Console, fichier, registry, utils                |
| `server/http.test.ts`           | 8     | Health check, ready, metrics, 503                |
| `injection/injection.test.ts`   | 45    | Templates, detector, injector, validator, scan   |
| `analysis/analysis.test.ts`     | 25    | Project analyzer, rules engine                   |
| `environment/system-info.ts`    | 5     | SystemInfo, formatage                            |
| `environment/tool-detector.ts`  | 4     | ToolDetector, detection, cache                   |
| `environment/dev-environment.ts`| 4     | DevEnvironment, IDE, shell                       |
| `environment/env-reporter.ts`   | 4     | EnvReporter, banner                              |
| `processor/processor.test.ts`   | 8     | ProcessingChain, ChainOrchestrator               |
| `monitor/resource-monitor.test.ts`| 6   | ResourceMonitor, CPU/memoire/heap                |
| `integration/pipeline.test.ts`  | 10    | Pipeline complet, drain, dry-run, rollback       |

---

## Stack

| Technologie  | Version | Usage                           |
| ------------ | ------- | ------------------------------- |
| Node.js      | ^24     | Runtime                         |
| TypeScript   | ^5.9    | Langage                         |
| ESLint       | ^8      | Linting                         |
| Prettier     | ^2.8    | Formatage                       |
| Winston      | ^3.8    | Logging                         |
| Chalk        | ^5      | Couleurs console                |
| Commander.js | ^10     | CLI                             |
| Joi          | ^17     | Validation de config            |
| Slack SDK    | ^6.8    | Notifications Slack             |
| Nodemailer   | ^6.9    | Notifications email             |
| Jest         | ^29     | Tests                           |
| ts-jest      | ^29     | Tests TypeScript                |
| tsx          | ^4      | Dev runner                      |
| fs-extra     | ^11     | Utilitaires fichiers            |
| dotenv       | ^16     | Variables d'environnement       |

---

<div align="center">
  <sub>
  <a href="./PLAN-DEV-V5.md">Plan de développement V5</a> ·
    <a href="./PLAN-DEV-V4.md">Plan de développement V4</a> ·
    <a href="./PLAN-DEV-V3.md">Plan de développement V3</a> ·
    <a href="./PLAN-DEV-V2.md">Plan de développement V2</a> ·
    <a href="./ETAT-DU-PROJET.md">État du projet</a>
  </sub>
  <br>
  <sub>minautor watcher project · MIT</sub>
</div>
