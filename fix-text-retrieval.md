# 修复文本获取问题 - 基于原版插件的解决方案

## 问题根源
vectors-enhanced 与原版 vectors 插件的关键区别：
- 原版：所有文本都存储在向量数据库的 metadata 中，查询时直接返回
- enhanced：引入了轻量化存储，导致文本获取复杂化

## 解决方案

### 方案 1：确保服务端始终返回文本（推荐）

修改查询请求，明确要求返回文本：

```javascript
// 在 index.js 的 queryCollection 调用中
const results = await storageAdapter.queryCollection(
    collectionId, 
    queryText, 
    perTaskLimit, 
    settings.score_threshold,
    true // 添加 includeText 参数
);
```

修改 StorageAdapter.js：

```javascript
async queryCollection(collectionId, searchText, topK, threshold, includeText = true) {
    try {
        logger.log(`Querying collection: ${collectionId}`);
        
        const response = await fetch(`${this.baseUrl}/query`, {
            method: 'POST',
            headers: this.getRequestHeaders(),
            body: JSON.stringify({
                ...this.getVectorsRequestBody(),
                collectionId: collectionId,
                searchText: searchText,
                topK: topK,
                threshold: threshold,
                includeText: includeText, // 确保包含文本
            }),
        });
        
        if (!response.ok) {
            throw new Error(`Failed to query collection ${collectionId}`);
        }
        
        const result = await response.json();
        
        // 如果有 metadata 且包含 text，转换为 items 格式
        if (result.metadata && includeText) {
            result.items = result.metadata.map((meta, index) => ({
                hash: result.hashes[index],
                text: meta.text || '',
                score: meta.score || 0,
                metadata: meta
            }));
        }
        
        return result;
    } catch (error) {
        logger.error(`Error querying collection: ${error.message}`);
        throw error;
    }
}
```

### 方案 2：改进文本获取逻辑

如果服务端不能保证返回文本，改进客户端的处理：

```javascript
// 在 rearrangeChat 中，处理查询结果时
if (results) {
    // 优先使用 items（如果包含文本）
    if (results.items && Array.isArray(results.items)) {
        results.items.forEach(item => {
            if (item.text) {
                allResults.push({
                    text: item.text,
                    score: item.score || 0,
                    metadata: { ...item.metadata, taskName: task.name, taskId: task.taskId }
                });
            }
        });
    }
    // 如果只有 metadata 且包含文本，使用它
    else if (results.metadata && Array.isArray(results.metadata)) {
        results.metadata.forEach((meta, index) => {
            if (meta.text) {
                allResults.push({
                    text: meta.text,
                    score: meta.score || 0,
                    metadata: { ...meta, taskName: task.name, taskId: task.taskId }
                });
            }
        });
    }
    // 最后才尝试其他方法（缓存、任务文本、文件读取）
    else if (results.hashes) {
        // 现有的三重备用逻辑...
    }
}
```

### 方案 3：废弃轻量化存储

最简单直接的方案：像原版插件一样，不使用轻量化存储：

```javascript
// 删除或注释掉轻量化逻辑
// if (settings.lightweight_storage && allProcessedChunks.length > 50) {
//     task.lightweight = true;
// } else {
    task.textContent = allProcessedChunks.map(chunk => ({
        hash: chunk.hash,
        text: chunk.text,
        metadata: chunk.metadata
    }));
// }
```

但这会导致 settings.json 变大的问题。

### 方案 4：确保向量数据库存储完整信息

检查向量化时的存储请求，确保文本被正确存储：

```javascript
// 在 insertVectorItems 中
const items = chunks.map(chunk => ({
    hash: chunk.hash,
    text: chunk.text, // 确保包含文本
    index: chunk.index,
    metadata: {
        ...chunk.metadata,
        text: chunk.text // 冗余存储，确保 metadata 中也有文本
    }
}));
```

## 推荐的立即修复

1. 修改 StorageAdapter.js 的 queryCollection，添加 includeText 参数
2. 修改查询结果处理，优先使用 metadata.text（如果存在）
3. 降低轻量化阈值到 50 块（已完成）
4. 添加调试日志，帮助诊断问题

## 长期建议

1. 统一文本存储策略，避免多种获取路径
2. 考虑使用 IndexedDB 或其他客户端存储方案
3. 改进服务端 API，提供可靠的文本获取端点
4. 为大文件实现流式处理，避免一次性加载所有文本