import { type EnvironmentReport } from "./types.js";
/**
 * Generate the full environment report
 */
export declare function generateEnvReport(): Promise<EnvironmentReport>;
/**
 * Print the environment banner to console
 */
export declare function printBanner(report: EnvironmentReport): void;
/**
 * Print compact banner (for start-watcher.bat)
 */
export declare function printCompactBanner(report: EnvironmentReport): void;
/**
 * Get missing tools report as string
 */
export declare function getMissingToolsReport(report: EnvironmentReport): string;
/**
 * Get solutions report as string array
 */
export declare function getSolutionsReport(report: EnvironmentReport): string[];
//# sourceMappingURL=env-reporter.d.ts.map