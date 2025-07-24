/**
 * @file VectorizationProcessor.js
 * @description Processor wrapper for vectorization functionality
 * @module core/pipeline/processors/VectorizationProcessor
 */

import { ITextProcessor } from '../ITextProcessor.js';
import { Logger } from '../../../utils/Logger.js';

const logger = new Logger('VectorizationProcessor');

/**
 * Processor that wraps the existing VectorizationAdapter
 * Provides a bridge between the pipeline and legacy vectorization code
 */
export class VectorizationProcessor extends ITextProcessor {
    /**
     * @param {VectorizationAdapter} vectorizationAdapter - Existing vectorization adapter
     */
    constructor(vectorizationAdapter) {
        super();
        
        if (!vectorizationAdapter) {
            throw new Error('VectorizationAdapter is required');
        }
        
        /**
         * Reference to the existing adapter
         * We wrap it instead of modifying it
         */
        this.adapter = vectorizationAdapter;
        
        /**
         * Processor configuration
         */
        this.config = {
            batchSize: 10,
            maxRetries: 3,
            timeout: 30000
        };

        logger.log('VectorizationProcessor initialized');
    }

    /**
     * Get processor type
     * @returns {string} Processor type identifier
     */
    getType() {
        return 'vectorization';
    }

    /**
     * Get processor name
     * @returns {string} Processor display name
     */
    getName() {
        return 'Vectorization Processor';
    }

    /**
     * Process input through vectorization
     * @param {Object} input - Input data
     * @param {string|Array} input.content - Text content to vectorize
     * @param {Object} input.metadata - Additional metadata
     * @param {Object} context - Processing context
     * @returns {Promise<Object>} Processing result
     */
    async process(input, context) {
        const startTime = performance.now();
        
        try {
            logger.log(`Processing content for vectorization (content type: ${typeof input.content})`);
            logger.log(`VectorizationProcessor input content preview:`, {
                isArray: Array.isArray(input.content),
                length: Array.isArray(input.content) ? input.content.length : input.content?.length,
                contentPreview: Array.isArray(input.content) 
                    ? input.content.slice(0, 2).map(item => ({ type: item?.type, hasText: !!item?.text, textLength: item?.text?.length }))
                    : input.content?.substring(0, 100) + '...'
            });

            // Extract necessary data from input and context
            const content = input.content;
            const metadata = input.metadata || {};
            const settings = context.settings || {};
            const vectorizationSettings = context.vectorizationSettings || {};
            
            // Log metadata to track taskType flow
            logger.log('VectorizationProcessor received metadata:', {
                taskType: metadata.taskType,
                source: metadata.source,
                type: metadata.type,
                collectionId: metadata.collectionId,
                allMetadataKeys: Object.keys(metadata)
            });
            
            // Determine vectorization source
            const source = vectorizationSettings.source || metadata.source || settings.source || 'transformers';
            
            // Prepare chunks for vectorization
            const chunks = this.prepareVectorizationChunks(content, metadata, vectorizationSettings);
            
            logger.log(`VectorizationProcessor prepared chunks:`, {
                chunkCount: chunks.length,
                chunks: chunks.map(chunk => ({
                    hasText: !!chunk.text,
                    textLength: chunk.text?.length,
                    textPreview: chunk.text?.substring(0, 50) + '...'
                }))
            });
            
            logger.log(`Vectorizing ${chunks.length} chunks using ${source}`);
            
            // Actually vectorize chunks using the existing adapter
            logger.log(`Calling vectorization adapter for ${chunks.length} chunks`);
            
            // Convert chunks to the format expected by the legacy vectorization
            const vectorItems = chunks.map((chunk, index) => ({
                id: `chunk_${this.generateHash(chunk.text)}`,
                text: chunk.text,
                type: metadata.type || 'pipeline',
                metadata: {
                    ...metadata,
                    ...chunk.metadata,
                    chunk_index: index,
                    chunk_total: chunks.length,
                    pipeline_processed: true
                },
                selected: true
            }));
            
            // Call the actual vectorization adapter
            // VectorizationAdapter.vectorize(items, signal) - only takes 2 parameters
            const vectorizationResult = await this.adapter.vectorize(
                vectorItems,
                context.abortSignal
            );
            
            logger.log(`Vectorization adapter result:`, {
                success: vectorizationResult.success,
                itemCount: vectorizationResult.items?.length || 0
            });
            
            // Convert adapter result to pipeline format - use the actual vectorized results
            const processedChunks = vectorizationResult.items || [];
            
            logger.log(`VectorizationProcessor: Generated ${processedChunks.length} vectorized chunks`);

            // Transform result to pipeline format
            const processingTime = performance.now() - startTime;
            
            return {
                success: true,
                vectorized: processedChunks.length,
                vectors: processedChunks,
                source: source,
                processingTime: processingTime,
                metadata: {
                    ...metadata,
                    itemCount: processedChunks.length,
                    chunkSize: vectorizationSettings.chunk_size || 1000,
                    overlapPercent: vectorizationSettings.overlap_percent || 10
                }
            };

        } catch (error) {
            logger.error(`Vectorization failed: ${error.message}`);
            
            // Add error to context if the method exists
            if (context.addError && typeof context.addError === 'function') {
                context.addError(error, {
                    processor: this.getName(),
                    input: String(input.content).substring(0, 100)
                });
            }

            throw error;
        }
    }

