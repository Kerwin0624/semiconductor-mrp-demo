"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full border border-rose-700 bg-rose-900/30 px-4 py-2 text-xs text-rose-300">
        页面异常
      </div>
      <h2 className="text-xl font-semibold text-white">页面加载出错</h2>
      <p className="max-w-md text-sm text-industrial-300">
        {error.message || "发生了未知错误，请尝试刷新页面。"}
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-industrial-500">
          错误摘要: {error.digest}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          重试
        </button>
        <button
          type="button"
          onClick={() => (window.location.href = "/")}
          className="rounded-lg border border-industrial-600 bg-industrial-900 px-5 py-2 text-sm text-industrial-200 transition hover:bg-industrial-700"
        >
          返回首页
        </button>
      </div>
    </div>
  );
}
