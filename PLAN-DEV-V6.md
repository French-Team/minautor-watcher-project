# PLAN DEV V6 — Benchmark & Consommation Ressources

> **Objectif** : Mesurer et documenter la consommation du watcher en fonctionnement — CPU, memoire, throughput, latence, scalabilite.
> **Statut** : Termine.

---

## Contexte

Le watcher est operationnel (335/335 tests, V5 complete). Avant de le deployer sur des projets reels, il faut savoir :
- Combien de CPU/RAM consomme-t-il au repos ?
- Combien consomme-t-il sous charge (100, 500, 1000 fichiers/heure) ?
- Combien de temps met-il par fichier ?
- Le bounded parallelism (N chaines) est-il efficace ?
- Le `scanInitialFiles` evite-t-il vraiment le CPU flood au demarrage ?

---

## Architecture du benchmark

```
benchmarks/
├── run-benchmark.ts            # Orchestrateur principal
├── scenarios/
│   ├── idle.ts                 # Consommation au repos (rien a faire)
│   ├── burst.ts                # Rafale de N fichiers simultanes
│   ├── sustained.ts            # Charge continue (fichiers toutes les X secondes)
│   ├── startup.ts              # Demarrage avec N fichiers existants
│   └── scalability.ts          # Comparaison 1/3/5/10 chaines
├── fixtures/
│   ├── generate-project.ts     # Genere un projet fake (N fichiers .ts)
│   └── modify-files.ts         # Modifie X fichiers pour declencher le pipeline
├── reporters/
│   ├── console-reporter.ts     # Affichage formate dans la console
│   ├── json-reporter.ts        # Export JSON pour analyse ulterieure
│   └── chart-reporter.ts       # Genere un graphique ASCII (optionnel)
└── README.md                   # Documentation des benchmarks
```

---

## Phases du plan

### V6.1 : Infrastructure de benchmark

**Objectif** : Creer le framework de benchmark reutilisable.

| Tache | Fichier | Description |
|-------|---------|-------------|
| Generateur de projet fake | `fixtures/generate-project.ts` | Cree N fichiers `.ts` avec du code realiste (imports, classes, functions) |
| Simulateur de modifications | `fixtures/modify-files.ts` | Modifie X fichiers aleatoirement (ajoute une ligne, change un import) |
| Collecteur de metriques | `collect-metrics.ts` | Capture CPU (os.cpus delta), heap (process.memoryUsage), RSS, temps |
| Runner de scenario | `run-benchmark.ts` | Lance un scenario, collecte les metriques, genere le rapport |

**Delai estime** : 1 session

---

### V6.2 : Scenarios de base

**Objectif** : Implementer les 3 scenarios fondamentaux.

#### V6.2.1 — Idle (au repos)

| Metrique | Cible | Methode |
|----------|-------|---------|
| CPU au repos | < 1% | Demarrer le watcher, attendre 30s, mesurer CPU moyen |
| Heap au repos | < 50 MB | `process.memoryUsage().heapUsed` |
| RSS au repos | < 100 MB | `process.memoryUsage().rss` |

