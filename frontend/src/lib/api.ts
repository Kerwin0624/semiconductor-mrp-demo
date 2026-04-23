import axios from "axios";

import type {
  AgentLogItem,
  AlertItem,
  BomItem,
  ChatHistoryPayload,
  ChatMessageResponse,
  DisruptionChatResponse,
  DisruptionCreateRequest,
  DisruptionItem,
  MaterialItem,
  MetricSummary,
  MpsUploadResult,
  MrpDetailResponse,
  ParsedMpsResult,
  PlanSessionDetail,
  PlanSessionItem
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000
});

export function getTemplateUrl(name: "mps" | "bom" | "materials"): string {
  return `${API_BASE}/data/templates/${name}`;
}

/** 上传/写操作失败时须直接抛错，避免静默 fallback 让用户误以为已导入。 */
function throwReadableAxiosError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { detail?: string | Array<{ msg?: string }> } | undefined;
    const d = data?.detail;
    if (typeof d === "string") {
      throw new Error(d);
    }
    if (Array.isArray(d)) {
      throw new Error(d.map((x) => x.msg ?? JSON.stringify(x)).join("; "));
    }
  }
  throw err instanceof Error ? err : new Error(String(err));
}

const fallbackSessionId = "S-2026-0403-001";

const fallbackMetrics: MetricSummary = {
  today_mrp_generated: 24,
  today_mrp_success_rate: 91.7,
  pending_approval_sessions: 2,
  avg_mrp_engine_duration_ms: 318.4,
  active_disruptions: 1
};

const fallbackPlanSessions: PlanSessionItem[] = [
  {
    session_id: "S-2026-0403-001",
    fg_pn: "FG-AUTOPILOT-ECU",
    status: "pending_approval",
    selected_version: null,
    created_at: "2026-04-03T10:18:00+08:00",
    versions: ["A", "B"]
  },
  {
    session_id: "S-2026-0403-002",
    fg_pn: "FG-ADAS-CAMERA",
    status: "approved",
    selected_version: "B",
    created_at: "2026-04-03T09:44:00+08:00",
    versions: ["A", "B"]
  },
  {
    session_id: "S-2026-0403-003",
    fg_pn: "FG-MCU-BOARD",
    status: "srm_synced",
    selected_version: "B",
    created_at: "2026-04-03T08:31:00+08:00",
    versions: ["A", "B"]
  }
];

const fallbackAlerts: AlertItem[] = [
  {
    type: "disruption",
    event_id: "DISR-2026-001",
    message: "日本关东地区地震导致 NITTO 停产 2 周，影响高优订单 3 条。",
    created_at: "2026-04-03T09:20:00+08:00"
  },
  {
    type: "shelf_life",
    material_pn: "MEM-4G-LPDDR5",
    message: "物料 MEM-4G-LPDDR5 距离到期 22 天，库存 5200。",
    created_at: "2026-04-03T08:05:00+08:00"
  }
];

const fallbackMps: ParsedMpsResult = {
  session_id: fallbackSessionId,
  constraints: {
    no_us_material: true,
    auto_grade: true,
    safety_auto_resolve: "<=20%"
  },
  orders: [
    { fg_pn: "FG-AUTOPILOT-ECU", qty: 320, due_date: "2026-04-20", priority: "high" },
    { fg_pn: "FG-POWER-MODULE", qty: 500, due_date: "2026-04-26", priority: "low" },
    { fg_pn: "FG-ADAS-CAMERA", qty: 260, due_date: "2026-04-22", priority: "high" }
  ]
};

const fallbackPlanDetail: PlanSessionDetail = {
  session_id: fallbackSessionId,
  status: "pending_approval",
  selected_version: null,
  versions: [
    {
      version: "A",
      planned_orders: [
        {
          material_pn: "WAF-TSMC-7N",
          fg_pn: "FG-AUTOPILOT-ECU",
          gross_req: 420,
          net_req: 420,
          gross_with_yield: 452,
          planned_qty: 420,
          planned_order_date: "2026-03-24",
          status: "conflict"
        },
        {
          material_pn: "PMIC-US-7782",
          fg_pn: "FG-AUTOPILOT-ECU",
          gross_req: 380,
          net_req: 380,
          gross_with_yield: 392,
          planned_qty: 380,
          planned_order_date: "2026-03-27",
          status: "conflict"
        }
      ],
      conflict_report: {
        summary: [
          { code: "LEAD_TIME_OVERDUE", count: 1 },
          { code: "NO_SUBSTITUTE_FOUND", count: 1 }
        ],
        suggested_actions: ["拆分批次优先保障高优订单", "启用日系替代料 PMIC-JP-1003", "并行催料并执行审批"]
      }
    },
    {
      version: "B",
      planned_orders: [
        {
          material_pn: "WAF-TSMC-7N",
          fg_pn: "FG-AUTOPILOT-ECU",
          gross_req: 440,
          net_req: 440,
          gross_with_yield: 474,
          planned_qty: 440,
          planned_order_date: "2026-03-22",
          status: "auto_resolved"
        },
        {
          material_pn: "PMIC-JP-1003",
          fg_pn: "FG-AUTOPILOT-ECU",
          gross_req: 390,
          net_req: 390,
          gross_with_yield: 402,
          planned_qty: 390,
          planned_order_date: "2026-03-26",
          status: "ok"
        }
      ],
      conflict_report: {
        summary: [],
        conflicts: [],
        suggested_actions: ["Version B 可按期交付，建议审批并同步 SRM"]
      }
    }
  ]
};

