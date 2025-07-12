/**
 * @file WebLLMPlugin.js
 * @description WebLLM vectorization plugin
 * @module plugins/builtin/WebLLMPlugin
 */

import { IVectorizationPlugin, PluginCapabilities } from '../../core/plugins/IVectorizationPlugin.js';
import { Logger } from '../../utils/Logger.js';

const logger = new Logger('WebLLMPlugin');

/**
 * WebLLM vectorization plugin
 * Provides in-browser embedding generation using WebLLM
 */
export class WebLLMPlugin extends IVectorizationPlugin {
    constructor(config = {}) {
        const defaultConfig = {
            model: 'all-MiniLM-L6-v2-q4f16_1',
            batchSize: 1,  // WebLLM typically processes one at a time
            useWebWorker: true,
            ...config
        };
        
        super('webllm', defaultConfig);
        this.embedder = null;
        this.loadingPromise = null;
    }

    /**
     * Get plugin metadata
     */
    getMetadata() {
        return {
            name: 'WebLLM',
            description: 'In-browser embedding generation using WebLLM and WebGPU',
            version: '1.0.0',
            author: 'Vectors Enhanced',
            tags: ['browser', 'webllm', 'embeddings', 'webgpu', 'local'],
            capabilities: {
                [PluginCapabilities.LOCAL_MODELS]: true,
                [PluginCapabilities.GPU_ACCELERATION]: true,
                [PluginCapabilities.QUANTIZATION]: true
            }
        };
    }

    /**
     * Initialize the plugin
     */
    async initialize() {
        try {
            logger.log('Initializing WebLLM plugin...');
            
            // Check if WebLLM is available
            if (typeof window === 'undefined' || !window.webllm) {
                logger.error('WebLLM not found. Make sure webllm.js is loaded.');
                return false;
            }
            
            // Check WebGPU support
            if (!navigator.gpu) {
                logger.error('WebGPU not supported in this browser');
                return false;
            }
            
            this.initialized = true;
            logger.log('WebLLM plugin initialized successfully');
            return true;
            
        } catch (error) {
            logger.error('Failed to initialize WebLLM plugin:', error);
            return false;
        }
    }

    /**
     * Check if plugin is available
     */
    async isAvailable() {
        return this.initialized && 
               window.webllm && 
               navigator.gpu &&
               (window.webllm.embedder || window.webllm.EmbeddingEngine);
    }

    /**
     * Get available models
     */
    async getAvailableModels() {
        // WebLLM embedding models
        // These are quantized versions optimized for browser use
        return [
            {
                id: 'all-MiniLM-L6-v2-q4f16_1',
                name: 'All-MiniLM-L6-v2 (Q4)',
                description: 'Quantized MiniLM for fast browser embeddings (384 dims)',
                size: '25MB',
                dimensions: 384,
                quantization: 'q4f16_1'
            },
            {
                id: 'bge-small-en-v1.5-q4f16_1',
                name: 'BGE-Small-EN-v1.5 (Q4)',
                description: 'Quantized BGE small model (384 dims)',
                size: '35MB',
                dimensions: 384,
                quantization: 'q4f16_1'
            },
            {
                id: 'gte-small-q4f16_1',
                name: 'GTE-Small (Q4)',
                description: 'Quantized GTE small model (384 dims)',
                size: '35MB',
                dimensions: 384,
                quantization: 'q4f16_1'
            },
            {
                id: 'e5-small-v2-q4f16_1',
                name: 'E5-Small-v2 (Q4)',
                description: 'Quantized E5 small model (384 dims)',
                size: '35MB',
                dimensions: 384,
                quantization: 'q4f16_1'
            }
        ];
    }

    /**
     * Load WebLLM model
     * @private
     */
    async loadModel(modelId) {
        if (this.embedder && this.currentModel === modelId) {
            return; // Model already loaded
        }

        logger.log(`Loading WebLLM model: ${modelId}`);

        try {
            // Create embedding engine
            const engineConfig = {
                model: modelId,
                chatOpts: {
                    temperature: 0,
                    repetition_penalty: 1.0
                }
            };

            if (this.config.useWebWorker && window.webllm.CreateWebWorkerEmbeddingEngine) {
                // Use web worker for better performance
                this.embedder = await window.webllm.CreateWebWorkerEmbeddingEngine(
                    new Worker(new URL('./webllm-worker.js', import.meta.url)),
                    engineConfig
                );
            } else if (window.webllm.CreateEmbeddingEngine) {
                // Use main thread
                this.embedder = await window.webllm.CreateEmbeddingEngine(engineConfig);
            } else {
                throw new Error('WebLLM EmbeddingEngine not available');
            }

            this.currentModel = modelId;
            logger.log(`WebLLM model loaded: ${modelId}`);

        } catch (error) {
            logger.error('Failed to load WebLLM model:', error);
            throw error;
        }
    }

    /**
     * Vectorize texts
     */
    async vectorize(texts, options = {}) {
        if (!this.initialized) {
            throw new Error('Plugin not initialized');
        }

        const model = options.model || this.config.model;
        
        logger.log(`Vectorizing ${texts.length} texts with WebLLM model ${model}`);

        try {
            // Ensure model is loaded
            if (this.loadingPromise) {
                await this.loadingPromise;
            } else if (!this.embedder || this.currentModel !== model) {
                this.loadingPromise = this.loadModel(model);
                await this.loadingPromise;
                this.loadingPromise = null;
            }

            // WebLLM typically processes texts one by one
            const embeddings = [];
            
            for (let i = 0; i < texts.length; i++) {
                if (options.signal?.aborted) {
                    throw new Error('Vectorization aborted');
                }

                const embedding = await this.embedder.embed(texts[i]);
                embeddings.push(Array.from(embedding)); // Convert to array if needed

                if (options.onProgress) {
                    options.onProgress({
                        current: i + 1,
                        total: texts.length,
                        percentage: ((i + 1) / texts.length) * 100
                    });
                }
            }

            return embeddings;

        } catch (error) {
            logger.error('WebLLM vectorization failed:', error);
            throw error;
        }
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
                        'all-MiniLM-L6-v2-q4f16_1',
                        'bge-small-en-v1.5-q4f16_1',
                        'gte-small-q4f16_1',
                        'e5-small-v2-q4f16_1'
                    ],
                    default: 'all-MiniLM-L6-v2-q4f16_1',
                    description: 'WebLLM embedding model to use'
                },
                useWebWorker: {
                    type: 'boolean',
                    default: true,
                    description: 'Run model in web worker for better performance'
                },
                cacheSize: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1000,
                    default: 100,
                    description: 'Number of embeddings to cache'
                },
                deviceId: {
                    type: 'string',
                    description: 'Specific GPU device ID to use (if multiple GPUs)'
                }
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.embedder) {
            try {
                // Cleanup WebLLM resources
                if (this.embedder.dispose) {
                    await this.embedder.dispose();
                }
            } catch (error) {
                logger.error('Error cleaning up WebLLM:', error);
            }
            
            this.embedder = null;
            this.currentModel = null;
        }
        
        await super.cleanup();
    }
}

// Export as default for easier importing
export default WebLLMPlugin;