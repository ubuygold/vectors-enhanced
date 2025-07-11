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

- [ ] **迁移设置初始化逻辑**
  - **涉及代码**: jQuery ready事件处理器中的大量 `$('#id').val().on(...)` 代码块（行3027-3723）。
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

- [ ] **迁移原生DOM操作**
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
  - **涉及函数**: `escapeHtml`（行4566-4574，在showTagExamples内部定义）
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

    ### Phase 3.5: 统一消息过滤逻辑 (新发现的技术债)

- **问题**: `getHiddenMessages` 函数（用于UI）与 `getVectorizableContent` 内的隐藏消息过滤逻辑（用于数据提取）存在功能重复。两者都依赖 `msg.is_system === true` 来判断，但实现方式不同，违反了DRY原则。
- **目标**: 创建一个统一的、可复用的消息工具函数模块，作为单一事实来源（Single Source of Truth）。
- **子任务**:
  - [ ] **创建 `src/utils/chatUtils.js`**: 创建一个新的工具模块。
  - [ ] **实现核心过滤函数**: 在 `chatUtils.js` 中实现一个核心的 `getMessages(options)` 函数。该函数应能根据传入的 `{ includeHidden, types, range }` 等选项，返回符合条件的消息数组。
  - [ ] **重构UI层**: 重构 `src/ui/components/MessageUI.js` 中的代码，移除内部的 `getHiddenMessages`，改为调用新的 `chatUtils.getMessages()`。
  - [ ] **重构数据提取层**: 重构 `getVectorizableContent` 和 `getRawContentForScanning`，移除内部的 `if` 判断，改为调用新的 `chatUtils.getMessages()`。
- **验证点**: 确保UI显示、内容提取和向量化功能在逻辑统一后表现完全一致。
- **执行时机**: 在完成所有 `Phase 3` 的UI工具函数迁移后，但在开始 `Phase 5` 内容提取器之前执行。

## Phase 4: 创建适配器层（包装现有功能）

### 4.1 存储适配器
- [ ] 创建 `src/infrastructure/storage/StorageAdapter.js`
  ```javascript
  class StorageAdapter {
    async getVectors() {
      // 调用原有的 loadVectorDB
      return await loadVectorDB();
    }
    async saveVectors(vectors) {
      // 调用原有的 saveVectorDB
      return await saveVectorDB(vectors);
    }
  }
  ```
- [ ] **验证点**：通过适配器读写向量数据

### 4.2 API 适配器（包装现有的向量化 API）
- [ ] 创建 `src/infrastructure/api/VectorizationAdapter.js`
- [ ] 为每种向量化源创建适配方法：
  - [ ] `vectorizeWithTransformers`
  - [ ] `vectorizeWithOllama`
  - [ ] `vectorizeWithVLLM`
  - [ ] `vectorizeWithWebLLM`
- [ ] **验证点**：通过适配器进行向量化，结果应该完全一致

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

## Phase 5: 内容提取器（逐步替换内容获取逻辑）

### 5.1 提取器接口
- [ ] 创建 `src/core/extractors/IContentExtractor.js`
  ```javascript
  class IContentExtractor {
    async extract(source) {
      throw new Error('Not implemented');
    }
  }
  ```

### 5.2 聊天消息提取器
- [ ] 创建 `src/core/extractors/ChatExtractor.js`
- [ ] 实现 `extract` 方法，内部调用原有的获取聊天消息逻辑
- [ ] 创建测试函数，比较新旧方式获取的内容是否一致
- [ ] **验证点**：提取的聊天内容与原方式完全一致

### 5.3 文件提取器
- [ ] 创建 `src/core/extractors/FileExtractor.js`
- [ ] 迁移文件内容获取逻辑
- [ ] **验证点**：文件内容提取正常

### 5.4 世界信息提取器
- [ ] 创建 `src/core/extractors/WorldInfoExtractor.js`
- [ ] 迁移世界信息获取逻辑
- [ ] **验证点**：世界信息提取正常

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

