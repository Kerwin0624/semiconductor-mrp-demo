# PRD：半导体供应链 Multi-Agent MRP 及异常调度系统 (Demo)

---

## Problem Statement

半导体供应链的 MRP 排产过程极为复杂：多层 BOM（成品→封装→晶圆→硅片）、长周期 Lead Time、良率（Yield）损耗、物料保质期红线、以及突发性供应链中断（如日本地震导致供应商停产）。现有 ERP/MRP 工具对以下场景束手无策：

1. 计划员希望用自然语言表达特殊约束（如"本批次禁用美系物料"、"车规级优先保障"），系统无法理解。
2. 发生约束冲突时（如 Lead Time 倒推发现投片已来不及），系统无法自动给出可行方案，只能人工翻数据。
3. 外部突发事件（地震）发生时，从"知道有地震"到"知道影响了哪些订单、该怎么调整"之间存在严重的人工响应断层。
4. 计划员在首次排产后，往往会根据客户最新要求继续微调（如"车规级优先且不晚于Q2"），现有流程缺乏“对话式二次调度”入口，导致二次修改效率低、易误解。

本项目以一个可运行的 Demo 为目标，验证"Multi-Agent + 代码级排程算法 + Human-in-the-loop"三者协同的可行性。

---

## Solution

构建一个以 **CrewAI** 为编排框架、**FastAPI** 为后端、**Next.js** 为前端的 5-Agent 智能 MRP 系统：

- **Agent 1（意图解析）**：将计划员输入的 MPS（Excel + 自然语言备注）转化为带约束标签的结构化数据。
- **Agent 2（BOM 与主数据）**：展开多层 BOM，按需替换涉美物料，拉取库存/Lead Time 等主数据快照。
- **Agent 3（MRP 计算引擎）**：调用纯 Python 启发式排程算法，不依赖 LLM 做数学计算，算不通时抛出结构化异常。
- **Agent 4（计划协同）**：将算法结果/异常翻译为人类可读建议，生成 Version A vs Version B 对比，等待人类 Approve 后模拟同步至 SRM。
- **Agent 5（异常监控）**：定时调用日本地震 Tool，排查所有供应商；每日扫描保质期；发现异常后计算爆炸半径并触发重排程。

同时新增一个 **对话式调度能力层**（Conversation Layer）：

- 绑定已有 `session_id`，支持计划员在排产后继续用自然语言下达调整意图。
- LLM 仅负责“意图识别 + 参数确认提示”，不参与任何数学计算或排产数值推断。
- 用户必须补充结构化参数（例如 `new_due_date=YYYY-MM-DD`）后，系统才触发确定性重排程。

---

## User Stories

### MPS 录入与解析

1. 作为计划员，我想上传一份 Excel 文件作为 MPS，以便系统能批量读取多个成品订单的 P/N、数量、交期和优先级，而不用逐条手动输入。
2. 作为计划员，我想在 MPS 上传页面附带一个自由文本输入框，以便用自然语言描述本批次的特殊要求（如"禁用美系物料"、"车规级 Q2 优先"）。
3. 作为计划员，我想在提交 MPS 后看到系统对我的自然语言备注的解析结果（如识别到的约束标签列表），以便确认系统理解了我的意图。
4. 作为计划员，如果我的 Excel 格式错误（缺少必填列），我希望系统立即告知具体错误原因，而不是静默失败。

### 对话式调度（新增）

1. 作为计划员，我希望在已有排产 Session 上继续通过自然语言提出调整诉求（如"确保不晚于Q2"），而不必重新上传 MPS。
2. 作为计划员，当系统识别到我的意图后，我希望系统要求我确认结构化参数（如 `new_due_date`），以避免 LLM 理解偏差。
3. 作为计划员，我希望系统仅在我提交结构化参数后才执行重排程，并返回新的方案对比。
4. 作为计划员，我希望查看会话历史（用户输入、系统识别意图、确认结果），以便追溯每次调度动作。

