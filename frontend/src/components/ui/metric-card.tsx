import Link from "next/link";

import { StatusPill } from "@/components/ui/status-pill";

interface MetricCardProps {
  label: string;
  value: string;
  trend: string;
  tone: "neutral" | "good" | "risk";
  href?: string;
}

export function MetricCard({ label, value, trend, tone, href }: MetricCardProps) {
  const Wrapper = href ? Link : "article";
  const wrapperProps = href
    ? { href, className: "block rounded-xl border border-industrial-700 bg-industrial-800/90 p-4 shadow-lg shadow-black/20 transition hover:border-indigo-400" }
    : { className: "rounded-xl border border-industrial-700 bg-industrial-800/90 p-4 shadow-lg shadow-black/20" };

  return (
    // @ts-expect-error -- Link and article share the className prop; TS cannot unify them
    <Wrapper {...wrapperProps}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm text-industrial-300">{label}</h3>
        <StatusPill
          label={tone === "good" ? "健康" : tone === "risk" ? "风险" : "监控中"}
          tone={tone === "good" ? "good" : tone === "risk" ? "risk" : "neutral"}
        />
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-industrial-50">{value}</p>
      <p className="mt-2 text-xs text-industrial-300">{trend}</p>
    </Wrapper>
  );
}
