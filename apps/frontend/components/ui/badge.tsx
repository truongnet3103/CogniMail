import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
};

export function Badge({ children, className }: Props) {
  return (
    <span className={cn("inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600", className)}>
      {children}
    </span>
  );
}
