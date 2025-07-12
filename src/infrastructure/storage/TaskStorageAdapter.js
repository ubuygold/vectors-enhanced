import { TaskFactory } from '../../core/tasks/TaskFactory.js';
import { BaseTask } from '../../core/tasks/BaseTask.js';

/**
 * Storage adapter for task persistence.
 * Handles both new task format and legacy format for backward compatibility.
 */
export class TaskStorageAdapter {
    /**
     * @param {ConfigManager} configManager - Configuration manager instance
     */
    constructor(configManager) {
        this.configManager = configManager;
    }

    /**
     * Get all tasks for a chat (new format)
     * @param {string} chatId - Chat identifier
     * @returns {Promise<Array>} Array of task instances
     */
    async getTasks(chatId) {
        const tasksData = this.configManager.get(`tasks.${chatId}`) || [];
        
        // Convert each task data to proper task instance
        const tasks = [];
        for (const data of tasksData) {
            try {
                // Add version compatibility
                if (!data.version) {
                    data.version = '1.0'; // Mark as legacy version
                }
                
                const task = TaskFactory.createTask(data.type, data);
                tasks.push(task);
            } catch (error) {
                console.error('TaskStorageAdapter: Failed to create task from data:', error, data);
            }
        }
        
        return tasks;
    }

    /**
     * Save a task
     * @param {BaseTask} task - Task to save
     * @returns {Promise<void>}
     */
    async saveTask(task) {
        // Check if this is a legacy task
        if (BaseTask.isLegacyTask(task)) {
            return this.saveLegacyFormat(task);
        }
        
        const chatId = task.chatId;
        const tasks = await this.getTasks(chatId);
        
        // Find existing task index
        const index = tasks.findIndex(t => t.id === task.id);
        
        if (index >= 0) {
            // Update existing task
            tasks[index] = task;
        } else {
            // Add new task
            tasks.push(task);
        }
        
        // Save tasks data
        const tasksData = tasks.map(t => t.toJSON());
        this.configManager.set(`tasks.${chatId}`, tasksData);
    }

    /**
     * Delete a task
     * @param {string} chatId - Chat identifier
     * @param {string} taskId - Task identifier
     * @returns {Promise<void>}
     */
    async deleteTask(chatId, taskId) {
        const tasks = await this.getTasks(chatId);
        const filtered = tasks.filter(t => t.id !== taskId);
        
        const tasksData = filtered.map(t => t.toJSON());
        this.configManager.set(`tasks.${chatId}`, tasksData);
    }

    /**
     * Get legacy format tasks
     * @param {string} chatId - Chat identifier
     * @returns {Array} Array of legacy task objects
     */
    getLegacyTasks(chatId) {
        // Access legacy storage location
        const vectorTasks = this.configManager.get('vector_tasks') || {};
        return vectorTasks[chatId] || [];
    }

    /**
     * Save legacy format task (for backward compatibility)
     * @param {string} chatId - Chat identifier
     * @param {Object} legacyTask - Legacy task object
     * @returns {Promise<void>}
     */
    async saveLegacyTask(chatId, legacyTask) {
        const vectorTasks = this.configManager.get('vector_tasks') || {};
        const tasks = vectorTasks[chatId] || [];
        
        // Find existing task
        const index = tasks.findIndex(t => t.taskId === legacyTask.taskId);
        
        if (index >= 0) {
            // Update existing
            tasks[index] = legacyTask;
        } else {
            // Add new
            tasks.push(legacyTask);
        }
        
        // Update the vector_tasks object
        vectorTasks[chatId] = tasks;
        this.configManager.set('vector_tasks', vectorTasks);
    }

    /**
     * Delete legacy format task
     * @param {string} chatId - Chat identifier
     * @param {string} taskId - Task identifier
     * @returns {Promise<void>}
     */
    async deleteLegacyTask(chatId, taskId) {
        const vectorTasks = this.configManager.get('vector_tasks') || {};
        const tasks = vectorTasks[chatId] || [];
        const filtered = tasks.filter(t => t.taskId !== taskId);
        
        // Update the vector_tasks object
        vectorTasks[chatId] = filtered;
        this.configManager.set('vector_tasks', vectorTasks);
    }

    /**
     * Check if new task system has data for a chat
     * @param {string} chatId - Chat identifier
     * @returns {boolean} True if new format tasks exist
     */
    hasNewFormatTasks(chatId) {
        const tasks = this.configManager.get(`tasks.${chatId}`);
        return Array.isArray(tasks) && tasks.length > 0;
    }

    /**
     * Migrate legacy tasks to new format for a chat
     * @param {string} chatId - Chat identifier
     * @returns {Promise<number>} Number of tasks migrated
     */
    async migrateLegacyTasks(chatId) {
        const legacyTasks = this.getLegacyTasks(chatId);
        if (!legacyTasks || legacyTasks.length === 0) {
            return 0;
        }

        let migrated = 0;
        for (const legacyTask of legacyTasks) {
            try {
                const newTask = TaskFactory.fromLegacy(legacyTask);
                await this.saveTask(newTask);
                migrated++;
            } catch (error) {
                console.error('TaskStorageAdapter: Failed to migrate task:', error, legacyTask);
            }
        }

        return migrated;
    }

    /**
     * Get all chats that have tasks
     * @returns {Array<string>} Array of chat IDs
     */
    getAllChatsWithTasks() {
        const chats = new Set();
        
        // Check new format
        const allSettings = this.configManager.getAll();
        if (allSettings.tasks) {
            Object.keys(allSettings.tasks).forEach(chatId => {
                if (Array.isArray(allSettings.tasks[chatId]) && allSettings.tasks[chatId].length > 0) {
                    chats.add(chatId);
                }
            });
        }
        
        // Check legacy format
        if (allSettings.vector_tasks) {
            Object.keys(allSettings.vector_tasks).forEach(chatId => {
                if (Array.isArray(allSettings.vector_tasks[chatId]) && allSettings.vector_tasks[chatId].length > 0) {
                    chats.add(chatId);
                }
            });
        }
        
        return Array.from(chats);
    }

    /**
     * Save task in legacy format (for backward compatibility)
     * @param {BaseTask} task - Task to save
     * @returns {Promise<void>}
     * @private
     */
    async saveLegacyFormat(task) {
        // For version 1.0 tasks, save without version field to maintain compatibility
        const taskData = task.toJSON();
        delete taskData.version; // Remove version field for legacy format
        
        const chatId = task.chatId;
        const tasks = await this.getTasks(chatId);
        
        // Find existing task index
        const index = tasks.findIndex(t => t.id === task.id);
        
        if (index >= 0) {
            // Update existing task
            tasks[index] = task;
        } else {
            // Add new task
            tasks.push(task);
        }
        
        // Save tasks data without version field
        const tasksData = tasks.map(t => {
            const data = t.toJSON();
            if (BaseTask.isLegacyTask(t)) {
                delete data.version;
            }
            return data;
        });
        this.configManager.set(`tasks.${chatId}`, tasksData);
    }

    /**
     * Save task in new format (for future versions)
     * @param {BaseTask} task - Task to save
     * @returns {Promise<void>}
     * @private
     */
    async saveNewFormat(task) {
        // Save with all fields including version
        return this.saveTask(task);
    }
}