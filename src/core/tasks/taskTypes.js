/**
 * Task type constants
 */
export const TaskTypes = {
    VECTORIZATION: 'vectorization',
    SUMMARY: 'summary',
    AUTO_UPDATE: 'auto-update',
    EXPORT: 'export',
    IMPORT: 'import'
};

/**
 * Task status constants
 */
export const TaskStatus = {
    PENDING: 'pending',
    QUEUED: 'queued',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    SKIPPED: 'skipped'
};

/**
 * Task priority constants
 */
export const TaskPriority = {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    URGENT: 3
};

/**
 * Validate task type
 * @param {string} type - Task type to validate
 * @returns {boolean} True if valid
 */
export function isValidTaskType(type) {
    return Object.values(TaskTypes).includes(type);
}

/**
 * Validate task status
 * @param {string} status - Task status to validate
 * @returns {boolean} True if valid
 */
export function isValidTaskStatus(status) {
    return Object.values(TaskStatus).includes(status);
}

/**
 * Validate task priority
 * @param {number} priority - Task priority to validate
 * @returns {boolean} True if valid
 */
export function isValidTaskPriority(priority) {
    return Object.values(TaskPriority).includes(priority);
}

/**
 * Get human-readable status name
 * @param {string} status - Task status
 * @returns {string} Human-readable status
 */
export function getStatusDisplayName(status) {
    const statusNames = {
        [TaskStatus.PENDING]: 'Pending',
        [TaskStatus.QUEUED]: 'Queued',
        [TaskStatus.RUNNING]: 'Running',
        [TaskStatus.COMPLETED]: 'Completed',
        [TaskStatus.FAILED]: 'Failed',
        [TaskStatus.CANCELLED]: 'Cancelled',
        [TaskStatus.SKIPPED]: 'Skipped'
    };
    
    return statusNames[status] || status;
}

/**
 * Get human-readable type name
 * @param {string} type - Task type
 * @returns {string} Human-readable type
 */
export function getTypeDisplayName(type) {
    const typeNames = {
        [TaskTypes.VECTORIZATION]: 'Vectorization',
        [TaskTypes.SUMMARY]: 'Summary',
        [TaskTypes.AUTO_UPDATE]: 'Auto Update',
        [TaskTypes.EXPORT]: 'Export',
        [TaskTypes.IMPORT]: 'Import'
    };
    
    return typeNames[type] || type;
}