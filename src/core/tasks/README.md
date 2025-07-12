# Task System ✅

This directory contains the new task system implementation for Vectors Enhanced. The task system provides a structured way to manage vectorization and other background tasks while maintaining backward compatibility with the legacy system.

**Status**: Phase 6 completed - TaskManager running in production with full backward compatibility

## Architecture

### Core Components

- **ITask.js** - Interface that all tasks must implement
- **BaseTask.js** - Base class providing common task functionality
- **VectorizationTask.js** - Implementation for vectorization tasks
- **TaskFactory.js** - Factory for creating task instances
- **taskTypes.js** - Constants and utilities for task types and statuses

### Task Types

Currently supported task types:
- `vectorization` - Standard vectorization tasks

Planned for future:
- `summary` - LLM-based content summarization
- `auto-update` - Automatic incremental updates
- `export` - Data export tasks
- `import` - Data import tasks

### Task Lifecycle

1. **Creation** - Task is created via TaskFactory
2. **Validation** - Task settings are validated
3. **Storage** - Task is saved to both new and legacy formats
4. **Queuing** - Task is added to execution queue
5. **Execution** - Task logic is executed
6. **Completion** - Task status is updated and events are emitted

## Backward Compatibility

The task system maintains full backward compatibility:

- **Dual Storage** - Tasks are saved in both new and legacy formats
- **Fallback Mode** - If TaskManager fails, system falls back to legacy mode
- **Data Migration** - Legacy tasks can be converted to new format
- **API Compatibility** - Existing functions like `getChatTasks()` continue to work

## Usage Examples

### Creating a Vectorization Task

```javascript
const task = await taskManager.createTask('vectorization', {
  chatId: 'chat123',
  name: 'My Vectorization Task',
  settings: {
    chat: { enabled: true },
    files: { enabled: false, selected: [] },
    world_info: { enabled: false, selected: {} }
  },
  isIncremental: false
});
```

### Getting Tasks for a Chat

```javascript
// Async version (recommended)
const tasks = await taskManager.getTasks('chat123');

// Sync version (for compatibility)
const tasks = getChatTasks('chat123');
```

### Checking Task Status

```javascript
const task = await taskManager.getTask('chat123', 'task_123');
console.log(task.status); // pending, running, completed, failed, etc.
```

## Event System

The task system emits events for monitoring:

```javascript
eventBus.on('task:created', (task) => {
  console.log('New task created:', task.id);
});

eventBus.on('task:status-changed', (event) => {
  console.log(`Task ${event.task.id}: ${event.oldStatus} -> ${event.newStatus}`);
});
```

## Adding New Task Types

1. Create a new task class extending `BaseTask`
2. Register it with `TaskFactory.registerTaskType()`
3. Add the type constant to `taskTypes.js`
4. Implement the `execute()` method

Example:

```javascript
class MyCustomTask extends BaseTask {
  async execute() {
    // Task implementation here
  }
}

TaskFactory.registerTaskType('custom', MyCustomTask);
```

## Current Status

The task system is currently running in production:

```javascript
// Check system status
vectorsTaskSystemStatus()
// Returns: {
//   taskManagerAvailable: true,
//   legacyMode: false,
//   storageReady: true,
//   systemMode: 'TaskManager'
// }
```

## Testing

The task system can be tested via the browser console:

```javascript
// Access the global task manager
globalTaskManager

// Check if TaskManager is active
globalTaskManager && !globalTaskManager.legacyMode
// Should return: true

// View existing tasks
const tasks = globalTaskManager.getTasksSync('your-chat-id');
console.log(tasks);
```

## Migration

To migrate existing legacy tasks to the new format:

```javascript
const migratedChats = await taskManager.migrateAllLegacyTasks();
console.log(`Migrated ${migratedChats} chats to new format`);
```