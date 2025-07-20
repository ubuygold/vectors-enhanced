# 移除 textContent 冗余存储实施方案

## 核心理念
既然向量数据库已经存储了完整的文本内容（metadata.text），就不需要在 settings.json 中重复存储。

## 实施步骤

### 第一步：修改查询结果处理逻辑

```javascript
// 在 rearrangeChat 中，修改文本获取逻辑
if (results) {
    // 新逻辑：优先从查询结果中获取文本
    if (results.metadata && Array.isArray(results.metadata)) {
        results.metadata.forEach((meta, index) => {
            if (meta.text) {
                allResults.push({
                    text: meta.text,
                    score: meta.score || 0,
                    metadata: {
                        ...meta,
                        taskName: task.name,
                        taskId: task.taskId
                    }
                });
            }
        });
    }
    // 兼容旧版本：如果有 items 格式
    else if (results.items && Array.isArray(results.items)) {
        results.items.forEach(item => {
            if (item.text) {
                allResults.push({
                    text: item.text,
                    score: item.score || 0,
                    metadata: {
                        ...item.metadata,
                        taskName: task.name,
                        taskId: task.taskId
                    }
                });
            }
        });
    }
    // 只有在上述方法都失败时，才尝试从任务中获取（向后兼容）
    else if (results.hashes && task.textContent) {
        // 保留原有的 textContent 查找逻辑，用于兼容旧任务
        results.hashes.forEach((hash, index) => {
            const textItem = task.textContent.find(item => item.hash === hash);
            if (textItem && textItem.text) {
                allResults.push({
                    text: textItem.text,
                    score: results.metadata[index]?.score || 0,
                    metadata: {
                        ...textItem.metadata,
                        ...(results.metadata[index] || {}),
                        taskName: task.name,
                        taskId: task.taskId
                    }
                });
            }
        });
    }
}
```

### 第二步：修改任务创建逻辑

```javascript
// 在 pipelineVectorizeContent 中
const task = {
    taskId: taskId,
    name: taskName,
    timestamp: Date.now(),
    settings: correctedSettings,
    enabled: true,
    itemCount: allProcessedChunks.length,
    originalItemCount: items.length,
    isIncremental: isIncremental,
    actualProcessedItems: actualProcessedItems,
    version: '2.0'
    // 完全移除 textContent 和 lightweight 相关代码
};

// 删除这部分代码：
// if (settings.lightweight_storage && allProcessedChunks.length > 50) {
//     task.lightweight = true;
// } else {
//     task.textContent = allProcessedChunks.map(chunk => ({...}));
// }
```

### 第三步：修改 StorageAdapter 确保返回文本

```javascript
// 修改 queryCollection 方法
async queryCollection(collectionId, searchText, topK, threshold) {
    try {
        const response = await fetch(`${this.baseUrl}/query`, {
            method: 'POST',
            headers: this.getRequestHeaders(),
            body: JSON.stringify({
                ...this.getVectorsRequestBody(),
                collectionId: collectionId,
                searchText: searchText,
                topK: topK,
                threshold: threshold,
                includeMetadata: true  // 确保包含元数据
            }),
        });
        
        if (!response.ok) {
            throw new Error(`Failed to query collection ${collectionId}`);
        }
        
        const result = await response.json();
        
        // 确保 metadata 包含文本
        if (result.metadata && Array.isArray(result.metadata)) {
            // 服务端应该已经在 metadata 中包含了文本
            // 如果没有，这里可以记录警告
            result.metadata.forEach((meta, index) => {
                if (!meta.text) {
                    logger.warn(`Missing text in metadata for hash ${result.hashes[index]}`);
                }
            });
        }
        
        return result;
    } catch (error) {
        logger.error(`Error querying collection: ${error.message}`);
        throw error;
    }
}
```

### 第四步：修改外挂任务的UI显示

```javascript
// 在 ExternalTaskUI.js 中
// 修改显示任务项目数的地方
const itemCount = await getTaskItemCount(task.taskId);
// 或者简单地显示 "已向量化" 而不显示具体数量

// 添加辅助函数
async function getTaskItemCount(taskId) {
    try {
        const collectionId = `${chatId}_${taskId}`;
        const response = await fetch('/api/vector/list', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                collectionId: collectionId
            })
        });
        const hashes = await response.json();
        return hashes.length;
    } catch (error) {
        return 0;
    }
}
```

### 第五步：清理相关代码

1. 移除 `lightweight_storage` 设置
2. 移除 `LIGHTWEIGHT_TASK_THRESHOLD` 常量
3. 移除 `getVectorTexts` 的复杂逻辑（不再需要）
4. 简化缓存逻辑（如果有的话）

## 兼容性保证

### 对旧任务的处理：
1. **有 textContent 的任务**：继续正常工作，查询时会优先使用 metadata.text，只有在失败时才回退到 textContent
2. **轻量化任务**：本来就没有 textContent，会使用新的查询逻辑
3. **外挂任务**：不受影响，只需要调整UI显示

### 迁移策略：
- 不需要主动迁移
- 旧任务继续工作
- 新任务使用新逻辑
- settings.json 会逐渐变小

## 优势

1. **消除冗余**：不再重复存储文本
2. **减小文件大小**：settings.json 保持合理大小
3. **简化逻辑**：不再需要区分轻量化和普通任务
4. **提高可靠性**：单一数据源，减少不一致

## 风险和缓解

1. **风险**：向量数据库文件损坏
   - **缓解**：实现备份机制

2. **风险**：服务端API不返回文本
   - **缓解**：添加明确的 includeMetadata 参数

3. **风险**：性能问题（每次都从数据库读取）
   - **缓解**：实现内存缓存

## 测试计划

1. 创建新任务，验证不再生成 textContent
2. 测试旧任务（有 textContent）仍能正常查询
3. 测试轻量化旧任务能正常查询
4. 测试外挂任务功能正常
5. 验证 settings.json 文件大小不再增长
6. 测试大文件（>1000块）的向量化和查询