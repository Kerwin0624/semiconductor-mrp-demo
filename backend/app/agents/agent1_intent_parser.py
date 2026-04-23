from __future__ import annotations

from app.modules.mps_parser import ParsedMPS, parse_mps_excel


def run_agent1_intent_parser(mps_file_bytes: bytes, notes: str | None = None) -> ParsedMPS:
    return parse_mps_excel(mps_file_bytes, notes)
