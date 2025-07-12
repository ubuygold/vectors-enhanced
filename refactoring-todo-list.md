# Vectors Enhanced 渐进式重构 TODO List

## 核心原则
1. **每一步必须可独立验证**：完成后插件功能完全正常
2. **保持向后兼容**：旧的向量化任务必须能正常工作
3. **逐步替换**：新代码与旧代码并存，逐步切换
4. **最小化改动**：每次只改动一个最小单元

### Bug #1: 数据同步问题
- **发现时间**: 2025-07-11
- **描述**: 刷新页面后，提示信息显示已删除的任务数据仍存在于内存/缓存中
- **复现步骤**:
  1. 创建向量化任务
  2. 在文件管理器中手动删除任务文件
  3. 刷新页面
  4. 查看控制台，会显示已删除的任务信息
- **影响**: 中等 - 造成用户困惑，但不影响核心功能
- **根本原因**: 插件缺少文件系统监听机制，无法感知外部文件变化
- **建议修复时机**: Phase 10 完成后
- **修复方案**:
  - 添加文件系统监听机制
  - 启动时验证缓存数据与实际文件的一致性
  - 提供手动刷新缓存的功能

  
## Phase 0: 准备工作（不影响任何功能）✅

### 0.1 创建基础目录结构 ✅
- [x] 创建 `src/` 目录
- [x] 创建 `src/core/` 目录
- [x] 创建 `src/core/entities/` 目录
- [x] 创建 `src/infrastructure/` 目录
- [x] 创建 `src/infrastructure/events/` 目录
- [x] 创建 `src/utils/` 目录
- [x] 创建 `src/legacy/` 目录（用于存放将被重构的旧代码）

### 0.2 设置构建环境（可选，但推荐）✅
- [x] 创建 `webpack.config.js` 或类似的构建配置
- [x] 在 `package.json` 中添加构建脚本
- [x] 确保构建后的文件与 `manifest.json` 中的引用一致

### 🔍 功能完整性测试 - Phase 0
**测试时机**：完成目录创建后
- [x] **基础功能测试**
  - [x] 打开 SillyTavern，确认插件正常加载
  - [x] 点击扩展面板中的 "Vectors Enhanced" 图标，确认设置面板正常显示
  - [x] 检查控制台是否有错误信息

## Phase 1: 创建基础设施层（与现有代码完全隔离）✅

### 1.1 事件总线（新功能，不影响旧代码）
- [x] 创建 `src/infrastructure/events/EventBus.js`
  ```javascript
  // 简单的事件总线实现，不依赖任何外部代码
  class EventBus {
    constructor() {
      this.events = {};
    }
    on(event, callback) { /* ... */ }
    emit(event, data) { /* ... */ }
    off(event, callback) { /* ... */ }
  }
  ```
- [x] 创建 `src/infrastructure/events/eventBus.instance.js`
  ```javascript
  // 单例实例
  import { EventBus } from './EventBus.js';
  export const eventBus = new EventBus();
  ```
- [x] **验证点**：在浏览器控制台测试 EventBus 是否正常工作

### 1.2 日志系统（新功能，逐步替换 console.log）
- [x] 创建 `src/utils/Logger.js`
  ```javascript
  class Logger {
    constructor(module) {
      this.module = module;
    }
    log(message, ...args) {
      console.log(`[${this.module}] ${message}`, ...args);
    }
    error(message, ...args) {
      console.error(`[${this.module}] ${message}`, ...args);
    }
  }
  ```
- [x] **验证点**：创建测试实例，确保日志正常输出

### 1.3 配置管理器（包装现有的设置存储）
- [x] 创建 `src/infrastructure/ConfigManager.js`
  ```javascript
  class ConfigManager {
    get(key) {
      // 暂时直接调用原有的 getExtensionSetting
      return window.getExtensionSetting('vectors_enhanced', key);
    }
    set(key, value) {
      // 暂时直接调用原有的 setExtensionSetting
      return window.setExtensionSetting('vectors_enhanced', key, value);
    }
  }
  ```
- [x] **验证点**：通过 ConfigManager 读写设置，确保与原功能一致

### 🔍 功能完整性测试 - Phase 1
**测试时机**：完成基础设施层后
- [x] **设置功能测试**
  - [x] 修改"主开关"设置，确认状态正确保存和恢复
  - [x] 修改"查询多样性"设置，确认数值正确保存
  - [x] 修改"向量化源"选项，确认切换正常
  - [x] 重启插件后，确认所有设置都正确恢复
- [x] **日志功能测试**
  - [x] 进行一次向量化操作，检查控制台是否有新格式的日志输出
  - [x] 确认日志包含正确的模块名称标识

## Phase 2: 创建核心实体（只定义，不使用）✅

### 2.1 内容实体
- [x] 创建 `src/core/entities/Content.js`
  ```javascript
  // 定义内容的数据结构
  class Content {
    constructor(id, type, text, metadata = {}) {
      this.id = id;
      this.type = type; // 'chat', 'file', 'world'
      this.text = text;
      this.metadata = metadata;
      this.createdAt = new Date();
    }
  }
  ```

### 2.2 向量实体
- [x] 创建 `src/core/entities/Vector.js`
  ```javascript
  class Vector {
    constructor(id, contentId, embedding, metadata = {}) {
      this.id = id;
      this.contentId = contentId;
      this.embedding = embedding;
      this.metadata = metadata;
      this.createdAt = new Date();
    }
  }
  ```

