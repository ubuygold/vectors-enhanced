/**
 * VectorizationSettings Component - Manages vectorization source selection and model configuration
 * 
 * Handles:
 * - Source selection (Transformers, vLLM, Ollama)
 * - Model configuration for each source
 * - Vectorization parameters (chunk size, overlap, thresholds)
 * - Source-specific settings validation
 */

export class VectorizationSettings {
    constructor(dependencies = {}) {
        this.settings = dependencies.settings;
        this.configManager = dependencies.configManager;
        this.onSettingsChange = dependencies.onSettingsChange || (() => {});
        
        // Source configurations
        this.sourceConfigs = {
            transformers: {
                selector: '#vectors_enhanced_transformers_settings',
                fields: ['local_model']
            },
            vllm: {
                selector: '#vectors_enhanced_vllm_settings',
                fields: ['vllm_model', 'vllm_url']
            },
            ollama: {
                selector: '#vectors_enhanced_ollama_settings',
                fields: ['ollama_model', 'ollama_url', 'ollama_keep']
            }
        };
        
        this.initialized = false;
    }

    /**
     * Initialize VectorizationSettings component
     */
    async init() {
        if (this.initialized) {
            console.warn('VectorizationSettings: Already initialized');
            return;
        }

        try {
            this.bindEventListeners();
            this.loadCurrentSettings();
            this.updateSourceVisibility();
            this.initialized = true;
            console.log('VectorizationSettings: Initialized successfully');
        } catch (error) {
            console.error('VectorizationSettings: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Bind event listeners for vectorization settings
     */
    bindEventListeners() {
        // Source selection change
        $('#vectors_enhanced_source').on('change', (e) => {
            const newSource = e.target.value;
            this.handleSourceChange(newSource);
        });

        // Model and URL inputs for each source
        this.bindSourceSpecificListeners('transformers');
        this.bindSourceSpecificListeners('vllm');
        this.bindSourceSpecificListeners('ollama');

        // General vectorization parameters
        this.bindParameterListeners();

        console.log('VectorizationSettings: Event listeners bound');
    }

    /**
     * Bind event listeners for a specific source
     */
    bindSourceSpecificListeners(source) {
        const config = this.sourceConfigs[source];
        if (!config) return;

        config.fields.forEach(field => {
            const fieldId = `#vectors_enhanced_${field}`;
            $(fieldId).on('input change', (e) => {
                this.handleFieldChange(field, e.target.value, e.target.type === 'checkbox' ? e.target.checked : undefined);
            });
        });
    }

    /**
     * Bind event listeners for general parameters
     */
    bindParameterListeners() {
        const parameters = [
            'chunk_size',
            'overlap_percent', 
            'score_threshold',
            'force_chunk_delimiter',
            'query_messages',
            'max_results',
            'enabled',
            'show_query_notification',
            'detailed_notification'
        ];

        parameters.forEach(param => {
            const fieldId = `#vectors_enhanced_${param}`;
            const field = $(fieldId);
            
            if (field.length) {
                field.on('input change', (e) => {
                    let value = e.target.value;
                    
                    // Handle different input types
                    if (e.target.type === 'checkbox') {
                        value = e.target.checked;
                    } else if (e.target.type === 'number') {
                        value = parseFloat(value) || 0;
                    }
                    
                    this.handleFieldChange(param, value);
                });
            }
        });

        // Special handling for notification details visibility
        $('#vectors_enhanced_show_query_notification').on('change', (e) => {
            this.toggleNotificationDetails(e.target.checked);
        });
    }

    /**
     * Handle source selection change
     */
    handleSourceChange(newSource) {
        console.log(`VectorizationSettings: Source changed to ${newSource}`);
        
        // Update settings
        this.settings.source = newSource;
        this.saveSettings();
        
        // Update UI visibility
        this.updateSourceVisibility();
        
        // Validate source configuration
        this.validateSourceConfig(newSource);
        
        // Notify settings change
        this.onSettingsChange('source', newSource);
    }

    /**
     * Handle individual field changes
     */
    handleFieldChange(field, value, checkboxValue) {
        console.log(`VectorizationSettings: Field ${field} changed to:`, value);
        
        // Handle checkbox fields
        if (checkboxValue !== undefined) {
            value = checkboxValue;
        }
        
        // Update settings object
        this.settings[field] = value;
        this.saveSettings();
        
        // Special handling for certain fields
        if (field === 'show_query_notification') {
            this.toggleNotificationDetails(value);
        } else if (field === 'enabled' && !value) {
            // When vector query is disabled, also disable rerank
            this.disableRerank();
        }
        
        // Notify settings change
        this.onSettingsChange(field, value);
    }

    /**
     * Update source-specific settings visibility
     */
    updateSourceVisibility() {
        const currentSource = this.settings.source;
        
        // Hide all source-specific settings
        Object.values(this.sourceConfigs).forEach(config => {
            $(config.selector).hide();
        });
        
        // Show current source settings
        if (this.sourceConfigs[currentSource]) {
            $(this.sourceConfigs[currentSource].selector).show();
        }
        
        console.log(`VectorizationSettings: Updated visibility for source: ${currentSource}`);
    }

    /**
     * Toggle notification details visibility
     */
    toggleNotificationDetails(show) {
        const detailsSection = $('#vectors_enhanced_notification_details');
        if (show) {
            detailsSection.show();
        } else {
            detailsSection.hide();
        }
    }

    /**
     * Disable rerank when vector query is disabled
     */
    disableRerank() {
        console.log('VectorizationSettings: Disabling rerank due to vector query being disabled');
        
        // Update rerank settings
        this.settings.rerank_enabled = false;
        
        // Update the UI checkbox
        const rerankCheckbox = $('#vectors_enhanced_rerank_enabled');
        if (rerankCheckbox.length) {
            rerankCheckbox.prop('checked', false);
            // Trigger change event to update the QuerySettings component
            rerankCheckbox.trigger('change');
        }
        
        // Save settings
        this.saveSettings();
        
        // Notify the change
        this.onSettingsChange('rerank_enabled', false);
    }

    /**
     * Load current settings into UI elements
     */
    loadCurrentSettings() {
        console.log('VectorizationSettings: Loading current settings...');
        
        // Load source selection
        $('#vectors_enhanced_source').val(this.settings.source);
        
        // Load source-specific fields
        Object.entries(this.sourceConfigs).forEach(([source, config]) => {
            config.fields.forEach(field => {
                const fieldId = `#vectors_enhanced_${field}`;
                const element = $(fieldId);
                
                if (element.length && this.settings[field] !== undefined) {
                    if (element.attr('type') === 'checkbox') {
                        element.prop('checked', this.settings[field]);
                    } else {
                        element.val(this.settings[field]);
                    }
                }
            });
        });
        
        // Load general parameters
        const parameters = [
            'chunk_size', 'overlap_percent', 'score_threshold', 'force_chunk_delimiter',
            'query_messages', 'max_results', 'enabled', 'show_query_notification', 'detailed_notification'
        ];
        
        parameters.forEach(param => {
            const fieldId = `#vectors_enhanced_${param}`;
            const element = $(fieldId);
            
            if (element.length && this.settings[param] !== undefined) {
                if (element.attr('type') === 'checkbox') {
                    element.prop('checked', this.settings[param]);
                } else {
                    element.val(this.settings[param]);
                }
            }
        });
        
        // Update notification details visibility
        this.toggleNotificationDetails(this.settings.show_query_notification);
        
        console.log('VectorizationSettings: Settings loaded');
    }

    /**
     * Validate source configuration
     */
    validateSourceConfig(source) {
        const config = this.sourceConfigs[source];
        if (!config) {
            console.warn(`VectorizationSettings: Unknown source: ${source}`);
            return false;
        }

        let isValid = true;
        const errors = [];

        // Validate required fields for each source
        switch (source) {
            case 'vllm':
                if (!this.settings.vllm_model) {
                    errors.push('vLLM model name is required');
                    isValid = false;
                }
                break;
            case 'ollama':
                if (!this.settings.ollama_model) {
                    errors.push('Ollama model name is required');
                    isValid = false;
                }
                break;
            // Transformers doesn't require specific validation
        }

        // Validate numerical parameters
        if (this.settings.chunk_size < 100) {
            errors.push('Chunk size must be at least 100');
            isValid = false;
        }

        if (this.settings.overlap_percent < 0 || this.settings.overlap_percent > 50) {
            errors.push('Overlap percentage must be between 0 and 50');
            isValid = false;
        }

        if (this.settings.score_threshold < 0 || this.settings.score_threshold > 1) {
            errors.push('Score threshold must be between 0 and 1');
            isValid = false;
        }

        if (errors.length > 0) {
            console.warn('VectorizationSettings: Validation errors:', errors);
        }

        return isValid;
    }

    /**
     * Save settings using ConfigManager
     */
    saveSettings() {
        if (this.configManager) {
            // ConfigManager will handle the actual saving
            console.debug('VectorizationSettings: Settings saved via ConfigManager');
        } else {
            console.warn('VectorizationSettings: No ConfigManager available for saving');
        }
    }

    /**
     * Refresh the component - reload settings and update UI
     */
    async refresh() {
        console.log('VectorizationSettings: Refreshing...');
        this.loadCurrentSettings();
        this.updateSourceVisibility();
        console.log('VectorizationSettings: Refresh completed');
    }

    /**
     * Get current source configuration status
     */
    getSourceStatus() {
        const currentSource = this.settings.source;
        return {
            source: currentSource,
            isValid: this.validateSourceConfig(currentSource),
            config: this.sourceConfigs[currentSource] || null
        };
    }

    /**
     * Get all vectorization settings
     */
    getSettings() {
        return {
            source: this.settings.source,
            local_model: this.settings.local_model,
            vllm_model: this.settings.vllm_model,
            vllm_url: this.settings.vllm_url,
            ollama_model: this.settings.ollama_model,
            ollama_url: this.settings.ollama_url,
            ollama_keep: this.settings.ollama_keep,
            chunk_size: this.settings.chunk_size,
            overlap_percent: this.settings.overlap_percent,
            score_threshold: this.settings.score_threshold,
            force_chunk_delimiter: this.settings.force_chunk_delimiter,
            query_messages: this.settings.query_messages,
            max_results: this.settings.max_results,
            enabled: this.settings.enabled,
            show_query_notification: this.settings.show_query_notification,
            detailed_notification: this.settings.detailed_notification
        };
    }

    /**
     * Cleanup - remove event listeners
     */
    destroy() {
        console.log('VectorizationSettings: Destroying...');
        
        // Remove event listeners
        $('#vectors_enhanced_source').off('change');
        
        // Remove source-specific listeners
        Object.entries(this.sourceConfigs).forEach(([source, config]) => {
            config.fields.forEach(field => {
                $(`#vectors_enhanced_${field}`).off('input change');
            });
        });
        
        // Remove parameter listeners
        const parameters = [
            'chunk_size', 'overlap_percent', 'score_threshold', 'force_chunk_delimiter',
            'query_messages', 'max_results', 'enabled', 'show_query_notification', 'detailed_notification'
        ];
        
        parameters.forEach(param => {
            $(`#vectors_enhanced_${param}`).off('input change');
        });
        
        this.initialized = false;
        console.log('VectorizationSettings: Destroyed');
    }
}