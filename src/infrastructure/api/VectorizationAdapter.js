/**
 * @file VectorizationAdapter.js
 * @description 向量化 API 适配器，封装所有向量化源的调用
 * @module infrastructure/api/VectorizationAdapter
 */

import { Logger } from '../../utils/Logger.js';

const logger = new Logger('VectorizationAdapter');

/**
 * 向量化 API 适配器类
 * 统一封装不同向量化源的调用接口
 */
export class VectorizationAdapter {
    constructor(dependencies = {}) {
        // 依赖注入
        this.getRequestHeaders = dependencies.getRequestHeaders;
        this.getVectorsRequestBody = dependencies.getVectorsRequestBody;
        this.throwIfSourceInvalid = dependencies.throwIfSourceInvalid;
        this.settings = dependencies.settings;
        this.textgenerationwebui_settings = dependencies.textgenerationwebui_settings;
        this.textgen_types = dependencies.textgen_types;
        
        logger.log('VectorizationAdapter initialized');
    }

    /**
     * 根据当前设置的源执行向量化
     * @param {Array<{text: string, index: number}>} items 要向量化的文本项
     * @param {AbortSignal} signal 可选的中断信号
     * @returns {Promise<Array>} 向量化结果
     */
    async vectorize(items, signal = null) {
        const source = this.settings.source;
        logger.log(`Vectorizing ${items.length} items using source: ${source}`);

        // 验证源配置
        this.throwIfSourceInvalid();

        switch (source) {
            case 'transformers':
                return await this.vectorizeWithTransformers(items, signal);
            case 'ollama':
                return await this.vectorizeWithOllama(items, signal);
            case 'vllm':
                return await this.vectorizeWithVLLM(items, signal);
            case 'webllm':
                return await this.vectorizeWithWebLLM(items, signal);
            case 'openai':
                return await this.vectorizeWithOpenAI(items, signal);
            case 'cohere':
                return await this.vectorizeWithCohere(items, signal);
            default:
                throw new Error(`Unsupported vectorization source: ${source}`);
        }
    }

    /**
     * 使用 Transformers 进行向量化
     * @private
     */
    async vectorizeWithTransformers(items, signal) {
        logger.log('Using Transformers for vectorization');
        
        const requestBody = this.getVectorsRequestBody({
            items: items
        });

        const response = await fetch('/api/vector/embed', {
            method: 'POST',
            headers: this.getRequestHeaders(),
            body: JSON.stringify(requestBody),
            signal: signal
        });

        if (!response.ok) {
            throw new Error(`Transformers vectorization failed: ${response.statusText}`);
        }

        const result = await response.json();
        logger.log(`Transformers vectorization completed for ${items.length} items`);
        return result;
    }

    /**
     * 使用 Ollama 进行向量化
     * @private
     */
    async vectorizeWithOllama(items, signal) {
        logger.log('Using Ollama for vectorization');
        
        const requestBody = this.getVectorsRequestBody({
            items: items
        });

        // Ollama 需要特殊的 API 端点
        const response = await fetch('/api/vector/embed', {
            method: 'POST',
            headers: this.getRequestHeaders(),
            body: JSON.stringify(requestBody),
            signal: signal
        });

        if (!response.ok) {
            throw new Error(`Ollama vectorization failed: ${response.statusText}`);
        }

        const result = await response.json();
        logger.log(`Ollama vectorization completed for ${items.length} items`);
        return result;
    }

    /**
     * 使用 vLLM 进行向量化
     * @private
     */
    async vectorizeWithVLLM(items, signal) {
        logger.log('Using vLLM for vectorization');
        
        const requestBody = this.getVectorsRequestBody({
            items: items
        });

        const response = await fetch('/api/vector/embed', {
            method: 'POST',
            headers: this.getRequestHeaders(),
            body: JSON.stringify(requestBody),
            signal: signal
        });

        if (!response.ok) {
            throw new Error(`vLLM vectorization failed: ${response.statusText}`);
        }

        const result = await response.json();
        logger.log(`vLLM vectorization completed for ${items.length} items`);
        return result;
    }

