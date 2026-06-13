/**
 * Consignment templates for AI agent guidance
 * These files are injected into projects so agents follow consistent rules
 */

import type { ConsignmentTemplate, AgentType } from "./types.js";

const WATCHER_MANAGED_HEADER = "Managed by watcher-service";

const CLAUDE_MD: ConsignmentTemplate = {
  id: "claude-default",
  agent: "claude",
  fileName: "CLAUDE.md",
  version: "1.0.0",
  description: "Consignes pour Claude - Regles et conventions du projet",
  content: `${WATCHER_MANAGED_HEADER}

# Consignes pour Claude

## Contexte
Ce projet utilise un watcher-service qui surveille, detecte et corrige automatiquement les erreurs laissees par les agents IA. En tant que Claude, tu dois respecter ces regles pour eviter d'introduire des problemes.

## Architecture
- Langage: TypeScript (strict mode, \`"strict": true\` dans tsconfig)
- Modules: ESM (\`"type": "module"\` dans package.json)
- Tests: Jest avec ts-jest (\`--experimental-vm-modules\`)
- Logger: Winston (pas de console.log en production)

## Conventions de code
- **JAMAIS de \`any\`** — utiliser \`unknown\` puis effectuer un type narrowing avec \`typeof\`, \`instanceof\`, ou des guards
- Utiliser \`Record<string, unknown>\` pour les objets extensibles
- Tous les fichiers en UTF-8, LF line endings
- Logger via Winston: \`import { logger } from "../shared/logger.js"\`
- Pour les commandes shell: utiliser \`safeSpawn()\` ou \`safeExecFile()\` depuis \`src/shared/utils.js\`
- Sanitizer les paths: \`sanitizePath()\` avant toute utilisation dans des commandes
- Les interfaces/export doivent etre nommes (pas de \`export default\` pour les classes)

## Securite — CRITIQUE
- **Ne JAMAIS interpoler de paths** dans des commandes shell (\`exec(\`rm \${path}\`)\` = INTERDIT)
- Utiliser \`safeSpawn("rm", [sanitizedPath])\` a la place
- Valider la config au demarrage avec Joi (\`src/shared/config-schema.js\`)
- Ne jamais ecrire de secrets, tokens ou cles API dans le code
- Preférer les variables d'environnement (\`process.env\`)
- Les fichiers de config ne doivent jamais etre ecrases sans backup (\`writeFileWithBackup()\`)

## Erreurs courantes des agents IA — A EVITER
1. **\`any\` partout** — le linter signalera des erreurs. Utiliser \`unknown\` + narrowing
2. **console.log** — utiliser \`logger.info()\`, \`logger.error()\`, etc.
3. **exec()** — utiliser \`safeSpawn()\` pour eviter l'injection de commandes
4. **Paths non sanitises** — toujours passer par \`sanitizePath()\`
5. **Tests oublies** — tout code modifie doit avoir des tests correspondants
6. **Config non validee** — valider avec le schema Joi avant utilisation
7. **Imports casses** — respecter les extensions \`.js\` dans les imports ESM

## Tests
- Lancer \`npm test\` avant chaque commit
- Minimum 80% de couverture
- Tests d'integration pour les flux critiques
- Les tests utilisent \`jest\` avec \`ts-jest\` et le preset ESM
- Fichiers de test dans \`tests/\` avec le meme structure que \`src/\`

## Structure du projet
- \`src/detection/\` — surveillance des fichiers
- \`src/prevention/\` — validation et prevention des erreurs
- \`src/trigger/\` — corrections et notifications
- \`src/injection/\` — injection de fichiers de consignes
- \`src/shared/\` — utilitaires partages (utils, logger, circuit-breaker, etc.)
- \`src/types/\` — definitions de types TypeScript
- \`src/cli/\` — interface en ligne de commande
- \`config/\` — fichiers de configuration
- \`tests/\` — tests unitaires et d'integration

## Commandes utiles
- \`npm test\` — lancer les tests
- \`npx tsc --noEmit\` — verifier le typage
- \`npx eslint src/ tests/\` — verifier le style
- \`node src/cli/index.js\` — lancer le watcher
`,
};

