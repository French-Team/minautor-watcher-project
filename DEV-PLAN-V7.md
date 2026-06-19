# DEV-PLAN-V7 — Optimisations nécessaires

> ✅ **10/10 tâches implémentées** — 23 suites, 349 tests pass, build clean.
> Voir `src/` pour les détails d'implémentation.

> Corrections et améliorations obligatoires basées sur
> `OPTIMISATIONS-NECESSAIRES.md`.

---

## V7.1 — Tests : configuration propre

**Fichiers :** `package.json`, `jest.config.mjs`, `.github/workflows/ci.yml`

**Note :** Le projet utilise Jest (349 tests passent), pas besoin de migrer
vers Vitest. On nettoie la config et on ajoute la CI.

**Tâches :**
- [x] Ajouter `--no-cache` au script test dans `package.json` pour la CI
- [x] Créer `.github/workflows/ci.yml` avec matrix Node 18/20 :
  `npm ci → npx tsc --noEmit → npm test`
- [x] Vérifier que les `examples/tests/` ne cassent pas la CI (roots pointe
  sur `tests/` uniquement)

**Critère de succès :** `npm test` passe avec 0 échecs (23 suites, 349 tests).

---

## V7.2 — CPU monitor : debounce + désactivation pendant le scan

**Fichiers :** `src/monitor/resource-monitor.ts`, `src/shared/logger.ts`

**Tâches :**
- [x] Ajouter un mécanisme de debounce : ne loguer une alerte CPU que si le
  seuil est dépassé pendant plus de 30s consécutives (6 checks successifs)
- [x] Distinguer les pics courts (< 30s, liés au scan) des surcharges
  prolongées (compteur reset si CPU redescend)
- [x] Une fois le seuil dépassé, ne répéter l'alerte que toutes les 60s
  (cooldownMs configurable)
- [x] Optionnel : désactiver complètement les alertes CPU pendant le scan
  initial (déjà géré par le compteur : le scan dure < 30s)

**Critère de succès :** `error.log` et `warnings.log` ne contiennent pas
plus de 1-2 alertes CPU par run.

---

## V7.3 — `scanInitialFiles` : Promise exposée

**Fichiers :** `src/detection/watcher.ts`

**Tâches :**
- [ ] Ajouter un `scanComplete: Promise<void>` résolue après
  `scanInitialFiles()`
- [ ] Exposer `waitForScanComplete(): Promise<{ fileCount: number }>`
- [ ] Dans `Watcher.start()`, laisser le scan en background mais stocker
  la Promise
- [ ] Le `writeLogHeader` avec le fileCount await cette Promise au lieu
  de `.catch(() => {})`
- [ ] Si `scanInitialFiles()` rejette, la Promise est rejetée et le
  header affiche `Files to process: ERROR`

**Critère de succès :** `writeLogHeader({ fileCount })` n'est appelé
qu'après la fin réelle du scan, sans race condition.

---

## V7.4 — Cooldown intelligent (hash contenu)

**Fichiers :** `src/detection/watcher.ts`

**Tâches :**
- [ ] Remplacer le cooldown temporel de 30s par une vérification de
  contenu :
  - Au moment de l'émission `FILE_ADDED`, stocker
    `{ timestamp, contentHash }`
  - Dans `handleNativeEvent`, lire le contenu actuel du fichier
    et comparer le hash
  - Si le hash est identique, ignorer l'événement (c'est prettier
    qui écrit le même contenu)
  - Si le hash est différent, c'est une vraie modification → traiter
- [ ] Garder le Map `recentlyEmitted` mais avec TTL réduit à 60s pour
  le cleanup mémoire (pas pour le cooldown)

**Critère de succès :** Les vraies modifications utilisateur ne sont
jamais ignorées. Les écritures de prettier/ESLint sont filtrées.

---

## V7.5 — Port HTTP : fallback automatique

**Fichiers :** `src/server/http.ts`

**Tâches :**
- [x] Remplacer le port fixe 3000 par une logique de fallback :
  - Essayer le port configuré (ou 3000 par défaut)
  - S'il est pris, essayer port+1, port+2... jusqu'à port+10
  - Logger le port réellement utilisé
- [x] Exposer le port effectif via `getPort()`
- [ ] Afficher le port dans le header des logs (TODO futur)

**Critère de succès :** Le serveur HTTP démarre toujours, même si
3000 est occupé. Pas de warning "killing old process".

---

## V7.6 — `getStatus()` honnête

**Fichiers :** `src/detection/watcher.ts`