**Script** : `scenarios/idle.ts`
1. Generer un projet de 1000 fichiers
2. Demarrer le watcher
3. Attendre 30 secondes (rien ne change)
4. Collecter 6 snapshots (5s d'intervalle)
5. Calculer min/max/moyenne CPU et heap
6. Verifier que CPU < 1% et heap < 50 MB

#### V6.2.2 — Burst (rafale)

| Metrique | Cible | Methode |
|----------|-------|---------|
| Throughput | > 10 fichiers/s | Nombre de fichiers traites / temps total |
| Latence max | < 5s par fichier | Temps max entre FILE_ADDED et onComplete |
| CPU peak | < 80% | CPU maximal pendant la rafale |
| Pas de crash | 0 erreur fatale | Tous les fichiers traits sans exception |

**Script** : `scenarios/burst.ts`
1. Generer un projet de 500 fichiers
2. Demarrer le watcher
3. Modifier 100 fichiers en < 1 seconde (simule un git pull)
4. Mesurer le temps total de traitement
5. Calculer throughput = 100 / temps_total
6. Verifier que tous les fichiers sont traites (metrics.filesProcessed == 100)

#### V6.2.3 — Sustained (charge continue)

| Metrique | Cible | Methode |
|----------|-------|---------|
| CPU moyen | < 10% | CPU moyen sur 60 secondes |
| Pas de fuite memoire | Heap stable (+/- 10%) | Comparer heap debut vs fin |
| Files traites | 100% | Tous les fichiers modifies sont traites |

**Script** : `scenarios/sustained.ts`
1. Generer un projet de 200 fichiers
2. Demarrer le watcher
3. Modifier 1 fichier toutes les 2 secondes pendant 60 secondes (30 fichiers)
4. Collecter des snapshots toutes les 5 secondes
5. Verifier que le heap ne croit pas de maniere lineaire (pas de fuite)
6. Verifier que tous les fichiers sont traites

**Delai estime** : 1 session

---

### V6.3 : Scenarios avances

**Objectif** : Tests de scalabilite et de robustesse.

#### V6.3.1 — Startup (demarrage)

| Metrique | Cible | Methode |
|----------|-------|---------|
| Scan initial | < 5s pour 10000 fichiers | Temps de `scanInitialFiles()` |
| CPU pendant scan | < 20% | CPU maximal pendant le scan |
| Apres scan | < 1% | CPU revient au repos |

**Script** : `scenarios/startup.ts`
1. Generer un projet de 1000, 5000, 10000 fichiers
2. Mesurer le temps de `scanInitialFiles()` pour chaque taille
3. Verifier que `scanInitialFiles` n'emmet AUCUN evenement (pas de FILE_ADDED)
4. Verifier que le CPU revient au repos apres le scan

#### V6.3.2 — Scalabilite (N chaines)

| Metrique | Cible | Methode |
|----------|-------|---------|
| 1 chaine | Reference | Benchmark avec CHAIN_COUNT=1 |
| 3 chaines | > 2x plus rapide que 1 | Throughput comparison |
| 5 chaines | > 3x plus rapide que 1 | Throughput comparison |
| 10 chaines | > 4x plus rapide que 1 | Throughput comparison |

**Script** : `scenarios/scalability.ts`
1. Generer un projet de 500 fichiers
2. Pour CHAIN_COUNT dans [1, 3, 5, 10] :
   a. Modifier 100 fichiers en burst
   b. Mesurer le temps total
   c. Calculer le throughput
3. Afficher un tableau comparatif
4. Verifier que 5 chaines > 1 chaine (au moins 2x)

#### V6.3.3 — Stress (charge extreme)

| Metrique | Cible | Methode |
|----------|-------|---------|
| 500 fichiers en burst | Pas de crash | Tous traites sans erreur |
| Memoire | < 200 MB | RSS maximal |
| Recuperation | < 5s apres la charge | CPU revient < 5% |

**Script** : `scenarios/stress.ts`
1. Generer un projet de 1000 fichiers
2. Modifier 500 fichiers en < 2 secondes
3. Mesurer le temps total de traitement
4. Verifier que la memoire reste < 200 MB
5. Attendre 10 secondes apres le dernier fichier
6. Verifier que le CPU revient < 5%

**Delai estime** : 1 session

---

### V6.4 : Reporters et format de sortie

**Objectif** : Afficher les resultats de maniere lisible.

#### Console reporter

```
╔══════════════════════════════════════════════╗
║        BENCHMARK REPORT — 2026-06-15        ║
╠══════════════════════════════════════════════╣
║ Scenario: burst (100 files)                  ║
║ Chains: 5                                    ║
╠══════════════════════════════════════════════╣
║ Throughput:     45.2 files/s                 ║
║ Latency avg:    22.1 ms                      ║
║ Latency p95:    45.0 ms                      ║
║ Latency max:    89.0 ms                      ║
║ CPU peak:       34%                          ║
║ CPU avg:        12%                          ║
║ Heap peak:      67 MB                        ║
║ RSS peak:       112 MB                       ║
║ Files processed: 100/100 (100%)              ║
║ Errors:         0                            ║
╚══════════════════════════════════════════════╝
```

#### JSON reporter

```json
{
  "scenario": "burst",
  "date": "2026-06-15T06:30:00.000Z",
  "config": {
    "chainCount": 5,
    "totalFiles": 500,
    "modifiedFiles": 100
  },
  "results": {
    "throughput": 45.2,
    "latency": { "avg": 22.1, "p95": 45.0, "max": 89.0 },
    "cpu": { "peak": 34, "avg": 12 },
    "memory": { "heapPeakMB": 67, "rssPeakMB": 112 },
    "filesProcessed": 100,
    "filesTotal": 100,
    "errors": 0,
    "duration": 2212
  }
}
```

**Delai estime** : 0.5 session

---

### V6.5 : npm scripts et documentation

**Objectif** : Rendre les benchmarks faciles a lancer.

| Script | Description |
|--------|-------------|
| `npm run bench` | Lance tous les scenarios |
| `npm run bench:idle` | Idle uniquement |
| `npm run bench:burst` | Burst uniquement |
| `npm run bench:sustained` | Sustained uniquement |
| `npm run bench:startup` | Startup uniquement |
| `npm run bench:scalability` | Scalabilite uniquement |
| `npm run bench:stress` | Stress uniquement |

**Delai estime** : 0.5 session

---

## Dependances

Aucune dependance externe supplementaire. Utilise uniquement :
- `os` (built-in) — CPU, memoire systeme
- `process.memoryUsage()` (built-in) — heap, RSS
- `performance.now()` (built-in) — chronometrage precis
- `fs-extra` (deja present) — manipulation de fichiers

---

## Tests

Cree `tests/benchmarks/benchmark.test.ts` pour valider :
- Le generateur de projet cree le bon nombre de fichiers
- Le collecteur de metriques retourne des valeurs valides
- Les reporters produisent une sortie valide
- Les seuils minimaux sont respectes (CPU idle < 1%, etc.)

---

## Cibles de performance (a valider)

| Metrique | Cible | Condition |
|----------|-------|-----------|
| CPU idle | < 1% | 30s sans changement |
| CPU burst 100 files | < 50% | 100 fichiers en < 2s |
| CPU sustained | < 15% | 1 fichier/2s pendant 60s |
| Heap idle | < 50 MB | Apres 30s au repos |
| RSS idle | < 100 MB | Apres 30s au repos |
| RSS stress | < 200 MB | 500 fichiers en burst |
| Throughput 1 chaine | > 10 files/s | Reference |
| Throughput 5 chaines | > 30 files/s | > 3x vs 1 chaine |
| Latency avg | < 50 ms | Par fichier |
| Scan initial 10k | < 5s | `scanInitialFiles()` |
| Recovery post-stress | < 5s | CPU < 5% apres charge |

---

## Bilan prevu

| Phase | Difficulte | Delai |
|-------|------------|-------|
| V6.1 Infrastructure | Moyen | 1 session |
| V6.2 Scenarios de base | Facile | 1 session |
| V6.3 Scenarios avances | Moyen | 1 session |
| V6.4 Reporters | Facile | 0.5 session |
| V6.5 npm scripts + docs | Facile | 0.5 session |
| **Total** | | **4 sessions** |
