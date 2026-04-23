"use client";

import { useEffect } from "react";

/**
 * 终极错误边界：当 layout.tsx 自身崩溃时，Next.js 会回退到这个组件。
 * 必须自行提供完整的 <html><body> 结构。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError - layout crash]", error);
  }, [error]);

  return (
    <html lang="zh-CN" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0f1520",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "28rem" }}>
          <p
            style={{
              display: "inline-block",
              border: "1px solid #9f1239",
              backgroundColor: "rgba(159,18,57,0.2)",
              borderRadius: "9999px",
              padding: "0.25rem 1rem",
              fontSize: "0.75rem",
              color: "#fda4af",
              marginBottom: "1rem",
            }}
          >
            系统异常
          </p>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>应用发生严重错误</h2>
          <p style={{ fontSize: "0.875rem", color: "#94a3b8", marginTop: "0.5rem" }}>
            {error.message || "页面布局渲染失败，请尝试刷新。"}
          </p>
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.5rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#fff",
                backgroundColor: "#6366f1",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              重试
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/")}
              style={{
                padding: "0.5rem 1.25rem",
                fontSize: "0.875rem",
                color: "#cbd5e1",
                backgroundColor: "transparent",
                border: "1px solid #475569",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              返回首页
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
