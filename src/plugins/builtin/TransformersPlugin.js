/**
 * @file TransformersPlugin.js
 * @description Transformers.js vectorization plugin
 * @module plugins/builtin/TransformersPlugin
 */

import { IVectorizationPlugin, PluginCapabilities } from '../../core/plugins/IVectorizationPlugin.js';
import { Logger } from '../../utils/Logger.js';

const logger = new Logger('TransformersPlugin');

/**
 * Transformers.js vectorization plugin
 * Provides local embedding generation using Transformers.js models
 */
export class TransformersPlugin extends IVectorizationPlugin {
    constructor(config = {}) {
        const defaultConfig = {
            model: 'all-MiniLM-L6-v2',
            batchSize: 50,
            ...config
        };
        
        super('transformers', defaultConfig);
        this.pipeline = null;
        this.currentModel = null;
    }

    /**
     * Get plugin metadata
     */
    getMetadata() {
        return {
            name: 'Transformers.js',
            description: 'Local embedding generation using Transformers.js models',
            version: '1.0.0',
            author: 'Vectors Enhanced',
            tags: ['local', 'transformers', 'embeddings'],
            capabilities: {
                [PluginCapabilities.BATCH_PROCESSING]: true,
                [PluginCapabilities.LOCAL_MODELS]: true,
                [PluginCapabilities.GPU_ACCELERATION]: true,
                [PluginCapabilities.CACHING]: true
            }
        };
    }

    /**
     * Initialize the plugin
     */
    async initialize() {
        try {
            logger.log('Initializing Transformers plugin...');
            
            // Check if Transformers.js is available
            if (typeof window === 'undefined' || !window.transformers) {
                logger.warn('Transformers.js not available in current environment');
                return false;
            }
            
            this.initialized = true;
            logger.log('Transformers plugin initialized successfully');
            return true;
            
        } catch (error) {
            logger.error('Failed to initialize Transformers plugin:', error);
            return false;
        }
    }

    /**
     * Check if plugin is available
     */
    async isAvailable() {
        // Check if we have access to the vectorization endpoint
        try {
            const response = await fetch('/api/vector/embed', {
                method: 'HEAD'
            });
            return response.ok;
        } catch (error) {
            logger.error('Transformers endpoint not available:', error);
            return false;
        }
    }

    /**
     * Get available models
     */
    async getAvailableModels() {
        // These are commonly supported models by Transformers.js
        return [
            {
                id: 'all-MiniLM-L6-v2',
                name: 'all-MiniLM-L6-v2',
                description: 'General purpose sentence embeddings (384 dimensions)',
                size: '23MB',
                dimensions: 384
            },
            {
                id: 'all-mpnet-base-v2',
                name: 'all-mpnet-base-v2',
                description: 'High quality sentence embeddings (768 dimensions)',
                size: '86MB',
                dimensions: 768
            },
            {
                id: 'multi-qa-MiniLM-L6-cos-v1',
                name: 'multi-qa-MiniLM-L6-cos-v1',
                description: 'Optimized for semantic search (384 dimensions)',
                size: '23MB',
                dimensions: 384
            },
            {
                id: 'paraphrase-multilingual-MiniLM-L12-v2',
                name: 'paraphrase-multilingual-MiniLM-L12-v2',
                description: 'Multilingual embeddings (384 dimensions)',
                size: '118MB',
                dimensions: 384
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
        
        logger.log(`Vectorizing ${texts.length} texts with model ${model}`);

        try {
            // Use the processBatches helper for efficient batch processing
            const embeddings = await this.processBatches(
                texts,
                { ...options, batchSize },
                async (batch) => await this.vectorizeBatch(batch, model, options)
            );

            return embeddings;

        } catch (error) {
            logger.error('Vectorization failed:', error);
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
            source: 'transformers',
            model: model,
            items: items
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
            throw new Error(`Transformers vectorization failed: ${response.statusText}`);
        }

        const result = await response.json();
        
        // Extract embeddings from result
        // The API typically returns an array of {index, embedding} objects
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
                model: {
                    type: 'string',
                    enum: [
                        'all-MiniLM-L6-v2',
                        'all-mpnet-base-v2',
                        'multi-qa-MiniLM-L6-cos-v1',
                        'paraphrase-multilingual-MiniLM-L12-v2'
                    ],
                    default: 'all-MiniLM-L6-v2',
                    description: 'Embedding model to use'
                },
                batchSize: {
                    type: 'number',
                    minimum: 1,
                    maximum: 100,
                    default: 50,
                    description: 'Number of texts to process in each batch'
                },
                gpu: {
                    type: 'boolean',
                    default: true,
                    description: 'Use GPU acceleration if available'
                },
                cache: {
                    type: 'boolean',
                    default: true,
                    description: 'Cache embeddings for repeated texts'
                }
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.pipeline) {
            // Clean up any loaded models
            this.pipeline = null;
            this.currentModel = null;
        }
        
        await super.cleanup();
    }
}

// Export as default for easier importing
export default TransformersPlugin;