interface StatusPillProps {
  label: string;
  tone?: "neutral" | "good" | "risk" | "warn";
}

const toneMap: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  neutral: "border-industrial-600 bg-industrial-700/70 text-industrial-100",
  good: "border-emerald-700 bg-emerald-900/40 text-emerald-300",
  risk: "border-rose-700 bg-rose-900/40 text-rose-300",
  warn: "border-amber-700 bg-amber-900/40 text-amber-300"
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneMap[tone]}`}>
      {label}
    </span>
  );
}
