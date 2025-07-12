/**
 * @file PluginManager.js
 * @description Manages vectorization plugin lifecycle and coordination
 * @module core/plugins/PluginManager
 */

import { Logger } from '../../utils/Logger.js';
import { IVectorizationPlugin, PluginEvents } from './IVectorizationPlugin.js';
import { PluginLoader } from './PluginLoader.js';

const logger = new Logger('PluginManager');

/**
 * Plugin Manager - Central coordinator for all vectorization plugins
 */
export class PluginManager {
    constructor(configManager, eventBus) {
        this.configManager = configManager;
        this.eventBus = eventBus;
        this.plugins = new Map(); // id -> plugin instance
        this.activePlugin = null;
        this.loader = new PluginLoader();
        this.initialized = false;
    }

    /**
     * Initialize the plugin manager
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            logger.warn('PluginManager already initialized');
            return;
        }

        try {
            logger.log('Initializing PluginManager...');
            
            // Load built-in plugins
            await this.loadBuiltInPlugins();
            
            // Load external plugins
            await this.loadExternalPlugins();
            
            // Restore active plugin from settings
            const savedActivePlugin = this.configManager.get('active_vectorization_plugin');
            if (savedActivePlugin && this.plugins.has(savedActivePlugin)) {
                await this.setActivePlugin(savedActivePlugin);
            }
            
            this.initialized = true;
            logger.log('PluginManager initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize PluginManager:', error);
            throw error;
        }
    }

    /**
     * Load built-in plugins
     * @private
     * @returns {Promise<void>}
     */
    async loadBuiltInPlugins() {
        const builtInPlugins = [
            'TransformersPlugin',
            'OllamaPlugin',
            'vLLMPlugin',
            'WebLLMPlugin',
            'OpenAIPlugin',
            'CoherePlugin'
        ];

        for (const pluginName of builtInPlugins) {
            try {
                const pluginPath = `/src/plugins/builtin/${pluginName}.js`;
                const plugin = await this.loader.loadPlugin(pluginPath, 'builtin');
                if (plugin) {
                    await this.registerPlugin(plugin);
                }
            } catch (error) {
                logger.error(`Failed to load built-in plugin ${pluginName}:`, error);
            }
        }
    }

    /**
     * Load external plugins from plugins directory
     * @private
     * @returns {Promise<void>}
     */
    async loadExternalPlugins() {
        try {
            const externalPlugins = await this.loader.discoverPlugins('/plugins');
            
            for (const pluginPath of externalPlugins) {
                try {
                    const plugin = await this.loader.loadPlugin(pluginPath, 'external');
                    if (plugin) {
                        await this.registerPlugin(plugin);
                    }
                } catch (error) {
                    logger.error(`Failed to load external plugin from ${pluginPath}:`, error);
                }
            }
        } catch (error) {
            logger.warn('Failed to discover external plugins:', error);
        }
    }

    /**
     * Register a plugin
     * @param {IVectorizationPlugin} plugin - Plugin instance
     * @returns {Promise<boolean>} Success status
     */
    async registerPlugin(plugin) {
        if (!(plugin instanceof IVectorizationPlugin)) {
            logger.error('Invalid plugin: must extend IVectorizationPlugin');
            return false;
        }

        if (this.plugins.has(plugin.id)) {
            logger.warn(`Plugin ${plugin.id} already registered`);
            return false;
        }

        try {
            // Emit before init event
            this.eventBus.emit(PluginEvents.BEFORE_INIT, { plugin: plugin.id });
            
            // Initialize plugin
            const success = await plugin.initialize();
            if (!success) {
                logger.error(`Plugin ${plugin.id} initialization failed`);
                return false;
            }

            // Register plugin
            this.plugins.set(plugin.id, plugin);
            logger.log(`Plugin ${plugin.id} registered successfully`);

            // Emit after init event
            this.eventBus.emit(PluginEvents.AFTER_INIT, { plugin: plugin.id });
            
            return true;

        } catch (error) {
            logger.error(`Failed to register plugin ${plugin.id}:`, error);
            this.eventBus.emit(PluginEvents.ERROR, { 
                plugin: plugin.id, 
                error: error.message 
            });
            return false;
        }
    }

