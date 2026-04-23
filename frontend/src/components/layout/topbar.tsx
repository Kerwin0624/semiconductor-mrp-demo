"use client";

import { useEffect, useState } from "react";

export function Topbar() {
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        })
      );
    };

    update();
    const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="flex h-14 items-center justify-between border-b border-industrial-700 bg-industrial-900 px-4 md:px-6">
      <div>
        <div className="text-sm text-industrial-100">半导体供应链 Multi-Agent MRP Demo</div>
        <div className="text-xs text-industrial-400">当前时间 {currentTime || "--"}</div>
      </div>
      <div className="rounded-full border border-emerald-700 bg-emerald-900/40 px-3 py-1 text-xs text-emerald-300">
        系统状态: Online
      </div>
    </header>
  );
}
