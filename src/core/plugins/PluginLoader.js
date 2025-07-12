/**
 * @file PluginLoader.js
 * @description Handles dynamic loading and validation of vectorization plugins
 * @module core/plugins/PluginLoader
 */

import { Logger } from '../../utils/Logger.js';
import { IVectorizationPlugin } from './IVectorizationPlugin.js';

const logger = new Logger('PluginLoader');

/**
 * Plugin Loader - Responsible for discovering and loading plugins
 */
export class PluginLoader {
    constructor() {
        this.loadedModules = new Map(); // path -> module
        this.pluginCache = new Map(); // id -> plugin class
    }

    /**
     * Discover plugins in a directory
     * @param {string} directory - Directory path to scan
     * @returns {Promise<Array<string>>} Array of plugin paths
     */
    async discoverPlugins(directory) {
        try {
            // In a real implementation, this would scan the filesystem
            // For now, we'll return a mock list
            logger.log(`Discovering plugins in ${directory}`);
            
            // This would typically use fs.readdir or similar
            // For browser environment, might need a manifest file
            return [
                // Example external plugin paths
                // '/plugins/example/MockVectorizerPlugin.js'
            ];
            
        } catch (error) {
            logger.error('Failed to discover plugins:', error);
            return [];
        }
    }

    /**
     * Load a plugin from file
     * @param {string} path - Plugin file path
     * @param {string} type - Plugin type ('builtin' or 'external')
     * @returns {Promise<IVectorizationPlugin|null>} Plugin instance or null
     */
    async loadPlugin(path, type = 'external') {
        try {
            logger.log(`Loading ${type} plugin from ${path}`);
            
            // Check if already loaded
            if (this.loadedModules.has(path)) {
                const PluginClass = this.loadedModules.get(path);
                return this.createPluginInstance(PluginClass);
            }

            // Load module dynamically
            const module = await this.loadModule(path, type);
            if (!module) {
                logger.error(`Failed to load module from ${path}`);
                return null;
            }

            // Find the plugin class in the module
            const PluginClass = this.findPluginClass(module);
            if (!PluginClass) {
                logger.error(`No valid plugin class found in ${path}`);
                return null;
            }

            // Validate plugin class
            if (!this.validatePluginClass(PluginClass)) {
                logger.error(`Invalid plugin class in ${path}`);
                return null;
            }

            // Cache the module
            this.loadedModules.set(path, PluginClass);

            // Create and return instance
            return this.createPluginInstance(PluginClass);

        } catch (error) {
            logger.error(`Failed to load plugin from ${path}:`, error);
            return null;
        }
    }

    /**
     * Load module based on environment and type
     * @private
     * @param {string} path - Module path
     * @param {string} type - Plugin type
     * @returns {Promise<Object|null>} Module exports or null
     */
    async loadModule(path, type) {
        try {
            if (type === 'builtin') {
                // For built-in plugins, use relative imports
                const modulePath = `../../plugins/builtin/${path.split('/').pop()}`;
                return await import(modulePath);
            } else {
                // For external plugins, use dynamic import with full path
                // This might need adjustment based on the actual environment
                return await import(path);
            }
        } catch (error) {
            logger.error(`Failed to import module from ${path}:`, error);
            
            // Try alternative loading methods
            if (typeof window !== 'undefined') {
                // Browser environment - try loading as script
                return await this.loadScriptModule(path);
            }
            
            return null;
        }
    }

    /**
     * Load module as script tag (browser fallback)
     * @private
     * @param {string} path - Script path
     * @returns {Promise<Object|null>} Module exports or null
     */
    async loadScriptModule(path) {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = path;
            
            script.onload = () => {
                // The script should register itself globally
                // Check common patterns
                const filename = path.split('/').pop().replace('.js', '');
                if (window[filename]) {
                    resolve({ default: window[filename] });
                } else {
                    logger.warn(`Script loaded but no global export found for ${filename}`);
                    resolve(null);
                }
            };
            
            script.onerror = () => {
                logger.error(`Failed to load script from ${path}`);
                resolve(null);
            };
            
            document.head.appendChild(script);
        });
    }

    /**
     * Find plugin class in module exports
     * @private
     * @param {Object} module - Module exports
     * @returns {Function|null} Plugin class or null
     */
    findPluginClass(module) {
        // Check default export
        if (module.default && this.isPluginClass(module.default)) {
            return module.default;
        }

        // Check named exports
        for (const [name, exported] of Object.entries(module)) {
            if (this.isPluginClass(exported)) {
                return exported;
            }
        }

        return null;
    }

    /**
     * Check if a value is a valid plugin class
     * @private
     * @param {any} value - Value to check
     * @returns {boolean} True if valid plugin class
     */
    isPluginClass(value) {
        if (typeof value !== 'function') {
            return false;
        }

        // Check if it extends IVectorizationPlugin
        try {
            const testInstance = Object.create(value.prototype);
            return testInstance instanceof IVectorizationPlugin;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate plugin class has required methods
     * @private
     * @param {Function} PluginClass - Plugin class to validate
     * @returns {boolean} True if valid
     */
    validatePluginClass(PluginClass) {
        const requiredMethods = [
            'getMetadata',
            'initialize',
            'isAvailable',
            'getAvailableModels',
            'vectorize',
            'getConfigSchema'
        ];

        const prototype = PluginClass.prototype;
        
        for (const method of requiredMethods) {
            if (typeof prototype[method] !== 'function') {
                logger.error(`Plugin class missing required method: ${method}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Create plugin instance with error handling
     * @private
     * @param {Function} PluginClass - Plugin class
     * @returns {IVectorizationPlugin|null} Plugin instance or null
     */
    createPluginInstance(PluginClass) {
        try {
            // Get saved configuration if exists
            const config = this.loadPluginConfig(PluginClass.name);
            
            // Create instance
            const instance = new PluginClass(config);
            
            // Validate metadata
            const metadata = instance.getMetadata();
            if (!this.validateMetadata(metadata)) {
                logger.error('Invalid plugin metadata');
                return null;
            }

            logger.log(`Created plugin instance: ${metadata.name} v${metadata.version}`);
            return instance;

        } catch (error) {
            logger.error('Failed to create plugin instance:', error);
            return null;
        }
    }

    /**
     * Validate plugin metadata
     * @private
     * @param {Object} metadata - Plugin metadata
     * @returns {boolean} True if valid
     */
    validateMetadata(metadata) {
        const required = ['name', 'description', 'version', 'author'];
        
        for (const field of required) {
            if (!metadata[field]) {
                logger.error(`Missing required metadata field: ${field}`);
                return false;
            }
        }

        // Validate version format (semantic versioning)
        if (!/^\d+\.\d+\.\d+/.test(metadata.version)) {
            logger.error(`Invalid version format: ${metadata.version}`);
            return false;
        }

        return true;
    }

    /**
     * Load plugin configuration from storage
     * @private
     * @param {string} pluginId - Plugin ID
     * @returns {Object} Plugin configuration
     */
    loadPluginConfig(pluginId) {
        try {
            // This would typically load from ConfigManager
            // For now, return empty config
            return {};
        } catch (error) {
            logger.error(`Failed to load config for plugin ${pluginId}:`, error);
            return {};
        }
    }

    /**
     * Clear loader caches
     */
    clearCache() {
        this.loadedModules.clear();
        this.pluginCache.clear();
        logger.log('Plugin loader cache cleared');
    }
}