    /**
     * Unregister a plugin
     * @param {string} pluginId - Plugin ID
     * @returns {Promise<boolean>} Success status
     */
    async unregisterPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            logger.warn(`Plugin ${pluginId} not found`);
            return false;
        }

        try {
            // Cleanup plugin resources
            await plugin.cleanup();
            
            // Remove from registry
            this.plugins.delete(pluginId);
            
            // If it was the active plugin, clear it
            if (this.activePlugin?.id === pluginId) {
                this.activePlugin = null;
                this.configManager.set('active_vectorization_plugin', null);
            }
            
            logger.log(`Plugin ${pluginId} unregistered successfully`);
            return true;

        } catch (error) {
            logger.error(`Failed to unregister plugin ${pluginId}:`, error);
            return false;
        }
    }

    /**
     * Set active plugin for vectorization
     * @param {string} pluginId - Plugin ID
     * @returns {Promise<boolean>} Success status
     */
    async setActivePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            logger.error(`Plugin ${pluginId} not found`);
            return false;
        }

        // Check if plugin is available
        const available = await plugin.isAvailable();
        if (!available) {
            logger.error(`Plugin ${pluginId} is not available`);
            return false;
        }

        // Set as active
        this.activePlugin = plugin;
        this.configManager.set('active_vectorization_plugin', pluginId);
        
        // Emit status change event
        this.eventBus.emit(PluginEvents.STATUS_CHANGED, {
            plugin: pluginId,
            status: 'active'
        });
        
        logger.log(`Active plugin set to ${pluginId}`);
        return true;
    }

    /**
     * Get active plugin
     * @returns {IVectorizationPlugin|null} Active plugin or null
     */
    getActivePlugin() {
        return this.activePlugin;
    }

    /**
     * Get all registered plugins
     * @returns {Array<Object>} Array of plugin info
     */
    getAllPlugins() {
        return Array.from(this.plugins.values()).map(plugin => ({
            id: plugin.id,
            metadata: plugin.metadata,
            available: false, // Will be updated asynchronously
            active: plugin.id === this.activePlugin?.id
        }));
    }

    /**
     * Get plugin by ID
     * @param {string} pluginId - Plugin ID
     * @returns {IVectorizationPlugin|null} Plugin instance or null
     */
    getPlugin(pluginId) {
        return this.plugins.get(pluginId) || null;
    }

    /**
     * Update plugin configuration
     * @param {string} pluginId - Plugin ID
     * @param {Object} config - New configuration
     * @returns {boolean} Success status
     */
    updatePluginConfig(pluginId, config) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            logger.error(`Plugin ${pluginId} not found`);
            return false;
        }

        const success = plugin.updateConfig(config);
        
        if (success) {
            // Save to persistent storage
            const allConfigs = this.configManager.get('plugin_configs') || {};
            allConfigs[pluginId] = config;
            this.configManager.set('plugin_configs', allConfigs);
            
            // Emit config updated event
            this.eventBus.emit(PluginEvents.CONFIG_UPDATED, {
                plugin: pluginId,
                config
            });
        }
        
        return success;
    }

    /**
     * Get plugin configuration
     * @param {string} pluginId - Plugin ID
     * @returns {Object|null} Plugin configuration or null
     */
    getPluginConfig(pluginId) {
        const plugin = this.plugins.get(pluginId);
        return plugin ? plugin.config : null;
    }

    /**
     * Vectorize content using active plugin
     * @param {Array<string>} texts - Texts to vectorize
     * @param {Object} options - Vectorization options
     * @returns {Promise<Array<Array<number>>>} Embeddings
     */
    async vectorize(texts, options = {}) {
        if (!this.activePlugin) {
            throw new Error('No active vectorization plugin');
        }

        // Check availability
        const available = await this.activePlugin.isAvailable();
        if (!available) {
            throw new Error(`Active plugin ${this.activePlugin.id} is not available`);
        }

        try {
            // Emit before vectorize event
            this.eventBus.emit(PluginEvents.BEFORE_VECTORIZE, {
                plugin: this.activePlugin.id,
                count: texts.length
            });

            // Perform vectorization
            const embeddings = await this.activePlugin.vectorize(texts, options);

            // Emit after vectorize event
            this.eventBus.emit(PluginEvents.AFTER_VECTORIZE, {
                plugin: this.activePlugin.id,
                count: texts.length,
                success: true
            });

            return embeddings;

        } catch (error) {
            // Emit error event
            this.eventBus.emit(PluginEvents.ERROR, {
                plugin: this.activePlugin.id,
                error: error.message,
                operation: 'vectorize'
            });
            
            throw error;
        }
    }

    /**
     * Get available models for a plugin
     * @param {string} pluginId - Plugin ID (optional, uses active plugin if not provided)
     * @returns {Promise<Array<Object>>} Available models
     */
    async getAvailableModels(pluginId = null) {
        const plugin = pluginId ? this.plugins.get(pluginId) : this.activePlugin;
        
        if (!plugin) {
            logger.error('No plugin specified or active');
            return [];
        }

        try {
            return await plugin.getAvailableModels();
        } catch (error) {
            logger.error(`Failed to get models for plugin ${plugin.id}:`, error);
            return [];
        }
    }

    /**
     * Check plugin availability
     * @param {string} pluginId - Plugin ID
     * @returns {Promise<boolean>} Availability status
     */
    async checkPluginAvailability(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            return false;
        }

        try {
            return await plugin.isAvailable();
        } catch (error) {
            logger.error(`Failed to check availability for plugin ${pluginId}:`, error);
            return false;
        }
    }

    /**
     * Refresh plugin status for all plugins
     * @returns {Promise<Object>} Plugin status map
     */
    async refreshPluginStatus() {
        const status = {};
        
        for (const [id, plugin] of this.plugins) {
            try {
                status[id] = {
                    ...plugin.getStatus(),
                    available: await plugin.isAvailable()
                };
            } catch (error) {
                logger.error(`Failed to get status for plugin ${id}:`, error);
                status[id] = {
                    ...plugin.getStatus(),
                    available: false,
                    error: error.message
                };
            }
        }
        
        return status;
    }

    /**
     * Cleanup all plugins
     * @returns {Promise<void>}
     */
    async cleanup() {
        logger.log('Cleaning up PluginManager...');
        
        for (const [id, plugin] of this.plugins) {
            try {
                await plugin.cleanup();
            } catch (error) {
                logger.error(`Failed to cleanup plugin ${id}:`, error);
            }
        }
        
        this.plugins.clear();
        this.activePlugin = null;
        this.initialized = false;
        
        logger.log('PluginManager cleanup complete');
    }
}