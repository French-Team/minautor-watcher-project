# Guide d'Orchestration du Watcher - Préparation, Installation et Configuration

## Introduction

Ce document orchestre la préparation, l'installation et la configuration du service Watcher de manière méthodique et ordonnée. Il indexe les documents Markdown existants (`watcher-specification.md`, `watcher-requirements.md`, `watcher-capabilities.md`, `watcher-dependencies.md`) et réunit leurs informations pour clarifier le développement du Watcher. L'objectif est de transformer le Watcher en un outil portable, intelligent et intégré pour surveiller, prévenir et corriger automatiquement les projets.

Ce guide sert de référence centrale pour les développeurs, en reliant les spécifications, exigences, capacités et dépendances en un workflow cohérent.

## Index des Documents de Référence

Voici un index des fichiers Markdown liés, avec des liens vers leurs contenus pour une navigation facile :

- **[watcher-specification.md](./watcher-specification.md)** : Définit les objectifs principaux du Watcher (surveillance, prévention, correction) et son contexte d'utilisation.
- **[watcher-requirements.md](./watcher-requirements.md)** : Liste les besoins fonctionnels, techniques, de configuration et de sécurité pour l'implémentation.
- **[watcher-capabilities.md](./watcher-capabilities.md)** : Détaille les idées étendues, les rôles du Watcher (yeux, guide, correcteur) et les systèmes de déclenchement.
- **[README.md](./README.md)** : Vue d'ensemble et démarrage rapide du projet.
- **[examples/README.md](./examples/README.md)** : Snippets de code pour implémentation.
- **[deployment-guide.md](./deployment-guide.md)** : Déploiement avancé et intégrations.

Ces documents doivent être consultés en parallèle pour une compréhension complète.

## Synthèse : Ce que le Watcher Doit Devenir et Comment le Coder

Basé sur les documents indexés, le Watcher doit évoluer en un service intelligent et autonome :

- **Vision globale** : Un outil qui agit comme les "yeux" de l'équipe, surveillant les projets en temps réel, appliquant des correctifs automatiques et informant sur les déviations. Il doit être portable, s'intégrer facilement via copie de dossier et configuration `.env.local`, et s'adapter à des projets simples ou complexes.
- **Fonctionnalités clés** :
  - Surveillance en temps réel des fichiers (HTML, CSS, TSX, etc.) avec exclusion automatique du dossier Watcher.
  - Prévention via scripts (linting, validation).
  - Correction automatique (formatage, syntaxe) en arrière-plan.
  - Notifications conditionnelles (Slack, email) si les corrections échouent.
  - Configuration flexible pour règles personnalisées par projet.
- **Architecture de code recommandée** :
  - **Modulaire** : Séparer en modules (surveillance, prévention, correction, notifications).
  - **Technologies** : Node.js avec les dépendances listées (Chokidar pour watching, ESLint/Prettier pour code quality, Winston pour logs).
  - **Sécurité et robustesse** : Utiliser Joi pour validation, Helmet pour sécurité, Jest pour tests.
  - **CLI intégrée** : Commander.js pour une interface utilisateur simple.
  - **Workflow** : Démarrer par la configuration, puis surveillance continue, avec logs structurés pour audit.
