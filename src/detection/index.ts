import { Watcher, WatcherEvent, createWatcher } from './watcher.js';
import { FileFilter, FilterPresets, createFileFilter } from './filters.js';
import { DetectionEventBus, DetectionEvent, eventBus } from './events.js';
import { Utils, ConfigSchemas } from '../shared/utils.js';
import { createChildLogger } from '../shared/logger.js';

const logger = createChildLogger('detection');

/**
 * Configuration for the detection module
 */
export interface DetectionConfig {
  watchDir: string;
  excludedDirs: string[];
  watchExtensions: string[];
  processingDelay: number;
  filterPreset?: 'jsTsProject' | 'minimal' | 'comprehensive';
  customFilters?: any;
}

/**
 * Main detection module that orchestrates file watching, filtering, and event emission
 */
export class DetectionModule {
  private watcher: Watcher;
  private filter: FileFilter;
  eventBus: DetectionEventBus;
  private config: DetectionConfig;
  private isRunning: boolean = false;

  constructor(config: DetectionConfig) {
    this.config = config;
    this.eventBus = eventBus;

    // Create watcher instance
    this.watcher = createWatcher({
      watchDir: config.watchDir,
      excludedDirs: config.excludedDirs,
      watchExtensions: config.watchExtensions,
      processingDelay: config.processingDelay,
    });

    // Create filter instance
    const filterCriteria = config.filterPreset
      ? FilterPresets[config.filterPreset]()
      : config.customFilters || {};

    this.filter = createFileFilter(filterCriteria);

    // Set up internal event handlers
    this.setupEventHandlers();
  }

  /**
   * Start the detection module
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Detection module is already running');
      return;
    }

    try {
      logger.info('Starting detection module...');

      // Start the file watcher
      await this.watcher.start();

      // Set up watcher event forwarding
      this.setupWatcherEventForwarding();

      this.isRunning = true;
      logger.info('Detection module started successfully');

    } catch (error) {
      logger.error('Failed to start detection module:', error);
      throw error;
    }
  }

  /**
   * Stop the detection module
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Detection module is not running');
      return;
    }

    try {
      logger.info('Stopping detection module...');

      // Stop the file watcher
      await this.watcher.stop();

      this.isRunning = false;
      logger.info('Detection module stopped successfully');

    } catch (error) {
      logger.error('Failed to stop detection module:', error);
      throw error;
    }
  }

  /**
   * Update filter criteria
   */
  updateFilter(criteria: any): void {
    this.filter.updateCriteria(criteria);
    logger.info('Filter criteria updated');
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    watcherStatus: any;
    filterCriteria: any;
  } {
    return {
      isRunning: this.isRunning,
      watcherStatus: this.watcher.getStatus(),
      filterCriteria: this.filter.getCriteria(),
    };
  }

  /**
   * Reload configuration
   */
  async reloadConfig(): Promise<void> {
    logger.info('Detection configuration reloaded');
  }

  /**
   * Set up internal event handlers
   */
  private setupEventHandlers(): void {
    // Handle watcher events and forward them
    this.watcher.on(WatcherEvent.FILE_ADDED, (event) => {
      this.handleFileEvent(DetectionEvent.FILE_DETECTED, event, 'watcher');
    });

    this.watcher.on(WatcherEvent.FILE_CHANGED, (event) => {
      this.handleFileEvent(DetectionEvent.FILE_MODIFIED, event, 'watcher');
    });

    this.watcher.on(WatcherEvent.FILE_DELETED, (event) => {
      this.handleFileEvent(DetectionEvent.FILE_DELETED, event, 'watcher');
    });

    this.watcher.on(WatcherEvent.WATCHER_READY, () => {
      logger.info('File watcher is ready');
    });

    this.watcher.on(WatcherEvent.WATCHER_ERROR, (error) => {
      logger.error('Watcher error:', error);
      this.eventBus.emitDetectionError(error, 'watcher');
    });
  }

  /**
   * Set up forwarding of watcher events to detection events
   */
  private setupWatcherEventForwarding(): void {
    // Forward file events through the detection filter
    const forwardEvent = (detectionEvent: DetectionEvent) => {
      return async (event: any) => {
        const filterResult = await this.filter.apply(event);

        if (filterResult.passed) {
          logger.debug(`File passed filter: ${event.filePath}`);
          this.eventBus.emit(detectionEvent, { file: event, filterResult });
        } else {
          logger.debug(`File filtered out: ${event.filePath} - ${filterResult.reason}`);
        }
      };
    };

    // Set up event forwarding
    this.watcher.on(WatcherEvent.FILE_ADDED, forwardEvent(DetectionEvent.FILE_DETECTED));
    this.watcher.on(WatcherEvent.FILE_CHANGED, forwardEvent(DetectionEvent.FILE_MODIFIED));
    this.watcher.on(WatcherEvent.FILE_DELETED, forwardEvent(DetectionEvent.FILE_DELETED));
  }

  /**
   * Handle file events with processing tracking
   */
  private async handleFileEvent(
    eventType: DetectionEvent,
    fileEvent: any,
    source: 'watcher' | 'scan'
  ): Promise<void> {
    try {
      // Apply filters
      const filterResult = await this.filter.apply(fileEvent);

      if (!filterResult.passed) {
        logger.debug(`File filtered out: ${fileEvent.filePath} - ${filterResult.reason}`);
        return;
      }

      // Emit the filtered event
      logger.info(`${eventType}: ${fileEvent.filePath}`);

      switch (eventType) {
        case DetectionEvent.FILE_DETECTED:
          this.eventBus.emitFileDetected(fileEvent, source);
          break;
        case DetectionEvent.FILE_MODIFIED:
          this.eventBus.emitFileModified(fileEvent);
          break;
        case DetectionEvent.FILE_DELETED:
          this.eventBus.emitFileDeleted(fileEvent);
          break;
      }

    } catch (error) {
      logger.error(`Error handling file event ${eventType}:`, error);
      this.eventBus.emitDetectionError(
        error instanceof Error ? error : new Error(String(error)),
        'file_event_handler',
        fileEvent
      );
    }
  }
}

/**
 * Factory function to create a detection module
 */
export function createDetectionModule(config?: Partial<DetectionConfig>): DetectionModule {
  const defaultConfig: DetectionConfig = {
    watchDir: process.env.WATCH_DIR || process.cwd(),
    excludedDirs: (process.env.EXCLUDED_DIRS || 'node_modules,.git,dist,build').split(','),
    watchExtensions: (process.env.WATCH_EXTENSIONS || 'js,ts,jsx,tsx,json,md').split(','),
    processingDelay: parseInt(process.env.PROCESSING_DELAY || '100'),
    filterPreset: 'jsTsProject',
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Validate configuration
  Utils.validateConfig(finalConfig, ConfigSchemas.watcherConfig);

  return new DetectionModule(finalConfig);
}

/**
 * Quick setup function for common use cases
 */
export async function setupDetection(
  config?: Partial<DetectionConfig>
): Promise<DetectionModule> {
  const module = createDetectionModule(config);

  // Set up graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down detection module...');
    await module.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down detection module...');
    await module.stop();
    process.exit(0);
  });

  return module;
}

export default DetectionModule;
