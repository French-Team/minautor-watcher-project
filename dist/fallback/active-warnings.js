import fs from "fs-extra";
import path from "path";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("active-warnings");
const LIGHT_BLUE = "\x1b[38;5;117m";
const RESET = "\x1b[0m";
export class ActiveWarningsManager {
    warnings = new Map();
    filePath;
    dirty = false;
    writeTimer = null;
    constructor(activeLogPath) {
        this.filePath =
            activeLogPath || path.join(process.cwd(), "logs", "active-warnings.log");
    }
    async init() {
        await fs.ensureDir(path.dirname(this.filePath));
        this.warnings.clear();
        await this.save();
        logger.info(`Active warnings reset: starting fresh`);
    }
    async load() {
        try {
            if (await fs.pathExists(this.filePath)) {
                const raw = await fs.readFile(this.filePath, "utf-8");
                const parsed = JSON.parse(raw);
                for (const [file, entries] of Object.entries(parsed)) {
                    if (entries.length > 0) {
                        this.warnings.set(file, entries);
                    }
                }
            }
        }
        catch {
            this.warnings.clear();
        }
    }
    async save() {
        try {
            const obj = {};
            for (const [file, entries] of this.warnings) {
                if (entries.length > 0) {
                    obj[file] = entries;
                }
            }
            await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2), "utf-8");
        }
        catch (err) {
            logger.error("Failed to save active warnings:", err);
        }
    }
    scheduleWrite() {
        this.dirty = true;
        if (this.writeTimer)
            return;
        this.writeTimer = setTimeout(async () => {
            this.writeTimer = null;
            if (this.dirty) {
                this.dirty = false;
                await this.save();
            }
        }, 500);
    }
    addWarnings(filePath, entries) {
        const seen = new Set();
        const unique = entries.filter((e) => {
            if (seen.has(e.rule))
                return false;
            seen.add(e.rule);
            return true;
        });
        if (unique.length === 0)
            return;
        const existing = this.warnings.get(filePath);
        if (existing) {
            const existingRules = new Set(existing.map((e) => e.rule));
            const newOnes = unique.filter((e) => !existingRules.has(e.rule));
            if (newOnes.length > 0) {
                existing.push(...newOnes.map((e) => ({ ...e, firstSeen: new Date().toISOString() })));
                logger.warn(`${LIGHT_BLUE}+ ${newOnes.length} new warning(s) for ${path.basename(filePath)}${RESET}`);
                this.scheduleWrite();
            }
        }
        else {
            this.warnings.set(filePath, unique.map((e) => ({ ...e, firstSeen: new Date().toISOString() })));
            logger.warn(`${LIGHT_BLUE}+ ${unique.length} warning(s) for ${path.basename(filePath)}${RESET}`);
            this.scheduleWrite();
        }
    }
    resolveWarnings(filePath) {
        const removed = this.warnings.delete(filePath);
        if (removed) {
            logger.info(`${LIGHT_BLUE}− Resolved warnings for ${path.basename(filePath)}${RESET}`);
            this.scheduleWrite();
        }
    }
    getWarnings(filePath) {
        return this.warnings.get(filePath) || [];
    }
    getAllWarnings() {
        return new Map(this.warnings);
    }
    totalCount() {
        let count = 0;
        for (const entries of this.warnings.values()) {
            count += entries.length;
        }
        return count;
    }
    fileCount() {
        return this.warnings.size;
    }
}
//# sourceMappingURL=active-warnings.js.map