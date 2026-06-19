# DEV-PLAN-V8 — Améliorations Premium

> Fonctionnalités "nice-to-have" classées en deux tiers :
> **Primordial** (impact immédiat, base pour la suite) et **Secondaire**
> (complément après stabilisation).
>
> Basé sur `AMELIORATIONS-PREMIUM.md`.

---

# TIER 1 — PRIMORDIAL

> Fonctionnalités à implémenter en premier. Elles apportent le plus de
> valeur (visibilité, performance, opérabilité) et servent de fondation
> aux fonctionnalités secondaires.

---

## V8.1 — Cache de résultats (hash contenu)

**Issu de :** Premium §7

**Fichiers :** `src/detection/watcher.ts`, nouveau fichier
`src/shared/content-cache.ts`

**Description :** Stocker un hash SHA256 du contenu après correction.
Au prochain scan (même run ou run suivant), comparer le hash : si
inchangé, ne pas re-traiter le fichier. Invalider le cache si la
config ESLint change (détecté via hash du `eslint.config.*`).

**Tâches :**
- [ ] Créer `ContentCache` : Map clé = `relativePath + configHash`,
  valeur = `contentHash256`
- [ ] Persistance : fichier JSON `logs/cache.json`
- [ ] Après correction réussie, stocker le hash du fichier corrigé
- [ ] Au début de `scanInitialFiles`, lire le cache et sauter les
  fichiers dont le hash correspond
- [ ] Détecter les changements de config ESLint/Prettier et invalider
  globalement
- [ ] TTL optionnel : forcer un re-scan toutes les 24h

**Dépend de :** Rien

**Effort :** M (4h)

**Valeur :** ×10 plus rapide au démarrage. Utile aussi pour V8.6
(Métriques).

---

## V8.2 — Dashboard temps réel (Web UI)

**Issu de :** Premium §1, §14

**Fichiers :** `src/server/http.ts`, nouveau dossier `public/`

**Description :** Interface web temps réel avec :
- Compteurs en direct : fichiers traités, succès, échecs, temps moyen
- WebSocket push depuis le serveur HTTP existant
- Tableau des 10 derniers fichiers traités avec statut et durée
- Graphique de l'activité sur les dernières minutes
- Page de rapport HTML exportable (statique, fin de scan)

**Tâches :**
- [ ] Ajouter WebSocket au serveur HTTP (via `ws` ou `socket.io`)
- [ ] Créer un endpoint `GET /metrics` SSE ou polling
- [ ] Frontend Vanilla JS (pas de build nécessaire) :
  - Dashboard : compteurs + tableau temps réel
  - Rapport HTML : généré côté serveur, servit statiquement
- [ ] WebSocket pousse les événements du pipeline en temps réel :
  `fileProcessing`, `fileSuccess`, `fileFailed`, `scanComplete`
- [ ] Optionnel : thème clair/sombre

**Dépend de :** V8.3 (Configuration hot-reload API) pour servir le
static sans redémarrage

**Effort :** L (8h)

**Valeur :** Passage de "outil CLI" à "plateforme visuelle". Utilisable
par toute l'équipe.

---

## V8.3 — Configuration Hot-Reload via API

**Issu de :** Premium §8

**Fichiers :** `src/server/http.ts`, `src/index.ts`

**Description :** Remplacer le reload par signal Unix par une API REST :
- `GET /config` : voir la config active (watchDir, extensions, règles, etc.)
- `POST /reload` : recharger la config depuis les fichiers
- `POST /config` : mettre à jour des paramètres spécifiques sans
  redémarrer (ex: désactiver un correcteur)
- `GET /health` : health check enrichi (uptime, métriques, statut des
  modules)

**Tâches :**
- [ ] Endpoint `GET /config` : sérialiser `WatcherServiceConfig` en JSON
- [ ] Endpoint `POST /reload` : appeler
  `WatcherService.reloadConfig()` existant
- [ ] Endpoint `POST /config` : validation des champs + mise à jour
  partielle
- [ ] Endpoint `GET /health` : retourner `{ status, uptime, modules,
  metrics }`
- [ ] Rate limiting basique sur les endpoints POST
- [ ] Logger chaque appel API dans `combined.log`

**Dépend de :** Rien (peut être fait indépendamment)

**Effort :** M (4h)

**Valeur :** Opérabilité. Les changements ne nécessitent plus de
redémarrage. Indispensable pour V8.2 (Dashboard).

---

## V8.4 — Métriques avancées et historique

**Issu de :** Premium §9

**Fichiers :** `src/shared/metrics-store.ts`, `src/index.ts`

**Description :** Stocker les métriques dans un fichier JSON
(`logs/metrics.json`) pour analyse agrégée :

| Métrique | Granularité |
|----------|-------------|
| Fichiers traités / heure | Horaire |
| Taux d'erreur (%) | Horaire |
| Temps moyen de traitement | Par fichier |
| Top 10 des erreurs les plus fréquentes | Globale |
| Temps de correction par correcteur | Par correcteur |

