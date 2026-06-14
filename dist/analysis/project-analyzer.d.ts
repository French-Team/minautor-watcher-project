/**
 * ProjectAnalyzer - Analyzes project structure and conventions
 */
import type { ProjectAnalysis } from "./types.js";
/**
 * Analyze a project directory
 */
export declare function analyzeProject(projectDir: string): Promise<ProjectAnalysis>;
/**
 * Format analysis result as human-readable string
 */
export declare function formatAnalysis(analysis: ProjectAnalysis): string;
//# sourceMappingURL=project-analyzer.d.ts.map