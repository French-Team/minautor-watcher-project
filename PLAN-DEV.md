# Plan de Developpement - Watcher Service

> Cree le 12 juin 2026

## Phase 1 : Correction des bugs critiques

Objectif : Corriger les bugs qui impactent le fonctionnement correct du pipeline.

### 1.1 Double handler d'evenements (Detection)

**Fichier** : `src/detection/index.ts`

Le probleme : `setupEventHandlers()` et `setupWatcherEventForwarding()` enregistrent toutes les deux des listeners sur les memes evenements du Watcher. chaque changement de fichier est traite 2 fois.

**Solution** : Supprimer `setupEventHandlers()` et garder uniquement `setupWatcherEventForwarding()` qui fait deja le filtrage avant d'emettre sur l'EventBus.

```
- Supprimer setupEventHandlers()
- Garder setupWatcherEventForwarding() comme seul point d'entree
- Verifier que le forwarding couvre bien tous les types d'evenements
```

### 1.2 Incompatibilite du fichier prevention-rules.json

**Fichiers** : `config/prevention-rules.json`, `src/prevention/config.ts`

Le probleme : Le fichier JSON utilise un format plat (`rules[].id/enabled/severity/extensions`) alors que `PreventionConfigManager` attend un schema avec `validators`, `scripts`, `conditions`, `actions`. Le manager ignore le fichier et utilise les defaults hardcodes.

**Solution** : Adapter `config/prevention-rules.json` au schema attendu.

```
Format attendu par le code :
{
  "rules": [
    {
      "name": "eslint-validation",
      "description": "...",
      "enabled": true,
      "conditions": { "fileExtensions": ["js","ts"] },
      "validators": ["eslint"],
      "scripts": [],
      "actions": [{ "type": "validate", "config": {} }]
    }
  ]
}
```

### 1.3 getStatus() retourne toujours running: false

**Fichier** : `src/index.ts`

Le probleme : La propriete `running` dans `getStatus()` est hardcodee a `false`.

**Solution** : Ajouter un flag `isRunning` dans `WatcherService`, le passer a `true` dans `start()` et `false` dans `stop()`.

```
- Ajouter private isRunning: boolean = false dans WatcherService
- this.isRunning = true dans start() apres le Promise.all
- this.isRunning = false dans stop() apres le Promise.all
- Retourner this.isRunning dans getStatus()
```

---

## Phase 2 : Fonctionnalites manquantes

Objectif : Completer les fonctionnalites partiellement implementees.

### 2.1 Forwarding des evenements fileDeleted

**Fichier** : `src/index.ts` (methode `setupModuleCommunication`)

Le probleme : Seuls `fileDetected` et `fileModified` sont forwards aux modules Prevention et Trigger. Les suppressions de fichiers sont detectees par fs.watch mais jamais traitees.

**Solution** : Ajouter un listener pour `fileDeleted` qui emet un evenement dans le TriggerModule avec le type "fileDeleted".

```
this.detectionModule.eventBus.on("fileDeleted", async (event) => {
  await this.triggerModule!.processEvent({
    filePath: event.file.filePath,
    eventType: "fileDeleted",
    timestamp: new Date(),
  });
});
```

### 2.2 reloadConfig() fonctionnel dans Detection

**Fichier** : `src/detection/index.ts`

Le probleme : `reloadConfig()` ne fait que logger un message sans rien recharger.

**Solution** : Recharger la configuration du Watcher (exclusions, extensions) et reinitialiser le FileFilter.

```
- Accepter un nouveau config en parametre
- Reinitialiser le watcher avec les nouvelles options
- Recreer le FileFilter avec les nouveaux presets/criteres
- Rebind les event handlers
```

### 2.3 Enregistrement de validateurs custom

**Fichier** : `src/prevention/index.ts` (methode `updateComponentConfigurations`)

Le probleme : Le code log "Custom validator registered" mais n'enregistre rien dans le ValidatorRegistry.

**Solution** : Parcourir `config.customValidators` et creer des instances de `PatternValidator` ou d'autres validateurs pour chaque entree, puis les enregistrer dans le registry.

---

## Phase 3 : Bugs de second niveau

Objectif : Corriger les problemes de logique dans le code existant.

### 3.1 TextReplacement corrector dangereux

