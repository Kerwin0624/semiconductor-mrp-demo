import json

from app.models.bom import BOMMaster
from app.modules.bom_expander import expand_bom_tree


def test_expand_bom_tree_multi_level(db_session) -> None:
    db_session.add_all(
        [
            BOMMaster(parent_pn="FG-1", child_pn="US-CHIP", qty_per=2, level=1, is_us_material=True, aml_json='["JP-CHIP"]'),
            BOMMaster(parent_pn="US-CHIP", child_pn="WAFER-A", qty_per=3, level=2, is_us_material=False, aml_json="[]"),
        ]
    )
    db_session.commit()

    result = expand_bom_tree(db_session, "FG-1", no_us_material=True)
    assert len(result.nodes) == 2
    assert result.nodes[0].material_pn == "JP-CHIP"
    assert result.nodes[0].original_material_pn == "US-CHIP"
    assert result.warnings == []


def test_expand_bom_tree_no_substitute_warning(db_session) -> None:
    db_session.add(
        BOMMaster(
            parent_pn="FG-2",
            child_pn="US-CAP",
            qty_per=1,
            level=1,
            is_us_material=True,
            aml_json=json.dumps(["US-ALT1", "US-ALT2"]),
        )
    )
    db_session.commit()

    result = expand_bom_tree(db_session, "FG-2", no_us_material=True)
    assert len(result.nodes) == 1
    assert result.nodes[0].no_substitute_found is True
    assert "无可用非美系替代料" in result.warnings[0]