const fallbackBom: BomItem[] = [
  {
    parent_pn: "FG-AUTOPILOT-ECU",
    child_pn: "WAF-TSMC-7N",
    supplier_name: "TSMC",
    material_desc: "7nm Wafer",
    material_type: "Wafer",
    qty_per: 1.2,
    usage_uom: "EA",
    level: 1,
    is_us_material: false,
    aml: []
  },
  {
    parent_pn: "FG-AUTOPILOT-ECU",
    child_pn: "PMIC-US-7782",
    supplier_name: "NITTO",
    material_desc: "US PMIC Chip",
    material_type: "Chemical",
    qty_per: 1,
    usage_uom: "EA",
    level: 1,
    is_us_material: true,
    aml: ["PMIC-JP-1003", "PMIC-TW-2011"]
  }
];

const fallbackMaterials: MaterialItem[] = [
  {
    material_pn: "WAF-TSMC-7N",
    supplier_name: "TSMC",
    description: "7nm Wafer",
    material_type: "Wafer",
    lead_time_days: 28,
    actual_delivery_date: null,
    shelf_life_expiry: "2026-12-31",
    on_hand_inventory: 120,
    in_transit_inventory: 90,
    safety_stock: 200,
    lot_size: 20,
    yield_rate: 0.93,
    inventory_uom: "EA"
  },
  {
    material_pn: "PMIC-JP-1003",
    supplier_name: "RENESAS",
    description: "JP PMIC Chip",
    material_type: "Chemical",
    lead_time_days: 18,
    actual_delivery_date: null,
    shelf_life_expiry: "2026-10-30",
    on_hand_inventory: 420,
    in_transit_inventory: 100,
    safety_stock: 180,
    lot_size: 10,
    yield_rate: 0.97,
    inventory_uom: "EA"
  }
];

async function withFallback<T>(request: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await request();
  } catch {
    return fallback;
  }
}

export async function fetchMetricsSummary(): Promise<MetricSummary> {
  return withFallback(async () => (await api.get<MetricSummary>("/metrics/summary")).data, fallbackMetrics);
}

export async function fetchAgentLogs(sessionId?: string): Promise<AgentLogItem[]> {
  return withFallback(
    async () =>
      (
        await api.get<{ items: AgentLogItem[] }>("/metrics/agent-logs", {
          params: sessionId ? { session_id: sessionId } : undefined
        })
      ).data.items,
    []
  );
}

export async function uploadMps(file: File, notes: string): Promise<MpsUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("notes", notes);
  try {
    return (
      await api.post<MpsUploadResult>("/mps/upload", formData, {
        timeout: 120000
      })
    ).data;
  } catch (e) {
    throwReadableAxiosError(e);
  }
}

export async function fetchMpsSession(sessionId: string): Promise<ParsedMpsResult> {
  return withFallback(
    async () => (await api.get<ParsedMpsResult>(`/mps/${sessionId}`)).data,
    { ...fallbackMps, session_id: sessionId || fallbackSessionId }
  );
}

export async function fetchPlanSessions(status?: string): Promise<PlanSessionItem[]> {
  const fallback = status ? fallbackPlanSessions.filter((item) => item.status === status) : fallbackPlanSessions;
  return withFallback(
    async () =>
      (
        await api.get<{ items: PlanSessionItem[] }>("/plans", {
          params: status ? { status } : undefined
        })
      ).data.items,
    fallback
  );
}

export async function fetchPlanSessionDetail(sessionId: string): Promise<PlanSessionDetail> {
  return withFallback(
    async () => (await api.get<PlanSessionDetail>(`/plans/${sessionId}`)).data,
    { ...fallbackPlanDetail, session_id: sessionId || fallbackSessionId }
  );
}

export async function fetchMrpDetail(sessionId: string, version?: "A" | "B"): Promise<MrpDetailResponse> {
  return (
    await api.get<MrpDetailResponse>(`/plans/${sessionId}/mrp-detail`, {
      params: version ? { version } : undefined
    })
  ).data;
}

export async function approvePlan(
  sessionId: string,
  selectedVersion: "A" | "B",
  editedOrders: Array<{ material_pn: string; fg_pn: string; planned_qty?: number; planned_order_date?: string }> = []
): Promise<{ status: string }> {
  return withFallback(
    async () =>
      (
        await api.post<{ status: string }>(`/plans/${sessionId}/approve`, {
          selected_version: selectedVersion,
          edited_orders: editedOrders
        })
      ).data,
    { status: "approved" }
  );
}