### BOM 展开与物料替代

1. 作为计划员，我想在系统中通过上传 Excel 的方式导入 BOM 主数据，以便系统能准确展开各成品的多层 BOM 树。
2. 作为计划员，当 MPS 备注中指定了"禁用美系物料"时，我希望系统自动在 AML（认可物料清单）中寻找非美系替代料（如日本、台湾、大陆），并在排产前完成替换。
3. 作为计划员，若某涉美物料找不到合规替代料，我希望系统在排产前明确告警，让我决定如何处理，而不是继续排产。

### MRP 排程计算

1. 作为计划员，我希望系统的核心排程计算（Gross-to-Net、Lead Time 倒推、Yield 放大）完全由确定性算法代码执行，结果可追溯、可复现，不会因为 AI 的随机性产生不同答案。
2. 作为计划员，我希望系统在计算净需求时，自动扣减现有库存、在途库存，并根据 Yield 放大毛需求，再向上取整至 Lot Size，计算出精确的 Planned Order Qty。
3. 作为计划员，当某低优先级订单仅需动用 ≤20% 安全库存即可按时交货时，我希望系统自动应用该策略并告知我，无需我手动介入。
4. 作为计划员，当某高优先级订单面临任何形式的延期或数量不足时，我希望系统立即暂停自动处理，等待我的决策。
5. 作为计划员，当系统检测到某物料在排产使用日时已过保质期，我希望系统明确拒绝使用该物料并告知原因。

### 约束冲突处理与人类决策

1. 作为计划员，当排程发生高风险冲突时，我希望看到一份包含"冲突原因"和"建议解决方向"的人类可读报告，而不是原始错误码。
2. 作为计划员，我希望系统在发生冲突时强制生成"Version A（原计划）"和"Version B（建议调整后计划）"的对比视图，让我能直观看到差异，再决定接受哪个版本。
3. 作为计划员，我希望在审批界面上可以看到两个版本中每条物料计划的关键字段差异（计划下单日、数量、备注），以便快速做出决定。
4. 作为计划员，审批通过后，我希望系统模拟将最终采购计划"同步至 SRM 系统"，并在界面上显示"SRM 同步成功"的确认信息。

### 异常监控：地震（集成外部工具）

> 注：地震数据拉取、供应商-烈度 Geo 匹配、预警邮件发送，均由外部工具 `[japan-earthquake-supply-chain](https://github.com/Kerwin0624/japan-earthquake-supply-chain)` 负责，本系统**不重复实现**这些能力。本系统的职责是在工具完成预警之后，接管"确认录入 → 爆炸半径计算 → 重排程"的下游流程。

1. 作为采购员，当我收到 `japan-earthquake-supply-chain` 工具发送的 Red Alert 预警邮件后，我希望能进入**本系统**的"供应链中断事件"页面，录入该供应商的实际影响结论（如"供应商 X 停产 2 周，预计恢复日期 YYYY-MM-DD"），以触发本系统的重排程流程。
2. 作为计划员，当采购在本系统中确认供应商停产后，我希望系统自动根据当前 BOM 和在途订单，计算出"爆炸半径"——即受影响的成品 FG 订单清单，并附上各订单的延期天数估算。
3. 作为计划员，地震重排程结束后，我希望同样看到"震前原计划 vs 震后调整计划"的对比版本，Approve 后更新系统状态。

### 异常监控：保质期

1. 作为计划员，我希望系统每天自动扫描库存中所有物料的保质期，在距离到期 30 天时自动发送预警邮件给我和库房负责人。
2. 作为计划员，保质期预警邮件中应包含物料 P/N、当前库存量、到期日和建议处理方式（如"加急消耗"或"联系供应商重新检验"）。

### 异常监控：内部异常

