# Tasks: Phase 1 基础设施搭建（历史执行记录）

> 说明：本文档以阶段任务记录为目的，包含从 Phase 1 到后续阶段的执行清单。  
> 功能边界、模块职责与最新验收口径请以根目录 `PRD.md` 为准。

## 实施清单
- [x] 1. 创建根目录基础文件（`.env.example`、`.gitignore`、`data` 占位目录）
- [x] 2. 创建后端依赖与项目结构（`backend/requirements.txt`、`pyproject.toml`、`app` 目录）
- [x] 3. 实现配置管理与数据库连接（`config.py`、`database.py`）
- [x] 4. 定义 7 张核心表 ORM 模型（`models/*.py`）
- [x] 5. 定义 Phase 1 基础 Pydantic Schemas（`schemas/__init__.py`）
- [x] 6. 实现 FastAPI 启动入口与健康检查（`main.py`）
- [x] 7. 创建前端最小 Next.js 14 工程文件（`frontend/*`）
- [x] 8. 实现深色工业风基础布局（`layout.tsx` + 首页）
- [x] 9. 自检并修复基础 lint/类型问题

## 检查点
- [x] 代码符合 `docs/design.md` 的架构决策
- [x] 通过基础自我审查（结构、命名、可维护性）
- [x] 等待用户确认进入 Phase 2

## Phase 2: 核心算法模块（纯 Python）
- [x] 1. 实现 `mps_parser.py`（Excel 解析、约束标签 fallback 解析）
- [x] 2. 实现 `bom_expander.py`（多层展开、涉美替换、告警）
- [x] 3. 实现 `material_master_fetcher.py`（批量主数据快照查询）
- [x] 4. 实现 `mrp_engine.py`（5 步计算流程 + 5 类冲突码）
- [x] 5. 实现 `plan_version_manager.py`（状态机 pending_approval -> approved -> srm_synced）
- [x] 6. 实现 `srm_syncer.py`（Mock SRM 同步与日志落库）
- [x] 7. 补充单元测试（mps/bom/mrp/plan manager）

## Phase 3: CrewAI Agent 层
- [x] 1. 实现 5 个 Agent 文件（intent/bom/mrp/plan/exception）
- [x] 2. 实现 `agents/crew.py` 编排入口（MPS->Plan、审批同步、异常入口、保质期扫描）
- [x] 3. 实现 `conflict_analyzer.py`（冲突聚合与人类可读报告）
- [x] 4. 实现 `notification_service.py`（统一通知出口，Demo 日志实现）
- [x] 5. 实现 `disruption_intake.py`（中断录入、爆炸半径计算、事件落库）
- [x] 6. 实现 `shelf_life_monitor.py`（30 天窗口扫描与预警）
- [x] 7. 新增异常模块测试并回归全量后端测试

## Phase 4: FastAPI 路由层
- [x] 1. 实现 `api/mps.py`（上传触发 Agent 流程、查询解析结果）
- [x] 2. 实现 `api/plans.py`（会话列表、版本详情、审批与同步）
- [x] 3. 实现 `api/disruptions.py`（中断录入与事件查询）
- [x] 4. 实现 `api/data.py`（BOM/物料 Excel 上传与查询）
- [x] 5. 实现 `api/alerts.py`（保质期/中断告警聚合）
- [x] 6. `main.py` 集成路由与 APScheduler（每日 08:00 保质期扫描）
- [x] 7. 增加 API 集成测试并全量回归测试通过（16 passed）

## Phase 5: 监测与可观测性
- [x] 1. 新增 DB 模型：`system_metrics`、`agent_run_logs`
- [x] 2. 新增 `modules/metrics_collector.py`（`record_metric` / `record_agent_run`）
- [x] 3. `main.py` 增加请求计时 Middleware，写入 `system_metrics`
- [x] 4. `mrp_engine` 增加执行耗时告警（>5000ms warning）
- [x] 5. `crew.py` 增加 Agent task 执行日志落库（`agent_run_logs`）与 Crew 慢执行告警（>60s）
- [x] 6. `database.py` 增加 SQLAlchemy 查询埋点，慢查询日志（>1000ms）
- [x] 7. 新增结构化日志工具 `modules/logging_utils.py`
- [x] 8. 新增 `api/metrics.py`：`/api/metrics/summary`、`/api/metrics/agent-logs`
- [x] 9. 集成测试覆盖 metrics 路由并回归通过（16 passed）

## Phase 6: 前端核心页面
- [x] 1. 实现 `lib/api.ts`（axios 实例与统一 API 客户端）
- [x] 2. 更新 `types/index.ts` 与后端接口字段对齐
- [x] 3. Dashboard `/` 接入 `/api/metrics/summary`、`/api/plans`、`/api/alerts`
- [x] 4. MPS 上传页 `/mps/new` 对接 `/api/mps/upload`
- [x] 5. MPS 解析页 `/mps/[sessionId]` 对接 `/api/mps/{session_id}`
- [x] 6. 计划页新增 `/plans` 列表并实现 `/plans/[sessionId]` 详情审批（对接 `/api/plans/*`）
- [x] 7. 异常页 `/alerts` 对接告警查询与中断录入
- [x] 8. 数据页 `/data/bom`、`/data/materials` 对接上传与查询接口
- [x] 9. 前端 lint 通过（`npm run lint` 无 warning/error）

## Phase 7: 示例数据与端到端联调
- [x] 1. 新增示例数据生成脚本 `backend/scripts/generate_sample_excels.py`
- [x] 2. 生成模板文件：`data/templates/mps_template.xlsx`、`bom_template.xlsx`、`materials_template.xlsx`
- [x] 3. 生成样例文件：`data/samples/sample_mps.xlsx`、`sample_bom.xlsx`、`sample_materials.xlsx`
- [x] 4. 新增 `tests/test_e2e.py` 覆盖 3 条端到端工作流
- [x] 5. 全量后端测试回归通过（19 passed）

## Phase 8: 测试完善
- [x] 1. 扩展 `mrp_engine` 数值正确性测试（Gross-to-Net / Yield / Lot Size / Lead Time）
- [x] 2. 新增 `test_metrics_collector.py`（`record_metric` / `record_agent_run`）
- [x] 3. 新增 `test_conflict_analyzer.py`（冲突聚合与建议去重）
- [x] 4. 新增 `test_metrics_api_summary.py`（`/api/metrics/summary` 聚合准确性 + agent logs 过滤）
- [x] 5. 引擎逻辑修正：`safety_stock<=0` 跳过安全库存冲突判断
- [x] 6. 全量后端测试回归通过（25 passed）

## Phase 9: 收尾与文档
- [x] 1. 新增根目录 `README.md`（启动、测试、示例数据、架构概述）
- [x] 2. 前端 lint 复检通过（无 warning/error）

## 当前状态
- [x] 所有阶段开发完成，等待用户验收与后续指令
