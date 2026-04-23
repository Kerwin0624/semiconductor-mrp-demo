"use client";

import type { ChatRole } from "@/types";

interface MessageBubbleProps {
  role: ChatRole;
  content: string;
  time?: string;
}

export function MessageBubble({ role, content, time }: MessageBubbleProps) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-indigo-600 text-white" : "border border-industrial-600 bg-industrial-800 text-industrial-100"
        }`}
      >
        <p>{content}</p>
        {time ? <p className="mt-1 text-[11px] opacity-70">{time}</p> : null}
      </div>
    </div>
  );
}
