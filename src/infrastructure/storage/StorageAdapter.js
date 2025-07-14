/**
 * @file StorageAdapter.js
 * @description 存储适配器，封装所有向量存储相关的操作
 * @module infrastructure/storage/StorageAdapter
 */

import { Logger } from '../../utils/Logger.js';

const logger = new Logger('StorageAdapter');

/**
 * 存储适配器类
 * 封装所有与向量存储相关的API调用
 */
export class StorageAdapter {
    constructor(dependencies = {}) {
        this.baseUrl = '/api/vector';
        // 依赖注入，避免循环引用
        this.getRequestHeaders = dependencies.getRequestHeaders;
        this.getVectorsRequestBody = dependencies.getVectorsRequestBody;
        this.throwIfSourceInvalid = dependencies.throwIfSourceInvalid;
        this.cachedVectors = dependencies.cachedVectors;
        
        logger.log('StorageAdapter initialized');
    }

    /**
     * 获取集合中保存的哈希值列表
     * @param {string} collectionId 集合ID
     * @returns {Promise<number[]>} 哈希值数组
     */
    async getSavedHashes(collectionId) {
        try {
            logger.log(`Getting saved hashes for collection: ${collectionId}`);
            
            const response = await fetch(`${this.baseUrl}/list`, {
                method: 'POST',
                headers: this.getRequestHeaders(),
                body: JSON.stringify({
                    ...this.getVectorsRequestBody(),
                    collectionId: collectionId,
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to get saved hashes for collection ${collectionId}`);
            }

            const hashes = await response.json();
            logger.log(`Retrieved ${hashes.length} hashes for collection ${collectionId}`);
            return hashes;
        } catch (error) {
            logger.error(`Error getting saved hashes: ${error.message}`);
            throw error;
        }
    }

    /**
     * 插入向量项到集合中
     * @param {string} collectionId 集合ID
     * @param {object[]} items 要插入的项
     * @param {AbortSignal} signal 可选的中断信号
     * @param {Object} options 额外选项
     * @param {boolean} options.skipDeduplication 是否跳过去重检查
     * @returns {Promise<void>}
     */
    async insertVectorItems(collectionId, items, signal = null, options = {}) {
        try {
            logger.log(`Inserting ${items.length} items into collection: ${collectionId}`);
            
            this.throwIfSourceInvalid();

            const response = await fetch(`${this.baseUrl}/insert`, {
                method: 'POST',
                headers: this.getRequestHeaders(),
                body: JSON.stringify({
                    ...this.getVectorsRequestBody(),
                    collectionId: collectionId,
                    items: items,
                    skipDeduplication: options.skipDeduplication || false,
                }),
                signal: signal,
            });

            if (!response.ok) {
                throw new Error(`Failed to insert vector items for collection ${collectionId}`);
            }

            logger.log(`Successfully inserted ${items.length} items`);
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.log('Insert operation was aborted');
            } else {
                logger.error(`Error inserting vector items: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * 查询集合
     * @param {string} collectionId 集合ID
     * @param {string} searchText 搜索文本
     * @param {number} topK 返回结果数量
     * @param {number} threshold 相似度阈值
     * @returns {Promise<{hashes: number[], metadata: object[], items?: object[]}>}
     */
    async queryCollection(collectionId, searchText, topK, threshold = 0.25) {
        try {
            logger.log(`Querying collection ${collectionId} with text: "${searchText.substring(0, 50)}..."`);
            
            const response = await fetch(`${this.baseUrl}/query`, {
                method: 'POST',
                headers: this.getRequestHeaders(),
                body: JSON.stringify({
                    ...this.getVectorsRequestBody(),
                    collectionId: collectionId,
                    searchText: searchText,
                    topK: topK,
                    threshold: threshold,
                    includeText: true,
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to query collection ${collectionId}`);
            }

            const result = await response.json();
            logger.log(`Query returned ${result.hashes?.length || result.items?.length || 0} results`);
            return result;
        } catch (error) {
            logger.error(`Error querying collection: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取特定哈希值的文本内容
     * 注意：SillyTavern没有/retrieve端点，但文本存储在query结果的metadata中
     * @param {string} collectionId 集合ID
     * @param {number[]} hashes 哈希值数组
     * @returns {Promise<Array>} {hash, text, metadata} 对象数组
     */
    async getVectorTexts(collectionId, hashes) {
        try {
            logger.log(`Retrieving texts for ${hashes.length} hashes from collection: ${collectionId}`);
            
            // SillyTavern没有专门的retrieve端点，但我们可以通过query获取metadata中的文本
            // 使用一个无关的搜索词来获取所有项目的metadata
            const response = await fetch(`${this.baseUrl}/query`, {
                method: 'POST',
                headers: this.getRequestHeaders(),
                body: JSON.stringify({
                    ...this.getVectorsRequestBody(),
                    collectionId: collectionId,
                    searchText: "dummy_search_for_metadata_retrieval",
                    topK: 9999, // 获取所有项目
                    threshold: 0.0, // 接受所有相似度
                    includeText: true,
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to retrieve texts for collection ${collectionId}`);
            }

            const result = await response.json();
            logger.log(`Retrieved metadata for ${result.metadata?.length || 0} items`);
            
            // 过滤并格式化结果，只返回请求的哈希值
            const texts = [];
            if (result.metadata && Array.isArray(result.metadata)) {
                for (const metadata of result.metadata) {
                    if (hashes.includes(metadata.hash)) {
                        texts.push({
                            hash: metadata.hash,
                            text: metadata.text || '',
                            metadata: metadata
                        });
                    }
                }
            }
            
            logger.log(`Filtered and retrieved ${texts.length} texts matching requested hashes`);
            return texts;
        } catch (error) {
            logger.error(`Error retrieving texts: ${error.message}`);
            return [];
        }
    }

    /**
     * 清除向量索引
     * @param {string} collectionId 集合ID
     * @returns {Promise<boolean>} 是否成功
     */
    async purgeVectorIndex(collectionId) {
        try {
            logger.log(`Purging vector index for collection: ${collectionId}`);
            
            const response = await fetch(`${this.baseUrl}/purge`, {
                method: 'POST',
                headers: this.getRequestHeaders(),
                body: JSON.stringify({
                    ...this.getVectorsRequestBody(),
                    collectionId: collectionId,
                }),
            });

            if (!response.ok) {
                throw new Error(`Could not delete vector index for collection ${collectionId}`);
            }

            // 清除缓存
            if (this.cachedVectors && this.cachedVectors.delete) {
                this.cachedVectors.delete(collectionId);
            }
            
            logger.log(`Successfully purged vector index for ${collectionId}`);
            return true;
        } catch (error) {
            logger.error(`Error purging vector index: ${error.message}`);
            return false;
        }
    }

    /**
     * 检查集合是否存在
     * @param {string} collectionId 集合ID
     * @returns {Promise<boolean>} 是否存在
     */
    async collectionExists(collectionId) {
        try {
            const hashes = await this.getSavedHashes(collectionId);
            return hashes && hashes.length > 0;
        } catch (error) {
            // 如果获取失败，假设集合不存在
            return false;
        }
    }

    /**
     * 获取集合统计信息
     * @param {string} collectionId 集合ID
     * @returns {Promise<{count: number, exists: boolean}>}
     */
    async getCollectionStats(collectionId) {
        try {
            const hashes = await this.getSavedHashes(collectionId);
            return {
                exists: true,
                count: hashes.length
            };
        } catch (error) {
            return {
                exists: false,
                count: 0
            };
        }
    }
}