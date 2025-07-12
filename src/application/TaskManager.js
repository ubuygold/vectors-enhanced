import { TaskFactory } from '../core/tasks/TaskFactory.js';
import { TaskQueue } from './TaskQueue.js';

/**
 * Task Manager - Coordinates new and old task systems.
 * Ensures backward compatibility while introducing new task features.
 */
export class TaskManager {
    /**
     * @param {ConfigManager} configManager - Configuration manager instance
     */
    constructor(configManager) {
        this.configManager = configManager;
        this.storage = null; // Will be initialized later
        this.eventBus = null; // Will be initialized later
        this.queue = new TaskQueue();
        this.cache = new Map(); // Cache for frequently accessed tasks
        this.legacyMode = false; // Flag to disable new system if needed
    }

    /**
     * Initialize TaskManager with dependencies
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            console.log('TaskManager: Initializing...');
            
            // Create TaskStorageAdapter lazily
            const { TaskStorageAdapter } = await import('../infrastructure/storage/TaskStorageAdapter.js');
            this.storage = new TaskStorageAdapter(this.configManager);
            
            // Get eventBus from global scope or create minimal implementation
            if (typeof window !== 'undefined' && window.eventBus) {
                this.eventBus = window.eventBus;
            } else {
                // Create minimal event bus for standalone operation
                this.eventBus = {
                    emit: (event, data) => console.debug(`TaskManager event: ${event}`, data)
                };
            }
            
            console.log('TaskManager: Initialized successfully');
        } catch (error) {
            console.error('TaskManager: Initialization failed:', error);
            // Set legacy mode on failure
            this.legacyMode = true;
            throw error;
        }
    }

    /**
     * Initialize TaskManager with dependencies
     * @param {Object} dependencies - Dependencies object
     * @param {TaskStorageAdapter} dependencies.taskStorage - Storage adapter
     * @param {EventBus} dependencies.eventBus - Event bus
     * @returns {TaskManager} TaskManager instance
     */
    static init(dependencies) {
        const instance = new TaskManager(
            dependencies.taskStorage,
            dependencies.eventBus
        );
        return instance;
    }

    /**
     * Create and save a task (dual-write for backward compatibility)
     * @param {string} type - Task type
     * @param {Object} config - Task configuration
     * @returns {Promise<BaseTask>} Created task
     */
    async createTask(type, config) {
        try {
            // Create new format task
            const task = TaskFactory.createTask(type, config);
            
            // Validate task
            if (!await task.validate()) {
                throw new Error('Task validation failed');
            }
            
            // Save to new system
            await this.storage.saveTask(task);
            
            // Clear cache for this chat
            this.clearCacheForChat(task.chatId);
            
            // Backward compatibility: save legacy format for vectorization tasks
            if (type === 'vectorization' && !this.legacyMode) {
                try {
                    const legacyTask = task.toLegacyFormat();
                    await this.saveLegacyTask(config.chatId, legacyTask);
                } catch (error) {
                    console.warn('TaskManager: Failed to save legacy format, continuing with new format only:', error);
                }
            }
            
            // Emit event
            if (this.eventBus) {
                this.eventBus.emit('task:created', task);
            }
            
            return task;
            
        } catch (error) {
            console.error('TaskManager: Failed to create task:', error);
            throw error;
        }
    }

