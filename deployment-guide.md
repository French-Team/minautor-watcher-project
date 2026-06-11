# Guide de Déploiement Avancé du Watcher

Ce guide couvre les aspects avancés du déploiement, incluant l'intégration CI/CD, le déploiement sur serveur, et les intégrations externes. Il complète le guide de setup pour une finition professionnelle.

## 1. Déploiement Local Avancé
- **Environnement de production** : Utilisez `NODE_ENV=production` pour désactiver les logs verbeux.
- **PM2 pour gestion de processus** :
  ```bash
  npm install -g pm2
  pm2 start index.js --name watcher
  pm2 save  # Persiste après redémarrage
  ```
- **Monitoring** : Intégrez Winston avec des transports fichier pour logs persistants.

## 2. Déploiement sur Serveur (Ex. : VPS ou Cloud)
- **Prérequis** : Node.js installé sur le serveur.
- **Copie et installation** :
  1. Téléchargez/copiez le dossier Watcher.
  2. `npm ci` (au lieu de `npm install` pour prod).
  3. Configurez `.env.local` avec les chemins absolus.
- **Sécurité** : Utilisez Helmet pour protéger contre les vulnérabilités courantes si une API est exposée.
- **Exemple avec Docker** :
  ```dockerfile
  FROM node:18-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  CMD ["node", "index.js"]
  ```

## 3. Intégration CI/CD (Ex. : GitHub Actions)
- **Workflow exemple** (`github/workflows/ci.yml`) :
  ```yaml
  name: CI/CD
  on: push
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v2
        - uses: actions/setup-node@v2
          with:
            node-version: '18'
        - run: npm ci
        - run: npm test  # Jest
    deploy:
      if: github.ref == 'refs/heads/main'
      runs-on: ubuntu-latest
      steps:
        - run: echo "Déployer sur serveur..."
  ```
- **Tests automatisés** : Intégrez Jest pour vérifier les secteurs avant déploiement.

## 4. Intégrations Externes
- **Slack Notifications** : Configurez `@slack/web-api` avec un webhook pour alertes en temps réel.
- **Email via Nodemailer** : Utilisez SMTP (Gmail ou SendGrid) pour rapports d'erreurs.
- **Monitoring Externe** : Intégrez Sentry pour suivi des erreurs :
  ```bash
  npm install @sentry/node
  ```
- **API Exposition** (optionnel) : Ajoutez Express pour une API REST si besoin d'interactions externes.

## 5. Déploiement Cloud (Ex. : Heroku, Netlify)
- **Heroku** :
  1. Créez une app : `heroku create mon-watcher`.
  2. Poussez le code : `git push heroku main`.
  3. Définissez les vars d'env : `heroku config:set WATCH_DIR=./`.
- **Optimisations** : Utilisez des buildpacks Node.js et activez les logs.

## 6. Maintenance et Mises à Jour
- **Monitoring continu** : Surveillez les logs Winston pour détecter les problèmes.
- **Mises à jour** : Utilisez `npm outdated` pour vérifier les dépendances et mettre à jour sans casser la compatibilité.
- **Rollback** : Gardez des sauvegardes des fichiers surveillés avant corrections majeures.
- **Sécurité** : Auditez régulièrement avec `npm audit` et appliquez Joi pour valider les configs.

## Conseils
- Testez toujours en staging avant prod.
- Référence : [watcher-requirements.md - Déploiement](./watcher-requirements.md).
- Pour des besoins spécifiques, adaptez ce guide.

Ce guide assure un déploiement robuste et scalable.
