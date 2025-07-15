/**
 * External Task UI Component
 * Handles UI for importing and managing external vectorization tasks
 */

// 导入必要的函数
import { getCurrentChatId } from '../../../../../../../script.js';

export class ExternalTaskUI {
    constructor() {
        this.taskManager = null;
        this.settings = null;  // 添加 settings 引用
        this.dependencies = null;  // 添加 dependencies 引用
        this.currentChatId = null;
        this.initialized = false;
        this.container = null;
    }

    /**
     * Show notification safely
     * @param {string} message - Message to show
     * @param {string} type - Notification type (success, error, warning, info)
     */
    showNotification(message, type = 'info') {
        if (typeof toastr !== 'undefined' && toastr[type]) {
            toastr[type](message);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
            if (type === 'error' || type === 'warning') {
                alert(message);
            }
        }
    }

    /**
     * Initialize the component
     * @param {TaskManager} taskManager - Task manager instance
     * @param {Object} settings - Settings object containing vector_tasks
     * @param {Object} dependencies - Dependencies object with saveSettingsDebounced
     */
    async init(taskManager, settings, dependencies) {
        console.log('ExternalTaskUI: Initializing...');
        
        if (this.initialized) {
            console.warn('ExternalTaskUI already initialized');
            return;
        }

        if (!taskManager) {
            console.warn('ExternalTaskUI: TaskManager not available, using legacy mode');
        }

        this.taskManager = taskManager;
        this.settings = settings;  // 保存 settings 引用
        this.dependencies = dependencies;  // 保存 dependencies 引用
        this.container = $('#vectors_external_tasks_container');
        
        if (!this.container.length) {
            console.warn('External tasks container not found');
            return;
        }

        this.bindEvents();
        this.initialized = true;
        console.log('ExternalTaskUI initialized successfully');
    }

    /**
     * Update current chat context
     * @param {string} chatId - Current chat ID
     */
    async updateChatContext(chatId) {
        // 只在有效的chatId时更新
        if (chatId && chatId !== 'null' && chatId !== 'undefined') {
            this.currentChatId = chatId;
            await this.refreshExternalTasksList();
        } else {
            console.warn('ExternalTaskUI: updateChatContext called with invalid chatId:', chatId);
            this.currentChatId = null;
        }
    }

    /**
     * Bind UI events
     */
    bindEvents() {
        console.log('ExternalTaskUI: Binding events');
        
        // Remove any existing handlers first
        $(document).off('click.externalTaskUI');
        $('#vectors_enhanced_import_external_task').off('click');
        
        // Bind import button click event
        $(document).on('click', '#vectors_enhanced_import_external_task', async (e) => {
            console.log('ExternalTaskUI: Import button clicked (delegated)');
            e.preventDefault();
            e.stopPropagation();
            
            try {
                await this.showImportDialog();
            } catch (error) {
                console.error('ExternalTaskUI: Error in showImportDialog:', error);
                this.showNotification('无法显示导入对话框: ' + error.message, 'error');
            }
        });

        // Process external task
        $(document).on('click.externalTaskUI', '.process-external-task', async (e) => {
            const taskId = $(e.currentTarget).data('task-id');
            await this.processExternalTask(taskId);
        });

        // Delete external task
        $(document).on('click.externalTaskUI', '.delete-external-task', async (e) => {
            const taskId = $(e.currentTarget).data('task-id');
            await this.deleteExternalTask(taskId);
        });

        // View external task details
        $(document).on('click.externalTaskUI', '.view-external-task', async (e) => {
            const taskId = $(e.currentTarget).data('task-id');
            await this.viewTaskDetails(taskId);
        });
    }

