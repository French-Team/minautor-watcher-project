# PLAN DEV V5 — Performance & Ressources

> **Objectif** : Réduire la consommation CPU/RAM du watcher. Arrêter les ralentissements quand le service tourne.
> **Statut** : 335/335 tests, 22 suites, tsc clean, ESLint clean.

---

## Architecture actuelle

```
src/detection/
├── watcher.ts              fs.watch natif (1 handle), .watchignore, scanInitialFiles, FILE_ADDED priority
├── events.ts               trackListener, cleanupAllListeners
└── index.ts                orchestration Watcher + Filter + EventBus

src/processor/
├── processing-chain.ts     file d'attente + traitement séquentiel par fichier
├── chain-orchestrator.ts   N chaînes, distribution au moins chargé
└── index.ts                barrel exports

src/prevention/
├── scripts.ts              $FILE token, runWithLimit(2), timeouts réduits
├── validators.ts           getEslintPath (direct), getCodeSnippetFromContent, injection ESLint auto
├── config.ts               6 règles par défaut, CRUD complet
└── index.ts                pipeline processFile

src/trigger/
├── index.ts                executeRules parallèle (Promise.allSettled)
└── correctors.ts           applyCorrections parallèle, backup/restore, fileLocks

src/monitor/
├── resource-monitor.ts     CPU/mémoire/heap toutes les 5s, alertes >70%/90%
└── index.ts                barrel exports

src/injection/              fichiers consignes agents IA (CLAUDE.md, AGENTS.md, .cursorrules)
src/analysis/               analyse adaptative (12 règles)
src/environment/            system info, GPU, réseau, banner, doctor
src/server/                 HTTP health check, auto-kill port
src/cli/                    11 commandes
src/shared/                 logger (Winston + chalk, rotation 10MB/5), utils
src/types/                  types communs
src/index.ts                WatcherService (orchestrateur principal)
```

---

## Flow de traitement

```
fs.watch({recursive:true}) — 1 seul handle Windows
  ↓
DetectionModule (filtres extension, taille, .watchignore)
  ↓ FILE_ADDED / FILE_MODIFIED
ChainOrchestrator (N=5 chaînes, distribue au moins chargé)
  ↓
ProcessingChain: prevent → correct → re-prevent → setImmediate → suivant
```

---

## Validation V5 par phase

### V5.1 : ignoreInitial + scan initial

| Prévu | Réalisé |
|-------|---------|
| `ignoreInitial: true` par défaut | `ignoreInitial: false` (user voulu) |
| `startupGracePeriod: 5000` | **Non fait** — non nécessaire avec `fs.watch` natif |
| Scan initial sans flood | `scanInitialFiles()` compte les fichiers sans émettre d'événements |

**Décision** : Le problème original (flood au démarrage) est résolu autrement — `scanInitialFiles` ne déclenche AUCUN `FILE_ADDED`. Le `startupGracePeriod` n'est pas nécessaire.

### V5.2 : Scripts ciblés sur le fichier

| Prévu | Réalisé |
|-------|---------|
| Token `$FILE` dans args | ✅ `eslintFix: ["eslint", "--fix", "$FILE"]` |
| `securityAudit` désactivé | ✅ `enabled: false` |
| `dependencyCheck` désactivé | ✅ `enabled: false` |
| `filePath` paramètre | ✅ `executeScript(filePath?)`, `executeScriptsForFile(filePath)` |

### V5.3 : Concurrency limiter

| Prévu | Réalisé |
|-------|---------|
| `runWithLimit(2)` custom | ✅ 30 lignes, zero dépendance externe |
| Gère succès/échecs | ✅ `PromiseSettledResult<T>[]` |

### V5.4 : ESLint chemin direct

| Prévu | Réalisé |
|-------|---------|
| `getEslintPath()` local → fallback npx | ✅ Cache `node_modules/.bin/eslint` |
| `getCodeSnippetFromContent()` | ✅ Lit le fichier une fois, extrait le snippet |

### V5.5 : File content cache

| Prévu | Réalisé |
|-------|---------|
| ESLint lit une fois | ✅ Contenu passé à `getCodeSnippetFromContent` |
| PatternValidator cache | ❌ Relit à chaque fois |
| `fs.stat()` batch | ❌ Appelé par règle |

### V5.6 : Trigger parallèle

| Prévu | Réalisé |
|-------|---------|
| `executeRules()` → `Promise.allSettled` | ✅ |
| `applyCorrections()` → `Promise.allSettled` | ✅ |
| `fileLocks` TTL 30s + cleanup | ❌ Locks sans TTL, release dans `finally` |

### V5.7 : Timeouts réduits

| Cible | Réalisé |
|-------|---------|
| `scripts.ts` eslintFix → 15s | ✅ |
| `scripts.ts` prettierFormat → 10s | ✅ |
| `scripts.ts` typescriptCheck → 15s | ✅ |
| `prevention/index.ts` → 10s | ❌ Resté à 30s |
| `shared/utils.ts` safeSpawn → 15s | ❌ Resté à 60s |
| `trigger/index.ts` → 10s | ❌ Resté à 30s |

### V5.8 : Log rotation

| Prévu | Réalisé |
|-------|---------|
| `maxsize: 10MB` | ✅ |
| `maxFiles: 5` | ✅ |

