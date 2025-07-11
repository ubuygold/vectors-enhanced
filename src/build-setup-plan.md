# Phase 0.2 构建环境设置计划

## 目标

为 Vectors Enhanced 项目设置现代化的构建环境，支持模块化开发，同时保持与 SillyTavern 扩展系统的兼容性。

## 需要创建的文件

### 1. package.json
```json
{
  "name": "vectors-enhanced",
  "version": "1.0.7",
  "description": "增强版向量存储插件",
  "main": "index.js",
  "scripts": {
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch",
    "clean": "rm -rf dist"
  },
  "keywords": ["sillytavern", "extension", "vectors"],
  "author": "RaphllA",
  "license": "MIT",
  "devDependencies": {
    "webpack": "^5.90.0",
    "webpack-cli": "^5.1.4",
    "css-loader": "^6.8.1",
    "style-loader": "^3.3.3",
    "html-webpack-plugin": "^5.5.4",
    "copy-webpack-plugin": "^11.0.0"
  }
}
```

### 2. webpack.config.js
```javascript
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/index.js',  // 新的模块化入口
  output: {
    filename: 'index.js',  // 保持与 manifest.json 一致
    path: path.resolve(__dirname, '.'),
    clean: false  // 不清理根目录
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/style.css", to: "style.css" },  // 如果样式也模块化
      ],
    }),
  ],
  optimization: {
    minimize: false  // 开发阶段不压缩，便于调试
  },
  devtool: 'source-map',  // 生成源映射便于调试
};
```

### 3. src/index.js (新的模块化入口)
```javascript
// 新的模块化入口文件
// 这将是重构后的主文件，逐步替代当前的 index.js

// 导入核心模块
// import { EventBus } from './infrastructure/events/EventBus.js';
// import { ConfigManager } from './infrastructure/config/ConfigManager.js';
// import { Logger } from './infrastructure/logging/Logger.js';

// 暂时保留对旧代码的引用
import '../index.js';

// 逐步迁移功能到新架构
// export function initializeVectorsEnhanced() {
//   // 初始化逻辑
// }
```

### 4. .gitignore (更新)
添加以下内容：
```
node_modules/
dist/
*.log
.DS_Store
```

## 实施步骤

1. **创建 package.json**
   - 定义项目元数据
   - 配置构建脚本
   - 列出开发依赖

2. **创建 webpack 配置**
   - 设置入口和输出
   - 配置模块规则
   - 设置插件

3. **创建新的入口文件**
   - src/index.js 作为模块化入口
   - 暂时导入旧的 index.js
   - 准备逐步迁移

4. **更新 .gitignore**
   - 排除 node_modules
   - 排除构建产物

## 构建命令

- `npm install` - 安装依赖
- `npm run dev` - 开发模式，监听文件变化
- `npm run build` - 生产构建

## 注意事项

1. **保持兼容性**
   - 构建输出仍为 index.js，与 manifest.json 保持一致
   - 不改变现有文件结构
   - 渐进式迁移

2. **模块化策略**
   - 新代码使用 ES6 模块
   - 旧代码逐步重构为模块
   - 使用 webpack 打包为单文件

3. **开发体验**
   - 支持热重载
   - 源码映射便于调试
   - 模块化开发

## 下一步

完成构建环境设置后，就可以开始 Phase 1 - 创建基础设施层的核心组件。