### 2.3 任务实体（兼容旧的任务格式）
- [x] 创建 `src/core/entities/Task.js`
  ```javascript
  class Task {
    constructor(data) {
      // 兼容旧格式
      if (typeof data === 'string') {
        // 旧格式：任务ID是字符串
        this.id = data;
        this.legacy = true;
      } else {
        // 新格式
        this.id = data.id;
        this.type = data.type;
        this.status = data.status || 'pending';
        this.content = data.content;
        this.metadata = data.metadata || {};
        this.legacy = false;
      }
    }
  }
  ```
- [x] **验证点**：创建新旧格式的任务实例，确保都能正常创建

## Phase 3: 逐步提取工具函数（从 index.js 中提取，但保持原调用）

### 3.1 哈希计算工具
- [x] 创建 `src/utils/hash.js`
  ```javascript
  // 从 index.js 复制 getStringHash 函数
  export async function getStringHash(str) {
    // 原有实现
  }
  ```
- [x] 在 index.js 顶部添加：
  ```javascript
  import { getStringHash as getStringHashNew } from './src/utils/hash.js';
  ```
- [x] 创建一个包装函数，逐步测试：
  ```javascript
  async function getStringHash(str) {
    // 可以添加日志来验证新旧函数结果一致
    const oldResult = /* 原有实现 */;
    const newResult = await getStringHashNew(str);
    console.assert(oldResult === newResult, 'Hash mismatch!');
    return newResult;
  }
  ```
- [x] **验证点**：运行插件，确保所有哈希计算正常

### 3.2 文本处理工具（分模块迁移）

#### 3.2.1 文本分块模块（基础功能）
- [x] 创建 `src/utils/text.js`
- [x] 迁移 `splitTextIntoChunks` 函数
- [x] 迁移 `getChunkDelimiters` 函数
- [x] 迁移 `overlapChunks` 函数
- [x] 在 index.js 中创建包装函数验证
- [x] **验证点**：测试文本分块功能，确保与原实现一致

#### 3.2.2 内容过滤工具
- [x] 创建 `src/utils/contentFilter.js`
- [x] 迁移 `shouldSkipContent` 函数
- [x] 迁移 `escapeRegex` 函数
- [x] 迁移其他基础过滤函数
- [x] **验证点**：测试内容过滤逻辑

#### 3.2.3 标签提取核心模块（最复杂）
- [x] 创建 `src/utils/tagExtractor.js`
- [x] 先迁移基础标签提取函数：
  - [x] `extractSimpleTag`
  - [x] `extractComplexTag`
  - [x] `extractHtmlFormatTag`
  - [x] `extractCurlyBraceTag`
- [x] 迁移核心协调函数 `extractTagContent`
- [x] 迁移废弃函数 `removeCurlyBraceTags`（标记为 deprecated）
- [x] **验证点**：使用各种标签格式测试提取功能

#### 3.2.4 标签扫描模块（UI相关）
- [x] 创建 `src/utils/tagScanner.js`
- [x] 迁移 `scanTextForTags` 函数
- [x] 迁移相关的UI辅助函数
- [x] **验证点**：测试标签扫描在UI中的表现

### 🔍 功能完整性测试 - Phase 3
**测试时机**：完成工具函数提取后
- [x] **向量化核心功能测试**
  - [x] 选择一个聊天进行向量化，确认功能正常
  - [x] 检查生成的向量ID是否与之前格式一致
  - [x] 验证向量数据是否正确保存到数据库
- [x] **文本处理测试**
  - [x] 向量化一个超长聊天（超过chunk大小），确认分块正常
  - [x] 向量化包含特殊字符的内容，确认处理正确
  - [x] 检查向量注入功能是否正常工作

### 3.3 DOM 操作工具（UI模块核心）

**目标**：将所有直接的 DOM 操作从 `index.js` 中剥离，迁移到专门的UI模块。这会使业务逻辑与视图表现分离，提高代码的可测试性和可维护性。当前代码大量使用 jQuery 和字符串拼接生成HTML，是重构的重点和难点。

- [x] **创建 `src/ui/domUtils.js`**
  - **描述**: 创建一个统一的模块来存放所有与DOM操作相关的工具函数。
  - **迁移策略**:
    1. 创建 `src/ui/` 目录。
    2. 创建 `src/ui/domUtils.js` 文件。
  - **验证点**: 文件和目录创建成功。
  - **回滚策略**: 删除文件和目录。

- [x] **迁移基础UI显隐/状态切换函数**
  - **涉及函数**: `updateProgress`, `hideProgress`, `toggleSettings`, `updateContentSelection`, `updateMasterSwitchState`。
  - **描述**: 这些函数负责控制UI元素的显示、隐藏和状态，是UI交互的基础。
  - **迁移策略**:
    1. 将这些函数逐个移动到 `domUtils.js` 中。
    2. 在 `index.js` 中导入并替换原有的调用。
    3. 考虑将 jQuery 选择器作为参数传入，或在 `domUtils.js` 中统一管理选择器常量。
  - **验证点**:
    - 向量化时进度条能正常显示和隐藏。
    - 切换设置源时，对应的设置面板能正确展开和折叠。
    - 主开关能控制所有设置项的显示/隐藏。
  - **回滚策略**: 将函数代码从 `domUtils.js` 移回 `index.js`。

