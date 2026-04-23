# 半导体供应链 Multi-Agent 系统核心工作流

## 工作流 1：标准 MRP 生成与低风险自愈 (Happy Path & Auto-resolve)
**场景**：计划员手动输入 MPS，系统顺畅排产，或仅遇到极小的库存波动。

1. **输入与解析 (Agent 1 - 意图解析)**：
   * 计划员上传 MPS（FG P/N、数量、交期、优先级），并在备注栏输入特色需求，例如："车规级，优先保障，禁用美系物料"。
   * Agent 1 提取结构化数据，并将自然语言转化为硬性约束标签：`[Auto-Grade: True]`, `[Priority: High]`, `[US-Material: False]`。
2. **数据准备与 BOM 展开 (Agent 2 - BOM与主数据)**：
   * Agent 2 接收标签，执行多层 BOM 展开（FG -> Assy -> Wafer -> Die）。
   * **按需替代**：根据 `[US-Material: False]` 标签，自动将 BOM 中的所有涉美物料替换为非美系（如日本、台湾、中国大陆）的替代料（AML）。若无此标签，则按默认 BOM 展开。
   * 去各系统拉取最新快照：Lead Time、库存水位、在途 PO、Lot Size、Yield、保质期。
3. **引擎计算 (Agent 3 - MRP 运筹计算)**：
   * Agent 3 将数据喂给底层**启发式算法代码**进行排程（Gross-to-Net, Lead Time 倒推）。
   * *分支 A（完美排产）*：无冲突，生成标准 Planned Order。
   * *分支 B（低风险冲突）*：发现某低优先级订单交期有风险，但算法测算"动用 15% 安全库存"即可按时交付（满足 `<20%` 的硬编码规则）。算法自动应用此策略，并打上 `[Auto-Resolved]` 标记。
4. **协同与下发 (Agent 4 - 计划协同与执行)**：
   * Agent 4 将排产结果展示给计划员，高亮显示低风险自愈的改动点。
   * 计划员点击"Approve（批准）"。
   * Agent 4 调用 SRM 系统 API，向供应商同步采购计划和交期。

---

## 工作流 2：高风险约束冲突与人类决策 (High-Risk Conflict Path)
**场景**：算法排产时撞到了"硬墙"（如高优订单延期、物料过期），必须人类介入。

1. **计算阻断与异常抛出 (Agent 3 - MRP 运筹计算)**：
   * 算法在倒推排产时发现致命冲突：
     * *冲突 1*：某高优先级订单（Priority: High）由于晶圆厂 Lead Time 不足，面临延期风险（触发"高优订单变动即高风险"规则）。
     * *冲突 2*：某批次环氧树脂（Epoxy）在计划上线日期时已过期（触发"过期绝对禁用"规则）。
   * 算法停止该分支的自动排产，抛出带有具体瓶颈参数的异常。
2. **方案拟定与版本对比 (Agent 4 - 计划协同与执行)**：
   * Agent 4 捕获异常，将冷冰冰的代码错误转化为人类可读的报告，并生成建议：
     * *针对冲突 1*："建议将订单 B（低优）的在制晶圆挪用给该高优订单，或接受延期 2 周。"
     * *针对冲突 2*："该批次物料已过期，算法已禁用。建议：报废该批次，并加急采购新料。"
   * Agent 4 强制生成 **对比版本 (Version A 原计划 vs Version B 建议调整计划)** 供人类决策。
3. **人类决策与执行**：
   * 计划员在界面上对比版本，选择接受 Version B（挪用晶圆 + 加急采购）。
   * 审批通过后，Agent 4 同步 SRM 系统并更新 MES/ERP 状态。

---

## 工作流 3：外部/内部异常调度 (Exception Dispatch Path)
**场景**：突发日本地震，或日常监控发现交期 Delay / 库存跌破安全线 / 供应商交期数量异常。

### 3a. 地震等外部突发事件
1. **异常捕获与确认 (Agent 5 - 异常监控与调度)**：
   * *外部异常*：Agent 5 定时触发 `japan-earthquake-supply-chain` Tool。发现日本某地 5 级地震，排查**所有原物料供应商**，匹配到某关键供应商在震区。
   * Agent 5 立即发送 Red Alert 邮件给采购，抄送计划员。
   * 采购线下核实后，在系统中确认："该供应商停产 2 周，交期 Delay"。
2. **爆炸半径计算与重排程触发 (Agent 5 -> Agent 2 & 3)**：
   * Agent 5 拿到确定的 Delay 参数，计算"爆炸半径"（影响了哪些 FG 订单）。
   * 带着这些受影响的订单和新的交期约束，Agent 5 唤醒 Agent 2（更新主数据）和 Agent 3（重新运行排程算法）。