1. 作为计划员，当供应商反馈交期 Delay 时，我希望能在系统中手动登记此 Delay 事件，触发系统重新评估受影响订单。
2. 作为计划员，当某物料库存水位跌破安全库存时，我希望系统自动发送预警通知，而不是在排产时才发现缺料。

### 数据管理

1. 作为计划员，我希望能通过上传 Excel 的方式批量导入或更新 BOM 主数据（包含多层父子关系）。
2. 作为计划员，我希望能通过上传 Excel 的方式批量导入或更新物料主数据（Lead Time、保质期、Lot Size、Yield、库存、AML 等）。
3. 作为计划员，我希望在系统中查看当前所有 Planned Orders 的状态（待审批 / 已审批 / 已同步 SRM）。

---

## Implementation Decisions

### 技术栈


| 层          | 选型                                                 |
| ---------- | -------------------------------------------------- |
| Agent 编排框架 | CrewAI                                             |
| 后端 API     | FastAPI (Python 3.11+)                             |
| 前端框架       | Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui |
| 数据库        | SQLite + SQLAlchemy ORM                            |
| 定时任务       | APScheduler（内嵌 FastAPI 进程）                         |
| 邮件通知       | smtplib（Demo 阶段可打印日志替代）                            |
| 地震数据 Tool  | `japan-earthquake-supply-chain`（JMA 官方 API）        |


---

### 模块设计（Deep Modules）

#### Module 1: `mps_parser`

- **职责**：解析 Excel MPS 文件 + 自然语言备注，输出结构化 MPS 和约束标签列表。
- **接口**：
  ```
  输入: Excel 文件 (binary) + 备注文本 (str)
  输出: ParsedMPS
    {
      "orders": [
        { "fg_pn": str, "qty": int, "due_date": date, "priority": "high"|"low" }
      ],
      "constraints": {
        "no_us_material": bool,
        "auto_grade": bool,
        "custom_notes": str,
        "deadline_override": date | null
      }
    }
  ```
- **实现**：MPS 上传阶段采用规则解析 `custom_notes` 并填充 `constraints`；对话式调度阶段由 `intent_recognizer` 识别意图后，由用户确认结构化参数再写入覆盖项。Excel 读取使用 `openpyxl`，必填列：`fg_pn, qty, due_date, priority`。

---

#### Module 2: `bom_expander`

- **职责**：根据 FG P/N 递归展开多层 BOM 树，返回完整的物料节点列表。
- **接口**：
  ```
  输入: fg_pn (str), no_us_material (bool)
  输出: BOMTree (list of BOMNode)
    BOMNode {
      "material_pn": str,
      "parent_pn": str | None,
      "level": int,
      "qty_per": float,        # 每上层单位用量
      "is_us_material": bool,
      "aml": list[str]         # 替代料 P/N 列表
    }
  ```
- **实现**：从 SQLite `bom_master` 表递归查询（最多 10 层）。若 `no_us_material=True`，对每个 `is_us_material=True` 的节点，优先选取 `aml` 中第一个非美系物料替换。若 `aml` 为空，返回告警但不阻断展开。

---

#### Module 3: `material_master_fetcher`

- **职责**：批量拉取物料快照，供排程算法使用。
- **接口**：
  ```
  输入: material_pns (list[str])
  输出: dict[str, MaterialMaster]
    MaterialMaster {
      "lead_time_days": int,
      "actual_delivery_date": date | None,
      "shelf_life_expiry": date | None,
      "on_hand_inventory": float,
      "in_transit_inventory": float,
      "safety_stock": float,
      "lot_size": float,
      "yield_rate": float          # 0.0 ~ 1.0，如 0.95 代表良率 95%
    }
  ```
- **实现**：从 SQLite `material_master` 表查询，Demo 阶段数据由上传 Excel 预置。

---

#### Module 4: `mrp_engine`（核心算法，纯 Python，禁止 LLM 参与计算）

