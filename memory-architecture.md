# Memory功能架构设计

## 分层架构

```
┌─────────────────────────────────────────────────────┐
│                   UI Layer (UI层)                    │
│  MemoryUI.js - 仅负责UI交互和显示                     │
│  - 获取用户输入                                       │
│  - 显示AI响应                                        │
│  - 管理UI状态（启用/禁用）                            │
│  - 监听事件并更新显示                                 │
└─────────────────────────────┬───────────────────────┘
                              │ 依赖注入
                              ↓
┌─────────────────────────────────────────────────────┐
│               Service Layer (服务层)                  │
│  MemoryService.js - 业务逻辑处理                     │
│  - 管理对话历史                                       │
│  - 构建上下文提示词                                   │
│  - 调用AI生成API                                     │
│  - 发布事件通知                                       │
│  - 导入/导出功能                                      │
└─────────────────────────────┬───────────────────────┘
                              │ 使用
                              ↓
┌─────────────────────────────────────────────────────┐
│           Infrastructure Layer (基础设施层)           │
│  - generateRaw (SillyTavern API)                    │
│  - getContext (获取当前上下文)                       │
│  - EventBus (事件总线)                              │
└─────────────────────────────────────────────────────┘
```

## 职责分离

### UI层 (MemoryUI)
- **职责**：
  - 处理用户交互（点击、输入）
  - 更新界面显示
  - 管理UI元素状态
  - 监听服务层事件

- **不应该**：
  - 直接调用AI API
  - 管理业务数据
  - 实现复杂逻辑

### 服务层 (MemoryService)
- **职责**：
  - 实现核心业务逻辑
  - 管理对话历史
  - 与AI API交互
  - 数据处理和转换
  - 发布业务事件

- **不应该**：
  - 直接操作DOM
  - 知道UI细节
  - 依赖特定UI框架

## 事件驱动通信

```javascript
// 服务层发布事件
eventBus.emit('memory:message-start', { message, options });
eventBus.emit('memory:message-complete', { message, response });
eventBus.emit('memory:message-error', { error });
eventBus.emit('memory:history-updated', { history });

// UI层订阅事件
eventBus.on('memory:message-start', () => showLoading());
eventBus.on('memory:message-complete', (data) => displayResponse(data));
```

## 优势

1. **关注点分离**：UI和业务逻辑完全分离
2. **可测试性**：服务层可以独立测试，不需要DOM
3. **可维护性**：修改UI不影响业务逻辑，反之亦然
4. **可扩展性**：容易添加新功能（如历史记录、多轮对话）
5. **复用性**：服务层可以被其他UI组件使用

## 未来扩展

### 1. 历史记录功能
```javascript
// MemoryService已经支持
- getHistory(filter)
- clearHistory(filter)
- exportHistory(format)
```

### 2. 多轮对话上下文
```javascript
// 在buildContextualPrompt中实现
- 包含最近N轮对话
- 角色设定持久化
- 上下文窗口管理
```

### 3. 记忆持久化
```javascript
// 可以添加存储适配器
- 保存到localStorage
- 导出/导入功能
- 跨会话记忆
```

### 4. 高级功能
```javascript
// 基于当前架构可以轻松添加
- 记忆搜索
- 记忆标签
- 记忆摘要
- 与向量数据库集成
```