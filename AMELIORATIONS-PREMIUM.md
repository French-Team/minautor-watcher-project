# Améliorations Premium

> Fonctionnalités "nice-to-have" qui transforment le watcher d'un outil utilitaire
> en une plateforme professionnelle de monitoring de code. Classées par priorité
> approximative.

---

## 1. Dashboard temps réel (Web UI)

**Description :** Interface web avec :
- Graphiques en temps réel du nombre de fichiers traités / temps / erreurs
- Liste des fichiers en cours de traitement avec leur statut
- Historique des corrections avec diff visible
- Filtres par projet, type d'erreur, correcteur

**Valeur :** Passage de "outil CLI" à "plateforme visuelle". L'utilisateur
peut superviser l'état du watcher sans ouvrir les logs.

**Technique :**
- WebSocket push depuis le serveur HTTP existant (port 3000)
- Frontend statique (React ou Vanilla JS) servi par le watcher
- API REST pour les métriques agrégées

---

## 2. Notifications enrichies (Slack / Discord / Email)

**Description :** Les notifiers existants (Slack, Email) sont basiques.
Améliorer avec :
- Messages formatés (embeds Slack avec couleur selon le statut)
- Résumé périodique (toutes les X minutes) au lieu d'un message par fichier
- Tags/mentions conditionnelles (si un fichier critique échoue, @channel)

**Valeur :** Équipe informée sans spam. Détection rapide des problèmes
critiques.

---

## 3. Support multi-projets

**Description :** Permettre de surveiller plusieurs répertoires simultanément
avec une seule instance du watcher.

**Valeur :** Centralisation. Une équipe avec 5 microservices n'a pas besoin
de lancer 5 watchers.

**Défis :**
- Isolation des configurations (ESLint de chaque projet)
- File d'attente partagée avec priorisation
- Dashboard filtré par projet

---

## 4. Mode batch avec planification

**Description :** Au lieu de traiter les fichiers immédiatement, permettre :
- Planification hebdomadaire (tous les lundis à 3h du matin)
- Déclenchement manuel via API
- Lotissement : traiter par lots de 50 fichiers avec pause entre chaque lot

**Valeur :** Évite de saturer le CPU pendant les heures de travail.
Utile pour les projets legacy avec des milliers de fichiers.

---

## 5. Corrections intelligentes (IA)

**Description :** Les rapports `.fix-reports/` sont déjà conçus pour des
agents. Aller plus loin :
- Intégration LLM : envoyer le rapport à un modèle pour générer
  automatiquement le code correctif
- Patch automatique : appliquer les suggestions avec validation
  (linter après patch)
- Apprentissage : si le même type d'erreur revient, suggérer une règle
  ESLint personnalisée

**Valeur :** Corriger les erreurs non auto-fixables sans intervention
humaine.

---

## 6. Git integration

**Description :**
- Auto-commit des corrections avec message formaté
- Création de branches séparées par session de correction
- Détection des fichiers modifiés depuis le dernier commit pour
  prioriser le scan
- Revert automatique si une correction introduit une régression

**Valeur :** Traçabilité complète. "Qui a corrigé quoi et quand."

---

## 7. Cache de résultats (éviter de re-traiter les fichiers inchangés)

**Description :** Stocker un hash (SHA256) du contenu après correction.
Au prochain scan, comparer le hash : si identique, ne pas re-traiter.

**Valeur :** Gain de temps ×10 au démarrage. Le scan initial passe de
138 fichiers à seulement les fichiers réellement modifiés.

**Défis :**
- Invalider le cache si la config ESLint change
- Stockage : fichier JSON dans `logs/cache.json`

---

## 8. Configuration Hot-Reload via API

**Description :** Actuellement, le reload se fait via `SIGUSR1` (Unix only).
Ajouter :
- `POST /reload` pour recharger la config
- `POST /config` pour mettre à jour des paramètres sans redémarrer
- `GET /config` pour voir la config active

**Valeur :** Opérabilité. Les changements de configuration ne nécessitent
pas de kill/restart.

---

## 9. Métriques avancées et historique

**Description :** Stocker les métriques dans une base de données
(ou fichiers JSON) pour analyse :

| Métrique | Description |
|----------|-------------|
| Files processed / heure | Débit |
| Taux d'erreur | % fichiers en échec |
| Temps moyen de traitement | Perf |
| Top 10 des erreurs | Priorisation |
| Temps de correction par fichier | Goulots d'étranglement |

**Valeur :** Data-driven decisions. Identifier les projets/équipes qui
ont le plus de problèmes.

---

## 10. Plugins / SDK

**Description :** Architecture plugin pour :
- Correcteurs personnalisés (ex: formateur maison)
- Validateurs spécifiques au domaine (ex: vérifier les imports)
- Notifiers additionnels (Teams, PagerDuty, Webhook générique)

**Valeur :** Extensibilité. La communauté peut contribuer sans forker.

---

## 11. Docker / Kubernetes ready

**Description :**
- Dockerfile multi-stage (build + runtime)
- Health check endpoint (`GET /health`)
- Readiness probe (attendre la fin du scan initial)
- Configuration via variables d'environnement

**Valeur :** Déploiement standardisé en environnement conteneurisé.

---

## 12. Support des monorepos

**Description :** Détection automatique des sous-projets avec leurs
propres configurations ESLint, Prettier, TypeScript.

**Valeur :** Les projets Nx, Turborepo, Lerna sont utilisables sans
configuration manuelle.

---

## 13. File de priorité

**Description :** Permettre de définir des priorités :
- `P0` : fichiers critiques (validation en temps réel)
- `P1` : fichiers importants (validation différée, max 5min)
- `P2` : fichier secondaires (validation au prochain scan)

**Valeur :** Évite de bloquer le pipeline sur des fichiers non critiques.

---

## 14. Rapport HTML statique

**Description :** Générer un rapport HTML à la fin du scan initial
(et périodiquement) avec :
- Tableau des fichiers traités, succès, échecs
- Graphiques (Chart.js ou similaire)
- Lien vers les fichiers sur GitHub

**Valeur :** Partage facile. "Voici le rapport du watcher de la semaine."

---

## 15. Internationalisation (i18n)

**Description :** Tous les logs, notifications, rapports supportent
le français et l'anglais.

**Valeur :** Adoptable par des équipes internationales.

---

## 16. Sécurité

**Description :**
- Authentification sur le serveur HTTP (token API)
- Rate limiting sur les endpoints
- Validation des chemins (path traversal)
- Mode read-only (ne jamais écrire sur le disque, seulement reporter)

**Valeur :** Déploiement en environnement sensible / multi-tenant.
