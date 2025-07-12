import { BaseTask } from './BaseTask.js';

/**
 * Vectorization task implementation.
 * Maintains backward compatibility with legacy task format.
 * @extends BaseTask
 */
export class VectorizationTask extends BaseTask {
    /**
     * @param {Object} config - Task configuration
     * @param {Object} config.settings - Vectorization settings (chat, files, world_info)
     * @param {boolean} [config.isIncremental=false] - Whether this is an incremental task
     * @param {boolean} [config.lightweight=false] - Whether to use lightweight storage
     * @param {Array} [config.textContent=[]] - Stored text content (for non-lightweight mode)
     * @param {number} [config.timestamp] - Creation timestamp (for legacy compatibility)
     * @param {string} [config.taskId] - Legacy task ID (for backward compatibility)
     */
    constructor(config) {
        super({
            ...config,
            type: 'vectorization',
            // Support legacy taskId field
            id: config.id || config.taskId || VectorizationTask.generateTaskId()
        });
        
        this.settings = config.settings || {
            chat: { enabled: false },
            files: { enabled: false, selected: [] },
            world_info: { enabled: false, selected: {} }
        };
        this.isIncremental = config.isIncremental || false;
        this.lightweight = config.lightweight || false;
        this.textContent = config.textContent || [];
        
        // For legacy compatibility
        this.timestamp = config.timestamp || this.createdAt;
        this.taskId = this.id; // Mirror id to taskId for legacy code
    }

    /**
     * Generate a task ID in the legacy format
     * @returns {string} Task ID
     */
    static generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Convert to legacy format for backward compatibility
     * @returns {Object} Legacy task object
     */
    toLegacyFormat() {
        return {
            taskId: this.id,
            name: this.name,
            timestamp: this.timestamp,
            enabled: this.enabled,
            settings: this.settings,
            textContent: this.textContent,
            lightweight: this.lightweight,
            isIncremental: this.isIncremental
        };
    }

    /**
     * Create from legacy task format
     * @param {Object} legacyTask - Legacy task object
     * @returns {VectorizationTask} New task instance
     */
    static fromLegacyTask(legacyTask) {
        return new VectorizationTask({
            id: legacyTask.taskId,
            name: legacyTask.name,
            timestamp: legacyTask.timestamp,
            enabled: legacyTask.enabled !== undefined ? legacyTask.enabled : true,
            settings: legacyTask.settings,
            textContent: legacyTask.textContent || [],
            lightweight: legacyTask.lightweight || false,
            isIncremental: legacyTask.isIncremental || false,
            status: 'completed', // Legacy tasks are always completed
            createdAt: legacyTask.timestamp || Date.now()
        });
    }

    /**
     * Override toJSON to include vectorization-specific fields
     * @returns {Object} Serializable task data
     */
    toJSON() {
        const baseJson = super.toJSON();
        return {
            ...baseJson,
            settings: this.settings,
            isIncremental: this.isIncremental,
            lightweight: this.lightweight,
            textContent: this.textContent,
            timestamp: this.timestamp,
            taskId: this.taskId // Include for legacy compatibility
        };
    }

    /**
     * Validate vectorization task settings
     * @returns {Promise<boolean>}
     */
    async validate() {
        // First run base validation
        const baseValid = await super.validate();
        if (!baseValid) return false;

        // Check if at least one content source is enabled
        const hasEnabledSource = 
            this.settings.chat?.enabled ||
            this.settings.files?.enabled ||
            this.settings.world_info?.enabled;

        if (!hasEnabledSource) {
            console.warn('VectorizationTask: No content sources enabled');
            return false;
        }

        return true;
    }

    /**
     * Execute vectorization task
     * Note: The actual vectorization logic remains in index.js for now
     * This is just a placeholder that maintains the task lifecycle
     * @returns {Promise<void>}
     */
    async execute() {
        // For now, this will be called from index.js with the actual implementation
        // This maintains separation of concerns while preserving existing logic
        this.updateStatus('running');
        
        // The actual vectorization will be performed by the existing code
        // This method will be enhanced in future phases
        console.log(`VectorizationTask ${this.id}: Execute called (placeholder)`);
    }

    /**
     * Cancel vectorization task
     * @returns {Promise<void>}
     */
    async cancel() {
        // Update status
        await super.cancel();
        
        // In future, this will integrate with AbortController
        console.log(`VectorizationTask ${this.id}: Cancelled`);
    }

    /**
     * Get collection ID for this task
     * @returns {string} Collection ID in format "chatId_taskId"
     */
    getCollectionId() {
        return `${this.chatId}_${this.id}`;
    }
}