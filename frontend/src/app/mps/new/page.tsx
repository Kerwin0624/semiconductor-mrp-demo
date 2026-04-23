"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { StatusPill } from "@/components/ui/status-pill";
import { deletePlanSession, fetchPlanSessions, getTemplateUrl, uploadMps } from "@/lib/api";
import type { PlanSessionItem } from "@/types";

export default function NewMpsPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("未选择文件");
  const [note, setNote] = useState("禁用美系物料；车规级 Q2 优先；低优先级可动用 <=20% 安全库存。");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedSessionId, setSubmittedSessionId] = useState<string | null>(null);
  const [submitInfo, setSubmitInfo] = useState<string | null>(null);

  const [plans, setPlans] = useState<PlanSessionItem[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    try {
      setPlansLoading(true);
      const data = await fetchPlanSessions();
      setPlans(data);
    } catch {
      // 计划列表加载失败不阻塞上传功能
    } finally {
      setPlansLoading(false);
    }
  }, []);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  const handleDelete = async (sessionId: string) => {
    try {
      setDeletingId(sessionId);
      await deletePlanSession(sessionId);
      setPlans((prev) => prev.filter((p) => p.session_id !== sessionId));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("请先选择 MPS Excel 文件");
      return;
    }
    try {
      setError(null);
      setSubmitInfo(null);
      setIsSubmitting(true);
      const result = await uploadMps(file, note);
      setSubmittedSessionId(result.session_id);
      const warningText = result.warnings.length > 0 ? `，警告 ${result.warnings.length} 条` : "";
      setSubmitInfo(`MRP 状态：${result.mrp_status}；计划状态：${result.plan_status}${warningText}。即将跳转到计划详情页。`);
      setTimeout(() => {
        router.replace(`/plans/${result.session_id}`);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-2xl font-semibold text-white">MPS 上传与意图解析</h2>
        <p className="mt-1 text-sm text-industrial-300">
          上传 Excel 并输入自然语言约束，系统将进入 Agent 1 解析流程。
        </p>
      </section>

      {error && <p className="rounded-lg border border-rose-700 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p>}

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <label
          htmlFor="mps-file"
          className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-industrial-500 bg-industrial-900/50 text-center"
        >
          <span className="text-sm text-industrial-200">拖拽或点击上传 MPS Excel</span>
          <span className="mt-2 text-xs text-industrial-400">必填列：fg_pn / qty / qty_uom / due_date / priority / order_type</span>
          <span className="mt-4 rounded bg-industrial-700 px-2 py-1 text-xs text-industrial-100">{fileName}</span>
          <input
            id="mps-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const current = event.target.files?.[0] ?? null;
              setFile(current);
              setFileName(current?.name ?? "未选择文件");
            }}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href={getTemplateUrl("mps")}
            download
            className="rounded-lg border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300 transition hover:border-emerald-500 hover:bg-emerald-900/50"
          >
            下载 MPS 模板
          </a>
          <span className="text-xs text-industrial-400">
            模板含成品料号、需求数量、数量单位、需求交期、优先级、订单类型 6 列，支持 .xlsx 格式。
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <label htmlFor="note" className="text-sm text-industrial-200">
          自然语言约束备注
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-2 min-h-36 w-full rounded-lg border border-industrial-600 bg-industrial-900 p-3 text-sm text-industrial-100 outline-none ring-indigo-400/40 focus:ring"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {isSubmitting ? "解析中..." : "提交并解析"}
          </button>
          <span className="text-xs text-industrial-400">提交后将生成 Session 并自动进入 MRP 计划详情页。</span>
        </div>
      </section>

      {submittedSessionId && (
        <section className="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
          <p className="text-sm text-emerald-300">解析完成：已生成 Session `{submittedSessionId}`。</p>
          {submitInfo && <p className="mt-2 text-xs text-emerald-200">{submitInfo}</p>}
        </section>
      )}

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-industrial-100">现有 MRP 计划</h3>
            <p className="mt-1 text-xs text-industrial-400">点击计划可进入 MRP 详情与 A/B 对比审批页面。</p>
          </div>
          <span className="text-xs text-industrial-400">共 {plans.length} 条</span>
        </div>

        {plansLoading && <p className="mt-4 text-xs text-industrial-400">加载中...</p>}

        {!plansLoading && plans.length === 0 && (
          <p className="mt-4 text-xs text-industrial-400">暂无计划，请上传 MPS Excel 生成。</p>
        )}

        {plans.length > 0 && (
          <div className="mt-4 space-y-2">
            {plans.map((p) => (
              <div
                key={p.session_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-industrial-700 bg-industrial-900/60 px-4 py-3 transition hover:border-indigo-400/40"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  onClick={() => router.push(`/plans/${p.session_id}`)}
                >
                  <span className="truncate text-sm text-indigo-300 underline decoration-indigo-400/40 underline-offset-2">
                    {p.session_id}
                  </span>
                  <span className="shrink-0 text-sm text-industrial-100">{p.fg_pn}</span>
                  <span className="shrink-0 text-xs text-industrial-400">
                    {new Date(p.created_at).toLocaleString()}
                  </span>
                  <StatusPill
                    label={p.status === "pending_approval" ? "待审批" : p.status === "approved" ? "已审批" : "已同步"}
                    tone={p.status === "pending_approval" ? "warn" : p.status === "approved" ? "good" : "neutral"}
                  />
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  {confirmDeleteId === p.session_id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.session_id)}
                        disabled={deletingId === p.session_id}
                        className="rounded px-2 py-1 text-xs text-rose-300 transition hover:bg-rose-900/40 disabled:opacity-50"
                      >
                        {deletingId === p.session_id ? "删除中..." : "确认删除"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded px-2 py-1 text-xs text-industrial-400 transition hover:bg-industrial-700"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(p.session_id)}
                      className="rounded px-2 py-1 text-xs text-industrial-400 transition hover:bg-rose-900/30 hover:text-rose-300"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
