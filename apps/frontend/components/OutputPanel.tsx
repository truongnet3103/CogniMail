"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  output: string;
  error?: string;
};

export function OutputPanel({ output, error }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kết quả AI</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
        <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          {output || "Chưa có kết quả."}
        </pre>
      </CardContent>
    </Card>
  );
}