    /**
     * Validate input before processing
     * @param {Object} input - Input to validate
     * @param {Object} context - Processing context
     * @returns {Object} Validation result
     */
    validateInput(input, context) {
        const validation = super.validateInput(input, context);
        if (!validation.valid) {
            return validation;
        }

        // Additional validation specific to vectorization
        if (typeof input.content !== 'string' || input.content.trim().length === 0) {
            return {
                valid: false,
                error: 'Content must be a non-empty string'
            };
        }

        // Check content length
        const maxLength = context.settings?.maxContentLength || 100000;
        if (input.content.length > maxLength) {
            return {
                valid: false,
                error: `Content exceeds maximum length of ${maxLength} characters`
            };
        }

        return { valid: true };
    }

    /**
     * Check if processor can handle the input
     * @param {Object} input - Input to check
     * @param {Object} context - Processing context
     * @returns {boolean} True if can process
     */
    canProcess(input, context) {
        // Check if adapter is available and configured
        if (!this.adapter || typeof this.adapter.vectorize !== 'function') {
            logger.warn('VectorizationAdapter not properly configured');
            return false;
        }

        // Check if we have valid input
        if (!input || !input.content) {
            return false;
        }

        // Check if source is supported
        const source = input.metadata?.source || context.settings?.source;
        if (source && !this.adapter.isSourceAvailable?.(source)) {
            logger.warn(`Vectorization source not available: ${source}`);
            return false;
        }

        return true;
    }

