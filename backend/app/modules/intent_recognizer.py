from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from datetime import date
from typing import Literal

from app.config import settings

IntentType = Literal["modify_deadline", "substitute_material", "supply_disruption", "unknown"]


@dataclass(slots=True)
class IntentResult:
    intent_type: IntentType
    recognized_params: dict
    missing_params: list[str]
    confirmation_prompt: str
    raw_user_message: str
    final_confirmation_prompt: str
    interview_questions: list[dict] = field(default_factory=list)


def _normalize_interview_question(raw: dict, index: int) -> dict | None:
    if not isinstance(raw, dict):
        return None
    param_key = str(raw.get("param_key", "")).strip()
    question = str(raw.get("question", "")).strip()
    if not param_key or not question:
        return None
    input_type = str(raw.get("input_type", "text")).strip().lower()
    if input_type not in {"text", "date", "boolean", "select"}:
        input_type = "text"
    required = bool(raw.get("required", False))
    options = raw.get("options", [])
    if not isinstance(options, list):
        options = []
    options = [str(o).strip() for o in options if str(o).strip()]
    placeholder = str(raw.get("placeholder", "")).strip()
    return {
        "id": str(raw.get("id") or f"q_{index + 1}"),
        "param_key": param_key,
        "question": question,
        "input_type": input_type,
        "required": required,
        "options": options,
        "placeholder": placeholder,
    }


def _normalize_interview_questions(raw_list: list) -> list[dict]:
    result: list[dict] = []
    for idx, item in enumerate(raw_list[:5]):
        normalized = _normalize_interview_question(item, idx)
        if normalized:
            result.append(normalized)
    return result


