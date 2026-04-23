# Design: Phase 1 基础设施搭建（历史基线）

> 说明：本文档记录的是 Phase 1 当时的设计决策，仅覆盖基础设施搭建范围。  
> 当前项目全量范围（含对话式调度、重排程与测试口径）以根目录 `PRD.md`、`workflow_description.md`、`multi_agent_workflow.md` 为准。

## 技术方案概述
采用“后端先可运行、前端先可展示”的策略，优先完成配置、数据库与基础布局，后续模块在此骨架上增量迭代。

## 架构决策
| 决策项 | 选择 | 原因 |
|---|---|---|
| 后端框架 | FastAPI | 与 PRD 一致，便于后续 API 与调度扩展 |
| ORM | SQLAlchemy | 结构清晰，适配 SQLite 与后续迁移 |
| 配置管理 | pydantic-settings | 环境变量读取与类型校验统一 |
| 前端框架 | Next.js 14 + App Router | 与 PRD 一致，支持快速页面迭代 |
| UI 基座 | Tailwind CSS 深色主题 | 满足“工业风深色 UI”要求 |

## 接口/数据模型
- Phase 1 先提供 `GET /healthz`
- 数据模型先覆盖 7 张核心表：
  - `mps_orders`
  - `bom_master`
  - `material_master`
  - `mrp_plan_sessions`
  - `disruption_events`
  - `srm_sync_log`
  - `shelf_life_alerts`

## 风险清单
- [ ] 前端未使用 `create-next-app` 自动生成：通过手工最小骨架规避交互式初始化依赖
- [ ] SQLite 并发能力有限：仅用于 Demo，后续可迁移
- [ ] PRD 字段可能后续扩展：Phase 2 前允许对模型做小幅兼容调整

## 约束条件
- 必须遵循 `mrp系统开发计划_503032a3.plan.md` 的目录结构
- 禁止在 Phase 1 引入与核心目标无关的复杂依赖
