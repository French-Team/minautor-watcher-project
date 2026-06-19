/**
 * Injection system types
 * Defines interfaces for the consignment file injection system (V3.1)
 */
export type AgentType = "claude" | "copilot" | "cursor" | "windsurf" | "aider" | "generic" | "eslint";
/**
 * A consignment template for a specific agent
 */
export interface ConsignmentTemplate {
    id: string;
    agent: AgentType;
    fileName: string;
    version: string;
    description: string;
    content: string;
}
/**
 * Result of checking injection status in a project
 */
export interface InjectionCheckResult {
    projectDir: string;
    agents: AgentStatus[];
    missingCount: number;
    outdatedCount: number;
}
/**
 * Status of a single agent's consignment file
 */
export interface AgentStatus {
    agent: AgentType;
    fileName: string;
    present: boolean;
    outdated: boolean;
    managedByWatcher: boolean;
    currentVersion?: string;
    templateVersion?: string;
    filePath: string;
}
/**
 * Action taken during injection
 */
export type InjectionAction = "created" | "updated" | "skipped" | "error";
/**
 * Result of injecting a single file
 */
export interface InjectionResult {
    file: string;
    agent: AgentType;
    action: InjectionAction;
    reason?: string;
}
/**
 * Configuration for the injection system
 */
export interface InjectionConfig {
    enabled: boolean;
    templates: AgentType[];
    autoInject: boolean;
    autoUpdate: boolean;
    customTemplates?: string;
    forceOverwrite: boolean;
    projectPatterns: string[];
}
/**
 * Options for checking injection status
 */
export interface InjectionCheckOptions {
    projectDir: string;
    agents?: AgentType[];
    config?: InjectionConfig;
}
/**
 * Options for injecting files
 */
export interface InjectionApplyOptions extends InjectionCheckOptions {
    force?: boolean;
    dryRun?: boolean;
}
//# sourceMappingURL=types.d.ts.map