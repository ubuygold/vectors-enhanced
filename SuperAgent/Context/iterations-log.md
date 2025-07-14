# 项目迭代日志

---
## 迭代 #41
**开始时间**: 2025-07-14 14:30
**请求**: 为插件开发一个外挂任务的功能，可以外挂来自其他聊天的向量化任务并加入查询队列（不纳入去重）
**响应**: 我将开发外挂任务功能，允许从其他聊天导入向量化任务

### 操作 41.1
**时间**: 14:35
**描述**: 创建 ExternalVectorizationTask 类
**创建文件 `src/core/tasks/ExternalVectorizationTask.js`**:
- 继承自 VectorizationTask
- 支持跨聊天任务导入
- skipDeduplication 标志跳过去重
- 保留源聊天信息和任务ID
- 支持内容映射功能

### 操作 41.2
**时间**: 14:40
**描述**: 更新 TaskFactory 支持外挂任务类型
**修改文件 `src/core/tasks/TaskFactory.js`**:
- 导入 ExternalVectorizationTask
- 注册 'external-vectorization' 任务类型

### 操作 41.3
**时间**: 14:45
**描述**: 扩展 TaskManager 添加外挂任务管理功能
**修改文件 `src/application/TaskManager.js`**:
- 添加 importExternalTask 方法
- 添加 getExternalTasks 方法
- 添加 processExternalTask 方法
- 支持高优先级处理外挂任务

### 操作 41.4
**时间**: 14:50
**描述**: 修改向量化处理支持跳过去重
**修改文件 `index.js`**:
- performVectorization 添加 options 参数
- 支持 skipDeduplication 选项
- 传递选项到存储适配器

### 操作 41.5
**时间**: 14:55
**描述**: 更新 StorageAdapter 支持跳过去重选项
**修改文件 `src/infrastructure/storage/StorageAdapter.js`**:
- insertVectorItems 添加 options 参数
- 在请求体中包含 skipDeduplication 标志

### 操作 41.6
**时间**: 15:00
**描述**: 添加处理外挂任务的函数
**修改文件 `index.js`**:
- 添加 processExternalVectorizationTask 函数
- 处理外挂任务的特殊逻辑
- 更新任务状态和结果

### 操作 41.7
**时间**: 15:05
**描述**: 创建外挂任务UI组件
**创建文件 `src/ui/components/ExternalTaskUI.js`**:
- 管理外挂任务的导入和显示
- 支持从其他聊天选择任务
- 提供任务处理和删除功能
- 显示任务详情对话框

### 操作 41.8
**时间**: 15:10
**描述**: 在设置界面添加外挂任务管理区域
**修改文件 `settings-modular.html`**:
- 添加外挂任务管理折叠区域
- 包含导入按钮和任务列表容器

### 操作 41.9
**时间**: 15:15
**描述**: 添加外挂任务相关样式
**修改文件 `style.css`**:
- 外挂任务列表样式
- 任务状态颜色编码
- 导入对话框样式
- 任务详情对话框样式

### 操作 41.10
**时间**: 15:20
**描述**: 在 SettingsManager 中初始化外挂任务UI
**修改文件 `src/ui/settingsManager.js`**:
- 添加 initializeExternalTaskUI 方法
- 监听聊天切换事件
- 管理 ExternalTaskUI 生命周期

### 操作 41.11
**时间**: 15:25
**描述**: 暴露全局 TaskManager 实例
**修改文件 `index.js`**:
- 将 globalTaskManager 暴露到 window 对象
- 允许其他模块访问 TaskManager

### 操作 41.12
**时间**: 15:30
**描述**: 更新任务类型定义
**修改文件 `src/core/tasks/taskTypes.js`**:
- 添加 EXTERNAL_VECTORIZATION 类型
- 更新 getTypeDisplayName 函数

**结果**: 成功实现外挂任务功能，支持跨聊天任务导入和去重跳过

---
## 迭代 #2025-07-13-01
**开始时间**: 2025-07-13 15:30
**请求**: 实现智能任务命名功能，处理不连续楼层的任务名称显示问题
**响应**: 使用分层实现方案，创建核心命名逻辑并集成到任务系统和UI层

### 操作 1.1
**时间**: 15:35
**描述**: 创建核心任务命名工具类
**创建文件 `src/utils/taskNaming.js`**:
```javascript
export class TaskNameGenerator {
    static generateSmartName(items, settings) {
        // 智能任务名称生成
        // 1. 标签筛选优先
        // 2. 消息类型识别（用户/AI/混合）
        // 3. 间隔模式检测
        // 4. 长度控制
    }
}
```

