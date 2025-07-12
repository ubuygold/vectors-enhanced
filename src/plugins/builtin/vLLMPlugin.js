/**
 * @file vLLMPlugin.js
 * @description vLLM vectorization plugin
 * @module plugins/builtin/vLLMPlugin
 */

import { IVectorizationPlugin, PluginCapabilities } from '../../core/plugins/IVectorizationPlugin.js';
import { Logger } from '../../utils/Logger.js';

const logger = new Logger('vLLMPlugin');

/**
 * vLLM vectorization plugin
 * Provides embedding generation using vLLM server
 */
export class vLLMPlugin extends IVectorizationPlugin {
    constructor(config = {}) {
        const defaultConfig = {
            url: 'http://localhost:8000',
            model: 'intfloat/e5-mistral-7b-instruct',
            batchSize: 30,
            timeout: 60000,
            ...config
        };
        
        super('vllm', defaultConfig);
    }

    /**
     * Get plugin metadata
     */
    getMetadata() {
        return {
            name: 'vLLM',
            description: 'High-performance embedding generation using vLLM server',
            version: '1.0.0',
            author: 'Vectors Enhanced',
            tags: ['server', 'vllm', 'embeddings', 'high-performance'],
            capabilities: {
                [PluginCapabilities.BATCH_PROCESSING]: true,
                [PluginCapabilities.REMOTE_MODELS]: true,
                [PluginCapabilities.GPU_ACCELERATION]: true,
                [PluginCapabilities.STREAMING]: true
            }
        };
    }

    /**
     * Initialize the plugin
     */
    async initialize() {
        try {
            logger.log('Initializing vLLM plugin...');
            
            this.initialized = true;
            logger.log('vLLM plugin initialized successfully');
            return true;
            
        } catch (error) {
            logger.error('Failed to initialize vLLM plugin:', error);
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
            
            // Check if vLLM configuration is valid
            return !!(this.config.url && this.config.model);
            
        } catch (error) {
            logger.warn('vLLM service not available:', error.message);
            return false;
        }
    }

    /**
     * Get available models
     */
    async getAvailableModels() {
        // vLLM typically runs a single model per server instance
        // These are some commonly used embedding models with vLLM
        return [
            {
                id: 'intfloat/e5-mistral-7b-instruct',
                name: 'E5-Mistral-7B-Instruct',
                description: 'State-of-the-art embedding model based on Mistral-7B',
                size: '14GB',
                dimensions: 4096,
                maxTokens: 32768
            },
            {
                id: 'BAAI/bge-large-en-v1.5',
                name: 'BGE-Large-EN-v1.5',
                description: 'High-quality English embeddings',
                size: '1.3GB',
                dimensions: 1024,
                maxTokens: 512
            },
            {
                id: 'thenlper/gte-large',
                name: 'GTE-Large',
                description: 'General text embeddings',
                size: '1.3GB',
                dimensions: 1024,
                maxTokens: 512
            },
            {
                id: 'sentence-transformers/all-mpnet-base-v2',
                name: 'All-MPNet-Base-v2',
                description: 'General purpose sentence embeddings',
                size: '438MB',
                dimensions: 768,
                maxTokens: 384
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
        
        logger.log(`Vectorizing ${texts.length} texts with vLLM model ${model}`);

        try {
            // Use the processBatches helper for efficient batch processing
            const embeddings = await this.processBatches(
                texts,
                { ...options, batchSize },
                async (batch) => await this.vectorizeBatch(batch, model, options)
            );

            return embeddings;

        } catch (error) {
            logger.error('vLLM vectorization failed:', error);
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
            source: 'vllm',
            model: model,
            items: items,
            vllm_config: {
                url: this.config.url,
                api_key: this.config.apiKey,
                temperature: 0,  // For embeddings, we want deterministic output
                max_tokens: this.config.maxTokens || 8192
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
            throw new Error(`vLLM vectorization failed: ${error || response.statusText}`);
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
                url: {
                    type: 'string',
                    format: 'uri',
                    default: 'http://localhost:8000',
                    description: 'vLLM server URL'
                },
                model: {
                    type: 'string',
                    default: 'intfloat/e5-mistral-7b-instruct',
                    description: 'Model ID or path on the vLLM server'
                },
                apiKey: {
                    type: 'string',
                    description: 'API key for vLLM server (if required)'
                },
                batchSize: {
                    type: 'number',
                    minimum: 1,
                    maximum: 100,
                    default: 30,
                    description: 'Number of texts to process in each batch'
                },
                timeout: {
                    type: 'number',
                    minimum: 5000,
                    maximum: 300000,
                    default: 60000,
                    description: 'Request timeout in milliseconds'
                },
                maxTokens: {
                    type: 'number',
                    minimum: 128,
                    maximum: 32768,
                    default: 8192,
                    description: 'Maximum tokens per text'
                },
                tensorParallelSize: {
                    type: 'number',
                    minimum: 1,
                    maximum: 8,
                    default: 1,
                    description: 'Tensor parallel size for multi-GPU'
                }
            },
            required: ['url', 'model']
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        await super.cleanup();
    }
}

// Export as default for easier importing
export default vLLMPlugin;