# Benchmark — Watcher Service

Systeme de benchmark pour mesurer la consommation CPU, memoire, throughput et latence du watcher.

## Usage

```bash
# Lancer tous les scenarios
npm run bench

# Scenario specifique
npm run bench:idle       # Consommation au repos
npm run bench:burst      # Rafale de fichiers
npm run bench:sustained  # Charge continue
npm run bench:startup    # Demarrage avec fichiers existants
npm run bench:scalability  # Comparaison N chaines
npm run bench:stress     # Charge extreme
```

## Scenarios

| Scenario | Duree | Metriques | Cibles |
|----------|-------|-----------|--------|
| idle | 30s | CPU, heap, RSS | CPU < 25%, Heap < 100 MB |
| burst | ~10s | Throughput, latence, CPU peak | > 10 files/s, latence < 5s |
| sustained | 60s | CPU moyen, stabilite heap | CPU < 15%, pas de fuite |
| startup | ~5s | Scan initial CPU/temps | < 5s pour 10k fichiers |
| scalability | ~30s | Throughput par chaine | 5 chaines > 2x 1 chaine |
| stress | ~20s | RSS, recovery | RSS < 200 MB, recovery < 5s |

## Architecture

```
benchmarks/
├── run-benchmark.ts            # Orchestrateur
├── collect-metrics.ts          # CPU, memoire, snapshots
├── scenarios/
│   ├── idle.ts                 # Repos
│   ├── burst.ts                # Rafale
│   ├── sustained.ts            # Charge continue
│   ├── startup.ts              # Demarrage
│   ├── scalability.ts          # Scalabilite
│   └── stress.ts               # Charge extreme
├── fixtures/
│   ├── generate-project.ts     # Generation projet fake
│   └── modify-files.ts         # Modification fichiers
├── reporters/
│   ├── console-reporter.ts     # Tableau console
│   ├── json-reporter.ts        # Export JSON
│   └── chart-reporter.ts       # Graphiques ASCII
└── README.md
```

## Metriques

- **CPU** : delta-based (os.cpus), percentage d'utilisation
- **Heap** : process.memoryUsage().heapUsed en MB
- **RSS** : Resident Set Size en MB
- **Throughput** : fichiers/s
- **Latence** : temps par fichier en ms (avg, p95, max)

## Rapports

Les rapports sont generes dans `benchmarks/reports/` :
- `bench-<scenario>-<timestamp>.json` — rapport individuel
- `bench-summary-<timestamp>.json` — resume tous scenarios

## Ajouter un scenario

1. Creer `benchmarks/scenarios/mon-scenario.ts`
2. Exporter une fonction `runMonScenario(projectDir, options?)`
3. Retourner `{ summary, pass, details }`
4. Ajouter dans `run-benchmark.ts` et dans `package.json`