**主要功能**:
- 标签筛选信息优先显示
- 自动识别消息类型模式（用户消息、AI消息、主要用户、主要AI）
- 检测间隔模式（如每隔2层）
- 智能压缩过长名称
- 处理空任务和复杂楼层分布

### 操作 1.2
**时间**: 15:40
**描述**: 在VectorizationTask中集成命名功能
**修改文件 `src/core/tasks/VectorizationTask.js`**:
- 导入TaskNameGenerator
- 添加generateSmartName()方法
- 添加updateName()方法
- 添加_constructItemsFromProcessed()辅助方法
- 支持从actualProcessedItems生成智能名称

### 操作 1.3
**时间**: 15:45
**描述**: 在TaskList UI组件中使用智能命名
**修改文件 `src/ui/components/TaskList.js`**:
- 导入TaskNameGenerator
- 在显示任务时判断是否有actualProcessedItems
- 使用智能命名替代原始任务名称
- 保留原始名称作为title提示

### 操作 1.4
**时间**: 15:50
**描述**: 测试任务命名功能
**测试场景**:
1. 仅用户消息: "用户消息 间隔2 (#1-#9, 5层)"
2. 仅AI消息: "AI消息 间隔2 (#0-#8, 5层)"
3. 混合消息: "#0-#4 (5层)"
4. 带标签筛选: "标签:content+system AI消息 间隔2 (#0-#4, 3层)"
5. 不连续楼层: "#0-#30 (7层)"
6. 大量楼层: "间隔2 (#0-#98, 50层)"
7. 长标签名称: "标签:very-lon.. (2层)"
8. 主要用户消息: "主要用户 (#1-#15, 10层)"

**测试结果**: 所有场景均正常工作，名称长度控制在40字符以内

### 总结
成功实现了智能任务命名功能，采用分层架构：
- 核心逻辑层：src/utils/taskNaming.js（纯函数，无依赖）
- 实体层：VectorizationTask集成命名方法
- UI层：TaskList使用智能命名显示

---
## 迭代 #2
**开始时间**: 2025-07-14 08:30
**请求**: 改进任务命名逻辑：不再判断是否是AI还是用户，直接显示楼层数（相邻的合并显示）、世界书条目数、文件数量；同时添加任务预览按钮
**响应**: 我将改进任务命名逻辑并添加任务预览功能

### 操作 2.1
**时间**: 08:31
**描述**: 分析现有实现并规划改进方案
**分析内容**:
- 任务命名逻辑在 src/utils/taskNaming.js
- TaskList组件在 src/ui/components/TaskList.js
- 预览功能参考 MessageUI.previewContent
- actualProcessedItems 包含 chat[], files[], world_info[] 数组

**实现方案**:
1. 修改 TaskNameGenerator 显示楼层范围、世界书条目数、文件数
2. 在 TaskList 添加预览按钮
3. 创建 previewTaskContent 方法专门预览任务内容

### 操作 2.2
**时间**: 08:35
**描述**: 重新实现 TaskNameGenerator
**修改文件 `src/utils/taskNaming.js`**:
- 移除 AI/用户类型分析逻辑 (_analyzeMessageTypes, _analyzeIntervalPattern)
- 新增 _getMergedRange 方法，合并相邻的楼层数字
- 重写 generateSmartName 方法:
  - 统计不同类型的项目数量
  - 单一来源时：显示类型和数量
  - 多个来源时：显示所有类型的数量

**显示格式**:
- 单一聊天："楼层 0-3, 5, 7-9 10条"
- 单一世界书："世界书 5条"
- 单一文件："文件 3个"
- 多来源："楼层10 世界书5 文件3"

### 操作 2.3
**时间**: 08:40
**描述**: 在 TaskList 添加预览按钮
**修改文件 `src/ui/components/TaskList.js`**:
- 导入 getContext 函数
- 在生成智能名称时添加文件和世界信息项
- 添加预览按钮（眼睛图标）
- 实现 previewTaskContent 函数：
  - 从 context 获取实际的聊天消息内容
  - 显示文件名称和URL
  - 显示世界信息条目的UID
  - 使用与MessageUI类似的弹窗格式

### 操作 2.4
**时间**: 08:45
**描述**: 测试新功能
**测试项目**:
1. 任务名称显示:
   - 楼层0-5连续: "楼层 0-5 6条"
   - 楼层0,2,4,7-9: "楼层 0, 2, 4, 7-9 6条"
   - 仅世界书: "世界书 10条"
   - 仅文件: "文件 5个"
   - 混合: "楼层15 世界书8 文件2"