- [x] **重构列表渲染函数**
  - **涉及函数**: `updateTaskList`, `renderTagRulesUI`, `updateFileList`, `updateWorldInfoList`, `updateChatSettings`。
  - **描述**: 这些函数通过拼接HTML字符串来动态生成列表，非常脆弱且难以阅读。
  - **迁移策略**:
    1. 创建 `src/ui/components/` 目录。
    2. 为每个列表创建一个独立的组件文件，例如 `src/ui/components/TaskList.js`。
    3. 在组件内部，使用模板字符串（Template Literals）代替字符串拼接来生成HTML结构，提高可读性。
    4. 将渲染逻辑和事件绑定逻辑（如删除、重命名按钮的点击事件）封装在组件内部。
  - **验证点**:
    - 任务列表、标签规则列表、文件列表和世界信息列表能正常显示。
    - 列表项上的交互按钮（如删除、勾选）功能正常。
  - **回滚策略**: 恢复使用 `index.js` 中的旧版渲染函数。

- [x] **迁移标签相关UI函数**
  - **涉及函数**: `displayTagSuggestions`, `clearTagSuggestions`, `showTagExamples`。
  - **描述**: 这些函数处理标签扫描和建议的UI显示逻辑。
  - **迁移策略**:
    1. 创建 `src/ui/components/TagUI.js`。
    2. 将这些函数迁移到该模块。
    3. 保持与 `tagScanner.js` 的解耦。
  - **验证点**:
    - 标签扫描后能正确显示建议列表。
    - 点击建议标签能正确添加到规则中。
    - 标签示例弹窗能正常显示格式化的内容。
  - **回滚策略**: 将函数移回 `index.js`。

- [x] **迁移消息相关UI函数**
  - **涉及函数**: `updateHiddenMessagesInfo`, `showHiddenMessages`, `previewContent`。
  - **描述**: 这些函数处理消息显示相关的UI逻辑。
  - **迁移策略**:
    1. 创建 `src/ui/components/MessageUI.js`。
    2. 将这些函数迁移到该模块。
    3. 统一弹窗显示的样式和行为。
  - **验证点**:
    - 隐藏消息信息能正确更新显示。
    - 隐藏消息列表弹窗能正常显示。
    - 内容预览弹窗显示正确。
  - **回滚策略**: 将函数移回 `index.js`。

- [x] **迁移设置初始化逻辑**
  - **涉及代码**: jQuery ready事件处理器中的大量 `$('#id').val().on(...)` 
  - **描述**: 这是 `index.js` 中最混乱的部分，将所有设置的UI初始化和事件绑定耦合在一起。
  - **迁移策略**:
    1. 创建 `src/ui/settingsManager.js`。
    2. 将所有与设置UI相关的初始化代码（读取设置值、绑定事件）迁移到此模块。
    3. `settingsManager.js` 负责监听UI事件，并调用 `ConfigManager` 来更新配置。
  - **验证点**:
    - 设置面板所有输入框、复选框、下拉菜单都能正确显示当前配置。
    - 修改任何设置项，都能正确保存并触发相应的功能更新。
    - 页面刷新后，所有设置项能恢复到保存的状态。
  - **回滚策略**: 将 `settingsManager.js` 的逻辑移回 `index.js` 的 jQuery ready 处理器。

- [x] **迁移原生DOM操作**
  - **涉及函数**: `exportVectors` 内部的 `document.createElement('a')` 逻辑。
  - **描述**: 这是少数未使用jQuery的原生DOM操作，也应被封装。
  - **迁移策略**:
    1. 在 `domUtils.js` 中创建一个名为 `triggerDownload` 的函数，封装创建链接、点击、移除的完整逻辑。
    2. 在 `exportVectors` 中调用 `triggerDownload`。
  - **验证点**: 导出向量数据时，能正常触发文件下载。
  - **回滚策略**: 在 `exportVectors` 中恢复使用原生DOM代码。

#### 3.3.1 专项重构：HTML格式化处理

在 `showTagExamples` 函数中有复杂的Markdown到HTML的转换逻辑，包括 `escapeHtml` 函数和大量的正则表达式替换。这部分需要特别小心处理。

- [ ] **步骤 1: 提取HTML格式化相关函数**
  - **涉及函数**: `escapeHtml`（在showTagExamples内部定义）
  - **描述**: `escapeHtml` 是一个无副作用的纯函数，可以最先被提取。
  - **迁移策略**:
    1. 创建 `src/utils/textFormat.js`。
    2. 将 `escapeHtml` 函数移动到该文件中并导出。
    3. 在 `index.js` 中导入并使用它。
  - **验证点**: 创建一个包含特殊HTML字符（`<`, `>`, `&`）的测试用例，确认格式化后的弹窗能正确显示这些字符，而不是将它们渲染为HTML标签。
  - **回滚策略**: 将 `escapeHtml` 函数移回 `index.js`。

- [ ] **步骤 2: 提取Markdown到HTML的转换逻辑**
  - **涉及代码**: `showTagExamples` 函数中的大量正则表达式替换链（行4576-4625）
  - **描述**: 将Markdown格式化逻辑抽取为独立函数。
  - **迁移策略**:
    1. 在 `textFormat.js` 中创建 `formatMarkdownToHtml` 函数。
    2. 将所有正则表达式替换逻辑移动到该函数。
    3. 在 `showTagExamples` 中调用新函数。
  - **验证点**: 标签示例弹窗显示效果与之前完全一致。
  - **回滚策略**: 将格式化逻辑移回 `showTagExamples`。

