<!-- Managed by watcher-service v1.0.0 -->

Managed by watcher-service

# GitHub Copilot Instructions

## Context
This project uses a watcher-service that monitors and auto-corrects AI agent errors. Follow these rules to write clean, safe code.

## TypeScript Rules
- Strict mode enabled — no escape from type safety
- **NEVER use `any`** — use `unknown` and narrow types
- Use `Record<string, unknown>` for extensible objects
- Named exports only — no `export default`

## Module System
- ESM only (`"type": "module"`)
- Include `.js` extension in all relative imports
- Use `import type { X } from "y"` for type-only imports

## Logging
- NO `console.log` — use Winston logger
- Import: `import { logger } from "../shared/logger.js"`

## Security
- NEVER interpolate paths in shell commands
- Use `safeSpawn(command, args)` instead of `exec()`
- Sanitize paths with `sanitizePath()`
- Validate config with Joi at startup
- Use `process.env` for secrets — never hardcode

## Testing
- Always include tests with changes
- Minimum 80% coverage
- Run `npm test` before commits
- Test files in `tests/` directory

## Error Handling
- Catch with `error: unknown` then narrow
- Use structured logging for errors
- Never swallow errors silently

## Common Mistakes to Avoid
1. `any` types — use `unknown` + narrowing
2. `console.log` — use Winston logger
3. `exec()` — use `safeSpawn()`
4. Unsanitized paths — use `sanitizePath()`
5. Missing tests — always add tests
6. Config without validation — use Joi schema
7. Imports without `.js` extension — ESM requires it