2. 预览按钮:
   - 显示任务实际处理的内容
   - 按类型分组显示
   - 聊天消息显示完整内容

### 总结
成功实现了改进的任务命名和预览功能：
- 更简洁的命名格式，移除了AI/用户判断
- 支持显示多种内容来源
- 新增任务预览功能，只显示任务包含的内容

### 操作 2.5
**时间**: 08:50
**描述**: 修复导入错误
**问题**: `getContext` 从错误的模块导入导致插件无法加载
**修改文件 `src/ui/components/TaskList.js`**:
- 将 `getContext` 从 `extensions.js` 导入而非 `script.js`
- 修复了模块导入路径错误

### 操作 2.6
**时间**: 08:55
**描述**: 修复任务预览布局问题
**问题**: 任务预览框宽度不稳定，只有一项内容时会挤在左侧
**修改文件 `src/ui/components/TaskList.js`**:
- 完全复制全局预览的布局结构
- 始终显示三个部分（文件、世界信息、聊天记录）
- 使用CSS Grid的3列布局
- 空内容时显示"无XX"提示
- 确保布局稱定且居中显示

### 操作 2.7
**时间**: 09:00
**描述**: 修复任务预览数据获取问题
**问题**: 世界书名称显示未知，条目显示UID而非comment，文件名获取不正确
**修改文件 `src/ui/components/TaskList.js`**:
- 导入 getSortedEntries 从 world-info.js
- 导入 getDataBankAttachments 等函数从 chats.js
- 复制 getAllAvailableFiles 函数从 index.js
- 使用正确的API获取世界书条目信息（world、comment等）
- 使用文件Map获取正确的文件名和大小
- 按世界书名称分组显示条目

### 操作 2.8
**时间**: 09:10
**描述**: 添加预览内容切换功能
**功能需求**: 在预览界面添加切换按钮，显示标签筛选后但参数替换前的内容
**修改文件**:
1. `src/ui/components/MessageUI.js`:
   - 添加切换按钮“显示原始内容（标签筛选后）”
   - 重新获取未经参数替换的文本
   - 使用extractTagContent获取标签筛选后的原始内容
   - 添加jQuery切换逻辑

2. `src/ui/components/TaskList.js`:
   - 添加同样的切换按钮
   - 存储rawText作为原始文本
   - 添加切换显示逻辑

**目的**: 帮助用户发现标签配置错误，尤其是HTML注释未被正确排除的情况

### 操作 2.9
**时间**: 09:15
**描述**: 修复原始内容显示问题
**问题**: 切换到原始内容时，HTML标签仍被浏览器渲染（如`<details>`变成折叠元素）
**修改文件**:
1. `src/ui/components/MessageUI.js`:
   - 对原始文本进行HTML转义
   - 将`<`、`>`等特殊字符转换为HTML实体
   - 使用`<pre>`标签保留格式
   - 确保原始内容以纯文本形式显示

2. `src/ui/components/TaskList.js`:
   - 同样对任务预览中的原始内容进行转义
   - 保持与全局预览一致的处理方式

**解决方案**: 通过HTML转义确保标签以纯文本形式显示，不被浏览器解析

### 操作 2.10
**时间**: 09:20
**描述**: 添加用户偏好记忆和快捷键功能
**改进内容**:
1. **记住用户选择**:
   - 使用localStorage保存用户的显示偏好
   - 下次打开预览时自动应用上次的选择
   - 初始状态根据保存的偏好显示

2. **快捷键支持**:
   - 按R键快速切换显示模式
   - 在复选框旁添加键盘提示
   - 弹窗关闭时清理事件监听器

**修改文件**:
- `src/ui/components/MessageUI.js`
- `src/ui/components/TaskList.js`

**用户体验**: 用户不需要每次都重新选择显示模式，系统会记住他们的偏好

### 操作 2.11
**时间**: 09:30
**描述**: 重新设计切换功能为单消息切换
**原因**: 之前的全局切换和记忆功能未生效
**新设计**:
1. **移除全局切换**:
   - 删除顶部的复选框
   - 删除localStorage记忆
   - 删除快捷键功能

2. **单消息切换**:
   - 每个聊天消息下方添加切换按钮
   - 使用左右箭头指示切换方向
   - 同时存储处理后和原始内容
   - 点击按钮在两种显示之间切换

**优点**:
- 更直观的交互
- 避免复杂的状态管理
- 用户可以选择性地查看特定消息的原始内容

### 操作 2.12
**时间**: 09:35
**描述**: 简化切换实现，使用外部勾选框控制
**原因**: SillyTavern弹窗不支持复杂DOM操作
**新实现**:
1. **删除弹窗内切换按钮**:
   - 移除所有复杂的切换按钮和事件
   - 移除多版本内容存储

