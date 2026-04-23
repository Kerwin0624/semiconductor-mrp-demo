from __future__ import annotations

from dataclasses import asdict

from app.modules.mrp_engine import ConflictItem


def generate_conflict_report(conflicts: list[ConflictItem]) -> dict:
    """
    Phase 3 default implementation.
    PRD 允许 Agent 4 用 LLM 生成更自然的报告，这里先提供稳定可测的结构化输出。
    """
    code_groups: dict[str, list[ConflictItem]] = {}
    for conflict in conflicts:
        code_groups.setdefault(conflict.conflict_code, []).append(conflict)

    lines = ["# MRP 冲突分析报告", ""]
    summaries = []
    for code, items in code_groups.items():
        lines.append(f"## {code} ({len(items)})")
        for item in items:
            lines.append(f"- FG `{item.fg_pn}` / 物料 `{item.material_pn}`: {item.message}")
        lines.append("")
        summaries.append({"code": code, "count": len(items)})

    suggested_actions: list[str] = []
    for conflict in conflicts:
        for action in conflict.suggested_actions:
            if action not in suggested_actions:
                suggested_actions.append(action)

    return {
        "markdown_report": "\n".join(lines).strip(),
        "summary": summaries,
        "conflicts": [asdict(item) for item in conflicts],
        "suggested_actions": suggested_actions,
    }
