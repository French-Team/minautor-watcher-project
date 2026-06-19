import winston from "winston";
import chalk from "chalk";
import path from "path";
// Force chalk to always produce ANSI colors (logger targets console)
chalk.level = 2;
// Define log levels
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    success: 3,
    http: 4,
    debug: 5,
};
// Define colors for file logs (plain text, no ANSI)
const logColors = {
    error: "red",
    warn: "yellow",
    info: "green",
    success: "green",
    http: "magenta",
    debug: "white",
};
winston.addColors(logColors);
// Level color map for console (chalk)
const levelColorMap = {
    error: chalk.red,
    warn: chalk.hex("#FFA500"), // orange
    info: chalk.hex("#D3D3D3"), // gris pale (light gray)
    success: chalk.hex("#ADFF2F"), // vert citron / lime green
    http: chalk.hex("#FFB6C1"), // rose (light pink)
    debug: chalk.white,
};
// Custom console format with chalk-based coloring
const chalkFormat = winston.format((info) => {
    const colorFn = levelColorMap[info.level] || ((s) => s);
    info.level = colorFn(info.level);
    if (typeof info.message === "string") {
        info.message = colorFn(info.message);
    }
    return info;
});
// Create the logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "success",
    levels: logLevels,
    format: winston.format.combine(winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }), winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = "";
        if (Object.keys(meta).length > 0) {
            metaStr = `\n${JSON.stringify(meta, null, 2)}`;
        }
        return `${timestamp} ${level}: ${message}${metaStr}`;
    })),
    defaultMeta: { service: "watcher-service" },
    transports: [
        // Write all logs with importance level of `error` or less to `error.log`
        new winston.transports.File({
            filename: path.join(process.cwd(), "logs", "error.log"),
            level: "error",
        }),
        // Write all logs with importance level of `warn` or less to `warnings.log`
        new winston.transports.File({
            filename: path.join(process.cwd(), "logs", "warnings.log"),
            level: "warn",
        }),
        // Write all logs with importance level of `info` or less to `combined.log`
        new winston.transports.File({
            filename: path.join(process.cwd(), "logs", "combined.log"),
        }),
    ],
});
// If we're not in production then log to the console
if (process.env.NODE_ENV !== "production") {
    const logFormat = process.env.LOG_FORMAT === "json"
        ? winston.format.combine(winston.format.timestamp(), winston.format.json())
        : winston.format.combine(chalkFormat(), winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} ${level}: ${message}`;
        }));
    logger.add(new winston.transports.Console({
        format: logFormat,
    }));
}
export default logger;
// Export additional utility functions
export const createChildLogger = (moduleName) => {
    return logger.child({ module: moduleName });
};
export const logFileOperation = (operation, filePath, details) => {
    logger.info(`File ${operation}: ${filePath}`, details);
};
export const logError = (error, context) => {
    logger.error(`Error${context ? ` in ${context}` : ""}: ${error.message}`, {
        stack: error.stack,
        name: error.name,
    });
};
// Log file paths (must match the transports defined above)
const LOG_FILES = [
    path.join(process.cwd(), "logs", "error.log"),
    path.join(process.cwd(), "logs", "warnings.log"),
    path.join(process.cwd(), "logs", "combined.log"),
    path.join(process.cwd(), "logs", "active-warnings.log"),
];
/**
 * Truncate all log files to start fresh.
 * Call this at startup before any processing begins.
 */
import fs from "fs-extra";
export async function clearLogFiles() {
    const allFiles = [
        ...LOG_FILES,
        path.join(process.cwd(), "logs", "report.log"),
    ];
    for (const filePath of allFiles) {
        try {
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, "", "utf-8");
        }
        catch {
            // ignore — logging infrastructure itself should not throw
        }
    }
}
/**
 * Write a header block at the top of all log files so each run
 * is clearly delimited and easy to analyze.
 */
export async function writeLogHeader(options) {
    const now = new Date().toISOString();
    const lines = [
        "",
        "=".repeat(72),
        `Watcher started: ${now}`,
        options?.targetDir ? `Target: ${options.targetDir}` : null,
        options?.fileCount !== undefined
            ? `Files to process: ${options.fileCount}`
            : null,
        "=".repeat(72),
        "",
    ].filter(Boolean);
    const text = lines.join("\n");
    for (const filePath of LOG_FILES) {
        try {
            await fs.ensureDir(path.dirname(filePath));
            // Prepend header: read existing, write header + existing
            const existing = await fs.readFile(filePath, "utf-8").catch(() => "");
            await fs.writeFile(filePath, text + existing, "utf-8");
        }
        catch {
            // ignore
        }
    }
}
/**
 * Write the final report to `logs/report.log`.
 * Francais, sans emoji, lisible par humain et agent.
 */
export async function writeReport(data) {
    const lines = [];
    const L = (s) => lines.push(s);
    const S = (label, val) => L(`  ${label.padEnd(18)} ${val}`);
    const durationMs = new Date(data.endTime).getTime() - new Date(data.startTime).getTime();
    const dur = durationMs > 60_000
        ? `${(durationMs / 60_000).toFixed(1)} min`
        : `${(durationMs / 1_000).toFixed(0)}s`;
    const p = data.filesProcessed ?? 0;
    const c = data.filesCorrected ?? 0;
    const f = data.filesFailed ?? 0;
    const w = data.warningCount ?? 0;
    const total = data.fileCount ?? p;
    // ── Header ──
    L("");
    L("#".repeat(60));
    L("# RAPPORT WATCHER  -  " + data.endTime);
    L("#".repeat(60));
    L("");
    S("Session", `${data.startTime} -> ${data.endTime}  (${dur})`);
    S("Projet cible", data.targetDir || "N/A");
    S("Port HTTP", `${data.httpPort ?? "desactive"}`);
    L("");
    // ── Traitement ──
    L("  --- TRAITEMENT ---");
    S("Fichiers", `${total} a scanner, ${p} traites, ${c} corriges, ${f} echoues`);
    S("Warnings", `${w} detectes`);
    L("");
    // ── Outils ──
    if (data.validation) {
        const v = data.validation;
        L("  --- OUTILS ---");
        S("ESLint", v.eslint ?? "introuvable");
        S("Prettier", v.prettier ?? "introuvable");
        L("");
    }
    // ── Top warnings ──
    if (data.errorRules && Object.keys(data.errorRules).length > 0) {
        const sorted = Object.entries(data.errorRules).sort((a, b) => b[1] - a[1]);
        L("  --- TOP WARNINGS (non auto-fixable) ---");
        for (const [rule, count] of sorted.slice(0, 10)) {
            L(`  ${rule.padEnd(55)} ${count}`);
        }
        if (sorted.length > 10) {
            L(`  ... + ${sorted.length - 10} autres regles`);
        }
        L("");
    }
    // ── INSTRUCTIONS POUR LES AGENTS ──
    L("#".repeat(60));
    L("# INSTRUCTIONS POUR LES AGENTS");
    L("#".repeat(60));
    L("");
    // Fichiers de logs - explication
    L("  [FICHIERS DE LOGS]");
    L("  logs/combined.log");
    L("    -> Tous les evenements chronologiques (fichiers traites, durees, resultats).");
    L("  logs/warnings.log");
    L("    -> TOUS les warnings detectes, y compris ceux deja auto-corriges.");
    L("  logs/active-warnings.log");
    L("    -> Warnings NON RESOLUS uniquement (ceux qui n'ont pas pu etre auto-fixes).");
    L("    -> C'est la liste de travail prioritaire.");
    L("");
    // Active warnings
    if (data.activeWarningsCount !== undefined && data.activeWarningsCount > 0) {
        L("  [ACTIVE WARNINGS] -> logs/active-warnings.log");
        L(`  ${data.activeWarningsCount} warning(s) sur ${data.warningFileCount ?? "?"} fichier(s) non resolus.`);
        L("  Actions possibles : editer les fichiers, ajouter des commentaires eslint-disable,");
        L("  ou modifier la config ESLint pour assouplir ces regles.");
        if (data.errorRules) {
            const top3 = Object.entries(data.errorRules)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            L("  Priorites :");
            for (const [rule, count] of top3) {
                L(`    - ${rule} (${count} occurrences)`);
            }
        }
        L("");
    }
    else {
        L("  [ACTIVE WARNINGS] -> logs/active-warnings.log");
        L("  Aucun warning actif. Tous les fichiers sont propres.");
        L("");
    }
    // Fix reports
    const fixCount = data.fixReportCount ?? 0;
    if (fixCount > 0) {
        L("  [FIX REPORTS] -> .fix-reports/ (dans le projet cible)");
        L(`  ${fixCount} rapport(s) de correction pour les agents.`);
        L("  Chaque fichier .md liste les warnings non resolus et les instructions de correction.");
        L("");
    }
    else {
        L("  [FIX REPORTS] -> .fix-reports/ (dans le projet cible)");
        L("  Aucun rapport de correction genere.");
        L("");
    }
    // ── CONTEXTE ──
    L("#".repeat(60));
    L("# CONTEXTE");
    L("#".repeat(60));
    L("");
    L("  Le Watcher est un composant actif de la suite Minautor Agents Service.");
    L("  Il surveille les projets cibles, applique les auto-fixes (ESLint, Prettier),");
    L("  et genere des rapports structures pour les agents.");
    L("");
    L("  [CIRCUIT DE TRAITEMENT]");
    L("  Fichier modifie -> auto-fix (ESLint + Prettier) -> SUCCESS / FAILED");
    L("  Si warnings non auto-fixables -> logs/warnings.log + active-warnings.log");
    L("  Si FAILED ou SUCCESS avec warnings -> .fix-reports/ (correction manuelle)");
    L("");
    // Suggestions
    if (data.errorRules && Object.keys(data.errorRules).length > 0) {
        const sorted = Object.entries(data.errorRules).sort((a, b) => b[1] - a[1]);
        L("  [SUGGESTIONS PROCHAINE SESSION]");
        for (const [rule, count] of sorted.slice(0, 3)) {
            const short = rule.replace(/^eslint-validation:/, "");
            L(`  - Reduire "${short}" (${count} occ.) : ${suggestion(short)}`);
        }
        L("");
    }
    L("#".repeat(60));
    L("");
    // ── Write file ──
    const reportPath = path.join(process.cwd(), "logs", "report.log");
    try {
        await fs.ensureDir(path.dirname(reportPath));
        await fs.writeFile(reportPath, lines.join("\n"), "utf-8");
    }
    catch {
        // ignore
    }
}
/** Suggestion concise par regle. */
function suggestion(rule) {
    const map = {
        "no-console": "remplacer par un logger ou autoriser dans la config ESLint",
        "@typescript-eslint/no-unused-vars": "supprimer les declarations mortes ou prefixer avec _",
        "@typescript-eslint/no-explicit-any": "remplacer any par un type precis ou unknown",
        "no-unused-vars": "supprimer les imports/variables inutilises",
    };
    return map[rule] || "a examiner et corriger manuellement";
}
//# sourceMappingURL=logger.js.map