"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/mps/new", label: "MPS 上传", exact: false },
  { href: "/plans", label: "MRP 计划", exact: false },
  { href: "/chat", label: "对话调度", exact: false },
  { href: "/alerts", label: "异常事件", exact: false },
  { href: "/data/bom", label: "BOM 管理", exact: true },
  { href: "/data/materials", label: "物料管理", exact: true }
];

function isActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-industrial-700 bg-industrial-800 px-3 py-3 md:w-64 md:border-b-0 md:border-r md:px-4 md:py-5">
      <h1 className="mb-3 text-base font-semibold text-industrial-100 md:mb-6">MRP 调度系统</h1>
      <nav className="grid grid-cols-2 gap-2 md:flex md:flex-col">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm transition ${
              isActive(pathname, item.href, item.exact)
                ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40"
                : "text-industrial-200 hover:bg-industrial-700 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
