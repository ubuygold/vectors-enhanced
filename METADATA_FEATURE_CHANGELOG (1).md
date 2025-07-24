# Vectors Enhanced 插件技术更新详解：高级元数据系统

## 1. 概述

本次更新旨在为 `vectors-enhanced` 插件集成一个高级元数据系统，使其具备与外部Python脚本类似的、在向量化时动态附加上下文信息的能力。此更新通过修改UI、CSS和核心JavaScript逻辑，引入了**静态自定义元数据**和**动态章节元数据提取**两大核心功能。

以下是本次更新涉及的文件和改动摘要：

-   **`settings-modular.html`**: 新增了两个UI区域，分别用于管理静态元数据规则和动态章节提取设置。
-   **`style.css`**: 添加了配套的CSS样式，以确保新UI元素的美观和功能性。
-   **`index.js`**: 实现了所有后端逻辑，包括设置管理、UI事件绑定、以及在向量化流程中注入两种元数据的核心算法。

---

## 2. 文件改动详解

### 2.1. `settings-modular.html` - UI层更新

在“向量化设置” (`id="vectors_enhanced_vectorization_settings"`) 内部，我们添加了两个新的 `<div>` 区域。

#### a) 动态章节元数据提取 UI

-   **位置**: 紧跟在“自定义块分隔符”输入框之后。
-   **结构**:
    -   使用 `<details>` 和 `<summary>` 创建了一个名为 **“章节元数据提取”** 的可折叠区域。
    -   内部包含一个ID为 `vectors_enhanced_chapter_metadata_enabled` 的复选框，用于启用/禁用此功能。
    -   一个ID为 `vectors_enhanced_chapter_metadata_options` 的 `<div>`，默认隐藏，当复选框被勾选时显示。此 `<div>` 包含：
        -   一个ID为 `vectors_enhanced_chapter_metadata_regex` 的文本输入框，用于用户输入或修改匹配章节标题的正则表达式。
        -   一段说明文字，解释了该功能的目的和适用范围（仅限文件）。

#### b) 静态自定义元数据 UI

-   **位置**: 紧跟在新增的“章节元数据提取”区域之后。
-   **结构**:
    -   同样使用 `<details>` 和 `<summary>` 创建了一个名为 **“自定义元数据”** 的可折叠区域。
    -   一个ID为 `vectors_enhanced_custom_metadata_editor` 的 `<div>`，作为动态生成元数据规则的容器。
    -   一个ID为 `vectors_enhanced_add_metadata_rule` 的按钮，用于添加新的元数据键值对输入行。

### 2.2. `style.css` - 样式层更新

为确保新UI的显示效果，我们在 `style.css` 文件末尾追加了新的CSS规则，主要针对静态自定义元数据编辑器：

-   `.metadata-rule`: 定义了每一行元数据规则的Flexbox布局，使其内部的两个输入框和一个删除按钮能够水平对齐。
-   `.metadata-rule input`: 设置输入框在Flex容器中自动伸展以填充可用空间。
-   `.delete-metadata-rule`: 确保删除按钮的尺寸固定，不会被压缩。

### 2.3. `index.js` - 核心逻辑层更新

这是本次更新的核心，所有功能逻辑都在此文件中实现。

#### a) 全局设置扩展

在文件顶部的 `settings` 全局对象中，新增了以下属性以存储新功能的配置：

```javascript
const settings = {
  // ... 其他设置
  custom_metadata: [], // 用于存储静态元数据规则的数组
  chapter_metadata_enabled: false, // 动态章节提取的启用开关
  chapter_metadata_regex: '第(\\s*\\d+|一|二|三|四|五|六|七|八|九|十|百|千|万)\\s*章.*', // 默认正则表达式
  // ... 其他设置
};
```

#### b) 静态元数据功能实现