- **职责**：执行启发式 MRP 排程计算。
- **接口**：
  ```
  输入: MRPInput {
    "orders": list[ParsedOrder],
    "bom_tree": list[BOMNode],
    "material_master": dict[str, MaterialMaster],
    "today": date
  }

  输出（成功）: MRPResult {
    "status": "success",
    "planned_orders": list[PlannedOrder],
    "auto_resolved": list[AutoResolveLog]
  }

  输出（冲突）: MRPResult {
    "status": "conflict",
    "planned_orders": list[PlannedOrder],   # 已计算完成的部分
    "conflicts": list[ConflictItem]
  }

  PlannedOrder {
    "material_pn": str,
    "fg_pn": str,                  # 归属的成品订单
    "gross_req": float,            # 毛需求
    "net_req": float,              # 净需求（扣库存后）
    "gross_with_yield": float,     # 良率放大后的毛需求
    "planned_qty": float,          # 向上取整至 Lot Size 后的计划数量
    "planned_order_date": date,    # 需下单日（today 到 due_date 倒推 lead_time）
    "status": "ok" | "auto_resolved" | "conflict"
  }

  ConflictItem {
    "material_pn": str,
    "fg_pn": str,
    "priority": "high" | "low",
    "conflict_code": str,          # 见下方枚举
    "message": str,                # 人类可读描述
    "suggested_actions": list[str] # 建议列表
  }
  ```
- **核心计算步骤**（按此顺序执行，不可跳过）：
  1. **保质期检查**：若 `shelf_life_expiry < planned_use_date`，直接标记 `SHELF_LIFE_EXPIRED`，禁止使用。
  2. **Gross-to-Net**：`net_req = max(0, gross_req - on_hand - in_transit)`。
  3. **Yield 放大**：`gross_with_yield = net_req / yield_rate`，向上取整至 `lot_size`。
  4. **Lead Time 倒推**：`planned_order_date = due_date - lead_time_days`。若 `planned_order_date < today`，标记 `LEAD_TIME_OVERDUE`。
  5. **安全库存检查**：若 `auto_resolve` 条件满足（低优先级 + 动用安全库存 < 20%），自动应用并记录至 `auto_resolved`。
- **冲突码枚举**：

  | code                  | 描述                     |
  | --------------------- | ---------------------- |
  | `SHELF_LIFE_EXPIRED`  | 物料在计划使用时已过保质期          |
  | `LEAD_TIME_OVERDUE`   | Lead Time 倒推后，需下单日早于今日 |
  | `HIGH_PRIORITY_DELAY` | 高优先级订单面临延期风险           |
  | `NO_SUBSTITUTE_FOUND` | 涉美物料无可用替代料             |
  | `STOCK_BELOW_SAFETY`  | 库存低于安全库存且无法自愈          |


---

#### Module 5: `conflict_analyzer`

- **职责**：接收 `mrp_engine` 的冲突列表，由 LLM（Agent 4）将其翻译为人类可读报告，并生成多条 `suggested_actions`。
- **实现**：LLM 仅负责自然语言生成，不做任何数值计算。将 `ConflictItem` 序列化为 JSON 传入 LLM Prompt，要求输出 Markdown 格式报告。

---

#### Module 6: `plan_version_manager`

- **职责**：持久化排产版本，支持 Version A vs Version B 对比查询，管理审批状态流转。
- **数据库表 `mrp_plan_sessions`**：
  ```
  id, session_id, fg_pn, version ("A"|"B"),
  planned_orders_json, conflict_report_json,
  status ("pending_approval"|"approved"|"srm_synced"),
  selected_version ("A"|"B"|null),
  created_at, approved_at, approved_by
  ```
- **状态机**：`pending_approval` → （人类 Approve） → `approved` → （Agent 4 同步 SRM） → `srm_synced`

---

#### Module 7: `srm_syncer`（Mock）

- **职责**：Demo 阶段模拟 SRM 同步，将 Planned Orders 写入 SQLite `srm_sync_log` 表并返回成功。
- **接口**：
  ```
  输入: list[PlannedOrder], session_id
  输出: { "status": "ok", "synced_count": int, "message": str }
  ```