- **Méthodologie de développement** : Commencer par un MVP (surveillance de base), ajouter des couches (prévention, correction), tester itérativement, et assurer la portabilité. Appliquer les bonnes pratiques de [watcher-best-practices.md](#) pour le nommage, les règles ESLint/TypeScript, et les limites de fichiers.

## Structure Modulaire du Watcher

La structure du Watcher doit être modulaire pour assurer la maintenabilité, la testabilité et l'évolutivité. Chaque secteur (détection, prévention, déclencheur) est organisé comme un module indépendant avec sa propre structure de fichiers, tout en permettant une interaction fluide entre eux. Cette approche respecte les bonnes pratiques de [watcher-best-practices.md](#) : un fichier par responsabilité, limites de taille (≤500 lignes), et organisation par secteur.

### Principes Généraux

- **Modularité** : Chaque secteur est autonome, avec ses propres fichiers pour les fonctionnalités spécifiques.
- **Indépendance** : Les secteurs peuvent être développés, testés et déployés indépendamment.
- **Interaction** : Utilisation d'interfaces claires (ex. : événements ou APIs) pour la communication entre secteurs.
- **Structure de dossiers** : Hiérarchique, avec un point d'entrée par secteur pour l'orchestration.
- **Référence** : Inspiré des bonnes pratiques pour le choix de modules et les limites de fichiers.

### Secteurs Principaux et Leur Structure

Le Watcher est divisé en trois secteurs principaux, chacun avec une structure dédiée.

#### 1. Secteur Détection (Surveillance)

Responsabilité : Détecter les changements en temps réel dans les fichiers surveillés.

- **Point d'entrée** : `src/detection/index.ts` - Orchestre la surveillance et expose les APIs pour les autres secteurs.
- **Fichiers composants** :
  - `src/detection/watcher.ts` : Initialise Chokidar et gère les événements de fichiers (ajout, modification, suppression).
  - `src/detection/filters.ts` : Applique les filtres par type de fichier (ex. : HTML, CSS, TSX) et exclusions (ex. : dossier Watcher).
  - `src/detection/events.ts` : Définit et émet des événements personnalisés (ex. : `fileChanged`) pour notifier les autres secteurs.
- **Indépendance** : Peut fonctionner seul pour la surveillance basique ; teste avec Jest pour les événements.
- **Interaction** : Émet des événements vers le secteur Prévention et Déclencheur via un bus d'événements ou callbacks.

#### 2. Secteur Prévention (Vérifications)

Responsabilité : Exécuter des scripts de prévention pour valider les changements avant qu'ils ne causent des problèmes.

- **Point d'entrée** : `src/prevention/index.ts` - Gère les vérifications et déclenche des actions préventives.
- **Fichiers composants** :
  - `src/prevention/validators.ts` : Implémente les validations (ex. : linting avec ESLint, vérification de formats JSON/YAML).
  - `src/prevention/scripts.ts` : Exécute des scripts personnalisés de prévention (ex. : vérifications de sécurité).
  - `src/prevention/config.ts` : Gère les règles de prévention depuis des fichiers de config (ex. : `prevention-rules.json`).
- **Indépendance** : Peut être utilisé pour des vérifications standalone ; teste les validators individuellement.
- **Interaction** : Écoute les événements du secteur Détection et signale les problèmes au secteur Déclencheur si nécessaire.

#### 3. Secteur Déclencheur (Correction)

Responsabilité : Déclencher des corrections automatiques pour les erreurs détectées.

- **Point d'entrée** : `src/trigger/index.ts` - Orchestre les corrections et gère les notifications.
- **Fichiers composants** :
  - `src/trigger/correctors.ts` : Applique les corrections (ex. : formatage avec Prettier, restauration de configs).
  - `src/trigger/notifiers.ts` : Envoie des notifications (Slack, email) si les corrections échouent.
  - `src/trigger/rules.ts` : Définit les règles de déclenchement basées sur les erreurs (ex. : corriger automatiquement les erreurs simples).
- **Indépendance** : Peut corriger des fichiers sans surveillance active ; teste les correctors avec des mocks.
- **Interaction** : Reçoit les signaux des secteurs Détection et Prévention pour déclencher des actions.

### Structure de Dossiers Complète

Voici un exemple de structure de dossiers pour le Watcher :

```
watcher-service/
├── src/
│   ├── detection/          # Secteur Détection
│   │   ├── index.ts        # Point d'entrée
│   │   ├── watcher.ts      # Surveillance avec Chokidar
│   │   ├── filters.ts      # Filtres par type
│   │   └── events.ts       # Événements personnalisés
│   ├── prevention/         # Secteur Prévention
│   │   ├── index.ts        # Point d'entrée
│   │   ├── validators.ts   # Validations
│   │   ├── scripts.ts      # Scripts personnalisés
│   │   └── config.ts       # Règles de prévention
│   ├── trigger/            # Secteur Déclencheur
│   │   ├── index.ts        # Point d'entrée
│   │   ├── correctors.ts   # Corrections automatiques
│   │   ├── notifiers.ts    # Notifications
│   │   └── rules.ts        # Règles de déclenchement
│   ├── shared/             # Utilitaires partagés (optionnel)
│   │   ├── logger.ts       # Configuration Winston
│   │   └── utils.ts        # Fonctions communes (ex. : validation Joi)
│   └── index.ts            # Point d'entrée global du Watcher
├── config/                 # Fichiers de configuration
│   ├── .env.local          # Variables d'environnement
│   ├── eslint.config.js    # Config ESLint
│   ├── prevention-rules.json # Règles de prévention
│   └── trigger-rules.json  # Règles de déclenchement
├── tests/                  # Tests avec Jest
│   ├── detection/
│   ├── prevention/
│   └── trigger/
├── package.json            # Dépendances
├── README.md               # Documentation
└── ...
```

### Avantages de Cette Structure

- **Maintenabilité** : Chaque secteur est isolé, facilitant les modifications sans impact global.
- **Testabilité** : Tests unitaires par secteur avec Jest.
- **Évolutivité** : Ajout de nouveaux secteurs (ex. : reporting) sans refactor majeur.
- **Conformité** : Respecte les limites de fichiers (chaque fichier <500 lignes) et les bonnes pratiques de nommage.

## Gestion des Erreurs Courantes

Le Watcher est conçu pour empêcher la répétition des mêmes erreurs en développement, en les détectant et corrigeant automatiquement en arrière-plan. Cela inclut des problèmes courants comme les variables inutilisées, les types non définis, les "any" excessifs, et les annotations inutiles. Cette fonctionnalité s'intègre dans les secteurs Détection, Prévention et Déclencheur, utilisant des outils comme ESLint et Prettier pour une correction immédiate sans intervention humaine.

### Erreurs Ciblées et Leur Correction Automatique

Voici les erreurs courantes que le Watcher doit détecter et corriger automatiquement :

- **Variables écrites mais non utilisées** (unused vars) :

  - **Détection** : ESLint règle `@typescript-eslint/no-unused-vars`.
  - **Correction** : Supprimer automatiquement les variables inutiles ou les marquer comme utilisées (ex. : préfixe `_` pour paramètres ignorés).
  - **Script** : Intégré dans `src/trigger/correctors.ts` pour nettoyer le code sans casser la logique.

- **Types non définis** :

  - **Détection** : ESLint règle `@typescript-eslint/no-inferrable-types` ou vérifications personnalisées.
  - **Correction** : Ajouter des types explicites uniquement si nécessaire ; laisser TypeScript inférer quand possible.
  - **Script** : Utiliser un script pour analyser et ajouter des annotations minimales (ex. : `let x: number = 5;` devient `let x = 5;` si inférable).

- **Utilisation de "any"** :

  - **Détection** : ESLint règle `@typescript-eslint/no-explicit-any`.
  - **Correction** : Remplacer `any` par des types spécifiques (ex. : `Record<string, unknown>` ou interfaces définies).
  - **Script** : Scanner et remplacer automatiquement les "any" par des alternatives typées sûres.

- **Annotations inutiles** :

  - **Détection** : ESLint règle `@typescript-eslint/no-inferrable-types`.
  - **Correction** : Supprimer les annotations redondantes (ex. : pas besoin de typer une constante évidente).
  - **Script** : Nettoyer les fichiers pour garder le code concis.

- **Autres erreurs courantes** :
  - **Imports dupliqués** : Détecter avec `no-duplicate-imports` et fusionner automatiquement.
  - **Console.logs en production** : Remplacer par des logs Winston structurés.
  - **Variables non constantes** : Forcer `const` quand possible avec `prefer-const`.

### Intégration dans les Secteurs

- **Secteur Détection** : Utilise Chokidar pour surveiller les fichiers et déclencher des scans ESLint à chaque changement.
- **Secteur Prévention** : Valide le code avec ESLint avant les commits ou changements majeurs, bloquant les erreurs si nécessaire.
- **Secteur Déclencheur** : Applique les corrections automatiques via scripts (ex. : `eslint --fix`) et restaure les fichiers sans interruption.
- **Workflow** : Dès qu'une erreur est détectée (ex. : sauvegarde d'un fichier), le Watcher lance un script de correction en arrière-plan, notifie si l'erreur persiste, et logue l'action.

