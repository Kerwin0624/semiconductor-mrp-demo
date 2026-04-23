from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.database import get_db
from app.main import app


def _excel_bytes(rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    bio = BytesIO()
    wb.save(bio)
    return bio.getvalue()


def _setup_client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def test_e2e_happy_path_with_metrics(db_session) -> None:
    with _setup_client(db_session) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per"], ["FG-HAPPY", "MAT-HAPPY", 1]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        client.post(
            "/api/data/materials/upload",
            files={
                "file": (
                    "materials.xlsx",
                    _excel_bytes(
                        [
                            ["material_pn", "lead_time_days", "on_hand_inventory", "in_transit_inventory", "safety_stock", "lot_size", "yield_rate", "shelf_life_expiry"],
                            ["MAT-HAPPY", 2, 200, 50, 20, 10, 0.95, "2026-12-31"],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        upload = client.post(
            "/api/mps/upload",
            data={"notes": "常规排产"},
            files={
                "file": (
                    "mps.xlsx",
                    _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-HAPPY", 100, "2026-05-20", "low"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert upload.status_code == 200
        session_id = upload.json()["session_id"]

        approve = client.post(f"/api/plans/{session_id}/approve", json={"selected_version": "A"})
        assert approve.status_code == 200
        assert approve.json()["status"] == "srm_synced"

        summary = client.get("/api/metrics/summary")
        assert summary.status_code == 200
        assert summary.json()["today_mrp_generated"] >= 1

        logs = client.get(f"/api/metrics/agent-logs?session_id={session_id}")
        assert logs.status_code == 200
        assert len(logs.json()["items"]) >= 3

    app.dependency_overrides.clear()


def test_e2e_high_risk_conflict_path(db_session) -> None:
    with _setup_client(db_session) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per", "is_us_material", "aml"], ["FG-CONFLICT", "US-MAT-C", 1, "Y", "US-ALT1,US-ALT2"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        client.post(
            "/api/data/materials/upload",
            files={
                "file": (
                    "materials.xlsx",
                    _excel_bytes(
                        [
                            ["material_pn", "lead_time_days", "on_hand_inventory", "in_transit_inventory", "safety_stock", "lot_size", "yield_rate", "shelf_life_expiry"],
                            ["US-MAT-C", 30, 0, 0, 50, 10, 0.9, "2026-04-01"],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        upload = client.post(
            "/api/mps/upload",
            data={"notes": "禁用美系物料"},
            files={
                "file": (
                    "mps.xlsx",
                    _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-CONFLICT", 100, "2026-04-08", "high"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert upload.status_code == 200
        session_id = upload.json()["session_id"]

        detail = client.get(f"/api/plans/{session_id}")
        assert detail.status_code == 200
        assert len(detail.json()["versions"]) == 1
        version_a_report = detail.json()["versions"][0]["conflict_report"]
        assert "summary" in version_a_report
        assert len(version_a_report["summary"]) >= 1

    app.dependency_overrides.clear()


def test_e2e_disruption_dispatch_path(db_session) -> None:
    with _setup_client(db_session) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per"], ["FG-DISRUPT", "MAT-DISRUPT", 1]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        client.post(
            "/api/data/materials/upload",
            files={
                "file": (
                    "materials.xlsx",
                    _excel_bytes([["material_pn", "lead_time_days"], ["MAT-DISRUPT", 7]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        client.post(
            "/api/mps/upload",
            data={"notes": "异常调度测试"},
            files={
                "file": (
                    "mps.xlsx",
                    _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-DISRUPT", 60, "2026-05-25", "high"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        create_event = client.post(
            "/api/disruptions",
            json={
                "supplier_name": "Supplier-Z",
                "affected_material_pns": ["MAT-DISRUPT"],
                "disruption_days": 10,
                "new_available_date": "2026-05-10",
                "source": "earthquake",
                "note": "地震导致停产",
            },
        )
        assert create_event.status_code == 200
        assert create_event.json()["disruption_id"].startswith("DISR-")
        assert len(create_event.json()["blast_radius"]) >= 1

        alerts = client.get("/api/alerts")
        assert alerts.status_code == 200
        assert any(item["type"] == "disruption" for item in alerts.json()["items"])

    app.dependency_overrides.clear()


def test_e2e_chat_intent_confirm_reschedule_compare(db_session) -> None:
    with _setup_client(db_session) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per"], ["FG-CHAT-E2E", "MAT-CHAT-E2E", 1]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        client.post(
            "/api/data/materials/upload",
            files={
                "file": (
                    "materials.xlsx",
                    _excel_bytes(
                        [
                            ["material_pn", "lead_time_days", "on_hand_inventory", "in_transit_inventory", "safety_stock", "lot_size", "yield_rate", "shelf_life_expiry"],
                            ["MAT-CHAT-E2E", 12, 10, 0, 20, 10, 0.95, "2026-12-31"],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        upload = client.post(
            "/api/mps/upload",
            data={"notes": "常规"},
            files={
                "file": (
                    "mps.xlsx",
                    _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-CHAT-E2E", 200, "2026-05-20", "high"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert upload.status_code == 200
        session_id = upload.json()["session_id"]

        msg = client.post(
            "/api/chat/message",
            json={"session_id": session_id, "message": "车规级产品优先出货并确保不晚于Q2"},
        )
        assert msg.status_code == 200
        assert "intent" in msg.json()

        confirm = client.post(
            "/api/chat/confirm",
            json={
                "session_id": session_id,
                "intent": msg.json()["intent"],
                "confirmed_params": {"new_due_date": "2026-06-30"},
            },
        )
        assert confirm.status_code == 200
        assert confirm.json()["plan_status"] == "pending_approval"

        plans = client.get(f"/api/plans/{session_id}")
        assert plans.status_code == 200
        assert len(plans.json()["versions"]) >= 2
        version_a = next((item for item in plans.json()["versions"] if item["version"] == "A"), None)
        version_b = next((item for item in plans.json()["versions"] if item["version"] == "B"), None)
        assert version_a is not None
        assert version_b is not None
        assert len(version_b["planned_orders"]) >= 1
        # 重排程后 A 应保留重排前基线，B 为重排后结果。
        assert version_a["planned_orders"] != version_b["planned_orders"]

        history = client.get(f"/api/chat/{session_id}/history")
        assert history.status_code == 200
        assert len(history.json()["items"]) >= 2

    app.dependency_overrides.clear()
