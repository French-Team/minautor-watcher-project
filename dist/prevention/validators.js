import fs from "fs-extra";
import path from "path";
import { Utils, safeSpawn } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";
import { getEslintTemplate } from "../injection/index.js";
const logger = createChildLogger("prevention-validators");
/**
 * Base validator class
 */
export class BaseValidator {
    config;
    name;
    constructor(name, config) {
        this.name = name;
        this.config = config;
    }
    /**
     * Get validator name
     */
    getName() {
        return this.name;
    }
    /**
     * Check if validator is enabled
     */
    isEnabled() {
        return this.config.enabled;
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
/**
 * ESLint validator for JavaScript/TypeScript files
 */
export class ESLintValidator extends BaseValidator {
    constructor(config) {
        super("eslint", config);
    }
    async validate(filePath) {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        if (!this.isEnabled()) {
            return result;
        }
        // Skip if ESLint was already checked and unavailable
        if (this.eslintAvailable === false) {
            return result;
        }
        try {
            // Check if ESLint is available
            await this.checkESLintAvailability();
            // Check if the target project has an ESLint config
            if (!(await this.checkESLintConfig(filePath))) {
                return result;
            }
            // Find project dir so we use the correct ESLint binary
            const projectDir = await this.findProjectRoot(filePath);
            const eslintCmd = await this.getEslintPath(projectDir);
            const eslintArgs = ESLintValidator.usingNpx
                ? ["eslint", filePath, "--format=json"]
                : [filePath, "--format=json"];
            const { stdout, stderr, exitCode } = await safeSpawn(eslintCmd, eslintArgs, projectDir ? { cwd: projectDir } : undefined);
            if (stderr) {
                logger.warn(`ESLint stderr for ${filePath}:`, stderr);
            }
            // Handle empty stdout or non-zero exit without JSON output
            if (!stdout || stdout.trim() === "") {
                if (exitCode !== 0) {
                    logger.warn(`ESLint returned no output for ${filePath} (exit code ${exitCode})${stderr ? ` — ${stderr.substring(0, 500)}` : ""}`);
                }
                return result;
            }
            // Parse ESLint output
            let eslintResults;
            try {
                eslintResults = JSON.parse(stdout);
            }
            catch (parseError) {
                logger.warn(`ESLint output not valid JSON for ${filePath}:`, stdout.substring(0, 200));
                return result;
            }
            for (const fileResult of eslintResults) {
                // Read file content once for all errors (V5.5 optimization)
                let fileContent = null;
                try {
                    fileContent = await fs.readFile(filePath, "utf-8");
                }
                catch {
                    // Ignore read errors
                }
                for (const message of fileResult.messages) {
                    const validationMessage = {
                        rule: message.ruleId || "unknown",
                        message: message.message,
                        file: filePath,
                        line: message.line,
                        column: message.column,
                        severity: message.severity === 2 ? "error" : "warning",
                        code: this.getCodeSnippetFromContent(fileContent, message.line),
                    };
                    if (message.severity === 2) {
                        result.errors.push(validationMessage);
                        result.isValid = false;
                    }
                    else {
                        result.warnings.push({
                            rule: validationMessage.rule,
                            message: validationMessage.message,
                            file: validationMessage.file,
                            line: validationMessage.line,
                            column: validationMessage.column,
                            suggestion: message.suggestions?.[0]?.desc,
                        });
                    }
                }
            }
            logger.debug(`ESLint validation completed for ${filePath}: ${result.errors.length} errors, ${result.warnings.length} warnings`);
        }
        catch (error) {
            const errorCode = error instanceof Error && "code" in error
                ? error.code
                : undefined;
            if (errorCode === "ENOENT") {
                // npx not found — cache and skip future calls
                this.eslintAvailable = false;
                logger.warn("ESLint not found (npx ENOENT), skipping validation for all files");
                return result;
            }
            else {
                const errorMessage = error instanceof Error ? error.message : String(error);
                // ESLint not available is expected — log as warn, not error
                if (errorMessage.includes("ESLint is not available")) {
                    logger.warn(`ESLint validation skipped for ${filePath}: ${errorMessage}`);
                }
                else {
                    logger.error(`ESLint validation failed for ${filePath}:`, error);
                    result.errors.push({
                        rule: "eslint-error",
                        message: `ESLint execution failed: ${errorMessage}`,
                        file: filePath,
                        severity: "error",
                    });
                    result.isValid = false;
                }
            }
        }
        return result;
    }
    eslintAvailable = null;
    eslintConfigChecked = false;
    eslintConfigMissing = false;
    static eslintPath = null;
    static usingNpx = false;
    static eslintPathByProject = new Map();
    async getEslintPath(projectDir) {
        // Return per-project cached path if available
        if (projectDir && ESLintValidator.eslintPathByProject.has(projectDir)) {
            const cached = ESLintValidator.eslintPathByProject.get(projectDir);
            ESLintValidator.usingNpx = cached.npx;
            return cached.path;
        }
        // If a project dir is provided, check for eslint there first
        if (projectDir) {
            const isWindows = process.platform === "win32";
            const eslintName = isWindows ? "eslint.cmd" : "eslint";
            const projectBin = path.join(projectDir, "node_modules", ".bin", eslintName);
            const projectBinAlt = path.join(projectDir, "node_modules", ".bin", "eslint");
            if (await Utils.pathExists(projectBin)) {
                ESLintValidator.eslintPathByProject.set(projectDir, { path: projectBin, npx: false });
                ESLintValidator.usingNpx = false;
                logger.debug(`Using project ESLint: ${projectBin}`);
                return projectBin;
            }
            if (!isWindows && (await Utils.pathExists(projectBinAlt))) {
                ESLintValidator.eslintPathByProject.set(projectDir, { path: projectBinAlt, npx: false });
                ESLintValidator.usingNpx = false;
                logger.debug(`Using project ESLint: ${projectBinAlt}`);
                return projectBinAlt;
            }
        }
        // Fall back to global static path
        if (ESLintValidator.eslintPath !== null) {
            ESLintValidator.usingNpx = ESLintValidator.eslintPath === "npx";
            return ESLintValidator.eslintPath;
        }
        const isWindows = process.platform === "win32";
        const eslintName = isWindows ? "eslint.cmd" : "eslint";
        const watcherPath = path.join(process.cwd(), "node_modules", ".bin", eslintName);
        const altPath = path.join(process.cwd(), "node_modules", ".bin", "eslint");
        if (await Utils.pathExists(watcherPath)) {
            ESLintValidator.eslintPath = watcherPath;
            ESLintValidator.usingNpx = false;
            logger.debug(`Using watcher ESLint: ${watcherPath}`);
        }
        else if (!isWindows && (await Utils.pathExists(altPath))) {
            ESLintValidator.eslintPath = altPath;
            ESLintValidator.usingNpx = false;
            logger.debug(`Using watcher ESLint: ${altPath}`);
        }
        else {
            ESLintValidator.eslintPath = "npx";
            ESLintValidator.usingNpx = true;
            logger.debug("Local ESLint not found, falling back to npx");
        }
        return ESLintValidator.eslintPath;
    }
    /**
     * Detect the ESLint major version in the target project from its package.json.
     * Returns { major: 0, hasESLint: false } if no eslint dependency found.
     */
    async getProjectESLintVersion(projectDir) {
        const pkgPath = path.join(projectDir, "package.json");
        try {
            const pkg = await fs.readJson(pkgPath);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            const eslintVer = deps?.eslint;
            if (!eslintVer) {
                return { major: 0, hasESLint: false };
            }
            const match = eslintVer.match(/\d+/);
            const major = match ? parseInt(match[0], 10) : 0;
            return { major, hasESLint: true };
        }
        catch {
            return { major: 0, hasESLint: false };
        }
    }
    async checkESLintAvailability() {
        if (this.eslintAvailable !== null)
            return;
        try {
            const eslintCmd = await this.getEslintPath();
            const args = ESLintValidator.usingNpx
                ? ["eslint", "--version"]
                : ["--version"];
            await safeSpawn(eslintCmd, args);
            this.eslintAvailable = true;
        }
        catch (error) {
            this.eslintAvailable = false;
            throw new Error("ESLint is not available. Please install it: npm install eslint");
        }
    }
    /**
     * Check if the target project has an ESLint configuration.
     * If missing, auto-detects TS/JS and injects a config file.
     * Called once per validator instance.
     *
     * Fixes:
     * - Searches upward for the real project root (package.json/.git/tsconfig.json)
     * - Writes template directly (bypasses injectFiles which has duplicate template bug)
     * - Writes raw JSON content (no HTML comment prefix that breaks JSON parsing)
     */
    async checkESLintConfig(filePath) {
        if (this.eslintConfigChecked)
            return !this.eslintConfigMissing;
        this.eslintConfigChecked = true;
        const projectDir = await this.findProjectRoot(filePath);
        const configFiles = [
            ".eslintrc",
            ".eslintrc.js",
            ".eslintrc.cjs",
            ".eslintrc.mjs",
            ".eslintrc.json",
            ".eslintrc.yaml",
            ".eslintrc.yml",
        ];
        // Check for config files
        for (const file of configFiles) {
            if (await fs.pathExists(path.join(projectDir, file))) {
                return true;
            }
        }
        // Check for eslintConfig in package.json
        const packageJsonPath = path.join(projectDir, "package.json");
        if (await fs.pathExists(packageJsonPath)) {
            try {
                const pkg = await fs.readJson(packageJsonPath);
                if (pkg.eslintConfig)
                    return true;
            }
            catch {
                // ignore parse errors
            }
        }
        // Check flat config (eslint.config.js / eslint.config.mjs / eslint.config.cjs)
        const flatConfigs = [
            "eslint.config.js",
            "eslint.config.mjs",
            "eslint.config.cjs",
        ];
        for (const file of flatConfigs) {
            if (await fs.pathExists(path.join(projectDir, file))) {
                return true;
            }
        }
        // No config found — inject one
        logger.info(`ESLint config not found in ${projectDir}, injecting...`);
        // Detect project ESLint version to choose config format
        const projectEslintVer = await this.getProjectESLintVersion(projectDir);
        const isTypescript = await this.detectTypescript(projectDir);
        if (projectEslintVer.hasESLint && projectEslintVer.major < 9) {
            // ESLint v8 — inject .eslintrc.json, skip npm install (project has its own deps)
            const template = getEslintTemplate(isTypescript);
            await this.injectDotESLintConfig(projectDir, template);
            logger.debug("Project already has ESLint deps, skipping npm install");
        }
        else {
            // ESLint v9+, or no ESLint at all — inject flat config
            // For "no ESLint" projects, we also install latest ESLint + plugins
            await this.injectFlatESLintConfig(projectDir, isTypescript);
            if (!projectEslintVer.hasESLint) {
                await this.ensureESLintPackages(projectDir, isTypescript);
            }
        }
        return true;
    }
    /**
     * Find the project root by climbing directories looking for
     * package.json, .git, or tsconfig.json
     */
    async findProjectRoot(filePath) {
        let dir = path.resolve(path.dirname(filePath));
        const root = path.parse(dir).root;
        for (let i = 0; i < 10; i++) {
            const indicators = ["package.json", ".git", "tsconfig.json"];
            for (const indicator of indicators) {
                if (await fs.pathExists(path.join(dir, indicator))) {
                    return dir;
                }
            }
            const parent = path.dirname(dir);
            if (parent === dir || parent === root)
                break;
            dir = parent;
        }
        return path.resolve(path.dirname(filePath));
    }
    /**
     * Detect if a project uses TypeScript by looking for .ts/.tsx files
     */
    async detectTypescript(projectDir) {
        try {
            const entries = await fs.readdir(projectDir);
            for (const entry of entries) {
                if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
                    return true;
                }
            }
            // Also check src/ subdirectory
            const srcDir = path.join(projectDir, "src");
            if (await fs.pathExists(srcDir)) {
                const srcEntries = await fs.readdir(srcDir);
                for (const entry of srcEntries) {
                    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
                        return true;
                    }
                }
            }
        }
        catch {
            // ignore errors
        }
        return false;
    }
    /**
     * Inject a traditional .eslintrc.json config for ESLint v8 projects.
     */
    async injectDotESLintConfig(projectDir, template) {
        const eslintPath = path.join(projectDir, template.fileName);
        try {
            await fs.ensureDir(projectDir);
            await fs.writeFile(eslintPath, template.content, "utf-8");
            logger.success(`ESLint config injected: ${template.fileName} at ${projectDir}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to inject ESLint config: ${errorMessage}`);
            this.eslintConfigMissing = true;
            throw error;
        }
    }
    /**
     * Inject an ESLint flat config (eslint.config.js) for ESLint 9+ projects.
     * These projects already have ESLint + TS plugins installed; we only
     * provide the config file with our standard rules.
     */
    async injectFlatESLintConfig(projectDir, isTypescript) {
        const configPath = path.join(projectDir, "eslint.config.js");
        const flatConfig = isTypescript
            ? `import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'error',
      'no-console': 'warn',
    },
  },
];
`
            : `export default [
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': 'warn',
      'prefer-const': 'error',
      'no-console': 'warn',
    },
  },
];
`;
        try {
            await fs.ensureDir(projectDir);
            await fs.writeFile(configPath, flatConfig, "utf-8");
            logger.success(`ESLint flat config injected: eslint.config.js at ${projectDir} (${isTypescript ? "TypeScript" : "JavaScript"})`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to inject ESLint flat config: ${errorMessage}`);
            throw error;
        }
    }
    /**
     * Ensure required ESLint packages are installed in the target project.
     * Installs via `npm install --save-dev` in the project directory.
     */
    async ensureESLintPackages(projectDir, isTypescript) {
        // Install latest stable versions (ESLint 10+, flat config)
        const ESLINT_VERSION = "eslint@^10.0.0";
        const TS_ESLINT_VERSION = "@typescript-eslint/eslint-plugin@^8.0.0";
        const TS_PARSER_VERSION = "@typescript-eslint/parser@^8.0.0";
        const requiredPackages = [
            ESLINT_VERSION,
            ...(isTypescript ? [TS_ESLINT_VERSION, TS_PARSER_VERSION] : []),
        ];
        // Only install if the project has a package.json (skip temp/test dirs)
        const packageJsonPath = path.join(projectDir, "package.json");
        if (!(await fs.pathExists(packageJsonPath))) {
            logger.debug("Skipping ESLint package install — no package.json in project");
            return;
        }
        // Check which packages are already installed
        const missingPackages = [];
        for (const pkg of requiredPackages) {
            const pkgName = pkg.replace(/@[^@]+$/, ""); // strip version: "eslint@^8" -> "eslint"
            const pkgPath = path.join(projectDir, "node_modules", pkgName, "package.json");
            if (!(await fs.pathExists(pkgPath))) {
                missingPackages.push(pkg);
            }
        }
        if (missingPackages.length === 0) {
            logger.debug("All ESLint packages already installed in target project");
            return;
        }
        logger.info(`Installing missing ESLint packages in ${projectDir}: ${missingPackages.join(", ")}`);
        try {
            const args = [
                "install",
                "--save-dev",
                "--no-audit",
                "--no-fund",
                ...missingPackages,
            ];
            const { exitCode, stderr } = await safeSpawn("npm", args, {
                cwd: projectDir,
                timeout: 60000,
            });
            if (exitCode === 0) {
                logger.success(`ESLint packages installed in ${projectDir}: ${missingPackages.join(", ")}`);
            }
            else {
                logger.warn(`npm install failed in ${projectDir} (exit ${exitCode}): ${stderr?.substring(0, 300) || ""}`);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn(`Failed to install ESLint packages in ${projectDir}: ${errorMessage}`);
        }
    }
    async getCodeSnippet(filePath, lineNumber) {
        if (!lineNumber)
            return undefined;
        try {
            const content = await fs.readFile(filePath, "utf-8");
            return this.getCodeSnippetFromContent(content, lineNumber);
        }
        catch (error) {
            logger.warn(`Could not read code snippet for ${filePath}:${lineNumber}`);
        }
        return undefined;
    }
    /**
     * Extract code snippet from pre-read content (V5.5 optimization)
     */
    getCodeSnippetFromContent(content, lineNumber) {
        if (!lineNumber || !content)
            return undefined;
        const lines = content.split("\n");
        if (lineNumber <= lines.length) {
            return lines[lineNumber - 1].trim();
        }
        return undefined;
    }
}
/**
 * JSON validator
 */
export class JSONValidator extends BaseValidator {
    constructor(config) {
        super("json", config);
    }
    async validate(filePath) {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        if (!this.isEnabled()) {
            return result;
        }
        try {
            const content = await fs.readFile(filePath, "utf-8");
            // Basic JSON syntax validation
            JSON.parse(content);
            logger.debug(`JSON validation passed for ${filePath}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.isValid = false;
            result.errors.push({
                rule: "json-syntax",
                message: `Invalid JSON: ${errorMessage}`,
                file: filePath,
                severity: "error",
            });
        }
        return result;
    }
}
/**
 * YAML validator (if yaml package is available)
 */
export class YAMLValidator extends BaseValidator {
    constructor(config) {
        super("yaml", config);
    }
    async validate(filePath) {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        if (!this.isEnabled()) {
            return result;
        }
        try {
            // Check if yaml package is available
            const yamlModule = "yaml";
            const yaml = await import(yamlModule).catch(() => null);
            if (!yaml) {
                logger.debug("YAML package not available, skipping YAML validation");
                return result;
            }
            const content = await fs.readFile(filePath, "utf-8");
            yaml.parse(content);
            logger.debug(`YAML validation passed for ${filePath}`);
        }
        catch (error) {
            const errorCode = error instanceof Error && "code" in error
                ? error.code
                : undefined;
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorCode === "MODULE_NOT_FOUND") {
                logger.debug("YAML package not available, skipping YAML validation");
            }
            else {
                result.isValid = false;
                result.errors.push({
                    rule: "yaml-syntax",
                    message: `Invalid YAML: ${errorMessage}`,
                    file: filePath,
                    severity: "error",
                });
            }
        }
        return result;
    }
}
/**
 * Custom pattern validator
 */
