# Bonnes Pratiques et Problèmes Récurrents pour le Développement du Watcher

## Introduction

Ce document liste les problèmes récurrents à prendre en compte en permanence lors du développement du Watcher. En intégrant ces bonnes pratiques, nous assurons la maintenabilité, la lisibilité et la qualité du code. Ces règles sont essentielles pour éviter les pièges courants en développement Node.js/TypeScript et promouvoir une architecture propre. Elles complètent les documents existants (spécifications, exigences, capacités, dépendances) en fournissant des guidelines concrets.

## 1. Conventions de Nommage

Le nommage cohérent est crucial pour la lisibilité et la collaboration. Des noms mal choisis entraînent confusion, erreurs et difficultés de maintenance.

- **Dossiers** : Utiliser des noms en kebab-case (ex. : `src/`, `tests/`, `config/`). Éviter les espaces ou caractères spéciaux.
- **Fichiers** : Noms en kebab-case ou camelCase selon le contexte (ex. : `file-watcher.js`, `notificationService.ts`). Inclure le rôle (ex. : `eslint-config.js` pour la config ESLint).
- **Modules** : Noms en PascalCase pour les classes/modules exportés (ex. : `FileWatcher`, `NotificationManager`).
- **Fonctions** : camelCase, descriptif (ex. : `startFileWatching()`, `sendSlackNotification()`). Éviter les abréviations sauf si standard (ex. : `logError` au lieu de `le`).
- **Classes** : PascalCase, reflétant le domaine (ex. : `WatcherService`, `ConfigValidator`).
- **Variables et constantes** : camelCase pour variables, SCREAMING_SNAKE_CASE pour constantes (ex. : `MAX_FILE_SIZE`, `DEFAULT_WATCH_DIR`).
- **Règles générales** :
  - Prioriser la clarté sur la brièveté.
  - Utiliser des noms anglais pour la cohérence.
  - Éviter les conflits avec des mots-clés réservés.
  - Référence : Appliquer dans tout le projet pour une navigation intuitive.

## 2. Règles de Base ESLint et TypeScript

Ces règles empêchent les erreurs courantes et améliorent la qualité du code. Configurer ESLint pour les appliquer automatiquement.

- **@typescript-eslint/no-explicit-any** : Interdire l'utilisation de `any` pour forcer le typage strict. Remplacez par des types spécifiques (ex. : `Record<string, unknown>` au lieu de `any`).
- **@typescript-eslint/no-inferrable-types** : Éviter les annotations de type inutiles si TypeScript peut les inférer (ex. : pas besoin de `let x: number = 5;` si `x = 5;` suffit).
- **@typescript-eslint/no-unused-vars** : Détecter et supprimer les variables inutilisées. Utiliser `_` pour les paramètres ignorés (ex. : `function fn(_: string) {}`).
- **@typescript-eslint/no-var-requires** : Préférer `import` à `require` pour la cohérence ES6+. Exception pour les imports dynamiques.
- **Autres règles recommandées** :
  - `no-console` : Interdire `console.log` en production ; utiliser un logger comme Winston.
  - `prefer-const` : Utiliser `const` quand possible.
  - `no-duplicate-imports` : Éviter les imports dupliqués.
- **Configuration** : Étendre `eslint:recommended` et `@typescript-eslint/recommended` dans `eslint.config.js`. Intégrer avec Prettier pour éviter les conflits.

## 3. Choix des Modules dans le Projet

Le choix et l'organisation des modules impactent la modularité et la réutilisabilité. Sélectionner des modules open source fiables et organiser pour une séparation claire.

- **Sélection de modules** :
  - Privilégier fs.watch natif Node.js (`recursive: true`) — zero dépendance, un seul handle Windows.
  - Vérifier la compatibilité avec Node.js 14+ et les licences open source.
  - Éviter la sur-dépendance : Ne pas ajouter un module pour une fonctionnalité mineure si elle peut être implémentée simplement.
- **Organisation des modules** :
  - **Point d'entrée** : Un fichier principal (`index.js` ou `main.ts`) qui orchestre tout.
  - **Séparation par responsabilité** : Un module par fonctionnalité (ex. : `src/watcher/fileWatcher.ts`, `src/notifications/slackNotifier.ts`).
  - **Dépendances internes** : Utiliser des exports/imports pour coupler les modules faiblement.
  - **Gestion des versions** : Utiliser des modules compatibles (ex. : vérifier les versions dans `package.json`).
- **Bonnes pratiques** :
  - Documenter les modules avec JSDoc.
  - Tester chaque module indépendamment avec Jest.
  - Éviter les modules globaux ; préférer les imports locaux.

## 4. Limites de Taille des Fichiers et Responsabilités

Maintenir des fichiers petits améliore la lisibilité et la maintenabilité. Appliquer des règles strictes pour éviter les fichiers monstrueux.

- **Limite de taille** : Aucun fichier ne doit dépasser 500 lignes. Idéalement, viser 200-300 lignes.
- **Principe "Module = Point d'entrée + Un fichier par responsabilité"** :
  - **Point d'entrée** : Chaque module a un fichier principal qui expose les fonctionnalités (ex. : `fileWatcher.ts` comme entrée pour la surveillance).
  - **Un fichier par responsabilité** : Séparer les responsabilités (ex. : pas de mélange de logique de fichiers et de notifications dans un seul fichier).
  - **Exemples** :
    - `src/watcher/index.ts` : Point d'entrée, importe et orchestre les sous-fichiers.
    - `src/watcher/detection.ts` : Détection des changements.
    - `src/watcher/filtering.ts` : Filtrage par type de fichier.
  - **Avantages** : Facilite les tests, les modifications et la réutilisation.
- **Conseils pour appliquer** :
  - Refactorer immédiatement si un fichier approche 500 lignes.
  - Utiliser des outils comme `wc -l` pour vérifier la taille.
  - Encourager les pull requests avec des fichiers modulaires.

## Intégration avec les Autres Documents

- **Liens avec watcher-specification.md** : Ces pratiques assurent que le Watcher reste portable et maintenable.
- **Liens avec watcher-requirements.md** : Respectent les besoins techniques et de sécurité.
- **Liens avec watcher-capabilities.md** : Supportent les fonctionnalités étendues sans complexité.
- **Liens avec watcher-dependencies.md** : Utilisent les dépendances pour appliquer ces règles (ex. : ESLint pour linting).
- **Liens avec watcher-setup-guide.md** : Appliquer lors de l'installation et du développement.

## Conclusion

En intégrant ces bonnes pratiques, nous évitons les problèmes récurrents comme le code illisible, les erreurs de typage, les modules mal organisés et les fichiers surchargés. Elles doivent être vérifiées à chaque commit ou revue de code. Pour des mises à jour, consulter ce document et les références croisées.

_Réviser régulièrement pour s'adapter à l'évolution du projet._