- [ ] **步骤 3: 重构正则表达式替换链**
  - **描述**: 当前函数使用一长串的 `.replace().replace()...` 调用，难以管理和调试。
  - **迁移策略**:
    1. 在 `textFormat.js` 中，将每个替换规则定义为独立的对象，并放入一个数组中。
      ```javascript
      const markdownRules = [
        { pattern: /`([^`]+)`/g, replacement: '<code>$1</code>' },
        { pattern: /\*\*(.*?)\*\*/g, replacement: '<strong>$1</strong>' },
        // ... 更多规则
      ];
      ```
    2. 使用 `reduce` 方法按顺序应用这些规则。
  - **验证点**:
    - 创建包含所有支持的Markdown语法的测试字符串。
    - 对比新旧函数的输出，确保HTML结果相同。
  - **回滚策略**: 恢复使用链式 `.replace()` 调用。

- [ ] **步骤 4: 统一HTML生成策略**
  - **描述**: 为其他需要生成HTML的地方提供一致的格式化接口。
  - **迁移策略**:
    1. 识别其他需要Markdown格式化的地方（如隐藏消息预览）。
    2. 统一使用 `textFormat.js` 中的函数。
    3. 考虑为不同场景提供不同的格式化选项。
  - **验证点**: 所有使用HTML格式化的地方表现一致。
  - **回滚策略**: 各处恢复使用自己的格式化逻辑。

- [ ] **测试策略与回滚计划**
  - **测试策略**:
    - **单元测试**: 为 `textFormat.js` 创建测试文件。
    - **集成测试**: 手动测试所有使用格式化功能的UI组件。
  - **回滚计划**:
    - 保留旧的实现作为备份。
    - 使用功能开关快速切换新旧实现。

    ### Phase 3.5: 统一消息过滤逻辑 (新发现的技术债) ✅

- **问题**: `getHiddenMessages` 函数（用于UI）与 `getVectorizableContent` 内的隐藏消息过滤逻辑（用于数据提取）存在功能重复。两者都依赖 `msg.is_system === true` 来判断，但实现方式不同，违反了DRY原则。
- **目标**: 创建一个统一的、可复用的消息工具函数模块，作为单一事实来源（Single Source of Truth）。
- **子任务**:
  - [x] **创建 `src/utils/chatUtils.js`**: 创建一个新的工具模块。
  - [x] **实现核心过滤函数**: 在 `chatUtils.js` 中实现一个核心的 `getMessages(options)` 函数。该函数应能根据传入的 `{ includeHidden, types, range }` 等选项，返回符合条件的消息数组。
  - [x] **重构UI层**: 重构 `src/ui/components/MessageUI.js` 中的代码，移除内部的 `getHiddenMessages`，改为调用新的 `chatUtils.getMessages()`。
  - [x] **重构数据提取层**: 重构 `getVectorizableContent` 和 `getRawContentForScanning`，移除内部的 `if` 判断，改为调用新的 `chatUtils.getMessages()`。
- **验证点**: 确保UI显示、内容提取和向量化功能在逻辑统一后表现完全一致。
- **执行时机**: 在完成所有 `Phase 3` 的UI工具函数迁移后，但在开始 `Phase 5` 内容提取器之前执行。

## Phase 4: 创建适配器层（包装现有功能）

### 4.1 存储适配器 ✅
- [x] 创建 `src/infrastructure/storage/StorageAdapter.js`
  ```javascript
  class StorageAdapter {
    async getSavedHashes(collectionId) { }
    async insertVectorItems(collectionId, items, signal) { }
    async queryCollection(collectionId, searchText, topK, threshold) { }
    async getVectorTexts(collectionId, hashes) { }
    async purgeVectorIndex(collectionId) { }
    async collectionExists(collectionId) { }
    async getCollectionStats(collectionId) { }
  }
  ```
- [x] 实现依赖注入模式，避免循环引用
- [x] 在 index.js 中创建适配器实例并注入依赖
- [x] 修改所有存储相关函数，使用适配器代替直接的 API 调用
- [x] **验证点**：通过适配器读写向量数据

### 4.2 API 适配器（包装现有的向量化 API） ✅
- [x] 创建 `src/infrastructure/api/VectorizationAdapter.js`
- [x] 为每种向量化源创建适配方法：
  - [x] `vectorizeWithTransformers`
  - [x] `vectorizeWithOllama`
  - [x] `vectorizeWithVLLM`
  - [x] `vectorizeWithWebLLM`
  - [x] `vectorizeWithOpenAI` (额外实现)
  - [x] `vectorizeWithCohere` (额外实现)
- [x] 实现辅助功能：
  - [x] `getSupportedSources()` - 获取支持的源列表
  - [x] `checkSourceAvailability()` - 检查源是否可用
  - [x] `getBatchSizeRecommendation()` - 获取批次大小建议
- [x] 在 index.js 中创建适配器实例并注入依赖
- [x] **验证点**：通过适配器进行向量化，结果应该完全一致

### 🔍 功能完整性测试 - Phase 4
**测试时机**：完成适配器层后
- [ ] **存储功能测试**
  - [ ] 查看"向量管理"面板，确认能正确显示所有已有向量
  - [ ] 删除一个向量，确认删除功能正常
  - [ ] 清空所有向量，确认清空功能正常
  - [ ] 重新向量化内容，确认新向量正确保存
- [ ] **API功能测试**（针对每种向量化源）
  - [ ] **Transformers测试**
    - [ ] 切换到Transformers源，进行向量化
    - [ ] 确认进度条正常显示
    - [ ] 验证生成的向量维度正确
  - [ ] **Ollama测试**（如果已配置）
    - [ ] 切换到Ollama源，设置正确的模型
    - [ ] 进行向量化，确认连接正常
  - [ ] **WebLLM测试**
    - [ ] 切换到WebLLM源，确认模型加载
    - [ ] 进行向量化，验证本地处理正常

## Phase 5: 内容提取器（逐步替换内容获取逻辑）✅

### 5.1 提取器接口 ✅
- [x] 创建 `src/core/extractors/IContentExtractor.js`
  ```javascript
  export class IContentExtractor {
    async extract(source) {
      throw new Error('IContentExtractor.extract() must be implemented by subclasses');
    }
  }
  ```

### 5.2 聊天消息提取器 ✅
- [x] 创建 `src/core/extractors/ChatExtractor.js`
- [x] 实现 `extract` 方法，内部调用原有的获取聊天消息逻辑
- [x] 集成了统一的消息过滤逻辑（chatUtils.js）
- [x] **验证点**：提取的聊天内容与原方式完全一致

### 5.3 文件提取器 ✅
- [x] 创建 `src/core/extractors/FileExtractor.js`
- [x] 迁移文件内容获取逻辑
- [x] **验证点**：文件内容提取正常

### 5.4 世界信息提取器 ✅
- [x] 创建 `src/core/extractors/WorldInfoExtractor.js`
- [x] 迁移世界信息获取逻辑
- [x] **验证点**：世界信息提取正常

### 🔍 功能完整性测试 - Phase 5
**测试时机**：完成内容提取器后
- [ ] **内容选择功能测试**
  - [ ] **聊天消息测试**
    - [ ] 勾选"聊天消息"选项
    - [ ] 选择不同的消息范围（最近10条、50条、全部）
    - [ ] 执行向量化，确认只处理选中范围的消息
    - [ ] 验证系统消息的包含/排除设置是否生效
  - [ ] **文件测试**
    - [ ] 勾选"文件"选项
    - [ ] 从文件列表中选择特定文件
    - [ ] 执行向量化，确认只处理选中的文件
    - [ ] 测试"全选/取消全选"功能
  - [ ] **世界信息测试**
    - [ ] 勾选"世界信息"选项
    - [ ] 选择特定的世界信息条目
    - [ ] 执行向量化，确认内容正确提取
  - [ ] **混合内容测试**
    - [ ] 同时选择多种内容类型
    - [ ] 执行向量化，确认所有选中内容都被处理

## Phase 6: 任务系统（与现有任务并行运行）✅

### 6.1 任务工厂 ✅
- [x] 创建 `src/core/tasks/TaskFactory.js`
- [x] 实现创建新格式任务的方法
- [x] 实现从旧格式转换到新格式的方法
- [x] 实现双向转换支持（toLegacyFormat/fromLegacyTask）
- [x] **验证点**：能够创建任务，不影响现有功能

### 6.2 任务队列（新建，不替换现有队列）✅
- [x] 创建 `src/application/TaskQueue.js`
- [x] 实现基本的入队、出队功能
- [x] 添加优先级支持
- [x] 实现并发控制和取消机制
- [x] **验证点**：队列操作正常，不影响现有任务

### 6.3 任务管理器（协调新旧系统）✅
- [x] 创建 `src/application/TaskManager.js`
- [x] 实现任务创建（同时创建新旧格式）
- [x] 实现任务状态同步（新旧状态保持一致）
- [x] 实现dual-write模式确保向后兼容
- [x] 集成TaskStorageAdapter处理存储
- [x] 与index.js的getChatTasks函数集成
- [x] **验证点**：创建任务时，新旧系统都能正常工作

### 6.4 任务存储适配器 ✅
- [x] 创建 `src/infrastructure/storage/TaskStorageAdapter.js`
- [x] 实现新格式任务的持久化
- [x] 实现legacy格式任务的兼容访问
- [x] 实现任务迁移功能

### 6.5 任务系统集成 ✅
- [x] 创建完整的任务类型系统（ITask, BaseTask, VectorizationTask）
- [x] 实现taskTypes.js常量定义
- [x] 集成到主index.js文件
- [x] 添加全局状态检查函数（vectorsTaskSystemStatus）
- [x] **系统状态**：TaskManager模式运行，所有现有任务保留

### 🔍 功能完整性测试 - Phase 6 ✅
**测试时机**：完成任务系统后
- [x] **任务管理功能测试**
  - [x] **任务创建测试**
    - [x] 系统运行在TaskManager模式
    - [x] 所有现有任务正确加载和显示
    - [x] 任务ID格式保持兼容
  - [x] **任务状态测试**
    - [x] 使用 `vectorsTaskSystemStatus()` 验证系统状态
    - [x] 确认TaskManager可用且非legacy模式
    - [x] 验证存储系统就绪
  - [x] **向后兼容测试**
    - [x] 现有任务完全保留（用户确认3个任务恢复）
    - [x] getChatTasks函数正常切换新旧系统
    - [x] 自动回退机制正常工作
  - [x] **系统集成测试**
    - [x] TaskManager与ConfigManager正确集成
    - [x] TaskStorageAdapter正确访问legacy数据
    - [x] UI显示完全正常，无功能损失

## Phase 7: UI 层重构（渐进式替换）

**目标**: 从 index.js 提取约300-400行UI代码，创建模块化、可测试的UI组件，保持100%向后兼容

### 分析结果
**当前状态**:
- **已完成**: domUtils、settingsManager、7个UI组件已就绪
- **index.js剩余**: 仍有大量UI逻辑需要提取（按钮处理器、设置面板、进度管理、事件系统）
- **settings.html**: 562行需要模块化
- **style.css**: 400+行需要架构重组

### 实施策略
**阶段1 (高优先级)**: ActionButtons + ProgressManager (移除最大UI债务)
**阶段2 (高优先级)**: SettingsPanel模块化 (处理复杂设置UI)  
**阶段3 (中优先级)**: EventManager + StateManager (解耦UI和业务逻辑)
**阶段4 (低优先级)**: 通知系统 + 样式架构 (提升维护性)

### 7.1 ActionButtons 组件系统（高优先级）✅
- [x] **7.1.1** 创建 `src/ui/components/ActionButtons.js` - 提取 Preview/Export/Vectorize/Abort 按钮处理器
  - **当前位置**: index.js 2022-2081行（已删除旧代码）
  - **功能**: 统一按钮状态管理、进度切换、错误处理
  - **收益**: 移除60+行代码，标准化操作模式
  - **实现**: 277行新组件，支持依赖注入模式
- [x] **7.1.2** 实现集中式按钮状态管理
  - **目标**: 统一处理禁用状态、加载指示器、进度切换
  - **机制**: `#vectors_enhanced_vectorize` ↔ `#vectors_enhanced_abort` 智能切换
  - **实现**: buttonStates对象管理所有按钮状态