    /**
     * Show import dialog
     */
    async showImportDialog() {
        console.log('ExternalTaskUI: showImportDialog called');
        
        try {
            // Get list of all chats with tasks
            const allChats = await this.getAllChatsWithTasks();
            
            if (allChats.length === 0) {
                this.showNotification('没有找到包含向量化任务的聊天', 'info');
                return;
            }

            // Build dialog HTML
            const dialogHtml = `
                <div class="external-task-import-dialog">
                    <h3>导入外挂任务</h3>
                    <div class="form-group">
                        <label for="source-chat-select">选择源聊天:</label>
                        <select id="source-chat-select" class="form-control">
                            <option value="">-- 选择聊天 --</option>
                            ${allChats.map(chat => 
                                `<option value="${chat.id}">${chat.name} (${chat.taskCount} 个任务)</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="source-tasks-container" style="display: none;">
                        <label>选择任务:</label>
                        <div id="source-tasks-list"></div>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="skip-deduplication" checked>
                            跳过去重检查
                        </label>
                    </div>
                    <div class="dialog-buttons">
                        <button class="menu_button" id="confirm-import">导入</button>
                        <button class="menu_button" id="cancel-import">取消</button>
                    </div>
                </div>
            `;

            // 显示对话框并绑定事件
            const bindDialogEvents = () => {
                console.log('Binding dialog events...');
                
                // 聊天选择事件
                $('#source-chat-select').off('change').on('change', async (e) => {
                    console.log('Chat selection changed:', e.target.value);
                    const chatId = e.target.value;
                    if (chatId) {
                        await this.loadSourceChatTasks(chatId);
                    } else {
                        $('#source-tasks-container').hide();
                    }
                });

                // 导入按钮
                $('#confirm-import').off('click').on('click', async () => {
                    console.log('Import button clicked');
                    await this.handleImport();
                    if (typeof closeCurrentPopup === 'function') {
                        closeCurrentPopup();
                    } else if (window.closeCurrentPopup) {
                        window.closeCurrentPopup();
                    }
                });

                // 取消按钮
                $('#cancel-import').off('click').on('click', () => {
                    console.log('Cancel button clicked');
                    if (typeof closeCurrentPopup === 'function') {
                        closeCurrentPopup();
                    } else if (window.closeCurrentPopup) {
                        window.closeCurrentPopup();
                    }
                });
            };
            
            // 检查 callPopup 是否可用
            if (typeof callPopup !== 'function') {
                console.error('callPopup function not available, using fallback');
                // 后备方案：显示为模态框
                const modal = $('<div class="modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;"><div class="modal-content" style="background: var(--SmartThemeBodyColor); padding: 20px; border-radius: 8px; max-width: 600px; width: 90%; color: var(--SmartThemeEmColor);"></div></div>');
                modal.find('.modal-content').html(dialogHtml);
                $('body').append(modal);
                
                // 点击背景关闭
                modal.on('click', function(e) {
                    if (e.target === this) {
                        modal.remove();
                    }
                });
                
                // 更新关闭函数
                window.closeCurrentPopup = () => modal.remove();
                
                // 模态框添加到 DOM 后绑定事件
                setTimeout(bindDialogEvents, 100);
            } else {
                // 使用 SillyTavern 的 callPopup
                callPopup(dialogHtml, 'text', '', { wide: false, large: false });
                // 弹窗显示后绑定事件
                setTimeout(bindDialogEvents, 100);
            }

        } catch (error) {
            console.error('Failed to show import dialog:', error);
            this.showNotification('无法显示导入对话框: ' + error.message, 'error');
        }
    }

    /**
     * Get all chats with tasks
     * @returns {Promise<Array>} List of chats with task count
     */
    async getAllChatsWithTasks() {
        console.log('ExternalTaskUI: Getting all chats with tasks...');
        
        try {
            // 直接从 settings.vector_tasks 获取所有任务数据
            const allTasks = this.settings.vector_tasks || {};
            console.log('All tasks from settings:', allTasks);
            
            // 如果没有任何任务，返回空数组
            if (!allTasks || Object.keys(allTasks).length === 0) {
                console.log('No tasks found in any chat');
                return [];
            }
            
            // 转换为聊天列表格式
            const chatsWithTasks = [];
            
            for (const [chatId, tasks] of Object.entries(allTasks)) {
                // 跳过当前聊天和无效的聊天ID
                if (chatId === this.currentChatId || !chatId || chatId === 'null' || chatId === 'undefined') {
                    continue;
                }
                
                // 只包含有向量化任务的聊天
                const vectorizationTasks = tasks.filter(task => 
                    task.type === 'vectorization' || !task.type // 兼容旧格式
                );
                
                if (vectorizationTasks.length > 0) {
                    // 尝试获取聊天名称
                    let chatName = chatId;
                    
                    // 尝试从 context 获取角色名称
                    if (typeof getContext === 'function') {
                        try {
                            const context = getContext();
                            // 这里需要根据实际的 SillyTavern API 来获取聊天名称
                            // 暂时使用 chatId 作为名称
                            chatName = `聊天 ${chatId.substring(0, 8)}...`;
                        } catch (e) {
                            console.warn('Failed to get chat name:', e);
                        }
                    }
                    
                    chatsWithTasks.push({
                        id: chatId,
                        name: chatName,
                        taskCount: vectorizationTasks.length
                    });
                }
            }
            
            console.log('Chats with tasks:', chatsWithTasks);
            return chatsWithTasks;
            
        } catch (error) {
            console.error('Error getting chats with tasks:', error);
            return [];
        }
    }

    /**
     * Load tasks from source chat
     * @param {string} chatId - Source chat ID
     */
    async loadSourceChatTasks(chatId) {
        try {
            // 直接从 settings.vector_tasks 获取任务
            const tasks = this.settings.vector_tasks[chatId] || [];
            // 旧格式的任务没有 type 字段，或者 type 为 'vectorization'
            const vectorizationTasks = tasks.filter(t => !t.type || t.type === 'vectorization');

            if (vectorizationTasks.length === 0) {
                $('#source-tasks-list').html('<p>此聊天没有向量化任务</p>');
                $('#source-tasks-container').show();
                return;
            }

            const tasksHtml = vectorizationTasks.map(task => `
                <div class="task-select-item">
                    <label>
                        <input type="checkbox" class="task-checkbox" value="${task.taskId || task.id}">
                        <span class="task-name">${task.name}</span>
                        <small class="task-info">(${task.textContent?.length || 0} 项)</small>
                    </label>
                </div>
            `).join('');

            $('#source-tasks-list').html(tasksHtml);
            $('#source-tasks-container').show();

        } catch (error) {
            console.error('Failed to load source chat tasks:', error);
            this.showNotification('加载任务失败', 'error');
        }
    }

    /**
     * Handle import action
     */
    async handleImport() {
        try {
            const sourceChatId = $('#source-chat-select').val();
            if (!sourceChatId) {
                this.showNotification('请选择源聊天', 'warning');
                return;
            }

            const selectedTasks = $('.task-checkbox:checked').map((_, el) => el.value).get();
            if (selectedTasks.length === 0) {
                this.showNotification('请选择至少一个任务', 'warning');
                return;
            }

            const skipDeduplication = $('#skip-deduplication').is(':checked');

            // Import tasks - 直接从源聊天复制任务到当前聊天
            let importedCount = 0;
            const sourceTasks = this.settings.vector_tasks[sourceChatId] || [];
            
            // 重新获取当前聊天ID以确保准确性
            let currentChatId = this.currentChatId;
            
            // 尝试从不同的源获取当前聊天ID
            if (!currentChatId || currentChatId === 'null' || currentChatId === 'undefined') {
                // 尝试从导入的函数获取
                try {
                    currentChatId = getCurrentChatId();
                } catch (error) {
                    console.error('Failed to get chat ID from getCurrentChatId:', error);
                }
                
                // 尝试从window.getContext获取
                if ((!currentChatId || currentChatId === 'null' || currentChatId === 'undefined') && window.getContext) {
                    try {
                        const context = window.getContext();
                        currentChatId = context.chatId;
                    } catch (error) {
                        console.error('Failed to get chat context:', error);
                    }
                }
            }
            
            // 最终检查当前聊天ID是否有效
            if (!currentChatId || currentChatId === 'null' || currentChatId === 'undefined') {
                this.showNotification('无法获取当前聊天ID，请确保已选择聊天', 'error');
                console.error('ExternalTaskUI: Unable to get current chat ID for import');
                return;
            }
            
            console.log('ExternalTaskUI: Using current chat ID for import:', currentChatId);
            const currentTasks = this.settings.vector_tasks[currentChatId] || [];
            
            for (const taskId of selectedTasks) {
                try {
                    // 找到要复制的任务
                    const sourceTask = sourceTasks.find(t => (t.taskId || t.id) === taskId);
                    if (!sourceTask) {
                        console.error(`Source task ${taskId} not found`);
                        continue;
                    }
                    
                    // 检查是否已存在（除非跳过去重）
                    if (!skipDeduplication) {
                        const exists = currentTasks.some(t => t.name === sourceTask.name);
                        if (exists) {
                            console.log(`Task "${sourceTask.name}" already exists, skipping`);
                            continue;
                        }
                    }
                    
                    // 创建外挂任务（引用而非复制）
                    const externalTask = {
                        taskId: `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                        name: `外挂：${sourceTask.name}`,
                        type: 'external',
                        source: `${sourceChatId}_${taskId}`,  // 源集合ID
                        enabled: true,
                        timestamp: Date.now(),
                        // 保存一些基本信息用于显示
                        sourceName: sourceTask.name,
                        sourceChat: sourceChatId
                    };
                    
                    // 添加到当前聊天的任务列表
                    if (!this.settings.vector_tasks[currentChatId]) {
                        this.settings.vector_tasks[currentChatId] = [];
                    }
                    this.settings.vector_tasks[currentChatId].push(externalTask);
                    
                    importedCount++;
                } catch (error) {
                    console.error(`Failed to import task ${taskId}:`, error);
                }
            }
            
            // 保存设置
            if (importedCount > 0 && this.dependencies?.saveSettingsDebounced) {
                this.dependencies.saveSettingsDebounced();
            }

            if (importedCount > 0) {
                this.showNotification(`成功导入 ${importedCount} 个外挂任务`, 'success');
                
                // 更新主任务列表UI
                if (this.dependencies?.updateTaskList) {
                    await this.dependencies.updateTaskList(
                        this.dependencies.getChatTasks,
                        this.dependencies.renameVectorTask,
                        this.dependencies.removeVectorTask
                    );
                }
                
                await this.refreshExternalTasksList();
            } else {
                this.showNotification('导入失败', 'error');
            }

        } catch (error) {
            console.error('Import failed:', error);
            this.showNotification('导入过程中发生错误', 'error');
        }
    }

    /**
     * Refresh external tasks list
     */
    async refreshExternalTasksList() {
        // 由于使用旧格式，没有单独的"外挂任务"概念
        // 可以显示当前聊天的任务列表或者直接隐藏这个部分
        if (!this.currentChatId || this.currentChatId === 'null' || this.currentChatId === 'undefined') {
            if (this.container) {
                this.container.html('<p class="no-external-tasks">请先选择聊天</p>');
            }
            return;
        }
        
        // 直接显示空列表，因为没有单独的外挂任务概念
        if (this.container) {
            this.container.html('<p class="no-external-tasks">暂无外挂任务</p>');
        }
    }

    /**
     * Process external task
     * @param {string} taskId - Task ID to process
     */
    async processExternalTask(taskId) {
        // 由于使用旧格式，不再支持单独的外挂任务处理
        console.warn('processExternalTask is not supported in legacy mode');
        this.showNotification('旧格式不支持外挂任务处理', 'warning');
    }

    /**
     * Delete external task
     * @param {string} taskId - Task ID to delete
     */
    async deleteExternalTask(taskId) {
        // 由于使用旧格式，不再支持单独的外挂任务删除
        console.warn('deleteExternalTask is not supported in legacy mode');
        this.showNotification('旧格式不支持外挂任务删除', 'warning');
    }

    /**
     * View task details
     * @param {string} taskId - Task ID
     */
    async viewTaskDetails(taskId) {
        try {
            // 检查当前聊天ID是否有效
            if (!this.currentChatId || this.currentChatId === 'null' || this.currentChatId === 'undefined') {
                this.showNotification('当前聊天ID无效', 'error');
                return;
            }
            
            // 从 settings.vector_tasks 获取任务
            const tasks = this.settings.vector_tasks[this.currentChatId] || [];
            const task = tasks.find(t => (t.taskId || t.id) === taskId);
            if (!task) {
                this.showNotification('任务不存在', 'error');
                return;
            }

            const detailsHtml = `
                <div class="external-task-details">
                    <h3>${task.name}</h3>
                    <div class="detail-row">
                        <strong>状态:</strong> ${this.getStatusText(task.status)}
                    </div>
                    <div class="detail-row">
                        <strong>源聊天:</strong> ${task.sourceChat}
                    </div>
                    <div class="detail-row">
                        <strong>源任务ID:</strong> ${task.sourceTaskId}
                    </div>
                    <div class="detail-row">
                        <strong>跳过去重:</strong> ${task.skipDeduplication ? '是' : '否'}
                    </div>
                    <div class="detail-row">
                        <strong>内容项数:</strong> ${task.textContent?.length || 0}
                    </div>
                    <div class="detail-row">
                        <strong>创建时间:</strong> ${new Date(task.createdAt).toLocaleString()}
                    </div>
                    ${task.result ? `
                        <div class="detail-row">
                            <strong>处理结果:</strong>
                            <pre>${JSON.stringify(task.result, null, 2)}</pre>
                        </div>
                    ` : ''}
                </div>
            `;

            if (typeof callPopup === 'function') {
                callPopup(detailsHtml, 'text');
            } else {
                console.error('callPopup function not available');
                alert('无法显示详情对话框');
            }

        } catch (error) {
            console.error('Failed to view task details:', error);
            this.showNotification('查看任务详情失败', 'error');
        }
    }

    /**
     * Get status text
     * @param {string} status - Task status
     * @returns {string} Localized status text
     */
    getStatusText(status) {
        const statusMap = {
            'pending': '待处理',
            'queued': '队列中',
            'running': '处理中',
            'completed': '已完成',
            'failed': '失败',
            'cancelled': '已取消'
        };
        return statusMap[status] || status;
    }

    /**
     * Destroy the component
     */
    destroy() {
        // Unbind events
        $(document).off('click.externalTaskUI');
        $(document).off('click', '#vectors_enhanced_import_external_task');
        
        this.initialized = false;
        console.log('ExternalTaskUI destroyed');
    }
}