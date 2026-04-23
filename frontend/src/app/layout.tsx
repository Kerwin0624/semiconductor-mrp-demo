import type { Metadata } from "next";

import "./globals.css";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export const metadata: Metadata = {
  title: "Semiconductor MRP Demo",
  description: "Multi-Agent MRP and exception dispatch demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <div className="flex min-h-screen flex-1 flex-col">
            <Topbar />
            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </div>
        <ChatPanel />
      </body>
    </html>
  );
}