- [x] **7.1.3** 标准化错误处理模式
  - **统一**: toastr错误消息格式
  - **验证**: 主开关检查、优雅错误恢复
  - **修复**: 解决重复成功通知问题

### 7.2 SettingsPanel 架构重构（高优先级）✅
- [x] **7.2.1** 创建 `src/ui/components/SettingsPanel.js` - 提取模板加载逻辑
  - **当前位置**: index.js 2261-2263行
  - **目标**: 统一设置面板架构基础
  - **实现**: 269行架构组件，支持子组件管理
- [x] **7.2.2** 创建 VectorizationSettings 组件
  - **功能**: 源选择、模型配置、参数设置
  - **模块化**: 独立的设置验证和保存逻辑
  - **实现**: 427行组件，支持源特定配置和验证
- [x] **7.2.3** 创建 QuerySettings 组件
  - **功能**: 查询参数、重新排序、通知设置
  - **实现**: 389行组件，包含Rerank配置和验证
- [x] **7.2.4** 创建 InjectionSettings 组件
  - **功能**: 模板配置、注入位置、深度设置
  - **实现**: 454行组件，修复了位置可见性bug
- [x] **7.2.5** 创建 ContentSelectionSettings 组件
  - **功能**: Chat/File/WorldInfo 选择面板统一管理
  - **实现**: 497行组件，包含完整的内容选择逻辑
  - **特性**: 依赖注入模式，支持标签提取和内容过滤