---

#### Module 8: `disruption_intake`（地震中断事件接收器）

> 地震监控、Geo 匹配、供应商排查、预警邮件，全部由外部工具 `japan-earthquake-supply-chain` 完成。本模块是该工具的**下游接收端**，不重复实现上述能力。

- **职责**：提供供应链中断事件的录入接口和爆炸半径计算，并触发重排程。
- **接口**：
  ```
  POST /api/disruptions
  输入: DisruptionEvent {
    "supplier_name": str,
    "affected_material_pns": list[str],   # 采购填写，对应本系统 BOM 中的物料 P/N
    "disruption_days": int,               # 预计停产天数
    "new_available_date": date,           # 预计恢复供货日期
    "source": "earthquake" | "delay" | "other",
    "note": str
  }
  输出: DisruptionResult {
    "disruption_id": str,
    "blast_radius": list[BlastItem]       # 受影响的成品订单清单
  }
  BlastItem {
    "fg_pn": str,
    "original_due_date": date,
    "estimated_delay_days": int
  }
  ```
- **实现**：将 `DisruptionEvent` 写入 `disruption_events` 表；根据 `affected_material_pns` 反向追溯 BOM，找出所有依赖该物料的成品订单（爆炸半径）；触发 Agent 5 携带爆炸半径信息调用 `bom_expander` + `mrp_engine` 重排程。

---

#### Module 9: `shelf_life_monitor`

- **职责**：每日 Cron 扫描物料主数据，发现距离过期 ≤30 天的物料，触发邮件预警。
- **实现**：APScheduler 每日 08:00 执行；邮件内容含 P/N、库存量、到期日、建议处置方向。

---

#### Module 10: `notification_service`

- **职责**：统一的邮件/日志通知出口，所有 Agent 均通过此模块发送通知。
- **接口**：
  ```
  输入: NotificationPayload {
    "type": "red_alert"|"yellow_alert"|"shelf_life"|"approval_needed"|"srm_synced",
    "subject": str,
    "body": str,
    "recipients": list[str],
    "cc": list[str]
  }
  ```
- **实现**：Demo 阶段优先打印日志；SMTP 配置完整时自动切换为真实发送。

---

#### Module 11: `intent_recognizer`（对话意图识别器）

- **职责**：识别计划员自然语言意图并输出结构化确认需求。
- **Phase 1 支持意图**：
  - `modify_deadline`：交期修改
  - `substitute_material`：特定物料替换策略
  - `unknown`：未识别意图
- **接口**：
  ```
  输入: message (str)
  输出: IntentResult {
    "intent_type": "modify_deadline"|"substitute_material"|"unknown",
    "recognized_params": dict,
    "missing_params": list[str],
    "confirmation_prompt": str,
    "raw_user_message": str
  }
  ```
- **实现边界**：
  - 允许调用 LLM 做意图识别；LLM 不可用时自动降级为规则解析。
  - 无论是否调用 LLM，均禁止生成排产数值，必须等待用户确认结构化参数。

---

#### Module 12: `chat_dispatch_api`（对话调度接口）

- **职责**：提供对话发送、参数确认、历史查询，并触发基于既有 Session 的重排程。
- **接口**：
  ```
  POST /api/chat/message
  输入: { "session_id": str, "message": str }
  输出: { "session_id": str, "intent": IntentResult, "needs_confirmation": bool }

  POST /api/chat/confirm
  输入: {
    "session_id": str,
    "intent": dict,
    "confirmed_params": dict
  }
  输出: {
    "session_id": str,
    "mrp_status": "success"|"conflict",
    "plan_status": str
  }

  GET /api/chat/{session_id}/history
  输出: { "session_id": str, "items": list[ChatMessage] }
  ```
