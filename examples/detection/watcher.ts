// Exemple : src/detection/watcher.ts
// Surveillance de fichiers avec fs.watch natif

import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";

export class FileWatcher extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private watchDir: string) {
    super();
  }

  start() {
    this.watcher = fs.watch(
      this.watchDir,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;

        // Debounce 300ms
        const existing = this.timers.get(filename);
        if (existing) clearTimeout(existing);

        this.timers.set(
          filename,
          setTimeout(() => {
            this.timers.delete(filename);
            if (eventType === "rename") {
              const fullPath = path.join(this.watchDir, filename);
              if (fs.existsSync(fullPath)) {
                this.emit("fileAdded", fullPath);
              } else {
                this.emit("fileDeleted", fullPath);
              }
            } else {
              this.emit("fileChanged", path.join(this.watchDir, filename));
            }
          }, 300)
        );
      }
    );
  }

  stop() {
    this.watcher?.close();
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }
}

// Utilisation dans index.ts :
const watcher = new FileWatcher("./project");
watcher.on("fileChanged", (path) => `Fichier change : ${path}`));
watcher.start();
