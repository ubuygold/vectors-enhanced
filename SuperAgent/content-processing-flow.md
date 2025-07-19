# 内容处理流程图

```mermaid
graph TD
    Start([用户触发操作]) --> ContentSelect{内容选择}
    
    ContentSelect --> |聊天消息| ChatExtract[ChatExtractor<br/>提取聊天消息]
    ContentSelect --> |文件| FileExtract[FileExtractor<br/>提取文件内容]
    ContentSelect --> |世界信息| WorldExtract[WorldInfoExtractor<br/>提取世界信息]
    
    ChatExtract --> Filter[内容过滤<br/>- 标签规则<br/>- 黑名单<br/>- 范围限制]
    FileExtract --> Filter
    WorldExtract --> Filter
    
    Filter --> ProcessDecision{处理决策}
    
    ProcessDecision --> |仅向量化| VectorPath[向量化路径]
    ProcessDecision --> |仅总结| SummaryPath[总结路径]
    ProcessDecision --> |向量化+总结| BothPath[并行处理]
    
    %% 向量化路径
    VectorPath --> ChunkText[文本分块<br/>- 块大小<br/>- 重叠设置]
    ChunkText --> HashGen[生成哈希<br/>去重检查]
    HashGen --> VectorAPI[调用向量化API<br/>- Transformers<br/>- Ollama<br/>- vLLM<br/>- WebLLM<br/>- OpenAI<br/>- Cohere]
    VectorAPI --> StoreVector[存储向量<br/>StorageAdapter]
    
    %% 总结路径
    SummaryPath --> MemoryService[MemoryService<br/>记忆管理]
    MemoryService --> SummaryAPI[调用AI API<br/>- Google Gemini<br/>- OpenAI兼容]
    SummaryAPI --> CreateMemory[创建记忆条目]
    CreateMemory --> WorldBook{自动创建<br/>世界书?}
    WorldBook --> |是| CreateWB[创建世界书条目<br/>chat lore绑定]
    WorldBook --> |否| SaveMemory[保存记忆]
    CreateWB --> SaveMemory
    
    %% 并行处理路径
    BothPath --> |并行1| ChunkText
    BothPath --> |并行2| MemoryService
    
    %% 自动总结流程
    AutoTrigger([自动总结触发<br/>每N层消息]) --> CheckEnabled{检查自动总结<br/>是否启用}
    CheckEnabled --> |是| AutoSummary[提取最近M层消息]
    CheckEnabled --> |否| End2([结束])
    AutoSummary --> MemoryService
    SaveMemory --> HideFloors{隐藏已总结<br/>楼层?}
    HideFloors --> |是| HideMessages[隐藏原始消息]
    HideFloors --> |否| Complete
    
    %% 任务保存
    StoreVector --> SaveTask[保存向量化任务<br/>- 任务ID<br/>- 配置<br/>- 时间戳]
    SaveTask --> Complete[完成]
    HideMessages --> Complete
    
    %% 查询使用流程
    QueryStart([查询触发]) --> LoadTasks[加载启用的任务]
    LoadTasks --> CheckExternal{包含外挂任务?}
    CheckExternal --> |是| ResolveRef[解析任务引用<br/>TaskReferenceResolver]
    CheckExternal --> |否| QueryVector
    ResolveRef --> QueryVector[向量查询<br/>EnhancedQuerySystem]
    QueryVector --> CheckRerank{Rerank启用?}
    CheckRerank --> |是| RerankAPI[调用Rerank API<br/>重新排序结果]
    CheckRerank --> |否| InjectResults
    RerankAPI --> InjectResults[注入查询结果<br/>到聊天上下文]
    InjectResults --> ShowNotify{显示通知?}
    ShowNotify --> |是| Notify[显示查询结果通知]
    ShowNotify --> |否| End([结束])
    Notify --> End
    
    Complete --> End2
    
    style Start fill:#e1f5e1
    style End fill:#ffe1e1
    style End2 fill:#ffe1e1
    style VectorAPI fill:#e1e1ff
    style SummaryAPI fill:#e1e1ff
    style RerankAPI fill:#e1e1ff
    style MemoryService fill:#fff5e1
    style EnhancedQuerySystem fill:#fff5e1
```

## 流程说明

### 1. 内容提取阶段
- 用户可选择聊天消息、文件或世界信息
- 每种内容类型有专门的提取器处理
- 所有内容都经过统一的过滤处理

### 2. 处理决策
系统根据用户选择决定处理路径：
- **仅向量化**：用于构建可搜索的知识库
- **仅总结**：用于生成记忆和压缩内容
- **并行处理**：同时进行向量化和总结

### 3. 向量化流程
1. 文本分块（根据chunk_size和overlap设置）
2. 生成哈希值用于去重
3. 调用选定的向量化API
4. 存储向量数据
5. 保存任务配置

### 4. 总结流程
1. MemoryService处理内容
2. 调用AI API生成总结
3. 可选创建世界书条目
4. 保存记忆
5. 可选隐藏已总结的消息

### 5. 自动总结
- 独立的触发机制
- 每N层消息自动触发
- 使用相同的总结流程

### 6. 查询使用
1. 加载所有启用的任务
2. 解析外挂任务引用
3. 执行向量查询
4. 可选Rerank重排序
5. 注入结果到聊天上下文
6. 可选显示通知

## 关键特性

- **并行处理**：向量化和总结可以同时进行，提高效率
- **模块化设计**：每个阶段都是独立模块，便于维护和扩展
- **灵活配置**：用户可以选择性地启用各个功能
- **外挂任务**：支持跨聊天共享向量化数据
- **自动化**：支持自动总结和自动隐藏功能