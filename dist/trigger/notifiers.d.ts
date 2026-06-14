/**
 * Notification level
 */
export declare enum NotificationLevel {
    INFO = "info",
    WARNING = "warning",
    ERROR = "error",
    SUCCESS = "success"
}
/**
 * Notification channel
 */
export declare enum NotificationChannel {
    SLACK = "slack",
    EMAIL = "email",
    CONSOLE = "console",
    FILE = "file"
}
/**
 * Notification data
 */
export interface NotificationData {
    title: string;
    message: string;
    level: NotificationLevel;
    channel: NotificationChannel;
    metadata?: Record<string, unknown>;
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
export declare abstract class BaseNotifier {
    protected name: string;
    protected enabled: boolean;
    constructor(name: string, enabled?: boolean);
    /**
     * Send a notification
     */
    abstract send(data: NotificationData): Promise<NotificationResult>;
    /**
     * Check if notifier is enabled
     */
    isEnabled(): boolean;
    /**
     * Get notifier name
     */
    getName(): string;
    /**
     * Enable/disable notifier
     */
    setEnabled(enabled: boolean): void;
}
/**
 * Slack notifier
 */
export declare class SlackNotifier extends BaseNotifier {
    private client;
    private defaultChannel;
    constructor(token?: string, channel?: string, enabled?: boolean);
    send(data: NotificationData): Promise<NotificationResult>;
    private getLevelEmoji;
    private getLevelColor;
}
/**
 * Email notifier
 */
export declare class EmailNotifier extends BaseNotifier {
    private transporter;
    private from;
    private to;
    constructor(smtpConfig?: {
        host?: string;
        port?: number;
        secure?: boolean;
        user?: string;
        pass?: string;
    }, from?: string, to?: string, enabled?: boolean);
    send(data: NotificationData): Promise<NotificationResult>;
    private formatHtml;
    private formatText;
    private getLevelColor;
}
/**
 * Console notifier
 */
export declare class ConsoleNotifier extends BaseNotifier {
    constructor(enabled?: boolean);
    send(data: NotificationData): Promise<NotificationResult>;
    private getLevelEmoji;
}
/**
 * File notifier (logs to file)
 */
export declare class FileNotifier extends BaseNotifier {
    private logPath;
    constructor(logPath?: string, enabled?: boolean);
    send(data: NotificationData): Promise<NotificationResult>;
}
/**
 * Notifier registry and manager
 */
export declare class NotifierRegistry {
    private notifiers;
    /**
     * Register a notifier
     */
    register(channel: NotificationChannel, notifier: BaseNotifier): void;
    /**
     * Get a notifier by channel
     */
    get(channel: NotificationChannel): BaseNotifier | undefined;
    /**
     * Get all registered notifiers
     */
    getAll(): BaseNotifier[];
    /**
     * Send notification to a specific channel
     */
    sendToChannel(channel: NotificationChannel, data: NotificationData): Promise<NotificationResult>;
    /**
     * Send notification to multiple channels
     */
    sendToChannels(channels: NotificationChannel[], data: NotificationData): Promise<NotificationResult[]>;
    /**
     * Send notification to all registered channels
     */
    sendToAll(data: NotificationData): Promise<NotificationResult[]>;
}
/**
 * Create default notifier registry with common notifiers
 */
export declare function createNotifierRegistry(options?: {
    skipDefaults?: boolean;
}): NotifierRegistry;
/**
 * Notification utility functions
 */
export declare class NotificationUtils {
    /**
     * Create notification data for file events
     */
    static createFileNotification(title: string, message: string, filePath: string, level?: NotificationLevel, metadata?: Record<string, unknown>): NotificationData;
    /**
     * Create notification data for errors
     */
    static createErrorNotification(title: string, error: Error, filePath?: string, metadata?: Record<string, unknown>): NotificationData;
    /**
     * Create notification data for correction results
     */
    static createCorrectionNotification(title: string, correctedFiles: string[], failedFiles: string[], metadata?: Record<string, unknown>): NotificationData;
}
export default BaseNotifier;
//# sourceMappingURL=notifiers.d.ts.map