export class PatternValidator extends BaseValidator {
    static fileCache = new Map();
    constructor(config) {
        super("pattern", config);
    }
    async validate(filePath) {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        if (!this.isEnabled() || !this.config.customRules) {
            return result;
        }
        try {
            // Cache: re-read only if file changed (by mtime)
            let content;
            const stat = await fs.stat(filePath);
            const mtimeMs = stat.mtimeMs;
            const cached = PatternValidator.fileCache.get(filePath);
            if (cached && cached.mtime === mtimeMs) {
                content = cached.content;
            }
            else {
                content = await fs.readFile(filePath, "utf-8");
                PatternValidator.fileCache.set(filePath, { content, mtime: mtimeMs });
                // Limit cache size
                if (PatternValidator.fileCache.size > 200) {
                    const firstKey = PatternValidator.fileCache.keys().next().value;
                    PatternValidator.fileCache.delete(firstKey);
                }
            }
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const rule of this.config.customRules) {
                    if (rule.pattern.test(line)) {
                        const message = {
                            rule: rule.name,
                            message: rule.message,
                            file: filePath,
                            line: i + 1,
                            column: line.indexOf(line.match(rule.pattern)?.[0] || "") + 1,
                            severity: rule.severity,
                        };
                        if (rule.severity === "error") {
                            result.errors.push(message);
                            result.isValid = false;
                        }
                        else {
                            result.warnings.push(message);
                        }
                    }
                }
            }
            logger.debug(`Pattern validation completed for ${filePath}: ${result.errors.length} errors, ${result.warnings.length} warnings`);
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            logger.error(`Pattern validation failed for ${filePath}:`, error);
            result.errors.push({
                rule: "pattern-error",
                message: `Pattern validation failed: ${error.message}`,
                file: filePath,
                severity: "error",
            });
            result.isValid = false;
        }
        return result;
    }
}
/**
 * Validator registry and factory
 */
