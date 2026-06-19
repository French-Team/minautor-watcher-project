import fs from "fs-extra";
import path from "path";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("active-warnings");

export interface WarningEntry {
  filePath: string;
  rule: string;
  message: string;
  severity: string;
  firstSeen: string;
}

const LIGHT_BLUE = "\x1b[38;5;117m";
const RESET = "\x1b[0m";

export class ActiveWarningsManager {
  private warnings = new Map<string, WarningEntry[]>();
  private filePath: string;
  private dirty = false;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(activeLogPath?: string) {
    this.filePath =
      activeLogPath || path.join(process.cwd(), "logs", "active-warnings.log");
  }

  async init(): Promise<void> {
    await fs.ensureDir(path.dirname(this.filePath));
    this.warnings.clear();
    await this.save();
    logger.info(`Active warnings reset: starting fresh`);
  }

  private async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.filePath)) {
        const raw = await fs.readFile(this.filePath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, WarningEntry[]>;
        for (const [file, entries] of Object.entries(parsed)) {
          if (entries.length > 0) {
            this.warnings.set(file, entries);
          }
        }
      }
    } catch {
      this.warnings.clear();
    }
  }

  private async save(): Promise<void> {
    try {
      const obj: Record<string, WarningEntry[]> = {};
      for (const [file, entries] of this.warnings) {
        if (entries.length > 0) {
          obj[file] = entries;
        }
      }
      await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2), "utf-8");
    } catch (err) {
      logger.error("Failed to save active warnings:", err);
    }
  }

  private scheduleWrite(): void {
    this.dirty = true;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(async () => {
      this.writeTimer = null;
      if (this.dirty) {
        this.dirty = false;
        await this.save();
      }
    }, 500);
  }

  addWarnings(filePath: string, entries: Omit<WarningEntry, "firstSeen">[]): void {
    const seen = new Set<string>();
    const unique = entries.filter((e) => {
      if (seen.has(e.rule)) return false;
      seen.add(e.rule);
      return true;
    });
    if (unique.length === 0) return;

    const existing = this.warnings.get(filePath);
    if (existing) {
      const existingRules = new Set(existing.map((e) => e.rule));
      const newOnes = unique.filter((e) => !existingRules.has(e.rule));
      if (newOnes.length > 0) {
        existing.push(...newOnes.map((e) => ({ ...e, firstSeen: new Date().toISOString() })));
        logger.warn(`${LIGHT_BLUE}+ ${newOnes.length} new warning(s) for ${path.basename(filePath)}${RESET}`);
        this.scheduleWrite();
      }
    } else {
      this.warnings.set(
        filePath,
        unique.map((e) => ({ ...e, firstSeen: new Date().toISOString() }))
      );
      logger.warn(`${LIGHT_BLUE}+ ${unique.length} warning(s) for ${path.basename(filePath)}${RESET}`);
      this.scheduleWrite();
    }
  }

  resolveWarnings(filePath: string): void {
    const removed = this.warnings.delete(filePath);
    if (removed) {
      logger.info(`${LIGHT_BLUE}− Resolved warnings for ${path.basename(filePath)}${RESET}`);
      this.scheduleWrite();
    }
  }

  getWarnings(filePath: string): WarningEntry[] {
    return this.warnings.get(filePath) || [];
  }

  getAllWarnings(): Map<string, WarningEntry[]> {
    return new Map(this.warnings);
  }

  totalCount(): number {
    let count = 0;
    for (const entries of this.warnings.values()) {
      count += entries.length;
    }
    return count;
  }

  fileCount(): number {
    return this.warnings.size;
  }
}