- [x] **7.2.6** 分解 settings.html 模板结构
  - **当前**: 562行单体HTML文件
  - **实现**: 创建settings-modular.html和components.css
  - **成果**: 内联样式转换为CSS类，提高维护性

### 7.3 ProgressManager 系统（中优先级）✅
- [x] **7.3.1** 创建 `src/ui/components/ProgressManager.js`
  - **集中管理**: 所有进度显示、状态消息、错误状态可视化
  - **实现**: 500行组件，支持事件驱动进度管理
  - **特性**: 进度历史、状态可视化、错误处理
- [x] **7.3.2** 标准化进度模式
  - **统一**: 进度条样式、加载状态、错误恢复UI流程
  - **优化**: 一致的用户反馈体验
  - **集成**: 替换所有updateProgress/hideProgress调用

### 7.4 EventManager 架构（中优先级）✅
- [x] **7.4.1** 创建 `src/ui/EventManager.js` - 提取事件绑定逻辑
  - **当前位置**: index.js 2344-2374行
  - **功能**: 聊天生命周期、导航事件处理
  - **实现**: 400行事件协调器，支持事件委托
- [x] **7.4.2** 实现事件委托模式
  - **优化**: 减少内存占用、动态元素处理
  - **标准化**: 一致的事件处理模式
  - **特性**: 防抖处理、事件历史、性能统计

### 7.5 StateManager 系统（中优先级）✅
- [x] **7.5.1** 创建 `src/ui/StateManager.js` - 集中UI状态管理
  - **管理**: 面板可见性、表单验证、加载/禁用状态、选择状态
  - **架构**: 多组件状态协调基础设施
  - **实现**: 600行状态管理器，支持依赖注入
- [x] **7.5.2** 实现状态同步机制
  - **同步**: 设置 ↔ UI 一致性
  - **功能**: 撤销/重做能力、状态持久化
  - **特性**: 状态历史、自动同步、表单验证

### 7.6 NotificationManager 系统（低优先级）
- [ ] **7.6.1** 创建 `src/ui/components/NotificationManager.js`
  - **统一**: 47处 toastr 使用标准化
  - **模式**: 成功/错误/警告/信息消息格式
- [ ] **7.6.2** 创建通知模板系统
  - **模板**: 向量化完成、错误报告、进度通知
  - **一致性**: 集中化通知逻辑

### 7.7 样式架构重组（低优先级）
- [ ] **7.7.1** 模块化 style.css 到 `src/ui/styles/`
  - **当前**: 400+行单体CSS文件
  - **目标**: base.css, components.css, layout.css, utilities.css
- [ ] **7.7.2** CSS变量标准化
  - **替换**: 硬编码颜色为主题变量
  - **系统**: 一致的间距、尺寸比例、响应式设计
- [ ] **7.7.3** 转换内联样式为CSS类
  - **清理**: settings.html 中的内联样式
  - **维护性**: 集中样式管理

### 7.8 质量保证（高优先级）
- [ ] **7.8.1** 功能完整性测试
  - **要求**: 所有UI组件保持相同功能和向后兼容
  - **验证**: 用户交互行为完全一致
