# 项目架构

## 当前文件结构
```
vectors-enhanced/
├── index.js              # 主入口文件
├── webllm.js            # WebLLM 引擎适配器
├── settings.html        # 原始设置界面
├── settings-modular.html # 模块化设置界面
├── style.css            # 样式文件
├── manifest.json        # 扩展配置文件
├── src/                 # 模块化源代码目录
│   ├── core/           # 核心业务逻辑
│   │   ├── entities/   # 实体类定义
│   │   │   ├── Content.js      # 内容实体类
│   │   │   ├── Vector.js       # 向量实体类
│   │   │   └── Task.js         # 任务实体类
│   │   ├── memory/     # 记忆管理模块
│   │   │   └── MemoryService.js # 记忆管理核心服务
│   │   ├── extractors/ # 内容提取器
│   │   │   ├── IContentExtractor.js    # 提取器接口
│   │   │   ├── ChatExtractor.js        # 聊天消息提取器
│   │   │   ├── FileExtractor.js        # 文件提取器
│   │   │   └── WorldInfoExtractor.js   # 世界信息提取器
│   │   ├── external-tasks/ # 外挂任务系统
│   │   │   ├── ExternalTaskManager.js   # 外挂任务管理器
│   │   │   ├── TaskReferenceResolver.js # 任务引用解析器
│   │   │   └── VectorCollectionManager.js # 向量集合管理器
│   │   ├── query/      # 查询系统
│   │   │   └── EnhancedQuerySystem.js  # 增强查询系统
│   │   └── plugins/    # 插件系统
│   │       ├── IVectorizationPlugin.js # 插件接口定义
│   │       ├── PluginManager.js        # 插件管理器
│   │       └── PluginLoader.js         # 插件加载器
│   ├── infrastructure/ # 基础设施层
│   │   ├── ConfigManager.js            # 配置管理器
│   │   ├── events/    # 事件系统
│   │   │   ├── EventBus.js             # 事件总线
│   │   │   └── eventBus.instance.js    # 事件总线实例
│   │   ├── storage/   # 存储适配器
│   │   │   └── StorageAdapter.js       # 向量存储API适配器
│   │   └── api/       # API适配器
│   │       └── VectorizationAdapter.js  # 封装所有向量化源的调用
│   ├── utils/         # 工具函数
│   │   ├── hash.js              # 哈希计算工具
│   │   ├── textChunking.js      # 文本分块工具
│   │   ├── contentFilter.js     # 内容过滤工具
│   │   ├── tagExtractor.js      # 标签提取核心模块
│   │   ├── tagScanner.js        # 标签扫描模块
│   │   ├── tagParser.js         # 标签解析工具
│   │   └── chatUtils.js         # 聊天消息统一过滤工具
│   ├── ui/            # UI相关模块
│   │   ├── domUtils.js          # DOM操作工具
│   │   ├── settingsManager.js   # 设置管理器
│   │   ├── EventManager.js      # UI事件协调器
│   │   ├── StateManager.js      # UI状态管理器
│   │   ├── components/          # 可复用UI组件
│   │   │   ├── ChatSettings.js          # 聊天设置UI组件
│   │   │   ├── TagRulesEditor.js        # 标签规则编辑器UI组件
│   │   │   ├── TaskList.js              # 任务列表UI组件
│   │   │   ├── FileList.js              # 文件列表UI组件
│   │   │   ├── WorldInfoList.js         # 世界信息列表UI组件
│   │   │   ├── TagUI.js                 # 标签相关UI逻辑管理
│   │   │   ├── MessageUI.js             # 消息相关UI逻辑管理
│   │   │   ├── ActionButtons.js         # 动作按钮管理
│   │   │   ├── SettingsPanel.js         # 设置面板架构
│   │   │   ├── VectorizationSettings.js # 向量化设置
│   │   │   ├── QuerySettings.js         # 查询设置
│   │   │   ├── InjectionSettings.js     # 注入设置
│   │   │   ├── ContentSelectionSettings.js # 内容选择设置
│   │   │   ├── ProgressManager.js       # 进度管理器
│   │   │   ├── NotificationManager.js   # 通知管理器
│   │   │   ├── ExternalTaskUI.js        # 外挂任务UI组件
│   │   │   └── MemoryUI.js              # 记忆管理UI组件
│   │   └── styles/              # 模块化样式
│   │       ├── index.css        # 样式入口文件
│   │       ├── base.css         # 基础样式和CSS变量
│   │       ├── buttons.css      # 按钮样式
│   │       ├── content-selection.css # 内容选择样式
│   │       ├── forms.css        # 表单样式
│   │       ├── preview.css      # 预览样式
│   │       ├── progress.css     # 进度条样式
│   │       ├── tags.css         # 标签样式
│   │       ├── tasks.css        # 任务列表样式
│   │       └── responsive.css   # 响应式样式
│   └── plugins/       # 内置插件
│       └── builtin/
│           ├── TransformersPlugin.js  # Transformers向量化插件
│           ├── OllamaPlugin.js        # Ollama向量化插件
│           ├── vLLMPlugin.js          # vLLM向量化插件
│           ├── WebLLMPlugin.js        # WebLLM向量化插件
│           ├── OpenAIPlugin.js        # OpenAI向量化插件
│           └── CoherePlugin.js        # Cohere向量化插件
└── SuperAgent/         # 项目管理目录
    ├── tech-structure.md         # 技术栈说明
    ├── project-brief.md          # 项目简介
    └── Context/
        ├── project-architecture.md  # 项目架构文档
        └── iterations-log.md        # 迭代日志
```

