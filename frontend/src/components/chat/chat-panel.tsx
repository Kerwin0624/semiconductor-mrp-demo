"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { confirmChatIntent, fetchChatHistory, sendChatMessage } from "@/lib/api";
import type { ChatHistoryItem, ChatIntent } from "@/types";
import { ConfirmForm } from "@/components/chat/confirm-form";
import { MessageBubble } from "@/components/chat/message-bubble";

export function ChatPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatHistoryItem[]>([]);
  const [intent, setIntent] = useState<ChatIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const run = async () => {
      const data = await fetchChatHistory(sessionId);
      setMessages(data.items);
    };
    void run();
  }, [sessionId]);

  const submitMessage = async () => {
    if (!sessionId || !message.trim()) {
      setError("请先填写 session_id 和消息内容");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await sendChatMessage(sessionId, message);
      setIntent(response.intent);
      const history = await fetchChatHistory(sessionId);
      setMessages(history.items);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (params: Record<string, unknown>) => {
    if (!sessionId || !intent) return;
    setLoading(true);
    setError(null);
    try {
      await confirmChatIntent(sessionId, intent as unknown as Record<string, unknown>, params);
      const history = await fetchChatHistory(sessionId);
      setMessages(history.items);
      setIntent(null);
      setOpen(false);
      router.push(`/plans/${sessionId}/compare`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <section className="h-[560px] w-[360px] rounded-xl border border-industrial-600 bg-industrial-900 shadow-2xl">
          <header className="flex items-center justify-between border-b border-industrial-700 px-3 py-2">
            <h3 className="text-sm font-medium text-industrial-100">对话式调度</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-industrial-300 hover:text-white">
              收起
            </button>
          </header>

          <div className="space-y-2 border-b border-industrial-700 px-3 py-2">
            <input
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder="输入已存在 session_id"
              className="w-full rounded border border-industrial-600 bg-industrial-800 px-2 py-1 text-xs text-industrial-100"
            />
            <Link href="/chat" className="text-xs text-indigo-300 hover:text-indigo-200">
              打开完整 /chat 页面
            </Link>
          </div>

          <div className="h-[290px] space-y-2 overflow-y-auto px-3 py-2">
            {messages.length === 0 ? <p className="text-xs text-industrial-400">暂无对话历史</p> : null}
            {messages.map((item) => (
              <MessageBubble key={item.id} role={item.role} content={item.content} time={new Date(item.created_at).toLocaleString()} />
            ))}
          </div>

          <div className="space-y-2 border-t border-industrial-700 px-3 py-2">
            {intent ? <ConfirmForm intent={intent} onSubmit={confirm} disabled={loading} /> : null}
            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="例如：车规级产品优先，确保不晚于Q2"
              className="min-h-20 w-full rounded border border-industrial-600 bg-industrial-800 px-2 py-1 text-xs text-industrial-100"
            />
            <button
              type="button"
              onClick={() => void submitMessage()}
              disabled={loading}
              className="w-full rounded bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-60"
            >
              {loading ? "处理中..." : "发送并识别意图"}
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-indigo-400/40 bg-indigo-500 px-4 py-2 text-sm text-white shadow-xl hover:bg-indigo-400"
        >
          对话调度
        </button>
      )}
    </div>
  );
}