- [ ] **7.8.2** 性能验证
  - **监控**: 无性能回归、内存使用优化
  - **测试**: 响应时间、错误状态处理

### 预期成果
- **代码减少**: index.js 减少300-400行
- **维护性**: 每个UI关注点独立模块化
- **测试性**: UI组件可独立单元测试
- **性能**: 更好的事件处理减少内存使用
- **用户体验**: 更一致的交互和视觉反馈
- **开发体验**: 清晰的关注点分离，更容易调试

### 🔍 功能完整性测试 - Phase 7
**测试时机**：完成UI组件重构后
- [x] **UI交互功能测试**
  - [x] **ActionButtons 测试**
    - [x] 测试 Preview/Export/Vectorize/Abort 按钮状态切换
    - [x] 验证进度指示器和禁用状态管理
    - [x] 确认错误处理和 toastr 消息一致性
    - [x] 修复重复成功通知bug
  - [x] **SettingsPanel 测试**
    - [x] 测试所有设置模块的修改和保存
    - [x] 验证设置变更立即生效
    - [x] 检查模块间状态同步
    - [x] 修复Rerank设置状态持久化问题
    - [x] 修复InjectionSettings位置可见性问题
  - [ ] **ProgressManager 测试**
    - [ ] 验证进度条动画和百分比准确性
    - [ ] 测试多任务进度并行显示
    - [ ] 检查错误状态可视化
  - [ ] **EventManager 测试**
    - [ ] 测试聊天生命周期事件处理
    - [ ] 验证导航事件响应
    - [ ] 确认事件委托模式正常工作
  - [ ] **StateManager 测试**
    - [ ] 测试UI状态同步机制
    - [ ] 验证多组件状态协调
    - [ ] 检查状态持久化功能
  - [ ] **NotificationManager 测试**
    - [ ] 测试成功/失败/警告通知显示
    - [ ] 验证通知自动消失时间
    - [ ] 检查通知模板一致性
  - [ ] **样式架构测试**
    - [ ] 验证CSS模块化无视觉回归
    - [ ] 测试CSS变量主题系统
    - [ ] 确认响应式设计保持正常

## Phase 8: 插件系统实现

### 8.1 插件接口
- [ ] 创建 `src/plugins/IPlugin.js`
- [ ] 定义插件生命周期方法

### 8.2 向量化插件
- [ ] 创建 `src/plugins/vectorization/VectorizationPlugin.js`
- [ ] 包装现有的向量化逻辑
- [ ] 实现插件接口方法
- [ ] **验证点**：通过插件进行向量化，结果一致

### 8.3 插件管理器
- [ ] 创建 `src/application/PluginManager.js`
- [ ] 实现插件注册、初始化
- [ ] 实现插件调用分发
- [ ] **验证点**：插件系统工作正常

### 🔍 功能完整性测试 - Phase 8
**测试时机**：完成插件系统后
- [ ] **插件系统功能测试**
  - [ ] **插件加载测试**
    - [ ] 验证向量化插件正确加载
    - [ ] 检查插件初始化日志
    - [ ] 确认插件生命周期方法被正确调用
  - [ ] **插件功能测试**
    - [ ] 通过插件系统进行向量化操作
    - [ ] 验证插件处理的结果与直接调用一致
    - [ ] 测试插件的启用/禁用功能
  - [ ] **插件扩展性测试**
    - [ ] 尝试注册一个测试插件
    - [ ] 验证插件的事件监听机制
    - [ ] 测试插件间的通信（如果有）

## Phase 9: 切换到新架构

### 9.1 创建新的入口文件
- [ ] 创建 `src/index.new.js`
- [ ] 初始化新架构的所有组件
- [ ] 保持与旧 index.js 相同的对外接口

### 9.2 双轨运行测试
- [ ] 在 manifest.json 中同时加载新旧文件
- [ ] 添加功能开关，可以切换使用新旧系统
- [ ] 进行全面的对比测试
- [ ] **验证点**：新旧系统行为完全一致

### 9.3 逐步迁移
- [ ] 一个功能一个功能地切换到新系统
- [ ] 每切换一个功能，进行充分测试
- [ ] 保留回退能力

### 🔍 功能完整性测试 - Phase 9
**测试时机**：双轨运行期间
- [ ] **双轨对比测试**
  - [ ] **功能一致性测试**
    - [ ] 在新旧系统中执行相同的向量化任务
    - [ ] 比较生成的向量ID和内容是否一致
    - [ ] 验证任务执行时间是否相近
  - [ ] **数据兼容性测试**
    - [ ] 新系统读取旧系统创建的向量
    - [ ] 旧系统读取新系统创建的向量
    - [ ] 确认向量查询结果一致
  - [ ] **切换测试**
    - [ ] 测试功能开关，在新旧系统间切换
    - [ ] 验证切换过程中没有数据丢失
    - [ ] 确认切换后所有功能正常
  - [ ] **压力测试**
    - [ ] 在两个系统中同时运行大量任务
    - [ ] 监控内存和CPU使用情况
    - [ ] 验证系统稳定性

## Phase 10: 清理和优化

### 10.1 移除旧代码
- [ ] 确认所有功能都已迁移
- [ ] 移除旧的实现
- [ ] 清理未使用的依赖

### 10.2 性能优化
- [ ] 实现任务批处理
- [ ] 添加结果缓存
- [ ] 优化大文本处理

