/**
 * File event data structure
 */
export interface FileEvent {
    filePath: string;
    relativePath: string;
    extension: string;
    timestamp: Date;
}
/**
 * Filter criteria for file events
 */
export interface FilterCriteria {
    extensions?: string[];
    excludePatterns?: string[];
    includePatterns?: string[];
    maxFileSize?: number;
    minFileSize?: number;
    modifiedWithin?: number;
}
/**
 * Filter result
 */
export interface FilterResult {
    passed: boolean;
    reason?: string;
    metadata?: Record<string, any>;
}
/**
 * File filter class for applying various filtering rules to file events
 */
export declare class FileFilter {
    private criteria;
    constructor(criteria?: FilterCriteria);
    /**
     * Apply all filters to a file event
     */
    apply(event: FileEvent): Promise<FilterResult>;
    /**
     * Filter by file extension
     */
    private filterByExtension;
    /**
     * Filter by exclude patterns
     */
    private filterByExcludePatterns;
    /**
     * Filter by include patterns
     */
    private filterByIncludePatterns;
    /**
     * Filter by file size
     */
    private filterByFileSize;
    /**
     * Filter by modification time
     */
    private filterByModificationTime;
    /**
     * Check if a file path matches a pattern
     */
    private matchesPattern;
    /**
     * Update filter criteria
     */
    updateCriteria(newCriteria: Partial<FilterCriteria>): void;
    /**
     * Get current filter criteria
     */
    getCriteria(): FilterCriteria;
}
/**
 * Predefined filter presets
 */
export declare const FilterPresets: {
    /**
     * Default filter for TypeScript/JavaScript projects
     */
    jsTsProject: () => FilterCriteria;
    /**
     * Minimal filter for quick scanning
     */
    minimal: () => FilterCriteria;
    /**
     * Comprehensive filter for full project analysis
     */
    comprehensive: () => FilterCriteria;
};
/**
 * Factory function to create a file filter
 */
export declare function createFileFilter(criteria?: FilterCriteria): FileFilter;
export default FileFilter;
//# sourceMappingURL=filters.d.ts.map