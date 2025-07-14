import { VectorizationTask } from './VectorizationTask.js';

/**
 * External vectorization task implementation.
 * Represents a vectorization task imported from another chat.
 * @extends VectorizationTask
 */
export class ExternalVectorizationTask extends VectorizationTask {
    /**
     * @param {Object} config - Task configuration
     * @param {string} config.sourceChat - Source chat identifier
     * @param {string} config.sourceTaskId - Original task ID from source chat
     * @param {boolean} [config.skipDeduplication=true] - Skip deduplication checks
     * @param {Object} [config.mapping] - Mapping for content references
     */
    constructor(config) {
        super({
            ...config,
            type: 'external-vectorization'
        });
        
        // External task specific fields
        this.sourceChat = config.sourceChat;
        this.sourceTaskId = config.sourceTaskId;
        this.skipDeduplication = config.skipDeduplication !== false; // Default true
        this.mapping = config.mapping || {
            // Mapping for file URLs, world info UIDs, etc. if they differ
            files: {},
            worldInfo: {}
        };
        
        // Mark as external task
        this.isExternal = true;
        
        // External tasks have a special naming convention
        if (!this.name) {
            this.name = `外挂自 ${this.sourceChat} - ${this.name || '未命名任务'}`;
        }
    }

    /**
     * Override toJSON to include external task fields
     * @returns {Object} Serializable task data
     */
    toJSON() {
        const baseJson = super.toJSON();
        return {
            ...baseJson,
            sourceChat: this.sourceChat,
            sourceTaskId: this.sourceTaskId,
            skipDeduplication: this.skipDeduplication,
            mapping: this.mapping,
            isExternal: this.isExternal
        };
    }

    /**
     * Create from existing vectorization task
     * @param {VectorizationTask} sourceTask - Source task to copy
     * @param {string} targetChatId - Target chat ID
     * @param {Object} options - Additional options
     * @returns {ExternalVectorizationTask}
     */
    static fromVectorizationTask(sourceTask, targetChatId, options = {}) {
        const config = {
            ...sourceTask.toJSON(),
            id: ExternalVectorizationTask.generateTaskId(),
            chatId: targetChatId,
            sourceChat: sourceTask.chatId,
            sourceTaskId: sourceTask.id,
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...options
        };
        
        return new ExternalVectorizationTask(config);
    }

    /**
     * Validate external task
     * @returns {Promise<boolean>}
     */
    async validate() {
        const baseValid = await super.validate();
        if (!baseValid) return false;

        // Check external task specific requirements
        if (!this.sourceChat || !this.sourceTaskId) {
            console.warn('ExternalVectorizationTask: Missing source information');
            return false;
        }

        return true;
    }

    /**
     * Get collection ID for external task
     * Uses target chat ID but can reference source collection
     * @returns {string}
     */
    getCollectionId() {
        // External tasks use the target chat's collection
        return `${this.chatId}_${this.id}`;
    }

    /**
     * Get source collection ID
     * @returns {string}
     */
    getSourceCollectionId() {
        return `${this.sourceChat}_${this.sourceTaskId}`;
    }

    /**
     * Check if content needs mapping
     * @returns {boolean}
     */
    needsContentMapping() {
        return Object.keys(this.mapping.files).length > 0 || 
               Object.keys(this.mapping.worldInfo).length > 0;
    }

    /**
     * Apply content mapping to text content
     * @param {Array} textContent - Original text content
     * @returns {Array} Mapped text content
     */
    applyContentMapping(textContent) {
        if (!this.needsContentMapping()) {
            return textContent;
        }

        return textContent.map(item => {
            const mappedItem = { ...item };

            // Map file references
            if (item.metadata?.url && this.mapping.files[item.metadata.url]) {
                mappedItem.metadata = {
                    ...mappedItem.metadata,
                    url: this.mapping.files[item.metadata.url],
                    originalUrl: item.metadata.url
                };
            }

            // Map world info references
            if (item.metadata?.uid && this.mapping.worldInfo[item.metadata.uid]) {
                mappedItem.metadata = {
                    ...mappedItem.metadata,
                    uid: this.mapping.worldInfo[item.metadata.uid],
                    originalUid: item.metadata.uid
                };
            }

            return mappedItem;
        });
    }
}