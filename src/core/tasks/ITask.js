/**
 * @interface
 * Represents the interface for a task.
 * All task implementations must implement these methods.
 */
export class ITask {
    /**
     * Execute the task.
     * This method contains the main logic of the task.
     * @returns {Promise<void>}
     */
    async execute() {
        throw new Error('ITask.execute() must be implemented by subclasses');
    }

    /**
     * Cancel the task execution.
     * This method should properly clean up any resources and stop execution.
     * @returns {Promise<void>}
     */
    async cancel() {
        throw new Error('ITask.cancel() must be implemented by subclasses');
    }

    /**
     * Validate the task configuration.
     * This method should check if the task can be executed with current settings.
     * @returns {Promise<boolean>} True if task is valid, false otherwise
     */
    async validate() {
        throw new Error('ITask.validate() must be implemented by subclasses');
    }
}