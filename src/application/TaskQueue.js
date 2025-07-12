// eventBus will be accessed via window.eventBus to avoid circular dependencies

/**
 * Lightweight task queue implementation.
 * Manages task execution with priority support and single-task concurrency.
 */
export class TaskQueue {
    constructor() {
        /**
         * @type {Array} Queue of pending tasks
         */
        this.queue = [];
        
        /**
         * @type {boolean} Whether queue is currently processing
         */
        this.running = false;
        
        /**
         * @type {BaseTask|null} Currently executing task
         */
        this.currentTask = null;
        
        /**
         * @type {number} Maximum concurrent tasks (currently limited to 1)
         */
        this.maxConcurrent = 1;
        
        /**
         * @type {AbortController|null} Abort controller for current task
         */
        this.abortController = null;
    }

    /**
     * Add task to queue
     * @param {BaseTask} task - Task to enqueue
     * @returns {Promise<void>}
     */
    async enqueue(task) {
        // Add to queue
        this.queue.push(task);
        
        // Sort by priority (higher priority first)
        // If no priority is set, treat as priority 0
        this.queue.sort((a, b) => {
            const priorityA = a.metadata?.priority || 0;
            const priorityB = b.metadata?.priority || 0;
            return priorityB - priorityA;
        });
        
        // Emit event
        if (typeof window !== 'undefined' && window.eventBus) {
            window.eventBus.emit('queue:task-added', { task, queueLength: this.queue.length });
        }
        
        // Start processing if not already running
        if (!this.running) {
            this.processQueue();
        }
    }

    /**
     * Remove and return next task from queue
     * @returns {BaseTask|null} Next task or null if queue empty
     */
    dequeue() {
        return this.queue.shift() || null;
    }

    /**
     * Process tasks in queue
     * @returns {Promise<void>}
     */
    async processQueue() {
        if (this.running || this.queue.length === 0) {
            return;
        }

        this.running = true;

        while (this.queue.length > 0) {
            this.currentTask = this.dequeue();
            
            if (!this.currentTask) {
                break;
            }

            try {
                // Update task status
                this.currentTask.updateStatus('running');
                
                // Create abort controller for this task
                this.abortController = new AbortController();
                
                // Emit start event
                if (typeof window !== 'undefined' && window.eventBus) {
                    window.eventBus.emit('queue:task-started', { task: this.currentTask });
                }
                
                // Execute task
                await this.currentTask.execute();
                
                // Update status on success
                this.currentTask.updateStatus('completed');
                
                // Emit completion event
                if (typeof window !== 'undefined' && window.eventBus) {
                    window.eventBus.emit('queue:task-completed', { task: this.currentTask });
                }
                
            } catch (error) {
                console.error('TaskQueue: Task execution failed:', error);
                
                // Update task status
                this.currentTask.updateStatus('failed');
                
                // Store error in task result
                this.currentTask.result = {
                    error: error.message,
                    stack: error.stack
                };
                
                // Emit failure event
                if (typeof window !== 'undefined' && window.eventBus) {
                    window.eventBus.emit('queue:task-failed', { 
                        task: this.currentTask, 
                        error: error 
                    });
                }
            } finally {
                // Clean up
                this.abortController = null;
            }
        }

        this.running = false;
        this.currentTask = null;
        
        // Emit queue empty event
        if (typeof window !== 'undefined' && window.eventBus) {
            window.eventBus.emit('queue:empty');
        }
    }

    /**
     * Cancel currently running task
     * @returns {Promise<void>}
     */
    async cancelCurrent() {
        if (!this.currentTask) {
            return;
        }

        try {
            // Abort if controller exists
            if (this.abortController) {
                this.abortController.abort();
            }
            
            // Call task's cancel method
            if (this.currentTask.cancel) {
                await this.currentTask.cancel();
            }
            
            // Emit cancellation event
            if (typeof window !== 'undefined' && window.eventBus) {
                window.eventBus.emit('queue:task-cancelled', { task: this.currentTask });
            }
            
        } catch (error) {
            console.error('TaskQueue: Failed to cancel task:', error);
        }
    }

    /**
     * Clear all pending tasks from queue
     * @returns {number} Number of tasks cleared
     */
    clear() {
        const count = this.queue.length;
        this.queue = [];
        
        if (typeof window !== 'undefined' && window.eventBus) {
            window.eventBus.emit('queue:cleared', { count });
        }
        
        return count;
    }

    /**
     * Get current queue status
     * @returns {Object} Queue status
     */
    getStatus() {
        return {
            running: this.running,
            queueLength: this.queue.length,
            currentTask: this.currentTask ? {
                id: this.currentTask.id,
                type: this.currentTask.type,
                status: this.currentTask.status
            } : null
        };
    }

    /**
     * Get all pending tasks
     * @returns {Array<BaseTask>} Array of pending tasks
     */
    getPendingTasks() {
        return [...this.queue];
    }

    /**
     * Remove a specific task from queue
     * @param {string} taskId - Task ID to remove
     * @returns {boolean} True if task was found and removed
     */
    removeTask(taskId) {
        const initialLength = this.queue.length;
        this.queue = this.queue.filter(task => task.id !== taskId);
        
        const removed = this.queue.length < initialLength;
        if (removed && typeof window !== 'undefined' && window.eventBus) {
            window.eventBus.emit('queue:task-removed', { taskId });
        }
        
        return removed;
    }

    /**
     * Get abort signal for current task
     * Used by vectorization to support cancellation
     * @returns {AbortSignal|null}
     */
    getAbortSignal() {
        return this.abortController?.signal || null;
    }
}