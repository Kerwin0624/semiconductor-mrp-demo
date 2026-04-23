from __future__ import annotations

import json
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.bom import BOMMaster


MAX_BOM_DEPTH = 10


@dataclass(slots=True)
class BOMNode:
    material_pn: str
    parent_pn: str | None
    level: int
    qty_per: float
    is_us_material: bool
    aml: list[str]
    fg_pn: str = ""
    original_material_pn: str | None = None
    no_substitute_found: bool = False


@dataclass(slots=True)
class BOMExpandResult:
    nodes: list[BOMNode]
    warnings: list[str]


def expand_bom_tree(db: Session, fg_pn: str, no_us_material: bool = False, max_depth: int = MAX_BOM_DEPTH) -> BOMExpandResult:
    warnings: list[str] = []
    nodes: list[BOMNode] = []
    visited_paths: set[tuple[str, str]] = set()

    def walk(parent: str, level: int) -> None:
        if level > max_depth:
            warnings.append(f"BOM 展开达到最大层级 {max_depth}，parent={parent}")
            return

        children = db.query(BOMMaster).filter(BOMMaster.parent_pn == parent).all()
        for child in children:
            key = (child.parent_pn, child.child_pn)
            if key in visited_paths:
                continue
            visited_paths.add(key)

            aml = _safe_parse_aml(child.aml_json)
            material_pn = child.child_pn
            original_material_pn: str | None = None
            no_substitute_found = False

            if no_us_material and child.is_us_material:
                substitute = _pick_non_us_substitute(aml)
                if substitute:
                    original_material_pn = material_pn
                    material_pn = substitute
                else:
                    no_substitute_found = True
                    warnings.append(f"{material_pn} 无可用非美系替代料")

            node = BOMNode(
                material_pn=material_pn,
                parent_pn=child.parent_pn,
                level=level,
                qty_per=child.qty_per,
                is_us_material=child.is_us_material,
                aml=aml,
                fg_pn=fg_pn,
                original_material_pn=original_material_pn,
                no_substitute_found=no_substitute_found,
            )
            nodes.append(node)
            walk(child.child_pn, level + 1)

    walk(fg_pn, 1)
    return BOMExpandResult(nodes=nodes, warnings=warnings)


def _safe_parse_aml(aml_json: str | None) -> list[str]:
    if not aml_json:
        return []
    try:
        data = json.loads(aml_json)
        if isinstance(data, list):
            return [str(i).strip() for i in data if str(i).strip()]
        return []
    except json.JSONDecodeError:
        return []


def _pick_non_us_substitute(aml: list[str]) -> str | None:
    for candidate in aml:
        if not _looks_like_us_material(candidate):
            return candidate
    return None


def _looks_like_us_material(material_pn: str) -> bool:
    code = material_pn.upper()
    return code.startswith("US") or "-US" in code or "_US" in code
