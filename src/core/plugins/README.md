# Plugin System

This module implements a lightweight plugin system for vectorization sources in the Vectors Enhanced extension.

## Architecture

### Core Components

1. **IVectorizationPlugin.js**
   - Abstract interface that all vectorization plugins must implement
   - Defines standard methods for initialization, configuration, and vectorization
   - Provides helper methods for batch processing and validation

2. **PluginManager.js**
   - Central coordinator for all plugins
   - Handles plugin lifecycle (loading, initialization, cleanup)
   - Manages active plugin selection and configuration
   - Integrates with EventBus for plugin events

3. **PluginLoader.js**
   - Dynamic plugin discovery and loading
   - Validates plugin classes and metadata
   - Supports both built-in and external plugins
   - Handles different loading strategies for various environments

## Plugin Interface

All plugins must implement the following methods:

```javascript
class MyVectorizationPlugin extends IVectorizationPlugin {
    // Required: Plugin metadata
    getMetadata() {
        return {
            name: 'My Plugin',
            description: 'A custom vectorization plugin',
            version: '1.0.0',
            author: 'Author Name',
            tags: ['custom', 'vectorization'],
            capabilities: {
                [PluginCapabilities.BATCH_PROCESSING]: true,
                [PluginCapabilities.GPU_ACCELERATION]: false
            }
        };
    }

    // Required: Initialize plugin resources
    async initialize() {
        // Load models, setup connections, etc.
        return true; // Return success status
    }

    // Required: Check if plugin is ready to use
    async isAvailable() {
        // Check if models are loaded, API is accessible, etc.
        return true;
    }

    // Required: Get available models
    async getAvailableModels() {
        return [
            { id: 'model-1', name: 'Model 1', size: '100MB' },
            { id: 'model-2', name: 'Model 2', size: '200MB' }
        ];
    }

    // Required: Vectorize text
    async vectorize(texts, options = {}) {
        // Perform vectorization
        // Use this.processBatches() helper for batch processing
        return embeddings; // Array of number arrays
    }

    // Required: Configuration schema
    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                apiKey: { type: 'string', required: true },
                model: { type: 'string', enum: ['model-1', 'model-2'] }
            }
        };
    }
}
```

## Plugin Events

The plugin system emits the following events via EventBus:

- `plugin:before_init` - Before plugin initialization
- `plugin:after_init` - After successful initialization
- `plugin:before_vectorize` - Before vectorization starts
- `plugin:after_vectorize` - After vectorization completes
- `plugin:error` - On plugin errors
- `plugin:config_updated` - When plugin configuration changes
- `plugin:status_changed` - When plugin status changes

## Built-in Plugins

The system will convert existing vectorization sources into plugins:

1. **TransformersPlugin** - Transformers.js embeddings
2. **OllamaPlugin** - Ollama API integration
3. **vLLMPlugin** - vLLM server integration
4. **WebLLMPlugin** - WebLLM in-browser models
5. **OpenAIPlugin** - OpenAI embeddings API
6. **CoherePlugin** - Cohere embeddings API

## External Plugins

External plugins can be added to the `/plugins` directory. Each plugin should:

1. Extend `IVectorizationPlugin`
2. Export the plugin class as default or named export
3. Include a manifest.json file (optional but recommended)

Example structure:
```
plugins/
└── my-plugin/
    ├── index.js        # Plugin implementation
    ├── manifest.json   # Plugin metadata
    └── README.md       # Plugin documentation
```

## Usage

```javascript
// Initialize plugin manager
const pluginManager = new PluginManager(configManager, eventBus);
await pluginManager.initialize();

// Get all available plugins
const plugins = pluginManager.getAllPlugins();

// Set active plugin
await pluginManager.setActivePlugin('transformers');

// Vectorize content
const embeddings = await pluginManager.vectorize(texts, {
    model: 'all-MiniLM-L6-v2',
    onProgress: (progress) => console.log(progress)
});

// Update plugin configuration
pluginManager.updatePluginConfig('transformers', {
    model: 'new-model-id'
});
```

## Security Considerations

1. **Plugin Validation**: All plugins are validated before loading
2. **Sandboxing**: External plugins run in isolated contexts (when possible)
3. **Configuration Validation**: Plugin configs are validated against schemas
4. **Resource Limits**: Plugins have resource usage limits
5. **Permission System**: Plugins declare required permissions

## Performance Optimizations

1. **Lazy Loading**: Plugins are loaded only when needed
2. **Caching**: Plugin instances and configurations are cached
3. **Batch Processing**: Built-in support for efficient batch operations
4. **Async Operations**: All heavy operations are asynchronous
5. **Resource Cleanup**: Proper cleanup when plugins are unloaded