2. **在设置界面添加勾选框**:
   - 在Action Buttons上方添加勾选框
   - 标签：“预览时显示原始内容（标签筛选后）”

3. **修改预览函数**:
   - MessageUI.previewContent新增 showRawContent 参数
   - 根据参数决定显示处理后或原始内容
   - ActionButtons检查勾选框状态并传递参数

**修改文件**:
- `settings-modular.html`: 添加勾选框
- `src/ui/components/ActionButtons.js`: 检查勾选框状态
- `src/ui/components/MessageUI.js`: 支持showRawContent参数
- `src/ui/components/TaskList.js`: 同样支持原始内容显示

该方案解决了不连续楼层的显示问题，提供了更有意义的任务名称，同时保持了代码的模块化和可维护性。

---
## 迭代 #3
**开始时间**: 2025-07-14 15:15
**请求**: 改进任务命名格式：楼层数字前加#，世界书后加"条目"，文件后加"个"
**响应**: 我将改进任务命名的显示格式

### 操作 3.1
**时间**: 15:16
**描述**: 改进任务命名格式
**修改文件 `src/utils/taskNaming.js`**:
- 楼层范围显示改为 `楼层 #${range}` (单一来源时)
- 世界书显示改为 `世界书 ${count}条目`
- 文件显示保持 `文件 ${count}个`
- 多来源时世界书显示为 `世界书${count}条目`

**修改前**: "楼层 0-3 5条", "世界书 5条", "楼层10 世界书5"
**修改后**: "楼层 #0-3 5条", "世界书 5条目", "楼层10条 世界书5条目"

### 操作 3.2
**时间**: 15:17
**描述**: 调整多来源时的显示顺序
**修改文件 `src/utils/taskNaming.js`**:
- 多来源时改为：`${count}层楼`, `${count}条世界书`, `${count}个文件`
- 显示顺序：楼层 → 世界书 → 文件

**修改前**: "楼层10条 世界书5条目 文件3个"
**修改后**: "10层楼 5条世界书 3个文件"

### 操作 3.3
**时间**: 15:20
**描述**: 在预览界面的聊天记录框开头添加楼层信息
**修改文件**:
1. `src/ui/components/MessageUI.js`:
   - 在聊天记录标题中添加楼层信息显示
   - 新增 _identifyContinuousSegments 和 _formatSegment 方法
   - 显示格式："聊天记录（x条消息） - 包含楼层：0-3, 5, 7-9"

2. `src/ui/components/TaskList.js`:
   - 同样在任务预览的聊天记录标题中添加楼层信息
   - 新增 identifyContinuousSegments 和 formatSegment 函数
   - 与全局预览保持一致的显示格式

### 操作 3.4
**时间**: 15:22
**描述**: 将楼层信息从标题移到正文内容中
**修改文件**:
1. `src/ui/components/MessageUI.js`:
   - 将楼层信息从标题移到聊天记录内容的开头
   - 使用带背景色的信息框显示楼层信息
   - 样式：蓝色背景，白色文字，圆角边框

2. `src/ui/components/TaskList.js`:
   - 同样将楼层信息移到内容开头
   - 保持与全局预览一致的样式

### 操作 3.5
**时间**: 15:24
**描述**: 调整楼层信息的显示样式
**修改文件**:
1. `src/ui/components/MessageUI.js`:
   - 移除背景色和特殊样式
   - "包含楼层："使用强调色（var(--SmartThemeQuoteColor)）
   - 楼层数字使用正常字体颜色

2. `src/ui/components/TaskList.js`:
   - 同样调整样式，保持一致

**显示效果**: 简洁的楼层信息显示，只有标签用强调色

### 操作 3.6
**时间**: 15:26
**描述**: 为"内容选择"和"向量化任务"大块添加折叠功能
**修改文件 `settings-modular.html`**:
- 将"内容选择"部分用`<details>`和`<summary>`标签包装
- 将"向量化任务"部分同样添加折叠功能
- 与其他设置区块保持一致的折叠样式

### 操作 3.7
**时间**: 15:28
**描述**: 修复折叠层级问题
**修改文件 `settings-modular.html`**:
- 修复内容选择区块的details标签层级
- 确保向量化任务和Action Buttons正确包含在主要的inline-drawer-content中
- 删除多余的结束标签

**问题**: 向量化任务和Action Buttons在插件折叠时仍然显示
**解决**: 正确嵌套HTML结构，确保所有内容都在主折叠区域内

