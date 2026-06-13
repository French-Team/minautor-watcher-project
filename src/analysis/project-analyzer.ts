/**
 * ProjectAnalyzer - Analyzes project structure and conventions
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  ProjectAnalysis,
  ProjectLanguage,
  PackageManager,
  TestFramework,
  ProjectArchitecture,
  CodeConventions,
} from "./types.js";

/**
 * Check if a file or directory exists
 */
async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file safely, returning null on error
 */
async function readSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Detect language from package.json and file extensions
 */
async function detectLanguage(projectDir: string): Promise<ProjectLanguage> {
  const pkg = await readSafe(path.join(projectDir, "package.json"));
  if (!pkg) return "unknown";

  const hasTsDep = pkg.includes('"typescript"') || pkg.includes('"ts-node"');
  const hasJsOnly =
    !hasTsDep && pkg.includes('"@babel/plugin-transform-typescript"') === false;

  if (hasTsDep) {
    // Check if there are .js files alongside .ts
    const hasJsFiles = await hasFilesWithExtension(projectDir, ".js");
    const hasTsFiles = await hasFilesWithExtension(projectDir, ".ts");
    if (hasJsFiles && hasTsFiles) return "mixed";
    return "typescript";
  }

  if (hasJsOnly) return "javascript";

  // Fallback: check file extensions
  const hasTs = await hasFilesWithExtension(projectDir, ".ts");
  const hasJs = await hasFilesWithExtension(projectDir, ".js");
  if (hasTs && hasJs) return "mixed";
  if (hasTs) return "typescript";
  if (hasJs) return "javascript";

  return "unknown";
}

/**
 * Check if files with a given extension exist in the project
 */
async function hasFilesWithExtension(
  dir: string,
  ext: string
): Promise<boolean> {
  const excludeDirs = ["node_modules", ".git", "dist", "build"];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !excludeDirs.includes(entry.name)) {
        const sub = await hasFilesWithExtension(
          path.join(dir, entry.name),
          ext
        );
        if (sub) return true;
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        return true;
      }
    }
  } catch {
    // skip
  }
  return false;
}

/**
 * Detect package manager
 */
async function detectPackageManager(
  projectDir: string
): Promise<PackageManager> {
  if (await exists(path.join(projectDir, "yarn.lock"))) return "yarn";
  if (await exists(path.join(projectDir, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(path.join(projectDir, "package-lock.json"))) return "npm";
  if (await exists(path.join(projectDir, "package.json"))) return "npm";
  return "unknown";
}

/**
 * Detect test framework
 */
async function detectTestFramework(
  projectDir: string
): Promise<TestFramework | undefined> {
  const pkg = await readSafe(path.join(projectDir, "package.json"));
  if (!pkg) return undefined;

  if (pkg.includes('"vitest"')) return "vitest";
  if (pkg.includes('"jest"')) return "jest";
  if (pkg.includes('"mocha"')) return "mocha";

  return undefined;
}

/**
 * Detect project architecture
 */
async function detectArchitecture(
  projectDir: string
): Promise<ProjectArchitecture | undefined> {
  // Monorepo indicators
  if (await exists(path.join(projectDir, "lerna.json"))) return "monorepo";
  if (await exists(path.join(projectDir, "pnpm-workspace.yaml")))
    return "monorepo";

  const pkg = await readSafe(path.join(projectDir, "package.json"));
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg);
      if (parsed.workspaces) return "monorepo";
    } catch {
      // ignore
    }
  }

  // Library indicator: check for "main" or "exports" in package.json
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg);
      if (parsed.main || parsed.exports) {
        // If no "src" directory, likely a library
        if (!(await exists(path.join(projectDir, "src")))) return "library";
      }
    } catch {
      // ignore
    }
  }

  return "single";
}

/**
 * Detect code conventions from existing files
 */
async function detectConventions(projectDir: string): Promise<CodeConventions> {
  const conventions: CodeConventions = {
    indentStyle: "spaces",
    indentSize: 2,
    lineEnding: "lf",
    semicolons: true,
    quotes: "double",
  };

  // Check .editorconfig
  const editorConfig = await readSafe(path.join(projectDir, ".editorconfig"));
  if (editorConfig) {
    if (editorConfig.includes("indent_style = tab")) {
      conventions.indentStyle = "tabs";
    }
    const indentSizeMatch = editorConfig.match(/indent_size\s*=\s*(\d+)/);
    if (indentSizeMatch) {
      conventions.indentSize = parseInt(indentSizeMatch[1], 10);
    }
    if (editorConfig.includes("end_of_line = crlf")) {
      conventions.lineEnding = "crlf";
    }
  }

  // Check .prettierrc
  const prettierConfig = await readSafe(path.join(projectDir, ".prettierrc"));
  if (prettierConfig) {
    try {
      const parsed = JSON.parse(prettierConfig);
      if (parsed.semi === false) conventions.semicolons = false;
      if (parsed.singleQuote) conventions.quotes = "single";
      if (parsed.tabWidth) conventions.indentSize = parsed.tabWidth;
      if (parsed.useTabs) conventions.indentStyle = "tabs";
    } catch {
      // ignore
    }
  }

  // Check tsconfig
  const tsconfig = await readSafe(path.join(projectDir, "tsconfig.json"));
  if (tsconfig) {
    try {
      const parsed = JSON.parse(tsconfig);
      const compilerOptions = parsed.compilerOptions || {};
      if (compilerOptions.indentSize) {
        conventions.indentSize = compilerOptions.indentSize;
      }
    } catch {
      // ignore
    }
  }

  return conventions;
}

