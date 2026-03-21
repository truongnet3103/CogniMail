"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function Segmented<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <div className={cn("inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
