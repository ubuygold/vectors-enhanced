/**
 * Memory Service
 * 处理记忆管理的核心业务逻辑
 */
import { chat_metadata, saveMetadata } from '../../../../../../../script.js';

export class MemoryService {
    constructor(dependencies = {}) {
        this.getContext = dependencies.getContext;
        this.eventBus = dependencies.eventBus;
        this.getRequestHeaders = dependencies.getRequestHeaders;
        this.dependencies = dependencies; // 保存所有依赖

        // 对话历史
        this.conversationHistory = [];

        // 配置
        this.config = {
            maxHistoryLength: 50
        };
    }

    /**
     * 发送消息到AI并获取响应
     * @param {string} message - 用户消息
     * @param {Object} options - 生成选项
     * @returns {Promise<Object>} 响应对象
     */
    async sendMessage(message, options = {}) {
        const {
            systemPrompt = '',
            suffixPrompt = '', // 新增尾部提示词参数
            includeContext = true,
            apiSource = 'main',
            apiConfig = {}
        } = options;

        try {
            // 发布开始事件
            this.eventBus?.emit('memory:message-start', { message, options });

            // 获取当前上下文
            const context = this.getContext();
            if (!context) {
                throw new Error('无法获取当前上下文');
            }

            // 构建完整的提示词（可以包含历史记录）
            const fullPrompt = includeContext
                ? this.buildContextualPrompt(message)
                : message;

            // 根据API源调用不同的生成方法
            let response;

            switch(apiSource) {
                case 'google':
                    // 调用Google AI Studio
                    response = await this.callGoogleAPI(fullPrompt, systemPrompt, suffixPrompt, apiConfig);
                    break;

                case 'openai_compatible':
                    // 调用OpenAI兼容API
                    response = await this.callOpenAICompatibleAPI(fullPrompt, systemPrompt, suffixPrompt, apiConfig);
                    break;

                default:
                    throw new Error(`不支持的API源: ${apiSource}`);
            }

            // 记录到历史
            const historyEntry = {
                id: this.generateId(),
                timestamp: Date.now(),
                userMessage: message,
                aiResponse: response,
                options,
                context: {
                    characterName: context.characterId,
                    chatId: context.chatId
                }
            };

            this.addToHistory(historyEntry);

            // 发布完成事件
            this.eventBus?.emit('memory:message-complete', {
                message,
                response,
                historyEntry
            });

            return {
                success: true,
                response,
                historyEntry
            };

        } catch (error) {
            // 发布错误事件
            this.eventBus?.emit('memory:message-error', { message, error });

            throw error;
        }
    }

    /**
     * 构建包含上下文的提示词
     * @param {string} message - 用户消息
     * @returns {string} 完整的提示词
     */
    buildContextualPrompt(message) {
        // 基础实现，可以扩展为包含历史记录、角色设定等
        return message;
    }

    /**
     * 添加到对话历史
     * @param {Object} entry - 历史记录条目
     */
    addToHistory(entry) {
        this.conversationHistory.push(entry);

        // 限制历史长度
        if (this.conversationHistory.length > this.config.maxHistoryLength) {
            this.conversationHistory.shift();
        }

        // 发布历史更新事件
        this.eventBus?.emit('memory:history-updated', {
            history: this.conversationHistory
        });
    }

    /**
     * 获取对话历史
     * @param {Object} filter - 过滤条件
     * @returns {Array} 历史记录
     */
    getHistory(filter = {}) {
        let history = [...this.conversationHistory];

        if (filter.chatId) {
            history = history.filter(h => h.context.chatId === filter.chatId);
        }

        if (filter.characterName) {
            history = history.filter(h => h.context.characterName === filter.characterName);
        }

        if (filter.startTime) {
            history = history.filter(h => h.timestamp >= filter.startTime);
        }

        if (filter.limit) {
            history = history.slice(-filter.limit);
        }

        return history;
    }

    /**
     * 清除历史记录
     * @param {Object} filter - 过滤条件
     */
    clearHistory(filter = {}) {
        if (Object.keys(filter).length === 0) {
            // 清除所有
            this.conversationHistory = [];
        } else {
            // 根据条件清除
            this.conversationHistory = this.conversationHistory.filter(entry => {
                if (filter.chatId && entry.context.chatId === filter.chatId) {
                    return false;
                }
                if (filter.characterName && entry.context.characterName === filter.characterName) {
                    return false;
                }
                return true;
            });
        }

        this.eventBus?.emit('memory:history-cleared', { filter });
    }

