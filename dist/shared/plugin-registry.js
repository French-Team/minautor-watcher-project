import fs from "fs-extra";
import path from "path";
import { createChildLogger } from "./logger.js";
const logger = createChildLogger("plugin-registry");
/**
 * Plugin registry - manages loading, registration, and lifecycle of plugins
 */
export class PluginRegistry {
    plugins = new Map();
    loaded = new Map();
    context;
    constructor(context) {
        this.context = context;
    }
    /**
     * Register a plugin directly (in-process)
     */
    async registerPlugin(plugin) {
        const { name } = plugin.manifest;
        if (this.plugins.has(name)) {
            logger.warn(`Plugin "${name}" is already registered, skipping`);
            return;
        }
        logger.info(`Registering plugin: ${name} v${plugin.manifest.version}`);
        this.plugins.set(name, plugin);
        try {
            await plugin.register(this.context);
            this.loaded.set(name, true);
            logger.success(`Plugin "${name}" registered successfully`);
        }
        catch (error) {
            this.loaded.set(name, false);
            logger.error(`Failed to register plugin "${name}":`, error);
            throw error;
        }
    }
    /**
     * Unregister a plugin
     */
    async unregisterPlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            logger.warn(`Plugin "${name}" is not registered`);
            return;
        }
        if (plugin.unregister) {
            logger.info(`Unregistering plugin: ${name}`);
            await plugin.unregister();
        }
        this.plugins.delete(name);
        this.loaded.delete(name);
        logger.success(`Plugin "${name}" unregistered`);
    }
    /**
     * Load plugins from a directory
     */
    async loadPluginsFromDir(config) {
        const { pluginsDir, enabledPlugins, disabledPlugins } = config;
        if (!(await fs.pathExists(pluginsDir))) {
            logger.debug(`Plugins directory not found: ${pluginsDir}`);
            return;
        }
        const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
        const pluginDirs = entries.filter((e) => e.isDirectory() || e.name.endsWith(".js"));
        for (const entry of pluginDirs) {
            const pluginPath = path.join(pluginsDir, entry.name);
            const pluginName = entry.name.replace(/\.(js|ts)$/, "");
            // Check if plugin is disabled
            if (disabledPlugins?.includes(pluginName)) {
                logger.debug(`Plugin "${pluginName}" is disabled, skipping`);
                continue;
            }
            // Check if specific plugins are enabled
            if (enabledPlugins && !enabledPlugins.includes(pluginName)) {
                continue;
            }
            try {
                await this.loadPluginFromPath(pluginPath, pluginName);
            }
            catch (error) {
                logger.error(`Failed to load plugin "${pluginName}":`, error);
            }
        }
    }
    /**
     * Load a single plugin from a file path
     */
    async loadPluginFromPath(pluginPath, _name) {
        logger.info(`Loading plugin from: ${pluginPath}`);
        const mod = await import(pluginPath);
        // Plugin module should export a default or named plugin
        const plugin = mod.default || mod.plugin || Object.values(mod)[0];
        if (!plugin || typeof plugin.register !== "function") {
            logger.warn(`Module at "${pluginPath}" does not export a valid WatcherPlugin`);
            return;
        }
        await this.registerPlugin(plugin);
    }
    /**
     * Get a registered plugin by name
     */
    getPlugin(name) {
        return this.plugins.get(name);
    }
    /**
     * Check if a plugin is loaded and registered
     */
    isPluginLoaded(name) {
        return this.loaded.get(name) === true;
    }
    /**
     * Get all registered plugin names
     */
    getRegisteredPlugins() {
        return Array.from(this.plugins.keys());
    }
    /**
     * Unregister all plugins
     */
    async unregisterAll() {
        const names = Array.from(this.plugins.keys());
        for (const name of names) {
            await this.unregisterPlugin(name);
        }
    }
}
//# sourceMappingURL=plugin-registry.js.map