## 核心依赖关系
```
主要模块交互：
index.js
├──> src/ui/components/* (UI组件)
├──> src/core/extractors/* (内容提取)
├──> src/infrastructure/api/VectorizationAdapter (向量化)
├──> src/infrastructure/storage/StorageAdapter (存储)
└──> src/infrastructure/events/EventBus (事件通信)

记忆管理模块：
MemoryUI ←→ MemoryService
         ├──> AI生成API
         ├──> 上下文管理
         └──> 事件发布
```

## 核心模块说明

### 1. 内容提取系统
- **ChatExtractor**: 处理聊天消息的提取和过滤
- **FileExtractor**: 从文件系统读取内容
- **WorldInfoExtractor**: 提取世界信息条目

### 2. 向量化系统
- **VectorizationAdapter**: 统一的向量化接口，支持6种引擎
- **文本分块**: 智能文本切分，保持语义完整性
- **批量处理**: 优化大量数据的向量化性能

### 3. 存储系统
- **StorageAdapter**: 向量数据的CRUD操作
- **任务持久化**: 保存向量化任务配置和状态
- **去重机制**: 基于哈希的内容去重

### 4. UI组件系统
- **组件化架构**: 15+独立UI组件
- **状态管理**: StateManager集中管理UI状态
- **事件系统**: EventManager统一处理事件

### 5. 记忆管理系统
- **MemoryService**: 处理AI对话和记忆生成
- **自动总结**: 支持定时触发的聊天总结
- **注入功能**: 将记忆内容注入到聊天提示中

### 6. 外挂任务系统
- **引用机制**: 跨聊天共享向量化任务
- **智能解析**: 自动提取角色名和格式化显示
- **性能优化**: 延迟加载和缓存机制

## 当前架构状态

### 主要设计模式
1. **工厂模式**: TaskFactory、ProcessorFactory处理对象创建
2. **适配器模式**: StorageAdapter、VectorizationAdapter统一接口
3. **观察者模式**: EventBus实现组件间通信
4. **策略模式**: 不同向量化引擎的切换

### 模块化进展
- **已完成**: 15+独立UI组件、提取器系统、存储适配层
- **使用率**: 约85%的代码已模块化
- **待完成**: index.js仍有部分耦合代码

## 核心功能实现状态

### 记忆管理系统 ✅
- **AI总结生成**: 支持OpenAI兼容API和Google Gemini API
- **世界书集成**: 自动创建chat lore绑定的世界书
- **自动总结**: 每N层楼自动触发，支持隐藏已总结楼层
- **防并发机制**: isAutoSummarizing标志防止重复执行

### 外挂任务系统 ✅
- **引用机制**: 跨聊天共享向量化任务，不复制数据
- **循环引用保护**: 完善的循环引用检测机制
- **孤儿任务处理**: 源聊天删除后自动标记
- **智能解析**: 自动提取角色名和格式化显示

### 向量化系统 ✅
- **多引擎支持**: 6种向量化源（Transformers、Ollama、vLLM、WebLLM、OpenAI、Cohere）
- **两阶段处理**: Phase 2准备数据，Phase 4执行向量化
- **批量优化**: 根据不同源提供合理批次大小
- **去重机制**: 基于哈希的文本级、任务级、文件级去重

## 技术实现细节

### 数据存储结构
```javascript
// extension_settings.vectors_enhanced
{
  vector_tasks: {         // 向量化任务存储
    "chatId": [{         // 按聊天ID组织
      taskId: "task_xxx",
      type: "vectorization"|"external",
      textContent: [],   // 实际内容（仅本地任务）
      source: "chatId_taskId" // 外挂任务引用
    }]
  },
  memory: {              // 记忆管理配置
    api_type: "openai"|"google",
    auto_summary: {      // 自动总结配置
      enabled: true,
      interval: 10,      // 每N层触发
      depth: 5           // 总结最近M层
    }
  }
}
```

### 向量化处理流程
1. **Phase 1**: 内容提取（ChatExtractor/FileExtractor/WorldInfoExtractor）
2. **Phase 2**: 数据准备（VectorizationAdapter.vectorize）
3. **Phase 3**: 文本分块和哈希生成
4. **Phase 4**: 实际向量化（StorageAdapter.insertVectorItems）
5. **Phase 5**: 任务持久化（保存到settings.vector_tasks）

### 关键性能优化
1. **批量处理**: 向量化时使用合理批次大小减少API调用
2. **缓存机制**: hashCache缓存避免重复哈希计算
3. **延迟加载**: 外挂任务仅在查询时解析引用
4. **事件防抖**: UI事件使用防抖处理高频操作

### 安全机制
1. **API密钥保护**: 使用SillyTavern的secrets系统安全存储
2. **循环引用检测**: 防止外挂任务形成循环依赖
3. **并发控制**: isAutoSummarizing防止重复执行
4. **错误边界**: 各模块都有try-catch保护

## 未来发展方向

### 短期计划
1. **完成模块化**: 将index.js剩余代码拆分
2. **UI改进**: 实现消息历史展示界面
3. **性能优化**: 改进大规模数据处理

### 长期规划
1. **TypeScript迁移**: 提升类型安全
2. **插件市场**: 支持第三方扩展
3. **多模态支持**: 图片/音频向量化