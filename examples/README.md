# Exemples de Code pour le Watcher

Ce dossier contient des exemples complets et prêts à l'emploi pour une exécution directe du Watcher. Utilisez-les comme base pour votre implémentation sans itération supplémentaire.

## Structure des Exemples
- **[Implémentation Complète](./full-implementation.ts)** : Code intégrant les secteurs Détection, Prévention et Déclencheur.
- **[Secteur Détection](./detection/)** : Surveillance avec Chokidar.
- **[Secteur Prévention](./prevention/)** : Validations avec ESLint.
- **[Secteur Déclencheur](./trigger/)** : Corrections automatiques.
- **[Configuration](./config/)** : Fichiers de config prêts (ESLint, package.json, tsconfig.json).
- **[Tests](./tests/)** : Exemples de tests avec Jest.

## Utilisation pour Exécution Directe
1. Copiez ces fichiers dans votre projet.
2. Installez les dépendances : `npm install` (utilisez le `package.json` fourni).
3. Configurez `.env.local` avec `WATCH_DIR=/path/to/your/project`.
4. Lancez : `npm start`.
5. Les erreurs courantes (unused vars, any, etc.) seront corrigées automatiquement.

## Notes sur les Erreurs TypeScript
- Les exemples utilisent des modules comme Chokidar et ESLint. Installez les dépendances pour résoudre les erreurs TypeScript.
- Utilisez `npm i --save-dev @types/node` si nécessaire pour les types Node.js.

Référence : [watcher-setup-guide.md - Structure Modulaire](./../watcher-setup-guide.md).
