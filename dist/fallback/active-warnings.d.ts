export interface WarningEntry {
    filePath: string;
    rule: string;
    message: string;
    severity: string;
    firstSeen: string;
}
export declare class ActiveWarningsManager {
    private warnings;
    private filePath;
    private dirty;
    private writeTimer;
    constructor(activeLogPath?: string);
    init(): Promise<void>;
    private load;
    private save;
    private scheduleWrite;
    addWarnings(filePath: string, entries: Omit<WarningEntry, "firstSeen">[]): void;
    resolveWarnings(filePath: string): void;
    getWarnings(filePath: string): WarningEntry[];
    getAllWarnings(): Map<string, WarningEntry[]>;
    totalCount(): number;
    fileCount(): number;
}
//# sourceMappingURL=active-warnings.d.ts.map