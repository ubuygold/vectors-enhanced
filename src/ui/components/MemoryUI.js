/**
 * Memory UI Component
 * Handles the memory management interface (UI only)
 */
export class MemoryUI {
    constructor(dependencies = {}) {
        this.memoryService = dependencies.memoryService;
        this.toastr = dependencies.toastr;
        this.eventBus = dependencies.eventBus;
        this.getContext = dependencies.getContext;
        this.oai_settings = dependencies.oai_settings;
        this.initialized = false;
        
        // UI state
        this.isProcessing = false;
        
        // API configuration
        this.apiConfig = {
            source: 'main',
            google: {
                model: 'gemini-pro'
            },
            openai_compatible: {
                url: '',
                model: 'gpt-3.5-turbo'
            }
        };
    }

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        this.bindEventListeners();
        this.subscribeToEvents();
        await this.loadApiConfig();
    }

    bindEventListeners() {
        // Send button click handler
        $('#memory_send_btn').off('click').on('click', () => this.handleSendClick());
        
        // Enter key in input textarea
        $('#memory_input').off('keydown').on('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.handleSendClick();
            }
        });
        
        // API source change
        $('#memory_api_source').off('change').on('change', (e) => {
            this.handleApiSourceChange(e.target.value);
        });
        
        // Google model preset change
        $('#memory_google_model_preset').off('change').on('change', (e) => {
            const preset = e.target.value;
            if (preset) {
                $('#memory_google_model').val(preset);
            }
        });
        
        // OpenAI model quick selection
        $('.memory_model_presets button').off('click').on('click', (e) => {
            const model = $(e.currentTarget).data('model');
            $('#memory_openai_model').val(model);
            this.saveApiConfig();
        });
        
        // Save config on input changes
        $('#memory_google_api_key, #memory_google_model, #memory_openai_url, #memory_openai_api_key, #memory_openai_model')
            .off('change').on('change', () => this.saveApiConfig());
        
        // Initialize API source display
        this.handleApiSourceChange($('#memory_api_source').val() || 'main');
        this.updateMainModelDisplay();
    }

    subscribeToEvents() {
        if (!this.eventBus) return;
        
        // Subscribe to memory service events
        this.eventBus.on('memory:message-start', () => {
            this.showLoading();
        });
        
        this.eventBus.on('memory:message-complete', (data) => {
            this.displayResponse(data.response);
            this.hideLoading();
        });
        
        this.eventBus.on('memory:message-error', (data) => {
            this.displayError(data.error);
            this.hideLoading();
        });
        
        this.eventBus.on('memory:history-updated', () => {
            // Future: Update history display
        });
    }

    /**
     * Handle send button click
     */
    async handleSendClick() {
        if (this.isProcessing) return;
        
        const input = $('#memory_input').val().trim();
        if (!input) {
            this.toastr?.warning('请输入消息');
            return;
        }

        // Get suffix prompt
        const suffixPrompt = $('#memory_suffix_prompt').val().trim();
        
        // Combine input with suffix
        const fullInput = suffixPrompt ? `${input}\n\n${suffixPrompt}` : input;
        
        // Get API configuration
        const apiSource = $('#memory_api_source').val();
        const apiConfig = this.getApiConfig();
        
        // Get UI settings
        const options = {
            systemPrompt: $('#memory_system_prompt').val().trim(),
            apiSource: apiSource,
            apiConfig: apiConfig
        };

        // Delegate to service
        this.isProcessing = true;
        this.setUIState(false);
        
        try {
            const result = await this.memoryService.sendMessage(fullInput, options);
            
            if (result.success) {
                // Clear input on success
                $('#memory_input').val('');
            }
            
        } catch (error) {
            // Error handling is done via events
            console.error('Memory UI error:', error);
        } finally {
            this.isProcessing = false;
            this.setUIState(true);
        }
    }


    /**
     * Show loading state
     */
    showLoading() {
        $('#memory_loading').show();
        $('#memory_output').val('');
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        $('#memory_loading').hide();
    }

    /**
     * Display AI response
     * @param {string} response - AI response text
     */
    displayResponse(response) {
        $('#memory_output').val(response);
    }

    /**
     * Display error message
     * @param {Error} error - Error object
     */
    displayError(error) {
        this.toastr?.error(`发送失败: ${error.message}`);
        $('#memory_output').val(`错误: ${error.message}`);
    }

    /**
     * Enable/disable UI elements
     * @param {boolean} enabled - Whether to enable UI
     */
    setUIState(enabled) {
        $('#memory_input').prop('disabled', !enabled);
        $('#memory_send_btn').prop('disabled', !enabled);
        $('#memory_system_prompt').prop('disabled', !enabled);
        $('#memory_suffix_prompt').prop('disabled', !enabled);
    }

    /**
     * Get current UI values
     * @returns {Object} Current UI values
     */
    getUIValues() {
        return {
            input: $('#memory_input').val()
        };
    }

    /**
     * Set UI values
     * @param {Object} values - Values to set
     */
    setUIValues(values) {
        if (values.input !== undefined) {
            $('#memory_input').val(values.input);
        }
    }


    /**
     * Handle API source change
     * @param {string} source - Selected API source
     */
    handleApiSourceChange(source) {
        // Hide all settings
        $('#memory_main_settings, #memory_google_settings, #memory_openai_settings').hide();
        
        // Show relevant settings
        switch(source) {
            case 'main':
                $('#memory_main_settings').show();
                this.updateMainModelDisplay();
                break;
            case 'google':
                $('#memory_google_settings').show();
                break;
            case 'openai_compatible':
                $('#memory_openai_settings').show();
                break;
        }
        
        // Save selection
        this.apiConfig.source = source;
        this.saveApiConfig();
    }
    
    /**
     * Update main model display based on current chat settings
     */
    updateMainModelDisplay() {
        if (!this.oai_settings) return;
        
        let currentModel = '未知模型';
        const source = this.oai_settings.chat_completion_source;
        
        switch(source) {
            case 'openai':
                currentModel = this.oai_settings.openai_model || 'gpt-3.5-turbo';
                break;
            case 'claude':
                currentModel = this.oai_settings.claude_model || 'claude-2';
                break;
            case 'makersuite':
            case 'vertexai':
                currentModel = this.oai_settings.google_model || 'gemini-pro';
                break;
            case 'mistralai':
                currentModel = this.oai_settings.mistralai_model || 'mistral-medium';
                break;
            case 'custom':
                currentModel = this.oai_settings.custom_model || 'custom';
                break;
            default:
                currentModel = this.oai_settings.openai_model || source;
        }
        
        $('#memory_main_model').val(`${currentModel} (${source})`);
    }
    
    /**
     * Get current API configuration
     * @returns {Object} API configuration
     */
    getApiConfig() {
        const source = $('#memory_api_source').val();
        
        switch(source) {
            case 'google':
                return {
                    apiKey: $('#memory_google_api_key').val(),
                    model: $('#memory_google_model').val() || 'gemini-pro'
                };
            case 'openai_compatible':
                return {
                    url: $('#memory_openai_url').val(),
                    apiKey: $('#memory_openai_api_key').val(),
                    model: $('#memory_openai_model').val() || 'gpt-3.5-turbo'
                };
            default:
                return {};
        }
    }
    
    /**
     * 保存API配置到扩展设置
     */
    async saveApiConfig() {
        // 使用传入的getContext依赖
        const context = this.getContext();
        if (!context || !context.extensionSettings) return;
        
        // 确保vectors_enhanced对象存在
        if (!context.extensionSettings.vectors_enhanced) {
            context.extensionSettings.vectors_enhanced = {};
        }
        
        // 保存配置
        context.extensionSettings.vectors_enhanced.memory_api = {
            source: $('#memory_api_source').val(),
            google: {
                model: $('#memory_google_model').val() || 'gemini-pro',
                hasKey: $('#memory_google_api_key').val() ? true : false
            },
            openai_compatible: {
                url: $('#memory_openai_url').val(),
                model: $('#memory_openai_model').val() || 'gpt-3.5-turbo',  
                hasKey: $('#memory_openai_api_key').val() ? true : false
            }
        };
        
        // 保存密钥到secrets
        await this.saveApiKeys();
        
        // 保存设置 - 需要从window访问
        if (window.saveSettingsDebounced) {
            window.saveSettingsDebounced();
        }
    }
    
    /**
     * 保存API密钥
     */
    async saveApiKeys() {
        const headers = this.memoryService.getRequestHeaders ? this.memoryService.getRequestHeaders() : {};
        
        // 保存Google API Key
        const googleKey = $('#memory_google_api_key').val();
        if (googleKey) {
            try {
                await fetch('/api/secrets/write', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        key: 'memory_google_api_key',
                        value: googleKey
                    })
                });
            } catch (error) {
                console.error('保存Google API Key失败:', error);
            }
        }
        
        // 保存OpenAI Compatible API Key
        const openaiKey = $('#memory_openai_api_key').val();
        if (openaiKey) {
            try {
                await fetch('/api/secrets/write', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        key: 'memory_openai_api_key',
                        value: openaiKey
                    })
                });
            } catch (error) {
                console.error('保存OpenAI API Key失败:', error);
            }
        }
    }
    
    /**
     * 加载API配置
     */
    async loadApiConfig() {
        // 使用传入的getContext依赖
        const context = this.getContext();
        const config = context?.extensionSettings?.vectors_enhanced?.memory_api;
        
        if (config) {
            // 加载保存的配置
            $('#memory_api_source').val(config.source || 'main');
            $('#memory_google_model').val(config.google?.model || 'gemini-pro');
            $('#memory_openai_url').val(config.openai_compatible?.url || '');
            $('#memory_openai_model').val(config.openai_compatible?.model || 'gpt-3.5-turbo');
            
            // 加载密钥
            await this.loadApiKeys();
            
            // 更新UI显示
            this.handleApiSourceChange(config.source || 'main');
        }
    }
    
    /**
     * 加载API密钥
     */
    async loadApiKeys() {
        const headers = this.memoryService.getRequestHeaders ? this.memoryService.getRequestHeaders() : {};
        
        try {
            // 读取密钥状态
            const response = await fetch('/api/secrets/view', {
                method: 'POST',
                headers: headers
            });
            
            if (response.ok) {
                const secrets = await response.json();
                
                // 加载Google API Key
                if (secrets.memory_google_api_key) {
                    $('#memory_google_api_key').val(secrets.memory_google_api_key);
                }
                
                // 加载OpenAI API Key
                if (secrets.memory_openai_api_key) {
                    $('#memory_openai_api_key').val(secrets.memory_openai_api_key);
                }
            }
        } catch (error) {
            console.error('加载API密钥失败:', error);
        }
    }
    
    destroy() {
        // Unbind event listeners
        $('#memory_send_btn').off('click');
        $('#memory_input').off('keydown');
        $('#memory_api_source').off('change');
        $('#memory_google_model_preset').off('change');
        $('.memory_model_presets button').off('click');
        $('#memory_google_api_key, #memory_google_model, #memory_openai_url, #memory_openai_api_key, #memory_openai_model').off('change');
        
        // Unsubscribe from events
        if (this.eventBus) {
            this.eventBus.off('memory:message-start');
            this.eventBus.off('memory:message-complete');
            this.eventBus.off('memory:message-error');
            this.eventBus.off('memory:history-updated');
        }
        
        this.initialized = false;
    }
}