export class ValidatorRegistry {
    validators = new Map();
    /**
     * Register a validator
     */
    register(name, validator) {
        this.validators.set(name, validator);
        logger.success(`Validator registered: ${name}`);
    }
    /**
     * Get a validator by name
     */
    get(name) {
        return this.validators.get(name);
    }
    /**
     * Get all registered validators
     */
    getAll() {
        return Array.from(this.validators.values());
    }
    /**
     * Validate a file with all applicable validators
     */
    async validateFile(filePath) {
        const extension = Utils.getFileExtension(filePath);
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        for (const validator of this.validators.values()) {
            if (!validator.isEnabled()) {
                continue;
            }
            // Check if validator applies to this file type
            if (this.shouldValidateFile(validator.getName(), extension)) {
                try {
                    const validatorResult = await validator.validate(filePath);
                    result.errors.push(...validatorResult.errors);
                    result.warnings.push(...validatorResult.warnings);
                    if (!validatorResult.isValid) {
                        result.isValid = false;
                    }
                    result.metadata = {
                        ...result.metadata,
                        [validator.getName()]: {
                            isValid: validatorResult.isValid,
                            errorCount: validatorResult.errors.length,
                            warningCount: validatorResult.warnings.length,
                        },
                    };
                }
                catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    logger.error(`Validator ${validator.getName()} failed for ${filePath}:`, error);
                    result.errors.push({
                        rule: "validator-error",
                        message: `Validator ${validator.getName()} failed: ${error.message}`,
                        file: filePath,
                        severity: "error",
                    });
                    result.isValid = false;
                }
            }
        }
        return result;
    }
    /**
     * Check if a validator should be applied to a file type
     */
    shouldValidateFile(validatorName, extension) {
        const validatorsByExtension = {
            js: ["eslint", "pattern"],
            jsx: ["eslint", "pattern"],
            ts: ["eslint", "pattern"],
            tsx: ["eslint", "pattern"],
            json: ["json"],
            yaml: ["yaml"],
            yml: ["yaml"],
            md: [],
        };
        return validatorsByExtension[extension]?.includes(validatorName) || false;
    }
}
/**
 * Create default validator registry with common validators
 */
export function createValidatorRegistry(options) {
    const registry = new ValidatorRegistry();
    if (options?.skipDefaults) {
        return registry;
    }
    // Register default validators
    registry.register("eslint", new ESLintValidator({
        enabled: true,
        rules: {},
    }));
    registry.register("json", new JSONValidator({
        enabled: true,
        rules: {},
    }));
    registry.register("yaml", new YAMLValidator({
        enabled: true,
        rules: {},
    }));
    registry.register("pattern", new PatternValidator({
        enabled: true,
        rules: {},
        customRules: [
            {
                name: "console-log",
                pattern: /console\.log\(/,
                message: "Avoid console.log in production code",
                severity: "warning",
            },
            {
                name: "todo-comment",
                pattern: /(TODO|FIXME|XXX)/i,
                message: "TODO comment found",
                severity: "warning",
            },
        ],
    }));
    return registry;
}
export default BaseValidator;
//# sourceMappingURL=validators.js.map