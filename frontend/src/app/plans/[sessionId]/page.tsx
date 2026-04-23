"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { approvePlan, fetchMrpDetail, savePlanDraftEdits } from "@/lib/api";
import { StatusPill } from "@/components/ui/status-pill";
import { Tooltip } from "@/components/ui/tooltip";
import type { ConflictDetailItem, EnrichedPlannedOrder, MrpDetailResponse } from "@/types";

const conflictCodeLabels: Record<string, string> = {
  LEAD_TIME_OVERDUE: "交期超前置期：需要下单的日期已早于当前日期，来不及采购。",
  SHELF_LIFE_EXPIRED: "保质期过期：物料在计划使用日前已过保质期。",
  NO_SUBSTITUTE_FOUND: "无替代料：原物料被禁用（如美系管控），且未找到可用替代物料。",
  STOCK_BELOW_SAFETY: "库存低于安全线：可用库存低于安全库存，存在断料风险。",
  HIGH_PRIORITY_DELAY: "高优延期风险：高优先级订单受前置期或库存影响，存在延期风险。"
};

const conflictCodeShort: Record<string, string> = {
  LEAD_TIME_OVERDUE: "交期不满足",
  SHELF_LIFE_EXPIRED: "保质期过期",
  NO_SUBSTITUTE_FOUND: "无替代料",
  STOCK_BELOW_SAFETY: "低于安全库存",
  HIGH_PRIORITY_DELAY: "高优延期风险"
};

type EditablePlanFields = Pick<EnrichedPlannedOrder, "planned_qty" | "planned_order_date">;
type EditDraft = Partial<EditablePlanFields>;

interface RowProjection {
  status: "ok" | "conflict";
  issueCodes: string[];
  issueTexts: string[];
  remainingAfterUse: number | null;
}

function numFmt(v: number | null | undefined, digits = 0): string {
  if (v == null) return "—";
  return digits > 0 ? v.toFixed(digits) : v.toLocaleString();
}

function inventoryBar(current: number | null, safety: number | null): "good" | "warn" | "risk" {
  if (current == null || safety == null) return "warn";
  if (current >= safety) return "good";
  if (current >= 0) return "warn";
  return "risk";
}

