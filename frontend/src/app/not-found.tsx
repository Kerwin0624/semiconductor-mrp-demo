import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full border border-amber-700 bg-amber-900/30 px-4 py-2 text-xs text-amber-300">
        404
      </div>
      <h2 className="text-xl font-semibold text-white">页面未找到</h2>
      <p className="max-w-md text-sm text-industrial-300">
        您访问的页面不存在，请检查地址或返回首页。
      </p>
      <Link
        href="/"
        className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
      >
        返回首页
      </Link>
    </div>
  );
}
