from io import BytesIO
from datetime import date

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


def test_data_upload_and_query_routes(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        bom_file = _excel_bytes(
            [
                ["parent_pn", "child_pn", "supplier_name", "qty_per", "level", "is_us_material", "aml"],
                ["FG-API", "MAT-API", "华南供应商A", 1, 1, "N", ""],
            ]
        )
        material_file = _excel_bytes(
            [
                ["material_pn", "supplier_name", "lead_time_days", "on_hand_inventory", "lot_size", "yield_rate"],
                ["MAT-API", "珠三角供应链B", 5, 100, 10, 0.95],
            ]
        )

        resp1 = client.post("/api/data/bom/upload", files={"file": ("bom.xlsx", bom_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert resp1.status_code == 200
        assert resp1.json()["upserted"] == 1

        resp2 = client.post(
            "/api/data/materials/upload",
            files={"file": ("materials.xlsx", material_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp2.status_code == 200
        assert resp2.json()["upserted"] == 1

        resp3 = client.get("/api/data/bom")
        assert resp3.status_code == 200
        assert len(resp3.json()["items"]) == 1
        assert resp3.json()["items"][0]["supplier_name"] == "华南供应商A"

        resp4 = client.get("/api/data/materials")
        assert resp4.status_code == 200
        assert len(resp4.json()["items"]) == 1
        assert resp4.json()["items"][0]["supplier_name"] == "珠三角供应链B"

    app.dependency_overrides.clear()


def test_data_upload_accepts_chinese_supplier_headers(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        bom_file = _excel_bytes(
            [
                ["上级料号", "下级料号", "供应商", "物料描述", "物料类型", "单位用量", "用量单位", "BOM 层级", "美系标识", "可替代料（AML）"],
                ["FG-CN", "MAT-CN", "华东供应链C", "测试描述", "Resist", 1, "EA", 1, "N", ""],
            ]
        )
        material_file = _excel_bytes(
            [
                ["物料料号", "供应商", "提前期天数", "现有库存", "批量", "良率"],
                ["MAT-CN", "华北供应商D", 5, 100, 10, 0.95],
            ]
        )

        resp1 = client.post("/api/data/bom/upload", files={"file": ("bom_cn.xlsx", bom_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert resp1.status_code == 200
        assert resp1.json()["upserted"] == 1

        resp2 = client.post(
            "/api/data/materials/upload",
            files={"file": ("materials_cn.xlsx", material_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp2.status_code == 200
        assert resp2.json()["upserted"] == 1

        resp3 = client.get("/api/data/bom")
        assert resp3.status_code == 200
        assert any(item["supplier_name"] == "华东供应链C" for item in resp3.json()["items"])

        resp4 = client.get("/api/data/materials")
        assert resp4.status_code == 200
        assert any(item["supplier_name"] == "华北供应商D" for item in resp4.json()["items"])

    app.dependency_overrides.clear()


def test_bom_upload_maps_chinese_material_desc_header(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        bom_file = _excel_bytes(
            [
                ["上级料号", "下级料号", "供应商", "物料描述", "物料类型", "单位用量", "用量单位", "BOM 层级", "美系标识", "可替代料（AML）"],
                ["FG-DESC-001", "02-01-0135", "GlobalWafers", "12 inch Si Wafer 5nm", "Wafer", 1, "EA", 1, "N", "02-02-0325"],
            ]
        )
        resp = client.post(
            "/api/data/bom/upload",
            files={"file": ("bom_desc.xlsx", bom_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 200
        assert resp.json()["upserted"] == 1

        query = client.get("/api/data/bom")
        assert query.status_code == 200
        row = next((item for item in query.json()["items"] if item["parent_pn"] == "FG-DESC-001"), None)
        assert row is not None
        assert row["material_desc"] == "12 inch Si Wafer 5nm"

    app.dependency_overrides.clear()


def test_bom_upload_parses_chinese_yes_for_us_flag(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        bom_file = _excel_bytes(
            [
                ["上级料号", "下级料号", "供应商", "物料描述", "物料类型", "单位用量", "用量单位", "BOM 层级", "美系标识", "可替代料（AML）"],
                ["FG-US-001", "32-03-0168", "TOK", "ArF Photoresist", "Resist", 0.012, "L", 1, "是", "32-01-0026"],
                ["FG-US-002", "41-01-0020", "BASF", "CMP Slurry", "Chemical", 0.25, "L", 1, "否", "41-02-0105"],
            ]
        )
        resp = client.post(
            "/api/data/bom/upload",
            files={"file": ("bom_us_flag.xlsx", bom_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 200
        assert resp.json()["upserted"] == 2

        query = client.get("/api/data/bom")
        assert query.status_code == 200
        row_yes = next((item for item in query.json()["items"] if item["parent_pn"] == "FG-US-001"), None)
        row_no = next((item for item in query.json()["items"] if item["parent_pn"] == "FG-US-002"), None)
        assert row_yes is not None and row_yes["is_us_material"] is True
        assert row_no is not None and row_no["is_us_material"] is False

    app.dependency_overrides.clear()


def test_data_query_supports_supplier_keyword_filter(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        bom_file = _excel_bytes(
            [
                ["parent_pn", "child_pn", "supplier_name", "qty_per"],
                ["FG-FILTER-1", "MAT-FILTER-1", "华东电子供应链", 1],
                ["FG-FILTER-2", "MAT-FILTER-2", "NITTO", 1],
            ]
        )
        material_file = _excel_bytes(
            [
                ["material_pn", "supplier_name", "lead_time_days"],
                ["MAT-FILTER-1", "华东电子供应链", 5],
                ["MAT-FILTER-2", "MURATA", 5],
            ]
        )

        resp1 = client.post("/api/data/bom/upload", files={"file": ("bom_filter.xlsx", bom_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert resp1.status_code == 200

        resp2 = client.post(
            "/api/data/materials/upload",
            files={"file": ("materials_filter.xlsx", material_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp2.status_code == 200

        bom_filtered = client.get("/api/data/bom?supplier_keyword=华东")
        assert bom_filtered.status_code == 200
        bom_items = bom_filtered.json()["items"]
        assert len(bom_items) == 1
        assert bom_items[0]["supplier_name"] == "华东电子供应链"

        materials_filtered = client.get("/api/data/materials?supplier_keyword=华东")
        assert materials_filtered.status_code == 200
        material_items = materials_filtered.json()["items"]
        assert len(material_items) == 1
        assert material_items[0]["supplier_name"] == "华东电子供应链"

    app.dependency_overrides.clear()


def test_data_delete_routes_clear_lists(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        bom_file = _excel_bytes(
            [
                ["parent_pn", "child_pn", "supplier_name", "qty_per"],
                ["FG-DEL-1", "MAT-DEL-1", "DEL-SUP-1", 1],
                ["FG-DEL-2", "MAT-DEL-2", "DEL-SUP-2", 1],
            ]
        )
        material_file = _excel_bytes(
            [
                ["material_pn", "supplier_name", "lead_time_days"],
                ["MAT-DEL-1", "DEL-SUP-1", 5],
                ["MAT-DEL-2", "DEL-SUP-2", 5],
            ]
        )

        assert client.post("/api/data/bom/upload", files={"file": ("bom_del.xlsx", bom_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}).status_code == 200
        assert client.post(
            "/api/data/materials/upload",
            files={"file": ("materials_del.xlsx", material_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        ).status_code == 200

        del_bom = client.delete("/api/data/bom")
        assert del_bom.status_code == 200
        assert del_bom.json()["deleted"] >= 2
        bom_after = client.get("/api/data/bom")
        assert bom_after.status_code == 200
        assert bom_after.json()["items"] == []

        del_mat = client.delete("/api/data/materials")
        assert del_mat.status_code == 200
        assert del_mat.json()["deleted"] >= 2
        mat_after = client.get("/api/data/materials")
        assert mat_after.status_code == 200
        assert mat_after.json()["items"] == []

    app.dependency_overrides.clear()


def test_mps_plan_and_approval_routes(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        # Prepare minimal master data first.
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per"], ["FG-1", "MAT-1", 1]]),
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
                            ["material_pn", "lead_time_days", "on_hand_inventory", "in_transit_inventory", "lot_size", "yield_rate"],
                            ["MAT-1", 3, 10, 0, 5, 0.9],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        mps_file = _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-1", 20, "2026-05-10", "low"]])
        upload_resp = client.post(
            "/api/mps/upload",
            data={"notes": "禁用美系物料"},
            files={"file": ("mps.xlsx", mps_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert upload_resp.status_code == 200
        session_id = upload_resp.json()["session_id"]

        mps_resp = client.get(f"/api/mps/{session_id}")
        assert mps_resp.status_code == 200
        assert mps_resp.json()["session_id"] == session_id

        plans_resp = client.get("/api/plans")
        assert plans_resp.status_code == 200
        assert len(plans_resp.json()["items"]) >= 1

        approve_resp = client.post(f"/api/plans/{session_id}/approve", json={"selected_version": "A"})
        assert approve_resp.status_code == 200
        assert approve_resp.json()["status"] == "srm_synced"

        metrics_summary = client.get("/api/metrics/summary")
        assert metrics_summary.status_code == 200
        assert "today_mrp_generated" in metrics_summary.json()

        agent_logs = client.get(f"/api/metrics/agent-logs?session_id={session_id}")
        assert agent_logs.status_code == 200
        assert len(agent_logs.json()["items"]) >= 1

    app.dependency_overrides.clear()


def test_plans_list_returns_all_fg_pn_in_same_session(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes(
                        [
                            ["parent_pn", "child_pn", "qty_per"],
                            ["FG-1", "MAT-1", 1],
                            ["FG-2", "MAT-2", 1],
                        ]
                    ),
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
                            ["material_pn", "lead_time_days", "on_hand_inventory", "in_transit_inventory", "lot_size", "yield_rate"],
                            ["MAT-1", 3, 20, 0, 5, 0.95],
                            ["MAT-2", 5, 20, 0, 5, 0.95],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        upload_resp = client.post(
            "/api/mps/upload",
            data={"notes": "多成品料号"},
            files={
                "file": (
                    "mps.xlsx",
                    _excel_bytes(
                        [
                            ["fg_pn", "qty", "due_date", "priority"],
                            ["FG-1", 20, "2026-05-10", "high"],
                            ["FG-2", 30, "2026-05-15", "low"],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert upload_resp.status_code == 200
        session_id = upload_resp.json()["session_id"]

        plans_resp = client.get("/api/plans")
        assert plans_resp.status_code == 200
        matched = next((item for item in plans_resp.json()["items"] if item["session_id"] == session_id), None)
        assert matched is not None
        assert matched["fg_pn"] == "FG-1 / FG-2"

    app.dependency_overrides.clear()


def test_session_id_uses_daily_sequence_format(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per"], ["FG-SEQ", "MAT-SEQ", 1]]),
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
                            ["material_pn", "lead_time_days", "on_hand_inventory", "in_transit_inventory", "lot_size", "yield_rate"],
                            ["MAT-SEQ", 3, 20, 0, 5, 0.95],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        payload = {
            "data": {"notes": "序号测试"},
            "files": {
                "file": (
                    "mps.xlsx",
                    _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-SEQ", 20, "2026-05-10", "high"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        }

        first = client.post("/api/mps/upload", **payload)
        second = client.post("/api/mps/upload", **payload)
        assert first.status_code == 200
        assert second.status_code == 200

        today_part = date.today().strftime("%Y%m%d")
        assert first.json()["session_id"] == f"MRP-{today_part}-01"
        assert second.json()["session_id"] == f"MRP-{today_part}-02"

    app.dependency_overrides.clear()


def test_chat_message_and_confirm_routes(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per"], ["FG-CHAT", "MAT-CHAT", 1]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        client.post(
            "/api/data/materials/upload",
            files={
                "file": (
                    "materials.xlsx",
                    _excel_bytes([["material_pn", "lead_time_days", "on_hand_inventory", "lot_size", "yield_rate"], ["MAT-CHAT", 5, 0, 10, 0.95]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        upload_resp = client.post(
            "/api/mps/upload",
            data={"notes": "常规"},
            files={
                "file": (
                    "mps.xlsx",
                    _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-CHAT", 100, "2026-05-20", "high"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert upload_resp.status_code == 200
        session_id = upload_resp.json()["session_id"]

        msg_resp = client.post(
            "/api/chat/message",
            json={"session_id": session_id, "message": "车规级优先，确保不晚于Q2"},
        )
        assert msg_resp.status_code == 200
        assert msg_resp.json()["intent"]["intent_type"] in {"modify_deadline", "unknown"}
        if msg_resp.json()["intent"]["intent_type"] != "unknown":
            assert len(msg_resp.json()["intent"].get("interview_questions", [])) <= 5
            assert msg_resp.json()["intent"].get("final_confirmation_prompt")

        confirm_resp = client.post(
            "/api/chat/confirm",
            json={
                "session_id": session_id,
                "intent": msg_resp.json()["intent"],
                "confirmed_params": {"new_due_date": "2026-06-30"},
            },
        )
        assert confirm_resp.status_code == 200
        assert confirm_resp.json()["session_id"] == session_id

        history_resp = client.get(f"/api/chat/{session_id}/history")
        assert history_resp.status_code == 200
        assert len(history_resp.json()["items"]) >= 2

    app.dependency_overrides.clear()


def test_mrp_detail_uses_version_a_before_approval(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per"], ["FG-DETAIL", "MAT-DETAIL", 1]]),
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
                            ["material_pn", "lead_time_days", "on_hand_inventory", "in_transit_inventory", "safety_stock", "lot_size", "yield_rate"],
                            ["MAT-DETAIL", 5, 10, 0, 20, 10, 1],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        upload_resp = client.post(
            "/api/mps/upload",
            data={"notes": "常规"},
            files={
                "file": (
                    "mps.xlsx",
                    _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-DETAIL", 100, "2026-05-20", "high"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert upload_resp.status_code == 200
        session_id = upload_resp.json()["session_id"]

        # 触发一次重排程，生成新的 B 版差异
        msg_resp = client.post(
            "/api/chat/message",
            json={"session_id": session_id, "message": "把交期改成2026-06-30"},
        )
        assert msg_resp.status_code == 200
        confirm_resp = client.post(
            "/api/chat/confirm",
            json={
                "session_id": session_id,
                "intent": msg_resp.json()["intent"],
                "confirmed_params": {"new_due_date": "2026-06-30"},
            },
        )
        assert confirm_resp.status_code == 200

        # 待审批阶段，主详情页应始终展示 A 版
        detail_resp = client.get(f"/api/plans/{session_id}/mrp-detail")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        compare_resp = client.get(f"/api/plans/{session_id}")
        assert compare_resp.status_code == 200
        version_a = next((v for v in compare_resp.json()["versions"] if v["version"] == "A"), None)
        assert version_a is not None
        base_keys = [
            "material_pn",
            "fg_pn",
            "gross_req",
            "net_req",
            "gross_with_yield",
            "planned_qty",
            "planned_order_date",
            "status",
        ]
        projected = [{k: item.get(k) for k in base_keys} for item in detail["planned_orders"]]
        assert projected == version_a["planned_orders"]

    app.dependency_overrides.clear()


def test_approve_persists_manual_edited_orders(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per"], ["FG-EDIT", "MAT-EDIT", 1]]),
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
                            ["material_pn", "lead_time_days", "on_hand_inventory", "in_transit_inventory", "safety_stock", "lot_size", "yield_rate"],
                            ["MAT-EDIT", 5, 10, 0, 20, 10, 1],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        upload_resp = client.post(
            "/api/mps/upload",
            data={"notes": "常规"},
            files={
                "file": (
                    "mps.xlsx",
                    _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-EDIT", 100, "2026-05-20", "high"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert upload_resp.status_code == 200
        session_id = upload_resp.json()["session_id"]

        approve_resp = client.post(
            f"/api/plans/{session_id}/approve",
            json={
                "selected_version": "A",
                "edited_orders": [
                    {
                        "material_pn": "MAT-EDIT",
                        "fg_pn": "FG-EDIT",
                        "planned_qty": 1234,
                        "planned_order_date": "2026-05-01",
                    }
                ],
            },
        )
        assert approve_resp.status_code == 200

        detail_resp = client.get(f"/api/plans/{session_id}")
        assert detail_resp.status_code == 200
        version_a = next((v for v in detail_resp.json()["versions"] if v["version"] == "A"), None)
        assert version_a is not None
        row = next((x for x in version_a["planned_orders"] if x["material_pn"] == "MAT-EDIT"), None)
        assert row is not None
        assert row["planned_qty"] == 1234
        assert row["planned_order_date"] == "2026-05-01"

    app.dependency_overrides.clear()


def test_save_draft_keeps_pending_and_returns_to_compare_flow(db_session) -> None:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        client.post(
            "/api/data/bom/upload",
            files={
                "file": (
                    "bom.xlsx",
                    _excel_bytes([["parent_pn", "child_pn", "qty_per"], ["FG-DRAFT", "MAT-DRAFT", 1]]),
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
                            ["material_pn", "lead_time_days", "on_hand_inventory", "in_transit_inventory", "safety_stock", "lot_size", "yield_rate"],
                            ["MAT-DRAFT", 5, 10, 0, 20, 10, 1],
                        ]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        upload_resp = client.post(
            "/api/mps/upload",
            data={"notes": "常规"},
            files={
                "file": (
                    "mps.xlsx",
                    _excel_bytes([["fg_pn", "qty", "due_date", "priority"], ["FG-DRAFT", 100, "2026-05-20", "high"]]),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert upload_resp.status_code == 200
        session_id = upload_resp.json()["session_id"]

        draft_resp = client.post(
            f"/api/plans/{session_id}/draft",
            json={
                "selected_version": "A",
                "edited_orders": [
                    {
                        "material_pn": "MAT-DRAFT",
                        "fg_pn": "FG-DRAFT",
                        "planned_qty": 888,
                        "planned_order_date": "2026-05-03",
                    }
                ],
            },
        )
        assert draft_resp.status_code == 200
        assert draft_resp.json()["status"] == "pending_approval"

        detail_resp = client.get(f"/api/plans/{session_id}")
        assert detail_resp.status_code == 200
        assert detail_resp.json()["status"] == "pending_approval"
        version_a = next((v for v in detail_resp.json()["versions"] if v["version"] == "A"), None)
        assert version_a is not None
        row = next((x for x in version_a["planned_orders"] if x["material_pn"] == "MAT-DRAFT"), None)
        assert row is not None
        assert row["planned_qty"] == 888
        assert row["planned_order_date"] == "2026-05-03"

    app.dependency_overrides.clear()
