import { ITask } from './ITask.js';

/**
 * Base class for all task implementations.
 * Provides common functionality and state management.
 * @implements {ITask}
 */
export class BaseTask extends ITask {
    /**
     * @param {Object} config - Task configuration
     * @param {string} [config.id] - Task ID (generated if not provided)
     * @param {string} config.type - Task type
     * @param {string} [config.status='pending'] - Task status
     * @param {string} config.chatId - Associated chat ID
     * @param {number} [config.createdAt] - Creation timestamp
     * @param {number} [config.updatedAt] - Last update timestamp
     * @param {Object} [config.metadata={}] - Additional metadata
     * @param {string} [config.name] - Task name
     * @param {boolean} [config.enabled=true] - Whether task is enabled
     * @param {Object} [config.result] - Task execution result
     * @param {Object} [config.dependencies] - Task dependencies
     * @param {string} [config.version='1.0'] - Task format version
     */
    constructor(config) {
        super();
        this.id = config.id;
        this.type = config.type;
        this.status = config.status || 'pending';
        this.chatId = config.chatId;
        this.createdAt = config.createdAt || Date.now();
        this.updatedAt = config.updatedAt || Date.now();
        this.metadata = config.metadata || {};
        this.name = config.name || '';
        this.enabled = config.enabled !== undefined ? config.enabled : true;
        this.result = config.result || null;
        this.dependencies = config.dependencies || {
            parent: null,
            children: [],
            requires: []
        };
        // 新增：任务格式版本
        this.version = config.version || '1.0';
    }

    /**
     * Update task status and emit event
     * @param {string} status - New status
     */
    updateStatus(status) {
        const oldStatus = this.status;
        this.status = status;
        this.updatedAt = Date.now();

        // Emit status change event if eventBus is available globally
        if (typeof window !== 'undefined' && window.eventBus) {
            window.eventBus.emit('task:status-changed', {
                task: this,
                oldStatus,
                newStatus: status
            });
        }
    }

    /**
     * Convert task to JSON for storage
     * @returns {Object} Serializable task data
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            status: this.status,
            chatId: this.chatId,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata,
            name: this.name,
            enabled: this.enabled,
            result: this.result,
            dependencies: this.dependencies,
            version: this.version
        };
    }

    /**
     * Create task instance from JSON data
     * @param {Object} json - Serialized task data
     * @returns {BaseTask} Task instance
     */
    static fromJSON(json) {
        return new this(json);
    }

    /**
     * Default implementation - can be overridden
     * @returns {Promise<boolean>}
     */
    async validate() {
        // Basic validation - check required fields
        if (!this.id || !this.type || !this.chatId) {
            return false;
        }
        return true;
    }

    /**
     * Default implementation - should be overridden
     * @returns {Promise<void>}
     */
    async execute() {
        throw new Error('execute() must be implemented by subclasses');
    }

    /**
     * Default implementation - should be overridden
     * @returns {Promise<void>}
     */
    async cancel() {
        this.updateStatus('cancelled');
    }

    /**
     * Check if a task is a legacy task (version 1.0 or missing version)
     * @param {Object} task - Task object to check
     * @returns {boolean} True if task is legacy format
     */
    static isLegacyTask(task) {
        return !task.version || task.version === '1.0';
    }
}