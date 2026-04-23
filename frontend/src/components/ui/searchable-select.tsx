"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface SearchableSelectProps {
  options: string[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  multiple?: boolean;
  id?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "搜索...",
  multiple = false,
  id,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => options.filter((opt) => opt.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );

  const selectedSet = useMemo(
    () => new Set(Array.isArray(value) ? value : value ? [value] : []),
    [value]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (opt: string) => {
    if (multiple) {
      const arr = Array.isArray(value) ? value : value ? [value] : [];
      onChange(arr.includes(opt) ? arr.filter((v) => v !== opt) : [...arr, opt]);
    } else {
      onChange(opt);
      setOpen(false);
      setQuery("");
    }
  };

  const displayText = multiple
    ? (Array.isArray(value) ? value : []).join(", ") || ""
    : (value as string) || "";

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        value={open ? query : displayText}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-industrial-600 bg-industrial-900 px-3 py-2 text-sm text-industrial-100"
      />
      {multiple && selectedSet.size > 0 && !open && (
        <div className="mt-1 flex flex-wrap gap-1">
          {Array.from(selectedSet).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full border border-industrial-600 bg-industrial-800 px-2 py-0.5 text-xs text-industrial-200"
            >
              {s}
              <button
                type="button"
                onClick={() => toggle(s)}
                className="text-industrial-400 hover:text-rose-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-industrial-600 bg-industrial-900 shadow-lg">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-industrial-400">无匹配结果</li>
          )}
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onClick={() => toggle(opt)}
                className={`w-full px-3 py-1.5 text-left text-sm transition ${
                  selectedSet.has(opt)
                    ? "bg-indigo-900/40 text-indigo-300"
                    : "text-industrial-100 hover:bg-industrial-800"
                }`}
              >
                {multiple && (
                  <span className="mr-2 inline-block w-4 text-center">
                    {selectedSet.has(opt) ? "✓" : ""}
                  </span>
                )}
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