3. **生成调度方案 (Agent 4 - 计划协同与执行)**：
   * Agent 3 吐出受地震影响后的新排程结果。
   * Agent 4 再次生成 **对比版本 (Version A 震前原计划 vs Version B 震后调整计划)**。
   * 计划员查看 Version B（可能包含了启用备用供应商、部分订单延期等妥协方案），确认无误后 Approve，系统下发更新。

### 3b. 保质期预警（独立 Cron Job）
* Agent 5 每日扫描库存，发现某批次物料距离过期还有 30 天，提前 1 个月触发预警邮件给计划员和库房："请尽快安排消耗或复测"。

### 3c. 供应商交期/数量异常（最常见场景）
**场景**：计划员与供应商日常沟通中获悉某供应商无法按原计划交货（交期延迟或交付数量不足），需要调整已有 MRP 计划。这是日常工作中最高频的异常处理场景。

1. **异常信息获取**：
   * 计划员通过电话/邮件/会议等渠道与供应商沟通，获悉异常情况，例如：
     * "NITTO 反馈物料 02-01-0135 交期延迟 2 周"
     * "供应商 X 反馈 32-03-0168 只能交付原计划的 80%，产能不足"
     * "Y 供应商因设备检修，本批次 delay 10 天"
2. **自然语言录入与意图识别**：
   * 计划员进入 `/chat` 页面或全局 `ChatPanel`，选择关联的已有 `session_id`，用自然语言描述异常：
     > "NITTO 反馈物料 02-01-0135 交期延迟 2 周，只能交付 80%。"
   * `intent_recognizer` 识别为 `supply_disruption` 意图（LLM 优先解析，不可用时自动降级为关键词匹配），系统输出结构化确认表单（最多 5 问采访）。
3. **结构化参数确认（Human-in-the-loop）**：
   * 前端展示 Agent 生成的采访表单，计划员逐项确认：
     * `supplier_name`：受影响供应商名称（如 NITTO）
     * `affected_material_pns`：受影响物料料号，多个用逗号分隔（如 02-01-0135）
     * `disruption_days`：预计影响天数（如 14）
     * `new_available_date`：预计恢复供货日期（如 2026-04-21）
     * `note`：补充说明（如"产能不足，只能交付 80%"）
   * 未确认前系统不会触发任何重排程操作，确保参数准确。
4. **爆炸半径计算与 MRP 重排程**：
   * 系统创建 `DisruptionEvent` 事件记录（`source = "delay"` 或 `"other"`）。
   * **爆炸半径计算**：反向追溯 BOM 树，找出所有依赖该物料的成品 FG 订单，估算各订单延期天数。
   * **触发 MRP 重排程**：唤醒 Agent 2（更新主数据快照）+ Agent 3（重跑 MRP 引擎）+ Agent 4（生成调整前 vs 调整后版本对比）。
5. **方案对比与审批**：
   * 计划员在 `/plans/[sessionId]/compare` 页面查看 Version A（调整前原计划）vs Version B（调整后方案）。
   * 确认无误后 Approve，系统更新采购计划并同步 SRM。
   * 全流程对话记录写入 `chat_messages`，支持 `GET /api/chat/{session_id}/history` 追溯。

---

## 工作流 4：对话式二次调度（Session-Bound Conversational Dispatch）
**场景**：MPS 已完成首轮排产后，计划员希望继续通过自然语言对某个既有 Session 进行约束调整与重排程。

1. **对话输入与意图识别（Conversation Layer）**：
   * 计划员在全局悬浮 `ChatPanel` 或独立 `/chat` 页面，选择已有 `session_id` 后输入自然语言（如："车规级产品不晚于 2026-06-30"）。
   * `POST /api/chat/message` 触发 `intent_recognizer`，输出 `intent_type`、`recognized_params`、`missing_params` 与 `confirmation_prompt`。
   * LLM 仅用于意图识别；若 LLM 调用失败，则自动降级到规则识别，不中断流程。
2. **结构化参数确认（Human-in-the-loop）**：
   * 若存在缺失字段（如 `new_due_date`、`target_fg_pn`），前端展示结构化确认表单。
   * 计划员提交 `POST /api/chat/confirm`，显式给出结构化参数；未确认前不得触发重排程。
3. **确定性重排程（Agent 2/3/4 复用）**：
   * `crew.reschedule_session(...)` 基于原 Session 订单与确认参数执行重排程，调用 Agent 2（BOM/主数据）+ Agent 3（MRP 引擎）+ Agent 4（版本管理）。
   * 若是指定 `target_fg_pn` 的交期修改，仅对目标订单生效，不做全局 deadline 覆盖。
   * 生成新的 Version A/B，并替换该 Session 下旧的 `pending_approval` 版本，避免重复待审批记录。
4. **结果回显与追溯**：
   * 前端继续在计划对比页查看新版本差异并审批。
   * 全流程消息（用户输入、系统确认提示、确认结果）写入 `chat_messages`，支持 `GET /api/chat/{session_id}/history` 追溯。
