import fs from "fs-extra";
import path from "path";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("fallback-reporter");
/**
 * Known error-to-fix mappings for common agent mistakes.
 * Each entry describes the pattern detected, why it fails, and exactly what to do.
 */
const FIX_KNOWLEDGE_BASE = {
    "no-unused-vars": {
        group: "declarations inutilisees",
        pattern: "variable/import/parametre declare mais jamais utilise",
        fixPrompt: "supprimer la declaration; si import -> supprimer la ligne; si parametre obligatoire -> prefixer avec _",
    },
    "no-console": {
        group: "console.log residue",
        pattern: "appels console.XXX encore presents",
        fixPrompt: "remplacer par le logger du projet (logger.info/warn/error); chercher l'import logger existant",
    },
    "prefer-const": {
        group: "let -> const",
        pattern: "variable declaree avec let jamais reassignee",
        fixPrompt: "remplacer let par const si jamais reassigne",
    },
    "no-explicit-any": {
        group: "type any interdit",
        pattern: "types any utilises au lieu de types specifiques",
        fixPrompt: "remplacer any par unknown + narrowing, ou creer une interface si la structure est connue",
    },
    "no-unsafe-member-access": {
        group: "acces membre non securise",
        pattern: "acces propriete sur any/unknown sans narrowing",
        fixPrompt: "verifier le type avant d'acceder (typeof, in, type guard); utiliser Record<string, unknown> si necessaire",
    },
    "no-unsafe-call": {
        group: "appel non securise",
        pattern: "appel de fonction sur valeur typee any",
        fixPrompt: "verifier typeof fn === 'function' avant d'appeler; utiliser fn?.() si optionnel",
    },
    "no-unsafe-assignment": {
        group: "assignation non securisee",
        pattern: "assignation valeur any dans type specific sans verification",
        fixPrompt: "filtrer/valider la structure avec un type guard avant d'assigner",
    },
    "no-undef": {
        group: "variable non definie",
        pattern: "variable utilisee mais ni importee ni declaree",
        fixPrompt: "verifier le nom (typo?); ajouter l'import manquant; si globale, ajouter declare dans .d.ts",
    },
    "TS2304": {
        group: "TypeScript nom introuvable",
        pattern: "variable/classe/fonction referencee inexistante dans le scope",
        fixPrompt: "verifier les imports manquants; si variable d'env, declarer explicitement; corriger le nom si typo",
    },
    "TS2307": {
        group: "TypeScript module introuvable",
        pattern: "import reference un fichier/module inexistant",
        fixPrompt: "verifier le chemin et l'extension; si package npm, verifier package.json; creer le fichier ou corriger le chemin",
    },
    "TS2339": {
        group: "TypeScript propriete inexistante",
        pattern: "acces propriete qui n'existe pas sur le type",
        fixPrompt: "verifier que la propriete existe; si extension dynamique, ajouter declaration .d.ts ou cast temporaire",
    },
    "json-syntax": {
        group: "JSON syntaxe invalide",
        pattern: "erreur de syntaxe JSON (virgule, guillemet, commentaire...)",
        fixPrompt: "supprimer les commentaires et virgules trailing; utiliser guillemets doubles",
    },
    "prettier-formatting": {
        group: "formatage Prettier",
        pattern: "fichier non conforme aux regles Prettier",
        fixPrompt: "executer npx prettier --write <fichier>; verifier .prettierrc",
    },
    "script-failed": {
        group: "echec script prevention",
        pattern: "script personnalise a echoue (timeout, dependance manquante)",
        fixPrompt: "verifier npm install; verifier que les fichiers references existent; le script peut avoir timeout",
    },
    "eslint-error": {
        group: "erreur execution ESLint",
        pattern: "ESLint n'a pas pu s'executer (config manquante, binaire introuvable)",
        fixPrompt: "verifier ESLint dans package.json; verifier le fichier de config (eslint.config.js, .eslintrc)",
    },
    "prevention-error": {
        group: "erreur interne prevention",
        pattern: "exception inattendue dans le pipeline de prevention",
        fixPrompt: "bug probable du watcher-service; verifier les logs; reessayer de sauvegarder le fichier",
    },
};
function extractBaseRule(rule) {
    const base = rule.includes(":")
        ? rule.split(":").pop() || rule
        : rule;
    return base;
}
function findGroupKey(error) {
    const base = extractBaseRule(error.rule);
    if (base in FIX_KNOWLEDGE_BASE)
        return base;
    const normalized = base
        .replace(/^@typescript-eslint\//, "")
        .replace(/^eslint\//, "");
    if (normalized in FIX_KNOWLEDGE_BASE)
        return normalized;
    if (base.startsWith("TS")) {
        const tsCode = base.match(/TS\d+/)?.[0];
        if (tsCode && tsCode in FIX_KNOWLEDGE_BASE)
            return tsCode;
    }
    if (normalized.includes("unused"))
        return "no-unused-vars";
    if (normalized.includes("console"))
        return "no-console";
    if (normalized.includes("prefer-const"))
        return "prefer-const";
    if (normalized.includes("explicit-any") || normalized.includes("no-explicit-any"))
        return "no-explicit-any";
    if (normalized.includes("unsafe-member"))
        return "no-unsafe-member-access";
    if (normalized.includes("unsafe-call"))
        return "no-unsafe-call";
    if (normalized.includes("unsafe-assignment"))
        return "no-unsafe-assignment";
    if (normalized.includes("undef"))
        return "no-undef";
    if (normalized.includes("json") || normalized.includes("syntax"))
        return "json-syntax";
    if (normalized.includes("script"))
        return "script-failed";
    if (normalized.includes("prettier"))
        return "prettier-formatting";
    return "unknown";
}
function groupErrors(errors) {
    const grouped = new Map();
    for (const error of errors) {
        const key = findGroupKey(error);
        if (!grouped.has(key))
            grouped.set(key, []);
        grouped.get(key).push(error);
    }
    const groups = [];
    for (const [key, entries] of grouped) {
        const knowledge = FIX_KNOWLEDGE_BASE[key];
        const baseRule = extractBaseRule(entries[0].rule);
        if (knowledge) {
            groups.push({
                group: knowledge.group,
                count: entries.length,
                entries: entries.map((e) => ({
                    rule: e.rule,
                    message: e.message,
                    line: e.line,
                    column: e.column,
                })),
                pattern: knowledge.pattern,
                fixPrompt: knowledge.fixPrompt,
            });
        }
        else {
            groups.push({
                group: `inconnu: ${baseRule}`,
                count: entries.length,
                entries: entries.map((e) => ({
                    rule: e.rule,
                    message: e.message,
                    line: e.line,
                    column: e.column,
                })),
                pattern: `non reconnu: ${entries[0].message}`,
                fixPrompt: "analyser le message d'erreur et le fichier; chercher comment des erreurs similaires ont ete resolues ailleurs",
            });
        }
    }
    groups.sort((a, b) => b.count - a.count);
    return groups;
}
function generateMarkdownReport(report) {
    const lines = [];
    const relativeFile = path.relative(report.projectDir, report.file);
    lines.push(`# fix-report: ${relativeFile}`);
    lines.push(`ts: ${report.timestamp}`);
    lines.push(`project: ${path.basename(report.projectDir)}`);
    lines.push(`errors: ${report.totalErrors}`);
    lines.push("");
    for (const group of report.instructionGroups) {
        const ruleName = group.entries[0]?.rule || group.group;
        lines.push(`## ${ruleName} (${group.count}x)`);
        lines.push(`fix: ${group.fixPrompt}`);
        for (const entry of group.entries) {
            const loc = entry.line ? `L${entry.line}${entry.column ? `:${entry.column}` : ""}` : "";
            lines.push(`  ${loc ? loc + "  " : "     "}${entry.message}`);
        }
        lines.push("");
    }
    lines.push("## raw");
    lines.push(JSON.stringify(report.rawErrors, null, 2));
    lines.push("");
    return lines.join("\n");
}
export function buildFixReport(filePath, errors, projectDir) {
    const groups = groupErrors(errors);
    const report = {
        file: filePath,
        timestamp: new Date().toISOString(),
        projectDir,
        summary: `${errors.length} erreur(s) de validation dans ${path.relative(projectDir, filePath)}`,
        totalErrors: errors.length,
        prompt: "",
        instructionGroups: groups,
        rawErrors: [...errors],
    };
    return report;
}
async function ensureGitIgnored(projectDir) {
    const gitignorePath = path.join(projectDir, ".gitignore");
    const entry = ".fix-reports/";
    try {
        if (await fs.pathExists(gitignorePath)) {
            const content = await fs.readFile(gitignorePath, "utf-8");
            if (content.includes(entry))
                return;
            await fs.appendFile(gitignorePath, `\n${entry}\n`, "utf-8");
            logger.info(`Added ${entry} to ${path.relative(process.cwd(), gitignorePath)}`);
        }
        else {
            await fs.writeFile(gitignorePath, `${entry}\n`, "utf-8");
            logger.info(`Created ${path.relative(process.cwd(), gitignorePath)} with ${entry}`);
        }
    }
    catch (err) {
        logger.warn(`Could not update .gitignore for ${path.basename(projectDir)}:`, err);
    }
}
export async function writeFixReport(report, outputDir) {
    const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
    const relativeFile = path
        .relative(report.projectDir, report.file)
        .replace(/[\\/]/g, "_")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
    const reportFilename = `fix-${relativeFile}-${dateStr}.md`;
    const targetDir = outputDir || path.join(report.projectDir, ".fix-reports");
    const reportPath = path.join(targetDir, reportFilename);
    await ensureGitIgnored(report.projectDir);
    await fs.ensureDir(targetDir);
    await writeInstructionsIfMissing(targetDir);
    // Remove stale reports for the same source file
    try {
        const pattern = `fix-${relativeFile}-*.md`;
        const existing = await fs.readdir(targetDir);
        for (const file of existing) {
            if (file.startsWith(`fix-${relativeFile}-`) && file.endsWith(".md") && file !== reportFilename) {
                await fs.remove(path.join(targetDir, file));
            }
        }
    }
    catch {
        // directory may not exist yet, ignore
    }
    const markdown = generateMarkdownReport(report);
    await fs.writeFile(reportPath, markdown, "utf-8");
    logger.info(`Fix report written to ${reportPath}`);
    return reportPath;
}
export async function cleanFixReports(projectDir) {
    const targetDir = path.join(projectDir, ".fix-reports");
    try {
        if (await fs.pathExists(targetDir)) {
            await fs.remove(targetDir);
            logger.info(`Cleaned fix reports directory: ${targetDir}`);
        }
    }
    catch (err) {
        logger.warn(`Could not clean fix reports for ${path.basename(projectDir)}:`, err);
    }
}
const INSTRUCTIONS_FILENAME = "INSTRUCTIONS.md";
function generateInstructionsContent() {
    return [
        "# .fix-reports/ - Instructions pour les agents",
        "",
        "Ce dossier contient des rapports de correction pour les fichiers qui",
        "n'ont pas pu etre entierement auto-corriges par le watcher.",
        "",
        "---",
        "## Format d'un rapport fix-*.md",
        "---",
        "",
        "Chaque fichier suit ce format lisible par machine et par humain :",
        "",
        "```",
        "# fix-report: src/App.tsx",
        "ts: 2026-06-19T06:51:58.899Z",
        "project: creator-projet",
        "errors: 7",
        "",
        "## eslint-validation:no-console (2x)",
        "fix: remplacer par le logger du projet",
        "  L42:12  Unexpected console.log",
        "  L88:5   Unexpected console.warn",
        "",
        "## raw",
        "[{...}]",
        "```",
        "",
        "---",
        "## Champs",
        "---",
        "",
        "| Champ | Description |",
        "|-------|-------------|",
        "| `# fix-report:` | chemin du fichier a corriger (relatif au projet) |",
        "| `ts:` | timestamp ISO de generation du rapport |",
        "| `project:` | nom du projet cible |",
        "| `errors:` | nombre total d'erreurs/warnings non resolus |",
        "| `## <rule> (Nx)` | regle ESLint/TS et nombre d'occurrences |",
        "| `fix:` | instruction de correction concise |",
        "| `Ln:m` | ligne et colonne dans le fichier source |",
        "| `## raw` | tableau JSON brut des erreurs |",
        "",
        "---",
        "## Instruction de travail",
        "---",
        "",
        "1. Lire un fichier fix-*.md",
        "2. Pour chaque groupe ## <rule> (Nx) :",
        "   a. Appliquer l'instruction fix: sur chaque occurrence listee",
        "   b. Ne modifier QUE les lignes concernees",
        "3. Apres chaque fichier corrige :",
        "   a. Verifier que le code compile (npx tsc --noEmit)",
        "   b. Verifier que les tests passent (npm test)",
        "   c. Verifier que le watcher ne remonte plus de warnings sur ce fichier",
        "4. Si une correction est bloquee :",
        "   a. Ajouter un commentaire eslint-disable specifique pour la regle",
        "   b. Ne JAMAIS desactiver toutes les regles avec /* eslint-disable */",
        "",
        "---",
        "## Regles strictes",
        "---",
        "",
        "- Ne JAMAIS laisser de console.log en production (utiliser le logger)",
        "- Ne JAMAIS utiliser le type any (preferer unknown ou un type specifique)",
        "- Ne JAMAIS laisser de variable/import inutilise (supprimer ou prefixer avec _)",
        "- Ne JAMAIS reformater tout le fichier (ne toucher QUE les lignes necessaires)",
        "- Apres chaque correction, verifier que le projet compile et les tests passent",
        "",
        "---",
        "## Fichiers connexes",
        "---",
        "",
        "- logs/active-warnings.log : warnings non resolus (liste de travail prioritaire)",
        "- logs/warnings.log : tous les warnings detectes (y compris deja corriges)",
        "- logs/report.log : rapport de session du watcher",
        "",
    ].join("\n");
}
/**
 * Write INSTRUCTIONS.md inside .fix-reports/ if it doesn't exist yet.
 */
async function writeInstructionsIfMissing(targetDir) {
    const filePath = path.join(targetDir, INSTRUCTIONS_FILENAME);
    try {
        await fs.access(filePath);
    }
    catch {
        await fs.writeFile(filePath, generateInstructionsContent(), "utf-8");
        logger.info(`Agent instructions written to ${filePath}`);
    }
}
//# sourceMappingURL=error-reporter.js.map