    /**
     * Get all tasks for a chat (merges new and legacy formats)
     * @param {string} chatId - Chat identifier
     * @returns {Promise<Array<BaseTask>>} Array of tasks
     */
    async getTasks(chatId) {
        // Check cache first
        const cacheKey = `tasks_${chatId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // Get new format tasks
            const newTasks = await this.storage.getTasks(chatId);
            
            // Get legacy tasks and convert them
            const legacyTasks = this.storage.getLegacyTasks(chatId);
            const convertedTasks = TaskFactory.convertLegacyTasks(legacyTasks);
            
            // Merge tasks, avoiding duplicates
            const taskMap = new Map();
            
            // Add converted legacy tasks first
            convertedTasks.forEach(task => {
                taskMap.set(task.id, task);
            });
            
            // Override with new format tasks (they take precedence)
            newTasks.forEach(task => {
                taskMap.set(task.id, task);
            });
            
            const mergedTasks = Array.from(taskMap.values());
            
            // Cache the result
            this.cache.set(cacheKey, mergedTasks);
            
            return mergedTasks;
            
        } catch (error) {
            console.error('TaskManager: Failed to get tasks:', error);
            // Fallback to legacy only if new system fails
            const legacyTasks = this.storage.getLegacyTasks(chatId);
            return TaskFactory.convertLegacyTasks(legacyTasks);
        }
    }

    /**
     * Get tasks synchronously (for backward compatibility with getChatTasks)
     * @param {string} chatId - Chat identifier
     * @returns {Array} Array of tasks in legacy format
     */
    getTasksSync(chatId) {
        // This is a compatibility method for synchronous code
        // It returns legacy format tasks immediately
        const legacyTasks = this.storage.getLegacyTasks(chatId);
        
        // Also check if we have cached new format tasks
        const cacheKey = `tasks_${chatId}`;
        if (this.cache.has(cacheKey)) {
            const cachedTasks = this.cache.get(cacheKey);
            // Convert to legacy format for compatibility
            return cachedTasks.map(task => {
                if (task.type === 'vectorization') {
                    return task.toLegacyFormat();
                }
                // Non-vectorization tasks don't have legacy format
                return null;
            }).filter(Boolean);
        }
        
        return legacyTasks;
    }

    /**
     * Get a single task by ID
     * @param {string} chatId - Chat identifier
     * @param {string} taskId - Task identifier
     * @returns {Promise<BaseTask|null>} Task or null
     */
    async getTask(chatId, taskId) {
        const tasks = await this.getTasks(chatId);
        return tasks.find(t => t.id === taskId) || null;
    }

    /**
     * Update a task
     * @param {BaseTask} task - Task to update
     * @returns {Promise<void>}
     */
    async updateTask(task) {
        // Save to new system
        await this.storage.saveTask(task);
        
        // Clear cache
        this.clearCacheForChat(task.chatId);
        
        // Update legacy format if it's a vectorization task
        if (task.type === 'vectorization' && !this.legacyMode) {
            try {
                const legacyTask = task.toLegacyFormat();
                await this.saveLegacyTask(task.chatId, legacyTask);
            } catch (error) {
                console.warn('TaskManager: Failed to update legacy format:', error);
            }
        }
        
        // Emit event
        if (this.eventBus) {
            this.eventBus.emit('task:updated', task);
        }
    }

    /**
     * Delete a task (from both systems)
     * @param {string} chatId - Chat identifier
     * @param {string} taskId - Task identifier
     * @returns {Promise<void>}
     */
    async deleteTask(chatId, taskId) {
        try {
            // Delete from new system
            await this.storage.deleteTask(chatId, taskId);
            
            // Delete from legacy system
            await this.storage.deleteLegacyTask(chatId, taskId);
            
            // Clear cache
            this.clearCacheForChat(chatId);
            
            // Emit event
            if (this.eventBus) {
                this.eventBus.emit('task:deleted', { chatId, taskId });
            }
            
        } catch (error) {
            console.error('TaskManager: Failed to delete task:', error);
            throw error;
        }
    }

    /**
     * Execute a task
     * @param {string} taskId - Task ID
     * @param {string} chatId - Chat ID
     * @returns {Promise<void>}
     */
    async executeTask(taskId, chatId) {
        const task = await this.getTask(chatId, taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }
        
        // Update status and enqueue
        task.updateStatus('queued');
        await this.updateTask(task);
        
        // Add to queue
        await this.queue.enqueue(task);
    }

    /**
     * Save legacy task (compatibility method)
     * @param {string} chatId - Chat identifier
     * @param {Object} legacyTask - Legacy task object
     * @returns {Promise<void>}
     */
    async saveLegacyTask(chatId, legacyTask) {
        // If the global addVectorTask function exists, use it
        if (typeof window !== 'undefined' && window.addVectorTask) {
            await window.addVectorTask(chatId, legacyTask);
        } else {
            // Otherwise use storage adapter directly
            await this.storage.saveLegacyTask(chatId, legacyTask);
        }
    }

    /**
     * Clear cache for a specific chat
     * @param {string} chatId - Chat identifier
     */
    clearCacheForChat(chatId) {
        const cacheKey = `tasks_${chatId}`;
        this.cache.delete(cacheKey);
    }

    /**
     * Clear entire cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get queue status
     * @returns {Object} Queue status
     */
    getQueueStatus() {
        return this.queue.getStatus();
    }

    /**
     * Cancel current task
     * @returns {Promise<void>}
     */
    async cancelCurrentTask() {
        await this.queue.cancelCurrent();
    }

    /**
     * Get abort signal for current task
     * @returns {AbortSignal|null}
     */
    getAbortSignal() {
        return this.queue.getAbortSignal();
    }

    /**
     * Enable/disable legacy mode (disables new system features)
     * @param {boolean} enabled - Whether to enable legacy mode
     */
    setLegacyMode(enabled) {
        this.legacyMode = enabled;
        console.log(`TaskManager: Legacy mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Check if a chat has any tasks
     * @param {string} chatId - Chat identifier
     * @returns {Promise<boolean>} True if tasks exist
     */
    async hasTasks(chatId) {
        const tasks = await this.getTasks(chatId);
        return tasks.length > 0;
    }

    /**
     * Migrate all legacy tasks to new format
     * @returns {Promise<number>} Number of chats migrated
     */
    async migrateAllLegacyTasks() {
        const chats = this.storage.getAllChatsWithTasks();
        let migrated = 0;
        
        for (const chatId of chats) {
            const count = await this.storage.migrateLegacyTasks(chatId);
            if (count > 0) {
                migrated++;
                this.clearCacheForChat(chatId);
            }
        }
        
        return migrated;
    }
}