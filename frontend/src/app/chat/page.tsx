"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { confirmChatIntent, fetchChatHistory, fetchPlanSessions, sendChatMessage } from "@/lib/api";
import { ConfirmForm } from "@/components/chat/confirm-form";
import { MessageBubble } from "@/components/chat/message-bubble";
import type { ChatHistoryItem, ChatIntent, PlanSessionItem } from "@/types";

export default function ChatPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PlanSessionItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatHistoryItem[]>([]);
  const [message, setMessage] = useState("");
  const [intent, setIntent] = useState<ChatIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestReschedule, setLatestReschedule] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const items = await fetchPlanSessions();
      setSessions(items);
      if (items.length > 0) {
        setSessionId(items[0].session_id);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const run = async () => {
      const data = await fetchChatHistory(sessionId);
      setMessages(data.items);
    };
    void run();
  }, [sessionId]);

  const handleSend = async () => {
    if (!sessionId || !message.trim()) {
      setError("请选择 session 并输入消息");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await sendChatMessage(sessionId, message);
      setIntent(result.intent);
      const history = await fetchChatHistory(sessionId);
      setMessages(history.items);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (params: Record<string, unknown>) => {
    if (!sessionId || !intent) return;
    try {
      setLoading(true);
      setError(null);
      const result = await confirmChatIntent(sessionId, intent as unknown as Record<string, unknown>, params);
      setLatestReschedule(`重排程完成：mrp_status=${result.mrp_status}, plan_status=${result.plan_status}`);
      const history = await fetchChatHistory(sessionId);
      setMessages(history.items);
      setIntent(null);
      router.push(`/plans/${sessionId}/compare`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-2xl font-semibold text-white">对话式调度</h2>
        <p className="mt-1 text-sm text-industrial-300">在已有排产 Session 上，通过自然语言发起交期修改或特定物料替换。</p>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <label className="text-sm text-industrial-200">
          选择 Session
          <select
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            className="mt-2 w-full rounded border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100"
          >
            {sessions.map((item) => (
              <option key={item.session_id} value={item.session_id}>
                {item.session_id} - {item.fg_pn}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <h3 className="text-sm font-medium text-industrial-100">对话历史</h3>
        <div className="mt-3 max-h-[380px] space-y-2 overflow-y-auto">
          {messages.length === 0 ? <p className="text-xs text-industrial-400">暂无历史记录</p> : null}
          {messages.map((item) => (
            <MessageBubble key={item.id} role={item.role} content={item.content} time={new Date(item.created_at).toLocaleString()} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-industrial-700 bg-industrial-800/90 p-4">
        <label className="text-sm text-industrial-200">
          输入自然语言指令
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="mt-2 min-h-24 w-full rounded border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100"
            placeholder="例如：车规级产品优先出货并确保不晚于Q2"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={loading}
          className="mt-3 rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {loading ? "处理中..." : "发送并识别"}
        </button>
      </section>

      {intent ? <ConfirmForm intent={intent} onSubmit={handleConfirm} disabled={loading} /> : null}

      {latestReschedule ? (
        <section className="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
          <p className="text-sm text-emerald-300">{latestReschedule}</p>
        </section>
      ) : null}
      {error ? <p className="rounded-lg border border-rose-700 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
