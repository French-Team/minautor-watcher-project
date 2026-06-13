import fs from "fs-extra";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("detection-filters");

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
  modifiedWithin?: number; // milliseconds
}

/**
 * Filter result
 */
export interface FilterResult {
  passed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * File filter class for applying various filtering rules to file events
 */
export class FileFilter {
  private criteria: FilterCriteria;

  constructor(criteria: FilterCriteria = {}) {
    this.criteria = criteria;
  }

  /**
   * Apply all filters to a file event
   */
  async apply(event: FileEvent): Promise<FilterResult> {
    // Extension filter
    if (this.criteria.extensions && this.criteria.extensions.length > 0) {
      const extensionFilter = this.filterByExtension(event);
      if (!extensionFilter.passed) {
        return extensionFilter;
      }
    }

    // Pattern filters
    if (
      this.criteria.excludePatterns &&
      this.criteria.excludePatterns.length > 0
    ) {
      const excludeFilter = this.filterByExcludePatterns(event);
      if (!excludeFilter.passed) {
        return excludeFilter;
      }
    }

    if (
      this.criteria.includePatterns &&
      this.criteria.includePatterns.length > 0
    ) {
      const includeFilter = this.filterByIncludePatterns(event);
      if (!includeFilter.passed) {
        return includeFilter;
      }
    }

    // File size filters
    if (this.criteria.maxFileSize || this.criteria.minFileSize) {
      const sizeFilter = await this.filterByFileSize(event);
      if (!sizeFilter.passed) {
        return sizeFilter;
      }
    }

    // Modification time filter
    if (this.criteria.modifiedWithin) {
      const timeFilter = await this.filterByModificationTime(event);
      if (!timeFilter.passed) {
        return timeFilter;
      }
    }

    return { passed: true, metadata: { filters: "all_passed" } };
  }

  /**
   * Filter by file extension
   */
  private filterByExtension(event: FileEvent): FilterResult {
    if (!this.criteria.extensions?.includes(event.extension)) {
      return {
        passed: false,
        reason: `Extension '${
          event.extension
        }' not in allowed list: ${this.criteria.extensions?.join(", ")}`,
      };
    }
    return { passed: true };
  }

  /**
   * Filter by exclude patterns
   */
  private filterByExcludePatterns(event: FileEvent): FilterResult {
    for (const pattern of this.criteria.excludePatterns!) {
      if (this.matchesPattern(event.relativePath, pattern)) {
        return {
          passed: false,
          reason: `Path matches exclude pattern: ${pattern}`,
        };
      }
    }
    return { passed: true };
  }

  /**
   * Filter by include patterns
   */
  private filterByIncludePatterns(event: FileEvent): FilterResult {
    const matchesAnyPattern = this.criteria.includePatterns!.some((pattern) =>
      this.matchesPattern(event.relativePath, pattern)
    );

    if (!matchesAnyPattern) {
      return {
        passed: false,
        reason: `Path doesn't match any include pattern: ${this.criteria.includePatterns?.join(
          ", "
        )}`,
      };
    }
    return { passed: true };
  }

  /**
   * Filter by file size
   */
  private async filterByFileSize(event: FileEvent): Promise<FilterResult> {
    try {
      const stats = await fs.stat(event.filePath);
      const fileSize = stats.size;

      if (this.criteria.maxFileSize && fileSize > this.criteria.maxFileSize) {
        return {
          passed: false,
          reason: `File size ${fileSize} bytes exceeds maximum ${this.criteria.maxFileSize} bytes`,
          metadata: { fileSize },
        };
      }

      if (this.criteria.minFileSize && fileSize < this.criteria.minFileSize) {
        return {
          passed: false,
          reason: `File size ${fileSize} bytes is below minimum ${this.criteria.minFileSize} bytes`,
          metadata: { fileSize },
        };
      }

      return { passed: true, metadata: { fileSize } };
    } catch (error) {
      logger.warn(`Could not get file size for ${event.filePath}:`, error);
      return {
        passed: false,
        reason: "Could not determine file size",
      };
    }
  }

  /**
   * Filter by modification time
   */
  private async filterByModificationTime(
    event: FileEvent
  ): Promise<FilterResult> {
    try {
      const stats = await fs.stat(event.filePath);
      const now = Date.now();
      const modifiedTime = stats.mtime.getTime();
      const timeDiff = now - modifiedTime;

      if (timeDiff > this.criteria.modifiedWithin!) {
        return {
          passed: false,
          reason: `File was modified ${timeDiff}ms ago, exceeds limit of ${this.criteria.modifiedWithin}ms`,
          metadata: { modifiedTime, timeDiff },
        };
      }

      return { passed: true, metadata: { modifiedTime, timeDiff } };
    } catch (error) {
      logger.warn(
        `Could not get modification time for ${event.filePath}:`,
        error
      );
      return {
        passed: false,
        reason: "Could not determine modification time",
      };
    }
  }

  /**
   * Check if a file path matches a pattern
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Simple pattern matching - can be extended for more complex patterns
    if (pattern.includes("*") || pattern.includes("?")) {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      return new RegExp(`^${regexPattern}$`).test(filePath);
    }

    // Exact match
    return filePath.includes(pattern);
  }

  /**
   * Update filter criteria
   */
  updateCriteria(newCriteria: Partial<FilterCriteria>): void {
    this.criteria = { ...this.criteria, ...newCriteria };
    logger.info("Filter criteria updated:", this.criteria);
  }

  /**
   * Get current filter criteria
   */
  getCriteria(): FilterCriteria {
    return { ...this.criteria };
  }
}

/**
 * Predefined filter presets
 */
export const FilterPresets = {
  /**
   * Default filter for TypeScript/JavaScript projects
   */
  jsTsProject: (): FilterCriteria => ({
    extensions: ["js", "ts", "jsx", "tsx", "json", "md"],
    excludePatterns: ["node_modules/**", "dist/**", "build/**", ".git/**"],
    maxFileSize: 1024 * 1024, // 1MB
  }),

  /**
   * Minimal filter for quick scanning
   */
  minimal: (): FilterCriteria => ({
    extensions: ["js", "ts"],
    excludePatterns: ["node_modules/**"],
  }),

  /**
   * Comprehensive filter for full project analysis
   */
  comprehensive: (): FilterCriteria => ({
    extensions: [
      "js",
      "ts",
      "jsx",
      "tsx",
      "json",
      "md",
      "css",
      "scss",
      "html",
      "yaml",
      "yml",
    ],
    excludePatterns: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".git/**",
      "*.log",
    ],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    modifiedWithin: 24 * 60 * 60 * 1000, // Last 24 hours
  }),
};

/**
 * Factory function to create a file filter
 */
export function createFileFilter(criteria?: FilterCriteria): FileFilter {
  return new FileFilter(criteria);
}

export default FileFilter;
