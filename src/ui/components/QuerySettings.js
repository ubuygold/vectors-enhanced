/**
 * QuerySettings Component - Manages query-related settings including Rerank
 * 
 * Handles:
 * - Rerank enable/disable
 * - Rerank API configuration (URL, API Key, Model)
 * - Rerank parameters (Top N, Hybrid Alpha)
 * - Rerank notifications
 */

export class QuerySettings {
    constructor(dependencies = {}) {
        this.settings = dependencies.settings;
        this.configManager = dependencies.configManager;
        this.onSettingsChange = dependencies.onSettingsChange || (() => {});
        this.toastr = dependencies.toastr || window.toastr;
        
        // Dependencies for preview functionality
        this.callGenericPopup = dependencies.callGenericPopup;
        this.POPUP_TYPE = dependencies.POPUP_TYPE;
        this.rearrangeChat = dependencies.rearrangeChat;
        this.getContext = dependencies.getContext;
        this.getCurrentChatId = dependencies.getCurrentChatId;
        
        // Rerank configuration fields
        this.rerankFields = [
            'rerank_enabled',
            'rerank_success_notify',
            'rerank_url',
            'rerank_apiKey',
            'rerank_model',
            'rerank_top_n',
            'rerank_hybrid_alpha'
        ];
        
        this.initialized = false;
    }

