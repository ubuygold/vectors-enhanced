# 项目架构

## 文件结构
```
vectors-enhanced/
├── index.js              # 主入口文件 (5000+行，UI逻辑逐步迁移至 src/ui/ 模块)
├── webllm.js            # WebLLM 引擎适配器
├── settings.html        # 设置界面 (500+行，待模块化)
├── style.css            # 样式文件 (待优化)
├── manifest.json        # 扩展配置文件
├── package.json         # Node.js 项目配置 (新增)
├── webpack.config.js    # Webpack 构建配置 (新增)
├── .gitignore          # Git 忽略文件 (更新)
├── src/                 # 重构后的源代码目录 (新增)
│   ├── README.md        # 源代码目录说明
│   ├── index.js        # 模块化入口文件 (新增)
│   ├── core/           # 核心业务逻辑
│   │   └── entities/   # 实体类定义
│   │       └── README.md
│   ├── infrastructure/ # 基础设施层
│   │   ├── events/    # 事件系统
│   │   │   └── README.md
│   │   ├── storage/   # 存储适配器
│   │   │   └── StorageAdapter.js  # 封装所有向量存储API调用 (新增)
│   │   └── api/       # API适配器
│   │       └── VectorizationAdapter.js  # 封装所有向量化源的调用 (新增)
│   ├── utils/         # 工具函数
│   │   ├── hash.js      # 哈希计算工具 (新增)
│   │   ├── textChunking.js  # 文本分块工具 (新增)
│   │   ├── contentFilter.js  # 内容过滤工具 (新增)
│   │   ├── tagExtractor.js  # 标签提取核心模块 (新增)
│   │   ├── tagScanner.js  # 标签扫描模块 (新增)
│   │   ├── tagParser.js   # 标签解析工具 (新增)
│   │   ├── chatUtils.js   # 聊天消息统一过滤工具 (新增)
│   │   └── README.md
│   ├── ui/            # UI相关模块 (新增)
│   │   ├── domUtils.js  # DOM操作工具 (新增，包含文件下载等原生DOM操作)
│   │   ├── settingsManager.js  # 设置管理器 (新增，集中管理所有设置UI初始化)
│   │   └── components/  # 可复用UI组件 (新增)
│   │       ├── ChatSettings.js      # 聊天设置UI组件 (新增)
│   │       ├── TagRulesEditor.js    # 标签规则编辑器UI组件 (新增)
│   │       ├── TaskList.js          # 任务列表UI组件 (新增)
│   │       ├── FileList.js          # 文件列表UI组件 (新增)
│   │       ├── WorldInfoList.js     # 世界信息列表UI组件 (新增)
│   │       ├── TagUI.js             # 标签相关UI逻辑管理 (新增)
│   │       ├── MessageUI.js         # 消息相关UI逻辑管理 (新增)
│   │       └── README.md
│   ├── legacy/        # 将被重构的旧代码
│   │   └── README.md
│   ├── build-setup-plan.md  # 构建环境设置计划 (新增)
│   └── refactoring-progress.md  # 重构进度报告 (新增)
├── debug/               # 调试工具目录
│   ├── debugger.js
│   ├── ui-manager.js
│   ├── analyzers/       # 分析工具
│   ├── templates/       # UI模板
│   └── tools/          # 辅助工具
└── SuperAgent/         # 项目管理目录
    ├── tech-structure.md
    ├── project-brief.md
    └── Context/
        ├── project-architecture.md
        └── iterations-log.md
```

## 依赖关系图
```
当前架构（高度耦合）：
index.js
├──> jQuery (全局依赖)
├──> SillyTavern API (getContext, eventSource等)
├──> 向量化引擎
│    ├──> Transformers.js
│    ├──> Ollama API
│    ├──> vLLM API
│    └──> WebLLM (webllm.js)
├──> UI组件 (settings.html)
│    └──> src/ui/components/TagUI.js
├──> 样式 (style.css)
└──> 调试工具 (debug/*)

目标架构（分层解耦）：
见 refactoring-architecture.md
```

## 模块描述

### 核心模块（当前在index.js中混合）
1. **设置管理**
   - 扩展设置的读写
   - UI设置项的同步
   - 默认值管理

2. **内容提取**
   - 聊天消息提取
   - 文件内容获取
   - 世界信息读取

3. **向量化处理**
   - 向量化任务创建
   - 多引擎适配
   - 批量处理逻辑