    /**
     * Prepare chunks for vectorization
     * Converts content to chunks using text chunking logic
     * @private
     */
    prepareVectorizationChunks(content, metadata, vectorizationSettings) {
        const chunkSize = vectorizationSettings.chunk_size || 1000;
        const overlapPercent = vectorizationSettings.overlap_percent || 10;
        const forceChunkDelimiter = vectorizationSettings.force_chunk_delimiter;
        
        // Log metadata at the start of prepareVectorizationChunks
        logger.log('prepareVectorizationChunks received metadata:', {
            taskType: metadata.taskType,
            source: metadata.source,
            type: metadata.type,
            allKeys: Object.keys(metadata)
        });
        
        // Check if this is summary vectorization mode
        if (metadata.taskType === 'summary_vectorization' && 
            typeof content === 'string' && 
            content.includes('</history_story>')) {
            logger.log('Using history_story tag-based chunking for summary vectorization');
            logger.log(`Content preview: ${content.substring(0, 200)}...`);
            return this.splitByHistoryStoryTags(content, metadata, chunkSize, overlapPercent);
        }
        
        let chunks = [];
        
        // Handle different content types
        if (Array.isArray(content)) {
            // IMPORTANT: Don't merge array items! Each item should be processed separately
            // This preserves individual item metadata and boundaries
            logger.log(`Processing array content with ${content.length} items`);
            
            for (let i = 0; i < content.length; i++) {
                const item = content[i];
                let itemText = '';
                let itemMetadata = { ...metadata };
                
                // Log the initial itemMetadata (should include taskType from parent metadata)
                logger.log(`Array item ${i} - initial itemMetadata:`, {
                    taskType: itemMetadata.taskType,
                    source: itemMetadata.source,
                    allKeys: Object.keys(itemMetadata)
                });
                
                // Extract text and metadata from each item
                if (typeof item === 'string') {
                    itemText = item;
                } else if (item && typeof item === 'object') {
                    itemText = item.text || item.content || String(item);
                    // Preserve original item metadata but don't override critical fields
                    if (item.metadata) {
                        logger.log(`Array item ${i} has its own metadata, merging...`);
                        // Keep taskType from parent metadata if it exists
                        const preservedTaskType = itemMetadata.taskType;
                        itemMetadata = { ...itemMetadata, ...item.metadata };
                        if (preservedTaskType) {
                            itemMetadata.taskType = preservedTaskType;
                        }
                    }
                    if (item.id) itemMetadata.originalId = item.id;
                    if (item.type) itemMetadata.originalType = item.type;
                    if (item.index !== undefined) itemMetadata.originalIndex = item.index;
                } else {
                    itemText = String(item);
                }
                
                // Log the final itemMetadata after merging
                logger.log(`Array item ${i} - final itemMetadata:`, {
                    taskType: itemMetadata.taskType,
                    source: itemMetadata.source,
                    originalType: itemMetadata.originalType,
                    allKeys: Object.keys(itemMetadata)
                });
                
                // Skip empty items
                if (!itemText.trim()) {
                    logger.log(`Skipping empty item at index ${i}`);
                    continue;
                }
                
                // Debug: Log item metadata for summary vectorization
                if (itemMetadata.taskType === 'summary_vectorization') {
                    logger.log(`[DEBUG] Summary vectorization item ${i}:`, {
                        taskType: itemMetadata.taskType,
                        hasHistoryStoryTag: itemText.includes('</history_story>'),
                        textLength: itemText.length,
                        textPreview: itemText.substring(0, 300)
                    });
                }
                
                // Check if this is summary vectorization mode with history_story tags
                if (itemMetadata.taskType === 'summary_vectorization' && 
                    itemText.includes('</history_story>')) {
                    logger.log(`Using history_story tag-based chunking for array item ${i}`);
                    logger.log(`Item preview: ${itemText.substring(0, 200)}...`);
                    const tagChunks = this.splitByHistoryStoryTags(itemText, itemMetadata, chunkSize, overlapPercent);
                    chunks.push(...tagChunks);
                    continue;
                } else if (itemMetadata.taskType === 'summary_vectorization') {
                    logger.warn(`[WARNING] Summary vectorization item ${i} does not contain history_story tags!`);
                }
                
                // For large items, split into chunks; for small items, keep as single chunk
                if (itemText.length > chunkSize) {
                    const itemChunks = this.splitTextIntoChunks(itemText, chunkSize, overlapPercent, forceChunkDelimiter);
                    itemChunks.forEach((chunkText, chunkIndex) => {
                        chunks.push({
                            text: chunkText,
                            metadata: {
                                ...itemMetadata,
                                item_index: i,
                                item_total: content.length,
                                chunk_index: chunkIndex,
                                chunk_total: itemChunks.length,
                                is_chunked: true
                            }
                        });
                    });
                } else {
                    // Keep small items as single chunks
                    chunks.push({
                        text: itemText,
                        metadata: {
                            ...itemMetadata,
                            item_index: i,
                            item_total: content.length,
                            chunk_index: 0,
                            chunk_total: 1,
                            is_chunked: false
                        }
                    });
                }
            }
            
            logger.log(`Converted ${content.length} array items into ${chunks.length} chunks`);
            
        } else if (typeof content === 'string') {
            // Single string content - split into chunks
            const textChunks = this.splitTextIntoChunks(content, chunkSize, overlapPercent, forceChunkDelimiter);
            chunks = textChunks.map((chunkText, index) => ({
                text: chunkText,
                metadata: {
                    ...metadata,
                    chunk_index: index,
                    chunk_total: textChunks.length,
                    is_chunked: textChunks.length > 1
                }
            }));
        } else if (content && content.text) {
            // Object with text property
            const textChunks = this.splitTextIntoChunks(content.text, chunkSize, overlapPercent, forceChunkDelimiter);
            chunks = textChunks.map((chunkText, index) => ({
                text: chunkText,
                metadata: {
                    ...metadata,
                    chunk_index: index,
                    chunk_total: textChunks.length,
                    is_chunked: textChunks.length > 1
                }
            }));
        } else {
            // Fallback: convert to string and process
            const textContent = String(content);
            const textChunks = this.splitTextIntoChunks(textContent, chunkSize, overlapPercent, forceChunkDelimiter);
            chunks = textChunks.map((chunkText, index) => ({
                text: chunkText,
                metadata: {
                    ...metadata,
                    chunk_index: index,
                    chunk_total: textChunks.length,
                    is_chunked: textChunks.length > 1
                }
            }));
        }
        
        return chunks;
    }
    