    /**
     * Initialize QuerySettings component
     */
    async init() {
        if (this.initialized) {
            console.warn('QuerySettings: Already initialized');
            return;
        }

        try {
            this.bindEventListeners();
            this.loadCurrentSettings();
            // loadCurrentSettings() now calls updateRerankVisibility(), so no need to call it again
            this.initialized = true;
            console.log('QuerySettings: Initialized successfully');
        } catch (error) {
            console.error('QuerySettings: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Bind event listeners for query settings
     */
    bindEventListeners() {
        // Rerank enable/disable
        $('#vectors_enhanced_rerank_enabled').on('change', (e) => {
            this.handleRerankToggle(e.target.checked);
        });

        // Rerank API configuration
        $('#vectors_enhanced_rerank_url').on('input', (e) => {
            this.handleFieldChange('rerank_url', e.target.value);
        });

        $('#vectors_enhanced_rerank_apiKey').on('input', (e) => {
            this.handleFieldChange('rerank_apiKey', e.target.value);
        });

        $('#vectors_enhanced_rerank_model').on('input', (e) => {
            this.handleFieldChange('rerank_model', e.target.value);
        });

        // Rerank parameters
        $('#vectors_enhanced_rerank_top_n').on('input', (e) => {
            const value = parseInt(e.target.value) || 1;
            this.handleFieldChange('rerank_top_n', value);
        });

        $('#vectors_enhanced_rerank_hybrid_alpha').on('input', (e) => {
            const value = parseFloat(e.target.value) || 0;
            this.handleFieldChange('rerank_hybrid_alpha', value);
        });

        // Rerank success notification
        $('#vectors_enhanced_rerank_success_notify').on('change', (e) => {
            this.handleFieldChange('rerank_success_notify', e.target.checked);
        });

        // Query instruction settings
        $('#vectors_enhanced_query_instruction_enabled').on('change', (e) => {
            this.handleQueryInstructionToggle(e.target.checked);
        });

        $('#vectors_enhanced_query_instruction_template').on('input', (e) => {
            this.handleFieldChange('query_instruction_template', e.target.value);
        });

        // Query instruction preset selector
        $('#vectors_enhanced_query_instruction_preset').on('change', (e) => {
            this.handlePresetChange(e.target.value);
        });

        // Rerank deduplication settings
        $('#vectors_enhanced_rerank_deduplication_enabled').on('change', (e) => {
            this.handleRerankDeduplicationToggle(e.target.checked);
        });

        $('#vectors_enhanced_rerank_deduplication_instruction').on('input', (e) => {
            this.handleFieldChange('rerank_deduplication_instruction', e.target.value);
        });

        // Reset button for rerank deduplication instruction
        $('#reset_rerank_deduplication_instruction').on('click', () => {
            this.resetRerankDeduplicationInstruction();
        });

        // Preview injection button
        $('#vectors_enhanced_preview_injection').on('click', () => {
            this.previewInjectedContent();
        });

        console.log('QuerySettings: Event listeners bound');
    }

    /**
     * Handle rerank enable/disable toggle
     */
    handleRerankToggle(enabled) {
        console.log(`QuerySettings: Rerank ${enabled ? 'enabled' : 'disabled'}`);
        
        this.settings.rerank_enabled = enabled;
        this.saveSettings();
        this.updateRerankVisibility();
        
        // Validate configuration if enabled
        if (enabled) {
            this.validateRerankConfig();
        }
        
        this.onSettingsChange('rerank_enabled', enabled);
    }

    /**
     * Handle individual field changes
     */
    handleFieldChange(field, value) {
        console.log(`QuerySettings: Field ${field} changed to:`, value);
        
        this.settings[field] = value;
        this.saveSettings();
        
        // Validate on changes if rerank is enabled
        if (this.settings.rerank_enabled) {
            this.validateRerankConfig();
        }
        
        this.onSettingsChange(field, value);
    }

    /**
     * Update rerank settings visibility based on enable state
     */
    updateRerankVisibility() {
        const rerankEnabled = this.settings.rerank_enabled;
        const rerankDetails = $('#vectors_enhanced_rerank_enabled').closest('details');
        
        // 注释掉自动展开的逻辑，保持用户的折叠状态
        // if (rerankEnabled) {
        //     rerankDetails.attr('open', true);
        // }
        
        // Enable/disable rerank configuration fields
        const configFields = [
            '#vectors_enhanced_rerank_url',
            '#vectors_enhanced_rerank_apiKey', 
            '#vectors_enhanced_rerank_model',
            '#vectors_enhanced_rerank_top_n',
            '#vectors_enhanced_rerank_hybrid_alpha',
            '#vectors_enhanced_rerank_success_notify'
        ];
        
        configFields.forEach(fieldId => {
            const field = $(fieldId);
            if (field.length) {
                field.prop('disabled', !rerankEnabled);
                
                // Visual feedback - use proper CSS classes and opacity
                if (rerankEnabled) {
                    field.removeClass('disabled').css('opacity', '1');
                } else {
                    field.addClass('disabled').css('opacity', '0.5');
                }
            }
        });
        
        console.log(`QuerySettings: Updated rerank visibility (enabled: ${rerankEnabled})`);
    }


    /**
     * Handle query instruction toggle
     */
    handleQueryInstructionToggle(enabled) {
        console.log(`QuerySettings: Query instruction ${enabled ? 'enabled' : 'disabled'}`);
        
        this.settings.query_instruction_enabled = enabled;
        this.saveSettings();
        this.onSettingsChange('query_instruction_enabled', enabled);
        
        // 显示/隐藏查询指令设置
        if (enabled) {
            $('#query_instruction_settings').slideDown();
        } else {
            $('#query_instruction_settings').slideUp();
        }
    }

    /**
     * Handle preset change
     */
    handlePresetChange(presetKey) {
        console.log(`QuerySettings: Preset changed to: ${presetKey}`);
        
        this.settings.query_instruction_preset = presetKey;
        
        // Update template from preset
        if (this.settings.query_instruction_presets && this.settings.query_instruction_presets[presetKey]) {
            this.settings.query_instruction_template = this.settings.query_instruction_presets[presetKey];
            $('#vectors_enhanced_query_instruction_template').val(this.settings.query_instruction_template);
        }
        
        this.saveSettings();
        this.onSettingsChange('query_instruction_preset', presetKey);
        this.onSettingsChange('query_instruction_template', this.settings.query_instruction_template);
    }

    /**
     * Handle rerank deduplication toggle
     */
    handleRerankDeduplicationToggle(enabled) {
        console.log(`QuerySettings: Rerank deduplication ${enabled ? 'enabled' : 'disabled'}`);
        
        this.settings.rerank_deduplication_enabled = enabled;
        this.saveSettings();
        this.onSettingsChange('rerank_deduplication_enabled', enabled);
        
        // 显示/隐藏去重设置
        if (enabled) {
            $('#rerank_deduplication_settings').slideDown();
        } else {
            $('#rerank_deduplication_settings').slideUp();
        }
    }

    /**
     * Load current settings into UI elements
     */
    loadCurrentSettings() {
        console.log('QuerySettings: Loading current settings...');
        
        this.rerankFields.forEach(field => {
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
        
        // Load experimental settings
        const experimentalFields = [
            'query_instruction_enabled',
            'query_instruction_template',
            'query_instruction_preset',
            'rerank_deduplication_enabled',
            'rerank_deduplication_instruction'
        ];
        
        experimentalFields.forEach(field => {
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
        
        // 根据设置更新实验性功能的显示状态
        if (this.settings.query_instruction_enabled) {
            $('#query_instruction_settings').show();
        } else {
            $('#query_instruction_settings').hide();
        }
        
        if (this.settings.rerank_deduplication_enabled) {
            $('#rerank_deduplication_settings').show();
        } else {
            $('#rerank_deduplication_settings').hide();
        }
        
        // Update visibility after loading settings
        this.updateRerankVisibility();
        
        console.log('QuerySettings: Settings loaded');
    }

    /**
     * Validate rerank configuration
     */
    validateRerankConfig() {
        if (!this.settings.rerank_enabled) {
            return true; // No validation needed if disabled
        }

        const errors = [];
        let isValid = true;

        // Required fields for rerank
        if (!this.settings.rerank_url || this.settings.rerank_url.trim() === '') {
            errors.push('Rerank API URL is required');
            isValid = false;
        }

        if (!this.settings.rerank_apiKey || this.settings.rerank_apiKey.trim() === '') {
            errors.push('Rerank API Key is required');
            isValid = false;
        }

        if (!this.settings.rerank_model || this.settings.rerank_model.trim() === '') {
            errors.push('Rerank model is required');
            isValid = false;
        }

        // Validate numeric parameters
        if (this.settings.rerank_top_n <= 0 || this.settings.rerank_top_n > 100) {
            errors.push('Rerank Top N must be between 1 and 100');
            isValid = false;
        }

        if (this.settings.rerank_hybrid_alpha < 0 || this.settings.rerank_hybrid_alpha > 1) {
            errors.push('Rerank hybrid alpha must be between 0 and 1');
            isValid = false;
        }

        // Validate URL format
        if (this.settings.rerank_url) {
            try {
                new URL(this.settings.rerank_url);
            } catch (e) {
                errors.push('Rerank API URL must be a valid URL');
                isValid = false;
            }
        }

        if (errors.length > 0) {
            console.warn('QuerySettings: Rerank validation errors:', errors);
            this.showValidationErrors(errors);
        } else {
            this.clearValidationErrors();
        }

        return isValid;
    }

    /**
     * Show validation errors in the UI
     */
    showValidationErrors(errors) {
        // Create or update error message display
        let errorContainer = $('#vectors_enhanced_rerank_errors');
        
        if (errorContainer.length === 0) {
            errorContainer = $('<div>', {
                id: 'vectors_enhanced_rerank_errors',
                class: 'text-danger m-t-0-5',
                style: 'font-size: 0.9em;'
            });
            
            $('#vectors_enhanced_rerank_enabled').closest('details').append(errorContainer);
        }
        
        const errorHtml = errors.map(error => `<div>• ${error}</div>`).join('');
        errorContainer.html(`<strong>配置错误:</strong>${errorHtml}`).show();
    }

    /**
     * Clear validation error display
     */
    clearValidationErrors() {
        $('#vectors_enhanced_rerank_errors').hide();
    }

    /**
     * Save settings using ConfigManager
     */
    saveSettings() {
        if (this.configManager) {
            console.debug('QuerySettings: Settings saved via ConfigManager');
        } else {
            console.warn('QuerySettings: No ConfigManager available for saving');
        }
    }

    /**
     * Refresh the component - reload settings and update UI
     */
    async refresh() {
        console.log('QuerySettings: Refreshing...');
        this.loadCurrentSettings();
        this.updateRerankVisibility();
        
        if (this.settings.rerank_enabled) {
            this.validateRerankConfig();
        }
        
        console.log('QuerySettings: Refresh completed');
    }

    /**
     * Get rerank configuration status
     */
    getRerankStatus() {
        return {
            enabled: this.settings.rerank_enabled,
            configured: this.validateRerankConfig(),
            settings: this.getRerankSettings()
        };
    }

    /**
     * Get all rerank settings
     */
    getRerankSettings() {
        return {
            rerank_enabled: this.settings.rerank_enabled,
            rerank_success_notify: this.settings.rerank_success_notify,
            rerank_url: this.settings.rerank_url,
            rerank_apiKey: this.settings.rerank_apiKey ? '***' : '', // Don't expose the actual key
            rerank_model: this.settings.rerank_model,
            rerank_top_n: this.settings.rerank_top_n,
            rerank_hybrid_alpha: this.settings.rerank_hybrid_alpha
        };
    }

    /**
     * Test rerank connection (for future implementation)
     */
    async testRerankConnection() {
        if (!this.validateRerankConfig()) {
            throw new Error('Rerank configuration is invalid');
        }

        // TODO: Implement actual connection test
        console.log('QuerySettings: Testing rerank connection...');
        
        // This would make an actual API call to test the connection
        // For now, just validate the configuration
        return {
            success: true,
            message: 'Configuration appears valid (connection test not implemented)'
        };
    }

    /**
     * Reset rerank settings to defaults
     */
    resetRerankSettings() {
        console.log('QuerySettings: Resetting rerank settings...');
        
        const defaults = {
            rerank_enabled: false,
            rerank_success_notify: true,
            rerank_url: '',
            rerank_apiKey: '',
            rerank_model: '',
            rerank_top_n: 10,
            rerank_hybrid_alpha: 0.7
        };

        Object.assign(this.settings, defaults);
        this.saveSettings();
        this.loadCurrentSettings();
        this.updateRerankVisibility();
        
        console.log('QuerySettings: Rerank settings reset to defaults');
    }

    /**
     * Reset rerank deduplication instruction to default
     */
    resetRerankDeduplicationInstruction() {
        const defaultInstruction = '执行以下操作：\n1. 对高相关文档降序排列\n2. 若两文档满足任一条件则视为同质化：\n - 核心论点重合度 > 80%\n - 包含连续5词以上完全重复段落\n - 使用相同案例/数据支撑\n3. 同质化文档仅保留最相关的一条，其余降权至后50%位置';
        
        this.settings.rerank_deduplication_instruction = defaultInstruction;
        $('#vectors_enhanced_rerank_deduplication_instruction').val(defaultInstruction);
        
        this.saveSettings();
        this.onSettingsChange('rerank_deduplication_instruction', defaultInstruction);
        
        // Show feedback
        if (this.toastr) {
            this.toastr.success('已重置为默认去重指令');
        }
    }

    /**
     * Preview injected content with experimental features
     */
    async previewInjectedContent() {
        try {
            if (!this.getCurrentChatId || !this.getContext || !this.rearrangeChat) {
                this.toastr.error('预览功能未正确初始化');
                return;
            }

            const chatId = this.getCurrentChatId();
            if (!chatId || chatId === 'null' || chatId === 'undefined') {
                this.toastr.warning('请先选择一个聊天');
                return;
            }

            const context = this.getContext();
            if (!context.chat || context.chat.length === 0) {
                this.toastr.warning('当前聊天没有消息');
                return;
            }

            // 创建一个临时的上下文来捕获注入的内容
            let capturedContent = null;
            const originalSetExtensionPrompt = window.setExtensionPrompt;
            
            // 临时保存通知设置并禁用它们
            const originalShowNotification = this.settings.show_query_notification;
            const originalRerankNotify = this.settings.rerank_success_notify;
            this.settings.show_query_notification = false;
            this.settings.rerank_success_notify = false;
            
            // 临时替换 setExtensionPrompt 来捕获内容
            window.setExtensionPrompt = (tag, content) => {
                if (tag === '3_vectors') {
                    capturedContent = content;
                }
            };

            try {
                // 调用 rearrangeChat 来获取实际的注入内容
                await this.rearrangeChat(context.chat, 0, () => {}, 'normal');
                
                // 恢复原始函数和设置
                window.setExtensionPrompt = originalSetExtensionPrompt;
                this.settings.show_query_notification = originalShowNotification;
                this.settings.rerank_success_notify = originalRerankNotify;

                if (!capturedContent) {
                    this.toastr.info('没有向量内容被注入');
                    return;
                }

                // 分析内容
                const queryInstructionEnabled = this.settings.query_instruction_enabled;
                const rerankEnabled = this.settings.rerank_enabled;
                const deduplicationEnabled = this.settings.rerank_deduplication_enabled;
                
                // 计算内容统计
                const contentStats = this._analyzeInjectedContent(capturedContent);
                
                // 构建显示内容
                let displayHtml = '<div style="max-height: 600px; overflow-y: auto;">';
                
                // 显示实验性功能状态
                displayHtml += '<div style="margin-bottom: 15px; padding: 10px; background-color: var(--SmartThemeBlurTintColor); border-radius: 5px;">';
                displayHtml += '<h4 style="margin: 0 0 10px 0;">实验性功能状态</h4>';
                displayHtml += '<ul style="margin: 0; padding-left: 20px;">';
                displayHtml += `<li>查询指令增强: <strong>${queryInstructionEnabled ? '已启用' : '未启用'}</strong>`;
                if (queryInstructionEnabled) {
                    displayHtml += `<br><small style="opacity: 0.8;">指令: "${this.settings.query_instruction_template}"</small>`;
                }
                displayHtml += '</li>';
                displayHtml += `<li>Rerank: <strong>${rerankEnabled ? '已启用' : '未启用'}</strong>`;
                if (rerankEnabled && deduplicationEnabled) {
                    displayHtml += `<br><small style="opacity: 0.8;">智能去重: 已启用</small>`;
                }
                displayHtml += '</li>';
                displayHtml += '</ul>';
                displayHtml += '</div>';
                
                // 显示内容统计
                displayHtml += '<div style="margin-bottom: 15px; padding: 10px; background-color: var(--SmartThemeBlurTintColor); border-radius: 5px;">';
                displayHtml += '<h4 style="margin: 0 0 10px 0;">注入内容统计</h4>';
                displayHtml += '<ul style="margin: 0; padding-left: 20px;">';
                displayHtml += `<li>总字符数: <strong>${contentStats.totalChars}</strong></li>`;
                displayHtml += `<li>聊天记录: <strong>${contentStats.chatCount}</strong> 条</li>`;
                displayHtml += `<li>文件内容: <strong>${contentStats.fileCount}</strong> 个</li>`;
                displayHtml += `<li>世界信息: <strong>${contentStats.worldInfoCount}</strong> 条</li>`;
                displayHtml += '</ul>';
                displayHtml += '</div>';
                
                // 显示实际内容
                displayHtml += '<div style="margin-bottom: 15px;">';
                displayHtml += '<h4 style="margin: 0 0 10px 0;">注入的原始内容</h4>';
                displayHtml += '<pre style="white-space: pre-wrap; word-wrap: break-word; background-color: var(--SmartThemeBlurTintColor); padding: 10px; border-radius: 5px; max-height: 300px; overflow-y: auto;">';
                displayHtml += this._escapeHtml(capturedContent);
                displayHtml += '</pre>';
                displayHtml += '</div>';
                
                displayHtml += '</div>';

                // 显示弹窗
                if (this.callGenericPopup && this.POPUP_TYPE) {
                    await this.callGenericPopup(displayHtml, this.POPUP_TYPE.TEXT, '', {
                        wide: true,
                        large: true,
                        okButton: '关闭',
                        allowHorizontalScrolling: true,
                        allowVerticalScrolling: true
                    });
                } else {
                    // 降级到 alert
                    alert('注入内容预览:\n\n' + capturedContent);
                }
                
            } catch (error) {
                // 恢复原始函数和设置
                window.setExtensionPrompt = originalSetExtensionPrompt;
                this.settings.show_query_notification = originalShowNotification;
                this.settings.rerank_success_notify = originalRerankNotify;
                console.error('预览注入内容时出错:', error);
                this.toastr.error('预览失败: ' + error.message);
            }
            
        } catch (error) {
            console.error('预览注入内容失败:', error);
            this.toastr.error('预览失败: ' + error.message);
        }
    }

    /**
     * Analyze injected content
     * @private
     */
    _analyzeInjectedContent(content) {
        const stats = {
            totalChars: content.length,
            chatCount: 0,
            fileCount: 0,
            worldInfoCount: 0
        };

        // Count different content types based on tags
        const chatMatches = content.match(/<past_chat>[\s\S]*?<\/past_chat>/g);
        const fileMatches = content.match(/<databank>[\s\S]*?<\/databank>/g);
        const worldInfoMatches = content.match(/<world_part>[\s\S]*?<\/world_part>/g);

        if (chatMatches) {
            // Count individual chat items within the tag
            chatMatches.forEach(match => {
                // Simple heuristic: count line breaks as rough message count
                const lines = match.split('\n').filter(line => line.trim().length > 0);
                stats.chatCount += Math.max(1, Math.floor(lines.length / 2)); // Rough estimate
            });
        }

        if (fileMatches) {
            stats.fileCount = fileMatches.length;
        }

        if (worldInfoMatches) {
            // Count individual world info items
            worldInfoMatches.forEach(match => {
                const lines = match.split('\n').filter(line => line.trim().length > 0);
                stats.worldInfoCount += Math.max(1, Math.floor(lines.length / 2)); // Rough estimate
            });
        }

        return stats;
    }

    /**
     * Escape HTML for safe display
     * @private
     */
    _escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Cleanup - remove event listeners
     */
    destroy() {
        console.log('QuerySettings: Destroying...');
        
        // Remove event listeners
        this.rerankFields.forEach(field => {
            $(`#vectors_enhanced_${field}`).off('input change');
        });
        
        // Clear validation errors
        this.clearValidationErrors();
        
        this.initialized = false;
        console.log('QuerySettings: Destroyed');
    }
}