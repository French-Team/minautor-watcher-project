// Exemple : src/detection/watcher.ts
// Surveillance de fichiers avec Chokidar

import chokidar from "chokidar";
import { EventEmitter } from "events";

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher;

  constructor(private watchDir: string) {
    super();
  }

  start() {
    this.watcher = chokidar.watch(this.watchDir, {
      ignored: /node_modules|watcher-service/, // Exclure le Watcher lui-même
      persistent: true,
    });

    this.watcher.on("add", (path) => this.emit("fileAdded", path));
    this.watcher.on("change", (path) => this.emit("fileChanged", path));
    this.watcher.on("unlink", (path) => this.emit("fileDeleted", path));
  }

  stop() {
    if (this.watcher) this.watcher.close();
  }
}

// Utilisation dans index.ts :
const watcher = new FileWatcher("./project");
watcher.on("fileChanged", (path) => `Fichier changé : ${path}`));
watcher.start();