### 操作 3.8
**时间**: 15:30
**描述**: 修改插件默认设置
**修改文件 `index.js`**:
- 将重叠百分比(overlap_percent)从10改为0
- 确认rerank_enabled默认为false（已经是正确的）

**设置位置**: index.js第113行和第126行
**目的**: 提供更合理的默认配置，减少文本块重叠，rerank功能按需启用

### 操作 3.9
**时间**: 15:35
**描述**: 创建全面测试用例文档
**创建文件 `SuperAgent/comprehensive-test-cases.md`**:
- 编写了17个主要测试类别，涵盖所有功能模块
- 包含核心功能、UI/UX、边界条件、异常处理等测试
- 按照"工程师去酒吧点炒饭"的思路考虑所有边界情况
- 提供测试优先级分级（P0-P3）和测试报告模板

**测试覆盖范围**:
- 主开关控制、向量化源配置、内容选择
- 预览功能、任务管理、向量化过程
- Rerank功能、注入设置、导出功能
- UI交互、兼容性、极端数据、并发操作
- 网络异常、内存性能、回归测试

**目的**: 确保现代化重构后的插件架构稳定可靠，无明显bug

**改进**: 用户可以折叠不常用的大块设置，使界面更简洁

**目的**: 让用户在预览界面中清楚看到包含了哪些楼层的聊天记录

### 总结
成功改进了任务命名格式，使其更加清晰易读：
- 楼层数字前加#符号便于识别
- 世界书后加"条目"量词更准确
- 保持文件的"个"量词
- 多来源时按照 x层楼 x条世界书 x个文件 的顺序显示
- 预览界面显示完整的包含楼层信息

---
## 迭代 #4
**开始时间**: 2025-07-14 10:00
**请求**: 在当前项目中搜索与向量化任务、查询队列、去重相关的核心文件，特别是包含task、queue、vector、embedding等关键词的文件
**响应**: 提供详细的核心文件列表和功能分析

### 操作 4.1
**时间**: 10:05
**描述**: 搜索项目中的相关文件
**使用工具**: Glob和Grep
**搜索模式**: 
- `**/*{task,queue,vector,embedding}*.{js,ts,jsx,tsx}`
- `dedup|duplicate|hash|checksum|fingerprint`

**找到的核心文件**:
- 任务系统：TaskQueue.js, VectorizationTask.js, TaskManager.js等
- 向量化处理：VectorizationProcessor.js, VectorizationAdapter.js
- 去重相关：hash.js, 以及多个文件中的去重逻辑

### 操作 4.2
**时间**: 10:10
**描述**: 分析核心文件功能
**读取并分析的文件**:
1. `src/application/TaskQueue.js`:
   - 轻量级任务队列实现
   - 单任务并发控制
   - 优先级排序支持
   - AbortController集成

2. `src/core/tasks/VectorizationTask.js`:
   - 向量化任务实现类
   - 维护向后兼容性
   - actualProcessedItems精确追踪
   - 智能任务命名集成

3. `src/utils/hash.js`:
   - getStringHash函数实现
   - 双重哈希算法
   - 支持种子参数

4. `src/application/TaskManager.js`:
   - 新旧任务系统协调
   - Map结构实现任务去重
   - 缓存机制优化性能
   - 双写模式兼容性

5. `src/core/pipeline/processors/VectorizationProcessor.js`:
   - 文本处理管道包装器
   - 智能文本分块
   - generateHash方法
   - 批量处理支持

### 操作 4.3
**时间**: 10:15
**描述**: 分析去重机制
**关键发现**:
1. **文本内容去重**:
   - index.js中的hashCache Map缓存
   - getHashValue函数带缓存机制
   - 向量存储前检查已存在哈希

2. **任务去重**:
   - TaskManager第132-144行使用Map避免重复
   - 新任务覆盖同ID旧任务

3. **文件去重**:
   - FileList组件按URL去重
   - Map结构确保唯一性

### 操作 4.4
**时间**: 10:20
**描述**: 更新项目架构文档
**修改文件**: `SuperAgent/Context/project-architecture.md`
**添加内容**:
- 核心功能模块详解章节
- 向量化任务系统详细说明
- 去重机制完整分析
- 向量化处理管道说明

### 总结
成功梳理了向量化任务、查询队列和去重相关的核心文件：
1. **任务系统**: TaskQueue、TaskManager、VectorizationTask提供完整的任务管理
2. **去重机制**: 多层去重确保数据唯一性（文本哈希、任务ID、文件URL）
3. **向量化处理**: VectorizationProcessor和VectorizationAdapter提供统一接口
4. **队列控制**: 单任务并发避免资源竞争，优先级排序优化执行顺序