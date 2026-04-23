"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusPill } from "@/components/ui/status-pill";
import { fetchMpsSession, fetchPlanSessionDetail } from "@/lib/api";
import type { ParsedMpsResult, PlanSessionDetail } from "@/types";

function constraintBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function deriveSessionConstraintLabels(constraints: Record<string, unknown>) {
  const isAutoGrade = constraintBool(constraints.auto_grade);
  const noUsMaterial = constraintBool(constraints.no_us_material);
  const customNotes = typeof constraints.custom_notes === "string" ? constraints.custom_notes.trim() : "";
  return {
    isAutoGrade,
    /** 与 no_us_material 相反：未禁用美系即「可用」 */
    usMaterialAllowed: !noUsMaterial,
    remark: customNotes || "—"
  };
}

export default function MpsSessionPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [parsed, setParsed] = useState<ParsedMpsResult | null>(null);
  const [planDetail, setPlanDetail] = useState<PlanSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setError(null);
        const [mpsData, planData] = await Promise.all([
          fetchMpsSession(sessionId),
          fetchPlanSessionDetail(sessionId)
        ]);
        setParsed(mpsData);
        setPlanDetail(planData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
        setPlanLoading(false);
      }
    };
    void run();
  }, [sessionId]);

  const labels = deriveSessionConstraintLabels(parsed?.constraints ?? {});
  const totalConflictCount = (planDetail?.versions.find((item) => item.version === "B")?.conflict_report.summary ?? []).reduce(
    (sum, conflict) => sum + conflict.count,
    0
  );

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">MPS 解析结果确认</h2>
          <p className="mt-1 text-sm text-industrial-300">Session: {sessionId}</p>
        </div>
        <StatusPill
          label={planDetail?.status === "pending_approval" ? "计划已生成" : planLoading ? "加载中" : "待确认"}
          tone={planDetail?.status === "pending_approval" ? "good" : "warn"}
        />
      </section>

      {error && <p className="rounded-lg border border-rose-700 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p>}

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <h3 className="text-sm font-medium text-industrial-100">原始备注</h3>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-industrial-900/70 p-3 text-sm text-industrial-200">
          {loading ? "加载中..." : labels.remark !== "—" ? labels.remark : "（上传时未填写备注，或仅包含结构化约束）"}
        </p>
        {!loading && parsed?.constraints && Object.keys(parsed.constraints).length > 0 && (
          <details className="mt-2 text-xs text-industrial-400">
            <summary className="cursor-pointer text-industrial-300 hover:text-industrial-200">查看结构化约束 JSON</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-industrial-950/80 p-2 font-mono text-[11px] text-industrial-300">
              {JSON.stringify(parsed.constraints, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <h3 className="text-sm font-medium text-industrial-100">识别出的约束标签</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {Object.entries(parsed?.constraints ?? {}).map(([key, value]) => (
            <article key={key} className="rounded-lg border border-industrial-600 bg-industrial-900/70 p-3">
              <p className="text-xs text-industrial-400">{key}</p>
              <p className="mt-1 text-sm text-industrial-100">{String(value)}</p>
            </article>
          ))}
          {!loading && Object.keys(parsed?.constraints ?? {}).length === 0 && (
            <p className="text-xs text-industrial-400">未识别到显式约束标签</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <h3 className="text-sm font-medium text-industrial-100">订单明细</h3>
        <p className="mt-1 text-xs text-industrial-400">
          车规、美系物料与备注来自本会话解析后的统一约束（与备注页一致）；若需按行不同约束，需在后续版本扩展 MPS 列。
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="text-industrial-300">
              <tr>
                <th className="pb-2">FG P/N</th>
                <th className="pb-2">数量</th>
                <th className="pb-2">交期</th>
                <th className="pb-2">优先级</th>
                <th className="pb-2">是否车规</th>
                <th className="pb-2">是否可用美系物料</th>
                <th className="pb-2 min-w-[200px]">备注</th>
              </tr>
            </thead>
            <tbody className="text-industrial-100">
              {(parsed?.orders ?? []).map((order, index) => (
                <tr key={`${order.fg_pn}-${index}`} className="border-t border-industrial-700">
                  <td className="py-2">{order.fg_pn}</td>
                  <td className="py-2">{order.qty}</td>
                  <td className="py-2">{order.due_date}</td>
                  <td className="py-2">{order.priority === "high" ? "高" : "低"}</td>
                  <td className="py-2">
                    <StatusPill label={labels.isAutoGrade ? "是" : "否"} tone={labels.isAutoGrade ? "good" : "neutral"} />
                  </td>
                  <td className="py-2">
                    <StatusPill
                      label={labels.usMaterialAllowed ? "是" : "否"}
                      tone={labels.usMaterialAllowed ? "good" : "warn"}
                    />
                  </td>
                  <td className="max-w-xs py-2 text-industrial-200" title={labels.remark === "—" ? undefined : labels.remark}>
                    <span className="line-clamp-2">{labels.remark}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <h3 className="text-sm font-medium text-industrial-100">MRP 计划生成状态</h3>
        {planLoading ? (
          <p className="mt-2 text-sm text-industrial-300">计划状态加载中...</p>
        ) : planDetail ? (
          <div className="mt-2 space-y-2 text-sm text-industrial-200">
            <p>计划会话状态：{planDetail.status}</p>
            <p>可选版本：{planDetail.versions.map((item) => item.version).join(" / ") || "无"}</p>
            <p>Version B 冲突总数：{totalConflictCount}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-industrial-300">尚未读取到计划详情，请稍后重试。</p>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push(`/plans/${sessionId}`)}
          disabled={loading || !!error}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white transition hover:bg-indigo-400"
        >
          查看 MRP 计划
        </button>
        <Link
          href="/mps/new"
          className="rounded-lg border border-industrial-600 bg-industrial-900 px-4 py-2 text-sm text-industrial-100"
        >
          返回修改备注
        </Link>
      </section>
    </div>
  );
}