    /**
     * 使用 WebLLM 进行向量化
     * @private
     */
    async vectorizeWithWebLLM(items, signal) {
        logger.log('Using WebLLM for vectorization');
        
        // WebLLM 在客户端运行，需要特殊处理
        if (!window.webllm || !window.webllm.embedder) {
            throw new Error('WebLLM not initialized. Please ensure WebLLM is loaded.');
        }

        try {
            const embeddings = [];
            
            // WebLLM 通常需要逐个处理文本
            for (const item of items) {
                if (signal?.aborted) {
                    throw new Error('Vectorization aborted');
                }
                
                const embedding = await window.webllm.embedder.embed(item.text);
                embeddings.push({
                    index: item.index,
                    embedding: embedding
                });
            }

            logger.log(`WebLLM vectorization completed for ${items.length} items`);
            return embeddings;
        } catch (error) {
            logger.error('WebLLM vectorization error:', error);
            throw error;
        }
    }

    /**
     * 使用 OpenAI 进行向量化
     * @private
     */
    async vectorizeWithOpenAI(items, signal) {
        logger.log('Using OpenAI for vectorization');
        
        // OpenAI 向量化通常通过后端代理
        const requestBody = {
            source: 'openai',
            model: this.settings.openai_model || 'text-embedding-ada-002',
            items: items
        };

        const response = await fetch('/api/vector/embed', {
            method: 'POST',
            headers: this.getRequestHeaders(),
            body: JSON.stringify(requestBody),
            signal: signal
        });

        if (!response.ok) {
            throw new Error(`OpenAI vectorization failed: ${response.statusText}`);
        }

        const result = await response.json();
        logger.log(`OpenAI vectorization completed for ${items.length} items`);
        return result;
    }

    /**
     * 使用 Cohere 进行向量化
     * @private
     */
    async vectorizeWithCohere(items, signal) {
        logger.log('Using Cohere for vectorization');
        
        // Cohere 向量化通常通过后端代理
        const requestBody = {
            source: 'cohere',
            model: this.settings.cohere_model || 'embed-english-v2.0',
            items: items
        };

        const response = await fetch('/api/vector/embed', {
            method: 'POST',
            headers: this.getRequestHeaders(),
            body: JSON.stringify(requestBody),
            signal: signal
        });

        if (!response.ok) {
            throw new Error(`Cohere vectorization failed: ${response.statusText}`);
        }

        const result = await response.json();
        logger.log(`Cohere vectorization completed for ${items.length} items`);
        return result;
    }

    /**
     * 获取支持的向量化源列表
     * @returns {Array<string>} 支持的源
     */
    getSupportedSources() {
        return ['transformers', 'ollama', 'vllm', 'webllm', 'openai', 'cohere'];
    }

    /**
     * 检查指定的源是否可用
     * @param {string} source 向量化源
     * @returns {Promise<boolean>} 是否可用
     */
    async checkSourceAvailability(source) {
        try {
            switch (source) {
                case 'transformers':
                    // 检查本地模型是否已加载
                    return !!this.settings.local_model;
                
                case 'ollama':
                    // 检查 Ollama 服务是否运行
                    const ollamaUrl = this.settings.ollama_url || 
                        this.textgenerationwebui_settings?.server_urls?.[this.textgen_types?.OLLAMA] || 
                        'http://localhost:11434';
                    const response = await fetch(`${ollamaUrl}/api/tags`, { method: 'GET' });
                    return response.ok;
                
                case 'vllm':
                    // 检查 vLLM 服务
                    return !!(this.settings.vllm_url && this.settings.vllm_model);
                
                case 'webllm':
                    // 检查 WebLLM 是否已加载
                    return !!(window.webllm && window.webllm.embedder);
                
                case 'openai':
                    // 检查 OpenAI API 密钥
                    return !!this.settings.openai_api_key;
                
                case 'cohere':
                    // 检查 Cohere API 密钥
                    return !!this.settings.cohere_api_key;
                
                default:
                    return false;
            }
        } catch (error) {
            logger.error(`Error checking availability for ${source}:`, error);
            return false;
        }
    }

    /**
     * 获取向量化批次大小建议
     * @param {string} source 向量化源
     * @returns {number} 建议的批次大小
     */
    getBatchSizeRecommendation(source) {
        switch (source) {
            case 'transformers':
                return 50;  // 本地模型可以处理较大批次
            case 'ollama':
                return 20;  // Ollama 根据模型性能调整
            case 'vllm':
                return 30;  // vLLM 可以处理中等批次
            case 'webllm':
                return 1;   // WebLLM 通常需要逐个处理
            case 'openai':
                return 100; // OpenAI API 有较高的批次限制
            case 'cohere':
                return 96;  // Cohere 的官方批次限制
            default:
                return 10;  // 保守的默认值
        }
    }
}