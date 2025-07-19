/**
 * Memory UI Component
 * Handles the memory management interface (UI only)
 */

// Import updateWorldInfoList functions
import { updateWorldInfoList as updateSillyTavernWorldInfoList, loadWorldInfo, METADATA_KEY } from '../../../../../../world-info.js';
import { updateWorldInfoList as updatePluginWorldInfoList } from './WorldInfoList.js';
import { getContext, extension_settings } from '../../../../../../extensions.js';
import { chat_metadata } from '../../../../../../../script.js';


// Using preset format - prompts removed

// Default memory settings
const defaultMemorySettings = {
    source: 'google_openai', // 默认使用Google
    summaryLength: 'normal', // 默认使用正常长度
    autoCreateWorldBook: false, // 默认不自动生成世界书
    google_openai: {
        model: 'gemini-1.5-flash'  // 设置默认模型
    },
    openai_compatible: {
        url: '',
        model: ''
    },
    // prompts removed - using preset format
    autoSummarize: {
        enabled: false,
        interval: 20,  // 每20层自动总结
        messageCount: 6,  // 保留最近6层消息
        lastSummarizedFloor: 0  // 上次总结的楼层
    },
    hideFloorsAfterSummary: false  // 总结后隐藏楼层
};

export class MemoryUI {
    constructor(dependencies = {}) {
        this.memoryService = dependencies.memoryService;
        this.toastr = dependencies.toastr;
        this.eventBus = dependencies.eventBus;
        this.getContext = dependencies.getContext;
        this.oai_settings = dependencies.oai_settings;
        this.settings = dependencies.settings; // 添加settings引用
        this.saveSettingsDebounced = dependencies.saveSettingsDebounced; // 添加保存函数引用
        this.generateRaw = dependencies.generateRaw; // 添加generateRaw API
        this.eventSource = dependencies.eventSource; // 添加eventSource
        this.event_types = dependencies.event_types; // 添加event_types
        this.saveChatConditional = dependencies.saveChatConditional; // 添加saveChatConditional
        this.initialized = false;

        // UI state
        this.isProcessing = false;
        this.isAutoSummarizing = false;  // 防止自动总结并发执行
    }

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        // 先加载配置，再绑定事件
        await this.loadApiConfig();
        this.bindEventListeners();
        this.subscribeToEvents();
        
