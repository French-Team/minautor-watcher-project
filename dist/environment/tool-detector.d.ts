import { type ToolInfo, type ToolName } from "./types.js";
/**
 * Detect a single tool
 */
export declare function detectTool(name: ToolName): Promise<ToolInfo>;
/**
 * Detect all configured tools
 */
export declare function detectTools(): Promise<ToolInfo[]>;
/**
 * Get all missing tools
 */
export declare function getMissingTools(): Promise<ToolInfo[]>;
/**
 * Get install suggestions for missing tools
 */
export declare function getInstallSuggestions(): Promise<string[]>;
/**
 * Check if a specific tool is available
 */
export declare function isToolAvailable(name: ToolName): Promise<boolean>;
/**
 * Clear the tool cache (for testing or re-detection)
 */
export declare function clearToolCache(): void;
//# sourceMappingURL=tool-detector.d.ts.map