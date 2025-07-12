/**
 * @file IVectorizationPlugin.js
 * @description Plugin interface definition for vectorization sources
 * @module core/plugins/IVectorizationPlugin
 */

import { Logger } from '../../utils/Logger.js';

const logger = new Logger('IVectorizationPlugin');

/**
 * Interface for vectorization plugins
 * All vectorization plugins must implement this interface
 * @interface IVectorizationPlugin
 */
export class IVectorizationPlugin {
    /**
     * Constructor
     * @param {string} id - Unique plugin identifier
     * @param {Object} config - Plugin configuration
     */
    constructor(id, config = {}) {
        if (new.target === IVectorizationPlugin) {
            throw new Error('IVectorizationPlugin is an interface and cannot be instantiated directly');
        }
        
        this.id = id;
        this.config = config;
        this.metadata = this.getMetadata();
        this.initialized = false;
    }

    /**
     * Get plugin metadata
     * @abstract
     * @returns {Object} Plugin metadata
     * @returns {string} metadata.name - Display name
     * @returns {string} metadata.description - Plugin description
     * @returns {string} metadata.version - Plugin version
     * @returns {string} metadata.author - Plugin author
     * @returns {Array<string>} metadata.tags - Plugin tags for categorization
     * @returns {Object} metadata.capabilities - Plugin capabilities
     */
    getMetadata() {
        throw new Error('getMetadata() must be implemented by plugin');
    }

    /**
     * Initialize the plugin
     * @abstract
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        throw new Error('initialize() must be implemented by plugin');
    }

    /**
     * Check if plugin is available (models loaded, API accessible, etc.)
     * @abstract
     * @returns {Promise<boolean>} Availability status
     */
    async isAvailable() {
        throw new Error('isAvailable() must be implemented by plugin');
    }

    /**
     * Get available models for this plugin
     * @abstract
     * @returns {Promise<Array<Object>>} Array of model configurations
     */
    async getAvailableModels() {
        throw new Error('getAvailableModels() must be implemented by plugin');
    }

    /**
     * Vectorize content using this plugin
     * @abstract
     * @param {Array<string>} texts - Array of texts to vectorize
     * @param {Object} options - Vectorization options
     * @param {string} options.model - Model to use
     * @param {AbortSignal} options.signal - Abort signal for cancellation
     * @param {Function} options.onProgress - Progress callback
     * @returns {Promise<Array<Array<number>>>} Array of embeddings
     */
    async vectorize(texts, options = {}) {
        throw new Error('vectorize() must be implemented by plugin');
    }

    /**
     * Get plugin configuration schema
     * @abstract
     * @returns {Object} Configuration schema in JSON Schema format
     */
    getConfigSchema() {
        throw new Error('getConfigSchema() must be implemented by plugin');
    }

    /**
     * Validate plugin configuration
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result
     * @returns {boolean} result.valid - Whether configuration is valid
     * @returns {Array<string>} result.errors - Validation errors
     */
    validateConfig(config) {
        const schema = this.getConfigSchema();
        const errors = [];
        
        // Basic validation implementation
        // Plugins can override for more complex validation
        for (const [key, value] of Object.entries(schema.properties || {})) {
            if (value.required && !(key in config)) {
                errors.push(`Missing required field: ${key}`);
            }
            
            if (key in config) {
                const configValue = config[key];
                
                // Type validation
                if (value.type && typeof configValue !== value.type) {
                    errors.push(`Invalid type for ${key}: expected ${value.type}, got ${typeof configValue}`);
                }
                
                // Enum validation
                if (value.enum && !value.enum.includes(configValue)) {
                    errors.push(`Invalid value for ${key}: must be one of ${value.enum.join(', ')}`);
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Update plugin configuration
     * @param {Object} newConfig - New configuration
     * @returns {boolean} Success status
     */
    updateConfig(newConfig) {
        const validation = this.validateConfig(newConfig);
        if (!validation.valid) {
            logger.error(`Invalid configuration for plugin ${this.id}:`, validation.errors);
            return false;
        }
        
        this.config = { ...this.config, ...newConfig };
        logger.log(`Configuration updated for plugin ${this.id}`);
        return true;
    }

    /**
     * Get plugin status
     * @returns {Object} Plugin status
     */
    getStatus() {
        return {
            id: this.id,
            initialized: this.initialized,
            metadata: this.metadata,
            config: this.config
        };
    }

    /**
     * Cleanup plugin resources
     * @abstract
     * @returns {Promise<void>}
     */
    async cleanup() {
        // Default implementation - plugins can override
        this.initialized = false;
        logger.log(`Plugin ${this.id} cleaned up`);
    }

    /**
     * Handle batch processing with automatic chunking
     * @protected
     * @param {Array<string>} texts - Texts to process
     * @param {Object} options - Processing options
     * @param {number} options.batchSize - Batch size (default: 10)
     * @param {Function} processBatch - Function to process a batch
     * @returns {Promise<Array>} Processed results
     */
    async processBatches(texts, options, processBatch) {
        const batchSize = options.batchSize || 10;
        const results = [];
        
        for (let i = 0; i < texts.length; i += batchSize) {
            if (options.signal?.aborted) {
                throw new Error('Processing aborted');
            }
            
            const batch = texts.slice(i, i + batchSize);
            const batchResults = await processBatch(batch, i / batchSize);
            results.push(...batchResults);
            
            if (options.onProgress) {
                options.onProgress({
                    current: Math.min(i + batchSize, texts.length),
                    total: texts.length,
                    percentage: Math.min(100, ((i + batchSize) / texts.length) * 100)
                });
            }
        }
        
        return results;
    }
}

/**
 * Plugin capability flags
 * @enum {string}
 */
export const PluginCapabilities = {
    BATCH_PROCESSING: 'batch_processing',
    STREAMING: 'streaming',
    LOCAL_MODELS: 'local_models',
    REMOTE_MODELS: 'remote_models',
    CUSTOM_MODELS: 'custom_models',
    GPU_ACCELERATION: 'gpu_acceleration',
    QUANTIZATION: 'quantization',
    CACHING: 'caching'
};

/**
 * Plugin lifecycle events
 * @enum {string}
 */
export const PluginEvents = {
    BEFORE_INIT: 'plugin:before_init',
    AFTER_INIT: 'plugin:after_init',
    BEFORE_VECTORIZE: 'plugin:before_vectorize',
    AFTER_VECTORIZE: 'plugin:after_vectorize',
    ERROR: 'plugin:error',
    CONFIG_UPDATED: 'plugin:config_updated',
    STATUS_CHANGED: 'plugin:status_changed'
};