        // 初始化聊天楼层监控
        this.initializeChatFloorMonitor();
    }

    bindEventListeners() {
        // Summarize button click handler
        $('#memory_summarize_btn').off('click').on('click', () => this.handleSummarizeClick());

        // API source change
        $('#memory_api_source').off('change').on('change', (e) => {
            this.handleApiSourceChange(e.target.value);
        });


        // Prompt buttons removed - using preset format

        // Save config on input changes (包括API密钥)
        $('#memory_openai_url, #memory_openai_api_key, #memory_openai_model, #memory_google_openai_api_key, #memory_google_openai_model, #memory_summary_length, #memory_hide_floors_after_summary')
            .off('change input').on('change input', () => this.saveApiConfig());

        // Vectorize summary button handler
        $('#memory_vectorize_summary').off('click').on('click', () => this.vectorizeChatLore());
        
        // Auto-summarize settings
        $('#memory_auto_summarize_enabled').off('change').on('change', (e) => {
            const enabled = e.target.checked;
            $('#memory_auto_summarize_settings').toggle(enabled);
            $('#memory_auto_summarize_status').toggle(enabled);
            if (enabled) {
                this.updateAutoSummarizeStatus();
            }
            this.saveApiConfig();
        });
        
        $('#memory_auto_summarize_interval, #memory_auto_summarize_count')
            .off('change input').on('change input', (e) => {
                // 如果是保留数量输入框，确保最小值为1
                if (e.target.id === 'memory_auto_summarize_count') {
                    const value = parseInt(e.target.value) || 0;
                    if (value < 1) {
                        e.target.value = 1;
                    }
                }
                this.updateAutoSummarizeStatus();
                this.saveApiConfig();
            });

        // 不在这里初始化API源显示，因为loadApiConfig已经处理了
    }

    subscribeToEvents() {
        if (!this.eventBus) return;

        // Subscribe to memory service events
        this.eventBus.on('memory:message-start', () => {
            this.showLoading();
        });

        this.eventBus.on('memory:message-complete', async (data) => {
            const response = data.response || '';
            
            // 检查响应是否有效
            if (!response || response.trim().length < 2) {
                console.error('[MemoryUI] AI返回空内容');
                this.toastr?.error('AI返回了空内容，请检查API设置');
                this.displayResponse('');
                this.hideLoading();
                return;
            }
            
            // 检查是否包含错误信息（短响应中包含错误关键词）
            const errorKeywords = ['error', 'Error', 'ERROR', '错误', '失败', 'failed', 'Failed'];
            const lowerResponse = response.toLowerCase();
            const isError = errorKeywords.some(keyword => 
                lowerResponse.includes(keyword.toLowerCase()) && response.length < 100
            );
            
            if (isError) {
                console.warn('[MemoryUI] AI可能返回了错误:', response);
                this.toastr?.warning('AI响应可能包含错误：' + response.substring(0, 50) + '...');
            }
            
            this.displayResponse(response);
            this.hideLoading();
            
            // 只有有效响应才自动生成世界书
            if (response && response.trim().length >= 2) {
                // 延迟一下确保UI已更新
                setTimeout(() => {
                    this.createWorldBook();
                }, 100);
            }
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
     * Handle summarize button click
     */
    async handleSummarizeClick() {
        if (this.isProcessing) return;

        try {
            // 获取 extension_settings 和 context
            const { extension_settings, getContext } = await import('../../../../../../extensions.js');
            const settings = extension_settings.vectors_enhanced;
            const context = getContext();
            
            // 检查聊天内容是否启用
            if (!settings.selected_content.chat.enabled) {
                this.toastr?.warning('请先在内容选择中启用聊天记录');
                return;
            }
            
            // 检查是否有聊天记录
            if (!context.chat || context.chat.length === 0) {
                this.toastr?.warning('当前没有聊天记录');
                return;
            }
            
            // 导入必要的函数和工具
            const { getMessages } = await import('../../utils/chatUtils.js');
            const { extractTagContent } = await import('../../utils/tagExtractor.js');
            
            // 获取聊天设置
            const chatSettings = settings.selected_content.chat;
            const rules = chatSettings.tag_rules || settings.tag_extraction_rules || [];
            
            // 使用 getMessages 函数获取过滤后的消息
            const messageOptions = {
                includeHidden: chatSettings.include_hidden || false,
                types: chatSettings.types || { user: true, assistant: true },
                range: chatSettings.range,
                newRanges: chatSettings.newRanges
            };
            
            const messages = getMessages(context.chat, messageOptions);
            
            if (messages.length === 0) {
                this.toastr?.warning('没有找到符合条件的聊天内容');
                return;
            }
            
            // 获取楼层编号范围
            const indices = messages.map(msg => msg.index).sort((a, b) => a - b);
            const startIndex = indices[0];
            const endIndex = indices[indices.length - 1];
            const floorRange = { start: startIndex, end: endIndex, count: messages.length };
            
            // 处理并格式化聊天内容
            const chatTexts = messages.map(msg => {
                let extractedText;
                
                // 检查是否为首楼（index === 0）或用户楼层（msg.is_user === true）
                if (msg.index === 0 || msg.is_user === true) {
                    // 首楼或用户楼层：使用完整的原始文本，不应用标签提取规则
                    extractedText = msg.text;
                } else {
                    // 其他楼层：应用标签提取规则
                    extractedText = extractTagContent(msg.text, rules);
                }
                
                const msgType = msg.is_user ? '用户' : 'AI';
                return `#${msg.index} [${msgType}]: ${extractedText}`;
            }).join('\n\n');
            
            // 添加楼层信息头部
            const headerInfo = `【楼层 #${startIndex} 至 #${endIndex}，共 ${messages.length} 条消息】\n\n`;
            const contentWithHeader = headerInfo + chatTexts;
            
            // Get API configuration
            const apiSource = $('#memory_api_source').val();
            const apiConfig = this.getApiConfig();
            
            console.log('[MemoryUI] API配置:', {
                source: apiSource,
                config: apiConfig,
                hasApiKey: !!apiConfig.apiKey
            });
            
            // Get summary length selection
            const summaryLength = $('#memory_summary_length').val() || 'normal';

            this.showLoading();
            
            // 显示总结开始提示
            this.toastr?.info(`开始总结楼层 #${startIndex} 至 #${endIndex} 的内容...`);
            
            // 临时存储楼层信息
            this._tempFloorRange = floorRange;
            
            try {
                const result = await this.memoryService.sendMessage(contentWithHeader, {
                    apiSource: apiSource,
                    apiConfig: apiConfig,
                    summaryLength: summaryLength
                });
                
                if (result.success) {
                    this.toastr?.success(`已总结楼层 #${startIndex} 至 #${endIndex} 的内容`);
                    
                    // 检查是否需要隐藏楼层
                    await this.hideFloorsIfEnabled(startIndex, endIndex, false);
                }
            } catch (error) {
                console.error('[MemoryUI] 总结失败:', error);
                this.toastr?.error('总结失败: ' + error.message);
                this.hideLoading();
            }
        } catch (error) {
            console.error('[MemoryUI] 获取聊天内容失败:', error);
            this.toastr?.error('获取聊天内容失败: ' + error.message);
        }
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

        // Get API configuration
        const apiSource = $('#memory_api_source').val();
        const apiConfig = this.getApiConfig();
        
        // Get summary length selection
        const summaryLength = $('#memory_summary_length').val() || 'normal';

        // Get UI settings - prompts removed, using preset format
        const options = {
            apiSource: apiSource,
            apiConfig: apiConfig,
            summaryLength: summaryLength
        };

        // Delegate to service
        this.isProcessing = true;
        this.setUIState(false);

        try {
            const result = await this.memoryService.sendMessage(input, options); // 只传递用户输入

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


    // Prompt restore methods removed - using preset format


    /**
     * Create a new world book
     */
    async createWorldBook() {
        try {
            // 检查是否有AI回复内容
            const outputContent = $('#memory_output').val();
            const hasSummaryContent = outputContent && outputContent.trim();
            
            // 获取楼层信息（使用临时存储的信息）
            const floorRange = this._tempFloorRange;
            
            // 调用服务层方法创建世界书，传入总结标志和楼层信息
            const result = await this.memoryService.createWorldBook(hasSummaryContent, floorRange);
            
            // 清除临时存储的楼层信息
            this._tempFloorRange = null;
            
            if (result.success) {
                // 根据不同操作构建不同的成功消息
                let successMessage = '';
                
                if (result.isNewWorldBook) {
                    // 新建世界书的情况
                    successMessage = `成功创建世界书: ${result.name}`;
                    if (result.newEntry) {
                        successMessage += '，并添加了第一个总结条目';
                    }
                } else {
                    // 世界书已存在的情况
                    if (result.newEntry) {
                        successMessage = `在世界书"${result.name}"中添加了新的总结条目`;
                    } else {
                        successMessage = `世界书"${result.name}"已存在`;
                    }
                }
                
                if (result.boundToChatLore) {
                    successMessage += '，已绑定为当前聊天的知识库';
                }
                
                this.toastr?.success(successMessage);
                
                // 触发世界书更新事件
                if (this.eventSource && this.event_types) {
                    this.eventSource.emit(this.event_types.WORLDINFO_UPDATED, result.name, result.data);
                }
                
                // 调用 SillyTavern 的更新函数来刷新主界面列表
                await updateSillyTavernWorldInfoList();
                
                // 调用插件的更新函数来刷新插件内部列表
                await updatePluginWorldInfoList();
            }
            
        } catch (error) {
            console.error('[MemoryUI] 创建世界书失败:', error);
            this.toastr?.error('创建世界书失败: ' + error.message);
        }
    }


    /**
     * Initialize API source display without saving
     * @param {string} source - Selected API source
     */
    initializeApiSourceDisplay(source) {
        // Hide all settings
        $('#memory_openai_settings, #memory_google_openai_settings').hide();

        // Show relevant settings
        switch(source) {
            case 'openai_compatible':
                $('#memory_openai_settings').show();
                break;
            case 'google_openai':
                $('#memory_google_openai_settings').show();
                break;
        }
    }

    /**
     * Handle API source change
     * @param {string} source - Selected API source
     */
    handleApiSourceChange(source) {
        // Hide all settings
        $('#memory_openai_settings, #memory_google_openai_settings').hide();

        // Show relevant settings
        switch(source) {
            case 'openai_compatible':
                $('#memory_openai_settings').show();
                break;
            case 'google_openai':
                $('#memory_google_openai_settings').show();
                break;
        }

        // Save selection
        this.saveApiConfig();
    }


    /**
     * Get current API configuration
     * @returns {Object} API configuration
     */
    getApiConfig() {
        const source = $('#memory_api_source').val();

        switch(source) {
            case 'openai_compatible':
                return {
                    url: $('#memory_openai_url').val(),
                    apiKey: $('#memory_openai_api_key').val(),
                    model: $('#memory_openai_model').val() || ''
                };
            case 'google_openai':
                return {
                    apiKey: $('#memory_google_openai_api_key').val(),
                    model: $('#memory_google_openai_model').val() || ''
                };
            default:
                return {};
        }
    }

    /**
     * 保存API配置到扩展设置
     */
    async saveApiConfig() {
        // 使用传入的settings引用
        if (!this.settings) {
            console.error('[MemoryUI] settings引用不可用');
            return;
        }

        // 直接保存到settings对象
        const memoryConfig = {
            source: $('#memory_api_source').val(),
            summaryLength: $('#memory_summary_length').val() || 'normal',
            autoCreateWorldBook: $('#memory_auto_create_world_book').prop('checked'),
            openai_compatible: {
                url: $('#memory_openai_url').val(),
                model: $('#memory_openai_model').val() || ''
            },
            google_openai: {
                model: $('#memory_google_openai_model').val() || ''
            },
            // prompts removed - using preset format
            autoSummarize: {
                enabled: $('#memory_auto_summarize_enabled').prop('checked'),
                interval: parseInt($('#memory_auto_summarize_interval').val()) || 20,
                messageCount: Math.max(1, parseInt($('#memory_auto_summarize_count').val()) || 1),
                lastSummarizedFloor: this.settings?.memory?.autoSummarize?.lastSummarizedFloor || 0
            },
            hideFloorsAfterSummary: $('#memory_hide_floors_after_summary').prop('checked')
        };
        
        this.settings.memory = memoryConfig;

        // 保存密钥到secrets（保留这部分，因为密钥需要特殊处理）
        await this.saveApiKeys();

        // 保存设置 - 需要先同步到extension_settings
        const context = this.getContext();
        if (context && context.extensionSettings && context.extensionSettings.vectors_enhanced) {
            // 深度复制memory设置到extension_settings
            context.extensionSettings.vectors_enhanced.memory = JSON.parse(JSON.stringify(this.settings.memory));
        }
        
        if (this.saveSettingsDebounced) {
            this.saveSettingsDebounced();
        } else if (window.saveSettingsDebounced) {
            window.saveSettingsDebounced();
        }
    }

    /**
     * 保存API密钥
     */
    async saveApiKeys() {
        const headers = this.memoryService.getRequestHeaders ? this.memoryService.getRequestHeaders() : {};


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
        
        // 保存Google转OpenAI API Key
        const googleOpenAIKey = $('#memory_google_openai_api_key').val();
        if (googleOpenAIKey) {
            try {
                await fetch('/api/secrets/write', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        key: 'memory_google_openai_api_key',
                        value: googleOpenAIKey
                    })
                });
            } catch (error) {
                console.error('保存Google转OpenAI API Key失败:', error);
            }
        }
    }

    /**
     * 加载API配置
     */
    async loadApiConfig() {
        // 使用传入的settings引用
        if (!this.settings) {
            console.error('[MemoryUI] settings引用不可用');
            return;
        }
        
        // 如果没有memory配置，使用默认设置初始化
        if (!this.settings.memory) {
            this.settings.memory = { ...defaultMemorySettings };
            // 保存默认设置
            if (this.saveSettingsDebounced) {
                this.saveSettingsDebounced();
            }
        }
        
        // 获取配置
        const config = this.settings.memory;

        // 加载配置到UI
        
        $('#memory_api_source').val(config.source || 'google_openai');
        $('#memory_summary_length').val(config.summaryLength || 'normal');
        $('#memory_auto_create_world_book').prop('checked', config.autoCreateWorldBook || false);
        $('#memory_openai_url').val(config.openai_compatible?.url || '');
        $('#memory_openai_model').val(config.openai_compatible?.model || '');
        $('#memory_google_openai_model').val(config.google_openai?.model || '');
        
        // Auto-summarize settings
        if (config.autoSummarize) {
            $('#memory_auto_summarize_enabled').prop('checked', config.autoSummarize.enabled || false);
            $('#memory_auto_summarize_interval').val(config.autoSummarize.interval || 20);
            $('#memory_auto_summarize_count').val(config.autoSummarize.messageCount || 6);
            $('#memory_auto_summarize_settings').toggle(config.autoSummarize.enabled || false);
            $('#memory_auto_summarize_status').toggle(config.autoSummarize.enabled || false);
            if (config.autoSummarize.enabled) {
                this.updateAutoSummarizeStatus();
            }
        }
        
        // Hide floors setting
        $('#memory_hide_floors_after_summary').prop('checked', config.hideFloorsAfterSummary || false);
        
        // Prompts loading removed - using preset format

        // 加载密钥
        await this.loadApiKeys();

        // 更新UI显示
        this.initializeApiSourceDisplay(config.source || 'google_openai');
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


                // 加载OpenAI API Key
                if (secrets.memory_openai_api_key) {
                    $('#memory_openai_api_key').val(secrets.memory_openai_api_key);
                }
                
                // 加载Google转OpenAI API Key
                if (secrets.memory_google_openai_api_key) {
                    $('#memory_google_openai_api_key').val(secrets.memory_google_openai_api_key);
                    console.log('[MemoryUI] 已加载Google API Key');
                } else {
                    console.log('[MemoryUI] 未找到保存的Google API Key');
                }
            }
        } catch (error) {
            console.error('加载API密钥失败:', error);
        }
    }

    /**
     * 注入选中的聊天内容到输入框
     */
    async injectSelectedContent() {
        try {
            // 获取 extension_settings 和 context
            const { extension_settings, getContext } = await import('../../../../../../extensions.js');
            const settings = extension_settings.vectors_enhanced;
            const context = getContext();
            
            // 检查聊天内容是否启用
            if (!settings.selected_content.chat.enabled) {
                this.toastr?.warning('请先在内容选择中启用聊天记录');
                return;
            }
            
            // 检查是否有聊天记录
            if (!context.chat || context.chat.length === 0) {
                this.toastr?.warning('当前没有聊天记录');
                return;
            }
            
            // 导入必要的函数和工具
            const { getMessages } = await import('../../utils/chatUtils.js');
            const { extractTagContent } = await import('../../utils/tagExtractor.js');
            
            // 获取聊天设置
            const chatSettings = settings.selected_content.chat;
            const rules = chatSettings.tag_rules || settings.tag_extraction_rules || [];
            
            // 使用 getMessages 函数获取过滤后的消息
            const messageOptions = {
                includeHidden: chatSettings.include_hidden || false,
                types: chatSettings.types || { user: true, assistant: true },
                range: chatSettings.range,
                newRanges: chatSettings.newRanges
            };
            
            const messages = getMessages(context.chat, messageOptions);
            
            if (messages.length === 0) {
                this.toastr?.warning('没有找到符合条件的聊天内容');
                return;
            }
            
            // 获取楼层编号范围
            const indices = messages.map(msg => msg.index).sort((a, b) => a - b);
            const startIndex = indices[0];
            const endIndex = indices[indices.length - 1];
            
            // 处理并格式化聊天内容
            const chatTexts = messages.map(msg => {
                let extractedText;
                
                // 检查是否为首楼（index === 0）或用户楼层（msg.is_user === true）
                if (msg.index === 0 || msg.is_user === true) {
                    // 首楼或用户楼层：使用完整的原始文本，不应用标签提取规则
                    extractedText = msg.text;
                } else {
                    // 其他楼层：应用标签提取规则
                    extractedText = extractTagContent(msg.text, rules);
                }
                
                const msgType = msg.is_user ? '用户' : 'AI';
                return `#${msg.index} [${msgType}]: ${extractedText}`;
            }).join('\n\n');
            
            // 添加楼层信息头部
            const headerInfo = `【注入内容：楼层 #${startIndex} 至 #${endIndex}，共 ${messages.length} 条消息】\n\n`;
            const contentWithHeader = headerInfo + chatTexts;
            
            // 注入到输入框
            const inputElement = $('#memory_input');
            const currentValue = inputElement.val();
            
            // 如果输入框已有内容，添加分隔符
            if (currentValue && currentValue.trim()) {
                inputElement.val(currentValue + '\n\n---\n\n' + contentWithHeader);
            } else {
                inputElement.val(contentWithHeader);
            }
            
            // 触发 input 事件，以防有其他监听器
            inputElement.trigger('input');
            
            // 存储楼层信息到数据属性，以便其他功能使用
            inputElement.data('injected-range', { start: startIndex, end: endIndex, count: messages.length });
            
            // 显示更详细的提示
            this.toastr?.info(`已注入楼层 #${startIndex} 至 #${endIndex} 的 ${messages.length} 条聊天记录`);
            
        } catch (error) {
            console.error('[MemoryUI] 注入内容失败:', error);
            this.toastr?.error('注入内容失败: ' + error.message);
        }
    }

    /**
     * 向量化当前聊天的总结内容
     */
    async vectorizeChatLore() {
        try {
            // 尝试多种方式获取chat world
            let chatWorld = chat_metadata?.[METADATA_KEY];
            
            // 如果直接获取失败，尝试从getContext获取
            if (!chatWorld) {
                const context = this.getContext ? this.getContext() : window.getContext?.();
                if (context && context.chat_metadata) {
                    chatWorld = context.chat_metadata[METADATA_KEY];
                }
            }
            
            // 如果还是没有，尝试window.chat_metadata
            if (!chatWorld && window.chat_metadata) {
                chatWorld = window.chat_metadata[METADATA_KEY];
            }
            
            console.log('[MemoryUI] Chat world from various sources:', {
                fromImport: chat_metadata?.[METADATA_KEY],
                fromContext: this.getContext?.()?.chat_metadata?.[METADATA_KEY],
                fromWindow: window.chat_metadata?.[METADATA_KEY],
                final: chatWorld
            });
            
            if (!chatWorld) {
                this.toastr?.warning('当前聊天没有绑定的世界书');
                return;
            }
            
            // 直接执行，不需要确认
            
            // 加载世界书数据
            const worldData = await loadWorldInfo(chatWorld);
            if (!worldData || !worldData.entries) {
                this.toastr?.error('无法加载世界书数据');
                return;
            }
            
            // 获取所有有效条目（不筛选，但排除禁用的条目）
            const validEntries = Object.values(worldData.entries).filter(entry => 
                !entry.disable && entry.content && entry.content.trim()
            );
            
            if (validEntries.length === 0) {
                this.toastr?.warning('世界书中没有有效条目');
                return;
            }
            
            // 准备向量化的内容
            const contentToVectorize = validEntries.map(entry => ({
                uid: entry.uid,
                world: chatWorld,
                key: entry.key,
                keysecondary: entry.keysecondary,
                comment: entry.comment,
                content: entry.content,
                order: entry.order,
                position: entry.position,
                disable: entry.disable
            }));
            
            // 调用向量化功能
            const settings = extension_settings.vectors_enhanced;
            
            // 创建一个特殊的向量化任务
            const taskName = `${chatWorld} - 世界书向量化`;
            const taskId = `worldbook_${Date.now()}`;
            
            // 触发向量化
            const event = new CustomEvent('vectors:vectorize-summary', {
                detail: {
                    taskName,
                    taskId,
                    content: contentToVectorize,
                    worldName: chatWorld
                }
            });
            document.dispatchEvent(event);
            
            this.toastr?.info(`开始向量化世界书 "${chatWorld}"，共 ${validEntries.length} 个条目...`);
            
        } catch (error) {
            console.error('[MemoryUI] 向量化总结失败:', error);
            this.toastr?.error('向量化总结失败: ' + error.message);
        }
    }

    /**
     * Initialize chat floor monitor
     */
    initializeChatFloorMonitor() {
        // 立即更新一次
        this.updateChatFloorCount();
        
        // 监听SillyTavern的消息事件
        if (this.eventSource && this.event_types) {
            // 监听消息发送事件
            this.eventSource.on(this.event_types.MESSAGE_SENT, () => {
                setTimeout(() => this.updateChatFloorCount(), 100);
            });
            
            // 监听消息接收事件
            this.eventSource.on(this.event_types.MESSAGE_RECEIVED, () => {
                setTimeout(() => {
                    this.updateChatFloorCount();
                    this.checkAutoSummarize();  // 检查是否需要自动总结
                }, 100);
            });
            
            // 监听消息删除事件
            this.eventSource.on(this.event_types.MESSAGE_DELETED, () => {
                setTimeout(() => this.updateChatFloorCount(), 100);
            });
            
            // 监听消息编辑事件
            this.eventSource.on(this.event_types.MESSAGE_EDITED, () => {
                setTimeout(() => this.updateChatFloorCount(), 100);
            });
            
            // 监听聊天切换事件
            this.eventSource.on(this.event_types.CHAT_CHANGED, () => {
                setTimeout(() => {
                    this.updateChatFloorCount();
                    this.updateAutoSummarizeStatus();
                }, 100);
            });
            
            // 监听聊天加载事件
            this.eventSource.on(this.event_types.CHAT_LOADED, () => {
                setTimeout(() => {
                    this.updateChatFloorCount();
                    this.updateAutoSummarizeStatus();
                }, 100);
            });
        }
    }
    
    /**
     * Update chat floor count display
     */
    updateChatFloorCount() {
        try {
            const context = this.getContext ? this.getContext() : getContext();
            const floorElement = $('#memory_chat_floor_count');
            
            if (!context || !context.chat) {
                floorElement.text('无聊天');
                return;
            }
            
            const chat = context.chat;
            const totalMessages = chat.length;
            
            // 计算实际可见的消息数（排除系统消息）
            const visibleMessages = chat.filter(msg => !msg.is_system).length;
            
            // 获取最新消息的楼层号（基于索引）
            const latestFloor = totalMessages > 0 ? totalMessages - 1 : 0;
            
            // 显示格式：楼层 #N (共M条)
            if (visibleMessages === totalMessages) {
                floorElement.text(`楼层 #${latestFloor} (共${totalMessages}条)`);
            } else {
                floorElement.text(`楼层 #${latestFloor} (${visibleMessages}/${totalMessages}条)`);
            }
            
            // 添加颜色提示：如果消息数量较多
            if (totalMessages > 100) {
                floorElement.css('color', 'var(--warning)');
                floorElement.attr('title', '消息数量较多，考虑总结部分内容以提高性能');
            } else if (totalMessages > 50) {
                floorElement.css('color', 'var(--SmartThemeQuoteColor)');
                floorElement.attr('title', '消息数量适中');
            } else {
                floorElement.css('color', 'var(--SmartThemeEmColor)');
                floorElement.attr('title', '当前聊天楼层信息');
            }
            
        } catch (error) {
            console.error('[MemoryUI] 更新聊天楼层失败:', error);
            $('#memory_chat_floor_count').text('错误');
        }
    }

    /**
     * Update auto-summarize status display
     */
    updateAutoSummarizeStatus() {
        const interval = parseInt($('#memory_auto_summarize_interval').val()) || 20;
        const context = this.getContext ? this.getContext() : getContext();
        
        if (!context || !context.chat) {
            $('#memory_next_auto_summarize_floor').text('-');
            return;
        }
        
        const currentFloor = context.chat.length - 1;
        const lastSummarized = this.settings?.memory?.autoSummarize?.lastSummarizedFloor || 0;
        
        // 计算下一个触发楼层：简单地是上次总结位置 + 间隔
        const nextFloor = lastSummarized + interval;
        
        $('#memory_next_auto_summarize_floor').text(`#${nextFloor}`);
    }
    
    /**
     * Check if auto-summarize should be triggered
     */
    async checkAutoSummarize() {
        try {
            // 检查是否已有自动总结在进行中
            if (this.isAutoSummarizing) {
                console.log('[MemoryUI] 自动总结已在进行中，跳过本次触发');
                return;
            }
            
            // 检查是否启用自动总结
            if (!this.settings?.memory?.autoSummarize?.enabled) {
                console.log('[MemoryUI] 自动总结未启用');
                return;
            }
            
            const context = this.getContext ? this.getContext() : getContext();
            if (!context || !context.chat || context.chat.length < 2) {
                console.log('[MemoryUI] 聊天上下文不可用或消息太少');
                return;
            }
            
            const currentFloor = context.chat.length - 1;
            const interval = parseInt($('#memory_auto_summarize_interval').val()) || 20;
            const keepCount = parseInt($('#memory_auto_summarize_count').val()) || 6;
            const lastSummarized = this.settings?.memory?.autoSummarize?.lastSummarizedFloor || 0;
            
            console.log('[MemoryUI] 自动总结检查:', {
                currentFloor,
                interval,
                keepCount,
                lastSummarized,
                enabled: this.settings?.memory?.autoSummarize?.enabled
            });
            
            // 检查是否达到触发条件
            // 计算从上次总结后经过的楼层数
            const floorsSinceLastSummary = currentFloor - lastSummarized;
            
            // 必须达到间隔数量才触发
            if (floorsSinceLastSummary < interval) {
                console.log('[MemoryUI] 未达到间隔楼层，不触发', {
                    currentFloor,
                    lastSummarized,
                    floorsSinceLastSummary,
                    interval,
                    needMore: interval - floorsSinceLastSummary
                });
                return;
            }
            
            // 检查最新消息是否为AI回复
            const latestMessage = context.chat[currentFloor];
            if (!latestMessage || latestMessage.is_user) {
                console.log('[MemoryUI] 最新消息不是AI回复，不触发');
                return;
            }
            
            console.log('[MemoryUI] 触发自动总结:', {
                currentFloor,
                interval,
                keepCount,
                lastSummarized
            });
            
            // 设置标志，防止并发执行
            this.isAutoSummarizing = true;
            
            // 执行自动总结
            await this.performAutoSummarize(currentFloor, keepCount);
            
        } catch (error) {
            console.error('[MemoryUI] 自动总结检查失败:', error);
            // 如果检查过程出错，也要清除标志
            this.isAutoSummarizing = false;
        }
    }
    
    /**
     * Perform auto-summarization
     */
    async performAutoSummarize(currentFloor, keepCount) {
        try {
            console.log('[MemoryUI] performAutoSummarize 开始执行', { currentFloor, keepCount });
            this.toastr?.info('开始自动总结...');
            
            // 导入必要的函数和工具
            const { extension_settings, getContext } = await import('../../../../../../extensions.js');
            const { getMessages } = await import('../../utils/chatUtils.js');
            const { extractTagContent } = await import('../../utils/tagExtractor.js');
            
            const settings = extension_settings.vectors_enhanced;
            const context = getContext();
            
            // 获取标签提取规则（如果有的话）
            const rules = settings.tag_extraction_rules || [];
            
            // 确保保留数量至少为1
            const actualKeepCount = Math.max(1, keepCount);
            
            // 计算要总结的范围
            // currentFloor是当前楼层（从0开始）
            // actualKeepCount是要保留的层数
            // 上次总结的位置
            const lastSummarized = this.settings?.memory?.autoSummarize?.lastSummarizedFloor || 0;
            
            // 总结范围：从上次总结位置开始，到当前楼层-保留数量
            const startIndex = lastSummarized;
            const endIndex = currentFloor - actualKeepCount;
            
            if (endIndex <= startIndex) {
                console.log('[MemoryUI] 消息数量不足，无需总结');
                this.toastr?.warning('消息数量不足，无需总结');
                return;
            }
            
            // 收集要总结的AI消息
            const aiMessages = [];
            
            // 从startIndex开始，到endIndex结束（包含），收集所有AI消息
            for (let i = startIndex; i <= endIndex; i++) {
                const msg = context.chat[i];
                if (msg && !msg.is_user && !msg.is_system) {
                    // 这是AI消息
                    aiMessages.push({
                        ...msg,
                        index: i
                    });
                }
            }
            
            console.log('[MemoryUI] 收集到的AI消息数量:', aiMessages.length);
            
            if (aiMessages.length === 0) {
                console.log('[MemoryUI] 没有找到AI消息');
                this.toastr?.warning('没有找到足够的AI消息进行总结');
                return;
            }
            
            // 调试：显示收集到的消息
            console.log('[MemoryUI] 收集到的AI消息详情:', aiMessages.map(msg => ({
                index: msg.index,
                hasText: !!msg.text,
                hasMes: !!msg.mes,
                textLength: (msg.text || '').length,
                mesLength: (msg.mes || '').length
            })));
            
            // 处理并格式化AI消息
            const chatTexts = aiMessages.map(msg => {
                // 获取消息文本（SillyTavern使用mes属性）
                const messageText = msg.mes || msg.text || '';
                
                if (!messageText) {
                    console.warn(`[MemoryUI] 楼层 #${msg.index} 的AI消息为空`);
                    return `#${msg.index} [AI]: （空消息）`;
                }
                
                // 对AI消息应用标签提取规则
                const extractedText = extractTagContent(messageText, rules);
                return `#${msg.index} [AI]: ${extractedText}`;
            }).join('\n\n');
            
            // 添加楼层信息头部
            const headerInfo = `【自动总结：楼层 #${startIndex} 至 #${endIndex}，共 ${aiMessages.length} 条AI消息】\n\n`;
            const contentWithHeader = headerInfo + chatTexts;
            
            // 调试：检查最终内容
            console.log('[MemoryUI] 准备发送的内容长度:', contentWithHeader.length);
            console.log('[MemoryUI] 内容预览:', contentWithHeader.substring(0, 200) + '...');
            
            // 获取API配置
            const apiSource = $('#memory_api_source').val();
            const apiConfig = this.getApiConfig();
            const summaryLength = $('#memory_summary_length').val() || 'normal';
            
            // 临时存储楼层信息
            this._tempFloorRange = { 
                start: startIndex, 
                end: endIndex, 
                count: aiMessages.length,
                isAutoSummarize: true,
                isAIOnly: true  // 标记这是仅AI消息的总结
            };
            
            console.log('[MemoryUI] 准备调用memoryService.sendMessage', {
                contentLength: contentWithHeader.length,
                apiSource,
                apiConfig,
                summaryLength,
                hasApiKey: !!apiConfig.apiKey,
                apiUrl: apiConfig.url || 'N/A'
            });
            
            // 检查API配置
            if (!apiConfig.apiKey && apiSource !== 'main_api') {
                console.error('[MemoryUI] API密钥未设置');
                this.toastr?.error('请先配置API密钥');
                return;
            }
            
            // 执行总结
            console.log('[MemoryUI] 调用memoryService.sendMessage前');
            const result = await this.memoryService.sendMessage(contentWithHeader, {
                apiSource: apiSource,
                apiConfig: apiConfig,
                summaryLength: summaryLength
            });
            console.log('[MemoryUI] memoryService.sendMessage返回:', result);
            
            if (result && result.success) {
                // 检查响应内容是否有效
                const response = result.response || '';
                
                // 检查是否为空或太短
                if (!response || response.trim().length < 2) {
                    console.error('[MemoryUI] 自动总结返回空内容');
                    this.toastr?.error('自动总结失败：AI返回了空内容');
                    this.hideLoading();
                    return;
                }
                
                // 检查是否包含错误标记（常见的错误响应）
                const errorKeywords = ['error', 'Error', 'ERROR', '错误', '失败', 'failed', 'Failed'];
                const lowerResponse = response.toLowerCase();
                const isError = errorKeywords.some(keyword => 
                    lowerResponse.includes(keyword.toLowerCase()) && response.length < 100
                );
                
                if (isError) {
                    console.error('[MemoryUI] 自动总结可能返回了错误:', response);
                    this.toastr?.warning('自动总结可能失败：' + response.substring(0, 50) + '...');
                }
                
                // 更新最后总结的楼层为endIndex+1（下次从这里开始）
                if (this.settings?.memory?.autoSummarize) {
                    this.settings.memory.autoSummarize.lastSummarizedFloor = endIndex + 1;
                    await this.saveApiConfig();
                }
                
                this.toastr?.success(`自动总结完成：楼层 #${startIndex} 至 #${endIndex}`);
                this.updateAutoSummarizeStatus();
                
                // 检查是否需要隐藏楼层
                await this.hideFloorsIfEnabled(startIndex, endIndex, true);
            } else {
                // 处理失败情况
                console.error('[MemoryUI] 自动总结返回失败:', result);
                this.toastr?.error('自动总结失败：' + (result?.error || '未知错误'));
                this.hideLoading();
            }
            
        } catch (error) {
            console.error('[MemoryUI] 自动总结失败:', error);
            console.error('[MemoryUI] 错误堆栈:', error.stack);
            this.toastr?.error('自动总结失败: ' + error.message);
            
            // 如果失败了，也要显示加载完成
            this.hideLoading();
        } finally {
            // 无论成功还是失败，都要清除标志
            this.isAutoSummarizing = false;
            console.log('[MemoryUI] 自动总结完成，清除并发标志');
        }
    }

    /**
     * Hide floors if enabled in settings
     * @param {number} startIndex - Start index of AI messages
     * @param {number} endIndex - End index of AI messages
     * @param {boolean} isAutoSummarize - Whether this is from auto-summarize
     */
    async hideFloorsIfEnabled(startIndex, endIndex, isAutoSummarize) {
        try {
            // 检查是否启用了隐藏楼层功能
            const hideEnabled = $('#memory_hide_floors_after_summary').prop('checked');
            if (!hideEnabled) {
                console.log('[MemoryUI] 隐藏楼层功能未启用');
                return;
            }
            
            // 使用注入的依赖
            const context = this.getContext();
            
            if (!context || !context.chat) {
                console.error('[MemoryUI] 无法获取聊天上下文');
                return;
            }
            
            // 找出需要隐藏的消息范围
            // 需要包含startIndex和endIndex之间的所有用户消息
            let hideCount = 0;
            const messagesToHide = [];
            
            // 遍历聊天记录，找出需要隐藏的消息
            for (let i = 0; i < context.chat.length; i++) {
                const msg = context.chat[i];
                
                // 如果是AI消息且在总结范围内
                if (!msg.is_user && i >= startIndex && i <= endIndex) {
                    messagesToHide.push(i);
                }
                
                // 如果是用户消息且在总结范围内（包括边界）
                // 例如：总结了5-10楼的AI消息，也要隐藏4-10之间的用户消息
                if (msg.is_user && i >= Math.max(0, startIndex - 1) && i <= endIndex) {
                    messagesToHide.push(i);
                }
            }
            
            console.log('[MemoryUI] 准备隐藏的消息索引:', messagesToHide);
            
            // 批量隐藏消息
            for (const index of messagesToHide) {
                context.chat[index].is_system = true;
                hideCount++;
            }
            
            if (hideCount > 0) {
                // 保存聊天记录
                if (this.saveChatConditional) {
                    await this.saveChatConditional();
                } else {
                    console.error('[MemoryUI] saveChatConditional not available');
                }
                
                // 触发UI更新
                const eventSource = this.eventSource;
                const event_types = this.event_types;
                if (eventSource && event_types) {
                    eventSource.emit(event_types.CHAT_CHANGED);
                }
                
                // 重新加载当前聊天以立即显示隐藏标志
                if (context.reloadCurrentChat && typeof context.reloadCurrentChat === 'function') {
                    await context.reloadCurrentChat();
                }
                
                // 更新隐藏消息信息显示
                // 注意：这里可能需要在将来添加MessageUI的依赖注入
                if (window.MessageUI && typeof window.MessageUI.updateHiddenMessagesInfo === 'function') {
                    window.MessageUI.updateHiddenMessagesInfo();
                } else {
                    console.log('[MemoryUI] MessageUI.updateHiddenMessagesInfo not available');
                }
                
                this.toastr?.info(`已隐藏 ${hideCount} 条消息`);
                console.log(`[MemoryUI] 成功隐藏 ${hideCount} 条消息`);
            }
            
        } catch (error) {
            console.error('[MemoryUI] 隐藏楼层失败:', error);
            this.toastr?.error('隐藏楼层失败: ' + error.message);
        }
    }

    destroy() {
        // Unbind event listeners
        $('#memory_summarize_btn').off('click');
        $('#memory_api_source').off('change');
        $('#memory_vectorize_summary').off('click');
        // Prompt buttons removed
        $('#memory_openai_url, #memory_openai_api_key, #memory_openai_model, #memory_google_openai_api_key, #memory_google_openai_model, #memory_summary_length').off('change');

        // Unsubscribe from events
        if (this.eventBus) {
            this.eventBus.off('memory:message-start');
            this.eventBus.off('memory:message-complete');
            this.eventBus.off('memory:message-error');
            this.eventBus.off('memory:history-updated');
        }
        
        // Unsubscribe from SillyTavern events
        if (this.eventSource && this.event_types) {
            this.eventSource.off(this.event_types.MESSAGE_SENT);
            this.eventSource.off(this.event_types.MESSAGE_RECEIVED);
            this.eventSource.off(this.event_types.MESSAGE_DELETED);
            this.eventSource.off(this.event_types.MESSAGE_EDITED);
            this.eventSource.off(this.event_types.CHAT_CHANGED);
            this.eventSource.off(this.event_types.CHAT_LOADED);
        }

        this.initialized = false;
    }

}