### Avantages

- **Automatisation** : Évite les revues manuelles répétitives pour des erreurs simples.
- **Éducation** : L'équipe apprend des corrections automatiques, réduisant les futures erreurs.
- **Productivité** : Développement fluide sans blocages pour des problèmes triviaux.
- **Référence** : S'aligne avec [watcher-best-practices.md - Règles ESLint et TypeScript](#) pour une qualité de code élevée.

Cette gestion des erreurs sera implémentée dans les fichiers composants des secteurs, avec des tests pour garantir la sécurité des corrections.

- **Vérifier les prérequis** : Assurer Node.js (v14+) et npm/yarn installés. Référence : [watcher-requirements.md - Besoins Techniques](#).
- **Créer la structure de projet** : Copier le dossier Watcher dans le nouveau projet. Exclure automatiquement le dossier Watcher de la surveillance pour éviter les boucles.
- **Lire les spécifications** : Consulter [watcher-specification.md](#) pour comprendre les objectifs et [watcher-capabilities.md](#) pour les idées étendues.
- **Planifier les règles** : Définir les règles de fichiers et scripts de correction dans des fichiers de config (ex. : `rules.json`).

### Étape 2 : Installation des Dépendances

- **Utiliser le package.json fourni** : Copier l'exemple de [watcher-dependencies.md](#) dans `package.json`.
  - Commande : `npm install` ou `yarn install`.
- **Dépendances clés à installer** :
  - Runtime : Chokidar, dotenv, @slack/web-api, nodemailer, commander, winston, jest, fs-extra, joi, helmet, glob.
  - Dev : ESLint, Prettier, eslint-config-prettier, eslint-plugin-prettier.
- **Vérification** : S'assurer que toutes les dépendances sont open source et gratuites. Référence : [watcher-dependencies.md - Liste Complète](#).
- **Conseil** : Utiliser `npm audit` pour vérifier les vulnérabilités et mettre à jour si nécessaire.

### Étape 3 : Configuration Initiale

- **Fichier .env.local** : Créer ce fichier pour définir les variables (ex. : `WATCH_DIR=/path/to/project`, `SLACK_WEBHOOK_URL=...`).
  - Référence : [watcher-requirements.md - Variables d'environnement](#).
- **Fichiers de configuration** :
  - `eslint.config.js` : Configurer ESLint avec Prettier (ex. : étendre eslint-config-prettier).
  - `rules.json` : Définir les règles de surveillance (extensions, scripts de prévention/correction).
  - `logger.js` : Configurer Winston pour logs structurés (JSON, niveaux d'erreur).
- **Sécurité** : Utiliser Joi pour valider les configs et Helmet si une API est exposée.
- **Tests initiaux** : Écrire des tests avec Jest pour valider la configuration.

### Étape 4 : Développement et Intégration du Code

- **Modules principaux** :
  - **Watcher.js** : Utiliser Chokidar pour surveiller les fichiers, exclure le dossier Watcher.
  - **Prevention.js** : Intégrer ESLint pour vérifications.
  - **Correction.js** : Appliquer Prettier ou scripts personnalisés pour corrections automatiques.
  - **Notifications.js** : Envoyer des alertes via @slack/web-api ou nodemailer si échec.
  - **CLI.js** : Utiliser Commander.js pour une interface (ex. : `node cli.js start --dir ./project`).
- **Orchestration** : Créer un fichier `index.js` qui orchestre tout : charge dotenv, initialise Winston, démarre Chokidar, et gère les événements.
- **Gestion des erreurs** : Utiliser fs-extra pour manipulations sûres et Joi pour validation.
- **Référence** : S'inspirer de [watcher-capabilities.md - Systèmes de Déclenchement](#) pour les règles conditionnelles.

### Étape 5 : Tests et Validation

- **Tests unitaires** : Avec Jest, tester chaque module (ex. : simulation de changements de fichiers).
- **Tests d'intégration** : Vérifier le workflow complet dans un projet de test.
- **Logs et monitoring** : Utiliser Winston pour tracer les actions (corrections appliquées, notifications envoyées).
- **Référence** : [watcher-requirements.md - Besoins en Tests](#).

### Étape 6 : Lancement et Déploiement

- **Lancement local** : `node index.js` ou via CLI.
- **Portabilité** : Le Watcher peut être copié dans n'importe quel projet et configuré via `.env.local`.
- **Monitoring continu** : Surveiller les logs pour ajuster les règles.
- **Documentation** : Mettre à jour ce guide avec les leçons apprises.

## Conseils pour un Développement Méthodique

- **Ordre des priorités** : Commencer par la surveillance de base, ajouter la prévention, puis la correction.
- **Tests à chaque étape** : Éviter les régressions avec Jest.
- **Réutilisabilité** : Garder le code modulaire pour faciliter les ajouts.
- **Sécurité** : Toujours valider les entrées avec Joi et sécuriser avec Helmet.
- **Documentation croisée** : Lier ce guide aux autres .md pour une référence complète.

Ce guide orchestre tout pour que le Watcher devienne un outil fiable et intelligent. Pour des ajustements, consulter les documents indexés ou proposer des modifications.
