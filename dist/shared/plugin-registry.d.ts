import type { WatcherPlugin, PluginContext, PluginLoaderConfig } from "../types/plugin.js";
/**
 * Plugin registry - manages loading, registration, and lifecycle of plugins
 */
export declare class PluginRegistry {
    private plugins;
    private loaded;
    private context;
    constructor(context: PluginContext);
    /**
     * Register a plugin directly (in-process)
     */
    registerPlugin(plugin: WatcherPlugin): Promise<void>;
    /**
     * Unregister a plugin
     */
    unregisterPlugin(name: string): Promise<void>;
    /**
     * Load plugins from a directory
     */
    loadPluginsFromDir(config: PluginLoaderConfig): Promise<void>;
    /**
     * Load a single plugin from a file path
     */
    private loadPluginFromPath;
    /**
     * Get a registered plugin by name
     */
    getPlugin(name: string): WatcherPlugin | undefined;
    /**
     * Check if a plugin is loaded and registered
     */
    isPluginLoaded(name: string): boolean;
    /**
     * Get all registered plugin names
     */
    getRegisteredPlugins(): string[];
    /**
     * Unregister all plugins
     */
    unregisterAll(): Promise<void>;
}
//# sourceMappingURL=plugin-registry.d.ts.map