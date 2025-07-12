/**
 * InjectionSettings Component - Manages injection template and position settings
 * 
 * Handles:
 * - Injection template configuration
 * - Content tags for different sources (chat, world info, files)
 * - Injection position (before prompt, after prompt, at depth)
 * - Injection depth and role settings
 * - Auto-vectorization settings
 * - World info inclusion settings
 */

export class InjectionSettings {
    constructor(dependencies = {}) {
        this.settings = dependencies.settings;
        this.configManager = dependencies.configManager;
        this.onSettingsChange = dependencies.onSettingsChange || (() => {});
        
        // Injection-related fields
        this.injectionFields = [
            'template',
            'tag_chat',
            'tag_wi', 
            'tag_file',
            'depth',
            'depth_role',
            'include_wi',
            'auto_vectorize'
        ];
        
        // Position values mapping
        this.positionMap = {
            '2': 'before_prompt',  // 主提示前
            '0': 'after_prompt',   // 主提示后
            '1': 'at_depth'        // 聊天内@深度
        };
        
        this.initialized = false;
    }

    /**
     * Initialize InjectionSettings component
     */
    async init() {
        if (this.initialized) {
            console.warn('InjectionSettings: Already initialized');
            return;
        }

        try {
            this.bindEventListeners();
            this.loadCurrentSettings();
            this.updatePositionVisibility();
            this.initialized = true;
            console.log('InjectionSettings: Initialized successfully');
        } catch (error) {
            console.error('InjectionSettings: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Bind event listeners for injection settings
     */
    bindEventListeners() {
        // Injection template
        $('#vectors_enhanced_template').on('input', (e) => {
            this.handleFieldChange('template', e.target.value);
        });

        // Content tags
        $('#vectors_enhanced_tag_chat').on('input', (e) => {
            this.handleFieldChange('tag_chat', e.target.value);
        });

        $('#vectors_enhanced_tag_wi').on('input', (e) => {
            this.handleFieldChange('tag_wi', e.target.value);
        });

        $('#vectors_enhanced_tag_file').on('input', (e) => {
            this.handleFieldChange('tag_file', e.target.value);
        });

        // Position radio buttons
        $('input[name="vectors_position"]').on('change', (e) => {
            this.handlePositionChange(e.target.value);
        });

        // Depth settings
        $('#vectors_enhanced_depth').on('input', (e) => {
            const value = parseInt(e.target.value) || 0;
            this.handleFieldChange('depth', value);
        });

        $('#vectors_enhanced_depth_role').on('change', (e) => {
            const value = parseInt(e.target.value) || 0;
            this.handleFieldChange('depth_role', value);
        });

        // Checkboxes
        $('#vectors_enhanced_include_wi').on('change', (e) => {
            this.handleFieldChange('include_wi', e.target.checked);
        });

        $('#vectors_enhanced_auto_vectorize').on('change', (e) => {
            this.handleFieldChange('auto_vectorize', e.target.checked);
        });

        console.log('InjectionSettings: Event listeners bound');
    }

    /**
     * Handle position selection change
     */
    handlePositionChange(positionValue) {
        console.log(`InjectionSettings: Position changed to ${positionValue}`);
        
        this.settings.position = parseInt(positionValue);
        this.saveSettings();
        this.updatePositionVisibility();
        
        this.onSettingsChange('position', this.settings.position);
    }

    /**
     * Handle individual field changes
     */
    handleFieldChange(field, value) {
        console.log(`InjectionSettings: Field ${field} changed to:`, value);
        
        this.settings[field] = value;
        this.saveSettings();
        
        // Validate template if it's a template change
        if (field === 'template') {
            this.validateTemplate(value);
        }
        
        this.onSettingsChange(field, value);
    }

    /**
     * Update position-specific UI visibility
     */
    updatePositionVisibility() {
        const position = this.settings.position;
        
        // Only show/hide the depth number input and role select
        // Keep the radio button and "聊天内@深度" text always visible
        const depthInput = $('#vectors_enhanced_depth');
        const roleSelect = $('#vectors_enhanced_depth_role');
        
        // Find the "作为" text span (it comes after the depth input)
        const roleText = roleSelect.prev('span');
        
        // Show depth controls only for "at depth" position (value 1)
        if (position === 1) {
            depthInput.show();
            roleSelect.show();
            roleText.show();
        } else {
            depthInput.hide();
            roleSelect.hide();
            roleText.hide();
        }
        
        console.log(`InjectionSettings: Updated position visibility (position: ${position})`);
    }

    /**
     * Load current settings into UI elements
     */
    loadCurrentSettings() {
        console.log('InjectionSettings: Loading current settings...');
        
        // Load injection fields
        this.injectionFields.forEach(field => {
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
        
        // Load position radio buttons
        if (this.settings.position !== undefined) {
            $(`input[name="vectors_position"][value="${this.settings.position}"]`).prop('checked', true);
        }
        
        console.log('InjectionSettings: Settings loaded');
    }

    /**
     * Validate injection template
     */
    validateTemplate(template) {
        const errors = [];
        let isValid = true;

        // Check if template contains {{text}} placeholder
        if (!template || template.trim() === '') {
            errors.push('Injection template cannot be empty');
            isValid = false;
        } else if (!template.includes('{{text}}')) {
            errors.push('Template must contain {{text}} placeholder');
            isValid = false;
        }

        // Check for common template issues
        const openBraces = (template.match(/\{\{/g) || []).length;
        const closeBraces = (template.match(/\}\}/g) || []).length;
        
        if (openBraces !== closeBraces) {
            errors.push('Template has mismatched braces');
            isValid = false;
        }

        if (errors.length > 0) {
            console.warn('InjectionSettings: Template validation errors:', errors);
            this.showTemplateErrors(errors);
        } else {
            this.clearTemplateErrors();
        }

        return isValid;
    }

    /**
     * Show template validation errors
     */
    showTemplateErrors(errors) {
        let errorContainer = $('#vectors_enhanced_template_errors');
        
        if (errorContainer.length === 0) {
            errorContainer = $('<div>', {
                id: 'vectors_enhanced_template_errors',
                class: 'text-danger m-t-0-5',
                style: 'font-size: 0.9em;'
            });
            
            $('#vectors_enhanced_template').after(errorContainer);
        }
        
        const errorHtml = errors.map(error => `<div>• ${error}</div>`).join('');
        errorContainer.html(`<strong>模板错误:</strong>${errorHtml}`).show();
    }

    /**
     * Clear template validation errors
     */
    clearTemplateErrors() {
        $('#vectors_enhanced_template_errors').hide();
    }

    /**
     * Validate content tags
     */
    validateContentTags() {
        const tags = {
            chat: this.settings.tag_chat,
            wi: this.settings.tag_wi,
            file: this.settings.tag_file
        };

        const errors = [];
        let isValid = true;

        // Check for empty tags
        Object.entries(tags).forEach(([type, tag]) => {
            if (!tag || tag.trim() === '') {
                errors.push(`${type} tag cannot be empty`);
                isValid = false;
            }
        });

        // Check for duplicate tags
        const tagValues = Object.values(tags).filter(Boolean);
        const uniqueTags = [...new Set(tagValues)];
        
        if (tagValues.length !== uniqueTags.length) {
            errors.push('Content tags must be unique');
            isValid = false;
        }

        if (errors.length > 0) {
            console.warn('InjectionSettings: Content tag validation errors:', errors);
        }

        return isValid;
    }

    /**
     * Get position description for current setting
     */
    getPositionDescription() {
        const descriptions = {
            2: '主提示前',
            0: '主提示后', 
            1: `聊天内第${this.settings.depth}条位置（作为${this.getRoleDescription(this.settings.depth_role)}）`
        };

        return descriptions[this.settings.position] || '未知位置';
    }

    /**
     * Get role description for depth role value
     */
    getRoleDescription(roleValue) {
        const roles = {
            0: '系统',
            1: '用户',
            2: '助手'
        };
        
        return roles[roleValue] || '未知角色';
    }

    /**
     * Save settings using ConfigManager
     */
    saveSettings() {
        if (this.configManager) {
            console.debug('InjectionSettings: Settings saved via ConfigManager');
        } else {
            console.warn('InjectionSettings: No ConfigManager available for saving');
        }
    }

    /**
     * Refresh the component - reload settings and update UI
     */
    async refresh() {
        console.log('InjectionSettings: Refreshing...');
        this.loadCurrentSettings();
        this.updatePositionVisibility();
        
        // Re-validate current settings
        this.validateTemplate(this.settings.template);
        this.validateContentTags();
        
        console.log('InjectionSettings: Refresh completed');
    }

    /**
     * Get injection configuration status
     */
    getInjectionStatus() {
        return {
            template: {
                isValid: this.validateTemplate(this.settings.template),
                content: this.settings.template
            },
            tags: {
                isValid: this.validateContentTags(),
                values: {
                    chat: this.settings.tag_chat,
                    wi: this.settings.tag_wi,
                    file: this.settings.tag_file
                }
            },
            position: {
                value: this.settings.position,
                description: this.getPositionDescription()
            },
            auto_vectorize: this.settings.auto_vectorize,
            include_wi: this.settings.include_wi
        };
    }

    /**
     * Get all injection settings
     */
    getInjectionSettings() {
        return {
            template: this.settings.template,
            tag_chat: this.settings.tag_chat,
            tag_wi: this.settings.tag_wi,
            tag_file: this.settings.tag_file,
            position: this.settings.position,
            depth: this.settings.depth,
            depth_role: this.settings.depth_role,
            include_wi: this.settings.include_wi,
            auto_vectorize: this.settings.auto_vectorize
        };
    }

    /**
     * Reset injection settings to defaults
     */
    resetInjectionSettings() {
        console.log('InjectionSettings: Resetting injection settings...');
        
        const defaults = {
            template: '{{text}}',
            tag_chat: 'past_chat',
            tag_wi: 'world_part',
            tag_file: 'databank',
            position: 1,
            depth: 4,
            depth_role: 0,
            include_wi: true,
            auto_vectorize: true
        };

        Object.assign(this.settings, defaults);
        this.saveSettings();
        this.loadCurrentSettings();
        this.updatePositionVisibility();
        
        console.log('InjectionSettings: Injection settings reset to defaults');
    }

    /**
     * Preview injection output with current settings
     */
    previewInjection(sampleText = 'Sample retrieved content') {
        let preview = this.settings.template.replace('{{text}}', sampleText);
        
        return {
            output: preview,
            position: this.getPositionDescription(),
            tags: {
                chat: this.settings.tag_chat,
                wi: this.settings.tag_wi,
                file: this.settings.tag_file
            }
        };
    }

    /**
     * Cleanup - remove event listeners
     */
    destroy() {
        console.log('InjectionSettings: Destroying...');
        
        // Remove event listeners
        this.injectionFields.forEach(field => {
            $(`#vectors_enhanced_${field}`).off('input change');
        });
        
        $('input[name="vectors_position"]').off('change');
        
        // Clear validation errors
        this.clearTemplateErrors();
        
        this.initialized = false;
        console.log('InjectionSettings: Destroyed');
    }
}