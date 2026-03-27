# CogniMail

CogniMail là dự án quản lý email và công việc được thiết kế để chạy ổn định trên hạ tầng miễn phí.

## Mục tiêu dự án

- Chi phí thấp nhất có thể, ưu tiên các dịch vụ free.
- Dễ tự cài đặt, dễ dùng, không cần đội kỹ thuật lớn.
- Phù hợp cho cá nhân, nhóm nhỏ và doanh nghiệp nhỏ.

## Điểm nổi bật

- Quản lý email tập trung từ IMAP (Gmail, Outlook, email công ty...).
- Lọc và phân loại email trực quan ngay trên giao diện.
- Tạo nhóm người gửi (tag) để lọc nhanh theo nhu cầu.
- Theo dõi danh sách việc cần làm và deadline từ nội dung email.
- Có worker cục bộ để đồng bộ ổn định trên máy người dùng.

## Tối ưu cho hạ tầng free

Dự án được tối ưu để chạy với mô hình chi phí thấp:

- Frontend deploy bằng Firebase Hosting (gói free).
- Dữ liệu người dùng lưu trên Firebase theo cấu hình free.
- Worker cục bộ chạy trên máy cá nhân, giảm tải hạ tầng server.
- Có thể bắt đầu dùng ngay mà không cần đầu tư server lớn.

## Kiến trúc tổng quan

- `apps/frontend`: giao diện web (Next.js).
- `apps/backend-api`: API xử lý nghiệp vụ backend (Node.js/Express).
- `apps/backend-worker`: worker cục bộ hỗ trợ đồng bộ email định kỳ.
- `packages/shared`: kiểu dữ liệu dùng chung.

## Cài đặt

### 1) Yêu cầu

- Node.js LTS (khuyến nghị v22).
- npm.
- Git.
- Firebase CLI (nếu cần deploy).

```bash
npm i -g firebase-tools
```

### 2) Clone dự án

```bash
git clone https://github.com/truongnet3103/CogniMail.git
cd CogniMail
```

### 3) Cài dependencies

```bash
npm install
```

### 4) Tạo file môi trường

Tại thư mục gốc:

```powershell
Copy-Item .env.example .env
```

Điền các biến cần thiết trong `.env`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_SERVICE_ACCOUNT_PATH` hoặc `FIREBASE_SERVICE_ACCOUNT_JSON`
- `NEXT_PUBLIC_BACKEND_URL` (mặc định local: `http://localhost:8080`)

### 5) Chạy local

Chạy frontend + backend API cùng lúc:

```bash
npm run dev
```

Mặc định:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8080`

### 6) Chạy worker cục bộ (khuyến nghị)

```powershell
cd apps/backend-worker
Copy-Item .env.worker.example .env.worker.userdirect
npm run dev
```

Hoặc chạy ứng dụng tray trên Windows:

```powershell
.\run-worker-tray.bat
```

## Cách sử dụng

### 1) Đăng nhập

- Mở web CogniMail.
- Đăng ký/đăng nhập bằng email và mật khẩu.

### 2) Cấu hình IMAP

- Vào trang `Cài đặt`.
- Nhập `Host`, `Port`, `Username`, `Password`, `Mailbox`.
- Bấm `Test IMAP` để kiểm tra kết nối.

### 3) Đồng bộ email

- Chạy đồng bộ trực tiếp từ giao diện.
- Nếu dùng worker cục bộ, giữ worker hoạt động để đồng bộ ổn định hơn.

### 4) Lọc hiển thị email

- Tạo tag nhóm người gửi trong phần cài đặt.
- Chọn bộ lọc hiển thị theo nhóm để xem email trực quan hơn.
- Bộ lọc hiển thị chỉ thay đổi cách nhìn trên frontend, không làm thay đổi dữ liệu gốc.

### 5) Theo dõi việc cần làm

- Tạo và theo dõi các việc cần làm từ nội dung email.
- Quản lý deadline theo từng việc.

## Build và deploy

### Build frontend

```bash
npm --prefix apps/frontend run build
```

### Deploy Firebase Hosting

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS=(Resolve-Path .\firebase-service-account.deploy.json).Path
firebase deploy --only hosting --project cognimail-fa0c0 --non-interactive
```

## Phù hợp với ai?

- Cá nhân muốn gom email và công việc trên một giao diện dễ dùng.
- Freelancer hoặc nhóm nhỏ cần quy trình gọn nhẹ, chi phí thấp.
- Doanh nghiệp nhỏ muốn triển khai nhanh trên hạ tầng free.

## Ủng hộ dự án

Nếu CogniMail giúp ích cho bạn, có thể ủng hộ để duy trì và phát triển dự án:

![Ủng hộ CogniMail](apps/frontend/public/donate/qr-techcombank.png)
