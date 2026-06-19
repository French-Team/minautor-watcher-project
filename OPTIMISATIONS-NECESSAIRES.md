# Optimisations nécessaires / obligatoires

> Corrections et améliorations indispensables pour la stabilité, la fiabilité et la
> maintenabilité du watcher en production. Sans ces corrections, le service reste
> fragile et difficile à opérer.

---

## 1. Tests complètement cassés

**Constat :** 24 suites de test échouent avec `describe is not defined` ou
`@jest/globals` — conflit entre Jest et Vitest. Aucun test ne s'exécute.

**Impact :** Impossible de valider les régressions. Chaque changement est
déployé sans filet.

**Solution :**
- Uniformiser le runner (Vitest partout)
- Remplacer les imports `@jest/globals` par les équivalents Vitest
- Ajouter une CI qui bloque le merge si les tests échouent

---

## 2. CPU monitor alerte en permanence

**Constat :** `error.log` et `warnings.log` sont saturés de messages
`CPU CRITICAL: 95%` / `CPU HIGH: 82%` pendant le scan initial. Le monitor
alerte toutes les 5 secondes, inondant les logs.

**Impact :**
- Les logs deviennent illisibles
- Aucune distinction entre une vraie surcharge et un pic normal (scan initial)
- Pas de backoff : une fois le seuil dépassé, les alertes ne s'arrêtent pas

**Solution :**
- Désactiver le monitor CPU pendant le scan initial (ou utiliser un seuil
  plus haut temporairement)
- Ajouter un debounce : ne loguer qu'une alerte toutes les 60s si le seuil
  est toujours dépassé
- Différencier les pics courts (< 30s) des surcharges prolongées

---

## 3. `scanInitialFiles` en fire-and-forget

**Constat :** `Watcher.start()` lance `scanInitialFiles()` sans `await`
(volontairement). Mais le `writeLogHeader()` avec le compte de fichiers
dépend de la fin du scan.

**Impact :** Race condition fragile. Si un jour `scanInitialFiles()` plante
silencieusement (le `.catch()` ne fait qu'un log), le header reste à 0.

**Solution :**
- Rendre `scanInitialFiles()` blocking OU exposer une Promise
  `waitForScanComplete()` que les consommateurs peuvent await
- Ou utiliser un événement `SCAN_COMPLETE` avec le fileCount en payload

---

## 4. Cooldown de 30s aveugle aux vrais changements

**Constat :** Le Map `recentlyEmitted` ignore tous les événements `fs.watch`
pour un fichier pendant 30s après son émission par `--process-existing`.

**Impact :** Si l'utilisateur modifie un fichier PENDANT le scan initial
(ou dans les 30s qui suivent), sa modification est ignorée. Il doit
resauvegarder après 30s.

**Solution :**
- Comparer le contenu du fichier avant de l'ignorer (si le timestamp a
  changé entre l'émission et le fs.watch, c'est une vraie modification)
- Ou réduire le TTL à 15s et utiliser un hash du contenu pour détecter
  les vrais changements

---

## 5. Port 3000 déjà occupé au redémarrage

**Constat :** `warnings.log` montre `Port 3000 in use, killing old process
and retrying...` — le serveur HTTP tue un process existant.

**Impact :** Démarrage fragile. Si le process tué n'est pas le bon, le
serveur échoue. Pas de port alternatif.

**Solution :**
- Utiliser `port 0` (port aléatoire) et afficher le port réel dans le header
- Ou implémenter un mécanisme de port retry : si 3000 est pris, essayer
  3001, 3002... jusqu'à 3010

---

## 6. `getStatus()` ment sur `isRunning`

**Constat :** `Watcher.getStatus()` retourne toujours `{ isRunning: true }`,
même si le watcher est arrêté.

**Impact :** Les métriques et health checks ne reflètent pas l'état réel.

**Solution :** Retourner l'état réel d'après le flag interne.

---

## 7. Aucune visibilité sur les échecs ESLint réels

**Constat :** Les logs montrent `SUCCESS (0 errors, 0 warnings)` pour tous
les fichiers. Mais si ESLint a des erreurs non auto-fixables, on ne voit pas
lesquelles.

**Impact :** Impossible de diagnostiquer pourquoi un fichier échoue sans
lire les rapports `.fix-reports/`.

**Solution :**
- Logger le détail des erreurs ESLint même en cas de SUCCESS si des
  warnings persistent
- Ajouter un résumé dans le header des logs : "X fichiers avec erreurs
  résiduelles, Y warnings non corrigés"

---

## 8. Pas de validation du projet cible

**Constat :** `WatcherService.initialize()` ne vérifie pas que
`watchDir` contient un `package.json` ou que ESLint/Prettier sont
installés. L'échec n'arrive que plus tard, dans le pipeline.

**Impact :** Erreur tardive, difficile à diagnostiquer.

**Solution :**
- Valider la présence des outils requis dans `initialize()` (avant le
  démarrage)
- Afficher un avertissement clair si ESLint/Prettier sont manquants

---

## 9. Pas de gestion d'erreur métier

**Constat :** Les erreurs dans `safeSpawn`, `executeCommand`, etc. sont
loguées mais le pipeline continue. Si ESLint est absent, le fichier passe
en SUCCESS avec 0 erreurs (faux positif).

**Impact :** Faux SUCCESS — l'utilisateur pense que tout va bien.

**Solution :**
- Si ESLint/Prettier échouent (exit code non-zéro), propager l'erreur
  dans le résultat de prévention
- Marquer le fichier comme FAILED si un correcteur échoue
- Ajouter un flag `toolMissing` dans le résultat pour distinguer "pas
  d'erreur" de "outil absent"

---

## 10. Pas de CI/CD

**Constat :** Aucun pipeline CI, pas de lint, pas de tests automatisés.

**Impact :** Chaque PR doit être reviewée manuellement. Aucune garantie
de qualité.

**Solution :**
- Ajouter un `.github/workflows/ci.yml` avec : lint → typecheck → test
- Bloquer le merge si les tests échouent ou si `tsc --noEmit` échoue
