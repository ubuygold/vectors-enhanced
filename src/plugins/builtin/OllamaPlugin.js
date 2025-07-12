/**
 * @file OllamaPlugin.js
 * @description Ollama vectorization plugin
 * @module plugins/builtin/OllamaPlugin
 */

import { IVectorizationPlugin, PluginCapabilities } from '../../core/plugins/IVectorizationPlugin.js';
import { Logger } from '../../utils/Logger.js';

const logger = new Logger('OllamaPlugin');

/**
 * Ollama vectorization plugin
 * Provides embedding generation using Ollama local models
 */
export class OllamaPlugin extends IVectorizationPlugin {
    constructor(config = {}) {
        const defaultConfig = {
            url: 'http://localhost:11434',
            model: 'nomic-embed-text',
            batchSize: 20,
            timeout: 30000,
            ...config
        };
        
        super('ollama', defaultConfig);
        this.availableModels = [];
    }

    /**
     * Get plugin metadata
     */
    getMetadata() {
        return {
            name: 'Ollama',
            description: 'Local embedding generation using Ollama models',
            version: '1.0.0',
            author: 'Vectors Enhanced',
            tags: ['local', 'ollama', 'embeddings', 'self-hosted'],
            capabilities: {
                [PluginCapabilities.BATCH_PROCESSING]: true,
                [PluginCapabilities.LOCAL_MODELS]: true,
                [PluginCapabilities.CUSTOM_MODELS]: true,
                [PluginCapabilities.GPU_ACCELERATION]: true
            }
        };
    }

    /**
     * Initialize the plugin
     */
    async initialize() {
        try {
            logger.log('Initializing Ollama plugin...');
            
            // Try to fetch available models
            await this.refreshAvailableModels();
            
            this.initialized = true;
            logger.log('Ollama plugin initialized successfully');
            return true;
            
        } catch (error) {
            logger.error('Failed to initialize Ollama plugin:', error);
            return false;
        }
    }

    /**
     * Check if plugin is available
     */
    async isAvailable() {
        try {
            // First check if the backend proxy is available
            const proxyResponse = await fetch('/api/vector/embed', {
                method: 'HEAD'
            });
            
            if (!proxyResponse.ok) {
                return false;
            }
            
            // Then check if Ollama service is running
            const ollamaUrl = this.getOllamaUrl();
            const response = await fetch(`${ollamaUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            
            return response.ok;
            
        } catch (error) {
            logger.warn('Ollama service not available:', error.message);
            return false;
        }
    }

    /**
     * Get Ollama URL from config or settings
     * @private
     */
    getOllamaUrl() {
        // Priority: plugin config > textgen settings > default
        if (this.config.url) {
            return this.config.url;
        }
        
        // Check if we have access to textgen settings
        if (this.config.textgenerationwebui_settings?.server_urls) {
            const ollamaType = this.config.textgen_types?.OLLAMA;
            if (ollamaType !== undefined) {
                return this.config.textgenerationwebui_settings.server_urls[ollamaType] || 'http://localhost:11434';
            }
        }
        
        return 'http://localhost:11434';
    }

    /**
     * Refresh available models from Ollama
     * @private
     */
    async refreshAvailableModels() {
        try {
            const ollamaUrl = this.getOllamaUrl();
            const response = await fetch(`${ollamaUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                const data = await response.json();
                this.availableModels = data.models || [];
                logger.log(`Found ${this.availableModels.length} Ollama models`);
            }
        } catch (error) {
            logger.warn('Failed to fetch Ollama models:', error);
            this.availableModels = [];
        }
    }

    /**
     * Get available models
     */
    async getAvailableModels() {
        // Refresh models list
        await this.refreshAvailableModels();
        
        // Filter and format embedding models
        const embeddingModels = this.availableModels
            .filter(model => {
                const name = model.name || model;
                // Common embedding model patterns
                return name.includes('embed') || 
                       name.includes('nomic') || 
                       name.includes('mxbai') ||
                       name.includes('all-minilm') ||
                       name.includes('bge');
            })
            .map(model => {
                const name = model.name || model;
                const size = model.size ? `${Math.round(model.size / 1024 / 1024)}MB` : 'Unknown';
                
                return {
                    id: name,
                    name: name,
                    description: `Ollama embedding model`,
                    size: size,
                    modified: model.modified_at
                };
            });

        // Add some known embedding models if not present
        const knownModels = [
            {
                id: 'nomic-embed-text',
                name: 'nomic-embed-text',
                description: 'Nomic AI text embeddings (768 dimensions)',
                size: '274MB'
            },
            {
                id: 'mxbai-embed-large',
                name: 'mxbai-embed-large',
                description: 'MixedBread AI embeddings (1024 dimensions)',
                size: '670MB'
            },
            {
                id: 'all-minilm',
                name: 'all-minilm',
                description: 'Sentence transformers MiniLM (384 dimensions)',
                size: '46MB'
            }
        ];

        // Merge known models with discovered ones
        const modelMap = new Map();
        embeddingModels.forEach(m => modelMap.set(m.id, m));
        knownModels.forEach(m => {
            if (!modelMap.has(m.id)) {
                modelMap.set(m.id, m);
            }
        });

        return Array.from(modelMap.values());
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
        
        logger.log(`Vectorizing ${texts.length} texts with Ollama model ${model}`);

        try {
            // Use the processBatches helper for efficient batch processing
            const embeddings = await this.processBatches(
                texts,
                { ...options, batchSize },
                async (batch) => await this.vectorizeBatch(batch, model, options)
            );

            return embeddings;

        } catch (error) {
            logger.error('Ollama vectorization failed:', error);
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
            source: 'ollama',
            model: model,
            items: items,
            ollama_url: this.getOllamaUrl()
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
            throw new Error(`Ollama vectorization failed: ${error || response.statusText}`);
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
                    default: 'http://localhost:11434',
                    description: 'Ollama server URL'
                },
                model: {
                    type: 'string',
                    default: 'nomic-embed-text',
                    description: 'Embedding model to use'
                },
                batchSize: {
                    type: 'number',
                    minimum: 1,
                    maximum: 50,
                    default: 20,
                    description: 'Number of texts to process in each batch'
                },
                timeout: {
                    type: 'number',
                    minimum: 5000,
                    maximum: 300000,
                    default: 30000,
                    description: 'Request timeout in milliseconds'
                },
                keepAlive: {
                    type: 'boolean',
                    default: true,
                    description: 'Keep model loaded in memory'
                }
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.availableModels = [];
        await super.cleanup();
    }
}

// Export as default for easier importing
export default OllamaPlugin;