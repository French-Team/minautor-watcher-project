/**
 * Central type exports for the Watcher Service
 */

// Common types
export type {
  WatcherServiceConfig,
  ServiceMetrics,
  ModuleStatus,
  ServiceStatus,
  MetadataValue,
  Metadata,
  ErrorInfo,
} from "./common.js";

// Trigger types
export type {
  TriggerAction,
  TriggerActionResult,
  LegacyTriggerConfig,
} from "./trigger.js";

// Prevention types
export type {
  CustomValidatorConfig,
  CustomScriptConfig,
  LegacyPreventionConfig,
} from "./prevention.js";

// Plugin types
export type {
  PluginManifest,
  PluginContext,
  WatcherPlugin,
  PluginLoaderConfig,
} from "./plugin.js";