    /**
     * Split text into chunks (adapted from main system)
     * @private
     */
    splitTextIntoChunks(text, chunkSize = 1000, overlapPercent = 10, forceChunkDelimiter = null) {
        if (!text || text.length <= chunkSize) {
            return [text];
        }
        
        // 如果提供了自定义分隔符，先尝试按分隔符分割
        if (forceChunkDelimiter && forceChunkDelimiter.trim()) {
            const delimiter = forceChunkDelimiter.trim();
            const parts = text.split(delimiter);
            
            // 如果分割成功且产生了多个部分
            if (parts.length > 1) {
                const delimiterChunks = [];
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    
                    // 处理每个部分
                    if (part.length <= chunkSize) {
                        // 如果部分小于 chunkSize，直接作为一个块
                        if (part.trim()) {
                            delimiterChunks.push(part.trim());
                        }
                    } else {
                        // 如果部分大于 chunkSize，需要进一步分割
                        const subChunks = this.splitTextIntoChunksWithoutDelimiter(part, chunkSize, overlapPercent);
                        delimiterChunks.push(...subChunks);
                    }
                }
                
                return delimiterChunks.filter(chunk => chunk.length > 0);
            }
        }
        
        // 如果没有自定义分隔符或分隔符分割失败，使用原有的智能分割逻辑
        return this.splitTextIntoChunksWithoutDelimiter(text, chunkSize, overlapPercent);
    }
    
    /**
     * 原有的智能分块逻辑（不使用自定义分隔符）
     * @private
     */
    splitTextIntoChunksWithoutDelimiter(text, chunkSize = 1000, overlapPercent = 10) {
        const chunks = [];
        const overlapSize = Math.floor(chunkSize * overlapPercent / 100);
        let start = 0;
        
        while (start < text.length) {
            let end = start + chunkSize;
            
            // If this isn't the last chunk, try to break at a sentence or word boundary
            if (end < text.length) {
                // Look for sentence boundary first (支持中英文标点)
                const sentenceMarkers = [
                    '.', '?', '!',  // 英文标点
                    '。', '？', '！', // 中文标点
                    '\n'            // 换行符也是自然边界
                ];
                
                let bestEnd = -1;
                for (const marker of sentenceMarkers) {
                    const markerIndex = text.lastIndexOf(marker, end);
                    if (markerIndex > start + chunkSize * 0.7 && markerIndex > bestEnd) {
                        bestEnd = markerIndex;
                    }
                }
                
                if (bestEnd > -1) {
                    // 在标点后移动一位（除了换行符）
                    end = bestEnd + (text[bestEnd] === '\n' ? 0 : 1);
                } else {
                    // Fall back to word boundary (for English text)
                    const spaceIndex = text.lastIndexOf(' ', end);
                    if (spaceIndex > start + chunkSize * 0.7) {
                        end = spaceIndex;
                    }
                    // 对于纯中文文本，如果没有找到合适的分割点，就直接按长度切分
                }
            }
            
            const chunk = text.slice(start, end).trim();
            if (chunk) {
                chunks.push(chunk);
            }
            
            // Move start position with overlap
            start = end - overlapSize;
            
            // Ensure we don't go backwards
            if (start <= chunks.length > 1 ? text.indexOf(chunks[chunks.length - 2]) : 0) {
                start = end;
            }
        }
        
        return chunks.filter(chunk => chunk.length > 0);
    }
    
    /**
     * Generate hash for text content
     * @private
     */
    generateHash(text) {
        // Simple hash function - in production you might want to use a better one
        let hash = 0;
        if (text.length === 0) return hash.toString();
        
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return Math.abs(hash).toString(36);
    }
    
    /**
     * Prepare items for vectorization (legacy method, kept for compatibility)
     * @private
     */
    prepareItems(content, metadata) {
        // If content is already an array of items, use it
        if (Array.isArray(content)) {
            return content;
        }

        // If content is a string, create a single item
        if (typeof content === 'string') {
            return [{
                id: metadata.id || `item_${Date.now()}`,
                text: content,
                metadata: metadata
            }];
        }

        // If content is an object with text property
        if (content && content.text) {
            return [{
                id: content.id || metadata.id || `item_${Date.now()}`,
                text: content.text,
                metadata: { ...metadata, ...content.metadata }
            }];
        }

        // Default: convert to string and create item
        return [{
            id: metadata.id || `item_${Date.now()}`,
            text: String(content),
            metadata: metadata
        }];
    }

    /**
     * Initialize the processor
     * @param {Object} config - Initialization configuration
     */
    async initialize(config) {
        logger.log('Initializing VectorizationProcessor');
        
        // Merge configuration
        this.config = { ...this.config, ...config };
        
        // Initialize adapter if it has an init method
        if (this.adapter.initialize && typeof this.adapter.initialize === 'function') {
            await this.adapter.initialize();
        }
    }

    /**
     * Destroy the processor
     */
    async destroy() {
        logger.log('Destroying VectorizationProcessor');
        
        // Cleanup adapter if it has a cleanup method
        if (this.adapter.destroy && typeof this.adapter.destroy === 'function') {
            await this.adapter.destroy();
        }
    }

    /**
     * Get processor statistics
     * @returns {Object} Processor stats
     */
    getStats() {
        return {
            type: this.getType(),
            name: this.getName(),
            available: this.adapter !== null,
            config: this.config
        };
    }
    
    /**
     * Split content by <history_story> tags for summary vectorization
     * @param {string} content - The content containing history_story tags
     * @param {Object} metadata - Metadata for chunks
     * @param {number} maxChunkSize - Maximum size for secondary chunking (3000 chars)
     * @param {number} overlapPercent - Overlap percentage for secondary chunking
     * @returns {Array} Array of chunks
     * @private
     */
    splitByHistoryStoryTags(content, metadata, maxChunkSize, overlapPercent) {
        const chunks = [];
        const regex = /<history_story>(.*?)<\/history_story>/gs;
        const matches = [...content.matchAll(regex)];
        
        if (matches.length === 0) {
            logger.warn('No history_story tags found in content, falling back to normal chunking');
            return this.splitTextIntoChunks(content, maxChunkSize, overlapPercent, metadata.forceChunkDelimiter).map((chunkText, index) => ({
                text: chunkText,
                metadata: {
                    ...metadata,
                    chunk_index: index,
                    chunk_total: 1,
                    is_chunked: false
                }
            }));
        }
        
        logger.log(`Found ${matches.length} history_story tags`);
        
        matches.forEach((match, tagIndex) => {
            const tagContent = match[1].trim();
            
            // If content exceeds 3000 characters, perform secondary chunking
            if (tagContent.length > 3000) {
                logger.log(`History story tag ${tagIndex} exceeds 3000 chars (${tagContent.length}), applying secondary chunking`);
                
                const secondaryChunks = this.splitTextIntoChunks(tagContent, maxChunkSize, overlapPercent, metadata.forceChunkDelimiter);
                
                secondaryChunks.forEach((chunkText, chunkIndex) => {
                    chunks.push({
                        text: chunkText,
                        metadata: {
                            ...metadata,
                            history_story_index: tagIndex,
                            history_story_total: matches.length,
                            chunk_index: chunkIndex,
                            chunk_total: secondaryChunks.length,
                            is_chunked: true,
                            chunk_type: 'history_story',
                            original_length: tagContent.length
                        }
                    });
                });
            } else {
                // Keep as single chunk
                chunks.push({
                    text: tagContent,
                    metadata: {
                        ...metadata,
                        history_story_index: tagIndex,
                        history_story_total: matches.length,
                        chunk_index: 0,
                        chunk_total: 1,
                        is_chunked: false,
                        chunk_type: 'history_story',
                        original_length: tagContent.length
                    }
                });
            }
        });
        
        logger.log(`Split ${matches.length} history_story tags into ${chunks.length} chunks`);
        return chunks;
    }
}