**Tâches :**
- [ ] Créer `MetricsStore` : append-only JSON, rotation toutes les 24h
- [ ] Enregistrer chaque événement du pipeline (file, statut, durée,
  correcteurs utilisés)
- [ ] Calculer et logger un résumé toutes les heures
- [ ] Exposer via `GET /metrics` (format JSON structuré)
- [ ] Rotation : compresser les J-7 dans `metrics.archive.json.gz`

**Dépend de :** V8.3 (pour exposer via API)

**Effort :** M (4h)

**Valeur :** Data-driven decisions. Identifier les goulots d'étranglement.

---

## V8.5 — Notifications enrichies (Slack / Discord / Email)

**Issu de :** Premium §2

**Fichiers :** `src/trigger/notifiers.ts`, `src/trigger/notifiers/`

**Description :** Améliorer les notifiers existants :
- **Slack** : messages avec embeds, couleur selon statut (vert/rouge/orange)
- **Email** : template HTML avec tableau récapitulatif
- **Résumé périodique** : au lieu d'un message par fichier, envoyer un
  résumé toutes les N minutes ou à la fin du scan
- **Seuils configurables** : ne notifier que si X fichiers échouent
- **Tags conditionnels** : @channel si fichier critique en échec

**Tâches :**
- [ ] Définir un format de message enrichi (interface `RichMessage`)
- [ ] Slack : adapter le notifier pour utiliser `chat.postMessage` avec
  des blocks (pas du texte brut)
- [ ] Email : template HTML responsive
- [ ] Ajouter un accumulateur : collecter les événements et envoyer un
  résumé toutes les 60s (configurable)
- [ ] Ajouter `notifyOn` par règle : `always`, `onError`, `summary`

**Dépend de :** Rien (peut améliorer les notifiers existants)

**Effort :** L (8h)

**Valeur :** Équipe informée sans spam. Détection rapide des crises.

---

# TIER 2 — SECONDAIRE

> Fonctionnalités complémentaires, à implémenter après le Tier 1.
> Certaines dépendent du Tier 1.

---

## V8.6 — File de priorité

**Issu de :** Premium §13

**Fichier :** `src/processor/chain-orchestrator.ts`

**Description :** Permettre de définir des priorités par fichier/dossier :
- `P0` : validation en temps réel (dès que le fichier change)
- `P1` : validation différée, max 5min
- `P2` : validé au prochain scan uniquement
- La priorité est définie dans la config ou via un fichier
  `.watcher-priority` à la racine du projet

**Dépend de :** Rien

**Effort :** M (4h)

---

## V8.7 — Git integration (auto-commit)

**Issu de :** Premium §6

**Fichiers :** `src/git/git-integration.ts`, `src/index.ts`

**Description :**
- Auto-commit des corrections avec message formaté
  (`[watcher] auto-fix: fichier.ts`)
- Création de branches dédiées par session
- Détection des fichiers modifiés depuis le dernier commit pour
  prioriser le scan
- Revert automatique si une correction cassante est détectée

**Dépend de :** V8.6 (priorité pour les fichiers modifiés depuis
le dernier commit)

**Effort :** L (8h)

---

## V8.8 — Docker / Kubernetes ready

**Issu de :** Premium §11

**Fichiers :** `Dockerfile`, `.dockerignore`,
`.github/workflows/docker.yml`

**Description :**
- Dockerfile multi-stage (build + runtime, image finale ~100MB)
- Health check : `GET /health`
- Readiness probe : attendre la fin du scan initial
- Configuration via variables d'environnement
- Docker Compose pour le développement

**Dépend de :** V8.3 (pour le health check enrichi)

**Effort :** M (4h)

---

## V8.9 — Support multi-projets

**Issu de :** Premium §3

**Fichiers :** `src/config/multi-project.ts`, `src/index.ts`

**Description :** Permettre de surveiller plusieurs répertoires avec
une seule instance :
- Syntaxe `--projects dir1,dir2,dir3`
- File d'attente partagée avec priorisation inter-projets
- Métriques isolées par projet
- Dashboard filtré par projet

**Dépend de :** V8.2 (Dashboard multi-projets), V8.3 (API pour
config par projet)

**Effort :** XL (16h)

---

## V8.10 — Corrections intelligentes (IA)

**Issu de :** Premium §5

**Fichiers :** `src/ai/fix-assistant.ts`

**Description :**
- Quand un rapport `.fix-reports/` est généré, l'envoyer à un LLM
  pour générer le patch correctif
- Appliquer le patch et valider avec le linter
- Si le patch passe en SUCCESS, remplacer le fichier
- Apprentissage : si le même type d'erreur apparaît dans X fichiers,
  suggérer une règle ESLint personnalisée

