# 源代码目录

这是 Vectors Enhanced 重构后的源代码根目录。

## 目录结构

- `core/` - 核心业务逻辑
  - `entities/` - 实体类定义（Content, Vector, Task等）
  - `extractors/` - 内容提取器（后续添加）
  - `tasks/` - 任务实现（后续添加）
- `infrastructure/` - 基础设施层
  - `events/` - 事件系统
  - `storage/` - 存储适配器（后续添加）
  - `api/` - API客户端（后续添加）
- `utils/` - 工具函数
- `legacy/` - 将被重构的旧代码（临时存放）
- `application/` - 应用层服务（后续添加）
- `plugins/` - 功能插件（后续添加）
- `ui/` - UI组件（后续添加）

## 重构说明

本目录是渐进式重构的一部分，新代码将逐步迁移到此处，与旧代码并存运行。
