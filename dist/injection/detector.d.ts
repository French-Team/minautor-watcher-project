/**
 * InjectionDetector - Checks which consignment files exist in a project
 */
import { type InjectionCheckResult, type InjectionCheckOptions } from "./types.js";
/**
 * Check the injection status of a project
 */
export declare function checkInjectionStatus(options: InjectionCheckOptions): Promise<InjectionCheckResult>;
/**
 * Get a human-readable summary of the injection check
 */
export declare function formatCheckResult(result: InjectionCheckResult): string;
//# sourceMappingURL=detector.d.ts.map