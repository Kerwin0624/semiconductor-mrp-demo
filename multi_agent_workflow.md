# 半导体供应链 Multi-Agent 系统——计划员完整工作流

> 🟦 蓝色节点 = LLM 参与环节；其余节点均为确定性代码或人工操作，不着色。

```mermaid
flowchart TD
    classDef llm fill:#1d4ed8,stroke:#93c5fd,color:#fff,stroke-width:2px

    %% ── ① 数据准备 ──
    START(("计划员<br/>开始工作")) --> DATA_CHK{"主数据<br/>是否就绪？"}
    DATA_CHK -->|"否"| P0_BOM["上传 BOM Excel"]
    DATA_CHK -->|"否"| P0_MAT["上传物料主数据 Excel"]
    P0_BOM --> P0_DB[("bom_master<br/>material_master")]
    P0_MAT --> P0_DB
    DATA_CHK -->|"是"| MPS_PAGE
    P0_DB --> MPS_PAGE

    %% ── ② MPS 录入 ──
    MPS_PAGE["进入 /mps/new"] --> MPS_EXCEL["上传 MPS Excel<br/>fg_pn · qty · due_date · priority"]
    MPS_PAGE --> MPS_NOTE["填写自然语言约束备注"]
    MPS_EXCEL --> SUBMIT["提交并解析"]
    MPS_NOTE --> SUBMIT

    %% ── ③ Agent 流水线 ──
    SUBMIT --> AG1

    AG1["🧠 Agent 1 意图解析<br/>LLM / 规则：自然语言→约束标签<br/>no_us_material · auto_grade<br/>生成 Session ID"]:::llm

    AG1 --> AG2

    AG2["Agent 2 BOM 与主数据<br/>多层递归展开 · 涉美替换<br/>拉取物料主数据快照"]

    AG2 --> AG3

    AG3["Agent 3 MRP 引擎（纯 Python）<br/>保质期→Gross-to-Net→Yield放大<br/>→LeadTime倒推→安全库存检查"]

    AG3 --> BRANCH{"引擎结果"}

    BRANCH -->|"success / auto_resolved"| AG4_OK["Agent 4 生成方案<br/>写入 pending_approval"]
    BRANCH -->|"conflict"| AG4_RPT["🧠 Agent 4 冲突报告<br/>LLM 翻译为人类可读报告<br/>+ 建议处理方向"]:::llm

    AG4_RPT --> AG4_AB["Agent 4 版本生成<br/>Version A 原计划<br/>vs Version B 建议调整"]

    AG4_OK --> REVIEW
    AG4_AB --> REVIEW

    %% ── ④ 人工审批 ──
    REVIEW["查看排产详情 /plans/sessionId<br/>MPS概况 · 冲突报告 · 排产明细"]
    REVIEW --> EDIT["手工编辑采购量/下单日<br/>前端实时评估效果"]
    REVIEW --> COMPARE["A/B 版本对比"]
    EDIT --> APPROVAL{"审批决策"}
    COMPARE --> APPROVAL
    APPROVAL -->|"需讨论"| EXPORT["导出 CSV 离线讨论"]
    EXPORT --> APPROVAL
    APPROVAL -->|"通过"| SRM["审批→SRM 同步<br/>srm_synced"]

    %% ── 后续场景分支 ──
    SRM --> NEXT{"后续场景"}
    NEXT -->|"客户调整需求"| CHAT_ENTRY
    NEXT -->|"供应商反馈异常"| SUP_ENTRY
    NEXT -->|"外部突发事件"| EQ_ENTRY
    NEXT -->|"日常监控"| DASH_ENTRY

    %% ── ⑤ 对话式二次调度 ──
    subgraph WF4["⑤ 对话式调度 modify_deadline / substitute_material"]
        CHAT_ENTRY["选择已有 Session"]
        CHAT_NL["输入自然语言指令"]
        CHAT_INTENT["🧠 意图识别 intent_recognizer<br/>LLM 优先→规则降级<br/>输出 intent + 采访问题"]:::llm
        CHAT_FORM["结构化确认表单<br/>new_due_date / target_fg_pn 等"]
        CHAT_CONFIRM["用户确认参数"]
        CHAT_TRIGGER["触发 reschedule_session"]
        CHAT_HIST[("chat_messages")]

        CHAT_ENTRY --> CHAT_NL --> CHAT_INTENT --> CHAT_FORM --> CHAT_CONFIRM --> CHAT_TRIGGER
        CHAT_NL -.-> CHAT_HIST
        CHAT_CONFIRM -.-> CHAT_HIST
    end
    CHAT_TRIGGER -->|"复用 Agent 2→3→4"| AG2

    %% ── ⑥c 供应商交期/数量异常（最常见） ──
    subgraph WF3C["⑥c 供应商交期/数量异常（最常见）"]
        SUP_ENTRY["与供应商沟通<br/>交期 delay / 数量不足"]
        SUP_NL["自然语言描述异常"]
        SUP_INTENT["🧠 意图识别<br/>识别为 supply_disruption<br/>LLM 优先→关键词降级<br/>生成 5 问采访表单"]:::llm
        SUP_FORM["结构化确认表单<br/>supplier · materials<br/>disruption_days · date · note"]
        SUP_CONFIRM["用户确认参数"]

        SUP_ENTRY --> SUP_NL --> SUP_INTENT --> SUP_FORM --> SUP_CONFIRM
    end
    SUP_CONFIRM --> BLAST

    %% ── ⑥a 地震等外部突发 ──
    subgraph WF3A["⑥a 地震等外部突发事件"]
        EQ_ENTRY["外部工具 Red Alert<br/>JMA→Geo匹配→预警邮件"]
        EQ_BUYER["采购核实影响"]
        EQ_RECORD["录入中断事件"]
        EQ_ENTRY --> EQ_BUYER --> EQ_RECORD
    end
    EQ_RECORD --> BLAST

    %% ── 爆炸半径→重排程（⑥a + ⑥c 共用） ──
    BLAST["爆炸半径计算<br/>反向追溯 BOM · 受影响订单 · 延期估算"]
    BLAST --> BLAST_RE["触发重排程 Agent 2+3+4"]
    BLAST_RE -->|"复用 Agent 2→3→4"| AG2

    %% ── ⑥b 保质期预警 ──
    subgraph WF3B["⑥b 保质期预警（自动）"]
        SHELF_SCAN["每日 08:00 Cron 扫描"]
        SHELF_WARN["距过期≤30天 预警通知"]
        SHELF_SCAN --> SHELF_WARN
    end

    %% ── ⑦ Dashboard ──
    subgraph WF7["⑦ 日常监控 Dashboard"]
        DASH_ENTRY["首页总览"]
        DASH_CARDS["指标卡片 · Session列表"]
        DASH_ALERT["异常预警"]
        DASH_ENTRY --> DASH_CARDS
        DASH_ENTRY --> DASH_ALERT
    end

    SHELF_WARN -.-> DASH_ALERT
    DASH_CARDS -->|"点击进入"| REVIEW
```

---

## LLM 参与边界

| 蓝色节点 | LLM 职责 | LLM 禁区 |
|---------|---------|---------|
| Agent 1 意图解析 | 自然语言→约束标签提取 | 不做数值推断 |
| Agent 4 冲突报告 | 冲突码→人类可读报告 + 建议方向 | 不做数值计算、不修改排产结果 |
| 对话意图识别 | 识别 intent_type + 生成采访问题 | 不猜测参数值、不生成排产数值 |
| 供应商异常识别 | 识别 supply_disruption + 5 问表单 | 不估算影响范围（由引擎计算） |

> LLM 不可用时自动降级为关键词规则匹配，不中断流程。
