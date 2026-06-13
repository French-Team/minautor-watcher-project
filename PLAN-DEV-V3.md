# Plan de Developpement V3 - Watcher Service

> Cree le 12 juin 2026

## Vision

Le watcher ne se contente plus de corriger les erreurs laisseees par les agents IA. Il devient un **orchestrateur de qualite** qui:

1. **Detecte** les problemes (V2 — fait)
2. **Corrige** automatiquement (V2 — fait)
3. **Injecte** des fichiers de consignes dans les projets surveilles
4. **Guider** les agents IA via ces fichiers (CLAUDE.md, AGENTS.md, etc.)
5. **Devient intelligent** — analyse les projets et adapte ses actions

**Resultat final** : Des projets unifies, des agents qui suivent les memes directives, beaucoup moins d'erreurs, meme quand un nouvel agent reprend le travail.

---

## Contexte problematique

Les agents IA (Claude, Copilot, Cursor, etc.) ont tendance a:
- Laisser des erreurs TypeScript/ESLint non resolues
- Creer du code qui ne suit pas les conventions du projet
- Oublier des dependances ou des configurations
- Ne pas respecter l'architecture existante
- Introduire des failles de securite (injection, paths non sanitises)

**Solution** : Placer des fichiers de consignes (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, etc.) dans chaque projet. Ces fichiers sont lus automatiquement par les agents au demarrage. Le watcher:
- Verifie qu'ils existent
- Les injecte s'ils manquent
- Les maintient a jour
- Contient les regles specifiques au projet

---

## V3.1 — Systeme d'injection de fichiers de consignes

**Objectif** : Le watcher detecte les fichiers de consignes manquants et les injecte automatiquement.

### 3.1.1 Bibliotheque de templates

**Fichier** : Nouveau `src/injection/templates/`

Le watcher embarque une bibliotheque de templates pour chaque agent:

```
src/injection/templates/
  CLAUDE.md          → consignes pour Claude
  AGENTS.md          → consignes generiques (tous agents)
  .cursorrules       → consignes pour Cursor
  .github/copilot-instructions.md → GitHub Copilot
  .windsurfrules     → Windsurf
```