**Dépend de :** V8.1 (éviter de re-demander à l'IA si le hash
n'a pas changé)

**Effort :** XL (20h)

---

## V8.11 — Plugins / SDK

**Issu de :** Premium §10

**Fichiers :** `src/plugins/`, `src/plugin-host.ts`

**Description :** Architecture plugin :
- Interface `WatcherPlugin` : `onFileProcessed`,
  `onCorrection`, `onError`
- Loader de plugins depuis `plugins/` ou npm
- SDK avec typages TypeScript publié sur npm

**Dépend de :** Presque tout le Tier 1 (API, métriques, cache)

**Effort :** XL (20h)

---

## V8.12 — Support des monorepos

**Issu de :** Premium §12

**Fichiers :** `src/detection/monorepo-detector.ts`

**Description :** Détection automatique des sous-projets :
- Parcourt les `package.json` récursivement
- Détecte les configurations ESLint/Prettier/TypeScript propres à
  chaque sous-projet
- Isole les cwd des correcteurs par sous-projet

**Dépend de :** V8.9 (Multi-projets)

**Effort :** L (8h)

---

## V8.13 — Mode batch avec planification

**Issu de :** Premium §4

**Fichiers :** `src/scheduler/scheduler.ts`

**Description :**
- Planification cron : `--schedule "0 3 * * 1"` (tous les lundis 3h)
- Lotissement : `--batch-size 50 --batch-pause 5000` (50 fichiers,
  5s de pause)
- Déclenchement manuel via `POST /scan`
- Combine avec `--process-existing` pour les runs planifiés

**Dépend de :** V8.3 (API), V8.6 (priorité)

**Effort :** L (8h)

---

## V8.14 — Sécurité

**Issu de :** Premium §16

**Fichiers :** `src/server/auth.ts`, `src/server/rate-limit.ts`

**Description :**
- Token API en header `Authorization: Bearer <token>`
- Rate limiting : 100 req/min par IP sur les endpoints POST
- Validation anti-path-traversal sur tous les paramètres de chemin
- Mode read-only (`--readonly`) : ne jamais écrire, seulement reporter
- Logger tous les accès API dans un fichier dédié `logs/access.log`

**Dépend de :** V8.3 (API existante)

**Effort :** M (4h)

---

## V8.15 — Internationalisation (i18n)

**Issu de :** Premium §15

**Fichiers :** `src/shared/i18n/` (nouveau dossier)

**Description :**
- Fichiers de locale : `en.json`, `fr.json`
- Tous les logs utilisateur, notifications, rapports passent par
  le helper `t('key', { vars })`
- Détection automatique de la langue via `LANG` ou config

**Dépend de :** Rien (travail transverse, peut être fait
indépendamment)

**Effort :** M (4h)

---

## Tableau récapitulatif

| # | Fonctionnalité | Tier | Effort | Dépend de |
|---|----------------|------|--------|-----------|
| V8.1 | Cache de résultats (hash) | **Primordial** | M | — |
| V8.2 | Dashboard temps réel | **Primordial** | L | V8.3 |
| V8.3 | Config Hot-Reload API | **Primordial** | M | — |
| V8.4 | Métriques avancées | **Primordial** | M | V8.3 |
| V8.5 | Notifications enrichies | **Primordial** | L | — |
| V8.6 | File de priorité | Secondaire | M | — |
| V8.7 | Git integration | Secondaire | L | V8.6 |
| V8.8 | Docker / K8s | Secondaire | M | V8.3 |
| V8.9 | Multi-projets | Secondaire | XL | V8.2, V8.3 |
| V8.10 | Corrections IA | Secondaire | XL | V8.1 |
| V8.11 | Plugins / SDK | Secondaire | XL | Tier 1 |
| V8.12 | Monorepos | Secondaire | L | V8.9 |
| V8.13 | Mode batch | Secondaire | L | V8.3, V8.6 |
| V8.14 | Sécurité | Secondaire | M | V8.3 |
| V8.15 | i18n | Secondaire | M | — |

---

## Ordre de build recommandé

```
Phase 1 — Fondation (Tier 1)
  V8.3  Config API        → permet le hot-reload et sert les endpoints
  V8.1  Cache content     → gain perf immédiat
  V8.4  Métriques         → alimente le dashboard
  V8.2  Dashboard         → interface utilisateur (dépend de V8.3 + V8.4)
  V8.5  Notifications     → amélioration des canaux existants

Phase 2 — Extension (Tier 2)
  V8.6  File priorité     → optimisation pipeline
  V8.8  Docker/K8s        → déploiement standardisé
  V8.14 Sécurité          → verrouillage API
  V8.15 i18n              → transverse
  V8.7  Git               → traçabilité

Phase 3 — Avancé (Tier 2 long)
  V8.13 Mode batch        → planification
  V8.9  Multi-projets     → architecture complexe
  V8.12 Monorepos         → dépend de multi-projets
  V8.10 Corrections IA    → R&D
  V8.11 Plugins/SDK       → écosystème
```
