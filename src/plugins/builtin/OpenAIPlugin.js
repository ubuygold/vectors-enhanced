/**
 * @file OpenAIPlugin.js
 * @description OpenAI vectorization plugin
 * @module plugins/builtin/OpenAIPlugin
 */

import { IVectorizationPlugin, PluginCapabilities } from '../../core/plugins/IVectorizationPlugin.js';
import { Logger } from '../../utils/Logger.js';

const logger = new Logger('OpenAIPlugin');

/**
 * OpenAI vectorization plugin
 * Provides embedding generation using OpenAI API
 */
export class OpenAIPlugin extends IVectorizationPlugin {
    constructor(config = {}) {
        const defaultConfig = {
            model: 'text-embedding-3-small',
            batchSize: 100,  // OpenAI supports large batches
            dimensions: null,  // Optional dimension reduction
            timeout: 30000,
            ...config
        };
        
        super('openai', defaultConfig);
    }

    /**
     * Get plugin metadata
     */
    getMetadata() {
        return {
            name: 'OpenAI',
            description: 'Cloud-based embedding generation using OpenAI API',
            version: '1.0.0',
            author: 'Vectors Enhanced',
            tags: ['cloud', 'openai', 'embeddings', 'api'],
            capabilities: {
                [PluginCapabilities.BATCH_PROCESSING]: true,
                [PluginCapabilities.REMOTE_MODELS]: true,
                [PluginCapabilities.STREAMING]: false
            }
        };
    }

    /**
     * Initialize the plugin
     */
    async initialize() {
        try {
            logger.log('Initializing OpenAI plugin...');
            
            this.initialized = true;
            logger.log('OpenAI plugin initialized successfully');
            return true;
            
        } catch (error) {
            logger.error('Failed to initialize OpenAI plugin:', error);
            return false;
        }
    }

    /**
     * Check if plugin is available
     */
    async isAvailable() {
        try {
            // Check if the backend proxy is available
            const proxyResponse = await fetch('/api/vector/embed', {
                method: 'HEAD'
            });
            
            if (!proxyResponse.ok) {
                return false;
            }
            
            // Check if API key is configured
            return !!this.getApiKey();
            
        } catch (error) {
            logger.warn('OpenAI service not available:', error.message);
            return false;
        }
    }

    /**
     * Get API key from config or settings
     * @private
     */
    getApiKey() {
        // Priority: plugin config > extension settings
        return this.config.apiKey || this.config.settings?.openai_api_key;
    }

    /**
     * Get available models
     */
    async getAvailableModels() {
        return [
            {
                id: 'text-embedding-3-small',
                name: 'text-embedding-3-small',
                description: 'Most capable embedding model, lower cost',
                dimensions: 1536,
                maxTokens: 8191,
                pricing: '$0.00002/1K tokens'
            },
            {
                id: 'text-embedding-3-large',
                name: 'text-embedding-3-large',
                description: 'Most capable embedding model, higher dimensions',
                dimensions: 3072,
                maxTokens: 8191,
                pricing: '$0.00013/1K tokens'
            },
            {
                id: 'text-embedding-ada-002',
                name: 'text-embedding-ada-002',
                description: 'Previous generation embedding model',
                dimensions: 1536,
                maxTokens: 8191,
                pricing: '$0.00010/1K tokens'
            }
        ];
    }

    /**
     * Vectorize texts
     */
    async vectorize(texts, options = {}) {
        if (!this.initialized) {
            throw new Error('Plugin not initialized');
        }

        const model = options.model || this.config.model;
        const batchSize = options.batchSize || this.config.batchSize;
        
        logger.log(`Vectorizing ${texts.length} texts with OpenAI model ${model}`);

        try {
            // Use the processBatches helper for efficient batch processing
            const embeddings = await this.processBatches(
                texts,
                { ...options, batchSize },
                async (batch) => await this.vectorizeBatch(batch, model, options)
            );

            return embeddings;

        } catch (error) {
            logger.error('OpenAI vectorization failed:', error);
            throw error;
        }
    }

    /**
     * Vectorize a batch of texts
     * @private
     */
    async vectorizeBatch(texts, model, options) {
        const items = texts.map((text, index) => ({
            text: text,
            index: index
        }));

        const requestBody = {
            source: 'openai',
            model: model,
            items: items,
            openai_config: {
                api_key: this.getApiKey(),
                dimensions: this.config.dimensions,
                encoding_format: 'float'
            }
        };

        // Add any additional headers if needed
        const headers = {
            'Content-Type': 'application/json'
        };

        // Use the injected getRequestHeaders if available
        if (this.config.getRequestHeaders) {
            Object.assign(headers, this.config.getRequestHeaders());
        }

        const response = await fetch('/api/vector/embed', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            signal: options.signal
        });

        if (!response.ok) {
            const error = await response.text();
            
            // Parse OpenAI error if possible
            try {
                const errorData = JSON.parse(error);
                if (errorData.error) {
                    throw new Error(`OpenAI API error: ${errorData.error.message || errorData.error}`);
                }
            } catch (e) {
                // Not JSON, use raw error
            }
            
            throw new Error(`OpenAI vectorization failed: ${error || response.statusText}`);
        }

        const result = await response.json();
        
        // Extract embeddings from result
        const embeddings = new Array(texts.length);
        for (const item of result) {
            embeddings[item.index] = item.embedding;
        }

        return embeddings;
    }

    /**
     * Get configuration schema
     */
    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                apiKey: {
                    type: 'string',
                    description: 'OpenAI API key',
                    format: 'password'
                },
                model: {
                    type: 'string',
                    enum: [
                        'text-embedding-3-small',
                        'text-embedding-3-large',
                        'text-embedding-ada-002'
                    ],
                    default: 'text-embedding-3-small',
                    description: 'OpenAI embedding model to use'
                },
                dimensions: {
                    type: 'number',
                    minimum: 1,
                    maximum: 3072,
                    description: 'Output dimension (only for embedding-3 models)'
                },
                batchSize: {
                    type: 'number',
                    minimum: 1,
                    maximum: 2048,
                    default: 100,
                    description: 'Number of texts to process in each batch'
                },
                timeout: {
                    type: 'number',
                    minimum: 5000,
                    maximum: 300000,
                    default: 30000,
                    description: 'Request timeout in milliseconds'
                },
                organization: {
                    type: 'string',
                    description: 'OpenAI organization ID (optional)'
                },
                baseUrl: {
                    type: 'string',
                    format: 'uri',
                    description: 'Custom API base URL (for proxies)'
                }
            },
            required: ['apiKey']
        };
    }

    /**
     * Validate configuration
     */
    validateConfig(config) {
        const result = super.validateConfig(config);
        
        // Additional validation for dimensions
        if (config.dimensions) {
            const model = config.model || this.config.model;
            if (model === 'text-embedding-ada-002') {
                result.errors.push('Dimensions parameter is not supported for ada-002 model');
                result.valid = false;
            }
        }
        
        return result;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        await super.cleanup();
    }
}

// Export as default for easier importing
export default OpenAIPlugin;