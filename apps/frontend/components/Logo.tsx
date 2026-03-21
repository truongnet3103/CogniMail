"use client";

type Props = {
  size?: "sm" | "md" | "lg";
  dark?: boolean;
};

export function Logo({ size = "md", dark = false }: Props) {
  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const text = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-xl";

  return (
    <div className="flex items-center gap-2">
      <div className={`${box} rounded-2xl bg-gradient-to-br from-cyan-500 via-sky-500 to-indigo-500 p-2 shadow-lg`}>
        <svg viewBox="0 0 24 24" className="h-full w-full fill-white">
          <path d="M3 6.75A2.75 2.75 0 0 1 5.75 4h12.5A2.75 2.75 0 0 1 21 6.75v10.5A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25V6.75Zm2.2-.25 6.8 5.16 6.8-5.16H5.2Zm13.8 1.6-6.4 4.86a1 1 0 0 1-1.2 0L5 8.1v9.15c0 .41.34.75.75.75h12.5c.41 0 .75-.34.75-.75V8.1Z" />
        </svg>
      </div>
      <div>
        <p className={`${text} font-bold ${dark ? "text-white" : "text-slate-900"}`}>CogniMail</p>
        <p className={`text-xs ${dark ? "text-slate-300" : "text-slate-500"}`}>Trợ lý hộp thư thông minh</p>
      </div>
    </div>
  );
}
