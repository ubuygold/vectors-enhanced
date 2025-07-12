import { VectorizationTask } from './VectorizationTask.js';

/**
 * Factory class for creating task instances.
 * Supports both new task creation and legacy format conversion.
 */
export class TaskFactory {
    /**
     * Map of registered task types
     * @type {Map<string, Class>}
     */
    static taskTypes = new Map();

    /**
     * Register a task type
     * @param {string} type - Task type identifier
     * @param {Class} TaskClass - Task class constructor
     */
    static registerTaskType(type, TaskClass) {
        this.taskTypes.set(type, TaskClass);
    }

    /**
     * Generate a unique task ID
     * @returns {string} Task ID in format "task_timestamp_random"
     */
    static generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Create a task of specified type
     * @param {string} type - Task type
     * @param {Object} config - Task configuration
     * @returns {BaseTask} Task instance
     * @throws {Error} If task type is not registered
     */
    static createTask(type, config) {
        const TaskClass = this.taskTypes.get(type);
        if (!TaskClass) {
            throw new Error(`Unknown task type: ${type}`);
        }

        const task = new TaskClass({
            ...config,
            id: config.id || this.generateTaskId(),
            type: type
        });

        return task;
    }

    /**
     * Create task from legacy format
     * @param {Object} legacyTask - Legacy task object
     * @returns {VectorizationTask} Task instance
     */
    static fromLegacy(legacyTask) {
        // Currently only vectorization tasks exist in legacy format
        return VectorizationTask.fromLegacyTask(legacyTask);
    }

    /**
     * Convert multiple legacy tasks
     * @param {Array<Object>} legacyTasks - Array of legacy tasks
     * @returns {Array<VectorizationTask>} Array of task instances
     */
    static convertLegacyTasks(legacyTasks) {
        if (!Array.isArray(legacyTasks)) {
            return [];
        }
        return legacyTasks.map(task => this.fromLegacy(task));
    }

    /**
     * Check if a task object is in legacy format
     * @param {Object} task - Task object to check
     * @returns {boolean} True if legacy format
     */
    static isLegacyFormat(task) {
        // Legacy tasks have taskId instead of id and no type field
        return task && task.taskId && !task.type;
    }

    /**
     * Create or convert task based on format
     * @param {Object} taskData - Task data (could be new or legacy format)
     * @returns {BaseTask} Task instance
     */
    static createOrConvert(taskData) {
        if (this.isLegacyFormat(taskData)) {
            return this.fromLegacy(taskData);
        }
        return this.createTask(taskData.type, taskData);
    }
}

// Register default task types
TaskFactory.registerTaskType('vectorization', VectorizationTask);

// Future task types will be registered here:
// TaskFactory.registerTaskType('summary', SummaryTask);
// TaskFactory.registerTaskType('auto-vectorization', AutoVectorizationTask);
// TaskFactory.registerTaskType('rerank', RerankTask);
// 
// Example of registering a new task type:
// import { CustomTask } from './CustomTask.js';
// TaskFactory.registerTaskType('custom', CustomTask);