import fs from "fs-extra";
import path from "path";

export interface ModifyOptions {
  /** Directory containing the project to modify */
  projectDir: string;
  /** Number of files to modify */
  count: number;
  /** Delay between modifications in ms (0 = all at once) */
  delayMs?: number;
}

export interface ModifyResult {
  modified: number;
  failed: number;
  duration: number;
}

/**
 * Find all .ts files in a directory (recursively)
 */
async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and dist
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...(await findTsFiles(fullPath)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Modify a single file by appending a line
 */
async function modifyFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const timestamp = new Date().toISOString();
    const newLine = `\n// Modified at ${timestamp}\n`;
    await fs.writeFile(filePath, content + newLine, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Modify multiple files in a project
 */
export async function modifyFiles(
  options: ModifyOptions
): Promise<ModifyResult> {
  const { projectDir, count, delayMs = 0 } = options;
  const startTime = Date.now();

  const allFiles = await findTsFiles(projectDir);
  if (allFiles.length === 0) {
    return { modified: 0, failed: 0, duration: 0 };
  }

  // Pick files to modify (cycle if count > available)
  const filesToModify: string[] = [];
  for (let i = 0; i < count; i++) {
    filesToModify.push(allFiles[i % allFiles.length]);
  }

  let modified = 0;
  let failed = 0;

  if (delayMs === 0) {
    // All at once
    const results = await Promise.allSettled(
      filesToModify.map((f) => modifyFile(f))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) modified++;
      else failed++;
    }
  } else {
    // With delay between each
    for (const file of filesToModify) {
      const ok = await modifyFile(file);
      if (ok) modified++;
      else failed++;
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  return {
    modified,
    failed,
    duration: Date.now() - startTime,
  };
}
