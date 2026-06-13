import type { ValidatorRegistry } from "../prevention/validators.js";
import type { CorrectorRegistry } from "../trigger/correctors.js";
import type { NotifierRegistry } from "../trigger/notifiers.js";

/**
 * Plugin manifest - describes what a plugin provides
 */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  dependencies?: string[];
}

/**
 * Context passed to plugin during registration
 */
export interface PluginContext {
  validatorRegistry?: ValidatorRegistry;
  correctorRegistry?: CorrectorRegistry;
  notifierRegistry?: NotifierRegistry;
  config: Record<string, unknown>;
}

/**
 * Watcher plugin interface - all plugins must implement this
 */
export interface WatcherPlugin {
  manifest: PluginManifest;
  register(context: PluginContext): void | Promise<void>;
  unregister?(): void | Promise<void>;
}

/**
 * Plugin loader configuration
 */
export interface PluginLoaderConfig {
  pluginsDir: string;
  enabledPlugins?: string[];
  disabledPlugins?: string[];
}