## Phase 6: 任务系统（与现有任务并行运行）

### 6.1 任务工厂
- [ ] 创建 `src/core/tasks/TaskFactory.js`
- [ ] 实现创建新格式任务的方法
- [ ] 实现从旧格式转换到新格式的方法
- [ ] **验证点**：能够创建任务，不影响现有功能

### 6.2 任务队列（新建，不替换现有队列）
- [ ] 创建 `src/application/TaskQueue.js`
- [ ] 实现基本的入队、出队功能
- [ ] 添加优先级支持
- [ ] **验证点**：队列操作正常，不影响现有任务

### 6.3 任务管理器（协调新旧系统）
- [ ] 创建 `src/application/TaskManager.js`
- [ ] 实现任务创建（同时创建新旧格式）
- [ ] 实现任务状态同步（新旧状态保持一致）
- [ ] **验证点**：创建任务时，新旧系统都能正常工作

### 🔍 功能完整性测试 - Phase 6
**测试时机**：完成任务系统后
- [ ] **任务管理功能测试**
  - [ ] **任务创建测试**
    - [ ] 创建一个新的向量化任务
    - [ ] 确认任务出现在任务列表中
    - [ ] 检查任务ID格式是否正确
  - [ ] **任务状态测试**
    - [ ] 观察任务从"待处理"到"处理中"到"完成"的状态变化
    - [ ] 确认进度百分比正确更新
    - [ ] 验证任务完成后的通知显示
  - [ ] **任务操作测试**
    - [ ] 测试取消正在进行的任务
    - [ ] 测试重试失败的任务
    - [ ] 验证任务优先级是否影响执行顺序
  - [ ] **并发控制测试**
    - [ ] 同时创建多个任务
    - [ ] 确认同时执行的任务数量符合设置
    - [ ] 验证任务队列正常工作

## Phase 7: UI 层重构（渐进式替换）

### 7.1 设置面板组件化
- [ ] 创建 `src/ui/components/SettingsPanel.js`
- [ ] 先创建一个包装现有 HTML 的组件
- [ ] 逐步将内联事件处理器迁移到组件中
- [ ] **验证点**：设置面板功能完全正常

### 7.2 任务列表组件
- [ ] 创建 `src/ui/components/TaskList.js`
- [ ] 同时显示新旧格式的任务
- [ ] 保持原有的UI更新逻辑
- [ ] **验证点**：任务显示正常

### 7.3 样式模块化
- [ ] 创建 `src/ui/styles/` 目录
- [ ] 将 style.css 拆分为多个模块：
  - [ ] `base.css` - 基础样式
  - [ ] `components.css` - 组件样式
  - [ ] `utilities.css` - 工具类
- [ ] 使用 CSS 变量替换硬编码的值
- [ ] **验证点**：UI 外观没有任何变化

### 🔍 功能完整性测试 - Phase 7
**测试时机**：完成UI组件重构后
- [ ] **UI交互功能测试**
  - [ ] **向量化触发测试**
    - [ ] 测试右键菜单向量化选项
    - [ ] 测试工具栏向量化按钮
    - [ ] 验证批量选择和向量化功能
  - [ ] **任务列表UI测试**
    - [ ] 检查任务列表的显示和更新
    - [ ] 测试任务详情展开/折叠
    - [ ] 验证任务操作按钮（取消/重试）的响应
  - [ ] **设置界面测试**
    - [ ] 测试所有设置项的修改和保存
    - [ ] 验证设置变更立即生效
    - [ ] 检查设置界面的标签页切换
  - [ ] **进度显示测试**
    - [ ] 验证进度条动画流畅性
    - [ ] 检查进度百分比准确性
    - [ ] 测试多任务进度的并行显示
  - [ ] **通知系统测试**
    - [ ] 测试成功/失败/警告通知的显示
    - [ ] 验证通知自动消失时间
    - [ ] 检查通知堆叠显示效果

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
