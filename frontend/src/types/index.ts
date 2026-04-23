export type PlanStatus = "pending_approval" | "approved" | "srm_synced";
export type PlanVersion = "A" | "B";
export type Priority = "high" | "low";

export interface MetricSummary {
  today_mrp_generated: number;
  today_mrp_success_rate: number;
  pending_approval_sessions: number;
  avg_mrp_engine_duration_ms: number;
  active_disruptions: number;
}

export interface AgentLogItem {
  session_id: string | null;
  agent_name: string;
  task_name: string;
  start_at: string;
  end_at: string;
  duration_ms: number;
  status: string;
  error_message: string;
}

export interface PlanSessionItem {
  session_id: string;
  fg_pn: string;
  status: PlanStatus;
  selected_version: PlanVersion | null;
  created_at: string;
  versions: PlanVersion[];
}

export interface ParsedMpsOrder {
  fg_pn: string;
  qty: number;
  due_date: string;
  priority: Priority;
}

export interface ParsedMpsResult {
  session_id: string;
  orders: ParsedMpsOrder[];
  constraints: Record<string, unknown>;
}

export interface MpsUploadTaskLogItem {
  agent_name: string;
  task_name: string;
  duration_ms: number;
  status: string;
  error_message?: string;
}

export interface MpsUploadResult {
  session_id: string;
  warnings: string[];
  mrp_status: string;
  plan_status: string;
  task_logs: MpsUploadTaskLogItem[];
}

export interface PlannedOrder {
  material_pn: string;
  fg_pn: string;
  gross_req: number;
  net_req: number;
  gross_with_yield: number;
  planned_qty: number;
  planned_order_date: string;
  status: "ok" | "auto_resolved" | "conflict";
  description?: string;
  supplier_name?: string;
}

export interface ConflictDetailItem {
  material_pn: string;
  fg_pn: string;
  priority: Priority;
  conflict_code: string;
  message: string;
  suggested_actions: string[];
}

export interface ConflictReport {
  markdown_report?: string;
  summary?: Array<{ code: string; count: number }>;
  conflicts?: ConflictDetailItem[];
  suggested_actions?: string[];
}

export interface PlanVersionPayload {
  version: PlanVersion;
  planned_orders: PlannedOrder[];
  conflict_report: ConflictReport;
}

export interface PlanSessionDetail {
  session_id: string;
  status: PlanStatus;
  selected_version: PlanVersion | null;
  versions: PlanVersionPayload[];
}

export interface EnrichedPlannedOrder extends PlannedOrder {
  lead_time_days: number | null;
  on_hand_inventory: number | null;
  in_transit_inventory: number | null;
  available_inventory: number | null;
  remaining_after_use: number | null;
  safety_stock: number | null;
  lot_size: number | null;
  yield_rate: number | null;
  shelf_life_expiry: string | null;
  description: string;
  material_type: string;
  inventory_uom: string;
  supplier_name: string;
  order_qty: number | null;
  order_due_date: string | null;
  order_priority: Priority | null;
}

export interface MrpDetailResponse {
  session_id: string;
  status: PlanStatus;
  selected_version: PlanVersion | null;
  active_version: PlanVersion;
  has_ab_versions: boolean;
  conflict_report: ConflictReport;
  planned_orders: EnrichedPlannedOrder[];
  mps_orders: Array<{ fg_pn: string; qty: number; due_date: string; priority: Priority }>;
}

export interface AlertItem {
  type: "shelf_life" | "disruption";
  material_pn?: string;
  event_id?: string;
  message: string;
  created_at: string;
}

export interface DisruptionCreateRequest {
  supplier_name: string;
  affected_material_pns: string[];
  disruption_days: number;
  new_available_date?: string;
  source: "earthquake" | "delay" | "other";
  note: string;
}

export interface DisruptionItem {
  event_id: string;
  supplier_name: string;
  affected_material_pns: string[];
  disruption_days: number;
  new_available_date: string | null;
  source: string;
  note: string;
  blast_radius: Array<{ fg_pn: string; original_due_date: string; estimated_delay_days: number }>;
  status: string;
  created_at: string;
}

export interface BomItem {
  parent_pn: string;
  child_pn: string;
  supplier_name: string;
  material_desc: string;
  material_type: string;
  qty_per: number;
  usage_uom: string;
  level: number;
  is_us_material: boolean;
  aml: string[];
}

export interface MaterialItem {
  material_pn: string;
  supplier_name: string;
  description: string;
  material_type: string;
  lead_time_days: number;
  actual_delivery_date: string | null;
  shelf_life_expiry: string | null;
  on_hand_inventory: number;
  in_transit_inventory: number;
  safety_stock: number;
  lot_size: number;
  yield_rate: number;
  inventory_uom: string;
}

export type ChatRole = "user" | "assistant";
export type ChatIntentType = "modify_deadline" | "substitute_material" | "supply_disruption" | "unknown";

export interface DisruptionChatResponse {
  intent: ChatIntent;
  needs_confirmation: boolean;
}

export interface ChatInterviewQuestion {
  id: string;
  param_key: string;
  question: string;
  input_type: "text" | "date" | "boolean" | "select";
  required: boolean;
  options: string[];
  placeholder: string;
}

export interface ChatIntent {
  intent_type: ChatIntentType;
  recognized_params: Record<string, unknown>;
  missing_params: string[];
  confirmation_prompt: string;
  final_confirmation_prompt: string;
  interview_questions: ChatInterviewQuestion[];
  raw_user_message: string;
}

export interface ChatHistoryItem {
  id: number;
  role: ChatRole;
  content: string;
  intent: Record<string, unknown>;
  created_at: string;
}

export interface ChatHistoryPayload {
  session_id: string;
  items: ChatHistoryItem[];
}

export interface ChatMessageResponse {
  session_id: string;
  intent: ChatIntent;
  needs_confirmation: boolean;
}