const AGENTS_MD: ConsignmentTemplate = {
  id: "agents-generic",
  agent: "generic",
  fileName: "AGENTS.md",
  version: "1.0.0",
  description: "Regles generiques pour tous les agents IA",
  content: `${WATCHER_MANAGED_HEADER}

# Regles generales pour tous les agents IA

## Contexte
Ce projet est surveille par un watcher-service qui detecte et corrige automatiquement les erreurs. Pour eviter d'etre corrige (ou d'introduire des problemes), suis ces regles.

## Priorites (dans l'ordre)
1. **Securite** — ne jamais introduire de faille (injection, paths non sanitises, secrets)
2. **Tests** — tout code modifie doit avoir des tests
3. **Typage** — eliminer les \`any\`, utiliser des types precis
4. **Documentation** — les fonctions publiques doivent etre documentees

## Regles absolues

### Typage
- **JAMAIS de \`any\`** — utiliser \`unknown\` puis effectuer un type narrowing
- Utiliser \`Record<string, unknown>\` pour les objets extensibles
- Les interfaces doivent etre exportees et nommees
- Preferer les types existants dans \`src/types/\` aux types inline

### Securite
- **Ne JAMAIS interpoler de paths** dans des commandes shell
- Utiliser \`safeSpawn(command, args)\` au lieu de \`exec(command)\`
- Sanitizer les paths avec \`sanitizePath()\`
- Valider la config au demarrage avec Joi
- Ne jamais ecrire de secrets dans le code — utiliser \`process.env\`
- Ne jamais modifier les fichiers de config sans validation

### Logging
- **Pas de \`console.log\`** — utiliser Winston (\`logger.info()\`, \`logger.error()\`, etc.)
- Les logs doivent etre structures et informatifs
- Inclure le contexte (nom de fichier, fonction) dans les messages d'erreur

### Tests
- Minimum 80% de couverture
- Tests unitaires pour les nouvelles fonctions
- Tests d'integration pour les flux critiques
- Lancer \`npm test\` avant chaque commit

### Code
- Respecter la structure existante du projet
- Ne pas supprimer de tests existants
- Ne pas modifier la config sans necessite
- Preferer les utilitaires existants (\`src/shared/\`) aux nouvelles implementations

## Actions interdites
- Executer des commandes shell non sanitisees
- Ecrire des secrets ou tokens dans le code
- Supprimer des tests existants
- Modifier la config sans validation Joi
- Utiliser \`any\` comme type
- Utiliser \`console.log\` en production
- Interpoler des variables dans des commandes shell

## Actions recommandees
- Lire les fichiers de config avant de changer la structure
- Verifier les tests existants avant de modifier un fichier
- Utiliser les utilitaires de \`src/shared/\` plutot que de reinventer
- Lancer le linter et les tests avant de commiter
- Preférer les modifications incrementales aux gros changements
`,
};

const CURSOR_RULES: ConsignmentTemplate = {
  id: "cursor-default",
  agent: "cursor",
  fileName: ".cursorrules",
  version: "1.0.0",
  description: "Consignes pour Cursor IDE",
  content: `${WATCHER_MANAGED_HEADER}

# Cursor Rules

## Context
This project is monitored by a watcher-service that detects and auto-corrects errors left by AI agents. Follow these rules to avoid introducing issues.

## TypeScript
- Use strict TypeScript (\`"strict": true\`)
- **NEVER use \`any\`** — use \`unknown\` and narrow with typeof/instanceof
- Use \`Record<string, unknown>\` for extensible objects
- All files must be UTF-8 with LF line endings

## Module System
- ESM modules (\`"type": "module"\` in package.json)
- Always include \`.js\` extension in relative imports
- Use \`export\` for named exports, avoid \`export default\`

## Logging
- **No \`console.log\`** — use Winston logger
- Import: \`import { logger } from "../shared/logger.js"\`
- Methods: \`logger.info()\`, \`logger.warn()\`, \`logger.error()\`, \`logger.debug()\`

## Security — CRITICAL
- **NEVER interpolate paths** in shell commands (\`exec(\`rm \${path}\`)\` = FORBIDDEN)
- Use \`safeSpawn("rm", [sanitizedPath])\` instead
- Sanitize all paths with \`sanitizePath()\` before use
- Validate config with Joi schema at startup
- Never write secrets, tokens, or API keys in code
- Use \`process.env\` for sensitive values

## Child Processes
- Use \`safeSpawn()\` from \`src/shared/utils.js\` — not \`exec()\`
- Use \`safeExecFile()\` for running executables
- Always set timeouts on spawned processes

## Testing
- Write tests for new features
- Run \`npm test\` before committing
- Minimum 80% coverage
- Test files go in \`tests/\` mirroring \`src/\` structure

## Error Handling
- Use typed errors, not string throws
- \`catch (error: unknown)\` — then check \`instanceof Error\`
- Log errors with Winston, don't swallow them

## Common AI Agent Mistakes to Avoid
1. Using \`any\` type — use \`unknown\` instead
2. Using \`console.log\` — use Winston logger
3. Using \`exec()\` — use \`safeSpawn()\` instead
4. Unsanitized paths — always use \`sanitizePath()\`
5. Missing tests — always add tests for changes
6. Invalid config — validate with Joi before use
7. Broken imports — use \`.js\` extension for ESM

## Project Structure
- \`src/detection/\` — file monitoring
- \`src/prevention/\` — validation and prevention
- \`src/trigger/\` — corrections and notifications
- \`src/injection/\` — consignment file injection
- \`src/shared/\` — shared utilities
- \`src/types/\` — TypeScript type definitions
`,
};

