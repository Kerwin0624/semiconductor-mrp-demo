# 计划员操作视角——从拿到 MPS 到采购下发

> 🟦 蓝色 = LLM 参与（自然语言理解 / 冲突报告生成）。其余为确定性代码或人工操作。

```mermaid
flowchart TD
    classDef llm fill:#1d4ed8,stroke:#93c5fd,color:#fff,stroke-width:2px

    %% ═══ 主线：首次排产 ═══

    S(("开始")) --> UPLOAD_DATA["上传 BOM + 物料主数据 Excel<br/>（首次或数据变更时）"]
    UPLOAD_DATA --> OPEN_MPS["进入 MPS 上传页"]
    S -->|"主数据已就绪"| OPEN_MPS

    OPEN_MPS --> FILL_MPS["上传 MPS Excel + 填写自然语言备注<br/>例：禁用美系物料，车规级 Q2 优先"]
    FILL_MPS --> PARSE["🧠 系统解析备注→约束标签<br/>LLM / 规则自动识别"]:::llm
    PARSE --> BOM_EXPAND["系统展开多层 BOM<br/>涉美物料自动替换为非美系替代料"]
    BOM_EXPAND --> MRP_CALC["系统运行 MRP 算法（纯 Python）<br/>保质期→净需求→Yield放大→LT倒推→安全库存"]

    MRP_CALC --> RESULT{"排产结果？"}

    RESULT -->|"全部通过 /<br/>低风险自愈"| PLAN_OK["生成排产方案"]
    RESULT -->|"高风险冲突"| CONFLICT["🧠 系统生成冲突报告<br/>LLM 翻译为人类可读建议"]:::llm
    CONFLICT --> VERSION_AB["系统生成 A/B 对比版本<br/>Version A 原计划 vs Version B 建议"]

    PLAN_OK --> VIEW_PLAN
    VERSION_AB --> VIEW_PLAN

    VIEW_PLAN["计划员查看排产详情<br/>MPS 概况 · 冲突报告 · 物料明细"]
    VIEW_PLAN --> HAND_EDIT["手工编辑采购量 / 下单日<br/>前端实时评估调整效果"]
    VIEW_PLAN --> AB_DIFF["查看 A/B 版本差异对比"]
    HAND_EDIT --> DECIDE{"审批？"}
    AB_DIFF --> DECIDE
    DECIDE -->|"导出讨论"| CSV["导出 CSV 离线讨论"] --> DECIDE
    DECIDE -->|"通过"| SRM["审批通过 → SRM 同步采购计划"]

    %% ═══ 支线 A：客户调整需求 ═══

    SRM --> AFTER{"排产后场景"}
    AFTER -->|"客户改了要求"| CHAT_A
    AFTER -->|"供应商反馈异常"| SUP_A
    AFTER -->|"外部突发事件"| EQ_A
    AFTER -->|"日常巡检"| DASH

    CHAT_A["选择已有 Session，输入自然语言<br/>例：车规级不晚于 2026-06-30"]
    CHAT_A --> CHAT_INTENT["🧠 系统识别意图<br/>LLM 优先→规则降级<br/>输出采访问题"]:::llm
    CHAT_INTENT --> CHAT_FORM["计划员确认结构化参数<br/>new_due_date / target_fg_pn 等"]
    CHAT_FORM --> RE_MRP_A["系统重排程<br/>基于原 Session + 新参数"]
    RE_MRP_A --> VIEW_PLAN

    %% ═══ 支线 B：供应商交期/数量异常（最常见） ═══

    SUP_A["与供应商沟通获知<br/>交期 delay 或数量不足"]
    SUP_A --> SUP_NL["自然语言描述异常<br/>例：NITTO 02-01-0135 延迟 2 周"]
    SUP_NL --> SUP_INTENT["🧠 系统识别为供应中断<br/>LLM 优先→关键词降级<br/>生成 5 问确认表单"]:::llm
    SUP_INTENT --> SUP_FORM["计划员确认参数<br/>supplier · materials · days · date"]
    SUP_FORM --> BLAST["系统计算爆炸半径<br/>反向追溯 BOM → 受影响订单"]
    BLAST --> RE_MRP_B["系统重排程<br/>生成调整前 vs 调整后对比"]
    RE_MRP_B --> VIEW_PLAN

    %% ═══ 支线 C：地震等外部突发 ═══

    EQ_A["收到外部工具地震预警邮件"]
    EQ_A --> EQ_VERIFY["采购核实供应商影响"]
    EQ_VERIFY --> EQ_INPUT["录入中断事件<br/>供应商 · 物料 · 停产天数"]
    EQ_INPUT --> BLAST

    %% ═══ 支线 D：日常监控 ═══

    DASH["打开 Dashboard 首页<br/>指标卡片 · Session 列表 · 异常预警"]
    DASH -->|"发现待审批"| VIEW_PLAN

    %% ═══ 保质期预警（自动后台） ═══

    CRON["每日 08:00 自动扫描保质期"] -.->|"距过期≤30天"| DASH
```

## LLM 参与边界

| 蓝色节点 | LLM 做什么 | LLM 不做什么 |
|---------|-----------|------------|
| 解析备注→约束标签 | 自然语言→ `no_us_material` / `auto_grade` | 不推断数值 |
| 冲突报告生成 | 冲突码→人类可读建议 | 不计算、不修改排产数值 |
| 对话意图识别 | 识别 intent_type + 生成采访问题 | 不猜参数值 |
| 供应商异常识别 | 识别 `supply_disruption` + 确认表单 | 不估算爆炸半径 |

> LLM 不可用时自动降级为关键词规则匹配，不中断流程。