    /**
     * 导出对话历史
     * @param {string} format - 导出格式 (json, text, markdown)
     * @returns {string} 导出的数据
     */
    exportHistory(format = 'json') {
        switch (format) {
            case 'json':
                return JSON.stringify(this.conversationHistory, null, 2);

            case 'text':
                return this.conversationHistory.map(entry =>
                    `[${new Date(entry.timestamp).toLocaleString()}]\n` +
                    `User: ${entry.userMessage}\n` +
                    `AI: ${entry.aiResponse}\n`
                ).join('\n---\n\n');

            case 'markdown':
                return this.conversationHistory.map(entry =>
                    `## ${new Date(entry.timestamp).toLocaleString()}\n\n` +
                    `**User**: ${entry.userMessage}\n\n` +
                    `**AI**: ${entry.aiResponse}\n`
                ).join('\n\n---\n\n');

            default:
                throw new Error(`不支持的导出格式: ${format}`);
        }
    }

    /**
     * 生成唯一ID
     * @returns {string} 唯一ID
     */
    generateId() {
        return `memory_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        this.config = {
            ...this.config,
            ...newConfig
        };
    }

    /**
     * 调用Google AI Studio API
     * @param {string} prompt - 提示词
     * @param {string} systemPrompt - 系统提示词
     * @param {string} suffixPrompt - 尾部提示词（assistant身份）
     * @param {Object} config - API配置
     * @returns {Promise<string>} AI响应
     */
    async callGoogleAPI(prompt, systemPrompt, suffixPrompt, config) {
        const { apiKey, model } = config;

        if (!apiKey) {
            throw new Error('请先配置Google AI API Key');
        }

        const baseUrl = 'https://generativelanguage.googleapis.com';
        const apiVersion = 'v1beta';
        const modelName = model || 'gemini-pro';
        const url = `${baseUrl}/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`;

        try {
            // 构建消息内容 - 新的顺序
            const contents = [];

            // 1. 系统提示词作为user消息
            if (systemPrompt) {
                contents.push({
                    role: 'user',
                    parts: [{ text: systemPrompt }]
                });
            }

            // 2. 用户输入内容作为assistant/model消息
            if (prompt) {
                contents.push({
                    role: 'model',
                    parts: [{ text: prompt }]
                });
            }

            // 3. 尾部提示词作为model消息
            if (suffixPrompt) {
                contents.push({
                    role: 'model',
                    parts: [{ text: suffixPrompt }]
                });
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048
                    },
                    safetySettings: [
                        {
                            category: 'HARM_CATEGORY_HARASSMENT',
                            threshold: 'BLOCK_NONE'
                        },
                        {
                            category: 'HARM_CATEGORY_HATE_SPEECH',
                            threshold: 'BLOCK_NONE'
                        },
                        {
                            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                            threshold: 'BLOCK_NONE'
                        },
                        {
                            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                            threshold: 'BLOCK_NONE'
                        },
                        {
                            category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
                            threshold: 'BLOCK_NONE'
                        }
                    ]
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('[Google AI] API错误:', error);
                throw new Error(`Google API错误: ${error}`);
            }

            const data = await response.json();

            // 检查是否被安全过滤阻止
            if (data.promptFeedback?.blockReason) {
                const blockReason = data.promptFeedback.blockReason;
                console.error('[Google AI] 内容被安全过滤阻止:', blockReason);

                let errorMessage = 'Google AI 安全过滤: ';
                switch (blockReason) {
                    case 'PROHIBITED_CONTENT':
                        errorMessage += '内容包含被禁止的内容';
                        break;
                    case 'BLOCKED_REASON_UNSPECIFIED':
                        errorMessage += '内容被阻止（未指定原因）';
                        break;
                    case 'SAFETY':
                        errorMessage += '内容违反安全政策';
                        break;
                    case 'OTHER':
                        errorMessage += '其他原因';
                        break;
                    default:
                        errorMessage += blockReason;
                }

                throw new Error(errorMessage);
            }

            // 检查是否有候选响应
            if (!data.candidates || data.candidates.length === 0) {
                console.error('[Google AI] 没有候选响应:', data);
                throw new Error('Google AI 没有返回任何响应');
            }

            // 提取响应文本
            const candidate = data.candidates[0];

            // 检查候选响应是否被过滤
            if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
                console.error('[Google AI] 响应被过滤:', candidate.finishReason);
                throw new Error(`Google AI 响应被过滤: ${candidate.finishReason}`);
            }

            // 尝试提取文本
            let responseText = null;

            if (candidate.content?.parts?.[0]?.text) {
                responseText = candidate.content.parts[0].text;
            } else if (candidate.output) {
                responseText = candidate.output;
            } else if (candidate.text) {
                responseText = candidate.text;
            }

            if (responseText) {
                return responseText;
            }

            console.error('[Google AI] 无法提取文本，响应结构:', JSON.stringify(data, null, 2));
            throw new Error('无法从Google AI响应中提取文本');

        } catch (error) {
            console.error('[Google AI] 调用失败:', error.message);
            console.error('[Google AI] 错误详情:', error);
            throw error;
        }
    }

    /**
     * 调用OpenAI兼容API
     * @param {string} prompt - 提示词
     * @param {string} systemPrompt - 系统提示词
     * @param {string} suffixPrompt - 尾部提示词（assistant身份）
     * @param {Object} config - API配置
     * @returns {Promise<string>} AI响应
     */
    async callOpenAICompatibleAPI(prompt, systemPrompt, suffixPrompt, config) {
        const { url, apiKey, model } = config;

        if (!url || !apiKey) {
            throw new Error('请先配置API端点和密钥');
        }

        // 确保URL以/v1/chat/completions结尾
        let apiUrl = url.trim();
        if (!apiUrl.endsWith('/chat/completions')) {
            if (!apiUrl.endsWith('/v1')) {
                apiUrl = apiUrl.replace(/\/$/, '') + '/v1';
            }
            apiUrl = apiUrl + '/chat/completions';
        }

        try {
            // 构建消息格式 - 新的顺序
            const messages = [];

            // 1. 系统提示词作为user消息（OpenAI API中改为user角色）
            if (systemPrompt) {
                messages.push({ role: 'user', content: systemPrompt });
            }

            // 2. 用户输入内容作为assistant消息
            if (prompt) {
                messages.push({ role: 'assistant', content: prompt });
            }

            // 3. 尾部提示词作为assistant消息
            if (suffixPrompt) {
                messages.push({ role: 'assistant', content: suffixPrompt });
            }

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    messages: messages,
                    model: model || 'gpt-3.5-turbo',
                    temperature: 0.7,
                    max_tokens: 2048,
                    stream: false
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('[OpenAI] API错误:', error);
                throw new Error(`OpenAI兼容API错误: ${error}`);
            }

            const data = await response.json();

            const content = data.choices?.[0]?.message?.content || '';
            return content;

        } catch (error) {
            console.error('[OpenAI] 调用失败:', error.message);
            console.error('[OpenAI] 错误详情:', error);
            throw error;
        }
    }


    /**
     * 创建世界书
     * @returns {Promise<Object>} 创建结果
     */
    async createWorldBook() {
        try {
            // 获取当前角色名称和时间
            let characterName = 'Unknown';
            let formattedDate = '';

            try {
                // 获取当前上下文
                const context = this.getContext ? this.getContext() : window.getContext?.();

                if (context) {
                    // 优先使用 name2 (显示名称)，其次使用 name
                    characterName = context.name2 || context.name || 'Unknown';

                    // 从 chatId 中提取时间
                    if (context.chatId) {
                        // chatId 格式: "角色名 - 2025-07-16@02h30m11s" 或 "2025-7-9 @20h 26m 15s 653ms"
                        const parts = context.chatId.split(' - ');

                        // 如果分割成功且有角色名部分
                        if (parts.length > 1 && characterName === 'Unknown') {
                            characterName = parts[0];
                        }

                        // 获取时间戳部分
                        const timestampString = parts.length > 1 ? parts[1] : parts[0];

                        try {
                            // 解析时间戳
                            const dateTimeMatch = timestampString.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*@?\s*(\d{1,2})h\s*(\d{1,2})m/);

                            if (dateTimeMatch) {
                                const [, yearFull, month, day, hours, minutes] = dateTimeMatch;
                                const year = yearFull.slice(2); // 取后两位
                                formattedDate = `${year}${month.padStart(2, '0')}${day.padStart(2, '0')} ${hours.padStart(2, '0')}${minutes.padStart(2, '0')}`;
                            }
                        } catch (e) {
                            // 解析失败时静默处理
                        }
                    }
                }
            } catch (error) {
                // 获取角色名称失败时静默处理
            }

            // 组合世界书名称（如果没有时间，只用角色名）
            const worldBookName = formattedDate ? `${characterName} ${formattedDate}` : characterName;

            // 构建空的世界书数据
            const worldBookData = {
                entries: {}
            };

            // 获取请求头
            const headers = this.getRequestHeaders ? this.getRequestHeaders() : {};

            // 使用edit API创建/更新世界书
            const response = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: worldBookName,
                    data: worldBookData
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`创建失败: ${errorText}`);
            }

            await response.json();

            // 将新创建的世界书绑定为chat lore
            if (chat_metadata && saveMetadata) {
                // 设置chat metadata，使用正确的key名称
                chat_metadata['world_info'] = worldBookName;

                // 保存metadata
                await saveMetadata();

                // 更新UI按钮状态
                const $ = window.$;
                if ($) {
                    $('.chat_lorebook_button').addClass('world_set');
                }

                console.log('[MemoryService] 世界书已绑定为chat lore:', worldBookName);
            } else {
                console.warn('[MemoryService] chat_metadata 或 saveMetadata 不可用，无法绑定世界书为chat lore');
            }

            // 发布事件通知创建成功
            this.eventBus?.emit('memory:worldbook-created', {
                name: worldBookName,
                data: worldBookData,
                boundToChatLore: true
            });

            return {
                success: true,
                name: worldBookName,
                data: worldBookData,
                boundToChatLore: true
            };

        } catch (error) {
            console.error('[MemoryService] 创建世界书失败:', error);
            throw error;
        }
    }
}
