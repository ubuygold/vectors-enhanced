# 向量查询注入失败问题调试指南

## 问题描述
弹窗提示"查询到N个块，已注入"，但实际内容未注入到聊天中。

## 快速诊断步骤

### 1. 开启控制台日志
打开浏览器开发者工具（F12），在Console中查看以下关键日志：

- `Vectors: API returned hashes only` - 表示只返回了哈希，需要额外获取文本
- `Vectors: Using cached data` - 是否使用了缓存（通常不会出现）
- `Vectors: Using task saved text content` - 是否从任务中获取文本
- `Vectors: Attempting to retrieve text directly from vector files` - 尝试从文件读取
- `Vectors: Failed to retrieve text content` - 文本获取失败
- `Vectors: Final injected text length: 0` - 最终注入文本长度为0

### 2. 检查任务类型
在控制台执行：
```javascript
// 获取当前聊天的任务
const chatId = getCurrentChatId();
const tasks = getChatTasks(chatId);
tasks.forEach(task => {
  console.log(`任务: ${task.name}, 轻量化: ${task.lightweight}, 有文本: ${!!task.textContent}`);
});
```

### 3. 手动测试文本获取
在控制台执行：
```javascript
// 测试getVectorTexts是否正常工作
const testCollectionId = chatId + '_' + tasks[0].taskId;
const response = await fetch('/api/vector/query', {
  method: 'POST',
  headers: getRequestHeaders(),
  body: JSON.stringify({
    ...getVectorsRequestBody(),
    collectionId: testCollectionId,
    searchText: "test",
    topK: 10,
    includeText: true
  })
});
const result = await response.json();
console.log('查询结果:', result);
```

## 用户侧临时解决方案

### 方案1：重新向量化（推荐）
1. 删除现有任务
2. 选择较少的内容进行向量化（避免超过100个块）
3. 或分批向量化大文件

### 方案2：修改轻量化阈值
在控制台执行：
```javascript
// 临时增加轻量化阈值（仅当前会话有效）
window.LIGHTWEIGHT_TASK_THRESHOLD = 500; // 默认是100
```

### 方案3：强制包含文本
向量化前，在控制台执行：
```javascript
// 强制API返回文本（如果后端支持）
const originalBody = getVectorsRequestBody;
window.getVectorsRequestBody = function(args) {
  return { ...originalBody(args), includeText: true };
};
```

## 开发者修复建议

### 1. 修复getVectorTexts
```javascript
// 使用更可靠的方法获取文本
async getVectorTexts(collectionId, hashes) {
  // 直接请求特定的哈希值，而不是使用虚假搜索
  const response = await fetch(`${this.baseUrl}/retrieve`, {
    method: 'POST',
    headers: this.getRequestHeaders(),
    body: JSON.stringify({
      collectionId,
      hashes,
      includeText: true
    })
  });
  // ...
}
```

### 2. 添加缓存机制
```javascript
// 在向量化时缓存文本
cachedVectors.set(collectionId, {
  items: processedChunks,
  timestamp: Date.now()
});
```

### 3. 改进空文本检查
```javascript
// 检查文本是否真的有内容
if (item.text && item.text.trim()) {
  allResults.push({...});
}
```

### 4. 添加注入验证
```javascript
// 在显示通知前验证是否真的注入了内容
const actuallyInjected = insertedText && insertedText.length > 0;
if (actuallyInjected) {
  message += '，已注入。';
} else {
  message += '，但注入失败。';
}
```

## 日志收集脚本
用户可以运行此脚本收集诊断信息：
```javascript
(async function collectDebugInfo() {
  const chatId = getCurrentChatId();
  const tasks = getChatTasks(chatId);
  const info = {
    chatId,
    taskCount: tasks.length,
    tasks: tasks.map(t => ({
      name: t.name,
      lightweight: t.lightweight,
      hasTextContent: !!t.textContent,
      itemCount: t.textContent?.length || 0
    })),
    settings: {
      max_results: extension_settings.vectors_enhanced.max_results,
      lightweight_threshold: window.LIGHTWEIGHT_TASK_THRESHOLD
    }
  };
  console.log('调试信息:', JSON.stringify(info, null, 2));
  
  // 测试查询
  if (tasks.length > 0) {
    const testCollection = `${chatId}_${tasks[0].taskId}`;
    try {
      const response = await fetch('/api/vector/query', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          ...getVectorsRequestBody(),
          collectionId: testCollection,
          searchText: "test",
          topK: 5,
          includeText: true
        })
      });
      const result = await response.json();
      console.log('测试查询结果:', {
        hasItems: !!result.items,
        hasHashes: !!result.hashes,
        hasMetadata: !!result.metadata,
        itemCount: result.items?.length || 0,
        hashCount: result.hashes?.length || 0,
        firstItemHasText: !!(result.items?.[0]?.text || result.metadata?.[0]?.text)
      });
    } catch (e) {
      console.error('测试查询失败:', e);
    }
  }
})();
```

## 根本原因总结
1. 大文件使用轻量化存储，不保存文本内容
2. 查询时API只返回哈希值
3. 从文件获取文本的备用方案（getVectorTexts）实现有缺陷
4. 空文本通过了检查，导致显示"已注入"但实际没有内容

## 建议的永久修复
1. 改进getVectorTexts的实现，使用更可靠的API
2. 实现真正的缓存机制
3. 添加更严格的文本验证
4. 在通知中准确反映实际注入状态