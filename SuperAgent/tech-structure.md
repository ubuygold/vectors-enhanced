# 项目技术结构

## 主要参数
- **项目类型**: Frontend (浏览器扩展插件)
- **语言**: JavaScript
- **框架**: SillyTavern Extension Framework

## 开发环境
- **操作系统**: Windows 11
- **运行时**: 浏览器环境 (Chrome/Firefox)
- **终端**: Windows CMD
- **包管理器**: npm (通过 package.json 管理依赖)

## Git 规范
- **提交信息格式**: Conventional Commits (feat:, fix:, docs:, refactor:, test:, chore:)
- **自动 Push**: 否 (手动控制提交时机)
- **分支策略**: Feature branches (feature/xxx)

## 架构
- **类型**: 单体插件架构 (当前) → 分层+插件式架构 (目标)
- **MCP 服务器**: 不适用 (浏览器扩展环境)

## 代理设置
- **工作模式**: 交互模式 (描述计划，请求确认，讨论细节后实施)
- **注释语言**: 中文
- **虚拟环境**: 不适用 (JavaScript项目)

## 项目特性
- **向量化引擎**: Transformers.js, Ollama, vLLM, WebLLM
- **数据存储**: 浏览器本地存储
- **UI框架**: jQuery + 原生HTML/CSS
- **扩展类型**: SillyTavern 第三方扩展
