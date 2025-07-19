/**
 * 测试自动隐藏楼层功能的工具
 * 在浏览器控制台中运行: await import('/scripts/extensions/third-party/vectors-enhanced/test-hide-floors.js')
 */

window.testHideFloors = {
    /**
     * 检查设置状态
     */
    checkSettings() {
        console.log('=== 检查隐藏楼层设置 ===');
        const checkboxState = $('#memory_hide_floors_after_summary').prop('checked');
        const settingsValue = window.extensionSettings?.vectors_enhanced?.memory?.hideFloorsAfterSummary || window.extension_settings?.vectors_enhanced?.memory?.hideFloorsAfterSummary;
        
        console.log('复选框状态:', checkboxState);
        console.log('设置存储值:', settingsValue);
        console.log('状态是否一致:', checkboxState === settingsValue);
        
        if (checkboxState !== settingsValue) {
            console.warn('⚠️ 复选框状态与设置值不一致！');
        }
        
        return { checkboxState, settingsValue };
    },
    
    /**
     * 手动测试隐藏功能
     * @param {number} startIndex - 开始楼层
     * @param {number} endIndex - 结束楼层
     */
    async testHideFunction(startIndex, endIndex) {
        console.log(`\n=== 测试隐藏楼层 #${startIndex} 到 #${endIndex} ===`);
        
        // 获取MemoryUI实例
        const memoryUI = this.getMemoryUIInstance();
        if (!memoryUI) {
            console.error('❌ 无法获取MemoryUI实例');
            return;
        }
        
        // 临时启用隐藏功能
        const originalCheckboxState = $('#memory_hide_floors_after_summary').prop('checked');
        $('#memory_hide_floors_after_summary').prop('checked', true);
        
        console.log('正在执行隐藏...');
        try {
            await memoryUI.hideFloorsIfEnabled(startIndex, endIndex, true);
            console.log('✅ 隐藏功能执行完成');
        } catch (error) {
            console.error('❌ 隐藏功能执行失败:', error);
        }
        
        // 恢复原始状态
        $('#memory_hide_floors_after_summary').prop('checked', originalCheckboxState);
        
        // 显示结果
        this.checkMessageStatus(endIndex + 5);
    },
    
    /**
     * 检查消息状态
     * @param {number} count - 要检查的消息数量
     */
    checkMessageStatus(count = 10) {
        console.log(`\n=== 检查前 ${count} 条消息状态 ===`);
        const context = window.getContext ? window.getContext() : (window.SillyTavern?.getContext ? window.SillyTavern.getContext() : null);
        
        if (!context || !context.chat) {
            console.error('❌ 无法获取聊天上下文');
            return;
        }
        
        const messages = [];
        for (let i = 0; i < Math.min(count, context.chat.length); i++) {
            const msg = context.chat[i];
            messages.push({
                index: i,
                type: msg.is_user ? '用户' : 'AI',
                isSystem: msg.is_system || false,
                preview: (msg.mes || '').substring(0, 30) + '...'
            });
        }
        
        // 显示表格
        console.table(messages.map(m => ({
            '楼层': `#${m.index}`,
            '类型': m.type,
            '系统': m.isSystem ? '是' : '否',
            '内容预览': m.preview
        })));
        
        // 统计
        const hiddenCount = messages.filter(m => m.isSystem).length;
        console.log(`\n统计: 总共 ${messages.length} 条消息，其中 ${hiddenCount} 条被隐藏`);
    },
    
    /**
     * 显示所有隐藏的消息
     */
    showHiddenMessages() {
        console.log('\n=== 所有隐藏的消息 ===');
        const context = window.getContext ? window.getContext() : (window.SillyTavern?.getContext ? window.SillyTavern.getContext() : null);
        
        if (!context || !context.chat) {
            console.error('❌ 无法获取聊天上下文');
            return;
        }
        
        const hiddenMessages = [];
        context.chat.forEach((msg, index) => {
            if (msg.is_system) {
                hiddenMessages.push({
                    index: index,
                    type: msg.is_user ? '用户' : 'AI',
                    content: (msg.mes || '').substring(0, 50) + '...'
                });
            }
        });
        
        if (hiddenMessages.length === 0) {
            console.log('没有隐藏的消息');
            return;
        }
        
        console.table(hiddenMessages.map(m => ({
            '楼层': `#${m.index}`,
            '类型': m.type,
            '内容': m.content
        })));
        
        console.log(`\n总共 ${hiddenMessages.length} 条隐藏的消息`);
    },
    
    /**
     * 恢复隐藏的消息
     * @param {number|number[]} indices - 要恢复的消息索引（可选）
     */
    async restoreHiddenMessages(indices = null) {
        console.log('\n=== 恢复隐藏的消息 ===');
        const context = window.getContext ? window.getContext() : (window.SillyTavern?.getContext ? window.SillyTavern.getContext() : null);
        
        if (!context || !context.chat) {
            console.error('❌ 无法获取聊天上下文');
            return;
        }
        
        let restoreCount = 0;
        
        // 确定要恢复的索引
        let indicesToRestore;
        if (indices === null) {
            // 恢复所有
            indicesToRestore = context.chat.map((msg, i) => msg.is_system ? i : null).filter(i => i !== null);
        } else if (typeof indices === 'number') {
            // 单个索引
            indicesToRestore = [indices];
        } else {
            // 索引数组
            indicesToRestore = indices;
        }
        
        // 恢复消息
        indicesToRestore.forEach(index => {
            if (index >= 0 && index < context.chat.length && context.chat[index].is_system) {
                context.chat[index].is_system = false;
                restoreCount++;
            }
        });
        
        if (restoreCount > 0) {
            // 保存并刷新
            if (window.saveChatConditional) {
                await window.saveChatConditional();
            }
            if (window.eventSource && window.event_types) {
                window.eventSource.emit(window.event_types.CHAT_CHANGED);
            }
            
            console.log(`✅ 成功恢复 ${restoreCount} 条消息`);
        } else {
            console.log('没有需要恢复的消息');
        }
    },
    
    /**
     * 获取MemoryUI实例
     */
    getMemoryUIInstance() {
        // 尝试多种方式获取实例
        const possibleInstances = [
            window.vectorsMemoryUI,
            window.memoryUI,
            window.vectors_enhanced?.memoryUI,
            window.extensionSettings?.vectors_enhanced?.memoryUI
        ];
        
        for (const instance of possibleInstances) {
            if (instance && typeof instance.hideFloorsIfEnabled === 'function') {
                return instance;
            }
        }
        
        // 尝试从jQuery数据获取
        const $container = $('#vectors_enhanced_memory');
        if ($container.length > 0) {
            const instance = $container.data('memoryUI');
            if (instance) return instance;
        }
        
        console.warn('无法找到MemoryUI实例，尝试以下方法：');
        console.log('1. 确保vectors-enhanced扩展已启用');
        console.log('2. 刷新页面');
        console.log('3. 检查控制台是否有错误');
        
        return null;
    },
    
    /**
     * 运行完整测试
     */
    async runFullTest() {
        console.log('🔧 开始完整测试流程...\n');
        
        // 1. 检查设置
        this.checkSettings();
        
        // 2. 显示当前状态
        console.log('\n初始状态:');
        this.checkMessageStatus(15);
        
        // 3. 测试隐藏功能
        await this.testHideFunction(2, 8);
        
        // 4. 显示隐藏的消息
        this.showHiddenMessages();
        
        console.log('\n✅ 测试完成！');
        console.log('提示: 使用 testHideFloors.restoreHiddenMessages() 恢复隐藏的消息');
    }
};

console.log('✅ 测试工具已加载！');
console.log('使用方法:');
console.log('- testHideFloors.checkSettings() - 检查设置状态');
console.log('- testHideFloors.testHideFunction(0, 5) - 测试隐藏楼层0到5');
console.log('- testHideFloors.checkMessageStatus() - 查看消息状态');
console.log('- testHideFloors.showHiddenMessages() - 显示所有隐藏的消息');
console.log('- testHideFloors.restoreHiddenMessages() - 恢复隐藏的消息');
console.log('- testHideFloors.runFullTest() - 运行完整测试');