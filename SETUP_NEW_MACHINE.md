# Thiết lập máy mới (không cần biết sâu kỹ thuật)

Tài liệu này dành cho trường hợp bạn đổi máy hoặc cài lại từ đầu.

## A. Cài phần mềm bắt buộc

1. Cài Git
- Tải: https://git-scm.com/download/win

2. Cài Node.js LTS (khuyến nghị v22)
- Tải: https://nodejs.org/

3. Cài Firebase CLI
```bash
npm i -g firebase-tools
```

4. Cài Vercel CLI (nếu cần deploy backend)
```bash
npm i -g vercel
```

## B. Lấy source về máy

```bash
git clone https://github.com/truongnet3103/CogniMail.git
cd CogniMail
```

## C. Cài thư viện (tự động)

```bash
npm install
```

Lưu ý:
- Không cần tự cài từng thư viện.
- `npm install` sẽ đọc `package-lock.json` và cài đúng bộ phụ thuộc.

## D. Tạo env

1. Mở file `.env.example`
2. Tạo file env thực tế (theo hướng dẫn trong README)
3. Điền các giá trị Firebase/Backend URL phù hợp môi trường của bạn.

## E. Build và chạy local

Build toàn bộ:
```bash
npm run build
```

Chạy frontend + backend API local:
```bash
npm run dev
```

## F. Chạy worker local (nếu dùng)

1. Vào thư mục worker:
```bash
cd apps/backend-worker
```

2. Chạy tray:
```bash
run-worker-tray.bat
```

3. Mở frontend -> `Cài đặt` -> `Agent cục bộ` -> `Kết nối Agent local`.

## G. Nếu gặp lỗi thường gặp

1. Lỗi thiếu package
```bash
npm install
```

2. Lỗi cache build
```bash
npm run build
```

3. Lỗi quyền PowerShell script
- Mở PowerShell bằng Run as Administrator rồi chạy lại lệnh.

4. Worker tray không chạy
- Chạy trực tiếp `apps/backend-worker/run-worker-tray.bat`.

---

Khi cần mình hỗ trợ nhanh, gửi cho mình:
- Ảnh lỗi
- Lệnh đã chạy
- Log terminal gần nhất
