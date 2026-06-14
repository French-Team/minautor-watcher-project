/**
 * InjectionEngine - Creates/updates consignment files in projects
 */
import { type InjectionResult, type InjectionApplyOptions } from "./types.js";
/**
 * Inject files into a project based on missing/outdated status
 */
export declare function injectFiles(options: InjectionApplyOptions): Promise<InjectionResult[]>;
/**
 * Format injection results
 */
export declare function formatInjectionResults(results: InjectionResult[]): string;
//# sourceMappingURL=injector.d.ts.map