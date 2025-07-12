# Phase 7.6-7.7 测试指南

## 概述
Phase 7.6-7.7 实现了 NotificationManager 系统和样式架构重组。以下是详细的测试步骤。

## Phase 7.6: NotificationManager 测试

### 1. 集成 NotificationManager
首先需要在 index.js 中集成 NotificationManager：

```javascript
// 在文件顶部导入
import { NotificationManager } from './src/ui/components/NotificationManager.js';

// 在全局变量区域添加
let globalNotificationManager = null;

// 在 jQuery ready 中初始化
globalNotificationManager = new NotificationManager({
    eventBus,
    toastr: window.toastr
});
globalNotificationManager.init();
```

### 2. 替换现有 toastr 调用
需要将 index.js 中的所有 toastr 调用替换为 NotificationManager 模板调用。例如：

```javascript
// 原代码
toastr.success('任务已重命名');

// 新代码
globalNotificationManager.showFromTemplate('task.renamed');

// 带参数的模板
// 原代码
toastr.warning(`文件 "${file.name}" 处理失败: ${error.message}`);

// 新代码
globalNotificationManager.showFromTemplate('file.processing.failed', {
    filename: file.name,
    error: error.message
});
```

### 3. 测试通知功能

#### 3.1 基本通知测试
1. 刷新页面，打开 Vectors Enhanced 设置面板
2. 在浏览器控制台执行：
```javascript
// 测试不同类型的通知
globalNotificationManager.success('测试成功消息');
globalNotificationManager.error('测试错误消息');
globalNotificationManager.warning('测试警告消息');
globalNotificationManager.info('测试信息消息');
```

#### 3.2 模板通知测试
在控制台执行：
```javascript
// 测试模板通知
globalNotificationManager.showFromTemplate('vectorization.complete', { count: 10 });
globalNotificationManager.showFromTemplate('no.chat.selected');
globalNotificationManager.showFromTemplate('tags.found', { count: 5 });
```

#### 3.3 优先级队列测试
```javascript
// 测试优先级队列
globalNotificationManager.show('低优先级消息', 'info', '', { priority: 1 });
globalNotificationManager.show('高优先级消息', 'error', '', { priority: 3 });
globalNotificationManager.show('普通优先级消息', 'warning', '', { priority: 2 });
// 高优先级应该先显示
```

#### 3.4 通知历史测试
```javascript
// 查看通知历史
console.log(globalNotificationManager.getHistory());
console.log(globalNotificationManager.getStats());
```

### 4. 功能测试场景

#### 4.1 向量化流程测试
1. 选择一些聊天消息进行向量化
2. 观察通知消息是否正确显示：
   - 处理开始的信息通知
   - 进度更新通知
   - 完成或错误通知

#### 4.2 导出功能测试
1. 点击"导出数据"按钮
2. 应该看到"导出成功"的通知

#### 4.3 错误处理测试
1. 故意触发一些错误情况（如未选择聊天时点击向量化）
2. 验证错误通知是否正确显示

## Phase 7.7: 样式架构测试

### 1. 更新 HTML 文件引用
需要更新 settings.html 或主 HTML 文件，将原来的 style.css 引用改为新的模块化样式：

```html
<!-- 原引用 -->
<link rel="stylesheet" href="style.css">

<!-- 新引用 -->
<link rel="stylesheet" href="src/ui/styles/index.css">
```

### 2. 视觉测试

#### 2.1 基础样式测试
1. 刷新页面后，检查 Vectors Enhanced 面板的整体外观
2. 验证以下元素的样式是否正常：
   - 标题和文本颜色
   - 边框和圆角
   - 间距和内边距

#### 2.2 组件样式测试
检查各个组件的样式：

1. **按钮样式**
   - 悬停效果
   - 禁用状态
   - 加载状态（如果实现了 loading 类）

2. **进度条样式**
   - 进度条显示
   - 不同状态的颜色（正常/错误/完成）

3. **表单样式**
   - 输入框验证状态（错误/成功）
   - 单选框和复选框样式

4. **列表样式**
   - 文件列表滚动条
   - 悬停效果
   - 选中状态

#### 2.3 响应式测试
1. 调整浏览器窗口大小
2. 检查在不同屏幕尺寸下的布局：
   - 移动端（< 600px）
   - 平板（< 768px）
   - 桌面（> 1024px）

#### 2.4 主题兼容性测试
1. 如果 SillyTavern 支持多主题，切换不同主题
2. 验证 CSS 变量是否正确应用
3. 检查颜色对比度和可读性

### 3. 性能测试
1. 打开浏览器开发者工具的 Network 标签
2. 刷新页面
3. 检查 CSS 文件是否正确加载
4. 验证没有 404 错误

### 4. 浏览器兼容性测试
在不同浏览器中测试：
- Chrome/Edge
- Firefox
- Safari（如果可用）

## 常见问题排查

### NotificationManager 问题
1. **通知不显示**
   - 检查 toastr 是否已加载
   - 检查控制台是否有错误
   - 验证 NotificationManager 是否正确初始化

2. **模板未找到**
   - 检查模板键名是否正确
   - 查看控制台警告信息

### 样式问题
1. **样式未应用**
   - 检查 CSS 文件路径是否正确
   - 验证 @import 语句是否有效
   - 检查浏览器控制台的网络错误

2. **样式冲突**
   - 检查是否同时加载了新旧样式文件
   - 使用开发者工具检查 CSS 优先级

## 集成建议

1. **渐进式替换**：可以先集成 NotificationManager，逐步替换 toastr 调用
2. **样式迁移**：建议先在开发环境测试新样式，确认无误后再应用到生产环境
3. **备份原文件**：在修改前备份 style.css 和相关文件

## 测试完成标准

- [ ] NotificationManager 成功初始化
- [ ] 所有通知类型正常显示
- [ ] 通知队列和优先级工作正常
- [ ] 模板通知参数替换正确
- [ ] 新样式架构加载成功
- [ ] 所有组件样式正常显示
- [ ] 响应式布局正常工作
- [ ] 无控制台错误或警告
- [ ] 性能无明显下降