- **数据表 `chat_messages`**：
  ```
  id, session_id, role("user"|"assistant"), content, intent_json, created_at
  ```

---

### Human-in-the-loop 实现机制

1. Agent 4 完成 Version A/B 生成后，调用 `plan_version_manager` 将 `session` 写入 DB，`status='pending_approval'`。
2. 前端每 5 秒轮询 `GET /api/plans?status=pending_approval`，发现新任务后展示对比界面。
3. 计划员点击"批准 Version B"后，前端调用 `POST /api/plans/{session_id}/approve`，Body 中携带 `{ "selected_version": "B" }`。
4. FastAPI 更新 DB `status='approved'`，Agent 4 的 Crew Task 通过轮询 DB 感知到审批结果后继续执行（调用 `srm_syncer`）。

---

### 前端界面模块（Next.js）


| 页面/组件                 | 功能                                                      |
| --------------------- | ------------------------------------------------------- |
| `/` 首页 Dashboard      | 显示当前所有 Plan Sessions 状态（Pending/Approved/Synced）及异常预警摘要 |
| `/mps/new`            | MPS 上传页：Excel 文件拖拽上传 + 自然语言备注输入框 + 提交按钮                 |
| `/mps/[session_id]`   | MPS 解析结果确认页：展示识别出的约束标签，计划员二次确认后提交排产                     |
| `/plans/[session_id]` | 排产结果页：Version A vs Version B 对比表格 + Approve/Reject 按钮   |
| `/chat`               | 对话式调度页：Session 选择 + 对话历史 + 意图确认表单 + 重排程触发               |
| `/alerts`             | 异常事件列表：地震预警、保质期预警、内部 Delay 事件                           |
| `/data/bom`           | BOM 主数据管理：查看、上传 Excel 导入                                |
| `/data/materials`     | 物料主数据管理：查看、上传 Excel 导入、手动编辑库存                           |
| `ChatPanel`（全局悬浮）     | 任意页面快速发起对话式调度，支持跳转 `/chat` 完整视图                         |


**设计规范**：深色主题（Dark）、蓝灰色系工业风 UI；状态色语义明确（红色=异常/危险、黄色=预警、绿色=正常/已审批）；对比版本表格中差异行高亮显示；所有操作需即时反馈（Loading State）。

---

### SQLite 表结构（Demo 核心表）

```
mps_orders          (session_id, fg_pn, qty, due_date, priority, constraints_json)
bom_master          (parent_pn, child_pn, qty_per, level, is_us_material, aml_json)
material_master     (material_pn, lead_time_days, actual_delivery_date, shelf_life_expiry,
                     on_hand_inventory, in_transit_inventory, safety_stock, lot_size, yield_rate)
mrp_plan_sessions   (session_id, version, planned_orders_json, conflict_report_json,
                     status, selected_version, created_at, approved_at)
disruption_events   (event_id, supplier_name, affected_material_pns_json, disruption_days,
                     new_available_date, source, note, blast_radius_json, status, created_at)
srm_sync_log        (session_id, synced_at, planned_orders_json, result_json)
shelf_life_alerts   (material_pn, expiry_date, stock_qty, alerted_at)
chat_messages       (id, session_id, role, content, intent_json, created_at)
```

> `supplier_master` 表已移除：供应商地理信息与地震 Geo 匹配由 `japan-earthquake-supply-chain` 工具维护。本系统仅在 `disruption_events` 中存储采购确认后的中断结论，不重复存储供应商地理主数据。

---

## Testing Decisions

**测试原则**：只测试外部行为（输入 → 输出），不测试内部实现细节。Mock 所有外部依赖（SQLite 用内存数据库，LLM 用 Mock 返回固定结果）。


