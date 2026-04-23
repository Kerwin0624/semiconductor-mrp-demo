"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { fetchAlerts, fetchMetricsSummary, fetchPlanSessions } from "@/lib/api";
import type { AlertItem, MetricSummary, PlanSessionItem } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<MetricSummary | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [planSessions, setPlanSessions] = useState<PlanSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending_approval" | "approved" | "srm_synced">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const [metricsData, alertData, sessionData] = await Promise.all([
          fetchMetricsSummary(),
          fetchAlerts(),
          fetchPlanSessions()
        ]);
        setSummary(metricsData);
        setAlerts(alertData);
        setPlanSessions(sessionData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const visibleSessions = useMemo(
    () => planSessions.filter((item) => (filter === "all" ? true : item.status === filter)),
    [filter, planSessions]
  );

  const cards = [
    {
      key: "mps_plans",
      label: "MRP 计划管理",
      value: loading ? "--" : String(planSessions.length),
      trend: "点击查看所有 MRP 计划",
      tone: "neutral" as const,
      href: "/plans"
    },
    {
      key: "mrp_success",
      label: "计划生成成功率",
      value: summary ? `${summary.today_mrp_success_rate.toFixed(2)}%` : "--",
      trend: "来源: /api/metrics/summary",
      tone: summary && summary.today_mrp_success_rate < 80 ? ("risk" as const) : ("neutral" as const)
    },
    {
      key: "pending",
      label: "待审批 Session",
      value: summary ? String(summary.pending_approval_sessions) : "--",
      trend: "来源: /api/metrics/summary",
      tone: "neutral" as const
    },
    {
      key: "active_disrupt",
      label: "活跃中断事件",
      value: summary ? String(summary.active_disruptions) : "--",
      trend: "来源: /api/metrics/summary",
      tone: summary && summary.active_disruptions > 0 ? ("risk" as const) : ("good" as const)
    }
  ];

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-2xl font-semibold text-white">工业级 MRP 调度总览</h2>
        <p className="mt-1 text-sm text-industrial-300">
          覆盖 MPS 上传、A/B 对比审批、异常录入与主数据管理全流程。
        </p>
      </section>

      {error && <p className="rounded-lg border border-rose-700 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((metric) => (
          <MetricCard
            key={metric.key}
            label={metric.label}
            value={metric.value}
            trend={metric.trend}
            tone={metric.tone}
            href={metric.href}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr,1fr]">
        <article className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-industrial-100">Plan Sessions</h3>
            <select
              className="rounded-md border border-industrial-600 bg-industrial-900 px-2 py-1 text-xs text-industrial-100"
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
            >
              <option value="all">全部状态</option>
              <option value="pending_approval">待审批</option>
              <option value="approved">已审批</option>
              <option value="srm_synced">已同步 SRM</option>
            </select>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-industrial-300">
                <tr>
                  <th className="pb-2">Session</th>
                  <th className="pb-2">成品 P/N</th>
                <th className="pb-2">创建时间</th>
                  <th className="pb-2">状态</th>
                </tr>
              </thead>
              <tbody className="text-industrial-100">
                {loading && (
                  <tr>
                    <td className="py-3 text-industrial-300" colSpan={4}>
                      数据加载中...
                    </td>
                  </tr>
                )}
                {visibleSessions.map((item) => (
                  <tr
                    key={item.session_id}
                    className="cursor-pointer border-t border-industrial-700 transition hover:bg-indigo-500/10"
                    onClick={() => router.push(`/plans/${item.session_id}`)}
                  >
                    <td className="py-2 text-indigo-300 underline decoration-indigo-400/40 underline-offset-2">{item.session_id}</td>
                    <td className="py-2">{item.fg_pn}</td>
                    <td className="py-2">{new Date(item.created_at).toLocaleString()}</td>
                    <td className="py-2">
                      <StatusPill
                        label={
                          item.status === "pending_approval" ? "待审批" : item.status === "approved" ? "已审批" : "已同步"
                        }
                        tone={
                          item.status === "pending_approval" ? "warn" : item.status === "approved" ? "good" : "neutral"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
          <h3 className="text-sm font-medium text-industrial-100">最近异常</h3>
          <div className="mt-3 space-y-3">
            {alerts.slice(0, 3).map((event) => (
              <div key={`${event.type}-${event.created_at}`} className="rounded-lg border border-industrial-700 bg-industrial-900/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-industrial-100">{event.message}</p>
                  <StatusPill label={event.type === "disruption" ? "中断" : "保质期"} tone={event.type === "disruption" ? "risk" : "warn"} />
                </div>
                <p className="mt-2 text-xs text-industrial-300">{new Date(event.created_at).toLocaleString()}</p>
              </div>
            ))}
            {!loading && alerts.length === 0 && <p className="text-xs text-industrial-400">暂无异常</p>}
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <h3 className="text-sm font-medium text-industrial-100">快捷操作</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link className="rounded-lg border border-industrial-600 bg-industrial-900 px-4 py-3 text-sm text-industrial-100 hover:border-indigo-400" href="/mps/new">
            新建 MPS 任务
          </Link>
          <Link
            className="rounded-lg border border-industrial-600 bg-industrial-900 px-4 py-3 text-sm text-industrial-100 hover:border-indigo-400"
            href="/mps/S-2026-0403-001"
          >
            查看解析确认
          </Link>
          <Link
            className="rounded-lg border border-industrial-600 bg-industrial-900 px-4 py-3 text-sm text-industrial-100 hover:border-indigo-400"
            href="/plans/S-2026-0403-001"
          >
            审批 Version A/B
          </Link>
          <Link className="rounded-lg border border-industrial-600 bg-industrial-900 px-4 py-3 text-sm text-industrial-100 hover:border-indigo-400" href="/alerts">
            录入中断事件
          </Link>
        </div>
      </section>
    </div>
  );
}