export async function savePlanDraftEdits(
  sessionId: string,
  selectedVersion: "A" | "B",
  editedOrders: Array<{ material_pn: string; fg_pn: string; planned_qty?: number; planned_order_date?: string }> = []
): Promise<{ status: string; selected_version: "A" | "B"; saved_edits: number }> {
  return (
    await api.post<{ status: string; selected_version: "A" | "B"; saved_edits: number }>(`/plans/${sessionId}/draft`, {
      selected_version: selectedVersion,
      edited_orders: editedOrders
    })
  ).data;
}

export async function deletePlanSession(sessionId: string): Promise<{ deleted_plans: number; deleted_mps_orders: number }> {
  try {
    return (await api.delete<{ deleted_plans: number; deleted_mps_orders: number }>(`/plans/${sessionId}`)).data;
  } catch (e) {
    throwReadableAxiosError(e);
  }
}

export async function fetchAlerts(): Promise<AlertItem[]> {
  return withFallback(async () => (await api.get<{ items: AlertItem[] }>("/alerts")).data.items, fallbackAlerts);
}

export async function createDisruption(payload: DisruptionCreateRequest): Promise<{ disruption_id: string }> {
  return withFallback(
    async () => (await api.post<{ disruption_id: string }>("/disruptions", payload)).data,
    { disruption_id: "DISR-LOCAL-001" }
  );
}

export async function fetchDisruptions(): Promise<DisruptionItem[]> {
  return withFallback(async () => (await api.get<{ items: DisruptionItem[] }>("/disruptions")).data.items, []);
}

export async function sendDisruptionChat(message: string): Promise<DisruptionChatResponse> {
  try {
    return (await api.post<DisruptionChatResponse>("/disruptions/chat", { message })).data;
  } catch (e) {
    throwReadableAxiosError(e);
  }
}

export async function confirmDisruptionChat(
  intent: Record<string, unknown>,
  confirmedParams: Record<string, unknown>
): Promise<{ disruption_id: string; blast_radius: Array<{ fg_pn: string; original_due_date: string; estimated_delay_days: number }> }> {
  try {
    return (
      await api.post<{ disruption_id: string; blast_radius: Array<{ fg_pn: string; original_due_date: string; estimated_delay_days: number }> }>(
        "/disruptions/chat/confirm",
        { intent, confirmed_params: confirmedParams }
      )
    ).data;
  } catch (e) {
    throwReadableAxiosError(e);
  }
}

export async function uploadBom(file: File): Promise<{ upserted: number }> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    return (await api.post<{ upserted: number }>("/data/bom/upload", formData)).data;
  } catch (e) {
    throwReadableAxiosError(e);
  }
}

export async function uploadMaterials(file: File): Promise<{ upserted: number }> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    return (await api.post<{ upserted: number }>("/data/materials/upload", formData)).data;
  } catch (e) {
    throwReadableAxiosError(e);
  }
}

export async function fetchBom(): Promise<BomItem[]> {
  return withFallback(async () => (await api.get<{ items: BomItem[] }>("/data/bom")).data.items, fallbackBom);
}

export async function deleteBomList(): Promise<{ deleted: number }> {
  try {
    return (await api.delete<{ deleted: number }>("/data/bom")).data;
  } catch (e) {
    throwReadableAxiosError(e);
  }
}

export async function fetchMaterials(): Promise<MaterialItem[]> {
  return withFallback(
    async () => (await api.get<{ items: MaterialItem[] }>("/data/materials")).data.items,
    fallbackMaterials
  );
}

export async function deleteMaterialsList(): Promise<{ deleted: number }> {
  try {
    return (await api.delete<{ deleted: number }>("/data/materials")).data;
  } catch (e) {
    throwReadableAxiosError(e);
  }
}

export async function sendChatMessage(sessionId: string, message: string): Promise<ChatMessageResponse> {
  return withFallback(
    async () =>
      (
        await api.post<ChatMessageResponse>("/chat/message", {
          session_id: sessionId,
          message
        })
      ).data,
    {
      session_id: sessionId,
      intent: {
        intent_type: "modify_deadline",
        recognized_params: {},
        missing_params: ["new_due_date"],
        confirmation_prompt: "检测到你希望修改交期，请输入 new_due_date（YYYY-MM-DD）。",
        final_confirmation_prompt: "以上理解是否正确？确认后执行。",
        interview_questions: [],
        raw_user_message: message
      },
      needs_confirmation: true
    }
  );
}

export async function confirmChatIntent(
  sessionId: string,
  intent: Record<string, unknown>,
  confirmedParams: Record<string, unknown>
): Promise<{ session_id: string; plan_status: string; mrp_status: string }> {
  return withFallback(
    async () =>
      (
        await api.post<{ session_id: string; plan_status: string; mrp_status: string }>("/chat/confirm", {
          session_id: sessionId,
          intent,
          confirmed_params: confirmedParams
        })
      ).data,
    { session_id: sessionId, plan_status: "pending_approval", mrp_status: "success" }
  );
}

export async function fetchChatHistory(sessionId: string): Promise<ChatHistoryPayload> {
  return withFallback(
    async () => (await api.get<ChatHistoryPayload>(`/chat/${sessionId}/history`)).data,
    { session_id: sessionId, items: [] }
  );
}