| 模块                      | 测试重点                                                          | 测试类型                                    |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `mrp_engine`            | 核心计算的正确性：净需求、Yield 放大、Lot Size 取整、Lead Time 倒推、保质期阻断、安全库存自愈阈值 | 单元测试（pytest），覆盖所有冲突码的触发条件               |
| `bom_expander`          | 多层递归展开的正确性；涉美物料替换逻辑；无替代料时返回告警而非报错                             | 单元测试，用内存 SQLite 预置测试 BOM 数据             |
| `plan_version_manager`  | 状态机流转：`pending→approved→srm_synced` 的正确性，不可跳步                 | 单元测试                                    |
| `conflict_analyzer`     | 验证 LLM 输出包含所有冲突码对应的建议（通过正则匹配关键词，不验证具体措辞）                      | 集成测试（Mock LLM）                          |
| `mps_parser` (Excel 解析) | 正确读取标准格式 Excel；缺列时返回明确错误；空行跳过                                 | 单元测试                                    |
| `intent_recognizer`     | 意图识别输出结构稳定；LLM 不可用时自动降级；仅输出意图不输出计算结果                          | 单元测试                                    |
| `chat_dispatch_api`     | `message -> confirm -> reschedule` 闭环；参数校验与错误提示正确             | API 测试                                  |
| Agent 端到端流程             | Happy Path：上传 MPS → 排产成功 → Approve → SRM 同步                   | 端到端测试（FastAPI TestClient + Mock CrewAI） |
| 对话式端到端流程                | 自然语言 -> 意图识别 -> 用户确认结构化参数 -> 重排程 -> 方案对比                      | 端到端测试（FastAPI TestClient）               |


---

## Observability & Metrics（监测指标与评估系统）

### 业务核心指标（Business KPIs）


| 指标                       | 定义                                                    | 采集方式                      |
| ------------------------ | ----------------------------------------------------- | ------------------------- |
| MRP 计划生成成功率              | `status=success` 的 Session 占总 Session 的比例             | 查询 `mrp_plan_sessions`    |
| 自动愈合率（Auto-resolve Rate） | 触发安全库存自愈的 PlannedOrder 占总 PlannedOrder 的比例            | 统计 `auto_resolved` 字段     |
| 人工审批通过率                  | `approved` 数 / (`approved` + `rejected`) 数            | 查询 `mrp_plan_sessions`    |
| 冲突分布（按冲突码）               | 各冲突码（SHELF_LIFE_EXPIRED / LEAD_TIME_OVERDUE 等）的触发次数占比 | 解析 `conflict_report_json` |
| 异常响应时长                   | 从 `DisruptionEvent` 写入到爆炸半径计算完成的时间差                   | `disruption_events` 时间戳   |
| 保质期预警准时率                 | 距到期 ≤30 天时成功发出预警的物料比例                                 | `shelf_life_alerts` 表     |


### 系统性能指标（System Performance）


| 指标               | 采集方式                                                                   | 告警阈值                |
| ---------------- | ---------------------------------------------------------------------- | ------------------- |
| API 平均响应时间（P95）  | FastAPI Middleware 记录每个请求的 `duration_ms`                               | P95 > 3000ms 时日志告警  |
| MRP 引擎计算耗时       | `mrp_engine` 内部 `time.perf_counter()` 计时                               | 单次 > 5000ms 时日志告警   |
| Agent Crew 总执行时间 | CrewAI `on_crew_end` 回调记录                                              | 单次 Crew > 60s 时日志告警 |
| 数据库查询耗时          | SQLAlchemy `before_cursor_execute` / `after_cursor_execute` event hook | 单次查询 > 1000ms 时日志告警 |


### Agent 质量指标（Agent Quality）


| 指标         | 定义                                                 | 评估方式                            |
| ---------- | -------------------------------------------------- | ------------------------------- |
| 意图解析准确率    | Agent 1 正确识别约束标签（no_us_material / auto_grade 等）的比例 | 对比 Demo 预定义 Ground Truth，单元测试覆盖 |
| 冲突报告覆盖率    | `conflict_analyzer` 输出中包含所有 `ConflictItem` 对应建议的比例 | 正则匹配关键词（与测试策略一致）                |
| LLM 调用失败率  | Agent 执行中 LLM API 错误次数 / 总调用次数                     | `agent_run_logs` 表统计            |
| Agent 重试次数 | 每次 Crew 运行中各 Agent Task 的重试次数                      | `agent_run_logs` 表记录            |