Chaque template contient:
- Les regles generales du projet (architecture, conventions)
- Les consignes de securite (pas d'injection, paths sanitises)
- Les instructions de test (comment tester, quoi verifier)
- Les references aux autres fichiers de config du projet

**Gestion des templates** :
- Templates integres dans le code (defaut)
- Templates personalisables via `config/templates/`
- Templates hereditaires (un template peut en inclure un autre)

### 3.1.2 Moteur de detection

**Fichier** : Nouveau `src/injection/detector.ts`

Detecte quels fichiers de consignes sont presents ou manquants:

```typescript
interface InjectionStatus {
  projectDir: string;
  agents: Array<{
    name: string;          // "claude", "copilot", "cursor", etc.
    configFile: string;    // "CLAUDE.md", ".cursorrules", etc.
    present: boolean;
    outdated: boolean;     // version dans le template > version dans le projet
    content?: string;      // contenu actuel
  }>;
  missingCount: number;
  outdatedCount: number;
}
```

**Depuis le CLI** :
```bash
watcher inject --check          # Verifie quels fichiers manquent
watcher inject --apply          # Injecte les fichiers manquants
watcher inject --update         # Met a jour les fichiers obsoletes
watcher inject --dry-run        # Affiche ce qui serait fait
```

### 3.1.3 Moteur d'injection

**Fichier** : Nouveau `src/injection/injector.ts`

Gere l'ecriture des fichiers de consignes:

```typescript
interface InjectionResult {
  file: string;
  action: "created" | "updated" | "skipped" | "error";
  reason?: string;
}
```

**Regles d'injection** :
- Ne jamais ecraser un fichier modifie manuellement (flag `--force` requis)
- Ajouter un header `<!-- Managed by watcher-service -->` pour identifier les fichiers geres
- Sauvegarder une copie avant ecrasement (backup)
- Versionner les templates (pour detecter les obsoletes)

### 3.1.4 Integrateur Prevention

**Fichier** : `src/prevention/index.ts`

Le PreventionModule verifie aussi les fichiers de consignes:
- Nouveau validateur `ConsignmentValidator` qui verifie la presence des fichiers
- Si un fichier manque → erreur/warning selon la config
- Le watcher peut corriger automatiquement (si `autoFix: true`)

---

## V3.2 — Templates de consignes

**Objectif** : Creer les templates de consignes qui guident les agents IA.

### 3.2.1 Template CLAUDE.md

```markdown
# Consignes pour Claude — {{projectName}}

## Architecture
{{#if hasTypeScript}}
- Langage: TypeScript (strict mode)
- Modules: ESM (`"type": "module"`)
- Tests: Jest avec ts-jest
{{/if}}

## Conventions
- Pas de `any` — utiliser `unknown` puis narrow
- Tous les fichiers doivent etre en UTF-8
- Logs via Winston (pas de console.log en prod)
- Utiliser `safeSpawn()` au lieu de `exec()` pour les commandes

## Securite
- Ne jamais interpoler de paths dans des commandes shell
- Sanitizer les paths avec `sanitizePath()`
- Valider la config au demarrage avec Joi

## Tests
- Lancer `npm test` avant chaque commit
- Minimum 80% de couverture
- Tests d'integration pour les flux critiques

## Fichiersimportants
- `config/` — configuration du projet
- `src/shared/` — utilitaires partages
- `PLAN-DEV-V2.md` — plan de developpement
```

### 3.2.2 Template AGENTS.md

```markdown
# Regles generales pour tous les agents IA

## Priorites
1. Securite d'abord — ne jamais introduire de faille
2. Tests — tout code.modifie doit avoir des tests
3. Typage — eliminer les `any`, utiliser des types precis
4. Documentation — les fonctions publiques doivent etre documentees

## Actions interdites
- Executer des commandes shell non sanitisees
- Ecrire des secrets dans le code
- Supprimer des tests existants
- Modifier la config sans validation

## Actions recommandees
- Lancer le linter avant chaque commit
- Verifier les tests existants avant de modifier un fichier
- Lire les fichiers de config avant de changer la structure
- Preferer les types existants aux types `any`
```

### 3.2.3 Templates specifiques par agent

| Agent | Fichier | Priorite |
|-------|---------|----------|
| Claude | `CLAUDE.md` | Haute |
| GitHub Copilot | `.github/copilot-instructions.md` | Haute |
| Cursor | `.cursorrules` | Haute |
| Windsurf | `.windsurfrules` | Moyenne |
| Aider | `.aider.conf.yml` | Basse |
| Generique | `AGENTS.md` | Tous |

---

## V3.3 — Mode one-shot

**Objectif** : scanner un projet, corriger et injecter, puis s'arreter.

### 3.3.1 Commande `watcher scan`

```bash
watcher scan [options]

Options:
  -d, --dir <dir>      Dossier a scanner (defaut: cwd)
  --fix                Corriger les erreurs detectees
  --inject             Injecter les fichiers de consignes manquants
  --all                --fix + --inject
  --report <file>      Generer un rapport JSON
  --dry-run            Afficher sans modifier
```

**Comportement** :
1. Scanne le projet (extensions, structure, config)
2. Verifie les regles de prevention
3. Verifie les fichiers de consignes
4. Applique les corrections (si `--fix`)
5. Injecte les fichiers manquants (si `--inject`)
6. Genere un rapport (si `--report`)

### 3.3.2 Integrateur CI/CD

Le mode one-shot est ideal pour CI:
```yaml
# GitHub Actions
- run: npx watcher scan --all --report report.json
- uses: actions/upload-artifact@v4
  with:
    name: watcher-report
    path: report.json
```

---

## V3.4 — Mode intelligent (preparation)

**Objectif** : preparer l'infrastructure pour un watcher intelligent.

### 3.4.1 Systeme d'analyse de projet

**Fichier** : Nouveau `src/analysis/project-analyzer.ts`

Analyse un projet pour en comprendre la structure:

```typescript
interface ProjectAnalysis {
  name: string;
  language: "typescript" | "javascript" | "mixed";
  framework?: string;       // "react", "next", "express", etc.
  packageManager: string;   // "npm", "yarn", "pnpm"
  hasTypeScript: boolean;
  hasESLint: boolean;
  hasPrettier: boolean;
  hasTests: boolean;
  testFramework?: string;   // "jest", "vitest", "mocha"
  architecture?: string;    // "monorepo", "single", "library"
  conventions: {
    indentStyle: "spaces" | "tabs";
    indentSize: number;
    lineEnding: "lf" | "crlf";
    semicolons: boolean;
    quotes: "single" | "double";
  };
}
```

**Utilisation** :
- Adapter les templates de consignes au projet
- Determiner quelles regles appliquer
- Personnaliser les messages d'erreur

### 3.4.2 Systeme de regles adaptables

**Fichier** : Nouveau `src/analysis/rules-engine.ts`

Moteur de regles qui adapte le comportement du watcher:

```typescript
interface AdaptiveRule {
  id: string;
  condition: (analysis: ProjectAnalysis) => boolean;
  action: "enforce" | "suggest" | "skip";
  message: string;
  fix?: () => Promise<void>;
}
```

**Exemples de regles** :
- Si le projet utilise React → verifier les hooks rules
- Si le projet est un monorepo → adapter les patterns de fichiers
- Si le projet n'a pas de tests → suggerer d'en ajouter
- Si le projet utilise du `any` → forcer le retype

### 3.4.3 Preparation pour l'IA

Le systeme est pret pour recevoir un module d'IA qui pourrait:
- Analyser le code et suggerer des ameliorations
- Detecter des patterns problematiques
- Generer des regles adaptees au projet
- Apprendre des corrections passees

**Interface preparee** :
```typescript
interface IntelligentModule {
  analyze(projectDir: string): Promise<ProjectAnalysis>;
  suggestRules(analysis: ProjectAnalysis): Promise<AdaptiveRule[]>;
  generateConsignment(analysis: ProjectAnalysis): Promise<string>;
}
```

---

## V3.5 — Integration avec le systeme existant

### 3.5.1 Mise a jour du CLI

Nouvelles commandes:
```bash
watcher scan --all          # Mode one-shot complet
watcher inject --check      # Verifier les fichiers de consignes
watcher inject --apply      # Injecter les fichiers manquants
watcher analyze             # Analyser la structure du projet
```

### 3.5.2 Mise a jour du PreventionModule

Nouveau validateur: `ConsignmentValidator`
- Verifie la presence de `CLAUDE.md`, `AGENTS.md`, etc.
- Verifie que les fichiers sont a jour (version dans le template)
- Peut injecter automatiquement si configurer

### 3.5.3 Configuration unifiee

Nouvelle section dans `watcher.config.json`:
```jsonc
{
  "injection": {
    "enabled": true,
    "templates": ["claude", "agents", "copilot"],
    "autoInject": false,        // injecter automatiquement au demarrage
    "autoUpdate": false,        // mettre a jour automatiquement
    "customTemplates": "./templates/"  // templates personnalises
  },
  "analysis": {
    "enabled": true,
    "adaptiveRules": true       // activer les regles adaptables
  }
}
```

---

## Ordre de realisation

```
V3.1 (Systeme d'injection)      ✅ Fait
  3.1.1 Bibliotheque de templates    ✅
  3.1.2 Moteur de detection          ✅
  3.1.3 Moteur d'injection           ✅
  3.1.4 Integrateur Prevention       ✅

V3.2 (Templates de consignes)   ✅ Fait
  3.2.1 Template CLAUDE.md           ✅
  3.2.2 Template AGENTS.md           ✅
  3.2.3 Templates specifiques        ✅

V3.3 (Mode one-shot)            ✅ Fait
  3.3.1 Commande watcher scan        ✅
  3.3.2 Integrateur CI/CD            ✅

V3.4 (Mode intelligent)         ✅ Fait
  3.4.1 Systeme d'analyse            ✅
  3.4.2 Regles adaptables            ✅
  3.4.3 Preparation IA               ✅

V3.5 (Integration)              ✅ Fait
  3.5.1 Mise a jour CLI              ✅
  3.5.2 Integrateur Prevention       ✅
  3.5.3 Configuration unifiee        ✅
```

**Statut V3** : ✅ TERMINÉ

**Tests** : 217/217, 13 suites
**Lint** : 0 erreurs
**Typecheck** : clean

---

## Dependances V2

Tout le systeme V2 (securite, architecture, performance, DX) est une dependance directe:
- `safeSpawn()` → securite des injections
- `PreventionModule` → integration des validateurs
- `CorrectorRegistry` → pattern de registry reutilise pour les templates
- `PluginRegistry` → extensibilite des templates
- `UnifiedConfig` → configuration unifiee V3
- `CircuitBreaker` → fiabilite des operations d'injection
- `HealthHttpServer` → monitoring du systeme d'injection
- `GracefulDrain` → arret propre pendant les injections
