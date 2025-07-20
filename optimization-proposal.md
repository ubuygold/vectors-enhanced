# 向量存储优化建议

## 当前问题
1. 小文件（<1000块）全部存入 settings.json，导致文件过大
2. 大文件使用轻量化存储，但文本获取机制不可靠
3. 缺少中间层缓存机制

## 建议的优化方案

### 方案1：降低轻量化阈值 + 改进文本获取（短期）

```javascript
// 1. 降低阈值到更合理的值
const LIGHTWEIGHT_TASK_THRESHOLD = 50; // 从1000降到50块（约25000字）

// 2. 为超过阈值的任务实现专门的文本获取API
// 在服务端添加 /api/vector/retrieve-texts 端点
router.post('/retrieve-texts', async (req, res) => {
    const { collectionId, hashes } = req.body;
    const store = await getIndex(directories, collectionId, source, sourceSettings);
    
    // 直接按hash获取特定项目
    const texts = [];
    for (const hash of hashes) {
        const item = await store.getItem(hash);
        if (item?.metadata?.text) {
            texts.push({
                hash,
                text: item.metadata.text,
                metadata: item.metadata
            });
        }
    }
    
    return res.json({ texts });
});
```

### 方案2：实现分离的文本存储（中期）

```javascript
// 1. 任务元数据存储在 settings.json
{
    taskId: "task_xxx",
    name: "任务名称",
    lightweight: true,
    textStorageType: "file", // 或 "database"
    // 不包含 textContent
}

// 2. 文本内容存储在独立文件
// 路径：/data/[user]/vectors/[chatId]/[taskId].json
{
    chunks: [
        { hash, text, metadata },
        // ...
    ]
}

// 3. 实现缓存机制
class TextContentCache {
    constructor(maxSize = 100 * 1024 * 1024) { // 100MB
        this.cache = new Map();
        this.size = 0;
        this.maxSize = maxSize;
    }
    
    get(taskId) {
        if (this.cache.has(taskId)) {
            // LRU: 移到最后
            const data = this.cache.get(taskId);
            this.cache.delete(taskId);
            this.cache.set(taskId, data);
            return data;
        }
        return null;
    }
    
    set(taskId, data) {
        const dataSize = JSON.stringify(data).length;
        
        // 清理空间
        while (this.size + dataSize > this.maxSize && this.cache.size > 0) {
            const firstKey = this.cache.keys().next().value;
            const firstData = this.cache.get(firstKey);
            this.size -= JSON.stringify(firstData).length;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(taskId, data);
        this.size += dataSize;
    }
}
```

### 方案3：使用IndexedDB（长期）

```javascript
// 使用浏览器的 IndexedDB 存储大量文本数据
class VectorTextStorage {
    constructor() {
        this.dbName = 'VectorsEnhancedTexts';
        this.version = 1;
    }
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('texts')) {
                    const store = db.createObjectStore('texts', { keyPath: 'id' });
                    store.createIndex('taskId', 'taskId', { unique: false });
                    store.createIndex('hash', 'hash', { unique: false });
                }
            };
        });
    }
    
    async saveTexts(taskId, texts) {
        const transaction = this.db.transaction(['texts'], 'readwrite');
        const store = transaction.objectStore('texts');
        
        for (const text of texts) {
            await store.put({
                id: `${taskId}_${text.hash}`,
                taskId,
                hash: text.hash,
                text: text.text,
                metadata: text.metadata
            });
        }
    }
    
    async getTexts(taskId, hashes) {
        const transaction = this.db.transaction(['texts'], 'readonly');
        const store = transaction.objectStore('texts');
        const index = store.index('taskId');
        
        const texts = [];
        const request = index.openCursor(IDBKeyRange.only(taskId));
        
        return new Promise((resolve) => {
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (hashes.includes(cursor.value.hash)) {
                        texts.push({
                            hash: cursor.value.hash,
                            text: cursor.value.text,
                            metadata: cursor.value.metadata
                        });
                    }
                    cursor.continue();
                } else {
                    resolve(texts);
                }
            };
        });
    }
}
```

## 推荐实施步骤

### 第一步（立即）
1. 将轻量化阈值降低到 50 块
2. 添加警告提示，告知用户大文件可能的问题

### 第二步（短期）
1. 实现服务端的 retrieve-texts API
2. 改进客户端的 getVectorTexts 方法
3. 添加基本的内存缓存

### 第三步（中期）
1. 实现文本内容的分离存储
2. 迁移现有数据到新存储结构
3. 优化查询性能

### 第四步（长期）
1. 实现 IndexedDB 存储方案
2. 提供多种存储后端选择
3. 实现智能的存储策略（根据文件大小自动选择）

## 临时解决方案

对于当前用户，可以：

1. **手动调整阈值**：
   ```javascript
   // 在控制台执行
   extension_settings.vectors_enhanced.lightweight_threshold = 50;
   saveSettingsDebounced();
   ```

2. **分批处理大文件**：
   - 将大文件分成多个小文件
   - 每个文件不超过 25,000 字
   - 分别向量化

3. **定期清理**：
   - 删除不再需要的旧任务
   - 导出重要的向量数据
   - 重新开始以减小 settings.json 大小