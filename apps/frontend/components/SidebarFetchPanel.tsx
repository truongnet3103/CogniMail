"use client";

import { useState } from "react";
import type { DisplayEmailFilter, EmailFilter } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Props = {
  fetchFilter: EmailFilter;
  displayFilter: DisplayEmailFilter;
  senderSuggestions: string[];
  senderGroups: string[];
  onFetchFilterChange: (next: EmailFilter) => void;
  onDisplayFilterChange: (next: DisplayEmailFilter) => void;
  onFetch: () => Promise<void>;
  fetching: boolean;
};

const toggleValue = (items: string[], value: string) => {
  const set = new Set(items);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
};

const parseCsv = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const toLocalDayStartIso = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map((item) => Number(item));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0).toISOString();
};

const toLocalDayEndIso = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map((item) => Number(item));
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999).toISOString();
};

const isoToLocalDateInput = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export function SidebarFetchPanel({
  fetchFilter,
  displayFilter,
  senderSuggestions,
  senderGroups,
  onFetchFilterChange,
  onDisplayFilterChange,
  onFetch,
  fetching,
}: Props) {
  const [fetchOpen, setFetchOpen] = useState(true);
  const [displayOpen, setDisplayOpen] = useState(false);
  const fetchSenders = parseCsv(fetchFilter.sender);
  const fetchTags = fetchFilter.tags ?? [];

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-900">Bộ lọc email</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-slate-700"
            onClick={() => setFetchOpen((prev) => !prev)}
          >
            <span>Fetch từ server</span>
            <span>{fetchOpen ? "▾" : "▸"}</span>
          </button>

          {fetchOpen ? (
            <>
              <Input
                type="date"
                value={isoToLocalDateInput(fetchFilter.dateFrom)}
                onChange={(event) =>
                  onFetchFilterChange({
                    ...fetchFilter,
                    dateFrom: event.target.value ? toLocalDayStartIso(event.target.value) : undefined,
                  })
                }
              />

              <Input
                type="date"
                value={isoToLocalDateInput(fetchFilter.dateTo)}
                onChange={(event) =>
                  onFetchFilterChange({
                    ...fetchFilter,
                    dateTo: event.target.value ? toLocalDayEndIso(event.target.value) : undefined,
                  })
                }
              />

              <Input
                type="number"
                min={1}
                max={100}
                value={String(fetchFilter.limit ?? 20)}
                onChange={(event) => onFetchFilterChange({ ...fetchFilter, limit: Number(event.target.value) || 20 })}
                placeholder="Số lượng"
              />

              <Select
                value={fetchFilter.status ?? "all"}
                onChange={(event) => onFetchFilterChange({ ...fetchFilter, status: event.target.value as EmailFilter["status"] })}
              >
                <option value="all">Tất cả</option>
                <option value="read">Đã đọc</option>
                <option value="unread">Chưa đọc</option>
              </Select>

              <div className="space-y-1">
                <p className="text-xs text-slate-600">Người gửi (đã tạo trong Cài đặt)</p>
                <div className="max-h-24 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                  {senderSuggestions.length === 0 ? (
                    <p className="text-xs text-slate-500">Vào Cài đặt để thêm danh sách người gửi.</p>
                  ) : (
                    <div className="space-y-1">
                      {senderSuggestions.map((sender) => {
                        const value = sender.toLowerCase();
                        return (
                          <label key={sender} className="flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={fetchSenders.includes(value)}
                              onChange={() => {
                                const next = toggleValue(fetchSenders, value);
                                onFetchFilterChange({
                                  ...fetchFilter,
                                  sender: next.length > 0 ? next.join(",") : undefined,
                                });
                              }}
                            />
                            <span className="truncate">{sender}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-slate-600">Tag nhóm người gửi (fetch)</p>
                <div className="max-h-24 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                  {senderGroups.length === 0 ? (
                    <p className="text-xs text-slate-500">Vào Cài đặt để tạo nhóm tag.</p>
                  ) : (
                    <div className="space-y-1">
                      {senderGroups.map((group) => (
                        <label key={group} className="flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={fetchTags.includes(group)}
                            onChange={() =>
                              onFetchFilterChange({
                                ...fetchFilter,
                                tags: toggleValue(fetchTags, group),
                              })
                            }
                          />
                          <span className="truncate">{group}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button className="w-full" onClick={() => onFetch()} disabled={fetching}>
                  {fetching ? "Đang lấy..." : "Fetch"}
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() =>
                    onFetchFilterChange({
                      limit: 20,
                      status: "all",
                      dateFrom: fetchFilter.dateFrom,
                      dateTo: fetchFilter.dateTo,
                    })
                  }
                >
                  Reset fetch
                </Button>
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-slate-700"
            onClick={() => setDisplayOpen((prev) => !prev)}
          >
            <span>Lọc hiển thị (list)</span>
            <span>{displayOpen ? "▾" : "▸"}</span>
          </button>

          {displayOpen ? (
            <>
              <Input
                type="date"
                value={isoToLocalDateInput(displayFilter.dateFrom)}
                onChange={(event) =>
                  onDisplayFilterChange({
                    ...displayFilter,
                    dateFrom: event.target.value ? toLocalDayStartIso(event.target.value) : undefined,
                  })
                }
              />
              <Input
                type="date"
                value={isoToLocalDateInput(displayFilter.dateTo)}
                onChange={(event) =>
                  onDisplayFilterChange({
                    ...displayFilter,
                    dateTo: event.target.value ? toLocalDayEndIso(event.target.value) : undefined,
                  })
                }
              />

              <div className="space-y-1">
                <p className="text-xs text-slate-600">Người gửi (chọn nhiều)</p>
                <div className="max-h-24 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                  {senderSuggestions.length === 0 ? (
                    <p className="text-xs text-slate-500">Vào Cài đặt để thêm danh sách người gửi.</p>
                  ) : (
                    <div className="space-y-1">
                      {senderSuggestions.map((sender) => (
                        <label key={sender} className="flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={displayFilter.senders.includes(sender)}
                            onChange={() =>
                              onDisplayFilterChange({
                                ...displayFilter,
                                senders: toggleValue(displayFilter.senders, sender),
                              })
                            }
                          />
                          <span className="truncate">{sender}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-slate-600">Nhóm người gửi</p>
                <div className="max-h-24 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                  {senderGroups.length === 0 ? (
                    <p className="text-xs text-slate-500">Vào Cài đặt để tạo nhóm tag.</p>
                  ) : (
                    <div className="space-y-1">
                      {senderGroups.map((group) => (
                        <label key={group} className="flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={displayFilter.groups.includes(group)}
                            onChange={() =>
                              onDisplayFilterChange({
                                ...displayFilter,
                                groups: toggleValue(displayFilter.groups, group),
                              })
                            }
                          />
                          <span className="truncate">{group}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={displayFilter.directOnly === true}
                  onChange={(event) =>
                    onDisplayFilterChange({
                      ...displayFilter,
                      directOnly: event.target.checked,
                    })
                  }
                />
                <span>Chỉ hiện email gửi trực tiếp cho tôi</span>
              </label>

              <Button
                className="w-full"
                variant="secondary"
                onClick={() =>
                  onDisplayFilterChange({
                    senders: [],
                    groups: [],
                    directOnly: false,
                  })
                }
              >
                Reset lọc hiển thị
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

