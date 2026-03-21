"use client";

import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DonatePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Donate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-700">Mọi hỗ trợ đều được trân trọng. Xin cảm ơn !</p>
          <p className="text-sm text-slate-700">Tôi là Trường NET và tôi đến từ Việt Nam.</p>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thông tin chuyển khoản</p>
            <p className="mt-2 text-sm text-slate-700">Ngân hàng: Techcombank</p>
            <p className="text-sm text-slate-700">Chủ tài khoản: NGUYEN MANH TRUONG</p>
            <p className="text-lg font-bold text-slate-900">1093 4344 632</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
            <Image
              src="/donate/qr-techcombank.png"
              alt="QR Donate Techcombank"
              width={1080}
              height={1920}
              className="h-auto w-full rounded-xl object-contain"
              priority
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

