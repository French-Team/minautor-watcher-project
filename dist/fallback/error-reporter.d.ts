export interface PreventionError {
    rule: string;
    message: string;
    severity: "error" | "warning" | "info";
    line?: number;
    column?: number;
}
export interface FixInstructionGroup {
    group: string;
    count: number;
    entries: Array<{
        rule: string;
        message: string;
        line?: number;
        column?: number;
    }>;
    pattern: string;
    fixPrompt: string;
}
export interface AgentFixReport {
    file: string;
    timestamp: string;
    projectDir: string;
    summary: string;
    totalErrors: number;
    prompt: string;
    instructionGroups: FixInstructionGroup[];
    rawErrors: PreventionError[];
}
export declare function buildFixReport(filePath: string, errors: PreventionError[], projectDir: string): AgentFixReport;
export declare function writeFixReport(report: AgentFixReport, outputDir?: string): Promise<string>;
export declare function cleanFixReports(projectDir: string): Promise<void>;
//# sourceMappingURL=error-reporter.d.ts.map