// Exemple d'implementation complete du Watcher
// Ce fichier illustre une integration basique des secteurs pour une execution directe.
// Utilisez-le comme base pour votre implementation.

import * as fs from "fs";
import * as path from "path";
import { ESLint } from "eslint";
import { EventEmitter } from "events";
import * as dotenv from "dotenv";
import * as winston from "winston";

// Charger les variables d'environnement
dotenv.config();

// Logger avec Winston
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "watcher.log" }),
  ],
});

// Secteur Detection
class DetectionSector extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;

  constructor(private watchDir: string) {
    super();
  }

  start() {
    this.watcher = fs.watch(
      this.watchDir,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(this.watchDir, filename);

        if (eventType === "change" && fs.existsSync(fullPath)) {
          logger.info(`Fichier change : ${fullPath}`);
          this.emit("fileChanged", fullPath);
        }
      }
    );
  }

  stop() {
    this.watcher?.close();
  }
}
