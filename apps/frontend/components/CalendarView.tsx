"use client";

import { useMemo, useState } from "react";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/button";

type Props = {
  tasks: Task[];
  currentUserEmail?: string;
  directEmailIds?: string[];
  onTaskClick: (task: Task) => void;
  onToggleTaskCompleted: (task: Task, completed: boolean) => Promise<void>;
  onDeleteTask: (task: Task) => Promise<void>;
};

const dayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const toLocalDateKey = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const importanceLabel = (level?: Task["importanceLevel"]) => {
  switch (level) {
    case "critical":
      return "Rất cao";
    case "high":
      return "Cao";
    case "low":
      return "Thấp";
    default:
      return "Trung bình";
  }
};

export function CalendarView({ tasks, currentUserEmail, directEmailIds = [], onTaskClick, onToggleTaskCompleted, onDeleteTask }: Props) {
  const [mode, setMode] = useState<"lich" | "task">("lich");
  const [tagFilter, setTagFilter] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const currentUserEmailLower = (currentUserEmail ?? "").trim().toLowerCase();
  const directEmailSet = useMemo(() => new Set(directEmailIds), [directEmailIds]);

  const tags = useMemo(() => [...new Set(tasks.flatMap((task) => task.tags ?? []))], [tasks]);
  const filteredByTag = useMemo(() => {
    if (!tagFilter) return tasks;
    return tasks.filter((task) => task.tags?.includes(tagFilter));
  }, [tasks, tagFilter]);
  const filtered = useMemo(
    () => filteredByTag.filter((task) => (showCompleted ? true : !task.completed)),
    [filteredByTag, showCompleted],
  );

  const datedTasks = filtered.filter((task) => task.dueDate && task.dueExplicit === true);
  const undatedTasks = filtered.filter((task) => !task.dueDate || task.dueExplicit !== true);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const taskByDate = datedTasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = String(task.dueDate).slice(0, 10);
    const current = acc[key] ?? [];
    return { ...acc, [key]: [...current, task] };
  }, {});
  const selectedDateTasks = selectedDateKey ? taskByDate[selectedDateKey] ?? [] : [];

  const cells: Array<{ date?: Date }> = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push({});
  for (let d = 1; d <= daysInMonth; d += 1) cells.push({ date: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({});

  return (
    <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Bảng điều khiển</p>
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "lich" ? "default" : "secondary"} onClick={() => setMode("lich")}>
            Lịch
          </Button>
          <Button size="sm" variant={mode === "task" ? "default" : "secondary"} onClick={() => setMode("task")}>
            Công việc
          </Button>
        </div>
        <select
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
        >
          <option value="">Tất cả nhãn</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <p>Tổng task: {filtered.length}</p>
          <p>Có deadline: {datedTasks.length}</p>
          <p>Không deadline: {undatedTasks.length}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
          Hiển thị task đã hoàn thành
        </label>
      </aside>

      {mode === "lich" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">
            Lịch tháng {month + 1}/{year}
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {dayLabels.map((label) => (
              <div key={label} className="rounded-lg bg-slate-100 p-2 text-center text-xs font-semibold text-slate-600">
                {label}
              </div>
            ))}
            {cells.map((cell, index) => {
              if (!cell.date) return <div key={`blank-${index}`} className="min-h-[100px] rounded-lg bg-slate-50" />;
              const key = toLocalDateKey(cell.date);
              const dayTasks = taskByDate[key] ?? [];
              return (
                <div key={key} className="min-h-[100px] rounded-lg border border-slate-200 p-2">
                  <button
                    type="button"
                    className="text-xs font-bold text-slate-700"
                    onClick={() => {
                      if (dayTasks.length > 0) setSelectedDateKey(key);
                    }}
                  >
                    {cell.date.getDate()}
                  </button>
                  <div className="mt-1 space-y-1">
                    {dayTasks.slice(0, 3).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onTaskClick(task)}
                        className="w-full rounded-md bg-sky-50 px-2 py-1 text-left text-[11px] text-sky-800 hover:bg-sky-100"
                      >
                        {task.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 ? (
                      <button
                        type="button"
                        className="text-[11px] text-slate-500 hover:text-slate-700"
                        onClick={() => setSelectedDateKey(key)}
                      >
                        +{dayTasks.length - 3} việc khác
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Danh sách công việc</h3>
          <div className="space-y-2">
            {filtered.map((task) => (
              <div
                key={task.id}
                className={`w-full rounded-xl border p-3 text-left ${
                  task.completed
                    ? "border-emerald-200 bg-emerald-50/40"
                    : directEmailSet.has(task.emailId ?? "") || (task.owner ?? "").trim().toLowerCase() === currentUserEmailLower
                      ? "border-amber-300 bg-amber-50"
                      : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button className="flex-1 text-left" onClick={() => onTaskClick(task)}>
                    <p className={`font-semibold ${task.completed ? "text-emerald-800 line-through" : "text-slate-900"}`}>{task.title}</p>
                    {task.description ? <p className="mt-1 text-xs text-slate-600">{task.description}</p> : null}
                    {directEmailSet.has(task.emailId ?? "") || (task.owner ?? "").trim().toLowerCase() === currentUserEmailLower ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">Ưu tiên: Việc liên quan trực tiếp đến bạn</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-600">
                      Mức độ: {importanceLabel(task.importanceLevel)} | Điểm ưu tiên: {task.score ?? 50}
                    </p>
                    {task.assessment ? <p className="mt-1 text-xs text-slate-600">Đánh giá: {task.assessment}</p> : null}
                    {task.evidence ? <p className="mt-1 text-xs italic text-slate-500">Bằng chứng: {task.evidence}</p> : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {task.dueDate && task.dueExplicit
                        ? `Deadline xác nhận: ${task.dueDate.slice(0, 10)}${task.dueTime ? ` ${task.dueTime}` : ""}`
                        : "Chưa có deadline xác nhận từ email"}
                    </p>
                    {task.deadlineNote ? <p className="mt-1 text-xs text-slate-500">Ghi chú deadline: {task.deadlineNote}</p> : null}
                    {task.dueEvidence ? <p className="mt-1 text-xs italic text-slate-500">Bằng chứng deadline: {task.dueEvidence}</p> : null}
                    <p className="text-xs text-slate-500">
                      {task.mergedCount && task.mergedCount > 1 ? `Đã gộp ${task.mergedCount} task trùng` : "Task đơn"}
                    </p>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant={task.completed ? "secondary" : "default"}
                      onClick={() => onToggleTaskCompleted(task, !task.completed)}
                    >
                      {task.completed ? "Mở lại" : "Xong"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => onDeleteTask(task)}>
                      Xóa
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 ? <p className="text-sm text-slate-500">Chưa có task nào.</p> : null}
          </div>
        </div>
      )}

      {selectedDateKey ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-3">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h4 className="text-base font-semibold text-slate-900">Deadline ngày {selectedDateKey}</h4>
              <Button size="sm" variant="secondary" onClick={() => setSelectedDateKey(null)}>
                Đóng
              </Button>
            </div>
            <div className="max-h-[65vh] space-y-2 overflow-auto p-4">
              {selectedDateTasks.length === 0 ? (
                <p className="text-sm text-slate-500">Không có task cho ngày này.</p>
              ) : (
                selectedDateTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                    onClick={() => {
                      onTaskClick(task);
                      setSelectedDateKey(null);
                    }}
                  >
                    <p className="font-semibold text-slate-900">{task.title}</p>
                    {task.description ? <p className="mt-1 text-xs text-slate-600">{task.description}</p> : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {task.dueDate && task.dueExplicit
                        ? `Deadline xác nhận: ${task.dueDate.slice(0, 10)}${task.dueTime ? ` ${task.dueTime}` : ""}`
                        : "Chưa có deadline xác nhận từ email"}
                    </p>
                    {task.deadlineNote ? <p className="mt-1 text-xs text-slate-500">Ghi chú deadline: {task.deadlineNote}</p> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