**Tâches :**
- [ ] Ajouter un flag `private running = false`
- [ ] `start()` → `this.running = true`
- [ ] `stop()` → `this.running = false`
- [ ] `getStatus()` → `{ isRunning: this.running, watchedFiles: this.watchedCount }`

**Critère de succès :** `getStatus().isRunning` retourne `false` après
l'arrêt du watcher.

---

## V7.7 — Visibilité des erreurs ESLint dans les logs

**Fichiers :** `src/processor/chain-orchestrator.ts` (ou le callback
`onComplete` dans `src/index.ts`)

**Tâches :**
- [ ] Quand un fichier passe en SUCCESS mais avec des warnings, logger
  le détail des warnings (règle + message)
- [ ] Ajouter un compteur dans le header des logs :
  `Fichiers avec erreurs résiduelles: X`
- [ ] Ajouter un log récapitulatif en fin de scan initial :
  ```
  Scan terminé : 138 fichiers, 132 SUCCESS, 4 FAILED, 2 WARNINGS
  Erreurs non auto-fixables détectées :
  - no-unused-vars : 3 occurrences (fichiers: A.ts, B.ts, C.ts)
  ```

**Critère de succès :** En ouvrant `combined.log`, on voit immédiatement
le résumé des erreurs non corrigées.

---

## V7.8 — Validation du projet cible

**Fichiers :** `src/index.ts` (`WatcherService.initialize()`)

**Tâches :**
- [ ] Ajouter une méthode `async validateTargetProject(dir: string)` :
  - Vérifier que `dir` existe
  - Vérifier que `dir/package.json` existe (ou au moins un projet valide)
  - Vérifier que `node_modules` existe ou lancer `npm install`
  - Vérifier que ESLint est disponible (`npx eslint --version`)
  - Vérifier que Prettier est disponible (`npx prettier --version`)
- [ ] Afficher un rapport de validation dans le header des logs :
  ```
  Validation du projet cible :
  ✔ ESLint trouvé (v10.4.1)
  ✔ Prettier trouvé (v3.2.0)
  ⚠ TypeScript non installé (optionnel)
  ```
- [ ] En cas d'échec, loguer un WARN au lieu de bloquer le démarrage
  (le projet peut quand même être surveillé)

**Critère de succès :** Les outils manquants sont signalés dès le
démarrage, pas au moment du traitement d'un fichier.

---

## V7.9 — Gestion d'erreur métier (faux SUCCESS)

**Fichiers :** `src/prevention/scripts.ts`, `src/processor/chain-orchestrator.ts`

**Tâches :**
- [ ] Dans `executeCommand()` / `safeSpawn()`, si le binaire n'existe pas
  (`ENOENT`), marquer le résultat comme `ERROR.too.missing` au lieu de
  `SUCCESS (0 errors)`
- [ ] Propager cette information dans le `PreventionResult` :
  - Ajouter un champ `toolErrors: { tool: string; error: string }[]`
  - Ne pas compter un outil manquant comme un "succès"
- [ ] Dans le callback `onComplete` de l'orchestrateur, si
  `result.preventionResult.toolErrors.length > 0`, marquer le fichier
  comme FAILED avec la raison "outil manquant"

**Critère de succès :** Si ESLint est absent du projet, le fichier est
marqué FAILED avec la raison explicite. Pas de faux SUCCESS.

---

## V7.10 — CI/CD GitHub Actions

**Fichiers :** `.github/workflows/ci.yml` (à créer)

**Tâches :**
- [ ] Créer le workflow avec :
  ```yaml
  on: [push, pull_request]
  jobs:
    quality:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20 }
        - run: npm ci
        - run: npx tsc --noEmit
        - run: npx vitest run
  ```
- [ ] Ajouter le badge dans `README.md` si existant

**Critère de succès :** Chaque PR exécute lint + typecheck + tests
automatiquement.

---

## Ordre de priorité suggéré

| Priorité | Tâche | Effort | Impact |
|----------|-------|--------|--------|
| P0 | V7.1 — Tests Vitest | M | Critique |
| P0 | V7.10 — CI/CD | S | Critique |
| P1 | V7.2 — CPU debounce | M | Élevé |
| P1 | V7.3 — scanInitialFiles Promise | S | Moyen |
| P1 | V7.4 — Cooldown intelligent | M | Élevé |
| P2 | V7.5 — Port fallback | S | Faible |
| P2 | V7.6 — getStatus honnête | XS | Faible |
| P2 | V7.7 — Visibilité erreurs ESLint | M | Moyen |
| P2 | V7.8 — Validation projet cible | M | Moyen |
| P3 | V7.9 — Faux SUCCESS | L | Moyen |

**Légende effort :** XS < 30min, S < 2h, M < 4h, L < 8h