**Fichier** : `src/trigger/correctors.ts` (ligne 714-732)

Le probleme : Le corrector par defaut remplace les chaines vides `""` par `"logger.info("`. Si jamais declenche, ca casserait tous les fichiers.

**Solution** : Soit supprimer cette regle par defaut, soit la desactiver (`enabled: false`), soit corriger le pattern pour cibler reellement `console.log(`.

### 3.2 Comparaison maxFileSize string vs number

**Fichier** : `src/trigger/index.ts` (ligne 444)

Le probleme : `action.config.maxFileSize` peut etre une string `"1MB"` (depuis le legacy JSON) mais la comparaison `stats.size > maxFileSize` attend un number.

**Solution** : Implementer une fonction `parseFileSize(str)` qui convertit `"1MB"` en `1048576`, `"500KB"` en `512000`, etc. L'utiliser dans le handler `skip`.

### 3.3 Handler fileDeleted dans DetectionModule

**Fichier** : `src/detection/index.ts`

Le probleme : `handleFileEvent` gere `FILE_ADDED`, `FILE_CHANGED`, `FILE_DELETED` mais le forwarding ne forward que les deux premiers.

**Solution** : S'assurer que `forwardEvent` gere aussi `FILE_DELETED` en creant un emittion `emitFileDeleted` sur l'EventBus.

---

## Phase 4 : Tests

Objectif : Couvrir les modules sans tests.

### 4.1 Tests unitaires a ajouter

| Module | Fichier a tester | Priorite |
|--------|-----------------|----------|
| Detection | `watcher.ts` | Haute |
| Prevention | `config.ts` | Haute |
| Prevention | `scripts.ts` | Haute |
| Trigger | `correctors.ts` | Haute |
| Trigger | `rules.ts` | Haute |
| Trigger | `index.ts` | Moyenne |
| Prevention | `index.ts` | Moyenne |
| Main | `index.ts` (CLI) | Basse |

### 4.2 Tests d'integration a ajouter

| Scenario | Description |
|----------|-------------|
| Pipeline complet | Detection -> Prevention -> Trigger sur un fichier modifie |
| Correction auto | Un fichier avec erreurs ESLint est detecte et corrige automatiquement |
| Notification | Une erreur declenche une notification Console |
| Cooldown | Deux modifications rapides ne declenchent qu'une seule action |
| Reload config | Recharger les regles sans redemarrer le service |

---

## Phase 5 : Ameliorations

Objectif : Ameliorer l'experience developpeur et la maintenabilite.

### 5.1 Configuration

- Corriger le format de `config/prevention-rules.json` pour qu'il soit valide
- Ajouter un exemple de configuration dans `config/` avec des commentaires
- Ajouter un schema JSON pour valider les fichiers de config

### 5.2 CLI amelioree

- Ajouter une commande `config` pour valider et afficher la config actuelle
- Ajouter une commande `test-all` pour tester le pipeline complet
- Ajouter des couleurs et un formatage ameliore dans le terminal

### 5.3 Documentation

- Documenter les API internes (module communication, event bus, etc.)
- Ajouter des exemples d'utilisation pour chaque module
- Documenter le format des regles prevention et trigger

### 5.4 Performance

- Benchmark du pipeline complet sur de gros projets
- Optimiser le debounce si necessaire
- Ajouter des metrics (nombre de fichiers traites, temps moyen, etc.)

---

## Ordre de realisation recommande

```
Phase 1 (bugs critiques)      -> 1-2 jours
  1.1 Double handler
  1.2 prevention-rules.json
  1.3 getStatus()

Phase 2 (fonctionnalites)     -> 2-3 jours
  2.1 fileDeleted forwarding
  2.2 reloadConfig()
  2.3 validateurs custom

Phase 3 (bugs secondaires)    -> 1 jour
  3.1 TextReplacement dangereux
  3.2 maxFileSize string vs number
  3.3 fileDeleted handler

Phase 4 (tests)               -> 3-5 jours
  4.1 Tests unitaires
  4.2 Tests d'integration

Phase 5 (ameliorations)       -> 2-3 jours
  5.1 Configuration
  5.2 CLI
  5.3 Documentation
  5.4 Performance
```

**Estimation totale** : 9-14 jours de developpement
