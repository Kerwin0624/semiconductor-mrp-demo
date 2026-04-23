"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { approvePlan, fetchPlanSessionDetail } from "@/lib/api";
import { StatusPill } from "@/components/ui/status-pill";
import { Tooltip } from "@/components/ui/tooltip";
import type { ConflictDetailItem, PlanSessionDetail } from "@/types";

const mrpStatusMap: Record<string, { label: string; tone: "good" | "risk" | "warn"; desc: string }> = {
  ok: { label: "正常", tone: "good", desc: "MRP 引擎评估该物料供应充足，可按期交付。" },
  auto_resolved: { label: "已自动解决", tone: "warn", desc: "低优先级订单触发安全库存自愈机制（动用 <= 20% 安全库存），已自动解决。" },
  conflict: { label: "供应冲突", tone: "risk", desc: "MRP 引擎检测到该物料存在供应问题，无法按计划完成。" }
};

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

function summarizeProblems(conflicts: ConflictDetailItem[] | undefined, status: string): { problem: string; resolution: string } {
  const list = conflicts ?? [];
  if (list.length === 0) {
    if (status === "auto_resolved") {
      return {
        problem: "存在供应约束，但已通过自动/规则化策略处理",
        resolution: "按计划采购执行并跟踪到货，继续监控库存与交付风险"
      };
    }
    return { problem: "无冲突", resolution: "无需处置" };
  }

  const problems = list.map((c) => `${conflictCodeShort[c.conflict_code] ?? c.conflict_code}：${c.message}`);
  const actions = Array.from(new Set(list.flatMap((c) => c.suggested_actions))).filter(Boolean);
  return {
    problem: problems.join("；"),
    resolution: actions.length > 0 ? actions.join("；") : "建议人工复核并调整交期/替代料/采购策略后重算"
  };
}