4. **任务管理**
   - 任务队列维护
   - 并发控制
   - 进度跟踪

5. **向量存储**
   - 向量数据库CRUD
   - 数据持久化
   - 导入导出功能

6. **内容注入**
   - 相似度匹配
   - 注入位置计算
   - 标签系统

7. **UI交互**
   - 设置面板
   - 任务列表
   - 进度显示
   - 通知系统

### UI 模块 (新增)
- **src/ui/domUtils.js**: 封装所有DOM操作，旨在将UI逻辑与业务逻辑分离。目前已包含：
  - 基础UI状态管理：`updateContentSelection`, `updateMasterSwitchState`, `toggleSettings`
  - 进度显示：`hideProgress`, `updateProgress`
  - 文件操作：`triggerDownload` (封装了原生DOM文件下载逻辑)
- **src/ui/settingsManager.js**: 集中管理所有设置相关的UI初始化和事件处理
  - 从 index.js 的 jQuery ready 处理器中提取了约373行设置初始化代码
  - 使用 SettingsManager 类组织所有设置的初始化逻辑
  - 通过 ConfigManager 处理设置的持久化
- **src/ui/components/**: 存放可复用的UI组件。
  - **MessageUI.js**: 管理与消息显示相关的UI逻辑，如隐藏消息提示、内容预览弹窗等。
  - **ChatSettings.js**: 聊天设置UI组件
  - **TagRulesEditor.js**: 标签规则编辑器UI组件
  - **TaskList.js**: 任务列表UI组件
  - **FileList.js**: 文件列表UI组件
  - **WorldInfoList.js**: 世界信息列表UI组件
  - **TagUI.js**: 标签相关UI逻辑管理

### 辅助模块
- **webllm.js**: WebLLM引擎的简单封装
- **debug/**: 开发调试工具集
- **src/utils/tagScanner.js**: 包含 `scanTextForTags` 函数，负责在UI中扫描和识别文本中的标签，以便进行高亮或其他界面操作。
- **src/utils/tagParser.js**: 提供解析标签配置的工具函数，特别是处理带有排除规则的复杂标签字符串（例如 "include,tags - exclude,tags"）。
- **src/utils/chatUtils.js**: 统一的消息过滤工具，提供 `getMessages` 等函数，消除了之前在 UI 和数据处理层的重复逻辑。
- **src/infrastructure/storage/StorageAdapter.js**: 存储适配器，封装所有向量存储相关的 API 调用，使用依赖注入模式避免循环引用。
- **src/infrastructure/api/VectorizationAdapter.js**: 向量化 API 适配器，统一封装所有向量化源（Transformers、Ollama、vLLM、WebLLM、OpenAI、Cohere）的调用接口。

## 待解决的架构问题
1. **单一职责违反**: index.js承担了过多职责
2. **高耦合度**: UI与业务逻辑严重耦合
3. **扩展困难**: 添加新功能需要修改核心代码
4. **测试困难**: 无法进行单元测试
5. **代码重复**: 多处存在相似逻辑
6. **消息过滤逻辑不一致**: 存在多处重复的消息过滤逻辑需要统一

## 发现的代码问题

### 消息过滤逻辑重复
发现以下几处消息过滤相关的代码存在重复和不一致：

1. **getHiddenMessages** (MessageUI.js:11-28)
   - 位置：`src/ui/components/MessageUI.js`
   - 逻辑：过滤 `msg.is_system === true` 的消息
   - 用途：显示隐藏消息的UI功能

2. **getVectorizableContent** (index.js:379-565)
   - 位置：`index.js`
   - 逻辑：根据 `msg.is_system === true && !chatSettings.include_hidden` 过滤
   - 特殊处理：首楼（index === 0）或用户楼层（msg.is_user === true）不应用标签提取规则
   - 用途：获取可向量化的内容

3. **getRawContentForScanning** (index.js)
   - 位置：`index.js`
   - 逻辑：与 getVectorizableContent 相似，但绕过标签提取规则
   - 过滤：`msg.is_system === true && !chatSettings.include_hidden`
   - 用途：扫描原始内容

### 建议的重构方案
1. 创建统一的消息过滤器模块 `src/utils/messageFilter.js`
2. 定义一致的过滤规则接口
3. 将所有消息过滤逻辑集中管理
4. 确保所有地方使用相同的过滤逻辑
