# PLAN DEV V4 — Environment Awareness

> **Objectif** : Le watcher doit se connaître lui-même et son environnement au démarrage.
> Savoir l'année, l'OS, les outils disponibles, l'environnement dev, et proposer des solutions pour les outils manquants.

---

## Architecture

```
src/environment/
├── types.ts           # Interfaces partagées
├── system-info.ts     # OS, Node, CPU, RAM, date/année
├── tool-detector.ts   # Détection outils PATH + versions
├── dev-environment.ts # IDE, shell, Docker/WSL/CI
├── env-reporter.ts    # Agrège tout, génère le banner
└── index.ts           # Barrel exports

scripts/
├── env-banner.cjs       # Banner compact pour start-watcher.bat
└── install-tools.cjs    # Dynamic tool installer (remplace tools/)
```

---

## Phases

### V4.1 : SystemInfo — Conscience temporelle et système

**Fichier** : `src/environment/system-info.ts`

**Responsabilité** : Collecter les infos système au démarrage.

**Données collectées** :
| Donnée | Source | Usage |
|---|---|---|
| `platform` | `os.platform()` | win32 / linux / darwin |
| `arch` | `os.arch()` | x64 / arm64 |
| `osType` | `os.type()` | Windows_NT / Linux / Darwin |
| `osRelease` | `os.release()` | Version OS |
| `hostname` | `os.hostname()` | Nom de la machine |
| `username` | `os.userInfo().username` | Utilisateur |
| `totalMemory` | `os.totalmem()` | RAM totale (bytes → GB) |
| `cpuCount` | `os.cpus().length` | Nombre de cores |
| `cpuModel` | `os.cpus()[0]?.model` | Modèle du CPU |
| `nodeVersion` | `process.version` | Version Node.js |
| `npmVersion` | via `npm --version` | Version npm |
| `currentYear` | `new Date().getFullYear()` | Année en cours |
| `currentDate` | `new Date().toISOString()` | Date complète |
| `timezone` | `Intl.DateTimeFormat().resolvedOptions().timeZone` | Timezone |
| `uptime` | `os.uptime()` | Uptime système (secondes) |

**Interface** :
```typescript
interface SystemInfo {
  platform: NodeJS.Platform;
  arch: string;
  osType: string;
  osRelease: string;
  hostname: string;
  username: string;
  totalMemoryGB: number;
  cpuCount: number;
  cpuModel: string;
  nodeVersion: string;
  npmVersion: string | null;
  currentYear: number;
  currentDate: Date;
  timezone: string;
  systemUptimeHours: number;
}
```

**Fonction** : `async getSystemInfo(): Promise<SystemInfo>`

**Constante** : `export const CURRENT_YEAR = new Date().getFullYear()` — reutilizable partout

---

### V4.2 : ToolDetector — Détection systématique des outils

**Fichier** : `src/environment/tool-detector.ts`

**Responsabilité** : Vérifier quels outils sont disponibles sur le PATH et récupérer leurs versions.

**Outils détectés** :
| Outil | Commande version | Criticité | Usage watcher |
|---|---|---|---|
| `node` | `node --version` | CRITIQUE | Runtime |
| `npm` | `npm --version` | CRITIQUE | Gestion paquets |
| `npx` | `npx --version` | HAUTE | Exécution scripts |
| `eslint` | `npx eslint --version` | HAUTE | Validation code |
| `prettier` | `npx prettier --version` | HAUTE | Formatage code |
| `tsc` | `npx tsc --version` | MOYENNE | TypeScript compiler |
| `git` | `git --version` | MOYENNE | Version control |
| `yarn` | `yarn --version` | BASSE | Package manager alt. |
| `pnpm` | `pnpm --version` | BASSE | Package manager alt. |
| `tsx` | `npx tsx --version` | HAUTE | Exécution TS (launcher) |

**Méthode de détection** :
1. `where <tool>` (Windows) ou `which <tool>` (Linux/Mac) via `safeSpawn`
2. Si trouvé → `<tool> --version` pour récupérer la version
3. Si non trouvé → `available: false`, `version: null`
4. Câche le résultat en mémoire

**Interfaces** :
```typescript
interface ToolInfo {
  name: string;
  available: boolean;
  path: string | null;
  version: string | null;
  installSuggestion: string;
}

type ToolName = "node" | "npm" | "npx" | "eslint" | "prettier" | "tsc" | "git" | "yarn" | "pnpm" | "tsx";
```

**Fonctions** :
- `detectTools(): Promise<ToolInfo[]>` — détecte tous les outils
- `detectTool(name: ToolName): Promise<ToolInfo>` — détecte un outil
- `getMissingTools(): Promise<ToolInfo[]>` — retourne les outils manquants
- `getInstallSuggestions(): string[]` — retourne les commandes d'install
- `isToolAvailable(name: ToolName): Promise<boolean>` — check rapide

---

### V4.3 : DevEnvironment — IDE, Shell, Containers

**Fichier** : `src/environment/dev-environment.ts`

**Responsabilité** : Détecter l'environnement de développement.

