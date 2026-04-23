"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function PlansError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PlansError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full border border-rose-700 bg-rose-900/30 px-4 py-2 text-xs text-rose-300">
        MRP 计划模块异常
      </div>
      <h2 className="text-xl font-semibold text-white">计划页面加载出错</h2>
      <p className="max-w-md text-sm text-industrial-300">
        {error.message || "MRP 计划模块发生错误，请重试。"}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          重试
        </button>
        <Link
          href="/"
          className="rounded-lg border border-industrial-600 bg-industrial-900 px-5 py-2 text-sm text-industrial-200 transition hover:bg-industrial-700"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