def _build_fallback_intent(text: str) -> IntentResult:
    lowered = text.lower()

    disruption_keywords = [
        "交不了货", "无法交货", "交不够", "不能交货", "缺货",
        "停产", "减产", "延迟交货", "延期交货", "推迟交货",
        "断供", "不能供货", "无法供货", "供货中断", "供应中断",
        "交货量不足", "只能交", "只能供", "产能不足",
        "地震", "火灾", "洪水", "不可抗力",
        "计划有变", "供货计划变更", "交付延迟",
    ]
    has_disruption = any(kw in text for kw in disruption_keywords)

    has_deadline = ("q2" in lowered) or ("交期" in text) or ("截止" in text) or ("不晚于" in text) or ("due" in lowered)
    has_substitute = (
        ("禁用美系" in text)
        or ("替代料" in text)
        or ("美系" in text)
        or ("涉美" in text)
        or ("substitute" in lowered)
    )
    allow_us_material = (
        ("可使用涉美物料" in text)
        or ("可以使用涉美物料" in text)
        or ("使用涉美物料" in text and ("不再" in text or "可" in text or "可以" in text))
        or ("不禁用美系" in text)
        or ("允许美系" in text)
    )

    if has_disruption:
        interview_questions = [
            {
                "id": "q_supplier",
                "param_key": "supplier_name",
                "question": "受影响的供应商名称是？",
                "input_type": "text",
                "required": True,
                "options": [],
                "placeholder": "例如：NITTO",
            },
            {
                "id": "q_materials",
                "param_key": "affected_material_pns",
                "question": "受影响的物料料号有哪些？（多个用逗号分隔）",
                "input_type": "text",
                "required": True,
                "options": [],
                "placeholder": "例如：02-01-0135, 32-03-0168",
            },
            {
                "id": "q_days",
                "param_key": "disruption_days",
                "question": "预计影响/停产多少天？",
                "input_type": "text",
                "required": True,
                "options": [],
                "placeholder": "例如：14",
            },
            {
                "id": "q_date",
                "param_key": "new_available_date",
                "question": "预计何时能恢复供货？（如已知）",
                "input_type": "date",
                "required": False,
                "options": [],
                "placeholder": "YYYY-MM-DD",
            },
            {
                "id": "q_note",
                "param_key": "note",
                "question": "补充说明（原因、影响范围等）",
                "input_type": "text",
                "required": False,
                "options": [],
                "placeholder": "例如：地震导致工厂停产",
            },
        ]
        return IntentResult(
            intent_type="supply_disruption",
            recognized_params={},
            missing_params=["supplier_name", "affected_material_pns", "disruption_days"],
            confirmation_prompt="我理解这是一个供应链中断/异常事件。执行前我会先确认关键参数。",
            final_confirmation_prompt="以上信息是否正确？确认后将创建中断事件、计算爆炸半径并触发 MRP 重排程。",
            interview_questions=interview_questions,
            raw_user_message=text,
        )

    if has_deadline:
        interview_questions = [
            {
                "id": "q_due_date",
                "param_key": "new_due_date",
                "question": "你希望新的最晚交期是哪一天？",
                "input_type": "date",
                "required": True,
                "options": [],
                "placeholder": "YYYY-MM-DD",
            },
            {
                "id": "q_target_fg",
                "param_key": "target_fg_pn",
                "question": "这次调整是针对全部成品，还是仅针对某个成品料号？",
                "input_type": "text",
                "required": False,
                "options": [],
                "placeholder": "留空表示全部成品；如需指定请输入 FG 料号",
            },
        ]
        return IntentResult(
            intent_type="modify_deadline",
            recognized_params={},
            missing_params=["new_due_date"],
            confirmation_prompt="我理解你希望调整交期。执行前我会先通过简短采访确认关键参数（不超过5问）。",
            final_confirmation_prompt="以上理解是否正确？确认后我将调用确定性 MRP 算法执行重排程（LLM 不参与任何计算）。",
            interview_questions=interview_questions,
            raw_user_message=text,
        )
    if has_substitute:
        recognized = {"no_us_material": not allow_us_material}
        interview_questions = [
            {
                "id": "q_no_us",
                "param_key": "no_us_material",
                "question": "是否启用涉美物料限制（禁用美系）？",
                "input_type": "boolean",
                "required": True,
                "options": ["true", "false"],
                "placeholder": "",
            },
            {
                "id": "q_target_material",
                "param_key": "target_material_pn",
                "question": "是否只针对某个物料进行替换？",
                "input_type": "text",
                "required": False,
                "options": [],
                "placeholder": "留空表示按会话规则全局生效；如需指定请输入物料号",
            },
        ]
        return IntentResult(
            intent_type="substitute_material",
            recognized_params=recognized,
            missing_params=[],
            confirmation_prompt="我理解你希望调整替代料策略。执行前我会先通过简短采访确认关键参数（不超过5问）。",
            final_confirmation_prompt="以上理解是否正确？确认后我将调用确定性 MRP 算法执行重排程（LLM 不参与任何计算）。",
            interview_questions=interview_questions,
            raw_user_message=text,
        )
    return IntentResult(
        intent_type="unknown",
        recognized_params={},
        missing_params=[],
        confirmation_prompt="暂未识别出可执行意图。当前仅支持：modify_deadline（交期修改）与 substitute_material（特定物料替换）。",
        final_confirmation_prompt="",
        interview_questions=[],
        raw_user_message=text,
    )


