# Proposal: Phase 1 基础设施搭建（历史提案）

> 说明：本文档为项目启动早期的 Phase 1 提案，非当前全量能力说明。  
> 当前版本能力与目标请参考根目录 `PRD.md` 与工作流文档。

## 背景
当前项目只有 PRD 与工作流文档，尚未具备可运行代码骨架，无法进入后续核心算法与 Agent 编排开发。

## 目标
在单仓（Monorepo）下完成前后端最小可运行脚手架，建立数据库基础模型与配置体系，为后续 Phase 2~9 提供稳定开发基座。

## 约束条件
- 技术栈：FastAPI + SQLAlchemy + Next.js 14 + TypeScript + Tailwind CSS
- 数据库：SQLite（Demo 阶段）
- 目录结构需与计划文档保持一致

## 验收标准
- [ ] 根目录存在 `.env.example`、`.gitignore`、`data` 目录占位
- [ ] 后端 `backend/app/main.py` 可启动并返回健康检查
- [ ] 后端完成配置管理与 7 张核心表 ORM 定义
- [ ] 前端完成 Next.js 基础工程与深色工业风布局骨架