**Détections** :

#### IDE / Éditeur
| IDE | Détection |
|---|---|
| VS Code | `process.env.VSCODE_IPC_HOOK` ou `process.env.VSCODE_PID` |
| JetBrains | Processus `idea`, `pycharm`, `webstorm` en cours |
| Sublime Text | `process.env.SUBLIME_TEXT` |
| Vim/Neovim | `process.env.VIM` ou `process.env.NVIM` |
| Inconnu | Aucune variable détectée |

#### Shell
| Shell | Détection |
|---|---|
| PowerShell | `process.env.ComSpec` contient `cmd` + `powershell` dans args |
| Bash | `process.env.SHELL` contient `bash` |
| Zsh | `process.env.SHELL` contient `zsh` |
| Fish | `process.env.SHELL` contient `fish` |
| CMD | `process.env.ComSpec` contient `cmd` |

#### Container / CI
| Environnement | Détection |
|---|---|
| Docker | Fichier `/proc/1/cgroup` contient `docker` OU `/.dockerenv` existe |
| WSL | `process.env.WSL_DISTRO_NAME` défini |
| CI (GitHub Actions) | `process.env.GITHUB_ACTIONS` === `true` |
| CI (GitLab) | `process.env.GITLAB_CI` === `true` |
| CI (Jenkins) | `process.env.JENKINS_URL` défini |
| CI (autre) | `process.env.CI` === `true` |
| Aucun | Aucune variable détectée |

**Interface** :
```typescript
interface DevEnvironment {
  ide: {
    name: string | null;
    version: string | null;
    processName: string | null;
  };
  shell: {
    name: string;
    version: string | null;
    path: string | null;
  };
  container: {
    isDocker: boolean;
    isWSL: boolean;
    isCI: boolean;
    ciProvider: string | null;
    wslDistro: string | null;
  };
}
```

**Fonction** : `async detectDevEnvironment(): Promise<DevEnvironment>`

---

### V4.4 : EnvReporter — Banner et rapport

**Fichier** : `src/environment/env-reporter.ts`

**Responsabilité** : Agréger les 3 modules, générer le banner, formatter le rapport.

**Fonctions** :
- `generateEnvReport(): Promise<EnvironmentReport>` — agrège tout
- `printBanner(report: EnvironmentReport): void` — affiche le banner coloré
- `getMissingToolsReport(report: EnvironmentReport): string` — section outils manquants
- `getSolutionsReport(report: EnvironmentReport): string[]` — suggestions d'install

**Interface** :
```typescript
interface EnvironmentReport {
  system: SystemInfo;
  tools: ToolInfo[];
  devEnv: DevEnvironment;
  timestamp: Date;
  year: number; // CURRENT_YEAR
  missingTools: ToolInfo[];
  suggestions: string[];
}
```

**Banner format** :
```
╔══════════════════════════════════════════════════════╗
║  WATCHER SERVICE v3.5 — 2025                        ║
║  Environment Report                                  ║
╠══════════════════════════════════════════════════════╣
║  Date       : 2025-06-14 08:00 (Africa/Abidjan)     ║
║  OS         : win32 x64 (10.0.19045)                ║
║  Host       : OPTIMUS (Optimus)                     ║
║  Node.js    : v20.11.1                              ║
║  npm        : 10.2.4                                ║
║  CPU        : 8 cores — Intel Core i7-12700K        ║
║  RAM        : 16 GB                                 ║
╠══════════════════════════════════════════════════════╣
║  Tools                                               ║
║  ✓ node         v20.11.1   C:\Program Files\...     ║
║  ✓ npm          10.2.4     C:\Program Files\...     ║
║  ✓ npx          10.2.4     C:\Program Files\...     ║
║  ✗ eslint       —          npm install -g eslint    ║
║  ✓ prettier     3.2.5      C:\Users\...\npm\...    ║
║  ✓ tsc          5.3.3      node_modules\.bin\...    ║
║  ✓ git          2.43.0     C:\Program Files\...     ║
╠══════════════════════════════════════════════════════╣
║  Dev Environment                                     ║
║  IDE        : VS Code                               ║
║  Shell      : powershell 5.1                        ║
║  Docker     : No                                    ║
║  WSL        : No                                    ║
║  CI         : No                                    ║
╚══════════════════════════════════════════════════════╝
```

---

### V4.5 : Dynamic Tool Installer

**Fichier** : `scripts/install-tools.cjs`

**Remplace** : ancien dossier `tools/` (supprimé)

**Fonctionnalités** :
- Détection automatique de 10 outils (node, npm, npx, eslint, prettier, tsc, git, yarn, pnpm, tsx)
- Auto-installation via `npm install -g` pour les outils manquants
- Rapport détaillé : OK / Installed / Failed / Manual
- Appelé par `start-watcher.bat` (option [9])

---

### V4.6 : Intégration CLI

**Modifications** : `src/cli/index.ts` + `start-watcher.bat`