/**
 * Analyze a project directory
 */
export async function analyzeProject(
  projectDir: string
): Promise<ProjectAnalysis> {
  const dirName = path.basename(projectDir);

  const [
    language,
    packageManager,
    testFramework,
    architecture,
    conventions,
    hasTypeScript,
    hasESLint,
    hasPrettier,
    hasTests,
    hasConsignmentFiles,
    srcDir,
    testDir,
    configDir,
    packageJsonExists,
    tsconfigExists,
  ] = await Promise.all([
    detectLanguage(projectDir),
    detectPackageManager(projectDir),
    detectTestFramework(projectDir),
    detectArchitecture(projectDir),
    detectConventions(projectDir),
    exists(path.join(projectDir, "tsconfig.json")),
    exists(path.join(projectDir, ".eslintrc.cjs")).then(
      (v) =>
        v ||
        exists(path.join(projectDir, ".eslintrc.js")).then(
          (v2) =>
            v2 ||
            exists(path.join(projectDir, ".eslintrc.json")).then((v3) => v3)
        )
    ),
    exists(path.join(projectDir, ".prettierrc")).then(
      (v) =>
        v ||
        exists(path.join(projectDir, ".prettierrc.json")).then(
          (v2) =>
            v2 ||
            exists(path.join(projectDir, ".prettierrc.js")).then((v3) => v3)
        )
    ),
    exists(path.join(projectDir, "tests")).then(
      (v) =>
        v ||
        exists(path.join(projectDir, "test")).then(
          (v2) =>
            v2 || exists(path.join(projectDir, "__tests__")).then((v3) => v3)
        )
    ),
    detectConsignmentFiles(projectDir),
    exists(path.join(projectDir, "src")),
    exists(path.join(projectDir, "tests")).then(
      (v) => v || exists(path.join(projectDir, "test"))
    ),
    exists(path.join(projectDir, "config")),
    exists(path.join(projectDir, "package.json")),
    exists(path.join(projectDir, "tsconfig.json")),
  ]);

  // Detect framework
  let framework: string | undefined;
  const pkg = await readSafe(path.join(projectDir, "package.json"));
  if (pkg) {
    if (pkg.includes('"react"')) framework = "react";
    else if (pkg.includes('"vue"')) framework = "vue";
    else if (pkg.includes('"angular"')) framework = "angular";
    else if (pkg.includes('"svelte"')) framework = "svelte";
    else if (pkg.includes('"express"')) framework = "express";
    else if (pkg.includes('"fastify"')) framework = "fastify";
    else if (pkg.includes('"next"')) framework = "next";
    else if (pkg.includes('"nuxt"')) framework = "nuxt";
  }

  return {
    name: dirName,
    language,
    framework,
    packageManager,
    hasTypeScript,
    hasESLint,
    hasPrettier,
    hasTests,
    testFramework,
    architecture,
    conventions,
    hasConsignmentFiles: hasConsignmentFiles.length > 0,
    consignmentFiles: hasConsignmentFiles,
    srcDir,
    testDir,
    configDir,
    packageJsonExists,
    tsconfigExists,
  };
}

/**
 * Detect which consignment files exist in the project
 */
async function detectConsignmentFiles(projectDir: string): Promise<string[]> {
  const files = [
    "CLAUDE.md",
    "AGENTS.md",
    ".cursorrules",
    ".github/copilot-instructions.md",
    ".windsurfrules",
  ];

  const found: string[] = [];
  for (const file of files) {
    if (await exists(path.join(projectDir, file))) {
      found.push(file);
    }
  }
  return found;
}

/**
 * Format analysis result as human-readable string
 */
export function formatAnalysis(analysis: ProjectAnalysis): string {
  const lines: string[] = [
    `Project: ${analysis.name}`,
    `Language: ${analysis.language}`,
    `Package Manager: ${analysis.packageManager}`,
    `TypeScript: ${analysis.hasTypeScript ? "yes" : "no"}`,
    `ESLint: ${analysis.hasESLint ? "yes" : "no"}`,
    `Prettier: ${analysis.hasPrettier ? "yes" : "no"}`,
    `Tests: ${analysis.hasTests ? "yes" : "no"}${
      analysis.testFramework ? ` (${analysis.testFramework})` : ""
    }`,
    `Architecture: ${analysis.architecture || "unknown"}`,
    `Framework: ${analysis.framework || "none detected"}`,
    `Consignment files: ${
      analysis.consignmentFiles.length > 0
        ? analysis.consignmentFiles.join(", ")
        : "none"
    }`,
    `Conventions: ${analysis.conventions.indentSize}${
      analysis.conventions.indentStyle === "tabs" ? "tab" : "spaces"
    }, ${analysis.conventions.quotes} quotes, ${
      analysis.conventions.semicolons ? "" : "no "
    }semicolons`,
  ];

  return lines.join("\n");
}