function MrpPlanPageInner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<MrpDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditDraft>>({});
  const [editHistory, setEditHistory] = useState<Array<Record<string, EditDraft>>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const requestedVersion = useMemo(() => {
    const version = searchParams.get("version");
    return version === "A" || version === "B" ? version : undefined;
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const resp = await fetchMrpDetail(sessionId, requestedVersion);
        setData(resp);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, requestedVersion]);

  const conflictLookup = useMemo(() => {
    const map = new Map<string, ConflictDetailItem[]>();
    for (const c of data?.conflict_report?.conflicts ?? []) {
      const key = `${c.material_pn}::${c.fg_pn}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [data]);

  const dashboard = useMemo(() => {
    const conflicts = data?.conflict_report?.conflicts ?? [];
    const summary = data?.conflict_report?.summary ?? [];
    const uniquePn = new Set(conflicts.map((c) => c.material_pn));
    const byCode: Record<string, number> = {};
    for (const c of conflicts) byCode[c.conflict_code] = (byCode[c.conflict_code] ?? 0) + 1;
    const summaryByCode: Record<string, number> = {};
    for (const s of summary) summaryByCode[s.code] = s.count;
    const src = conflicts.length > 0 ? byCode : summaryByCode;
    return {
      uniqueCount: uniquePn.size,
      totalEvents: conflicts.length || summary.reduce((a, s) => a + s.count, 0),
      hasDetail: conflicts.length > 0,
      leadTime: (src.LEAD_TIME_OVERDUE ?? 0) + (src.HIGH_PRIORITY_DELAY ?? 0),
      shelf: src.SHELF_LIFE_EXPIRED ?? 0,
      safety: src.STOCK_BELOW_SAFETY ?? 0,
      noSub: src.NO_SUBSTITUTE_FOUND ?? 0,
      sorted: [...conflicts].sort((a, b) => a.material_pn.localeCompare(b.material_pn) || a.conflict_code.localeCompare(b.conflict_code)),
    };
  }, [data]);

  const orders = useMemo(() => data?.planned_orders ?? [], [data]);
  const hasEdits = Object.keys(edits).length > 0;
  const isApprovedPlan = data?.status === "approved" || data?.status === "srm_synced";
  const isSimulationReviewMode = Boolean(requestedVersion && data?.has_ab_versions && data?.status === "pending_approval");

  function editKey(o: EnrichedPlannedOrder, idx: number) {
    return `${o.material_pn}::${o.fg_pn}::${idx}`;
  }

  const getEdited = useCallback((o: EnrichedPlannedOrder, idx: number) => {
    const e = edits[editKey(o, idx)];
    return {
      planned_qty: e?.planned_qty ?? o.planned_qty,
      planned_order_date: e?.planned_order_date ?? o.planned_order_date,
    };
  }, [edits]);

  function updateEdits(mutator: (prev: Record<string, EditDraft>) => Record<string, EditDraft>) {
    setEdits((prev) => {
      const next = mutator(prev);
      if (next !== prev) {
        setEditHistory((h) => [prev, ...h].slice(0, 50));
      }
      return next;
    });
  }

  function setEdit(o: EnrichedPlannedOrder, idx: number, field: "planned_qty" | "planned_order_date", value: string) {
    const key = editKey(o, idx);
    const nextValue = field === "planned_qty" ? Number(value) : value;
    updateEdits((prev) => {
      const current = prev[key] ?? {};
      const nextDraft: EditDraft = { ...current, [field]: nextValue };
      const normalized: EditDraft = {};
      if (nextDraft.planned_qty !== undefined && nextDraft.planned_qty !== o.planned_qty) {
        normalized.planned_qty = nextDraft.planned_qty;
      }
      if (nextDraft.planned_order_date !== undefined && nextDraft.planned_order_date !== o.planned_order_date) {
        normalized.planned_order_date = nextDraft.planned_order_date;
      }

      const next = { ...prev };
      if (Object.keys(normalized).length === 0) {
        delete next[key];
      } else {
        next[key] = normalized;
      }
      return next;
    });
  }

  function revertRowEdit(o: EnrichedPlannedOrder, idx: number) {
    const key = editKey(o, idx);
    if (!edits[key]) return;
    updateEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function undoLastEdit() {
    setEditHistory((history) => {
      if (history.length === 0) return history;
      const [latest, ...rest] = history;
      setEdits(latest);
      return rest;
    });
  }

  const projectRowOutcome = useCallback((o: EnrichedPlannedOrder, idx: number, conflicts: ConflictDetailItem[]): RowProjection => {
    const edited = getEdited(o, idx);
    const issueCodes = new Set<string>();
    const issueTexts: string[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateValue = new Date(`${edited.planned_order_date}T00:00:00`);
    if (Number.isNaN(dateValue.getTime())) {
      issueCodes.add("INVALID_DATE");
      issueTexts.push("下单日期无效");
    } else if (dateValue < today) {
      issueCodes.add("LEAD_TIME_OVERDUE");
      issueTexts.push("下单日期早于今天");
    }

    // 实时评估口径（纯代码确定性计算）：
    // 调整后使用后剩余 = 可用库存(现有+在途) + 计划采购量 - 毛需求
    // 这样手工编辑采购量会立即反映到风险判定中。
    const remainingAfterUse = o.available_inventory != null ? o.available_inventory + edited.planned_qty - o.gross_req : null;
    if (remainingAfterUse != null && o.safety_stock != null && remainingAfterUse < o.safety_stock) {
      issueCodes.add("STOCK_BELOW_SAFETY");
      issueTexts.push(`低于安全库存，缺口 ${numFmt(o.safety_stock - remainingAfterUse)}`);
    }

    for (const c of conflicts) {
      if (c.conflict_code === "SHELF_LIFE_EXPIRED") {
        // 若存在新增采购量，视为可通过新鲜批次补给规避存量保质期冲突。
        if (edited.planned_qty > 0) {
          continue;
        }
        issueCodes.add(c.conflict_code);
        issueTexts.push(conflictCodeShort[c.conflict_code] ?? c.conflict_code);
        continue;
      }
      if (c.conflict_code !== "STOCK_BELOW_SAFETY" && c.conflict_code !== "LEAD_TIME_OVERDUE") {
        issueCodes.add(c.conflict_code);
        issueTexts.push(conflictCodeShort[c.conflict_code] ?? c.conflict_code);
      }
    }

    return {
      status: issueCodes.size === 0 ? "ok" : "conflict",
      issueCodes: [...issueCodes],
      issueTexts,
      remainingAfterUse
    };
  }, [getEdited]);

  const projectionMap = useMemo(() => {
    const map = new Map<string, RowProjection>();
    orders.forEach((o, idx) => {
      const key = editKey(o, idx);
      const conflicts = conflictLookup.get(`${o.material_pn}::${o.fg_pn}`) ?? [];
      map.set(key, projectRowOutcome(o, idx, conflicts));
    });
    return map;
  }, [orders, conflictLookup, projectRowOutcome]);

  const projectionSummary = useMemo(() => {
    let projectedConflicts = 0;
    let recovered = 0;
    let introduced = 0;
    orders.forEach((o, idx) => {
      const key = editKey(o, idx);
      const projected = projectionMap.get(key);
      if (!projected) return;
      if (projected.status === "conflict") projectedConflicts += 1;
      if (o.status === "conflict" && projected.status === "ok") recovered += 1;
      if (o.status !== "conflict" && projected.status === "conflict") introduced += 1;
    });
    return { projectedConflicts, recovered, introduced };
  }, [orders, projectionMap]);

  const approvalBadgeLabel = useMemo(() => {
    if (!data) return "当前展示版本：—";
    if (data.status === "pending_approval") {
      return "审批状态：待审批";
    }
    return "审批状态：已审批";
  }, [data]);

  function escapeCsv(value: string | number | null | undefined): string {
    const text = value == null ? "" : String(value);
    const escaped = text.replace(/"/g, "\"\"");
    return `"${escaped}"`;
  }

  function exportPlanCsv() {
    const header = [
      "物料",
      "成品",
      "供应商",
      "单位",
      "原始MRP状态",
      "调整后预计状态",
      "毛需求",
      "净需求",
      "计划采购量",
      "最晚下单日",
      "LeadTime(天)",
      "现有库存",
      "在途库存",
      "调整后使用后剩余",
      "安全库存",
      "问题说明"
    ];
    const rowsCsv = orders.map((o, idx) => {
      const edited = getEdited(o, idx);
      const projected = projectionMap.get(editKey(o, idx));
      return [
        o.material_pn,
        o.fg_pn,
        o.supplier_name || "",
        o.inventory_uom || "EA",
        o.status === "ok" ? "正常" : o.status === "auto_resolved" ? "已自愈" : "冲突",
        projected?.status === "ok" ? "预计正常" : "预计仍有风险",
        o.gross_req,
        o.net_req,
        edited.planned_qty,
        edited.planned_order_date,
        o.lead_time_days,
        o.on_hand_inventory,
        o.in_transit_inventory,
        projected?.remainingAfterUse ?? o.remaining_after_use,
        o.safety_stock,
        projected?.issueTexts.join("；") ?? ""
      ]
        .map(escapeCsv)
        .join(",");
    });
    const content = [header.map(escapeCsv).join(","), ...rowsCsv].join("\n");
    const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mrp-plan-${sessionId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleSubmit() {
    try {
      setIsSubmitting(true);
      const editedOrders = Object.entries(edits).map(([key, value]) => {
        const [material_pn, fg_pn] = key.split("::");
        return {
          material_pn,
          fg_pn,
          ...(value.planned_qty !== undefined ? { planned_qty: value.planned_qty } : {}),
          ...(value.planned_order_date !== undefined ? { planned_order_date: value.planned_order_date } : {})
        };
      });
      const targetVersion = data?.active_version ?? (data?.has_ab_versions ? "B" : "A");
      if (isSimulationReviewMode) {
        await savePlanDraftEdits(sessionId, targetVersion, editedOrders);
        setEdits({});
        router.push(`/plans/${sessionId}/compare?simulated_version=${targetVersion}`);
        return;
      }
      await approvePlan(sessionId, targetVersion, editedOrders);
      setSubmitted(true);
      setEdits({});
      const refreshed = await fetchMrpDetail(sessionId, requestedVersion);
      setData(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        <span className="ml-3 text-industrial-300">加载 MRP 计划中…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">MRP 排产计划</h2>
          <p className="mt-1 text-sm text-industrial-300">Session: {sessionId}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-industrial-600 bg-industrial-900 px-3 py-1 text-xs text-industrial-200">
            {approvalBadgeLabel}
          </span>
          {data?.has_ab_versions && (
            <span className="rounded-full border border-indigo-700/60 bg-indigo-900/30 px-3 py-1 text-xs text-indigo-200">
              当前仿真版本：{data?.active_version ?? "—"}
            </span>
          )}
          {data?.has_ab_versions && (
            <button
              type="button"
              onClick={() => router.push(`/plans/${sessionId}/compare`)}
              className="rounded-lg border border-industrial-600 bg-industrial-900 px-3 py-1.5 text-xs text-industrial-200 transition hover:bg-industrial-700 hover:text-white"
            >
              A/B 版本对比
            </button>
          )}
          <StatusPill
            label={submitted ? "已提交" : data?.status === "pending_approval" ? "待确认" : data?.status ?? "—"}
            tone={submitted ? "good" : "warn"}
          />
        </div>
      </section>

      {error && <p className="rounded-lg border border-rose-700 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p>}

      {/* MPS Orders Summary */}
      {data && data.mps_orders.length > 0 && (
        <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
          <h3 className="text-sm font-medium text-industrial-100">MPS 订单概况</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {data.mps_orders.map((m) => (
              <div key={m.fg_pn} className="rounded-lg border border-industrial-600 bg-industrial-900/60 px-3 py-2">
                <p className="font-mono text-xs text-industrial-100">{m.fg_pn}</p>
                <p className="mt-1 text-xs text-industrial-400">
                  数量 <span className="text-industrial-200">{m.qty.toLocaleString()}</span> · 交期{" "}
                  <span className="text-industrial-200">{m.due_date}</span> ·{" "}
                  <StatusPill label={m.priority === "high" ? "高" : "低"} tone={m.priority === "high" ? "risk" : "neutral"} />
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Conflict Report */}
      {dashboard.totalEvents > 0 && (
        <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
          <h3 className="text-sm font-medium text-industrial-100">冲突分析报告</h3>
          <p className="mt-1 text-xs text-industrial-400">
            以下为 MRP 引擎检测到的供应冲突汇总，具体冲突已标注在下方物料计划表中。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-lg border border-industrial-600 bg-industrial-900/60 p-3">
              <p className="text-xs text-industrial-400">风险物料数</p>
              <p className="mt-1 text-2xl font-semibold text-white">{dashboard.hasDetail ? dashboard.uniqueCount : "—"}</p>
            </article>
            <article className="rounded-lg border border-industrial-600 bg-industrial-900/60 p-3">
              <p className="text-xs text-industrial-400">冲突事件条数</p>
              <p className="mt-1 text-2xl font-semibold text-amber-200">{dashboard.totalEvents}</p>
            </article>
            <article className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-3">
              <p className="text-xs text-rose-200/80">交期类</p>
              <p className="mt-1 text-2xl font-semibold text-rose-100">{dashboard.leadTime}</p>
            </article>
            <article className="rounded-lg border border-amber-900/50 bg-amber-950/15 p-3">
              <p className="text-xs text-amber-200/80">保质期 / 库存 / 替代料</p>
              <p className="mt-1 text-lg font-semibold leading-snug text-amber-100">
                {dashboard.shelf} · {dashboard.safety} · {dashboard.noSub}
              </p>
            </article>
          </div>
        </section>
      )}

      {/* Material Plan Table */}
      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-industrial-100">物料排产计划</h3>
          <div className="flex flex-wrap items-center gap-3 text-xs text-industrial-300">
            <span>共 {orders.length} 条物料</span>
            <span className="text-rose-300">{orders.filter((o) => o.status === "conflict").length} 条冲突</span>
            {hasEdits && <span className="text-amber-300">已修改 {Object.keys(edits).length} 处</span>}
            <span className={projectionSummary.projectedConflicts > 0 ? "text-rose-300" : "text-emerald-300"}>
              调整后预计 {projectionSummary.projectedConflicts} 条风险
            </span>
            {projectionSummary.recovered > 0 && <span className="text-emerald-300">恢复正常 {projectionSummary.recovered} 条</span>}
            {projectionSummary.introduced > 0 && <span className="text-amber-300">新增风险 {projectionSummary.introduced} 条</span>}
            <button
              type="button"
              onClick={exportPlanCsv}
              className="rounded border border-industrial-600 bg-industrial-900 px-2 py-1 text-[11px] text-industrial-200 hover:bg-industrial-700"
            >
              导出排产计划
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-industrial-400">
          点击「计划采购量」或「最晚下单日」可直接编辑。系统会实时评估调整后效果；支持撤回修改与导出计划。
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1680px] text-left text-sm">
            <thead className="text-xs text-industrial-400">
              <tr>
                <th className="pb-2 pr-3 font-medium">物料</th>
                <th className="pb-2 pr-3 font-medium">成品</th>
                <th className="pb-2 pr-3 font-medium">供应商</th>
                <th className="pb-2 pr-3 font-medium">单位</th>
                <th className="pb-2 pr-3 font-medium">MRP 状态</th>
                <th className="pb-2 pr-3 font-medium text-right">毛需求</th>
                <th className="pb-2 pr-3 font-medium text-right">净需求</th>
                <th className="pb-2 pr-3 font-medium text-right">
                  <Tooltip content={<p className="text-xs text-industrial-100">系统建议的采购量（可编辑）</p>}>
                    <span className="cursor-help border-b border-dashed border-industrial-500">计划采购量</span>
                  </Tooltip>
                </th>
                <th className="pb-2 pr-3 font-medium">
                  <Tooltip content={<p className="text-xs text-industrial-100">MRP 根据交期减去前置期计算的最迟下单日（可编辑）</p>}>
                    <span className="cursor-help border-b border-dashed border-industrial-500">最晚下单日</span>
                  </Tooltip>
                </th>
                <th className="pb-2 pr-3 font-medium text-right">
                  <Tooltip content={<p className="text-xs text-industrial-100">供应商标准采购前置期（天）</p>}>
                    <span className="cursor-help border-b border-dashed border-industrial-500">Lead Time</span>
                  </Tooltip>
                </th>
                <th className="pb-2 pr-3 font-medium text-right">现有库存</th>
                <th className="pb-2 pr-3 font-medium text-right">在途库存</th>
                <th className="pb-2 pr-3 font-medium text-right">
                  <Tooltip content={<p className="text-xs text-industrial-100">可用库存 - 毛需求（负值表示缺料）</p>}>
                    <span className="cursor-help border-b border-dashed border-industrial-500">使用后剩余</span>
                  </Tooltip>
                </th>
                <th className="pb-2 pr-3 font-medium text-right">安全库存</th>
                <th className="pb-2 font-medium">冲突 / 建议</th>
                <th className="pb-2 pl-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, idx) => {
                const edited = getEdited(o, idx);
                const key = `${o.material_pn}::${o.fg_pn}::${idx}`;
                const conflicts = conflictLookup.get(`${o.material_pn}::${o.fg_pn}`) ?? [];
                const initialIssueTexts = conflicts.map((c) => conflictCodeShort[c.conflict_code] ?? c.conflict_code);
                const projection = projectionMap.get(key);
                const projectedRemaining = projection?.remainingAfterUse ?? o.remaining_after_use;
                const invLevel = inventoryBar(projectedRemaining, o.safety_stock);
                const rowBg =
                  o.status === "conflict"
                    ? "bg-rose-950/25"
                    : o.status === "auto_resolved"
                    ? "bg-amber-950/15"
                    : "bg-transparent";
                const rowEdited = Boolean(edits[key]);
                return (
                  <tr key={key} className={`border-t border-industrial-700 ${rowBg}`}>
                    <td className="py-2.5 pr-3">
                      <div className="font-mono text-xs text-industrial-100">{o.material_pn}</div>
                      {o.description && <div className="text-[10px] text-industrial-500">{o.description}</div>}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-industrial-200">{o.fg_pn}</td>
                    <td className="py-2.5 pr-3 text-xs text-industrial-200">{o.supplier_name || "—"}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-industrial-300">{o.inventory_uom || "EA"}</td>
                    <td className="py-2.5 pr-3">
                      <StatusPill
                        label={o.status === "ok" ? "正常" : o.status === "auto_resolved" ? "已自愈" : "冲突"}
                        tone={o.status === "ok" ? "good" : o.status === "auto_resolved" ? "warn" : "risk"}
                      />
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-industrial-200">{numFmt(o.gross_req)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-industrial-200">{numFmt(o.net_req)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <input
                        type="number"
                        className="w-20 rounded border border-industrial-600 bg-industrial-900 px-1.5 py-0.5 text-right font-mono text-xs text-industrial-100 focus:border-indigo-500 focus:outline-none"
                        value={edited.planned_qty}
                        onChange={(e) => setEdit(o, idx, "planned_qty", e.target.value)}
                        disabled={submitted}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        type="date"
                        className="rounded border border-industrial-600 bg-industrial-900 px-1.5 py-0.5 font-mono text-xs text-industrial-100 focus:border-indigo-500 focus:outline-none"
                        value={edited.planned_order_date}
                        onChange={(e) => setEdit(o, idx, "planned_order_date", e.target.value)}
                        disabled={submitted}
                      />
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-industrial-300">
                      {o.lead_time_days != null ? `${o.lead_time_days}d` : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-industrial-200">{numFmt(o.on_hand_inventory)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-industrial-200">{numFmt(o.in_transit_inventory)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <span
                        className={`font-mono text-xs ${
                          invLevel === "good" ? "text-emerald-300" : invLevel === "warn" ? "text-amber-300" : "text-rose-300"
                        }`}
                      >
                        {numFmt(projectedRemaining)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-industrial-300">{numFmt(o.safety_stock)}</td>
                    <td className="py-2.5 text-xs">
                      {projection ? (
                        <div className="space-y-1">
                          <p className="text-industrial-400">
                            初始问题：{initialIssueTexts.length > 0 ? initialIssueTexts.join("；") : "无冲突"}
                          </p>
                          {projection.issueTexts.length > 0 ? (
                            <>
                              <p className="text-rose-200">当前问题：{projection.issueTexts.join("；")}</p>
                            </>
                          ) : (
                            <p className="text-emerald-400">当前问题：无冲突</p>
                          )}
                          <p className={projection.status === "ok" ? "text-emerald-300" : "text-amber-300"}>
                            调整后效果：{projection.status === "ok" ? "预计转为正常" : "预计仍有风险"}
                          </p>
                        </div>
                      ) : (
                        <span className="text-industrial-500">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-2 text-xs">
                      {rowEdited ? (
                        <button
                          type="button"
                          onClick={() => revertRowEdit(o, idx)}
                          className="rounded border border-industrial-600 bg-industrial-900 px-2 py-1 text-industrial-200 hover:bg-industrial-700"
                        >
                          撤回本行
                        </button>
                      ) : (
                        <span className="text-industrial-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Submit */}
      {!submitted ? (
        <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-industrial-100">
                {isSimulationReviewMode ? "保存仿真并返回对比" : isApprovedPlan ? "修改计划" : "确认提交"}
              </h3>
              <p className="mt-1 text-xs text-industrial-400">
                {isSimulationReviewMode
                  ? "当前是版本仿真模式：保存后将返回 A/B 对比页面，由你最终决策选择 A 或 B。"
                  : isApprovedPlan
                  ? "当前计划已审批通过，可修改排产计划。"
                  : "确认无误后提交排产计划，系统将同步至 SRM 采购系统。"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {hasEdits && (
                <>
                  <button
                    type="button"
                    onClick={undoLastEdit}
                    disabled={editHistory.length === 0}
                    className="rounded-lg border border-industrial-600 bg-industrial-900 px-3 py-2 text-xs text-industrial-200 hover:bg-industrial-700 disabled:opacity-50"
                  >
                    撤回上一步
                  </button>
                  <button
                    type="button"
                    onClick={() => updateEdits(() => ({}))}
                    className="rounded-lg border border-industrial-600 bg-industrial-900 px-3 py-2 text-xs text-industrial-200 hover:bg-industrial-700"
                  >
                    重置全部修改
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-60"
              >
                {isSubmitting
                  ? isSimulationReviewMode
                    ? "保存仿真中..."
                    : isApprovedPlan
                    ? "修改中..."
                    : "提交中..."
                  : isSimulationReviewMode
                  ? "保存仿真并返回A/B对比"
                  : isApprovedPlan
                  ? "确认并修改排产计划"
                  : "确认并提交排产计划"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
          <p className="text-sm text-emerald-300">排产计划已成功提交，SRM 同步完成。</p>
        </section>
      )}
    </div>
  );
}

export default function MrpPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          <span className="ml-3 text-industrial-300">加载 MRP 计划中…</span>
        </div>
      }
    >
      <MrpPlanPageInner />
    </Suspense>
  );
}
