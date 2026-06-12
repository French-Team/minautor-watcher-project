import { WebClient } from "@slack/web-api";
import nodemailer from "nodemailer";
import fs from "fs-extra";
import path from "path";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("trigger-notifiers");

/**
 * Notification level
 */
export enum NotificationLevel {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  SUCCESS = "success",
}

/**
 * Notification channel
 */
export enum NotificationChannel {
  SLACK = "slack",
  EMAIL = "email",
  CONSOLE = "console",
  FILE = "file",
}

/**
 * Notification data
 */
export interface NotificationData {
  title: string;
  message: string;
  level: NotificationLevel;
  channel: NotificationChannel;
  metadata?: Record<string, any>;
  file?: string;
  error?: Error;
  timestamp?: Date;
}

/**
 * Notification result
 */
export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: Error;
}

/**
 * Base notifier class
 */
export abstract class BaseNotifier {
  protected name: string;
  protected enabled: boolean;

  constructor(name: string, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
  }

  /**
   * Send a notification
   */
  abstract send(data: NotificationData): Promise<NotificationResult>;

  /**
   * Check if notifier is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get notifier name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Enable/disable notifier
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

/**
 * Slack notifier
 */
export class SlackNotifier extends BaseNotifier {
  private client: WebClient;
  private defaultChannel: string;

  constructor(token?: string, channel?: string, enabled: boolean = true) {
    super("slack", enabled);
    this.client = new WebClient(token || process.env.SLACK_TOKEN);
    this.defaultChannel = channel || process.env.SLACK_CHANNEL || "#general";
  }

  async send(data: NotificationData): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return { success: true, channel: NotificationChannel.SLACK };
    }

