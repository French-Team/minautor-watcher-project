# API Interne - Watcher Service

## Architecture des modules

```
                    ┌─────────────────┐
                    │  WatcherService  │
                    │  (Orchestrator)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐ ┌────▼─────┐ ┌──────▼────────┐
    │ DetectionModule│ │Prevention│ │ TriggerModule  │
    │                │ │ Module   │ │                │
    └────────┬───────┘ └────┬─────┘ └──────┬────────┘
             │              │              │
        ┌────▼────┐    processFile()  processEvent()
        │EventBus │         │              │
        │(shared) └────────►┴──────────────┘
        └─────────
```

## Communication inter-modules

### Bus d'evenements

Le `DetectionEventBus` (extends `EventEmitter`) est le canal central de communication.

**Evenements emis par DetectionModule** :

| Evenement | Type | Donnees |
|-----------|------|---------|
| `fileDetected` | `FileDetectedEvent` | `{ file: FileEvent, source: "watcher" \| "scan" }` |
| `fileModified` | `FileDetectedEvent` | `{ file: FileEvent, source: "watcher" \| "scan" }` |
| `fileDeleted` | `FileDetectedEvent` | `{ file: FileEvent, source: "watcher" \| "scan" }` |
| `processingStarted` | `ProcessingEvent` | `{ file, processor, startTime }` |
| `processingCompleted` | `ProcessingEvent` | `{ file, processor, endTime, duration, success }` |
| `processingFailed` | `ProcessingEvent` | `{ file, processor, error }` |
| `detectionError` | `DetectionErrorEvent` | `{ error, context, file?, timestamp }` |

### Flux de donnees

```
1. fs.watch detecte changement fichier
2. DetectionModule filtre (extension, patterns, taille, date)
3. Si le fichier passe le filtre :
   a. emit("fileDetected") ou emit("fileModified")
   b. WatcherService reçoit l'evenement
   c. Appelle PreventionModule.processFile(filePath)
   d. Si prevention OK : appelle TriggerModule.processEvent(context)
   e. Si prevention echoue : emet evenement "preventionFailed" au Trigger
```

### Types cles

```typescript
// Fichier detecte
interface FileEvent {
  filePath: string;      // Chemin absolu
  relativePath: string;  // Chemin relatif au dossier surveille
  extension: string;     // Extension sans le point (.ts, .js, etc.)
  timestamp: Date;       // Moment de detection
}

// Contexte de declenchement
interface TriggerContext {
  filePath: string;
  eventType: string;     // "fileDetected" | "fileModified" | "fileDeleted"
  error?: any;
  metadata?: Record<string, any>;
  timestamp: Date;
}

// Resultat de prevention
interface PreventionResult {
  filePath: string;
  success: boolean;
  errors: string[];
  warnings: string[];
  executionTime: number;
  metadata?: Record<string, any>;
}

// Resultat de declenchement
interface TriggerResult {
  ruleId: string;
  success: boolean;
  actions: Array<{
    type: string;
    success: boolean;
    result?: any;
    error?: Error;
  }>;
  executionTime: number;
  skipped?: boolean;
  cooldown?: boolean;
  error?: Error;
}
```

## API des modules

### DetectionModule

```typescript
class DetectionModule {
  eventBus: DetectionEventBus;  // Bus d'evenements partage

  start(): Promise<void>;       // Demarrer la surveillance
  stop(): Promise<void>;        // Arreter la surveillance
  getStatus(): ModuleStatus;    // Etat du module
  reloadConfig(): Promise<void>; // Recharger configuration
}
```

### PreventionModule

```typescript
class PreventionModule {
  processFile(filePath: string): Promise<PreventionResult>;

  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): ModuleStatus;
  reloadConfig(): Promise<void>;
}
```

### TriggerModule

```typescript
class TriggerModule {
  processEvent(context: TriggerContext): Promise<TriggerResult>;

  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): ModuleStatus;
  reloadConfig(): Promise<void>;
}
```

## WatcherService (Orchestrateur)

```typescript
class WatcherService {
  initialize(): Promise<void>;   // Initialiser tous les modules
  start(): Promise<void>;        // Demarrer le service
  stop(): Promise<void>;         // Arreter le service
  getStatus(): ServiceStatus;    // Etat + metriques
  reloadConfig(): Promise<void>; // Recharger toutes les configs
  getMetrics(): ServiceMetrics;  // Metriques de session
  resetMetrics(): void;          // Reinitialiser les compteurs
}

interface ServiceMetrics {
  filesProcessed: number;
  filesCorrected: number;
  filesFailed: number;
  totalProcessingTime: number;
  startTime: Date | null;
  lastFileTime: Date | null;
}
```

## CLI

```typescript
class WatcherCLI {
  run(): Promise<void>;  // Parser args et executer la commande
}
```

**Commandes** : `start`, `stop`, `status`, `reload`, `test`, `config`, `test-all`

Voir `ETAT-DU-PROJET.md` pour les options de chaque commande.
