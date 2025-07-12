# 源代码目录

这是 Vectors Enhanced 重构后的源代码根目录。当前重构进度：**Phase 6 完成** (任务系统)

## 目录结构

### 核心业务逻辑 `core/`
- `entities/` - 实体类定义 ✅
  - `Content.js` - 内容实体类
  - `Vector.js` - 向量实体类  
  - `Task.js` - 任务实体类（兼容新旧格式）
- `extractors/` - 内容提取器系统 ✅
  - `IContentExtractor.js` - 提取器统一接口
  - `ChatExtractor.js` - 聊天消息提取器
  - `FileExtractor.js` - 文件内容提取器
  - `WorldInfoExtractor.js` - 世界信息提取器
- `tasks/` - 任务系统 ✅
  - `ITask.js` - 任务接口定义
  - `BaseTask.js` - 基础任务类
  - `VectorizationTask.js` - 向量化任务实现
  - `TaskFactory.js` - 任务工厂
  - `taskTypes.js` - 任务类型常量

### 应用层服务 `application/` ✅
- `TaskManager.js` - 任务管理器（协调新旧系统）
- `TaskQueue.js` - 任务队列（支持优先级和并发控制）

### 基础设施层 `infrastructure/` ✅
- `ConfigManager.js` - 配置管理器
- `events/` - 事件系统
  - `EventBus.js` - 事件总线
  - `eventBus.instance.js` - 事件总线实例
- `storage/` - 存储适配器
  - `StorageAdapter.js` - 向量存储API适配器
  - `TaskStorageAdapter.js` - 任务存储适配器
- `api/` - API客户端
  - `VectorizationAdapter.js` - 向量化API适配器

### 工具函数 `utils/` ✅
- `Logger.js` - 日志工具
- `hash.js` - 哈希计算工具
- `textChunking.js` - 文本分块工具
- `contentFilter.js` - 内容过滤工具
- `tagExtractor.js` - 标签提取核心模块
- `tagParser.js` - 标签解析工具
- `tagScanner.js` - 标签扫描模块
- `chatUtils.js` - 统一消息过滤工具

### UI组件 `ui/` ✅
- `domUtils.js` - 统一DOM操作工具
- `settingsManager.js` - 设置管理器
- `components/` - 可复用UI组件
  - `TaskList.js` - 任务列表组件
  - `FileList.js` - 文件列表组件
  - `WorldInfoList.js` - 世界信息列表组件
  - `ChatSettings.js` - 聊天设置组件
  - `TagRulesEditor.js` - 标签规则编辑器
  - `TagUI.js` - 标签相关UI管理
  - `MessageUI.js` - 消息相关UI逻辑

### 其他目录
- `legacy/` - 将被重构的旧代码（临时存放）
- `index.js` - 模块化入口文件

## 重构状态

### 已完成模块 ✅
- **Phase 0-1**: 基础设施层（EventBus, Logger, ConfigManager）
- **Phase 2**: 核心实体（Content, Vector, Task）
- **Phase 3**: 工具函数提取（hash, textChunking, tagExtractor等）
- **Phase 4**: 适配器层（StorageAdapter, VectorizationAdapter）
- **Phase 5**: 内容提取器（Chat, File, WorldInfo）
- **Phase 6**: 任务系统（TaskManager, TaskQueue, TaskFactory）

### 系统运行状态
- **当前模式**: TaskManager（新任务系统）
- **向后兼容**: 完全保持，所有现有任务正常工作
- **验证方法**: 控制台运行 `vectorsTaskSystemStatus()`

### 下一步计划
- **Phase 7**: UI层重构（设置面板组件化）
- **Phase 8**: 插件系统实现
- **Phase 9**: 切换到新架构
- **Phase 10**: 清理和优化

## 重构原则

1. **渐进式**: 每个阶段都是独立可验证的改进
2. **向后兼容**: 新代码与旧代码并存运行
3. **零停机**: 重构过程中功能始终可用
4. **模块化**: 职责明确，便于测试和维护