#### Principes fondamentaux
1. **Banner TOUJOURS affichée** — avant le menu `start-watcher.bat` et avant chaque commande CLI
2. **`--env` est un argument permanent** sur toutes les commandes, jamais optionnel
3. **`analyze` inclut TOUJOURS `--env` automatiquement** — pas de choix, c'est obligatoire
4. **`CURRENT_YEAR`** — constante reutilizable (`src/environment/types.ts`) exposée partout

#### Banner au démarrage
Le banner s'affiche **avant** le menu `start-watcher.bat` et **avant** chaque commande CLI :
```
╔══════════════════════════════════════════════════════╗
║  WATCHER SERVICE v3.5 — 2025                        ║
║  Environment Report                                  ║
╠══════════════════════════════════════════════════════╣
║  Date       : 2025-06-14 08:00 (Africa/Abidjan)     ║
║  OS         : win32 x64 (10.0.19045)                ║
║  Node.js    : v20.11.1                              ║
║  Tools      : 8/10 ✓                                ║
║  Missing    : eslint, yarn                          ║
╚══════════════════════════════════════════════════════╝
```

#### Commandes et arguments

| Commande | Arguments | Comportement |
|---|---|---|
| `start` | `--env` (permanent) | Affiche banner + lance le watcher |
| `scan` | `--env` (permanent), `--fix`, `--inject`, `--dry-run`, `--report` | Banner + scan + rapport env |
| `analyze` | `--env` **TOUJOURS injecté automatiquement** | Analyse du projet + rapport env obligatoire |
| `env` (nouveau) | `--json`, `--compact` | Affiche juste le rapport d'environnement |
| `doctor` (nouveau) | `--fix` | Vérifie tout + installe les outils manquants |

#### `--env` : argument permanent
- Ajouté à **toutes les commandes** via `.option("--env", "Afficher le rapport d'environnement")`
- **Toujours activé par défaut** — l'utilisateur n'a pas besoin de le spécifier
- Pour `analyze` : `--env` est **injecté automatiquement** dans le handler, même si l'utilisateur ne l'a pas demandé
- Seul moyen de le désactiver : `--no-env` (rare, pour du scripting)

#### `CURRENT_YEAR` : constante globale
```typescript
// src/environment/types.ts
export const CURRENT_YEAR = new Date().getFullYear();

// Utilisable partout :
// - Banner : `WATCHER SERVICE v3.5 — ${CURRENT_YEAR}`
// - Logs : `[${CURRENT_YEAR}] INFO: ...`
// - Rapports : date header
// - Consignment files : header `<!-- Managed by watcher-service ${CURRENT_YEAR} -->`
```

#### `start-watcher.bat` : banner intégrée
Le script `.bat` affiche la banner **avant le menu** :
```batch
@echo off
REM --- Banner environment ---
node src/index.ts env --compact
REM --- Menu ---
echo [1] Lancer le watcher
echo [2] Scanner un projet
echo ...
```

---

### V4.7 : Tests

**Fichiers** : `tests/environment/`

| Test | Ce qu'il vérifie |
|---|---|
| `system-info.test.ts` | `getSystemInfo()` retourne des données valides |
| `tool-detector.test.ts` | `detectTools()` détecte node/npm, gère les outils manquants |
| `dev-environment.test.ts` | `detectDevEnvironment()` détecte le shell, IDE, containers |
| `env-reporter.test.ts` | `generateEnvReport()` agrège correctement, `printBanner()` ne crash pas |
| `integration.test.ts` | Test d'intégration complète du flow de démarrage |

---

## Ordre d'implémentation

1. **V4.1** — SystemInfo (base, sans dépendances)
2. **V4.2** — ToolDetector (dépend de `safeSpawn`)
3. **V4.3** — DevEnvironment (indépendant)
4. **V4.4** — EnvReporter (agrège V4.1 + V4.2 + V4.3)
5. **V4.5** — Dossier tools/ (scripts d'install)
6. **V4.6** — Intégration CLI (banner + commandes)
7. **V4.7** — Tests (après chaque module)

---

## Contraintes

- TypeScript ESM (`"type": "module"`)
- Pas de dépendances externes pour la détection (os, child_process natifs)
- `safeSpawn` avec `shell: true` sur Windows pour les commandes npm/npx
- Logger Winston pour tous les messages
- Les outils manquants ne doivent PAS crasher le watcher — juste un warning
- Banner **toujours affichée** (pas de --no-banner)
- `--env` **permanent** sur toutes les commandes (activé par défaut)
- `analyze` inclut **toujours** `--env` automatiquement
- `CURRENT_YEAR` est une constante reutilizable dans tout le codebase
- Compatible Windows (prioritaire), Linux, Mac

---

## Statut

| Phase | Description | Statut |
|---|---|---|
| V4.1 | SystemInfo | ✅ Terminé |
| V4.2 | ToolDetector | ✅ Terminé |
| V4.3 | DevEnvironment | ✅ Terminé |
| V4.4 | EnvReporter | ✅ Terminé |
| V4.5 | Dossier tools/ | ✅ Terminé |
| V4.6 | Intégration CLI | ✅ Terminé |
| V4.7 | Tests | ✅ Terminé |