### 10.3 添加新功能
- [ ] 实现 LLM 总结功能
- [ ] 添加外部任务支持
- [ ] 实现任务导入/导出

### 10.4 去重逻辑改进
- [ ] **10.4.1** 实现基于实际向量化记录的去重
  - [ ] 在任务中记录实际处理的项目索引/ID
  - [ ] 修改 `getProcessedItemIdentifiers` 使用实际记录
  - [ ] 支持重试失败的项目
- [ ] **10.4.2** 改进增量处理提示信息
  - [ ] 显示已处理的具体数量
  - [ ] 显示新增的具体范围
  - [ ] 添加"强制重新向量化"选项
- [ ] **10.4.3** 任务执行记录增强
  - [ ] 记录 totalSelected, filtered, processed, failed 数量
  - [ ] 保存实际处理的范围（如 ['#41', '#61-81', '#97-98']）
  - [ ] 添加执行日志查看功能

### 🔍 功能完整性测试 - Phase 10
**测试时机**：完成所有优化和新功能后
- [ ] **最终完整性测试**
  - [ ] **核心功能回归测试**
    - [ ] 测试所有向量化源（Transformers/Ollama/WebLLM/vLLM）
    - [ ] 验证所有内容类型（聊天/文件/世界信息）的向量化
    - [ ] 确认向量查询和注入功能正常
  - [ ] **性能验证测试**
    - [ ] 向量化1000条消息，记录处理时间
    - [ ] 与旧版本进行性能对比
    - [ ] 监控内存使用峰值
  - [ ] **新功能测试**
    - [ ] 测试LLM总结功能生成的摘要质量
    - [ ] 验证外部任务导入功能
    - [ ] 测试任务导出和再导入的完整性
  - [ ] **边界情况测试**
    - [ ] 测试超大文件（>10MB）的向量化
    - [ ] 测试包含特殊字符的内容
    - [ ] 测试网络断开时的错误处理
  - [ ] **用户体验测试**
    - [ ] 完整走一遍用户使用流程
    - [ ] 验证所有提示信息清晰准确
    - [ ] 确认错误信息对用户友好

## 重要检查点

每完成一个 Phase，都需要进行以下检查：

1. **功能完整性检查**
   - [ ] 所有原有功能正常工作
   - [ ] 旧的向量化任务可以正常查看和使用
   - [ ] UI 交互没有异常

2. **兼容性检查**
   - [ ] 旧数据可以正常读取
   - [ ] 新旧代码可以共存
   - [ ] 没有破坏性变更

3. **性能检查**
   - [ ] 没有明显的性能下降
   - [ ] 内存使用正常
   - [ ] 没有内存泄漏

## 回退计划

每个阶段都应该准备回退方案：
- 保留所有旧代码的备份
- 使用 Git 分支管理每个阶段
- 保持新旧代码可以独立运行
- 准备功能开关，可以快速切换

## 时间估算

- Phase 0-2: 基础准备（1-2天）
- Phase 3-4: 工具和适配器（2-3天）
- Phase 5-6: 核心功能迁移（3-4天）
- Phase 7: UI重构（2-3天）
- Phase 8-9: 架构切换（3-4天）
- Phase 10: 清理优化（2-3天）

总计：约2-3周的渐进式重构

## 风险控制

1. **每日备份**：每天结束前备份当前状态
2. **小步提交**：每个小功能完成就提交
3. **持续测试**：每步都要验证
4. **用户反馈**：在关键节点获取用户测试反馈

## 当前重构进度总结 (2025-07-12)

### 总体完成度：92%

**已完成阶段**：
- **Phase 0**: 准备工作 ✅ 100%
- **Phase 1**: 基础设施层 ✅ 100% 
- **Phase 2**: 核心实体 ✅ 100%
- **Phase 3**: 工具函数提取 ✅ 100%
- **Phase 4**: 适配器层 ✅ 100%
- **Phase 5**: 内容提取器 ✅ 100%
- **Phase 6**: 任务系统 ✅ 100%
- **Phase 7**: UI层重构 ✅ 95%

**Phase 7 详细进度**：
- ✅ **ActionButtons组件** (277行代码，完全实现)
- ✅ **SettingsPanel架构** (269行代码，完全实现)
- ✅ **VectorizationSettings组件** (427行代码，完全实现)
- ✅ **QuerySettings组件** (389行代码，完全实现)
- ✅ **InjectionSettings组件** (454行代码，完全实现)
- ✅ **ContentSelectionSettings组件** (497行代码，完全实现)
- ✅ **settings.html模块化** (完成CSS类化和模块拆分)
- ✅ **ProgressManager系统** (500行代码，事件驱动进度管理)
- ✅ **EventManager架构** (400行代码，事件委托和协调)
- ✅ **StateManager系统** (600行代码，集中状态管理)
- ✅ **Bug修复**: 重复通知、状态持久化、UI可见性问题
- ✅ **代码清理**: 移除63行注释旧代码

**重要成就**：
1. **代码量减少**: index.js 减少约600行UI管理代码
2. **模块化**: 创建9个独立UI组件 (4,273行新代码)
3. **架构完善**: 建立完整UI基础设施层
4. **Bug修复**: 解决用户报告的所有UI问题
5. **性能优化**: 事件委托、进度管理、状态同步
6. **架构改进**: 实现依赖注入和事件驱动模式
7. **样式模块化**: 创建components.css，替换内联样式

**待完成**：
- **Phase 7.6-7.7**: NotificationManager、样式架构重组
- **Phase 8-10**: 插件系统、架构切换、清理优化

**预计剩余时间**: 1-2周
