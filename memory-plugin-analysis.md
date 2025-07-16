# SillyTavern Memory插件深度分析报告

## 概述

SillyTavern的Memory插件（实际名称为Summarize）是一个用于自动摘要和管理聊天历史记忆的扩展。该插件能够定期将聊天内容摘要成简洁的记忆片段，并将其注入到后续对话中，帮助AI保持对话的上下文连续性。

## 文件结构分析

### 1. manifest.json
- **display_name**: "Summarize"
- **loading_order**: 9 (较晚加载)
- **requires**: [] (无强制依赖)
- **optional**: ["summarize"] (可选依赖Extras API的summarize模块)
- **版本**: 1.0.0
- **作者**: Cohee#1207

### 2. 核心文件
- `index.js`: 主要逻辑实现（1087行）
- `settings.html`: UI设置界面
- `style.css`: 样式定义

## 核心功能分析

### 1. 摘要源（Summary Sources）
插件支持三种摘要源：
```javascript
const summary_sources = {
    'extras': 'extras',    // Extras API (已废弃)
    'main': 'main',        // 主API
    'webllm': 'webllm',    // WebLLM扩展
};
```

### 2. 提示词构建器（Prompt Builders）
```javascript
const prompt_builders = {
    DEFAULT: 0,           // 经典阻塞模式
    RAW_BLOCKING: 1,      // 原始阻塞模式
    RAW_NON_BLOCKING: 2,  // 原始非阻塞模式
};
```

### 3. 默认设置
```javascript
const defaultSettings = {
    memoryFrozen: false,           // 是否冻结记忆更新
    SkipWIAN: false,              // 是否跳过World Info和Author's Note
    source: summary_sources.extras,
    prompt: defaultPrompt,         // 摘要提示词
    template: defaultTemplate,     // 注入模板
    position: extension_prompt_types.IN_PROMPT,
    role: extension_prompt_roles.SYSTEM,
    scan: false,                  // 是否包含在WI扫描中
    depth: 2,                     // 注入深度
    promptWords: 200,             // 目标摘要字数
    promptInterval: 10,           // 更新间隔（消息数）
    promptForceWords: 0,          // 强制更新字数阈值
    overrideResponseLength: 0,    // 覆盖响应长度
    maxMessagesPerRequest: 0,     // 每次请求最大消息数
    // ... 其他范围设置
};
```

## 核心函数分析

### 1. 令牌计数功能
```javascript
async function countSourceTokens(text, padding = 0)
```
- 根据不同的摘要源使用不同的令牌计数方法
- WebLLM使用专门的计数函数
- Extras使用GPT2分词器
- 主API使用通用的令牌计数

### 2. 上下文大小获取
```javascript
async function getSourceContextSize()
```
- WebLLM: 获取最大上下文并使用75%或自定义长度
- Extras: 固定1024-64令牌
- 主API: 使用通用的最大上下文大小

### 3. 格式化记忆值
```javascript
const formatMemoryValue = function (value)
```
- 使用模板格式化摘要内容
- 支持参数替换（{{summary}}）

### 4. 摘要触发机制
```javascript
async function getSummaryPromptForNow(context, force)
```
触发条件：
- 消息数达到设定间隔（promptInterval）
- 字数达到强制阈值（promptForceWords）
- 用户手动触发（force）

### 5. 摘要生成流程

#### A. WebLLM摘要
```javascript
async function summarizeChatWebLLM(context, force)
```
1. 构建系统提示词和用户消息
2. 调用WebLLM生成摘要
3. 保存到聊天记录的extra字段

#### B. 主API摘要
```javascript
async function summarizeChatMain(context, force, skipWIAN)
```
1. 支持三种提示词构建模式
2. 可选择阻塞或非阻塞模式
3. 使用generateQuietPrompt或generateRaw生成

#### C. Extras API摘要
```javascript
async function summarizeChatExtras(context)
```
1. 使用固定的1024令牌上下文
2. 通过HTTP调用Extras API
3. 逆向遍历聊天记录构建缓冲区

### 6. 记忆管理
```javascript
function setMemoryContext(value, saveToMessage, index = null)
```
- 设置扩展提示词
- 更新UI显示
- 保存到聊天消息的extra.memory字段

### 7. 事件监听
插件监听以下事件：
- CHAT_CHANGED: 聊天切换
- CHARACTER_MESSAGE_RENDERED: 消息渲染完成
- MESSAGE_DELETED: 消息删除
- MESSAGE_UPDATED: 消息更新
- MESSAGE_SWIPED: 消息切换

## UI交互分析

### 1. 设置面板结构
- 摘要源选择
- 当前摘要显示和编辑
- 控制按钮（恢复、立即摘要、暂停）
- 详细设置（可折叠）

### 2. 高级设置
- 提示词构建器选择
- 摘要提示词自定义
- 目标长度设置（字数）
- API响应长度设置（令牌）
- 更新频率设置（消息数/字数）
- 注入位置和角色设置

### 3. 弹出窗口功能
```javascript
function doPopout(e)
```
- 可将设置面板弹出为独立窗口
- 保持所有功能和监听器
- 支持拖拽移动

## 数据流分析

### 1. 摘要生成流程
```
聊天消息 -> 触发条件检查 -> 构建提示词 -> 
调用API生成 -> 格式化结果 -> 保存到聊天记录
```

### 2. 摘要注入流程
```
读取最新摘要 -> 格式化模板 -> 
根据位置设置注入 -> 更新扩展提示词
```

### 3. 持久化机制
- 摘要保存在聊天消息的extra.memory字段
- 随聊天记录一起保存
- 支持恢复历史摘要

## 斜杠命令

### /summarize 命令
```javascript
SlashCommandParser.addCommandObject({
    name: 'summarize',
    callback: summarizeCallback,
    namedArgumentList: [
        source: 摘要源选择,
        prompt: 自定义提示词,
        quiet: 静默模式
    ],
    unnamedArgumentList: [
        要摘要的文本
    ]
})
```

## 宏支持
```javascript
MacrosParser.registerMacro('summary', () => getLatestMemoryFromChat(getContext().chat));
```
- 提供{{summary}}宏用于获取最新摘要

## 优化建议

### 1. 性能优化
- 考虑添加摘要缓存机制
- 优化大量消息时的遍历性能
- 添加增量摘要功能

### 2. 功能增强
- 支持多级摘要（摘要的摘要）
- 添加摘要质量评估
- 支持自定义摘要策略

### 3. 用户体验
- 添加摘要预览功能
- 提供摘要编辑历史
- 改进错误处理和提示

## 总结

Memory插件是一个设计精良的聊天记忆管理系统，通过定期摘要保持对话上下文。其模块化设计、多源支持和灵活的配置选项使其成为SillyTavern的重要扩展。在实现自己的向量化记忆系统时，可以借鉴其事件驱动架构、持久化机制和UI设计理念。