1.  **UI渲染函数 `renderCustomMetadataEditor()`**:
    -   此新函数负责根据 `settings.custom_metadata` 数组的内容，动态地在 `#vectors_enhanced_custom_metadata_editor` 容器中创建、更新或删除元数据输入行。
    -   它为每个输入框绑定了 `input` 事件，当用户输入时，会实时更新 `settings` 对象并调用 `saveSettingsDebounced()` 进行防抖保存。
    -   它为每个删除按钮绑定了 `click` 事件，用于从 `settings.custom_metadata` 数组中移除对应的规则，并重新渲染UI。

2.  **添加规则函数 `addMetadataRule()`**:
    -   此新函数用于响应“添加元数据”按钮的点击事件。
    -   它向 `settings.custom_metadata` 数组中推送一个空的 `{ key: '', value: '' }` 对象，然后调用 `renderCustomMetadataEditor()` 来刷新UI，显示出新的一行输入框。

3.  **向量化流程集成**:
    -   在核心函数 `performVectorization` 的内部，我们增加了一段逻辑，用于在处理文本之前，先将 `settings.custom_metadata` 数组转换成一个简单的键值对对象 `customMetadata`。
    -   在后续的数据块（chunk）创建过程中，这个 `customMetadata` 对象通过展开语法 (`...customMetadata`) 被合并到每个数据块的 `metadata` 字段中，从而实现了静态元数据的注入。

#### c) 动态章节元数据功能实现

1.  **章节定位辅助函数 `getChapterForChunk()`**:
    -   这是一个全新的辅助函数，其算法逻辑与您的 `vectorize_novel.py` 脚本高度一致。
    -   它接收三个参数：数据块文本、文件全文、以及一个预先构建好的“章节地图”（`chapterMap`）。
    -   通过 `fullText.indexOf(chunkText)` 找到数据块在全文中的起始位置，然后倒序遍历 `chapterMap`，找到最后一个在数据块之前出现的章节标题，并将其返回。

2.  **向量化流程改造**:
    -   对 `performVectorization` 函数的**起始部分**进行了关键改造，增加了一个**预处理阶段**。
    -   **检查与准备**: 流程开始时，会检查 `settings.chapter_metadata_enabled` 是否为 `true`。
    -   **构建章节地图**: 如果启用，它会遍历所有类型为 `file` 的待处理项。对于每个文件，它会使用 `settings.chapter_metadata_regex` 正则表达式来查找所有章节标题，并构建一个 `chapterMap`（一个`Map`对象，键是章节标题在文中的起始索引，值是章节标题本身）。
    -   **重新分块与注入**: 插件会使用 `splitTextIntoChunks` 函数将文件全文分割成数据块。然后，它会遍历这些新生成的数据块，为每一个块调用 `getChapterForChunk()` 函数来获取其所属的章节。获取到的章节名会被存入该数据块的 `metadata.chapter` 字段。
    -   **替换数据源**: 经过这个预处理流程后，原始的、代表整个文件的 `item` 对象会被替换为一组新的、代表各个带有章节元数据的数据块的 `item` 对象。这些新的 `item` 对象随后会进入后续的向量化处理流程。

#### d) UI事件绑定与初始化

在文件末尾的 `jQuery(async () => { ... })` 初始化函数中：

1.  **确保设置存在**: 增加了检查逻辑，确保 `custom_metadata` 和 `chapter_metadata` 相关设置在旧版配置文件中也能够被安全地初始化，避免出错。
2.  **绑定事件**:
    -   为 `#vectors_enhanced_add_metadata_rule` 按钮绑定了 `click` 事件，指向 `addMetadataRule` 函数。
    -   为 `#vectors_enhanced_chapter_metadata_enabled` 复选框绑定了 `change` 事件，用于切换功能开关、显示/隐藏正则表达式输入框，并保存设置。
    -   为 `#vectors_enhanced_chapter_metadata_regex` 输入框绑定了 `input` 事件，用于实时保存用户对正则表达式的修改。
3.  **初始化UI状态**:
    -   调用 `renderCustomMetadataEditor()` 来首次渲染静态元数据编辑器。
    -   根据 `settings.chapter_metadata_enabled` 的当前值，决定是否显示章节提取的详细选项。
