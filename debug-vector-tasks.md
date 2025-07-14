# 向量化任务调试函数使用指南

## 可用的调试函数

### 1. `showAllVectorTasks()`
显示所有向量化任务的详细信息。

```javascript
// 在控制台运行
showAllVectorTasks()
```

输出内容包括：
- 每个聊天的任务列表
- 任务ID、名称、创建时间
- 启用状态和内容统计
- 内容类型分布（聊天、文件、世界信息）

### 2. `showVectorTasksSummary()`
以表格形式显示任务摘要。

```javascript
// 在控制台运行
showVectorTasksSummary()
```

输出一个简洁的表格，包含：
- Chat ID
- 任务数量
- 启用的任务数
- 最近创建时间

### 3. `showCurrentChatTasks()`
只显示当前聊天的任务。

```javascript
// 在控制台运行
showCurrentChatTasks()
```

### 4. `createTestVectorTasks()`
创建测试任务数据（用于调试）。

```javascript
// 在控制台运行
const testChatIds = createTestVectorTasks()
```

这会创建3个测试聊天，每个聊天包含1-3个任务。

## 调试外挂任务功能

### 1. 检查任务是否存在
```javascript
// 查看所有任务
showVectorTasksSummary()

// 如果没有任务，创建测试数据
createTestVectorTasks()

// 再次查看
showVectorTasksSummary()
```

### 2. 测试外挂任务导入
```javascript
// 手动触发导入对话框
debugTriggerExternalTask()
```

### 3. 检查具体问题
```javascript
// 查看详细任务信息
showAllVectorTasks()

// 检查当前聊天
showCurrentChatTasks()

// 检查全局对象状态
checkExternalTaskUI()
```

## 常见问题排查

### "没有找到包含向量化任务的聊天"
1. 运行 `showVectorTasksSummary()` 检查是否有任务
2. 如果没有，运行 `createTestVectorTasks()` 创建测试数据
3. 再次尝试导入功能

### 按钮无响应
1. 运行 `checkExternalTaskUI()` 检查组件状态
2. 运行 `rebindExternalTaskUI()` 重新绑定事件
3. 使用 `debugTriggerExternalTask()` 手动触发

### 查看原始数据
```javascript
// 查看所有任务的原始数据
console.log(extension_settings.vectors_enhanced.vector_tasks)

// 查看特定聊天的任务
const chatId = getCurrentChatId()
console.log(extension_settings.vectors_enhanced.vector_tasks[chatId])
```