### V5.9 : Listener cleanup

| Prévu | Réalisé |
|-------|---------|
| `trackListener()` | ✅ |
| `cleanupAllListeners()` | ✅ |
| Appelé au `stop()` | ✅ |
| Appelé au `reloadConfig()` | ✅ |
| `@OnEvent` utilise trackListener | ❌ Bypass le tracking |

### V5.10 : getStatus() optimisé

| Prévu | Réalisé |
|-------|---------|
| `watchedCount` en cache | ✅ |
| Incrémenté/décrémenté | ✅ |
| `getStatus()` O(1) | ✅ |

---

## Fonctionnalités AJOUTÉES (non prévues dans le plan)

| Fonctionnalité | Fichiers | Description |
|----------------|----------|-------------|
| **fs.watch natif** | `detection/watcher.ts` | Remplace Chokidar, 1 handle Windows au lieu de milliers |
| **.watchignore** | `detection/watcher.ts` | Syntaxe gitignore pour exclure des fichiers |
| **ALWAYS_IGNORED** | `detection/watcher.ts` | 15 exclusions hardcodées (node_modules, .git, dist, build...) |
| **FILE_ADDED priority** | `detection/watcher.ts` | FILE_ADDED > FILE_DELETED > FILE_CHANGED dans le debounce |
| **ChainOrchestrator** | `processor/` | N chaînes séquentielles, bounded parallelism |
| **ResourceMonitor** | `monitor/` | CPU/mémoire/heap toutes les 5s, alertes configurables |
| **killPortProcess** | `server/http.ts` | Auto-kill du process sur port occupé |
| **ESLint auto-inject** | `prevention/validators.ts` | Injecte `.eslintrc.json` si le projet n'en a pas |
| **scanInitialFiles** | `detection/watcher.ts` | Compte les fichiers existants sans émettre d'événements |

---

## Bilan des phases

| Phase | Statut | Notes |
|-------|--------|-------|
| V5.1 | ✅ Résolu autrement | `scanInitialFiles` sans émission = pas de flood |
| V5.2 | ✅ Complet | $FILE, scripts désactivés |
| V5.3 | ✅ Complet | runWithLimit custom |
| V5.4 | ✅ Complet | getEslintPath + cache |
| V5.5 | ⚠️ Partiel | ESLint ok, PatternValidator et fs.stat non optimisés |
| V5.6 | ⚠️ Presque | Parallèle ok, fileLocks TTL manquant |
| V5.7 | ⚠️ Partiel | Scripts ok, globals pas réduits |
| V5.8 | ✅ Complet | Rotation 10MB/5 fichiers |
| V5.9 | ⚠️ Presque | Cleanup ok, @OnEvent bypass |
| V5.10 | ✅ Complet | O(1) getStatus |

**5 complets · 4 partiels · 1 résolu autrement**

---

## Ce qui reste à finir (V5)

| Priorité | Tâche | Difficulté |
|----------|-------|------------|
| **Haute** | `V5.7` : Réduire timeouts dans `utils.ts` (60→15s), `prevention/index.ts` (30→10s), `trigger/index.ts` (30→10s) | Facile |
| **Haute** | `V5.5` : Cache `fs.stat()` dans `config.ts`, cache PatternValidator | Moyen |
| **Moyenne** | `V5.6` : Ajouter TTL 30s aux `fileLocks` + cleanup périodique | Facile |
| **Moyenne** | `V5.9` : Faire passer `@OnEvent` par `trackListener()` | Facile |
| **Basse** | Tester le flow complet sur `creator-projet` | Manuel |
| **Basse** | Push GitHub | Manuel |

---

## Tests

**335/335 · 22 suites**

| Module | Fichier | Tests |
|--------|---------|-------|
| detection | `watcher.test.ts` | 14 |
| detection | `events.test.ts` | 13 |
| prevention | `scripts.test.ts` | 27 |
| prevention | `validators.test.ts` | 17 |
| prevention | `config.test.ts` | 28 |
| trigger | `correctors.test.ts` | 31 |
| trigger | `rules.test.ts` | 10 |
| trigger | `notifiers.test.ts` | 15 |
| injection | `injection.test.ts` | 10 |
| analysis | `analysis.test.ts` | 28 |
| environment | `system-info.test.ts` | 10 |
| environment | `tool-detector.test.ts` | 12 |
| environment | `dev-environment.test.ts` | 10 |
| environment | `env-reporter.test.ts` | 12 |
| server | `http.test.ts` | 10 |
| cli | `cli.test.ts` | 17 |
| shared | `logger.test.ts` | 6 |
| shared | `utils.test.ts` | 19 |
| shared | `circuit-breaker.test.ts` | 9 |
| integration | `pipeline.test.ts` | 10 |
| monitor | `resource-monitor.test.ts` | 6 |
| processor | `processor.test.ts` | 8 |

---

## Dépendances

**Externes** : commander, dotenv, fs-extra, glob, helmet, joi, @slack/web-api, nodemailer, winston, chalk
**Supprimé** : ~~chokidar~~ (remplacé par fs.watch natif)
**Outils** : ESLint 8, Prettier 2, Jest 29, ts-jest, tsx
