"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { deletePlanSession, fetchPlanSessions } from "@/lib/api";
import { StatusPill } from "@/components/ui/status-pill";
import type { PlanSessionItem } from "@/types";

export default function PlansListPage() {
  const [rows, setRows] = useState<PlanSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setError(null);
      const items = await fetchPlanSessions();
      setRows(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleDelete = async (sessionId: string) => {
    try {
      setDeletingId(sessionId);
      await deletePlanSession(sessionId);
      setRows((prev) => prev.filter((item) => item.session_id !== sessionId));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const statusLabel = (status: string) => {
    if (status === "pending_approval") return "待审批";
    if (status === "approved") return "已审批";
    return "已同步";
  };

  const statusTone = (status: string): "warn" | "good" | "neutral" => {
    if (status === "pending_approval") return "warn";
    if (status === "approved") return "good";
    return "neutral";
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">MRP 计划</h2>
          <p className="mt-1 text-sm text-industrial-300">
            以下是上传 MPS 后自动生成的 MRP 计划会话。
          </p>
        </div>
        <Link
          href="/mps/new"
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          上传新 MPS
        </Link>
      </section>

      {error && <p className="rounded-lg border border-rose-700 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p>}

      {!loading && rows.length === 0 && !error && (
        <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-8 text-center">
          <p className="text-sm text-industrial-300">暂无 MRP 计划会话。</p>
          <p className="mt-2 text-xs text-industrial-400">
            请先通过 <Link href="/mps/new" className="text-indigo-300 hover:text-indigo-200">MPS 上传</Link> 生成计划。
          </p>
        </section>
      )}

      {(loading || rows.length > 0) && (
        <section className="space-y-3">
          {loading && (
            <div className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-6 text-center">
              <p className="text-sm text-industrial-300">加载中...</p>
            </div>
          )}
          {rows.map((item) => (
            <article
              key={item.session_id}
              className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4 transition hover:border-industrial-600"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-industrial-100">{item.session_id}</h3>
                    <StatusPill label={statusLabel(item.status)} tone={statusTone(item.status)} />
                  </div>
                  <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-industrial-300 sm:grid-cols-2">
                    <p>成品料号：<span className="text-industrial-100">{item.fg_pn}</span></p>
                    <p>创建时间：<span className="text-industrial-100">{new Date(item.created_at).toLocaleString()}</span></p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/plans/${item.session_id}`}
                    className="rounded-lg bg-indigo-500/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400"
                  >
                    查看详情
                  </Link>
                  {confirmDeleteId === item.session_id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.session_id)}
                        disabled={deletingId === item.session_id}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
                      >
                        {deletingId === item.session_id ? "删除中..." : "确认删除"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-industrial-600 bg-industrial-900 px-3 py-1.5 text-xs text-industrial-200 transition hover:bg-industrial-800"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.session_id)}
                      className="rounded-lg border border-rose-800 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-900/30"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