def _try_openai_intent(text: str) -> IntentResult | None:
    # Optional LLM path. If dependency or key is unavailable, caller falls back deterministically.
    if settings.llm_provider.lower() != "openai":
        return None
    if not settings.llm_api_key:
        return None

    try:
        from openai import OpenAI  # type: ignore
    except Exception:
        return None

    prompt = (
        "你是制造业排程系统的意图识别器与采访助手。"
        "你只能输出 JSON，不要输出任何解释。"
        "支持意图仅有 modify_deadline / substitute_material / supply_disruption / unknown。"
        "supply_disruption 适用于供应商无法交货、交货量不足、停产、延迟交货、产能中断等场景。"
        "请严格输出以下 JSON 结构："
        '{"intent_type":"...", "recognized_params":{}, "missing_params":[], "confirmation_prompt":"...", '
        '"final_confirmation_prompt":"...", "interview_questions":[{"id":"q_1","param_key":"...","question":"...",'
        '"input_type":"text|date|boolean|select","required":true,"options":[],"placeholder":"..."}]}。'
        "规则："
        "1) interview_questions 最多 5 个，且只问执行该意图必要的问题；"
        "2) 不确定参数不要猜，放入 missing_params；"
        "3) 日期必须是 YYYY-MM-DD；"
        "4) 绝对禁止做任何数值计算；"
        "5) 若用户表达模糊，仍要给出最多5个澄清问题。"
        f"用户输入：{text}"
    )
    client = OpenAI(api_key=settings.llm_api_key)
    try:
        response = client.responses.create(model=settings.llm_model, input=prompt)
    except Exception:
        return None
    content = getattr(response, "output_text", "") or ""
    if not content:
        return None

    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return None

    intent_type = payload.get("intent_type", "unknown")
    if intent_type not in {"modify_deadline", "substitute_material", "supply_disruption", "unknown"}:
        intent_type = "unknown"
    recognized_params = payload.get("recognized_params", {}) or {}
    missing_params = payload.get("missing_params", []) or []
    confirmation_prompt = payload.get("confirmation_prompt", "请确认参数后执行重排程。")
    final_confirmation_prompt = payload.get(
        "final_confirmation_prompt",
        "以上理解是否正确？确认后我将调用确定性 MRP 算法执行重排程（LLM 不参与任何计算）。",
    )
    interview_questions = payload.get("interview_questions", []) or []
    if not isinstance(recognized_params, dict) or not isinstance(missing_params, list):
        return None
    if not isinstance(interview_questions, list):
        interview_questions = []
    interview_questions = _normalize_interview_questions(interview_questions)
    if intent_type != "unknown" and len(interview_questions) == 0:
        # LLM 未按要求返回可采访问题，则视为无效，回退到 deterministic fallback。
        return None
    return IntentResult(
        intent_type=intent_type,  # type: ignore[arg-type]
        recognized_params=recognized_params,
        missing_params=[str(item) for item in missing_params],
        confirmation_prompt=str(confirmation_prompt),
        final_confirmation_prompt=str(final_confirmation_prompt),
        interview_questions=interview_questions,
        raw_user_message=text,
    )


def recognize_intent(message: str) -> IntentResult:
    text = message.strip()
    if not text:
        return IntentResult(
            intent_type="unknown",
            recognized_params={},
            missing_params=[],
            confirmation_prompt="请输入有效自然语言指令。当前仅支持交期修改与特定物料替换。",
            final_confirmation_prompt="",
            interview_questions=[],
            raw_user_message="",
        )

    llm_result = _try_openai_intent(text)
    if llm_result is not None:
        return llm_result
    return _build_fallback_intent(text)


def merge_confirmed_params(intent_type: IntentType, recognized_params: dict, confirmed_params: dict) -> dict:
    merged = dict(recognized_params)
    merged.update(confirmed_params or {})

    if intent_type == "modify_deadline" and "new_due_date" in merged:
        value = merged["new_due_date"]
        if isinstance(value, str):
            merged["new_due_date"] = date.fromisoformat(value).isoformat()
    if intent_type == "substitute_material" and "no_us_material" in merged:
        merged["no_us_material"] = bool(merged["no_us_material"])
    if intent_type == "supply_disruption":
        if "disruption_days" in merged:
            merged["disruption_days"] = int(merged["disruption_days"])
        if "affected_material_pns" in merged:
            val = merged["affected_material_pns"]
            if isinstance(val, str):
                merged["affected_material_pns"] = [p.strip() for p in val.split(",") if p.strip()]
        if "new_available_date" in merged:
            val = merged["new_available_date"]
            if isinstance(val, str) and val:
                merged["new_available_date"] = date.fromisoformat(val).isoformat()
    return merged


def intent_result_to_dict(intent: IntentResult) -> dict:
    return asdict(intent)