    try {
      logger.info(`Sending Slack notification: ${data.title}`);

      const emoji = this.getLevelEmoji(data.level);

      const blocks: any[] = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${emoji} ${data.title}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: data.message,
          },
        },
      ];

      // Add metadata if present
      if (data.metadata || data.file || data.error) {
        const fields: Array<{ type: "mrkdwn"; text: string }> = [];

        if (data.file) {
          fields.push({
            type: "mrkdwn",
            text: `*File:*\n${path.basename(data.file)}`,
          });
        }

        if (data.error) {
          fields.push({
            type: "mrkdwn",
            text: `*Error:*\n${data.error.message}`,
          });
        }

        if (data.metadata) {
          fields.push({
            type: "mrkdwn",
            text: `*Details:*\n${JSON.stringify(data.metadata, null, 2)}`,
          });
        }

        blocks.push({
          type: "section",
          fields,
        });
      }

      // Add timestamp
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Triggered at ${new Date().toISOString()}`,
          },
        ],
      });

      const result = await this.client.chat.postMessage({
        channel: this.defaultChannel,
        blocks,
        text: `${data.title}: ${data.message}`, // Fallback text
      });

      logger.info(`Slack notification sent successfully: ${result.ts}`);

      return {
        success: true,
        channel: NotificationChannel.SLACK,
        messageId: result.ts,
      };
    } catch (error) {
      logger.error("Failed to send Slack notification:", error);
      return {
        success: false,
        channel: NotificationChannel.SLACK,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private getLevelEmoji(level: NotificationLevel): string {
    switch (level) {
      case NotificationLevel.ERROR:
        return "❌";
      case NotificationLevel.WARNING:
        return "⚠️";
      case NotificationLevel.SUCCESS:
        return "✅";
      case NotificationLevel.INFO:
      default:
        return "ℹ️";
    }
  }

  private getLevelColor(level: NotificationLevel): string {
    switch (level) {
      case NotificationLevel.ERROR:
        return "#ff0000";
      case NotificationLevel.WARNING:
        return "#ffa500";
      case NotificationLevel.SUCCESS:
        return "#00ff00";
      case NotificationLevel.INFO:
      default:
        return "#0099ff";
    }
  }
}

/**
 * Email notifier
 */
export class EmailNotifier extends BaseNotifier {
  private transporter: nodemailer.Transporter;
  private from: string;
  private to: string;

  constructor(
    smtpConfig?: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
    },
    from?: string,
    to?: string,
    enabled: boolean = true
  ) {
    super("email", enabled);

    const config = {
      host: smtpConfig?.host || process.env.EMAIL_HOST || "smtp.gmail.com",
      port: smtpConfig?.port || parseInt(process.env.EMAIL_PORT || "587"),
      secure: smtpConfig?.secure || false,
      auth: {
        user: smtpConfig?.user || process.env.EMAIL_USER,
        pass: smtpConfig?.pass || process.env.EMAIL_PASS,
      },
    };

    this.transporter = nodemailer.createTransport(config);
    this.from = from || process.env.EMAIL_FROM || "watcher@localhost";
    this.to = to || process.env.EMAIL_TO || "";
  }

  async send(data: NotificationData): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return { success: true, channel: NotificationChannel.EMAIL };
    }

    try {
      logger.info(`Sending email notification: ${data.title}`);

      const subject = `[${data.level.toUpperCase()}] ${data.title}`;
      const html = this.formatHtml(data);
      const text = this.formatText(data);

      const result = await this.transporter.sendMail({
        from: this.from,
        to: this.to,
        subject,
        text,
        html,
      });

      logger.info(`Email notification sent successfully: ${result.messageId}`);

      return {
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: result.messageId,
      };
    } catch (error) {
      logger.error("Failed to send email notification:", error);
      return {
        success: false,
        channel: NotificationChannel.EMAIL,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private formatHtml(data: NotificationData): string {
    const level = data.level.toUpperCase();
    const fileInfo = data.file
      ? `<p><strong>File:</strong> ${path.basename(data.file)}</p>`
      : "";
    const errorInfo = data.error
      ? `<p><strong>Error:</strong> ${data.error.message}</p>`
      : "";
    const metadataInfo = data.metadata
      ? `<p><strong>Details:</strong><pre>${JSON.stringify(
          data.metadata,
          null,
          2
        )}</pre></p>`
      : "";

    return `
      <html>
        <body>
          <h2 style="color: ${this.getLevelColor(data.level)};">[${level}] ${
      data.title
    }</h2>
          <p>${data.message}</p>
          ${fileInfo}
          ${errorInfo}
          ${metadataInfo}
          <hr>
          <small>Triggered at ${new Date().toISOString()}</small>
        </body>
      </html>
    `;
  }

  private formatText(data: NotificationData): string {
    let text = `[${data.level.toUpperCase()}] ${data.title}\n\n`;
    text += `${data.message}\n\n`;

    if (data.file) {
      text += `File: ${path.basename(data.file)}\n`;
    }

    if (data.error) {
      text += `Error: ${data.error.message}\n`;
    }

    if (data.metadata) {
      text += `Details: ${JSON.stringify(data.metadata, null, 2)}\n`;
    }

    text += `\nTriggered at ${new Date().toISOString()}`;

    return text;
  }

  private getLevelColor(level: NotificationLevel): string {
    switch (level) {
      case NotificationLevel.ERROR:
        return "#ff0000";
      case NotificationLevel.WARNING:
        return "#ffa500";
      case NotificationLevel.SUCCESS:
        return "#00ff00";
      case NotificationLevel.INFO:
      default:
        return "#0099ff";
    }
  }
}

/**
 * Console notifier
 */
export class ConsoleNotifier extends BaseNotifier {
  constructor(enabled: boolean = true) {
    super("console", enabled);
  }

  async send(data: NotificationData): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return { success: true, channel: NotificationChannel.CONSOLE };
    }

    try {
      const emoji = this.getLevelEmoji(data.level);
      const level = data.level.toUpperCase();
      const fileInfo = data.file ? ` | File: ${path.basename(data.file)}` : "";
      const errorInfo = data.error ? ` | Error: ${data.error.message}` : "";

      const message = `${emoji} [${level}] ${data.title}: ${data.message}${fileInfo}${errorInfo}`;

      switch (data.level) {
        case NotificationLevel.ERROR:
          logger.error(message);
          break;
        case NotificationLevel.WARNING:
          logger.warn(message);
          break;
        case NotificationLevel.SUCCESS:
          logger.info(message);
          break;
        case NotificationLevel.INFO:
        default:
          logger.info(message);
          break;
      }

      return {
        success: true,
        channel: NotificationChannel.CONSOLE,
      };
    } catch (error) {
      logger.error("Failed to send console notification:", error);
      return {
        success: false,
        channel: NotificationChannel.CONSOLE,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private getLevelEmoji(level: NotificationLevel): string {
    switch (level) {
      case NotificationLevel.ERROR:
        return "❌";
      case NotificationLevel.WARNING:
        return "⚠️";
      case NotificationLevel.SUCCESS:
        return "✅";
      case NotificationLevel.INFO:
      default:
        return "ℹ️";
    }
  }
}

/**
 * File notifier (logs to file)
 */
export class FileNotifier extends BaseNotifier {
  private logPath: string;

  constructor(logPath?: string, enabled: boolean = true) {
    super("file", enabled);
    this.logPath =
      logPath || path.join(process.cwd(), "logs", "notifications.log");
  }

  async send(data: NotificationData): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return { success: true, channel: NotificationChannel.FILE };
    }

    try {
      await fs.ensureDir(path.dirname(this.logPath));

      const logEntry = {
        timestamp: new Date().toISOString(),
        level: data.level,
        channel: data.channel,
        title: data.title,
        message: data.message,
        file: data.file,
        error: data.error?.message,
        metadata: data.metadata,
      };

      const logLine = JSON.stringify(logEntry) + "\n";
      await fs.appendFile(this.logPath, logLine);

      logger.debug(`Notification logged to file: ${this.logPath}`);

      return {
        success: true,
        channel: NotificationChannel.FILE,
      };
    } catch (error) {
      logger.error("Failed to send file notification:", error);
      return {
        success: false,
        channel: NotificationChannel.FILE,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

/**
 * Notifier registry and manager
 */
export class NotifierRegistry {
  private notifiers: Map<NotificationChannel, BaseNotifier> = new Map();

  /**
   * Register a notifier
   */
  register(channel: NotificationChannel, notifier: BaseNotifier): void {
    this.notifiers.set(channel, notifier);
    logger.info(`Notifier registered for channel: ${channel}`);
  }

  /**
   * Get a notifier by channel
   */
  get(channel: NotificationChannel): BaseNotifier | undefined {
    return this.notifiers.get(channel);
  }

  /**
   * Get all registered notifiers
   */
  getAll(): BaseNotifier[] {
    return Array.from(this.notifiers.values());
  }

  /**
   * Send notification to a specific channel
   */
  async sendToChannel(
    channel: NotificationChannel,
    data: NotificationData
  ): Promise<NotificationResult> {
    const notifier = this.get(channel);
    if (!notifier) {
      return {
        success: false,
        channel,
        error: new Error(`No notifier registered for channel: ${channel}`),
      };
    }

    return await notifier.send(data);
  }

  /**
   * Send notification to multiple channels
   */
  async sendToChannels(
    channels: NotificationChannel[],
    data: NotificationData
  ): Promise<NotificationResult[]> {
    const results = await Promise.allSettled(
      channels.map((channel) => this.sendToChannel(channel, data))
    );

    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          success: false,
          channel: channels[index],
          error: result.reason,
        };
      }
    });
  }

  /**
   * Send notification to all registered channels
   */
  async sendToAll(data: NotificationData): Promise<NotificationResult[]> {
    const channels = Array.from(this.notifiers.keys());
    return this.sendToChannels(channels, data);
  }
}

/**
 * Create default notifier registry with common notifiers
 */
export function createNotifierRegistry(): NotifierRegistry {
  const registry = new NotifierRegistry();

  // Register default notifiers
  registry.register(NotificationChannel.SLACK, new SlackNotifier());
  registry.register(NotificationChannel.EMAIL, new EmailNotifier());
  registry.register(NotificationChannel.CONSOLE, new ConsoleNotifier());
  registry.register(NotificationChannel.FILE, new FileNotifier());

  return registry;
}

/**
 * Notification utility functions
 */
export class NotificationUtils {
  /**
   * Create notification data for file events
   */
  static createFileNotification(
    title: string,
    message: string,
    filePath: string,
    level: NotificationLevel = NotificationLevel.INFO,
    metadata?: Record<string, any>
  ): NotificationData {
    return {
      title,
      message,
      level,
      channel: NotificationChannel.CONSOLE, // Default channel
      file: filePath,
      metadata,
      timestamp: new Date(),
    };
  }

  /**
   * Create notification data for errors
   */
  static createErrorNotification(
    title: string,
    error: Error,
    filePath?: string,
    metadata?: Record<string, any>
  ): NotificationData {
    return {
      title,
      message: error.message,
      level: NotificationLevel.ERROR,
      channel: NotificationChannel.CONSOLE, // Default channel
      file: filePath,
      error,
      metadata,
      timestamp: new Date(),
    };
  }

  /**
   * Create notification data for correction results
   */
  static createCorrectionNotification(
    title: string,
    correctedFiles: string[],
    failedFiles: string[],
    metadata?: Record<string, any>
  ): NotificationData {
    const totalFiles = correctedFiles.length + failedFiles.length;
    const successRate =
      totalFiles > 0
        ? ((correctedFiles.length / totalFiles) * 100).toFixed(1)
        : "0";

    let message = `Processed ${totalFiles} files. `;
    message += `Success rate: ${successRate}%. `;

    if (correctedFiles.length > 0) {
      message += `Corrected: ${correctedFiles.join(", ")}. `;
    }

    if (failedFiles.length > 0) {
      message += `Failed: ${failedFiles.join(", ")}.`;
    }

    return {
      title,
      message,
      level:
        failedFiles.length > 0
          ? NotificationLevel.WARNING
          : NotificationLevel.SUCCESS,
      channel: NotificationChannel.CONSOLE, // Default channel
      metadata: {
        ...metadata,
        correctedFiles,
        failedFiles,
        totalFiles,
        successRate: `${successRate}%`,
      },
      timestamp: new Date(),
    };
  }
}

export default BaseNotifier;
