from datetime import date

from app.models.bom import BOMMaster
from app.models.material import MaterialMaster
from app.models.mps import MPSOrder
from app.modules.disruption_intake import DisruptionPayload, intake_disruption_event
from app.modules.shelf_life_monitor import scan_and_alert_shelf_life


def test_disruption_intake_generates_blast_radius(db_session) -> None:
    db_session.add_all(
        [
            BOMMaster(parent_pn="FG-A", child_pn="MAT-X", qty_per=1, level=1, is_us_material=False, aml_json="[]"),
            MPSOrder(
                session_id="S-1",
                fg_pn="FG-A",
                qty=100,
                due_date=date(2026, 5, 1),
                priority="high",
                constraints_json="{}",
            ),
        ]
    )
    db_session.commit()

    result = intake_disruption_event(
        db_session,
        DisruptionPayload(
            supplier_name="Supplier-X",
            affected_material_pns=["MAT-X"],
            disruption_days=14,
            new_available_date=date(2026, 5, 15),
            source="earthquake",
            note="test",
        ),
    )
    assert result.disruption_id.startswith("DISR-")
    assert len(result.blast_radius) == 1
    assert result.blast_radius[0].fg_pn == "FG-A"


def test_shelf_life_monitor_alerts_within_horizon(db_session) -> None:
    db_session.add(
        MaterialMaster(
            material_pn="MAT-SHELF",
            lead_time_days=5,
            shelf_life_expiry=date(2026, 4, 20),
            on_hand_inventory=120,
            in_transit_inventory=0,
            safety_stock=20,
            lot_size=10,
            yield_rate=0.95,
        )
    )
    db_session.commit()

    result = scan_and_alert_shelf_life(db_session, today=date(2026, 4, 1), horizon_days=30)
    assert result.total_scanned == 1
    assert result.alerted_count == 1
