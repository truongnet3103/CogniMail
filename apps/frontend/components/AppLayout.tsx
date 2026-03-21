"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";

type ViewId = "emails" | "settings" | "calendar" | "donate";

type Props = {
  activeView: ViewId;
  setActiveView: (view: ViewId) => void;
  onLogout: () => Promise<void>;
  sidebarExtra?: ReactNode;
  children: ReactNode;
};

const views: Array<{ id: ViewId; label: string }> = [
  { id: "emails", label: "Hộp thư" },
  { id: "calendar", label: "Lịch" },
  { id: "donate", label: "Donate" },
];

function ArrowToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="Mở thanh bên"
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm transition hover:text-slate-800"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M9.2 5.5 16 12l-6.8 6.5-1.4-1.5L13 12 7.8 7l1.4-1.5Z" />
      </svg>
    </button>
  );
}

export function AppLayout({ activeView, setActiveView, onLogout, sidebarExtra, children }: Props) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-transparent">
      <aside className="hidden h-screen w-[292px] border-r border-slate-200 bg-white/90 p-5 text-slate-700 backdrop-blur min-[1025px]:fixed min-[1025px]:left-0 min-[1025px]:top-0 min-[1025px]:flex min-[1025px]:flex-col">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-gradient-to-r from-sky-50 to-cyan-50 p-3">
          <Logo />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <nav className="space-y-2">
            {views.map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                className={cn(
                  "w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
                  activeView === view.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100",
                )}
              >
                {view.label}
              </button>
            ))}
          </nav>

          {sidebarExtra ? <div className="mt-4 space-y-3">{sidebarExtra}</div> : null}
        </div>

        <div className="mt-3 border-t border-slate-200 pt-3">
          <Button
            variant={activeView === "settings" ? "default" : "secondary"}
            className="mb-2 w-full"
            onClick={() => setActiveView("settings")}
          >
            Cài đặt
          </Button>
          <Button
            variant={activeView === "donate" ? "default" : "secondary"}
            className="mb-2 w-full"
            onClick={() => setActiveView("donate")}
          >
            Donate
          </Button>
          <Button variant="secondary" className="w-full" onClick={onLogout}>
            Đăng xuất
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur min-[1025px]:hidden">
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <ArrowToggle onClick={() => setMobileSidebarOpen(true)} />
            <h1 className="text-lg font-semibold text-slate-900">CogniMail</h1>
            <div className="w-9" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {views.map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold",
                  activeView === view.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700",
                )}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 min-[1025px]:hidden">
          <button className="absolute inset-0 bg-slate-900/35" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[88%] max-w-[350px] overflow-y-auto border-r border-slate-200 bg-white p-4 text-slate-700 shadow-2xl">
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-gradient-to-r from-sky-50 to-cyan-50 p-3">
              <Logo size="sm" />
              <button
                aria-label="Đóng thanh bên"
                onClick={() => setMobileSidebarOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="m7.7 6.3 4.3 4.3 4.3-4.3 1.4 1.4-4.3 4.3 4.3 4.3-1.4 1.4-4.3-4.3-4.3 4.3-1.4-1.4 4.3-4.3-4.3-4.3 1.4-1.4Z" />
                </svg>
              </button>
            </div>

            <nav className="space-y-2">
              {views.map((view) => (
                <button
                  key={view.id}
                  onClick={() => {
                    setActiveView(view.id);
                    setMobileSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
                    activeView === view.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {view.label}
                </button>
              ))}
            </nav>

            {sidebarExtra ? <div className="mt-4 space-y-3">{sidebarExtra}</div> : null}

            <div className="mt-6">
              <Button
                variant={activeView === "settings" ? "default" : "secondary"}
                className="mb-2 w-full"
                onClick={() => {
                  setActiveView("settings");
                  setMobileSidebarOpen(false);
                }}
              >
                Cài đặt
              </Button>
              <Button
                variant={activeView === "donate" ? "default" : "secondary"}
                className="mb-2 w-full"
                onClick={() => {
                  setActiveView("donate");
                  setMobileSidebarOpen(false);
                }}
              >
                Donate
              </Button>
              <Button variant="secondary" className="w-full" onClick={onLogout}>
                Đăng xuất
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      <main className="p-3 min-[1025px]:ml-[292px] min-[1025px]:p-6">{children}</main>
    </div>
  );
}