### 可观测性实现

**结构化日志**：所有模块使用 Python `logging`，输出 JSON 格式，固定字段：

```json
{ "timestamp": "...", "level": "INFO", "module": "mrp_engine",
  "session_id": "...", "duration_ms": 120, "status": "success", "message": "..." }
```

**指标持久化**：新增 2 张表，专门记录运行时数据：

```
system_metrics   (id, session_id, metric_name, value_float, unit, recorded_at)
agent_run_logs   (id, session_id, agent_name, task_name,
                  start_at, end_at, duration_ms, status, error_message)
```

**Dashboard 指标卡片**（首页新增 4 个实时指标卡）：


| 卡片               | 数据来源                |
| ---------------- | ------------------- |
| 今日 MRP 生成数 / 成功率 | `system_metrics`    |
| 待审批 Session 数    | `mrp_plan_sessions` |
| 平均 MRP 计算耗时（ms）  | `system_metrics`    |
| 活跃中断事件数          | `disruption_events` |


**API 接口**：

```
GET /api/metrics/summary    # 返回 Dashboard 指标卡聚合数据
GET /api/metrics/agent-logs # 返回 agent_run_logs 列表，支持按 session_id 过滤
```

---

## Out of Scope

- **机台产能约束（Capacity Planning）**：不考虑机台、人力资源限制，排程结果仅基于时间和物料。
- **真实外部系统 API 对接**：MES、ERP、SRM 均使用 SQLite 模拟，不与任何真实系统通信。
- **用户鉴权与权限管理**：Demo 无登录体系，所有用户共享同一视图。
- **成本与财务计算**：不涉及采购金额、库存持有成本等财务维度。
- **Lot 追溯与序列化管理**：不做 Lot 级别的追踪，只计算数量。
- **机器学习 Yield 预测**：良率使用物料主数据中的历史静态值，不做动态预测。
- **多工厂/多仓库支持**：Demo 假设单一工厂单一仓库场景。
- **复杂多约束对话推理**：Phase 1 仅支持 `modify_deadline` 与 `substitute_material` 两类意图，不支持分批交付、成本最优等复杂策略。

---

## Further Notes

- **MPS 上传 Excel 模板**：需提供标准 Excel 模板供下载，必填列：`fg_pn`、`qty`、`due_date`（格式 `YYYY-MM-DD`）、`priority`（`high` 或 `low`）。BOM 主数据 Excel 必填列：`parent_pn`、`child_pn`、`qty_per`、`is_us_material`（`Y/N`）、`aml`（逗号分隔）。
- **CrewAI Agent 分工边界**：Agent 3 的 CrewAI Task 描述中需明确：LLM 只负责"将数据打包为正确的 JSON 格式并调用 `mrp_engine` Tool"，禁止 LLM 自己做数值推断或估算。
- **保质期预警与排产阻断的时间边界**：预警（提前 30 天邮件）和排产阻断（计划使用当日已过期）是两个独立判断，互不干扰。
- **地震工具的集成边界**：`[japan-earthquake-supply-chain](https://github.com/Kerwin0624/japan-earthquake-supply-chain)` 是独立运行的外部工具，负责 JMA 数据拉取、供应商 Geo 匹配、预警邮件发送（阈值：黄色 ≥4 级、红色 ≥5弱）。本系统**不调用其内部代码**，仅通过业务流程衔接：采购收到该工具的预警邮件后，进入本系统的"中断事件录入"页面，填写最终影响结论，触发本系统的重排程流程。两个系统的分工边界：工具负责"发现与预警"，本系统负责"确认与调度"。

