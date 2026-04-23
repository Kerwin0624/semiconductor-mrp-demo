"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  confirmDisruptionChat,
  createDisruption,
  fetchAlerts,
  fetchBom,
  fetchMaterials,
  fetchPlanSessions,
  sendDisruptionChat,
} from "@/lib/api";
import { StatusPill } from "@/components/ui/status-pill";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ConfirmForm } from "@/components/chat/confirm-form";
import type { AlertItem, ChatIntent, PlanSessionItem } from "@/types";

type InputMode = "form" | "chat";

export default function AlertsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<AlertItem[]>([]);
  const [levelFilter, setLevelFilter] = useState<"all" | "disruption" | "shelf_life">("all");

  const [disruptionForm, setDisruptionForm] = useState({
    supplierName: "",
    affectedMaterialPns: [] as string[],
    disruptionDays: "14",
    newAvailableDate: "",
    note: "",
  });
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [materialOptions, setMaterialOptions] = useState<string[]>([]);

  const [inputMode, setInputMode] = useState<InputMode>("chat");

  const [chatInput, setChatInput] = useState("");
  const [chatIntent, setChatIntent] = useState<ChatIntent | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatResult, setChatResult] = useState<{
    disruption_id: string;
    blast_radius: Array<{ fg_pn: string; original_due_date: string; estimated_delay_days: number }>;
  } | null>(null);
  const [sessions, setSessions] = useState<PlanSessionItem[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        setError(null);
        const [alertsData, bomData, materialsData, planSessions] = await Promise.all([
          fetchAlerts(),
          fetchBom(),
          fetchMaterials(),
          fetchPlanSessions(),
        ]);
        setEvents(alertsData);
        setSessions(planSessions);

        const suppliers = new Set<string>();
        bomData.forEach((b) => {
          if (b.supplier_name) suppliers.add(b.supplier_name);
        });
        materialsData.forEach((m) => {
          if (m.supplier_name) suppliers.add(m.supplier_name);
        });
        setSupplierOptions([...suppliers].sort());

        const pns = new Set<string>();
        bomData.forEach((b) => {
          if (b.child_pn) pns.add(b.child_pn);
        });
        materialsData.forEach((m) => {
          if (m.material_pn) pns.add(m.material_pn);
        });
        setMaterialOptions([...pns].sort());
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      }
    };
    void run();
  }, []);

  const visibleEvents = useMemo(
    () => events.filter((event) => (levelFilter === "all" ? true : event.type === levelFilter)),
    [events, levelFilter]
  );

  const submitDisruption = async () => {
    try {
      setError(null);
      await createDisruption({
        supplier_name: disruptionForm.supplierName,
        affected_material_pns: disruptionForm.affectedMaterialPns,
        disruption_days: Number(disruptionForm.disruptionDays),
        new_available_date: disruptionForm.newAvailableDate,
        source: "earthquake",
        note: disruptionForm.note,
      });
      setCreated(true);
      const data = await fetchAlerts();
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    }
  };

  const handleChatSend = async () => {
    const text = chatInput.trim();
    if (!text) return;
    try {
      setChatLoading(true);
      setError(null);
      setChatHistory((prev) => [...prev, { role: "user", content: text }]);
      setChatInput("");

      const result = await sendDisruptionChat(text);
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: result.intent.confirmation_prompt },
      ]);

      if (result.needs_confirmation && result.intent.intent_type !== "unknown") {
        setChatIntent(result.intent);
      } else {
        setChatIntent(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "意图识别失败");
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatConfirm = async (params: Record<string, unknown>) => {
    if (!chatIntent) return;
    try {
      setChatLoading(true);
      setError(null);
      const result = await confirmDisruptionChat(chatIntent as unknown as Record<string, unknown>, params);
      setChatResult(result);
      setChatIntent(null);
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `中断事件 ${result.disruption_id} 已创建。影响 ${result.blast_radius?.length ?? 0} 个 FG 订单。`,
        },
      ]);
      const data = await fetchAlerts();
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认失败");
    } finally {
      setChatLoading(false);
    }
  };

  const navigateToLatestPlan = () => {
    if (sessions.length > 0) {
      router.push(`/plans/${sessions[0].session_id}/compare`);
    } else {
      router.push("/plans");
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-2xl font-semibold text-white">异常事件中心</h2>
        <p className="mt-1 text-sm text-industrial-300">覆盖地震预警、保质期预警与内部延迟事件。</p>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        {error && (
          <p className="mb-3 rounded border border-rose-700 bg-rose-900/20 p-2 text-xs text-rose-300">{error}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-industrial-100">事件列表</h3>
          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value as typeof levelFilter)}
            className="rounded-md border border-industrial-600 bg-industrial-900 px-2 py-1 text-xs text-industrial-100"
          >
            <option value="all">全部等级</option>
            <option value="disruption">中断事件</option>
            <option value="shelf_life">保质期预警</option>
          </select>
        </div>
        <div className="mt-3 space-y-3">
          {visibleEvents.length === 0 && (
            <p className="text-xs text-industrial-400">暂无事件</p>
          )}
          {visibleEvents.map((eventItem) => (
            <article
              key={`${eventItem.type}-${eventItem.created_at}`}
              className="rounded-lg border border-industrial-700 bg-industrial-900/60 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-industrial-100">{eventItem.message}</p>
                <div className="flex items-center gap-2">
                  <StatusPill
                    label={eventItem.type === "disruption" ? "中断" : "保质期"}
                    tone={eventItem.type === "disruption" ? "risk" : "warn"}
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-industrial-400">
                时间：{new Date(eventItem.created_at).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Mode Toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setInputMode("chat")}
          className={`rounded-lg px-4 py-2 text-sm transition ${
            inputMode === "chat"
              ? "bg-indigo-600 text-white"
              : "border border-industrial-600 bg-industrial-900 text-industrial-300 hover:text-industrial-100"
          }`}
        >
          智能对话录入
        </button>
        <button
          type="button"
          onClick={() => setInputMode("form")}
          className={`rounded-lg px-4 py-2 text-sm transition ${
            inputMode === "form"
              ? "bg-indigo-600 text-white"
              : "border border-industrial-600 bg-industrial-900 text-industrial-300 hover:text-industrial-100"
          }`}
        >
          表单录入
        </button>
      </div>

      {/* ========== Chat Mode ========== */}
      {inputMode === "chat" && (
        <section className="rounded-xl border border-indigo-700/50 bg-industrial-800/90 p-4">
          <h3 className="text-sm font-medium text-indigo-300">智能异常录入</h3>
          <p className="mt-1 text-xs text-industrial-400">
            用自然语言描述供应链异常，系统自动识别意图、提取结构化数据，确认后触发 MRP 重排程。
          </p>

          {/* Chat History */}
          <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto rounded-lg border border-industrial-700 bg-industrial-900/50 p-3">
            {chatHistory.length === 0 && (
              <p className="text-xs text-industrial-500">
                试试输入：&quot;NITTO 因地震停产 2 周，02-01-0135 和 32-03-0168 无法交货&quot;
              </p>
            )}
            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "border border-industrial-600 bg-industrial-800 text-industrial-100"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg border border-industrial-600 bg-industrial-800 px-3 py-2 text-sm text-industrial-400">
                  分析中...
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="mt-3 flex gap-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleChatSend();
                }
              }}
              className="min-h-[60px] flex-1 rounded-lg border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100"
              placeholder="描述供应链异常情况，例如：NITTO 因地震停产 2 周，影响 02-01-0135 交货..."
              disabled={chatLoading}
            />
            <button
              type="button"
              onClick={() => void handleChatSend()}
              disabled={chatLoading || !chatInput.trim()}
              className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {chatLoading ? "识别中..." : "发送"}
            </button>
          </div>

          {/* Intent Confirmation */}
          {chatIntent && chatIntent.intent_type !== "unknown" && (
            <div className="mt-4">
              <ConfirmForm intent={chatIntent} onSubmit={handleChatConfirm} disabled={chatLoading} />
            </div>
          )}

          {/* Result + Redirect */}
          {chatResult && (
            <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-900/20 p-4">
              <p className="text-sm font-medium text-emerald-300">
                中断事件 {chatResult.disruption_id} 已创建
              </p>
              {chatResult.blast_radius && chatResult.blast_radius.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-emerald-400">爆炸半径（受影响订单）：</p>
                  {chatResult.blast_radius.map((item) => (
                    <p key={item.fg_pn} className="text-xs text-industrial-200">
                      {item.fg_pn} — 原交期 {item.original_due_date}，预计延迟{" "}
                      <span className="text-rose-300">{item.estimated_delay_days}</span> 天
                    </p>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={navigateToLatestPlan}
                className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white"
              >
                查看 MRP 排程对比 (A/B 版本)
              </button>
            </div>
          )}
        </section>
      )}

      {/* ========== Form Mode ========== */}
      {inputMode === "form" && (
        <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
          <h3 className="text-sm font-medium text-industrial-100">录入供应链中断事件</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="supplier-name" className="text-xs text-industrial-300">
                供应商名称
              </label>
              <SearchableSelect
                id="supplier-name"
                options={supplierOptions}
                value={disruptionForm.supplierName}
                onChange={(v) => setDisruptionForm((prev) => ({ ...prev, supplierName: v as string }))}
                placeholder="搜索供应商..."
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="affected-material-pns" className="text-xs text-industrial-300">
                受影响物料 P/N
              </label>
              <SearchableSelect
                id="affected-material-pns"
                options={materialOptions}
                value={disruptionForm.affectedMaterialPns}
                onChange={(v) =>
                  setDisruptionForm((prev) => ({ ...prev, affectedMaterialPns: v as string[] }))
                }
                placeholder="搜索物料料号..."
                multiple
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="disruption-days" className="text-xs text-industrial-300">
                停产天数（天）
              </label>
              <input
                id="disruption-days"
                value={disruptionForm.disruptionDays}
                onChange={(event) =>
                  setDisruptionForm((prev) => ({ ...prev, disruptionDays: event.target.value }))
                }
                className="w-full rounded-md border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100"
                placeholder="例如：14"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-available-date" className="text-xs text-industrial-300">
                预计恢复供货日期
              </label>
              <input
                id="new-available-date"
                type="date"
                value={disruptionForm.newAvailableDate}
                onChange={(event) =>
                  setDisruptionForm((prev) => ({ ...prev, newAvailableDate: event.target.value }))
                }
                className="w-full rounded-md border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100"
              />
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <label htmlFor="disruption-note" className="text-xs text-industrial-300">
              事件备注
            </label>
            <textarea
              id="disruption-note"
              value={disruptionForm.note}
              onChange={(event) =>
                setDisruptionForm((prev) => ({ ...prev, note: event.target.value }))
              }
              className="min-h-24 w-full rounded-md border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100"
            />
          </div>
          <button
            type="button"
            onClick={() => void submitDisruption()}
            className="mt-3 rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white"
          >
            提交并触发爆炸半径计算
          </button>
        </section>
      )}

      {created && inputMode === "form" && (
        <section className="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
          <p className="text-sm text-emerald-300">
            中断事件创建成功，识别受影响 FG 订单，已进入重排程队列。
          </p>
        </section>
      )}
    </div>
  );
}
