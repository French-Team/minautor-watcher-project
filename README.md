# Watcher

Un service de surveillance de code modulaire, automatisé et portable. Détecte les changements en temps réel, prévient les erreurs avant propagation, et corrige automatiquement ce qui peut l'être — en arrière-plan, sans interruption du développement.

---

## Table des matières

- [Philosophie](#philosophie)
- [Architecture](#architecture)
- [Modules](#modules)
  - [Detection](#detection)
  - [Prevention](#prevention)
  - [Trigger](#trigger)
- [Configuration](#configuration)
- [CLI](#cli)
- [API programmatique](#api-programmatique)
- [Développement](#développement)
  - [Ajouter un validateur](#ajouter-un-validateur)
  - [Ajouter un correcteur](#ajouter-un-correcteur)
  - [Ajouter un notifieur](#ajouter-un-notifieur)
- [Tests](#tests)
- [Stack](#stack)

---

## Philosophie

Watcher est né d'un constat simple : la qualité du code ne devrait pas reposer uniquement sur la discipline de l'équipe. Au lieu d'attendre une revue de code ou une CI distante, Watcher **agit localement, en continu**, en trois temps :

1. **Détecter** les changements dès qu'ils surviennent
2. **Prévenir** les mauvaises pratiques par validation immédiate
3. **Déclencher** des corrections automatiques ou des notifications

L'objectif n'est pas de remplacer les outils existants (ESLint, Prettier, hooks git), mais de les **orchestrer en continu** plutôt qu'à des moments ponctuels.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    WatcherService                     │
├────────────┬──────────────┬──────────────────────────┤
│ Detection  │  Prevention  │        Trigger           │
│            │              │                          │
│ chokidar   │  validateurs  │  correcteurs             │
│ filters    │  scripts     │  notifieurs              │
│ events     │  config      │  rules engine            │
└─────┬──────┴──────┬───────┴──────────┬───────────────┘
      │             │                  │
      └─────────────┴──────────────────┘
                   │
            Event Bus (DetectionEventBus)
```

Chaque module est indépendant, peut être utilisé séparément, et communique via un bus d'événements partagé.

---

## Modules

### Detection

Surveille le système de fichiers et filtre les événements pertinents.

**Fichiers :** `src/detection/`

| Classe / Fichier | Rôle |
|------------------|------|
| `Watcher` | Interface avec Chokidar, émet des événements bruts |
| `FileFilter` | Filtre par extension, pattern, taille, date de modification |
| `DetectionEventBus` | Bus d'événements typé, relaye les événements filtrés |
| `FilterPresets` | Presets prêts à l'emploi (`jsTsProject`, `minimal`, `comprehensive`) |

**Événements émis :**

```typescript
FILE_DETECTED    → fichier ajouté
FILE_MODIFIED    → fichier modifié
FILE_DELETED     → fichier supprimé
DETECTION_ERROR  → erreur du watcher
```

**Filtres disponibles :**

| Filtre | Description |
|--------|-------------|
| `extensions` | Liste blanche d'extensions (ex: `['ts', 'js']`) |
| `excludePatterns` | Patterns glob à exclure (ex: `['node_modules/**']`) |
| `includePatterns` | Patterns glob à inclure |
| `maxFileSize` / `minFileSize` | Taille en bytes |
| `modifiedWithin` | Délai max depuis la dernière modification (ms) |

---

### Prevention

Valide le code dès qu'un fichier est détecté ou modifié.

**Fichiers :** `src/prevention/`

| Classe / Fichier | Rôle |
|------------------|------|
| `PreventionModule` | Orchestre la validation et l'exécution des scripts |
| `BaseValidator` | Classe abstraite pour les validateurs |
| `ESLintValidator` | Exécute ESLint sur les fichiers JS/TS |
| `JSONValidator` | Vérifie la syntaxe JSON |
| `YAMLValidator` | Vérifie la syntaxe YAML (optionnel) |
| `PatternValidator` | Détecte des patterns personnalisés (console.log, TODO, etc.) |
| `ValidatorRegistry` | Enregistre et résout les validateurs par nom |
| `ScriptRunner` | Exécute des scripts shell (ESLint --fix, Prettier, tsc, etc.) |
| `PreventionConfigManager` | Gère les règles depuis `config/prevention-rules.json` |

**Règles par défaut :**

```
ESLint Validation    → erreur   → .js/.ts/.jsx/.tsx
Prettier Formatting  → warning  → .js/.ts/.jsx/.tsx/.json/.md
JSON Validation      → erreur   → .json
TypeScript Check     → erreur   → .ts/.tsx
Security Audit       → warning  → package.json
Dependency Check     → info     → package.json
```

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

| Classe / Fichier | Rôle |
|------------------|------|
| `TriggerModule` | Orchestre règles, correcteurs et notifieurs |
| `TriggerRuleManager` | Évalue les règles déclencheurs, gère les cooldowns |
| `BaseCorrector` | Classe abstraite pour les corrections |
| `ESLintFixCorrector` | Exécute `eslint --fix` sur un fichier |
| `PrettierFormatCorrector` | Exécute `prettier --write` sur un fichier |
| `TextReplacementCorrector` | Remplace, insère ou supprime du texte |
| `CommandCorrector` | Exécute des commandes shell arbitraires |
| `CorrectorRegistry` | Enregistre et résout les correcteurs |
| `BaseNotifier` | Classe abstraite pour les notifications |
| `SlackNotifier` | Envoie des messages structurés sur Slack |
| `EmailNotifier` | Envoie des emails via Nodemailer |
| `ConsoleNotifier` | Log dans la console |
| `FileNotifier` | Écrit dans un fichier de log dédié |
| `NotifierRegistry` | Enregistre et résout les notifieurs |

**Actions disponibles :**

```typescript
type ActionType = 'correct' | 'notify' | 'log' | 'skip' | 'custom';
```

**Types de règles déclencheurs (config/trigger-rules.json) :**

| Propriété | Description |
|-----------|-------------|
| `eventTypes` | Types d'événements déclencheurs (`fileModified`, `preventionFailed`) |
| `fileExtensions` | Extensions ciblées |
| `filePatterns` | Patterns de fichiers |
| `errorPatterns` | Patterns d'erreur à détecter |
| `severity` | Seuil de sévérité minimal |
| `cooldown` | Période de repos entre deux exécutions |
| `priority` | Ordre d'exécution (100 = premier) |

---

## Configuration

### `.env.local`

```env
WATCH_DIR=./project            # Dossier à surveiller
EXCLUDED_DIRS=node_modules,.git,dist,build
WATCH_EXTENSIONS=js,ts,jsx,tsx,json,md,css,scss,html
PROCESSING_DELAY=100           # Délai avant traitement (ms)
LOG_LEVEL=info

# Notifications
SLACK_TOKEN=
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_TO=
```

### `config/prevention-rules.json`

Définit les règles de validation par type de fichier, sévérité, et scripts associés.

### `config/trigger-rules.json`

Définit les règles de correction (corrections, conditions, notifications). Deux formats sont supportés :

- **Format moderne :** `{ "rules": [ TriggerRule, ... ] }`
- **Format legacy (supporté) :** `{ "corrections": [...], "conditions": [...], "notifications": {...} }`

---

## CLI

```bash
npm start -- [command] [options]

Commands:
  start [options]   Lance la surveillance
    -d, --dir       Dossier à surveiller
    --no-prevention Désactive le module de prévention
    --no-trigger    Désactive le module de déclenchement
  stop              Arrête le service
  status            Affiche l'état des modules
  reload            Recharge la configuration
  test -f <file>    Teste les règles sur un fichier
```

---

## API programmatique

```typescript
import { WatcherService } from 'watcher-service';

const service = new WatcherService({ watchDir: './src' });

await service.initialize();
await service.start();

// Plus tard
await service.stop();
```

Utilisation modulaire :

```typescript
import { createDetectionModule } from 'watcher-service/detection';
import { createPreventionModule } from 'watcher-service/prevention';
import { createTriggerModule } from 'watcher-service/trigger';

const detection = createDetectionModule({ watchDir: './src' });
await detection.start();
```

---

## Développement

### Ajouter un validateur

```typescript
import { BaseValidator, ValidatorRegistry, ValidationResult } from '../prevention/validators.js';

class MyValidator extends BaseValidator {
  constructor() {
    super('my-validator', { enabled: true, rules: {} });
  }

  async validate(filePath: string): Promise<ValidationResult> {
    // Logique de validation
    return { isValid: true, errors: [], warnings: [] };
  }
}

// Enregistrement
registry.register('my-validator', new MyValidator());
```

### Ajouter un correcteur

```typescript
import { BaseCorrector, CorrectionResult, CorrectionRule } from '../trigger/correctors.js';

class MyCorrector extends BaseCorrector {
  constructor(config: CorrectionRule) {
    super(config.id, config);
  }

  canCorrect(filePath: string, error?: any): boolean {
    return filePath.endsWith('.myext');
  }

  async applyCorrection(filePath: string, error?: any): Promise<CorrectionResult> {
    // Logique de correction
    return { success: true, corrected: false, changes: [], executionTime: 0 };
  }
}

// Enregistrement
registry.register('my-corrector', new MyCorrector({ ... }));
```

### Ajouter un notifieur

```typescript
import { BaseNotifier, NotificationData, NotificationResult, NotificationChannel } from '../trigger/notifiers.js';

class WebhookNotifier extends BaseNotifier {
  constructor() {
    super('webhook', true);
  }

  async send(data: NotificationData): Promise<NotificationResult> {
    // Envoi vers webhook
    return { success: true, channel: NotificationChannel.CONSOLE };
  }
}

// Enregistrement
registry.register(NotificationChannel.CONSOLE, new WebhookNotifier());
```

---

## Tests

```bash
npm test              # 54 tests, 4 suites
npm run test:watch    # Mode watch
npm run typecheck     # Vérification TypeScript
npm run lint          # ESLint
```

**Couverture actuelle :**

| Module | Tests | Couvert |
|--------|-------|---------|
| `shared/utils.ts` | 18 | Utilitaires fichiers, validation, debounce |
| `detection/filters.ts` | 12 | Filtres extension, pattern, taille, presets |
| `prevention/validators.ts` | 11 | JSON, patterns, registry |
| `trigger/notifiers.ts` | 13 | Console, fichier, registry, utils |

---

## Stack

| Technologie | Version | Usage |
|-------------|---------|-------|
| Node.js | ^24 | Runtime |
| TypeScript | ^5.9 | Langage |
| Chokidar | ^3.5 | File watcher |
| ESLint | ^8 | Linting |
| Prettier | ^2.8 | Formatage |
| Winston | ^3.8 | Logging |
| Commander.js | ^10 | CLI |
| Joi | ^17 | Validation de config |
| Slack SDK | ^6.8 | Notifications Slack |
| Nodemailer | ^6.9 | Notifications email |
| Jest | ^29 | Tests |
| ts-jest | ^29 | Tests TypeScript |
| tsx | ^4 | Dev runner |

---

<div align="center">
  <sub>
    <a href="./PLAN.md">Plan de développement</a> ·
    <a href="./watcher-specification.md">Spécifications</a> ·
    <a href="./watcher-requirements.md">Exigences</a>
  </sub>
  <br>
  <sub>Watcher Service · MIT</sub>
</div>