function MrpTooltipContent({ desc, conflicts }: { desc: string; conflicts?: ConflictDetailItem[] }) {
  return (
    <>
      <p className="text-xs font-medium text-industrial-100">{desc}</p>
      {conflicts && conflicts.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-industrial-700 pt-2">
          {conflicts.map((c, i) => (
            <div key={`${c.conflict_code}-${i}`} className="text-xs">
              <p className="font-medium text-rose-300">{conflictCodeLabels[c.conflict_code] ?? c.conflict_code}</p>
              <p className="mt-0.5 text-industrial-300">{c.message}</p>
              {c.suggested_actions.length > 0 && (
                <p className="mt-0.5 text-industrial-400">建议：{c.suggested_actions.join("；")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function MrpStatusLabel({ status, conflicts }: { status: string; conflicts?: ConflictDetailItem[] }) {
  const mapped = mrpStatusMap[status];
  if (!mapped) return <span className="text-xs text-industrial-400">{status}</span>;
  if (status === "ok") return <StatusPill label={mapped.label} tone={mapped.tone} />;
  return (
    <Tooltip content={<MrpTooltipContent desc={mapped.desc} conflicts={conflicts} />}>
      <StatusPill label={mapped.label} tone={mapped.tone} />
    </Tooltip>
  );
}

function ColumnHeaderTip({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip content={<p className="text-xs text-industrial-100">{tip}</p>}>
      <span className="cursor-help border-b border-dashed border-industrial-500">{label}</span>
    </Tooltip>
  );
}

function PlanComparePageInner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<PlanSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<"A" | "B" | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const data = await fetchPlanSessionDetail(sessionId);
        setPayload(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const conflictLookupA = useMemo(() => {
    const reportA = payload?.versions.find((item) => item.version === "A")?.conflict_report;
    const map = new Map<string, ConflictDetailItem[]>();
    for (const c of reportA?.conflicts ?? []) {
      const key = `${c.material_pn}::${c.fg_pn}`;
      const existing = map.get(key) ?? [];
      existing.push(c);
      map.set(key, existing);
    }
    return map;
  }, [payload]);

  const conflictLookupB = useMemo(() => {
    const reportB = payload?.versions.find((item) => item.version === "B")?.conflict_report;
    const map = new Map<string, ConflictDetailItem[]>();
    for (const c of reportB?.conflicts ?? []) {
      const key = `${c.material_pn}::${c.fg_pn}`;
      const existing = map.get(key) ?? [];
      existing.push(c);
      map.set(key, existing);
    }
    return map;
  }, [payload]);

  const rows = useMemo(() => {
    const versionA = payload?.versions.find((item) => item.version === "A")?.planned_orders ?? [];
    const versionB = payload?.versions.find((item) => item.version === "B")?.planned_orders ?? [];
    const mapA = new Map(versionA.map((o) => [`${o.material_pn}::${o.fg_pn}`, o]));
    const mapB = new Map(versionB.map((o) => [`${o.material_pn}::${o.fg_pn}`, o]));
    const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));
    return keys.map((key) => {
      const left = mapA.get(key);
      const right = mapB.get(key);
      const qtyChanged = !!left && !!right && left.planned_qty !== right.planned_qty;
      const dateChanged = !!left && !!right && left.planned_order_date !== right.planned_order_date;
      const statusChanged = !!left && !!right && left.status !== right.status;
      const isDifferent = !left || !right || qtyChanged || dateChanged || statusChanged;
      return { key, left, right, isDifferent, qtyChanged, dateChanged, statusChanged };
    });
  }, [payload]);

  const diffCount = rows.filter((r) => r.isDifferent).length;
  const conflictCount = rows.filter((r) => (r.right?.status ?? r.left?.status) === "conflict").length;
  const bConflictCount = rows.filter((r) => (r.right?.status ?? "ok") === "conflict").length;
  const simulatedVersion = searchParams.get("simulated_version");

  const approve = async () => {
    if (!selectedVersion) return;
    try {
      setIsApproving(true);
      await approvePlan(sessionId, selectedVersion);
      setIsApproving(false);
      setApproved(true);
    } catch (err) {
      setIsApproving(false);
      setError(err instanceof Error ? err.message : "审批失败");
    }
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Version A / B 对比审批</h2>
          <p className="mt-1 text-sm text-industrial-300">Session: {sessionId}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/plans/${sessionId}`)}
            className="rounded-lg border border-industrial-600 bg-industrial-900 px-3 py-1.5 text-xs text-industrial-200 transition hover:bg-industrial-700 hover:text-white"
          >
            返回排产计划
          </button>
          <StatusPill label={payload?.status === "pending_approval" ? "审批中" : payload?.status ?? "加载中"} tone="warn" />
        </div>
      </section>

      {error && <p className="rounded-lg border border-rose-700 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p>}
      {simulatedVersion && (
        <section className="rounded-xl border border-indigo-700/60 bg-indigo-900/20 p-3">
          <p className="text-sm text-indigo-200">
            已保存 Version {simulatedVersion} 的仿真调整结果。请继续在本页对比后，再执行最终审批决策。
          </p>
        </section>
      )}

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-industrial-100">物料计划对比</h3>
          <div className="flex flex-wrap gap-3 text-xs text-industrial-300">
            <span>共 {rows.length} 条</span>
            <span className="text-amber-300">A/B 差异 {diffCount} 条</span>
            <span className="text-rose-300">供应冲突 {conflictCount} 条</span>
          </div>
        </div>
        <p className="mt-1 text-xs text-industrial-400">
          黄色高亮行表示 Version A 与 B 数值不同。
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1680px] text-left text-sm">
            <thead className="text-industrial-300">
              <tr>
                <th className="pb-2">物料</th>
                <th className="pb-2">成品</th>
                <th className="pb-2">物料描述</th>
                <th className="pb-2">供应商</th>
                <th className="pb-2">A 数量</th>
                <th className="pb-2">B 数量</th>
                <th className="pb-2"><ColumnHeaderTip label="A 最晚下单日" tip="MRP 根据成品交期减去物料采购前置期，计算出的最迟采购下单日期。" /></th>
                <th className="pb-2"><ColumnHeaderTip label="B 最晚下单日" tip="MRP 根据成品交期减去物料采购前置期，计算出的最迟采购下单日期。" /></th>
                <th className="pb-2">A MRP 状态</th>
                <th className="pb-2">B MRP 状态</th>
                <th className="pb-2">A/B 差异</th>
                <th className="pb-2">B 问题 / 处置建议</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={`border-t border-industrial-700 ${row.isDifferent ? "bg-amber-900/20" : "bg-transparent"}`}
                >
                  <td className="py-2 text-industrial-100">
                    {row.left?.material_pn ?? row.right?.material_pn ?? "--"}
                  </td>
                  <td className="py-2 text-industrial-200">{row.left?.fg_pn ?? row.right?.fg_pn ?? "--"}</td>
                  <td className="py-2 text-[11px] text-industrial-400">{row.left?.description ?? row.right?.description ?? "—"}</td>
                  <td className="py-2 text-xs text-industrial-200">{row.left?.supplier_name ?? row.right?.supplier_name ?? "—"}</td>
                  <td className="py-2 text-industrial-100">{row.left?.planned_qty ?? "--"}</td>
                  <td className={`py-2 ${row.qtyChanged ? "font-medium text-amber-200" : "text-industrial-100"}`}>
                    {row.right?.planned_qty ?? "--"}
                  </td>
                  <td className="py-2 text-industrial-100">{row.left?.planned_order_date ?? "--"}</td>
                  <td className={`py-2 ${row.dateChanged ? "font-medium text-amber-200" : "text-industrial-100"}`}>
                    {row.right?.planned_order_date ?? "--"}
                  </td>
                  <td className="py-2">
                    <MrpStatusLabel
                      status={row.left?.status ?? "conflict"}
                      conflicts={conflictLookupA.get(`${row.left?.material_pn ?? row.right?.material_pn}::${row.left?.fg_pn ?? row.right?.fg_pn}`)}
                    />
                  </td>
                  <td className="py-2">
                    <MrpStatusLabel
                      status={row.right?.status ?? "conflict"}
                      conflicts={conflictLookupB.get(`${row.right?.material_pn ?? row.left?.material_pn}::${row.right?.fg_pn ?? row.left?.fg_pn}`)}
                    />
                  </td>
                  <td className="py-2 text-xs">
                    {row.isDifferent ? (
                      <span className="text-amber-300">
                        {[
                          (!row.left || !row.right) && "增删变更",
                          row.qtyChanged && "数量变更",
                          row.dateChanged && "日期变更",
                          row.statusChanged && "状态变更"
                        ]
                          .filter(Boolean)
                          .join("、") || "存在差异"}
                      </span>
                    ) : (
                      <span className="text-industrial-500">相同</span>
                    )}
                  </td>
                  <td className="py-2 text-xs">
                    {(() => {
                      const key = `${row.right?.material_pn ?? row.left?.material_pn}::${row.right?.fg_pn ?? row.left?.fg_pn}`;
                      const bConflicts = conflictLookupB.get(key);
                      const bStatus = row.right?.status ?? "conflict";
                      const summary = summarizeProblems(bConflicts, bStatus);
                      return (
                        <div className="space-y-1">
                          <p className={summary.problem === "无冲突" ? "text-emerald-300" : "text-rose-200"}>问题：{summary.problem}</p>
                          <p className="text-industrial-300">处置：{summary.resolution}</p>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <h3 className="text-sm font-medium text-industrial-100">B 版人工试调与仿真</h3>
        <p className="mt-1 text-xs text-industrial-300">
          当前对比页用于看差异；若要验证 B 版冲突如何消解，请进入仿真页进行人工调整（数量/最晚下单日），系统会实时显示调整后风险变化。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`text-xs ${bConflictCount > 0 ? "text-rose-300" : "text-emerald-300"}`}>
            B 版当前冲突：{bConflictCount} 条
          </span>
          <button
            type="button"
            onClick={() => router.push(`/plans/${sessionId}?version=B`)}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-600"
          >
            进入 B 版仿真调整
          </button>
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="rounded-lg border border-industrial-600 bg-industrial-900 px-3 py-2 text-xs text-industrial-200 transition hover:bg-industrial-700 hover:text-white"
          >
            打开对话调度窗口
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <h3 className="text-sm font-medium text-industrial-100">审批决策</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setSelectedVersion("A")}
            className={`rounded-lg px-4 py-2 text-sm ${
              selectedVersion === "A"
                ? "bg-rose-700 text-white"
                : "border border-industrial-600 bg-industrial-900 text-industrial-100"
            }`}
          >
            选择 Version A
          </button>
          <button
            type="button"
            onClick={() => setSelectedVersion("B")}
            className={`rounded-lg px-4 py-2 text-sm ${
              selectedVersion === "B"
                ? "bg-emerald-700 text-white"
                : "border border-industrial-600 bg-industrial-900 text-industrial-100"
            }`}
          >
            选择 Version B
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={!selectedVersion || isApproving || loading}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {isApproving ? "提交审批中..." : "确认审批并同步 SRM"}
          </button>
        </div>
      </section>

      {approved && (
        <section className="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
          <p className="text-sm text-emerald-300">
            已批准 Version {selectedVersion}，状态流转为 approved，SRM 模拟同步成功。
          </p>
        </section>
      )}
    </div>
  );
}

export default function PlanComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          <span className="ml-3 text-industrial-300">加载 A/B 对比…</span>
        </div>
      }
    >
      <PlanComparePageInner />
    </Suspense>
  );
}
