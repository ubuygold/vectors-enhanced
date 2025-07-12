/**
 * @file CoherePlugin.js
 * @description Cohere vectorization plugin
 * @module plugins/builtin/CoherePlugin
 */

import { IVectorizationPlugin, PluginCapabilities } from '../../core/plugins/IVectorizationPlugin.js';
import { Logger } from '../../utils/Logger.js';

const logger = new Logger('CoherePlugin');

/**
 * Cohere vectorization plugin
 * Provides embedding generation using Cohere API
 */
export class CoherePlugin extends IVectorizationPlugin {
    constructor(config = {}) {
        const defaultConfig = {
            model: 'embed-english-v3.0',
            batchSize: 96,  // Cohere's max batch size
            inputType: 'search_document',
            embeddingTypes: ['float'],
            timeout: 30000,
            ...config
        };
        
        super('cohere', defaultConfig);
    }

    /**
     * Get plugin metadata
     */
    getMetadata() {
        return {
            name: 'Cohere',
            description: 'Cloud-based embedding generation using Cohere API',
            version: '1.0.0',
            author: 'Vectors Enhanced',
            tags: ['cloud', 'cohere', 'embeddings', 'api', 'multilingual'],
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
            logger.log('Initializing Cohere plugin...');
            
            this.initialized = true;
            logger.log('Cohere plugin initialized successfully');
            return true;
            
        } catch (error) {
            logger.error('Failed to initialize Cohere plugin:', error);
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
            logger.warn('Cohere service not available:', error.message);
            return false;
        }
    }

    /**
     * Get API key from config or settings
     * @private
     */
    getApiKey() {
        // Priority: plugin config > extension settings
        return this.config.apiKey || this.config.settings?.cohere_api_key;
    }

    /**
     * Get available models
     */
    async getAvailableModels() {
        return [
            {
                id: 'embed-english-v3.0',
                name: 'embed-english-v3.0',
                description: 'English embedding model with 1024 dimensions',
                dimensions: 1024,
                languages: ['en'],
                maxTokens: 512,
                pricing: '$0.10/1M tokens'
            },
            {
                id: 'embed-multilingual-v3.0',
                name: 'embed-multilingual-v3.0',
                description: 'Multilingual model supporting 100+ languages',
                dimensions: 1024,
                languages: ['multilingual'],
                maxTokens: 512,
                pricing: '$0.10/1M tokens'
            },
            {
                id: 'embed-english-light-v3.0',
                name: 'embed-english-light-v3.0',
                description: 'Lightweight English model with 384 dimensions',
                dimensions: 384,
                languages: ['en'],
                maxTokens: 512,
                pricing: '$0.02/1M tokens'
            },
            {
                id: 'embed-multilingual-light-v3.0',
                name: 'embed-multilingual-light-v3.0',
                description: 'Lightweight multilingual model with 384 dimensions',
                dimensions: 384,
                languages: ['multilingual'],
                maxTokens: 512,
                pricing: '$0.02/1M tokens'
            },
            {
                id: 'embed-english-v2.0',
                name: 'embed-english-v2.0',
                description: 'Legacy English model (4096 dimensions)',
                dimensions: 4096,
                languages: ['en'],
                maxTokens: 512,
                pricing: '$0.10/1M tokens',
                deprecated: true
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
        const batchSize = Math.min(options.batchSize || this.config.batchSize, 96); // Cohere max
        
        logger.log(`Vectorizing ${texts.length} texts with Cohere model ${model}`);

        try {
            // Use the processBatches helper for efficient batch processing
            const embeddings = await this.processBatches(
                texts,
                { ...options, batchSize },
                async (batch) => await this.vectorizeBatch(batch, model, options)
            );

            return embeddings;

        } catch (error) {
            logger.error('Cohere vectorization failed:', error);
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
            source: 'cohere',
            model: model,
            items: items,
            cohere_config: {
                api_key: this.getApiKey(),
                input_type: this.config.inputType,
                embedding_types: this.config.embeddingTypes,
                truncate: this.config.truncate || 'END'
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
            
            // Parse Cohere error if possible
            try {
                const errorData = JSON.parse(error);
                if (errorData.message) {
                    throw new Error(`Cohere API error: ${errorData.message}`);
                }
            } catch (e) {
                // Not JSON, use raw error
            }
            
            throw new Error(`Cohere vectorization failed: ${error || response.statusText}`);
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
                    description: 'Cohere API key',
                    format: 'password'
                },
                model: {
                    type: 'string',
                    enum: [
                        'embed-english-v3.0',
                        'embed-multilingual-v3.0',
                        'embed-english-light-v3.0',
                        'embed-multilingual-light-v3.0',
                        'embed-english-v2.0'
                    ],
                    default: 'embed-english-v3.0',
                    description: 'Cohere embedding model to use'
                },
                inputType: {
                    type: 'string',
                    enum: [
                        'search_document',
                        'search_query',
                        'classification',
                        'clustering'
                    ],
                    default: 'search_document',
                    description: 'Input type for optimized embeddings'
                },
                embeddingTypes: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['float', 'int8', 'uint8', 'binary', 'ubinary']
                    },
                    default: ['float'],
                    description: 'Embedding data types to return'
                },
                batchSize: {
                    type: 'number',
                    minimum: 1,
                    maximum: 96,
                    default: 96,
                    description: 'Number of texts to process in each batch'
                },
                timeout: {
                    type: 'number',
                    minimum: 5000,
                    maximum: 300000,
                    default: 30000,
                    description: 'Request timeout in milliseconds'
                },
                truncate: {
                    type: 'string',
                    enum: ['NONE', 'START', 'END'],
                    default: 'END',
                    description: 'How to handle texts longer than max tokens'
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
        
        // Additional validation for embedding types
        if (config.embeddingTypes && config.embeddingTypes.length === 0) {
            result.errors.push('At least one embedding type must be specified');
            result.valid = false;
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
export default CoherePlugin;