const COPILOT_INSTRUCTIONS: ConsignmentTemplate = {
  id: "copilot-default",
  agent: "copilot",
  fileName: ".github/copilot-instructions.md",
  version: "1.0.0",
  description: "Consignes pour GitHub Copilot",
  content: `${WATCHER_MANAGED_HEADER}

# GitHub Copilot Instructions

## Context
This project uses a watcher-service that monitors and auto-corrects AI agent errors. Follow these rules to write clean, safe code.

## TypeScript Rules
- Strict mode enabled — no escape from type safety
- **NEVER use \`any\`** — use \`unknown\` and narrow types
- Use \`Record<string, unknown>\` for extensible objects
- Named exports only — no \`export default\`

## Module System
- ESM only (\`"type": "module"\`)
- Include \`.js\` extension in all relative imports
- Use \`import type { X } from "y"\` for type-only imports

## Logging
- NO \`console.log\` — use Winston logger
- Import: \`import { logger } from "../shared/logger.js"\`

## Security
- NEVER interpolate paths in shell commands
- Use \`safeSpawn(command, args)\` instead of \`exec()\`
- Sanitize paths with \`sanitizePath()\`
- Validate config with Joi at startup
- Use \`process.env\` for secrets — never hardcode

## Testing
- Always include tests with changes
- Minimum 80% coverage
- Run \`npm test\` before commits
- Test files in \`tests/\` directory

## Error Handling
- Catch with \`error: unknown\` then narrow
- Use structured logging for errors
- Never swallow errors silently

## Common Mistakes to Avoid
1. \`any\` types — use \`unknown\` + narrowing
2. \`console.log\` — use Winston logger
3. \`exec()\` — use \`safeSpawn()\`
4. Unsanitized paths — use \`sanitizePath()\`
5. Missing tests — always add tests
6. Config without validation — use Joi schema
7. Imports without \`.js\` extension — ESM requires it
`,
};

const WINDSURF_RULES: ConsignmentTemplate = {
  id: "windsurf-default",
  agent: "windsurf",
  fileName: ".windsurfrules",
  version: "1.0.0",
  description: "Consignes pour Windsurf",
  content: `${WATCHER_MANAGED_HEADER}

# Windsurf Rules

## Context
This project is monitored by watcher-service. AI-generated code must follow these rules to avoid auto-correction.

## TypeScript
- Strict mode, ESM modules
- **NEVER use \`any\`** — use \`unknown\` with type narrowing
- Use \`Record<string, unknown>\` for extensible objects
- Named exports, no \`export default\`
- Include \`.js\` extension in relative imports

## Logging
- NO \`console.log\` — use Winston logger
- Import: \`import { logger } from "../shared/logger.js"\`

## Security — CRITICAL
- NEVER interpolate paths in shell commands
- Use \`safeSpawn("cmd", [args])\` — not \`exec()\`
- Sanitize paths with \`sanitizePath()\`
- Validate config with Joi schema
- Use \`process.env\` for secrets

## Testing
- Write tests for all changes
- Run \`npm test\` before commits
- Minimum 80% coverage

## Error Handling
- Use \`catch (error: unknown)\` pattern
- Log errors with Winston, don't swallow
- Use typed errors when possible

## Project Structure
- \`src/detection/\` — file monitoring
- \`src/prevention/\` — validation
- \`src/trigger/\` — corrections
- \`src/injection/\` — consignment injection
- \`src/shared/\` — utilities (utils, logger, circuit-breaker)
- \`src/types/\` — type definitions
`,
};

const ALL_TEMPLATES: ConsignmentTemplate[] = [
  CLAUDE_MD,
  AGENTS_MD,
  CURSOR_RULES,
  COPILOT_INSTRUCTIONS,
  WINDSURF_RULES,
];

/**
 * Get all available templates
 */
export function getAllTemplates(): ConsignmentTemplate[] {
  return [...ALL_TEMPLATES];
}

/**
 * Get templates for a specific agent
 */
export function getTemplatesForAgent(agent: AgentType): ConsignmentTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.agent === agent);
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): ConsignmentTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get the file name for an agent's consignment file
 */
export function getFileNameForAgent(agent: AgentType): string | undefined {
  const template = ALL_TEMPLATES.find((t) => t.agent === agent);
  return template?.fileName;
}

/**
 * Get the managed-by header
 */
export function getManagedHeader(): string {
  return WATCHER_MANAGED_HEADER;
}
